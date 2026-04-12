import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { safeUnlink } from "./utils.js";

export type IntelligenceWorkerExecutionProfile = "local" | "remote";

export type IntelligenceWorkerRecord = {
  workerId: string;
  workerLabel?: string | null;
  hostLabel?: string | null;
  executionProfile: IntelligenceWorkerExecutionProfile;
  executionEndpoint?: string | null;
  registeredAt: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
  leaseDurationMs: number;
  assignmentLeaseExpiresAt?: string | null;
  assignmentLeaseDurationMs?: number;
  assignmentLeaseToken?: string | null;
  assignmentTarget?: string | null;
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
  executionEndpoint?: string | null;
  assignedAt: string;
  reason: string;
  score: number;
  leaseToken?: string;
  leaseExpiresAt?: string;
  leaseDurationMs?: number;
};

type WorkerRegistryState = {
  workers: IntelligenceWorkerRecord[];
};

const DEFAULT_WORKER_LEASE_MS = 45_000;
const DEFAULT_ASSIGNMENT_LEASE_MS = 180_000;

let registryWriteChain: Promise<void> = Promise.resolve();

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
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } finally {
    await safeUnlink(tempPath);
  }
}

async function withRegistryLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = registryWriteChain;
  let release!: () => void;
  registryWriteChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean))];
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
        (candidate.executionEndpoint !== undefined &&
          candidate.executionEndpoint !== null &&
          typeof candidate.executionEndpoint !== "string") ||
        (candidate.assignmentLeaseExpiresAt !== undefined &&
          candidate.assignmentLeaseExpiresAt !== null &&
          typeof candidate.assignmentLeaseExpiresAt !== "string") ||
        (candidate.assignmentLeaseDurationMs !== undefined &&
          candidate.assignmentLeaseDurationMs !== null &&
          typeof candidate.assignmentLeaseDurationMs !== "number") ||
        (candidate.assignmentLeaseToken !== undefined &&
          candidate.assignmentLeaseToken !== null &&
          typeof candidate.assignmentLeaseToken !== "string") ||
        (candidate.assignmentTarget !== undefined &&
          candidate.assignmentTarget !== null &&
          typeof candidate.assignmentTarget !== "string") ||
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
          executionEndpoint: normalizeNullableString(candidate.executionEndpoint),
          registeredAt: candidate.registeredAt,
          heartbeatAt: candidate.heartbeatAt,
          leaseExpiresAt: candidate.leaseExpiresAt,
          leaseDurationMs: candidate.leaseDurationMs,
          assignmentLeaseExpiresAt:
            typeof candidate.assignmentLeaseExpiresAt === "string"
              ? candidate.assignmentLeaseExpiresAt
              : null,
          assignmentLeaseDurationMs:
            typeof candidate.assignmentLeaseDurationMs === "number" &&
            Number.isFinite(candidate.assignmentLeaseDurationMs) &&
            candidate.assignmentLeaseDurationMs > 0
              ? candidate.assignmentLeaseDurationMs
              : undefined,
          assignmentLeaseToken:
            typeof candidate.assignmentLeaseToken === "string"
              ? candidate.assignmentLeaseToken
              : null,
          assignmentTarget:
            typeof candidate.assignmentTarget === "string"
              ? candidate.assignmentTarget
              : null,
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
  let changed = false;
  const active: IntelligenceWorkerRecord[] = [];

  for (const worker of workers) {
    if (worker.leaseExpiresAt <= now) {
      changed = true;
      continue;
    }

    const normalizedAssignmentDuration =
      typeof worker.assignmentLeaseDurationMs === "number" && worker.assignmentLeaseDurationMs > 0
        ? worker.assignmentLeaseDurationMs
        : worker.leaseDurationMs;
    const assignmentLeaseActive =
      typeof worker.assignmentLeaseExpiresAt === "string" && worker.assignmentLeaseExpiresAt > now;

    const normalized: IntelligenceWorkerRecord = {
      ...worker,
      assignmentLeaseDurationMs: normalizedAssignmentDuration
    };

    if (normalizedAssignmentDuration !== worker.assignmentLeaseDurationMs) {
      changed = true;
    }

    if (!assignmentLeaseActive && (worker.assignmentLeaseExpiresAt || worker.assignmentLeaseToken)) {
      normalized.assignmentLeaseExpiresAt = null;
      normalized.assignmentLeaseToken = null;
      normalized.assignmentTarget = null;
      changed = true;
    }

    active.push(normalized);
  }

  return {
    workers: active,
    changed
  };
}

function isLeaseActive(leaseExpiresAt: string | null | undefined, now: string): boolean {
  return typeof leaseExpiresAt === "string" && leaseExpiresAt > now;
}

function createAssignmentLease(
  worker: IntelligenceWorkerRecord,
  now: string
): {
  assignmentLeaseToken: string;
  assignmentLeaseExpiresAt: string;
  assignmentLeaseDurationMs: number;
} {
  const assignmentLeaseDurationMs =
    typeof worker.assignmentLeaseDurationMs === "number" && worker.assignmentLeaseDurationMs > 0
      ? worker.assignmentLeaseDurationMs
      : worker.leaseDurationMs > 0
        ? worker.leaseDurationMs
        : DEFAULT_ASSIGNMENT_LEASE_MS;
  return {
    assignmentLeaseToken: randomUUID(),
    assignmentLeaseExpiresAt: new Date(Date.parse(now) + assignmentLeaseDurationMs).toISOString(),
    assignmentLeaseDurationMs
  };
}

function applyAssignmentLease(
  worker: IntelligenceWorkerRecord,
  now: string,
  target?: string | null
): IntelligenceWorkerRecord {
  const nextLease = createAssignmentLease(worker, now);
  return {
    ...worker,
    assignmentLeaseToken: nextLease.assignmentLeaseToken,
    assignmentLeaseExpiresAt: nextLease.assignmentLeaseExpiresAt,
    assignmentLeaseDurationMs: nextLease.assignmentLeaseDurationMs,
    assignmentTarget: target?.trim() || null
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
  request: IntelligenceWorkerAssignmentRequest,
  now: string
): IntelligenceWorkerAssignment | null {
  const preferredLayerIds = [
    request.recommendedLayerId?.trim() || null,
    ...(request.preferredLayerIds ?? []).map((value) => value.trim()).filter(Boolean)
  ].filter((value): value is string => Boolean(value));

  const scored = workers
    .filter((worker) => {
      if (isLeaseActive(worker.assignmentLeaseExpiresAt, now)) {
        return false;
      }
      if (
        request.requestedExecutionDecision === "remote_required" &&
        worker.executionProfile !== "remote"
      ) {
        return false;
      }
      if (worker.executionProfile === "remote" && !worker.executionEndpoint) {
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
      if (
        request.requestedExecutionDecision !== "remote_required" &&
        worker.executionProfile === "local"
      ) {
        score += 2;
        reasons.push("local-ready");
      }
      if (
        worker.executionProfile === "remote" &&
        worker.executionEndpoint &&
        typeof request.target === "string" &&
        /swarm|parallel/i.test(request.target)
      ) {
        score += 4;
        reasons.push("swarm-offload");
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
      await writeJsonAtomic(registryPath, sortWorkers(normalized.workers));
    }
    return sortWorkers(normalized.workers);
  }

  async function writeWorkers(workers: IntelligenceWorkerRecord[]): Promise<void> {
    await writeJsonAtomic(registryPath, sortWorkers(workers));
  }

  return {
    async listWorkers(now?: string): Promise<IntelligenceWorkerRecord[]> {
      return withRegistryLock(() => readWorkers(now));
    },
    async registerWorker(
      worker: Omit<IntelligenceWorkerRecord, "leaseExpiresAt"> & { leaseExpiresAt?: string | null }
    ): Promise<IntelligenceWorkerRecord> {
      return withRegistryLock(async () => {
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
        const assignmentLeaseDurationMs =
          existing && typeof existing.assignmentLeaseDurationMs === "number"
            ? existing.assignmentLeaseDurationMs
            : leaseDurationMs;
        const next: IntelligenceWorkerRecord = {
          workerId: worker.workerId,
          workerLabel: worker.workerLabel ?? null,
          hostLabel: worker.hostLabel ?? null,
          executionProfile: worker.executionProfile,
          executionEndpoint: normalizeNullableString(worker.executionEndpoint),
          registeredAt: existing?.registeredAt ?? worker.registeredAt ?? heartbeatAt,
          heartbeatAt,
          leaseExpiresAt,
          leaseDurationMs,
          assignmentLeaseDurationMs,
          assignmentLeaseExpiresAt:
            existing && isLeaseActive(existing.assignmentLeaseExpiresAt, heartbeatAt)
              ? existing.assignmentLeaseExpiresAt
              : null,
          assignmentLeaseToken:
            existing && isLeaseActive(existing.assignmentLeaseExpiresAt, heartbeatAt)
              ? existing.assignmentLeaseToken ?? null
              : null,
          assignmentTarget:
            existing && isLeaseActive(existing.assignmentLeaseExpiresAt, heartbeatAt)
              ? existing.assignmentTarget ?? null
              : null,
          watch: worker.watch,
          allowHostRisk: worker.allowHostRisk,
          supportedBaseModels: normalizeStringArray(worker.supportedBaseModels),
          preferredLayerIds: normalizeStringArray(worker.preferredLayerIds)
        };
        const updated = workers.filter((entry) => entry.workerId !== worker.workerId).concat(next);
        await writeWorkers(updated);
        return next;
      });
    },
    async heartbeatWorker(args: {
      workerId: string;
      heartbeatAt?: string;
      leaseDurationMs?: number;
      workerLabel?: string | null;
      hostLabel?: string | null;
      executionProfile?: IntelligenceWorkerExecutionProfile;
      executionEndpoint?: string | null;
      watch?: boolean;
      allowHostRisk?: boolean;
      supportedBaseModels?: string[];
      preferredLayerIds?: string[];
    }): Promise<IntelligenceWorkerRecord> {
      return withRegistryLock(async () => {
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
          executionEndpoint:
            args.executionEndpoint !== undefined
              ? normalizeNullableString(args.executionEndpoint)
              : existing.executionEndpoint,
          heartbeatAt,
          leaseDurationMs,
          leaseExpiresAt: new Date(Date.parse(heartbeatAt) + leaseDurationMs).toISOString(),
          assignmentLeaseDurationMs:
            typeof existing.assignmentLeaseDurationMs === "number" &&
            existing.assignmentLeaseDurationMs > 0
              ? existing.assignmentLeaseDurationMs
              : leaseDurationMs,
          assignmentLeaseExpiresAt:
            isLeaseActive(existing.assignmentLeaseExpiresAt, heartbeatAt) &&
            typeof existing.assignmentLeaseDurationMs === "number" &&
            existing.assignmentLeaseDurationMs > 0
              ? new Date(
                  Date.parse(heartbeatAt) + existing.assignmentLeaseDurationMs
                ).toISOString()
              : isLeaseActive(existing.assignmentLeaseExpiresAt, heartbeatAt)
                ? new Date(Date.parse(heartbeatAt) + leaseDurationMs).toISOString()
                : null,
          assignmentLeaseToken:
            isLeaseActive(existing.assignmentLeaseExpiresAt, heartbeatAt)
              ? existing.assignmentLeaseToken ?? null
              : null,
          assignmentTarget:
            isLeaseActive(existing.assignmentLeaseExpiresAt, heartbeatAt)
              ? existing.assignmentTarget ?? null
              : null,
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
      });
    },
    async removeWorker(
      workerId: string,
      now = new Date().toISOString()
    ): Promise<IntelligenceWorkerRecord | null> {
      return withRegistryLock(async () => {
        const workers = await readWorkers(now);
        const existing = workers.find((worker) => worker.workerId === workerId) ?? null;
        if (!existing) {
          return null;
        }
        await writeWorkers(workers.filter((worker) => worker.workerId !== workerId));
        return existing;
      });
    },
    async assignWorker(request: IntelligenceWorkerAssignmentRequest): Promise<{
      workers: IntelligenceWorkerRecord[];
      assignment: IntelligenceWorkerAssignment | null;
    }> {
      return withRegistryLock(async () => {
        const now = new Date().toISOString();
        const workers = await readWorkers(now);
        const assignment = selectWorker(workers, request, now);
        if (!assignment) {
          return { workers, assignment: null };
        }
        const selected = workers.find((worker) => worker.workerId === assignment.workerId);
        if (!selected) {
          return { workers, assignment: null };
        }
        const reservedWorker = applyAssignmentLease(selected, now, request.target);
        const updated = workers.filter((worker) => worker.workerId !== selected.workerId).concat(reservedWorker);
        await writeWorkers(updated);
        return {
          workers: sortWorkers(updated),
          assignment: {
            ...assignment,
            executionEndpoint: reservedWorker.executionEndpoint ?? null,
            leaseToken: reservedWorker.assignmentLeaseToken ?? assignment.leaseToken,
            leaseExpiresAt:
              reservedWorker.assignmentLeaseExpiresAt ?? assignment.leaseExpiresAt,
            leaseDurationMs:
              reservedWorker.assignmentLeaseDurationMs ?? assignment.leaseDurationMs
          }
        };
      });
    },
    async releaseWorker(args: {
      workerId: string;
      leaseToken: string;
    }): Promise<IntelligenceWorkerRecord | null> {
      return withRegistryLock(async () => {
        const workers = await readWorkers();
        const existing = workers.find((worker) => worker.workerId === args.workerId) ?? null;
        if (!existing) {
          return null;
        }
        if (existing.assignmentLeaseToken !== args.leaseToken) {
          return existing;
        }
        const next: IntelligenceWorkerRecord = {
          ...existing,
          assignmentLeaseToken: null,
          assignmentLeaseExpiresAt: null,
          assignmentTarget: null
        };
        const updated = workers.filter((worker) => worker.workerId !== args.workerId).concat(next);
        await writeWorkers(updated);
        return next;
      });
    }
  };
}
