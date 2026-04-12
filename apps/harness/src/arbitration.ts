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
import type { GovernanceDecision, GovernanceStatus } from "./governance.js";
import { deriveGovernancePressure } from "./routing.js";
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
  decodeConfidence: number;
  objective: string;
  rationale: string;
};

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

export function planExecutionArbitration(
  input: ExecutionArbitrationPlanInput
): ExecutionArbitrationPlan {
  const frame = input.frame ?? input.snapshot.neuroFrames[0];
  const execution = input.execution ?? input.snapshot.cognitiveExecutions[0];
  const governancePressure = deriveGovernancePressure(
    input.consentScope,
    input.governanceStatus,
    input.governanceDecisions
  );
  const decodeConfidence = frame?.decodeConfidence ?? 0;
  const explicitRequestedLayer = input.requestedLayerId
    ? selectLayer(
    input.snapshot.intelligenceLayers,
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
      ? selectLayer(input.snapshot.intelligenceLayers, undefined, ["guard", "reasoner", "mid", "soul"])
      : governancePressure === "elevated"
        ? selectLayer(input.snapshot.intelligenceLayers, undefined, ["reasoner", "mid", "soul", "guard"])
        : selectLayer(input.snapshot.intelligenceLayers, undefined, ["mid", "reasoner", "soul", "guard"]));

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
  } else if (
    !frame?.decodeReady ||
    decodeConfidence < 0.82 ||
    governancePressure === "elevated" ||
    execution?.status === "failed"
  ) {
    if (preferredLayer) {
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

  const objective = input.objective?.trim() || defaultObjective(mode, frame, governancePressure);
  const rationale = [
    `mode=${mode}`,
    `decode=${decodeConfidence.toFixed(2)}`,
    `governance=${governancePressure}`,
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
    objective: options.plan.objective,
    rationale: options.plan.rationale,
    selectedAt
  };
}
