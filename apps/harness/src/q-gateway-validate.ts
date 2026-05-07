import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createPersistence } from "./persistence.js";
import { createQApiKeyRegistry, normalizeQApiRateLimitPolicy } from "./q-api-auth.js";
import { resolveQLocalOllamaUrl } from "./q-local-model.js";
import {
  getImmaculateHarnessName,
  getQDeveloperName,
  getQFoundationModelName,
  getQLeadName,
  getQModelName,
  getQModelTarget
} from "./q-model.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";
import {
  runOllamaChatCompletion,
  type OllamaChatCompletionResult,
  type OllamaChatMessage
} from "./ollama.js";
import { runOpenAICompatibleResponsesCompletion } from "./openai-compatible.js";
import { runOciIamBridgeResponsesCompletion } from "./oci-iam-bridge.js";
import { resolveQInferenceProfile } from "./q-inference-profile.js";

type ValidationFlags = {
  gatewayUrl: string;
  runtimeDir?: string;
  keysPath?: string;
  httpTimeoutMs: number;
  localQTimeoutMs: number;
};

export type HttpCheck = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  wallLatencyMs: number;
};

type HardwareContext = {
  host: string;
  platform: string;
  arch: string;
  osVersion: string;
  cpuModel: string;
  cpuCount: number;
  memoryGiB: number;
  nodeVersion: string;
};

type PublicReleaseMetadata = Omit<ReleaseMetadata, "q"> & {
  q: Pick<ReleaseMetadata["q"], "modelName" | "foundationModel" | "trainingLock" | "hybridSession">;
};

export type QGatewayValidationReport = {
  generatedAt: string;
  gatewayUrl: string;
  modelName: string;
  foundationModel: string;
  release: PublicReleaseMetadata;
  hardwareContext: HardwareContext;
  checks: {
    health: HttpCheck;
    unauthorizedChat: HttpCheck;
    info: HttpCheck;
    models: HttpCheck;
    authorizedChat: HttpCheck;
    identityChat: HttpCheck;
    concurrentRejection: HttpCheck;
  };
  identity: {
    canonical: boolean;
    responsePreview: string;
  };
  localQFoundationRun: {
    latencyMs: number;
    wallLatencyMs: number;
    responsePreview: string;
    failureClass?: string;
  };
  comparison: {
    gatewayEndToEndLatencyMs: number;
    gatewayUpstreamLatencyMs?: number;
    gatewayAddedLatencyMs?: number;
    localQFoundationLatencyMs: number;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

export type QGatewayValidationWriteResult = {
  published: boolean;
  jsonPath: string;
  markdownPath: string;
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(MODULE_ROOT, "..");
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
export const DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_Q_GATEWAY_LOCAL_Q_TIMEOUT_MS = 300_000;
const MIN_Q_GATEWAY_VALIDATION_TIMEOUT_MS = 250;
const MAX_Q_GATEWAY_VALIDATION_TIMEOUT_MS = 600_000;
const REQUEST_TIMEOUT_OVERRIDE_HEADER = "x-immaculate-request-timeout-ms";
const FAST_SMOKE_HEADER = "x-immaculate-q-fast-smoke";
const FAST_SMOKE_HOLD_HEADER = "x-immaculate-q-fast-smoke-hold-ms";
const LOOPBACK_HOST = "127.0.0.1";
const FAST_SMOKE_OLLAMA_OPTIONS = {
  num_ctx: 768,
  num_batch: 64
};

export function resolveQGatewayValidationTimeoutMs(
  value: string | number | undefined,
  fallbackMs: number
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : fallbackMs;
  const resolved = Number.isFinite(parsed) ? parsed : fallbackMs;
  return Math.round(
    Math.min(
      MAX_Q_GATEWAY_VALIDATION_TIMEOUT_MS,
      Math.max(MIN_Q_GATEWAY_VALIDATION_TIMEOUT_MS, resolved)
    )
  );
}

function parseFlags(argv: string[]): ValidationFlags {
  const flags: ValidationFlags = {
    gatewayUrl: process.env.IMMACULATE_Q_GATEWAY_VALIDATE_URL?.trim() ?? "",
    httpTimeoutMs: resolveQGatewayValidationTimeoutMs(
      process.env.IMMACULATE_Q_GATEWAY_VALIDATE_HTTP_TIMEOUT_MS ??
        process.env.npm_config_http_timeout_ms,
      DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS
    ),
    localQTimeoutMs: resolveQGatewayValidationTimeoutMs(
      process.env.IMMACULATE_Q_GATEWAY_VALIDATE_LOCAL_Q_TIMEOUT_MS ??
        process.env.npm_config_local_q_timeout_ms,
      DEFAULT_Q_GATEWAY_LOCAL_Q_TIMEOUT_MS
    )
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--gateway-url") {
      flags.gatewayUrl = argv[index + 1]?.trim() || flags.gatewayUrl;
      index += 1;
      continue;
    }
    if (token.startsWith("--gateway-url=")) {
      flags.gatewayUrl = token.slice("--gateway-url=".length).trim() || flags.gatewayUrl;
      continue;
    }
    if (token === "--runtime-dir") {
      flags.runtimeDir = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--runtime-dir=")) {
      flags.runtimeDir = token.slice("--runtime-dir=".length).trim();
      continue;
    }
    if (token === "--keys-path") {
      flags.keysPath = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--keys-path=")) {
      flags.keysPath = token.slice("--keys-path=".length).trim();
      continue;
    }
    if (token === "--http-timeout-ms") {
      flags.httpTimeoutMs = resolveQGatewayValidationTimeoutMs(
        argv[index + 1],
        flags.httpTimeoutMs
      );
      index += 1;
      continue;
    }
    if (token.startsWith("--http-timeout-ms=")) {
      flags.httpTimeoutMs = resolveQGatewayValidationTimeoutMs(
        token.slice("--http-timeout-ms=".length),
        flags.httpTimeoutMs
      );
      continue;
    }
    if (token === "--local-q-timeout-ms") {
      flags.localQTimeoutMs = resolveQGatewayValidationTimeoutMs(
        argv[index + 1],
        flags.localQTimeoutMs
      );
      index += 1;
      continue;
    }
    if (token.startsWith("--local-q-timeout-ms=")) {
      flags.localQTimeoutMs = resolveQGatewayValidationTimeoutMs(
        token.slice("--local-q-timeout-ms=".length),
        flags.localQTimeoutMs
      );
    }
  }

  return flags;
}

async function allocateLoopbackGatewayUrl(): Promise<string> {
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, LOOPBACK_HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate an ephemeral loopback port for Q gateway validation."));
        return;
      }
      const allocatedPort = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(allocatedPort);
      });
    });
  });
  return `http://${LOOPBACK_HOST}:${port}`;
}

function captureHardwareContext(): HardwareContext {
  const cpus = os.cpus();
  const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length;
  return {
    host: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    osVersion: os.version(),
    cpuModel: cpus[0]?.model?.trim() || "unknown-cpu",
    cpuCount: Math.max(1, cpuCount),
    memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    nodeVersion: process.version
  };
}

export async function checkHttp(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS
): Promise<HttpCheck> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    controller.abort(callerSignal.reason);
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  try {
    const { signal: _ignoredSignal, ...requestInit } = init ?? {};
    const response = await fetch(url, {
      ...requestInit,
      signal: controller.signal
    });
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
  } catch (error) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new Error(`HTTP check timed out after ${timeoutMs} ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyHttpCheckFailure(error: unknown): string {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("timed out") || message.includes("aborted")) {
    return "transport_timeout";
  }
  return "transport_error";
}

export async function captureHttpCheck(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS
): Promise<HttpCheck> {
  const started = performance.now();
  try {
    return await checkHttp(url, init, timeoutMs);
  } catch (error) {
    return {
      status: 503,
      body: {
        error: "q_gateway_validation_http_failure",
        failureClass: classifyHttpCheckFailure(error),
        message: errorMessage(error)
      },
      headers: {},
      wallLatencyMs: Number((performance.now() - started).toFixed(2))
    };
  }
}

export function isRetryableGatewaySmokeCheck(check: HttpCheck): boolean {
  if (check.status === 429) {
    return true;
  }
  if (check.status !== 503 || !check.body || typeof check.body !== "object") {
    return false;
  }
  const body = check.body as { error?: string; failureClass?: string; message?: string };
  const failureClass = body.failureClass ?? body.error ?? "";
  const transientMessage = `${body.message ?? ""} ${failureClass}`.toLowerCase();
  return (
    failureClass === "transport_timeout" ||
    (failureClass === "http_error" &&
      (transientMessage.includes("econnreset") ||
        transientMessage.includes("econnrefused") ||
        transientMessage.includes("loading model") ||
        transientMessage.includes("model is loading") ||
        transientMessage.includes("timed out")))
  );
}

async function captureGatewaySmokeCheck(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<HttpCheck> {
  const retryDelayMs = Math.min(15_000, Math.max(2_000, Math.floor(timeoutMs / 2)));
  let latest = await captureHttpCheck(url, init, timeoutMs);
  for (let attempt = 1; attempt < 3 && isRetryableGatewaySmokeCheck(latest); attempt += 1) {
    await delay(retryDelayMs);
    latest = await captureHttpCheck(url, init, timeoutMs);
  }
  return latest;
}

export function isRetryableDirectQFoundationSmoke(result: OllamaChatCompletionResult): boolean {
  if (!result.failureClass) {
    return false;
  }
  const preview = result.responsePreview.toLowerCase();
  return (
    result.failureClass === "http_error" &&
    (preview.includes("loading model") ||
      preview.includes("model is loading") ||
      preview.includes("econnreset") ||
      preview.includes("econnrefused") ||
      preview.includes("connection refused") ||
      preview.includes("timed out"))
  );
}

export function shouldRunDirectQFoundationSmokeAfterGateway(check: HttpCheck): boolean {
  const upstreamHeader = check.headers["x-upstream-latency-ms"];
  return check.status === 200 && Number.isFinite(Number(upstreamHeader));
}

async function runDirectQFoundationSmoke(timeoutMs: number): Promise<{
  result: OllamaChatCompletionResult;
  wallLatencyMs: number;
}> {
  const started = performance.now();
  const runAttempt = async (): Promise<OllamaChatCompletionResult> => {
    const profile = resolveQInferenceProfile();
    const messages: OllamaChatMessage[] = [
      {
        role: "system",
        content: "Answer only with final visible text. Do not think. Do not explain."
      },
      {
        role: "user",
        content: "Reply with exactly three words: Gateway is fine."
      }
    ];
    if (profile.provider === "openai-compatible") {
      return runOpenAICompatibleResponsesCompletion({
        profile,
        model: getQModelTarget(),
        messages,
        maxTokens: 128,
        temperature: 0,
        timeoutMs
      });
    }
    if (profile.provider === "oci-iam-bridge") {
      return runOciIamBridgeResponsesCompletion({
        profile,
        model: getQModelTarget(),
        messages,
        maxTokens: 128,
        temperature: 0,
        timeoutMs
      });
    }
    return runOllamaChatCompletion({
      endpoint: resolveQLocalOllamaUrl(),
      model: getQModelTarget(),
      messages,
      maxTokens: 128,
      temperature: 0,
      think: false,
      timeoutMs,
      ollamaOptions: FAST_SMOKE_OLLAMA_OPTIONS
    });
  };
  let latest = await runAttempt();
  for (let attempt = 1; attempt < 3 && isRetryableDirectQFoundationSmoke(latest); attempt += 1) {
    await delay(Math.min(15_000, Math.max(2_000, Math.floor(timeoutMs / 4))));
    latest = await runAttempt();
  }
  return {
    result: latest,
    wallLatencyMs: Number((performance.now() - started).toFixed(2))
  };
}

export function buildQGatewayValidationHeaders(
  apiKey: string,
  options: {
    requestTimeoutMs: number;
    fastSmoke?: boolean;
  }
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    [REQUEST_TIMEOUT_OVERRIDE_HEADER]: String(
      resolveQGatewayValidationTimeoutMs(options.requestTimeoutMs, DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS)
    )
  };
  if (options.fastSmoke) {
    headers[FAST_SMOKE_HEADER] = "true";
  }
  return headers;
}

function parseGatewayPort(gatewayUrl: string): number {
  return Number(new URL(gatewayUrl).port || 80);
}

function resolveGatewayCommand(): { command: string; args: string[] } {
  const compiledGatewayPath = path.join(HARNESS_ROOT, "dist", "q-gateway.js");
  if (existsSync(compiledGatewayPath)) {
    return {
      command: process.execPath,
      args: [compiledGatewayPath]
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
    args: [path.join(HARNESS_ROOT, "src", "q-gateway.ts")]
  };
}

function startGatewayProcess(options: {
  runtimeDir: string;
  keysPath: string;
  port: number;
  gatewayTimeoutMs: number;
}): ChildProcess {
  const gateway = resolveGatewayCommand();
  return spawn(gateway.command, gateway.args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      IMMACULATE_RUNTIME_DIR: options.runtimeDir,
      IMMACULATE_Q_API_KEYS_PATH: options.keysPath,
      IMMACULATE_Q_GATEWAY_HOST: LOOPBACK_HOST,
      IMMACULATE_Q_GATEWAY_PORT: String(options.port),
      IMMACULATE_Q_GATEWAY_TIMEOUT_MS: String(options.gatewayTimeoutMs),
      IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT: "1"
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function stopGatewayProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  child.kill();
  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    delay(5_000).then(() => undefined)
  ]);
}

export function hasOpenGatewayCircuit(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const circuit = (body as { circuit?: { state?: unknown } }).circuit;
  return circuit?.state === "open";
}

async function ensureGatewayAvailable(options: {
  gatewayUrl: string;
  runtimeDir: string;
  keysPath: string;
  httpTimeoutMs: number;
  validationHeaders: Record<string, string>;
}): Promise<{
  child?: ChildProcess;
  gatewayUrl: string;
}> {
  const healthTimeoutMs = Math.min(options.httpTimeoutMs, 5_000);
  let gatewayUrl = options.gatewayUrl;
  try {
    const health = await checkHttp(`${gatewayUrl}/health`, undefined, healthTimeoutMs);
    if (health.status === 200) {
      const authCheck = await checkHttp(
        `${gatewayUrl}/api/q/info`,
        { headers: options.validationHeaders },
        healthTimeoutMs
      );
      if (authCheck.status === 200 && !hasOpenGatewayCircuit(health.body) && !hasOpenGatewayCircuit(authCheck.body)) {
        return {
          gatewayUrl
        };
      }
      gatewayUrl = await allocateLoopbackGatewayUrl();
    }
  } catch {
    // Start a local ephemeral gateway below.
  }

  const child = startGatewayProcess({
    runtimeDir: options.runtimeDir,
    keysPath: options.keysPath,
    port: parseGatewayPort(gatewayUrl),
    gatewayTimeoutMs: options.httpTimeoutMs
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const health = await checkHttp(`${gatewayUrl}/health`, undefined, healthTimeoutMs);
      if (health.status === 200) {
        const authCheck = await checkHttp(
          `${gatewayUrl}/api/q/info`,
          { headers: options.validationHeaders },
          healthTimeoutMs
        );
        if (authCheck.status === 200 && !hasOpenGatewayCircuit(health.body) && !hasOpenGatewayCircuit(authCheck.body)) {
          return {
            child,
            gatewayUrl
          };
        }
        lastError = new Error(`Gateway authenticated info returned ${authCheck.status}.`);
      } else {
        lastError = new Error(`Gateway health returned ${health.status}.`);
      }
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  await stopGatewayProcess(child);
  throw lastError instanceof Error ? lastError : new Error("Q gateway did not become healthy in time.");
}

function renderMarkdown(report: QGatewayValidationReport): string {
  return [
    "# Q Gateway Validation",
    "",
    "This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct configured Q inference call against the same Q stack.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: ${report.release.buildId}`,
    `- Repo commit: ${report.release.gitShortSha}`,
    `- Gateway URL: ${report.gatewayUrl}`,
    `- Q model name: ${report.modelName}`,
    `- Q foundation model: ${report.foundationModel}`,
    `- Q training bundle: ${report.release.q.trainingLock?.bundleId ?? "none generated yet"}`,
    `- Hardware: ${JSON.stringify(report.hardwareContext)}`,
    "",
    "## Contract Checks",
    "",
    `- /health: \`${report.checks.health.status}\` in \`${report.checks.health.wallLatencyMs}\` ms`,
    `- unauthorized /v1/chat/completions: \`${report.checks.unauthorizedChat.status}\``,
    `- authenticated /api/q/info: \`${report.checks.info.status}\``,
    `- authenticated /v1/models: \`${report.checks.models.status}\``,
    `- authenticated /v1/chat/completions: \`${report.checks.authorizedChat.status}\` in \`${report.checks.authorizedChat.wallLatencyMs}\` ms`,
    `- authenticated identity smoke: \`${report.checks.identityChat.status}\` | canonical \`${report.identity.canonical}\``,
    `- concurrent rejection: \`${report.checks.concurrentRejection.status}\``,
    "",
    "## Identity Smoke",
    "",
    `- preview: ${report.identity.responsePreview}`,
    "",
    "## Latency Comparison",
    "",
    `- gateway end-to-end latency: \`${report.comparison.gatewayEndToEndLatencyMs}\` ms`,
    `- gateway upstream latency header: \`${report.comparison.gatewayUpstreamLatencyMs ?? "n/a"}\` ms`,
    `- gateway added latency: \`${report.comparison.gatewayAddedLatencyMs ?? "n/a"}\` ms`,
    `- direct configured Q inference latency: \`${report.comparison.localQFoundationLatencyMs}\` ms`,
    "",
    "## Direct Q Inference Result",
    "",
    `- failure class: \`${report.localQFoundationRun.failureClass ?? "none"}\``,
    `- latency: \`${report.localQFoundationRun.latencyMs}\` ms`,
    `- wall latency: \`${report.localQFoundationRun.wallLatencyMs}\` ms`,
    `- preview: ${report.localQFoundationRun.responsePreview}`
  ].join("\n");
}

export function isQGatewayValidationAccepted(report: Pick<
  QGatewayValidationReport,
  "checks" | "identity" | "localQFoundationRun" | "comparison"
>): boolean {
  return (
    report.checks.health.status === 200 &&
    report.checks.unauthorizedChat.status === 401 &&
    report.checks.info.status === 200 &&
    report.checks.models.status === 200 &&
    report.checks.authorizedChat.status === 200 &&
    report.checks.identityChat.status === 200 &&
    Number.isFinite(report.comparison.gatewayUpstreamLatencyMs) &&
    report.identity.canonical &&
    report.checks.concurrentRejection.status === 429 &&
    !report.localQFoundationRun.failureClass
  );
}

export async function writeQGatewayValidationReport(
  report: QGatewayValidationReport,
  options: {
    accepted: boolean;
    repoRoot?: string;
    runtimeDir: string;
  }
): Promise<QGatewayValidationWriteResult> {
  if (options.accepted) {
    const repoRoot = options.repoRoot ?? REPO_ROOT;
    const jsonPath = path.join(repoRoot, report.output.jsonPath);
    const markdownPath = path.join(repoRoot, report.output.markdownPath);
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderMarkdown(report)}\n`, "utf8");
    return {
      published: true,
      jsonPath,
      markdownPath
    };
  }

  const failureRoot = path.join(options.runtimeDir, "q-gateway-validation");
  const jsonPath = path.join(failureRoot, "latest-failed.json");
  const markdownPath = path.join(failureRoot, "latest-failed.md");
  await mkdir(failureRoot, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${renderMarkdown(report)}\n`, "utf8");
  return {
    published: false,
    jsonPath,
    markdownPath
  };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractChatContent(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const choices = (body as { choices?: Array<{ message?: { content?: string } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function isCanonicalIdentityResponse(value: string): boolean {
  const normalized = normalizeText(value);
  return [
    normalizeText(getQModelName()),
    normalizeText(getQDeveloperName()),
    normalizeText(getQLeadName()),
    normalizeText(getQFoundationModelName()),
    normalizeText(getImmaculateHarnessName())
  ].every((token) => normalized.includes(token));
}

async function resetValidationProgress(runtimeDir: string): Promise<void> {
  const logRoot = path.join(runtimeDir, "q-gateway-validation");
  await mkdir(logRoot, { recursive: true });
  await writeFile(
    path.join(logRoot, "last-run.log"),
    `${new Date().toISOString()} q_gateway_validation_start\n`,
    "utf8"
  );
}

async function writeValidationProgress(runtimeDir: string, message: string): Promise<void> {
  const logRoot = path.join(runtimeDir, "q-gateway-validation");
  await mkdir(logRoot, { recursive: true });
  await appendFile(
    path.join(logRoot, "last-run.log"),
    `${new Date().toISOString()} ${message}\n`,
    "utf8"
  );
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const persistence = createPersistence(flags.runtimeDir);
  const runtimeDir = persistence.getStatus().rootDir;
  await resetValidationProgress(runtimeDir);
  const keysPath =
    flags.keysPath?.trim() ||
    process.env.IMMACULATE_Q_API_KEYS_PATH ||
    path.join(runtimeDir, "q-api-keys.json");
  const registry = await createQApiKeyRegistry({
    rootDir: runtimeDir,
    storePath: keysPath,
    defaultRateLimit: normalizeQApiRateLimitPolicy(undefined, {
      requestsPerMinute: 30,
      burst: 30,
      maxConcurrentRequests: 1
    })
  });

  const created = await registry.createKey({
    label: `q-gateway-validation-${Date.now().toString(36)}`,
    rateLimit: {
      requestsPerMinute: 30,
      burst: 30,
      maxConcurrentRequests: 1
    }
  });

  let spawnedGateway: ChildProcess | undefined;

  try {
    let gatewayUrl = (flags.gatewayUrl.trim() || (await allocateLoopbackGatewayUrl())).replace(
      /\/+$/,
      ""
    );
    const gatewayHeaders = buildQGatewayValidationHeaders(created.plainTextKey, {
      requestTimeoutMs: flags.httpTimeoutMs
    });
    const fastGatewayHeaders = buildQGatewayValidationHeaders(created.plainTextKey, {
      requestTimeoutMs: flags.httpTimeoutMs,
      fastSmoke: true
    });
    await writeValidationProgress(runtimeDir, `gateway_ensure_start url=${gatewayUrl}`);
    const gatewayAvailability = await ensureGatewayAvailable({
      gatewayUrl,
      runtimeDir,
      keysPath,
      httpTimeoutMs: flags.httpTimeoutMs,
      validationHeaders: gatewayHeaders
    });
    gatewayUrl = gatewayAvailability.gatewayUrl;
    spawnedGateway = gatewayAvailability.child;
    await writeValidationProgress(runtimeDir, `gateway_ensure_done url=${gatewayUrl}`);
    const chatMessages: OllamaChatMessage[] = [
      {
        role: "system",
        content: "Reply briefly and directly."
      },
      {
        role: "user",
        content: "Reply with exactly three words that confirm the Q gateway is healthy."
      }
    ];
    const chatBody = {
      model: getQModelName(),
      messages: chatMessages,
      max_tokens: 64,
      temperature: 0.1,
      stream: false
    };

    await writeValidationProgress(runtimeDir, "gateway_checks_start");
    const health = await captureHttpCheck(`${gatewayUrl}/health`, undefined, flags.httpTimeoutMs);
    const unauthorizedChat = await captureHttpCheck(
      `${gatewayUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(chatBody)
      },
      flags.httpTimeoutMs
    );
    const info = await captureHttpCheck(
      `${gatewayUrl}/api/q/info`,
      {
        headers: gatewayHeaders
      },
      flags.httpTimeoutMs
    );
    const models = await captureHttpCheck(
      `${gatewayUrl}/v1/models`,
      {
        headers: gatewayHeaders
      },
      flags.httpTimeoutMs
    );
    const identityBody = {
      model: getQModelName(),
      messages: [
        {
          role: "user",
          content:
            "Who are you, who developed you, who led the project, what are you built on, and what is Immaculate?"
        }
      ],
      max_tokens: 192,
      temperature: 0.05,
      stream: false
    };
    const authorizedChat = await captureGatewaySmokeCheck(
      `${gatewayUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: fastGatewayHeaders,
        body: JSON.stringify(chatBody)
      },
      flags.httpTimeoutMs
    );
    const identityChat = await captureGatewaySmokeCheck(
      `${gatewayUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: fastGatewayHeaders,
        body: JSON.stringify(identityBody)
      },
      flags.httpTimeoutMs
    );
    const identityContent = extractChatContent(identityChat.body);
    const identityCanonical = identityChat.status === 200 && isCanonicalIdentityResponse(identityContent);
    await writeValidationProgress(
      runtimeDir,
      `gateway_smoke_checks_done authorized=${authorizedChat.status} identity=${identityChat.status}`
    );

    const concurrentPrimary = captureHttpCheck(
      `${gatewayUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          ...fastGatewayHeaders,
          [FAST_SMOKE_HOLD_HEADER]: "1000"
        },
        body: JSON.stringify(chatBody)
      },
      flags.httpTimeoutMs
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const concurrentRejection = await captureHttpCheck(
      `${gatewayUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: fastGatewayHeaders,
        body: JSON.stringify(chatBody)
      },
      flags.httpTimeoutMs
    );
    await concurrentPrimary.catch(() => undefined);
    await writeValidationProgress(
      runtimeDir,
      `gateway_concurrency_done status=${concurrentRejection.status}`
    );

    const upstreamHeader = authorizedChat.headers["x-upstream-latency-ms"];
    const gatewayUpstreamLatencyMs =
      typeof upstreamHeader === "string" && upstreamHeader.trim().length > 0
        ? Number(upstreamHeader)
        : undefined;
    const runDirectSmoke = shouldRunDirectQFoundationSmokeAfterGateway(authorizedChat);
    let directSmoke:
      | {
          result: OllamaChatCompletionResult;
          wallLatencyMs: number;
        }
      | undefined;
    if (runDirectSmoke) {
      await writeValidationProgress(runtimeDir, "direct_q_smoke_start");
      directSmoke = await runDirectQFoundationSmoke(flags.localQTimeoutMs);
      await writeValidationProgress(
        runtimeDir,
        `direct_q_smoke_done failure=${directSmoke.result.failureClass ?? "none"} latency_ms=${directSmoke.wallLatencyMs}`
      );
    } else {
      await writeValidationProgress(
        runtimeDir,
        `direct_q_smoke_skipped authorized=${authorizedChat.status} upstream_latency=${upstreamHeader ?? "missing"}`
      );
    }
    const direct =
      directSmoke?.result ??
      ({
        response: "",
        model: getQModelTarget(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        latencyMs: 0,
        done: false,
        thinkingDetected: false,
        responsePreview: "Skipped direct Q smoke because gateway upstream proof was not available.",
        failureClass: "contract_invalid",
        errorMessage: "Gateway upstream proof was not available."
      } satisfies OllamaChatCompletionResult);
    const directWallLatencyMs = directSmoke?.wallLatencyMs ?? 0;
    const release = await resolveReleaseMetadata();
    const publicRelease: PublicReleaseMetadata = {
      ...release,
      q: {
        modelName: release.q.modelName,
        foundationModel: release.q.foundationModel,
        trainingLock: release.q.trainingLock,
        hybridSession: release.q.hybridSession
      }
    };

    const report: QGatewayValidationReport = {
      generatedAt: new Date().toISOString(),
      gatewayUrl,
      modelName: getQModelName(),
      foundationModel: getQFoundationModelName(),
      release: publicRelease,
      hardwareContext: captureHardwareContext(),
      checks: {
        health,
        unauthorizedChat,
        info,
        models,
        authorizedChat,
        identityChat,
        concurrentRejection
      },
      identity: {
        canonical: identityCanonical,
        responsePreview: identityContent || "[missing identity response]"
      },
      localQFoundationRun: {
        latencyMs: direct.latencyMs,
        wallLatencyMs: directWallLatencyMs,
        responsePreview: direct.responsePreview,
        failureClass: direct.failureClass
      },
      comparison: {
        gatewayEndToEndLatencyMs: authorizedChat.wallLatencyMs,
        gatewayUpstreamLatencyMs,
        gatewayAddedLatencyMs:
          typeof gatewayUpstreamLatencyMs === "number"
            ? Number((authorizedChat.wallLatencyMs - gatewayUpstreamLatencyMs).toFixed(2))
            : undefined,
        localQFoundationLatencyMs: direct.latencyMs
      },
      output: {
        jsonPath: path.join("docs", "wiki", "Q-Gateway-Validation.json"),
        markdownPath: path.join("docs", "wiki", "Q-Gateway-Validation.md")
      }
    };

    const accepted = isQGatewayValidationAccepted(report);
    await writeValidationProgress(runtimeDir, `report_built accepted=${accepted}`);
    const writeResult = await writeQGatewayValidationReport(report, {
      accepted,
      repoRoot: REPO_ROOT,
      runtimeDir
    });

    if (!accepted) {
      await writeValidationProgress(runtimeDir, "validation_rejected");
      throw new Error(
        `Q gateway validation did not satisfy the expected contract. Failure evidence: ${writeResult.jsonPath}`
      );
    }
    await writeValidationProgress(runtimeDir, "validation_accepted");

    process.stdout.write(
      `${JSON.stringify(
        {
          accepted: true,
          gatewayUrl,
          output: {
            jsonPath: writeResult.jsonPath,
            markdownPath: writeResult.markdownPath
          },
          authorizedChatStatus: authorizedChat.status,
          concurrentRejectionStatus: concurrentRejection.status
        },
        null,
        2
      )}\n`
    );
  } finally {
    await registry.revokeKey(created.key.keyId).catch(() => undefined);
    await stopGatewayProcess(spawnedGateway);
  }
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main().catch((error) => {
    const message =
      error instanceof Error
        ? error.stack || error.message || error.name || "Q gateway validation failed."
        : "Q gateway validation failed.";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
