import path from "node:path";
import { mkdir, appendFile, open, readFile, rename, writeFile } from "node:fs/promises";
import {
  engineDurableStateSchema,
  eventEnvelopeSchema,
  inspectDurableState,
  rebuildDurableStateFromEvents,
  snapshotHistoryPointSchema,
  type EngineDurableState,
  type EventEnvelope,
  type IntegrityReport,
  type SnapshotHistoryPoint
} from "@immaculate/core";
import { safeUnlink } from "./utils.js";

type RecoveryMode = "fresh" | "checkpoint" | "checkpoint-replay" | "snapshot" | "replay";

export type PersistenceStatus = {
  rootDir: string;
  snapshotPath: string;
  eventsPath: string;
  historyPath: string;
  recovered: boolean;
  recoveryMode: RecoveryMode;
  persistedEventCount: number;
  persistedHistoryCount: number;
  lastPersistedEventId?: string;
  lastPersistedHistoryKey?: string;
  lastSnapshotAt?: string;
  checkpointCount: number;
  lastCheckpointId?: string;
  lastCheckpointEventId?: string;
  lastCheckpointAt?: string;
  integrityValid: boolean;
  integrityStatus?: IntegrityReport["status"];
  integrityFindingCount: number;
  lastIntegrityCheckedAt?: string;
  invalidArtifactCount: number;
  compacted: number;
};

type ReplayQuery = {
  afterEventId?: string;
  limit?: number;
};

export type CheckpointMetadata = {
  id: string;
  filePath: string;
  createdAt: string;
  cycle: number;
  epoch: number;
  lastEventId?: string;
  eventCount: number;
  historyCount: number;
  integrityStatus?: IntegrityReport["status"];
  findingCount?: number;
};

type PersistenceLedger = {
  persistedEventCount: number;
  persistedHistoryCount: number;
  lastPersistedEventId?: string;
  lastPersistedHistoryKey?: string;
  lastSnapshotAt?: string;
  compacted?: number;
};

const MAX_CHECKPOINTS = 48;
const RECENT_EVENT_WINDOW = 2048;
const RECENT_HISTORY_WINDOW = 240;
const MAX_PERSISTED_EVENTS_BEFORE_COMPACTION = 10_000;
const RETAINED_PERSISTED_EVENTS = 5_000;
const MAX_PERSISTED_HISTORY_BEFORE_COMPACTION = 10_000;
const RETAINED_PERSISTED_HISTORY = 5_000;
const ATOMIC_WRITE_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const ATOMIC_WRITE_MAX_RETRIES = 8;
const VOLATILE_EVENT_SCHEMAS = new Set([
  "immaculate.engine.tick",
  "immaculate.pass.start",
  "immaculate.pass.complete",
  "immaculate.cycle.start",
  "immaculate.cycle.complete",
  "immaculate.neuro-frame.ingested",
  "immaculate.neuro-replay.upserted"
]);

function historyKey(point: SnapshotHistoryPoint): string {
  return `${point.timestamp}|${point.cycle}|${point.epoch}`;
}

async function safeRead(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function safeReadLastNonEmptyLine(filePath: string): Promise<string | null> {
  try {
    const handle = await open(filePath, "r");
    try {
      const stats = await handle.stat();
      if (stats.size <= 0) {
        return null;
      }

      let position = stats.size;
      let buffer = "";

      while (position > 0) {
        const chunkSize = Math.min(8192, position);
        position -= chunkSize;
        const chunk = Buffer.alloc(chunkSize);
        const { bytesRead } = await handle.read(chunk, 0, chunkSize, position);
        buffer = chunk.toString("utf8", 0, bytesRead) + buffer;

        if (buffer.includes("\n") || position === 0) {
          const lines = buffer
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          return lines.at(-1) ?? null;
        }
      }

      return null;
    } finally {
      await handle.close();
    }
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseNdjson<T>(
  content: string | null,
  parser: { parse: (value: unknown) => T }
): T[] {
  if (!content) {
    return [];
  }

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parser.parse(JSON.parse(line)));
}

function parseCheckpointIndex(content: string | null): CheckpointMetadata[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }

        const candidate = item as Partial<CheckpointMetadata>;
        if (
          typeof candidate.id !== "string" ||
          typeof candidate.filePath !== "string" ||
          typeof candidate.createdAt !== "string" ||
          typeof candidate.cycle !== "number" ||
          typeof candidate.epoch !== "number" ||
          typeof candidate.eventCount !== "number" ||
          typeof candidate.historyCount !== "number"
        ) {
          return [];
        }

        return [
          {
            id: candidate.id,
            filePath: candidate.filePath,
            createdAt: candidate.createdAt,
            cycle: candidate.cycle,
            epoch: candidate.epoch,
            lastEventId:
              typeof candidate.lastEventId === "string" ? candidate.lastEventId : undefined,
            eventCount: candidate.eventCount,
            historyCount: candidate.historyCount,
            integrityStatus:
              candidate.integrityStatus === "verified" ||
              candidate.integrityStatus === "degraded" ||
              candidate.integrityStatus === "invalid"
                ? candidate.integrityStatus
                : undefined,
            findingCount:
              typeof candidate.findingCount === "number" ? candidate.findingCount : undefined
          }
        ];
      })
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  } catch {
    return [];
  }
}

function parsePersistenceLedger(content: string | null): PersistenceLedger | null {
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as Partial<PersistenceLedger>;
    if (
      typeof parsed.persistedEventCount !== "number" ||
      typeof parsed.persistedHistoryCount !== "number"
    ) {
      return null;
    }

      return {
        persistedEventCount: parsed.persistedEventCount,
        persistedHistoryCount: parsed.persistedHistoryCount,
        lastPersistedEventId:
          typeof parsed.lastPersistedEventId === "string" ? parsed.lastPersistedEventId : undefined,
      lastPersistedHistoryKey:
        typeof parsed.lastPersistedHistoryKey === "string"
          ? parsed.lastPersistedHistoryKey
          : undefined,
        lastSnapshotAt:
          typeof parsed.lastSnapshotAt === "string" ? parsed.lastSnapshotAt : undefined,
        compacted: typeof parsed.compacted === "number" ? parsed.compacted : 0
      };
  } catch {
    return null;
  }
}

function toRecentNewestFirst<T>(items: T[], limit: number): T[] {
  return items.slice(Math.max(0, items.length - limit)).reverse();
}

function historyPointAtOrAfterCheckpoint(
  point: SnapshotHistoryPoint,
  checkpoint?: Pick<CheckpointMetadata, "cycle" | "epoch">
): boolean {
  if (!checkpoint) {
    return false;
  }

  if (point.cycle !== checkpoint.cycle) {
    return point.cycle > checkpoint.cycle;
  }

  return point.epoch >= checkpoint.epoch;
}

function historyPointAtOrBeforeSnapshot(
  point: SnapshotHistoryPoint,
  snapshot: EngineDurableState["snapshot"]
): boolean {
  if (point.cycle !== snapshot.cycle) {
    return point.cycle < snapshot.cycle;
  }

  return point.epoch <= snapshot.epoch;
}

function checkpointFilePath(checkpointsDir: string, checkpointId: string): string {
  return path.join(checkpointsDir, `${checkpointId}.json`);
}

function createCheckpointId(durableState: EngineDurableState, eventId?: string): string {
  const suffix = (eventId ?? `cycle-${durableState.snapshot.cycle}-epoch-${durableState.snapshot.epoch}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

  return `chk-c${durableState.snapshot.cycle}-e${durableState.snapshot.epoch}-${suffix}`;
}

function shouldCheckpoint(durableState: EngineDurableState, lastCheckpointEventId?: string): boolean {
  const latestEvent = durableState.events[0];
  if (!latestEvent) {
    return false;
  }

  const checkpointWindow =
    lastCheckpointEventId && durableState.events.some((event) => event.eventId === lastCheckpointEventId)
      ? durableState.events.slice(
          0,
          durableState.events.findIndex((event) => event.eventId === lastCheckpointEventId)
        )
      : durableState.events;

  for (const event of checkpointWindow) {
    if (event.schema.name === "immaculate.cycle.complete") {
      return true;
    }

    if (event.schema.name === "immaculate.pass.complete" && event.payload.phase === "verify") {
      return true;
    }
  }

  return false;
}

function applyPersistedWindows(
  durableState: EngineDurableState,
  persistedEvents: EventEnvelope[],
  persistedHistory: SnapshotHistoryPoint[]
): EngineDurableState {
  const nextState = engineDurableStateSchema.parse(durableState) as EngineDurableState;
  const recentEvents =
    persistedEvents.length > 0
      ? toRecentNewestFirst(persistedEvents, RECENT_EVENT_WINDOW)
      : nextState.events;
  const boundedPersistedHistory = persistedHistory.filter((point) =>
    historyPointAtOrBeforeSnapshot(point, nextState.snapshot)
  );
  const boundedInMemoryHistory = nextState.history.filter((point) =>
    historyPointAtOrBeforeSnapshot(point, nextState.snapshot)
  );
  const recentHistory =
    boundedPersistedHistory.length > 0
      ? toRecentNewestFirst(boundedPersistedHistory, RECENT_HISTORY_WINDOW)
      : boundedInMemoryHistory;

  return {
    ...nextState,
    snapshot: {
      ...nextState.snapshot,
      logTail: recentEvents.slice(0, 8).map((event) => event.summary),
      lastEventId: recentEvents[0]?.eventId ?? nextState.snapshot.lastEventId
    },
    events: recentEvents,
    history: recentHistory
  };
}

function tailAfterEventId(
  persistedEvents: EventEnvelope[],
  eventId?: string
): EventEnvelope[] | null {
  if (!eventId) {
    return [...persistedEvents];
  }

  const index = persistedEvents.findIndex((event) => event.eventId === eventId);
  if (index === -1) {
    return null;
  }

  return persistedEvents.slice(index + 1);
}

async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tempPath, contents, "utf8");
  try {
    for (let attempt = 0; attempt <= ATOMIC_WRITE_MAX_RETRIES; attempt += 1) {
      try {
        await rename(tempPath, filePath);
        return;
      } catch (error) {
        const candidate = error as NodeJS.ErrnoException;
        const retryable =
          typeof candidate?.code === "string" && ATOMIC_WRITE_RETRY_CODES.has(candidate.code);
        if (!retryable || attempt === ATOMIC_WRITE_MAX_RETRIES) {
          if (retryable) {
            await writeFile(filePath, contents, "utf8");
            await safeUnlink(tempPath);
            return;
          }
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
  } catch (error) {
    await safeUnlink(tempPath);
    throw error;
  }
}

export function createPersistence(rootDir = path.join(process.cwd(), ".runtime", "harness")) {
  const snapshotPath = path.join(rootDir, "snapshot.json");
  const eventsPath = path.join(rootDir, "events.ndjson");
  const historyPath = path.join(rootDir, "history.ndjson");
  const statusPath = path.join(rootDir, "persistence-status.json");
  const checkpointsDir = path.join(rootDir, "checkpoints");
  const checkpointsPath = path.join(rootDir, "checkpoints.json");

  const status: PersistenceStatus = {
    rootDir,
    snapshotPath,
    eventsPath,
    historyPath,
    recovered: false,
    recoveryMode: "fresh",
    persistedEventCount: 0,
    persistedHistoryCount: 0,
    checkpointCount: 0,
    integrityValid: false,
    integrityFindingCount: 0,
    invalidArtifactCount: 0,
    compacted: 0
  };

  let checkpoints: CheckpointMetadata[] = [];
  let writeChain = Promise.resolve();

  async function ensureRoot(): Promise<void> {
    await mkdir(rootDir, { recursive: true });
    await mkdir(checkpointsDir, { recursive: true });
  }

  function syncCheckpointStatus(): void {
    status.checkpointCount = checkpoints.length;
    status.lastCheckpointId = checkpoints[0]?.id;
    status.lastCheckpointEventId = checkpoints[0]?.lastEventId;
    status.lastCheckpointAt = checkpoints[0]?.createdAt;
  }

  function syncIntegrityStatus(report?: IntegrityReport): void {
    status.integrityValid = report?.valid ?? false;
    status.integrityStatus = report?.status;
    status.integrityFindingCount = report?.findingCount ?? 0;
    status.lastIntegrityCheckedAt = report?.checkedAt;
  }

  async function writeCheckpointIndex(): Promise<void> {
    await atomicWrite(checkpointsPath, JSON.stringify(checkpoints, null, 2));
    syncCheckpointStatus();
  }

  async function writePersistenceLedger(): Promise<void> {
    const ledger: PersistenceLedger = {
      persistedEventCount: status.persistedEventCount,
      persistedHistoryCount: status.persistedHistoryCount,
      lastPersistedEventId: status.lastPersistedEventId,
      lastPersistedHistoryKey: status.lastPersistedHistoryKey,
      lastSnapshotAt: status.lastSnapshotAt,
      compacted: status.compacted
    };
    await atomicWrite(statusPath, JSON.stringify(ledger, null, 2));
  }

  async function compactPersistedWindows(): Promise<void> {
    const compactEvents = status.persistedEventCount > MAX_PERSISTED_EVENTS_BEFORE_COMPACTION;
    const compactHistory = status.persistedHistoryCount > MAX_PERSISTED_HISTORY_BEFORE_COMPACTION;
    if (!compactEvents && !compactHistory) {
      return;
    }

    const latestCheckpoint = checkpoints[0];
    const [eventsContent, historyContent] = await Promise.all([
      compactEvents ? safeRead(eventsPath) : Promise.resolve(null),
      compactHistory ? safeRead(historyPath) : Promise.resolve(null)
    ]);

    if (compactEvents) {
      const persistedEvents = parseNdjson(eventsContent, eventEnvelopeSchema);
      const tailStartIndex = Math.max(0, persistedEvents.length - RETAINED_PERSISTED_EVENTS);
      const checkpointStartIndex = latestCheckpoint?.lastEventId
        ? persistedEvents.findIndex((event) => event.eventId === latestCheckpoint.lastEventId)
        : -1;
      const retainFromIndex =
        checkpointStartIndex >= 0 ? Math.min(tailStartIndex, checkpointStartIndex) : tailStartIndex;
      const retainedEvents = persistedEvents.filter(
        (event, index) => index >= retainFromIndex || !VOLATILE_EVENT_SCHEMAS.has(event.schema.name)
      );
      const payload =
        retainedEvents.length > 0
          ? `${retainedEvents.map((event) => JSON.stringify(event)).join("\n")}\n`
          : "";
      await atomicWrite(eventsPath, payload);
      status.persistedEventCount = retainedEvents.length;
      status.lastPersistedEventId = retainedEvents.at(-1)?.eventId;
    }

    if (compactHistory) {
      const persistedHistory = parseNdjson(historyContent, snapshotHistoryPointSchema);
      const tailStartIndex = Math.max(0, persistedHistory.length - RETAINED_PERSISTED_HISTORY);
      const checkpointStartIndex = latestCheckpoint
        ? persistedHistory.findIndex((point) => historyPointAtOrAfterCheckpoint(point, latestCheckpoint))
        : -1;
      const retainFromIndex =
        checkpointStartIndex >= 0 ? Math.min(tailStartIndex, checkpointStartIndex) : tailStartIndex;
      const retainedHistory = persistedHistory.slice(retainFromIndex);
      const payload =
        retainedHistory.length > 0
          ? `${retainedHistory.map((point) => JSON.stringify(point)).join("\n")}\n`
          : "";
      await atomicWrite(historyPath, payload);
      status.persistedHistoryCount = retainedHistory.length;
      status.lastPersistedHistoryKey = retainedHistory.at(-1)
        ? historyKey(retainedHistory[retainedHistory.length - 1]!)
        : undefined;
    }

    status.compacted += 1;
  }

  async function readCheckpointState(
    metadata: CheckpointMetadata
  ): Promise<EngineDurableState | null> {
    const content = await safeRead(metadata.filePath);
    if (!content) {
      return null;
    }

    try {
      return engineDurableStateSchema.parse(JSON.parse(content)) as EngineDurableState;
    } catch {
      return null;
    }
  }

  async function pruneCheckpoints(): Promise<void> {
    if (checkpoints.length <= MAX_CHECKPOINTS) {
      return;
    }

    const stale = checkpoints.slice(MAX_CHECKPOINTS);
    checkpoints = checkpoints.slice(0, MAX_CHECKPOINTS);
    await Promise.all(stale.map((checkpoint) => safeUnlink(checkpoint.filePath)));
  }

  function computeEventDelta(events: EventEnvelope[]): EventEnvelope[] {
    if (!status.lastPersistedEventId) {
      return [...events].reverse();
    }

    const index = events.findIndex((event) => event.eventId === status.lastPersistedEventId);
    if (index === -1) {
      return [...events].reverse();
    }

    return events.slice(0, index).reverse();
  }

  function computeHistoryDelta(history: SnapshotHistoryPoint[]): SnapshotHistoryPoint[] {
    if (!status.lastPersistedHistoryKey) {
      return [...history].reverse();
    }

    const index = history.findIndex((point) => historyKey(point) === status.lastPersistedHistoryKey);
    if (index === -1) {
      return [...history].reverse();
    }

    return history.slice(0, index).reverse();
  }

  async function writeCheckpoint(
    durableState: EngineDurableState,
    integrity: IntegrityReport
  ): Promise<void> {
    const latestEvent = durableState.events[0];
    if (!latestEvent) {
      return;
    }

    const checkpointId = createCheckpointId(durableState, latestEvent.eventId);
    const metadata: CheckpointMetadata = {
      id: checkpointId,
      filePath: checkpointFilePath(checkpointsDir, checkpointId),
      createdAt: durableState.snapshot.timestamp,
      cycle: durableState.snapshot.cycle,
      epoch: durableState.snapshot.epoch,
      lastEventId: latestEvent.eventId,
      eventCount: status.persistedEventCount,
      historyCount: status.persistedHistoryCount,
      integrityStatus: integrity.status,
      findingCount: integrity.findingCount
    };

    await atomicWrite(metadata.filePath, JSON.stringify(durableState, null, 2));
    checkpoints = [metadata, ...checkpoints.filter((checkpoint) => checkpoint.lastEventId !== metadata.lastEventId)]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    await pruneCheckpoints();
    await writeCheckpointIndex();
  }

  function acceptCandidateState(
    durableState: EngineDurableState,
    persistedEvents: EventEnvelope[],
    persistedHistory: SnapshotHistoryPoint[]
  ): EngineDurableState | null {
    const candidate = applyPersistedWindows(durableState, persistedEvents, persistedHistory);
    const integrity = inspectDurableState(candidate);
    if (!integrity.valid) {
      status.invalidArtifactCount += 1;
      return null;
    }

    syncIntegrityStatus(integrity);
    status.lastSnapshotAt = candidate.snapshot.timestamp;
    return candidate;
  }

  async function load(): Promise<EngineDurableState | null> {
    await ensureRoot();

    const [snapshotContent, checkpointIndexContent, ledgerContent] = await Promise.all([
      safeRead(snapshotPath),
      safeRead(checkpointsPath),
      safeRead(statusPath)
    ]);

    checkpoints = parseCheckpointIndex(checkpointIndexContent);
    syncCheckpointStatus();
    syncIntegrityStatus(undefined);
    status.invalidArtifactCount = 0;
    let snapshotState: EngineDurableState | null = null;
    const ledger = parsePersistenceLedger(ledgerContent);

    if (snapshotContent) {
      try {
        snapshotState = engineDurableStateSchema.parse(JSON.parse(snapshotContent)) as EngineDurableState;
      } catch {
        snapshotState = null;
      }
    }

    if (snapshotState && ledger) {
      const [lastEventLine, lastHistoryLine] = await Promise.all([
        safeReadLastNonEmptyLine(eventsPath),
        safeReadLastNonEmptyLine(historyPath)
      ]);
      const lastEvent = lastEventLine
        ? eventEnvelopeSchema.parse(JSON.parse(lastEventLine))
        : null;
      const lastHistory = lastHistoryLine
        ? snapshotHistoryPointSchema.parse(JSON.parse(lastHistoryLine))
        : null;
      const lastPersistedHistoryKey = lastHistory ? historyKey(lastHistory) : undefined;

      if (
        (ledger.lastPersistedEventId ?? undefined) === (lastEvent?.eventId ?? undefined) &&
        (ledger.lastPersistedHistoryKey ?? undefined) === (lastPersistedHistoryKey ?? undefined) &&
        (!ledger.lastPersistedEventId ||
          snapshotState.snapshot.lastEventId === ledger.lastPersistedEventId)
      ) {
        status.persistedEventCount = ledger.persistedEventCount;
        status.persistedHistoryCount = ledger.persistedHistoryCount;
        status.lastPersistedEventId = ledger.lastPersistedEventId;
        status.lastPersistedHistoryKey = ledger.lastPersistedHistoryKey;
        status.lastSnapshotAt = ledger.lastSnapshotAt ?? snapshotState.snapshot.timestamp;
        status.compacted = ledger.compacted ?? 0;

        const accepted = acceptCandidateState(snapshotState, [], []);
        if (accepted) {
          status.recovered = true;
          status.recoveryMode = "snapshot";
          return accepted;
        }
      }
    }

    const [eventsContent, historyContent] = await Promise.all([
      safeRead(eventsPath),
      safeRead(historyPath)
    ]);
    const persistedEvents = parseNdjson(eventsContent, eventEnvelopeSchema);
    const persistedHistory = parseNdjson(historyContent, snapshotHistoryPointSchema);

    status.persistedEventCount = persistedEvents.length;
    status.persistedHistoryCount = persistedHistory.length;
    status.lastPersistedEventId = persistedEvents.at(-1)?.eventId;
    status.lastPersistedHistoryKey = persistedHistory.at(-1)
      ? historyKey(persistedHistory[persistedHistory.length - 1]!)
      : undefined;

    const newestPersistedEventId = persistedEvents.at(-1)?.eventId;

    for (const checkpoint of checkpoints) {
      const checkpointState = await readCheckpointState(checkpoint);
      if (!checkpointState) {
        continue;
      }

      if (checkpoint.lastEventId && checkpointState.snapshot.lastEventId !== checkpoint.lastEventId) {
        continue;
      }

      const tail = tailAfterEventId(persistedEvents, checkpoint.lastEventId);
      if (tail === null) {
        continue;
      }

      if (tail.length === 0 && (!newestPersistedEventId || checkpoint.lastEventId === newestPersistedEventId)) {
        const accepted = acceptCandidateState(checkpointState, persistedEvents, persistedHistory);
        if (!accepted) {
          continue;
        }
        status.recovered = true;
        status.recoveryMode = "checkpoint";
        return accepted;
      }

      const fastForwarded = rebuildDurableStateFromEvents(tail, {
        durableState: checkpointState
      });
      const accepted = acceptCandidateState(fastForwarded, persistedEvents, persistedHistory);
      if (!accepted) {
        continue;
      }
      status.recovered = true;
      status.recoveryMode = "checkpoint-replay";
      return accepted;
    }

    if (
      snapshotState &&
      (!newestPersistedEventId || snapshotState.snapshot.lastEventId === newestPersistedEventId)
    ) {
      const accepted = acceptCandidateState(snapshotState, persistedEvents, persistedHistory);
      if (accepted) {
        status.recovered = true;
        status.recoveryMode = "snapshot";
        return accepted;
      }
    }

    if (persistedEvents.length > 0) {
      const rebuilt = rebuildDurableStateFromEvents(persistedEvents);
      const accepted = acceptCandidateState(rebuilt, persistedEvents, persistedHistory);
      if (accepted) {
        status.recovered = true;
        status.recoveryMode = "replay";
        return accepted;
      }
    }

    status.recovered = false;
    status.recoveryMode = "fresh";
    status.lastSnapshotAt = undefined;
    syncIntegrityStatus(undefined);
    return null;
  }

  async function persist(durableState: EngineDurableState): Promise<void> {
    const parsed = engineDurableStateSchema.parse(durableState);
    const integrity = inspectDurableState(parsed);
    syncIntegrityStatus(integrity);

    writeChain = writeChain.then(async () => {
      await ensureRoot();

      const eventDelta = computeEventDelta(parsed.events);
      if (eventDelta.length > 0) {
        const payload = `${eventDelta.map((event) => JSON.stringify(eventEnvelopeSchema.parse(event))).join("\n")}\n`;
        await appendFile(eventsPath, payload, "utf8");
        status.persistedEventCount += eventDelta.length;
        status.lastPersistedEventId = eventDelta[eventDelta.length - 1]?.eventId;
      }

      const historyDelta = computeHistoryDelta(parsed.history);
      if (historyDelta.length > 0) {
        const payload = `${historyDelta.map((point) => JSON.stringify(snapshotHistoryPointSchema.parse(point))).join("\n")}\n`;
        await appendFile(historyPath, payload, "utf8");
        status.persistedHistoryCount += historyDelta.length;
        status.lastPersistedHistoryKey = historyKey(historyDelta[historyDelta.length - 1]!);
      }

      await atomicWrite(snapshotPath, JSON.stringify(parsed, null, 2));
      status.lastSnapshotAt = parsed.snapshot.timestamp;

      if (integrity.valid && shouldCheckpoint(parsed, status.lastCheckpointEventId)) {
        await writeCheckpoint(parsed, integrity);
      }

      await compactPersistedWindows();

      await writePersistenceLedger();
    });

    return writeChain;
  }

  async function flush(): Promise<void> {
    await writeChain;
  }

  async function replay(query: ReplayQuery = {}): Promise<EventEnvelope[]> {
    const content = await safeRead(eventsPath);
    const events = parseNdjson(content, eventEnvelopeSchema);
    let startIndex = 0;

    if (query.afterEventId) {
      const index = events.findIndex((event) => event.eventId === query.afterEventId);
      startIndex = index >= 0 ? index + 1 : 0;
    }

    const slice = events.slice(startIndex);
    const limited = typeof query.limit === "number" && query.limit > 0 ? slice.slice(-query.limit) : slice;
    return limited;
  }

  return {
    load,
    persist,
    flush,
    replay,
    listCheckpoints: (): CheckpointMetadata[] => checkpoints.map((checkpoint) => ({ ...checkpoint })),
    getStatus: (): PersistenceStatus => ({ ...status })
  };
}
