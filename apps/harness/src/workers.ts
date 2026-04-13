import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { FederationPeerView } from "./federation-peers.js";
import type { FederationSignatureAlgorithm } from "./federation.js";
import type { NodeView } from "./node-registry.js";
import { safeUnlink } from "./utils.js";

export type IntelligenceWorkerExecutionProfile = "local" | "remote";

export type IntelligenceWorkerHealthStatus = "healthy" | "stale" | "faulted";

export type IntelligenceWorkerRecord = {
  workerId: string;
  workerLabel?: string | null;
  hostLabel?: string | null;
  nodeId?: string | null;
  locality?: string | null;
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
  identityAlgorithm?: FederationSignatureAlgorithm | null;
  identityKeyId?: string | null;
  identityIssuerNodeId?: string | null;
  identityIssuedAt?: string | null;
  identitySignature?: string | null;
  identityVerified: boolean;
  observedLatencyMs?: number | null;
  costPerHourUsd?: number | null;
  deviceAffinityTags: string[];
};

export type IntelligenceWorkerView = IntelligenceWorkerRecord & {
  healthStatus: IntelligenceWorkerHealthStatus;
  healthSummary: string;
  healthReason: string;
  lastHealthAt: string;
  leaseRemainingMs: number;
  assignmentEligible: boolean;
  assignmentBlockedReason?: string | null;
  peerId?: string | null;
  peerStatus?: FederationPeerView["status"] | null;
  peerLeaseStatus?: FederationPeerView["leaseStatus"] | null;
  peerObservedLatencyMs?: number | null;
  peerTrustRemainingMs?: number;
};

export type IntelligenceWorkerAssignmentRequest = {
  requestedExecutionDecision?: "allow_local" | "remote_required" | "preflight_blocked" | null;
  baseModel?: string | null;
  preferredLayerIds?: string[];
  recommendedLayerId?: string | null;
  target?: string | null;
  preferredNodeId?: string | null;
  preferredLocality?: string | null;
  preferredDeviceAffinityTags?: string[];
  maxObservedLatencyMs?: number | null;
  maxCostPerHourUsd?: number | null;
  nodeViews?: NodeView[];
  peerViews?: FederationPeerView[];
};

export type IntelligenceWorkerAssignment = {
  workerId: string;
  workerLabel?: string | null;
  hostLabel?: string | null;
  nodeId?: string | null;
  locality?: string | null;
  executionProfile: IntelligenceWorkerExecutionProfile;
  executionEndpoint?: string | null;
  assignedAt: string;
  reason: string;
  score: number;
  leaseToken?: string;
  leaseExpiresAt?: string;
  leaseDurationMs?: number;
  healthStatus?: IntelligenceWorkerHealthStatus;
  healthSummary?: string;
  identityVerified?: boolean;
  observedLatencyMs?: number | null;
  costPerHourUsd?: number | null;
  deviceAffinityTags?: string[];
  peerId?: string | null;
  peerStatus?: FederationPeerView["status"] | null;
  peerLeaseStatus?: FederationPeerView["leaseStatus"] | null;
  peerObservedLatencyMs?: number | null;
  peerTrustRemainingMs?: number | null;
};

export type IntelligenceWorkerSummary = {
  workerCount: number;
  healthyWorkerCount: number;
  staleWorkerCount: number;
  faultedWorkerCount: number;
  eligibleWorkerCount: number;
  blockedWorkerCount: number;
};

type WorkerRegistryState = {
  workers: IntelligenceWorkerRecord[];
};

const DEFAULT_WORKER_LEASE_MS = 45_000;
const DEFAULT_ASSIGNMENT_LEASE_MS = 180_000;
const MIN_WORKER_HEALTH_WINDOW_MS = 5_000;
const MAX_WORKER_HEALTH_WINDOW_MS = 15_000;

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

function normalizeNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildNodeViewMap(nodeViews?: NodeView[]): Map<string, NodeView> {
  return new Map((nodeViews ?? []).map((node) => [node.nodeId, node]));
}

function matchWorkerPeerView(
  worker: IntelligenceWorkerRecord,
  node: NodeView | undefined,
  peerViews?: FederationPeerView[]
): FederationPeerView | undefined {
  if (worker.executionProfile !== "remote" || !peerViews || peerViews.length === 0) {
    return undefined;
  }
  return peerViews.find((peer) => {
    if (peer.expectedNodeId && worker.nodeId && peer.expectedNodeId === worker.nodeId) {
      return true;
    }
    return Boolean(
      node?.controlPlaneUrl &&
        peer.controlPlaneUrl &&
        node.controlPlaneUrl === peer.controlPlaneUrl
    );
  });
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
        (candidate.nodeId !== undefined &&
          candidate.nodeId !== null &&
          typeof candidate.nodeId !== "string") ||
        (candidate.locality !== undefined &&
          candidate.locality !== null &&
          typeof candidate.locality !== "string") ||
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
        (candidate.identityAlgorithm !== undefined &&
          candidate.identityAlgorithm !== null &&
          candidate.identityAlgorithm !== "hmac-sha256") ||
        (candidate.identityKeyId !== undefined &&
          candidate.identityKeyId !== null &&
          typeof candidate.identityKeyId !== "string") ||
        (candidate.identityIssuerNodeId !== undefined &&
          candidate.identityIssuerNodeId !== null &&
          typeof candidate.identityIssuerNodeId !== "string") ||
        (candidate.identityIssuedAt !== undefined &&
          candidate.identityIssuedAt !== null &&
          typeof candidate.identityIssuedAt !== "string") ||
        (candidate.identitySignature !== undefined &&
          candidate.identitySignature !== null &&
          typeof candidate.identitySignature !== "string") ||
        (candidate.identityVerified !== undefined &&
          typeof candidate.identityVerified !== "boolean") ||
        (candidate.observedLatencyMs !== undefined &&
          candidate.observedLatencyMs !== null &&
          typeof candidate.observedLatencyMs !== "number") ||
        (candidate.costPerHourUsd !== undefined &&
          candidate.costPerHourUsd !== null &&
          typeof candidate.costPerHourUsd !== "number") ||
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
          nodeId: normalizeNullableString(candidate.nodeId),
          locality: normalizeNullableString(candidate.locality),
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
          preferredLayerIds: normalizeStringArray(candidate.preferredLayerIds),
          identityAlgorithm:
            candidate.identityAlgorithm === "hmac-sha256" ? candidate.identityAlgorithm : null,
          identityKeyId: normalizeNullableString(candidate.identityKeyId),
          identityIssuerNodeId: normalizeNullableString(candidate.identityIssuerNodeId),
          identityIssuedAt: normalizeNullableString(candidate.identityIssuedAt),
          identitySignature: normalizeNullableString(candidate.identitySignature),
          identityVerified:
            typeof candidate.identityVerified === "boolean"
              ? candidate.identityVerified
              : candidate.executionProfile === "local",
          observedLatencyMs: normalizeNullableNumber(candidate.observedLatencyMs),
          costPerHourUsd: normalizeNullableNumber(candidate.costPerHourUsd),
          deviceAffinityTags: normalizeStringArray(candidate.deviceAffinityTags)
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

function resolveWorkerHealthWindowMs(worker: IntelligenceWorkerRecord): number {
  const derived = Math.floor(worker.leaseDurationMs * 0.25);
  return Math.max(
    MIN_WORKER_HEALTH_WINDOW_MS,
    Math.min(
      MAX_WORKER_HEALTH_WINDOW_MS,
      Number.isFinite(derived) && derived > 0 ? derived : MIN_WORKER_HEALTH_WINDOW_MS
    )
  );
}

function buildWorkerView(
  worker: IntelligenceWorkerRecord,
  now: string,
  request?: IntelligenceWorkerAssignmentRequest
): IntelligenceWorkerView {
  const node = worker.nodeId ? buildNodeViewMap(request?.nodeViews).get(worker.nodeId) : undefined;
  const peer = matchWorkerPeerView(worker, node, request?.peerViews);
  const resolvedLocality = worker.locality ?? node?.locality ?? null;
  const resolvedObservedLatencyMs =
    peer?.leaseSmoothedLatencyMs ??
    peer?.smoothedLatencyMs ??
    worker.observedLatencyMs ??
    node?.observedLatencyMs ??
    null;
  const resolvedCostPerHourUsd = worker.costPerHourUsd ?? node?.costPerHourUsd ?? null;
  const resolvedDeviceAffinityTags = [
    ...new Set([...worker.deviceAffinityTags, ...(node?.deviceAffinityTags ?? [])])
  ];
  const leaseRemainingMs = Math.max(0, Date.parse(worker.leaseExpiresAt) - Date.parse(now));
  let healthStatus: IntelligenceWorkerHealthStatus = "healthy";
  let healthReason = "lease healthy";

  if (worker.executionProfile === "remote" && !worker.identityVerified) {
    healthStatus = "faulted";
    healthReason = "unverified federation worker";
  } else if (worker.executionProfile === "remote" && !worker.executionEndpoint) {
    healthStatus = "faulted";
    healthReason = "remote worker missing execution endpoint";
  } else if (worker.nodeId && !node) {
    healthStatus = "faulted";
    healthReason = "node registry entry missing";
  } else if (peer?.leaseStatus === "faulted") {
    healthStatus = "faulted";
    healthReason = "peer lease expired";
  } else if (node?.healthStatus === "faulted" || node?.healthStatus === "offline") {
    healthStatus = "faulted";
    healthReason = `node ${node.healthStatus}`;
  } else if (peer?.leaseStatus === "stale") {
    healthStatus = "stale";
    healthReason = "peer lease nearing expiry";
  } else if (node?.healthStatus === "stale") {
    healthStatus = "stale";
    healthReason = "node heartbeat nearing expiry";
  } else if (leaseRemainingMs <= resolveWorkerHealthWindowMs(worker)) {
    healthStatus = "stale";
    healthReason = "heartbeat lease near expiry";
  }

  let assignmentEligible = healthStatus === "healthy";
  let assignmentBlockedReason: string | null = assignmentEligible ? null : healthReason;

  if (assignmentEligible && isLeaseActive(worker.assignmentLeaseExpiresAt, now)) {
    assignmentEligible = false;
    assignmentBlockedReason = "assignment lease active";
  }

  if (
    assignmentEligible &&
    request?.requestedExecutionDecision === "remote_required" &&
    worker.executionProfile !== "remote"
  ) {
    assignmentEligible = false;
    assignmentBlockedReason = "remote execution required";
  }

  if (
    assignmentEligible &&
    request?.baseModel &&
    !workerSupportsBaseModel(worker, request.baseModel)
  ) {
    assignmentEligible = false;
    assignmentBlockedReason = `base model mismatch (${request.baseModel})`;
  }

  if (
    assignmentEligible &&
    typeof request?.maxObservedLatencyMs === "number" &&
    Number.isFinite(request.maxObservedLatencyMs) &&
    typeof resolvedObservedLatencyMs === "number" &&
    resolvedObservedLatencyMs > request.maxObservedLatencyMs
  ) {
    assignmentEligible = false;
    assignmentBlockedReason = `latency exceeds ${request.maxObservedLatencyMs} ms`;
  }

  if (
    assignmentEligible &&
    typeof request?.maxCostPerHourUsd === "number" &&
    Number.isFinite(request.maxCostPerHourUsd) &&
    typeof resolvedCostPerHourUsd === "number" &&
    resolvedCostPerHourUsd > request.maxCostPerHourUsd
  ) {
    assignmentEligible = false;
    assignmentBlockedReason = `cost exceeds $${request.maxCostPerHourUsd.toFixed(2)}/h`;
  }

  return {
    ...worker,
    locality: resolvedLocality,
    observedLatencyMs: resolvedObservedLatencyMs,
    costPerHourUsd: resolvedCostPerHourUsd,
    deviceAffinityTags: resolvedDeviceAffinityTags,
    healthStatus,
    healthSummary:
      healthStatus === "healthy"
        ? `healthy · ${Math.max(1, Math.round(leaseRemainingMs / 1_000))}s lease remaining`
        : `${healthStatus} · ${healthReason}`,
    healthReason,
    lastHealthAt: now,
    leaseRemainingMs,
    assignmentEligible,
    assignmentBlockedReason,
    peerId: peer?.peerId ?? null,
    peerStatus: peer?.status ?? null,
    peerLeaseStatus: peer?.leaseStatus ?? null,
    peerObservedLatencyMs: peer?.leaseSmoothedLatencyMs ?? peer?.smoothedLatencyMs ?? null,
    peerTrustRemainingMs: peer?.leaseTrustRemainingMs ?? peer?.trustRemainingMs ?? 0
  };
}

function summarizeWorkers(workers: IntelligenceWorkerView[]): IntelligenceWorkerSummary {
  return workers.reduce<IntelligenceWorkerSummary>(
    (summary, worker) => {
      summary.workerCount += 1;
      if (worker.healthStatus === "healthy") {
        summary.healthyWorkerCount += 1;
      } else if (worker.healthStatus === "stale") {
        summary.staleWorkerCount += 1;
      } else {
        summary.faultedWorkerCount += 1;
      }
      if (worker.assignmentEligible) {
        summary.eligibleWorkerCount += 1;
      } else {
        summary.blockedWorkerCount += 1;
      }
      return summary;
    },
    {
      workerCount: 0,
      healthyWorkerCount: 0,
      staleWorkerCount: 0,
      faultedWorkerCount: 0,
      eligibleWorkerCount: 0,
      blockedWorkerCount: 0
    }
  );
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
): { assignment: IntelligenceWorkerAssignment | null; workers: IntelligenceWorkerView[]; summary: IntelligenceWorkerSummary } {
  const preferredLayerIds = [
    request.recommendedLayerId?.trim() || null,
    ...(request.preferredLayerIds ?? []).map((value) => value.trim()).filter(Boolean)
  ].filter((value): value is string => Boolean(value));

  const views = workers.map((worker) => buildWorkerView(worker, now, request));
  const summary = summarizeWorkers(views);

  const scored = views
    .filter((worker) => worker.assignmentEligible)
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
        request.preferredNodeId &&
        worker.nodeId &&
        worker.nodeId === request.preferredNodeId
      ) {
        score += 7;
        reasons.push(`node ${request.preferredNodeId}`);
      }
      if (
        request.preferredLocality &&
        worker.locality &&
        worker.locality === request.preferredLocality
      ) {
        score += 5;
        reasons.push(`locality ${request.preferredLocality}`);
      }
      if (worker.identityVerified) {
        score += 9;
        reasons.push("identity verified");
      }
      if (worker.peerLeaseStatus === "healthy") {
        score += 4;
        reasons.push("peer lease healthy");
      }
      if (worker.peerStatus === "healthy") {
        score += 2;
        reasons.push("peer trust healthy");
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
      const requestedAffinity = normalizeStringArray(request.preferredDeviceAffinityTags);
      if (requestedAffinity.length > 0 && worker.deviceAffinityTags.length > 0) {
        const affinityMatches = requestedAffinity.filter((tag) => worker.deviceAffinityTags.includes(tag));
        if (affinityMatches.length > 0) {
          score += Math.min(6, affinityMatches.length * 3);
          reasons.push(`affinity ${affinityMatches.join(",")}`);
        }
      }
      if (typeof worker.observedLatencyMs === "number" && Number.isFinite(worker.observedLatencyMs)) {
        score += Math.max(0, 8 - worker.observedLatencyMs / 10);
        reasons.push(`latency ${worker.observedLatencyMs.toFixed(1)}ms`);
      }
      if (
        typeof worker.peerTrustRemainingMs === "number" &&
        Number.isFinite(worker.peerTrustRemainingMs) &&
        worker.peerTrustRemainingMs > 0
      ) {
        score += Math.min(3, worker.peerTrustRemainingMs / 15_000);
        reasons.push(`peer-trust ${Math.max(1, Math.round(worker.peerTrustRemainingMs / 1_000))}s`);
      }
      if (typeof worker.costPerHourUsd === "number" && Number.isFinite(worker.costPerHourUsd)) {
        score += Math.max(0, 6 - worker.costPerHourUsd * 4);
        reasons.push(`cost $${worker.costPerHourUsd.toFixed(2)}/h`);
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
    return {
      assignment: null,
      workers: views,
      summary
    };
  }
  return {
    assignment: {
      workerId: winner.worker.workerId,
      workerLabel: winner.worker.workerLabel ?? null,
      hostLabel: winner.worker.hostLabel ?? null,
      nodeId: winner.worker.nodeId ?? null,
      locality: winner.worker.locality ?? null,
      executionProfile: winner.worker.executionProfile,
      executionEndpoint: winner.worker.executionEndpoint ?? null,
      assignedAt: new Date().toISOString(),
      reason: winner.reason,
      score: winner.score,
      healthStatus: winner.worker.healthStatus,
      healthSummary: winner.worker.healthSummary,
      identityVerified: winner.worker.identityVerified,
      observedLatencyMs: winner.worker.observedLatencyMs ?? null,
      costPerHourUsd: winner.worker.costPerHourUsd ?? null,
      deviceAffinityTags: winner.worker.deviceAffinityTags,
      peerId: winner.worker.peerId ?? null,
      peerStatus: winner.worker.peerStatus ?? null,
      peerLeaseStatus: winner.worker.peerLeaseStatus ?? null,
      peerObservedLatencyMs: winner.worker.peerObservedLatencyMs ?? null,
      peerTrustRemainingMs: winner.worker.peerTrustRemainingMs ?? null
    },
    workers: views,
    summary
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
    async listWorkers(
      now?: string,
      nodeViews?: NodeView[],
      peerViews?: FederationPeerView[]
    ): Promise<IntelligenceWorkerView[]> {
      return withRegistryLock(async () => {
        const at = now ?? new Date().toISOString();
        return (await readWorkers(at)).map((worker) =>
          buildWorkerView(worker, at, { nodeViews, peerViews })
        );
      });
    },
    async registerWorker(
      worker: Omit<IntelligenceWorkerRecord, "leaseExpiresAt" | "identityVerified" | "deviceAffinityTags"> & {
        leaseExpiresAt?: string | null;
        identityVerified?: boolean;
        observedLatencyMs?: number | null;
        costPerHourUsd?: number | null;
        deviceAffinityTags?: string[];
      },
      nodeViews?: NodeView[]
    ): Promise<IntelligenceWorkerView> {
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
          nodeId: worker.nodeId ?? null,
          locality: worker.locality ?? null,
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
          preferredLayerIds: normalizeStringArray(worker.preferredLayerIds),
          identityAlgorithm:
            worker.identityAlgorithm ?? existing?.identityAlgorithm ?? (worker.executionProfile === "local" ? "hmac-sha256" : null),
          identityKeyId: normalizeNullableString(worker.identityKeyId) ?? existing?.identityKeyId ?? null,
          identityIssuerNodeId:
            normalizeNullableString(worker.identityIssuerNodeId) ?? existing?.identityIssuerNodeId ?? null,
          identityIssuedAt:
            normalizeNullableString(worker.identityIssuedAt) ?? existing?.identityIssuedAt ?? null,
          identitySignature:
            normalizeNullableString(worker.identitySignature) ?? existing?.identitySignature ?? null,
          identityVerified:
            typeof worker.identityVerified === "boolean"
              ? worker.identityVerified
              : existing?.identityVerified ?? worker.executionProfile === "local",
          observedLatencyMs:
            normalizeNullableNumber(worker.observedLatencyMs) ?? existing?.observedLatencyMs ?? null,
          costPerHourUsd:
            normalizeNullableNumber(worker.costPerHourUsd) ?? existing?.costPerHourUsd ?? null,
          deviceAffinityTags:
            worker.deviceAffinityTags !== undefined
              ? normalizeStringArray(worker.deviceAffinityTags)
              : existing?.deviceAffinityTags ?? []
        };
        if (
          existing &&
          existing.identityVerified &&
          existing.executionProfile === "remote" &&
          (
            existing.executionEndpoint !== next.executionEndpoint ||
            existing.nodeId !== next.nodeId ||
            existing.locality !== next.locality ||
            existing.workerLabel !== next.workerLabel ||
            existing.hostLabel !== next.hostLabel ||
            existing.executionProfile !== next.executionProfile ||
            !arraysEqual(existing.supportedBaseModels, next.supportedBaseModels) ||
            !arraysEqual(existing.preferredLayerIds, next.preferredLayerIds) ||
            !arraysEqual(existing.deviceAffinityTags, next.deviceAffinityTags) ||
            (existing.costPerHourUsd ?? null) !== (next.costPerHourUsd ?? null)
          ) &&
          !normalizeNullableString(worker.identitySignature)
        ) {
          throw new Error(`Verified remote worker ${worker.workerId} requires a signed federation refresh.`);
        }
        const updated = workers.filter((entry) => entry.workerId !== worker.workerId).concat(next);
        await writeWorkers(updated);
        return buildWorkerView(next, heartbeatAt, { nodeViews });
      });
    },
    async heartbeatWorker(args: {
      workerId: string;
      heartbeatAt?: string;
      leaseDurationMs?: number;
      workerLabel?: string | null;
      hostLabel?: string | null;
      nodeId?: string | null;
      locality?: string | null;
      executionProfile?: IntelligenceWorkerExecutionProfile;
      executionEndpoint?: string | null;
      watch?: boolean;
      allowHostRisk?: boolean;
      supportedBaseModels?: string[];
      preferredLayerIds?: string[];
      identityAlgorithm?: FederationSignatureAlgorithm | null;
      identityKeyId?: string | null;
      identityIssuerNodeId?: string | null;
      identityIssuedAt?: string | null;
      identitySignature?: string | null;
      identityVerified?: boolean;
      observedLatencyMs?: number | null;
      costPerHourUsd?: number | null;
      deviceAffinityTags?: string[];
    }, nodeViews?: NodeView[]): Promise<IntelligenceWorkerView> {
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
          nodeId: args.nodeId !== undefined ? normalizeNullableString(args.nodeId) : existing.nodeId,
          locality:
            args.locality !== undefined ? normalizeNullableString(args.locality) : existing.locality,
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
              : existing.preferredLayerIds,
          identityAlgorithm:
            args.identityAlgorithm !== undefined
              ? args.identityAlgorithm
              : existing.identityAlgorithm ?? null,
          identityKeyId:
            args.identityKeyId !== undefined
              ? normalizeNullableString(args.identityKeyId)
              : existing.identityKeyId ?? null,
          identityIssuerNodeId:
            args.identityIssuerNodeId !== undefined
              ? normalizeNullableString(args.identityIssuerNodeId)
              : existing.identityIssuerNodeId ?? null,
          identityIssuedAt:
            args.identityIssuedAt !== undefined
              ? normalizeNullableString(args.identityIssuedAt)
              : existing.identityIssuedAt ?? null,
          identitySignature:
            args.identitySignature !== undefined
              ? normalizeNullableString(args.identitySignature)
              : existing.identitySignature ?? null,
          identityVerified:
            typeof args.identityVerified === "boolean"
              ? args.identityVerified
              : existing.identityVerified,
          observedLatencyMs:
            args.observedLatencyMs !== undefined
              ? normalizeNullableNumber(args.observedLatencyMs)
              : existing.observedLatencyMs ?? null,
          costPerHourUsd:
            args.costPerHourUsd !== undefined
              ? normalizeNullableNumber(args.costPerHourUsd)
              : existing.costPerHourUsd ?? null,
          deviceAffinityTags:
            args.deviceAffinityTags !== undefined
              ? normalizeStringArray(args.deviceAffinityTags)
              : existing.deviceAffinityTags
        };
        if (
          existing.identityVerified &&
          existing.executionProfile === "remote" &&
          (
            existing.executionEndpoint !== next.executionEndpoint ||
            existing.nodeId !== next.nodeId ||
            existing.locality !== next.locality ||
            existing.workerLabel !== next.workerLabel ||
            existing.hostLabel !== next.hostLabel ||
            existing.executionProfile !== next.executionProfile ||
            !arraysEqual(existing.supportedBaseModels, next.supportedBaseModels) ||
            !arraysEqual(existing.preferredLayerIds, next.preferredLayerIds) ||
            !arraysEqual(existing.deviceAffinityTags, next.deviceAffinityTags) ||
            (existing.costPerHourUsd ?? null) !== (next.costPerHourUsd ?? null)
          ) &&
          args.identitySignature === undefined
        ) {
          throw new Error(`Verified remote worker ${args.workerId} requires a signed federation refresh.`);
        }
        const updated = workers.filter((worker) => worker.workerId !== args.workerId).concat(next);
        await writeWorkers(updated);
        return buildWorkerView(next, heartbeatAt, { nodeViews });
      });
    },
    async removeWorker(
      workerId: string,
      now = new Date().toISOString(),
      nodeViews?: NodeView[]
    ): Promise<IntelligenceWorkerView | null> {
      return withRegistryLock(async () => {
        const workers = await readWorkers(now);
        const existing = workers.find((worker) => worker.workerId === workerId) ?? null;
        if (!existing) {
          return null;
        }
        await writeWorkers(workers.filter((worker) => worker.workerId !== workerId));
        return buildWorkerView(existing, now, { nodeViews });
      });
    },
    async assignWorker(request: IntelligenceWorkerAssignmentRequest): Promise<{
      workers: IntelligenceWorkerView[];
      summary: IntelligenceWorkerSummary;
      assignment: IntelligenceWorkerAssignment | null;
    }> {
      return withRegistryLock(async () => {
        const now = new Date().toISOString();
        const workers = await readWorkers(now);
        const selection = selectWorker(workers, request, now);
        if (!selection.assignment) {
          return { workers: selection.workers, summary: selection.summary, assignment: null };
        }
        const selected = workers.find((worker) => worker.workerId === selection.assignment?.workerId);
        if (!selected) {
          return { workers: selection.workers, summary: selection.summary, assignment: null };
        }
        const reservedWorker = applyAssignmentLease(selected, now, request.target);
        const updated = workers.filter((worker) => worker.workerId !== selected.workerId).concat(reservedWorker);
        await writeWorkers(updated);
        const updatedViews = sortWorkers(updated).map((worker) => buildWorkerView(worker, now, request));
        return {
          workers: updatedViews,
          summary: summarizeWorkers(updatedViews),
          assignment: {
            ...selection.assignment,
            executionEndpoint: reservedWorker.executionEndpoint ?? null,
            nodeId: reservedWorker.nodeId ?? null,
            locality: reservedWorker.locality ?? null,
            leaseToken: reservedWorker.assignmentLeaseToken ?? selection.assignment.leaseToken,
            leaseExpiresAt:
              reservedWorker.assignmentLeaseExpiresAt ?? selection.assignment.leaseExpiresAt,
            leaseDurationMs:
              reservedWorker.assignmentLeaseDurationMs ?? selection.assignment.leaseDurationMs,
            identityVerified: reservedWorker.identityVerified,
            observedLatencyMs: selection.assignment.observedLatencyMs ?? reservedWorker.observedLatencyMs ?? null,
            costPerHourUsd: selection.assignment.costPerHourUsd ?? reservedWorker.costPerHourUsd ?? null,
            deviceAffinityTags: selection.assignment.deviceAffinityTags ?? reservedWorker.deviceAffinityTags,
            peerId: selection.assignment.peerId ?? null,
            peerStatus: selection.assignment.peerStatus ?? null,
            peerLeaseStatus: selection.assignment.peerLeaseStatus ?? null,
            peerObservedLatencyMs: selection.assignment.peerObservedLatencyMs ?? null,
            peerTrustRemainingMs: selection.assignment.peerTrustRemainingMs ?? null
          }
        };
      });
    },
    async releaseWorker(args: {
      workerId: string;
      leaseToken: string;
    }): Promise<IntelligenceWorkerView | null> {
      return withRegistryLock(async () => {
        const now = new Date().toISOString();
        const workers = await readWorkers(now);
        const existing = workers.find((worker) => worker.workerId === args.workerId) ?? null;
        if (!existing) {
          return null;
        }
        if (existing.assignmentLeaseToken !== args.leaseToken) {
          return buildWorkerView(existing, now);
        }
        const next: IntelligenceWorkerRecord = {
          ...existing,
          assignmentLeaseToken: null,
          assignmentLeaseExpiresAt: null,
          assignmentTarget: null
        };
        const updated = workers.filter((worker) => worker.workerId !== args.workerId).concat(next);
        await writeWorkers(updated);
        return buildWorkerView(next, now);
      });
    }
  };
}
