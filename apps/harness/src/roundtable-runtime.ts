import * as http from "node:http";
import * as https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  appendDecisionTraceRecord,
  appendDecisionTraceMirrorRecord,
  createDecisionTraceSeed,
  inspectDecisionTraceFile,
  type DecisionTraceIntegrityReport,
  type DecisionTraceRecord
} from "./decision-trace.js";
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
import {
  resolveHarnessReadiness,
  resolveReleaseMetadata,
  type HarnessReadinessSummary,
  type ReleaseMetadata
} from "./release-metadata.js";
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
  ledgerAdvanced: boolean;
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
  auditReceiptCount: number;
  executionReceiptCount: number;
  findingCount: number;
  actionableFindingCount: number;
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

export type RoundtableRuntimeSurface = {
  generatedAt: string;
  release: ReleaseMetadata;
  benchmark: {
    harnessUrl: string;
    scenarioCount: number;
    failedAssertions: number;
    seedAcceptedCount: number;
    mediationAcceptedCount: number;
    repoCoverageP50: number;
    materializedActionsP50: number;
    probedActionsP50: number;
    authorityBoundActionsP50: number;
    executionBundlesP50: number;
    executionReadyP50: number;
    taskDocumentsP50: number;
    auditReceiptsP50: number;
    executionReceiptsP50: number;
    workspaceScopedTurnsP50: number;
    recordedActionsP50: number;
    trackedFilesP50: number;
    runnerPathP95Ms: number;
    seedLatencyP95Ms: number;
    mediationLatencyP95Ms: number;
    hardware: string;
    executionIntegrityDigest: string;
    decisionTraceStatus: string;
    decisionTraceEventCount: number;
    decisionTraceHeadHash?: string;
    decisionTraceFindingCount: number;
  };
  scenarios: Array<{
    id: string;
    label: string;
    status: string;
    seedStatus: number;
    mediationStatus: number;
    seedAccepted: boolean;
    mediationAccepted: boolean;
    routeSuggestion?: string;
    guardVerdict?: string;
    repoCoverageCount: number;
    materializedActionCount: number;
    probedActionCount: number;
    authorityBoundActionCount: number;
    executionBundleCount: number;
    executionReadyCount: number;
    taskDocumentCount: number;
    auditReceiptCount: number;
    executionReceiptCount: number;
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
  readiness: HarnessReadinessSummary;
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

type HarnessProcessHandle = {
  child: ChildProcess;
  stdoutPath: string;
  stderrPath: string;
  startupTracePath: string;
};

type OllamaProcessHandle = {
  child: ChildProcess;
  stdoutPath: string;
  stderrPath: string;
};

const DEFAULT_OLLAMA_URL = resolveQLocalOllamaUrl();
export function resolveRoundtableOllamaUrl(
  env: NodeJS.ProcessEnv = process.env,
  sharedLocalQUrl = DEFAULT_OLLAMA_URL
): string {
  return (
    env.IMMACULATE_ROUNDTABLE_OLLAMA_URL?.trim() ||
    env.IMMACULATE_ROUNDTABLE_Q_OLLAMA_URL?.trim() ||
    sharedLocalQUrl
  );
}

const DEFAULT_ROUNDTABLE_OLLAMA_URL = resolveRoundtableOllamaUrl();

export function resolveRoundtableSharedQFallbackAllowed(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const configured = env.IMMACULATE_ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK?.trim().toLowerCase();
  if (!configured) {
    return true;
  }
  return configured === "1" || configured === "true" || configured === "yes";
}

const ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK = resolveRoundtableSharedQFallbackAllowed();
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(MODULE_ROOT, "..");
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const CONSENT_PREFIX = "session:roundtable-runtime";
const ROUNDTABLE_RUNTIME_ROOT = path.join(REPO_ROOT, ".runtime", "roundtable-runtime");
const ROUNDTABLE_RUNTIME_RUNS_ROOT = path.join(ROUNDTABLE_RUNTIME_ROOT, "runs");

export type RoundtableRuntimeTimeoutControls = {
  prewarmTimeoutMs: number;
  cognitiveRequestTimeoutMs: number;
};

function clampRuntimeTimeoutMs(value: number): number {
  return Math.min(600_000, Math.max(5_000, value));
}

export function resolveRoundtableRuntimeTimeoutControls(
  env: NodeJS.ProcessEnv = process.env
): RoundtableRuntimeTimeoutControls {
  return {
    prewarmTimeoutMs: clampRuntimeTimeoutMs(
      parsePositiveInteger(env.IMMACULATE_ROUNDTABLE_OLLAMA_PREWARM_TIMEOUT_MS, 180_000)
    ),
    cognitiveRequestTimeoutMs: clampRuntimeTimeoutMs(
      parsePositiveInteger(env.IMMACULATE_ROUNDTABLE_COGNITIVE_TIMEOUT_MS, 180_000)
    )
  };
}

const ROUNDTABLE_RUNTIME_TIMEOUT_CONTROLS = resolveRoundtableRuntimeTimeoutControls();
const ROUNDTABLE_OLLAMA_PREWARM_TIMEOUT_MS =
  ROUNDTABLE_RUNTIME_TIMEOUT_CONTROLS.prewarmTimeoutMs;
const ROUNDTABLE_COGNITIVE_REQUEST_TIMEOUT_MS =
  ROUNDTABLE_RUNTIME_TIMEOUT_CONTROLS.cognitiveRequestTimeoutMs;

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

function resolveOllamaHost(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return endpoint.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
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

async function checkHttp(url: string, init?: RequestInit, timeoutMs = 180_000): Promise<HttpCheck> {
  const started = performance.now();
  const mergedHeaders = new Headers(init?.headers);
  if (!mergedHeaders.has("connection")) {
    mergedHeaders.set("connection", "close");
  }
  const requestBody =
    typeof init?.body === "string" || init?.body === undefined || init?.body === null
      ? init?.body ?? undefined
      : String(init.body);
  const requestHeaders = Object.fromEntries(mergedHeaders.entries());
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === "https:" ? https : http;

  return await new Promise<HttpCheck>((resolve, reject) => {
    const request = transport.request(
      parsedUrl,
      {
        method: init?.method ?? "GET",
        headers: requestHeaders
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body: unknown = text;
          try {
            body = text.length > 0 ? JSON.parse(text) : null;
          } catch {
            body = text;
          }
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              headers[key] = value.join(", ");
            } else if (typeof value === "string") {
              headers[key] = value;
            }
          }
          resolve({
            status: response.statusCode ?? 0,
            body,
            headers,
            wallLatencyMs: Number((performance.now() - started).toFixed(2))
          });
        });
        response.on("error", (error) => {
          reject(
            new Error(
              `HTTP ${(init?.method ?? "GET").toUpperCase()} ${url} failed: ${
                error instanceof Error ? error.message : "unknown response error"
              }`
            )
          );
        });
      }
    );

    const timeout = setTimeout(() => {
      request.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    request.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `HTTP ${(init?.method ?? "GET").toUpperCase()} ${url} failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        )
      );
    });
    request.on("close", () => {
      clearTimeout(timeout);
    });

    if (requestBody !== undefined) {
      request.write(requestBody);
    }
    request.end();
  });
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
    const entryDelta =
      typeof entriesBefore === "number" && typeof entriesAfter === "number"
        ? entriesAfter - entriesBefore
        : undefined;
    const ledgerAdvanced = typeof entryDelta === "number" && entryDelta > 0;
    return {
      baseUrl: options.baseUrl,
      version: before.version ?? after.version,
      network: before.network ?? after.network,
      entriesBefore,
      entriesAfter,
      entryDelta,
      writeStatus: write.status,
      ledgerAdvanced,
      writeAccepted: write.status >= 200 && write.status < 300 && ledgerAdvanced
    };
  } catch (error) {
    return {
      baseUrl: options.baseUrl,
      ledgerAdvanced: false,
      writeAccepted: false,
      error: error instanceof Error ? error.message : "Unknown Arobi ledger write failure."
    };
  }
}

function describeLedgerAdvance(
  visibility: "public" | "00",
  result: ArobiRoundtableLedgerResult | undefined
): string {
  const label = visibility === "public" ? "public ledger" : "private ledger";
  if (!result) {
    return `${label} write not attempted in this pass`;
  }
  if (result.error) {
    return `${label} write failed: ${result.error}`;
  }
  const status = result.writeStatus ?? "unknown";
  const delta = typeof result.entryDelta === "number" ? result.entryDelta : "unknown";
  return result.ledgerAdvanced
    ? `${label} advanced by ${delta} entry after status ${status}`
    : `${label} did not advance after status ${status} (delta ${delta})`;
}

function buildRuntimeReadiness(options: {
  publicLedgerBaseUrl?: string;
  privateLedgerBaseUrl?: string;
  publicLedger?: ArobiRoundtableLedgerResult;
  privateLedger?: ArobiRoundtableLedgerResult;
  scenarioResults: RoundtableRuntimeScenarioResult[];
  qLocalEndpoint: string;
}): HarnessReadinessSummary {
  const qAcceptedCount = options.scenarioResults.filter(
    (entry) => entry.seedAccepted && entry.mediationAccepted
  ).length;
  return resolveHarnessReadiness({
    publicLedgerBaseUrl: options.publicLedgerBaseUrl,
    privateLedgerBaseUrl: options.privateLedgerBaseUrl,
    publicLedgerAdvanced: options.publicLedger?.ledgerAdvanced,
    privateLedgerAdvanced: options.privateLedger?.ledgerAdvanced,
    publicLedgerDetail: describeLedgerAdvance("public", options.publicLedger),
    privateLedgerDetail: describeLedgerAdvance("00", options.privateLedger),
    qLocalEndpoint: options.qLocalEndpoint,
    qLocalHealthy:
      options.scenarioResults.length > 0 && qAcceptedCount === options.scenarioResults.length,
    qLocalDetail: `local Q accepted ${qAcceptedCount}/${options.scenarioResults.length} seed+mediation scenario pair(s)`
  });
}

async function waitForHarness(
  harnessUrl: string,
  harness?: HarnessProcessHandle
): Promise<HttpCheck> {
  const startupTimeoutMs = Math.max(
    30_000,
    Number(process.env.IMMACULATE_HARNESS_BOOT_TIMEOUT_MS ?? 240_000) || 240_000
  );
  const attemptDelayMs = 500;
  const maxAttempts = Math.ceil(startupTimeoutMs / attemptDelayMs);
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (harness && harness.child.exitCode !== null) {
      const exitLabel =
        harness.child.signalCode !== null && harness.child.signalCode !== undefined
          ? `signal=${harness.child.signalCode}`
          : `code=${harness.child.exitCode}`;
      throw new Error(
        `Harness exited before becoming healthy (${exitLabel}). stdout=${harness.stdoutPath} stderr=${harness.stderrPath} startupTrace=${harness.startupTracePath}`
      );
    }
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
    await delay(attemptDelayMs);
  }
  const timeoutMessage = `Harness did not become healthy within ${startupTimeoutMs}ms${
    harness ? ` (stdout=${harness.stdoutPath} stderr=${harness.stderrPath} startupTrace=${harness.startupTracePath})` : ""
  }.`;
  if (lastError instanceof Error) {
    throw new Error(`${timeoutMessage} Last error: ${lastError.message}`);
  }
  throw new Error(timeoutMessage);
}

async function waitForOllama(
  endpoint: string,
  handle?: OllamaProcessHandle
): Promise<HttpCheck> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (handle && handle.child.exitCode !== null) {
      const exitLabel =
        handle.child.signalCode !== null && handle.child.signalCode !== undefined
          ? `signal=${handle.child.signalCode}`
          : `code=${handle.child.exitCode}`;
      throw new Error(
        `Local Ollama exited before becoming healthy (${exitLabel}). stdout=${handle.stdoutPath} stderr=${handle.stderrPath}`
      );
    }
    try {
      const tags = await checkHttp(`${endpoint.replace(/\/+$/, "")}/api/tags`);
      if (tags.status === 200) {
        return tags;
      }
      lastError = new Error(`Ollama tags returned ${tags.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw lastError instanceof Error ? lastError : new Error("Ollama did not become healthy in time.");
}

async function ensureHarnessQRuntimeLayer(
  harnessUrl: string,
  consentScope: string
): Promise<void> {
  const registration = await checkHttp(`${harnessUrl}/api/intelligence/q/register`, {
    method: "POST",
    headers: buildHeaders(consentScope, "cognitive-registration"),
    body: JSON.stringify({
      role: "mid",
      model: getQModelName()
    })
  });
  if (registration.status !== 200 || !responseAccepted(registration.body)) {
    throw new Error(
      `Unable to register the Q runtime layer for roundtable runtime: ${registration.status}`
    );
  }
}

function startOllamaProcess(options: {
  runtimeDir: string;
  endpoint: string;
}): OllamaProcessHandle {
  mkdirSync(options.runtimeDir, { recursive: true });
  const stdoutPath = path.join(options.runtimeDir, "ollama.stdout.log");
  const stderrPath = path.join(options.runtimeDir, "ollama.stderr.log");
  const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrPath, { flags: "a" });
  const child = spawn("ollama", ["serve"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      OLLAMA_HOST: resolveOllamaHost(options.endpoint)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);
  child.once("exit", () => {
    stdoutStream.end();
    stderrStream.end();
  });
  return {
    child,
    stdoutPath,
    stderrPath
  };
}

async function ensureOllamaEndpoint(options: {
  endpoint: string;
  runtimeDir: string;
}): Promise<OllamaProcessHandle | null> {
  try {
    const tags = await checkHttp(`${options.endpoint.replace(/\/+$/, "")}/api/tags`);
    if (tags.status === 200) {
      return null;
    }
  } catch {
    // Fall through to headless bootstrap.
  }
  const handle = startOllamaProcess(options);
  await delay(8_000);
  try {
    await waitForOllama(options.endpoint, handle);
  } catch (error) {
    throw new Error(
      `Unable to bootstrap local Ollama at ${options.endpoint}: ${error instanceof Error ? error.message : "unknown error"}. stdout=${handle.stdoutPath} stderr=${handle.stderrPath}`
    );
  }
  return handle;
}

async function isOllamaEndpointHealthy(endpoint: string): Promise<boolean> {
  try {
    const tags = await checkHttp(`${endpoint.replace(/\/+$/, "")}/api/tags`);
    return tags.status === 200;
  } catch {
    return false;
  }
}

async function bootstrapRoundtableOllama(options: {
  runtimeDir: string;
}): Promise<{
  endpoint: string;
  process: OllamaProcessHandle | null;
  fallbackFrom?: string;
  prewarmReady: boolean;
  prewarmWarning?: string;
}> {
  let endpoint = DEFAULT_ROUNDTABLE_OLLAMA_URL;
  const dedicatedLaneRequested = endpoint !== DEFAULT_OLLAMA_URL;
  let processHandle = await ensureOllamaEndpoint({
    endpoint,
    runtimeDir: options.runtimeDir
  });
  if (process.env.IMMACULATE_ROUNDTABLE_PREWARM === "false") {
    return {
      endpoint,
      process: processHandle,
      prewarmReady: true
    };
  }

  const prewarm = await prewarmOllamaModel({
    endpoint,
    model: getQModelTarget(),
    timeoutMs: ROUNDTABLE_OLLAMA_PREWARM_TIMEOUT_MS
  });
  if (!prewarm.failureClass) {
    return {
      endpoint,
      process: processHandle,
      prewarmReady: true
    };
  }

  if (
    shouldAttemptRoundtableSharedQFallback({
      dedicatedLaneRequested,
      sharedFallbackAllowed: ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK,
      sharedEndpointHealthy: await isOllamaEndpointHealthy(DEFAULT_OLLAMA_URL),
      dedicatedFailureClass: prewarm.failureClass
    })
  ) {
    if (processHandle) {
      await stopOllamaProcess(processHandle);
    }
    const fallbackEndpoint = DEFAULT_OLLAMA_URL;
    const fallbackPrewarm = await prewarmOllamaModel({
      endpoint: fallbackEndpoint,
      model: getQModelTarget(),
      timeoutMs: ROUNDTABLE_OLLAMA_PREWARM_TIMEOUT_MS
    });
    return {
      endpoint: fallbackEndpoint,
      process: null,
      fallbackFrom: endpoint,
      prewarmReady: !fallbackPrewarm.failureClass,
      prewarmWarning: fallbackPrewarm.failureClass
        ? `dedicated prewarm ${prewarm.failureClass}${prewarm.errorMessage ? ` / ${prewarm.errorMessage}` : ""}; shared fallback prewarm ${fallbackPrewarm.failureClass}${fallbackPrewarm.errorMessage ? ` / ${fallbackPrewarm.errorMessage}` : ""}`
        : `dedicated prewarm ${prewarm.failureClass}${prewarm.errorMessage ? ` / ${prewarm.errorMessage}` : ""}; fell back to shared local Q lane`
    };
  }

  return {
    endpoint,
    process: processHandle,
    prewarmReady: false,
    prewarmWarning: `${prewarm.failureClass}${prewarm.errorMessage ? ` / ${prewarm.errorMessage}` : ""}${
      dedicatedLaneRequested && !ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK
        ? "; dedicated roundtable Q lane retained because shared fallback is disabled"
        : ""
    }`
  };
}

export function shouldAbortRoundtableRuntimeAfterPrewarm(options: {
  prewarmReady: boolean;
  prewarmWarning?: string;
}): boolean {
  return options.prewarmReady === false;
}

export function shouldAttemptRoundtableSharedQFallback(options: {
  dedicatedLaneRequested: boolean;
  sharedFallbackAllowed: boolean;
  sharedEndpointHealthy: boolean;
  dedicatedFailureClass?: string;
}): boolean {
  return (
    options.dedicatedLaneRequested &&
    options.sharedFallbackAllowed &&
    options.sharedEndpointHealthy &&
    options.dedicatedFailureClass !== "transport_timeout"
  );
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
  ollamaEndpoint: string;
}): HarnessProcessHandle {
  const harness = resolveHarnessCommand();
  mkdirSync(options.runtimeDir, { recursive: true });
  const stdoutPath = path.join(options.runtimeDir, "roundtable-harness.stdout.log");
  const stderrPath = path.join(options.runtimeDir, "roundtable-harness.stderr.log");
  const startupTracePath = path.join(options.runtimeDir, "startup-trace.ndjson");
  const stdoutStream = createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(stderrPath, { flags: "a" });
  const child = spawn(harness.command, harness.args, {
    cwd: options.repoRoot,
    env: {
      ...process.env,
      IMMACULATE_RUNTIME_DIR: options.runtimeDir,
      IMMACULATE_Q_API_ENABLED: "true",
      IMMACULATE_Q_API_KEYS_PATH: options.keysPath,
      IMMACULATE_SKIP_STARTUP_Q_DISCOVERY: "true",
      IMMACULATE_HARNESS_HOST: "127.0.0.1",
      IMMACULATE_HARNESS_PORT: String(options.port),
      IMMACULATE_OLLAMA_URL: options.ollamaEndpoint,
      IMMACULATE_Q_OLLAMA_URL: options.ollamaEndpoint
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout?.pipe(stdoutStream);
  child.stderr?.pipe(stderrStream);
  child.once("exit", () => {
    stdoutStream.end();
    stderrStream.end();
  });
  return {
    child,
    stdoutPath,
    stderrPath,
    startupTracePath
  };
}

async function stopHarnessProcess(handle?: HarnessProcessHandle): Promise<void> {
  if (!handle) {
    return;
  }
  const child = handle.child;
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

async function stopOllamaProcess(handle: OllamaProcessHandle | null): Promise<void> {
  if (!handle) {
    return;
  }
  const child = handle.child;
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

const ROUNDTABLE_MEDIATION_OPERATOR_SUMMARY =
  "Run suppressed plan-only roundtable mediation for local release evidence; no external actuation or public mutation is authorized.";
const ROUNDTABLE_MEDIATION_ROLLBACK_PLAN =
  "No external dispatch is authorized. Keep dispatchOnApproval=false and suppressed=true; if mediation drifts, stop the harness and discard the runtime artifacts.";

export function buildRoundtableMediationHeaders(options: {
  consentScope: string;
  receiptTarget: string;
  actor?: string;
}): Record<string, string> {
  return {
    ...buildHeaders(options.consentScope, "actuation-dispatch,cognitive-execution"),
    "x-immaculate-actor": options.actor?.trim() || "roundtable-runtime",
    "x-immaculate-receipt-target": options.receiptTarget,
    "x-immaculate-operator-summary": ROUNDTABLE_MEDIATION_OPERATOR_SUMMARY,
    "x-immaculate-operator-confirmed": "true",
    "x-immaculate-rollback-plan": ROUNDTABLE_MEDIATION_ROLLBACK_PLAN
  };
}

export function buildRoundtableMediationRequestBody(options: {
  sessionId: string;
  sourceExecutionId?: string;
  objective: string;
  receiptTarget: string;
}) {
  return {
    sessionId: options.sessionId,
    sourceExecutionId: options.sourceExecutionId,
    objective: options.objective,
    requestedExecutionDecision: "allow_local" as const,
    dispatchOnApproval: false,
    suppressed: true,
    receiptTarget: options.receiptTarget,
    operatorSummary: ROUNDTABLE_MEDIATION_OPERATOR_SUMMARY,
    operatorConfirmed: true,
    rollbackPlan: ROUNDTABLE_MEDIATION_ROLLBACK_PLAN
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

  const runSeedExecution = async (): Promise<{
    check: HttpCheck;
    executionId?: string;
    totalLatencyMs: number;
  }> => {
    let lastCheck: HttpCheck | undefined;
    let lastExecutionId: string | undefined;
    let totalLatencyMs = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const seed = await checkHttp(
        `${options.harnessUrl}/api/intelligence/run`,
        {
          method: "POST",
          headers: buildHeaders(consentScope, "cognitive-execution"),
          body: JSON.stringify({
            sessionId,
            objective: options.scenario.seedObjective,
            requestedExecutionDecision: "allow_local"
          })
        },
        ROUNDTABLE_COGNITIVE_REQUEST_TIMEOUT_MS
      );
      totalLatencyMs += seed.wallLatencyMs;
      lastCheck = seed;
      lastExecutionId =
        (seed.body as { execution?: { id?: string } } | null)?.execution?.id;
      if (seed.status === 200 && responseAccepted(seed.body)) {
        break;
      }
      if (attempt === 0) {
        await delay(2_000);
      }
    }
    return {
      check: lastCheck!,
      executionId: lastExecutionId,
      totalLatencyMs: Number(totalLatencyMs.toFixed(2))
    };
  };

  try {
    const seedResult = await runSeedExecution();
    const seed = seedResult.check;
    const seedExecutionId = seedResult.executionId;
    const engagementReceiptTarget = path
      .relative(
        REPO_ROOT,
        path.join(ROUNDTABLE_RUNTIME_ROOT, "engagement", `${scenarioRunSeed}.ndjson`)
      )
      .replace(/\\/g, "/");
    const mediation = await checkHttp(`${options.harnessUrl}/api/orchestration/mediate`, {
      method: "POST",
      headers: buildRoundtableMediationHeaders({
        consentScope,
        receiptTarget: engagementReceiptTarget
      }),
      body: JSON.stringify(buildRoundtableMediationRequestBody({
        sessionId,
        sourceExecutionId: seedExecutionId,
        objective: options.scenario.mediationObjective,
        receiptTarget: engagementReceiptTarget
      }))
    }, ROUNDTABLE_COGNITIVE_REQUEST_TIMEOUT_MS);
    let conversation = (mediation.body as { conversation?: MultiAgentConversation })?.conversation;
    let schedule = (mediation.body as { scheduleDecision?: ExecutionSchedule })?.scheduleDecision;
    if (!conversation) {
      const conversations = await checkHttp(`${options.harnessUrl}/api/intelligence/conversations`, {
        headers: buildHeaders("system:benchmark", "cognitive-trace-read")
      });
      conversation = pickLatestConversation(conversations.body, sessionId);
    }
    if (!schedule) {
      const schedules = await checkHttp(`${options.harnessUrl}/api/intelligence/schedules`, {
        headers: buildHeaders("system:benchmark", "cognitive-trace-read")
      });
      schedule = pickLatestSchedule(schedules.body, consentScope);
    }
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
    const auditReceiptCount = executionArtifacts.filter((artifact) => artifact.auditReceiptPath).length;
    const executionReceiptCount = executionArtifacts.filter(
      (artifact) => artifact.executionReceiptPath
    ).length;
    const findingCount = executionArtifacts.reduce(
      (total, artifact) => total + (artifact.findingCount ?? 0),
      0
    );
    const actionableFindingCount = executionArtifacts.reduce(
      (total, artifact) => total + (artifact.actionableFindingCount ?? 0),
      0
    );
    const recordedRepoCount = new Set(
      (conversation?.roundtableActions ?? []).map((action) => action.repoId).filter(Boolean)
    ).size;
    const scheduleCapturesPlan =
      (schedule?.roundtableActionCount ?? 0) >= readyActions.length &&
      (schedule?.roundtableRepoCount ?? 0) >= plan.repoCount;
    const auditCapturesPlan =
      recordedActionCount >= readyActions.length &&
      executionBundleCount >= readyActions.length &&
      executionReceiptCount >= readyActions.length &&
      executionReadyCount >= readyActions.length &&
      recordedRepoCount >= plan.repoCount &&
      conversation?.sessionScope === consentScope &&
      schedule?.sessionScope === consentScope;
    const scenarioAccepted = seedAccepted && mediationAccepted;
    return {
      id: options.scenario.id,
      label: options.scenario.label,
      status: scenarioAccepted && scheduleCapturesPlan && auditCapturesPlan ? "completed" : "failed",
      seedStatus: seed.status,
      mediationStatus: mediation.status,
      seedAccepted,
      mediationAccepted,
      seedLatencyMs: seedResult.totalLatencyMs,
      mediationLatencyMs: mediation.wallLatencyMs,
      totalLatencyMs: Number((performance.now() - started).toFixed(2)),
      readyActionCount: readyActions.length,
      materializedActionCount: materialized.length,
      probedActionCount: probes.filter((entry) => entry.probeSucceeded).length,
      authorityBoundActionCount: probes.filter((entry) => entry.authorityBranchPreserved).length,
      executionBundleCount,
      executionReadyCount,
      taskDocumentCount,
      auditReceiptCount,
      executionReceiptCount,
      findingCount,
      actionableFindingCount,
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
        seedAccepted && mediationAccepted
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
  readiness: HarnessReadinessSummary;
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
      id: "roundtable-runtime-audit-receipts",
      status: options.scenarioResults.every(
        (entry) => entry.auditReceiptCount >= entry.readyActionCount
      )
        ? "pass"
        : "fail",
      target: "all ready actions emitted repo audit receipts",
      actual: options.scenarioResults
        .map(
          (entry) => `${entry.id}:receipts=${entry.auditReceiptCount}/${entry.readyActionCount}`
        )
        .join(" | "),
      detail:
        "Every ready repo lane should leave behind a bounded audit receipt so the next agent pass starts from findings instead of planner prose only."
    },
    {
      id: "roundtable-runtime-execution-receipts",
      status: options.scenarioResults.every(
        (entry) => entry.executionReceiptCount >= entry.readyActionCount
      )
        ? "pass"
        : "fail",
      target: "all ready actions emitted bounded execution receipts",
      actual: options.scenarioResults
        .map(
          (entry) => `${entry.id}:receipts=${entry.executionReceiptCount}/${entry.readyActionCount}`
        )
        .join(" | "),
      detail:
        "Every ready repo lane should leave behind a bounded execution receipt so the live mediated path proves it actually ran its isolated audit task."
    },
    {
      id: "roundtable-runtime-audit-captured",
      status: options.scenarioResults.every(
        (entry) =>
          entry.recordedActionCount >= entry.readyActionCount &&
          entry.executionBundleCount >= entry.readyActionCount &&
          entry.executionReceiptCount >= entry.readyActionCount &&
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
      seedAcceptedCount: options.scenarioResults.filter((entry) => entry.seedAccepted).length,
      mediationAcceptedCount: options.scenarioResults.filter((entry) => entry.mediationAccepted).length,
      repoCoverageP50: median(options.scenarioResults.map((entry) => entry.repoCoverageCount)),
      materializedActionsP50: median(options.scenarioResults.map((entry) => entry.materializedActionCount)),
      probedActionsP50: median(options.scenarioResults.map((entry) => entry.probedActionCount)),
      authorityBoundActionsP50: median(options.scenarioResults.map((entry) => entry.authorityBoundActionCount)),
      executionBundlesP50: median(options.scenarioResults.map((entry) => entry.executionBundleCount)),
      executionReadyP50: median(options.scenarioResults.map((entry) => entry.executionReadyCount)),
      taskDocumentsP50: median(options.scenarioResults.map((entry) => entry.taskDocumentCount)),
      auditReceiptsP50: median(options.scenarioResults.map((entry) => entry.auditReceiptCount)),
      executionReceiptsP50: median(options.scenarioResults.map((entry) => entry.executionReceiptCount)),
      workspaceScopedTurnsP50: median(options.scenarioResults.map((entry) => entry.workspaceScopedTurnCount)),
      recordedActionsP50: median(options.scenarioResults.map((entry) => entry.recordedActionCount)),
      trackedFilesP50: median(options.scenarioResults.map((entry) => entry.trackedFileCountP50)),
      runnerPathP95Ms: percentile(options.scenarioResults.map((entry) => entry.totalLatencyMs), 95),
      seedLatencyP95Ms: percentile(options.scenarioResults.map((entry) => entry.seedLatencyMs), 95),
      mediationLatencyP95Ms: percentile(options.scenarioResults.map((entry) => entry.mediationLatencyMs), 95),
      hardware: summarizeHardware(),
      executionIntegrityDigest: sha256Json({
        scenarios: options.scenarioResults.map((entry) => ({
          id: entry.id,
          status: entry.status,
          readyActionCount: entry.readyActionCount,
          materializedActionCount: entry.materializedActionCount,
          probedActionCount: entry.probedActionCount,
          authorityBoundActionCount: entry.authorityBoundActionCount,
          executionBundleCount: entry.executionBundleCount,
          executionReadyCount: entry.executionReadyCount,
          taskDocumentCount: entry.taskDocumentCount,
          auditReceiptCount: entry.auditReceiptCount,
          executionReceiptCount: entry.executionReceiptCount,
          recordedActionCount: entry.recordedActionCount,
          scheduleRoundtableActionCount: entry.scheduleRoundtableActionCount,
          scheduleRoundtableRepoCount: entry.scheduleRoundtableRepoCount,
          sessionScopePreserved: entry.sessionScopePreserved
        })),
        assertions
        ,
        readiness: options.readiness
      }),
      decisionTraceStatus: "pending",
      decisionTraceEventCount: 0,
      decisionTraceFindingCount: 0
    },
    scenarios: options.scenarioResults.map((entry) => ({
      id: entry.id,
      label: entry.label,
      status: entry.status,
      seedStatus: entry.seedStatus,
      mediationStatus: entry.mediationStatus,
      seedAccepted: entry.seedAccepted,
      mediationAccepted: entry.mediationAccepted,
      routeSuggestion: entry.routeSuggestion,
      guardVerdict: entry.guardVerdict,
      repoCoverageCount: entry.repoCoverageCount,
      materializedActionCount: entry.materializedActionCount,
      probedActionCount: entry.probedActionCount,
      authorityBoundActionCount: entry.authorityBoundActionCount,
      executionBundleCount: entry.executionBundleCount,
      executionReadyCount: entry.executionReadyCount,
      taskDocumentCount: entry.taskDocumentCount,
      auditReceiptCount: entry.auditReceiptCount,
      executionReceiptCount: entry.executionReceiptCount,
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
    },
    readiness: options.readiness
  };
}

function applyDecisionTraceIntegrity(
  report: RoundtableRuntimeSurface,
  integrity: DecisionTraceIntegrityReport
): RoundtableRuntimeSurface {
  return {
    ...report,
    benchmark: {
      ...report.benchmark,
      decisionTraceStatus: integrity.status,
      decisionTraceEventCount: integrity.eventCount,
      decisionTraceHeadHash: integrity.headEventHash,
      decisionTraceFindingCount: integrity.findingCount
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
  readiness: HarnessReadinessSummary;
}): RoundtableRuntimeSurface {
  return {
    generatedAt: new Date().toISOString(),
    release: options.release,
    benchmark: {
      harnessUrl: options.harnessUrl,
      scenarioCount: 0,
      failedAssertions: 1,
      seedAcceptedCount: 0,
      mediationAcceptedCount: 0,
      repoCoverageP50: 0,
      materializedActionsP50: 0,
      probedActionsP50: 0,
      authorityBoundActionsP50: 0,
      executionBundlesP50: 0,
      executionReadyP50: 0,
      taskDocumentsP50: 0,
      auditReceiptsP50: 0,
      executionReceiptsP50: 0,
      workspaceScopedTurnsP50: 0,
      recordedActionsP50: 0,
      trackedFilesP50: 0,
      runnerPathP95Ms: 0,
      seedLatencyP95Ms: 0,
      mediationLatencyP95Ms: 0,
      hardware: summarizeHardware(),
      executionIntegrityDigest: sha256Json({
        harnessUrl: options.harnessUrl,
        failed: options.message
      }),
      decisionTraceStatus: "pending",
      decisionTraceEventCount: 0,
      decisionTraceFindingCount: 0
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
    },
    readiness: options.readiness
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
    `- Seed accepted scenarios: \`${report.benchmark.seedAcceptedCount}/${report.benchmark.scenarioCount}\``,
    `- Mediation accepted scenarios: \`${report.benchmark.mediationAcceptedCount}/${report.benchmark.scenarioCount}\``,
    `- Repo coverage P50: \`${report.benchmark.repoCoverageP50}\``,
    `- Materialized actions P50: \`${report.benchmark.materializedActionsP50}\``,
    `- Probed actions P50: \`${report.benchmark.probedActionsP50}\``,
    `- Branch-authority matches P50: \`${report.benchmark.authorityBoundActionsP50}\``,
    `- Execution bundles P50: \`${report.benchmark.executionBundlesP50}\``,
    `- Execution-ready lanes P50: \`${report.benchmark.executionReadyP50}\``,
    `- Task documents P50: \`${report.benchmark.taskDocumentsP50}\``,
    `- Audit receipts P50: \`${report.benchmark.auditReceiptsP50}\``,
    `- Execution receipts P50: \`${report.benchmark.executionReceiptsP50}\``,
    `- Recorded roundtable actions P50: \`${report.benchmark.recordedActionsP50}\``,
    `- Workspace-scoped turns P50: \`${report.benchmark.workspaceScopedTurnsP50}\``,
    `- Tracked files P50: \`${report.benchmark.trackedFilesP50}\``,
    `- Seed latency P95: \`${report.benchmark.seedLatencyP95Ms}\` ms`,
    `- Mediation latency P95: \`${report.benchmark.mediationLatencyP95Ms}\` ms`,
    `- Runner path latency P95: \`${report.benchmark.runnerPathP95Ms}\` ms`,
    `- Hardware: ${report.benchmark.hardware}`,
    `- Execution integrity digest: \`${report.benchmark.executionIntegrityDigest.slice(0, 16)}\``,
    `- Decision trace ledger: \`${report.benchmark.decisionTraceStatus}\``,
    `- Decision trace events: \`${report.benchmark.decisionTraceEventCount}\``,
    `- Decision trace findings: \`${report.benchmark.decisionTraceFindingCount}\``,
    `- Decision trace head hash: \`${report.benchmark.decisionTraceHeadHash?.slice(0, 16) ?? "none"}\``,
    "",
    "## Shared Readiness",
    "",
    `- Mission-surface ready: \`${report.readiness.missionSurfaceReady}\``,
    `- Summary: ${report.readiness.summary}`,
    `- ledger.public: \`${report.readiness.ledger.public.status}\`${report.readiness.ledger.public.endpoint ? ` @ \`${report.readiness.ledger.public.endpoint}\`` : ""} | ${report.readiness.ledger.public.detail}`,
    `- ledger.private: \`${report.readiness.ledger.private.status}\`${report.readiness.ledger.private.endpoint ? ` @ \`${report.readiness.ledger.private.endpoint}\`` : ""} | ${report.readiness.ledger.private.detail}`,
    `- q.local: \`${report.readiness.q.local.status}\`${report.readiness.q.local.endpoint ? ` @ \`${report.readiness.q.local.endpoint}\`` : ""} | ${report.readiness.q.local.detail}`,
    `- q.oci: \`${report.readiness.q.oci.status}\`${report.readiness.q.oci.endpoint ? ` @ \`${report.readiness.q.oci.endpoint}\`` : ""} | ${report.readiness.q.oci.detail}`,
    `- discord.transport: \`${report.readiness.discord.transport.status}\`${report.readiness.discord.transport.endpoint ? ` @ \`${report.readiness.discord.transport.endpoint}\`` : ""} | ${report.readiness.discord.transport.detail}`,
    "",
    "## Scenarios",
    "",
    ...report.scenarios.map((scenario) =>
      [
        `### ${scenario.label}`,
        "",
        `- Status: \`${scenario.status}\``,
        `- Seed status: \`${scenario.seedStatus}\` / accepted \`${scenario.seedAccepted}\``,
        `- Mediation status: \`${scenario.mediationStatus}\` / accepted \`${scenario.mediationAccepted}\``,
        `- Route suggestion: \`${scenario.routeSuggestion ?? "unknown"}\``,
        `- Guard verdict: \`${scenario.guardVerdict ?? "unknown"}\``,
        `- Repo coverage: \`${scenario.repoCoverageCount}\``,
        `- Materialized actions: \`${scenario.materializedActionCount}\``,
        `- Probed actions: \`${scenario.probedActionCount}\``,
        `- Branch-authority matches: \`${scenario.authorityBoundActionCount}\``,
        `- Execution bundles: \`${scenario.executionBundleCount}\``,
        `- Execution-ready lanes: \`${scenario.executionReadyCount}\``,
        `- Task documents: \`${scenario.taskDocumentCount}\``,
        `- Audit receipts: \`${scenario.auditReceiptCount}\``,
        `- Execution receipts: \`${scenario.executionReceiptCount}\``,
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

function resolveCanonicalReportPath(repoRoot: string, outputPath: string): string {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, outputPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to write roundtable runtime evidence outside repo root: ${outputPath}`);
  }
  return resolved;
}

export async function writeRoundtableRuntimeCanonicalReport(
  report: RoundtableRuntimeSurface,
  options?: { repoRoot?: string }
): Promise<void> {
  const repoRoot = options?.repoRoot ?? REPO_ROOT;
  await writeJsonArtifact(resolveCanonicalReportPath(repoRoot, report.output.jsonPath), report);
  await writeFile(
    resolveCanonicalReportPath(repoRoot, report.output.markdownPath),
    `${renderMarkdown(report)}\n`,
    "utf8"
  );
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const runId = buildRunId(cli);
  const runRoot = path.join(ROUNDTABLE_RUNTIME_RUNS_ROOT, runId);
  const harnessRuntimeDir = path.join(runRoot, "harness");
  const iterationsRoot = path.join(runRoot, "iterations");
  const decisionTracePath = path.join(runRoot, "decision-trace.ndjson");
  const latestRunPath = path.join(ROUNDTABLE_RUNTIME_ROOT, "latest-run.json");
  const latestReportPath = path.join(ROUNDTABLE_RUNTIME_ROOT, "latest-report.json");
  const failedReportPath = path.join(ROUNDTABLE_RUNTIME_ROOT, "last-failed-report.json");
  const keysPath = path.join(harnessRuntimeDir, "q-api-keys.json");
  const port = await allocateTcpPort();
  const harnessUrl = `http://127.0.0.1:${port}`;
  const release = await resolveReleaseMetadata();
  const ollamaRuntimeDir = path.join(ROUNDTABLE_RUNTIME_ROOT, "ollama");
  const publicLedgerBaseUrl =
    process.env.AROBI_PUBLIC_URL?.trim() || process.env.ASGARD_AROBI_PUBLIC_URL?.trim();
  const privateLedgerBaseUrl =
    process.env.AROBI_PRIVATE_URL?.trim() || process.env.ASGARD_AROBI_PRIVATE_URL?.trim();
  await mkdir(harnessRuntimeDir, { recursive: true });
  await mkdir(iterationsRoot, { recursive: true });
  await mkdir(WIKI_ROOT, { recursive: true });
  const ollamaBootstrap = await bootstrapRoundtableOllama({
    runtimeDir: ollamaRuntimeDir
  });
  const activeOllamaEndpoint = ollamaBootstrap.endpoint;
  const ollamaProcess = ollamaBootstrap.process;

  const iterationArtifacts: RoundtableRuntimeIterationArtifact[] = [];
  let latestReport: RoundtableRuntimeSurface | undefined;
  let latestFailureMessage: string | undefined;
  let harnessProcess: HarnessProcessHandle | undefined;

  try {
    if (shouldAbortRoundtableRuntimeAfterPrewarm(ollamaBootstrap)) {
      const message = `Roundtable runtime local Q prewarm failed at ${activeOllamaEndpoint}: ${
        ollamaBootstrap.prewarmWarning ?? "prewarm did not complete"
      }`;
      const readiness = buildRuntimeReadiness({
        publicLedgerBaseUrl,
        privateLedgerBaseUrl,
        scenarioResults: [],
        qLocalEndpoint: activeOllamaEndpoint
      });
      const failedReport = buildFailedRoundtableRuntimeSurface({
        harnessUrl,
        release,
        message,
        readiness
      });
      const failurePayload = {
        generatedAt: new Date().toISOString(),
        runId,
        latestReport: failedReport,
        latestFailureMessage: message
      };
      await writeJsonArtifact(path.join(runRoot, "bootstrap.json"), {
        runId,
        createdAt: new Date().toISOString(),
        harnessUrl,
        harness: {
          started: false,
          reason: "local Q prewarm failed"
        },
        ollama: {
          requestedEndpoint: DEFAULT_ROUNDTABLE_OLLAMA_URL,
          endpoint: activeOllamaEndpoint,
          runtimeDir: path.relative(REPO_ROOT, ollamaRuntimeDir).replaceAll("\\", "/"),
          spawned: Boolean(ollamaProcess),
          sharedFallbackAllowed: ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK,
          fallbackFrom: ollamaBootstrap.fallbackFrom,
          prewarmReady: ollamaBootstrap.prewarmReady,
          prewarmWarning: ollamaBootstrap.prewarmWarning
        }
      });
      await writeJsonArtifact(latestReportPath, failedReport);
      await writeJsonArtifact(failedReportPath, failurePayload);
      await writeRoundtableRuntimeCanonicalReport(failedReport);
      throw new Error(message);
    }

    harnessProcess = startHarnessProcess({
      repoRoot: REPO_ROOT,
      runtimeDir: harnessRuntimeDir,
      keysPath,
      port,
      ollamaEndpoint: activeOllamaEndpoint
    });
    await writeJsonArtifact(path.join(runRoot, "bootstrap.json"), {
      runId,
      createdAt: new Date().toISOString(),
      harnessUrl,
      harness: {
        stdoutPath: path.relative(REPO_ROOT, harnessProcess.stdoutPath).replaceAll("\\", "/"),
        stderrPath: path.relative(REPO_ROOT, harnessProcess.stderrPath).replaceAll("\\", "/"),
        startupTracePath: path.relative(REPO_ROOT, harnessProcess.startupTracePath).replaceAll("\\", "/")
      },
      ollama: {
        requestedEndpoint: DEFAULT_ROUNDTABLE_OLLAMA_URL,
        endpoint: activeOllamaEndpoint,
        runtimeDir: path.relative(REPO_ROOT, ollamaRuntimeDir).replaceAll("\\", "/"),
        spawned: Boolean(ollamaProcess),
        sharedFallbackAllowed: ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK,
        fallbackFrom: ollamaBootstrap.fallbackFrom,
        prewarmReady: ollamaBootstrap.prewarmReady,
        prewarmWarning: ollamaBootstrap.prewarmWarning
      }
    });

    await waitForHarness(harnessUrl, harnessProcess);
    await ensureHarnessQRuntimeLayer(harnessUrl, `session:${runId}`);
    if (ollamaBootstrap.prewarmWarning) {
      process.stderr.write(`roundtable-runtime prewarm warning: ${ollamaBootstrap.prewarmWarning}\n`);
    }

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

        const preliminaryReadiness = buildRuntimeReadiness({
          publicLedgerBaseUrl,
          privateLedgerBaseUrl,
          scenarioResults,
          qLocalEndpoint: activeOllamaEndpoint
        });
        const preliminaryReport = buildRoundtableRuntimeSurface({
          harnessUrl,
          scenarioResults,
          release,
          readiness: preliminaryReadiness
        });
        const publicLedger =
          publicLedgerBaseUrl && preliminaryReport.benchmark.failedAssertions === 0
            ? await postArobiRoundtableRecord({
                baseUrl: publicLedgerBaseUrl.replace(/\/+$/, ""),
                visibility: "public",
                runId,
                iterationLabel,
                report: preliminaryReport
              })
            : undefined;
        const privateLedger = privateLedgerBaseUrl
          ? await postArobiRoundtableRecord({
              baseUrl: privateLedgerBaseUrl.replace(/\/+$/, ""),
              visibility: "00",
              runId,
              iterationLabel,
              report: preliminaryReport
            })
          : undefined;
        const readiness = buildRuntimeReadiness({
          publicLedgerBaseUrl,
          privateLedgerBaseUrl,
          publicLedger,
          privateLedger,
          scenarioResults,
          qLocalEndpoint: activeOllamaEndpoint
        });
        const report = buildRoundtableRuntimeSurface({
          harnessUrl,
          scenarioResults,
          release,
          readiness
        });
        const completedAt = new Date().toISOString();
        const pendingArtifact: RoundtableRuntimeIterationArtifact = {
          index: iterationIndex + 1,
          startedAt: iterationStartedAt,
          completedAt,
          durationMs: Number((performance.now() - iterationStarted).toFixed(2)),
          status: report.benchmark.failedAssertions === 0 ? "completed" : "failed",
          reportPath: relativeIterationReportFile,
          tracePath: relativeDecisionTraceFile,
          failedAssertions: report.benchmark.failedAssertions
        };
        await writeJsonArtifact(iterationReportFile, {
          runId,
          iteration: pendingArtifact,
          report,
          arobiLedger: {
            public: publicLedger,
            private: privateLedger
          }
        });
        const decisionTrace = await appendRoundtableRuntimeTrace({
          runtimeRoot: ROUNDTABLE_RUNTIME_ROOT,
          runId,
          iterationIndex,
          iterationsRequested: cli.iterations,
          intervalMs: cli.intervalMs,
          report,
          release
        });
        await appendDecisionTraceMirrorRecord({
          filePath: decisionTracePath,
          record: decisionTrace
        });
        const decisionTraceIntegrity = await inspectDecisionTraceFile(decisionTracePath);
        const integrityReport = applyDecisionTraceIntegrity(report, decisionTraceIntegrity);
        const artifact: RoundtableRuntimeIterationArtifact = {
          ...pendingArtifact,
          status: integrityReport.benchmark.failedAssertions === 0 ? "completed" : "failed",
          decisionTraceId: decisionTrace.decisionTraceId,
          failedAssertions: integrityReport.benchmark.failedAssertions
        };

        await writeJsonArtifact(iterationReportFile, {
          runId,
          iteration: artifact,
          report: integrityReport,
          decisionTrace,
          arobiLedger: {
            public: publicLedger,
            private: privateLedger
          },
          decisionTraceIntegrity
        });
        iterationArtifacts.push(artifact);
        latestReport = integrityReport;
        if (integrityReport.benchmark.failedAssertions > 0) {
          latestFailureMessage =
            latestFailureMessage ??
            `Roundtable runtime iteration ${iterationLabel} failed ${integrityReport.benchmark.failedAssertions} assertion(s).`;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown roundtable runtime iteration error.";
        const readiness = buildRuntimeReadiness({
          publicLedgerBaseUrl,
          privateLedgerBaseUrl,
          scenarioResults: [],
          qLocalEndpoint: activeOllamaEndpoint
        });
        const failedReport = buildFailedRoundtableRuntimeSurface({
          harnessUrl,
          release,
          message,
          readiness
        });
        const completedAt = new Date().toISOString();
        const pendingArtifact: RoundtableRuntimeIterationArtifact = {
          index: iterationIndex + 1,
          startedAt: iterationStartedAt,
          completedAt,
          durationMs: Number((performance.now() - iterationStarted).toFixed(2)),
          status: "failed",
          reportPath: relativeIterationReportFile,
          tracePath: relativeDecisionTraceFile,
          failedAssertions: failedReport.benchmark.failedAssertions,
          error: message
        };
        await writeJsonArtifact(iterationReportFile, {
          runId,
          iteration: pendingArtifact,
          report: failedReport,
          error: message
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
        await appendDecisionTraceMirrorRecord({
          filePath: decisionTracePath,
          record: decisionTrace
        });
        const decisionTraceIntegrity = await inspectDecisionTraceFile(decisionTracePath);
        const integrityReport = applyDecisionTraceIntegrity(failedReport, decisionTraceIntegrity);
        const artifact: RoundtableRuntimeIterationArtifact = {
          ...pendingArtifact,
          status: "failed",
          decisionTraceId: decisionTrace.decisionTraceId,
          failedAssertions: integrityReport.benchmark.failedAssertions,
          error: message
        };

        await writeJsonArtifact(iterationReportFile, {
          runId,
          iteration: artifact,
          report: integrityReport,
          decisionTrace,
          error: message,
          decisionTraceIntegrity
        });
        iterationArtifacts.push(artifact);
        latestReport = integrityReport;
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
    await writeRoundtableRuntimeCanonicalReport(latestReport);

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

    process.stdout.write(
      `${JSON.stringify(
        cli.iterations === 1 ? latestReport : manifest,
        null,
        2
      )}\n`
    );
  } finally {
    await stopHarnessProcess(harnessProcess);
    await stopOllamaProcess(ollamaProcess);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : "Roundtable runtime benchmark failed.");
    process.exitCode = 1;
  });
}
