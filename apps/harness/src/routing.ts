import type {
  ActuationChannel,
  ActuationOutput,
  CognitiveExecution,
  NeuroFrameWindow,
  PhaseSnapshot,
  RoutingDecision,
  RoutingDecisionMode,
  GovernancePressureLevel
} from "@immaculate/core";
import type {
  ActuationAdapterState,
  ActuationDelivery,
  ActuationTransportState
} from "./actuation.js";
import type { GovernanceDecision, GovernanceStatus } from "./governance.js";
import { hashValue } from "./utils.js";

type AdaptiveRoutePlanInput = {
  snapshot: PhaseSnapshot;
  frame?: NeuroFrameWindow;
  execution?: CognitiveExecution;
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
};

export type AdaptiveRoutePlan = {
  mode: RoutingDecisionMode;
  channel: ActuationChannel;
  targetNodeId: string;
  recommendedAdapterId?: string;
  recommendedIntensity: number;
  governancePressure: GovernancePressureLevel;
  selectedTransport?: ActuationTransportState;
  rationale: string;
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function recentDeniedCount(decisions: GovernanceDecision[]): number {
  const windowStart = Date.now() - 5 * 60 * 1000;
  return decisions.filter(
    (decision) => !decision.allowed && Date.parse(decision.timestamp) >= windowStart
  ).length;
}

function deriveGovernancePressure(
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
  );
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
  requestedIntensity?: number
): number {
  if (typeof requestedIntensity === "number" && Number.isFinite(requestedIntensity)) {
    return clamp(requestedIntensity);
  }

  if (mode === "suppressed") {
    return 0;
  }
  if (mode === "reflex-direct") {
    return clamp((frame?.decodeConfidence ?? 0.72) * 0.78 + 0.08, 0.18, 0.72);
  }
  if (mode === "cognitive-assisted") {
    const latencyBias = execution ? Math.min(execution.latencyMs / 5000, 1) * 0.08 : 0;
    return clamp(0.32 + latencyBias, 0.24, 0.56);
  }
  if (mode === "operator-override") {
    return clamp(frame?.decodeConfidence ?? 0.36, 0.18, 0.64);
  }
  return 0.24;
}

export function planAdaptiveRoute(input: AdaptiveRoutePlanInput): AdaptiveRoutePlan {
  const adapterLookup = adaptersById(input.adapters);
  const frame = input.frame ?? input.snapshot.neuroFrames[0];
  const execution = input.execution ?? input.snapshot.cognitiveExecutions[0];
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

  if (input.suppressed) {
    mode = "suppressed";
    channel = input.requestedChannel ?? "visual";
  } else if (
    frame?.decodeReady &&
    frame.decodeConfidence >= 0.82 &&
    hapticTransport &&
    hapticTransport.health === "healthy" &&
    governancePressure === "clear"
  ) {
    mode = "reflex-direct";
    channel = "haptic";
  } else if (execution?.status === "completed" && governancePressure !== "critical") {
    mode = "cognitive-assisted";
    channel = "visual";
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
  const intensity = recommendedIntensity(mode, frame, execution, input.requestedIntensity);
  const selectedAdapterId =
    requestedAdapterId && adapterLookup.has(requestedAdapterId)
      ? requestedAdapterId
      : plannedAdapterId;
  const rationaleParts = [
    `mode=${mode}`,
    `channel=${selectedChannel}`,
    `decode=${(frame?.decodeConfidence ?? 0).toFixed(2)}`,
    `governance=${governancePressure}`,
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
    rationale: `${options.plan.rationale}${actualNote} / policy=${options.delivery.policyNote}`,
    selectedAt
  };
}
