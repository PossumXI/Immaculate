import type { GovernanceStatus } from "./governance.js";
import type { NodeRegistrySummary } from "./node-registry.js";
import type { IntelligenceWorkerSummary, IntelligenceWorkerView } from "./workers.js";
import type { WorkGovernorSnapshot } from "./work-governor.js";

type PublicLayerStatus = "ready" | "busy" | "degraded" | "offline";

type PublicExecutionStatus = "completed" | "failed";

type PublicScheduleStatus = {
  shouldRunCognition?: boolean;
  admissionState?: "admit" | "degrade" | "hold";
};

export type PublicIntelligenceStatusInput = {
  timestamp?: string;
  snapshot: {
    intelligenceLayers: Array<{
      id: string;
      status: PublicLayerStatus;
    }>;
    cognitiveExecutions: Array<{
      status: PublicExecutionStatus;
      assignedWorkerProfile?: "local" | "remote";
    }>;
    executionSchedules: PublicScheduleStatus[];
  };
  workers: IntelligenceWorkerView[];
  workerSummary: IntelligenceWorkerSummary;
  nodeSummary: NodeRegistrySummary;
  recommendedLayerId?: string;
  governance: Pick<GovernanceStatus, "mode" | "decisionCount" | "deniedCount" | "lastDecisionAt">;
  persistence: {
    recoveryMode: string;
    persistedEventCount: number;
    integrityStatus?: string;
    integrityFindingCount?: number;
  };
  poi: unknown;
  workGovernor: WorkGovernorSnapshot;
};

export type PublicIntelligenceStatus = {
  status: "ready" | "degraded" | "blocked";
  service: "immaculate-harness";
  timestamp: string;
  visibility: "public-redacted";
  recommendedLayerId?: string;
  summary: string;
  reasons: string[];
  layerPlane: {
    layerCount: number;
    readyLayerCount: number;
    busyLayerCount: number;
    degradedLayerCount: number;
    offlineLayerCount: number;
  };
  workerPlane: IntelligenceWorkerSummary & {
    localWorkerCount: number;
    remoteWorkerCount: number;
    unverifiedWorkerCount: number;
    readiness: "ready" | "no_workers" | "no_healthy_workers" | "degraded_workers";
  };
  nodePlane: NodeRegistrySummary;
  executionPlane: {
    executionCount: number;
    completedExecutionCount: number;
    failedExecutionCount: number;
    localExecutionCount: number;
    remoteExecutionCount: number;
    scheduledCognitionCount: number;
    heldScheduleCount: number;
  };
  governor: {
    activeWeight: number;
    maxActiveWeight: number;
    queueDepth: number;
    queuedWeight: number;
    cognitiveQueueDepth: number;
    benchmarkQueueDepth: number;
  };
  governance: Pick<GovernanceStatus, "mode" | "decisionCount" | "deniedCount" | "lastDecisionAt">;
  persistence: {
    recoveryMode: string;
    persistedEventCount: number;
    integrityStatus: string;
    integrityFindingCount: number;
  };
  poi: unknown;
};

function countLayers(
  layers: PublicIntelligenceStatusInput["snapshot"]["intelligenceLayers"],
  status: PublicLayerStatus
): number {
  return layers.filter((layer) => layer.status === status).length;
}

function workerReadiness(
  workerSummary: IntelligenceWorkerSummary
): PublicIntelligenceStatus["workerPlane"]["readiness"] {
  if (workerSummary.workerCount === 0) {
    return "no_workers";
  }
  if (workerSummary.healthyWorkerCount === 0) {
    return "no_healthy_workers";
  }
  if (workerSummary.staleWorkerCount > 0 || workerSummary.faultedWorkerCount > 0) {
    return "degraded_workers";
  }
  return "ready";
}

function statusFromSignals(options: {
  readyLayerCount: number;
  integrityFindingCount: number;
  workerReadiness: PublicIntelligenceStatus["workerPlane"]["readiness"];
  queueDepth: number;
}): PublicIntelligenceStatus["status"] {
  if (options.readyLayerCount === 0 || options.integrityFindingCount > 0) {
    return "blocked";
  }
  if (options.workerReadiness !== "ready" || options.queueDepth > 0) {
    return "degraded";
  }
  return "ready";
}

function buildReasons(options: {
  readyLayerCount: number;
  workerSummary: IntelligenceWorkerSummary;
  workerReadiness: PublicIntelligenceStatus["workerPlane"]["readiness"];
  integrityFindingCount: number;
  queueDepth: number;
  deniedCount: number;
}): string[] {
  const reasons: string[] = [];
  if (options.readyLayerCount === 0) {
    reasons.push("no ready intelligence layer is registered");
  }
  if (options.workerReadiness === "no_workers") {
    reasons.push("no intelligence workers are registered");
  } else if (options.workerReadiness === "no_healthy_workers") {
    reasons.push("registered intelligence workers are stale or faulted");
  } else if (options.workerReadiness === "degraded_workers") {
    reasons.push(
      `${options.workerSummary.staleWorkerCount} stale and ${options.workerSummary.faultedWorkerCount} faulted workers are present`
    );
  }
  if (options.integrityFindingCount > 0) {
    reasons.push(`${options.integrityFindingCount} persistence integrity findings are active`);
  }
  if (options.queueDepth > 0) {
    reasons.push(`${options.queueDepth} governed work items are queued`);
  }
  if (options.deniedCount > 0) {
    reasons.push(`${options.deniedCount} governance denials are recorded`);
  }
  return reasons;
}

export function buildPublicIntelligenceStatus(
  input: PublicIntelligenceStatusInput
): PublicIntelligenceStatus {
  const layerPlane = {
    layerCount: input.snapshot.intelligenceLayers.length,
    readyLayerCount: countLayers(input.snapshot.intelligenceLayers, "ready"),
    busyLayerCount: countLayers(input.snapshot.intelligenceLayers, "busy"),
    degradedLayerCount: countLayers(input.snapshot.intelligenceLayers, "degraded"),
    offlineLayerCount: countLayers(input.snapshot.intelligenceLayers, "offline")
  };
  const readiness = workerReadiness(input.workerSummary);
  const localWorkerCount = input.workers.filter((worker) => worker.executionProfile === "local").length;
  const remoteWorkerCount = input.workers.filter((worker) => worker.executionProfile === "remote").length;
  const unverifiedWorkerCount = input.workers.filter((worker) => !worker.identityVerified).length;
  const integrityFindingCount = input.persistence.integrityFindingCount ?? 0;
  const queueDepth = input.workGovernor.queueDepth;
  const status = statusFromSignals({
    readyLayerCount: layerPlane.readyLayerCount,
    integrityFindingCount,
    workerReadiness: readiness,
    queueDepth
  });
  const reasons = buildReasons({
    readyLayerCount: layerPlane.readyLayerCount,
    workerSummary: input.workerSummary,
    workerReadiness: readiness,
    integrityFindingCount,
    queueDepth,
    deniedCount: input.governance.deniedCount
  });
  const completedExecutionCount = input.snapshot.cognitiveExecutions.filter(
    (execution) => execution.status === "completed"
  ).length;
  const failedExecutionCount = input.snapshot.cognitiveExecutions.filter(
    (execution) => execution.status === "failed"
  ).length;
  const scheduledCognitionCount = input.snapshot.executionSchedules.filter(
    (schedule) => schedule.shouldRunCognition
  ).length;
  const heldScheduleCount = input.snapshot.executionSchedules.filter(
    (schedule) => schedule.admissionState === "hold"
  ).length;

  return {
    status,
    service: "immaculate-harness",
    timestamp: input.timestamp ?? new Date().toISOString(),
    visibility: "public-redacted",
    recommendedLayerId: input.recommendedLayerId,
    summary:
      reasons.length > 0
        ? `${status}: ${reasons[0]}`
        : "ready: intelligence layer, worker plane, integrity, and governor queue are clear",
    reasons,
    layerPlane,
    workerPlane: {
      ...input.workerSummary,
      localWorkerCount,
      remoteWorkerCount,
      unverifiedWorkerCount,
      readiness
    },
    nodePlane: input.nodeSummary,
    executionPlane: {
      executionCount: input.snapshot.cognitiveExecutions.length,
      completedExecutionCount,
      failedExecutionCount,
      localExecutionCount: input.snapshot.cognitiveExecutions.filter(
        (execution) => execution.assignedWorkerProfile === "local"
      ).length,
      remoteExecutionCount: input.snapshot.cognitiveExecutions.filter(
        (execution) => execution.assignedWorkerProfile === "remote"
      ).length,
      scheduledCognitionCount,
      heldScheduleCount
    },
    governor: {
      activeWeight: input.workGovernor.activeWeight,
      maxActiveWeight: input.workGovernor.maxActiveWeight,
      queueDepth,
      queuedWeight: input.workGovernor.queuedWeight,
      cognitiveQueueDepth: input.workGovernor.lanes.cognitive.queueDepth,
      benchmarkQueueDepth: input.workGovernor.lanes.benchmark.queueDepth
    },
    governance: input.governance,
    persistence: {
      recoveryMode: input.persistence.recoveryMode,
      persistedEventCount: input.persistence.persistedEventCount,
      integrityStatus: input.persistence.integrityStatus ?? "unknown",
      integrityFindingCount
    },
    poi: input.poi
  };
}
