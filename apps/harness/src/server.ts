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
  type IntelligenceLayer
} from "@immaculate/core";
import { createActuationManager } from "./actuation.js";
import {
  loadPublishedBenchmarkIndex,
  loadPublishedBenchmarkReport,
  loadPublishedBenchmarkReportBySuiteId
} from "./benchmark.js";
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
import { createNeuroReplayManager } from "./neuro-replay.js";
import { listBenchmarkPacks } from "./benchmark-packs.js";
import {
  createGovernanceRegistry,
  evaluateGovernance,
  type GovernanceAction,
  type GovernanceBinding
} from "./governance.js";
import { createPersistence } from "./persistence.js";
import { resolvePathWithinAllowedRoot } from "./utils.js";
import {
  deriveVisibilityScope,
  projectActuationOutput,
  projectCognitiveExecution,
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
  request: FastifyRequest
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

function authorizeGovernedAction(
  action: GovernanceAction,
  route: string,
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const binding = getGovernanceBinding(action, route, request);
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

function getPreferredLayer(layerId?: string): IntelligenceLayer | null {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  if (layerId) {
    return snapshot.intelligenceLayers.find((layer) => layer.id === layerId) ?? null;
  }

  const rolePriority = new Map([
    ["mid", 0],
    ["reasoner", 1],
    ["soul", 2],
    ["guard", 3]
  ]);

  return (
    [...snapshot.intelligenceLayers]
      .sort((left, right) => {
        const leftStatus = left.status === "ready" ? 0 : left.status === "busy" ? 1 : 2;
        const rightStatus = right.status === "ready" ? 0 : right.status === "busy" ? 1 : 2;
        if (leftStatus !== rightStatus) {
          return leftStatus - rightStatus;
        }
        return (rolePriority.get(left.role) ?? 9) - (rolePriority.get(right.role) ?? 9);
      })
      .at(0) ?? null
  );
}

async function ensurePreferredIntelligenceLayer(): Promise<IntelligenceLayer | null> {
  const snapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
  const existing = getPreferredLayer();
  if (existing) {
    return existing;
  }

  try {
    const discovered = await discoverPreferredOllamaLayer();
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

function createActuationOutputId(): string {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampActuationIntensity(value: number | undefined, fallback: number): number {
  const candidate = Number.isFinite(value) ? Number(value) : fallback;
  return Math.min(1, Math.max(0, candidate));
}

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
    (request.body as { role?: IntelligenceLayer["role"] } | undefined) ?? {};

  try {
    const layer = await discoverPreferredOllamaLayer(body.role ?? "mid");
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
  const body =
    (request.body as {
      sessionId?: string;
      sourceExecutionId?: string;
      sourceFrameId?: string;
      adapterId?: string;
      targetNodeId?: string;
      channel?: ActuationOutput["channel"];
      command?: string;
      intensity?: number;
      suppressed?: boolean;
    } | undefined) ?? {};
  const snapshot = engine.getSnapshot();
  const execution = body.sourceExecutionId
    ? snapshot.cognitiveExecutions.find((candidate) => candidate.id === body.sourceExecutionId)
    : snapshot.cognitiveExecutions[0];
  const frame = body.sourceFrameId
    ? snapshot.neuroFrames.find((candidate) => candidate.id === body.sourceFrameId)
    : snapshot.neuroFrames[0];

  if (body.sourceExecutionId && !execution) {
    reply.code(404);
    return {
      error: "cognitive_execution_not_found",
      sourceExecutionId: body.sourceExecutionId
    };
  }

  if (body.sourceFrameId && !frame) {
    reply.code(404);
    return {
      error: "neuro_frame_not_found",
      sourceFrameId: body.sourceFrameId
    };
  }

  const scopedSessionId =
    consentScope?.startsWith("session:") ? consentScope.slice("session:".length) : undefined;
  const resolvedSessionId =
    body.sessionId?.trim() || frame?.sessionId || scopedSessionId || undefined;
  if (scopedSessionId && resolvedSessionId && scopedSessionId !== resolvedSessionId) {
    reply.code(403);
    return {
      error: "governance_denied",
      message: "Governance denied: resource_scope_mismatch"
    };
  }

  const channel =
    body.channel ??
    (frame?.decodeReady ? "stim" : execution ? "visual" : "haptic");
  const status: ActuationOutput["status"] = body.suppressed ? "suppressed" : "dispatched";
  const command =
    body.command?.trim() ||
    (execution
      ? `execution:${execution.id}:guided-feedback`
      : frame
        ? `frame:${frame.id}:stabilize`
        : "operator:manual-feedback");
  const intensity = clampActuationIntensity(
    body.intensity,
    frame?.decodeConfidence ?? (execution ? 0.42 : 0.28)
  );
  const targetNodeId = body.targetNodeId?.trim() || "actuator-grid";
  const output: ActuationOutput = {
    id: createActuationOutputId(),
    sessionId: resolvedSessionId,
    source:
      consentScope === "system:benchmark"
        ? "benchmark"
        : execution
          ? "cognitive"
          : frame
            ? "neuro"
            : "operator",
    sourceExecutionId: execution?.id,
    sourceFrameId: frame?.id,
    targetNodeId,
    channel,
    command,
    intensity,
    status,
    summary: `Dispatch ${channel} ${status} to ${targetNodeId} at ${(intensity * 100).toFixed(1)}% intensity.`,
    generatedAt: new Date().toISOString(),
    dispatchedAt: status === "dispatched" ? new Date().toISOString() : undefined
  };

  let dispatched;
  try {
    dispatched = await actuationManager.dispatch(output, {
      adapterId: body.adapterId?.trim() || undefined
    });
  } catch (error) {
    reply.code(400);
    return {
      error: "actuation_dispatch_failed",
      message: error instanceof Error ? error.message : "Unable to dispatch actuation output."
    };
  }

  const nextSnapshot = phaseSnapshotSchema.parse(
    projectPhaseSnapshot(engine.dispatchActuationOutput(dispatched.output))
  );
  await persistence.persist(engine.getDurableState());
  emitSnapshot();

  return {
    accepted: true,
    adapter: dispatched.adapter,
    delivery: dispatched.delivery,
    output: projectActuationOutput(dispatched.output, consentScope),
    snapshot: nextSnapshot
  };
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

  const body = (request.body as { layerId?: string; objective?: string } | undefined) ?? {};
  const requestedLayer = body.layerId ? getPreferredLayer(body.layerId) : await ensurePreferredIntelligenceLayer();
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

  const busyLayer: IntelligenceLayer = {
    ...layer,
    status: "busy"
  };

  try {
    engine.registerIntelligenceLayer(busyLayer);
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    const activeSnapshot = phaseSnapshotSchema.parse(engine.getSnapshot());
    const result = await runOllamaExecution({
      snapshot: activeSnapshot,
      layer: busyLayer,
      objective: body.objective
    });
    const settledLayer: IntelligenceLayer = {
      ...busyLayer,
      status: result.execution.status === "completed" ? "ready" : "degraded"
    };

    engine.registerIntelligenceLayer(settledLayer);
    const snapshot = phaseSnapshotSchema.parse(projectPhaseSnapshot(engine.commitCognitiveExecution(result.execution)));
    await persistence.persist(engine.getDurableState());
    emitSnapshot();

    return {
      accepted: true,
      layer: settledLayer,
      execution: result.execution,
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

    reply.code(503);
    return {
      error: "cognitive_execution_failed",
      message: error instanceof Error ? error.message : "Unable to run the cognitive layer."
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
  return {
    profile: snapshot.profile,
    objective: snapshot.objective,
    nodes: snapshot.nodes.length,
    edges: snapshot.edges.length,
    planes: [...new Set(snapshot.nodes.map((node) => node.plane))],
    cycle: snapshot.cycle,
    lastEventId: snapshot.lastEventId
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

const interval = setInterval(() => {
  engine.tick();
  void persistence.persist(engine.getDurableState());
  emitSnapshot();
}, tickIntervalMs);

const close = async () => {
  clearInterval(interval);
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

app.log.info(
  `Immaculate harness live at http://${HARNESS_HOST}:${HARNESS_PORT} with ${tickIntervalMs}ms ticks`
);
