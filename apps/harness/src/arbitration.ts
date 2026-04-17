import type {
  ExecutionArbitration,
  ExecutionArbitrationMode,
  GovernancePressureLevel,
  IntelligenceLayer,
  IntelligenceLayerRole,
  NeuroFrameWindow,
  OrchestrationPlane,
  PhaseSnapshot,
  RoutingDecisionSource,
  RoutingDecisionMode,
  CognitiveExecution
} from "@immaculate/core";
import { STABILITY_POLE } from "@immaculate/core";
import type { FederatedExecutionPressure } from "./federation-pressure.js";
import type { GovernanceDecision, GovernanceStatus } from "./governance.js";
import type { QOrchestrationContext } from "./q-orchestration-context.js";
import type { SessionConversationMemory } from "./conversation.js";
import { deriveGovernancePressure } from "./routing.js";
import { getQModelName, truthfulModelLabel } from "./q-model.js";
import { hashValue } from "./utils.js";

type ExecutionArbitrationPlanInput = {
  snapshot: PhaseSnapshot;
  frame?: NeuroFrameWindow;
  execution?: CognitiveExecution;
  governanceStatus: GovernanceStatus;
  governanceDecisions: GovernanceDecision[];
  consentScope?: string;
  objective?: string;
  requestedLayerId?: string;
  forceCognition?: boolean;
  suppressed?: boolean;
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
  >;
};

export type ExecutionArbitrationPlan = {
  mode: ExecutionArbitrationMode;
  targetNodeId: string;
  targetPlane: OrchestrationPlane;
  preferredLayerId?: string;
  preferredLayerRole?: IntelligenceLayerRole;
  shouldRunCognition: boolean;
  shouldDispatchActuation: boolean;
  routeModeHint: RoutingDecisionMode;
  governancePressure: GovernancePressureLevel;
  federationPressure?: GovernancePressureLevel;
  federationObservedLatencyMs?: number;
  federationRemoteSuccessRatio?: number;
  decodeConfidence: number;
  objective: string;
  rationale: string;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function layerStatusRank(layer: IntelligenceLayer): number {
  return layer.status === "ready" ? 0 : layer.status === "busy" ? 1 : 2;
}

function selectLayer(
  layers: IntelligenceLayer[],
  requestedLayerId?: string,
  preferredRoles?: IntelligenceLayerRole[]
): IntelligenceLayer | undefined {
  if (requestedLayerId) {
    return layers.find((layer) => layer.id === requestedLayerId);
  }

  if (preferredRoles && preferredRoles.length > 0) {
    for (const role of preferredRoles) {
      const match = [...layers]
        .filter((layer) => layer.role === role)
        .sort((left, right) => layerStatusRank(left) - layerStatusRank(right))
        .at(0);
      if (match) {
        return match;
      }
    }
  }

  return [...layers].sort((left, right) => layerStatusRank(left) - layerStatusRank(right)).at(0);
}

function defaultObjective(
  mode: ExecutionArbitrationMode,
  frame: NeuroFrameWindow | undefined,
  governancePressure: GovernancePressureLevel
): string {
  if (mode === "guarded-review" || mode === "suppressed") {
    return `Review and hold outward action under ${governancePressure} governance pressure.`;
  }
  if (mode === "cognitive-escalation" || mode === "operator-override") {
    return `Interpret live state and produce a bounded route/reason/commit response before feedback dispatch.`;
  }
  if (frame?.decodeReady) {
    return `Stabilize reflex-local feedback from decode confidence ${(frame.decodeConfidence * 100).toFixed(1)}%.`;
  }
  return "Stabilize live orchestration with bounded reflex feedback.";
}

function inferArbitrationSource(
  consentScope: string | undefined,
  frame: NeuroFrameWindow | undefined,
  execution: CognitiveExecution | undefined,
  requestedLayerId: string | undefined
): RoutingDecisionSource {
  if (consentScope === "system:benchmark") {
    return "benchmark";
  }
  if (requestedLayerId) {
    return "operator";
  }
  if (execution) {
    return "cognitive";
  }
  if (frame) {
    return "neuro";
  }
  return "operator";
}

function resolveArbitrationSignal(snapshot: PhaseSnapshot, frame?: NeuroFrameWindow): {
  signalQuality: number;
  dominantBand: string;
  artifactRatio: number;
  directBandSignal: boolean;
  currentFrameCoupling: boolean;
} {
  const bandPower = frame?.bandPower;
  const totalPower = bandPower?.totalPower ?? 0;
  const artifactRatio =
    totalPower > 0
      ? clamp((bandPower?.artifactPower ?? 0) / totalPower, 0, 1)
      : clamp(snapshot.neuralCoupling.artifactRatio, 0, 1);
  const directBandSignal = Boolean(bandPower);
  const currentFrameCoupling = snapshot.neuralCoupling.sourceFrameId === frame?.id;
  const directSignalQuality = bandPower
    ? clamp(
        bandPower.dominantRatio * 0.42 +
          (frame?.decodeConfidence ?? snapshot.neuralCoupling.decodeConfidence) * 0.28 +
          (1 - artifactRatio) * 0.2 -
          artifactRatio * 0.48,
        0,
        1
      )
    : snapshot.neuralCoupling.signalQuality;

  return {
    signalQuality: bandPower
      ? clamp(
          directSignalQuality * 0.82 +
            snapshot.neuralCoupling.signalQuality * 0.18 -
            artifactRatio * 0.16,
          0,
          1
        )
      : snapshot.neuralCoupling.signalQuality,
    dominantBand: bandPower?.dominantBand ?? snapshot.neuralCoupling.dominantBand,
    artifactRatio,
    directBandSignal,
    currentFrameCoupling
  };
}

export function planExecutionArbitration(
  input: ExecutionArbitrationPlanInput
): ExecutionArbitrationPlan {
  const frame = input.frame ?? input.snapshot.neuroFrames[0];
  const execution = input.execution ?? input.snapshot.cognitiveExecutions[0];
  let governancePressure = deriveGovernancePressure(
    input.consentScope,
    input.governanceStatus,
    input.governanceDecisions
  );
  const sessionConversationMemory = input.sessionConversationMemory;
  const sessionBlockedVerdicts = sessionConversationMemory?.blockedVerdictCount ?? 0;
  const sessionApprovedVerdicts = sessionConversationMemory?.approvedVerdictCount ?? 0;
  const federatedPressure = input.federationPressure;
  const qDirective = input.qContext?.qRoutingDirective;
  const qGovernedLaneHealthy =
    qDirective === "primary-governed-local" ||
    (input.qContext?.preferredExecutionLane === "local-q" &&
      input.qContext?.readinessReady === true &&
      input.qContext?.gatewaySubstrateHealthy === true);
  const qNeedsGuardedHold =
    qDirective === "guarded-hold" ||
    (Boolean(input.qContext) &&
      !qGovernedLaneHealthy &&
      (!input.qContext?.readinessReady || !input.qContext?.gatewaySubstrateHealthy));
  const preserveGovernedLocalCognition =
    qGovernedLaneHealthy &&
    !qNeedsGuardedHold &&
    sessionBlockedVerdicts >= 2 &&
    governancePressure !== "critical";
  if (sessionBlockedVerdicts >= 3 && governancePressure === "clear") {
    governancePressure = "elevated";
  } else if (sessionBlockedVerdicts >= 2 && governancePressure !== "critical") {
    governancePressure = governancePressure === "clear" ? "elevated" : governancePressure;
  }
  const decodeConfidence = frame?.decodeConfidence ?? 0;
  const spectralSignal = resolveArbitrationSignal(input.snapshot, frame);
  const activeSpectralSignal =
    spectralSignal.directBandSignal || spectralSignal.currentFrameCoupling;
  const strongSpectralReflexSignal =
    Boolean(frame?.decodeReady) &&
    activeSpectralSignal &&
    governancePressure === "clear" &&
    spectralSignal.signalQuality >= 0.78 &&
    spectralSignal.artifactRatio <= 0.18 &&
    (spectralSignal.dominantBand === "beta" || spectralSignal.dominantBand === "gamma");
  const weakSpectralSignal =
    activeSpectralSignal && spectralSignal.signalQuality < 0.18;
  const qOnlyLayers = qGovernedLaneHealthy
    ? input.snapshot.intelligenceLayers.filter(
        (layer) => truthfulModelLabel(layer.model) === getQModelName()
      )
    : input.snapshot.intelligenceLayers;
  const arbitrationLayers = qOnlyLayers.length > 0 ? qOnlyLayers : input.snapshot.intelligenceLayers;
  const explicitRequestedLayer = input.requestedLayerId
    ? selectLayer(
        arbitrationLayers,
        input.requestedLayerId
      )
    : undefined;

  let mode: ExecutionArbitrationMode;
  let targetNodeId: string;
  let targetPlane: OrchestrationPlane;
  let shouldRunCognition: boolean;
  let shouldDispatchActuation: boolean;
  let routeModeHint: RoutingDecisionMode;
  let preferredLayer =
    explicitRequestedLayer ??
    (governancePressure === "critical"
      ? selectLayer(arbitrationLayers, undefined, ["guard", "reasoner", "mid", "soul"])
      : governancePressure === "elevated"
        ? selectLayer(arbitrationLayers, undefined, ["reasoner", "mid", "soul", "guard"])
        : selectLayer(arbitrationLayers, undefined, ["mid", "reasoner", "soul", "guard"]));

  if (input.suppressed) {
    mode = "suppressed";
    targetNodeId = "integrity-gate";
    targetPlane = "cognitive";
    shouldRunCognition = false;
    shouldDispatchActuation = false;
    routeModeHint = "suppressed";
  } else if (input.forceCognition || explicitRequestedLayer) {
    mode = "operator-override";
    targetNodeId = "planner-swarm";
    targetPlane = "cognitive";
    shouldRunCognition = true;
    shouldDispatchActuation = true;
    routeModeHint = "cognitive-assisted";
    preferredLayer ??= explicitRequestedLayer;
  } else if (governancePressure === "critical") {
    mode = "guarded-review";
    targetNodeId = "integrity-gate";
    targetPlane = "cognitive";
    shouldRunCognition = Boolean(preferredLayer);
    shouldDispatchActuation = false;
    routeModeHint = "suppressed";
  } else if (weakSpectralSignal) {
    mode = "guarded-review";
    targetNodeId = "integrity-gate";
    targetPlane = "cognitive";
    shouldRunCognition = Boolean(preferredLayer);
    shouldDispatchActuation = false;
    routeModeHint = "suppressed";
  } else if (strongSpectralReflexSignal) {
    mode = "reflex-local";
    targetNodeId = "router-core";
    targetPlane = "reflex";
    shouldRunCognition = false;
    shouldDispatchActuation = true;
    routeModeHint = "reflex-direct";
  } else if (
    !frame?.decodeReady ||
    decodeConfidence < STABILITY_POLE ||
    governancePressure === "elevated" ||
    execution?.status === "failed"
  ) {
    if (preferredLayer && !qNeedsGuardedHold) {
      mode = "cognitive-escalation";
      targetNodeId = "planner-swarm";
      targetPlane = "cognitive";
      shouldRunCognition = true;
      shouldDispatchActuation = true;
      routeModeHint = "cognitive-assisted";
    } else {
      mode = "guarded-review";
      targetNodeId = "integrity-gate";
      targetPlane = "cognitive";
      shouldRunCognition = false;
      shouldDispatchActuation = false;
      routeModeHint = "suppressed";
    }
  } else {
    mode = "reflex-local";
    targetNodeId = "router-core";
    targetPlane = "reflex";
    shouldRunCognition = false;
    shouldDispatchActuation = true;
    routeModeHint = "reflex-direct";
  }

  if (
    sessionBlockedVerdicts >= 2 &&
    mode !== "suppressed" &&
    mode !== "operator-override" &&
    !preserveGovernedLocalCognition
  ) {
    mode = "guarded-review";
    targetNodeId = "integrity-gate";
    targetPlane = "cognitive";
    shouldRunCognition = Boolean(preferredLayer);
    shouldDispatchActuation = false;
    routeModeHint = "suppressed";
  }

  if (
    mode === "cognitive-escalation" &&
    federatedPressure?.pressure === "critical" &&
    preferredLayer
  ) {
    mode = "guarded-review";
    targetNodeId = "integrity-gate";
    targetPlane = "cognitive";
    shouldRunCognition = true;
    shouldDispatchActuation = false;
    routeModeHint = "suppressed";
  } else if (
    mode === "cognitive-escalation" &&
    federatedPressure?.pressure === "elevated"
  ) {
    routeModeHint = preserveGovernedLocalCognition ? "cognitive-assisted" : "guarded-fallback";
  }

  const objective = input.objective?.trim() || defaultObjective(mode, frame, governancePressure);
  const rationale = [
    `mode=${mode}`,
    `decode=${decodeConfidence.toFixed(2)}`,
    `signal=${spectralSignal.signalQuality.toFixed(2)}`,
    `band=${spectralSignal.dominantBand}`,
    `artifact=${spectralSignal.artifactRatio.toFixed(2)}`,
    `governance=${governancePressure}`,
    `federation=${federatedPressure?.pressure ?? "none"}`,
    `federationLatency=${typeof federatedPressure?.crossNodeLatencyMs === "number" ? federatedPressure.crossNodeLatencyMs.toFixed(2) : "none"}`,
    `federationSuccess=${typeof federatedPressure?.remoteSuccessRatio === "number" ? federatedPressure.remoteSuccessRatio.toFixed(2) : "none"}`,
    `qDirective=${qDirective ?? "none"}`,
    `qLane=${qGovernedLaneHealthy ? `local-ready:${input.qContext?.trainingBundleId ?? "tracked"}` : input.qContext ? "hold" : "none"}`,
    `qCloud=${input.qContext ? `${input.qContext.cloudLaneReady ? "ready" : "blocked"}:${input.qContext.cloudLaneStatus ?? "unknown"}` : "none"}`,
    `sessionBlocked=${sessionBlockedVerdicts}`,
    `sessionApproved=${sessionApprovedVerdicts}`,
    `cognition=${shouldRunCognition ? "run" : "skip"}`,
    `dispatch=${shouldDispatchActuation ? "allow" : "hold"}`,
    `layer=${preferredLayer?.role ?? "none"}`
  ].join(" / ");

  return {
    mode,
    targetNodeId,
    targetPlane,
    preferredLayerId: preferredLayer?.id,
    preferredLayerRole: preferredLayer?.role,
    shouldRunCognition,
    shouldDispatchActuation,
    routeModeHint,
    governancePressure,
    federationPressure: federatedPressure?.pressure,
    federationObservedLatencyMs: federatedPressure?.crossNodeLatencyMs,
    federationRemoteSuccessRatio: federatedPressure?.remoteSuccessRatio,
    decodeConfidence,
    objective,
    rationale
  };
}

export function buildExecutionArbitrationDecision(options: {
  plan: ExecutionArbitrationPlan;
  consentScope?: string;
  frame?: NeuroFrameWindow;
  execution?: CognitiveExecution;
  requestedLayerId?: string;
  selectedAt?: string;
}): ExecutionArbitration {
  const selectedAt = options.selectedAt ?? new Date().toISOString();
  const source = inferArbitrationSource(
    options.consentScope,
    options.frame,
    options.execution,
    options.requestedLayerId
  );
  const sessionId = options.frame?.sessionId;

  return {
    id: `arb-${hashValue(`${sessionId ?? "global"}:${selectedAt}:${options.plan.mode}:${options.plan.targetNodeId}:${options.plan.objective}`)}`,
    sessionId,
    source,
    mode: options.plan.mode,
    targetNodeId: options.plan.targetNodeId,
    targetPlane: options.plan.targetPlane,
    preferredLayerId: options.plan.preferredLayerId,
    preferredLayerRole: options.plan.preferredLayerRole,
    shouldRunCognition: options.plan.shouldRunCognition,
    shouldDispatchActuation: options.plan.shouldDispatchActuation,
    routeModeHint: options.plan.routeModeHint,
    decodeConfidence: options.plan.decodeConfidence,
    governancePressure: options.plan.governancePressure,
    federationPressure: options.plan.federationPressure,
    federationObservedLatencyMs: options.plan.federationObservedLatencyMs,
    federationRemoteSuccessRatio: options.plan.federationRemoteSuccessRatio,
    objective: options.plan.objective,
    rationale: options.plan.rationale,
    selectedAt
  };
}
