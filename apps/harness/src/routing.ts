import type {
  ActuationChannel,
  ActuationOutput,
  CognitiveExecution,
  NeuroFrameWindow,
  NeuralCouplingState,
  PhaseSnapshot,
  RoutingDecision,
  RoutingDecisionMode,
  GovernancePressureLevel
} from "@immaculate/core";
import { STABILITY_POLE } from "@immaculate/core";
import type {
  ActuationAdapterState,
  ActuationDelivery,
  ActuationTransportState
} from "./actuation.js";
import type { FederatedExecutionPressure } from "./federation-pressure.js";
import type { GovernanceDecision, GovernanceStatus } from "./governance.js";
import type { QOrchestrationContext } from "./q-orchestration-context.js";
import { hashValue } from "./utils.js";

type AdaptiveRoutePlanInput = {
  snapshot: PhaseSnapshot;
  frame?: NeuroFrameWindow;
  execution?: CognitiveExecution;
  cognitiveRouteSuggestion?: string;
  neuralBandPower?: NeuroFrameWindow["bandPower"];
  neuralCoupling?: NeuralCouplingState;
  federationPressure?: FederatedExecutionPressure;
  adapters: ActuationAdapterState[];
  transports: ActuationTransportState[];
  governanceStatus: GovernanceStatus;
  governanceDecisions: GovernanceDecision[];
  consentScope?: string;
  requestedAdapterId?: string;
  requestedChannel?: ActuationChannel;
  requestedTargetNodeId?: string;
  requestedIntensity?: number;
  suppressed?: boolean;
  qContext?: Pick<
    QOrchestrationContext,
    | "readinessReady"
    | "gatewaySubstrateHealthy"
    | "preferredExecutionLane"
    | "trainingBundleId"
    | "cloudLaneReady"
    | "cloudLaneStatus"
    | "qRoutingDirective"
  >;
};

export type AdaptiveRoutePlan = {
  mode: RoutingDecisionMode;
  channel: ActuationChannel;
  targetNodeId: string;
  recommendedAdapterId?: string;
  recommendedIntensity: number;
  governancePressure: GovernancePressureLevel;
  federationPressure?: GovernancePressureLevel;
  federationObservedLatencyMs?: number;
  federationRemoteSuccessRatio?: number;
  selectedTransport?: ActuationTransportState;
  rationale: string;
};

type RouteHint = "reflex" | "cognitive" | "guarded" | "suppressed";

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRouteHint(value: string | undefined): RouteHint | undefined {
  const candidate = (value ?? "").trim().toLowerCase();
  if (
    candidate === "reflex" ||
    candidate === "cognitive" ||
    candidate === "guarded" ||
    candidate === "suppressed"
  ) {
    return candidate;
  }
  return undefined;
}

function recentDeniedCount(decisions: GovernanceDecision[]): number {
  const windowStart = Date.now() - 5 * 60 * 1000;
  return decisions.filter(
    (decision) => !decision.allowed && Date.parse(decision.timestamp) >= windowStart
  ).length;
}

export function deriveGovernancePressure(
  consentScope: string | undefined,
  status: GovernanceStatus,
  decisions: GovernanceDecision[]
): GovernancePressureLevel {
  let pressure = 0;
  if (consentScope?.startsWith("subject:")) {
    pressure += 2;
  } else if (consentScope?.startsWith("session:")) {
    pressure += 1;
  }

  if (status.deniedCount >= 3) {
    pressure += 1;
  }

  pressure += Math.min(2, recentDeniedCount(decisions));

  if (pressure >= 3) {
    return "critical";
  }
  if (pressure >= 1) {
    return "elevated";
  }
  return "clear";
}

function transportBlocked(transport: ActuationTransportState): boolean {
  return (
    !transport.enabled ||
    transport.isolationActive ||
    transport.health === "isolated" ||
    transport.health === "faulted" ||
    (transport.heartbeatRequired && !transport.lastHeartbeatAt) ||
    transport.capabilityHealth.some((entry) => entry.status === "missing")
  );
}

function adaptersById(adapters: ActuationAdapterState[]): Map<string, ActuationAdapterState> {
  return new Map(adapters.map((adapter) => [adapter.id, adapter]));
}

function filterChannelTransports(
  channel: ActuationChannel,
  transports: ActuationTransportState[],
  adapterLookup: Map<string, ActuationAdapterState>
): ActuationTransportState[] {
  return transports.filter((transport) => adapterLookup.get(transport.adapterId)?.channel === channel);
}

function preferredTransport(
  channel: ActuationChannel,
  transports: ActuationTransportState[],
  adapterLookup: Map<string, ActuationAdapterState>,
  requestedAdapterId?: string
): ActuationTransportState | undefined {
  const candidates = filterChannelTransports(channel, transports, adapterLookup).filter(
    (transport) => !transportBlocked(transport)
  ).sort((left, right) => {
    const scoreDelta = (right.preferenceScore ?? 0) - (left.preferenceScore ?? 0);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const rankDelta = (left.preferenceRank ?? Number.MAX_SAFE_INTEGER) - (right.preferenceRank ?? Number.MAX_SAFE_INTEGER);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return left.id.localeCompare(right.id);
  });
  if (requestedAdapterId) {
    return candidates.find((transport) => transport.adapterId === requestedAdapterId) ?? candidates[0];
  }
  return candidates[0];
}

function adapterForChannel(
  channel: ActuationChannel,
  adapters: ActuationAdapterState[],
  transports: ActuationTransportState[],
  requestedAdapterId?: string
): string | undefined {
  const adapterLookup = adaptersById(adapters);
  if (requestedAdapterId && adapterLookup.get(requestedAdapterId)?.channel === channel) {
    return requestedAdapterId;
  }
  return (
    preferredTransport(channel, transports, adapterLookup, requestedAdapterId)?.adapterId ??
    adapters.find((adapter) => adapter.channel === channel)?.id
  );
}

function routeTargetNodeId(mode: RoutingDecisionMode): string {
  if (mode === "cognitive-assisted") {
    return "planner-swarm";
  }
  if (mode === "guarded-fallback" || mode === "suppressed") {
    return "integrity-gate";
  }
  return "actuator-grid";
}

function recommendedIntensity(
  mode: RoutingDecisionMode,
  frame: NeuroFrameWindow | undefined,
  execution: CognitiveExecution | undefined,
  requestedIntensity?: number,
  cognitiveRouteSuggestion?: string,
  neuralBandPower?: NeuroFrameWindow["bandPower"],
  neuralSignalQuality = 0,
  dominantBand?: string,
  federationPressure?: FederatedExecutionPressure
): number {
  if (typeof requestedIntensity === "number" && Number.isFinite(requestedIntensity)) {
    return clamp(requestedIntensity);
  }

  const suggestion = cognitiveRouteSuggestion?.toLowerCase() ?? "";
  const suggestionBias =
    suggestion.includes("suppress")
      ? -0.06
      : suggestion.includes("guard")
        ? -0.06
        : suggestion.includes("reflex") || suggestion.includes("direct")
          ? 0.06
          : suggestion.includes("cognitive")
            ? 0.03
            : 0;

  if (mode === "suppressed") {
    return 0;
  }
  if (mode === "reflex-direct") {
    const bandPower = neuralBandPower ?? frame?.bandPower;
    const motorActivation = bandPower ? bandPower.gamma / (bandPower.beta + 0.001) : 0;
    const bandIntensity = clamp(motorActivation * 0.4, 0, 0.3);
    const couplingBias = neuralSignalQuality > 0 ? clamp(neuralSignalQuality * 0.12, 0, 0.12) : 0;
    const dominantBandBias =
      dominantBand === "beta" || bandPower?.dominantBand === "beta"
        ? 0.08
        : dominantBand === "gamma" || bandPower?.dominantBand === "gamma"
          ? 0.04
          : 0;
    return clamp(
      (frame?.decodeConfidence ?? 0.72) * 0.78 + bandIntensity + couplingBias + dominantBandBias + suggestionBias,
      0.18,
      0.88
    );
  }
  if (mode === "cognitive-assisted") {
    const latencyBias = execution ? Math.min(execution.latencyMs / 5000, 1) * 0.08 : 0;
    const couplingBias = neuralSignalQuality > 0 ? clamp(neuralSignalQuality * 0.03, 0, 0.03) : 0;
    const federationBias =
      federationPressure?.pressure === "critical"
        ? -0.08
        : federationPressure?.pressure === "elevated"
          ? -0.04
          : 0;
    return clamp(0.32 + latencyBias + couplingBias + suggestionBias + federationBias, 0.18, 0.56);
  }
  if (mode === "operator-override") {
    const couplingBias = neuralSignalQuality > 0 ? clamp(neuralSignalQuality * 0.04, 0, 0.04) : 0;
    return clamp((frame?.decodeConfidence ?? 0.36) + couplingBias + suggestionBias, 0.18, 0.64);
  }
  return clamp(0.24 + suggestionBias, 0.18, 0.36);
}

function resolveSpectralSignalQuality(
  neuralCoupling: NeuralCouplingState,
  frame: NeuroFrameWindow | undefined,
  neuralBandPower?: NeuroFrameWindow["bandPower"]
): {
  signalQuality: number;
  dominantBand: string;
  dominantRatio: number;
  artifactRatio: number;
  directBandSignal: boolean;
} {
  const bandPower = neuralBandPower ?? frame?.bandPower;
  const totalPower = bandPower?.totalPower ?? 0;
  const artifactRatio =
    totalPower > 0 ? clamp((bandPower?.artifactPower ?? 0) / totalPower, 0, 1) : clamp(neuralCoupling.artifactRatio ?? 0, 0, 1);
  const directBandSignal = Boolean(bandPower);
  const bandSignalQuality = bandPower
    ? clamp(
        bandPower.dominantRatio * 0.38 +
          (1 - artifactRatio) * 0.34 +
          (frame?.decodeConfidence ?? neuralCoupling.decodeConfidence ?? 0) * 0.28 -
          artifactRatio * 0.78,
        0,
        1
      )
    : 0;
  const couplingSignalQuality = clamp(neuralCoupling.signalQuality ?? 0, 0, 1);
  const directSignalQuality = directBandSignal
    ? clamp(
        bandSignalQuality * 0.82 +
          couplingSignalQuality * 0.18 -
          artifactRatio * 0.18,
        0,
        1
      )
    : couplingSignalQuality;

  return {
    signalQuality: directSignalQuality,
    dominantBand: bandPower?.dominantBand ?? neuralCoupling.dominantBand ?? "none",
    dominantRatio: bandPower?.dominantRatio ?? neuralCoupling.dominantRatio ?? 0,
    artifactRatio,
    directBandSignal
  };
}

export function planAdaptiveRoute(input: AdaptiveRoutePlanInput): AdaptiveRoutePlan {
  const adapterLookup = adaptersById(input.adapters);
  const frame = input.frame ?? input.snapshot.neuroFrames[0];
  const execution = input.execution ?? input.snapshot.cognitiveExecutions[0];
  const neuralCoupling = input.neuralCoupling ?? input.snapshot.neuralCoupling;
  const spectralSignal = resolveSpectralSignalQuality(
    neuralCoupling,
    frame,
    input.neuralBandPower
  );
  const spectralConfidence = spectralSignal.signalQuality;
  const hasSpectralCoupling = spectralSignal.directBandSignal || spectralConfidence > 0;
  const dominantBand = spectralSignal.dominantBand;
  const strongSpectralReflexSignal =
    Boolean(frame?.decodeReady) &&
    hasSpectralCoupling &&
    spectralConfidence >= 0.78 &&
    spectralSignal.artifactRatio <= 0.18 &&
    (dominantBand === "beta" || dominantBand === "gamma");
  const governancePressure = deriveGovernancePressure(
    input.consentScope,
    input.governanceStatus,
    input.governanceDecisions
  );

  const hapticTransport = preferredTransport(
    "haptic",
    input.transports,
    adapterLookup,
    input.requestedAdapterId
  );
  const visualTransport = preferredTransport(
    "visual",
    input.transports,
    adapterLookup,
    input.requestedAdapterId
  );

  let mode: RoutingDecisionMode;
  let channel: ActuationChannel;
  const federatedPressure = input.federationPressure;
  const criticalRemoteExecutionPressure =
    federatedPressure?.pressure === "critical" &&
    execution?.assignedWorkerProfile === "remote";
  const suggestedRoute = normalizeRouteHint(
    input.cognitiveRouteSuggestion ?? execution?.routeSuggestion
  );
  const qGovernedLocalPreference =
    input.qContext?.qRoutingDirective === "primary-governed-local" &&
    input.qContext?.preferredExecutionLane === "local-q";
  const qNeedsGuardedHold = input.qContext?.qRoutingDirective === "guarded-hold";

  if (input.suppressed || suggestedRoute === "suppressed") {
    mode = "suppressed";
    channel = input.requestedChannel ?? "visual";
  } else if (qNeedsGuardedHold) {
    mode = "guarded-fallback";
    channel = "visual";
  } else if (criticalRemoteExecutionPressure) {
    mode = "guarded-fallback";
    channel = "visual";
  } else if (suggestedRoute === "guarded") {
    mode = "guarded-fallback";
    channel = "visual";
  } else if (
    hasSpectralCoupling &&
    spectralConfidence < 0.18 &&
    governancePressure !== "critical"
  ) {
    mode = "guarded-fallback";
    channel = "visual";
  } else if (
    (strongSpectralReflexSignal ||
      (frame?.decodeReady && frame.decodeConfidence >= STABILITY_POLE)) &&
    hapticTransport &&
    hapticTransport.health === "healthy" &&
    governancePressure === "clear" &&
    federatedPressure?.pressure !== "critical"
  ) {
    mode = "reflex-direct";
    channel = "haptic";
  } else if (
    suggestedRoute === "cognitive" &&
    execution?.status === "completed" &&
    governancePressure !== "critical"
  ) {
    mode = "cognitive-assisted";
    channel = "visual";
  } else if (
    qGovernedLocalPreference &&
    execution?.status === "completed" &&
    governancePressure !== "critical" &&
    suggestedRoute !== "reflex" &&
    federatedPressure?.pressure !== "critical"
  ) {
    mode = "cognitive-assisted";
    channel = "visual";
  } else if (execution?.status === "completed" && governancePressure !== "critical") {
    if (federatedPressure?.pressure === "critical") {
      mode = "guarded-fallback";
      channel = "visual";
    } else {
      mode = "cognitive-assisted";
      channel = "visual";
    }
  } else if (
    governancePressure !== "clear" ||
    !hapticTransport ||
    hapticTransport.health !== "healthy"
  ) {
    mode = "guarded-fallback";
    channel = "visual";
  } else {
    mode = "reflex-direct";
    channel = "haptic";
  }

  const requestedChannel = input.requestedChannel;
  const requestedAdapterId = input.requestedAdapterId;
  const plannedAdapterId = adapterForChannel(
    requestedChannel ?? channel,
    input.adapters,
    input.transports,
    requestedAdapterId
  );
  const selectedChannel = requestedChannel ?? channel;
  const selectedTransport =
    preferredTransport(selectedChannel, input.transports, adapterLookup, requestedAdapterId) ??
    undefined;

  if (
    !input.suppressed &&
    (requestedChannel || requestedAdapterId) &&
    (requestedChannel !== undefined || (requestedAdapterId && requestedAdapterId !== plannedAdapterId))
  ) {
    mode = "operator-override";
  }

  const routeNodeId = input.requestedTargetNodeId?.trim() || routeTargetNodeId(mode);
  const intensity = recommendedIntensity(
    mode,
    frame,
    execution,
    input.requestedIntensity,
    suggestedRoute ?? input.cognitiveRouteSuggestion ?? execution?.routeSuggestion,
    input.neuralBandPower ?? frame?.bandPower,
    spectralConfidence,
    dominantBand,
    federatedPressure
  );
  const dominantRatio =
    spectralSignal.dominantRatio;
  const selectedAdapterId =
    requestedAdapterId && adapterLookup.has(requestedAdapterId)
      ? requestedAdapterId
      : plannedAdapterId;
  const rationaleParts = [
    `mode=${mode}`,
    `channel=${selectedChannel}`,
    `decode=${(frame?.decodeConfidence ?? 0).toFixed(2)}`,
    `band=${dominantBand}:${dominantRatio.toFixed(2)}`,
    `signal=${hasSpectralCoupling ? spectralConfidence.toFixed(2) : "none"}`,
    `artifact=${hasSpectralCoupling ? spectralSignal.artifactRatio.toFixed(2) : "none"}`,
    `governance=${governancePressure}`,
    `federation=${federatedPressure?.pressure ?? "none"}`,
    `federationLatency=${typeof federatedPressure?.crossNodeLatencyMs === "number" ? federatedPressure.crossNodeLatencyMs.toFixed(2) : "none"}`,
    `federationSuccess=${typeof federatedPressure?.remoteSuccessRatio === "number" ? federatedPressure.remoteSuccessRatio.toFixed(2) : "none"}`,
    `cognitive=${suggestedRoute ?? input.cognitiveRouteSuggestion ?? execution?.routeSuggestion ?? "none"}`,
    `qDirective=${input.qContext?.qRoutingDirective ?? "none"}`,
    `qLane=${qGovernedLocalPreference ? `local-ready:${input.qContext?.trainingBundleId ?? "tracked"}` : "none"}`,
    `qCloud=${input.qContext ? `${input.qContext.cloudLaneReady ? "ready" : "blocked"}:${input.qContext.cloudLaneStatus ?? "unknown"}` : "none"}`,
    `transport=${selectedTransport?.kind ?? "none"}`,
    `health=${selectedTransport?.health ?? "none"}`
  ];

  return {
    mode,
    channel: selectedChannel,
    targetNodeId: routeNodeId,
    recommendedAdapterId: selectedAdapterId,
    recommendedIntensity: intensity,
    governancePressure,
    federationPressure: federatedPressure?.pressure,
    federationObservedLatencyMs: federatedPressure?.crossNodeLatencyMs,
    federationRemoteSuccessRatio: federatedPressure?.remoteSuccessRatio,
    selectedTransport,
    rationale: rationaleParts.join(" / ")
  };
}

export function buildRoutingDecision(options: {
  output: ActuationOutput;
  delivery: ActuationDelivery;
  plan: AdaptiveRoutePlan;
  frame?: NeuroFrameWindow;
  execution?: CognitiveExecution;
}): RoutingDecision {
  const selectedAt = options.output.dispatchedAt ?? options.output.generatedAt;
  const transportKind =
    options.delivery.transport === "file" || options.delivery.transport === "bridge"
      ? options.plan.selectedTransport?.kind ?? options.delivery.transport
      : options.delivery.transport;
  const actualNote =
    options.delivery.transport !== (options.plan.selectedTransport?.kind ?? options.delivery.transport)
      ? ` / actual=${options.delivery.transport}`
      : "";

  return {
    id: `route-${hashValue(`${options.output.id}:${selectedAt}:${options.plan.mode}`)}`,
    sessionId: options.output.sessionId,
    source: options.output.source,
    mode: options.plan.mode,
    targetNodeId: options.plan.targetNodeId,
    channel: options.output.channel,
    adapterId: options.output.adapterId,
    transportId: options.plan.selectedTransport?.id,
    transportKind,
    transportHealth: options.plan.selectedTransport?.health ?? options.delivery.transport,
    transportPreferenceScore: options.plan.selectedTransport?.preferenceScore,
    transportPreferenceRank: options.plan.selectedTransport?.preferenceRank,
    decodeConfidence: options.frame?.decodeConfidence ?? 0,
    cognitiveLatencyMs: options.execution?.latencyMs,
    governancePressure: options.plan.governancePressure,
    federationPressure: options.plan.federationPressure,
    federationObservedLatencyMs: options.plan.federationObservedLatencyMs,
    federationRemoteSuccessRatio: options.plan.federationRemoteSuccessRatio,
    rationale: `${options.plan.rationale}${actualNote} / policy=${options.delivery.policyNote}`,
    selectedAt
  };
}
