import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import h5wasm from "h5wasm/node";
import {
  neuroFrameWindowSchema,
  neuroSessionSummarySchema,
  type NeuroFrameWindow,
  type NeuroSessionSummary,
  type NeuroStreamKind,
  type NeuroStreamSummary
} from "@immaculate/core";
import { hashValue } from "./utils.js";

export type NwbSessionRecord = {
  summary: NeuroSessionSummary;
};

type NwbReplayStream = {
  summary: NeuroStreamSummary;
  values: number[];
};

export type NwbReplaySource = {
  session: NwbSessionRecord;
  streams: NwbReplayStream[];
};

type NeuroIndexEntry = {
  id: string;
  name: string;
  source: "nwb";
  filePath: string;
  recordPath: string;
  registeredAt: string;
};

let h5ReadyPromise: Promise<unknown> | null = null;

function getStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value) && value.length > 0) {
    return getStringValue(value[0]);
  }
  return undefined;
}

function getNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (Array.isArray(value) && value.length > 0) {
    return getNumberValue(value[0]);
  }
  return undefined;
}

async function ensureH5Ready(): Promise<void> {
  h5ReadyPromise ??= h5wasm.ready;
  await h5ReadyPromise;
}

function tryGetAttribute(entity: { get_attribute: (name: string, json_compatible: true) => unknown }, name: string): unknown {
  try {
    return entity.get_attribute(name, true);
  } catch {
    return undefined;
  }
}

function determineStreamKind(neurodataType?: string, pathValue?: string): NeuroStreamKind {
  const candidate = `${neurodataType ?? ""} ${pathValue ?? ""}`.toLowerCase();
  if (candidate.includes("lfp")) {
    return "lfp-series";
  }
  if (candidate.includes("spike")) {
    return "spike-series";
  }
  if (candidate.includes("electrical")) {
    return "electrical-series";
  }
  if (candidate.includes("timeseries")) {
    return "timeseries";
  }
  return "unknown";
}

function streamShape(dataset: { shape: number[] | null }): number[] {
  return Array.isArray(dataset.shape) ? dataset.shape.map((value) => Number(value)) : [];
}

function streamChannelCount(shape: number[]): number {
  if (shape.length <= 1) {
    return 1;
  }
  return shape.slice(1).reduce((product, value) => product * Math.max(value, 1), 1);
}

function extractRate(group: {
  get: (name: string) => unknown;
  get_attribute: (name: string, json_compatible: true) => unknown;
}): number | undefined {
  const attributeRate = getNumberValue(tryGetAttribute(group, "rate"));
  if (attributeRate) {
    return attributeRate;
  }

  const startingTime = group.get("starting_time") as
    | {
        get_attribute: (name: string, json_compatible: true) => unknown;
      }
    | null;
  if (startingTime) {
    const datasetRate = getNumberValue(tryGetAttribute(startingTime, "rate"));
    if (datasetRate) {
      return datasetRate;
    }
  }

  return undefined;
}

function extractUnit(group: {
  get: (name: string) => unknown;
  get_attribute: (name: string, json_compatible: true) => unknown;
}): string | undefined {
  const groupUnit = getStringValue(tryGetAttribute(group, "unit"));
  if (groupUnit) {
    return groupUnit;
  }

  const data = group.get("data") as
    | {
        get_attribute: (name: string, json_compatible: true) => unknown;
      }
    | null;
  if (data) {
    return getStringValue(tryGetAttribute(data, "unit"));
  }

  return undefined;
}

function tryExtractStream(
  group: {
    path: string;
    get: (name: string) => unknown;
    get_attribute: (name: string, json_compatible: true) => unknown;
  }
): NeuroStreamSummary | null {
  const data = group.get("data") as
    | {
        shape: number[] | null;
      }
    | null;
  if (!data) {
    return null;
  }

  const shape = streamShape(data);
  if (shape.length === 0) {
    return null;
  }

  const sampleCount = shape[0] ?? 0;
  const channelCount = streamChannelCount(shape);
  const rateHz = extractRate(group);
  const neurodataType = getStringValue(tryGetAttribute(group, "neurodata_type"));
  const unit = extractUnit(group);
  const normalizedPath = group.path.startsWith("/") ? group.path : `/${group.path}`;

  return {
    id: `stream-${hashValue(normalizedPath)}`,
    name: path.basename(normalizedPath),
    path: normalizedPath,
    kind: determineStreamKind(neurodataType, normalizedPath),
    neurodataType,
    unit,
    rateHz,
    sampleCount,
    channelCount,
    durationSec: rateHz && sampleCount > 0 ? Number((sampleCount / rateHz).toFixed(6)) : undefined,
    shape
  };
}

function datasetValues(dataset: { value: unknown }): number[] {
  const raw = dataset.value;
  if (ArrayBuffer.isView(raw)) {
    return Array.from(raw as unknown as number[]).map((value) => Number(value));
  }
  if (Array.isArray(raw)) {
    return raw.flat(Infinity).map((value) => Number(value));
  }
  return [];
}

function collectAcquisitionStreams(
  group: {
    keys: () => string[];
    get: (name: string) => unknown;
  },
  streams: NeuroStreamSummary[] = []
): NeuroStreamSummary[] {
  for (const key of group.keys()) {
    const entity = group.get(key) as
      | {
          type?: string;
          keys?: () => string[];
          get?: (name: string) => unknown;
          path?: string;
          get_attribute?: (name: string, json_compatible: true) => unknown;
        }
      | null;

    if (!entity) {
      continue;
    }

    if (entity.type === "Group" && entity.keys && entity.get && entity.path && entity.get_attribute) {
      const stream = tryExtractStream(entity as never);
      if (stream) {
        streams.push(stream);
      }

      collectAcquisitionStreams(entity as never, streams);
    }
  }

  return streams;
}

export async function scanNwbFile(filePath: string): Promise<NwbSessionRecord> {
  await ensureH5Ready();

  const resolvedPath = path.resolve(filePath);
  const file = new h5wasm.File(resolvedPath, "r");

  try {
    const acquisition = file.get("acquisition") as
      | {
          keys: () => string[];
          get: (name: string) => unknown;
        }
      | null;

    const streams = acquisition ? collectAcquisitionStreams(acquisition) : [];
    const orderedStreams = [...streams].sort((left, right) => left.path.localeCompare(right.path));
    const totalChannels = orderedStreams.reduce((sum, stream) => sum + stream.channelCount, 0);
    const totalSamples = orderedStreams.reduce((sum, stream) => sum + stream.sampleCount, 0);
    const primaryRateHz = orderedStreams
      .map((stream) => stream.rateHz)
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => right - left)[0];

    const summary = neuroSessionSummarySchema.parse({
      id: `nwb-${hashValue(resolvedPath)}`,
      source: "nwb",
      name:
        getStringValue(tryGetAttribute(file, "identifier")) ??
        path.basename(resolvedPath, path.extname(resolvedPath)),
      filePath: resolvedPath,
      nwbVersion: getStringValue(tryGetAttribute(file, "nwb_version")),
      identifier: getStringValue(tryGetAttribute(file, "identifier")),
      sessionDescription: getStringValue(tryGetAttribute(file, "session_description")),
      streamCount: orderedStreams.length,
      totalChannels,
      totalSamples,
      primaryRateHz,
      streams: orderedStreams,
      ingestedAt: new Date().toISOString()
    }) as NeuroSessionSummary;

    return {
      summary
    };
  } finally {
    file.close();
  }
}

export async function loadNwbReplaySource(filePath: string): Promise<NwbReplaySource> {
  await ensureH5Ready();

  const resolvedPath = path.resolve(filePath);
  const session = await scanNwbFile(resolvedPath);
  const file = new h5wasm.File(resolvedPath, "r");

  try {
    const streams = session.summary.streams.flatMap((stream) => {
      const group = file.get(stream.path.startsWith("/") ? stream.path.slice(1) : stream.path) as
        | {
            get: (name: string) => unknown;
          }
        | null;
      if (!group) {
        return [];
      }

      const data = group.get("data") as
        | {
            value: unknown;
          }
        | null;
      if (!data) {
        return [];
      }

      return [
        {
          summary: stream,
          values: datasetValues(data)
        }
      ];
    });

    return {
      session,
      streams
    };
  } finally {
    file.close();
  }
}

export async function buildNwbReplayFrames(
  filePath: string,
  options?: {
    replayId?: string;
    windowSize?: number;
    maxWindows?: number;
  }
): Promise<NeuroFrameWindow[]> {
  const source = await loadNwbReplaySource(filePath);
  const windowSize = Math.max(1, options?.windowSize ?? 2);
  const streamWindows = source.streams.map((stream) => Math.ceil(stream.summary.sampleCount / windowSize));
  const totalWindows = streamWindows.length > 0 ? Math.max(...streamWindows) : 0;
  const limitedTotal = options?.maxWindows ? Math.min(totalWindows, options.maxWindows) : totalWindows;

  const frames: NeuroFrameWindow[] = [];
  for (let windowIndex = 0; windowIndex < limitedTotal; windowIndex += 1) {
    const sampleStart = windowIndex * windowSize;
    const contributors = source.streams.flatMap((stream) => {
      if (sampleStart >= stream.summary.sampleCount) {
        return [];
      }

      const sampleEnd = Math.min(stream.summary.sampleCount, sampleStart + windowSize);
      const flatStart = sampleStart * stream.summary.channelCount;
      const flatEnd = sampleEnd * stream.summary.channelCount;
      const windowValues = stream.values.slice(flatStart, flatEnd);
      if (windowValues.length === 0) {
        return [];
      }

      const sumAbs = windowValues.reduce((sum, value) => sum + Math.abs(value), 0);
      const sumSquares = windowValues.reduce((sum, value) => sum + value * value, 0);
      const peak = windowValues.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      const durationMs = stream.summary.rateHz
        ? ((sampleEnd - sampleStart) / stream.summary.rateHz) * 1000
        : undefined;

      return [
        {
          summary: stream.summary,
          sampleEnd,
          sampleCount: sampleEnd - sampleStart,
          durationMs,
          sumAbs,
          sumSquares,
          peak,
          observationCount: windowValues.length
        }
      ];
    });

    if (contributors.length === 0) {
      continue;
    }

    const totalObservationCount = contributors.reduce((sum, contributor) => sum + contributor.observationCount, 0);
    const sumAbs = contributors.reduce((sum, contributor) => sum + contributor.sumAbs, 0);
    const sumSquares = contributors.reduce((sum, contributor) => sum + contributor.sumSquares, 0);
    const peak = contributors.reduce((max, contributor) => Math.max(max, contributor.peak), 0);
    const dominant = [...contributors].sort((left, right) => {
      const leftRate = left.summary.rateHz ?? 0;
      const rightRate = right.summary.rateHz ?? 0;
      if (leftRate !== rightRate) {
        return rightRate - leftRate;
      }
      return right.summary.channelCount - left.summary.channelCount;
    })[0]!;
    const durations = contributors
      .map((contributor) => contributor.durationMs)
      .filter((value): value is number => typeof value === "number");
    const syncJitterMs =
      durations.length > 1 ? Number((Math.max(...durations) - Math.min(...durations)).toFixed(3)) : 0;
    const meanAbs = totalObservationCount > 0 ? Number((sumAbs / totalObservationCount).toFixed(6)) : 0;
    const rms = totalObservationCount > 0 ? Number(Math.sqrt(sumSquares / totalObservationCount).toFixed(6)) : 0;
    const decodeConfidence = Number(
      clampForReplay(0.34 + meanAbs * 3.1 + rms * 1.9 + peak * 0.7 - syncJitterMs * 0.025).toFixed(6)
    );
    const frame = neuroFrameWindowSchema.parse({
      id: `frame-${hashValue(`${source.session.summary.id}:${windowIndex}:${windowSize}`)}`,
      replayId: options?.replayId ?? `replay-${hashValue(source.session.summary.id)}`,
      sessionId: source.session.summary.id,
      source: "nwb-replay",
      windowIndex,
      sampleStart,
      sampleEnd: Math.max(...contributors.map((contributor) => contributor.sampleEnd)),
      streamCount: contributors.length,
      channelCount: contributors.reduce((sum, contributor) => sum + contributor.summary.channelCount, 0),
      dominantKind: dominant.summary.kind,
      dominantRateHz: dominant.summary.rateHz,
      meanAbs,
      rms,
      peak: Number(peak.toFixed(6)),
      syncJitterMs,
      decodeReady: decodeConfidence >= 0.55,
      decodeConfidence,
      capturedAt: new Date().toISOString()
    }) as NeuroFrameWindow;
    frames.push(frame);
  }

  return frames;
}

function clampForReplay(value: number, min = 0, max = 0.99): number {
  return Math.min(max, Math.max(min, value));
}

export function createNeuroRegistry(rootDir: string) {
  const neuroDir = path.join(rootDir, "neuro");
  const indexPath = path.join(neuroDir, "index.json");

  async function ensureRoot(): Promise<void> {
    await mkdir(neuroDir, { recursive: true });
  }

  async function loadIndex(): Promise<NeuroIndexEntry[]> {
    await ensureRoot();

    try {
      const content = await readFile(indexPath, "utf8");
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .flatMap((entry) => {
          if (!entry || typeof entry !== "object") {
            return [];
          }
          const candidate = entry as Partial<NeuroIndexEntry>;
          if (
            typeof candidate.id !== "string" ||
            typeof candidate.name !== "string" ||
            candidate.source !== "nwb" ||
            typeof candidate.filePath !== "string" ||
            typeof candidate.recordPath !== "string" ||
            typeof candidate.registeredAt !== "string"
          ) {
            return [];
          }

          return [
            {
              id: candidate.id,
              name: candidate.name,
              source: "nwb" as const,
              filePath: candidate.filePath,
              recordPath: candidate.recordPath,
              registeredAt: candidate.registeredAt
            }
          ];
        })
        .sort((left, right) => Date.parse(right.registeredAt) - Date.parse(left.registeredAt));
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeIndex(entries: NeuroIndexEntry[]): Promise<void> {
    await ensureRoot();
    await writeFile(indexPath, JSON.stringify(entries, null, 2), "utf8");
  }

  return {
    async register(record: NwbSessionRecord): Promise<NwbSessionRecord> {
      await ensureRoot();
      const recordPath = path.join(neuroDir, `${record.summary.id}.json`);
      await writeFile(recordPath, JSON.stringify(record, null, 2), "utf8");

      const index = await loadIndex();
      const entry: NeuroIndexEntry = {
        id: record.summary.id,
        name: record.summary.name,
        source: "nwb",
        filePath: record.summary.filePath,
        recordPath,
        registeredAt: record.summary.ingestedAt
      };

      await writeIndex([entry, ...index.filter((candidate) => candidate.id !== entry.id)]);
      return record;
    },

    async list(): Promise<NeuroSessionSummary[]> {
      const index = await loadIndex();
      const records = await Promise.all(
        index.map(async (entry) => {
          const content = await readFile(entry.recordPath, "utf8");
          const record = JSON.parse(content) as NwbSessionRecord;
          return neuroSessionSummarySchema.parse(record.summary) as NeuroSessionSummary;
        })
      );
      return records.sort((left, right) => Date.parse(right.ingestedAt) - Date.parse(left.ingestedAt));
    },

    async get(sessionId: string): Promise<NwbSessionRecord | null> {
      const index = await loadIndex();
      const match = index.find((entry) => entry.id === sessionId);
      if (!match) {
        return null;
      }

      const content = await readFile(match.recordPath, "utf8");
      const record = JSON.parse(content) as NwbSessionRecord;
      return {
        summary: neuroSessionSummarySchema.parse(record.summary) as NeuroSessionSummary
      };
    }
  };
}
