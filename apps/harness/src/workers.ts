import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { safeUnlink } from "./utils.js";

export type IntelligenceWorkerExecutionProfile = "local" | "remote";

export type IntelligenceWorkerRecord = {
  workerId: string;
  workerLabel?: string | null;
  hostLabel?: string | null;
  executionProfile: IntelligenceWorkerExecutionProfile;
  registeredAt: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
  leaseDurationMs: number;
  watch: boolean;
  allowHostRisk: boolean;
  supportedBaseModels: string[];
  preferredLayerIds: string[];
};

export type IntelligenceWorkerAssignmentRequest = {
  requestedExecutionDecision?: "allow_local" | "remote_required" | "preflight_blocked" | null;
  baseModel?: string | null;
  preferredLayerIds?: string[];
  recommendedLayerId?: string | null;
  target?: string | null;
};

export type IntelligenceWorkerAssignment = {
  workerId: string;
  workerLabel?: string | null;
  hostLabel?: string | null;
  executionProfile: IntelligenceWorkerExecutionProfile;
  assignedAt: string;
  reason: string;
  score: number;
};

type WorkerRegistryState = {
  workers: IntelligenceWorkerRecord[];
};

const DEFAULT_WORKER_LEASE_MS = 45_000;

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

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } finally {
    await safeUnlink(tempPath);
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean))];
}

function parseWorkerRegistry(content: string | null): IntelligenceWorkerRecord[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as WorkerRegistryState).workers)
        ? (parsed as WorkerRegistryState).workers
        : [];

    return items.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<IntelligenceWorkerRecord>;
      if (
        typeof candidate.workerId !== "string" ||
        typeof candidate.executionProfile !== "string" ||
        typeof candidate.registeredAt !== "string" ||
        typeof candidate.heartbeatAt !== "string" ||
        typeof candidate.leaseExpiresAt !== "string" ||
        typeof candidate.leaseDurationMs !== "number" ||
        typeof candidate.watch !== "boolean" ||
        typeof candidate.allowHostRisk !== "boolean"
      ) {
        return [];
      }
      if (candidate.executionProfile !== "local" && candidate.executionProfile !== "remote") {
        return [];
      }
      return [
        {
          workerId: candidate.workerId,
          workerLabel:
            typeof candidate.workerLabel === "string" ? candidate.workerLabel : undefined,
          hostLabel: typeof candidate.hostLabel === "string" ? candidate.hostLabel : undefined,
          executionProfile: candidate.executionProfile,
          registeredAt: candidate.registeredAt,
          heartbeatAt: candidate.heartbeatAt,
          leaseExpiresAt: candidate.leaseExpiresAt,
          leaseDurationMs: candidate.leaseDurationMs,
          watch: candidate.watch,
          allowHostRisk: candidate.allowHostRisk,
          supportedBaseModels: normalizeStringArray(candidate.supportedBaseModels),
          preferredLayerIds: normalizeStringArray(candidate.preferredLayerIds)
        }
      ];
    });
  } catch {
    return [];
  }
}

function sortWorkers(workers: IntelligenceWorkerRecord[]): IntelligenceWorkerRecord[] {
  return [...workers].sort((left, right) => {
    if (left.heartbeatAt !== right.heartbeatAt) {
      return left.heartbeatAt > right.heartbeatAt ? -1 : 1;
    }
    return left.workerId < right.workerId ? -1 : left.workerId > right.workerId ? 1 : 0;
  });
}

function normalizeWorkers(
  workers: IntelligenceWorkerRecord[],
  now = new Date().toISOString()
): {
  workers: IntelligenceWorkerRecord[];
  changed: boolean;
} {
  const active = workers.filter((worker) => worker.leaseExpiresAt > now);
  return {
    workers: active,
    changed: active.length !== workers.length
  };
}

function workerSupportsBaseModel(
  worker: IntelligenceWorkerRecord,
  baseModel?: string | null
): boolean {
  if (!baseModel || worker.supportedBaseModels.length === 0) {
    return true;
  }
  const normalized = baseModel.toLowerCase();
  return worker.supportedBaseModels.some((value) => {
    const candidate = value.toLowerCase();
    return candidate === "*" || candidate === normalized;
  });
}

function selectWorker(
  workers: IntelligenceWorkerRecord[],
  request: IntelligenceWorkerAssignmentRequest
): IntelligenceWorkerAssignment | null {
  const preferredLayerIds = [
    request.recommendedLayerId?.trim() || null,
    ...(request.preferredLayerIds ?? []).map((value) => value.trim()).filter(Boolean)
  ].filter((value): value is string => Boolean(value));

  const scored = workers
    .filter((worker) => {
      if (
        request.requestedExecutionDecision === "remote_required" &&
        worker.executionProfile !== "remote"
      ) {
        return false;
      }
      return workerSupportsBaseModel(worker, request.baseModel);
    })
    .map((worker) => {
      let score = 0;
      const reasons: string[] = [];
      if (
        request.requestedExecutionDecision === "remote_required" &&
        worker.executionProfile === "remote"
      ) {
        score += 8;
        reasons.push("remote-capable");
      }
      const matchedLayer = preferredLayerIds.find((layerId) =>
        worker.preferredLayerIds.includes(layerId)
      );
      if (matchedLayer) {
        score += 6;
        reasons.push(`layer ${matchedLayer}`);
      }
      if (request.baseModel && workerSupportsBaseModel(worker, request.baseModel)) {
        score += 3;
        reasons.push(`model ${request.baseModel}`);
      }
      if (worker.watch) {
        score += 1;
        reasons.push("watch");
      }
      return {
        worker,
        score,
        reason:
          reasons.join(" · ") ||
          (worker.executionProfile === "remote" ? "remote-ready" : "eligible")
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      if (left.worker.heartbeatAt !== right.worker.heartbeatAt) {
        return left.worker.heartbeatAt > right.worker.heartbeatAt ? -1 : 1;
      }
      return left.worker.workerId < right.worker.workerId ? -1 : 1;
    });

  const winner = scored[0];
  if (!winner) {
    return null;
  }
  return {
    workerId: winner.worker.workerId,
    workerLabel: winner.worker.workerLabel ?? null,
    hostLabel: winner.worker.hostLabel ?? null,
    executionProfile: winner.worker.executionProfile,
    assignedAt: new Date().toISOString(),
    reason: winner.reason,
    score: winner.score
  };
}

export function createIntelligenceWorkerRegistry(rootDir: string) {
  const registryPath = path.join(rootDir, "intelligence-workers.json");

  async function readWorkers(now?: string): Promise<IntelligenceWorkerRecord[]> {
    const parsed = parseWorkerRegistry(await safeRead(registryPath));
    const normalized = normalizeWorkers(parsed, now);
    if (normalized.changed) {
      await writeJsonAtomic(registryPath, normalized.workers);
    }
    return sortWorkers(normalized.workers);
  }

  async function writeWorkers(workers: IntelligenceWorkerRecord[]): Promise<void> {
    await writeJsonAtomic(registryPath, sortWorkers(workers));
  }

  return {
    async listWorkers(now?: string): Promise<IntelligenceWorkerRecord[]> {
      return readWorkers(now);
    },
    async registerWorker(
      worker: Omit<IntelligenceWorkerRecord, "leaseExpiresAt"> & { leaseExpiresAt?: string | null }
    ): Promise<IntelligenceWorkerRecord> {
      const heartbeatAt = worker.heartbeatAt || new Date().toISOString();
      const leaseDurationMs =
        Number.isFinite(worker.leaseDurationMs) && worker.leaseDurationMs > 0
          ? worker.leaseDurationMs
          : DEFAULT_WORKER_LEASE_MS;
      const leaseExpiresAt =
        worker.leaseExpiresAt?.trim() ||
        new Date(Date.parse(heartbeatAt) + leaseDurationMs).toISOString();
      const workers = await readWorkers(heartbeatAt);
      const existing = workers.find((entry) => entry.workerId === worker.workerId);
      const next: IntelligenceWorkerRecord = {
        workerId: worker.workerId,
        workerLabel: worker.workerLabel ?? null,
        hostLabel: worker.hostLabel ?? null,
        executionProfile: worker.executionProfile,
        registeredAt: existing?.registeredAt ?? worker.registeredAt ?? heartbeatAt,
        heartbeatAt,
        leaseExpiresAt,
        leaseDurationMs,
        watch: worker.watch,
        allowHostRisk: worker.allowHostRisk,
        supportedBaseModels: normalizeStringArray(worker.supportedBaseModels),
        preferredLayerIds: normalizeStringArray(worker.preferredLayerIds)
      };
      const updated = workers.filter((entry) => entry.workerId !== worker.workerId).concat(next);
      await writeWorkers(updated);
      return next;
    },
    async heartbeatWorker(args: {
      workerId: string;
      heartbeatAt?: string;
      leaseDurationMs?: number;
      workerLabel?: string | null;
      hostLabel?: string | null;
      executionProfile?: IntelligenceWorkerExecutionProfile;
      watch?: boolean;
      allowHostRisk?: boolean;
      supportedBaseModels?: string[];
      preferredLayerIds?: string[];
    }): Promise<IntelligenceWorkerRecord> {
      const heartbeatAt = args.heartbeatAt || new Date().toISOString();
      const workers = await readWorkers(heartbeatAt);
      const existing = workers.find((worker) => worker.workerId === args.workerId);
      if (!existing) {
        throw new Error(`Unknown worker ${args.workerId}.`);
      }
      const leaseDurationMs =
        Number.isFinite(args.leaseDurationMs) && args.leaseDurationMs && args.leaseDurationMs > 0
          ? args.leaseDurationMs
          : existing.leaseDurationMs;
      const next: IntelligenceWorkerRecord = {
        ...existing,
        workerLabel:
          args.workerLabel !== undefined ? args.workerLabel : existing.workerLabel ?? null,
        hostLabel: args.hostLabel !== undefined ? args.hostLabel : existing.hostLabel ?? null,
        executionProfile: args.executionProfile ?? existing.executionProfile,
        heartbeatAt,
        leaseDurationMs,
        leaseExpiresAt: new Date(Date.parse(heartbeatAt) + leaseDurationMs).toISOString(),
        watch: args.watch ?? existing.watch,
        allowHostRisk: args.allowHostRisk ?? existing.allowHostRisk,
        supportedBaseModels:
          args.supportedBaseModels !== undefined
            ? normalizeStringArray(args.supportedBaseModels)
            : existing.supportedBaseModels,
        preferredLayerIds:
          args.preferredLayerIds !== undefined
            ? normalizeStringArray(args.preferredLayerIds)
            : existing.preferredLayerIds
      };
      const updated = workers.filter((worker) => worker.workerId !== args.workerId).concat(next);
      await writeWorkers(updated);
      return next;
    },
    async removeWorker(workerId: string, now = new Date().toISOString()): Promise<IntelligenceWorkerRecord | null> {
      const workers = await readWorkers(now);
      const existing = workers.find((worker) => worker.workerId === workerId) ?? null;
      if (!existing) {
        return null;
      }
      await writeWorkers(workers.filter((worker) => worker.workerId !== workerId));
      return existing;
    },
    async assignWorker(request: IntelligenceWorkerAssignmentRequest): Promise<{
      workers: IntelligenceWorkerRecord[];
      assignment: IntelligenceWorkerAssignment | null;
    }> {
      const workers = await readWorkers();
      return {
        workers,
        assignment: selectWorker(workers, request)
      };
    }
  };
}
