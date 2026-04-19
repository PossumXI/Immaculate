import type {
  ExecutionParallelAffinityMode,
  ExecutionParallelBackpressureAction,
  ExecutionParallelDeadlineClass,
  ExecutionScheduleMode,
  ExecutionTopology,
  GovernancePressureLevel,
  IntelligenceLayer,
  IntelligenceLayerRole
} from "@immaculate/core";
import type { FederatedExecutionPressure } from "./federation-pressure.js";

export type ParallelFormationMode =
  | "single-lane"
  | "vertical-pipeline"
  | "horizontal-swarm"
  | "hybrid-quorum";

export type ParallelFormation = {
  mode: ParallelFormationMode;
  verticalStageCount: number;
  horizontalReplicaCount: number;
  localReplicaCount: number;
  remoteReplicaCount: number;
  verificationQuorum: number;
  boundedRetryBudget: number;
  capabilitySpreadCount: number;
  affinityMode: ExecutionParallelAffinityMode;
  deadlineClass: ExecutionParallelDeadlineClass;
  deadlineBudgetMs: number;
  backpressureAction: ExecutionParallelBackpressureAction;
  intentAlignmentScore: number;
  summary: string;
};

type BuildParallelFormationInput = {
  mode: ExecutionScheduleMode;
  executionTopology: ExecutionTopology;
  admittedLayers: IntelligenceLayer[];
  healthWeightedWidth: number;
  backlogPressure: GovernancePressureLevel;
  governancePressure: GovernancePressureLevel;
  workerReliabilityFloor: number;
  qGovernedLaneHealthy: boolean;
  signalQuality?: number;
  sessionBlockedVerdictCount?: number;
  sessionApprovedVerdictCount?: number;
  federatedPressure?: FederatedExecutionPressure;
};

function uniqueRoles(layers: IntelligenceLayer[]): IntelligenceLayerRole[] {
  const roles: IntelligenceLayerRole[] = [];
  for (const layer of layers) {
    if (!roles.includes(layer.role)) {
      roles.push(layer.role);
    }
  }
  return roles;
}

function clampPositiveInteger(value: number, fallback = 0): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function formationModeForInput(input: BuildParallelFormationInput): ParallelFormationMode {
  const nonGuardWidth = input.admittedLayers.filter((layer) => layer.role !== "guard").length;
  const hasGuard = input.admittedLayers.some((layer) => layer.role === "guard");

  if (nonGuardWidth <= 1 && !hasGuard) {
    return "single-lane";
  }
  if (input.executionTopology === "parallel-then-guard" || (hasGuard && nonGuardWidth > 1)) {
    return input.workerReliabilityFloor >= 12 || input.backlogPressure !== "clear"
      ? "hybrid-quorum"
      : "vertical-pipeline";
  }
  if (input.executionTopology === "parallel" || nonGuardWidth > 1) {
    return input.workerReliabilityFloor >= 12 || input.backlogPressure !== "clear"
      ? "hybrid-quorum"
      : "horizontal-swarm";
  }
  return "single-lane";
}

export function buildParallelFormation(input: BuildParallelFormationInput): ParallelFormation {
  const capabilityRoles = uniqueRoles(input.admittedLayers);
  const nonGuardWidth = input.admittedLayers.filter((layer) => layer.role !== "guard").length;
  const hasGuard = input.admittedLayers.some((layer) => layer.role === "guard");
  const horizontalReplicaCount =
    input.executionTopology === "parallel-then-guard"
      ? clampPositiveInteger(nonGuardWidth, input.admittedLayers.length > 0 ? 1 : 0)
      : input.executionTopology === "parallel"
        ? clampPositiveInteger(Math.max(nonGuardWidth, input.admittedLayers.length), input.admittedLayers.length > 0 ? 1 : 0)
        : input.admittedLayers.length > 0
          ? 1
          : 0;
  const verticalStageCount =
    input.admittedLayers.length === 0 ? 0 : hasGuard && nonGuardWidth > 0 ? 2 : 1;
  const mode = formationModeForInput(input);
  const remoteReplicaBudget =
    !input.qGovernedLaneHealthy &&
    horizontalReplicaCount > 1 &&
    input.federatedPressure?.pressure === "clear"
      ? 1
      : !input.qGovernedLaneHealthy &&
          horizontalReplicaCount > 2 &&
          input.federatedPressure?.pressure === "elevated"
        ? 1
        : 0;
  const remoteReplicaCount = Math.min(remoteReplicaBudget, Math.max(0, horizontalReplicaCount - 1));
  const localReplicaCount = Math.max(0, horizontalReplicaCount - remoteReplicaCount);
  const verificationQuorum =
    horizontalReplicaCount <= 1
      ? 1
      : input.backlogPressure === "critical"
        ? horizontalReplicaCount
        : Math.min(horizontalReplicaCount, Math.floor(horizontalReplicaCount / 2) + 1);
  const boundedRetryBudget =
    horizontalReplicaCount <= 0
      ? 0
      : input.backlogPressure === "critical"
        ? 0
        : input.federatedPressure?.pressure === "critical"
          ? 0
          : input.healthWeightedWidth > 1 || input.workerReliabilityFloor >= 10
          ? 1
          : 0;
  const backupReplicaCount =
    boundedRetryBudget <= 0 || horizontalReplicaCount <= 1
      ? 0
      : Math.min(Math.max(1, verificationQuorum - 1), Math.max(0, horizontalReplicaCount - 1));
  const verificationStrategy =
    horizontalReplicaCount <= 1
      ? "single-trust"
      : remoteReplicaCount > 0
        ? "hybrid-majority"
        : "local-quorum";
  const failoverStrategy =
    backupReplicaCount <= 0
      ? "none"
      : remoteReplicaCount > 0
        ? "hybrid-spare"
        : input.backlogPressure === "critical" || input.governancePressure === "critical"
          ? "serialize-on-pressure"
          : "local-spare";
  const affinityMode: ExecutionParallelAffinityMode =
    horizontalReplicaCount <= 1
      ? "local-pinned"
      : input.qGovernedLaneHealthy && remoteReplicaCount === 0 && verificationQuorum >= 2
        ? "quorum-local"
        : remoteReplicaCount === 0
          ? "local-spread"
          : "hybrid-spill";
  const deadlineClass: ExecutionParallelDeadlineClass =
    input.governancePressure === "critical" || input.backlogPressure === "critical"
      ? "hard"
      : input.governancePressure === "elevated" ||
          input.backlogPressure === "elevated" ||
          remoteReplicaCount > 0 ||
          mode === "vertical-pipeline" ||
          mode === "hybrid-quorum"
        ? "bounded"
        : "elastic";
  const deadlineBudgetMs = clampPositiveInteger(
    (deadlineClass === "hard"
      ? 320
      : deadlineClass === "bounded"
        ? 640
        : 920) +
      (mode === "single-lane" ? 0 : mode === "vertical-pipeline" ? 90 : 60) +
      Math.max(0, 2 - localReplicaCount) * 40 -
      remoteReplicaCount * 75 -
      Math.min(120, Math.round((input.signalQuality ?? 0) * 80)),
    deadlineClass === "hard" ? 260 : deadlineClass === "bounded" ? 520 : 840
  );
  const backpressureAction: ExecutionParallelBackpressureAction =
    horizontalReplicaCount <= 0
      ? "hold"
      : input.governancePressure === "critical" || input.backlogPressure === "critical"
        ? "serialize"
        : remoteReplicaCount > 0 ||
            input.backlogPressure === "elevated" ||
            input.federatedPressure?.pressure === "elevated"
          ? "degrade"
          : "steady";
  const intentAlignmentScore = Number(
    clamp(
      (input.qGovernedLaneHealthy ? 0.32 : 0.14) +
        (affinityMode === "quorum-local"
          ? 0.2
          : affinityMode === "local-spread"
            ? 0.14
            : affinityMode === "local-pinned"
              ? 0.1
              : 0.04) +
        (deadlineClass === "elastic" ? 0.14 : deadlineClass === "bounded" ? 0.1 : 0.05) +
        (input.signalQuality ?? 0) * 0.1 +
        Math.min(0.08, capabilityRoles.length * 0.02) +
        Math.min(0.08, (input.sessionApprovedVerdictCount ?? 0) * 0.02) -
        Math.min(0.16, (input.sessionBlockedVerdictCount ?? 0) * 0.04) -
        (input.federatedPressure?.pressure === "critical"
          ? 0.16
          : input.federatedPressure?.pressure === "elevated"
            ? 0.08
            : 0),
      0,
      1
    ).toFixed(2)
  );

  const summarySegments = [
    `mode=${mode}`,
    `stages=${verticalStageCount}`,
    `horizontal=${horizontalReplicaCount}`,
    `local=${localReplicaCount}`,
    `remote=${remoteReplicaCount}`,
    `quorum=${verificationQuorum}`,
    `backup=${backupReplicaCount}`,
    `verify=${verificationStrategy}`,
    `failover=${failoverStrategy}`,
    `retry=${boundedRetryBudget}`,
    `aff=${affinityMode}`,
    `ddl=${deadlineClass}:${deadlineBudgetMs}ms`,
    `bp=${backpressureAction}`,
    `align=${intentAlignmentScore.toFixed(2)}`,
    `roles=${capabilityRoles.join(">") || "none"}`,
    `gov=${input.governancePressure}`,
    `backlog=${input.backlogPressure}`,
    `fed=${input.federatedPressure?.pressure ?? "none"}`,
    `qLane=${input.qGovernedLaneHealthy ? "local-primary" : "degraded"}`
  ];

  return {
    mode,
    verticalStageCount,
    horizontalReplicaCount,
    localReplicaCount,
    remoteReplicaCount,
    verificationQuorum,
    boundedRetryBudget,
    capabilitySpreadCount: capabilityRoles.length,
    affinityMode,
    deadlineClass,
    deadlineBudgetMs,
    backpressureAction,
    intentAlignmentScore,
    summary: summarySegments.join(" / ")
  };
}
