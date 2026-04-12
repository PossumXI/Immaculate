import type {
  ExecutionArbitration,
  ExecutionSchedule,
  ExecutionScheduleMode,
  GovernancePressureLevel,
  IntelligenceLayer,
  IntelligenceLayerRole,
  PhaseSnapshot
} from "@immaculate/core";
import type { SessionConversationMemory } from "./conversation.js";
import { hashValue } from "./utils.js";

type ExecutionSchedulePlanInput = {
  snapshot: PhaseSnapshot;
  arbitration: ExecutionArbitration;
  requestedLayerId?: string;
  maxWidth?: number;
  sessionConversationMemory?: SessionConversationMemory;
};

export type ExecutionSchedulePlan = {
  mode: ExecutionScheduleMode;
  primaryLayerId?: string;
  layerIds: string[];
  layerRoles: IntelligenceLayerRole[];
  shouldRunCognition: boolean;
  shouldDispatchActuation: boolean;
  decodeConfidence: number;
  governancePressure: GovernancePressureLevel;
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
  selected: IntelligenceLayer[]
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
  return "swarm-sequential";
}

function estimateLatencyMs(selected: IntelligenceLayer[], governancePressure: GovernancePressureLevel): number {
  const base = selected.reduce((total, layer) => {
    const statusMultiplier =
      layer.status === "ready"
        ? 0.9
        : layer.status === "busy"
          ? 1.3
          : 1.55;
    return total + roleLatencyMs(layer.role) * statusMultiplier;
  }, 0);
  const governanceOverhead =
    governancePressure === "critical" ? 600 : governancePressure === "elevated" ? 260 : 80;
  return Number((base + governanceOverhead).toFixed(2));
}

function estimateCost(selected: IntelligenceLayer[]): number {
  return Number(selected.reduce((total, layer) => total + roleCost(layer.role), 0).toFixed(2));
}

export function planExecutionSchedule(input: ExecutionSchedulePlanInput): ExecutionSchedulePlan {
  let preferredRoles = preferredScheduleRoles(input.arbitration);
  const signalQuality = clamp(input.snapshot.neuralCoupling.signalQuality);
  const dominantBand = input.snapshot.neuralCoupling.dominantBand;
  const sessionConversationMemory = input.sessionConversationMemory;
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
  const adaptiveMaxWidth =
    input.maxWidth ??
    (input.arbitration.mode === "operator-override"
      ? Math.max(3, preferredRoles.length)
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
  const mode = scheduleModeForSelection(input.arbitration, selectedLayers);
  const primaryLayer = selectedLayers.at(-1);
  const layerRoles = selectedLayers.map((layer) => layer.role);
  const estimatedLatencyMs = estimateLatencyMs(selectedLayers, input.arbitration.governancePressure);
  const estimatedCost = estimateCost(selectedLayers);
  const canDispatch =
    input.arbitration.shouldDispatchActuation &&
    (!input.arbitration.shouldRunCognition || selectedLayers.length > 0);
  const rationale = [
    `mode=${mode}`,
    `width=${selectedLayers.length}`,
    `primary=${primaryLayer?.role ?? "none"}`,
    `roles=${layerRoles.join(">") || "none"}`,
    `signal=${signalQuality.toFixed(2)}`,
    `band=${dominantBand}`,
    `governance=${input.arbitration.governancePressure}`,
    `sessionBlocked=${sessionBlockedVerdicts}`,
    `sessionApproved=${sessionApprovedVerdicts}`,
    `dispatch=${input.arbitration.shouldDispatchActuation ? "allow" : "hold"}`
  ].join(" / ");

  return {
    mode,
    primaryLayerId: primaryLayer?.id,
    layerIds: selectedLayers.map((layer) => layer.id),
    layerRoles,
    shouldRunCognition: input.arbitration.shouldRunCognition && selectedLayers.length > 0,
    shouldDispatchActuation: canDispatch,
    decodeConfidence: input.arbitration.decodeConfidence,
    governancePressure: input.arbitration.governancePressure,
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
    primaryLayerId: options.plan.primaryLayerId,
    layerIds: options.plan.layerIds,
    layerRoles: options.plan.layerRoles,
    shouldRunCognition: options.plan.shouldRunCognition,
    shouldDispatchActuation: options.plan.shouldDispatchActuation,
    decodeConfidence: options.plan.decodeConfidence,
    governancePressure: options.plan.governancePressure,
    estimatedLatencyMs: options.plan.estimatedLatencyMs,
    estimatedCost: options.plan.estimatedCost,
    objective: options.plan.objective,
    rationale: options.plan.rationale,
    selectedAt
  };
}
