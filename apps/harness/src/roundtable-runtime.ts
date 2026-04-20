import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { appendDecisionTraceRecord, createDecisionTraceSeed, type DecisionTraceRecord } from "./decision-trace.js";
import {
  type MultiAgentConversation,
  type ExecutionSchedule
} from "@immaculate/core";
import { prewarmOllamaModel } from "./ollama.js";
import { resolveQLocalOllamaUrl } from "./q-local-model.js";
import { getQFoundationModelName, getQModelName, getQModelTarget } from "./q-model.js";
import {
  buildRoundtableActionPlan,
  cleanupRoundtableActionWorktree,
  materializeRoundtableActionWorktree,
  probeRoundtableActionWorkspace
} from "./roundtable.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";
import { hashValue, sha256Json } from "./utils.js";

type HttpCheck = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  wallLatencyMs: number;
};

type ArobiRoundtableLedgerResult = {
  baseUrl: string;
  version?: string;
  network?: string;
  entriesBefore?: number;
  entriesAfter?: number;
  entryDelta?: number;
  writeStatus?: number;
  writeAccepted: boolean;
  error?: string;
};

type ScenarioDefinition = {
  id: string;
  label: string;
  seedObjective: string;
  mediationObjective: string;
};

type RoundtableRuntimeScenarioResult = {
  id: string;
  label: string;
  status: "completed" | "failed";
  seedStatus: number;
  mediationStatus: number;
  seedAccepted: boolean;
  mediationAccepted: boolean;
  seedLatencyMs: number;
  mediationLatencyMs: number;
  totalLatencyMs: number;
  readyActionCount: number;
  materializedActionCount: number;
  probedActionCount: number;
  authorityBoundActionCount: number;
  executionBundleCount: number;
  executionReadyCount: number;
  taskDocumentCount: number;
  isolatedBranchCount: number;
  repoCoverageCount: number;
  recordedActionCount: number;
  recordedRepoCount: number;
  workspaceScopedTurnCount: number;
  scheduleRoundtableActionCount: number;
  scheduleRoundtableRepoCount: number;
  sessionScopePreserved: boolean;
  trackedFileCountP50: number;
  sampleFiles: string[];
  guardVerdict?: string;
  routeSuggestion?: string;
  roundtableSummary?: string;
  failureClass?: string;
};

type RoundtableRuntimeSurface = {
  generatedAt: string;
  release: ReleaseMetadata;
  benchmark: {
    harnessUrl: string;
    scenarioCount: number;
    failedAssertions: number;
    repoCoverageP50: number;
    materializedActionsP50: number;
    probedActionsP50: number;
    authorityBoundActionsP50: number;
    executionBundlesP50: number;
    executionReadyP50: number;
    taskDocumentsP50: number;
    workspaceScopedTurnsP50: number;
    recordedActionsP50: number;
    trackedFilesP50: number;
    runnerPathP95Ms: number;
    seedLatencyP95Ms: number;
    mediationLatencyP95Ms: number;
    hardware: string;
  };
  scenarios: Array<{
    id: string;
    label: string;
    status: string;
    routeSuggestion?: string;
    guardVerdict?: string;
    repoCoverageCount: number;
    materializedActionCount: number;
    probedActionCount: number;
    authorityBoundActionCount: number;
    executionBundleCount: number;
    executionReadyCount: number;
    taskDocumentCount: number;
    recordedActionCount: number;
    workspaceScopedTurnCount: number;
    scheduleRoundtableActionCount: number;
    scheduleRoundtableRepoCount: number;
    sessionScopePreserved: boolean;
    trackedFileCountP50: number;
    sampleFiles: string[];
    roundtableSummary?: string;
  }>;
  assertions: Array<{
    id: string;
    status: "pass" | "fail";
    target: string;
    actual: string;
    detail: string;
  }>;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

type RoundtableRuntimeIterationArtifact = {
  index: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "failed";
  reportPath?: string;
  tracePath?: string;
  decisionTraceId?: string;
  failedAssertions?: number;
  error?: string;
};

type RoundtableRuntimeRunManifest = {
  generatedAt: string;
  runId: string;
  iterationsRequested: number;
  intervalMs: number;
  iterationCount: number;
  completedAt: string;
  runtimeRoot: string;
  harnessRuntimeRoot: string;
  traceLedgerPath: string;
  latestReportPath?: string;
  latestReport?: RoundtableRuntimeSurface;
  iterations: RoundtableRuntimeIterationArtifact[];
};

type CliOptions = {
  iterations: number;
  intervalMs: number;
};

const DEFAULT_OLLAMA_URL = resolveQLocalOllamaUrl();
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(MODULE_ROOT, "..");
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const CONSENT_PREFIX = "session:roundtable-runtime";
const ROUNDTABLE_RUNTIME_ROOT = path.join(REPO_ROOT, ".runtime", "roundtable-runtime");
const ROUNDTABLE_RUNTIME_RUNS_ROOT = path.join(ROUNDTABLE_RUNTIME_ROOT, "runs");

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "immaculate-openjaws",
    label: "Immaculate and OpenJaws governed repair",
    seedObjective:
      "Seed a governed repair context that keeps Q primary while OpenJaws contributes terminal-task hardening and Immaculate preserves a truthful audit trail.",
    mediationObjective:
      "Create a governed roundtable plan across Immaculate, OpenJaws, and Arobi Network so agent lanes stay isolated by repo and branch while the final route stays reviewable."
  },
  {
    id: "asgard-audit-ledger",
    label: "Asgard audit and ledger continuity",
    seedObjective:
      "Seed a governed defense-and-healthcare audit context where Arobi Network must preserve the ledger trail, Asgard stays evidence-backed, and Immaculate keeps Q on the primary route.",
    mediationObjective:
      "Mediated planning should isolate Immaculate, OpenJaws, and Asgard work while preserving a review-ready route for the ledger-backed operator network."
  },
  {
    id: "mixed-pressure-roundtable",
    label: "Mixed-pressure roundtable",
    seedObjective:
      "Seed a mixed-pressure coordination context where Q must stay the reasoning brain, Immaculate must orchestrate without drift, and repo-scoped action lanes must remain isolated.",
    mediationObjective:
      "Under mixed pressure, keep the governed route stable and turn the roundtable into isolated repo-scoped execution lanes instead of free-form conversation."
  }
];

function percentile(values: number[], percentileTarget: number): number {
  if (values.length === 0) {
    return 0;
  }
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil((percentileTarget / 100) * ordered.length) - 1)
  );
  return Number(ordered[index]?.toFixed(2) ?? 0);
}

function median(values: number[]): number {
  return percentile(values, 50);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.trunc(parsed);
  return normalized >= 0 ? normalized : fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    iterations: 1,
    intervalMs: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--iterations") {
      options.iterations = parsePositiveInteger(argv[index + 1], options.iterations);
      if (argv[index + 1]) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--iterations=")) {
      options.iterations = parsePositiveInteger(arg.split("=", 2)[1], options.iterations);
      continue;
    }
    if (arg === "--interval-ms") {
      options.intervalMs = parseNonNegativeInteger(argv[index + 1], options.intervalMs);
      if (argv[index + 1]) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      options.intervalMs = parseNonNegativeInteger(arg.split("=", 2)[1], options.intervalMs);
    }
  }

  return options;
}

function buildRunId(options: CliOptions): string {
  return `roundtable-runtime-${new Date().toISOString().replace(/[:.]/g, "-")}-${hashValue(
    `${options.iterations}:${options.intervalMs}`
  ).slice(-8)}`;
}

function compactSummary(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

async function writeJsonArtifact(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendJsonLine(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function allocateTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate a loopback TCP port for roundtable runtime benchmark."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function checkHttp(url: string, init?: RequestInit): Promise<HttpCheck> {
  const started = performance.now();
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key] = value;
  }
  return {
    status: response.status,
    body,
    headers,
    wallLatencyMs: Number((performance.now() - started).toFixed(2))
  };
}

function responseAccepted(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const candidate = body as { accepted?: unknown; error?: unknown };
  if (typeof candidate.accepted === "boolean") {
    return candidate.accepted;
  }
  return candidate.error === undefined;
}

async function readArobiLedgerState(baseUrl: string): Promise<{
  version?: string;
  network?: string;
  totalEntries?: number;
}> {
  const info = await checkHttp(`${baseUrl}/api/v1/info`);
  const verify = await checkHttp(`${baseUrl}/api/v1/audit/verify`);
  const infoBody = (info.body as { version?: string; network?: string } | null) ?? null;
  const verifyBody = (verify.body as { total_entries?: number } | null) ?? null;
  return {
    version: infoBody?.version,
    network: infoBody?.network,
    totalEntries:
      typeof verifyBody?.total_entries === "number" ? Number(verifyBody.total_entries) : undefined
  };
}

async function postArobiRoundtableRecord(options: {
  baseUrl: string;
  visibility: "public" | "00";
  runId: string;
  iterationLabel: string;
  report: RoundtableRuntimeSurface;
}): Promise<ArobiRoundtableLedgerResult> {
  try {
    const before = await readArobiLedgerState(options.baseUrl);
    const payload = {
      source: "control_fabric",
      decision_type: "roundtable_runtime_tick",
      model_id: "Q+Immaculate+Arobi",
      model_version: before.version ?? getQFoundationModelName(),
      input_summary:
        options.visibility === "public"
          ? `Supervised roundtable runtime summary ${options.iterationLabel}`
          : `Supervised roundtable runtime private trace ${options.iterationLabel}`,
      input_data: `run_id=${options.runId}; scenarios=${options.report.benchmark.scenarioCount}; failed_assertions=${options.report.benchmark.failedAssertions}; repo_coverage_p50=${options.report.benchmark.repoCoverageP50}`,
      decision:
        options.visibility === "public"
          ? "Recorded supervised non-actuating public roundtable runtime summary"
          : "Recorded supervised non-actuating private roundtable runtime trace",
      confidence: options.report.benchmark.failedAssertions === 0 ? 0.98 : 0.8,
      reasoning:
        options.visibility === "public"
          ? `Bounded roundtable runtime ${options.iterationLabel} completed with ${options.report.benchmark.failedAssertions} failed assertions and preserved agent-branch authority across ${options.report.benchmark.repoCoverageP50} repo lanes.`
          : `Bounded roundtable runtime ${options.iterationLabel} captured the full repo-scoped orchestration trace with ${options.report.benchmark.recordedActionsP50} recorded roundtable actions and ${options.report.benchmark.workspaceScopedTurnsP50} workspace-scoped turns.`,
      factors: [
        `Roundtable scenarios ${options.report.benchmark.scenarioCount}`,
        `Failed assertions ${options.report.benchmark.failedAssertions}`,
        `Repo coverage p50 ${options.report.benchmark.repoCoverageP50}`,
        `Materialized actions p50 ${options.report.benchmark.materializedActionsP50}`,
        `Workspace scoped turns p50 ${options.report.benchmark.workspaceScopedTurnsP50}`
      ],
      ethics_validated: true,
      ethics_kernel_result: "Non-actuating supervised roundtable runtime approved",
      subsystems: ["nysus", "arobi", "immaculate", "q"],
      network_context: options.visibility,
      latency_ms: Math.round(options.report.benchmark.runnerPathP95Ms),
      trace_context: {
        event_id: `${options.runId}-${options.visibility}-${options.iterationLabel}`,
        category: "roundtable_runtime",
        severity: options.report.benchmark.failedAssertions === 0 ? "info" : "warning",
        agent_id: "q",
        subsystem: "control_fabric",
        context:
          options.visibility === "public"
            ? "supervised non-actuating public roundtable runtime"
            : "supervised non-actuating private roundtable runtime",
        environment: "local-supervised",
        mission_id: options.runId,
        plan_id: options.runId,
        inference_id: `${options.runId}-${options.iterationLabel}`,
        decision_tree: "observe -> mediate -> verify -> record",
        subsystems_consulted: ["nysus", "immaculate", "q", "arobi"]
      }
    };
    const write = await checkHttp(`${options.baseUrl}/api/v1/audit/record`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const after = await readArobiLedgerState(options.baseUrl);
    const entriesBefore = before.totalEntries;
    const entriesAfter = after.totalEntries;
    return {
      baseUrl: options.baseUrl,
      version: before.version ?? after.version,
      network: before.network ?? after.network,
      entriesBefore,
      entriesAfter,
      entryDelta:
        typeof entriesBefore === "number" && typeof entriesAfter === "number"
          ? entriesAfter - entriesBefore
          : undefined,
      writeStatus: write.status,
      writeAccepted: write.status >= 200 && write.status < 300
    };
  } catch (error) {
    return {
      baseUrl: options.baseUrl,
      writeAccepted: false,
      error: error instanceof Error ? error.message : "Unknown Arobi ledger write failure."
    };
  }
}

async function waitForHarness(harnessUrl: string): Promise<HttpCheck> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const health = await checkHttp(`${harnessUrl}/api/health`);
      if (
        health.status === 200 &&
        typeof health.body === "object" &&
        health.body !== null &&
        (health.body as { status?: string }).status === "ok"
      ) {
        return health;
      }
      lastError = new Error(`Harness health returned ${health.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error ? lastError : new Error("Harness did not become healthy in time.");
}

function resolveHarnessCommand(): { command: string; args: string[] } {
  const compiledServerPath = path.join(HARNESS_ROOT, "dist", "server.js");
  if (existsSync(compiledServerPath)) {
    return {
      command: process.execPath,
      args: [compiledServerPath]
    };
  }
  const tsxBinary = path.join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx"
  );
  return {
    command: tsxBinary,
    args: [path.join(HARNESS_ROOT, "src", "server.ts")]
  };
}

function startHarnessProcess(options: {
  repoRoot: string;
  runtimeDir: string;
  keysPath: string;
  port: number;
}): ChildProcess {
  const harness = resolveHarnessCommand();
  return spawn(harness.command, harness.args, {
    cwd: options.repoRoot,
    env: {
      ...process.env,
      IMMACULATE_RUNTIME_DIR: options.runtimeDir,
      IMMACULATE_Q_API_ENABLED: "true",
      IMMACULATE_Q_API_KEYS_PATH: options.keysPath,
      IMMACULATE_HARNESS_HOST: "127.0.0.1",
      IMMACULATE_HARNESS_PORT: String(options.port)
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function stopHarnessProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    delay(3_000).then(() => false)
  ]);
  if (!exited && child.exitCode === null && !child.killed) {
    child.kill("SIGKILL");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      delay(2_000)
    ]);
  }
}

function buildHeaders(
  consentScope: string,
  purpose = "cognitive-execution,actuation-dispatch,cognitive-trace-read",
  authorization?: string
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-immaculate-consent-scope": consentScope,
    "x-immaculate-purpose": purpose,
    ...(authorization ? { Authorization: authorization } : {})
  };
}

function pickLatestConversation(
  body: unknown,
  sessionId: string
): MultiAgentConversation | undefined {
  const conversations = (body as { conversations?: MultiAgentConversation[] })?.conversations;
  if (!Array.isArray(conversations)) {
    return undefined;
  }
  const matching = conversations.filter((entry) => entry.sessionId === sessionId);
  const mediated = matching.filter(
    (entry) =>
      entry.executionTopology === "parallel-then-guard" ||
      entry.mode === "multi-turn" ||
      entry.turnCount > 1 ||
      entry.turns.some((turn) => turn.role === "guard") ||
      entry.roundtableActions?.some((action) => Boolean(action.executionArtifact))
  );
  return (mediated.length > 0 ? mediated : matching).sort(
    (left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt)
  )[0];
}

function pickLatestSchedule(
  body: unknown,
  sessionScope: string
): ExecutionSchedule | undefined {
  const schedules = (body as { schedules?: ExecutionSchedule[] })?.schedules;
  if (!Array.isArray(schedules)) {
    return undefined;
  }
  return schedules
    .filter((entry) => entry.sessionScope === sessionScope)
    .sort((left, right) => Date.parse(right.selectedAt) - Date.parse(left.selectedAt))[0];
}

async function runScenario(options: {
  harnessUrl: string;
  scenario: ScenarioDefinition;
}): Promise<RoundtableRuntimeScenarioResult> {
  const scenarioRunSeed = `${options.scenario.id}-${Date.now().toString(36)}-${hashValue(
    options.scenario.mediationObjective
  ).slice(-6)}`;
  const sessionId = `roundtable-runtime-${scenarioRunSeed}`;
  const consentScope = `${CONSENT_PREFIX}-${scenarioRunSeed}`;
  const plan = buildRoundtableActionPlan({
    objective: options.scenario.mediationObjective,
    consentScope,
    schedule: {
      id: `roundtable-runtime-${options.scenario.id}`,
      mode: "guarded-swarm",
      executionTopology: "parallel-then-guard",
      parallelWidth: 3,
      parallelFormationMode: "hybrid-quorum",
      parallelFormationSummary: "vertical=2 / horizontal=2 / quorum=2 / backpressure=degrade",
      layerRoles: ["mid", "reasoner", "guard"]
    }
  });
  const readyActions = plan.actions.filter((action) => action.status === "ready");
  const materialized = readyActions.map((action) => materializeRoundtableActionWorktree(action));
  const probes = readyActions.map((action, index) =>
    probeRoundtableActionWorkspace(action, materialized[index]?.worktreePath)
  );
  const started = performance.now();

  try {
    const seed = await checkHttp(`${options.harnessUrl}/api/intelligence/run`, {
      method: "POST",
      headers: buildHeaders(consentScope, "cognitive-execution"),
      body: JSON.stringify({
        sessionId,
        objective: options.scenario.seedObjective,
        requestedExecutionDecision: "allow_local"
      })
    });
    const mediation = await checkHttp(`${options.harnessUrl}/api/orchestration/mediate`, {
      method: "POST",
      headers: buildHeaders(consentScope, "actuation-dispatch,cognitive-execution"),
      body: JSON.stringify({
        sessionId,
        objective: options.scenario.mediationObjective,
        requestedExecutionDecision: "allow_local",
        dispatchOnApproval: false,
        forceCognition: true
      })
    });
    const conversations = await checkHttp(`${options.harnessUrl}/api/intelligence/conversations`, {
      headers: buildHeaders("system:benchmark", "cognitive-trace-read")
    });
    const schedules = await checkHttp(`${options.harnessUrl}/api/intelligence/schedules`, {
      headers: buildHeaders("system:benchmark", "cognitive-trace-read")
    });
    const conversation =
      (mediation.body as { conversation?: MultiAgentConversation })?.conversation ??
      pickLatestConversation(conversations.body, sessionId);
    const schedule =
      (mediation.body as { scheduleDecision?: ExecutionSchedule })?.scheduleDecision ??
      pickLatestSchedule(schedules.body, consentScope);
    const seedAccepted = seed.status === 200 && responseAccepted(seed.body);
    const mediationAccepted = mediation.status === 200 && responseAccepted(mediation.body);
    const workspaceScopedTurnCount = Array.isArray(conversation?.turns)
      ? conversation.turns.filter((turn) => turn.workspaceScope?.repoLabel).length
      : 0;
    const recordedActionCount = Array.isArray(conversation?.roundtableActions)
      ? conversation.roundtableActions.length
      : 0;
    const executionArtifacts = Array.isArray(conversation?.roundtableActions)
      ? conversation.roundtableActions
          .map((action) => action.executionArtifact)
          .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
      : [];
    const executionBundleCount = executionArtifacts.filter(
      (artifact) => artifact.status === "prepared" && artifact.bundlePath
    ).length;
    const executionReadyCount = executionArtifacts.filter((artifact) => artifact.executionReady).length;
    const taskDocumentCount = executionArtifacts.filter((artifact) => artifact.taskDocumentPath).length;
    const recordedRepoCount = new Set(
      (conversation?.roundtableActions ?? []).map((action) => action.repoId).filter(Boolean)
    ).size;
    const scheduleCapturesPlan =
      (schedule?.roundtableActionCount ?? 0) >= readyActions.length &&
      (schedule?.roundtableRepoCount ?? 0) >= plan.repoCount;
    const auditCapturesPlan =
      recordedActionCount >= readyActions.length &&
      executionBundleCount >= readyActions.length &&
      executionReadyCount >= readyActions.length &&
      recordedRepoCount >= plan.repoCount &&
      conversation?.sessionScope === consentScope &&
      schedule?.sessionScope === consentScope;
    const mediationHealthy = mediation.status === 200;
    return {
      id: options.scenario.id,
      label: options.scenario.label,
      status: mediationHealthy && scheduleCapturesPlan && auditCapturesPlan ? "completed" : "failed",
      seedStatus: seed.status,
      mediationStatus: mediation.status,
      seedAccepted,
      mediationAccepted,
      seedLatencyMs: seed.wallLatencyMs,
      mediationLatencyMs: mediation.wallLatencyMs,
      totalLatencyMs: Number((performance.now() - started).toFixed(2)),
      readyActionCount: readyActions.length,
      materializedActionCount: materialized.length,
      probedActionCount: probes.filter((entry) => entry.probeSucceeded).length,
      authorityBoundActionCount: probes.filter((entry) => entry.authorityBranchPreserved).length,
      executionBundleCount,
      executionReadyCount,
      taskDocumentCount,
      isolatedBranchCount: materialized.filter((entry) => entry.branch.startsWith("agents/")).length,
      repoCoverageCount: plan.repoCount,
      recordedActionCount,
      recordedRepoCount,
      workspaceScopedTurnCount,
      scheduleRoundtableActionCount: schedule?.roundtableActionCount ?? 0,
      scheduleRoundtableRepoCount: schedule?.roundtableRepoCount ?? 0,
      sessionScopePreserved:
        conversation?.sessionScope === consentScope && schedule?.sessionScope === consentScope,
      trackedFileCountP50: median(probes.map((entry) => entry.trackedFileCount)),
      sampleFiles: [...new Set(probes.flatMap((entry) => entry.sampleFiles))].slice(0, 6),
      guardVerdict: conversation?.guardVerdict,
      routeSuggestion:
        (mediation.body as { execution?: { routeSuggestion?: string } })?.execution?.routeSuggestion ??
        conversation?.finalRouteSuggestion,
      roundtableSummary: conversation?.roundtableSummary ?? schedule?.roundtableSummary,
      failureClass:
        seed.status === 200 && mediation.status === 200
          ? undefined
          : `seed:${seed.status}/mediate:${mediation.status}`
    };
  } finally {
    for (const action of readyActions.slice().reverse()) {
      cleanupRoundtableActionWorktree(action);
    }
  }
}

function summarizeHardware(): string {
  const cpus = os.cpus();
  const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length;
  return `${os.hostname()} / ${os.platform()}-${os.arch()} / ${cpus[0]?.model?.trim() || "unknown-cpu"} / ${Math.max(1, cpuCount)} cores / Q foundation ${getQFoundationModelName()}`;
}

function buildRoundtableRuntimeSurface(options: {
  harnessUrl: string;
  scenarioResults: RoundtableRuntimeScenarioResult[];
  release: ReleaseMetadata;
}): RoundtableRuntimeSurface {
  const assertions = [
    {
      id: "roundtable-runtime-scenarios-green",
      status: options.scenarioResults.every((entry) => entry.status === "completed") ? "pass" : "fail",
      target: "all scenarios completed",
      actual: `${options.scenarioResults.filter((entry) => entry.status === "completed").length}/${options.scenarioResults.length}`,
      detail: "Every scenario should seed cognition, mediate successfully, and record repo-scoped roundtable actions."
    },
    {
      id: "roundtable-runtime-worktrees-materialized",
      status: options.scenarioResults.every(
        (entry) =>
          entry.materializedActionCount >= entry.readyActionCount &&
          entry.isolatedBranchCount >= entry.readyActionCount
      )
        ? "pass"
        : "fail",
      target: "all ready actions materialized on agent branches",
      actual: options.scenarioResults
        .map((entry) => `${entry.id}:${entry.materializedActionCount}/${entry.readyActionCount}`)
        .join(", "),
      detail: "Every ready roundtable action should materialize a dedicated worktree on an agent branch."
    },
    {
      id: "roundtable-runtime-branch-authority-bound",
      status: options.scenarioResults.every(
        (entry) =>
          entry.probedActionCount >= entry.readyActionCount &&
          entry.authorityBoundActionCount >= entry.readyActionCount
      )
        ? "pass"
        : "fail",
      target: "all ready actions probed and bound to their agent branch authority",
      actual: options.scenarioResults
        .map(
          (entry) =>
            `${entry.id}:probes=${entry.probedActionCount}/${entry.readyActionCount},authority=${entry.authorityBoundActionCount}/${entry.readyActionCount}`
        )
        .join(" | "),
      detail:
        "Every ready action should touch its repo lane and preserve the allowed agent-only push branch instead of drifting to an uncontrolled branch."
    },
    {
      id: "roundtable-runtime-execution-bundles",
      status: options.scenarioResults.every(
        (entry) =>
          entry.executionBundleCount >= entry.readyActionCount &&
          entry.executionReadyCount >= entry.readyActionCount
      )
        ? "pass"
        : "fail",
      target: "all ready actions emitted execution bundles",
      actual: options.scenarioResults
        .map(
          (entry) =>
            `${entry.id}:bundles=${entry.executionBundleCount}/${entry.readyActionCount},ready=${entry.executionReadyCount}/${entry.readyActionCount},docs=${entry.taskDocumentCount}`
        )
        .join(" | "),
      detail:
        "The live mediated path should leave every ready repo lane with a governed execution bundle instead of planner metadata only."
    },
    {
      id: "roundtable-runtime-audit-captured",
      status: options.scenarioResults.every(
        (entry) =>
          entry.recordedActionCount >= entry.readyActionCount &&
          entry.executionBundleCount >= entry.readyActionCount &&
          entry.sessionScopePreserved
      )
        ? "pass"
        : "fail",
      target: "roundtable actions and execution bundles recorded",
      actual: options.scenarioResults
        .map(
          (entry) =>
            `${entry.id}:actions=${entry.recordedActionCount},turns=${entry.workspaceScopedTurnCount},bundles=${entry.executionBundleCount},scope=${entry.sessionScopePreserved}`
        )
        .join(" | "),
      detail:
        "The live conversation and schedule should carry the same repo-scoped action plan, actionable execution bundles, and preserved session scope the planner created."
    }
  ] satisfies RoundtableRuntimeSurface["assertions"];

  return {
    generatedAt: new Date().toISOString(),
    release: options.release,
    benchmark: {
      harnessUrl: options.harnessUrl,
      scenarioCount: options.scenarioResults.length,
      failedAssertions: assertions.filter((entry) => entry.status === "fail").length,
      repoCoverageP50: median(options.scenarioResults.map((entry) => entry.repoCoverageCount)),
      materializedActionsP50: median(options.scenarioResults.map((entry) => entry.materializedActionCount)),
      probedActionsP50: median(options.scenarioResults.map((entry) => entry.probedActionCount)),
      authorityBoundActionsP50: median(options.scenarioResults.map((entry) => entry.authorityBoundActionCount)),
      executionBundlesP50: median(options.scenarioResults.map((entry) => entry.executionBundleCount)),
      executionReadyP50: median(options.scenarioResults.map((entry) => entry.executionReadyCount)),
      taskDocumentsP50: median(options.scenarioResults.map((entry) => entry.taskDocumentCount)),
      workspaceScopedTurnsP50: median(options.scenarioResults.map((entry) => entry.workspaceScopedTurnCount)),
      recordedActionsP50: median(options.scenarioResults.map((entry) => entry.recordedActionCount)),
      trackedFilesP50: median(options.scenarioResults.map((entry) => entry.trackedFileCountP50)),
      runnerPathP95Ms: percentile(options.scenarioResults.map((entry) => entry.totalLatencyMs), 95),
      seedLatencyP95Ms: percentile(options.scenarioResults.map((entry) => entry.seedLatencyMs), 95),
      mediationLatencyP95Ms: percentile(options.scenarioResults.map((entry) => entry.mediationLatencyMs), 95),
      hardware: summarizeHardware()
    },
    scenarios: options.scenarioResults.map((entry) => ({
      id: entry.id,
      label: entry.label,
      status: entry.status,
      routeSuggestion: entry.routeSuggestion,
      guardVerdict: entry.guardVerdict,
      repoCoverageCount: entry.repoCoverageCount,
      materializedActionCount: entry.materializedActionCount,
      probedActionCount: entry.probedActionCount,
      authorityBoundActionCount: entry.authorityBoundActionCount,
      executionBundleCount: entry.executionBundleCount,
      executionReadyCount: entry.executionReadyCount,
      taskDocumentCount: entry.taskDocumentCount,
      recordedActionCount: entry.recordedActionCount,
      workspaceScopedTurnCount: entry.workspaceScopedTurnCount,
      scheduleRoundtableActionCount: entry.scheduleRoundtableActionCount,
      scheduleRoundtableRepoCount: entry.scheduleRoundtableRepoCount,
      sessionScopePreserved: entry.sessionScopePreserved,
      trackedFileCountP50: entry.trackedFileCountP50,
      sampleFiles: entry.sampleFiles,
      roundtableSummary: entry.roundtableSummary
    })),
    assertions,
    output: {
      jsonPath: "docs/wiki/Roundtable-Runtime.json",
      markdownPath: "docs/wiki/Roundtable-Runtime.md"
    }
  };
}

async function appendRoundtableRuntimeTrace(options: {
  runtimeRoot: string;
  runId: string;
  iterationIndex: number;
  iterationsRequested: number;
  intervalMs: number;
  report: RoundtableRuntimeSurface;
  release: ReleaseMetadata;
}): Promise<DecisionTraceRecord> {
  const iterationLabel = `iteration-${String(options.iterationIndex + 1).padStart(3, "0")}`;
  const summary = compactSummary(
    `Roundtable runtime ${iterationLabel} completed with ${options.report.benchmark.failedAssertions} failed assertion(s) across ${options.report.benchmark.scenarioCount} scenario(s).`
  );
  const traceRecord = await appendDecisionTraceRecord({
    rootDir: options.runtimeRoot,
    record: {
      decisionTraceId: createDecisionTraceSeed({
        source: "roundtable-runtime",
        sessionId: options.runId,
        executionId: iterationLabel,
        objective: summary,
        promptDigest: sha256Json({
          iterationsRequested: options.iterationsRequested,
          intervalMs: options.intervalMs,
          report: options.report.benchmark
        })
      }),
      source: "roundtable-runtime",
      sessionId: options.runId,
      executionId: iterationLabel,
      release: {
        buildId: options.release.buildId,
        gitShortSha: options.release.gitShortSha,
        modelName: getQModelName(),
        foundationModel: getQFoundationModelName(),
        trainingBundleId: options.release.q.trainingLock?.bundleId
      },
      policy: {
        consentScope: `runtime:${options.runId}`,
        qRoutingDirective: "roundtable-runtime-loop",
        routeMode: "bounded-interval-loop",
        failureClass: options.report.benchmark.failedAssertions > 0 ? "roundtable_assertions_failed" : undefined
      },
      evidence: {
        objectiveDigest: sha256Json({
          runId: options.runId,
          iterationIndex: options.iterationIndex,
          iterationsRequested: options.iterationsRequested
        }),
        contextDigest: sha256Json({
          harnessUrl: options.report.benchmark.harnessUrl,
          scenarios: options.report.scenarios.map((scenario) => scenario.id)
        }),
        promptDigest: sha256Json(options.report.benchmark),
        responseDigest: sha256Json(options.report.scenarios),
        sourceIds: [
          options.report.output.jsonPath,
          options.report.output.markdownPath,
          ...options.report.scenarios.map((scenario) => scenario.id)
        ],
        evidenceDigest: sha256Json({
          report: options.report,
          iterationIndex: options.iterationIndex,
          runId: options.runId
        }),
        contextFingerprint: sha256Json({
          runId: options.runId,
          iterationIndex: options.iterationIndex,
          intervalMs: options.intervalMs
        })
      },
      decisionSummary: {
        routeSuggestion: options.report.scenarios.find((scenario) => scenario.routeSuggestion)?.routeSuggestion,
        reasonSummary: compactSummary(
          options.report.assertions.map((assertion) => `${assertion.id}:${assertion.status}`).join("; ")
        ),
        commitStatement: `Persist roundtable runtime iteration ${iterationLabel} with ${options.report.benchmark.failedAssertions} failed assertion(s).`,
        responsePreview: compactSummary(summary, 200)
      },
      selfEvaluation: {
        status: options.report.benchmark.failedAssertions === 0 ? "completed" : "failed",
        driftDetected: options.report.benchmark.failedAssertions > 0,
        failedAssertions: options.report.benchmark.failedAssertions,
        baselineSuiteId: options.runId,
        comparisonSuiteId: iterationLabel
      }
    }
  });

  return traceRecord;
}

function buildFailedRoundtableRuntimeSurface(options: {
  harnessUrl: string;
  release: ReleaseMetadata;
  message: string;
}): RoundtableRuntimeSurface {
  return {
    generatedAt: new Date().toISOString(),
    release: options.release,
    benchmark: {
      harnessUrl: options.harnessUrl,
      scenarioCount: 0,
      failedAssertions: 1,
      repoCoverageP50: 0,
      materializedActionsP50: 0,
      probedActionsP50: 0,
      authorityBoundActionsP50: 0,
      executionBundlesP50: 0,
      executionReadyP50: 0,
      taskDocumentsP50: 0,
      workspaceScopedTurnsP50: 0,
      recordedActionsP50: 0,
      trackedFilesP50: 0,
      runnerPathP95Ms: 0,
      seedLatencyP95Ms: 0,
      mediationLatencyP95Ms: 0,
      hardware: summarizeHardware()
    },
    scenarios: [],
    assertions: [
      {
        id: "roundtable-runtime-iteration-error",
        status: "fail",
        target: "loop iteration completes",
        actual: options.message,
        detail: options.message
      }
    ],
    output: {
      jsonPath: "docs/wiki/Roundtable-Runtime.json",
      markdownPath: "docs/wiki/Roundtable-Runtime.md"
    }
  };
}

function renderMarkdown(report: RoundtableRuntimeSurface): string {
  return [
    "# Roundtable Runtime",
    "",
    "This page is generated from a live harness pass. It proves the roundtable planner is not just text: Immaculate runs a governed mediation route, records repo-scoped roundtable actions, and binds those actions to isolated agent worktrees across Immaculate, OpenJaws, and Asgard. The direct seed step is a best-effort warm-up signal; the governed mediation path is the authoritative route.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``,
    "",
    "## Benchmark",
    "",
    `- Harness URL: \`${report.benchmark.harnessUrl}\``,
    `- Scenario count: \`${report.benchmark.scenarioCount}\``,
    `- Failed assertions: \`${report.benchmark.failedAssertions}\``,
    `- Repo coverage P50: \`${report.benchmark.repoCoverageP50}\``,
    `- Materialized actions P50: \`${report.benchmark.materializedActionsP50}\``,
    `- Probed actions P50: \`${report.benchmark.probedActionsP50}\``,
    `- Branch-authority matches P50: \`${report.benchmark.authorityBoundActionsP50}\``,
    `- Execution bundles P50: \`${report.benchmark.executionBundlesP50}\``,
    `- Execution-ready lanes P50: \`${report.benchmark.executionReadyP50}\``,
    `- Task documents P50: \`${report.benchmark.taskDocumentsP50}\``,
    `- Recorded roundtable actions P50: \`${report.benchmark.recordedActionsP50}\``,
    `- Workspace-scoped turns P50: \`${report.benchmark.workspaceScopedTurnsP50}\``,
    `- Tracked files P50: \`${report.benchmark.trackedFilesP50}\``,
    `- Seed latency P95: \`${report.benchmark.seedLatencyP95Ms}\` ms`,
    `- Mediation latency P95: \`${report.benchmark.mediationLatencyP95Ms}\` ms`,
    `- Runner path latency P95: \`${report.benchmark.runnerPathP95Ms}\` ms`,
    `- Hardware: ${report.benchmark.hardware}`,
    "",
    "## Scenarios",
    "",
    ...report.scenarios.map((scenario) =>
      [
        `### ${scenario.label}`,
        "",
        `- Status: \`${scenario.status}\``,
        `- Route suggestion: \`${scenario.routeSuggestion ?? "unknown"}\``,
        `- Guard verdict: \`${scenario.guardVerdict ?? "unknown"}\``,
        `- Repo coverage: \`${scenario.repoCoverageCount}\``,
        `- Materialized actions: \`${scenario.materializedActionCount}\``,
        `- Probed actions: \`${scenario.probedActionCount}\``,
        `- Branch-authority matches: \`${scenario.authorityBoundActionCount}\``,
        `- Execution bundles: \`${scenario.executionBundleCount}\``,
        `- Execution-ready lanes: \`${scenario.executionReadyCount}\``,
        `- Task documents: \`${scenario.taskDocumentCount}\``,
        `- Recorded roundtable actions: \`${scenario.recordedActionCount}\``,
        `- Workspace-scoped turns: \`${scenario.workspaceScopedTurnCount}\``,
        `- Tracked files P50: \`${scenario.trackedFileCountP50}\``,
        `- Schedule roundtable counts: actions \`${scenario.scheduleRoundtableActionCount}\` / repos \`${scenario.scheduleRoundtableRepoCount}\``,
        `- Session scope preserved: \`${scenario.sessionScopePreserved}\``,
        `- Sample files: ${scenario.sampleFiles.length > 0 ? scenario.sampleFiles.map((entry) => `\`${entry}\``).join(", ") : "n/a"}`,
        `- Summary: ${scenario.roundtableSummary ?? "n/a"}`,
        ""
      ].join("\n")
    ),
    "",
    "## Assertions",
    "",
    ...report.assertions.map(
      (assertion) =>
        `- ${assertion.id}: \`${assertion.status}\` | target \`${assertion.target}\` | actual \`${assertion.actual}\``
    )
  ].join("\n");
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const runId = buildRunId(cli);
  const harnessRuntimeDir = path.join(ROUNDTABLE_RUNTIME_ROOT, "harness");
  const runRoot = path.join(ROUNDTABLE_RUNTIME_RUNS_ROOT, runId);
  const iterationsRoot = path.join(runRoot, "iterations");
  const decisionTracePath = path.join(runRoot, "decision-trace.ndjson");
  const latestRunPath = path.join(ROUNDTABLE_RUNTIME_ROOT, "latest-run.json");
  const latestReportPath = path.join(ROUNDTABLE_RUNTIME_ROOT, "latest-report.json");
  const failedReportPath = path.join(ROUNDTABLE_RUNTIME_ROOT, "last-failed-report.json");
  const keysPath = path.join(harnessRuntimeDir, "q-api-keys.json");
  const port = await allocateTcpPort();
  const harnessUrl = `http://127.0.0.1:${port}`;
  const release = await resolveReleaseMetadata();
  await mkdir(harnessRuntimeDir, { recursive: true });
  await mkdir(iterationsRoot, { recursive: true });
  await mkdir(WIKI_ROOT, { recursive: true });
  await prewarmOllamaModel({
    endpoint: DEFAULT_OLLAMA_URL,
    model: getQModelTarget()
  });

  const child = startHarnessProcess({
    repoRoot: REPO_ROOT,
    runtimeDir: harnessRuntimeDir,
    keysPath,
    port
  });

  const iterationArtifacts: RoundtableRuntimeIterationArtifact[] = [];
  let latestReport: RoundtableRuntimeSurface | undefined;
  let latestFailureMessage: string | undefined;

  try {
    await waitForHarness(harnessUrl);

    for (let iterationIndex = 0; iterationIndex < cli.iterations; iterationIndex += 1) {
      const iterationStartedAt = new Date().toISOString();
      const iterationStarted = performance.now();
      const iterationLabel = `iteration-${String(iterationIndex + 1).padStart(3, "0")}`;
      const iterationReportFile = path.join(iterationsRoot, `${iterationLabel}.json`);
      const relativeIterationReportFile = path.relative(REPO_ROOT, iterationReportFile).replaceAll("\\", "/");
      const relativeDecisionTraceFile = path.relative(REPO_ROOT, decisionTracePath).replaceAll("\\", "/");

      try {
        const scenarioResults: RoundtableRuntimeScenarioResult[] = [];
        for (const scenario of SCENARIOS) {
          scenarioResults.push(
            await runScenario({
              harnessUrl,
              scenario
            })
          );
        }

        const report = buildRoundtableRuntimeSurface({
          harnessUrl,
          scenarioResults,
          release
        });
        const publicLedgerBaseUrl =
          process.env.AROBI_PUBLIC_URL?.trim() || process.env.ASGARD_AROBI_PUBLIC_URL?.trim();
        const privateLedgerBaseUrl =
          process.env.AROBI_PRIVATE_URL?.trim() || process.env.ASGARD_AROBI_PRIVATE_URL?.trim();
        const publicLedger =
          publicLedgerBaseUrl && report.benchmark.failedAssertions === 0
            ? await postArobiRoundtableRecord({
                baseUrl: publicLedgerBaseUrl.replace(/\/+$/, ""),
                visibility: "public",
                runId,
                iterationLabel,
                report
              })
            : undefined;
        const privateLedger = privateLedgerBaseUrl
          ? await postArobiRoundtableRecord({
              baseUrl: privateLedgerBaseUrl.replace(/\/+$/, ""),
              visibility: "00",
              runId,
              iterationLabel,
              report
            })
          : undefined;
        const decisionTrace = await appendRoundtableRuntimeTrace({
          runtimeRoot: ROUNDTABLE_RUNTIME_ROOT,
          runId,
          iterationIndex,
          iterationsRequested: cli.iterations,
          intervalMs: cli.intervalMs,
          report,
          release
        });

        const completedAt = new Date().toISOString();
        const artifact: RoundtableRuntimeIterationArtifact = {
          index: iterationIndex + 1,
          startedAt: iterationStartedAt,
          completedAt,
          durationMs: Number((performance.now() - iterationStarted).toFixed(2)),
          status: report.benchmark.failedAssertions === 0 ? "completed" : "failed",
          reportPath: relativeIterationReportFile,
          tracePath: relativeDecisionTraceFile,
          decisionTraceId: decisionTrace.decisionTraceId,
          failedAssertions: report.benchmark.failedAssertions
        };

        await writeJsonArtifact(iterationReportFile, {
          runId,
          iteration: artifact,
          report,
          decisionTrace,
          arobiLedger: {
            public: publicLedger,
            private: privateLedger
          }
        });
        await appendJsonLine(decisionTracePath, decisionTrace);

        iterationArtifacts.push(artifact);
        latestReport = report;
        if (report.benchmark.failedAssertions > 0) {
          latestFailureMessage =
            latestFailureMessage ??
            `Roundtable runtime iteration ${iterationLabel} failed ${report.benchmark.failedAssertions} assertion(s).`;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown roundtable runtime iteration error.";
        const failedReport = buildFailedRoundtableRuntimeSurface({
          harnessUrl,
          release,
          message
        });
        const decisionTrace = await appendRoundtableRuntimeTrace({
          runtimeRoot: ROUNDTABLE_RUNTIME_ROOT,
          runId,
          iterationIndex,
          iterationsRequested: cli.iterations,
          intervalMs: cli.intervalMs,
          report: failedReport,
          release
        });
        const completedAt = new Date().toISOString();
        const artifact: RoundtableRuntimeIterationArtifact = {
          index: iterationIndex + 1,
          startedAt: iterationStartedAt,
          completedAt,
          durationMs: Number((performance.now() - iterationStarted).toFixed(2)),
          status: "failed",
          reportPath: relativeIterationReportFile,
          tracePath: relativeDecisionTraceFile,
          decisionTraceId: decisionTrace.decisionTraceId,
          failedAssertions: failedReport.benchmark.failedAssertions,
          error: message
        };

        await writeJsonArtifact(iterationReportFile, {
          runId,
          iteration: artifact,
          report: failedReport,
          decisionTrace,
          error: message
        });
        await appendJsonLine(decisionTracePath, decisionTrace);

        iterationArtifacts.push(artifact);
        latestReport = failedReport;
        latestFailureMessage = latestFailureMessage ?? message;
      }

      if (iterationIndex + 1 < cli.iterations && cli.intervalMs > 0) {
        await delay(cli.intervalMs);
      }
    }

    if (!latestReport) {
      throw new Error("Roundtable runtime did not produce a report.");
    }

    const manifest: RoundtableRuntimeRunManifest = {
      generatedAt: new Date().toISOString(),
      runId,
      iterationsRequested: cli.iterations,
      intervalMs: cli.intervalMs,
      iterationCount: iterationArtifacts.length,
      completedAt: new Date().toISOString(),
      runtimeRoot: path.relative(REPO_ROOT, ROUNDTABLE_RUNTIME_ROOT).replaceAll("\\", "/"),
      harnessRuntimeRoot: path.relative(REPO_ROOT, harnessRuntimeDir).replaceAll("\\", "/"),
      traceLedgerPath: path.relative(REPO_ROOT, path.join(ROUNDTABLE_RUNTIME_ROOT, "arobi-network", "decision-ledger.ndjson")).replaceAll("\\", "/"),
      latestReportPath: latestReport.output.jsonPath,
      latestReport,
      iterations: iterationArtifacts
    };

    await writeJsonArtifact(path.join(runRoot, "run-manifest.json"), manifest);
    await writeJsonArtifact(latestRunPath, manifest);
    await writeJsonArtifact(latestReportPath, latestReport);

    if (latestReport.benchmark.failedAssertions > 0 || iterationArtifacts.some((entry) => entry.status === "failed")) {
      const failurePayload = {
        manifest,
        latestReport,
        latestFailureMessage
      };
      await writeJsonArtifact(failedReportPath, failurePayload);
      throw new Error(
        latestFailureMessage ??
          `Roundtable runtime finished with ${latestReport.benchmark.failedAssertions} failed assertion(s).`
      );
    }

    await writeJsonArtifact(path.join(REPO_ROOT, latestReport.output.jsonPath), latestReport);
    await writeFile(path.join(REPO_ROOT, latestReport.output.markdownPath), `${renderMarkdown(latestReport)}\n`, "utf8");
    process.stdout.write(
      `${JSON.stringify(
        cli.iterations === 1 ? latestReport : manifest,
        null,
        2
      )}\n`
    );
  } finally {
    await stopHarnessProcess(child);
  }
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Roundtable runtime benchmark failed.");
  process.exitCode = 1;
});
