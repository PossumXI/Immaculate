import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import {
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
  type IntelligenceLayer,
  type RoutingDecision
} from "@immaculate/core";
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
  buildAgentTurn,
  buildConversationObjective,
  buildConversationRecord,
  buildSessionConversationMemory
} from "./conversation.js";
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
import {
  createLiveNeuroManager,
  type LiveNeuroPayload
} from "./live-neuro.js";
import { createLslAdapterManager } from "./lsl-adapter.js";
import { createNodeRegistry } from "./node-registry.js";
import { createNeuroReplayManager } from "./neuro-replay.js";
import { listBenchmarkPacks } from "./benchmark-packs.js";
import {
  createGovernanceRegistry,
  evaluateGovernance,
  type GovernanceAction,
  type GovernanceBinding
} from "./governance.js";
import { createPersistence } from "./persistence.js";
import {
  buildRoutingDecision,
  deriveGovernancePressure,
  planAdaptiveRoute
} from "./routing.js";
import {
  createIntelligenceWorkerRegistry,
  type IntelligenceWorkerAssignment,
  type IntelligenceWorkerExecutionProfile
} from "./workers.js";
import { hashValue, resolvePathWithinAllowedRoot } from "./utils.js";
import {
  deriveVisibilityScope,
  projectActuationOutput,
  projectCognitiveExecution,
  projectConversation,
  projectExecutionSchedule,
  projectDatasetRecord,
  projectEventEnvelope,
  projectNeuroFrameWindow,
  projectNeuroSessionRecord,
  projectPhaseSnapshot,
  redactDatasetSummary,
  redactNeuroSessionSummary
} from "./visibility.js";
import { inspectWandbStatus, publishBenchmarkToWandb } from "./wandb.js";

const app = Fastify({ logger: true });
const persistence = createPersistence(process.env.IMMACULATE_RUNTIME_DIR);
const datasetRegistry = createDatasetRegistry(persistence.getStatus().rootDir);
const neuroRegistry = createNeuroRegistry(persistence.getStatus().rootDir);
const governance = createGovernanceRegistry();
const actuationManager = await createActuationManager(persistence.getStatus().rootDir);
const intelligenceWorkerRegistry = createIntelligenceWorkerRegistry(persistence.getStatus().rootDir);
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
  localCapabilities: ["control-plane", "worker-plane", "benchmark-plane", "neuro-plane"]
});
await nodeRegistry.ensureLocalNode();
const durableState = await persistence.load();
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

const HARNESS_PORT = Number(process.env.IMMACULATE_HARNESS_PORT ?? 8787);
const HARNESS_HOST = process.env.IMMACULATE_HARNESS_HOST ?? "127.0.0.1";
const tickIntervalMs = Number(process.env.IMMACULATE_TICK_MS ?? 180);
const API_KEY = process.env.IMMACULATE_API_KEY;
const LOCAL_WORKER_ID_PREFIX =
  process.env.IMMACULATE_WORKER_ID ??
  `worker-local-${HARNESS_HOST.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "")}-${HARNESS_PORT}`;
const LOCAL_EXECUTION_WORKER_SLOT_CAP = Math.max(
  1,
  Number(process.env.IMMACULATE_LOCAL_WORKER_SLOTS ?? 4) || 4
);
const LOCAL_OLLAMA_ENDPOINT =
  process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const NODE_HEARTBEAT_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.IMMACULATE_NODE_HEARTBEAT_INTERVAL_MS ?? 15_000) || 15_000
);

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
type SessionConversationMemory = ReturnType<typeof buildSessionConversationMemory>;
type RequestedExecutionDecision = "allow_local" | "remote_required" | "preflight_blocked";
type ExecutionWorkerAssignment = IntelligenceWorkerAssignment | undefined;

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

await app.register(websocket);

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

function getGovernancePurposeValues(request: {
  headers: Record<string, string | string[] | undefined>;
  raw: { url?: string };
}): string[] | undefined {
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
  const actor =
    getHeaderValue(request.headers["x-immaculate-actor"]) ??
    searchParams.get("actor") ??
    (isLoopbackAddress(request.ip) ? `loopback:${request.ip}` : `remote:${request.ip}`);

  return {
    action,
    route,
    actor,
    policyId:
      options?.policyIdOverride ??
      getHeaderValue(request.headers["x-immaculate-policy-id"]) ??
      searchParams.get("policyId") ??
      searchParams.get("x-immaculate-policy-id") ??
      undefined,
    purpose: getGovernancePurposeValues(request),
    consentScope:
      getHeaderValue(request.headers["x-immaculate-consent-scope"]) ??
      searchParams.get("consentScope") ??
      searchParams.get("x-immaculate-consent-scope") ??
      undefined
  };
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
  }
): boolean {
  const binding = getGovernanceBinding(action, route, request, options);
  const preview = evaluateGovernance(binding);
  const decision = governance.record(binding, preview.allowed, preview.reason);
  if (decision.allowed) {
    return true;
  }

  reply.code(403).send({
    error: "governance_denied",
    message: `Governance denied: ${decision.reason}`,
    decision
  });
  return false;
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

function evaluateGovernedSocketAction(
  action: GovernanceAction,
  route: string,
  request: FastifyRequest
) {
  const binding = getGovernanceBinding(action, route, request);
  const preview = evaluateGovernance(binding);
  return governance.record(binding, preview.allowed, preview.reason);
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
  const queryToken = extractQueryToken(request.raw.url);
  return bearerToken === API_KEY || queryToken === API_KEY;
}

app.addHook("onRequest", (request, reply, done) => {
  if (
    request.method === "OPTIONS" ||
    request.raw.url?.split("?")[0] === "/api/health"
  ) {
    done();
    return;
  }

  if (isAuthorizedRequest(request)) {
    done();
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

  benchmarkJobs.set(job.id, {
    ...job,
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

  const isTsRuntime = import.meta.url.endsWith(".ts");
  const command =
    isTsRuntime && process.platform === "win32"
      ? "cmd.exe"
      : isTsRuntime
        ? "npx"
        : process.execPath;
  const args =
    isTsRuntime && process.platform === "win32"
      ? [
          "/d",
          "/s",
          "/c",
          `npx tsx ${BENCHMARK_WORKER_PATH} ${workerArgs.join(" ")}`
        ]
      : isTsRuntime
        ? ["tsx", BENCHMARK_WORKER_PATH, ...workerArgs]
        : [BENCHMARK_WORKER_PATH, ...workerArgs];

  const child = spawn(command, args, {
    cwd: path.resolve(MODULE_ROOT, ".."),
    env: process.env
  });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
  });
  child.on("error", (error: Error) => {
    benchmarkJobs.set(job.id, {
      ...benchmarkJobs.get(job.id)!,
      status: "failed",
      error: error.message,
      completedAt: new Date().toISOString()
    });
  });
  child.on("close", (code) => {
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
      preferredLayerIds: []
    });
  }
}

const DEFAULT_INTELLIGENCE_WORKER_LEASE_MS = 45_000;

async function reserveExecutionWorker(options: {
  layer: IntelligenceLayer;
  requestedExecutionDecision?: RequestedExecutionDecision;
  target?: string;
  fallbackLocalPoolSize?: number;
}): Promise<IntelligenceWorkerAssignment> {
  if (options.requestedExecutionDecision === "preflight_blocked") {
    throw new Error("Execution worker reservation blocked by preflight policy.");
  }

  const localNode = await nodeRegistry.ensureLocalNode();
  const nodeState = await nodeRegistry.listNodes();

  let result = await intelligenceWorkerRegistry.assignWorker({
    requestedExecutionDecision: options.requestedExecutionDecision ?? "allow_local",
    baseModel: options.layer.model,
    preferredLayerIds: [options.layer.id],
    recommendedLayerId: options.layer.id,
    target: options.target ?? options.layer.role,
    preferredNodeId:
      options.requestedExecutionDecision === "remote_required" ? undefined : localNode.nodeId,
    preferredLocality: localNode.locality,
    nodeViews: nodeState.nodes
  });

  if (!result.assignment && options.requestedExecutionDecision !== "remote_required") {
    await ensureLocalExecutionWorkers(options.fallbackLocalPoolSize);
    result = await intelligenceWorkerRegistry.assignWorker({
      requestedExecutionDecision: options.requestedExecutionDecision ?? "allow_local",
      baseModel: options.layer.model,
      preferredLayerIds: [options.layer.id],
      recommendedLayerId: options.layer.id,
      target: options.target ?? options.layer.role,
      preferredNodeId: localNode.nodeId,
      preferredLocality: localNode.locality,
      nodeViews: nodeState.nodes
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
}): Promise<IntelligenceWorkerAssignment[]> {
  const reservedAssignments: IntelligenceWorkerAssignment[] = [];

  try {
    for (const layer of options.layers) {
      reservedAssignments.push(
        await reserveExecutionWorker({
          layer,
          requestedExecutionDecision: options.requestedExecutionDecision,
          target: `${options.targetPrefix}:${layer.role}`,
          fallbackLocalPoolSize: options.layers.length
        })
      );
    }
    return reservedAssignments;
  } catch (error) {
    await Promise.allSettled(
      reservedAssignments.map((assignment) => releaseExecutionWorker(assignment))
    );
    app.log.warn(
      {
        requestedWidth: options.layers.length,
        releasedWidth: reservedAssignments.length,
        message: error instanceof Error ? error.message : "unknown error"
      },
      "Parallel worker batch reservation failed; released partially reserved leases."
    );
    throw error;
  }
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
    assignmentReason: options.assignment?.reason,
    assignmentScore: options.assignment?.score,
    executionEndpoint: options.executionEndpoint,
    executionTopology: options.executionTopology,
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
    [...snapshot.intelligenceLayers]
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

  return [...snapshot.intelligenceLayers]
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
      .filter((layer) => layer.role === role)
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
    const discovered = await discoverPreferredOllamaLayer(role);
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
    app.log.info(
      {
        layerId: busyLayer.id,
        role: busyLayer.role,
        workerId: options.assignment?.workerId,
        workerProfile: options.assignment?.executionProfile,
        executionEndpoint,
        governancePressure,
        deniedCount
      },
      "Executing governed cognitive pass."
    );
    const result = await runOllamaExecution({
      snapshot: activeSnapshot,
      layer: executionLayer,
      objective: options.objective,
      context: options.context,
      governancePressure,
      recentDeniedCount: deniedCount
    });
    const boundExecution = bindExecutionPlacement({
      execution: result.execution,
      assignment: options.assignment,
      sessionId: options.sessionId,
      executionEndpoint,
      executionTopology: options.executionTopology ?? "sequential"
    });
    const settledLayer: IntelligenceLayer = {
      ...busyLayer,
      status: boundExecution.status === "completed" ? "ready" : "degraded"
    };

    engine.registerIntelligenceLayer(settledLayer);
    const snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.commitCognitiveExecution(boundExecution))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      layer: settledLayer,
      execution: boundExecution,
      response: result.response,
      snapshot
    };
  } catch (error) {
    engine.registerIntelligenceLayer({
      ...busyLayer,
      status: "degraded"
    });
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
    throw error;
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
    const result = await runOllamaExecution({
      snapshot: activeSnapshot,
      layer: executionLayer,
      objective: options.objective,
      context: options.context,
      governancePressure,
      recentDeniedCount: deniedCount
    });
    const boundExecution = bindExecutionPlacement({
      execution: result.execution,
      assignment: options.assignment,
      sessionId: options.sessionId,
      executionEndpoint,
      executionTopology: options.executionTopology ?? "sequential",
      parallelBatchId: options.parallelBatchId,
      parallelBatchSize: options.parallelBatchSize,
      parallelPosition: options.parallelPosition
    });
    const settledLayer: IntelligenceLayer = {
      ...busyLayer,
      status: boundExecution.status === "completed" ? "ready" : "degraded"
    };

    engine.registerIntelligenceLayer(settledLayer);
    const snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.commitCognitiveExecution(boundExecution))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      layer: settledLayer,
      execution: boundExecution,
      response: result.response,
      snapshot
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
      parallelBatchId: options.parallelBatchId,
      parallelBatchSize: options.parallelBatchSize,
      parallelPosition: options.parallelPosition
    };
    const settledLayer: IntelligenceLayer = {
      ...busyLayer,
      status: "degraded"
    };

    engine.registerIntelligenceLayer(settledLayer);
    const snapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.commitCognitiveExecution(failedExecution))
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      layer: settledLayer,
      execution: failedExecution,
      response: failedExecution.responsePreview,
      snapshot
    };
  } finally {
    await releaseExecutionWorker(options.assignment);
  }
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
    `SWARM MODE: ${options.schedule.mode}`,
    `SWARM TOPOLOGY: ${options.schedule.executionTopology}`,
    `PARALLEL WIDTH: ${options.schedule.parallelWidth}`,
    `FORMATION: ${roleChain || "none"}`,
    `PRIMARY ROLE: ${primaryRole}`,
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
}) {
  const executions: ReturnType<typeof engine.getSnapshot>["cognitiveExecutions"] = [];
  const layers: IntelligenceLayer[] = [];
  const turns: ReturnType<typeof engine.getSnapshot>["conversations"][number]["turns"] = [];
  const responses: string[] = [];
  const baseObjective = options.objective?.trim() || options.schedule.objective;
  let latestSnapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const scheduleLayerOrder = new Map(
    options.schedule.layerIds.map((layerId, index) => [layerId, index] as const)
  );

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
  const parallelBatchId =
    parallelEligible && nonGuardLayers.length > 1
      ? `swarm-${hashValue(`${options.schedule.id}:${options.sessionId ?? "system"}:${options.schedule.selectedAt}`)}`
      : undefined;
  const sharedSwarmContext =
    parallelBatchId && nonGuardLayers.length > 1
      ? buildSwarmSharedContext({
          schedule: options.schedule,
          objective: baseObjective,
          layers: nonGuardLayers
        })
      : undefined;

  if (parallelEligible && nonGuardLayers.length > 1) {
    const reservedAssignments = await reserveExecutionWorkerBatch({
      layers: nonGuardLayers,
      requestedExecutionDecision: options.requestedExecutionDecision,
      targetPrefix: options.schedule.mode
    });
    const parallelResults = await Promise.all(
      nonGuardLayers.map(async (layer, index) => {
        const prompt = buildConversationObjective({
          baseObjective,
          role: layer.role,
          priorTurns: [],
          sharedContext: sharedSwarmContext
        });
        return executeScheduledCognitivePass({
          layer,
          objective: prompt.objective,
          context: prompt.context,
          consentScope: options.consentScope,
          sessionId: options.sessionId,
          assignment: reservedAssignments[index],
          executionTopology: options.schedule.executionTopology,
          parallelBatchId,
          parallelBatchSize: nonGuardLayers.length,
          parallelPosition: index + 1
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
          layer: result.layer
        })
      );
      latestSnapshot = result.snapshot;
    }
  } else {
    for (const layer of nonGuardLayers) {
      const assignment = await reserveExecutionWorker({
        layer,
        requestedExecutionDecision: options.requestedExecutionDecision,
        target: `${options.schedule.mode}:${layer.role}`
      });
      const prompt = buildConversationObjective({
        baseObjective,
        role: layer.role,
        priorTurns: turns,
        sharedContext: sharedSwarmContext
      });
      const result = await executeScheduledCognitivePass({
        layer,
        objective: prompt.objective,
        context: prompt.context,
        consentScope: options.consentScope,
        sessionId: options.sessionId,
        assignment,
        executionTopology: options.schedule.executionTopology
      });

      layers.push(result.layer);
      executions.push(result.execution);
      responses.push(result.response);
      turns.push(
        buildAgentTurn({
          execution: result.execution,
          layer: result.layer
        })
      );
      latestSnapshot = result.snapshot;
    }
  }

  if (guardLayer) {
    const guardAssignment = await reserveExecutionWorker({
      layer: guardLayer,
      requestedExecutionDecision: options.requestedExecutionDecision,
      target: `${options.schedule.mode}:guard`
    });
    const prompt = buildConversationObjective({
      baseObjective,
      role: guardLayer.role,
      priorTurns: turns,
      sharedContext: sharedSwarmContext
    });
    const guardResult = await executeScheduledCognitivePass({
      layer: guardLayer,
      objective: prompt.objective,
      context: prompt.context,
      consentScope: options.consentScope,
      sessionId: options.sessionId,
      assignment: guardAssignment,
      executionTopology: options.schedule.executionTopology
    });

    layers.push(guardResult.layer);
    executions.push(guardResult.execution);
    responses.push(guardResult.response);
    turns.push(
      buildAgentTurn({
        execution: guardResult.execution,
        layer: guardResult.layer
      })
    );
    latestSnapshot = guardResult.snapshot;
  }

  const conversation =
    turns.length > 0
      ? buildConversationRecord({
          sessionId: options.sessionId,
          arbitrationId: options.arbitrationId,
          schedule: options.schedule,
          turns
        })
      : undefined;

  if (conversation) {
    latestSnapshot = phaseSnapshotSchema.parse(
      projectPhaseSnapshot(engine.recordConversation(conversation), options.consentScope)
    );
    await persistence.persist(engine.getDurableState());
    emitSnapshot();
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
  const routePlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: options.frame,
    execution: options.execution,
    cognitiveRouteSuggestion: options.execution?.routeSuggestion,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: governance.getStatus(),
    governanceDecisions: governance.listDecisions(),
    consentScope: options.consentScope,
    requestedAdapterId: options.body.adapterId?.trim() || undefined,
    requestedChannel: options.body.channel,
    requestedTargetNodeId: options.body.targetNodeId?.trim() || undefined,
    requestedIntensity:
      typeof options.body.intensity === "number" ? Number(options.body.intensity) : undefined,
    suppressed: options.body.suppressed
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

await ensureLocalExecutionWorkers();
await ensurePreferredIntelligenceLayer();

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
await persistence.persist(engine.getDurableState());

app.get("/api/health", async () => ({
  status: "ok",
  service: "immaculate-harness",
  timestamp: new Date().toISOString(),
  clients: clients.size,
  recovered: persistence.getStatus().recovered,
  recoveryMode: persistence.getStatus().recoveryMode,
  persistedEventCount: persistence.getStatus().persistedEventCount,
  integrityStatus: persistence.getStatus().integrityStatus,
  integrityFindingCount: persistence.getStatus().integrityFindingCount,
  governanceMode: governance.getStatus().mode,
  governanceDeniedCount: governance.getStatus().deniedCount
}));

app.get("/api/snapshot", async () => ({
  snapshot: phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.getSnapshot())),
  redacted: true
}));

app.get("/api/history", async () => ({
  history: engine.getHistory().map((point) => snapshotHistoryPointSchema.parse(point))
}));

app.get("/api/events", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "event-read",
      "/api/events",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/replay", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "event-read",
      "/api/replay",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/persistence", async () => ({
  persistence: persistence.getStatus()
}));

app.get("/api/integrity", async () => ({
  integrity: inspectDurableState(engine.getDurableState())
}));

app.get("/api/checkpoints", async () => ({
  checkpoints: persistence.listCheckpoints()
}));

app.get("/api/governance/status", async () => ({
  governance: governance.getStatus()
}));

app.get("/api/governance/policies", async () => ({
  policies: governance.listPolicies()
}));

app.get("/api/governance/decisions", async () => ({
  decisions: governance.listDecisions()
}));

app.get("/api/benchmarks/latest", async () => ({
  benchmark: await loadPublishedBenchmarkReport()
}));

app.get("/api/benchmarks/history", async () => ({
  history: await loadPublishedBenchmarkIndex()
}));

app.get("/api/benchmarks/trend", async (request, reply) => {
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

app.get("/api/benchmarks/jobs/:jobId", async (request, reply) => {
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

app.get("/api/benchmarks/packs", async () => ({
  packs: listBenchmarkPacks()
}));

app.get("/api/wandb/status", async () => ({
  wandb: await inspectWandbStatus()
}));

app.get("/api/datasets", async () => ({
  datasets: (await datasetRegistry.list()).map(redactDatasetSummary),
  redacted: true
}));

app.get("/api/datasets/:datasetId", async (request, reply) => {
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

app.get("/api/neuro/sessions", async () => ({
  sessions: (await neuroRegistry.list()).map(redactNeuroSessionSummary),
  redacted: true
}));

app.get("/api/neuro/sessions/:sessionId", async (request, reply) => {
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

app.get("/api/devices/lsl/streams", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-streaming",
      "/api/devices/lsl/streams",
      request,
      reply
    )
  ) {
    return;
  }

  const discovery = await lslAdapterManager.discover();
  return {
    accepted: true,
    ...discovery,
    connections: lslAdapterManager.listConnections()
  };
});

app.get("/api/devices/lsl/connections", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-streaming",
      "/api/devices/lsl/connections",
      request,
      reply
    )
  ) {
    return;
  }

  return {
    accepted: true,
    connections: lslAdapterManager.listConnections(),
    sources: liveNeuroManager.list()
  };
});

app.post("/api/devices/lsl/connect", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-streaming",
      "/api/devices/lsl/connect",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/devices/lsl/:sourceId/stop", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-streaming",
      "/api/devices/lsl/:sourceId/stop",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/neuro/frames", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-feature-read",
      "/api/neuro/frames",
      request,
      reply
    )
  ) {
    return;
  }

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
    conversations: snapshot.conversations,
    schedules: snapshot.executionSchedules,
    recommendedLayerId: getPreferredLayer()?.id,
    visibility: "redacted"
  };
});

app.get("/api/intelligence/executions", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-trace-read",
      "/api/intelligence/executions",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/nodes", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-trace-read",
      "/api/nodes",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/intelligence/workers", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-trace-read",
      "/api/intelligence/workers",
      request,
      reply
    )
  ) {
    return;
  }

  const consentScope = getGovernanceBinding(
    "cognitive-trace-read",
    "/api/intelligence/workers",
    request
  ).consentScope;
  const nodeState = await nodeRegistry.listNodes();
  const workers = await intelligenceWorkerRegistry.listWorkers(undefined, nodeState.nodes);
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

app.get("/api/intelligence/arbitrations", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-trace-read",
      "/api/intelligence/arbitrations",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/intelligence/schedules", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-trace-read",
      "/api/intelligence/schedules",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/intelligence/conversations", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-trace-read",
      "/api/intelligence/conversations",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/actuation/outputs", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-read",
      "/api/actuation/outputs",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/actuation/transports", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-read",
      "/api/actuation/transports",
      request,
      reply
    )
  ) {
    return;
  }

  return {
    transports: actuationManager.listTransports(),
    visibility: deriveVisibilityScope(
      getGovernanceBinding("actuation-read", "/api/actuation/transports", request).consentScope
    )
  };
});

app.get("/api/actuation/deliveries", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-read",
      "/api/actuation/deliveries",
      request,
      reply
    )
  ) {
    return;
  }

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

app.get("/api/intelligence/ollama/models", async (request, reply) => {
  try {
    const models = await listOllamaModels();
    return {
      models
    };
  } catch (error) {
    reply.code(503);
    return {
      error: "ollama_unavailable",
      message: error instanceof Error ? error.message : "Ollama is unavailable."
    };
  }
});

app.post("/api/intelligence/ollama/register", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-registration",
      "/api/intelligence/ollama/register",
      request,
      reply
    )
  ) {
    return;
  }

  const body =
    (request.body as { role?: IntelligenceLayer["role"]; model?: string } | undefined) ?? {};

  try {
    const layer = await discoverPreferredOllamaLayer(
      body.role ?? "mid",
      undefined,
      body.model?.trim() || undefined
    );
    if (!layer) {
      reply.code(404);
      return {
        error: "no_local_ollama_models"
      };
    }

    const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.registerIntelligenceLayer(layer)));
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      accepted: true,
      layer,
      snapshot
    };
  } catch (error) {
    reply.code(503);
    return {
      error: "ollama_registration_failed",
      message: error instanceof Error ? error.message : "Unable to register Ollama layer."
    };
  }
});

app.post("/api/intelligence/workers/register", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-registration",
      "/api/intelligence/workers/register",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/intelligence/workers/:workerId/heartbeat", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-registration",
      "/api/intelligence/workers/:workerId/heartbeat",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/intelligence/workers/:workerId/unregister", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-registration",
      "/api/intelligence/workers/:workerId/unregister",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/intelligence/workers/assign", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-execution",
      "/api/intelligence/workers/assign",
      request,
      reply
    )
  ) {
    return;
  }

  const body =
    (request.body as {
      requestedExecutionDecision?: "allow_local" | "remote_required" | "preflight_blocked";
      baseModel?: string;
      preferredLayerIds?: string[];
      recommendedLayerId?: string;
      target?: string;
      preferredNodeId?: string;
      preferredLocality?: string;
    } | undefined) ?? {};

  const recommendedLayerId = body.recommendedLayerId?.trim() || getPreferredLayer()?.id;
  const localNode = await nodeRegistry.ensureLocalNode();
  const nodeState = await nodeRegistry.listNodes();
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
    nodeViews: nodeState.nodes
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

app.post("/api/nodes/register", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-registration",
      "/api/nodes/register",
      request,
      reply
    )
  ) {
    return;
  }

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
    } | undefined) ?? {};

  if (!body.nodeId?.trim() || !body.locality?.trim()) {
    reply.code(400);
    return {
      error: "invalid_node_registration",
      message: "nodeId and locality are required."
    };
  }

  try {
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
      isLocal: body.isLocal === true
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

app.post("/api/nodes/:nodeId/heartbeat", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-registration",
      "/api/nodes/:nodeId/heartbeat",
      request,
      reply
    )
  ) {
    return;
  }

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
    } | undefined) ?? {};

  if (!params.nodeId?.trim()) {
    reply.code(400);
    return {
      error: "missing_node_id"
    };
  }

  try {
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
      capabilities: Array.isArray(body.capabilities) ? body.capabilities : undefined
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

app.delete("/api/nodes/:nodeId", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-registration",
      "/api/nodes/:nodeId",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/actuation/dispatch", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-dispatch",
      "/api/actuation/dispatch",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/actuation/transports/udp/register", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-device-link",
      "/api/actuation/transports/udp/register",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/actuation/transports/serial/register", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-device-link",
      "/api/actuation/transports/serial/register",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/actuation/transports/http2/register", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-device-link",
      "/api/actuation/transports/http2/register",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/actuation/transports/:transportId/heartbeat", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-device-link",
      "/api/actuation/transports/:transportId/heartbeat",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/actuation/transports/:transportId/reset", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-device-link",
      "/api/actuation/transports/:transportId/reset",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/ingest/bids/scan", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "dataset-ingestion",
      "/api/ingest/bids/scan",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/intelligence/run", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "cognitive-execution",
      "/api/intelligence/run",
      request,
      reply
    )
  ) {
    return;
  }

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
      message: "Register an Ollama layer before running a cognitive pass."
    };
  }

  try {
    const assignment = await reserveExecutionWorker({
      layer,
      requestedExecutionDecision: body.requestedExecutionDecision,
      target: "single-layer"
    });
    const result = await executeCognitivePass({
      layer,
      objective: body.objective,
      consentScope,
      sessionId: resolvedSessionId,
      assignment,
      executionTopology: "sequential"
    });

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

app.post("/api/orchestration/mediate", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "actuation-dispatch",
      "/api/orchestration/mediate",
      request,
      reply
    )
  ) {
    return;
  }

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

  const arbitrationPlan = planExecutionArbitration({
    snapshot,
    frame,
    execution,
    governanceStatus: governance.getStatus(),
    governanceDecisions: governance.listDecisions(),
    consentScope,
    objective: body.objective,
    requestedLayerId: body.layerId?.trim() || undefined,
    forceCognition: body.forceCognition,
    suppressed: body.suppressed,
    sessionConversationMemory
  });
  const arbitrationDecision = buildExecutionArbitrationDecision({
    plan: arbitrationPlan,
    consentScope,
    frame,
    execution,
    requestedLayerId: body.layerId?.trim() || undefined
  });
  const arbitrationSnapshot = phaseSnapshotSchema.parse(
    projectPhaseSnapshot(engine.recordExecutionArbitration(arbitrationDecision))
  );
  await persistence.persist(engine.getDurableState());
  emitSnapshot();

  if (arbitrationPlan.shouldRunCognition) {
    if (
      !authorizeGovernedAction(
        "cognitive-execution",
        "/api/orchestration/mediate:cognition",
        request,
        reply,
        {
          policyIdOverride: "cognitive-run-default"
        }
      )
    ) {
      return;
    }

    const rolesToEnsure = preferredScheduleRoles(arbitrationDecision);
    if (rolesToEnsure.length > 0) {
      await ensurePreferredIntelligenceLayers(rolesToEnsure);
    }
  }

  const schedulePlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: arbitrationDecision,
    requestedLayerId: body.layerId?.trim() || undefined,
    sessionConversationMemory
  });
  const scheduleDecision = buildExecutionScheduleDecision({
    arbitration: arbitrationDecision,
    plan: schedulePlan
  });
  const scheduleSnapshot = phaseSnapshotSchema.parse(
    projectPhaseSnapshot(engine.recordExecutionSchedule(scheduleDecision))
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

  if (scheduleDecision.shouldRunCognition) {
    if (scheduleDecision.layerIds.length === 0) {
      reply.code(404);
      return {
        error: "no_intelligence_layer",
        message: "Register an Ollama layer before running the mediated cognitive schedule.",
        arbitrationDecision,
        arbitrationPlan,
        scheduleDecision,
        schedulePlan,
        snapshot: scheduleSnapshot
      };
    }

    try {
      const cognition = await executeCognitiveSchedule({
        schedule: scheduleDecision,
        objective: scheduleDecision.objective,
        consentScope,
        sessionId: resolvedSessionId,
        arbitrationId: arbitrationDecision.id,
        requestedExecutionDecision: body.requestedExecutionDecision
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
        arbitrationDecision,
        arbitrationPlan,
        scheduleDecision,
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
  const routePreview = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame,
    execution: mediationExecution,
    cognitiveRouteSuggestion: mediationExecution?.routeSuggestion,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: governance.getStatus(),
    governanceDecisions: governance.listDecisions(),
    consentScope,
    requestedAdapterId: body.adapterId?.trim() || undefined,
    requestedChannel: body.channel,
    requestedTargetNodeId: body.targetNodeId?.trim() || undefined,
    requestedIntensity:
      typeof body.intensity === "number" ? Number(body.intensity) : undefined,
    suppressed:
      !arbitrationPlan.shouldDispatchActuation || !guardAllowsDispatch
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
      arbitrationDecision,
      arbitrationPlan,
      scheduleDecision,
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
      arbitrationDecision,
      arbitrationPlan,
      scheduleDecision,
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
      arbitrationDecision,
      arbitrationPlan,
      scheduleDecision,
      schedulePlan,
      snapshot: cognitionSnapshot
    };
  }
});

app.post("/api/ingest/nwb/scan", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-session-ingestion",
      "/api/ingest/nwb/scan",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/neuro/replays/start", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-replay",
      "/api/neuro/replays/start",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/neuro/replays/:replayId/stop", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-replay",
      "/api/neuro/replays/:replayId/stop",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/neuro/live/frame", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-streaming",
      "/api/neuro/live/frame",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/neuro/live/:sourceId/stop", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "neuro-streaming",
      "/api/neuro/live/:sourceId/stop",
      request,
      reply
    )
  ) {
    return;
  }

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

app.post("/api/benchmarks/run", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "benchmark-execution",
      "/api/benchmarks/run",
      request,
      reply
    )
  ) {
    return;
  }

  const body = (request.body as { packId?: string; publishWandb?: boolean } | undefined) ?? {};
  if (body.packId && !listBenchmarkPacks().some((pack) => pack.id === body.packId)) {
    reply.code(400);
    return {
      error: "invalid_benchmark_pack",
      supported: listBenchmarkPacks().map((pack) => pack.id)
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

app.post("/api/benchmarks/publish/wandb", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "benchmark-publication",
      "/api/benchmarks/publish/wandb",
      request,
      reply
    )
  ) {
    return;
  }

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
  const nodeState = await nodeRegistry.listNodes();
  const workers = await intelligenceWorkerRegistry.listWorkers(undefined, nodeState.nodes);
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
    workerPlane: {
      workerCount: workers.length,
      healthyWorkerCount: workers.filter((worker) => worker.healthStatus === "healthy").length,
      staleWorkerCount: workers.filter((worker) => worker.healthStatus === "stale").length,
      faultedWorkerCount: workers.filter((worker) => worker.healthStatus === "faulted").length
    }
  };
});

app.post("/api/control", async (request, reply) => {
  if (
    !authorizeGovernedAction(
      "operator-control",
      "/api/control",
      request,
      reply
    )
  ) {
    return;
  }

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
        request
      );
      if (!decision.allowed) {
        socket.send(
          JSON.stringify({
            type: "error",
            message: `Governance denied: ${decision.reason}`,
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
    request
  );

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

await app.listen({
  port: HARNESS_PORT,
  host: HARNESS_HOST
});

startTicker();

app.log.info(
  `Immaculate harness live at http://${HARNESS_HOST}:${HARNESS_PORT} with ${tickIntervalMs}ms ticks`
);
