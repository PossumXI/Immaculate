import type {
  ExecutionParallelAffinityMode,
  ExecutionParallelBackpressureAction,
  ExecutionParallelDeadlineClass,
  ExecutionArbitration,
  ExecutionParallelFormationMode,
  ExecutionSchedule,
  ExecutionScheduleMode,
  ExecutionTopology,
  GovernancePressureLevel,
  IntelligenceLayer,
  IntelligenceLayerRole,
  PhaseSnapshot
} from "@immaculate/core";
import type { FederatedExecutionPressure } from "./federation-pressure.js";
import { buildParallelFormation } from "./parallel-engine.js";
import type { QOrchestrationContext } from "./q-orchestration-context.js";
import type { SessionConversationMemory } from "./conversation.js";
import { getQModelName, truthfulModelLabel } from "./q-model.js";
import { hashValue } from "./utils.js";

type ExecutionSchedulePlanInput = {
  snapshot: PhaseSnapshot;
  arbitration: ExecutionArbitration;
  requestedLayerId?: string;
  maxWidth?: number;
  sessionConversationMemory?: SessionConversationMemory;
  federationPressure?: FederatedExecutionPressure;
  qContext?: Pick<
    QOrchestrationContext,
    | "readinessReady"
    | "gatewaySubstrateHealthy"
    | "preferredExecutionLane"
    | "qRoutingDirective"
    | "cloudLaneReady"
    | "cloudLaneStatus"
    | "trainingBundleId"
    | "mediationDiagnosticSummary"
    | "mediationDiagnosticSignals"
  >;
};

export type ExecutionSchedulePlan = {
  mode: ExecutionScheduleMode;
  executionTopology: ExecutionTopology;
  parallelWidth: number;
  parallelFormationMode?: ExecutionParallelFormationMode;
  verticalStageCount?: number;
  horizontalReplicaCount?: number;
  localReplicaCount?: number;
  remoteReplicaCount?: number;
  verificationQuorum?: number;
  boundedRetryBudget?: number;
  capabilitySpreadCount?: number;
  affinityMode?: ExecutionParallelAffinityMode;
  deadlineClass?: ExecutionParallelDeadlineClass;
  deadlineBudgetMs?: number;
  backpressureAction?: ExecutionParallelBackpressureAction;
  intentAlignmentScore?: number;
  parallelFormationSummary?: string;
  admissionState: "admit" | "degrade" | "hold";
  backlogPressure: GovernancePressureLevel;
  backlogScore: number;
  healthWeightedWidth: number;
  readyLayerCount: number;
  busyLayerCount: number;
  degradedLayerCount: number;
  workerReliabilityFloor: number;
  primaryLayerId?: string;
  layerIds: string[];
  layerRoles: IntelligenceLayerRole[];
  shouldRunCognition: boolean;
  shouldDispatchActuation: boolean;
  decodeConfidence: number;
  governancePressure: GovernancePressureLevel;
  federationPressure?: GovernancePressureLevel;
  federationObservedLatencyMs?: number;
  federationRemoteSuccessRatio?: number;
  estimatedLatencyMs: number;
  estimatedCost: number;
  objective: string;
  rationale: string;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function layerStatusRank(layer: IntelligenceLayer): number {
  return layer.status === "ready"
    ? 0
    : layer.status === "busy"
      ? 1
      : layer.status === "degraded"
        ? 2
        : 3;
}

function layerHealthWeight(layer: IntelligenceLayer): number {
  return layer.status === "ready"
    ? 1
    : layer.status === "busy"
      ? 0.58
      : layer.status === "degraded"
        ? 0.24
        : 0;
}

function roleLatencyMs(role: IntelligenceLayerRole): number {
  return role === "soul" ? 3200 : role === "reasoner" ? 2400 : role === "guard" ? 1600 : 2100;
}

function roleCost(role: IntelligenceLayerRole): number {
  return role === "soul" ? 1.4 : role === "reasoner" ? 1.2 : role === "guard" ? 0.8 : 1;
}

function uniqueRoles(roles: IntelligenceLayerRole[]): IntelligenceLayerRole[] {
  return roles.filter((role, index) => roles.indexOf(role) === index);
}

const MULTI_TURN_ROLE_ORDER: IntelligenceLayerRole[] = ["mid", "soul", "reasoner", "guard"];

export function isParallelScheduleMode(mode: ExecutionScheduleMode): boolean {
  return mode === "swarm-parallel" || mode === "guarded-swarm";
}

export function preferredScheduleRoles(arbitration: ExecutionArbitration): IntelligenceLayerRole[] {
  const preferred = arbitration.preferredLayerRole;

  if (!arbitration.shouldRunCognition) {
    return [];
  }

  if (arbitration.mode === "guarded-review") {
    return uniqueRoles([preferred ?? "guard", "guard", "reasoner"]);
  }

  if (arbitration.mode === "operator-override") {
    return uniqueRoles(MULTI_TURN_ROLE_ORDER);
  }

  if (arbitration.mode === "cognitive-escalation") {
    if (arbitration.governancePressure === "clear") {
      return uniqueRoles([preferred ?? "mid", "reasoner"]);
    }
    return uniqueRoles([preferred ?? "reasoner", "guard"]);
  }

  return uniqueRoles([preferred ?? "mid"]);
}

function selectLayers(
  layers: IntelligenceLayer[],
  preferredRoles: IntelligenceLayerRole[],
  requestedLayerId?: string,
  maxWidth = 3
): IntelligenceLayer[] {
  const selected: IntelligenceLayer[] = [];
  const available = [...layers]
    .filter((layer) => layer.status !== "offline")
    .sort((left, right) => layerStatusRank(left) - layerStatusRank(right));

  if (requestedLayerId) {
    const explicit = available.find((layer) => layer.id === requestedLayerId);
    if (explicit) {
      selected.push(explicit);
    }
  }

  for (const role of preferredRoles) {
    const candidate = available.find(
      (layer) => layer.role === role && !selected.some((entry) => entry.id === layer.id)
    );
    if (candidate) {
      selected.push(candidate);
    }
    if (selected.length >= maxWidth) {
      return selected.slice(0, maxWidth);
    }
  }

  return selected.slice(0, maxWidth);
}

function scheduleModeForSelection(
  arbitration: ExecutionArbitration,
  selected: IntelligenceLayer[],
  federationPressure?: FederatedExecutionPressure
): ExecutionScheduleMode {
  if (!arbitration.shouldRunCognition) {
    return "reflex-bypass";
  }
  if (selected.length === 0) {
    return "held";
  }
  if (selected.length === 1) {
    return "single-layer";
  }
  if (
    arbitration.governancePressure !== "clear" ||
    selected.some((layer) => layer.role === "guard")
  ) {
    return "guarded-swarm";
  }
  if (federationPressure?.pressure === "elevated") {
    return "swarm-sequential";
  }
  return "swarm-parallel";
}

function estimatedRoleDurationMs(layer: IntelligenceLayer): number {
  const statusMultiplier =
    layer.status === "ready"
      ? 0.9
      : layer.status === "busy"
        ? 1.3
        : 1.55;
  return roleLatencyMs(layer.role) * statusMultiplier;
}

function classifyBacklogPressure(score: number): GovernancePressureLevel {
  if (score >= 0.95) {
    return "critical";
  }
  if (score >= 0.45) {
    return "elevated";
  }
  return "clear";
}

function governancePressureRank(pressure: GovernancePressureLevel): number {
  return pressure === "critical" ? 2 : pressure === "elevated" ? 1 : 0;
}

function maxGovernancePressure(
  ...pressures: Array<GovernancePressureLevel | undefined>
): GovernancePressureLevel {
  const ranked = pressures
    .filter((pressure): pressure is GovernancePressureLevel => pressure !== undefined)
    .sort((left, right) => governancePressureRank(right) - governancePressureRank(left));
  return ranked[0] ?? "clear";
}

function buildAdmissionState(options: {
  shouldRunCognition: boolean;
  selectedCount: number;
  readyCount: number;
  busyCount: number;
  healthWeightedWidth: number;
  backlogPressure: GovernancePressureLevel;
  federationPressure?: FederatedExecutionPressure;
}): "admit" | "degrade" | "hold" {
  if (!options.shouldRunCognition) {
    return "admit";
  }
  if (options.selectedCount === 0 || options.healthWeightedWidth === 0) {
    return "hold";
  }
  if (options.backlogPressure === "critical" && options.readyCount === 0) {
    return "hold";
  }
  if (
    options.healthWeightedWidth < options.selectedCount ||
    options.busyCount > 0 ||
    options.backlogPressure !== "clear" ||
    options.federationPressure?.pressure === "critical"
  ) {
    return "degrade";
  }
  return "admit";
}

function estimateLatencyMs(
  selected: IntelligenceLayer[],
  governancePressure: GovernancePressureLevel,
  mode: ExecutionScheduleMode,
  federationPressure?: FederatedExecutionPressure,
  backlogScore = 0
): number {
  const nonGuardDurations = selected
    .filter((layer) => layer.role !== "guard")
    .map((layer) => estimatedRoleDurationMs(layer));
  const guardDuration = selected
    .filter((layer) => layer.role === "guard")
    .reduce((max, layer) => Math.max(max, estimatedRoleDurationMs(layer)), 0);
  const summedDuration = selected.reduce(
    (total, layer) => total + estimatedRoleDurationMs(layer),
    0
  );
  const parallelBatchDuration =
    nonGuardDurations.length > 0 ? Math.max(...nonGuardDurations) : 0;
  const base =
    mode === "guarded-swarm"
      ? parallelBatchDuration + guardDuration
      : mode === "swarm-parallel"
        ? parallelBatchDuration + guardDuration
        : mode === "swarm-sequential"
          ? summedDuration
        : summedDuration;
  const federationPenalty =
    typeof federationPressure?.crossNodeLatencyMs === "number"
      ? mode === "swarm-parallel"
        ? federationPressure.crossNodeLatencyMs
        : mode === "swarm-sequential"
          ? federationPressure.crossNodeLatencyMs * Math.max(1, selected.length - 1)
          : federationPressure.crossNodeLatencyMs * 0.35
      : 0;
  const governanceOverhead =
    governancePressure === "critical" ? 600 : governancePressure === "elevated" ? 260 : 80;
  const backlogPenalty =
    mode === "swarm-parallel"
      ? backlogScore * 180
      : mode === "guarded-swarm"
        ? backlogScore * 240
        : backlogScore * 320;
  return Number((base + governanceOverhead + federationPenalty + backlogPenalty).toFixed(2));
}

function estimateCost(selected: IntelligenceLayer[]): number {
  return Number(selected.reduce((total, layer) => total + roleCost(layer.role), 0).toFixed(2));
}

function executionTopologyForMode(
  mode: ExecutionScheduleMode,
  selected: IntelligenceLayer[]
): ExecutionTopology {
  const nonGuardWidth = selected.filter((layer) => layer.role !== "guard").length;
  if (mode === "guarded-swarm" && nonGuardWidth > 1) {
    return "parallel-then-guard";
  }
  if (mode === "swarm-parallel" && selected.length > 1) {
    return "parallel";
  }
  return "sequential";
}

function parallelWidthForTopology(
  topology: ExecutionTopology,
  selected: IntelligenceLayer[]
): number {
  if (topology === "parallel-then-guard") {
    return selected.filter((layer) => layer.role !== "guard").length;
  }
  if (topology === "parallel") {
    return selected.length;
  }
  return selected.length > 0 ? 1 : 0;
}

export function planExecutionSchedule(input: ExecutionSchedulePlanInput): ExecutionSchedulePlan {
  let preferredRoles = preferredScheduleRoles(input.arbitration);
  const signalQuality = clamp(input.snapshot.neuralCoupling.signalQuality);
  const dominantBand = input.snapshot.neuralCoupling.dominantBand;
  const sessionConversationMemory = input.sessionConversationMemory;
  const federatedPressure = input.federationPressure;
  const qDirective = input.qContext?.qRoutingDirective;
  const qGovernedLaneHealthy =
    qDirective === "primary-governed-local" ||
    (input.qContext?.preferredExecutionLane === "local-q" &&
      input.qContext?.readinessReady === true &&
      input.qContext?.gatewaySubstrateHealthy === true);
  const sessionBlockedVerdicts = sessionConversationMemory?.blockedVerdictCount ?? 0;
  const sessionApprovedVerdicts = sessionConversationMemory?.approvedVerdictCount ?? 0;
  if (sessionBlockedVerdicts >= 2 && input.arbitration.shouldRunCognition) {
    preferredRoles =
      qGovernedLaneHealthy && input.arbitration.governancePressure !== "critical"
        ? uniqueRoles([
            preferredRoles.find((role) => role !== "guard") ?? "reasoner",
            "mid",
            "reasoner",
            "guard"
          ])
        : uniqueRoles(["guard", "reasoner", ...preferredRoles]);
  } else if (sessionApprovedVerdicts >= 2 && input.arbitration.governancePressure === "clear") {
    preferredRoles = uniqueRoles([...preferredRoles, "mid"]);
  }
  const strongFastSignal =
    signalQuality >= 0.78 && (dominantBand === "beta" || dominantBand === "gamma");
  const weakSignal = signalQuality > 0 && signalQuality < 0.18;
  if (input.arbitration.shouldRunCognition && input.arbitration.mode !== "operator-override") {
    if (weakSignal) {
      preferredRoles = uniqueRoles([...preferredRoles, "guard"]);
    } else if (strongFastSignal && input.arbitration.governancePressure === "clear") {
      preferredRoles = preferredRoles.slice(0, Math.max(1, Math.min(2, preferredRoles.length)));
    }
  }
  if (federatedPressure?.pressure === "critical" && input.arbitration.mode !== "operator-override") {
    preferredRoles = preferredRoles.slice(0, 1);
  } else if (
    federatedPressure?.pressure === "elevated" &&
    input.arbitration.mode !== "operator-override"
  ) {
    preferredRoles = preferredRoles.slice(0, Math.max(2, Math.min(preferredRoles.length, 2)));
  }
  const adaptiveMaxWidth =
    input.maxWidth ??
    (input.arbitration.mode === "operator-override"
      ? Math.max(3, preferredRoles.length)
      : qGovernedLaneHealthy
        ? input.arbitration.governancePressure === "clear"
          ? Math.min(2, Math.max(2, preferredRoles.length))
          : Math.min(2, Math.max(1, preferredRoles.length))
      : federatedPressure?.pressure === "critical"
        ? 1
        : federatedPressure?.pressure === "elevated"
          ? Math.min(2, Math.max(1, preferredRoles.length))
      : weakSignal
        ? Math.max(2, preferredRoles.length)
        : strongFastSignal && input.arbitration.governancePressure === "clear"
          ? Math.max(1, Math.min(2, preferredRoles.length))
          : Math.max(3, preferredRoles.length));
  const qOnlyLayers = qGovernedLaneHealthy
    ? input.snapshot.intelligenceLayers.filter(
        (layer) => truthfulModelLabel(layer.model) === getQModelName()
      )
    : input.snapshot.intelligenceLayers;
  const selectableLayers = qOnlyLayers.length > 0 ? qOnlyLayers : input.snapshot.intelligenceLayers;
  const selectedLayers = selectLayers(
    selectableLayers,
    preferredRoles,
    input.requestedLayerId,
    adaptiveMaxWidth
  );
  const readyLayerCount = selectedLayers.filter((layer) => layer.status === "ready").length;
  const busyLayerCount = selectedLayers.filter((layer) => layer.status === "busy").length;
  const degradedLayerCount = selectedLayers.filter((layer) => layer.status === "degraded").length;
  const rawHealthWeightedWidth =
    selectedLayers.length === 0
      ? 0
      : Math.min(
          selectedLayers.length,
          Math.max(1, Math.floor(selectedLayers.reduce((total, layer) => total + layerHealthWeight(layer), 0)))
        );
  const backlogScore = Number(
    clamp(
      (selectedLayers.length > 0
        ? (busyLayerCount * 0.42 + degradedLayerCount * 0.96) / selectedLayers.length
        : 1) +
        (input.arbitration.governancePressure === "critical"
          ? 0.28
          : input.arbitration.governancePressure === "elevated"
            ? 0.12
            : 0) +
        (federatedPressure?.pressure === "critical"
          ? 0.28
          : federatedPressure?.pressure === "elevated"
            ? 0.14
            : 0) +
        Math.min(0.16, sessionBlockedVerdicts * 0.05),
      0,
      1.6
    ).toFixed(2)
  );
  const backlogPressure = maxGovernancePressure(
    classifyBacklogPressure(backlogScore),
    federatedPressure?.pressure
  );
  const admissionState =
    input.arbitration.shouldRunCognition && input.qContext && !qGovernedLaneHealthy
      ? "hold"
      : buildAdmissionState({
          shouldRunCognition: input.arbitration.shouldRunCognition,
          selectedCount: selectedLayers.length,
          readyCount: readyLayerCount,
          busyCount: busyLayerCount,
          healthWeightedWidth: rawHealthWeightedWidth,
          backlogPressure,
          federationPressure: federatedPressure
        });
  const qGovernedParallelFloor =
    qGovernedLaneHealthy &&
    input.arbitration.shouldRunCognition &&
    backlogPressure !== "critical" &&
    selectedLayers.length > 1 &&
    readyLayerCount >= 1
      ? Math.min(2, selectedLayers.length)
      : 1;
  const admittedLayers =
    admissionState === "hold"
      ? []
      : selectedLayers.slice(
          0,
          admissionState === "degrade"
            ? Math.max(
                qGovernedParallelFloor,
                Math.min(
                  selectedLayers.length,
                  backlogPressure === "critical" ? 1 : rawHealthWeightedWidth
                )
              )
            : selectedLayers.length
        );
  const mode = scheduleModeForSelection(input.arbitration, admittedLayers, federatedPressure);
  const executionTopology = executionTopologyForMode(mode, admittedLayers);
  const preliminaryParallelWidth = Math.min(
    parallelWidthForTopology(executionTopology, admittedLayers),
    Math.max(1, rawHealthWeightedWidth || admittedLayers.length || 1)
  );
  const primaryLayer = admittedLayers.at(-1);
  const layerRoles = admittedLayers.map((layer) => layer.role);
  const workerReliabilityFloor = Number(
    (
      (input.arbitration.shouldRunCognition ? 8 : 4) +
      (admittedLayers.length > 1 ? 3 : 0) +
      (backlogPressure === "critical" ? 8 : backlogPressure === "elevated" ? 4 : 0) +
      (federatedPressure?.pressure === "critical" ? 5 : federatedPressure?.pressure === "elevated" ? 2 : 0) +
      Math.min(3, busyLayerCount) +
      Math.min(4, degradedLayerCount * 2)
    ).toFixed(2)
  );
  const parallelFormation = buildParallelFormation({
    mode,
    executionTopology,
    admittedLayers,
    healthWeightedWidth: rawHealthWeightedWidth,
    backlogPressure,
    governancePressure: input.arbitration.governancePressure,
    workerReliabilityFloor,
    qGovernedLaneHealthy,
    signalQuality,
    sessionBlockedVerdictCount: sessionBlockedVerdicts,
    sessionApprovedVerdictCount: sessionApprovedVerdicts,
    federatedPressure
  });
  const parallelWidth = Math.min(
    preliminaryParallelWidth,
    Math.max(
      1,
      parallelFormation.localReplicaCount > 0
        ? parallelFormation.localReplicaCount
        : parallelFormation.horizontalReplicaCount || preliminaryParallelWidth || 1
    )
  );
  const estimatedLatencyMs = estimateLatencyMs(
    admittedLayers,
    input.arbitration.governancePressure,
    mode,
    federatedPressure,
    backlogScore
  );
  const estimatedCost = estimateCost(admittedLayers);
  const canDispatch =
    input.arbitration.shouldDispatchActuation &&
    (!input.arbitration.shouldRunCognition || admittedLayers.length > 0) &&
    admissionState !== "hold";
  const rationale = [
    `mode=${mode}`,
    `admission=${admissionState}`,
    `backlog=${backlogPressure}`,
    `backlogScore=${backlogScore.toFixed(2)}`,
    `topology=${executionTopology}`,
    `parallelWidth=${parallelWidth}`,
    `healthWeightedWidth=${rawHealthWeightedWidth}`,
    `width=${admittedLayers.length}`,
    `primary=${primaryLayer?.role ?? "none"}`,
    `roles=${layerRoles.join(">") || "none"}`,
    `ready=${readyLayerCount}`,
    `busy=${busyLayerCount}`,
    `degraded=${degradedLayerCount}`,
    `signal=${signalQuality.toFixed(2)}`,
    `band=${dominantBand}`,
    `governance=${input.arbitration.governancePressure}`,
    `federation=${federatedPressure?.pressure ?? "none"}`,
    `federationLatency=${typeof federatedPressure?.crossNodeLatencyMs === "number" ? federatedPressure.crossNodeLatencyMs.toFixed(2) : "none"}`,
    `federationSuccess=${typeof federatedPressure?.remoteSuccessRatio === "number" ? federatedPressure.remoteSuccessRatio.toFixed(2) : "none"}`,
    `formation=${parallelFormation.summary}`,
    `affinity=${parallelFormation.affinityMode}`,
    `deadline=${parallelFormation.deadlineClass}:${parallelFormation.deadlineBudgetMs}ms`,
    `backpressureAction=${parallelFormation.backpressureAction}`,
    `intentAlignment=${parallelFormation.intentAlignmentScore.toFixed(2)}`,
    `qDirective=${qDirective ?? "none"}`,
    `qLane=${qGovernedLaneHealthy ? `local-ready:${input.qContext?.trainingBundleId ?? "tracked"}` : input.qContext ? "hold" : "none"}`,
    `qCloud=${input.qContext ? `${input.qContext.cloudLaneReady ? "ready" : "blocked"}:${input.qContext.cloudLaneStatus ?? "unknown"}` : "none"}`,
    `qDiagnosis=${input.qContext?.mediationDiagnosticSummary ?? "none"}`,
    `sessionBlocked=${sessionBlockedVerdicts}`,
    `sessionApproved=${sessionApprovedVerdicts}`,
    `dispatch=${input.arbitration.shouldDispatchActuation ? "allow" : "hold"}`
  ].join(" / ");

  return {
    mode,
    executionTopology,
    parallelWidth,
    parallelFormationMode: parallelFormation.mode,
    verticalStageCount: parallelFormation.verticalStageCount,
    horizontalReplicaCount: parallelFormation.horizontalReplicaCount,
    localReplicaCount: parallelFormation.localReplicaCount,
    remoteReplicaCount: parallelFormation.remoteReplicaCount,
    verificationQuorum: parallelFormation.verificationQuorum,
    boundedRetryBudget: parallelFormation.boundedRetryBudget,
    capabilitySpreadCount: parallelFormation.capabilitySpreadCount,
    affinityMode: parallelFormation.affinityMode,
    deadlineClass: parallelFormation.deadlineClass,
    deadlineBudgetMs: parallelFormation.deadlineBudgetMs,
    backpressureAction: parallelFormation.backpressureAction,
    intentAlignmentScore: parallelFormation.intentAlignmentScore,
    parallelFormationSummary: parallelFormation.summary,
    admissionState,
    backlogPressure,
    backlogScore,
    healthWeightedWidth: rawHealthWeightedWidth,
    readyLayerCount,
    busyLayerCount,
    degradedLayerCount,
    workerReliabilityFloor,
    primaryLayerId: primaryLayer?.id,
    layerIds: admittedLayers.map((layer) => layer.id),
    layerRoles,
    shouldRunCognition: input.arbitration.shouldRunCognition && admittedLayers.length > 0,
    shouldDispatchActuation: canDispatch,
    decodeConfidence: input.arbitration.decodeConfidence,
    governancePressure: input.arbitration.governancePressure,
    federationPressure: federatedPressure?.pressure,
    federationObservedLatencyMs: federatedPressure?.crossNodeLatencyMs,
    federationRemoteSuccessRatio: federatedPressure?.remoteSuccessRatio,
    estimatedLatencyMs,
    estimatedCost,
    objective: input.arbitration.objective,
    rationale
  };
}

export function buildExecutionScheduleDecision(options: {
  arbitration: ExecutionArbitration;
  plan: ExecutionSchedulePlan;
  selectedAt?: string;
}): ExecutionSchedule {
  const selectedAt = options.selectedAt ?? new Date().toISOString();

  return {
    id: `sch-${hashValue(`${options.arbitration.id}:${selectedAt}:${options.plan.mode}:${options.plan.layerIds.join(",")}:${options.plan.objective}`)}`,
    sessionId: options.arbitration.sessionId,
    source: options.arbitration.source,
    arbitrationId: options.arbitration.id,
    mode: options.plan.mode,
    executionTopology: options.plan.executionTopology,
    parallelWidth: options.plan.parallelWidth,
    parallelFormationMode: options.plan.parallelFormationMode,
    verticalStageCount: options.plan.verticalStageCount,
    horizontalReplicaCount: options.plan.horizontalReplicaCount,
    localReplicaCount: options.plan.localReplicaCount,
    remoteReplicaCount: options.plan.remoteReplicaCount,
    verificationQuorum: options.plan.verificationQuorum,
    boundedRetryBudget: options.plan.boundedRetryBudget,
    capabilitySpreadCount: options.plan.capabilitySpreadCount,
    affinityMode: options.plan.affinityMode,
    deadlineClass: options.plan.deadlineClass,
    deadlineBudgetMs: options.plan.deadlineBudgetMs,
    backpressureAction: options.plan.backpressureAction,
    intentAlignmentScore: options.plan.intentAlignmentScore,
    parallelFormationSummary: options.plan.parallelFormationSummary,
    admissionState: options.plan.admissionState,
    backlogPressure: options.plan.backlogPressure,
    backlogScore: options.plan.backlogScore,
    healthWeightedWidth: options.plan.healthWeightedWidth,
    readyLayerCount: options.plan.readyLayerCount,
    busyLayerCount: options.plan.busyLayerCount,
    degradedLayerCount: options.plan.degradedLayerCount,
    workerReliabilityFloor: options.plan.workerReliabilityFloor,
    primaryLayerId: options.plan.primaryLayerId,
    layerIds: options.plan.layerIds,
    layerRoles: options.plan.layerRoles,
    shouldRunCognition: options.plan.shouldRunCognition,
    shouldDispatchActuation: options.plan.shouldDispatchActuation,
    decodeConfidence: options.plan.decodeConfidence,
    governancePressure: options.plan.governancePressure,
    federationPressure: options.plan.federationPressure,
    federationObservedLatencyMs: options.plan.federationObservedLatencyMs,
    federationRemoteSuccessRatio: options.plan.federationRemoteSuccessRatio,
    estimatedLatencyMs: options.plan.estimatedLatencyMs,
    estimatedCost: options.plan.estimatedCost,
    objective: options.plan.objective,
    rationale: options.plan.rationale,
    selectedAt
  };
}
