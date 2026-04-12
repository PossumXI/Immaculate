import { z } from "zod";

export const orchestrationPlanes = ["reflex", "cognitive", "offline"] as const;
export type OrchestrationPlane = (typeof orchestrationPlanes)[number];

export const nodeKinds = [
  "human",
  "sensor",
  "decoder",
  "agent",
  "memory",
  "tool",
  "policy",
  "actuator",
  "dataset"
] as const;
export type NodeKind = (typeof nodeKinds)[number];

export const phaseIds = [
  "ingest",
  "synchronize",
  "decode",
  "route",
  "reason",
  "commit",
  "verify",
  "feedback",
  "optimize"
] as const;
export type PhaseId = (typeof phaseIds)[number];

export const passStates = ["idle", "queued", "running", "completed", "degraded"] as const;
export type PassState = (typeof passStates)[number];

export const controlActions = [
  "pause",
  "resume",
  "boost",
  "reroute",
  "pulse",
  "reset",
  "step"
] as const;
export type ControlAction = (typeof controlActions)[number];

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type ConnectomeNode = {
  id: string;
  label: string;
  kind: NodeKind;
  plane: OrchestrationPlane;
  position: Vec3;
  throughput: number;
  saturation: number;
  trust: number;
  drift: number;
  load: number;
  activation: number;
  tags: string[];
};

export type ConnectomeEdge = {
  id: string;
  from: string;
  to: string;
  weight: number;
  latencyMs: number;
  bandwidth: number;
  trust: number;
  propagation: number;
};

export type PhasePass = {
  id: string;
  cycle: number;
  sequence: number;
  phase: PhaseId;
  plane: OrchestrationPlane;
  state: PassState;
  progress: number;
  latencyMs: number;
  load: number;
  dependsOn: PhaseId[];
  targetNodeId: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type PhaseMetrics = {
  reflexLatencyMs: number;
  cognitiveLatencyMs: number;
  offlineUtilization: number;
  propagationRate: number;
  graphHealth: number;
  coherence: number;
  throughput: number;
  activeAgents: number;
};

export type IntegrityFinding = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  subjectId?: string;
  phase?: PhaseId;
  cycle?: number;
};

export type IntegrityReport = {
  valid: boolean;
  status: "verified" | "degraded" | "invalid";
  checkedAt: string;
  currentCycle: number;
  activePassCount: number;
  findingCount: number;
  findings: IntegrityFinding[];
};

export type BenchmarkSeries = {
  id: string;
  label: string;
  unit: string;
  samples: number;
  min: number;
  p50: number;
  p95: number;
  average: number;
  max: number;
};

export const benchmarkPackIds = [
  "substrate-readiness",
  "durability-recovery",
  "latency-soak"
] as const;
export type BenchmarkPackId = (typeof benchmarkPackIds)[number];

export type BenchmarkAssertion = {
  id: string;
  label: string;
  status: "pass" | "fail" | "warning";
  target: string;
  actual: string;
  detail: string;
};

export type BenchmarkProgress = {
  stage: string;
  completed: string[];
  remaining: string[];
};

export type BenchmarkDelta = {
  seriesId: string;
  label: string;
  unit: string;
  before: number;
  after: number;
  delta: number;
  percentDelta: number;
  trend: "improved" | "regressed" | "unchanged";
};

export type BenchmarkComparison = {
  previousSuiteId: string;
  previousGeneratedAt: string;
  improvedCount: number;
  regressedCount: number;
  unchangedCount: number;
  deltas: BenchmarkDelta[];
};

export type BenchmarkPublication = {
  jsonPath: string;
  markdownPath: string;
};

export type BenchmarkAttribution = {
  owner: string;
  role: string;
  website?: string;
  contributions: string[];
};

export type BenchmarkIndexEntry = {
  suiteId: string;
  generatedAt: string;
  packId: BenchmarkPackId;
  packLabel: string;
  recoveryMode: string;
  integrityStatus: IntegrityReport["status"];
  failedAssertions: number;
  checkpointCount: number;
  summary: string;
  jsonPath: string;
  markdownPath: string;
};

export type BenchmarkIndex = {
  generatedAt: string;
  entries: BenchmarkIndexEntry[];
};

export type BenchmarkReport = {
  suiteId: string;
  generatedAt: string;
  packId: BenchmarkPackId;
  packLabel: string;
  profile: string;
  summary: string;
  tickIntervalMs: number;
  totalTicks: number;
  totalDurationMs: number;
  checkpointCount: number;
  recoveryMode: string;
  recovered: boolean;
  integrity: IntegrityReport;
  series: BenchmarkSeries[];
  assertions: BenchmarkAssertion[];
  progress: BenchmarkProgress;
  attribution?: BenchmarkAttribution;
  comparison?: BenchmarkComparison;
  publication?: BenchmarkPublication;
};

export const datasetModalities = [
  "anat",
  "func",
  "dwi",
  "eeg",
  "ieeg",
  "meg",
  "beh",
  "fmap",
  "stim",
  "unknown"
] as const;
export type DatasetModality = (typeof datasetModalities)[number];

export type DatasetModalitySummary = {
  modality: DatasetModality;
  fileCount: number;
};

export type IngestedDatasetSummary = {
  id: string;
  source: "bids";
  name: string;
  rootPath: string;
  bidsVersion?: string;
  datasetType?: string;
  subjectCount: number;
  sessionCount: number;
  fileCount: number;
  sizeBytes: number;
  modalities: DatasetModalitySummary[];
  subjects: string[];
  sessions: string[];
  ingestedAt: string;
};

export const neuroStreamKinds = [
  "electrical-series",
  "lfp-series",
  "spike-series",
  "timeseries",
  "unknown"
] as const;
export type NeuroStreamKind = (typeof neuroStreamKinds)[number];

export type NeuroStreamSummary = {
  id: string;
  name: string;
  path: string;
  kind: NeuroStreamKind;
  neurodataType?: string;
  unit?: string;
  rateHz?: number;
  sampleCount: number;
  channelCount: number;
  durationSec?: number;
  shape: number[];
};

export type NeuroSessionSummary = {
  id: string;
  source: "nwb";
  name: string;
  filePath: string;
  nwbVersion?: string;
  identifier?: string;
  sessionDescription?: string;
  streamCount: number;
  totalChannels: number;
  totalSamples: number;
  primaryRateHz?: number;
  streams: NeuroStreamSummary[];
  ingestedAt: string;
};

export const neuroReplayStatuses = ["running", "completed", "stopped"] as const;
export type NeuroReplayStatus = (typeof neuroReplayStatuses)[number];

export const neuroIngressSources = ["nwb-replay", "live-socket"] as const;
export type NeuroIngressSource = (typeof neuroIngressSources)[number];

export type NeuroReplayState = {
  id: string;
  sessionId: string;
  name: string;
  source: NeuroIngressSource;
  status: NeuroReplayStatus;
  windowSize: number;
  paceMs: number;
  totalWindows: number;
  completedWindows: number;
  decodeReadyRatio: number;
  lastMeanAbs: number;
  lastSyncJitterMs: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  lastWindowId?: string;
};

export type NeuroFrameWindow = {
  id: string;
  replayId: string;
  sessionId: string;
  source: NeuroIngressSource;
  windowIndex: number;
  sampleStart: number;
  sampleEnd: number;
  streamCount: number;
  channelCount: number;
  dominantKind: NeuroStreamKind;
  dominantRateHz?: number;
  meanAbs: number;
  rms: number;
  peak: number;
  syncJitterMs: number;
  decodeReady: boolean;
  decodeConfidence: number;
  capturedAt: string;
};

export const intelligenceLayerBackends = ["ollama"] as const;
export type IntelligenceLayerBackend = (typeof intelligenceLayerBackends)[number];

export const intelligenceLayerRoles = ["soul", "mid", "reasoner", "guard"] as const;
export type IntelligenceLayerRole = (typeof intelligenceLayerRoles)[number];

export const intelligenceLayerStatuses = ["ready", "offline", "degraded", "busy"] as const;
export type IntelligenceLayerStatus = (typeof intelligenceLayerStatuses)[number];

export type IntelligenceLayer = {
  id: string;
  name: string;
  backend: IntelligenceLayerBackend;
  model: string;
  role: IntelligenceLayerRole;
  status: IntelligenceLayerStatus;
  endpoint: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  registeredAt: string;
};

export type CognitiveExecution = {
  id: string;
  layerId: string;
  model: string;
  objective: string;
  status: "completed" | "failed";
  latencyMs: number;
  startedAt: string;
  completedAt: string;
  promptDigest: string;
  responsePreview: string;
};

export const actuationChannels = ["visual", "haptic", "stim"] as const;
export type ActuationChannel = (typeof actuationChannels)[number];

export const actuationOutputSources = ["operator", "cognitive", "neuro", "benchmark"] as const;
export type ActuationOutputSource = (typeof actuationOutputSources)[number];

export const actuationOutputStatuses = ["dispatched", "suppressed"] as const;
export type ActuationOutputStatus = (typeof actuationOutputStatuses)[number];

export const routingDecisionSources = ["operator", "neuro", "cognitive", "benchmark"] as const;
export type RoutingDecisionSource = (typeof routingDecisionSources)[number];

export const routingDecisionModes = [
  "reflex-direct",
  "cognitive-assisted",
  "guarded-fallback",
  "operator-override",
  "suppressed"
] as const;
export type RoutingDecisionMode = (typeof routingDecisionModes)[number];

export const governancePressureLevels = ["clear", "elevated", "critical"] as const;
export type GovernancePressureLevel = (typeof governancePressureLevels)[number];

export type ActuationOutput = {
  id: string;
  sessionId?: string;
  source: ActuationOutputSource;
  sourceExecutionId?: string;
  sourceFrameId?: string;
  adapterId?: string;
  deliveryId?: string;
  protocolId?: string;
  deviceId?: string;
  targetNodeId: string;
  channel: ActuationChannel;
  command: string;
  intensity: number;
  status: ActuationOutputStatus;
  summary: string;
  generatedAt: string;
  dispatchedAt?: string;
};

export type RoutingDecision = {
  id: string;
  sessionId?: string;
  source: RoutingDecisionSource;
  mode: RoutingDecisionMode;
  targetNodeId: string;
  channel: ActuationChannel;
  adapterId?: string;
  transportId?: string;
  transportKind?: string;
  transportHealth?: string;
  transportPreferenceScore?: number;
  transportPreferenceRank?: number;
  decodeConfidence: number;
  cognitiveLatencyMs?: number;
  governancePressure: GovernancePressureLevel;
  rationale: string;
  selectedAt: string;
};

export type PhaseSnapshot = {
  epoch: number;
  cycle: number;
  timestamp: string;
  status: "running" | "paused";
  profile: string;
  intent: string;
  objective: string;
  nodes: ConnectomeNode[];
  edges: ConnectomeEdge[];
  passes: PhasePass[];
  metrics: PhaseMetrics;
  highlightedNodeId: string;
  datasets: IngestedDatasetSummary[];
  neuroSessions: NeuroSessionSummary[];
  neuroReplays: NeuroReplayState[];
  neuroFrames: NeuroFrameWindow[];
  intelligenceLayers: IntelligenceLayer[];
  cognitiveExecutions: CognitiveExecution[];
  routingDecisions: RoutingDecision[];
  actuationOutputs: ActuationOutput[];
  logTail: string[];
  lastEventId?: string;
};

export type SnapshotHistoryPoint = {
  epoch: number;
  cycle: number;
  timestamp: string;
  status: PhaseSnapshot["status"];
  reflexLatencyMs: number;
  cognitiveLatencyMs: number;
  propagationRate: number;
  coherence: number;
  throughput: number;
};

export type EventEnvelope = {
  eventId: string;
  eventTimeUtc: string;
  producer: { service: string; instance: string };
  subject: { type: "human" | "agent" | "device" | "dataset" | "pass" | "cycle" | "system"; id: string };
  purpose: string[];
  consent: { policyId: string; scopeHash: string };
  schema: { name: string; version: string };
  payload: Record<string, unknown>;
  integrity: { hash: string; sig?: string };
  summary: string;
};

export type EngineDurableState = {
  snapshot: PhaseSnapshot;
  history: SnapshotHistoryPoint[];
  events: EventEnvelope[];
  serial: number;
  pulse: number;
};

export type ControlEnvelope = {
  action: ControlAction;
  target?: string;
  value?: number;
};

const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});

const connectomeNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(nodeKinds),
  plane: z.enum(orchestrationPlanes),
  position: vec3Schema,
  throughput: z.number(),
  saturation: z.number(),
  trust: z.number(),
  drift: z.number(),
  load: z.number(),
  activation: z.number(),
  tags: z.array(z.string())
});

const connectomeEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  weight: z.number(),
  latencyMs: z.number(),
  bandwidth: z.number(),
  trust: z.number(),
  propagation: z.number()
});

const phasePassSchema = z.object({
  id: z.string(),
  cycle: z.number().int().positive(),
  sequence: z.number().int().positive(),
  phase: z.enum(phaseIds),
  plane: z.enum(orchestrationPlanes),
  state: z.enum(passStates),
  progress: z.number(),
  latencyMs: z.number(),
  load: z.number(),
  dependsOn: z.array(z.enum(phaseIds)),
  targetNodeId: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional()
});

const phaseMetricsSchema = z.object({
  reflexLatencyMs: z.number(),
  cognitiveLatencyMs: z.number(),
  offlineUtilization: z.number(),
  propagationRate: z.number(),
  graphHealth: z.number(),
  coherence: z.number(),
  throughput: z.number(),
  activeAgents: z.number()
});

const integrityFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "critical"]),
  message: z.string(),
  subjectId: z.string().optional(),
  phase: z.enum(phaseIds).optional(),
  cycle: z.number().int().positive().optional()
});

export const integrityReportSchema = z.object({
  valid: z.boolean(),
  status: z.enum(["verified", "degraded", "invalid"]),
  checkedAt: z.string(),
  currentCycle: z.number().int().positive(),
  activePassCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  findings: z.array(integrityFindingSchema)
});

const benchmarkSeriesSchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string(),
  samples: z.number().int().nonnegative(),
  min: z.number(),
  p50: z.number(),
  p95: z.number(),
  average: z.number(),
  max: z.number()
});

const benchmarkAssertionSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "fail", "warning"]),
  target: z.string(),
  actual: z.string(),
  detail: z.string()
});

const benchmarkProgressSchema = z.object({
  stage: z.string(),
  completed: z.array(z.string()),
  remaining: z.array(z.string())
});

const benchmarkDeltaSchema = z.object({
  seriesId: z.string(),
  label: z.string(),
  unit: z.string(),
  before: z.number(),
  after: z.number(),
  delta: z.number(),
  percentDelta: z.number(),
  trend: z.enum(["improved", "regressed", "unchanged"])
});

const benchmarkComparisonSchema = z.object({
  previousSuiteId: z.string(),
  previousGeneratedAt: z.string(),
  improvedCount: z.number().int().nonnegative(),
  regressedCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  deltas: z.array(benchmarkDeltaSchema)
});

const benchmarkPublicationSchema = z.object({
  jsonPath: z.string(),
  markdownPath: z.string()
});

const benchmarkAttributionSchema = z.object({
  owner: z.string(),
  role: z.string(),
  website: z.string().optional(),
  contributions: z.array(z.string())
});

const benchmarkIndexEntrySchema = z.object({
  suiteId: z.string(),
  generatedAt: z.string(),
  packId: z.enum(benchmarkPackIds),
  packLabel: z.string(),
  recoveryMode: z.string(),
  integrityStatus: z.enum(["verified", "degraded", "invalid"]),
  failedAssertions: z.number().int().nonnegative(),
  checkpointCount: z.number().int().nonnegative(),
  summary: z.string(),
  jsonPath: z.string(),
  markdownPath: z.string()
});

export const benchmarkIndexSchema = z.object({
  generatedAt: z.string(),
  entries: z.array(benchmarkIndexEntrySchema)
});

export const benchmarkReportSchema = z.object({
  suiteId: z.string(),
  generatedAt: z.string(),
  packId: z.enum(benchmarkPackIds),
  packLabel: z.string(),
  profile: z.string(),
  summary: z.string(),
  tickIntervalMs: z.number().positive(),
  totalTicks: z.number().int().nonnegative(),
  totalDurationMs: z.number().nonnegative(),
  checkpointCount: z.number().int().nonnegative(),
  recoveryMode: z.string(),
  recovered: z.boolean(),
  integrity: integrityReportSchema,
  series: z.array(benchmarkSeriesSchema),
  assertions: z.array(benchmarkAssertionSchema),
  progress: benchmarkProgressSchema,
  attribution: benchmarkAttributionSchema.optional(),
  comparison: benchmarkComparisonSchema.optional(),
  publication: benchmarkPublicationSchema.optional()
});

const datasetModalitySummarySchema = z.object({
  modality: z.enum(datasetModalities),
  fileCount: z.number().int().nonnegative()
});

export const datasetSummarySchema = z.object({
  id: z.string(),
  source: z.literal("bids"),
  name: z.string(),
  rootPath: z.string(),
  bidsVersion: z.string().optional(),
  datasetType: z.string().optional(),
  subjectCount: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  modalities: z.array(datasetModalitySummarySchema),
  subjects: z.array(z.string()),
  sessions: z.array(z.string()),
  ingestedAt: z.string()
});

const neuroStreamSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  kind: z.enum(neuroStreamKinds),
  neurodataType: z.string().optional(),
  unit: z.string().optional(),
  rateHz: z.number().positive().optional(),
  sampleCount: z.number().int().nonnegative(),
  channelCount: z.number().int().positive(),
  durationSec: z.number().nonnegative().optional(),
  shape: z.array(z.number().int().nonnegative())
});

export const neuroSessionSummarySchema = z.object({
  id: z.string(),
  source: z.literal("nwb"),
  name: z.string(),
  filePath: z.string(),
  nwbVersion: z.string().optional(),
  identifier: z.string().optional(),
  sessionDescription: z.string().optional(),
  streamCount: z.number().int().nonnegative(),
  totalChannels: z.number().int().nonnegative(),
  totalSamples: z.number().int().nonnegative(),
  primaryRateHz: z.number().positive().optional(),
  streams: z.array(neuroStreamSummarySchema),
  ingestedAt: z.string()
});

export const neuroReplayStateSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  name: z.string(),
  source: z.enum(neuroIngressSources),
  status: z.enum(neuroReplayStatuses),
  windowSize: z.number().int().positive(),
  paceMs: z.number().int().positive(),
  totalWindows: z.number().int().nonnegative(),
  completedWindows: z.number().int().nonnegative(),
  decodeReadyRatio: z.number(),
  lastMeanAbs: z.number(),
  lastSyncJitterMs: z.number(),
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  lastWindowId: z.string().optional()
});

export const neuroFrameWindowSchema = z.object({
  id: z.string(),
  replayId: z.string(),
  sessionId: z.string(),
  source: z.enum(neuroIngressSources),
  windowIndex: z.number().int().nonnegative(),
  sampleStart: z.number().int().nonnegative(),
  sampleEnd: z.number().int().nonnegative(),
  streamCount: z.number().int().positive(),
  channelCount: z.number().int().positive(),
  dominantKind: z.enum(neuroStreamKinds),
  dominantRateHz: z.number().positive().optional(),
  meanAbs: z.number().nonnegative(),
  rms: z.number().nonnegative(),
  peak: z.number().nonnegative(),
  syncJitterMs: z.number().nonnegative(),
  decodeReady: z.boolean(),
  decodeConfidence: z.number(),
  capturedAt: z.string()
});

export const intelligenceLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  backend: z.enum(intelligenceLayerBackends),
  model: z.string(),
  role: z.enum(intelligenceLayerRoles),
  status: z.enum(intelligenceLayerStatuses),
  endpoint: z.string(),
  family: z.string().optional(),
  parameterSize: z.string().optional(),
  quantization: z.string().optional(),
  registeredAt: z.string()
});

export const cognitiveExecutionSchema = z.object({
  id: z.string(),
  layerId: z.string(),
  model: z.string(),
  objective: z.string(),
  status: z.enum(["completed", "failed"]),
  latencyMs: z.number().nonnegative(),
  startedAt: z.string(),
  completedAt: z.string(),
  promptDigest: z.string(),
  responsePreview: z.string()
});

export const actuationOutputSchema = z.object({
  id: z.string(),
  sessionId: z.string().optional(),
  source: z.enum(actuationOutputSources),
  sourceExecutionId: z.string().optional(),
  sourceFrameId: z.string().optional(),
  adapterId: z.string().optional(),
  deliveryId: z.string().optional(),
  protocolId: z.string().optional(),
  deviceId: z.string().optional(),
  targetNodeId: z.string(),
  channel: z.enum(actuationChannels),
  command: z.string(),
  intensity: z.number().nonnegative(),
  status: z.enum(actuationOutputStatuses),
  summary: z.string(),
  generatedAt: z.string(),
  dispatchedAt: z.string().optional()
});

export const routingDecisionSchema = z.object({
  id: z.string(),
  sessionId: z.string().optional(),
  source: z.enum(routingDecisionSources),
  mode: z.enum(routingDecisionModes),
  targetNodeId: z.string(),
  channel: z.enum(actuationChannels),
  adapterId: z.string().optional(),
  transportId: z.string().optional(),
  transportKind: z.string().optional(),
  transportHealth: z.string().optional(),
  transportPreferenceScore: z.number().optional(),
  transportPreferenceRank: z.number().int().positive().optional(),
  decodeConfidence: z.number().nonnegative(),
  cognitiveLatencyMs: z.number().nonnegative().optional(),
  governancePressure: z.enum(governancePressureLevels),
  rationale: z.string(),
  selectedAt: z.string()
});

export const phaseSnapshotSchema = z.object({
  epoch: z.number().int().nonnegative(),
  cycle: z.number().int().positive(),
  timestamp: z.string(),
  status: z.enum(["running", "paused"]),
  profile: z.string(),
  intent: z.string(),
  objective: z.string(),
  nodes: z.array(connectomeNodeSchema),
  edges: z.array(connectomeEdgeSchema),
  passes: z.array(phasePassSchema),
  metrics: phaseMetricsSchema,
  highlightedNodeId: z.string(),
  datasets: z.array(datasetSummarySchema).default([]),
  neuroSessions: z.array(neuroSessionSummarySchema).default([]),
  neuroReplays: z.array(neuroReplayStateSchema).default([]),
  neuroFrames: z.array(neuroFrameWindowSchema).default([]),
  intelligenceLayers: z.array(intelligenceLayerSchema).default([]),
  cognitiveExecutions: z.array(cognitiveExecutionSchema).default([]),
  routingDecisions: z.array(routingDecisionSchema).default([]),
  actuationOutputs: z.array(actuationOutputSchema).default([]),
  logTail: z.array(z.string()),
  lastEventId: z.string().optional()
});

export const snapshotHistoryPointSchema = z.object({
  epoch: z.number().int().nonnegative(),
  cycle: z.number().int().positive(),
  timestamp: z.string(),
  status: z.enum(["running", "paused"]),
  reflexLatencyMs: z.number(),
  cognitiveLatencyMs: z.number(),
  propagationRate: z.number(),
  coherence: z.number(),
  throughput: z.number()
});

export const eventEnvelopeSchema = z.object({
  eventId: z.string(),
  eventTimeUtc: z.string(),
  producer: z.object({
    service: z.string(),
    instance: z.string()
  }),
  subject: z.object({
    type: z.enum(["human", "agent", "device", "dataset", "pass", "cycle", "system"]),
    id: z.string()
  }),
  purpose: z.array(z.string()),
  consent: z.object({
    policyId: z.string(),
    scopeHash: z.string()
  }),
  schema: z.object({
    name: z.string(),
    version: z.string()
  }),
  payload: z.record(z.string(), z.unknown()),
  integrity: z.object({
    hash: z.string(),
    sig: z.string().optional()
  }),
  summary: z.string()
});

export const engineDurableStateSchema = z.object({
  snapshot: phaseSnapshotSchema,
  history: z.array(snapshotHistoryPointSchema),
  events: z.array(eventEnvelopeSchema),
  serial: z.number().int().nonnegative(),
  pulse: z.number()
});

export const controlEnvelopeSchema = z.object({
  action: z.enum(controlActions),
  target: z.string().optional(),
  value: z.number().optional()
});

const initialNodes: ConnectomeNode[] = [
  {
    id: "human-operator",
    label: "Human Operator",
    kind: "human",
    plane: "cognitive",
    position: { x: -7, y: 1.2, z: 0.8 },
    throughput: 0.82,
    saturation: 0.28,
    trust: 0.97,
    drift: 0.04,
    load: 0.44,
    activation: 0.67,
    tags: ["consent", "intent", "command"]
  },
  {
    id: "sensor-array",
    label: "Sensor Array",
    kind: "sensor",
    plane: "reflex",
    position: { x: -9.5, y: -3.2, z: 1.2 },
    throughput: 0.91,
    saturation: 0.39,
    trust: 0.88,
    drift: 0.06,
    load: 0.58,
    activation: 0.71,
    tags: ["eeg", "ecog", "stream"]
  },
  {
    id: "decoder-stack",
    label: "Reflex Decoder",
    kind: "decoder",
    plane: "reflex",
    position: { x: -4.6, y: -1.9, z: -1.4 },
    throughput: 0.93,
    saturation: 0.48,
    trust: 0.89,
    drift: 0.02,
    load: 0.62,
    activation: 0.79,
    tags: ["intent", "confidence", "reflex"]
  },
  {
    id: "router-core",
    label: "Router Core",
    kind: "agent",
    plane: "cognitive",
    position: { x: -1.1, y: 0, z: 0 },
    throughput: 0.9,
    saturation: 0.46,
    trust: 0.93,
    drift: 0.02,
    load: 0.56,
    activation: 0.82,
    tags: ["scheduling", "policy", "route"]
  },
  {
    id: "planner-swarm",
    label: "Planner Swarm",
    kind: "agent",
    plane: "cognitive",
    position: { x: 3.6, y: 2.9, z: -0.4 },
    throughput: 0.88,
    saturation: 0.41,
    trust: 0.84,
    drift: 0.07,
    load: 0.59,
    activation: 0.74,
    tags: ["agents", "planning", "tools"]
  },
  {
    id: "memory-lattice",
    label: "Memory Lattice",
    kind: "memory",
    plane: "cognitive",
    position: { x: 3.4, y: -2.6, z: 2.2 },
    throughput: 0.87,
    saturation: 0.38,
    trust: 0.94,
    drift: 0.01,
    load: 0.47,
    activation: 0.63,
    tags: ["semantic", "episodic", "graph"]
  },
  {
    id: "integrity-gate",
    label: "Integrity Gate",
    kind: "policy",
    plane: "cognitive",
    position: { x: 6.1, y: 1.6, z: 1.1 },
    throughput: 0.79,
    saturation: 0.26,
    trust: 0.98,
    drift: 0.01,
    load: 0.33,
    activation: 0.52,
    tags: ["integrity", "verification", "checkpoint-gate"]
  },
  {
    id: "policy-vault",
    label: "Policy Vault",
    kind: "policy",
    plane: "offline",
    position: { x: 7.4, y: 0.6, z: -2.7 },
    throughput: 0.68,
    saturation: 0.22,
    trust: 0.98,
    drift: 0.01,
    load: 0.31,
    activation: 0.44,
    tags: ["safety", "consent", "audit"]
  },
  {
    id: "sim-lab",
    label: "Offline Sim Lab",
    kind: "dataset",
    plane: "offline",
    position: { x: 9.1, y: -2.7, z: 1.4 },
    throughput: 0.72,
    saturation: 0.33,
    trust: 0.83,
    drift: 0.05,
    load: 0.52,
    activation: 0.49,
    tags: ["training", "connectome", "replay"]
  },
  {
    id: "actuator-grid",
    label: "Actuator Grid",
    kind: "actuator",
    plane: "reflex",
    position: { x: 1.6, y: -4.4, z: -2.2 },
    throughput: 0.81,
    saturation: 0.29,
    trust: 0.87,
    drift: 0.03,
    load: 0.46,
    activation: 0.58,
    tags: ["feedback", "stimulation", "response"]
  }
];

const edgeTemplate: Array<Omit<ConnectomeEdge, "propagation">> = [
  { id: "e-1", from: "sensor-array", to: "decoder-stack", weight: 0.96, latencyMs: 6, bandwidth: 0.92, trust: 0.89 },
  { id: "e-2", from: "decoder-stack", to: "router-core", weight: 0.94, latencyMs: 11, bandwidth: 0.9, trust: 0.92 },
  { id: "e-3", from: "human-operator", to: "router-core", weight: 0.87, latencyMs: 19, bandwidth: 0.76, trust: 0.97 },
  { id: "e-4", from: "router-core", to: "planner-swarm", weight: 0.91, latencyMs: 34, bandwidth: 0.86, trust: 0.88 },
  { id: "e-5", from: "router-core", to: "memory-lattice", weight: 0.9, latencyMs: 22, bandwidth: 0.82, trust: 0.95 },
  { id: "e-6", from: "memory-lattice", to: "integrity-gate", weight: 0.88, latencyMs: 18, bandwidth: 0.8, trust: 0.97 },
  { id: "e-7", from: "router-core", to: "integrity-gate", weight: 0.86, latencyMs: 16, bandwidth: 0.78, trust: 0.94 },
  { id: "e-8", from: "integrity-gate", to: "actuator-grid", weight: 0.83, latencyMs: 14, bandwidth: 0.77, trust: 0.91 },
  { id: "e-9", from: "integrity-gate", to: "policy-vault", weight: 0.8, latencyMs: 27, bandwidth: 0.71, trust: 0.98 },
  { id: "e-10", from: "planner-swarm", to: "policy-vault", weight: 0.73, latencyMs: 58, bandwidth: 0.64, trust: 0.96 },
  { id: "e-11", from: "memory-lattice", to: "sim-lab", weight: 0.71, latencyMs: 63, bandwidth: 0.67, trust: 0.81 },
  { id: "e-12", from: "policy-vault", to: "router-core", weight: 0.79, latencyMs: 29, bandwidth: 0.72, trust: 0.98 },
  { id: "e-13", from: "sim-lab", to: "planner-swarm", weight: 0.68, latencyMs: 71, bandwidth: 0.69, trust: 0.77 }
];

const phaseToPlane: Record<PhaseId, OrchestrationPlane> = {
  ingest: "reflex",
  synchronize: "reflex",
  decode: "reflex",
  route: "cognitive",
  reason: "cognitive",
  commit: "cognitive",
  verify: "cognitive",
  feedback: "reflex",
  optimize: "offline"
};

const baselineLatency: Record<PhaseId, number> = {
  ingest: 7,
  synchronize: 11,
  decode: 15,
  route: 31,
  reason: 47,
  commit: 24,
  verify: 21,
  feedback: 12,
  optimize: 93
};

const planeBias: Record<OrchestrationPlane, number> = {
  reflex: 1,
  cognitive: 1.35,
  offline: 1.8
};

const phaseDependencies: Record<PhaseId, PhaseId[]> = {
  ingest: [],
  synchronize: ["ingest"],
  decode: ["synchronize"],
  route: ["decode"],
  reason: ["route"],
  commit: ["reason"],
  verify: ["commit"],
  feedback: ["verify"],
  optimize: ["feedback"]
};

const phaseTargetNode: Record<PhaseId, string> = {
  ingest: "sensor-array",
  synchronize: "sensor-array",
  decode: "decoder-stack",
  route: "router-core",
  reason: "planner-swarm",
  commit: "memory-lattice",
  verify: "integrity-gate",
  feedback: "actuator-grid",
  optimize: "sim-lab"
};

const phasePurpose: Record<PhaseId, string[]> = {
  ingest: ["ingestion", "alignment", "neurodata"],
  synchronize: ["alignment", "clock-sync", "quality-control"],
  decode: ["decoding", "reflex-control"],
  route: ["routing", "policy", "scheduling"],
  reason: ["planning", "orchestration", "agent-runtime"],
  commit: ["memory", "checkpoint", "audit"],
  verify: ["integrity", "verification", "checkpoint-gate"],
  feedback: ["feedback", "actuation", "closed-loop"],
  optimize: ["optimization", "learning", "lineage"]
};

const phaseIncrement: Record<PhaseId, number> = {
  ingest: 0.18,
  synchronize: 0.16,
  decode: 0.14,
  route: 0.12,
  reason: 0.1,
  commit: 0.13,
  verify: 0.12,
  feedback: 0.16,
  optimize: 0.08
};

const ENGINE_SERVICE = "immaculate-harness";
const ENGINE_INSTANCE = "orchestration-core";
const HISTORY_LIMIT = 240;
const EVENT_LIMIT = 320;

type EngineState = {
  snapshot: PhaseSnapshot;
  pulse: number;
  history: SnapshotHistoryPoint[];
  events: EventEnvelope[];
  serial: number;
  recordEvents: boolean;
};

function cloneDurableState(durableState: EngineDurableState): EngineDurableState {
  return {
    snapshot: structuredClone(durableState.snapshot),
    history: structuredClone(durableState.history),
    events: structuredClone(durableState.events),
    serial: durableState.serial,
    pulse: durableState.pulse
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function wave(epoch: number, offset = 0, speed = 0.15): number {
  return (Math.sin(epoch * speed + offset) + 1) / 2;
}

function hashValue(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function createPasses(cycle: number, timestamp: string): PhasePass[] {
  return phaseIds.map((phase, index) => ({
    id: `pass-c${cycle}-${phase}`,
    cycle,
    sequence: index + 1,
    phase,
    plane: phaseToPlane[phase],
    state: phase === "ingest" ? "running" : "queued",
    progress: phase === "ingest" ? 0.04 : 0,
    latencyMs: baselineLatency[phase] * planeBias[phaseToPlane[phase]],
    load: 0.22 + index * 0.04,
    dependsOn: phaseDependencies[phase],
    targetNodeId: phaseTargetNode[phase],
    startedAt: timestamp,
    updatedAt: timestamp
  }));
}

function computeMetrics(
  nodes: ConnectomeNode[],
  edges: ConnectomeEdge[],
  passes: PhasePass[]
): PhaseMetrics {
  const reflexPasses = passes.filter((pass) => pass.plane === "reflex");
  const cognitivePasses = passes.filter((pass) => pass.plane === "cognitive");
  const offlinePasses = passes.filter((pass) => pass.plane === "offline");
  const average = (items: PhasePass[]) =>
    items.length > 0 ? items.reduce((sum, item) => sum + item.latencyMs, 0) / items.length : 0;
  const loadAverage = (items: PhasePass[]) =>
    items.length > 0 ? items.reduce((sum, item) => sum + item.load, 0) / items.length : 0;

  return {
    reflexLatencyMs: Number(average(reflexPasses).toFixed(2)),
    cognitiveLatencyMs: Number(average(cognitivePasses).toFixed(2)),
    offlineUtilization: Number(loadAverage(offlinePasses).toFixed(3)),
    propagationRate: Number(
      (edges.reduce((sum, edge) => sum + edge.propagation, 0) / Math.max(edges.length, 1)).toFixed(3)
    ),
    graphHealth: Number(
      (nodes.reduce((sum, node) => sum + node.trust - node.drift * 0.82, 0) / nodes.length).toFixed(3)
    ),
    coherence: Number(
      (nodes.reduce((sum, node) => sum + node.activation * (1 - node.drift), 0) / nodes.length).toFixed(3)
    ),
    throughput: Number(
      (
        nodes.reduce((sum, node) => sum + node.throughput * (1 - node.saturation * 0.18), 0) * 205
      ).toFixed(2)
    ),
    activeAgents: nodes.filter((node) => node.kind === "agent").length * 12
  };
}

function createInitialSnapshot(): PhaseSnapshot {
  const timestamp = new Date().toISOString();
  const passes = createPasses(1, timestamp);
  const edges = edgeTemplate.map((edge, index) => ({
    ...edge,
    propagation: clamp(0.44 + index * 0.04)
  }));
  const metrics = computeMetrics(initialNodes, edges, passes);

  return {
    epoch: 0,
    cycle: 1,
    timestamp,
    status: "running",
    profile: "human-connectome-harness",
    intent: "Map, route, and stabilize live orchestration.",
    objective: "Drive reflex-safe low-latency cognition across a synthetic connectome.",
    nodes: initialNodes,
    edges,
    passes,
    metrics,
    highlightedNodeId: "sensor-array",
    datasets: [],
    neuroSessions: [],
    neuroReplays: [],
    neuroFrames: [],
    intelligenceLayers: [],
    cognitiveExecutions: [],
    routingDecisions: [],
    actuationOutputs: [],
    logTail: []
  };
}

function datasetNodeId(datasetId: string): string {
  return `dataset-${datasetId}`;
}

function mergeDatasetIntoSnapshot(
  snapshot: PhaseSnapshot,
  summary: IngestedDatasetSummary
): PhaseSnapshot {
  const nextDatasets = [summary, ...snapshot.datasets.filter((dataset) => dataset.id !== summary.id)].slice(
    0,
    24
  );
  const nodeId = datasetNodeId(summary.id);
  const datasetIndex = nextDatasets.findIndex((dataset) => dataset.id === summary.id);
  const yOffset = 3.4 - datasetIndex * 1.25;
  const node: ConnectomeNode = {
    id: nodeId,
    label: summary.name,
    kind: "dataset",
    plane: "offline",
    position: {
      x: 8.9,
      y: Math.max(-4.2, yOffset),
      z: -1.6 + (datasetIndex % 3) * 0.85
    },
    throughput: clamp(0.56 + summary.fileCount / 1000, 0.35, 0.88),
    saturation: clamp(0.12 + summary.modalities.length * 0.03, 0.1, 0.42),
    trust: 0.94,
    drift: 0.01,
    load: clamp(0.2 + summary.subjectCount * 0.03 + summary.sessionCount * 0.02, 0.18, 0.72),
    activation: 0.61,
    tags: [
      `source:${summary.source}`,
      `subjects:${summary.subjectCount}`,
      `sessions:${summary.sessionCount}`,
      ...summary.modalities.map((entry) => `modality:${entry.modality}`)
    ]
  };

  const nodes = [...snapshot.nodes.filter((candidate) => candidate.id !== nodeId), node];
  const baseEdges = snapshot.edges.filter(
    (edge) => edge.from !== nodeId && edge.to !== nodeId
  );
  const edges = [
    ...baseEdges,
    {
      id: `${nodeId}-memory`,
      from: nodeId,
      to: "memory-lattice",
      weight: 0.76,
      latencyMs: 41,
      bandwidth: 0.72,
      trust: 0.94,
      propagation: 0.36
    },
    {
      id: `${nodeId}-simlab`,
      from: nodeId,
      to: "sim-lab",
      weight: 0.83,
      latencyMs: 28,
      bandwidth: 0.8,
      trust: 0.91,
      propagation: 0.34
    }
  ];

  return {
    ...snapshot,
    nodes,
    edges,
    datasets: nextDatasets,
    highlightedNodeId: nodeId,
    objective: `Dataset ${summary.name} registered from ${summary.source.toUpperCase()} into the ingest spine.`
  };
}

function neuroSessionNodeId(sessionId: string): string {
  return `neuro-session-${sessionId}`;
}

function intelligenceNodeId(layerId: string): string {
  return `intelligence-layer-${layerId}`;
}

function mergeNeuroSessionIntoSnapshot(
  snapshot: PhaseSnapshot,
  summary: NeuroSessionSummary
): PhaseSnapshot {
  const nextSessions = [
    summary,
    ...snapshot.neuroSessions.filter((session) => session.id !== summary.id)
  ].slice(0, 16);
  const nodeId = neuroSessionNodeId(summary.id);
  const sessionIndex = nextSessions.findIndex((session) => session.id === summary.id);
  const sessionRateFactor = summary.primaryRateHz ? Math.min(summary.primaryRateHz / 1000, 1.5) : 0.6;
  const sessionChannelFactor = Math.min(summary.totalChannels / 16, 1.4);
  const sessionLoad = clamp(0.28 + sessionRateFactor * 0.22 + sessionChannelFactor * 0.18, 0.22, 0.86);
  const sessionNode: ConnectomeNode = {
    id: nodeId,
    label: summary.name,
    kind: "sensor",
    plane: "reflex",
    position: {
      x: -8.3,
      y: Math.max(-4.1, 3.4 - sessionIndex * 1.25),
      z: -2.3 + (sessionIndex % 3) * 0.9
    },
    throughput: clamp(0.54 + sessionRateFactor * 0.18 + sessionChannelFactor * 0.12, 0.45, 0.94),
    saturation: clamp(0.16 + summary.streamCount * 0.05, 0.14, 0.58),
    trust: 0.95,
    drift: 0.01,
    load: sessionLoad,
    activation: clamp(0.46 + sessionRateFactor * 0.18 + sessionChannelFactor * 0.08, 0.4, 0.92),
    tags: [
      "nwb",
      `streams:${summary.streamCount}`,
      `channels:${summary.totalChannels}`,
      ...(summary.primaryRateHz ? [`rate:${summary.primaryRateHz}`] : []),
      ...summary.streams.slice(0, 4).map((stream) => `stream:${stream.kind}`)
    ]
  };

  const nodesWithSession = [...snapshot.nodes.filter((candidate) => candidate.id !== nodeId), sessionNode].map(
    (node) => {
      if (node.id === "sensor-array") {
        return {
          ...node,
          load: clamp(node.load * 0.55 + sessionLoad * 0.45),
          throughput: clamp(node.throughput * 0.58 + sessionNode.throughput * 0.42),
          saturation: clamp(node.saturation * 0.6 + sessionNode.saturation * 0.3),
          activation: clamp(node.activation * 0.54 + sessionNode.activation * 0.38)
        };
      }

      if (node.id === "decoder-stack") {
        return {
          ...node,
          load: clamp(node.load * 0.62 + sessionLoad * 0.34),
          throughput: clamp(node.throughput * 0.66 + sessionRateFactor * 0.18),
          activation: clamp(node.activation * 0.68 + sessionChannelFactor * 0.14)
        };
      }

      return node;
    }
  );

  const baseEdges = snapshot.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  const edges = [
    ...baseEdges,
    {
      id: `${nodeId}-sensor-array`,
      from: nodeId,
      to: "sensor-array",
      weight: 0.92,
      latencyMs: 4,
      bandwidth: 0.91,
      trust: 0.95,
      propagation: 0.4
    },
    {
      id: `${nodeId}-decoder-stack`,
      from: nodeId,
      to: "decoder-stack",
      weight: 0.89,
      latencyMs: 7,
      bandwidth: 0.87,
      trust: 0.93,
      propagation: 0.36
    }
  ];

  return {
    ...snapshot,
    nodes: nodesWithSession,
    edges,
    neuroSessions: nextSessions,
    highlightedNodeId: nodeId,
    objective: `NWB session ${summary.name} registered into synchronize/decode with ${summary.streamCount} streams at ${summary.primaryRateHz ?? "variable"} Hz.`
  };
}

function mergeNeuroReplayIntoSnapshot(
  snapshot: PhaseSnapshot,
  replay: NeuroReplayState
): PhaseSnapshot {
  const nextReplays = [replay, ...snapshot.neuroReplays.filter((candidate) => candidate.id !== replay.id)].slice(
    0,
    16
  );
  const sessionNodeId = neuroSessionNodeId(replay.sessionId);
  const replayPressure =
    replay.totalWindows > 0 ? clamp(replay.completedWindows / replay.totalWindows, 0, 1) : 0;
  const nodes = snapshot.nodes.map((node) => {
    if (node.id === "sensor-array") {
      return {
        ...node,
        load: clamp(node.load * 0.72 + replayPressure * 0.18 + (replay.status === "running" ? 0.08 : 0.02)),
        activation: clamp(node.activation * 0.74 + replay.decodeReadyRatio * 0.16 + 0.08),
        throughput: clamp(node.throughput * 0.78 + replay.decodeReadyRatio * 0.12 + 0.05)
      };
    }

    if (node.id === "decoder-stack") {
      return {
        ...node,
        load: clamp(node.load * 0.76 + replay.decodeReadyRatio * 0.14 + 0.04),
        activation: clamp(node.activation * 0.7 + replay.decodeReadyRatio * 0.18 + 0.06),
        throughput: clamp(node.throughput * 0.74 + replay.decodeReadyRatio * 0.18 + 0.04)
      };
    }

    if (node.id === sessionNodeId) {
      return {
        ...node,
        load: clamp(node.load * 0.66 + replayPressure * 0.22 + 0.06),
        activation: clamp(node.activation * 0.64 + replay.decodeReadyRatio * 0.22 + 0.06),
        saturation: clamp(node.saturation * 0.7 + replayPressure * 0.18),
        tags: [
          ...node.tags.filter((tag) => !tag.startsWith("replay:") && !tag.startsWith("windows:")),
          `replay:${replay.status}`,
          `windows:${replay.completedWindows}/${replay.totalWindows}`
        ]
      };
    }

    return node;
  });

  const sourceLabel = replay.source === "live-socket" ? "Live ingress" : "Replay";
  return {
    ...snapshot,
    nodes,
    neuroReplays: nextReplays,
    highlightedNodeId: nodes.some((node) => node.id === sessionNodeId)
      ? sessionNodeId
      : snapshot.highlightedNodeId,
    objective:
      replay.status === "completed"
        ? `${sourceLabel} ${replay.name} completed ${replay.completedWindows}/${replay.totalWindows} windows with ${(replay.decodeReadyRatio * 100).toFixed(1)}% decode-ready coverage.`
        : replay.status === "stopped"
          ? `${sourceLabel} ${replay.name} stopped after ${replay.completedWindows}/${replay.totalWindows} windows.`
          : `${sourceLabel} ${replay.name} streaming ${replay.completedWindows}/${replay.totalWindows} windows into synchronize/decode.`
  };
}

function mergeNeuroFrameIntoSnapshot(
  snapshot: PhaseSnapshot,
  frame: NeuroFrameWindow
): PhaseSnapshot {
  const nextFrames = [frame, ...snapshot.neuroFrames.filter((candidate) => candidate.id !== frame.id)].slice(
    0,
    48
  );
  const channelFactor = clamp(frame.channelCount / 16, 0, 1);
  const intensity = clamp(frame.meanAbs * 2.8 + frame.peak * 1.9, 0, 1);
  const syncHealth = clamp(1 - frame.syncJitterMs / 12, 0, 1);
  const sessionNodeId = neuroSessionNodeId(frame.sessionId);

  const nodes = snapshot.nodes.map((node) => {
    if (node.id === "sensor-array") {
      return {
        ...node,
        activation: clamp(node.activation * 0.46 + intensity * 0.36 + 0.08),
        load: clamp(node.load * 0.54 + channelFactor * 0.24 + 0.08),
        saturation: clamp(node.saturation * 0.64 + (1 - syncHealth) * 0.18 + 0.06),
        throughput: clamp(node.throughput * 0.62 + syncHealth * 0.16 + channelFactor * 0.12),
        tags: [
          ...node.tags.filter((tag) => !tag.startsWith("frame:") && !tag.startsWith("sync:")),
          `frame:${frame.windowIndex}`,
          `sync:${frame.syncJitterMs.toFixed(2)}`
        ]
      };
    }

    if (node.id === "decoder-stack") {
      return {
        ...node,
        activation: clamp(node.activation * 0.48 + frame.decodeConfidence * 0.38 + 0.08),
        load: clamp(node.load * 0.58 + frame.decodeConfidence * 0.22 + 0.08),
        trust: clamp(node.trust * 0.84 + (frame.decodeReady ? 0.12 : -0.04), 0.3, 0.99),
        drift: clamp(node.drift * 0.78 + (frame.decodeReady ? 0.01 : 0.04), 0.01, 0.2),
        throughput: clamp(node.throughput * 0.58 + frame.decodeConfidence * 0.28 + 0.08),
        tags: [
          ...node.tags.filter((tag) => !tag.startsWith("decode:") && !tag.startsWith("confidence:")),
          `decode:${frame.decodeReady ? "ready" : "warming"}`,
          `confidence:${frame.decodeConfidence.toFixed(2)}`
        ]
      };
    }

    if (node.id === sessionNodeId) {
      return {
        ...node,
        activation: clamp(node.activation * 0.44 + intensity * 0.34 + 0.12),
        load: clamp(node.load * 0.56 + channelFactor * 0.22 + 0.06),
        saturation: clamp(node.saturation * 0.68 + (1 - syncHealth) * 0.16 + 0.04)
      };
    }

    if (node.id === "router-core" && frame.decodeReady) {
      return {
        ...node,
        activation: clamp(node.activation * 0.82 + frame.decodeConfidence * 0.12),
        throughput: clamp(node.throughput * 0.86 + frame.decodeConfidence * 0.08)
      };
    }

    return node;
  });

  const passes = snapshot.passes.map((pass) => {
    if (pass.phase !== "synchronize" && pass.phase !== "decode") {
      return pass;
    }

    const isSynchronize = pass.phase === "synchronize";
    const latencyMs = isSynchronize
      ? Number((pass.latencyMs * 0.62 + frame.syncJitterMs * 1.8 + 3.5).toFixed(2))
      : Number((pass.latencyMs * 0.58 + (1 - frame.decodeConfidence) * 24 + 6).toFixed(2));
    const load = isSynchronize
      ? clamp(pass.load * 0.6 + channelFactor * 0.2 + syncHealth * 0.12)
      : clamp(pass.load * 0.58 + frame.decodeConfidence * 0.22 + channelFactor * 0.08);
    const progressBoost = isSynchronize
      ? 0.04 + syncHealth * 0.05
      : 0.05 + frame.decodeConfidence * 0.08;
    const progress = passIsActive(pass) ? clamp(Math.min(pass.progress + progressBoost, 0.95), 0, 0.95) : pass.progress;

    return {
      ...pass,
      latencyMs,
      load,
      progress,
      updatedAt: frame.capturedAt
    };
  });

  return {
    ...snapshot,
    nodes,
    passes,
    neuroFrames: nextFrames,
    highlightedNodeId: frame.decodeReady ? "decoder-stack" : "sensor-array",
    objective: `${frame.source === "live-socket" ? "Live" : "Replay"} window ${frame.windowIndex + 1} synchronized at ${frame.syncJitterMs.toFixed(2)} ms jitter with ${(frame.decodeConfidence * 100).toFixed(1)}% decode confidence.`
  };
}

function mergeIntelligenceLayerIntoSnapshot(
  snapshot: PhaseSnapshot,
  layer: IntelligenceLayer
): PhaseSnapshot {
  const nextLayers = [layer, ...snapshot.intelligenceLayers.filter((candidate) => candidate.id !== layer.id)].slice(
    0,
    12
  );
  const nodeId = intelligenceNodeId(layer.id);
  const layerIndex = nextLayers.findIndex((candidate) => candidate.id === layer.id);
  const roleBias =
    layer.role === "soul" ? 0.08 : layer.role === "mid" ? 0.14 : layer.role === "reasoner" ? 0.18 : 0.1;
  const statusBias =
    layer.status === "ready" ? 0.12 : layer.status === "busy" ? 0.2 : layer.status === "degraded" ? -0.08 : -0.14;
  const layerNode: ConnectomeNode = {
    id: nodeId,
    label: layer.name,
    kind: "agent",
    plane: "cognitive",
    position: {
      x: 1.6 + (layerIndex % 2) * 2.1,
      y: Math.max(-3.8, 3.1 - layerIndex * 1.15),
      z: -1.1 + (layerIndex % 3) * 0.92
    },
    throughput: clamp(0.58 + roleBias + statusBias, 0.36, 0.96),
    saturation: clamp(0.18 + layerIndex * 0.04 + (layer.status === "busy" ? 0.12 : 0.04), 0.12, 0.66),
    trust: clamp(0.9 + (layer.status === "degraded" ? -0.1 : layer.status === "offline" ? -0.2 : 0.03), 0.48, 0.99),
    drift: clamp(layer.status === "degraded" ? 0.08 : layer.status === "offline" ? 0.12 : 0.02, 0.01, 0.18),
    load: clamp(0.28 + roleBias * 0.9 + (layer.status === "busy" ? 0.22 : 0.08), 0.2, 0.86),
    activation: clamp(0.42 + roleBias + (layer.status === "offline" ? -0.22 : 0.12), 0.16, 0.95),
    tags: [
      `backend:${layer.backend}`,
      `role:${layer.role}`,
      `model:${layer.model}`,
      `status:${layer.status}`,
      ...(layer.family ? [`family:${layer.family}`] : []),
      ...(layer.parameterSize ? [`params:${layer.parameterSize}`] : []),
      ...(layer.quantization ? [`quant:${layer.quantization}`] : [])
    ]
  };

  const nodes = [...snapshot.nodes.filter((candidate) => candidate.id !== nodeId), layerNode].map((node) => {
    if (node.id === "router-core") {
      return {
        ...node,
        activation: clamp(node.activation * 0.62 + layerNode.activation * 0.3),
        load: clamp(node.load * 0.68 + layerNode.load * 0.18),
        throughput: clamp(node.throughput * 0.72 + layerNode.throughput * 0.2)
      };
    }

    if (node.id === "planner-swarm") {
      return {
        ...node,
        activation: clamp(node.activation * 0.58 + layerNode.activation * 0.34),
        load: clamp(node.load * 0.62 + layerNode.load * 0.22),
        throughput: clamp(node.throughput * 0.7 + layerNode.throughput * 0.22)
      };
    }

    if (node.id === "memory-lattice") {
      return {
        ...node,
        activation: clamp(node.activation * 0.72 + layerNode.activation * 0.12),
        load: clamp(node.load * 0.76 + layerNode.load * 0.1)
      };
    }

    return node;
  });

  const baseEdges = snapshot.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  const edges = [
    ...baseEdges,
    {
      id: `${nodeId}-router-core`,
      from: "router-core",
      to: nodeId,
      weight: 0.88,
      latencyMs: 19,
      bandwidth: 0.84,
      trust: 0.91,
      propagation: 0.33
    },
    {
      id: `${nodeId}-planner-swarm`,
      from: nodeId,
      to: "planner-swarm",
      weight: 0.91,
      latencyMs: 27,
      bandwidth: 0.86,
      trust: 0.9,
      propagation: 0.35
    },
    {
      id: `${nodeId}-memory-lattice`,
      from: nodeId,
      to: "memory-lattice",
      weight: 0.82,
      latencyMs: 23,
      bandwidth: 0.81,
      trust: 0.92,
      propagation: 0.31
    },
    ...(layer.role === "guard"
      ? [
          {
            id: `${nodeId}-integrity-gate`,
            from: nodeId,
            to: "integrity-gate",
            weight: 0.87,
            latencyMs: 17,
            bandwidth: 0.78,
            trust: 0.95,
            propagation: 0.29
          } satisfies ConnectomeEdge
        ]
      : [])
  ];

  return {
    ...snapshot,
    nodes,
    edges,
    intelligenceLayers: nextLayers,
    highlightedNodeId: nodeId,
    objective: `Intelligence layer ${layer.name} registered as ${layer.role} on ${layer.backend} (${layer.model}).`
  };
}

function mergeCognitiveExecutionIntoSnapshot(
  snapshot: PhaseSnapshot,
  execution: CognitiveExecution
): PhaseSnapshot {
  const nextExecutions = [
    execution,
    ...snapshot.cognitiveExecutions.filter((candidate) => candidate.id !== execution.id)
  ].slice(0, 24);
  const nodeId = intelligenceNodeId(execution.layerId);
  const responseFactor = execution.status === "completed" ? 0.18 : -0.12;
  const latencyFactor = Math.min(execution.latencyMs / 5000, 1);
  const nodes = snapshot.nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        activation: clamp(node.activation * 0.54 + 0.28 + responseFactor),
        load: clamp(node.load * 0.42 + 0.3 + latencyFactor * 0.22),
        saturation: clamp(node.saturation * 0.56 + latencyFactor * 0.28),
        trust: clamp(node.trust * 0.88 + (execution.status === "completed" ? 0.1 : -0.08), 0.32, 0.99),
        drift: clamp(node.drift * 0.7 + (execution.status === "completed" ? 0.01 : 0.05), 0.01, 0.2),
        tags: [
          ...node.tags.filter((tag) => !tag.startsWith("last-exec:") && !tag.startsWith("last-status:")),
          `last-exec:${execution.id}`,
          `last-status:${execution.status}`
        ]
      };
    }

    if (node.id === "router-core") {
      return {
        ...node,
        activation: clamp(node.activation * 0.62 + 0.16 + responseFactor * 0.2),
        load: clamp(node.load * 0.74 + latencyFactor * 0.16),
        throughput: clamp(node.throughput * 0.7 + (execution.status === "completed" ? 0.12 : -0.06))
      };
    }

    if (node.id === "memory-lattice") {
      return {
        ...node,
        activation: clamp(node.activation * 0.76 + (execution.status === "completed" ? 0.11 : -0.04)),
        load: clamp(node.load * 0.8 + latencyFactor * 0.08)
      };
    }

    return node;
  });

  const edges = snapshot.edges.map((edge) => {
    if (edge.from === nodeId || edge.to === nodeId) {
      return {
        ...edge,
        propagation: clamp(edge.propagation * 0.58 + (execution.status === "completed" ? 0.28 : 0.14)),
        trust: clamp(edge.trust * 0.86 + (execution.status === "completed" ? 0.1 : -0.08), 0.28, 0.99)
      };
    }
    return edge;
  });

  return {
    ...snapshot,
    nodes,
    edges,
    cognitiveExecutions: nextExecutions,
    highlightedNodeId: nodes.some((node) => node.id === nodeId) ? nodeId : snapshot.highlightedNodeId,
    objective: `Cognitive execution ${execution.id} ${execution.status} on ${execution.model} in ${execution.latencyMs.toFixed(1)} ms.`
  };
}

function mergeRoutingDecisionIntoSnapshot(
  snapshot: PhaseSnapshot,
  decision: RoutingDecision
): PhaseSnapshot {
  const nextDecisions = [
    decision,
    ...snapshot.routingDecisions.filter((candidate) => candidate.id !== decision.id)
  ].slice(0, 24);
  const decodeFactor = clamp(decision.decodeConfidence, 0, 1);
  const governanceDrag =
    decision.governancePressure === "critical"
      ? 0.22
      : decision.governancePressure === "elevated"
        ? 0.1
        : 0.02;
  const transportConfidence =
    decision.transportHealth === "healthy"
      ? 0.18
      : decision.transportHealth === "degraded"
        ? 0.08
        : decision.transportHealth === "faulted" || decision.transportHealth === "isolated"
          ? -0.12
          : 0.02;
  const routeBias =
    decision.mode === "reflex-direct"
      ? 0.18
      : decision.mode === "cognitive-assisted"
        ? 0.12
        : decision.mode === "guarded-fallback"
          ? -0.04
          : decision.mode === "operator-override"
            ? 0.06
            : -0.14;

  const nodes = snapshot.nodes.map((node) => {
    if (node.id === "router-core") {
      return {
        ...node,
        activation: clamp(node.activation * 0.58 + decodeFactor * 0.18 + transportConfidence + 0.08),
        load: clamp(node.load * 0.62 + governanceDrag * 0.22 + (1 - decodeFactor) * 0.08 + 0.06),
        throughput: clamp(node.throughput * 0.68 + transportConfidence * 0.4 + decodeFactor * 0.12 + 0.06),
        trust: clamp(node.trust * 0.84 + (decision.governancePressure === "clear" ? 0.08 : -0.04), 0.32, 0.99),
        tags: [
          ...node.tags.filter(
            (tag) =>
              !tag.startsWith("route-mode:") &&
              !tag.startsWith("route-channel:") &&
              !tag.startsWith("route-governance:")
          ),
          `route-mode:${decision.mode}`,
          `route-channel:${decision.channel}`,
          `route-governance:${decision.governancePressure}`
        ]
      };
    }

    if (node.id === "planner-swarm") {
      const plannerBias = decision.mode === "cognitive-assisted" ? 0.18 : decision.mode === "guarded-fallback" ? 0.08 : 0.02;
      return {
        ...node,
        activation: clamp(node.activation * 0.66 + plannerBias + 0.04),
        load: clamp(node.load * 0.72 + plannerBias * 0.4),
        throughput: clamp(node.throughput * 0.74 + plannerBias * 0.32)
      };
    }

    if (node.id === "integrity-gate") {
      return {
        ...node,
        activation: clamp(node.activation * 0.74 + governanceDrag * 0.42 + 0.04),
        load: clamp(node.load * 0.78 + governanceDrag * 0.24)
      };
    }

    if (node.id === decision.targetNodeId) {
      return {
        ...node,
        activation: clamp(node.activation * 0.52 + Math.max(routeBias, 0) * 0.44 + 0.12),
        throughput: clamp(node.throughput * 0.6 + Math.max(routeBias, 0) * 0.3 + 0.08),
        trust: clamp(node.trust * 0.9 + transportConfidence * 0.3, 0.28, 0.99)
      };
    }

    return node;
  });

  const passes = snapshot.passes.map((pass) => {
    if (pass.phase !== "route" && pass.phase !== "feedback") {
      return pass;
    }

    const routePhase = pass.phase === "route";
    const latencyAdjustment = routePhase
      ? (1 - decodeFactor) * 11 + governanceDrag * 18 - transportConfidence * 8
      : governanceDrag * 16 + (decision.mode === "suppressed" ? 18 : 0) - transportConfidence * 10;
    const loadAdjustment = routePhase
      ? governanceDrag * 0.28 + (decision.mode === "cognitive-assisted" ? 0.1 : 0.04)
      : governanceDrag * 0.22 + (decision.mode === "guarded-fallback" ? 0.08 : 0.02);
    const progressAdjustment = routePhase
      ? decodeFactor * 0.06 + Math.max(transportConfidence, 0) * 0.1
      : decision.mode === "suppressed"
        ? -0.08
        : decodeFactor * 0.04 + Math.max(transportConfidence, 0) * 0.08;

    return {
      ...pass,
      targetNodeId: routePhase ? "router-core" : decision.targetNodeId,
      latencyMs: Number(Math.max(1, pass.latencyMs * 0.72 + latencyAdjustment + 4).toFixed(2)),
      load: clamp(pass.load * 0.68 + loadAdjustment),
      progress: clamp(pass.progress + progressAdjustment, 0, 1),
      updatedAt: decision.selectedAt
    };
  });

  return {
    ...snapshot,
    nodes,
    passes,
    routingDecisions: nextDecisions,
    highlightedNodeId: nodes.some((node) => node.id === decision.targetNodeId)
      ? decision.targetNodeId
      : "router-core",
    objective: `Route ${decision.mode} selected for ${decision.channel} feedback toward ${decision.targetNodeId} with ${decision.governancePressure} governance pressure and ${(decision.decodeConfidence * 100).toFixed(1)}% decode confidence.`
  };
}

function mergeActuationOutputIntoSnapshot(
  snapshot: PhaseSnapshot,
  output: ActuationOutput
): PhaseSnapshot {
  const nextOutputs = [
    output,
    ...snapshot.actuationOutputs.filter((candidate) => candidate.id !== output.id)
  ].slice(0, 24);
  const actuatorIntensity = clamp(output.intensity, 0, 1);
  const dispatchBias = output.status === "dispatched" ? 0.16 : -0.08;
  const nodes = snapshot.nodes.map((node) => {
    if (node.id === output.targetNodeId) {
      return {
        ...node,
        activation: clamp(node.activation * 0.44 + actuatorIntensity * 0.38 + 0.12),
        load: clamp(node.load * 0.56 + actuatorIntensity * 0.26 + 0.08),
        saturation: clamp(node.saturation * 0.62 + actuatorIntensity * 0.18 + 0.04),
        throughput: clamp(node.throughput * 0.58 + actuatorIntensity * 0.22 + dispatchBias),
        trust: clamp(node.trust * 0.9 + (output.status === "dispatched" ? 0.04 : -0.06), 0.32, 0.99),
        tags: [
          ...node.tags.filter(
            (tag) =>
              !tag.startsWith("actuation:") &&
              !tag.startsWith("channel:") &&
              !tag.startsWith("command:")
          ),
          `actuation:${output.status}`,
          `channel:${output.channel}`,
          `command:${output.command}`
        ]
      };
    }

    if (node.id === "integrity-gate") {
      return {
        ...node,
        activation: clamp(node.activation * 0.72 + actuatorIntensity * 0.12 + 0.06),
        load: clamp(node.load * 0.78 + actuatorIntensity * 0.08)
      };
    }

    return node;
  });

  const edges = snapshot.edges.map((edge) => {
    if (edge.to === output.targetNodeId || edge.from === output.targetNodeId) {
      return {
        ...edge,
        propagation: clamp(
          edge.propagation * 0.56 +
            actuatorIntensity * 0.24 +
            (output.status === "dispatched" ? 0.14 : 0.04)
        ),
        trust: clamp(
          edge.trust * 0.9 + (output.status === "dispatched" ? 0.04 : -0.06),
          0.3,
          0.99
        )
      };
    }
    return edge;
  });

  return {
    ...snapshot,
    nodes,
    edges,
    actuationOutputs: nextOutputs,
    highlightedNodeId: nodes.some((node) => node.id === output.targetNodeId)
      ? output.targetNodeId
      : snapshot.highlightedNodeId,
    objective: `Actuation output ${output.id} ${output.status} on ${output.channel} to ${output.targetNodeId} at ${(actuatorIntensity * 100).toFixed(1)}% intensity.`
  };
}

function createHistoryPoint(snapshot: PhaseSnapshot): SnapshotHistoryPoint {
  return {
    epoch: snapshot.epoch,
    cycle: snapshot.cycle,
    timestamp: snapshot.timestamp,
    status: snapshot.status,
    reflexLatencyMs: snapshot.metrics.reflexLatencyMs,
    cognitiveLatencyMs: snapshot.metrics.cognitiveLatencyMs,
    propagationRate: snapshot.metrics.propagationRate,
    coherence: snapshot.metrics.coherence,
    throughput: snapshot.metrics.throughput
  };
}

function historyPointKey(point: SnapshotHistoryPoint): string {
  return `${point.timestamp}|${point.cycle}|${point.epoch}`;
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildIntegrityReport(
  durableState: EngineDurableState,
  checkedAt = new Date().toISOString()
): IntegrityReport {
  const findings: IntegrityFinding[] = [];
  const nodeIds = new Set<string>();
  const eventIds = new Set<string>();
  const currentCyclePasses = durableState.snapshot.passes.filter(
    (pass) => pass.cycle === durableState.snapshot.cycle
  );
  const passByPhase = new Map(currentCyclePasses.map((pass) => [pass.phase, pass]));

  for (const node of durableState.snapshot.nodes) {
    if (nodeIds.has(node.id)) {
      findings.push({
        code: "duplicate_node_id",
        severity: "critical",
        message: `duplicate node id ${node.id} detected`,
        subjectId: node.id,
        cycle: durableState.snapshot.cycle
      });
      continue;
    }
    nodeIds.add(node.id);
  }

  for (const edge of durableState.snapshot.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      findings.push({
        code: "edge_endpoint_missing",
        severity: "critical",
        message: `edge ${edge.id} references a missing node endpoint`,
        subjectId: edge.id,
        cycle: durableState.snapshot.cycle
      });
    }
  }

  if (!nodeIds.has(durableState.snapshot.highlightedNodeId)) {
    findings.push({
      code: "highlighted_node_missing",
      severity: "warning",
      message: `highlighted node ${durableState.snapshot.highlightedNodeId} is not present in topology`,
      subjectId: durableState.snapshot.highlightedNodeId,
      cycle: durableState.snapshot.cycle
    });
  }

  if (currentCyclePasses.length !== phaseIds.length) {
    findings.push({
      code: "cycle_pass_count_mismatch",
      severity: "critical",
      message: `cycle ${durableState.snapshot.cycle} expected ${phaseIds.length} passes but found ${currentCyclePasses.length}`,
      cycle: durableState.snapshot.cycle
    });
  }

  if (passByPhase.size !== currentCyclePasses.length) {
    findings.push({
      code: "duplicate_phase_pass",
      severity: "critical",
      message: `cycle ${durableState.snapshot.cycle} contains duplicate phase passes`,
      cycle: durableState.snapshot.cycle
    });
  }

  for (const phase of phaseIds) {
    const pass = passByPhase.get(phase);
    if (!pass) {
      findings.push({
        code: "missing_phase_pass",
        severity: "critical",
        message: `cycle ${durableState.snapshot.cycle} is missing phase ${phase}`,
        phase,
        cycle: durableState.snapshot.cycle
      });
      continue;
    }

    if (!nodeIds.has(pass.targetNodeId)) {
      findings.push({
        code: "missing_pass_target",
        severity: "critical",
        message: `phase ${phase} targets missing node ${pass.targetNodeId}`,
        phase,
        subjectId: pass.targetNodeId,
        cycle: durableState.snapshot.cycle
      });
    }

    if (pass.plane !== phaseToPlane[phase]) {
      findings.push({
        code: "phase_plane_mismatch",
        severity: "critical",
        message: `phase ${phase} is mapped to ${pass.plane} instead of ${phaseToPlane[phase]}`,
        phase,
        cycle: durableState.snapshot.cycle
      });
    }

    if (!arraysEqual(pass.dependsOn, phaseDependencies[phase])) {
      findings.push({
        code: "phase_dependency_mismatch",
        severity: "critical",
        message: `phase ${phase} has non-canonical dependencies`,
        phase,
        cycle: durableState.snapshot.cycle
      });
    }

    if (pass.sequence !== phaseIds.indexOf(phase) + 1) {
      findings.push({
        code: "phase_sequence_mismatch",
        severity: "warning",
        message: `phase ${phase} sequence ${pass.sequence} does not match canonical order`,
        phase,
        cycle: durableState.snapshot.cycle
      });
    }

    if (pass.state === "completed") {
      if (pass.progress < 1 || !pass.completedAt) {
        findings.push({
          code: "completed_pass_incomplete",
          severity: "critical",
          message: `phase ${phase} is marked completed without full progress or completedAt`,
          phase,
          subjectId: pass.id,
          cycle: durableState.snapshot.cycle
        });
      }
    } else {
      if (pass.progress >= 1) {
        findings.push({
          code: "unfinished_pass_full_progress",
          severity: "warning",
          message: `phase ${phase} reached full progress without entering completed state`,
          phase,
          subjectId: pass.id,
          cycle: durableState.snapshot.cycle
        });
      }

      if (pass.completedAt) {
        findings.push({
          code: "unfinished_pass_has_completed_at",
          severity: "warning",
          message: `phase ${phase} retains completedAt while not completed`,
          phase,
          subjectId: pass.id,
          cycle: durableState.snapshot.cycle
        });
      }
    }

    if (pass.state !== "queued" && pass.state !== "idle") {
      for (const dependency of phaseDependencies[phase]) {
        const dependencyPass = passByPhase.get(dependency);
        if (!dependencyPass || dependencyPass.state !== "completed") {
          findings.push({
            code: "dependency_not_completed",
            severity: "critical",
            message: `phase ${phase} advanced before dependency ${dependency} completed`,
            phase,
            cycle: durableState.snapshot.cycle
          });
        }
      }
    }
  }

  const activePassCount = currentCyclePasses.filter((pass) => passIsActive(pass)).length;
  const verificationBarrierOpen =
    passByPhase.get("verify")?.state === "completed" &&
    passByPhase.get("feedback")?.state === "queued";
  if (activePassCount > 1) {
    findings.push({
      code: "multiple_active_passes",
      severity: "critical",
      message: `cycle ${durableState.snapshot.cycle} has ${activePassCount} active passes`,
      cycle: durableState.snapshot.cycle
    });
  }

  if (
    durableState.snapshot.status === "running" &&
    activePassCount === 0 &&
    currentCyclePasses.some((pass) => pass.state !== "completed") &&
    !verificationBarrierOpen
  ) {
    findings.push({
      code: "running_cycle_without_active_pass",
      severity: "warning",
      message: `cycle ${durableState.snapshot.cycle} is running without an active pass`,
      cycle: durableState.snapshot.cycle
    });
  }

  for (const event of durableState.events) {
    if (eventIds.has(event.eventId)) {
      findings.push({
        code: "duplicate_event_id",
        severity: "critical",
        message: `duplicate event id ${event.eventId} detected`,
        subjectId: event.eventId,
        cycle: durableState.snapshot.cycle
      });
      continue;
    }
    eventIds.add(event.eventId);
  }

  if (
    durableState.events.length > 0 &&
    durableState.snapshot.lastEventId &&
    durableState.snapshot.lastEventId !== durableState.events[0]?.eventId
  ) {
    findings.push({
      code: "snapshot_event_head_mismatch",
      severity: "critical",
      message: `snapshot lastEventId ${durableState.snapshot.lastEventId} does not match event head ${durableState.events[0]?.eventId}`,
      subjectId: durableState.snapshot.lastEventId,
      cycle: durableState.snapshot.cycle
    });
  }

  const maxEventSerial = durableState.events.reduce(
    (max, event) => Math.max(max, serialFromEventId(event.eventId)),
    0
  );
  if (durableState.serial < maxEventSerial) {
    findings.push({
      code: "serial_regression",
      severity: "critical",
      message: `serial ${durableState.serial} is behind event lineage ${maxEventSerial}`,
      cycle: durableState.snapshot.cycle
    });
  }

  if (durableState.history.length === 0) {
    findings.push({
      code: "history_empty",
      severity: "warning",
      message: "history is empty and cannot prove materialization continuity",
      cycle: durableState.snapshot.cycle
    });
  } else {
    const head = durableState.history[0];
    if (head.cycle !== durableState.snapshot.cycle || head.epoch !== durableState.snapshot.epoch) {
      findings.push({
        code: "history_head_mismatch",
        severity: "warning",
        message: `history head ${head.cycle}/${head.epoch} does not match snapshot ${durableState.snapshot.cycle}/${durableState.snapshot.epoch}`,
        cycle: durableState.snapshot.cycle
      });
    }
  }

  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const status =
    criticalCount > 0 ? "invalid" : findings.length > 0 ? "degraded" : "verified";

  return {
    valid: criticalCount === 0,
    status,
    checkedAt,
    currentCycle: durableState.snapshot.cycle,
    activePassCount,
    findingCount: findings.length,
    findings
  };
}

export function inspectDurableState(
  durableState: EngineDurableState,
  checkedAt = new Date().toISOString()
): IntegrityReport {
  const parsed = engineDurableStateSchema.parse(durableState) as EngineDurableState;
  return buildIntegrityReport(parsed, checkedAt);
}

function dependenciesSatisfied(pass: PhasePass, passes: PhasePass[]): boolean {
  return pass.dependsOn.every((dependency) =>
    passes.some(
      (candidate) =>
        candidate.cycle === pass.cycle &&
        candidate.phase === dependency &&
        candidate.state === "completed"
    )
  );
}

function passIsActive(pass: PhasePass): boolean {
  return pass.state === "running" || pass.state === "degraded";
}

function activateNextReadyPass(
  state: EngineState,
  passes: PhasePass[],
  timestamp: string
): PhasePass[] {
  const nextIndex = passes.findIndex(
    (pass) => pass.state === "queued" && dependenciesSatisfied(pass, passes)
  );

  if (nextIndex === -1) {
    return passes;
  }

  const nextPass = {
    ...passes[nextIndex],
    state: "running" as const,
    progress: Math.max(passes[nextIndex].progress, 0.04),
    startedAt: timestamp,
    updatedAt: timestamp
  };

  pushEvent(state, {
    schemaName: "immaculate.pass.start",
    subject: { type: "pass", id: nextPass.id },
    purpose: [...phasePurpose[nextPass.phase], "phase-start"],
    payload: {
      cycle: nextPass.cycle,
      phase: nextPass.phase,
      plane: nextPass.plane,
      targetNodeId: nextPass.targetNodeId
    },
    summary: `cycle ${nextPass.cycle} / ${nextPass.phase} started on ${nextPass.targetNodeId}`
  });

  return passes.map((pass, index) => (index === nextIndex ? nextPass : pass));
}

function pushEvent(
  state: EngineState,
  input: {
    schemaName?: string;
    subject: EventEnvelope["subject"];
    purpose: string[];
    payload: Record<string, unknown>;
    summary: string;
  }
) {
  if (!state.recordEvents) {
    return;
  }

  state.serial += 1;
  const eventTimeUtc = new Date().toISOString();
  const eventId = `evt-${state.snapshot.cycle}-${state.snapshot.epoch + 1}-${state.serial}`;
  const payload = {
    ...input.payload,
    summary: input.summary
  };
  const event: EventEnvelope = {
    eventId,
    eventTimeUtc,
    producer: {
      service: ENGINE_SERVICE,
      instance: ENGINE_INSTANCE
    },
    subject: input.subject,
    purpose: input.purpose,
    consent: {
      policyId: "neurodata-default",
      scopeHash: hashValue(input.purpose.join("|"))
    },
    schema: {
      name: input.schemaName ?? "immaculate.event",
      version: "1.0.0"
    },
    payload,
    integrity: {
      hash: hashValue(JSON.stringify({ eventId, eventTimeUtc, payload }))
    },
    summary: input.summary
  };

  state.events = [event, ...state.events].slice(0, EVENT_LIMIT);
}

function refreshLogTail(state: EngineState): void {
  state.snapshot = {
    ...state.snapshot,
    logTail: state.events.slice(0, 8).map((event) => event.summary),
    lastEventId: state.events[0]?.eventId
  };
}

function materializeHistory(state: EngineState): void {
  const nextPoint = createHistoryPoint(state.snapshot);
  const existingHead = state.history[0];
  if (existingHead && historyPointKey(existingHead) === historyPointKey(nextPoint)) {
    return;
  }
  state.history = [nextPoint, ...state.history].slice(0, HISTORY_LIMIT);
}

function completeCycle(state: EngineState, timestamp: string): PhasePass[] {
  pushEvent(state, {
    schemaName: "immaculate.cycle.complete",
    subject: { type: "cycle", id: `cycle-${state.snapshot.cycle}` },
    purpose: ["orchestration", "cycle-complete", "materialization"],
    payload: {
      cycle: state.snapshot.cycle,
      epoch: state.snapshot.epoch
    },
    summary: `cycle ${state.snapshot.cycle} completed and materialized`
  });

  const nextCycle = state.snapshot.cycle + 1;
  pushEvent(state, {
    schemaName: "immaculate.cycle.start",
    subject: { type: "cycle", id: `cycle-${nextCycle}` },
    purpose: ["orchestration", "cycle-start", "queue"],
    payload: {
      cycle: nextCycle
    },
    summary: `cycle ${nextCycle} queued with canonical pass graph`
  });

  return createPasses(nextCycle, timestamp);
}

function evolveNodes(
  snapshot: PhaseSnapshot,
  epoch: number,
  pulse: number,
  runningPass: PhasePass | undefined
): ConnectomeNode[] {
  return snapshot.nodes.map((node, index) => {
    const base = wave(epoch, index * 0.63, 0.22);
    const burst = wave(epoch, index * 0.27, 0.38);
    const activeBoost = runningPass?.targetNodeId === node.id ? 0.24 : 0;
    const planeMultiplier =
      node.plane === "reflex" ? 1.16 : node.plane === "cognitive" ? 1.04 : 0.92;
    const activation = clamp(0.2 + base * 0.55 * planeMultiplier + activeBoost + pulse * 0.12);
    const load = clamp(node.load * 0.45 + burst * 0.4 + activeBoost * 0.4);
    const saturation = clamp(node.saturation * 0.58 + wave(epoch, index * 0.14, 0.16) * 0.3 + activeBoost * 0.2);
    const drift = clamp(node.drift * 0.82 + wave(epoch, index * 0.17, 0.09) * 0.06, 0.01, 0.16);
    return {
      ...node,
      activation,
      load,
      saturation,
      drift,
      throughput: clamp(node.throughput * 0.52 + activation * 0.48),
      position: {
        x: node.position.x + Math.sin(epoch * 0.03 + index) * (runningPass?.targetNodeId === node.id ? 0.06 : 0.025),
        y: node.position.y + Math.cos(epoch * 0.024 + index * 0.31) * (runningPass?.targetNodeId === node.id ? 0.05 : 0.025),
        z: node.position.z + Math.sin(epoch * 0.02 + index * 0.41) * (runningPass?.targetNodeId === node.id ? 0.045 : 0.02)
      }
    };
  });
}

function evolveEdges(
  snapshot: PhaseSnapshot,
  epoch: number,
  pulse: number,
  runningPass: PhasePass | undefined
): ConnectomeEdge[] {
  return snapshot.edges.map((edge, index) => {
    const activeLink =
      runningPass &&
      (edge.from === runningPass.targetNodeId || edge.to === runningPass.targetNodeId)
        ? 0.22
        : 0;
    return {
      ...edge,
      propagation: clamp(
        0.16 + wave(epoch, index * 0.39, 0.18) * edge.weight * 0.62 + activeLink + pulse * 0.16
      )
    };
  });
}

function recomputeLatency(pass: PhasePass, targetNode: ConnectomeNode, epoch: number, pulse: number): number {
  const base = baselineLatency[pass.phase] * planeBias[pass.plane];
  const modulation = 1 + targetNode.load * 0.34 + targetNode.drift * 0.42 + wave(epoch, pass.sequence * 0.46, 0.28) * 0.18 + pulse * 0.08;
  return Number((base * modulation).toFixed(2));
}

function recomputeLoad(pass: PhasePass, targetNode: ConnectomeNode, epoch: number): number {
  return clamp(0.24 + targetNode.load * 0.55 + wave(epoch, pass.sequence * 0.74, 0.2) * 0.18);
}

function advanceSnapshot(state: EngineState, force = false): PhaseSnapshot {
  const previous = state.snapshot;
  const epoch = previous.epoch + 1;
  const timestamp = new Date().toISOString();

  pushEvent(state, {
    schemaName: "immaculate.engine.tick",
    subject: { type: "system", id: "engine" },
    purpose: ["engine-tick", previous.status, force ? "forced" : "scheduled"],
    payload: {
      action: "tick",
      epoch,
      cycle: previous.cycle,
      force
    },
    summary: `engine tick ${epoch} on cycle ${previous.cycle}${force ? " (forced)" : ""}`
  });

  let passes = previous.passes.map((pass) => ({ ...pass }));
  const canProgress = previous.status === "running" || force;

  if (canProgress && !passes.some((pass) => passIsActive(pass))) {
    passes = activateNextReadyPass(state, passes, timestamp);
  }

  const runningBefore = passes.find((pass) => passIsActive(pass));
  let nodes = evolveNodes(previous, epoch, state.pulse, runningBefore);
  let targetLookup = new Map(nodes.map((node) => [node.id, node]));

  const completedThisTick: PhasePass[] = [];
  if (canProgress) {
    passes = passes.map((pass) => {
      const targetNode = targetLookup.get(pass.targetNodeId) ?? nodes[0];
      const latencyMs = recomputeLatency(pass, targetNode, epoch, state.pulse);
      const load = recomputeLoad(pass, targetNode, epoch);

      if (!passIsActive(pass)) {
        return {
          ...pass,
          latencyMs,
          load,
          updatedAt: timestamp
        };
      }

      const increment = phaseIncrement[pass.phase] + targetNode.activation * 0.06 + state.pulse * 0.04;
      const progress = clamp(pass.progress + increment, 0, 1);
      const nextState: PassState = progress >= 1 ? "completed" : progress >= 0.82 ? "degraded" : "running";
      const updated: PhasePass = {
        ...pass,
        progress,
        state: nextState,
        latencyMs,
        load,
        updatedAt: timestamp,
        completedAt: progress >= 1 ? timestamp : pass.completedAt
      };

      if (progress >= 1) {
        completedThisTick.push(updated);
      }

      return updated;
    });

    for (const completedPass of completedThisTick) {
      pushEvent(state, {
        schemaName: "immaculate.pass.complete",
        subject: { type: "pass", id: completedPass.id },
        purpose: [...phasePurpose[completedPass.phase], "phase-complete"],
        payload: {
          cycle: completedPass.cycle,
          phase: completedPass.phase,
          latencyMs: completedPass.latencyMs,
          targetNodeId: completedPass.targetNodeId
        },
        summary: `cycle ${completedPass.cycle} / ${completedPass.phase} completed in ${completedPass.latencyMs.toFixed(1)} ms`
      });
    }

    const verificationBarrierOpened = completedThisTick.some((pass) => pass.phase === "verify");
    if (!passes.some((pass) => passIsActive(pass))) {
      if (passes.every((pass) => pass.state === "completed")) {
        passes = completeCycle(state, timestamp);
      }
      if (!verificationBarrierOpened) {
        passes = activateNextReadyPass(state, passes, timestamp);
      }
    }
  } else {
    passes = passes.map((pass) => ({ ...pass, updatedAt: timestamp }));
  }

  const runningAfter = passes.find((pass) => passIsActive(pass));
  nodes = evolveNodes(previous, epoch, state.pulse, runningAfter);
  targetLookup = new Map(nodes.map((node) => [node.id, node]));
  passes = passes.map((pass) => {
    const targetNode = targetLookup.get(pass.targetNodeId) ?? nodes[0];
    return {
      ...pass,
      latencyMs: recomputeLatency(pass, targetNode, epoch, state.pulse),
      load: recomputeLoad(pass, targetNode, epoch)
    };
  });

  const edges = evolveEdges(previous, epoch, state.pulse, runningAfter);
  const metrics = computeMetrics(nodes, edges, passes);
  const highlightedNode =
    (runningAfter && nodes.find((node) => node.id === runningAfter.targetNodeId)) ??
    nodes.reduce((best, node) => (node.activation > best.activation ? node : best));
  const nextCycle = Math.max(...passes.map((pass) => pass.cycle));
  const cyclePasses = passes.filter((pass) => pass.cycle === nextCycle);
  const verificationBarrierOpen =
    cyclePasses.find((pass) => pass.phase === "verify")?.state === "completed" &&
    cyclePasses.find((pass) => pass.phase === "feedback")?.state === "queued";
  const objective = runningAfter
    ? `Cycle ${nextCycle}: executing ${runningAfter.phase} against ${runningAfter.targetNodeId}.`
    : verificationBarrierOpen
      ? `Cycle ${nextCycle}: verification sealed, checkpoint eligible, feedback held behind the integrity gate.`
      : `Cycle ${nextCycle}: materialized and waiting for the next executable pass.`;

  state.snapshot = {
    ...previous,
    epoch,
    cycle: nextCycle,
    timestamp,
    nodes,
    edges,
    passes,
    metrics,
    objective,
    highlightedNodeId: highlightedNode.id
  };

  refreshLogTail(state);
  materializeHistory(state);
  state.pulse *= 0.72;

  return state.snapshot;
}

function resetState(
  state: EngineState,
  options?: {
    preserveSerial?: boolean;
    bootstrapEvents?: boolean;
    clearEvents?: boolean;
    clearHistory?: boolean;
  }
): void {
  const preserveSerial = options?.preserveSerial ?? false;
  const bootstrapEvents = options?.bootstrapEvents ?? true;
  const clearEvents = options?.clearEvents ?? true;
  const clearHistory = options?.clearHistory ?? true;
  const retainedDatasets = clearEvents ? [] : state.snapshot.datasets;
  const retainedNeuroSessions = clearEvents ? [] : state.snapshot.neuroSessions;
  const retainedNeuroReplays = clearEvents ? [] : state.snapshot.neuroReplays;
  const retainedNeuroFrames = clearEvents ? [] : state.snapshot.neuroFrames;
  const retainedIntelligenceLayers = clearEvents ? [] : state.snapshot.intelligenceLayers;
  const retainedCognitiveExecutions = clearEvents ? [] : state.snapshot.cognitiveExecutions;
  const retainedRoutingDecisions = clearEvents ? [] : state.snapshot.routingDecisions;
  const retainedActuationOutputs = clearEvents ? [] : state.snapshot.actuationOutputs;

  state.snapshot = createInitialSnapshot();
  for (const dataset of retainedDatasets) {
    state.snapshot = mergeDatasetIntoSnapshot(state.snapshot, dataset);
  }
  for (const session of retainedNeuroSessions) {
    state.snapshot = mergeNeuroSessionIntoSnapshot(state.snapshot, session);
  }
  for (const replay of retainedNeuroReplays) {
    state.snapshot = mergeNeuroReplayIntoSnapshot(state.snapshot, replay);
  }
  for (const frame of retainedNeuroFrames) {
    state.snapshot = mergeNeuroFrameIntoSnapshot(state.snapshot, frame);
  }
  for (const layer of retainedIntelligenceLayers) {
    state.snapshot = mergeIntelligenceLayerIntoSnapshot(state.snapshot, layer);
  }
  for (const execution of retainedCognitiveExecutions) {
    state.snapshot = mergeCognitiveExecutionIntoSnapshot(state.snapshot, execution);
  }
  for (const decision of retainedRoutingDecisions) {
    state.snapshot = mergeRoutingDecisionIntoSnapshot(state.snapshot, decision);
  }
  for (const output of retainedActuationOutputs) {
    state.snapshot = mergeActuationOutputIntoSnapshot(state.snapshot, output);
  }
  state.pulse = 0;
  state.history = clearHistory ? [] : state.history;
  state.events = clearEvents ? [] : state.events;
  state.serial = preserveSerial ? state.serial : 0;

  if (bootstrapEvents) {
    pushEvent(state, {
      schemaName: "immaculate.engine.boot",
      subject: { type: "system", id: "engine" },
      purpose: ["orchestration", "boot", "materialization"],
      payload: {
        cycle: state.snapshot.cycle
      },
      summary: `engine booted and cycle ${state.snapshot.cycle} seeded`
    });

    pushEvent(state, {
      schemaName: "immaculate.pass.start",
      subject: { type: "pass", id: state.snapshot.passes[0].id },
      purpose: [...phasePurpose.ingest, "phase-start"],
      payload: {
        cycle: state.snapshot.cycle,
        phase: "ingest",
        targetNodeId: state.snapshot.passes[0].targetNodeId
      },
      summary: `cycle ${state.snapshot.cycle} / ingest started on ${state.snapshot.passes[0].targetNodeId}`
    });
  }

  refreshLogTail(state);
  materializeHistory(state);
}

export function createEngine(options?: {
  durableState?: EngineDurableState;
  bootstrap?: boolean;
  recordEvents?: boolean;
}): {
  getSnapshot: () => PhaseSnapshot;
  getHistory: () => SnapshotHistoryPoint[];
  getEvents: () => EventEnvelope[];
  getDurableState: () => EngineDurableState;
  tick: () => PhaseSnapshot;
  control: (envelope: ControlEnvelope) => PhaseSnapshot;
  registerDataset: (summary: IngestedDatasetSummary) => PhaseSnapshot;
  registerNeuroSession: (summary: NeuroSessionSummary) => PhaseSnapshot;
  upsertNeuroReplay: (replay: NeuroReplayState) => PhaseSnapshot;
  ingestNeuroFrame: (frame: NeuroFrameWindow) => PhaseSnapshot;
  registerIntelligenceLayer: (layer: IntelligenceLayer) => PhaseSnapshot;
  commitCognitiveExecution: (execution: CognitiveExecution) => PhaseSnapshot;
  recordRoutingDecision: (decision: RoutingDecision) => PhaseSnapshot;
  dispatchActuationOutput: (output: ActuationOutput) => PhaseSnapshot;
} {
  const restored = options?.durableState
    ? cloneDurableState(engineDurableStateSchema.parse(options.durableState))
    : null;
  const state: EngineState = restored
    ? {
        snapshot: restored.snapshot,
        pulse: restored.pulse,
        history: restored.history,
        events: restored.events,
        serial: restored.serial,
        recordEvents: options?.recordEvents ?? true
      }
    : {
        snapshot: createInitialSnapshot(),
        pulse: 0,
        history: [],
        events: [],
        serial: 0,
        recordEvents: options?.recordEvents ?? true
      };

  if (!restored) {
    resetState(state, {
      bootstrapEvents: options?.bootstrap ?? true,
      clearEvents: true,
      clearHistory: true
    });
  } else {
    refreshLogTail(state);
    materializeHistory(state);
  }

  function control(envelope: ControlEnvelope): PhaseSnapshot {
    switch (envelope.action) {
      case "pause":
        state.snapshot = {
          ...state.snapshot,
          status: "paused"
        };
        pushEvent(state, {
          schemaName: "immaculate.control",
          subject: { type: "system", id: "engine" },
          purpose: ["operator-control", "pause"],
          payload: { action: "pause" },
          summary: `operator paused cycle ${state.snapshot.cycle}`
        });
        refreshLogTail(state);
        materializeHistory(state);
        return state.snapshot;
      case "resume":
        state.snapshot = {
          ...state.snapshot,
          status: "running"
        };
        pushEvent(state, {
          schemaName: "immaculate.control",
          subject: { type: "system", id: "engine" },
          purpose: ["operator-control", "resume"],
          payload: { action: "resume" },
          summary: `operator resumed cycle ${state.snapshot.cycle}`
        });
        refreshLogTail(state);
        materializeHistory(state);
        return state.snapshot;
      case "boost":
        state.pulse = clamp(state.pulse + (envelope.value ?? 0.75), 0, 1.4);
        pushEvent(state, {
          schemaName: "immaculate.control",
          subject: { type: "system", id: "pulse" },
          purpose: ["operator-control", "boost"],
          payload: { action: "boost", value: envelope.value ?? 0.75 },
          summary: `boost pulse set to ${(envelope.value ?? 0.75).toFixed(2)}`
        });
        refreshLogTail(state);
        materializeHistory(state);
        return state.snapshot;
      case "reroute":
        state.snapshot = {
          ...state.snapshot,
          highlightedNodeId: envelope.target ?? state.snapshot.highlightedNodeId
        };
        pushEvent(state, {
          schemaName: "immaculate.control",
          subject: { type: "agent", id: envelope.target ?? state.snapshot.highlightedNodeId },
          purpose: ["operator-control", "reroute"],
          payload: { action: "reroute", target: envelope.target ?? state.snapshot.highlightedNodeId },
          summary: `reroute focus moved to ${envelope.target ?? state.snapshot.highlightedNodeId}`
        });
        refreshLogTail(state);
        materializeHistory(state);
        return state.snapshot;
      case "pulse":
        state.pulse = clamp(state.pulse + (envelope.value ?? 0.35), 0, 1.4);
        pushEvent(state, {
          schemaName: "immaculate.control",
          subject: { type: "system", id: "pulse" },
          purpose: ["operator-control", "pulse"],
          payload: { action: "pulse", value: envelope.value ?? 0.35 },
          summary: `manual pulse injected at ${(envelope.value ?? 0.35).toFixed(2)}`
        });
        refreshLogTail(state);
        materializeHistory(state);
        return state.snapshot;
      case "reset":
        pushEvent(state, {
          schemaName: "immaculate.control",
          subject: { type: "system", id: "engine" },
          purpose: ["operator-control", "reset"],
          payload: { action: "reset" },
          summary: `operator reset cycle lineage`
        });
        resetState(state, {
          preserveSerial: true,
          bootstrapEvents: true,
          clearEvents: false,
          clearHistory: false
        });
        return state.snapshot;
      case "step":
        pushEvent(state, {
          schemaName: "immaculate.control",
          subject: { type: "system", id: "engine" },
          purpose: ["operator-control", "step"],
          payload: { action: "step", status: state.snapshot.status },
          summary: `single-step requested on cycle ${state.snapshot.cycle}`
        });
        return advanceSnapshot(state, true);
    }
  }

  function registerDataset(summary: IngestedDatasetSummary): PhaseSnapshot {
    const parsed = datasetSummarySchema.parse(summary) as IngestedDatasetSummary;
    state.snapshot = mergeDatasetIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.dataset.registered",
      subject: { type: "dataset", id: parsed.id },
      purpose: ["ingestion", parsed.source, "registration", "dataset-catalog"],
      payload: {
        dataset: parsed
      },
      summary: `${parsed.source.toUpperCase()} dataset ${parsed.name} registered with ${parsed.subjectCount} subjects and ${parsed.fileCount} files`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  function registerNeuroSession(summary: NeuroSessionSummary): PhaseSnapshot {
    const parsed = neuroSessionSummarySchema.parse(summary) as NeuroSessionSummary;
    state.snapshot = mergeNeuroSessionIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.neuro-session.registered",
      subject: { type: "dataset", id: parsed.id },
      purpose: ["ingestion", parsed.source, "synchronize", "decode", "neuro-session"],
      payload: {
        neuroSession: parsed
      },
      summary: `NWB session ${parsed.name} registered with ${parsed.streamCount} streams and ${parsed.totalChannels} channels`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  function upsertNeuroReplay(replay: NeuroReplayState): PhaseSnapshot {
    const parsed = neuroReplayStateSchema.parse(replay) as NeuroReplayState;
    state.snapshot = mergeNeuroReplayIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.neuro-replay.upserted",
      subject: { type: "dataset", id: parsed.id },
      purpose: ["ingestion", parsed.source, "synchronize", "decode", parsed.status],
      payload: {
        replay: parsed
      },
      summary: `neuro replay ${parsed.name} ${parsed.status} ${parsed.completedWindows}/${parsed.totalWindows} windows`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  function ingestNeuroFrame(frame: NeuroFrameWindow): PhaseSnapshot {
    const parsed = neuroFrameWindowSchema.parse(frame) as NeuroFrameWindow;
    state.snapshot = mergeNeuroFrameIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.neuro-frame.ingested",
      subject: { type: "dataset", id: parsed.replayId },
      purpose: ["ingestion", parsed.source, "synchronize", "decode", parsed.decodeReady ? "decode-ready" : "warming"],
      payload: {
        frame: parsed
      },
      summary: `neuro frame ${parsed.windowIndex + 1} ingested with ${(parsed.decodeConfidence * 100).toFixed(1)}% decode confidence`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  function registerIntelligenceLayer(layer: IntelligenceLayer): PhaseSnapshot {
    const parsed = intelligenceLayerSchema.parse(layer) as IntelligenceLayer;
    state.snapshot = mergeIntelligenceLayerIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.intelligence-layer.registered",
      subject: { type: "agent", id: parsed.id },
      purpose: ["cognitive-plane", parsed.backend, "registration", parsed.role],
      payload: {
        layer: parsed
      },
      summary: `intelligence layer ${parsed.name} registered as ${parsed.role} on ${parsed.backend}`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  function commitCognitiveExecution(execution: CognitiveExecution): PhaseSnapshot {
    const parsed = cognitiveExecutionSchema.parse(execution) as CognitiveExecution;
    state.snapshot = mergeCognitiveExecutionIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.cognitive-execution.committed",
      subject: { type: "agent", id: parsed.layerId },
      purpose: ["cognitive-plane", "reason", "commit", parsed.status],
      payload: {
        execution: parsed
      },
      summary: `cognitive execution ${parsed.id} ${parsed.status} on ${parsed.model} in ${parsed.latencyMs.toFixed(1)} ms`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  function recordRoutingDecision(decision: RoutingDecision): PhaseSnapshot {
    const parsed = routingDecisionSchema.parse(decision) as RoutingDecision;
    state.snapshot = mergeRoutingDecisionIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.routing.decision",
      subject: { type: "agent", id: "router-core" },
      purpose: ["route", "feedback", parsed.mode, parsed.channel],
      payload: {
        routingDecision: parsed
      },
      summary: `routing decision ${parsed.id} ${parsed.mode} selected ${parsed.channel} toward ${parsed.targetNodeId}`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  function dispatchActuationOutput(output: ActuationOutput): PhaseSnapshot {
    const parsed = actuationOutputSchema.parse(output) as ActuationOutput;
    state.snapshot = mergeActuationOutputIntoSnapshot(state.snapshot, parsed);
    state.snapshot = {
      ...state.snapshot,
      metrics: computeMetrics(state.snapshot.nodes, state.snapshot.edges, state.snapshot.passes)
    };

    pushEvent(state, {
      schemaName: "immaculate.actuation-output.dispatched",
      subject: { type: "device", id: parsed.targetNodeId },
      purpose: ["feedback", "actuation", parsed.channel, parsed.status],
      payload: {
        actuationOutput: parsed
      },
      summary: `actuation output ${parsed.id} ${parsed.status} on ${parsed.channel} to ${parsed.targetNodeId}`
    });

    refreshLogTail(state);
    materializeHistory(state);
    return state.snapshot;
  }

  return {
    getSnapshot: () => state.snapshot,
    getHistory: () => state.history,
    getEvents: () => state.events,
    getDurableState: () => ({
      snapshot: structuredClone(state.snapshot),
      history: structuredClone(state.history),
      events: structuredClone(state.events),
      serial: state.serial,
      pulse: state.pulse
    }),
    tick: () => advanceSnapshot(state, false),
    control,
    registerDataset,
    registerNeuroSession,
    upsertNeuroReplay,
    ingestNeuroFrame,
    registerIntelligenceLayer,
    commitCognitiveExecution,
    recordRoutingDecision,
    dispatchActuationOutput
  };
}

function serialFromEventId(eventId: string): number {
  const parts = eventId.split("-");
  const value = Number(parts[parts.length - 1]);
  return Number.isFinite(value) ? value : 0;
}

export function rebuildDurableStateFromEvents(
  eventsInput: EventEnvelope[],
  options?: {
    durableState?: EngineDurableState;
  }
): EngineDurableState {
  const chronological = eventsInput.map((event) => eventEnvelopeSchema.parse(event));
  const baseState = options?.durableState
    ? cloneDurableState(engineDurableStateSchema.parse(options.durableState))
    : null;
  const engine = createEngine(
    baseState
      ? {
          durableState: baseState,
          bootstrap: false,
          recordEvents: false
        }
      : {
          bootstrap: false,
          recordEvents: false
        }
  );

  for (const event of chronological) {
    if (event.schema.name === "immaculate.dataset.registered") {
      const parsed = datasetSummarySchema.safeParse(event.payload.dataset);
      if (parsed.success) {
        engine.registerDataset(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.neuro-session.registered") {
      const parsed = neuroSessionSummarySchema.safeParse(event.payload.neuroSession);
      if (parsed.success) {
        engine.registerNeuroSession(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.neuro-replay.upserted") {
      const parsed = neuroReplayStateSchema.safeParse(event.payload.replay);
      if (parsed.success) {
        engine.upsertNeuroReplay(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.neuro-frame.ingested") {
      const parsed = neuroFrameWindowSchema.safeParse(event.payload.frame);
      if (parsed.success) {
        engine.ingestNeuroFrame(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.intelligence-layer.registered") {
      const parsed = intelligenceLayerSchema.safeParse(event.payload.layer);
      if (parsed.success) {
        engine.registerIntelligenceLayer(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.cognitive-execution.committed") {
      const parsed = cognitiveExecutionSchema.safeParse(event.payload.execution);
      if (parsed.success) {
        engine.commitCognitiveExecution(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.routing.decision") {
      const parsed = routingDecisionSchema.safeParse(event.payload.routingDecision);
      if (parsed.success) {
        engine.recordRoutingDecision(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.actuation-output.dispatched") {
      const parsed = actuationOutputSchema.safeParse(event.payload.actuationOutput);
      if (parsed.success) {
        engine.dispatchActuationOutput(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.control") {
      const parsed = controlEnvelopeSchema.safeParse({
        action: event.payload.action,
        target: event.payload.target,
        value: event.payload.value
      });

      if (parsed.success) {
        engine.control(parsed.data);
      }
      continue;
    }

    if (event.schema.name === "immaculate.engine.tick") {
      engine.tick();
    }
  }

  const durableState = engine.getDurableState();
  const combinedChronological = [
    ...(baseState ? [...baseState.events].reverse() : []),
    ...chronological
  ];
  const seenEventIds = new Set<string>();
  const dedupedChronological = combinedChronological.filter((event) => {
    if (seenEventIds.has(event.eventId)) {
      return false;
    }
    seenEventIds.add(event.eventId);
    return true;
  });
  const newestFirst = [...dedupedChronological].reverse().slice(0, EVENT_LIMIT);
  const latest = newestFirst[0];

  return {
    snapshot: {
      ...durableState.snapshot,
      logTail: newestFirst.slice(0, 8).map((event) => event.summary),
      lastEventId: latest?.eventId
    },
    history: durableState.history,
    events: newestFirst,
    serial: dedupedChronological.reduce(
      (max, event) => Math.max(max, serialFromEventId(event.eventId)),
      baseState?.serial ?? 0
    ),
    pulse: durableState.pulse
  };
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function planeColor(plane: OrchestrationPlane): string {
  switch (plane) {
    case "reflex":
      return "#5ef2c7";
    case "cognitive":
      return "#ffd166";
    case "offline":
      return "#7cb7ff";
  }
}
