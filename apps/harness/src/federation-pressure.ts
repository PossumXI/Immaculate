import type {
  CognitiveExecution,
  GovernancePressureLevel
} from "@immaculate/core";
import type { FederationLeaseRecoveryMode, FederationPeerView } from "./federation-peers.js";

export type IntelligenceWorkerExecutionOutcomeSummary = {
  workerId: string;
  peerId?: string;
  attemptCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailureCount: number;
  successRatio: number;
  failurePressure: number;
  smoothedLatencyMs?: number;
  lastStatus?: "completed" | "failed";
  lastCompletedAt?: string;
  lastErrorPreview?: string;
};

export type IntelligencePeerExecutionOutcomeSummary = {
  peerId: string;
  attemptCount: number;
  successCount: number;
  failureCount: number;
  consecutiveFailureCount: number;
  successRatio: number;
  failurePressure: number;
  smoothedLatencyMs?: number;
  lastStatus?: "completed" | "failed";
  lastCompletedAt?: string;
  lastErrorPreview?: string;
};

export type FederatedExecutionPressureWorkerView = {
  workerId: string;
  executionProfile: "local" | "remote";
  assignmentEligible: boolean;
  preferredLayerIds?: string[];
  supportedBaseModels?: string[];
  deviceAffinityTags?: string[];
  observedLatencyMs?: number | null;
  peerId?: string | null;
  peerObservedLatencyMs?: number | null;
  peerLeaseStatus?: FederationPeerView["leaseStatus"] | null;
  executionSuccessRatio?: number;
  executionFailurePressure?: number;
  executionAttemptCount?: number;
  executionSmoothedLatencyMs?: number | null;
};

export type FederatedExecutionPressure = {
  pressure: GovernancePressureLevel;
  healthyPeerCount: number;
  recoveringPeerCount: number;
  eligibleRemoteWorkerCount: number;
  crossNodeLatencyMs?: number;
  remoteSuccessRatio: number;
  remoteFailurePressure: number;
  executionLatencyMs?: number;
  rationale: string;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smoothLatency(previous: number | undefined, observed: number): number {
  if (!Number.isFinite(previous ?? Number.NaN)) {
    return Number(observed.toFixed(2));
  }
  return Number((((previous as number) * 0.65) + observed * 0.35).toFixed(2));
}

function computeFailurePressure(options: {
  attemptCount: number;
  successCount: number;
  consecutiveFailureCount: number;
  lastStatus?: "completed" | "failed";
}): number {
  if (options.attemptCount <= 0) {
    return 0;
  }
  const successRatio = (options.successCount + 1) / (options.attemptCount + 2);
  return clamp(
    (1 - successRatio) * 0.52 +
      Math.min(1, options.consecutiveFailureCount * 0.18) +
      (options.lastStatus === "failed" ? 0.1 : 0),
    0,
    1
  );
}

export function summarizeRemoteExecutionOutcomes(executions: CognitiveExecution[]): {
  workerSummaries: Map<string, IntelligenceWorkerExecutionOutcomeSummary>;
  peerSummaries: Map<string, IntelligencePeerExecutionOutcomeSummary>;
} {
  const workerSummaries = new Map<string, IntelligenceWorkerExecutionOutcomeSummary>();
  const peerSummaries = new Map<string, IntelligencePeerExecutionOutcomeSummary>();

  const ordered = [...executions]
    .filter(
      (execution) =>
        execution.assignedWorkerProfile === "remote" &&
        typeof execution.assignedWorkerId === "string" &&
        execution.assignedWorkerId.length > 0
    )
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt));

  for (const execution of ordered) {
    const workerId = execution.assignedWorkerId as string;
    const peerId = execution.assignedWorkerPeerId?.trim() || undefined;
    const isSuccess = execution.status === "completed";
    const normalizedLatencyMs =
      typeof execution.latencyMs === "number" && Number.isFinite(execution.latencyMs)
        ? Math.max(1, execution.latencyMs)
        : 1;
    const lastErrorPreview =
      execution.status === "failed" ? execution.responsePreview.slice(0, 160) : undefined;

    const priorWorker = workerSummaries.get(workerId);
    const workerAttemptCount = (priorWorker?.attemptCount ?? 0) + 1;
    const workerSuccessCount = (priorWorker?.successCount ?? 0) + (isSuccess ? 1 : 0);
    const workerFailureCount = (priorWorker?.failureCount ?? 0) + (isSuccess ? 0 : 1);
    const workerConsecutiveFailures = isSuccess
      ? 0
      : (priorWorker?.consecutiveFailureCount ?? 0) + 1;
    workerSummaries.set(workerId, {
      workerId,
      peerId,
      attemptCount: workerAttemptCount,
      successCount: workerSuccessCount,
      failureCount: workerFailureCount,
      consecutiveFailureCount: workerConsecutiveFailures,
      successRatio: Number((workerSuccessCount / workerAttemptCount).toFixed(4)),
      failurePressure: computeFailurePressure({
        attemptCount: workerAttemptCount,
        successCount: workerSuccessCount,
        consecutiveFailureCount: workerConsecutiveFailures,
        lastStatus: execution.status
      }),
      smoothedLatencyMs: smoothLatency(priorWorker?.smoothedLatencyMs, normalizedLatencyMs),
      lastStatus: execution.status,
      lastCompletedAt: execution.completedAt,
      lastErrorPreview
    });

    if (peerId) {
      const priorPeer = peerSummaries.get(peerId);
      const peerAttemptCount = (priorPeer?.attemptCount ?? 0) + 1;
      const peerSuccessCount = (priorPeer?.successCount ?? 0) + (isSuccess ? 1 : 0);
      const peerFailureCount = (priorPeer?.failureCount ?? 0) + (isSuccess ? 0 : 1);
      const peerConsecutiveFailures = isSuccess
        ? 0
        : (priorPeer?.consecutiveFailureCount ?? 0) + 1;
      peerSummaries.set(peerId, {
        peerId,
        attemptCount: peerAttemptCount,
        successCount: peerSuccessCount,
        failureCount: peerFailureCount,
        consecutiveFailureCount: peerConsecutiveFailures,
        successRatio: Number((peerSuccessCount / peerAttemptCount).toFixed(4)),
        failurePressure: computeFailurePressure({
          attemptCount: peerAttemptCount,
          successCount: peerSuccessCount,
          consecutiveFailureCount: peerConsecutiveFailures,
          lastStatus: execution.status
        }),
        smoothedLatencyMs: smoothLatency(priorPeer?.smoothedLatencyMs, normalizedLatencyMs),
        lastStatus: execution.status,
        lastCompletedAt: execution.completedAt,
        lastErrorPreview
      });
    }
  }

  return {
    workerSummaries,
    peerSummaries
  };
}

function matchesPreferredLayers(
  worker: FederatedExecutionPressureWorkerView,
  preferredLayerIds?: string[]
): boolean {
  if (!preferredLayerIds || preferredLayerIds.length === 0) {
    return true;
  }
  const preferred = new Set(preferredLayerIds.map((entry) => entry.trim()).filter(Boolean));
  if (preferred.size === 0) {
    return true;
  }
  return (worker.preferredLayerIds ?? []).some((layerId) => preferred.has(layerId));
}

function matchesBaseModel(
  worker: FederatedExecutionPressureWorkerView,
  baseModel?: string
): boolean {
  if (!baseModel?.trim()) {
    return true;
  }
  const normalized = baseModel.trim().toLowerCase();
  const supported = worker.supportedBaseModels ?? [];
  if (supported.length === 0) {
    return true;
  }
  return supported.some((entry) => {
    const candidate = entry.trim().toLowerCase();
    return candidate === "*" || candidate === normalized;
  });
}

function matchesAffinity(
  worker: FederatedExecutionPressureWorkerView,
  preferredDeviceAffinityTags?: string[]
): boolean {
  if (!preferredDeviceAffinityTags || preferredDeviceAffinityTags.length === 0) {
    return true;
  }
  const preferred = preferredDeviceAffinityTags.map((entry) => entry.trim()).filter(Boolean);
  if (preferred.length === 0) {
    return true;
  }
  const tags = new Set(worker.deviceAffinityTags ?? []);
  return preferred.some((entry) => tags.has(entry));
}

export function buildFederatedExecutionPressure(options: {
  peerViews: FederationPeerView[];
  workers: FederatedExecutionPressureWorkerView[];
  preferredLayerIds?: string[];
  preferredDeviceAffinityTags?: string[];
  baseModel?: string;
  target?: string;
}): FederatedExecutionPressure {
  const candidateRemoteWorkers = options.workers.filter(
    (worker) =>
      worker.executionProfile === "remote" &&
      matchesPreferredLayers(worker, options.preferredLayerIds) &&
      matchesBaseModel(worker, options.baseModel) &&
      matchesAffinity(worker, options.preferredDeviceAffinityTags)
  );
  const eligibleRemoteWorkers = candidateRemoteWorkers.filter((worker) => worker.assignmentEligible);
  const activePeers = options.peerViews.filter(
    (peer) => peer.status !== "faulted" && peer.leaseStatus !== "faulted"
  );
  const healthyPeerCount = options.peerViews.filter(
    (peer) => peer.status === "healthy" && peer.leaseStatus === "healthy"
  ).length;
  const recoveringPeerCount = options.peerViews.filter(
    (peer) => peer.leaseRecoveryMode === "recovering"
  ).length;
  const eligibleLatencies = eligibleRemoteWorkers
    .map((worker) => worker.peerObservedLatencyMs ?? worker.observedLatencyMs ?? null)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const crossNodeLatencyMs =
    eligibleLatencies.length > 0 ? Number(Math.min(...eligibleLatencies).toFixed(2)) : undefined;
  const successRatios = eligibleRemoteWorkers
    .map((worker) =>
      typeof worker.executionSuccessRatio === "number" && Number.isFinite(worker.executionSuccessRatio)
        ? clamp(worker.executionSuccessRatio)
        : 1
    );
  const peerSuccessRatios = activePeers.map((peer) => clamp(peer.remoteExecutionSuccessRatio));
  const failurePressures = eligibleRemoteWorkers
    .map((worker) =>
      typeof worker.executionFailurePressure === "number" && Number.isFinite(worker.executionFailurePressure)
        ? clamp(worker.executionFailurePressure)
        : 0
    );
  const peerFailurePressures = activePeers.map((peer) => clamp(peer.remoteExecutionFailurePressure));
  const executionLatencies = eligibleRemoteWorkers
    .map((worker) =>
      typeof worker.executionSmoothedLatencyMs === "number" && Number.isFinite(worker.executionSmoothedLatencyMs)
        ? worker.executionSmoothedLatencyMs
        : null
    )
    .filter((value): value is number => typeof value === "number");
  const peerExecutionLatencies = activePeers
    .map((peer) =>
      typeof peer.remoteExecutionSmoothedLatencyMs === "number" &&
      Number.isFinite(peer.remoteExecutionSmoothedLatencyMs)
        ? peer.remoteExecutionSmoothedLatencyMs
        : null
    )
    .filter((value): value is number => typeof value === "number");

  const remoteSuccessRatio =
    successRatios.length > 0 || peerSuccessRatios.length > 0
      ? Number(
          (
            [...successRatios, ...peerSuccessRatios].reduce((total, value) => total + value, 0) /
            [...successRatios, ...peerSuccessRatios].length
          ).toFixed(4)
        )
      : 0;
  const remoteFailurePressure =
    failurePressures.length > 0 || peerFailurePressures.length > 0
      ? Number(Math.max(...failurePressures, ...peerFailurePressures).toFixed(4))
      : 0;
  const executionLatencyMs =
    executionLatencies.length > 0 || peerExecutionLatencies.length > 0
      ? Number(
          (
            [...executionLatencies, ...peerExecutionLatencies].reduce(
              (total, value) => total + value,
              0
            ) / [...executionLatencies, ...peerExecutionLatencies].length
          ).toFixed(2)
        )
      : undefined;

  let pressure: GovernancePressureLevel = "clear";
  if (
    eligibleRemoteWorkers.length === 0 ||
    healthyPeerCount === 0 ||
    remoteFailurePressure >= 0.82 ||
    remoteSuccessRatio < 0.55 ||
    (typeof crossNodeLatencyMs === "number" && crossNodeLatencyMs > 120)
  ) {
    pressure = "critical";
  } else if (
    recoveringPeerCount > 0 ||
    remoteFailurePressure >= 0.36 ||
    remoteSuccessRatio < 0.86 ||
    (typeof crossNodeLatencyMs === "number" && crossNodeLatencyMs > 55)
  ) {
    pressure = "elevated";
  }

  const rationale = [
    `pressure=${pressure}`,
    `eligibleRemote=${eligibleRemoteWorkers.length}/${candidateRemoteWorkers.length}`,
    `healthyPeers=${healthyPeerCount}`,
    `recoveringPeers=${recoveringPeerCount}`,
    `latency=${typeof crossNodeLatencyMs === "number" ? crossNodeLatencyMs.toFixed(2) : "none"}`,
    `success=${remoteSuccessRatio.toFixed(2)}`,
    `failure=${remoteFailurePressure.toFixed(2)}`,
    `target=${options.target?.trim() || "none"}`
  ].join(" / ");

  return {
    pressure,
    healthyPeerCount,
    recoveringPeerCount,
    eligibleRemoteWorkerCount: eligibleRemoteWorkers.length,
    crossNodeLatencyMs,
    remoteSuccessRatio,
    remoteFailurePressure,
    executionLatencyMs,
    rationale
  };
}
