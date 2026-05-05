import path from "node:path";
import { spawn } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "fastify-rate-limit";
import websocket from "@fastify/websocket";
import {
  agentIntelligenceAssessmentSchema,
  agentIntelligenceAssessmentTriggers,
  type AgentIntelligenceAssessment,
  type AgentIntelligenceAssessmentTrigger,
  type ActuationOutput,
  controlEnvelopeSchema,
  createEngine,
  eventEnvelopeSchema,
  inspectDurableState,
  phaseSnapshotSchema,
  snapshotHistoryPointSchema,
  type BenchmarkPackId,
  type BenchmarkReport,
  type ControlEnvelope,
  type ExecutionArbitration,
  type ExecutionSchedule,
  type IntelligenceLayer,
  type RoutingDecision
} from "@immaculate/core";
import {
  assessAgentIntelligence,
  summarizeAgentIntelligenceAssessments
} from "./agent-intelligence-assessment.js";
import { verifyDashboardSocketTicketFromUrl } from "./dashboard-socket-ticket.js";
import { createActuationManager } from "./actuation.js";
import {
  buildExecutionArbitrationDecision,
  planExecutionArbitration
} from "./arbitration.js";
import {
  buildExecutionScheduleDecision,
  planExecutionSchedule,
  preferredScheduleRoles,
  isParallelScheduleMode
} from "./scheduling.js";
import {
  appendCausalTraceGraphRecord,
  buildCausalTraceGraphAdmission,
  causalTraceGraphContract,
  inspectCausalTraceGraphLedger,
  readCausalTraceGraphRecords
} from "./causal-trace-graph.js";
import {
  buildCognitiveRolePlanAdmission,
  cognitiveRolePlanContract
} from "./cognitive-role-plan.js";
import {
  buildAgentTurn,
  buildConversationObjective,
  buildConversationRecord,
  buildSessionConversationMemory
} from "./conversation.js";
import { appendDecisionTraceRecord, createDecisionTraceSeed } from "./decision-trace.js";
import { buildBenchmarkWorkerSpawnPlan } from "./benchmark-worker-spawn.js";
import {
  loadPublishedBenchmarkIndex,
  loadPublishedBenchmarkReport,
  loadPublishedBenchmarkReportBySuiteId
} from "./benchmark.js";
import { loadAllBenchmarkTrends, loadBenchmarkTrend } from "./benchmark-trend.js";
import { createDatasetRegistry, scanBidsDataset } from "./bids.js";
import { createNeuroRegistry, scanNwbFile } from "./nwb.js";
import {
  discoverPreferredOllamaLayer,
  listOllamaModels,
  runOllamaExecution
} from "./ollama.js";
import { resolveQOrchestrationContext } from "./q-orchestration-context.js";
import {
  createLiveNeuroManager,
  type LiveNeuroPayload
} from "./live-neuro.js";
import { createLslAdapterManager } from "./lsl-adapter.js";
import { buildPublicIntelligenceStatus } from "./intelligence-status.js";
import {
  normalizeFederationControlPlaneUrl,
  resolveFederationSecret,
  signFederationPayload,
  verifyFederationEnvelope,
  type FederationNodeIdentityPayload,
  type FederationNodeLeasePayload,
  type FederationSignedEnvelope,
  type FederationWorkerIdentityPayload,
  type FederationWorkerLeasePayload
} from "./federation.js";
import {
  createFederationPeerRegistry,
  smoothObservedLatency,
  type FederationPeerView
} from "./federation-peers.js";
import {
  buildFederatedExecutionPressure,
  summarizeRemoteExecutionOutcomes
} from "./federation-pressure.js";
import { createNodeRegistry } from "./node-registry.js";
import { createNeuroReplayManager } from "./neuro-replay.js";
import { listBenchmarkPacks } from "./benchmark-packs.js";
import {
  createGovernanceRegistry,
  evaluateGovernance,
  type GovernanceAction,
  type GovernanceBinding
} from "./governance.js";
import {
  buildGovernedGoalAdmission,
  governedGoalStateContract
} from "./goal-state.js";
import { createPersistence } from "./persistence.js";
import {
  buildRoutingDecision,
  deriveGovernancePressure,
  planAdaptiveRoute
} from "./routing.js";
import {
  deriveProtectionPosture,
  projectProtectionPostureForQ
} from "./protection-intelligence.js";
import {
  createQApiKeyRegistry,
  normalizeQApiRateLimitPolicy,
  type QApiKeyMetadata,
  type QApiRateLimitPolicy
} from "./q-api-auth.js";
import { createQRateLimiter } from "./q-rate-limit.js";
import { evaluateToolRiskAdmission } from "./tool-governance.js";
import {
  classifyRealWorldEngagement,
  evaluateRealWorldEngagement,
  type RealWorldEngagementDecision,
  type RealWorldEngagementEvidence
} from "./real-world-engagement.js";
import {
  foundationModelLabel,
  getImmaculateHarnessName,
  getQDeveloperName,
  getQFoundationModelName,
  getQIdentitySummary,
  getQLeadName,
  getQModelName,
  getQModelTarget,
  getQRuntimeContextInstruction,
  matchesModelReference,
  truthfulModelLabel
} from "./q-model.js";
import { resolveQLocalOllamaUrl } from "./q-local-model.js";
import { resolveReleaseMetadata } from "./release-metadata.js";
import {
  appendRoundtableExecutionSummary,
  buildRoundtableActionPlan,
  materializeRoundtableActionExecutionArtifacts,
  type RoundtablePlan
} from "./roundtable.js";
import { emitHarnessStartupBanner } from "./startup-banner.js";
import {
  createIntelligenceWorkerRegistry,
  type IntelligenceWorkerAssignment,
  type IntelligenceWorkerExecutionProfile
} from "./workers.js";
import { createWorkGovernor, type WorkGovernorGrant } from "./work-governor.js";
import { hashValue, resolvePathWithinAllowedRoot, sha256Hash, sha256Json } from "./utils.js";
import {
  deriveVisibilityScope,
  projectActuationOutput,
  projectCognitiveExecution,
  projectConversation,
  projectExecutionSchedule,
  projectIntelligenceLayer,
  projectDatasetRecord,
  projectEventEnvelope,
  projectNeuroFrameWindow,
  projectNeuroSessionRecord,
  projectPhaseSnapshot,
  redactDatasetSummary,
  redactNeuroSessionSummary
} from "./visibility.js";
import { inspectWandbStatus, publishBenchmarkToWandb } from "./wandb.js";

const STARTUP_TRACE_PATH = path.join(
  process.env.IMMACULATE_RUNTIME_DIR ?? process.cwd(),
  "startup-trace.ndjson"
);

async function appendStartupTrace(
  phase: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await mkdir(path.dirname(STARTUP_TRACE_PATH), { recursive: true });
    await appendFile(
      STARTUP_TRACE_PATH,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        phase,
        ...detail
      })}\n`,
      "utf8"
    );
  } catch {
    // Startup tracing is best-effort and must never block harness startup.
  }
}

const app = Fastify({ logger: true });
const persistence = createPersistence(process.env.IMMACULATE_RUNTIME_DIR);
await appendStartupTrace("startup:resolve-release:start");
const releaseMetadata = await resolveReleaseMetadata();
await appendStartupTrace("startup:resolve-release:complete", {
  buildId: releaseMetadata.buildId,
  gitShortSha: releaseMetadata.gitShortSha
});
const datasetRegistry = createDatasetRegistry(persistence.getStatus().rootDir);
const neuroRegistry = createNeuroRegistry(persistence.getStatus().rootDir);
const governance = createGovernanceRegistry();
await appendStartupTrace("startup:actuation-manager:start", {
  runtimeRoot: persistence.getStatus().rootDir
});
const actuationManager = await createActuationManager(persistence.getStatus().rootDir);
await appendStartupTrace("startup:actuation-manager:complete");
const intelligenceWorkerRegistry = createIntelligenceWorkerRegistry(persistence.getStatus().rootDir);
const federationPeerRegistry = createFederationPeerRegistry(persistence.getStatus().rootDir);
const nodeRegistry = createNodeRegistry(persistence.getStatus().rootDir, {
  localNodeId:
    process.env.IMMACULATE_NODE_ID ??
    `node-${(process.env.IMMACULATE_HARNESS_HOST ?? "127.0.0.1").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}-${Number(process.env.IMMACULATE_HARNESS_PORT ?? 8787)}`,
  localNodeLabel: process.env.IMMACULATE_NODE_LABEL ?? "Immaculate Local Node",
  localHostLabel: `${process.env.IMMACULATE_HARNESS_HOST ?? "127.0.0.1"}:${Number(process.env.IMMACULATE_HARNESS_PORT ?? 8787)}`,
  localLocality: process.env.IMMACULATE_NODE_LOCALITY,
  localControlPlaneUrl:
    process.env.IMMACULATE_NODE_CONTROL_URL ??
    `http://${process.env.IMMACULATE_HARNESS_HOST ?? "127.0.0.1"}:${Number(process.env.IMMACULATE_HARNESS_PORT ?? 8787)}`,
  localCapabilities: ["control-plane", "worker-plane", "benchmark-plane", "neuro-plane"],
  localCostPerHourUsd:
    typeof process.env.IMMACULATE_NODE_COST_PER_HOUR_USD === "string"
      ? Number(process.env.IMMACULATE_NODE_COST_PER_HOUR_USD)
      : undefined,
  localDeviceAffinityTags:
    process.env.IMMACULATE_NODE_DEVICE_AFFINITY?.split(",").map((value) => value.trim()).filter(Boolean) ?? [
      "local-control-plane",
      "cpu"
    ]
});
await appendStartupTrace("startup:local-node:start");
await nodeRegistry.ensureLocalNode();
await appendStartupTrace("startup:local-node:complete");
await appendStartupTrace("startup:persistence-load:start");
const durableState = await persistence.load();
await appendStartupTrace("startup:persistence-load:complete", {
  recovered: persistence.getStatus().recovered,
  persistedEventCount: persistence.getStatus().persistedEventCount,
  integrityStatus: persistence.getStatus().integrityStatus
});
const engine = createEngine(
  durableState
    ? {
        durableState
      }
    : undefined
);
const neuroReplayManager = createNeuroReplayManager({
  onReplayUpdate: async (replay) => {
    engine.upsertNeuroReplay(replay);
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
  },
  onFrame: async (frame) => {
    engine.ingestNeuroFrame(frame);
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
  }
});
const liveNeuroManager = createLiveNeuroManager({
  onIngressUpdate: async (ingress) => {
    engine.upsertNeuroReplay(ingress);
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
  },
  onFrame: async (frame) => {
    engine.ingestNeuroFrame(frame);
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
  }
});
const lslAdapterManager = createLslAdapterManager({
  onPayload: async (payload) => {
    await liveNeuroManager.ingest(payload);
  },
  onState: async (state) => {
    app.log.info(
      {
        sourceId: state.sourceId,
        state: state.state,
        reason: "reason" in state ? state.reason : undefined,
        pid: "pid" in state ? state.pid : undefined
      },
      "LSL bridge state updated"
    );
  },
  onStatus: async (message) => {
    app.log.info({ message }, "LSL bridge status");
  }
});
const clients = new Set<{
  send: (payload: string) => void;
  readyState: number;
  OPEN: number;
}>();
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARK_WORKER_PATH = path.join(
  MODULE_ROOT,
  `benchmark-worker.${import.meta.url.endsWith(".ts") ? "ts" : "js"}`
);
const benchmarkJobs = new Map<string, BenchmarkJob>();
const MAX_BENCHMARK_JOBS = 12;
const HARNESS_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_HARNESS_RATE_LIMIT_MAX ?? 600) || 600
);
const HARNESS_RATE_LIMIT_WINDOW =
  process.env.IMMACULATE_HARNESS_RATE_LIMIT_WINDOW ?? "1 minute";
const POI_ASSESSMENT_READ_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_POI_ASSESSMENT_READ_RATE_LIMIT_MAX ?? 120) || 120
);
const POI_ASSESSMENT_RUN_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_POI_ASSESSMENT_RUN_RATE_LIMIT_MAX ?? 20) || 20
);
const POI_ASSESSMENT_RATE_LIMIT_WINDOW =
  process.env.IMMACULATE_POI_ASSESSMENT_RATE_LIMIT_WINDOW ?? "1 minute";
const DEVICE_DISCOVERY_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_DEVICE_DISCOVERY_RATE_LIMIT_MAX ?? 30) || 30
);
const DEVICE_CONTROL_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_DEVICE_CONTROL_RATE_LIMIT_MAX ?? 60) || 60
);
const DEVICE_RATE_LIMIT_WINDOW =
  process.env.IMMACULATE_DEVICE_RATE_LIMIT_WINDOW ?? "1 minute";
const ORCHESTRATION_MEDIATE_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_ORCHESTRATION_MEDIATE_RATE_LIMIT_MAX ?? 60) || 60
);
const ORCHESTRATION_RATE_LIMIT_WINDOW =
  process.env.IMMACULATE_ORCHESTRATION_RATE_LIMIT_WINDOW ?? "1 minute";
const HARNESS_READ_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_HARNESS_READ_RATE_LIMIT_MAX ?? 180) || 180
);
const HARNESS_READ_RATE_LIMIT_WINDOW =
  process.env.IMMACULATE_HARNESS_READ_RATE_LIMIT_WINDOW ?? "1 minute";
const BENCHMARK_READ_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_BENCHMARK_READ_RATE_LIMIT_MAX ?? 120) || 120
);
const BENCHMARK_READ_RATE_LIMIT_WINDOW =
  process.env.IMMACULATE_BENCHMARK_READ_RATE_LIMIT_WINDOW ?? "1 minute";
const workGovernor = createWorkGovernor({
  maxActiveWeight: Math.max(1, Number(process.env.IMMACULATE_WORK_GOVERNOR_MAX_WEIGHT ?? 6) || 6),
  maxQueueDepth: Math.max(1, Number(process.env.IMMACULATE_WORK_GOVERNOR_MAX_QUEUE_DEPTH ?? 12) || 12),
  lanes: {
    benchmark: {
      maxActiveWeight:
        Math.max(1, Number(process.env.IMMACULATE_WORK_GOVERNOR_BENCHMARK_MAX_WEIGHT ?? 3) || 3),
      maxQueueDepth:
        Math.max(1, Number(process.env.IMMACULATE_WORK_GOVERNOR_BENCHMARK_MAX_QUEUE_DEPTH ?? 4) || 4)
    },
    cognitive: {
      maxActiveWeight:
        Math.max(1, Number(process.env.IMMACULATE_WORK_GOVERNOR_COGNITIVE_MAX_WEIGHT ?? 5) || 5),
      maxQueueDepth:
        Math.max(1, Number(process.env.IMMACULATE_WORK_GOVERNOR_COGNITIVE_MAX_QUEUE_DEPTH ?? 8) || 8)
    }
  }
});

function benchmarkGovernorWeight(packId?: BenchmarkPackId): number {
  if (packId === "latency-soak-60m") {
    return 3;
  }
  if (packId === "latency-soak-30m" || packId === "durability-torture") {
    return 2;
  }
  return 1;
}

function benchmarkGovernorPriority(packId?: BenchmarkPackId): "low" | "normal" | "high" {
  if (packId === "durability-torture") {
    return "high";
  }
  if (packId === "latency-soak-30m" || packId === "latency-soak-60m") {
    return "low";
  }
  return "normal";
}

function scheduleGovernorPriority(
  schedule: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]
): "critical" | "high" | "normal" {
  if (
    schedule.backlogPressure === "critical" ||
    schedule.mode === "guarded-swarm" ||
    schedule.deadlineClass === "hard"
  ) {
    return "critical";
  }
  if (
    schedule.executionTopology === "parallel" ||
    schedule.parallelWidth > 1 ||
    schedule.deadlineClass === "bounded"
  ) {
    return "high";
  }
  return "normal";
}

function effectiveScheduleParallelWidth(
  schedule: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number],
  plannedWidth: number
): number {
  const scheduledWidth =
    (schedule.localReplicaCount ??
      schedule.horizontalReplicaCount ??
      schedule.healthWeightedWidth ??
      schedule.parallelWidth) || 1;
  const baselineWidth = Math.max(1, Math.min(plannedWidth, scheduledWidth));
  const governorSnapshot = workGovernor.snapshot();
  const cognitiveLane = governorSnapshot.lanes.cognitive;
  const laneNearSaturation =
    cognitiveLane.activeWeight >= Math.max(1, cognitiveLane.maxActiveWeight - 1);
  if (schedule.backpressureAction === "hold") {
    return 0;
  }
  if (schedule.backpressureAction === "serialize") {
    return Math.min(1, baselineWidth);
  }

  if (
    schedule.backpressureAction === "degrade" ||
    governorSnapshot.queueDepth > 0 ||
    cognitiveLane.queueDepth > 0 ||
    laneNearSaturation
  ) {
    return Math.max(1, baselineWidth - 1);
  }
  return baselineWidth;
}

const HARNESS_PORT = Number(process.env.IMMACULATE_HARNESS_PORT ?? 8787);
const HARNESS_HOST = process.env.IMMACULATE_HARNESS_HOST ?? "127.0.0.1";
const tickIntervalMs = Number(process.env.IMMACULATE_TICK_MS ?? 180);
const API_KEY = process.env.IMMACULATE_API_KEY;
const Q_API_ENABLED = /^(1|true|yes|on)$/i.test(process.env.IMMACULATE_Q_API_ENABLED ?? "false");
const DEFAULT_Q_API_RATE_LIMIT = normalizeQApiRateLimitPolicy(
  {
    requestsPerMinute:
      typeof process.env.IMMACULATE_Q_API_DEFAULT_RPM === "string"
        ? Number(process.env.IMMACULATE_Q_API_DEFAULT_RPM)
        : undefined,
    burst:
      typeof process.env.IMMACULATE_Q_API_DEFAULT_BURST === "string"
        ? Number(process.env.IMMACULATE_Q_API_DEFAULT_BURST)
        : undefined,
    maxConcurrentRequests:
      typeof process.env.IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT === "string"
        ? Number(process.env.IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT)
        : undefined
  },
  {
    requestsPerMinute: 60,
    burst: 60,
    maxConcurrentRequests: 2
  }
);
const DASHBOARD_SOCKET_SECRET =
  process.env.IMMACULATE_DASHBOARD_SOCKET_SECRET?.trim() || API_KEY || null;
const FEDERATION_SHARED_SECRET = resolveFederationSecret();
const LOCAL_WORKER_ID_PREFIX =
  process.env.IMMACULATE_WORKER_ID ??
  `worker-local-${HARNESS_HOST.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}-${HARNESS_PORT}`;
const LOCAL_EXECUTION_WORKER_SLOT_CAP = Math.max(
  1,
  Number(process.env.IMMACULATE_LOCAL_WORKER_SLOTS ?? 4) || 4
);
const LOCAL_OLLAMA_ENDPOINT = resolveQLocalOllamaUrl();
const LOCAL_WORKER_COST_PER_HOUR_USD =
  typeof process.env.IMMACULATE_WORKER_COST_PER_HOUR_USD === "string"
    ? Number(process.env.IMMACULATE_WORKER_COST_PER_HOUR_USD)
    : 0.42;
const LOCAL_WORKER_DEVICE_AFFINITY_TAGS =
  process.env.IMMACULATE_WORKER_DEVICE_AFFINITY?.split(",").map((value) => value.trim()).filter(Boolean) ?? [
    "ollama",
    "llm",
    "cpu"
  ];
const NODE_HEARTBEAT_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.IMMACULATE_NODE_HEARTBEAT_INTERVAL_MS ?? 15_000) || 15_000
);
const FEDERATION_REFRESH_POLL_MS = Math.max(
  2_000,
  Number(process.env.IMMACULATE_FEDERATION_REFRESH_POLL_MS ?? 5_000) || 5_000
);
const FEDERATION_DEFAULT_REFRESH_INTERVAL_MS = Math.max(
  FEDERATION_REFRESH_POLL_MS,
  Number(process.env.IMMACULATE_FEDERATION_REFRESH_INTERVAL_MS ?? 10_000) || 10_000
);
const FEDERATION_DEFAULT_LEASE_REFRESH_INTERVAL_MS = Math.max(
  FEDERATION_REFRESH_POLL_MS,
  Number(process.env.IMMACULATE_FEDERATION_LEASE_REFRESH_INTERVAL_MS ?? 4_000) || 4_000
);
const FEDERATION_DEFAULT_TRUST_WINDOW_MS = Math.max(
  FEDERATION_DEFAULT_REFRESH_INTERVAL_MS * 2,
  Number(process.env.IMMACULATE_FEDERATION_TRUST_WINDOW_MS ?? 45_000) || 45_000
);
const FEDERATION_ENVELOPE_MAX_AGE_MS = Math.max(
  FEDERATION_DEFAULT_TRUST_WINDOW_MS,
  Number(process.env.IMMACULATE_FEDERATION_ENVELOPE_MAX_AGE_MS ?? 60_000) || 60_000
);
const FEDERATION_ENVELOPE_MAX_CLOCK_SKEW_MS = Math.max(
  2_000,
  Number(process.env.IMMACULATE_FEDERATION_ENVELOPE_MAX_CLOCK_SKEW_MS ?? 5_000) || 5_000
);
await appendStartupTrace("startup:q-api-key-registry:start");
const qApiKeyRegistry = await createQApiKeyRegistry({
  rootDir: persistence.getStatus().rootDir,
  storePath: process.env.IMMACULATE_Q_API_KEYS_PATH,
  defaultRateLimit: DEFAULT_Q_API_RATE_LIMIT
});
await appendStartupTrace("startup:q-api-key-registry:complete", {
  storePath: qApiKeyRegistry.getStorePath()
});
const qApiRateLimiter = createQRateLimiter();
const qApiRequestContexts = new WeakMap<object, QApiRequestContext>();

setInterval(() => {
  void nodeRegistry.ensureLocalNode().catch((error) => {
    app.log.warn(
      {
        message: error instanceof Error ? error.message : "unknown node heartbeat error"
      },
      "Unable to refresh local node heartbeat"
    );
  });
}, NODE_HEARTBEAT_INTERVAL_MS).unref();

setInterval(() => {
  void refreshDueFederationPeers().catch((error) => {
    app.log.warn(
      {
        message: error instanceof Error ? error.message : "unknown federation refresh poll error"
      },
      "Unable to complete federation peer refresh poll."
    );
  });
  void renewDueFederationPeerLeases().catch((error) => {
    app.log.warn(
      {
        message: error instanceof Error ? error.message : "unknown federation lease renewal poll error"
      },
      "Unable to complete federation peer lease-renewal poll."
    );
  });
  void repairDueFederationPeers().catch((error) => {
    app.log.warn(
      {
        message: error instanceof Error ? error.message : "unknown federation repair poll error"
      },
      "Unable to complete federation peer repair poll."
    );
  });
}, FEDERATION_REFRESH_POLL_MS).unref();

type BenchmarkJob = {
  id: string;
  packId?: BenchmarkPackId;
  publishWandb: boolean;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  benchmark?: BenchmarkReport;
  wandb?: Awaited<ReturnType<typeof publishBenchmarkToWandb>>;
  error?: string;
};

type AdaptiveRoutePlan = ReturnType<typeof planAdaptiveRoute>;
type PhaseSnapshot = ReturnType<typeof phaseSnapshotSchema.parse>;
type CognitiveExecutionRecord = PhaseSnapshot["cognitiveExecutions"][number];
type SessionConversationMemory = ReturnType<typeof buildSessionConversationMemory>;
type RequestedExecutionDecision = "allow_local" | "remote_required" | "preflight_blocked";
type ExecutionWorkerAssignment = IntelligenceWorkerAssignment | undefined;
type FederatedRepairOutcome =
  | "not-needed"
  | "lease-renewed"
  | "membership-refresh-renewed"
  | "failed";
type FederatedRepairSummary = {
  attempted: boolean;
  peerId?: string;
  outcome: FederatedRepairOutcome;
  action?: string;
  error?: string;
};
type FederatedRetryReservation = {
  requestedExecutionDecision?: RequestedExecutionDecision;
  target?: string;
  fallbackLocalPoolSize?: number;
  preferredDeviceAffinityTags?: string[];
  avoidPeerIds?: string[];
  maxObservedLatencyMs?: number;
  maxCostPerHourUsd?: number;
  requiredHealthyWorkerCount?: number;
  backlogPressure?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["backlogPressure"];
  reliabilityFloor?: number;
};
type CognitivePassResult = {
  layer: IntelligenceLayer;
  execution: CognitiveExecutionRecord;
  response: string;
  snapshot: PhaseSnapshot;
  failureClass?: string;
  thinkingDetected?: boolean;
};

type QApiRequestContext = {
  principalKind: "loopback" | "admin" | "key";
  subject: string;
  key?: QApiKeyMetadata;
  rateLimit: QApiRateLimitPolicy;
};
type QApiAuditRecord = {
  generatedAt: string;
  source: "q-api";
  sessionId: string;
  executionId?: string;
  decisionTraceId?: string;
  decisionTraceHash?: string;
  policyDigest?: string;
  evidenceDigest?: string;
  modelName: string;
  model?: string;
  foundationModel?: string;
  releaseBuildId?: string;
  releaseGitShortSha?: string;
  trainingBundleId?: string;
  role: IntelligenceLayer["role"];
  status: "completed" | "failed";
  parseSuccess: boolean;
  structuredFieldCount: number;
  latencyMs: number;
  failureClass?: string;
  thinkingDetected: boolean;
  objective: string;
  contextPreview?: string;
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
  responsePreview: string;
  objectiveDigest?: string;
  contextDigest?: string;
  responseDigest?: string;
  qRoutingDirective?: string;
  governancePressure?: string;
  selectedWorkerId?: string;
  selectedWorkerLabel?: string;
  selectedWorkerProfile?: string;
  selectedWorkerNodeId?: string;
  principal: {
    kind: QApiRequestContext["principalKind"];
    subject: string;
    keyId?: string;
    label?: string;
  };
};
type FederatedRetryRunOptions = {
  assignment?: ExecutionWorkerAssignment;
  repairGroupId?: string;
  repairAttempt?: number;
  retriedFromExecutionId?: string;
  repairCause?: string;
};

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      callback(
        null,
        host === "localhost" || host === "127.0.0.1" || host === "[::1]"
      );
    } catch {
      callback(null, false);
    }
  }
});

await app.register(rateLimit, {
  global: true,
  max: HARNESS_RATE_LIMIT_MAX,
  timeWindow: HARNESS_RATE_LIMIT_WINDOW
});

await app.register(websocket);

const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const Q_API_AUDIT_PATH =
  process.env.IMMACULATE_Q_API_AUDIT_PATH ??
  path.join(REPO_ROOT, ".training-output", "q", "q-api-audit.ndjson");

function truncateAuditText(value: string | undefined, limit = 240): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

async function appendQApiAuditRecord(record: QApiAuditRecord): Promise<void> {
  await mkdir(path.dirname(Q_API_AUDIT_PATH), { recursive: true });
  await appendFile(Q_API_AUDIT_PATH, `${JSON.stringify(record)}\n`, "utf8");
}

function digestOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return sha256Hash(normalized);
}

async function traceCognitiveExecution(options: {
  execution: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"][number];
  objective?: string;
  context?: string;
  consentScope?: string;
  qContext?: Awaited<ReturnType<typeof resolveQOrchestrationContext>>;
}): Promise<ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"][number]> {
  const materialized = await appendDecisionTraceRecord({
    rootDir: persistence.getStatus().rootDir,
    record: {
      decisionTraceId:
        options.execution.decisionTraceId ??
        createDecisionTraceSeed({
          source: "cognitive-execution",
          sessionId: options.execution.sessionId,
          executionId: options.execution.id,
          objective: options.execution.objective,
          promptDigest: options.execution.promptDigest
        }),
      source: "cognitive-execution",
      sessionId: options.execution.sessionId,
      executionId: options.execution.id,
      release: {
        buildId: releaseMetadata.buildId,
        gitShortSha: releaseMetadata.gitShortSha,
        modelName: getQModelName(),
        foundationModel: getQFoundationModelName(),
        trainingBundleId: releaseMetadata.q.trainingLock?.bundleId
      },
      policy: {
        consentScope: options.consentScope,
        qRoutingDirective: options.qContext?.qRoutingDirective,
        governancePressure: options.execution.governancePressure,
        selectedLayerId: options.execution.layerId,
        selectedWorkerId: options.execution.assignedWorkerId,
        selectedWorkerLabel: options.execution.assignedWorkerLabel,
        selectedWorkerProfile: options.execution.assignedWorkerProfile,
        selectedWorkerNodeId: options.execution.assignedWorkerNodeId,
        guardVerdict: options.execution.guardVerdict,
        failureClass: options.execution.status === "failed" ? "execution_failed" : undefined
      },
      evidence: {
        objectiveDigest: digestOptionalText(options.execution.objective || options.objective),
        contextDigest: digestOptionalText(options.context),
        promptDigest: options.execution.promptDigest,
        responseDigest: digestOptionalText(options.execution.responsePreview),
        sourceIds: [
          options.execution.layerId,
          options.execution.assignedWorkerId,
          options.qContext?.gatewaySubstrateSuiteId
        ].filter((entry): entry is string => Boolean(entry)),
        evidenceDigest:
          options.execution.evidenceDigest ??
          sha256Json({
            contextFingerprint: options.qContext?.contextFingerprint,
            evidenceIds: options.qContext?.evidenceIds,
            promptDigest: options.execution.promptDigest,
            responseDigest: digestOptionalText(options.execution.responsePreview)
          }),
        contextFingerprint: options.qContext?.contextFingerprint
      },
      decisionSummary: {
        routeSuggestion: options.execution.routeSuggestion,
        reasonSummary: options.execution.reasonSummary,
        commitStatement: options.execution.commitStatement,
        responsePreview: truncateAuditText(options.execution.responsePreview, 320)
      }
    }
  });

  return {
    ...options.execution,
    decisionTraceId: materialized.decisionTraceId,
    decisionTraceHash: materialized.ledger.eventHash,
    policyDigest: sha256Json(materialized.policy),
    evidenceDigest: materialized.evidence.evidenceDigest ?? sha256Json(materialized.evidence),
    releaseBuildId: releaseMetadata.buildId,
    releaseGitShortSha: releaseMetadata.gitShortSha,
    trainingBundleId: releaseMetadata.q.trainingLock?.bundleId
  };
}

async function traceConversationRecord(options: {
  conversation: ReturnType<typeof buildConversationRecord>;
  consentScope?: string;
  schedule: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number];
}): Promise<ReturnType<typeof buildConversationRecord>> {
  const materialized = await appendDecisionTraceRecord({
    rootDir: persistence.getStatus().rootDir,
    record: {
      decisionTraceId:
        options.conversation.decisionTraceId ??
        createDecisionTraceSeed({
          source: "conversation",
          sessionId: options.conversation.sessionId,
          conversationId: options.conversation.id,
          objective: options.conversation.summary,
          promptDigest: options.conversation.evidenceDigest
        }),
      source: "conversation",
      sessionId: options.conversation.sessionId,
      conversationId: options.conversation.id,
      release: {
        buildId: releaseMetadata.buildId,
        gitShortSha: releaseMetadata.gitShortSha,
        modelName: getQModelName(),
        foundationModel: getQFoundationModelName(),
        trainingBundleId: releaseMetadata.q.trainingLock?.bundleId
      },
      policy: {
        consentScope: options.consentScope,
        routeMode: options.schedule.mode,
        selectedLayerId: options.conversation.turns.at(-1)?.layerId,
        guardVerdict: options.conversation.guardVerdict
      },
      evidence: {
        objectiveDigest: digestOptionalText(options.conversation.summary),
        sourceIds: options.conversation.turns
          .map((turn) => turn.decisionTraceId)
          .filter((entry): entry is string => Boolean(entry)),
        evidenceDigest:
          options.conversation.evidenceDigest ??
          sha256Json({
            turnTraceIds: options.conversation.turns.map((turn) => turn.decisionTraceId).filter(Boolean),
            summary: options.conversation.summary
          })
      },
      decisionSummary: {
        routeSuggestion: options.conversation.finalRouteSuggestion,
        commitStatement: options.conversation.finalCommitStatement,
        responsePreview: truncateAuditText(options.conversation.summary, 320)
      },
      selfEvaluation: {
        status: options.conversation.status,
        driftDetected: options.conversation.status !== "completed"
      }
    }
  });

  return {
    ...options.conversation,
    decisionTraceId: materialized.decisionTraceId,
    decisionTraceHash: materialized.ledger.eventHash,
    policyDigest: sha256Json(materialized.policy),
    evidenceDigest: materialized.evidence.evidenceDigest ?? sha256Json(materialized.evidence)
  };
}

async function traceOrchestrationDecision<T extends ExecutionArbitration | ExecutionSchedule>(options: {
  kind: "orchestration-arbitration" | "orchestration-schedule";
  decision: T;
  consentScope?: string;
  qContext?: Awaited<ReturnType<typeof resolveQOrchestrationContext>>;
}): Promise<T> {
  const isSchedule = options.kind === "orchestration-schedule";
  const selectedLayerId = isSchedule
    ? (options.decision as ExecutionSchedule).primaryLayerId
    : (options.decision as ExecutionArbitration).preferredLayerId;
  const targetNodeId = isSchedule
    ? undefined
    : (options.decision as ExecutionArbitration).targetNodeId;
  const routeMode = isSchedule
    ? (options.decision as ExecutionSchedule).mode
    : (options.decision as ExecutionArbitration).routeModeHint;
  const sourceIds = isSchedule
    ? [
        ...(options.decision as ExecutionSchedule).layerIds,
        options.qContext?.gatewaySubstrateSuiteId
      ].filter((entry): entry is string => Boolean(entry))
    : [
        selectedLayerId,
        targetNodeId,
        options.qContext?.gatewaySubstrateSuiteId
      ].filter((entry): entry is string => Boolean(entry));
  const driftReasonCodes: string[] = [];
  if (
    options.qContext?.qRoutingDirective === "primary-governed-local" &&
    options.qContext.readinessReady &&
    options.qContext.gatewaySubstrateHealthy
  ) {
    if (isSchedule) {
      const schedule = options.decision as ExecutionSchedule;
      if (!schedule.shouldRunCognition) {
        driftReasonCodes.push("governed_local_cognition_not_run");
      }
      if ((schedule.layerIds?.length ?? 0) === 0) {
        driftReasonCodes.push("governed_local_layer_missing");
      }
      if (schedule.admissionState === "hold") {
        driftReasonCodes.push("governed_local_admission_hold");
      }
    } else {
      const arbitration = options.decision as ExecutionArbitration;
      if (arbitration.mode === "guarded-review" && arbitration.governancePressure === "clear") {
        driftReasonCodes.push("governed_local_guarded_review_under_clear_pressure");
      }
      if (!arbitration.shouldRunCognition && arbitration.targetPlane === "cognitive") {
        driftReasonCodes.push("governed_local_cognition_suppressed");
      }
    }
  }

  const materialized = await appendDecisionTraceRecord({
    rootDir: persistence.getStatus().rootDir,
    record: {
      decisionTraceId:
        options.decision.decisionTraceId ??
        createDecisionTraceSeed({
          source: options.kind,
          sessionId: options.decision.sessionId,
          executionId: options.decision.id,
          objective: options.decision.objective,
          promptDigest: options.qContext?.evidenceDigest
        }),
      source: options.kind,
      sessionId: options.decision.sessionId,
      executionId: options.decision.id,
      release: {
        buildId: releaseMetadata.buildId,
        gitShortSha: releaseMetadata.gitShortSha,
        modelName: getQModelName(),
        foundationModel: getQFoundationModelName(),
        trainingBundleId: releaseMetadata.q.trainingLock?.bundleId
      },
      policy: {
        consentScope: options.consentScope,
        qRoutingDirective: options.qContext?.qRoutingDirective,
        governancePressure: options.decision.governancePressure,
        routeMode,
        targetNodeId,
        selectedLayerId,
        failureClass: driftReasonCodes.length > 0 ? driftReasonCodes[0] : undefined
      },
      evidence: {
        objectiveDigest: digestOptionalText(options.decision.objective),
        contextDigest: digestOptionalText(options.qContext?.mediationDiagnosticSummary),
        sourceIds,
        evidenceDigest:
          options.decision.evidenceDigest ??
          options.qContext?.evidenceDigest ??
          sha256Json({
            contextFingerprint: options.qContext?.contextFingerprint,
            sourceIds,
            rationale: options.decision.rationale
          }),
        contextFingerprint: options.qContext?.contextFingerprint
      },
      decisionSummary: {
        routeSuggestion: routeMode,
        reasonSummary: truncateAuditText(options.decision.rationale, 320),
        commitStatement: isSchedule
          ? truncateAuditText(
              `Execute ${routeMode} with ${(options.decision as ExecutionSchedule).parallelFormationSummary ?? "single-lane"}.`,
              220
            )
          : truncateAuditText(
              `Route through ${(options.decision as ExecutionArbitration).targetNodeId} on ${(options.decision as ExecutionArbitration).targetPlane}.`,
              220
            ),
        responsePreview: truncateAuditText(options.decision.objective, 220)
      },
      selfEvaluation: {
        status: isSchedule
          ? (options.decision as ExecutionSchedule).admissionState ?? "admit"
          : (options.decision as ExecutionArbitration).mode,
        driftDetected: driftReasonCodes.length > 0,
        driftReasonCodes
      }
    }
  });

  return {
    ...options.decision,
    decisionTraceId: materialized.decisionTraceId,
    decisionTraceHash: materialized.ledger.eventHash,
    policyDigest: sha256Json(materialized.policy),
    evidenceDigest: materialized.evidence.evidenceDigest ?? sha256Json(materialized.evidence),
    releaseBuildId: releaseMetadata.buildId,
    releaseGitShortSha: releaseMetadata.gitShortSha,
    trainingBundleId: releaseMetadata.q.trainingLock?.bundleId
  };
}

function extractQueryToken(urlValue?: string): string | undefined {
  if (!urlValue) {
    return undefined;
  }

  const queryIndex = urlValue.indexOf("?");
  if (queryIndex < 0) {
    return undefined;
  }

  const params = new URLSearchParams(urlValue.slice(queryIndex + 1));
  return params.get("token") ?? undefined;
}

function getSearchParams(urlValue?: string): URLSearchParams {
  if (!urlValue) {
    return new URLSearchParams();
  }

  const queryIndex = urlValue.indexOf("?");
  if (queryIndex < 0) {
    return new URLSearchParams();
  }

  return new URLSearchParams(urlValue.slice(queryIndex + 1));
}

function getHeaderValue(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) {
    return value.find((entry) => entry.trim().length > 0);
  }

  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requestPath(urlValue?: string): string {
  return urlValue?.split("?")[0] ?? "";
}

function isQApiRoute(urlValue?: string): boolean {
  const pathname = requestPath(urlValue);
  return pathname === "/api/q/info" || pathname === "/api/q/run";
}

function isPublicQInfoRoute(urlValue?: string): boolean {
  return requestPath(urlValue) === "/api/q/info";
}

function extractAuthorizationToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  const explicitApiKey = getHeaderValue(headers["x-api-key"]);
  if (explicitApiKey) {
    return explicitApiKey.trim();
  }

  const authHeader = getHeaderValue(headers.authorization);
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return undefined;
}

function getGovernancePurposeValues(request: {
  headers: Record<string, string | string[] | undefined>;
  raw: { url?: string };
}): string[] | undefined {
  const dashboardTicket = verifyDashboardSocketTicketFromUrl(
    request.raw.url,
    DASHBOARD_SOCKET_SECRET
  );
  if (dashboardTicket) {
    return dashboardTicket.purpose;
  }

  const headerValue = getHeaderValue(request.headers["x-immaculate-purpose"]);
  const searchParams = getSearchParams(request.raw.url);
  const queryValues = searchParams.getAll("purpose");
  const combined = [
    ...(headerValue ? [headerValue] : []),
    ...queryValues
  ]
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return combined.length > 0 ? combined : undefined;
}

function getGovernanceBinding(
  action: GovernanceAction,
  route: string,
  request: FastifyRequest,
  options?: {
    policyIdOverride?: string;
  }
): GovernanceBinding {
  const searchParams = getSearchParams(request.raw.url);
  const dashboardTicket = verifyDashboardSocketTicketFromUrl(
    request.raw.url,
    DASHBOARD_SOCKET_SECRET
  );
  const actor =
    dashboardTicket?.actor ??
    getHeaderValue(request.headers["x-immaculate-actor"]) ??
    searchParams.get("actor") ??
    (isLoopbackAddress(request.ip) ? `loopback:${request.ip}` : `remote:${request.ip}`);

  return {
    action,
    route,
    actor,
    policyId:
      options?.policyIdOverride ??
      dashboardTicket?.policyId ??
      getHeaderValue(request.headers["x-immaculate-policy-id"]) ??
      searchParams.get("policyId") ??
      searchParams.get("x-immaculate-policy-id") ??
      undefined,
    purpose: getGovernancePurposeValues(request),
    consentScope:
      dashboardTicket?.consentScope ??
      getHeaderValue(request.headers["x-immaculate-consent-scope"]) ??
      searchParams.get("consentScope") ??
      searchParams.get("x-immaculate-consent-scope") ??
      undefined
  };
}

function getEngagementField(
  request: FastifyRequest,
  searchParams: URLSearchParams,
  headerNames: string[],
  queryNames: string[]
): string | undefined {
  for (const headerName of headerNames) {
    const value = getHeaderValue(request.headers[headerName]);
    if (value) {
      return value;
    }
  }

  for (const queryName of queryNames) {
    const value = searchParams.get(queryName)?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseEngagementConfirmation(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "confirmed", "approved"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "denied"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function parseEngagementBudgetCents(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

function getRealWorldEngagementEvidence(
  request: FastifyRequest,
  binding: GovernanceBinding
): RealWorldEngagementEvidence {
  const searchParams = getSearchParams(request.raw.url);
  const dashboardTicket = verifyDashboardSocketTicketFromUrl(
    request.raw.url,
    DASHBOARD_SOCKET_SECRET
  );

  return {
    consentScope: binding.consentScope,
    purpose: binding.purpose,
    receiptTarget:
      getEngagementField(
        request,
        searchParams,
        ["x-immaculate-receipt-target", "x-immaculate-engagement-receipt"],
        ["receiptTarget", "engagementReceipt", "x-immaculate-receipt-target"]
      ) ?? dashboardTicket?.receiptTarget,
    operatorSummary:
      getEngagementField(
        request,
        searchParams,
        ["x-immaculate-operator-summary", "x-immaculate-engagement-summary"],
        ["operatorSummary", "engagementSummary", "x-immaculate-operator-summary"]
      ) ?? dashboardTicket?.operatorSummary,
    operatorConfirmed: parseEngagementConfirmation(
      getEngagementField(
        request,
        searchParams,
        ["x-immaculate-operator-confirmed", "x-immaculate-engagement-confirmed"],
        ["operatorConfirmed", "engagementConfirmed", "x-immaculate-operator-confirmed"]
      )
    ) ?? dashboardTicket?.operatorConfirmed,
    rollbackPlan:
      getEngagementField(
        request,
        searchParams,
        ["x-immaculate-rollback-plan", "x-immaculate-engagement-rollback"],
        ["rollbackPlan", "engagementRollback", "x-immaculate-rollback-plan"]
      ) ?? dashboardTicket?.rollbackPlan,
    sanitizationProof:
      getEngagementField(
        request,
        searchParams,
        ["x-immaculate-sanitization-proof", "x-immaculate-engagement-sanitization"],
        ["sanitizationProof", "engagementSanitization", "x-immaculate-sanitization-proof"]
      ) ?? dashboardTicket?.sanitizationProof,
    budgetCents:
      parseEngagementBudgetCents(
        getEngagementField(
          request,
          searchParams,
          ["x-immaculate-budget-cents", "x-immaculate-engagement-budget-cents"],
          ["budgetCents", "engagementBudgetCents", "x-immaculate-budget-cents"]
        )
      ) ?? dashboardTicket?.budgetCents
  };
}

function projectRealWorldEngagementDecision(decision: RealWorldEngagementDecision) {
  return {
    allowed: decision.allowed,
    action: decision.action,
    mode: decision.mode,
    riskTier: decision.riskTier,
    missingEvidence: decision.missingEvidence,
    stopConditions: decision.stopConditions,
    reason: decision.reason
  };
}

function requireFederationSecret(): string {
  if (!FEDERATION_SHARED_SECRET) {
    throw new Error(
      "Federation shared secret is not configured. Set IMMACULATE_FEDERATION_SHARED_SECRET or IMMACULATE_API_KEY."
    );
  }
  return FEDERATION_SHARED_SECRET;
}

function toFederationNodeIdentityPayload(
  node: Awaited<ReturnType<typeof nodeRegistry.ensureLocalNode>>
): FederationNodeIdentityPayload {
  return {
    nodeId: node.nodeId,
    nodeLabel: node.nodeLabel ?? null,
    hostLabel: node.hostLabel ?? null,
    locality: node.locality,
    controlPlaneUrl: node.controlPlaneUrl ?? null,
    registeredAt: node.registeredAt,
    heartbeatAt: node.heartbeatAt,
    leaseDurationMs: node.leaseDurationMs,
    capabilities: node.capabilities,
    isLocal: node.isLocal,
    costPerHourUsd: node.costPerHourUsd ?? null,
    deviceAffinityTags: node.deviceAffinityTags
  };
}

function toFederationWorkerIdentityPayload(
  worker: Awaited<ReturnType<typeof intelligenceWorkerRegistry.listWorkers>>[number]
): FederationWorkerIdentityPayload {
  return {
    workerId: worker.workerId,
    workerLabel: worker.workerLabel ?? null,
    hostLabel: worker.hostLabel ?? null,
    nodeId: worker.nodeId ?? null,
    locality: worker.locality ?? null,
    executionProfile: worker.executionProfile,
    executionEndpoint: worker.executionEndpoint ?? null,
    registeredAt: worker.registeredAt,
    heartbeatAt: worker.heartbeatAt,
    leaseDurationMs: worker.leaseDurationMs,
    watch: worker.watch,
    allowHostRisk: worker.allowHostRisk,
    supportedBaseModels: worker.supportedBaseModels,
    preferredLayerIds: worker.preferredLayerIds,
    costPerHourUsd: worker.costPerHourUsd ?? null,
    deviceAffinityTags: worker.deviceAffinityTags
  };
}

function toFederationNodeLeasePayload(
  node: Awaited<ReturnType<typeof nodeRegistry.ensureLocalNode>>
): FederationNodeLeasePayload {
  return {
    nodeId: node.nodeId,
    heartbeatAt: node.heartbeatAt,
    leaseDurationMs: node.leaseDurationMs
  };
}

function toFederationWorkerLeasePayload(
  worker: Awaited<ReturnType<typeof intelligenceWorkerRegistry.listWorkers>>[number],
  fallbackNodeId: string
): FederationWorkerLeasePayload {
  return {
    workerId: worker.workerId,
    nodeId: worker.nodeId ?? fallbackNodeId,
    heartbeatAt: worker.heartbeatAt,
    leaseDurationMs: worker.leaseDurationMs
  };
}

async function buildFederationMembershipExport(now = new Date().toISOString()) {
  const secret = requireFederationSecret();
  const localNode = await nodeRegistry.ensureLocalNode(now);
  const nodeState = await nodeRegistry.listNodes(now);
  const workers = (await intelligenceWorkerRegistry.listWorkers(now, nodeState.nodes)).filter(
    (worker) => (worker.nodeId ?? localNode.nodeId) === localNode.nodeId
  );

  return {
    exportedAt: now,
    exporterNodeId: localNode.nodeId,
    node: signFederationPayload(toFederationNodeIdentityPayload(localNode), {
      issuerNodeId: localNode.nodeId,
      secret,
      issuedAt: now
    }),
    workers: workers.map((worker) =>
      signFederationPayload(toFederationWorkerIdentityPayload(worker), {
        issuerNodeId: localNode.nodeId,
        secret,
        issuedAt: now
      })
    )
  };
}

async function buildFederationLeaseExport(now = new Date().toISOString()) {
  const secret = requireFederationSecret();
  const localNode = await nodeRegistry.ensureLocalNode(now);
  const nodeState = await nodeRegistry.listNodes(now);
  const workers = (await intelligenceWorkerRegistry.listWorkers(now, nodeState.nodes)).filter(
    (worker) => (worker.nodeId ?? localNode.nodeId) === localNode.nodeId
  );

  return {
    exportedAt: now,
    exporterNodeId: localNode.nodeId,
    node: signFederationPayload(toFederationNodeLeasePayload(localNode), {
      issuerNodeId: localNode.nodeId,
      secret,
      issuedAt: now
    }),
    workers: workers.map((worker) =>
      signFederationPayload(toFederationWorkerLeasePayload(worker, localNode.nodeId), {
        issuerNodeId: localNode.nodeId,
        secret,
        issuedAt: now
      })
    )
  };
}

async function listFederationPeerViews(now = new Date().toISOString()): Promise<FederationPeerView[]> {
  return federationPeerRegistry.listPeers(now);
}

function remoteExecutionOutcomeSummaries(snapshot = engine.getSnapshot()) {
  return summarizeRemoteExecutionOutcomes(snapshot.cognitiveExecutions);
}

async function listIntelligenceWorkerViewsWithOutcomes(now = new Date().toISOString()) {
  const nodeState = await nodeRegistry.listNodes(now);
  const peerViews = await listFederationPeerViews(now);
  const executionOutcomes = remoteExecutionOutcomeSummaries();
  const workers = await intelligenceWorkerRegistry.listWorkers(
    now,
    nodeState.nodes,
    peerViews,
    [...executionOutcomes.workerSummaries.values()]
  );
  return {
    nodeState,
    peerViews,
    workers,
    executionOutcomes
  };
}

async function computeFederatedExecutionPressure(options?: {
  preferredLayerIds?: string[];
  preferredDeviceAffinityTags?: string[];
  baseModel?: string;
  target?: string;
}) {
  const workerState = await listIntelligenceWorkerViewsWithOutcomes();
  return {
    ...workerState,
    pressure: buildFederatedExecutionPressure({
      peerViews: workerState.peerViews,
      workers: workerState.workers,
      preferredLayerIds: options?.preferredLayerIds,
      preferredDeviceAffinityTags: options?.preferredDeviceAffinityTags,
      baseModel: options?.baseModel,
      target: options?.target
    })
  };
}

async function recordFederatedExecutionOutcome(options: {
  execution: {
    status: "completed" | "failed";
    latencyMs: number;
    assignedWorkerProfile?: "local" | "remote";
    assignedWorkerPeerId?: string;
    responsePreview?: string;
  };
}) {
  if (
    options.execution.assignedWorkerProfile !== "remote" ||
    !options.execution.assignedWorkerPeerId
  ) {
    return;
  }

  try {
    await federationPeerRegistry.recordExecutionOutcome({
      peerId: options.execution.assignedWorkerPeerId,
      status: options.execution.status,
      latencyMs: options.execution.latencyMs,
      error:
        options.execution.status === "failed"
          ? options.execution.responsePreview?.slice(0, 160)
          : undefined
    });
    if (options.execution.status === "failed") {
      await federationPeerRegistry.scheduleRepair({
        peerId: options.execution.assignedWorkerPeerId,
        cause: options.execution.responsePreview?.slice(0, 160) || "execution_failed",
        source: "execution-failure"
      });
    }
  } catch (error) {
    app.log.warn(
      {
        peerId: options.execution.assignedWorkerPeerId,
        message: error instanceof Error ? error.message : "unknown error"
      },
      "Unable to record federated execution outcome."
    );
  }
}

async function attemptFederationPeerRepairByPeerId(options: {
  peerId: string;
  cause: string;
  source: string;
  now?: string;
}): Promise<FederatedRepairSummary> {
  const now = options.now ?? new Date().toISOString();
  const peer = await federationPeerRegistry.getPeerRecord(options.peerId);
  if (!peer) {
    return {
      attempted: false,
      peerId: options.peerId,
      outcome: "failed",
      error: "unknown federation peer"
    };
  }

  await federationPeerRegistry.scheduleRepair({
    peerId: options.peerId,
    cause: options.cause,
    source: options.source,
    now
  });
  await federationPeerRegistry.beginRepair({
    peerId: options.peerId,
    cause: options.cause,
    source: options.source,
    now
  });

  try {
    await renewFederationPeerLeaseByPeerId(options.peerId);
    await federationPeerRegistry.markRepairSuccess({
      peerId: options.peerId,
      action: "lease-renewal",
      now
    });
    return {
      attempted: true,
      peerId: options.peerId,
      outcome: "lease-renewed",
      action: "lease-renewal"
    };
  } catch (leaseError) {
    const leaseMessage =
      leaseError instanceof Error ? leaseError.message : "unknown federation lease renewal error";
    try {
      await refreshFederationPeer(options.peerId);
      await renewFederationPeerLeaseByPeerId(options.peerId);
      await federationPeerRegistry.markRepairSuccess({
        peerId: options.peerId,
        action: "membership-refresh-renewal",
        now
      });
      return {
        attempted: true,
        peerId: options.peerId,
        outcome: "membership-refresh-renewed",
        action: "membership-refresh-renewal"
      };
    } catch (refreshError) {
      const refreshMessage =
        refreshError instanceof Error
          ? refreshError.message
          : "unknown federation membership refresh error";
      const delayMs = Math.max(
        2_000,
        peer.leaseRefreshIntervalMs,
        peer.configuredLeaseRefreshIntervalMs
      );
      await federationPeerRegistry.markRepairFailure({
        peerId: options.peerId,
        error: `${leaseMessage}; ${refreshMessage}`,
        action: "membership-refresh-renewal",
        delayMs,
        now
      });
      return {
        attempted: true,
        peerId: options.peerId,
        outcome: "failed",
        action: "membership-refresh-renewal",
        error: `${leaseMessage}; ${refreshMessage}`
      };
    }
  }
}

function createFederatedRepairGroupId(options: {
  layerId: string;
  sessionId?: string;
  executionId: string;
}): string {
  return `repair-${hashValue(
    `${options.sessionId ?? "system"}:${options.layerId}:${options.executionId}`
  ).slice(0, 16)}`;
}

function shouldRetryFederatedExecution(execution: CognitiveExecutionRecord): boolean {
  return execution.status === "failed" && execution.assignedWorkerProfile === "remote";
}

async function attemptAlternateFederatedExecution(options: {
  layer: IntelligenceLayer;
  firstResult: CognitivePassResult;
  consentScope?: string;
  sessionId?: string;
  reservation: FederatedRetryReservation;
  runRetry: (options: FederatedRetryRunOptions) => Promise<CognitivePassResult>;
}): Promise<CognitivePassResult> {
  if (!shouldRetryFederatedExecution(options.firstResult.execution)) {
    return options.firstResult;
  }

  const failedPeerId = options.firstResult.execution.assignedWorkerPeerId?.trim();
  if (!failedPeerId) {
    return options.firstResult;
  }

  const repairCause =
    options.firstResult.execution.responsePreview?.trim().slice(0, 160) || "execution_failed";
  const repairGroupId = createFederatedRepairGroupId({
    layerId: options.layer.id,
    sessionId: options.sessionId,
    executionId: options.firstResult.execution.id
  });
  let repairSummary: FederatedRepairSummary = {
    attempted: false,
    peerId: failedPeerId,
    outcome: "failed"
  };

  try {
    repairSummary = await attemptFederationPeerRepairByPeerId({
      peerId: failedPeerId,
      cause: repairCause,
      source: "runtime-retry"
    });
  } catch (error) {
    repairSummary = {
      attempted: true,
      peerId: failedPeerId,
      outcome: "failed",
      error: error instanceof Error ? error.message : "unknown federation repair error"
    };
  }

  try {
    const retryAssignment = await reserveExecutionWorker({
      layer: options.layer,
      requestedExecutionDecision: options.reservation.requestedExecutionDecision,
      target: options.reservation.target,
      fallbackLocalPoolSize: options.reservation.fallbackLocalPoolSize,
      preferredDeviceAffinityTags: options.reservation.preferredDeviceAffinityTags,
      avoidPeerIds: [...new Set([...(options.reservation.avoidPeerIds ?? []), failedPeerId])],
      maxObservedLatencyMs: options.reservation.maxObservedLatencyMs,
      maxCostPerHourUsd: options.reservation.maxCostPerHourUsd,
      requiredHealthyWorkerCount: options.reservation.requiredHealthyWorkerCount,
      backlogPressure: options.reservation.backlogPressure,
      reliabilityFloor: options.reservation.reliabilityFloor
    });
    if (retryAssignment.peerId && retryAssignment.peerId === failedPeerId) {
      await releaseExecutionWorker(retryAssignment);
      return options.firstResult;
    }

    app.log.warn(
      {
        failedExecutionId: options.firstResult.execution.id,
        failedPeerId,
        retryWorkerId: retryAssignment.workerId,
        retryPeerId: retryAssignment.peerId ?? null,
        repairOutcome: repairSummary.outcome,
        repairAction: repairSummary.action,
        repairError: repairSummary.error
      },
      "Retrying federated cognitive execution on an alternate worker."
    );

    return await options.runRetry({
      assignment: retryAssignment,
      repairGroupId,
      repairAttempt: 2,
      retriedFromExecutionId: options.firstResult.execution.id,
      repairCause
    });
  } catch (error) {
    app.log.warn(
      {
        failedExecutionId: options.firstResult.execution.id,
        failedPeerId,
        repairOutcome: repairSummary.outcome,
        message: error instanceof Error ? error.message : "unknown retry reservation error"
      },
      "Unable to secure an alternate execution worker after federated failure."
    );
    return options.firstResult;
  }
}

function federationRequestHeaders(token?: string): HeadersInit {
  return {
    ...(token?.trim() || API_KEY
      ? { authorization: `Bearer ${(token?.trim() || API_KEY)!}` }
      : {}),
    "x-immaculate-purpose": "cognitive-trace-read",
    "x-immaculate-consent-scope": "system:intelligence",
    "x-immaculate-actor": "federation-sync"
  };
}

function federationTelemetryAllowed(executionProfile: IntelligenceWorkerExecutionProfile | undefined): boolean {
  return executionProfile === "local";
}

function federationNodeTelemetryAllowed(isLocal: boolean | undefined): boolean {
  return isLocal === true;
}

function rejectFederationQueryToken(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!extractQueryToken(request.raw.url)) {
    return false;
  }
  reply.code(400).send({
    error: "federation_query_token_rejected",
    message: "Federation routes require an Authorization header; query-string tokens are rejected."
  });
  return true;
}

async function evictFederationPeerState(options: {
  expectedNodeId?: string | null;
  controlPlaneUrl?: string | null;
}) {
  const now = new Date().toISOString();
  const nodeState = await nodeRegistry.listNodes(now);
  const remoteNode =
    nodeState.nodes.find(
      (node) =>
        !node.isLocal &&
        ((options.expectedNodeId && node.nodeId === options.expectedNodeId) ||
          (options.controlPlaneUrl && node.controlPlaneUrl === options.controlPlaneUrl))
    ) ?? null;
  if (!remoteNode) {
    return {
      evictedNodeId: null,
      removedWorkerIds: [] as string[]
    };
  }

  const workers = await intelligenceWorkerRegistry.listWorkers(now, nodeState.nodes);
  const removedWorkerIds: string[] = [];
  for (const worker of workers) {
    if (worker.nodeId === remoteNode.nodeId && worker.executionProfile === "remote") {
      await intelligenceWorkerRegistry.removeWorker(worker.workerId, now, nodeState.nodes);
      removedWorkerIds.push(worker.workerId);
    }
  }
  await nodeRegistry.removeNode(remoteNode.nodeId, now);
  return {
    evictedNodeId: remoteNode.nodeId,
    removedWorkerIds
  };
}

async function syncFederationPeer(options: {
  peerId?: string;
  controlPlaneUrl: string;
  authorizationToken?: string;
  expectedNodeId?: string;
  maxObservedLatencyMs?: number;
  priorSmoothedLatencyMs?: number | null;
  now?: string;
}) {
  const secret = requireFederationSecret();
  const now = options.now ?? new Date().toISOString();
  const normalizedControlPlaneUrl = normalizeFederationControlPlaneUrl(options.controlPlaneUrl);
  const startedAtMs = Date.now();
  const response = await fetch(`${normalizedControlPlaneUrl}/api/federation/membership`, {
    headers: federationRequestHeaders(options.authorizationToken),
    redirect: "error",
    cache: "no-store"
  });
  const observedLatencyMs = Date.now() - startedAtMs;
  const effectiveObservedLatencyMs = smoothObservedLatency(
    options.priorSmoothedLatencyMs,
    observedLatencyMs
  );

  if (!response.ok) {
    throw new Error(`Federation membership fetch failed with status ${response.status}.`);
  }
  if (
    typeof options.maxObservedLatencyMs === "number" &&
    Number.isFinite(options.maxObservedLatencyMs) &&
    observedLatencyMs > options.maxObservedLatencyMs
  ) {
    throw new Error(
      `Federation peer latency ${observedLatencyMs} ms exceeds limit ${options.maxObservedLatencyMs} ms.`
    );
  }

  const payload = (await response.json()) as {
    accepted?: boolean;
    membership?: {
      exportedAt: string;
      exporterNodeId: string;
      node: FederationSignedEnvelope<FederationNodeIdentityPayload>;
      workers: FederationSignedEnvelope<FederationWorkerIdentityPayload>[];
    };
  };

  if (!payload.accepted || !payload.membership) {
    throw new Error("Federation membership response was missing signed membership data.");
  }

  const nodeEnvelope = payload.membership.node;
  const nodeVerification = verifyFederationEnvelope(nodeEnvelope, {
    secret,
    expectedIssuerNodeId: payload.membership.exporterNodeId,
    now,
    maxAgeMs: FEDERATION_ENVELOPE_MAX_AGE_MS,
    maxClockSkewMs: FEDERATION_ENVELOPE_MAX_CLOCK_SKEW_MS
  });
  if (!nodeVerification.verified) {
    throw new Error(`Federation node identity verification failed: ${nodeVerification.reason}`);
  }

  const remoteNodePayload = nodeEnvelope.payload;
  if (options.expectedNodeId && remoteNodePayload.nodeId !== options.expectedNodeId) {
    throw new Error(
      `Federation peer returned ${remoteNodePayload.nodeId}; expected ${options.expectedNodeId}.`
    );
  }

  const remoteNode = await nodeRegistry.registerNode({
    nodeId: remoteNodePayload.nodeId,
    nodeLabel: remoteNodePayload.nodeLabel ?? undefined,
    hostLabel: remoteNodePayload.hostLabel ?? undefined,
    locality: remoteNodePayload.locality,
    controlPlaneUrl: remoteNodePayload.controlPlaneUrl ?? normalizedControlPlaneUrl,
    registeredAt: remoteNodePayload.registeredAt,
    heartbeatAt: remoteNodePayload.heartbeatAt,
    leaseDurationMs: remoteNodePayload.leaseDurationMs,
    capabilities: remoteNodePayload.capabilities,
    isLocal: false,
    identityAlgorithm: nodeEnvelope.algorithm,
    identityKeyId: nodeEnvelope.keyId,
    identityIssuerNodeId: nodeEnvelope.issuerNodeId,
    identityIssuedAt: nodeEnvelope.issuedAt,
    identitySignature: nodeEnvelope.signature,
    identityVerified: true,
    observedLatencyMs: effectiveObservedLatencyMs,
    costPerHourUsd: remoteNodePayload.costPerHourUsd ?? null,
    deviceAffinityTags: remoteNodePayload.deviceAffinityTags
  });

  const nodeState = await nodeRegistry.listNodes();
  const importedWorkers: Awaited<ReturnType<typeof intelligenceWorkerRegistry.registerWorker>>[] = [];
  const importedWorkerIds = new Set<string>();

  for (const workerEnvelope of payload.membership.workers) {
    const workerVerification = verifyFederationEnvelope(workerEnvelope, {
      secret,
      expectedIssuerNodeId: remoteNode.nodeId,
      now,
      maxAgeMs: FEDERATION_ENVELOPE_MAX_AGE_MS,
      maxClockSkewMs: FEDERATION_ENVELOPE_MAX_CLOCK_SKEW_MS
    });
    if (!workerVerification.verified) {
      throw new Error(
        `Federation worker identity verification failed for ${workerEnvelope.payload.workerId}: ${workerVerification.reason}`
      );
    }
    if (
      workerEnvelope.payload.nodeId &&
      workerEnvelope.payload.nodeId !== remoteNode.nodeId
    ) {
      throw new Error(
        `Federation worker ${workerEnvelope.payload.workerId} belongs to ${workerEnvelope.payload.nodeId}, not ${remoteNode.nodeId}.`
      );
    }

    importedWorkerIds.add(workerEnvelope.payload.workerId);
    importedWorkers.push(
      await intelligenceWorkerRegistry.registerWorker(
        {
          workerId: workerEnvelope.payload.workerId,
          workerLabel: workerEnvelope.payload.workerLabel ?? undefined,
          hostLabel: workerEnvelope.payload.hostLabel ?? undefined,
          nodeId: remoteNode.nodeId,
          locality: workerEnvelope.payload.locality ?? remoteNode.locality,
          executionProfile: "remote",
          executionEndpoint: workerEnvelope.payload.executionEndpoint ?? undefined,
          registeredAt: workerEnvelope.payload.registeredAt,
          heartbeatAt: workerEnvelope.payload.heartbeatAt,
          leaseDurationMs: workerEnvelope.payload.leaseDurationMs,
          watch: workerEnvelope.payload.watch,
          allowHostRisk: workerEnvelope.payload.allowHostRisk,
          supportedBaseModels: workerEnvelope.payload.supportedBaseModels,
          preferredLayerIds: workerEnvelope.payload.preferredLayerIds,
          identityAlgorithm: workerEnvelope.algorithm,
          identityKeyId: workerEnvelope.keyId,
          identityIssuerNodeId: workerEnvelope.issuerNodeId,
          identityIssuedAt: workerEnvelope.issuedAt,
          identitySignature: workerEnvelope.signature,
          identityVerified: true,
          observedLatencyMs: effectiveObservedLatencyMs,
          costPerHourUsd: workerEnvelope.payload.costPerHourUsd ?? null,
          deviceAffinityTags: workerEnvelope.payload.deviceAffinityTags
        },
        nodeState.nodes
      )
    );
  }

  const existingWorkers = await intelligenceWorkerRegistry.listWorkers(undefined, nodeState.nodes);
  const removedWorkers: string[] = [];
  for (const worker of existingWorkers) {
    if (
      worker.nodeId === remoteNode.nodeId &&
      worker.executionProfile === "remote" &&
      !importedWorkerIds.has(worker.workerId)
    ) {
      await intelligenceWorkerRegistry.removeWorker(worker.workerId, undefined, nodeState.nodes);
      removedWorkers.push(worker.workerId);
    }
  }

  return {
    observedLatencyMs,
    effectiveObservedLatencyMs,
    remoteNode,
    importedWorkers,
    removedWorkers
  };
}

async function renewFederationPeerLease(options: {
  peerId?: string;
  controlPlaneUrl: string;
  authorizationToken?: string;
  expectedNodeId?: string;
  maxObservedLatencyMs?: number;
  priorSmoothedLatencyMs?: number | null;
  now?: string;
}) {
  const secret = requireFederationSecret();
  const now = options.now ?? new Date().toISOString();
  const normalizedControlPlaneUrl = normalizeFederationControlPlaneUrl(options.controlPlaneUrl);
  const startedAtMs = Date.now();
  const response = await fetch(`${normalizedControlPlaneUrl}/api/federation/leases`, {
    headers: federationRequestHeaders(options.authorizationToken),
    redirect: "error",
    cache: "no-store"
  });
  const observedLatencyMs = Date.now() - startedAtMs;
  const effectiveObservedLatencyMs = smoothObservedLatency(
    options.priorSmoothedLatencyMs,
    observedLatencyMs
  );

  if (!response.ok) {
    throw new Error(`Federation lease fetch failed with status ${response.status}.`);
  }
  if (
    typeof options.maxObservedLatencyMs === "number" &&
    Number.isFinite(options.maxObservedLatencyMs) &&
    observedLatencyMs > options.maxObservedLatencyMs
  ) {
    throw new Error(
      `Federation lease latency ${observedLatencyMs} ms exceeds limit ${options.maxObservedLatencyMs} ms.`
    );
  }

  const payload = (await response.json()) as {
    accepted?: boolean;
    leases?: {
      exportedAt: string;
      exporterNodeId: string;
      node: FederationSignedEnvelope<FederationNodeLeasePayload>;
      workers: FederationSignedEnvelope<FederationWorkerLeasePayload>[];
    };
  };

  if (!payload.accepted || !payload.leases) {
    throw new Error("Federation lease response was missing signed lease data.");
  }

  const nodeEnvelope = payload.leases.node;
  const nodeVerification = verifyFederationEnvelope(nodeEnvelope, {
    secret,
    expectedIssuerNodeId: payload.leases.exporterNodeId,
    now,
    maxAgeMs: FEDERATION_ENVELOPE_MAX_AGE_MS,
    maxClockSkewMs: FEDERATION_ENVELOPE_MAX_CLOCK_SKEW_MS
  });
  if (!nodeVerification.verified) {
    throw new Error(`Federation node lease verification failed: ${nodeVerification.reason}`);
  }

  const nodeLease = nodeEnvelope.payload;
  if (options.expectedNodeId && nodeLease.nodeId !== options.expectedNodeId) {
    throw new Error(
      `Federation lease returned ${nodeLease.nodeId}; expected ${options.expectedNodeId}.`
    );
  }

  const existingNode = await nodeRegistry.getNode(nodeLease.nodeId, now);
  if (!existingNode) {
    throw new Error(
      `Federation lease renewal requires an imported node for ${nodeLease.nodeId}; refresh membership first.`
    );
  }

  const renewedNode = await nodeRegistry.heartbeatNode({
    nodeId: nodeLease.nodeId,
    heartbeatAt: nodeLease.heartbeatAt,
    leaseDurationMs: nodeLease.leaseDurationMs,
    identityAlgorithm: nodeEnvelope.algorithm,
    identityKeyId: nodeEnvelope.keyId,
    identityIssuerNodeId: nodeEnvelope.issuerNodeId,
    identityIssuedAt: nodeEnvelope.issuedAt,
    identitySignature: nodeEnvelope.signature,
    identityVerified: true,
    observedLatencyMs: effectiveObservedLatencyMs
  });

  const nodeState = await nodeRegistry.listNodes(now);
  const workers = await intelligenceWorkerRegistry.listWorkers(now, nodeState.nodes);
  const workerById = new Map(workers.map((worker) => [worker.workerId, worker]));
  const renewedWorkers: Awaited<
    ReturnType<typeof intelligenceWorkerRegistry.heartbeatWorker>
  >[] = [];
  const skippedWorkerIds: string[] = [];

  for (const workerEnvelope of payload.leases.workers) {
    const workerVerification = verifyFederationEnvelope(workerEnvelope, {
      secret,
      expectedIssuerNodeId: renewedNode.nodeId,
      now,
      maxAgeMs: FEDERATION_ENVELOPE_MAX_AGE_MS,
      maxClockSkewMs: FEDERATION_ENVELOPE_MAX_CLOCK_SKEW_MS
    });
    if (!workerVerification.verified) {
      throw new Error(
        `Federation worker lease verification failed for ${workerEnvelope.payload.workerId}: ${workerVerification.reason}`
      );
    }
    if (workerEnvelope.payload.nodeId !== renewedNode.nodeId) {
      throw new Error(
        `Federation worker lease ${workerEnvelope.payload.workerId} belongs to ${workerEnvelope.payload.nodeId}, not ${renewedNode.nodeId}.`
      );
    }
    const existingWorker = workerById.get(workerEnvelope.payload.workerId);
    if (!existingWorker || existingWorker.executionProfile !== "remote") {
      skippedWorkerIds.push(workerEnvelope.payload.workerId);
      continue;
    }
    renewedWorkers.push(
      await intelligenceWorkerRegistry.heartbeatWorker(
        {
          workerId: workerEnvelope.payload.workerId,
          heartbeatAt: workerEnvelope.payload.heartbeatAt,
          leaseDurationMs: workerEnvelope.payload.leaseDurationMs,
          identityAlgorithm: workerEnvelope.algorithm,
          identityKeyId: workerEnvelope.keyId,
          identityIssuerNodeId: workerEnvelope.issuerNodeId,
          identityIssuedAt: workerEnvelope.issuedAt,
          identitySignature: workerEnvelope.signature,
          identityVerified: true,
          observedLatencyMs: effectiveObservedLatencyMs
        },
        nodeState.nodes
      )
    );
  }

  return {
    observedLatencyMs,
    effectiveObservedLatencyMs,
    renewedNode,
    renewedWorkers,
    skippedWorkerIds
  };
}

async function refreshFederationPeer(peerId: string) {
  const peer = await federationPeerRegistry.getPeerRecord(peerId);
  if (!peer) {
    throw new Error(`Unknown federation peer ${peerId}.`);
  }
  const now = new Date().toISOString();
  try {
    const sync = await syncFederationPeer({
      peerId: peer.peerId,
      controlPlaneUrl: peer.controlPlaneUrl,
      authorizationToken: peer.authorizationToken ?? undefined,
      expectedNodeId: peer.expectedNodeId ?? undefined,
      maxObservedLatencyMs: peer.maxObservedLatencyMs ?? undefined,
      priorSmoothedLatencyMs: peer.smoothedLatencyMs ?? undefined,
      now
    });
    await federationPeerRegistry.markRefreshSuccess({
      peerId: peer.peerId,
      expectedNodeId: sync.remoteNode.nodeId,
      observedLatencyMs: sync.observedLatencyMs,
      now
    });
    const peerView =
      !peer.lastLeaseSuccessAt
        ? await federationPeerRegistry.markLeaseSuccess({
            peerId: peer.peerId,
            observedLatencyMs: sync.observedLatencyMs,
            source: "membership-refresh",
            now
          })
        : (await federationPeerRegistry.getPeer(peer.peerId, now))!;
    return {
      peer: peerView,
      sync
    };
  } catch (error) {
    const peerView = await federationPeerRegistry.markRefreshFailure({
      peerId: peer.peerId,
      error: error instanceof Error ? error.message : "unknown federation refresh error",
      now
    });
    if (peerView.status === "faulted") {
      await evictFederationPeerState({
        expectedNodeId: peerView.expectedNodeId ?? undefined,
        controlPlaneUrl: peerView.controlPlaneUrl
      });
    }
    throw error;
  }
}

async function renewFederationPeerLeaseByPeerId(peerId: string) {
  const peer = await federationPeerRegistry.getPeerRecord(peerId);
  if (!peer) {
    throw new Error(`Unknown federation peer ${peerId}.`);
  }
  const now = new Date().toISOString();
  try {
    const renewal = await renewFederationPeerLease({
      peerId: peer.peerId,
      controlPlaneUrl: peer.controlPlaneUrl,
      authorizationToken: peer.authorizationToken ?? undefined,
      expectedNodeId: peer.expectedNodeId ?? undefined,
      maxObservedLatencyMs: peer.maxObservedLatencyMs ?? undefined,
      priorSmoothedLatencyMs: peer.leaseSmoothedLatencyMs ?? peer.smoothedLatencyMs ?? undefined,
      now
    });
    const peerView = await federationPeerRegistry.markLeaseSuccess({
      peerId: peer.peerId,
      observedLatencyMs: renewal.observedLatencyMs,
      now
    });
    return {
      peer: peerView,
      renewal
    };
  } catch (error) {
    const peerView = await federationPeerRegistry.markLeaseFailure({
      peerId: peer.peerId,
      error: error instanceof Error ? error.message : "unknown federation lease renewal error",
      now
    });
    if (peerView.leaseStatus === "faulted" || peerView.status === "faulted") {
      await evictFederationPeerState({
        expectedNodeId: peerView.expectedNodeId ?? undefined,
        controlPlaneUrl: peerView.controlPlaneUrl
      });
    }
    throw error;
  }
}

async function refreshDueFederationPeers() {
  const now = new Date().toISOString();
  const peers = await federationPeerRegistry.listPeers(now);
  for (const peer of peers) {
    if (peer.status === "faulted") {
      await evictFederationPeerState({
        expectedNodeId: peer.expectedNodeId ?? undefined,
        controlPlaneUrl: peer.controlPlaneUrl
      });
    }
    if (!peer.refreshDue) {
      continue;
    }
    try {
      await refreshFederationPeer(peer.peerId);
    } catch (error) {
      app.log.warn(
        {
          peerId: peer.peerId,
          controlPlaneUrl: peer.controlPlaneUrl,
          message: error instanceof Error ? error.message : "unknown federation refresh error"
        },
        "Federation peer refresh failed."
      );
    }
  }
}

async function renewDueFederationPeerLeases() {
  const now = new Date().toISOString();
  const peers = await federationPeerRegistry.listPeers(now);
  for (const peer of peers) {
    if (peer.leaseStatus === "faulted" || peer.status === "faulted") {
      await evictFederationPeerState({
        expectedNodeId: peer.expectedNodeId ?? undefined,
        controlPlaneUrl: peer.controlPlaneUrl
      });
    }
    if (!peer.leaseRefreshDue) {
      continue;
    }
    try {
      await renewFederationPeerLeaseByPeerId(peer.peerId);
    } catch (error) {
      app.log.warn(
        {
          peerId: peer.peerId,
          controlPlaneUrl: peer.controlPlaneUrl,
          message:
            error instanceof Error ? error.message : "unknown federation lease renewal error"
        },
        "Federation peer lease renewal failed."
      );
    }
  }
}

async function repairDueFederationPeers() {
  const now = new Date().toISOString();
  const peers = await federationPeerRegistry.listPeers(now);
  for (const peer of peers) {
    if (!peer.repairDue) {
      continue;
    }
    try {
      const summary = await attemptFederationPeerRepairByPeerId({
        peerId: peer.peerId,
        cause: peer.lastRepairCause ?? peer.lastRepairError ?? "scheduled_repair",
        source: peer.lastRepairSource ?? "background-repair",
        now
      });
      app.log.info(
        {
          peerId: peer.peerId,
          outcome: summary.outcome,
          action: summary.action,
          error: summary.error
        },
        "Completed due federation peer repair attempt."
      );
    } catch (error) {
      app.log.warn(
        {
          peerId: peer.peerId,
          controlPlaneUrl: peer.controlPlaneUrl,
          message: error instanceof Error ? error.message : "unknown federation repair error"
        },
        "Federation peer repair attempt failed."
      );
    }
  }
}

function getSessionConversationMemory(sessionId?: string): SessionConversationMemory {
  return buildSessionConversationMemory({
    conversations: engine.getSnapshot().conversations,
    sessionId
  });
}

function buildReviewRoutingDecision(options: {
  routePlan: AdaptiveRoutePlan;
  sessionId?: string;
  frame?: ReturnType<typeof engine.getSnapshot>["neuroFrames"][number];
  execution?: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"][number];
  consentScope?: string;
  heldReason: string;
}): RoutingDecision {
  const selectedAt = new Date().toISOString();
  const source =
    options.consentScope === "system:benchmark"
      ? "benchmark"
      : options.execution
        ? "cognitive"
        : options.frame
          ? "neuro"
          : "operator";

  return {
    id: `route-${hashValue(
      `${options.sessionId ?? "global"}:${selectedAt}:${options.routePlan.mode}:${options.routePlan.channel}:${options.routePlan.targetNodeId}:held`
    )}`,
    sessionId: options.sessionId,
    source,
    mode: options.routePlan.mode,
    targetNodeId: options.routePlan.targetNodeId,
    channel: options.routePlan.channel,
    adapterId: options.routePlan.recommendedAdapterId,
    transportId: options.routePlan.selectedTransport?.id,
    transportKind: options.routePlan.selectedTransport?.kind,
    transportHealth: options.routePlan.selectedTransport?.health,
    transportPreferenceScore: options.routePlan.selectedTransport?.preferenceScore,
    transportPreferenceRank: options.routePlan.selectedTransport?.preferenceRank,
    decodeConfidence: options.frame?.decodeConfidence ?? 0,
    cognitiveLatencyMs: options.execution?.latencyMs,
    governancePressure: options.routePlan.governancePressure,
    federationPressure: options.routePlan.federationPressure,
    federationObservedLatencyMs: options.routePlan.federationObservedLatencyMs,
    federationRemoteSuccessRatio: options.routePlan.federationRemoteSuccessRatio,
    rationale: `${options.routePlan.rationale} / review=held / ${options.heldReason}`,
    selectedAt
  };
}

function authorizeGovernedAction(
  action: GovernanceAction,
  route: string,
  request: FastifyRequest,
  reply: FastifyReply,
  options?: {
    policyIdOverride?: string;
    realWorldEngagement?: "required";
  }
): boolean {
  const binding = getGovernanceBinding(action, route, request, options);
  const preview = evaluateGovernance(binding);
  if (!preview.allowed) {
    const decision = governance.record(binding, false, preview.reason);
    reply.code(403).send({
      error: "governance_denied",
      message: `Governance denied: ${decision.reason}`,
      decision
    });
    return false;
  }

  if (options?.realWorldEngagement === "required") {
    const engagement = evaluateRealWorldEngagement(
      action,
      getRealWorldEngagementEvidence(request, binding)
    );
    if (!engagement.allowed) {
      const decision = governance.record(binding, false, engagement.reason);
      reply.code(403).send({
        error: "real_world_engagement_denied",
        message: `Real-world engagement denied: ${engagement.missingEvidence.join(", ")}`,
        decision,
        engagement: projectRealWorldEngagementDecision(engagement)
      });
      return false;
    }
  }

  governance.record(binding, true, preview.reason);
  return true;
}

function requireGovernedActionPreHandler(
  action: GovernanceAction,
  route: string,
  options?: {
    policyIdOverride?: string;
    realWorldEngagement?: "required";
  }
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!authorizeGovernedAction(action, route, request, reply, options)) {
      return reply;
    }
    return undefined;
  };
}

function requireFederationGovernedPreHandler(action: GovernanceAction, route: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (rejectFederationQueryToken(request, reply)) {
      return reply;
    }
    if (!authorizeGovernedAction(action, route, request, reply)) {
      return reply;
    }
    return undefined;
  };
}

function authorizeGovernedResourceRead(
  action: GovernanceAction,
  route: string,
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    exactConsentScopes: string[];
    fallbackPrefixes?: string[];
  }
): boolean {
  const binding = getGovernanceBinding(action, route, request);
  const preview = evaluateGovernance(binding);
  if (!preview.allowed) {
    const decision = governance.record(binding, false, preview.reason);
    reply.code(403).send({
      error: "governance_denied",
      message: `Governance denied: ${decision.reason}`,
      decision
    });
    return false;
  }

  const scope = binding.consentScope ?? "";
  const exactMatch = options.exactConsentScopes.includes(scope);
  const fallbackMatch = (options.fallbackPrefixes ?? []).some((prefix) => scope.startsWith(prefix));
  if (!exactMatch && !fallbackMatch) {
    const decision = governance.record(binding, false, "resource_scope_mismatch");
    reply.code(403).send({
      error: "governance_denied",
      message: `Governance denied: ${decision.reason}`,
      decision
    });
    return false;
  }

  governance.record(binding, true, "allowed");
  return true;
}

function getQPublicGovernanceBinding(request: FastifyRequest): GovernanceBinding {
  const binding = getGovernanceBinding("cognitive-execution", "/api/q/run", request, {
    policyIdOverride: "q-public"
  });
  return {
    ...binding,
    policyId: binding.policyId ?? "q-public",
    purpose:
      binding.purpose && binding.purpose.length > 0 ? binding.purpose : ["q-public-inference"],
    consentScope: binding.consentScope ?? "intelligence:q-public"
  };
}

function authorizeQPublicInference(
  request: FastifyRequest,
  reply: FastifyReply
): GovernanceBinding | null {
  const binding = getQPublicGovernanceBinding(request);
  const preview = evaluateGovernance(binding);
  const decision = governance.record(binding, preview.allowed, preview.reason);
  if (decision.allowed) {
    return binding;
  }

  reply.code(403).send({
    error: "governance_denied",
    message: `Governance denied: ${decision.reason}`,
    decision
  });
  return null;
}

function evaluateGovernedSocketAction(
  action: GovernanceAction,
  route: string,
  request: FastifyRequest,
  options?: {
    realWorldEngagement?: "required";
  }
) {
  const binding = getGovernanceBinding(action, route, request);
  const preview = evaluateGovernance(binding);
  if (!preview.allowed) {
    return governance.record(binding, false, preview.reason);
  }

  let projectedEngagement:
    | ReturnType<typeof projectRealWorldEngagementDecision>
    | undefined;
  if (options?.realWorldEngagement === "required") {
    const engagement = evaluateRealWorldEngagement(
      action,
      getRealWorldEngagementEvidence(request, binding)
    );
    projectedEngagement = projectRealWorldEngagementDecision(engagement);
    if (!engagement.allowed) {
      const deniedDecision = governance.record(binding, false, engagement.reason);
      return {
        ...deniedDecision,
        engagement: projectedEngagement
      };
    }
  }

  const decision = governance.record(binding, true, preview.reason);
  if (projectedEngagement) {
    return {
      ...decision,
      engagement: projectedEngagement
    };
  }
  return decision;
}

function isLoopbackAddress(value?: string): boolean {
  if (!value) {
    return false;
  }

  return (
    value === "127.0.0.1" ||
    value === "::1" ||
    value === "::ffff:127.0.0.1" ||
    value === "localhost"
  );
}

function isAuthorizedRequest(request: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
  raw: { url?: string };
}): boolean {
  if (isLoopbackAddress(request.ip)) {
    return true;
  }

  if (!API_KEY) {
    return false;
  }

  const authHeader = request.headers.authorization;
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : undefined;
  return (
    extractAuthorizationToken(request.headers) === API_KEY ||
    bearerToken === API_KEY ||
    Boolean(verifyDashboardSocketTicketFromUrl(request.raw.url, DASHBOARD_SOCKET_SECRET))
  );
}

function attachQApiRateLimitHeaders(
  reply: FastifyReply,
  outcome: {
    limit: number;
    remaining: number;
    retryAfterMs: number;
  }
): void {
  reply.header("x-ratelimit-limit", String(outcome.limit));
  reply.header("x-ratelimit-remaining", String(outcome.remaining));
  reply.header("x-ratelimit-reset-ms", String(outcome.retryAfterMs));
  if (outcome.retryAfterMs > 0) {
    reply.header("retry-after", String(Math.max(1, Math.ceil(outcome.retryAfterMs / 1000))));
  }
}

async function authorizeQApiRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  if (!Q_API_ENABLED) {
    reply.code(404).send({
      error: "q_api_disabled"
    });
    return false;
  }

  if (isPublicQInfoRoute(request.raw.url)) {
    return true;
  }

  const token = extractAuthorizationToken(request.headers);
  if (!token) {
    reply.code(401).send({
      error: "unauthorized",
      message: "Q API requires Authorization: Bearer or X-API-Key."
    });
    return false;
  }

  let context: QApiRequestContext | null = null;
  if (API_KEY && token === API_KEY) {
    context = {
      principalKind: isLoopbackAddress(request.ip) ? "loopback" : "admin",
      subject: isLoopbackAddress(request.ip) ? `loopback:${request.ip}` : `admin:${request.ip}`,
      rateLimit: {
        requestsPerMinute: 600,
        burst: 600,
        maxConcurrentRequests: 8
      }
    };
  } else {
    const authenticated = await qApiKeyRegistry.authenticate(token, {
      requiredScope: "invoke",
      ip: request.ip
    });
    if (!authenticated) {
      reply.code(401).send({
        error: "unauthorized",
        message: "Invalid Q API key."
      });
      return false;
    }

    context = {
      principalKind: "key",
      subject: `qkey:${authenticated.key.keyId}`,
      key: authenticated.key,
      rateLimit: authenticated.key.rateLimit
    };
  }

  const grant = qApiRateLimiter.acquire(context.subject, context.rateLimit);
  attachQApiRateLimitHeaders(reply, grant);
  if (!grant.allowed) {
    reply.code(429).send({
      error: grant.reason,
      message:
        grant.reason === "concurrency_limited"
          ? "Q API concurrency limit exceeded."
          : "Q API rate limit exceeded.",
      retryAfterMs: grant.retryAfterMs
    });
    return false;
  }

  const releaseOnce = (() => {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      grant.release();
    };
  })();
  reply.raw.once("finish", releaseOnce);
  reply.raw.once("close", releaseOnce);
  qApiRequestContexts.set(request.raw, context);
  return true;
}

function getQApiRequestContext(request: FastifyRequest): QApiRequestContext | undefined {
  return qApiRequestContexts.get(request.raw);
}

app.addHook("onRequest", async (request, reply) => {
  const path = requestPath(request.raw.url);
  if (
    request.method === "OPTIONS" ||
    path === "/api/health" ||
    path === "/api/intelligence/status"
  ) {
    return;
  }

  if (isQApiRoute(request.raw.url)) {
    await authorizeQApiRequest(request, reply);
    return;
  }

  if (isAuthorizedRequest(request)) {
    return;
  }

  reply.code(401).send({
    error: "unauthorized"
  });
});

function createBenchmarkJobId(): string {
  return `benchmark-job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trimBenchmarkJobs(): void {
  const ordered = [...benchmarkJobs.values()].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
  );
  for (const stale of ordered.slice(MAX_BENCHMARK_JOBS)) {
    benchmarkJobs.delete(stale.id);
  }
}

function activeBenchmarkBacklogDepth(): number {
  return [...benchmarkJobs.values()].filter(
    (job) => job.status === "queued" || job.status === "running"
  ).length;
}

function startBenchmarkJob(options: {
  packId?: BenchmarkPackId;
  publishWandb: boolean;
}): BenchmarkJob {
  const job: BenchmarkJob = {
    id: createBenchmarkJobId(),
    packId: options.packId,
    publishWandb: options.publishWandb,
    status: "queued",
    createdAt: new Date().toISOString()
  };
  benchmarkJobs.set(job.id, job);
  trimBenchmarkJobs();
  void (async () => {
    let grant: WorkGovernorGrant | undefined;
    try {
      grant = await workGovernor.acquire({
        lane: "benchmark",
        priority: benchmarkGovernorPriority(options.packId),
        weight: benchmarkGovernorWeight(options.packId),
        maxQueueMs: 30_000,
        label: options.packId ?? "benchmark"
      });
      benchmarkJobs.set(job.id, {
        ...benchmarkJobs.get(job.id)!,
        status: "running",
        startedAt: new Date().toISOString()
      });

      const workerArgs: string[] = [];
      if (options.packId) {
        workerArgs.push("--packId", options.packId);
      }
      if (options.publishWandb) {
        workerArgs.push("--publishWandb");
      }

      const spawnPlan = buildBenchmarkWorkerSpawnPlan({
        isTsRuntime: import.meta.url.endsWith(".ts"),
        workerPath: BENCHMARK_WORKER_PATH,
        workerArgs
      });

      const child = spawn(spawnPlan.command, spawnPlan.args, {
        cwd: path.resolve(MODULE_ROOT, ".."),
        env: process.env
      });
      let stdout = "";
      let stderr = "";
      const releaseOnce = (() => {
        let released = false;
        return () => {
          if (released) {
            return;
          }
          released = true;
          grant?.release();
        };
      })();

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      child.on("error", (error: Error) => {
        releaseOnce();
        benchmarkJobs.set(job.id, {
          ...benchmarkJobs.get(job.id)!,
          status: "failed",
          error: error.message,
          completedAt: new Date().toISOString()
        });
      });
      child.on("close", (code) => {
        releaseOnce();
        if (code !== 0) {
          benchmarkJobs.set(job.id, {
            ...benchmarkJobs.get(job.id)!,
            status: "failed",
            error:
              stderr.trim() || stdout.trim() || `Benchmark worker exited with code ${code}.`,
            completedAt: new Date().toISOString()
          });
          return;
        }

        try {
          const payload = JSON.parse(stdout) as {
            benchmark: BenchmarkReport;
            wandb?: Awaited<ReturnType<typeof publishBenchmarkToWandb>>;
          };
          benchmarkJobs.set(job.id, {
            ...benchmarkJobs.get(job.id)!,
            status: "completed",
            benchmark: payload.benchmark,
            wandb: payload.wandb,
            completedAt: new Date().toISOString()
          });
        } catch (error) {
          benchmarkJobs.set(job.id, {
            ...benchmarkJobs.get(job.id)!,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Unable to parse benchmark worker output.",
            completedAt: new Date().toISOString()
          });
        }
      });
    } catch (error) {
      grant?.release();
      benchmarkJobs.set(job.id, {
        ...benchmarkJobs.get(job.id)!,
        status: "failed",
        error: error instanceof Error ? error.message : "Benchmark governor admission failed.",
        completedAt: new Date().toISOString()
      });
    }
  })();

  return job;
}

function emitSnapshot(): void {
  const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()));
  const payload = JSON.stringify({
    type: "snapshot",
    data: snapshot
  });

  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

function applyControl(envelope: ControlEnvelope) {
  const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.control(envelope)));
  void persistence.persist(engine.getDurableState());
  emitSnapshot();
  return snapshot;
}

type DispatchBody = {
  sessionId?: string;
  sourceExecutionId?: string;
  sourceFrameId?: string;
  requestedExecutionDecision?: RequestedExecutionDecision;
  adapterId?: string;
  targetNodeId?: string;
  channel?: ActuationOutput["channel"];
  command?: string;
  intensity?: number;
  suppressed?: boolean;
  dispatchOnApproval?: boolean;
};

function sessionScopeId(consentScope?: string): string | undefined {
  return consentScope?.startsWith("session:") ? consentScope.slice("session:".length) : undefined;
}

function localExecutionWorkerId(slot: number): string {
  return `${LOCAL_WORKER_ID_PREFIX}-slot-${slot}`;
}

async function ensureLocalExecutionWorkers(minCount = 1): Promise<void> {
  const now = new Date().toISOString();
  const slotCount = Math.max(1, Math.min(LOCAL_EXECUTION_WORKER_SLOT_CAP, minCount));
  const localNode = await nodeRegistry.ensureLocalNode(now);

  for (let slot = 1; slot <= slotCount; slot += 1) {
    await intelligenceWorkerRegistry.registerWorker({
      workerId: localExecutionWorkerId(slot),
      workerLabel:
        slotCount > 1 ? `Immaculate Local Worker Slot ${slot}` : "Immaculate Local Worker",
      hostLabel: `${HARNESS_HOST}:${HARNESS_PORT}`,
      nodeId: localNode.nodeId,
      locality: localNode.locality,
      executionProfile: "local",
      executionEndpoint: LOCAL_OLLAMA_ENDPOINT,
      registeredAt: now,
      heartbeatAt: now,
      leaseDurationMs: Math.max(DEFAULT_INTELLIGENCE_WORKER_LEASE_MS, tickIntervalMs * 8),
      watch: true,
      allowHostRisk: false,
      supportedBaseModels: ["*"],
      preferredLayerIds: [],
      identityVerified: true,
      observedLatencyMs: 0,
      costPerHourUsd: Number.isFinite(LOCAL_WORKER_COST_PER_HOUR_USD)
        ? LOCAL_WORKER_COST_PER_HOUR_USD
        : null,
      deviceAffinityTags: LOCAL_WORKER_DEVICE_AFFINITY_TAGS
    });
  }
}

const DEFAULT_INTELLIGENCE_WORKER_LEASE_MS = 45_000;

type ExecutionWorkerSelectionContext = {
  localNode: Awaited<ReturnType<typeof nodeRegistry.ensureLocalNode>>;
  nodeViews: Awaited<ReturnType<typeof nodeRegistry.listNodes>>["nodes"];
  peerViews: Awaited<ReturnType<typeof listFederationPeerViews>>;
  executionOutcomeSummaries: ReturnType<typeof remoteExecutionOutcomeSummaries>["workerSummaries"] extends Map<any, infer V>
    ? V[]
    : never;
};

async function buildExecutionWorkerSelectionContext(): Promise<ExecutionWorkerSelectionContext> {
  const localNode = await nodeRegistry.ensureLocalNode();
  const nodeState = await nodeRegistry.listNodes();
  const peerViews = await listFederationPeerViews();
  const executionOutcomes = remoteExecutionOutcomeSummaries();
  return {
    localNode,
    nodeViews: nodeState.nodes,
    peerViews,
    executionOutcomeSummaries: [...executionOutcomes.workerSummaries.values()]
  };
}

async function reserveExecutionWorker(options: {
  layer: IntelligenceLayer;
  requestedExecutionDecision?: RequestedExecutionDecision;
  target?: string;
  fallbackLocalPoolSize?: number;
  preferredDeviceAffinityTags?: string[];
  avoidPeerIds?: string[];
  maxObservedLatencyMs?: number;
  maxCostPerHourUsd?: number;
  requiredHealthyWorkerCount?: number;
  backlogPressure?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["backlogPressure"];
  reliabilityFloor?: number;
  selectionContext?: ExecutionWorkerSelectionContext;
}): Promise<IntelligenceWorkerAssignment> {
  if (options.requestedExecutionDecision === "preflight_blocked") {
    throw new Error("Execution worker reservation blocked by preflight policy.");
  }

  const selectionContext =
    options.selectionContext ?? (await buildExecutionWorkerSelectionContext());

  let result = await intelligenceWorkerRegistry.assignWorker({
    requestedExecutionDecision: options.requestedExecutionDecision ?? "allow_local",
    baseModel: options.layer.model,
    preferredLayerIds: [options.layer.id],
    recommendedLayerId: options.layer.id,
    target: options.target ?? options.layer.role,
    preferredNodeId:
      options.requestedExecutionDecision === "remote_required" ? undefined : selectionContext.localNode.nodeId,
    preferredLocality: selectionContext.localNode.locality,
    preferredDeviceAffinityTags:
      options.preferredDeviceAffinityTags ??
      [...new Set([options.layer.role, ...(options.target?.includes("swarm") ? ["swarm"] : [])])],
    maxObservedLatencyMs: options.maxObservedLatencyMs,
    maxCostPerHourUsd: options.maxCostPerHourUsd,
    requiredHealthyWorkerCount: options.requiredHealthyWorkerCount,
    backlogPressure: options.backlogPressure,
    reliabilityFloor: options.reliabilityFloor,
    nodeViews: selectionContext.nodeViews,
    peerViews: selectionContext.peerViews,
    avoidPeerIds: options.avoidPeerIds,
    executionOutcomeSummaries: selectionContext.executionOutcomeSummaries
  });

  if (!result.assignment && options.requestedExecutionDecision !== "remote_required") {
    await ensureLocalExecutionWorkers(options.fallbackLocalPoolSize);
    result = await intelligenceWorkerRegistry.assignWorker({
      requestedExecutionDecision: options.requestedExecutionDecision ?? "allow_local",
      baseModel: options.layer.model,
      preferredLayerIds: [options.layer.id],
      recommendedLayerId: options.layer.id,
      target: options.target ?? options.layer.role,
      preferredNodeId: selectionContext.localNode.nodeId,
      preferredLocality: selectionContext.localNode.locality,
      preferredDeviceAffinityTags:
        options.preferredDeviceAffinityTags ??
        [...new Set([options.layer.role, ...(options.target?.includes("swarm") ? ["swarm"] : [])])],
      maxObservedLatencyMs: options.maxObservedLatencyMs,
      maxCostPerHourUsd: options.maxCostPerHourUsd,
      requiredHealthyWorkerCount: options.requiredHealthyWorkerCount,
      backlogPressure: options.backlogPressure,
      reliabilityFloor: options.reliabilityFloor,
      nodeViews: selectionContext.nodeViews,
      peerViews: selectionContext.peerViews,
      avoidPeerIds: options.avoidPeerIds,
      executionOutcomeSummaries: selectionContext.executionOutcomeSummaries
    });
  }

  if (!result.assignment) {
    const availability = `${result.summary.healthyWorkerCount} healthy · ${result.summary.staleWorkerCount} stale · ${result.summary.faultedWorkerCount} faulted · ${result.summary.eligibleWorkerCount} eligible`;
    throw new Error(
      options.requestedExecutionDecision === "remote_required"
        ? `No eligible remote execution worker available for ${options.layer.id}. ${availability}`
        : `No eligible execution worker available for ${options.layer.id}. ${availability}`
    );
  }

  if (
    result.assignment.executionProfile === "remote" &&
    !result.assignment.executionEndpoint?.trim()
  ) {
    throw new Error(
      `Remote execution worker ${result.assignment.workerId} is missing an execution endpoint.`
    );
  }

  return result.assignment;
}

async function reserveExecutionWorkerBatch(options: {
  layers: IntelligenceLayer[];
  requestedExecutionDecision?: RequestedExecutionDecision;
  targetPrefix: string;
  backlogPressure?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["backlogPressure"];
  reliabilityFloor?: number;
  formation?: Pick<
    ReturnType<typeof engine.getSnapshot>["executionSchedules"][number],
    | "parallelFormationMode"
    | "verificationQuorum"
    | "localReplicaCount"
    | "remoteReplicaCount"
    | "boundedRetryBudget"
    | "capabilitySpreadCount"
    | "affinityMode"
    | "deadlineClass"
    | "deadlineBudgetMs"
    | "backpressureAction"
    | "intentAlignmentScore"
  >;
}): Promise<IntelligenceWorkerAssignment[]> {
  if (options.requestedExecutionDecision !== "remote_required") {
    await ensureLocalExecutionWorkers(options.layers.length);
  }
  const selectionContext = await buildExecutionWorkerSelectionContext();
  const batch = await intelligenceWorkerRegistry.assignWorkerBatch({
    avoidDuplicatePeers: true,
    avoidDuplicateNodes:
      (options.formation?.capabilitySpreadCount ?? 0) > 1 && options.layers.length > 1,
    requests: options.layers.map((layer, index) => ({
      requestedExecutionDecision: options.requestedExecutionDecision,
      baseModel: layer.model,
      preferredLayerIds: [layer.id],
      recommendedLayerId: layer.id,
      target: `${options.targetPrefix}:${layer.role}`,
      preferredNodeId:
        options.requestedExecutionDecision === "remote_required"
          ? undefined
          : selectionContext.localNode.nodeId,
      preferredLocality: selectionContext.localNode.locality,
      preferredDeviceAffinityTags: [
        layer.role,
        ...(options.targetPrefix.includes("swarm") ? ["swarm"] : []),
        ...(options.formation?.parallelFormationMode === "hybrid-quorum" ? ["quorum"] : []),
        ...(options.formation?.affinityMode === "quorum-local"
          ? ["local-affinity", "quorum-local"]
          : options.formation?.affinityMode === "local-spread"
            ? ["local-affinity", "local-spread"]
            : options.formation?.affinityMode === "hybrid-spill"
              ? ["spill-affinity"]
              : ["local-pinned"]),
        ...(options.formation?.deadlineClass === "hard"
          ? ["hard-deadline"]
          : options.formation?.deadlineClass === "bounded"
            ? ["bounded-deadline"]
            : ["elastic-deadline"]),
        ...(options.formation?.backpressureAction
          ? [`pressure-${options.formation.backpressureAction}`]
          : []),
        ...(index < (options.formation?.localReplicaCount ?? options.layers.length)
          ? ["local-slot"]
          : ["spill-slot"])
      ],
      preferDistinctDeviceAffinityTags:
        (options.formation?.capabilitySpreadCount ?? 0) > 1 ||
        options.layers.length > 1,
      requiredHealthyWorkerCount: Math.max(1, options.layers.length - index),
      backlogPressure: options.backlogPressure,
      reliabilityFloor: options.reliabilityFloor,
      nodeViews: selectionContext.nodeViews,
      peerViews: selectionContext.peerViews,
      executionOutcomeSummaries: selectionContext.executionOutcomeSummaries
    }))
  });
  if (batch.assignments.length !== options.layers.length) {
    const availability = `${batch.summary.healthyWorkerCount} healthy · ${batch.summary.staleWorkerCount} stale · ${batch.summary.faultedWorkerCount} faulted · ${batch.summary.eligibleWorkerCount} eligible`;
    throw new Error(
      `Parallel worker batch reservation failed for ${options.layers.length} layers. ${availability}`
    );
  }
  return batch.assignments;
}

async function releaseExecutionWorker(assignment: ExecutionWorkerAssignment): Promise<void> {
  if (!assignment?.workerId || !assignment.leaseToken) {
    return;
  }

  try {
    await intelligenceWorkerRegistry.releaseWorker({
      workerId: assignment.workerId,
      leaseToken: assignment.leaseToken
    });
  } catch (error) {
    app.log.warn(
      {
        workerId: assignment.workerId,
        message: error instanceof Error ? error.message : "unknown error"
      },
      "Unable to release execution worker lease."
    );
  }
}

function placementExecutionEndpoint(
  layer: IntelligenceLayer,
  assignment: ExecutionWorkerAssignment
): string {
  return assignment?.executionEndpoint?.trim() || layer.endpoint;
}

function bindExecutionPlacement(options: {
  execution: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"][number];
  assignment: ExecutionWorkerAssignment;
  sessionId?: string;
  executionEndpoint: string;
  executionTopology?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["executionTopology"];
  repairGroupId?: string;
  repairAttempt?: number;
  retriedFromExecutionId?: string;
  repairCause?: string;
  parallelBatchId?: string;
  parallelBatchSize?: number;
  parallelPosition?: number;
}) {
  return {
    ...options.execution,
    sessionId: options.sessionId,
    assignedWorkerId: options.assignment?.workerId,
    assignedWorkerLabel: options.assignment?.workerLabel ?? undefined,
    assignedWorkerHostLabel: options.assignment?.hostLabel ?? undefined,
    assignedWorkerProfile: options.assignment?.executionProfile,
    assignedWorkerNodeId: options.assignment?.nodeId ?? undefined,
    assignedWorkerLocality: options.assignment?.locality ?? undefined,
    assignedWorkerIdentityVerified: options.assignment?.identityVerified,
    assignedWorkerObservedLatencyMs: options.assignment?.observedLatencyMs ?? undefined,
    assignedWorkerCostPerHourUsd: options.assignment?.costPerHourUsd ?? undefined,
    assignedWorkerDeviceAffinityTags: options.assignment?.deviceAffinityTags ?? undefined,
    assignedWorkerPeerId: options.assignment?.peerId ?? undefined,
    assignedWorkerPeerStatus: options.assignment?.peerStatus ?? undefined,
    assignedWorkerPeerLeaseStatus: options.assignment?.peerLeaseStatus ?? undefined,
    assignedWorkerPeerObservedLatencyMs: options.assignment?.peerObservedLatencyMs ?? undefined,
    assignedWorkerPeerTrustRemainingMs:
      options.assignment?.peerTrustRemainingMs ?? undefined,
    assignmentReason: options.assignment?.reason,
    assignmentScore: options.assignment?.score,
    executionEndpoint: options.executionEndpoint,
    executionTopology: options.executionTopology,
    repairGroupId: options.repairGroupId,
    repairAttempt: options.repairAttempt,
    retriedFromExecutionId: options.retriedFromExecutionId,
    repairCause: options.repairCause,
    parallelBatchId: options.parallelBatchId,
    parallelBatchSize: options.parallelBatchSize,
    parallelPosition: options.parallelPosition
  };
}

function resolveBoundSources(options: {
  snapshot: ReturnType<typeof engine.getSnapshot>;
  body: DispatchBody;
  consentScope?: string;
}):
  | {
      sessionId?: string;
      execution?: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"][number];
      frame?: ReturnType<typeof engine.getSnapshot>["neuroFrames"][number];
    }
  | {
      error: {
        code: number;
        body: Record<string, unknown>;
      };
    } {
  const scopedSessionId = sessionScopeId(options.consentScope);
  const requestedSessionId = options.body.sessionId?.trim() || undefined;
  const explicitExecution = options.body.sourceExecutionId
    ? options.snapshot.cognitiveExecutions.find(
        (candidate) => candidate.id === options.body.sourceExecutionId
      )
    : undefined;
  const explicitFrame = options.body.sourceFrameId
    ? options.snapshot.neuroFrames.find((candidate) => candidate.id === options.body.sourceFrameId)
    : undefined;

  if (options.body.sourceExecutionId && !explicitExecution) {
    return {
      error: {
        code: 404,
        body: {
          error: "cognitive_execution_not_found",
          sourceExecutionId: options.body.sourceExecutionId
        }
      }
    };
  }

  if (options.body.sourceFrameId && !explicitFrame) {
    return {
      error: {
        code: 404,
        body: {
          error: "neuro_frame_not_found",
          sourceFrameId: options.body.sourceFrameId
        }
      }
    };
  }

  const resolvedSessionId =
    requestedSessionId ??
    explicitExecution?.sessionId ??
    explicitFrame?.sessionId ??
    scopedSessionId;

  if (scopedSessionId && resolvedSessionId && scopedSessionId !== resolvedSessionId) {
    return {
      error: {
        code: 403,
        body: {
          error: "governance_denied",
          message: "Governance denied: resource_scope_mismatch"
        }
      }
    };
  }

  if (
    explicitExecution?.sessionId &&
    resolvedSessionId &&
    explicitExecution.sessionId !== resolvedSessionId
  ) {
    return {
      error: {
        code: 409,
        body: {
          error: "source_session_mismatch",
          sourceExecutionId: explicitExecution.id,
          sessionId: resolvedSessionId
        }
      }
    };
  }

  if (explicitFrame?.sessionId && resolvedSessionId && explicitFrame.sessionId !== resolvedSessionId) {
    return {
      error: {
        code: 409,
        body: {
          error: "source_session_mismatch",
          sourceFrameId: explicitFrame.id,
          sessionId: resolvedSessionId
        }
      }
    };
  }

  if (!explicitExecution && !explicitFrame) {
    if (!resolvedSessionId) {
      return {
        error: {
          code: 400,
          body: {
            error: "ambiguous_source_context",
            message:
              "Explicit sourceExecutionId/sourceFrameId or a sessionId is required for bounded orchestration."
          }
        }
      };
    }

    const sessionExecution = options.snapshot.cognitiveExecutions.find(
      (candidate) => candidate.sessionId === resolvedSessionId
    );
    const sessionFrame = options.snapshot.neuroFrames.find(
      (candidate) => candidate.sessionId === resolvedSessionId
    );

    if (!sessionExecution && !sessionFrame) {
      return {
        error: {
          code: 404,
          body: {
            error: "session_source_not_found",
            sessionId: resolvedSessionId
          }
        }
      };
    }

    return {
      sessionId: resolvedSessionId,
      execution: sessionExecution,
      frame: sessionFrame
    };
  }

  return {
    sessionId: resolvedSessionId,
    execution: explicitExecution,
    frame: explicitFrame
  };
}

function selectPreferredLayer(preferredRoles?: IntelligenceLayer["role"][]): IntelligenceLayer | null {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const qBackedLayers = snapshot.intelligenceLayers.filter(
    (layer) => truthfulModelLabel(layer.model) === getQModelName()
  );
  const candidateLayers = qBackedLayers.length > 0 ? qBackedLayers : snapshot.intelligenceLayers;
  const rolePriority = new Map([
    ["mid", 0],
    ["reasoner", 1],
    ["soul", 2],
    ["guard", 3]
  ]);

  const roleRank = (role: IntelligenceLayer["role"]): number => {
    if (!preferredRoles || preferredRoles.length === 0) {
      return rolePriority.get(role) ?? 9;
    }
    const index = preferredRoles.indexOf(role);
    return index >= 0 ? index : preferredRoles.length + (rolePriority.get(role) ?? 9);
  };

  return (
    [...candidateLayers]
      .sort((left, right) => {
        const leftStatus = left.status === "ready" ? 0 : left.status === "busy" ? 1 : 2;
        const rightStatus = right.status === "ready" ? 0 : right.status === "busy" ? 1 : 2;
        if (leftStatus !== rightStatus) {
          return leftStatus - rightStatus;
        }
        return roleRank(left.role) - roleRank(right.role);
      })
      .at(0) ?? null
  );
}

function selectPreferredLayers(
  preferredRoles?: IntelligenceLayer["role"][],
  maxCount = 3
): IntelligenceLayer[] {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const qBackedLayers = snapshot.intelligenceLayers.filter(
    (layer) => truthfulModelLabel(layer.model) === getQModelName()
  );
  const candidateLayers = qBackedLayers.length > 0 ? qBackedLayers : snapshot.intelligenceLayers;
  const rolePriority = new Map([
    ["mid", 0],
    ["reasoner", 1],
    ["soul", 2],
    ["guard", 3]
  ]);

  const roleRank = (role: IntelligenceLayer["role"]): number => {
    if (!preferredRoles || preferredRoles.length === 0) {
      return rolePriority.get(role) ?? 9;
    }
    const index = preferredRoles.indexOf(role);
    return index >= 0 ? index : preferredRoles.length + (rolePriority.get(role) ?? 9);
  };

  return [...candidateLayers]
    .filter((layer) => layer.status !== "offline")
    .sort((left, right) => {
      const leftStatus =
        left.status === "ready" ? 0 : left.status === "busy" ? 1 : left.status === "degraded" ? 2 : 3;
      const rightStatus =
        right.status === "ready" ? 0 : right.status === "busy" ? 1 : right.status === "degraded" ? 2 : 3;
      if (leftStatus !== rightStatus) {
        return leftStatus - rightStatus;
      }
      return roleRank(left.role) - roleRank(right.role);
    })
    .slice(0, maxCount);
}

function getPreferredLayer(layerId?: string): IntelligenceLayer | null {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  if (layerId) {
    return snapshot.intelligenceLayers.find((layer) => layer.id === layerId) ?? null;
  }

  return selectPreferredLayer();
}

async function ensurePreferredIntelligenceLayer(
  role: IntelligenceLayer["role"] = "mid"
): Promise<IntelligenceLayer | null> {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const existing =
    [...snapshot.intelligenceLayers]
      .filter(
        (layer) =>
          layer.role === role && truthfulModelLabel(layer.model) === getQModelName()
      )
      .sort((left, right) => {
        const leftStatus =
          left.status === "ready" ? 0 : left.status === "busy" ? 1 : left.status === "degraded" ? 2 : 3;
        const rightStatus =
          right.status === "ready" ? 0 : right.status === "busy" ? 1 : right.status === "degraded" ? 2 : 3;
        return leftStatus - rightStatus;
      })
      .at(0) ?? null;
  if (existing) {
    return existing;
  }

  try {
    const discovered = await discoverPreferredOllamaLayer(role, LOCAL_OLLAMA_ENDPOINT, getQModelName());
    if (!discovered) {
      return null;
    }

    const matching = snapshot.intelligenceLayers.find(
      (layer) =>
        layer.backend === discovered.backend &&
        layer.model === discovered.model &&
        layer.role === discovered.role
    );

    if (matching) {
      return matching;
    }

    engine.registerIntelligenceLayer(discovered);
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    return discovered;
  } catch (error) {
    app.log.warn(
      `Unable to discover a preferred Ollama intelligence layer: ${error instanceof Error ? error.message : "unknown error"}`
    );
    return null;
  }
}

async function ensurePreferredIntelligenceLayers(
  roles: IntelligenceLayer["role"][]
): Promise<IntelligenceLayer[]> {
  const ensured: IntelligenceLayer[] = [];

  for (const role of roles) {
    const layer = await ensurePreferredIntelligenceLayer(role);
    if (layer && !ensured.some((candidate) => candidate.id === layer.id)) {
      ensured.push(layer);
    }
  }

  return ensured;
}

function createActuationOutputId(): string {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function recentGovernanceDeniedCount(): number {
  const windowStart = Date.now() - 5 * 60 * 1000;
  return governance
    .listDecisions()
    .filter((decision) => !decision.allowed && Date.parse(decision.timestamp) >= windowStart).length;
}

function buildProtectionPostureSummary(snapshot = engine.getSnapshot()) {
  return projectProtectionPostureForQ(
    deriveProtectionPosture({
      governanceDecisions: governance.listDecisions(),
      conversations: snapshot.conversations,
      executions: snapshot.cognitiveExecutions,
      routingDecisions: snapshot.routingDecisions
    })
  );
}

function parseAssessmentTrigger(value: unknown): AgentIntelligenceAssessmentTrigger {
  if (
    typeof value === "string" &&
    agentIntelligenceAssessmentTriggers.includes(value as AgentIntelligenceAssessmentTrigger)
  ) {
    return value as AgentIntelligenceAssessmentTrigger;
  }
  return "manual";
}

function poiMonitorStatus() {
  return summarizeAgentIntelligenceAssessments(engine.getSnapshot().agentIntelligenceAssessments);
}

async function recordAgentIntelligenceAssessment(options: {
  trigger: AgentIntelligenceAssessmentTrigger;
  targetLayerId?: string;
  consentScope?: string;
}): Promise<{
  assessment: AgentIntelligenceAssessment;
  snapshot: ReturnType<typeof engine.getSnapshot>;
}> {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const provisionalAssessment = assessAgentIntelligence({
    snapshot,
    events: engine.getEvents(),
    trigger: options.trigger,
    targetLayerId: options.targetLayerId
  });
  const governancePressure = deriveGovernancePressure(
    options.consentScope ?? "system:intelligence:poi",
    governance.getStatus(),
    governance.listDecisions()
  );
  const materialized = await appendDecisionTraceRecord({
    rootDir: persistence.getStatus().rootDir,
    record: {
      decisionTraceId: createDecisionTraceSeed({
        source: "agent-intelligence-assessment",
        sessionId: provisionalAssessment.subjectAgentId,
        executionId: provisionalAssessment.id,
        objective: provisionalAssessment.summary,
        promptDigest: provisionalAssessment.evidenceDigest
      }),
      source: "agent-intelligence-assessment",
      executionId: provisionalAssessment.id,
      release: {
        buildId: releaseMetadata.buildId,
        gitShortSha: releaseMetadata.gitShortSha,
        modelName: getQModelName(),
        foundationModel: getQFoundationModelName(),
        trainingBundleId: releaseMetadata.q.trainingLock?.bundleId
      },
      policy: {
        consentScope: options.consentScope ?? "system:intelligence:poi",
        governancePressure,
        selectedLayerId: provisionalAssessment.subjectLayerId,
        failureClass:
          provisionalAssessment.verdict === "fail"
            ? provisionalAssessment.driftFlags[0] ?? "poi_assessment_failed"
            : undefined
      },
      evidence: {
        sourceIds: provisionalAssessment.evidenceIds,
        evidenceDigest: provisionalAssessment.evidenceDigest
      },
      decisionSummary: {
        routeSuggestion: provisionalAssessment.trigger,
        reasonSummary: provisionalAssessment.summary,
        commitStatement: `Maintain ${provisionalAssessment.baselineVersion} baseline for ${provisionalAssessment.subjectAgentId}.`,
        responsePreview: provisionalAssessment.summary
      },
      selfEvaluation: {
        status: provisionalAssessment.verdict,
        driftDetected: provisionalAssessment.driftFlags.length > 0,
        driftReasonCodes: provisionalAssessment.driftFlags
      }
    }
  });
  const assessment: AgentIntelligenceAssessment = {
    ...provisionalAssessment,
    ledgerEventHash: materialized.ledger.eventHash
  };
  const nextSnapshot = phaseSnapshotSchema.parse(
    projectPhaseSnapshot(
      engine.recordAgentIntelligenceAssessment(
        agentIntelligenceAssessmentSchema.parse(assessment) as AgentIntelligenceAssessment
      ),
      options.consentScope ?? "system:intelligence:poi"
    )
  );
  await persistence.persist(engine.getDurableState());
  emitSnapshot();
  return {
    assessment,
    snapshot: nextSnapshot
  };
}

async function recordAgentIntelligenceAssessmentAfterExecution(
  execution: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"][number],
  consentScope?: string
): Promise<void> {
  try {
    await recordAgentIntelligenceAssessment({
      trigger: "cognitive-execution",
      targetLayerId: execution.layerId,
      consentScope
    });
  } catch (error) {
    app.log.warn(
      {
        layerId: execution.layerId,
        executionId: execution.id,
        error: error instanceof Error ? error.message : "unknown"
      },
      "Unable to record PoI assessment for cognitive execution."
    );
  }
}

async function recordAgentIntelligenceAssessmentAfterConversation(
  conversation: ReturnType<typeof engine.getSnapshot>["conversations"][number],
  consentScope?: string
): Promise<void> {
  try {
    await recordAgentIntelligenceAssessment({
      trigger: "conversation",
      targetLayerId: conversation.turns.at(-1)?.layerId,
      consentScope
    });
  } catch (error) {
    app.log.warn(
      {
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : "unknown"
      },
      "Unable to record PoI assessment for multi-agent conversation."
    );
  }
}

function clampActuationIntensity(value: number | undefined, fallback: number): number {
  const candidate = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(1, Math.max(0, candidate));
}

async function executeCognitivePass(options: {
  layer: IntelligenceLayer;
  objective?: string;
  context?: string;
  consentScope?: string;
  sessionId?: string;
  assignment?: ExecutionWorkerAssignment;
  executionTopology?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["executionTopology"];
  repairGroupId?: string;
  repairAttempt?: number;
  retriedFromExecutionId?: string;
  repairCause?: string;
}) {
  const busyLayer: IntelligenceLayer = {
    ...options.layer,
    status: "busy"
  };
  const executionEndpoint = placementExecutionEndpoint(options.layer, options.assignment);
  const executionLayer: IntelligenceLayer = {
    ...busyLayer,
    endpoint: executionEndpoint
  };
  const startedAt = new Date().toISOString();
  let qContext: Awaited<ReturnType<typeof resolveQOrchestrationContext>> | undefined;

  engine.registerIntelligenceLayer(busyLayer);
  await persistence.persist(engine.getDurableState());
  emitSnapshot();

  try {
    const activeSnapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
    const governancePressure = deriveGovernancePressure(
      options.consentScope,
      governance.getStatus(),
      governance.listDecisions()
    );
    const deniedCount = recentGovernanceDeniedCount();
    qContext = await resolveQOrchestrationContext({
      snapshot: activeSnapshot,
      objective: options.objective,
      context: options.context,
      release: releaseMetadata,
      protectionPosture: buildProtectionPostureSummary(activeSnapshot)
    });
    app.log.info(
      {
        layerId: busyLayer.id,
        role: busyLayer.role,
        workerId: options.assignment?.workerId,
        workerProfile: options.assignment?.executionProfile,
        executionEndpoint,
        governancePressure,
        deniedCount,
        qBundleId: qContext.trainingBundleId,
        qPreferredExecutionLane: qContext.preferredExecutionLane,
        qBlockedLanes: qContext.blockedLanes
      },
      "Executing governed cognitive pass."
    );
    const result = await runOllamaExecution({
      snapshot: activeSnapshot,
      layer: executionLayer,
      objective: options.objective,
      context: options.context,
      governancePressure,
      recentDeniedCount: deniedCount,
      qContext
    });
    const boundExecution = bindExecutionPlacement({
      execution: result.execution,
      assignment: options.assignment,
      sessionId: options.sessionId,
      executionEndpoint,
      executionTopology: options.executionTopology ?? "sequential",
      repairGroupId: options.repairGroupId,
      repairAttempt: options.repairAttempt,
      retriedFromExecutionId: options.retriedFromExecutionId,
      repairCause: options.repairCause
    });
    const tracedExecution = await traceCognitiveExecution({
      execution: boundExecution,
      objective: options.objective,
      context: options.context,
      consentScope: options.consentScope,
      qContext
    });
    const settledLayer: IntelligenceLayer = {
      ...busyLayer,
      status: tracedExecution.status === "completed" ? "ready" : "degraded"
    };

    engine.registerIntelligenceLayer(settledLayer);
    let snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.commitCognitiveExecution(tracedExecution))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    await recordFederatedExecutionOutcome({
      execution: tracedExecution
    });
    await recordAgentIntelligenceAssessmentAfterExecution(tracedExecution, options.consentScope);
    snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.getSnapshot(), options.consentScope)
    );

    return {
      layer: settledLayer,
      execution: tracedExecution,
      response: result.response,
      snapshot,
      failureClass: result.failureClass,
      thinkingDetected: result.thinkingDetected
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unable to run the cognitive layer.";
    const governancePressure = deriveGovernancePressure(
      options.consentScope,
      governance.getStatus(),
      governance.listDecisions()
    );
    const deniedCount = recentGovernanceDeniedCount();
    const failedExecution = {
      id: `cog-${completedAt.replace(/[:.]/g, "-")}-${hashValue(busyLayer.id).slice(0, 8)}`,
      sessionId: options.sessionId,
      layerId: busyLayer.id,
      model: busyLayer.model,
      objective: options.objective ?? "",
      status: "failed" as const,
      latencyMs: Math.max(1, Date.parse(completedAt) - Date.parse(startedAt)),
      startedAt,
      completedAt,
      promptDigest: hashValue(
        `${busyLayer.id}:${options.objective ?? ""}:${options.context ?? ""}:${governancePressure}:${deniedCount}`
      ).slice(0, 24),
      responsePreview: `Cognitive execution failed: ${message}`.slice(0, 280),
      governancePressure,
      recentDeniedCount: deniedCount,
      assignedWorkerId: options.assignment?.workerId,
      assignedWorkerLabel: options.assignment?.workerLabel ?? undefined,
      assignedWorkerHostLabel: options.assignment?.hostLabel ?? undefined,
      assignedWorkerProfile: options.assignment?.executionProfile,
      assignedWorkerNodeId: options.assignment?.nodeId ?? undefined,
      assignedWorkerLocality: options.assignment?.locality ?? undefined,
      assignedWorkerIdentityVerified: options.assignment?.identityVerified,
      assignedWorkerObservedLatencyMs: options.assignment?.observedLatencyMs ?? undefined,
      assignedWorkerCostPerHourUsd: options.assignment?.costPerHourUsd ?? undefined,
      assignedWorkerDeviceAffinityTags: options.assignment?.deviceAffinityTags ?? undefined,
      assignedWorkerPeerId: options.assignment?.peerId ?? undefined,
      assignedWorkerPeerStatus: options.assignment?.peerStatus ?? undefined,
      assignedWorkerPeerLeaseStatus: options.assignment?.peerLeaseStatus ?? undefined,
      assignedWorkerPeerObservedLatencyMs: options.assignment?.peerObservedLatencyMs ?? undefined,
      assignedWorkerPeerTrustRemainingMs:
        options.assignment?.peerTrustRemainingMs ?? undefined,
      assignmentReason: options.assignment?.reason,
      assignmentScore: options.assignment?.score,
      executionEndpoint,
      executionTopology: options.executionTopology ?? "sequential",
      repairGroupId: options.repairGroupId,
      repairAttempt: options.repairAttempt,
      retriedFromExecutionId: options.retriedFromExecutionId,
      repairCause: options.repairCause
    };
    const tracedExecution = await traceCognitiveExecution({
      execution: failedExecution,
      objective: options.objective,
      context: options.context,
      consentScope: options.consentScope,
      qContext
    });
    const failedLayer: IntelligenceLayer = {
      ...busyLayer,
      status: "degraded"
    };
    engine.registerIntelligenceLayer(failedLayer);
    let snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.commitCognitiveExecution(tracedExecution))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    await recordFederatedExecutionOutcome({
      execution: tracedExecution
    });
    await recordAgentIntelligenceAssessmentAfterExecution(tracedExecution, options.consentScope);
    snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.getSnapshot(), options.consentScope)
    );
    return {
      layer: failedLayer,
      execution: tracedExecution,
      response: tracedExecution.responsePreview,
      snapshot,
      failureClass: "http_error",
      thinkingDetected: false
    };
  } finally {
    await releaseExecutionWorker(options.assignment);
  }
}

async function executeScheduledCognitivePass(options: {
  layer: IntelligenceLayer;
  objective: string;
  context?: string;
  consentScope?: string;
  sessionId?: string;
  assignment?: ExecutionWorkerAssignment;
  executionTopology?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["executionTopology"];
  parallelBatchId?: string;
  parallelBatchSize?: number;
  parallelPosition?: number;
  repairGroupId?: string;
  repairAttempt?: number;
  retriedFromExecutionId?: string;
  repairCause?: string;
}) {
  const busyLayer: IntelligenceLayer = {
    ...options.layer,
    status: "busy"
  };
  const executionEndpoint = placementExecutionEndpoint(options.layer, options.assignment);
  const executionLayer: IntelligenceLayer = {
    ...busyLayer,
    endpoint: executionEndpoint
  };
  const startedAt = new Date().toISOString();
  let qContext: Awaited<ReturnType<typeof resolveQOrchestrationContext>> | undefined;

  engine.registerIntelligenceLayer(busyLayer);
  await persistence.persist(engine.getDurableState());
  emitSnapshot();

  try {
    const activeSnapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
    const governancePressure = deriveGovernancePressure(
      options.consentScope,
      governance.getStatus(),
      governance.listDecisions()
    );
    const deniedCount = recentGovernanceDeniedCount();
    qContext = await resolveQOrchestrationContext({
      snapshot: activeSnapshot,
      objective: options.objective,
      context: options.context,
      release: releaseMetadata,
      protectionPosture: buildProtectionPostureSummary(activeSnapshot)
    });
    const result = await runOllamaExecution({
      snapshot: activeSnapshot,
      layer: executionLayer,
      objective: options.objective,
      context: options.context,
      governancePressure,
      recentDeniedCount: deniedCount,
      qContext
    });
    const boundExecution = bindExecutionPlacement({
      execution: result.execution,
      assignment: options.assignment,
      sessionId: options.sessionId,
      executionEndpoint,
      executionTopology: options.executionTopology ?? "sequential",
      repairGroupId: options.repairGroupId,
      repairAttempt: options.repairAttempt,
      retriedFromExecutionId: options.retriedFromExecutionId,
      repairCause: options.repairCause,
      parallelBatchId: options.parallelBatchId,
      parallelBatchSize: options.parallelBatchSize,
      parallelPosition: options.parallelPosition
    });
    const tracedExecution = await traceCognitiveExecution({
      execution: boundExecution,
      objective: options.objective,
      context: options.context,
      consentScope: options.consentScope,
      qContext
    });
    const settledLayer: IntelligenceLayer = {
      ...busyLayer,
      status: tracedExecution.status === "completed" ? "ready" : "degraded"
    };

    engine.registerIntelligenceLayer(settledLayer);
    let snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.commitCognitiveExecution(tracedExecution))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    await recordFederatedExecutionOutcome({
      execution: tracedExecution
    });
    await recordAgentIntelligenceAssessmentAfterExecution(tracedExecution, options.consentScope);
    snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.getSnapshot(), options.consentScope)
    );

    return {
      layer: settledLayer,
      execution: tracedExecution,
      response: result.response,
      snapshot,
      failureClass: result.failureClass,
      thinkingDetected: result.thinkingDetected
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unable to run the cognitive layer.";
    const governancePressure = deriveGovernancePressure(
      options.consentScope,
      governance.getStatus(),
      governance.listDecisions()
    );
    const deniedCount = recentGovernanceDeniedCount();
    const failedExecution = {
      id: `cog-${completedAt.replace(/[:.]/g, "-")}-${hashValue(busyLayer.id).slice(0, 8)}`,
      sessionId: options.sessionId,
      layerId: busyLayer.id,
      model: busyLayer.model,
      objective: options.objective,
      status: "failed" as const,
      latencyMs: Math.max(1, Date.parse(completedAt) - Date.parse(startedAt)),
      startedAt,
      completedAt,
      promptDigest: hashValue(
        `${busyLayer.id}:${options.objective}:${options.context ?? ""}:${governancePressure}:${deniedCount}`
      ).slice(0, 24),
      responsePreview: `Cognitive execution failed: ${message}`.slice(0, 280),
      guardVerdict: undefined,
      governancePressure,
      recentDeniedCount: deniedCount,
      assignedWorkerId: options.assignment?.workerId,
      assignedWorkerLabel: options.assignment?.workerLabel ?? undefined,
      assignedWorkerHostLabel: options.assignment?.hostLabel ?? undefined,
      assignedWorkerProfile: options.assignment?.executionProfile,
      assignmentReason: options.assignment?.reason,
      assignmentScore: options.assignment?.score,
      executionEndpoint,
      executionTopology: options.executionTopology ?? "sequential",
      repairGroupId: options.repairGroupId,
      repairAttempt: options.repairAttempt,
      retriedFromExecutionId: options.retriedFromExecutionId,
      repairCause: options.repairCause,
      parallelBatchId: options.parallelBatchId,
      parallelBatchSize: options.parallelBatchSize,
      parallelPosition: options.parallelPosition
    };
    const tracedExecution = await traceCognitiveExecution({
      execution: failedExecution,
      objective: options.objective,
      context: options.context,
      consentScope: options.consentScope,
      qContext
    });
    const settledLayer: IntelligenceLayer = {
      ...busyLayer,
      status: "degraded"
    };

    engine.registerIntelligenceLayer(settledLayer);
    let snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.commitCognitiveExecution(tracedExecution))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    await recordFederatedExecutionOutcome({
      execution: tracedExecution
    });
    await recordAgentIntelligenceAssessmentAfterExecution(tracedExecution, options.consentScope);
    snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.getSnapshot(), options.consentScope)
    );

    return {
      layer: settledLayer,
      execution: tracedExecution,
      response: tracedExecution.responsePreview,
      snapshot,
      failureClass: "http_error",
      thinkingDetected: false
    };
  } finally {
    await releaseExecutionWorker(options.assignment);
  }
}

async function executeCognitivePassWithRetry(options: {
  layer: IntelligenceLayer;
  objective?: string;
  context?: string;
  consentScope?: string;
  sessionId?: string;
  assignment?: ExecutionWorkerAssignment;
  executionTopology?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["executionTopology"];
  reservation: FederatedRetryReservation;
}): Promise<CognitivePassResult> {
  const firstResult = await executeCognitivePass({
    layer: options.layer,
    objective: options.objective,
    context: options.context,
    consentScope: options.consentScope,
    sessionId: options.sessionId,
    assignment: options.assignment,
    executionTopology: options.executionTopology
  });
  return attemptAlternateFederatedExecution({
    layer: options.layer,
    firstResult,
    consentScope: options.consentScope,
    sessionId: options.sessionId,
    reservation: options.reservation,
    runRetry: async (retry) =>
      executeCognitivePass({
        layer: options.layer,
        objective: options.objective,
        context: options.context,
        consentScope: options.consentScope,
        sessionId: options.sessionId,
        assignment: retry.assignment,
        executionTopology: options.executionTopology,
        repairGroupId: retry.repairGroupId,
        repairAttempt: retry.repairAttempt,
        retriedFromExecutionId: retry.retriedFromExecutionId,
        repairCause: retry.repairCause
      })
  });
}

async function executeScheduledCognitivePassWithRetry(options: {
  layer: IntelligenceLayer;
  objective: string;
  context?: string;
  consentScope?: string;
  sessionId?: string;
  assignment?: ExecutionWorkerAssignment;
  executionTopology?: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number]["executionTopology"];
  parallelBatchId?: string;
  parallelBatchSize?: number;
  parallelPosition?: number;
  reservation: FederatedRetryReservation;
}): Promise<CognitivePassResult> {
  const firstResult = await executeScheduledCognitivePass({
    layer: options.layer,
    objective: options.objective,
    context: options.context,
    consentScope: options.consentScope,
    sessionId: options.sessionId,
    assignment: options.assignment,
    executionTopology: options.executionTopology,
    parallelBatchId: options.parallelBatchId,
    parallelBatchSize: options.parallelBatchSize,
    parallelPosition: options.parallelPosition
  });
  return attemptAlternateFederatedExecution({
    layer: options.layer,
    firstResult,
    consentScope: options.consentScope,
    sessionId: options.sessionId,
    reservation: options.reservation,
    runRetry: async (retry) =>
      executeScheduledCognitivePass({
        layer: options.layer,
        objective: options.objective,
        context: options.context,
        consentScope: options.consentScope,
        sessionId: options.sessionId,
        assignment: retry.assignment,
        executionTopology: options.executionTopology,
        parallelBatchId: options.parallelBatchId,
        parallelBatchSize: options.parallelBatchSize,
        parallelPosition: options.parallelPosition,
        repairGroupId: retry.repairGroupId,
        repairAttempt: retry.repairAttempt,
        retriedFromExecutionId: retry.retriedFromExecutionId,
        repairCause: retry.repairCause
      })
  });
}

function buildSwarmSharedContext(options: {
  schedule: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number];
  objective: string;
  layers: IntelligenceLayer[];
}): string {
  const roleChain = options.layers.map((layer) => layer.role).join(">");
  const primaryRole =
    options.layers.find((layer) => layer.id === options.schedule.primaryLayerId)?.role ?? "none";
  return [
    `SWARM OBJECTIVE: ${options.objective}`,
    `SWARM PLAN: mode=${options.schedule.mode} / admission=${options.schedule.admissionState ?? "admit"} / topology=${options.schedule.executionTopology} / width=${options.schedule.parallelWidth} / quorum=${options.schedule.verificationQuorum ?? 1}`,
    `SWARM PRESSURE: backlog=${options.schedule.backlogPressure ?? "clear"}(${options.schedule.backlogScore ?? 0}) / retry=${options.schedule.boundedRetryBudget ?? 0} / hw=${options.schedule.healthWeightedWidth ?? options.schedule.parallelWidth} / floor=${options.schedule.workerReliabilityFloor ?? 0}`,
    `SWARM ENVELOPE: ${options.schedule.affinityMode ?? "local-pinned"} / ${options.schedule.deadlineClass ?? "elastic"}:${options.schedule.deadlineBudgetMs ?? 0}ms / ${options.schedule.backpressureAction ?? "steady"} / ${typeof options.schedule.intentAlignmentScore === "number" ? options.schedule.intentAlignmentScore.toFixed(2) : "n/a"}`,
    `SWARM FORMATION: ${roleChain || "none"} / primary=${primaryRole} / ${options.schedule.parallelFormationSummary ?? "none"}`,
    "COORDINATION RULE: you are one member of a simultaneous cognition batch operating over the same substrate state.",
    "Do not assume peer outputs are visible while you are running. Produce a role-specific route, reason, and commit that downstream integration or guard review can reconcile."
  ].join("\n");
}

async function executeCognitiveSchedule(options: {
  schedule: ReturnType<typeof engine.getSnapshot>["executionSchedules"][number];
  objective?: string;
  consentScope?: string;
  sessionId?: string;
  arbitrationId?: string;
  requestedExecutionDecision?: RequestedExecutionDecision;
  roundtablePlan?: RoundtablePlan;
}) {
  const executions: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"] = [];
  const layers: IntelligenceLayer[] = [];
  const turns: ReturnType<typeof engine.getSnapshot>["conversations"][number]["turns"] = [];
  const responses: string[] = [];
  let conversation: ReturnType<typeof buildConversationRecord> | undefined;
  const baseObjective = options.objective?.trim() || options.schedule.objective;
  const roundtablePlan =
    options.roundtablePlan ??
    buildRoundtableActionPlan({
      objective: baseObjective,
      sessionId: options.sessionId,
      consentScope: options.consentScope,
      schedule: options.schedule
    });
  let latestSnapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const scheduleLayerOrder = new Map(
    options.schedule.layerIds.map((layerId, index) => [layerId, index] as const)
  );
  const governorGrant =
    options.schedule.layerRoles.length > 0
      ? await workGovernor.acquire({
          lane: "cognitive",
          priority: scheduleGovernorPriority(options.schedule),
          weight: Math.max(
            1,
            Math.min(4, (options.schedule.healthWeightedWidth ?? options.schedule.parallelWidth) || 1)
          ),
          maxQueueMs:
            options.schedule.deadlineClass === "hard"
              ? Math.min(3_000, options.schedule.deadlineBudgetMs ?? 3_000)
              : options.schedule.deadlineClass === "bounded"
                ? Math.min(6_000, options.schedule.deadlineBudgetMs ?? 6_000)
                : options.schedule.backlogPressure === "critical"
                  ? 4_000
                  : options.schedule.backlogPressure === "elevated"
                    ? 8_000
                    : 12_000,
          label: options.schedule.mode
        })
      : undefined;

  try {
    if (options.schedule.shouldRunCognition && options.schedule.layerRoles.length > 0) {
      await ensurePreferredIntelligenceLayers(options.schedule.layerRoles);
      latestSnapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
    }

    const scheduleLayerIds = new Set(options.schedule.layerIds);
    const scheduledLayers = latestSnapshot.intelligenceLayers
      .filter((layer) => layer.status !== "offline")
      .filter((layer) => scheduleLayerIds.has(layer.id))
      .sort(
        (left, right) =>
          (scheduleLayerOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (scheduleLayerOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      )
      .slice(0, options.schedule.layerIds.length > 1 ? options.schedule.layerIds.length : 1);
    const parallelEligible = isParallelScheduleMode(options.schedule.mode);
    const guardLayer = scheduledLayers.find((layer) => layer.role === "guard");
    const nonGuardLayers = scheduledLayers.filter((layer) => layer.role !== "guard");
    const admittedParallelWidth = effectiveScheduleParallelWidth(options.schedule, nonGuardLayers.length);
    const admittedNonGuardLayers = nonGuardLayers.slice(0, admittedParallelWidth);
    const parallelBatchId =
      parallelEligible && admittedNonGuardLayers.length > 1
        ? `swarm-${hashValue(`${options.schedule.id}:${options.sessionId ?? "system"}:${options.schedule.selectedAt}`)}`
        : undefined;
    const sharedSwarmContext =
      parallelBatchId && admittedNonGuardLayers.length > 1
        ? buildSwarmSharedContext({
            schedule: options.schedule,
            objective: baseObjective,
            layers: admittedNonGuardLayers
          })
        : undefined;
    const coordinationContext = [sharedSwarmContext, roundtablePlan.sharedContext]
      .filter(Boolean)
      .join("\n\n");

    if (parallelEligible && admittedNonGuardLayers.length > 1) {
      const reservedAssignments = await reserveExecutionWorkerBatch({
        layers: admittedNonGuardLayers,
        requestedExecutionDecision: options.requestedExecutionDecision,
        targetPrefix: options.schedule.mode,
        backlogPressure: options.schedule.backlogPressure,
        reliabilityFloor: options.schedule.workerReliabilityFloor,
        formation: {
          parallelFormationMode: options.schedule.parallelFormationMode,
          verificationQuorum: options.schedule.verificationQuorum,
          localReplicaCount: options.schedule.localReplicaCount,
          remoteReplicaCount: options.schedule.remoteReplicaCount,
          boundedRetryBudget: options.schedule.boundedRetryBudget,
          capabilitySpreadCount: options.schedule.capabilitySpreadCount,
          affinityMode: options.schedule.affinityMode,
          deadlineClass: options.schedule.deadlineClass,
          deadlineBudgetMs: options.schedule.deadlineBudgetMs,
          backpressureAction: options.schedule.backpressureAction,
          intentAlignmentScore: options.schedule.intentAlignmentScore
        }
      });
      const parallelResults = await Promise.all(
        admittedNonGuardLayers.map(async (layer, index) => {
          const prompt = buildConversationObjective({
            baseObjective,
            role: layer.role,
            priorTurns: [],
            sharedContext: coordinationContext
          });
          return executeScheduledCognitivePassWithRetry({
            layer,
            objective: prompt.objective,
            context: prompt.context,
            consentScope: options.consentScope,
            sessionId: options.sessionId,
            assignment: reservedAssignments[index],
            executionTopology: options.schedule.executionTopology,
            parallelBatchId,
            parallelBatchSize: admittedNonGuardLayers.length,
            parallelPosition: index + 1,
            reservation: {
              requestedExecutionDecision: options.requestedExecutionDecision,
              target: `${options.schedule.mode}:${layer.role}`,
              maxObservedLatencyMs:
                options.schedule.deadlineClass === "hard"
                  ? 90
                  : options.schedule.backlogPressure === "critical"
                  ? 120
                  : options.schedule.deadlineClass === "bounded" ||
                      options.schedule.backlogPressure === "elevated"
                    ? 220
                    : undefined,
              requiredHealthyWorkerCount: Math.max(1, admittedNonGuardLayers.length - index),
              backlogPressure: options.schedule.backlogPressure,
              reliabilityFloor: options.schedule.workerReliabilityFloor,
              preferredDeviceAffinityTags: [
                layer.role,
                ...(options.schedule.mode.includes("swarm") ? ["swarm"] : []),
                ...(options.schedule.affinityMode === "quorum-local"
                  ? ["local-affinity", "quorum-local"]
                  : options.schedule.affinityMode === "local-spread"
                    ? ["local-affinity", "local-spread"]
                    : options.schedule.affinityMode === "hybrid-spill"
                      ? ["spill-affinity"]
                      : ["local-pinned"]),
                ...(options.schedule.deadlineClass === "hard"
                  ? ["hard-deadline"]
                  : options.schedule.deadlineClass === "bounded"
                    ? ["bounded-deadline"]
                    : ["elastic-deadline"])
              ]
            }
          });
        })
      );

      const orderedParallelResults = [...parallelResults].sort((left, right) => {
        return (
          (scheduleLayerOrder.get(left.layer.id) ?? Number.MAX_SAFE_INTEGER) -
          (scheduleLayerOrder.get(right.layer.id) ?? Number.MAX_SAFE_INTEGER)
        );
      });

      for (const result of orderedParallelResults) {
        layers.push(result.layer);
        executions.push(result.execution);
        responses.push(result.response);
        turns.push(
          buildAgentTurn({
            execution: result.execution,
            layer: result.layer,
            workspaceScope:
              roundtablePlan.actions.find((action) => action.role === result.layer.role)?.workspaceScope
          })
        );
        latestSnapshot = result.snapshot;
      }
    } else {
      for (const layer of admittedNonGuardLayers) {
        const assignment = await reserveExecutionWorker({
          layer,
          requestedExecutionDecision: options.requestedExecutionDecision,
          target: `${options.schedule.mode}:${layer.role}`,
          requiredHealthyWorkerCount: 1,
          backlogPressure: options.schedule.backlogPressure,
          reliabilityFloor: options.schedule.workerReliabilityFloor,
          maxObservedLatencyMs:
            options.schedule.backlogPressure === "critical"
              ? 120
              : options.schedule.backlogPressure === "elevated"
                ? 220
                : undefined
        });
        const prompt = buildConversationObjective({
          baseObjective,
          role: layer.role,
          priorTurns: turns,
          sharedContext: coordinationContext
        });
        const result = await executeScheduledCognitivePassWithRetry({
          layer,
          objective: prompt.objective,
          context: prompt.context,
          consentScope: options.consentScope,
          sessionId: options.sessionId,
          assignment,
          executionTopology: options.schedule.executionTopology,
          reservation: {
            requestedExecutionDecision: options.requestedExecutionDecision,
            target: `${options.schedule.mode}:${layer.role}`,
            maxObservedLatencyMs:
              options.schedule.backlogPressure === "critical"
                ? 120
                : options.schedule.backlogPressure === "elevated"
                  ? 220
                  : undefined,
            requiredHealthyWorkerCount: 1,
            backlogPressure: options.schedule.backlogPressure,
            reliabilityFloor: options.schedule.workerReliabilityFloor,
            preferredDeviceAffinityTags: [
              layer.role,
              ...(options.schedule.mode.includes("swarm") ? ["swarm"] : [])
            ]
          }
        });

        layers.push(result.layer);
        executions.push(result.execution);
        responses.push(result.response);
        turns.push(
          buildAgentTurn({
            execution: result.execution,
            layer: result.layer,
            workspaceScope:
              roundtablePlan.actions.find((action) => action.role === result.layer.role)?.workspaceScope
          })
        );
        latestSnapshot = result.snapshot;
      }
    }

    if (guardLayer) {
      const guardAssignment = await reserveExecutionWorker({
        layer: guardLayer,
        requestedExecutionDecision: options.requestedExecutionDecision,
        target: `${options.schedule.mode}:guard`,
        requiredHealthyWorkerCount: 1,
        backlogPressure: options.schedule.backlogPressure,
        reliabilityFloor: options.schedule.workerReliabilityFloor,
        maxObservedLatencyMs:
          options.schedule.backlogPressure === "critical"
            ? 120
            : options.schedule.backlogPressure === "elevated"
              ? 220
              : undefined
      });
      const prompt = buildConversationObjective({
        baseObjective,
        role: guardLayer.role,
        priorTurns: turns,
        sharedContext: coordinationContext
      });
      const guardResult = await executeScheduledCognitivePassWithRetry({
        layer: guardLayer,
        objective: prompt.objective,
        context: prompt.context,
        consentScope: options.consentScope,
        sessionId: options.sessionId,
        assignment: guardAssignment,
        executionTopology: options.schedule.executionTopology,
        reservation: {
          requestedExecutionDecision: options.requestedExecutionDecision,
          target: `${options.schedule.mode}:guard`,
          maxObservedLatencyMs:
            options.schedule.backlogPressure === "critical"
              ? 120
              : options.schedule.backlogPressure === "elevated"
                ? 220
                : undefined,
          requiredHealthyWorkerCount: 1,
          backlogPressure: options.schedule.backlogPressure,
          reliabilityFloor: options.schedule.workerReliabilityFloor,
          preferredDeviceAffinityTags: [guardLayer.role]
        }
      });

      layers.push(guardResult.layer);
      executions.push(guardResult.execution);
      responses.push(guardResult.response);
      turns.push(
        buildAgentTurn({
          execution: guardResult.execution,
          layer: guardResult.layer,
          workspaceScope:
            roundtablePlan.actions.find((action) => action.role === guardResult.layer.role)?.workspaceScope
        })
      );
      latestSnapshot = guardResult.snapshot;
    }

    const executedRoundtableActions =
      turns.length > 0
        ? await materializeRoundtableActionExecutionArtifacts({
            objective: baseObjective,
            actions: roundtablePlan.actions,
            turns
          })
        : roundtablePlan.actions;
    const roundtableSummary = appendRoundtableExecutionSummary(
      roundtablePlan.summary,
      executedRoundtableActions
    );

    conversation =
      turns.length > 0
        ? buildConversationRecord({
            sessionId: options.sessionId,
            sessionScope: roundtablePlan.sessionScope,
            arbitrationId: options.arbitrationId,
            schedule: options.schedule,
            turns,
            roundtableSummary,
            roundtableActions: executedRoundtableActions
          })
        : undefined;

    if (conversation) {
      conversation = await traceConversationRecord({
        conversation,
        consentScope: options.consentScope,
        schedule: options.schedule
      });
      latestSnapshot = phaseSnapshotSchema.parse(
        projectPhaseSnapshot(engine.recordConversation(conversation), options.consentScope)
      );
      await persistence.persist(engine.getDurableState());
      emitSnapshot();
      await recordAgentIntelligenceAssessmentAfterConversation(
        conversation,
        options.consentScope
      );
      latestSnapshot = phaseSnapshotSchema.parse(
        projectPhaseSnapshot(engine.getSnapshot(), options.consentScope)
      );
    }
  } finally {
    governorGrant?.release();
  }

  return {
    layers,
    executions,
    conversation,
    primaryLayer: layers.at(-1),
    primaryExecution: executions.at(-1),
    combinedResponse: responses.join("\n"),
    snapshot: latestSnapshot
  };
}

async function dispatchWithRoute(options: {
  body: DispatchBody;
  consentScope?: string;
  execution?: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"][number];
  frame?: ReturnType<typeof engine.getSnapshot>["neuroFrames"][number];
}) {
  const status: ActuationOutput["status"] = options.body.suppressed ? "suppressed" : "dispatched";
  const currentSnapshot = engine.getSnapshot();
  const routeProtectionPosture = buildProtectionPostureSummary(currentSnapshot);
  const qRouteContext =
    options.execution && truthfulModelLabel(options.execution.model) === getQModelName()
      ? await resolveQOrchestrationContext({
          snapshot: currentSnapshot,
          objective: options.execution.objective,
          context: options.execution.reasonSummary ?? options.execution.responsePreview,
          release: releaseMetadata,
          protectionPosture: routeProtectionPosture
        })
      : undefined;
  const federatedPressureState = await computeFederatedExecutionPressure({
    target:
      options.execution?.executionTopology === "parallel" ||
      options.execution?.executionTopology === "parallel-then-guard"
        ? "planner-swarm"
        : "single-layer",
    preferredDeviceAffinityTags:
      options.execution?.assignedWorkerProfile === "remote" ? ["swarm"] : undefined
  });
  const routePlan = planAdaptiveRoute({
    snapshot: currentSnapshot,
    frame: options.frame,
    execution: options.execution,
    cognitiveRouteSuggestion: options.execution?.routeSuggestion,
    federationPressure: federatedPressureState.pressure,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: governance.getStatus(),
    governanceDecisions: governance.listDecisions(),
    protectionPressure: routeProtectionPosture.pressure,
    consentScope: options.consentScope,
    requestedAdapterId: options.body.adapterId?.trim() || undefined,
    requestedChannel: options.body.channel,
    requestedTargetNodeId: options.body.targetNodeId?.trim() || undefined,
    requestedIntensity:
      typeof options.body.intensity === "number" ? Number(options.body.intensity) : undefined,
    suppressed: options.body.suppressed,
    qContext: qRouteContext
  });
  const command =
    options.body.command?.trim() ||
    (options.execution
      ? `execution:${options.execution.id}:guided-feedback`
      : options.frame
        ? `frame:${options.frame.id}:stabilize`
        : "operator:manual-feedback");
  const intensity = clampActuationIntensity(
    options.body.intensity,
    routePlan.recommendedIntensity
  );
  const targetNodeId = options.body.targetNodeId?.trim() || routePlan.targetNodeId;
  const output: ActuationOutput = {
    id: createActuationOutputId(),
    sessionId: options.body.sessionId?.trim() || options.frame?.sessionId,
    source:
      options.consentScope === "system:benchmark"
        ? "benchmark"
        : options.execution
          ? "cognitive"
          : options.frame
            ? "neuro"
            : "operator",
    sourceExecutionId: options.execution?.id,
    sourceFrameId: options.frame?.id,
    targetNodeId,
    channel: routePlan.channel,
    command,
    intensity,
    status,
    summary: `Dispatch ${routePlan.channel} ${status} to ${targetNodeId} at ${(intensity * 100).toFixed(1)}% intensity.`,
    generatedAt: new Date().toISOString(),
    dispatchedAt: status === "dispatched" ? new Date().toISOString() : undefined
  };

  if (status === "suppressed") {
    const snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.dispatchActuationOutput(output))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    return {
      routePlan,
      output,
      snapshot
    };
  }

  const dispatched = await actuationManager.dispatch(output, {
    adapterId: routePlan.recommendedAdapterId
  });
  engine.dispatchActuationOutput(dispatched.output);
  const routeDecision = buildRoutingDecision({
    output: dispatched.output,
    delivery: dispatched.delivery,
    plan: routePlan,
    frame: options.frame,
    execution: options.execution
  });
  const snapshot = phaseSnapshotSchema.parse(
    projectPhaseSnapshot(engine.recordRoutingDecision(routeDecision))
  );
  await persistence.persist(engine.getDurableState());
  emitSnapshot();

  return {
    routePlan,
    routeDecision,
    adapter: dispatched.adapter,
    delivery: dispatched.delivery,
    output: dispatched.output,
    snapshot
  };
}

await appendStartupTrace("startup:local-workers:start");
await ensureLocalExecutionWorkers();
await appendStartupTrace("startup:local-workers:complete");
if (process.env.IMMACULATE_SKIP_STARTUP_Q_DISCOVERY !== "true") {
  await appendStartupTrace("startup:q-discovery:start");
  await ensurePreferredIntelligenceLayer();
  await appendStartupTrace("startup:q-discovery:complete");
} else {
  await appendStartupTrace("startup:q-discovery:skipped");
}

const recoveredLiveSources = phaseSnapshotSchema
  .parse(engine.getSnapshot())
  .neuroReplays.filter(
    (replay) => replay.source === "live-socket" && replay.status === "running"
  );
if (recoveredLiveSources.length > 0) {
  const settledAt = new Date().toISOString();
  for (const replay of recoveredLiveSources) {
    engine.upsertNeuroReplay({
      ...replay,
      status: "stopped",
      updatedAt: settledAt,
      completedAt: settledAt
    });
  }
}
await appendStartupTrace("startup:persistence-persist:start");
await persistence.persist(engine.getDurableState());
await appendStartupTrace("startup:persistence-persist:complete");

app.get("/api/health", async () => ({
  status: "ok",
  service: "immaculate-harness",
  release: {
    buildId: releaseMetadata.buildId,
    gitShortSha: releaseMetadata.gitShortSha
  },
  timestamp: new Date().toISOString(),
  clients: clients.size,
  recovered: persistence.getStatus().recovered,
  recoveryMode: persistence.getStatus().recoveryMode,
  persistedEventCount: persistence.getStatus().persistedEventCount,
  integrityStatus: persistence.getStatus().integrityStatus,
  integrityFindingCount: persistence.getStatus().integrityFindingCount,
  governanceMode: governance.getStatus().mode,
  governanceDeniedCount: governance.getStatus().deniedCount,
  poi: poiMonitorStatus(),
  workGovernor: workGovernor.snapshot()
}));

app.get("/api/work-governor", async () => ({
  workGovernor: workGovernor.snapshot()
}));

app.get("/api/snapshot", async () => ({
  snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot())),
  redacted: true
}));

app.get("/api/history", async () => ({
  history: engine.getHistory().map((point) => snapshotHistoryPointSchema.parse(point))
}));

app.get("/api/events", {
  preHandler: requireGovernedActionPreHandler("event-read", "/api/events")
}, async (request, reply) => {
  return {
    events: engine
      .getEvents()
      .map((event) =>
        eventEnvelopeSchema.parse(
          projectEventEnvelope(
            event,
            getGovernanceBinding("event-read", "/api/events", request).consentScope
          )
        )
      ),
    visibility: deriveVisibilityScope(
      getGovernanceBinding("event-read", "/api/events", request).consentScope
    )
  };
});

app.get("/api/replay", {
  preHandler: requireGovernedActionPreHandler("event-read", "/api/replay")
}, async (request) => {
  const query = request.query as {
    after?: string;
    limit?: string;
  };
  const limit = query.limit ? Number(query.limit) : undefined;
  return {
    events: (await persistence.replay({
      afterEventId: query.after,
      limit: Number.isFinite(limit) ? limit : undefined
    })).map((event) =>
      eventEnvelopeSchema.parse(
        projectEventEnvelope(
          event,
          getGovernanceBinding("event-read", "/api/replay", request).consentScope
        )
      )
    ),
    visibility: deriveVisibilityScope(
      getGovernanceBinding("event-read", "/api/replay", request).consentScope
    )
  };
});

app.get("/api/persistence", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  persistence: persistence.getStatus()
}));

app.get("/api/integrity", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  integrity: inspectDurableState(engine.getDurableState())
}));

app.get("/api/checkpoints", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  checkpoints: persistence.listCheckpoints()
}));

app.get("/api/governance/status", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  governance: governance.getStatus()
}));

app.get("/api/governance/policies", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  policies: governance.listPolicies()
}));

app.get("/api/governance/tool-actions", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  actions: governance.listGovernedActions()
}));

app.get("/api/governance/real-world-engagement", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  profiles: governance
    .listGovernedActions()
    .map((action) => classifyRealWorldEngagement(action.action))
}));

app.post("/api/governance/tool-actions/admission", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request) => {
  const body =
    (request.body as {
      action?: string;
      consentScope?: string;
      approvalRef?: string;
      confidence?: number;
      recentFailureCount?: number;
    } | undefined) ?? {};
  return {
    admission: evaluateToolRiskAdmission({
      action: body.action?.trim() ?? "",
      consentScope: body.consentScope,
      approvalRef: body.approvalRef,
      confidence: body.confidence,
      recentFailureCount: body.recentFailureCount
    })
  };
});

app.get("/api/goals/schema", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  goalState: governedGoalStateContract
}));

app.post("/api/goals/admission", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request) => buildGovernedGoalAdmission(request.body));

app.get("/api/cognitive-runtime/role-plan/schema", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  rolePlan: cognitiveRolePlanContract
}));

app.post("/api/cognitive-runtime/role-plan/admission", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request) => buildCognitiveRolePlanAdmission(request.body ?? {}));

app.get("/api/cognitive-runtime/trace-graph/schema", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  traceGraph: causalTraceGraphContract
}));

app.post("/api/cognitive-runtime/trace-graph/admission", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request) => buildCausalTraceGraphAdmission(request.body ?? {}));

app.post("/api/cognitive-runtime/trace-graph/records", {
  preHandler: app.rateLimit({
    max: ORCHESTRATION_MEDIATE_RATE_LIMIT_MAX,
    timeWindow: ORCHESTRATION_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: ORCHESTRATION_MEDIATE_RATE_LIMIT_MAX,
      timeWindow: ORCHESTRATION_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const result = buildCausalTraceGraphAdmission(request.body ?? {});
  if (!result.graph) {
    void reply.code(400);
    return result;
  }
  return {
    ...result,
    record: await appendCausalTraceGraphRecord({
      rootDir: persistence.getStatus().rootDir,
      graph: result.graph
    })
  };
});

app.get("/api/cognitive-runtime/trace-graph/records", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request) => {
  const query = (request.query as { goalId?: string; limit?: string } | undefined) ?? {};
  return {
    records: await readCausalTraceGraphRecords({
      rootDir: persistence.getStatus().rootDir,
      goalId: query.goalId?.trim() || undefined,
      limit:
        typeof query.limit === "string" && query.limit.trim()
          ? Number(query.limit)
          : undefined
    })
  };
});

app.get("/api/cognitive-runtime/trace-graph/integrity", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  traceGraph: await inspectCausalTraceGraphLedger(persistence.getStatus().rootDir)
}));

app.get("/api/governance/decisions", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  decisions: governance.listDecisions()
}));

app.get("/api/protection/posture", {
  preHandler: requireGovernedActionPreHandler(
    "protection-signal-read",
    "/api/protection/posture"
  ),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  posture: buildProtectionPostureSummary(),
  policy: {
    defensiveOnly: true,
    allowedScopes: ["founder:", "operator:", "system:audit", "system:intelligence"],
    offensiveOrCovertActions: false
  }
}));

app.get("/api/benchmarks/latest", {
  preHandler: app.rateLimit({
    max: BENCHMARK_READ_RATE_LIMIT_MAX,
    timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: BENCHMARK_READ_RATE_LIMIT_MAX,
      timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  benchmark: await loadPublishedBenchmarkReport()
}));

app.get("/api/benchmarks/history", {
  preHandler: app.rateLimit({
    max: BENCHMARK_READ_RATE_LIMIT_MAX,
    timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: BENCHMARK_READ_RATE_LIMIT_MAX,
      timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  history: await loadPublishedBenchmarkIndex()
}));

app.get("/api/benchmarks/trend", {
  preHandler: app.rateLimit({
    max: BENCHMARK_READ_RATE_LIMIT_MAX,
    timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: BENCHMARK_READ_RATE_LIMIT_MAX,
      timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const query = (request.query as { packId?: BenchmarkPackId; window?: string } | undefined) ?? {};
  const window = query.window ? Number(query.window) : undefined;
  const resolvedWindow =
    Number.isFinite(window) && window
      ? Math.max(3, Math.min(64, Math.round(window)))
      : 20;

  if (query.packId) {
    try {
      return {
        trend: await loadBenchmarkTrend(query.packId, resolvedWindow)
      };
    } catch (error) {
      reply.code(404);
      return {
        error: "benchmark_trend_not_found",
        message: error instanceof Error ? error.message : "Unable to load benchmark trend.",
        packId: query.packId
      };
    }
  }

  return {
    trends: await loadAllBenchmarkTrends(resolvedWindow)
  };
});

app.get("/api/benchmarks/jobs/:jobId", {
  preHandler: app.rateLimit({
    max: BENCHMARK_READ_RATE_LIMIT_MAX,
    timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: BENCHMARK_READ_RATE_LIMIT_MAX,
      timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const params = request.params as { jobId?: string };
  if (!params.jobId) {
    reply.code(400);
    return {
      error: "missing_benchmark_job_id"
    };
  }

  const job = benchmarkJobs.get(params.jobId);
  if (!job) {
    reply.code(404);
    return {
      error: "benchmark_job_not_found",
      jobId: params.jobId
    };
  }

  return {
    job
  };
});

app.get("/api/benchmarks/packs", {
  preHandler: app.rateLimit({
    max: BENCHMARK_READ_RATE_LIMIT_MAX,
    timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: BENCHMARK_READ_RATE_LIMIT_MAX,
      timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  packs: listBenchmarkPacks()
}));

app.get("/api/wandb/status", {
  preHandler: app.rateLimit({
    max: BENCHMARK_READ_RATE_LIMIT_MAX,
    timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: BENCHMARK_READ_RATE_LIMIT_MAX,
      timeWindow: BENCHMARK_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  wandb: await inspectWandbStatus()
}));

app.get("/api/datasets", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  datasets: (await datasetRegistry.list()).map(redactDatasetSummary),
  redacted: true
}));

app.get("/api/datasets/:datasetId", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const params = request.params as { datasetId?: string };
  const datasetId = params.datasetId;

  if (!datasetId) {
    reply.code(400);
    return {
      error: "missing_dataset_id"
    };
  }

  if (
    !authorizeGovernedResourceRead(
      "dataset-read",
      "/api/datasets/:datasetId",
      request,
      reply,
      {
        exactConsentScopes: [`dataset:${datasetId}`],
        fallbackPrefixes: ["subject:"]
      }
    )
  ) {
    return;
  }

  const dataset = await datasetRegistry.get(datasetId);
  if (!dataset) {
    reply.code(404);
    return {
      error: "dataset_not_found",
      datasetId
    };
  }

  return {
    dataset: projectDatasetRecord(
      dataset,
      getGovernanceBinding("dataset-read", "/api/datasets/:datasetId", request).consentScope
    ),
    visibility: deriveVisibilityScope(
      getGovernanceBinding("dataset-read", "/api/datasets/:datasetId", request).consentScope
    )
  };
});

app.get("/api/neuro/sessions", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  sessions: (await neuroRegistry.list()).map(redactNeuroSessionSummary),
  redacted: true
}));

app.get("/api/neuro/sessions/:sessionId", {
  preHandler: app.rateLimit({
    max: HARNESS_READ_RATE_LIMIT_MAX,
    timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
  }),
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const params = request.params as { sessionId?: string };
  const sessionId = params.sessionId;

  if (!sessionId) {
    reply.code(400);
    return {
      error: "missing_session_id"
    };
  }

  if (
    !authorizeGovernedResourceRead(
      "neuro-session-read",
      "/api/neuro/sessions/:sessionId",
      request,
      reply,
      {
        exactConsentScopes: [`session:${sessionId}`],
        fallbackPrefixes: ["subject:"]
      }
    )
  ) {
    return;
  }

  const session = await neuroRegistry.get(sessionId);
  if (!session) {
    reply.code(404);
    return {
      error: "session_not_found",
      sessionId
    };
  }

  return {
    session: projectNeuroSessionRecord(
      session,
      getGovernanceBinding("neuro-session-read", "/api/neuro/sessions/:sessionId", request)
        .consentScope
    ),
    visibility: deriveVisibilityScope(
      getGovernanceBinding("neuro-session-read", "/api/neuro/sessions/:sessionId", request)
        .consentScope
    )
  };
});

app.get("/api/neuro/replays", async () => ({
  replays: neuroReplayManager.list()
}));

app.get("/api/neuro/live/sources", async () => ({
  sources: liveNeuroManager.list()
}));

app.get("/api/devices/lsl/streams", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-streaming",
    "/api/devices/lsl/streams"
  ),
  config: {
    rateLimit: {
      max: DEVICE_DISCOVERY_RATE_LIMIT_MAX,
      timeWindow: DEVICE_RATE_LIMIT_WINDOW
    }
  }
}, async () => {
  const discovery = await lslAdapterManager.discover();
  return {
    accepted: true,
    ...discovery,
    connections: lslAdapterManager.listConnections()
  };
});

app.get("/api/devices/lsl/connections", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-streaming",
    "/api/devices/lsl/connections"
  ),
  config: {
    rateLimit: {
      max: DEVICE_CONTROL_RATE_LIMIT_MAX,
      timeWindow: DEVICE_RATE_LIMIT_WINDOW
    }
  }
}, async () => {
  return {
    accepted: true,
    connections: lslAdapterManager.listConnections(),
    sources: liveNeuroManager.list()
  };
});

app.post("/api/devices/lsl/connect", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-streaming",
    "/api/devices/lsl/connect",
    { realWorldEngagement: "required" }
  ),
  config: {
    rateLimit: {
      max: DEVICE_CONTROL_RATE_LIMIT_MAX,
      timeWindow: DEVICE_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const body =
    ((request.body as {
      sourceId?: string;
      name?: string;
      uid?: string;
      sessionId?: string;
      label?: string;
      kind?: string;
      rateHz?: number;
      windowSize?: number;
      pullTimeoutMs?: number;
      maxRows?: number;
    } | undefined) ?? {});

  try {
    const connection = await lslAdapterManager.connect({
      sourceId: body.sourceId?.trim() || undefined,
      name: body.name?.trim() || undefined,
      uid: body.uid?.trim() || undefined,
      sessionId: body.sessionId?.trim() || undefined,
      label: body.label?.trim() || undefined,
      kind: body.kind?.trim() || undefined,
      rateHz: typeof body.rateHz === "number" ? body.rateHz : undefined,
      windowSize: typeof body.windowSize === "number" ? body.windowSize : undefined,
      pullTimeoutMs:
        typeof body.pullTimeoutMs === "number" ? body.pullTimeoutMs : undefined,
      maxRows: typeof body.maxRows === "number" ? body.maxRows : undefined
    });

    return {
      accepted: true,
      connectionId: connection.id,
      sourceId: connection.sourceId,
      state: connection.state(),
      connections: lslAdapterManager.listConnections(),
      snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()))
    };
  } catch (error) {
    reply.code(502);
    return {
      error: "lsl_connect_failed",
      message: error instanceof Error ? error.message : "Unable to connect to the LSL source.",
      connections: lslAdapterManager.listConnections()
    };
  }
});

app.post("/api/devices/lsl/:sourceId/stop", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-streaming",
    "/api/devices/lsl/:sourceId/stop",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const params = request.params as { sourceId?: string };
  if (!params.sourceId) {
    reply.code(400);
    return {
      error: "missing_source_id"
    };
  }

  const stopped = await lslAdapterManager.stop(params.sourceId);
  if (!stopped) {
    reply.code(404);
    return {
      error: "lsl_connection_not_found",
      sourceId: params.sourceId
    };
  }

  const source = await liveNeuroManager.stop(params.sourceId);
  return {
    accepted: true,
    sourceId: params.sourceId,
    connections: lslAdapterManager.listConnections(),
    source,
    snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()))
  };
});

app.get("/api/neuro/frames", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-feature-read",
    "/api/neuro/frames"
  )
}, async (request, reply) => {
  const binding = getGovernanceBinding("neuro-feature-read", "/api/neuro/frames", request);
  const query = (request.query as { sessionId?: string } | undefined) ?? {};
  const consentScope = binding.consentScope;
  const scopedSessionId =
    consentScope?.startsWith("session:") ? consentScope.slice("session:".length) : undefined;
  const requestedSessionId = query.sessionId?.trim();
  if (scopedSessionId && requestedSessionId && requestedSessionId !== scopedSessionId) {
    reply.code(403).send({
      error: "governance_denied",
      message: "Governance denied: resource_scope_mismatch"
    });
    return;
  }

  const frames = engine
    .getSnapshot()
    .neuroFrames.filter((frame) => {
      const sessionFilter = requestedSessionId ?? scopedSessionId;
      return sessionFilter ? frame.sessionId === sessionFilter : true;
    })
    .map((frame) => projectNeuroFrameWindow(frame, consentScope));

  return {
    frames,
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/intelligence", async () => {
  const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()));
  return {
    layers: snapshot.intelligenceLayers,
    executions: snapshot.cognitiveExecutions,
    assessments: snapshot.agentIntelligenceAssessments,
    poi: summarizeAgentIntelligenceAssessments(snapshot.agentIntelligenceAssessments),
    conversations: snapshot.conversations,
    schedules: snapshot.executionSchedules,
    recommendedLayerId: getPreferredLayer()?.id,
    visibility: "redacted"
  };
});

app.get("/api/intelligence/status", async () => {
  const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()));
  const { nodeState, workers } = await listIntelligenceWorkerViewsWithOutcomes();
  const healthyWorkerCount = workers.filter((worker) => worker.healthStatus === "healthy").length;
  const staleWorkerCount = workers.filter((worker) => worker.healthStatus === "stale").length;
  const faultedWorkerCount = workers.filter((worker) => worker.healthStatus === "faulted").length;
  const eligibleWorkerCount = workers.filter((worker) => worker.assignmentEligible).length;
  const persistenceStatus = persistence.getStatus();
  return buildPublicIntelligenceStatus({
    snapshot,
    workers,
    workerSummary: {
      workerCount: workers.length,
      healthyWorkerCount,
      staleWorkerCount,
      faultedWorkerCount,
      eligibleWorkerCount,
      blockedWorkerCount: workers.length - eligibleWorkerCount
    },
    nodeSummary: nodeState.summary,
    recommendedLayerId: getPreferredLayer()?.id,
    governance: governance.getStatus(),
    persistence: {
      recoveryMode: persistenceStatus.recoveryMode,
      persistedEventCount: persistenceStatus.persistedEventCount,
      integrityStatus: persistenceStatus.integrityStatus,
      integrityFindingCount: persistenceStatus.integrityFindingCount
    },
    poi: poiMonitorStatus(),
    workGovernor: workGovernor.snapshot()
  });
});

app.get(
  "/api/intelligence/assessments",
  {
    preHandler: requireGovernedActionPreHandler(
      "cognitive-trace-read",
      "/api/intelligence/assessments"
    ),
    config: {
      rateLimit: {
        max: POI_ASSESSMENT_READ_RATE_LIMIT_MAX,
        timeWindow: POI_ASSESSMENT_RATE_LIMIT_WINDOW
      }
    }
  },
  async (request, reply) => {
    const consentScope = getGovernanceBinding(
      "cognitive-trace-read",
      "/api/intelligence/assessments",
      request
    ).consentScope;
    const snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.getSnapshot(), consentScope)
    );
    return {
      assessments: snapshot.agentIntelligenceAssessments.map((assessment) =>
        agentIntelligenceAssessmentSchema.parse(assessment)
      ),
      poi: summarizeAgentIntelligenceAssessments(snapshot.agentIntelligenceAssessments),
      visibility: deriveVisibilityScope(consentScope)
    };
  }
);

app.post(
  "/api/intelligence/assessments/run",
  {
    preHandler: requireGovernedActionPreHandler(
      "cognitive-execution",
      "/api/intelligence/assessments/run"
    ),
    config: {
      rateLimit: {
        max: POI_ASSESSMENT_RUN_RATE_LIMIT_MAX,
        timeWindow: POI_ASSESSMENT_RATE_LIMIT_WINDOW
      }
    }
  },
  async (request, reply) => {
    const body =
      (request.body as {
        layerId?: string;
        trigger?: string;
      } | undefined) ?? {};
    const consentScope = getGovernanceBinding(
      "cognitive-execution",
      "/api/intelligence/assessments/run",
      request
    ).consentScope;
    const trigger = parseAssessmentTrigger(body.trigger);
    const layerId = body.layerId?.trim();
    if (
      layerId &&
      !engine.getSnapshot().intelligenceLayers.some((layer) => layer.id === layerId)
    ) {
      reply.code(404);
      return {
        error: "intelligence_layer_not_found",
        layerId
      };
    }

    try {
      const result = await recordAgentIntelligenceAssessment({
        trigger,
        targetLayerId: layerId || undefined,
        consentScope
      });
      return {
        accepted: true,
        assessment: agentIntelligenceAssessmentSchema.parse(result.assessment),
        poi: poiMonitorStatus(),
        snapshot: result.snapshot
      };
    } catch (error) {
      reply.code(503);
      return {
        error: "poi_assessment_failed",
        message: error instanceof Error ? error.message : "Unable to record PoI assessment."
      };
    }
  }
);

app.get("/api/q/info", {
  config: {
    rateLimit: {
      max: HARNESS_READ_RATE_LIMIT_MAX,
      timeWindow: HARNESS_READ_RATE_LIMIT_WINDOW
    }
  }
}, async () => {
  if (!Q_API_ENABLED) {
    return {
      enabled: false,
      modelName: getQModelName(),
      developer: getQDeveloperName(),
      lead: getQLeadName(),
      foundationModel: getQFoundationModelName(),
      harness: getImmaculateHarnessName(),
      identitySummary: getQIdentitySummary(),
      release: {
        buildId: releaseMetadata.buildId,
        gitShortSha: releaseMetadata.gitShortSha,
        qTrainingBundleId: releaseMetadata.q.trainingLock?.bundleId
      },
      authMode: "disabled"
    };
  }

  return {
    enabled: true,
    modelName: getQModelName(),
    model: truthfulModelLabel(getQModelName()),
    developer: getQDeveloperName(),
    lead: getQLeadName(),
    foundationModel: getQFoundationModelName(),
    harness: getImmaculateHarnessName(),
    identitySummary: getQIdentitySummary(),
    release: {
      buildId: releaseMetadata.buildId,
      gitShortSha: releaseMetadata.gitShortSha,
      qTrainingBundleId: releaseMetadata.q.trainingLock?.bundleId
    },
    authMode: "api-key",
    keyManagement: "cli-only",
    rateLimit: DEFAULT_Q_API_RATE_LIMIT,
    routes: ["/api/q/info", "/api/q/run"]
  };
});

app.post("/api/q/run", async (request, reply) => {
  if (!Q_API_ENABLED) {
    reply.code(404);
    return {
      error: "q_api_disabled"
    };
  }

  const qBinding = authorizeQPublicInference(request, reply);
  if (!qBinding) {
    return;
  }

  const body =
    (request.body as {
      prompt?: string;
      context?: string;
      role?: IntelligenceLayer["role"];
      sessionId?: string;
    } | undefined) ?? {};

  const prompt = body.prompt?.trim() ?? "";
  const context = body.context?.trim();
  const executionContext = [getQRuntimeContextInstruction(), context].filter(Boolean).join("\n\n");
  const role = body.role === "mid" || body.role === "reasoner" ? body.role : "reasoner";
  const sessionId = body.sessionId?.trim() || `q-api-${Date.now().toString(36)}`;
  const authContext = getQApiRequestContext(request);
  const consentScope = qBinding.consentScope;
  const auditPrincipal = {
    kind: authContext?.principalKind ?? "key",
    subject: authContext?.subject ?? "unknown",
    keyId: authContext?.key?.keyId,
    label: authContext?.key?.label
  };
  const appendAudit = async (record: Omit<QApiAuditRecord, "generatedAt" | "source" | "sessionId" | "modelName" | "role" | "objective" | "contextPreview" | "principal">) => {
    try {
      await appendQApiAuditRecord({
        generatedAt: new Date().toISOString(),
        source: "q-api",
        sessionId,
        modelName: getQModelName(),
        foundationModel: getQFoundationModelName(),
        releaseBuildId: releaseMetadata.buildId,
        releaseGitShortSha: releaseMetadata.gitShortSha,
        trainingBundleId: releaseMetadata.q.trainingLock?.bundleId,
        role,
        objective: prompt,
        contextPreview: truncateAuditText(context),
        principal: auditPrincipal,
        ...record
      });
    } catch (error) {
      request.log.warn(
        {
          error: error instanceof Error ? error.message : "unknown",
          auditPath: Q_API_AUDIT_PATH,
          sessionId
        },
        "Unable to append Q API audit record."
      );
    }
  };

  if (!prompt) {
    await appendAudit({
      status: "failed",
      parseSuccess: false,
      structuredFieldCount: 0,
      latencyMs: 0,
      failureClass: "missing_prompt",
      thinkingDetected: false,
      responsePreview: "The Q API request was rejected because no prompt was supplied."
    });
    reply.code(400);
    return {
      error: "missing_prompt"
    };
  }

  if (prompt.length > 4000 || (context?.length ?? 0) > 8000) {
    await appendAudit({
      status: "failed",
      parseSuccess: false,
      structuredFieldCount: 0,
      latencyMs: 0,
      failureClass: "prompt_too_large",
      thinkingDetected: false,
      responsePreview: "The Q API request exceeded the bounded prompt/context size."
    });
    reply.code(400);
    return {
      error: "prompt_too_large",
      message: "Q API prompt/context exceeded the bounded request size."
    };
  }

  try {
    const layer = await discoverPreferredOllamaLayer(role, LOCAL_OLLAMA_ENDPOINT, getQModelName());
    if (!layer) {
      await appendAudit({
        status: "failed",
        parseSuccess: false,
        structuredFieldCount: 0,
        latencyMs: 0,
        failureClass: "q_model_unavailable",
        thinkingDetected: false,
        responsePreview: "Q is not currently available from the configured Q runtime endpoint."
      });
      reply.code(503);
      return {
        error: "q_model_unavailable",
        message: "Q is not currently available from the configured Q runtime endpoint."
      };
    }

    const assignment = await reserveExecutionWorker({
      layer,
      requestedExecutionDecision: "allow_local",
      target: "q-public",
      fallbackLocalPoolSize: 1,
      preferredDeviceAffinityTags: ["ollama", "llm", "q"]
    });
    const result = await executeCognitivePassWithRetry({
      layer,
      objective: prompt,
      context: executionContext,
      consentScope,
      sessionId,
      assignment,
      executionTopology: "sequential",
      reservation: {
        requestedExecutionDecision: "allow_local",
        target: "q-public",
        fallbackLocalPoolSize: 1,
        preferredDeviceAffinityTags: ["ollama", "llm", "q"]
      }
    });

    if (result.execution.status === "failed") {
      const structuredFieldCount = [
        result.execution.routeSuggestion,
        result.execution.reasonSummary,
        result.execution.commitStatement
      ].filter(Boolean).length;
      await appendAudit({
        executionId: result.execution.id,
        decisionTraceId: result.execution.decisionTraceId,
        decisionTraceHash: result.execution.decisionTraceHash,
        policyDigest: result.execution.policyDigest,
        evidenceDigest: result.execution.evidenceDigest,
        model: getQModelName(),
        status: "failed",
        parseSuccess: structuredFieldCount === 3,
        structuredFieldCount,
        latencyMs: result.execution.latencyMs,
        failureClass: result.failureClass,
        thinkingDetected: Boolean(result.thinkingDetected),
        routeSuggestion: result.execution.routeSuggestion,
        reasonSummary: result.execution.reasonSummary,
        commitStatement: result.execution.commitStatement,
        responsePreview: result.execution.responsePreview,
        objectiveDigest: digestOptionalText(prompt),
        contextDigest: digestOptionalText(context),
        responseDigest: digestOptionalText(result.execution.responsePreview),
        qRoutingDirective: "primary-governed-local",
        governancePressure: result.execution.governancePressure,
        selectedWorkerId: result.execution.assignedWorkerId,
        selectedWorkerLabel: result.execution.assignedWorkerLabel,
        selectedWorkerProfile: result.execution.assignedWorkerProfile,
        selectedWorkerNodeId: result.execution.assignedWorkerNodeId
      });
      reply.code(503);
      return {
        error: "q_execution_failed",
        modelName: getQModelName(),
        model: getQModelName(),
        developer: getQDeveloperName(),
        lead: getQLeadName(),
        foundationModel: getQFoundationModelName(),
        harness: getImmaculateHarnessName(),
        executionId: result.execution.id,
        latencyMs: result.execution.latencyMs,
        failureClass: result.failureClass,
        thinkingDetected: result.thinkingDetected,
        message: result.execution.responsePreview
      };
    }

    const structuredFieldCount = [
      result.execution.routeSuggestion,
      result.execution.reasonSummary,
      result.execution.commitStatement
    ].filter(Boolean).length;
    await appendAudit({
      executionId: result.execution.id,
      decisionTraceId: result.execution.decisionTraceId,
      decisionTraceHash: result.execution.decisionTraceHash,
      policyDigest: result.execution.policyDigest,
      evidenceDigest: result.execution.evidenceDigest,
      model: getQModelName(),
      status: "completed",
      parseSuccess: structuredFieldCount === 3,
      structuredFieldCount,
      latencyMs: result.execution.latencyMs,
      failureClass: result.failureClass,
      thinkingDetected: Boolean(result.thinkingDetected),
      routeSuggestion: result.execution.routeSuggestion,
      reasonSummary: result.execution.reasonSummary,
      commitStatement: result.execution.commitStatement,
      responsePreview: result.execution.responsePreview,
      objectiveDigest: digestOptionalText(prompt),
      contextDigest: digestOptionalText(context),
      responseDigest: digestOptionalText(result.execution.responsePreview),
      qRoutingDirective: "primary-governed-local",
      governancePressure: result.execution.governancePressure,
      selectedWorkerId: result.execution.assignedWorkerId,
      selectedWorkerLabel: result.execution.assignedWorkerLabel,
      selectedWorkerProfile: result.execution.assignedWorkerProfile,
      selectedWorkerNodeId: result.execution.assignedWorkerNodeId
    });

    return {
      accepted: true,
      modelName: getQModelName(),
      model: getQModelName(),
      developer: getQDeveloperName(),
      lead: getQLeadName(),
      foundationModel: getQFoundationModelName(),
      harness: getImmaculateHarnessName(),
      role,
      executionId: result.execution.id,
      sessionId,
      latencyMs: result.execution.latencyMs,
      routeSuggestion: result.execution.routeSuggestion,
      reasonSummary: result.execution.reasonSummary,
      commitStatement: result.execution.commitStatement,
      response: result.response,
      principal:
        authContext?.principalKind === "key"
          ? {
              kind: "key",
              keyId: authContext.key?.keyId,
              label: authContext.key?.label
            }
          : {
              kind: authContext?.principalKind ?? "unknown"
            }
    };
  } catch (error) {
    await appendAudit({
      status: "failed",
      parseSuccess: false,
      structuredFieldCount: 0,
      latencyMs: 0,
      failureClass: "http_error",
      thinkingDetected: false,
      responsePreview: error instanceof Error ? truncateAuditText(error.message, 280) ?? "Unable to run Q." : "Unable to run Q."
    });
    reply.code(503);
    return {
      error: "q_execution_failed",
      message: error instanceof Error ? error.message : "Unable to run Q."
    };
  }
});

app.get("/api/intelligence/executions", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-trace-read",
    "/api/intelligence/executions"
  )
}, async (request) => {
  const binding = getGovernanceBinding(
    "cognitive-trace-read",
    "/api/intelligence/executions",
    request
  );
  const consentScope = binding.consentScope;
  return {
    layers: engine.getSnapshot().intelligenceLayers,
    executions: engine
      .getSnapshot()
      .cognitiveExecutions.map((execution) =>
        projectCognitiveExecution(execution, consentScope)
      ),
    recommendedLayerId: getPreferredLayer()?.id,
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/nodes", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-trace-read",
    "/api/nodes"
  )
}, async (request) => {
  const consentScope = getGovernanceBinding("cognitive-trace-read", "/api/nodes", request).consentScope;
  const nodeState = await nodeRegistry.listNodes();
  return {
    nodes: nodeState.nodes,
    summary: nodeState.summary,
    localNodeId: nodeRegistry.localNodeId,
    localLocality: nodeRegistry.localLocality,
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/federation/membership", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-trace-read",
    "/api/federation/membership"
  )
}, async (_request, reply) => {
  try {
    const membership = await buildFederationMembershipExport();
    return {
      accepted: true,
      membership
    };
  } catch (error) {
    reply.code(503);
    return {
      error: "federation_membership_unavailable",
      message: error instanceof Error ? error.message : "Unable to export federation membership."
    };
  }
});

app.get("/api/federation/leases", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-trace-read",
    "/api/federation/leases"
  )
}, async (_request, reply) => {
  try {
    const leases = await buildFederationLeaseExport();
    return {
      accepted: true,
      leases
    };
  } catch (error) {
    reply.code(503);
    return {
      error: "federation_leases_unavailable",
      message: error instanceof Error ? error.message : "Unable to export federation lease state."
    };
  }
});

app.get("/api/federation/peers", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-trace-read",
    "/api/federation/peers"
  )
}, async () => {
  return {
    accepted: true,
    peers: await federationPeerRegistry.listPeers()
  };
});

app.get("/api/intelligence/workers", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-trace-read",
    "/api/intelligence/workers"
  )
}, async (request) => {
  const consentScope = getGovernanceBinding(
    "cognitive-trace-read",
    "/api/intelligence/workers",
    request
  ).consentScope;
  const { nodeState, workers } = await listIntelligenceWorkerViewsWithOutcomes();
  const healthyWorkerCount = workers.filter((worker) => worker.healthStatus === "healthy").length;
  const staleWorkerCount = workers.filter((worker) => worker.healthStatus === "stale").length;
  const faultedWorkerCount = workers.filter((worker) => worker.healthStatus === "faulted").length;
  const eligibleWorkerCount = workers.filter((worker) => worker.assignmentEligible).length;
  return {
    nodes: nodeState.nodes,
    nodeSummary: nodeState.summary,
    workers,
    workerCount: workers.length,
    healthyWorkerCount,
    staleWorkerCount,
    faultedWorkerCount,
    eligibleWorkerCount,
    blockedWorkerCount: workers.length - eligibleWorkerCount,
    recommendedLayerId: getPreferredLayer()?.id,
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/intelligence/arbitrations", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-trace-read",
    "/api/intelligence/arbitrations"
  )
}, async (request) => {
  const consentScope = getGovernanceBinding(
    "cognitive-trace-read",
    "/api/intelligence/arbitrations",
    request
  ).consentScope;
  return {
    arbitrations: engine.getSnapshot().executionArbitrations,
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/intelligence/schedules", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-trace-read",
    "/api/intelligence/schedules"
  )
}, async (request) => {
  const consentScope = getGovernanceBinding(
    "cognitive-trace-read",
    "/api/intelligence/schedules",
    request
  ).consentScope;
  return {
    schedules: engine
      .getSnapshot()
      .executionSchedules.map((schedule) => projectExecutionSchedule(schedule, consentScope)),
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/intelligence/conversations", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-trace-read",
    "/api/intelligence/conversations"
  )
}, async (request) => {
  const consentScope = getGovernanceBinding(
    "cognitive-trace-read",
    "/api/intelligence/conversations",
    request
  ).consentScope;
  return {
    conversations: engine
      .getSnapshot()
      .conversations.map((conversation) => projectConversation(conversation, consentScope)),
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/actuation/outputs", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-read",
    "/api/actuation/outputs"
  )
}, async (request, reply) => {
  const binding = getGovernanceBinding("actuation-read", "/api/actuation/outputs", request);
  const query = (request.query as { sessionId?: string } | undefined) ?? {};
  const consentScope = binding.consentScope;
  const scopedSessionId =
    consentScope?.startsWith("session:") ? consentScope.slice("session:".length) : undefined;
  const requestedSessionId = query.sessionId?.trim();
  if (scopedSessionId && requestedSessionId && requestedSessionId !== scopedSessionId) {
    reply.code(403).send({
      error: "governance_denied",
      message: "Governance denied: resource_scope_mismatch"
    });
    return;
  }

  const outputs = engine
    .getSnapshot()
    .actuationOutputs.filter((output) => {
      const sessionFilter = requestedSessionId ?? scopedSessionId;
      return sessionFilter ? output.sessionId === sessionFilter : true;
    })
    .map((output) => projectActuationOutput(output, consentScope));

  return {
    outputs,
    visibility: deriveVisibilityScope(consentScope)
  };
});

app.get("/api/actuation/adapters", async () => ({
  adapters: actuationManager.listAdapters()
}));

app.get("/api/actuation/protocols", async () => ({
  protocols: actuationManager.listProtocols()
}));

app.get("/api/actuation/transports", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-read",
    "/api/actuation/transports"
  )
}, async (request) => {
  return {
    transports: actuationManager.listTransports(),
    visibility: deriveVisibilityScope(
      getGovernanceBinding("actuation-read", "/api/actuation/transports", request).consentScope
    )
  };
});

app.get("/api/actuation/deliveries", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-read",
    "/api/actuation/deliveries"
  )
}, async (request, reply) => {
  const query = (request.query as { limit?: string; sessionId?: string } | undefined) ?? {};
  const limit = query.limit ? Number(query.limit) : undefined;
  const consentScope =
    getGovernanceBinding("actuation-read", "/api/actuation/deliveries", request).consentScope;
  const scopedSessionId =
    consentScope?.startsWith("session:") ? consentScope.slice("session:".length) : undefined;
  const requestedSessionId = query.sessionId?.trim();
  if (scopedSessionId && requestedSessionId && requestedSessionId !== scopedSessionId) {
    reply.code(403).send({
      error: "governance_denied",
      message: "Governance denied: resource_scope_mismatch"
    });
    return;
  }
  return {
    deliveries: actuationManager
      .listDeliveries(Number.isFinite(limit) ? limit : undefined)
      .filter((delivery) => {
        const sessionFilter = requestedSessionId ?? scopedSessionId;
        return sessionFilter ? delivery.sessionId === sessionFilter : true;
      }),
    visibility: deriveVisibilityScope(consentScope)
  };
});

async function listQRuntimeModels(request: FastifyRequest, reply: FastifyReply) {
  try {
    const models = await listOllamaModels();
    const qAvailable = models.some((model) =>
      matchesModelReference(model.name ?? model.model, getQModelTarget())
    );
    return {
      models: qAvailable
        ? [
            {
              model: getQModelName(),
              name: getQModelName(),
              foundationModel: getQFoundationModelName()
            }
          ]
        : []
    };
  } catch (error) {
    reply.code(503);
    return {
      error: "q_runtime_unavailable",
      message: error instanceof Error ? error.message : "The Q runtime is unavailable."
    };
  }
}

app.get("/api/intelligence/q/models", listQRuntimeModels);
app.get("/api/intelligence/ollama/models", listQRuntimeModels);

async function registerQRuntimeLayer(request: FastifyRequest, reply: FastifyReply) {
  const body =
    (request.body as { role?: IntelligenceLayer["role"]; model?: string } | undefined) ?? {};

  try {
    const requestedModel = body.model?.trim();
    if (
      requestedModel &&
      !matchesModelReference(requestedModel, getQModelName()) &&
      !matchesModelReference(requestedModel, getQModelTarget())
    ) {
      reply.code(400);
      return {
        error: "unsupported_model",
        message: "Only Q can be registered on this harness."
      };
    }
    const layer = await discoverPreferredOllamaLayer(
      body.role ?? "mid",
      undefined,
      getQModelName()
    );
    if (!layer) {
      reply.code(404);
      return {
        error: "no_local_q_runtime"
      };
    }

    const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.registerIntelligenceLayer(layer)));
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      accepted: true,
      layer: projectIntelligenceLayer(layer),
      snapshot
    };
  } catch (error) {
    reply.code(503);
    return {
      error: "q_runtime_registration_failed",
      message: error instanceof Error ? error.message : "Unable to register the Q runtime layer."
    };
  }
}

app.post("/api/intelligence/q/register", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/intelligence/q/register"
  )
}, registerQRuntimeLayer);
app.post("/api/intelligence/ollama/register", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/intelligence/q/register"
  )
}, registerQRuntimeLayer);

app.post("/api/intelligence/workers/register", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/intelligence/workers/register"
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      workerId?: string;
      workerLabel?: string;
      hostLabel?: string;
      nodeId?: string;
      locality?: string;
      executionProfile?: IntelligenceWorkerExecutionProfile;
      executionEndpoint?: string;
      registeredAt?: string;
      heartbeatAt?: string;
      leaseDurationMs?: number;
      watch?: boolean;
      allowHostRisk?: boolean;
      supportedBaseModels?: string[];
      preferredLayerIds?: string[];
      observedLatencyMs?: number;
      costPerHourUsd?: number;
      deviceAffinityTags?: string[];
    } | undefined) ?? {};

  if (!body.workerId?.trim()) {
    reply.code(400);
    return {
      error: "invalid_worker_registration",
      message: "workerId is required."
    };
  }
  if (body.executionProfile !== "local" && body.executionProfile !== "remote") {
    reply.code(400);
    return {
      error: "invalid_worker_registration",
      message: "executionProfile must be local or remote."
    };
  }

  try {
    const localNode =
      body.executionProfile === "local" ? await nodeRegistry.ensureLocalNode() : undefined;
    const nodeState = await nodeRegistry.listNodes();
    const allowTelemetry = federationTelemetryAllowed(body.executionProfile);
    const worker = await intelligenceWorkerRegistry.registerWorker({
      workerId: body.workerId.trim(),
      workerLabel: body.workerLabel?.trim() || undefined,
      hostLabel: body.hostLabel?.trim() || undefined,
      nodeId: body.nodeId?.trim() || localNode?.nodeId,
      locality: body.locality?.trim() || localNode?.locality,
      executionProfile: body.executionProfile,
      executionEndpoint: body.executionEndpoint?.trim() || undefined,
      registeredAt: body.registeredAt?.trim() || new Date().toISOString(),
      heartbeatAt: body.heartbeatAt?.trim() || new Date().toISOString(),
      leaseDurationMs:
        typeof body.leaseDurationMs === "number" && Number.isFinite(body.leaseDurationMs)
          ? Number(body.leaseDurationMs)
          : 45_000,
      watch: body.watch === true,
      allowHostRisk: body.allowHostRisk === true,
      supportedBaseModels: Array.isArray(body.supportedBaseModels)
        ? body.supportedBaseModels
        : [],
      preferredLayerIds: Array.isArray(body.preferredLayerIds)
        ? body.preferredLayerIds
        : [],
      identityVerified: body.executionProfile === "local",
      observedLatencyMs:
        allowTelemetry &&
        typeof body.observedLatencyMs === "number" && Number.isFinite(body.observedLatencyMs)
          ? Number(body.observedLatencyMs)
          : body.executionProfile === "local"
            ? 0
            : undefined,
      costPerHourUsd:
        allowTelemetry &&
        typeof body.costPerHourUsd === "number" && Number.isFinite(body.costPerHourUsd)
          ? Number(body.costPerHourUsd)
          : body.executionProfile === "local"
            ? LOCAL_WORKER_COST_PER_HOUR_USD
            : undefined,
      deviceAffinityTags: allowTelemetry && Array.isArray(body.deviceAffinityTags)
        ? body.deviceAffinityTags
        : body.executionProfile === "local"
          ? LOCAL_WORKER_DEVICE_AFFINITY_TAGS
          : []
    }, nodeState.nodes);
    return {
      accepted: true,
      worker,
      healthyWorkerCount: worker.healthStatus === "healthy" ? 1 : 0,
      staleWorkerCount: worker.healthStatus === "stale" ? 1 : 0,
      faultedWorkerCount: worker.healthStatus === "faulted" ? 1 : 0,
      recommendedLayerId: getPreferredLayer()?.id
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "worker_registration_failed",
      message:
        error instanceof Error ? error.message : "Unable to register intelligence worker."
    };
  }
});

app.post("/api/intelligence/workers/:workerId/heartbeat", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/intelligence/workers/:workerId/heartbeat"
  )
}, async (request, reply) => {
  const params = request.params as { workerId?: string };
  const body =
    (request.body as {
      heartbeatAt?: string;
      leaseDurationMs?: number;
      workerLabel?: string;
      hostLabel?: string;
      nodeId?: string;
      locality?: string;
      executionProfile?: IntelligenceWorkerExecutionProfile;
      executionEndpoint?: string;
      watch?: boolean;
      allowHostRisk?: boolean;
      supportedBaseModels?: string[];
      preferredLayerIds?: string[];
      observedLatencyMs?: number;
      costPerHourUsd?: number;
      deviceAffinityTags?: string[];
    } | undefined) ?? {};

  if (!params.workerId?.trim()) {
    reply.code(400);
    return {
      error: "missing_worker_id"
    };
  }
  if (
    body.executionProfile !== undefined &&
    body.executionProfile !== "local" &&
    body.executionProfile !== "remote"
  ) {
    reply.code(400);
    return {
      error: "invalid_worker_heartbeat",
      message: "executionProfile must be local or remote."
    };
  }

  try {
    const localNode =
      body.executionProfile === "local" ? await nodeRegistry.ensureLocalNode() : undefined;
    const nodeState = await nodeRegistry.listNodes();
    const allowTelemetry = federationTelemetryAllowed(body.executionProfile);
    const worker = await intelligenceWorkerRegistry.heartbeatWorker({
      workerId: params.workerId.trim(),
      heartbeatAt: body.heartbeatAt?.trim() || new Date().toISOString(),
      leaseDurationMs:
        typeof body.leaseDurationMs === "number" && Number.isFinite(body.leaseDurationMs)
          ? Number(body.leaseDurationMs)
          : undefined,
      workerLabel: body.workerLabel?.trim() || undefined,
      hostLabel: body.hostLabel?.trim() || undefined,
      nodeId: body.nodeId?.trim() || localNode?.nodeId,
      locality: body.locality?.trim() || localNode?.locality,
      executionProfile: body.executionProfile,
      executionEndpoint: body.executionEndpoint?.trim() || undefined,
      watch: body.watch,
      allowHostRisk: body.allowHostRisk,
      supportedBaseModels: Array.isArray(body.supportedBaseModels)
        ? body.supportedBaseModels
        : undefined,
      preferredLayerIds: Array.isArray(body.preferredLayerIds)
        ? body.preferredLayerIds
        : undefined,
      identityVerified: body.executionProfile === "local" ? true : undefined,
      observedLatencyMs:
        allowTelemetry &&
        typeof body.observedLatencyMs === "number" && Number.isFinite(body.observedLatencyMs)
          ? Number(body.observedLatencyMs)
          : body.executionProfile === "local"
            ? 0
            : undefined,
      costPerHourUsd:
        allowTelemetry &&
        typeof body.costPerHourUsd === "number" && Number.isFinite(body.costPerHourUsd)
          ? Number(body.costPerHourUsd)
          : body.executionProfile === "local"
            ? LOCAL_WORKER_COST_PER_HOUR_USD
            : undefined,
      deviceAffinityTags: allowTelemetry && Array.isArray(body.deviceAffinityTags)
        ? body.deviceAffinityTags
        : body.executionProfile === "local"
          ? LOCAL_WORKER_DEVICE_AFFINITY_TAGS
          : undefined
    }, nodeState.nodes);
    return {
      accepted: true,
      worker,
      healthyWorkerCount: worker.healthStatus === "healthy" ? 1 : 0,
      staleWorkerCount: worker.healthStatus === "stale" ? 1 : 0,
      faultedWorkerCount: worker.healthStatus === "faulted" ? 1 : 0,
      recommendedLayerId: getPreferredLayer()?.id
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "worker_heartbeat_failed",
      message:
        error instanceof Error ? error.message : "Unable to record intelligence worker heartbeat."
    };
  }
});

app.post("/api/intelligence/workers/:workerId/unregister", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/intelligence/workers/:workerId/unregister"
  )
}, async (request, reply) => {
  const params = request.params as { workerId?: string };
  if (!params.workerId?.trim()) {
    reply.code(400);
    return {
      error: "missing_worker_id"
    };
  }

  const nodeState = await nodeRegistry.listNodes();
  const worker = await intelligenceWorkerRegistry.removeWorker(
    params.workerId.trim(),
    undefined,
    nodeState.nodes
  );
  return {
    accepted: true,
    worker,
    healthyWorkerCount: worker?.healthStatus === "healthy" ? 1 : 0,
    staleWorkerCount: worker?.healthStatus === "stale" ? 1 : 0,
    faultedWorkerCount: worker?.healthStatus === "faulted" ? 1 : 0,
    recommendedLayerId: getPreferredLayer()?.id
  };
});

app.post("/api/intelligence/workers/assign", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-execution",
    "/api/intelligence/workers/assign"
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      requestedExecutionDecision?: "allow_local" | "remote_required" | "preflight_blocked";
      baseModel?: string;
      preferredLayerIds?: string[];
      recommendedLayerId?: string;
      target?: string;
      preferredNodeId?: string;
      preferredLocality?: string;
      preferredDeviceAffinityTags?: string[];
      maxObservedLatencyMs?: number;
      maxCostPerHourUsd?: number;
    } | undefined) ?? {};

  const recommendedLayerId = body.recommendedLayerId?.trim() || getPreferredLayer()?.id;
  const localNode = await nodeRegistry.ensureLocalNode();
  const nodeState = await nodeRegistry.listNodes();
  const peerViews = await listFederationPeerViews();
  const executionOutcomes = remoteExecutionOutcomeSummaries();
  const result = await intelligenceWorkerRegistry.assignWorker({
    requestedExecutionDecision: body.requestedExecutionDecision,
    baseModel: body.baseModel?.trim() || undefined,
    preferredLayerIds: Array.isArray(body.preferredLayerIds)
      ? body.preferredLayerIds
      : [],
    recommendedLayerId,
    target: body.target?.trim() || undefined,
    preferredNodeId:
      body.preferredNodeId?.trim() ||
      (body.requestedExecutionDecision === "remote_required" ? undefined : localNode.nodeId),
    preferredLocality: body.preferredLocality?.trim() || localNode.locality,
    preferredDeviceAffinityTags: Array.isArray(body.preferredDeviceAffinityTags)
      ? body.preferredDeviceAffinityTags
      : undefined,
    maxObservedLatencyMs:
      typeof body.maxObservedLatencyMs === "number" && Number.isFinite(body.maxObservedLatencyMs)
        ? Number(body.maxObservedLatencyMs)
        : undefined,
    maxCostPerHourUsd:
      typeof body.maxCostPerHourUsd === "number" && Number.isFinite(body.maxCostPerHourUsd)
        ? Number(body.maxCostPerHourUsd)
        : undefined,
    nodeViews: nodeState.nodes,
    peerViews,
    executionOutcomeSummaries: [...executionOutcomes.workerSummaries.values()]
  });
  return {
    accepted: true,
    assignment: result.assignment,
    workers: result.workers,
    workerCount: result.workers.length,
    healthyWorkerCount: result.summary.healthyWorkerCount,
    staleWorkerCount: result.summary.staleWorkerCount,
    faultedWorkerCount: result.summary.faultedWorkerCount,
    eligibleWorkerCount: result.summary.eligibleWorkerCount,
    blockedWorkerCount: result.summary.blockedWorkerCount,
    recommendedLayerId
  };
});

app.post("/api/nodes/register", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/nodes/register"
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      nodeId?: string;
      nodeLabel?: string;
      hostLabel?: string;
      locality?: string;
      controlPlaneUrl?: string;
      registeredAt?: string;
      heartbeatAt?: string;
      leaseDurationMs?: number;
      capabilities?: string[];
      isLocal?: boolean;
      costPerHourUsd?: number;
      deviceAffinityTags?: string[];
    } | undefined) ?? {};

  if (!body.nodeId?.trim() || !body.locality?.trim()) {
    reply.code(400);
    return {
      error: "invalid_node_registration",
      message: "nodeId and locality are required."
    };
  }

  try {
    const allowTelemetry = federationNodeTelemetryAllowed(body.isLocal);
    const node = await nodeRegistry.registerNode({
      nodeId: body.nodeId.trim(),
      nodeLabel: body.nodeLabel?.trim() || undefined,
      hostLabel: body.hostLabel?.trim() || undefined,
      locality: body.locality.trim(),
      controlPlaneUrl: body.controlPlaneUrl?.trim() || undefined,
      registeredAt: body.registeredAt?.trim() || new Date().toISOString(),
      heartbeatAt: body.heartbeatAt?.trim() || new Date().toISOString(),
      leaseDurationMs:
        typeof body.leaseDurationMs === "number" && Number.isFinite(body.leaseDurationMs)
          ? Number(body.leaseDurationMs)
          : 45_000,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : [],
      isLocal: body.isLocal === true,
      identityVerified: body.isLocal === true,
      observedLatencyMs: body.isLocal === true ? 0 : undefined,
      costPerHourUsd:
        allowTelemetry &&
        typeof body.costPerHourUsd === "number" && Number.isFinite(body.costPerHourUsd)
          ? Number(body.costPerHourUsd)
          : undefined,
      deviceAffinityTags:
        allowTelemetry && Array.isArray(body.deviceAffinityTags) ? body.deviceAffinityTags : []
    });
    const nodeState = await nodeRegistry.listNodes();
    return {
      accepted: true,
      node,
      summary: nodeState.summary
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "node_registration_failed",
      message: error instanceof Error ? error.message : "Unable to register node."
    };
  }
});

app.post("/api/federation/peers/register", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-registration",
    "/api/federation/peers/register"
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      controlPlaneUrl?: string;
      expectedNodeId?: string;
      refreshIntervalMs?: number;
      leaseRefreshIntervalMs?: number;
      trustWindowMs?: number;
      maxObservedLatencyMs?: number;
      authorizationToken?: string;
    } | undefined) ?? {};

  if (!body.controlPlaneUrl?.trim()) {
    reply.code(400);
    return {
      error: "invalid_federation_peer",
      message: "controlPlaneUrl is required."
    };
  }

  try {
    const peer = await federationPeerRegistry.registerPeer({
      controlPlaneUrl: normalizeFederationControlPlaneUrl(body.controlPlaneUrl.trim()),
      authorizationToken: body.authorizationToken?.trim() || null,
      expectedNodeId: body.expectedNodeId?.trim() || undefined,
      refreshIntervalMs:
        typeof body.refreshIntervalMs === "number" && Number.isFinite(body.refreshIntervalMs)
          ? Number(body.refreshIntervalMs)
          : FEDERATION_DEFAULT_REFRESH_INTERVAL_MS,
      leaseRefreshIntervalMs:
        typeof body.leaseRefreshIntervalMs === "number" &&
        Number.isFinite(body.leaseRefreshIntervalMs)
          ? Number(body.leaseRefreshIntervalMs)
          : FEDERATION_DEFAULT_LEASE_REFRESH_INTERVAL_MS,
      trustWindowMs:
        typeof body.trustWindowMs === "number" && Number.isFinite(body.trustWindowMs)
          ? Number(body.trustWindowMs)
          : FEDERATION_DEFAULT_TRUST_WINDOW_MS,
      maxObservedLatencyMs:
        typeof body.maxObservedLatencyMs === "number" && Number.isFinite(body.maxObservedLatencyMs)
          ? Number(body.maxObservedLatencyMs)
          : undefined
    });
    const result = await refreshFederationPeer(peer.peerId);
    return {
      accepted: true,
      peer: result.peer,
      observedLatencyMs: result.sync.observedLatencyMs,
      smoothedLatencyMs: result.sync.effectiveObservedLatencyMs,
      node: result.sync.remoteNode,
      importedWorkers: result.sync.importedWorkers,
      removedWorkers: result.sync.removedWorkers
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "federation_peer_register_failed",
      message: error instanceof Error ? error.message : "Unable to register federation peer."
    };
  }
});

app.post("/api/federation/peers/sync", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-registration",
    "/api/federation/peers/sync"
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      peerId?: string;
      controlPlaneUrl?: string;
      authorizationToken?: string;
      expectedNodeId?: string;
      maxObservedLatencyMs?: number;
    } | undefined) ?? {};

  try {
    const existingPeer =
      body.peerId?.trim()
        ? await federationPeerRegistry.getPeer(body.peerId.trim())
        : body.controlPlaneUrl?.trim()
          ? await federationPeerRegistry.findPeerByUrl(
              normalizeFederationControlPlaneUrl(body.controlPlaneUrl.trim())
            )
          : null;

    if (!existingPeer) {
      reply.code(400);
      return {
        error: "invalid_federation_peer",
        message: "Peer must be registered before sync."
      };
    }

    if (body.authorizationToken?.trim()) {
      await federationPeerRegistry.registerPeer({
        controlPlaneUrl: existingPeer.controlPlaneUrl,
        authorizationToken: body.authorizationToken.trim(),
        expectedNodeId: existingPeer.expectedNodeId ?? undefined,
        refreshIntervalMs: existingPeer.refreshIntervalMs,
        leaseRefreshIntervalMs: existingPeer.leaseRefreshIntervalMs,
        trustWindowMs: existingPeer.trustWindowMs,
        maxObservedLatencyMs: existingPeer.maxObservedLatencyMs ?? undefined
      });
    }

    const result = await refreshFederationPeer(existingPeer.peerId);
    return {
      accepted: true,
      peer: result.peer,
      observedLatencyMs: result.sync.observedLatencyMs,
      smoothedLatencyMs: result.sync.effectiveObservedLatencyMs,
      node: result.sync.remoteNode,
      importedWorkers: result.sync.importedWorkers,
      removedWorkers: result.sync.removedWorkers
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "federation_peer_sync_failed",
      message: error instanceof Error ? error.message : "Unable to sync federation peer."
    };
  }
});

app.post("/api/federation/peers/:peerId/refresh", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-registration",
    "/api/federation/peers/:peerId/refresh"
  )
}, async (request, reply) => {
  const params = request.params as { peerId?: string };
  if (!params.peerId?.trim()) {
    reply.code(400);
    return {
      error: "missing_peer_id"
    };
  }

  try {
    const result = await refreshFederationPeer(params.peerId.trim());
    return {
      accepted: true,
      peer: result.peer,
      observedLatencyMs: result.sync.observedLatencyMs,
      smoothedLatencyMs: result.sync.effectiveObservedLatencyMs,
      node: result.sync.remoteNode,
      importedWorkers: result.sync.importedWorkers,
      removedWorkers: result.sync.removedWorkers
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "federation_peer_refresh_failed",
      message: error instanceof Error ? error.message : "Unable to refresh federation peer."
    };
  }
});

app.post("/api/federation/peers/:peerId/lease-renew", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-registration",
    "/api/federation/peers/:peerId/lease-renew"
  )
}, async (request, reply) => {
  const params = request.params as { peerId?: string };
  if (!params.peerId?.trim()) {
    reply.code(400);
    return {
      error: "missing_peer_id"
    };
  }

  try {
    const result = await renewFederationPeerLeaseByPeerId(params.peerId.trim());
    return {
      accepted: true,
      peer: result.peer,
      observedLatencyMs: result.renewal.observedLatencyMs,
      smoothedLatencyMs: result.renewal.effectiveObservedLatencyMs,
      node: result.renewal.renewedNode,
      renewedWorkers: result.renewal.renewedWorkers,
      skippedWorkerIds: result.renewal.skippedWorkerIds
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "federation_peer_lease_renewal_failed",
      message:
        error instanceof Error ? error.message : "Unable to renew federation peer leases."
    };
  }
});

app.delete("/api/federation/peers/:peerId", {
  preHandler: requireFederationGovernedPreHandler(
    "cognitive-registration",
    "/api/federation/peers/:peerId"
  )
}, async (request, reply) => {
  const params = request.params as { peerId?: string };
  if (!params.peerId?.trim()) {
    reply.code(400);
    return {
      error: "missing_peer_id"
    };
  }

  const peer = await federationPeerRegistry.removePeer(params.peerId.trim());
  const eviction = await evictFederationPeerState({
    expectedNodeId: peer?.expectedNodeId ?? undefined,
    controlPlaneUrl: peer?.controlPlaneUrl
  });
  return {
    accepted: true,
    peer,
    eviction
  };
});

app.post("/api/nodes/:nodeId/heartbeat", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/nodes/:nodeId/heartbeat"
  )
}, async (request, reply) => {
  const params = request.params as { nodeId?: string };
  const body =
    (request.body as {
      heartbeatAt?: string;
      leaseDurationMs?: number;
      nodeLabel?: string;
      hostLabel?: string;
      locality?: string;
      controlPlaneUrl?: string;
      capabilities?: string[];
      observedLatencyMs?: number;
      costPerHourUsd?: number;
      deviceAffinityTags?: string[];
    } | undefined) ?? {};

  if (!params.nodeId?.trim()) {
    reply.code(400);
    return {
      error: "missing_node_id"
    };
  }

  try {
    const existingNode = await nodeRegistry.getNode(params.nodeId.trim());
    const allowTelemetry = federationNodeTelemetryAllowed(existingNode?.isLocal);
    const node = await nodeRegistry.heartbeatNode({
      nodeId: params.nodeId.trim(),
      heartbeatAt: body.heartbeatAt?.trim() || new Date().toISOString(),
      leaseDurationMs:
        typeof body.leaseDurationMs === "number" && Number.isFinite(body.leaseDurationMs)
          ? Number(body.leaseDurationMs)
          : undefined,
      nodeLabel: body.nodeLabel?.trim() || undefined,
      hostLabel: body.hostLabel?.trim() || undefined,
      locality: body.locality?.trim() || undefined,
      controlPlaneUrl: body.controlPlaneUrl?.trim() || undefined,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : undefined,
      observedLatencyMs:
        allowTelemetry &&
        typeof body.observedLatencyMs === "number" && Number.isFinite(body.observedLatencyMs)
          ? Number(body.observedLatencyMs)
          : undefined,
      costPerHourUsd:
        allowTelemetry &&
        typeof body.costPerHourUsd === "number" && Number.isFinite(body.costPerHourUsd)
          ? Number(body.costPerHourUsd)
          : undefined,
      deviceAffinityTags:
        allowTelemetry && Array.isArray(body.deviceAffinityTags) ? body.deviceAffinityTags : undefined
    });
    const nodeState = await nodeRegistry.listNodes();
    return {
      accepted: true,
      node,
      summary: nodeState.summary
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "node_heartbeat_failed",
      message: error instanceof Error ? error.message : "Unable to record node heartbeat."
    };
  }
});

app.delete("/api/nodes/:nodeId", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-registration",
    "/api/nodes/:nodeId"
  )
}, async (request, reply) => {
  const params = request.params as { nodeId?: string };
  if (!params.nodeId?.trim()) {
    reply.code(400);
    return {
      error: "missing_node_id"
    };
  }

  const node = await nodeRegistry.removeNode(params.nodeId.trim());
  const nodeState = await nodeRegistry.listNodes();
  return {
    accepted: true,
    node,
    summary: nodeState.summary
  };
});

app.post("/api/actuation/dispatch", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-dispatch",
    "/api/actuation/dispatch",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const binding = getGovernanceBinding("actuation-dispatch", "/api/actuation/dispatch", request);
  const consentScope = binding.consentScope;
  const body = (request.body as DispatchBody | undefined) ?? {};
  const snapshot = engine.getSnapshot();
  const boundSources = resolveBoundSources({
    snapshot,
    body,
    consentScope
  });
  if ("error" in boundSources) {
    reply.code(boundSources.error.code);
    return boundSources.error.body;
  }

  try {
    const result = await dispatchWithRoute({
      body: {
        ...body,
        sessionId: boundSources.sessionId
      },
      consentScope,
      execution: boundSources.execution,
      frame: boundSources.frame
    });

    return {
      accepted: true,
      routeDecision: result.routeDecision,
      adapter: result.adapter,
      delivery: result.delivery,
      output: projectActuationOutput(result.output, consentScope),
      snapshot: result.snapshot
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "actuation_dispatch_failed",
      message: error instanceof Error ? error.message : "Unable to dispatch actuation output."
    };
  }
});

app.post("/api/actuation/transports/udp/register", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-device-link",
    "/api/actuation/transports/udp/register",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      adapterId?: string;
      host?: string;
      port?: number;
      label?: string;
      deviceId?: string;
    } | undefined) ?? {};

  if (!body.adapterId?.trim() || !body.host?.trim() || !Number.isFinite(body.port)) {
    reply.code(400);
    return {
      error: "invalid_transport_registration",
      message: "adapterId, host, and port are required."
    };
  }

  try {
    const transport = await actuationManager.registerUdpOscTransport({
      adapterId: body.adapterId.trim(),
      host: body.host.trim(),
      port: Number(body.port),
      label: body.label,
      deviceId: body.deviceId
    });
    return {
      accepted: true,
      transport
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "transport_registration_failed",
      message:
        error instanceof Error ? error.message : "Unable to register UDP/OSC transport."
    };
  }
});

app.post("/api/actuation/transports/serial/register", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-device-link",
    "/api/actuation/transports/serial/register",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      adapterId?: string;
      devicePath?: string;
      baudRate?: number;
      label?: string;
      deviceId?: string;
      vendorId?: string;
      modelId?: string;
      heartbeatIntervalMs?: number;
      heartbeatTimeoutMs?: number;
    } | undefined) ?? {};

  if (!body.adapterId?.trim() || !body.devicePath?.trim()) {
    reply.code(400);
    return {
      error: "invalid_transport_registration",
      message: "adapterId and devicePath are required."
    };
  }

  try {
    const transport = await actuationManager.registerSerialJsonTransport({
      adapterId: body.adapterId.trim(),
      devicePath: body.devicePath.trim(),
      baudRate:
        typeof body.baudRate === "number" ? Number(body.baudRate) : undefined,
      label: body.label,
      deviceId: body.deviceId,
      vendorId: body.vendorId,
      modelId: body.modelId,
      heartbeatIntervalMs:
        typeof body.heartbeatIntervalMs === "number"
          ? Number(body.heartbeatIntervalMs)
          : undefined,
      heartbeatTimeoutMs:
        typeof body.heartbeatTimeoutMs === "number"
          ? Number(body.heartbeatTimeoutMs)
          : undefined
    });
    return {
      accepted: true,
      transport
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "transport_registration_failed",
      message:
        error instanceof Error ? error.message : "Unable to register serial transport."
    };
  }
});

app.post("/api/actuation/transports/http2/register", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-device-link",
    "/api/actuation/transports/http2/register",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      adapterId?: string;
      endpoint?: string;
      label?: string;
      deviceId?: string;
      vendorId?: string;
      modelId?: string;
      heartbeatIntervalMs?: number;
      heartbeatTimeoutMs?: number;
    } | undefined) ?? {};

  if (!body.adapterId?.trim() || !body.endpoint?.trim()) {
    reply.code(400);
    return {
      error: "invalid_transport_registration",
      message: "adapterId and endpoint are required."
    };
  }

  try {
    const transport = await actuationManager.registerHttp2JsonTransport({
      adapterId: body.adapterId.trim(),
      endpoint: body.endpoint.trim(),
      label: body.label,
      deviceId: body.deviceId,
      vendorId: body.vendorId,
      modelId: body.modelId,
      heartbeatIntervalMs:
        typeof body.heartbeatIntervalMs === "number"
          ? Number(body.heartbeatIntervalMs)
          : undefined,
      heartbeatTimeoutMs:
        typeof body.heartbeatTimeoutMs === "number"
          ? Number(body.heartbeatTimeoutMs)
          : undefined
    });
    return {
      accepted: true,
      transport
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "transport_registration_failed",
      message:
        error instanceof Error ? error.message : "Unable to register HTTP/2 transport."
    };
  }
});

app.post("/api/actuation/transports/:transportId/heartbeat", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-device-link",
    "/api/actuation/transports/:transportId/heartbeat"
  )
}, async (request, reply) => {
  const params = request.params as { transportId?: string };
  if (!params.transportId?.trim()) {
    reply.code(400);
    return {
      error: "missing_transport_id"
    };
  }

  const body =
    (request.body as {
      latencyMs?: number;
      capabilities?: string[];
      degradedCapabilities?: string[];
      firmwareVersion?: string;
    } | undefined) ?? {};

  try {
    const transport = await actuationManager.recordTransportHeartbeat({
      transportId: params.transportId.trim(),
      latencyMs:
        typeof body.latencyMs === "number" ? Number(body.latencyMs) : undefined,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : undefined,
      degradedCapabilities: Array.isArray(body.degradedCapabilities)
        ? body.degradedCapabilities
        : undefined,
      firmwareVersion: body.firmwareVersion
    });
    return {
      accepted: true,
      transport
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "transport_heartbeat_failed",
      message:
        error instanceof Error ? error.message : "Unable to record transport heartbeat."
    };
  }
});

app.post("/api/actuation/transports/:transportId/reset", {
  preHandler: requireGovernedActionPreHandler(
    "actuation-device-link",
    "/api/actuation/transports/:transportId/reset",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const params = request.params as { transportId?: string };
  if (!params.transportId?.trim()) {
    reply.code(400);
    return {
      error: "missing_transport_id"
    };
  }

  try {
    const transport = await actuationManager.resetTransportFault(params.transportId.trim());
    return {
      accepted: true,
      transport
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "transport_reset_failed",
      message:
        error instanceof Error ? error.message : "Unable to reset transport fault."
    };
  }
});

app.post("/api/ingest/bids/scan", {
  preHandler: requireGovernedActionPreHandler(
    "dataset-ingestion",
    "/api/ingest/bids/scan"
  )
}, async (request, reply) => {
  const body = (request.body as { rootPath?: string } | undefined) ?? {};
  if (!body.rootPath || body.rootPath.trim().length === 0) {
    reply.code(400);
    return {
      error: "missing_root_path"
    };
  }

  try {
    const dataset = await scanBidsDataset(resolvePathWithinAllowedRoot(body.rootPath));
    await datasetRegistry.register(dataset);
    const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.registerDataset(dataset.summary)));
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      accepted: true,
      dataset,
      snapshot
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "bids_scan_failed",
      message: error instanceof Error ? error.message : "BIDS scan failed."
    };
  }
});

app.post("/api/intelligence/run", {
  preHandler: requireGovernedActionPreHandler(
    "cognitive-execution",
    "/api/intelligence/run"
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      layerId?: string;
      objective?: string;
      sessionId?: string;
      requestedExecutionDecision?: RequestedExecutionDecision;
    } | undefined) ?? {};
  const consentScope = getGovernanceBinding(
    "cognitive-execution",
    "/api/intelligence/run",
    request
  ).consentScope;
  const resolvedSessionId = body.sessionId?.trim() || sessionScopeId(consentScope);
  const requestedLayer = body.layerId
    ? getPreferredLayer(body.layerId)
    : await ensurePreferredIntelligenceLayer();
  if (body.layerId && !requestedLayer) {
    reply.code(404);
    return {
      error: "intelligence_layer_not_found",
      layerId: body.layerId
    };
  }
  const layer = requestedLayer ?? getPreferredLayer();

  if (!layer) {
    reply.code(404);
    return {
      error: "no_intelligence_layer",
      message: "Register a Q runtime layer before running a cognitive pass."
    };
  }

  try {
    const assignment = await reserveExecutionWorker({
      layer,
      requestedExecutionDecision: body.requestedExecutionDecision,
      target: "single-layer"
    });
    const result = await executeCognitivePassWithRetry({
      layer,
      objective: body.objective,
      consentScope,
      sessionId: resolvedSessionId,
      assignment,
      executionTopology: "sequential",
      reservation: {
        requestedExecutionDecision: body.requestedExecutionDecision,
        target: "single-layer",
        preferredDeviceAffinityTags: [layer.role]
      }
    });

    if (result.execution.status === "failed") {
      reply.code(503);
      return {
        error: "cognitive_execution_failed",
        message: result.execution.responsePreview,
        layer: result.layer,
        execution: result.execution,
        response: result.response,
        snapshot: result.snapshot
      };
    }

    return {
      accepted: true,
      layer: result.layer,
      execution: result.execution,
      response: result.response,
      snapshot: result.snapshot
    };
  } catch (error) {
    reply.code(503);
    return {
      error: "cognitive_execution_failed",
      message: error instanceof Error ? error.message : "Unable to run the cognitive layer."
    };
  }
});

app.post("/api/orchestration/mediate", {
  preHandler: [
    requireGovernedActionPreHandler(
      "actuation-dispatch",
      "/api/orchestration/mediate",
      { realWorldEngagement: "required" }
    ),
    requireGovernedActionPreHandler(
      "cognitive-execution",
      "/api/orchestration/mediate:cognition",
      {
        policyIdOverride: "cognitive-run-default"
      }
    )
  ],
  config: {
    rateLimit: {
      max: ORCHESTRATION_MEDIATE_RATE_LIMIT_MAX,
      timeWindow: ORCHESTRATION_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const body =
    ((request.body as DispatchBody & {
      layerId?: string;
      objective?: string;
      forceCognition?: boolean;
    } | undefined) ?? {});
  const snapshot = engine.getSnapshot();
  const binding = getGovernanceBinding("actuation-dispatch", "/api/orchestration/mediate", request);
  const consentScope = binding.consentScope;
  const boundSources = resolveBoundSources({
    snapshot,
    body,
    consentScope
  });
  if ("error" in boundSources) {
    reply.code(boundSources.error.code);
    return boundSources.error.body;
  }
  const execution = boundSources.execution;
  const frame = boundSources.frame;
  const resolvedSessionId = boundSources.sessionId;

  const sessionConversationMemory = getSessionConversationMemory(resolvedSessionId);
  const federatedPressureState = await computeFederatedExecutionPressure({
    target: "planner-swarm",
    preferredDeviceAffinityTags: ["swarm"]
  });
  const mediationProtectionPosture = buildProtectionPostureSummary(snapshot);
  const mediationQContext = await resolveQOrchestrationContext({
    snapshot,
    objective: body.objective,
    release: releaseMetadata,
    protectionPosture: mediationProtectionPosture
  });

  const arbitrationPlan = planExecutionArbitration({
    snapshot,
    frame,
    execution,
    governanceStatus: governance.getStatus(),
    governanceDecisions: governance.listDecisions(),
    protectionPressure: mediationProtectionPosture.pressure,
    consentScope,
    objective: body.objective,
    requestedLayerId: body.layerId?.trim() || undefined,
    forceCognition: body.forceCognition,
    suppressed: body.suppressed,
    sessionConversationMemory,
    federationPressure: federatedPressureState.pressure,
    qContext: mediationQContext
  });
  const arbitrationDecision = buildExecutionArbitrationDecision({
    plan: arbitrationPlan,
    consentScope,
    frame,
    execution,
    requestedLayerId: body.layerId?.trim() || undefined
  });
  const tracedArbitrationDecision = await traceOrchestrationDecision({
    kind: "orchestration-arbitration",
    decision: arbitrationDecision,
    consentScope,
    qContext: mediationQContext
  });
  const arbitrationSnapshot = phaseSnapshotSchema.parse(
    projectPhaseSnapshot(engine.recordExecutionArbitration(tracedArbitrationDecision))
  );
  await persistence.persist(engine.getDurableState());
  emitSnapshot();

  if (arbitrationPlan.shouldRunCognition) {
    const rolesToEnsure = preferredScheduleRoles(tracedArbitrationDecision);
    if (rolesToEnsure.length > 0) {
      await ensurePreferredIntelligenceLayers(rolesToEnsure);
    }
  }

  const schedulePlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: tracedArbitrationDecision,
    requestedLayerId: body.layerId?.trim() || undefined,
    sessionConversationMemory,
    federationPressure: federatedPressureState.pressure,
    qContext: mediationQContext
  });
  const scheduleDecisionBase = buildExecutionScheduleDecision({
    arbitration: tracedArbitrationDecision,
    plan: schedulePlan
  });
  const roundtablePlan = buildRoundtableActionPlan({
    objective: scheduleDecisionBase.objective,
    sessionId: resolvedSessionId,
    consentScope,
    schedule: scheduleDecisionBase
  });
  const scheduleDecision = {
    ...scheduleDecisionBase,
    sessionScope: roundtablePlan.sessionScope,
    roundtableSummary: roundtablePlan.summary,
    roundtableActionCount: roundtablePlan.actions.length,
    roundtableRepoCount: roundtablePlan.repoCount
  };
  const tracedScheduleDecision = await traceOrchestrationDecision({
    kind: "orchestration-schedule",
    decision: scheduleDecision,
    consentScope,
    qContext: mediationQContext
  });
  const scheduleSnapshot = phaseSnapshotSchema.parse(
    projectPhaseSnapshot(engine.recordExecutionSchedule(tracedScheduleDecision))
  );
  await persistence.persist(engine.getDurableState());
  emitSnapshot();

  let mediationLayer: IntelligenceLayer | undefined;
  let mediationExecution = execution;
  let mediationResponse: string | undefined;
  let mediationConversation:
    | ReturnType<typeof engine.getSnapshot>["conversations"][number]
    | undefined;
  let cognitionSnapshot = scheduleSnapshot;
  const dispatchOnApproval = Boolean(body.dispatchOnApproval);

  if (!tracedScheduleDecision.shouldRunCognition) {
    const roundtableActions = await materializeRoundtableActionExecutionArtifacts({
      objective: tracedScheduleDecision.objective,
      actions: roundtablePlan.actions
    });
    const roundtableSummary = appendRoundtableExecutionSummary(
      roundtablePlan.summary,
      roundtableActions
    );
    mediationConversation = await traceConversationRecord({
      conversation: buildConversationRecord({
        sessionId: resolvedSessionId,
        sessionScope: roundtablePlan.sessionScope,
        arbitrationId: tracedArbitrationDecision.id,
        schedule: tracedScheduleDecision,
        turns: [],
        roundtableSummary,
        roundtableActions
      }),
      consentScope,
      schedule: tracedScheduleDecision
    });
    cognitionSnapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.recordConversation(mediationConversation), consentScope)
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    await recordAgentIntelligenceAssessmentAfterConversation(
      mediationConversation,
      consentScope
    );
    cognitionSnapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.getSnapshot(), consentScope)
    );
  }

  if (tracedScheduleDecision.shouldRunCognition) {
    if (tracedScheduleDecision.layerIds.length === 0) {
      reply.code(404);
      return {
        error: "no_intelligence_layer",
        message: "Register a Q runtime layer before running the mediated cognitive schedule.",
        arbitrationDecision: tracedArbitrationDecision,
        arbitrationPlan,
        scheduleDecision: tracedScheduleDecision,
        schedulePlan,
        snapshot: scheduleSnapshot
      };
    }

    try {
      const cognition = await executeCognitiveSchedule({
        schedule: tracedScheduleDecision,
        objective: tracedScheduleDecision.objective,
        consentScope,
        sessionId: resolvedSessionId,
        arbitrationId: tracedArbitrationDecision.id,
        requestedExecutionDecision: body.requestedExecutionDecision,
        roundtablePlan
      });
      mediationLayer = cognition.primaryLayer;
      mediationExecution = cognition.primaryExecution;
      mediationResponse = cognition.combinedResponse;
      mediationConversation = cognition.conversation;
      cognitionSnapshot = cognition.snapshot;
    } catch (error) {
      reply.code(503);
      return {
        error: "cognitive_execution_failed",
        message: error instanceof Error ? error.message : "Unable to run the mediated cognitive schedule.",
        arbitrationDecision: tracedArbitrationDecision,
        arbitrationPlan,
        scheduleDecision: tracedScheduleDecision,
        schedulePlan,
        snapshot: cognitionSnapshot
      };
    }
  }

  if (mediationConversation?.guardVerdict === "blocked") {
    governance.record(binding, false, "guard_verdict_blocked");
  }

  const guardAllowsDispatch =
    mediationConversation?.guardVerdict === undefined ||
    mediationConversation.guardVerdict === "approved";
  const routePreviewSnapshot = engine.getSnapshot();
  const routePreviewProtectionPosture = buildProtectionPostureSummary(routePreviewSnapshot);
  const routePreviewQContext =
    mediationExecution && truthfulModelLabel(mediationExecution.model) === getQModelName()
      ? await resolveQOrchestrationContext({
          snapshot: routePreviewSnapshot,
          objective: mediationExecution.objective,
          context: mediationExecution.reasonSummary ?? mediationExecution.responsePreview,
          release: releaseMetadata,
          protectionPosture: routePreviewProtectionPosture
        })
      : undefined;
  const routePreview = planAdaptiveRoute({
    snapshot: routePreviewSnapshot,
    frame,
    execution: mediationExecution,
    cognitiveRouteSuggestion: mediationExecution?.routeSuggestion,
    federationPressure: federatedPressureState.pressure,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: governance.getStatus(),
    governanceDecisions: governance.listDecisions(),
    protectionPressure: routePreviewProtectionPosture.pressure,
    consentScope,
    requestedAdapterId: body.adapterId?.trim() || undefined,
    requestedChannel: body.channel,
    requestedTargetNodeId: body.targetNodeId?.trim() || undefined,
    requestedIntensity:
      typeof body.intensity === "number" ? Number(body.intensity) : undefined,
    suppressed:
      !arbitrationPlan.shouldDispatchActuation || !guardAllowsDispatch,
    qContext: routePreviewQContext
  });
  const shouldDispatchOnApproval =
    dispatchOnApproval && arbitrationPlan.shouldDispatchActuation && guardAllowsDispatch;

  if (!shouldDispatchOnApproval) {
    const reviewRouteDecision = buildReviewRoutingDecision({
      routePlan: routePreview,
      sessionId: resolvedSessionId,
      frame,
      execution: mediationExecution,
      consentScope,
      heldReason: guardAllowsDispatch ? "review_only" : "guard_blocked"
    });
    cognitionSnapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.recordRoutingDecision(reviewRouteDecision))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      accepted: true,
      arbitrationDecision: tracedArbitrationDecision,
      arbitrationPlan,
      scheduleDecision: tracedScheduleDecision,
      schedulePlan,
      layer: mediationLayer,
      execution: mediationExecution,
      conversation: mediationConversation,
      response: mediationResponse,
      routePlan: routePreview,
      routeDecision: reviewRouteDecision,
      snapshot: cognitionSnapshot
    };
  }

  try {
    const dispatchResult = await dispatchWithRoute({
      body: {
        sessionId: resolvedSessionId,
        sourceExecutionId: body.sourceExecutionId,
        sourceFrameId: body.sourceFrameId,
        adapterId: body.adapterId,
        targetNodeId: body.targetNodeId,
        channel: body.channel,
        command: body.command,
        intensity: body.intensity,
        suppressed: false
      },
      consentScope,
      execution: mediationExecution,
      frame
    });

    return {
      accepted: true,
      arbitrationDecision: tracedArbitrationDecision,
      arbitrationPlan,
      scheduleDecision: tracedScheduleDecision,
      schedulePlan,
      layer: mediationLayer,
      execution: mediationExecution,
      conversation: mediationConversation,
      response: mediationResponse,
      routeDecision: dispatchResult.routeDecision,
      adapter: dispatchResult.adapter,
      delivery: dispatchResult.delivery,
      output: projectActuationOutput(dispatchResult.output, consentScope),
      snapshot: dispatchResult.snapshot
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "orchestration_mediation_failed",
      message: error instanceof Error ? error.message : "Unable to complete the mediated orchestration pass.",
      arbitrationDecision: tracedArbitrationDecision,
      arbitrationPlan,
      scheduleDecision: tracedScheduleDecision,
      schedulePlan,
      snapshot: cognitionSnapshot
    };
  }
});

app.post("/api/ingest/nwb/scan", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-session-ingestion",
    "/api/ingest/nwb/scan"
  )
}, async (request, reply) => {
  const body = (request.body as { filePath?: string } | undefined) ?? {};
  if (!body.filePath || body.filePath.trim().length === 0) {
    reply.code(400);
    return {
      error: "missing_file_path"
    };
  }

  try {
    const session = await scanNwbFile(resolvePathWithinAllowedRoot(body.filePath));
    await neuroRegistry.register(session);
    const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.registerNeuroSession(session.summary)));
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      accepted: true,
      session,
      snapshot
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "nwb_scan_failed",
      message: error instanceof Error ? error.message : "NWB scan failed."
    };
  }
});

app.post("/api/neuro/replays/start", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-replay",
    "/api/neuro/replays/start"
  )
}, async (request, reply) => {
  const body =
    (request.body as {
      sessionId?: string;
      filePath?: string;
      windowSize?: number;
      paceMs?: number;
      maxWindows?: number;
    } | undefined) ?? {};

  let sessionRecord = body.sessionId ? await neuroRegistry.get(body.sessionId) : null;

  if (!sessionRecord && body.filePath) {
    try {
      sessionRecord = await scanNwbFile(resolvePathWithinAllowedRoot(body.filePath));
      await neuroRegistry.register(sessionRecord);
      engine.registerNeuroSession(sessionRecord.summary);
      await persistence.persist(engine.getDurableState());
      emitSnapshot();
    } catch (error) {
      reply.code(400);
      return {
        error: "nwb_replay_scan_failed",
        message: error instanceof Error ? error.message : "Unable to scan NWB replay source."
      };
    }
  }

  if (!sessionRecord) {
    reply.code(404);
    return {
      error: "neuro_session_not_found",
      sessionId: body.sessionId
    };
  }

  try {
    const replay = await neuroReplayManager.start(sessionRecord.summary, {
      windowSize: body.windowSize,
      paceMs: body.paceMs,
      maxWindows: body.maxWindows
    });
    return {
      accepted: true,
      replay,
      snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()))
    };
  } catch (error) {
    reply.code(500);
    return {
      error: "neuro_replay_start_failed",
      message: error instanceof Error ? error.message : "Unable to start neuro replay."
    };
  }
});

app.post("/api/neuro/replays/:replayId/stop", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-replay",
    "/api/neuro/replays/:replayId/stop"
  )
}, async (request, reply) => {
  const params = request.params as { replayId?: string };
  if (!params.replayId) {
    reply.code(400);
    return {
      error: "missing_replay_id"
    };
  }

  const replay = await neuroReplayManager.stop(params.replayId);
  if (!replay) {
    reply.code(404);
    return {
      error: "replay_not_found",
      replayId: params.replayId
    };
  }

  return {
    accepted: true,
    replay,
    snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()))
  };
});

app.post("/api/neuro/live/frame", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-streaming",
    "/api/neuro/live/frame",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  try {
    const payload = (request.body as LiveNeuroPayload | undefined) ?? ({} as LiveNeuroPayload);
    const result = await liveNeuroManager.ingest(payload);
    return {
      accepted: true,
      source: result.ingress,
      frame: result.frame,
      snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()))
    };
  } catch (error) {
    reply.code(400);
    return {
      error: "live_neuro_ingest_failed",
      message:
        error instanceof Error ? error.message : "Unable to ingest live neuro frame."
    };
  }
});

app.post("/api/neuro/live/:sourceId/stop", {
  preHandler: requireGovernedActionPreHandler(
    "neuro-streaming",
    "/api/neuro/live/:sourceId/stop",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const params = request.params as { sourceId?: string };
  if (!params.sourceId) {
    reply.code(400);
    return {
      error: "missing_source_id"
    };
  }

  const source = await liveNeuroManager.stop(params.sourceId);
  if (!source) {
    reply.code(404);
    return {
      error: "live_source_not_found",
      sourceId: params.sourceId
    };
  }

  return {
    accepted: true,
    source,
    snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()))
  };
});

app.post("/api/benchmarks/run", {
  preHandler: requireGovernedActionPreHandler(
    "benchmark-execution",
    "/api/benchmarks/run"
  )
}, async (request, reply) => {
  const body = (request.body as { packId?: string; publishWandb?: boolean } | undefined) ?? {};
  if (body.packId && !listBenchmarkPacks().some((pack) => pack.id === body.packId)) {
    reply.code(400);
    return {
      error: "invalid_benchmark_pack",
      supported: listBenchmarkPacks().map((pack) => pack.id)
    };
  }
  if (activeBenchmarkBacklogDepth() >= MAX_BENCHMARK_JOBS) {
    reply.code(429);
    return {
      error: "benchmark_queue_full",
      message: "Benchmark admission blocked because the benchmark backlog is saturated.",
      activeQueueDepth: activeBenchmarkBacklogDepth(),
      maxQueueDepth: MAX_BENCHMARK_JOBS,
      workGovernor: workGovernor.snapshot()
    };
  }

  const job = startBenchmarkJob({
    packId: body.packId as BenchmarkPackId | undefined,
    publishWandb: Boolean(body.publishWandb)
  });
  return {
    accepted: true,
    job
  };
});

app.post("/api/benchmarks/publish/wandb", {
  preHandler: requireGovernedActionPreHandler(
    "benchmark-publication",
    "/api/benchmarks/publish/wandb",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const body = (request.body as { suiteId?: string } | undefined) ?? {};
  const report = body.suiteId
    ? await loadPublishedBenchmarkReportBySuiteId(body.suiteId)
    : await loadPublishedBenchmarkReport();

  if (!report) {
    reply.code(404);
    return {
      error: "benchmark_not_found",
      suiteId: body.suiteId
    };
  }

  try {
    return {
      benchmark: report,
      wandb: await publishBenchmarkToWandb(report)
    };
  } catch (error) {
    reply.code(502);
    return {
      error: "wandb_publication_failed",
      message: error instanceof Error ? error.message : "Unable to publish benchmark to W&B.",
      benchmark: report
    };
  }
});

app.get("/api/topology", async () => {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const { nodeState, workers } = await listIntelligenceWorkerViewsWithOutcomes();
  return {
    profile: snapshot.profile,
    objective: snapshot.objective,
    nodes: snapshot.nodes.length,
    edges: snapshot.edges.length,
    planes: [...new Set(snapshot.nodes.map((node) => node.plane))],
    cycle: snapshot.cycle,
    lastEventId: snapshot.lastEventId,
    clusterNodes: nodeState.summary.nodeCount,
    clusterSummary: nodeState.summary,
    poiAssessmentSummary: summarizeAgentIntelligenceAssessments(
      snapshot.agentIntelligenceAssessments
    ),
    workerPlane: {
      workerCount: workers.length,
      healthyWorkerCount: workers.filter((worker) => worker.healthStatus === "healthy").length,
      staleWorkerCount: workers.filter((worker) => worker.healthStatus === "stale").length,
      faultedWorkerCount: workers.filter((worker) => worker.healthStatus === "faulted").length
    }
  };
});

app.post("/api/control", {
  preHandler: requireGovernedActionPreHandler(
    "operator-control",
    "/api/control",
    { realWorldEngagement: "required" }
  )
}, async (request, reply) => {
  const parsed = controlEnvelopeSchema.safeParse(request.body);

  if (!parsed.success) {
    reply.code(400);
    return {
      error: "invalid_control",
      details: parsed.error.flatten()
    };
  }

  return {
    accepted: true,
    snapshot: applyControl(parsed.data)
  };
});

app.get("/stream", { websocket: true }, (socket, request) => {
  clients.add(socket);
  socket.send(
    JSON.stringify({
      type: "snapshot",
      data: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot()))
    })
  );

  socket.on("message", (raw: Buffer) => {
    try {
      const decision = evaluateGovernedSocketAction(
        "operator-control",
        "/stream",
        request,
        { realWorldEngagement: "required" }
      );
      if (!decision.allowed) {
        const engagement = "engagement" in decision ? decision.engagement : undefined;
        socket.send(
          JSON.stringify({
            type: "error",
            message: engagement
              ? `Real-world engagement denied: ${decision.reason}`
              : `Governance denied: ${decision.reason}`,
            decision
          })
        );
        return;
      }

      const parsed = controlEnvelopeSchema.parse(JSON.parse(String(raw)));
      applyControl(parsed);
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Invalid control payload."
        })
      );
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
  });
});

app.get("/stream/neuro/live", { websocket: true }, (socket, request) => {
  const socketSourceIds = new Set<string>();
  const decision = evaluateGovernedSocketAction(
    "neuro-streaming",
    "/stream/neuro/live",
    request,
    { realWorldEngagement: "required" }
  );

  if (!decision.allowed) {
    const engagement = "engagement" in decision ? decision.engagement : undefined;
    socket.send(
      JSON.stringify({
        type: "error",
        message: engagement
          ? `Real-world engagement denied: ${decision.reason}`
          : `Governance denied: ${decision.reason}`,
        decision
      })
    );
    socket.close();
    return;
  }

  socket.on("message", async (raw: Buffer) => {
    try {
      const payload = JSON.parse(String(raw)) as LiveNeuroPayload;
      const result = await liveNeuroManager.ingest(payload);
      socketSourceIds.add(result.ingress.id);
      socket.send(
        JSON.stringify({
          type: "live-neuro-ack",
          data: {
            source: result.ingress,
            frame: result.frame
          }
        })
      );
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "error",
          message:
            error instanceof Error ? error.message : "Invalid live neuro payload."
        })
      );
    }
  });

  socket.on("close", () => {
    for (const sourceId of socketSourceIds) {
      void liveNeuroManager.stop(sourceId);
    }
  });
});

app.get("/stream/actuation/device", { websocket: true }, (socket, request) => {
  const route = "/stream/actuation/device";
  const params = getSearchParams(request.raw.url);
  const adapterId = params.get("adapterId")?.trim();
  const requestedSessionId = params.get("sessionId")?.trim();
  const binding = getGovernanceBinding("actuation-device-link", route, request);
  const preview = evaluateGovernance(binding);
  const decision = governance.record(binding, preview.allowed, preview.reason);

  if (!decision.allowed) {
    socket.send(
      JSON.stringify({
        type: "error",
        message: `Governance denied: ${decision.reason}`,
        decision
      })
    );
    socket.close();
    return;
  }

  if (!adapterId) {
    socket.send(
      JSON.stringify({
        type: "error",
        message: "Missing actuation adapterId query parameter."
      })
    );
    socket.close();
    return;
  }

  const scopedSessionId =
    binding.consentScope?.startsWith("session:")
      ? binding.consentScope.slice("session:".length)
      : undefined;
  if (scopedSessionId && requestedSessionId && scopedSessionId !== requestedSessionId) {
    socket.send(
      JSON.stringify({
        type: "error",
        message: "Governance denied: resource_scope_mismatch"
      })
    );
    socket.close();
    return;
  }

  const resolvedSessionId = requestedSessionId || scopedSessionId || undefined;
  const adapterState = actuationManager
    .listAdapters()
    .find((candidate) => candidate.id === adapterId);
  const protocolState = adapterState
    ? actuationManager
        .listProtocols()
        .find((candidate) => candidate.id === adapterState.protocolId)
    : undefined;
  let bridge;
  try {
    bridge = actuationManager.attachBridge({
      adapterId,
      sessionId: resolvedSessionId,
      send: (payload) => {
        socket.send(payload);
      }
    });
  } catch (error) {
    socket.send(
      JSON.stringify({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to attach actuation bridge."
      })
    );
    socket.close();
    return;
  }

  socket.send(
    JSON.stringify({
      type: "actuation-device-link-open",
      data: {
        adapterId,
        sessionId: resolvedSessionId,
        adapter: adapterState,
        protocol: protocolState,
        decision
      }
    })
  );

  socket.on("message", (raw: Buffer | string) => {
    try {
      const result = bridge.handleMessage(raw);
      if (result?.type === "hello-accepted") {
        socket.send(
          JSON.stringify({
            type: "actuation-device-ready",
            data: {
              adapterId,
              sessionId: resolvedSessionId,
              adapter: result.adapter,
              protocol: result.protocol,
              decision
            }
          })
        );
      }
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Invalid actuation bridge payload."
        })
      );
    }
  });

  socket.on("close", () => {
    bridge.detach();
  });
});

let interval: NodeJS.Timeout | null = null;

function startTicker(): void {
  if (interval) {
    return;
  }

  interval = setInterval(() => {
    engine.tick();
    void persistence.persist(engine.getDurableState());
    emitSnapshot();
  }, tickIntervalMs);
}

const close = async () => {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  await lslAdapterManager.dispose();
  await liveNeuroManager.stopAll();
  await neuroReplayManager.stopAll();
  await persistence.flush();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void close();
});

process.on("SIGTERM", () => {
  void close();
});

await appendStartupTrace("startup:app-listen:start", {
  host: HARNESS_HOST,
  port: HARNESS_PORT
});
await app.listen({
  port: HARNESS_PORT,
  host: HARNESS_HOST
});
await appendStartupTrace("startup:app-listen:complete", {
  host: HARNESS_HOST,
  port: HARNESS_PORT
});

emitHarnessStartupBanner({
  host: HARNESS_HOST,
  port: HARNESS_PORT,
  tickIntervalMs,
  ollamaUrl: LOCAL_OLLAMA_ENDPOINT,
  configuredModel: process.env.IMMACULATE_OLLAMA_MODEL
});

startTicker();

app.log.info(
  `Immaculate harness live at http://${HARNESS_HOST}:${HARNESS_PORT} with ${tickIntervalMs}ms ticks`
);
