import type {
  ExecutionArbitration,
  ExecutionSchedule,
  ExecutionScheduleMode,
  ExecutionTopology,
  GovernancePressureLevel,
  IntelligenceLayer,
  IntelligenceLayerRole,
  PhaseSnapshot
} from "@immaculate/core";
import type { FederatedExecutionPressure } from "./federation-pressure.js";
import type { SessionConversationMemory } from "./conversation.js";
import { hashValue } from "./utils.js";

type ExecutionSchedulePlanInput = {
  snapshot: PhaseSnapshot;
  arbitration: ExecutionArbitration;
  requestedLayerId?: string;
  maxWidth?: number;
  sessionConversationMemory?: SessionConversationMemory;
  federationPressure?: FederatedExecutionPressure;
};

export type ExecutionSchedulePlan = {
  mode: ExecutionScheduleMode;
  executionTopology: ExecutionTopology;
  parallelWidth: number;
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

function estimateLatencyMs(
  selected: IntelligenceLayer[],
  governancePressure: GovernancePressureLevel,
  mode: ExecutionScheduleMode,
  federationPressure?: FederatedExecutionPressure
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
  return Number((base + governanceOverhead + federationPenalty).toFixed(2));
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
  const sessionBlockedVerdicts = sessionConversationMemory?.blockedVerdictCount ?? 0;
  const sessionApprovedVerdicts = sessionConversationMemory?.approvedVerdictCount ?? 0;
  if (sessionBlockedVerdicts >= 2 && input.arbitration.shouldRunCognition) {
    preferredRoles = uniqueRoles(["guard", "reasoner", ...preferredRoles]);
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
      : federatedPressure?.pressure === "critical"
        ? 1
        : federatedPressure?.pressure === "elevated"
          ? Math.min(2, Math.max(1, preferredRoles.length))
      : weakSignal
        ? Math.max(2, preferredRoles.length)
        : strongFastSignal && input.arbitration.governancePressure === "clear"
          ? Math.max(1, Math.min(2, preferredRoles.length))
          : Math.max(3, preferredRoles.length));
  const selectedLayers = selectLayers(
    input.snapshot.intelligenceLayers,
    preferredRoles,
    input.requestedLayerId,
    adaptiveMaxWidth
  );
  const mode = scheduleModeForSelection(input.arbitration, selectedLayers, federatedPressure);
  const executionTopology = executionTopologyForMode(mode, selectedLayers);
  const parallelWidth = parallelWidthForTopology(executionTopology, selectedLayers);
  const primaryLayer = selectedLayers.at(-1);
  const layerRoles = selectedLayers.map((layer) => layer.role);
  const estimatedLatencyMs = estimateLatencyMs(
    selectedLayers,
    input.arbitration.governancePressure,
    mode,
    federatedPressure
  );
  const estimatedCost = estimateCost(selectedLayers);
  const canDispatch =
    input.arbitration.shouldDispatchActuation &&
    (!input.arbitration.shouldRunCognition || selectedLayers.length > 0);
  const rationale = [
    `mode=${mode}`,
    `topology=${executionTopology}`,
    `parallelWidth=${parallelWidth}`,
    `width=${selectedLayers.length}`,
    `primary=${primaryLayer?.role ?? "none"}`,
    `roles=${layerRoles.join(">") || "none"}`,
    `signal=${signalQuality.toFixed(2)}`,
    `band=${dominantBand}`,
    `governance=${input.arbitration.governancePressure}`,
    `federation=${federatedPressure?.pressure ?? "none"}`,
    `federationLatency=${typeof federatedPressure?.crossNodeLatencyMs === "number" ? federatedPressure.crossNodeLatencyMs.toFixed(2) : "none"}`,
    `federationSuccess=${typeof federatedPressure?.remoteSuccessRatio === "number" ? federatedPressure.remoteSuccessRatio.toFixed(2) : "none"}`,
    `sessionBlocked=${sessionBlockedVerdicts}`,
    `sessionApproved=${sessionApprovedVerdicts}`,
    `dispatch=${input.arbitration.shouldDispatchActuation ? "allow" : "hold"}`
  ].join(" / ");

  return {
    mode,
    executionTopology,
    parallelWidth,
    primaryLayerId: primaryLayer?.id,
    layerIds: selectedLayers.map((layer) => layer.id),
    layerRoles,
    shouldRunCognition: input.arbitration.shouldRunCognition && selectedLayers.length > 0,
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
