import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  createEngine,
  type GovernancePressureLevel
} from "@immaculate/core";
import { buildExecutionArbitrationDecision, planExecutionArbitration } from "./arbitration.js";
import { createQApiKeyRegistry, normalizeQApiRateLimitPolicy } from "./q-api-auth.js";
import { parseStructuredResponse } from "./ollama.js";
import { getQModelAlias, getQModelTarget, truthfulModelLabel } from "./q-model.js";
import { resolveReleaseMetadata } from "./release-metadata.js";

type HttpCheck = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  wallLatencyMs: number;
};

type QGatewaySubstrateScenarioResult = {
  id: string;
  label: string;
  status: "completed" | "failed";
  parseSuccess: boolean;
  structuredFieldCount: number;
  latencyMs: number;
  arbitrationLatencyMs: number;
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
  responsePreview: string;
  arbitrationMode: string;
  arbitrationGovernancePressure: GovernancePressureLevel;
  shouldDispatchActuation: boolean;
  guardDeniedCount: number;
  failureClass?: string;
};

export type QGatewaySubstrateBenchmarkResult = {
  gatewayUrl: string;
  qTrainingBundleId?: string;
  checks: {
    health: HttpCheck;
    unauthorizedChat: HttpCheck;
    info: HttpCheck;
    models: HttpCheck;
    concurrency: HttpCheck;
  };
  scenarioResults: QGatewaySubstrateScenarioResult[];
};

type ScenarioDefinition = {
  id: string;
  label: string;
  objective: string;
  context: string;
  governancePressure: GovernancePressureLevel;
  guardDeniedCount: number;
  expectedPressure: GovernancePressureLevel;
  expectDispatchAllowed: boolean;
};

const DEFAULT_OLLAMA_URL = process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../..");

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "elevated-recovery",
    label: "Elevated recovery arbitration",
    objective:
      "Choose the next route for a federated repair flow with lease jitter, one failed execution, and healthy HTTP/2 fallback.",
    context:
      "Respond with ROUTE, REASON, and COMMIT only. Keep the route bounded, truthful, and suitable for elevated governance pressure.",
    governancePressure: "elevated",
    guardDeniedCount: 1,
    expectedPressure: "elevated",
    expectDispatchAllowed: true
  },
  {
    id: "critical-guard-hold",
    label: "Critical guard hold",
    objective:
      "Choose the next route when subject-scoped actuation already has repeated guard denials and the system must fail closed.",
    context:
      "Respond with ROUTE, REASON, and COMMIT only. The result must remain bounded under critical governance pressure and avoid pretending dispatch is allowed.",
    governancePressure: "critical",
    guardDeniedCount: 3,
    expectedPressure: "critical",
    expectDispatchAllowed: false
  }
];

function truncate(value: string, limit = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
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
          reject(new Error("Unable to allocate a loopback TCP port for Q gateway substrate benchmark."));
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

async function waitForGateway(gatewayUrl: string): Promise<HttpCheck> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const health = await checkHttp(`${gatewayUrl}/health`);
      if (
        health.status === 200 &&
        typeof health.body === "object" &&
        health.body !== null &&
        (health.body as { ok?: boolean; modelReady?: boolean }).ok === true &&
        (health.body as { modelReady?: boolean }).modelReady === true
      ) {
        return health;
      }
      lastError = new Error(`Gateway health returned ${health.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error ? lastError : new Error("Q gateway did not become healthy in time.");
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
  repoRoot: string;
  runtimeDir: string;
  keysPath: string;
  port: number;
}): ChildProcess {
  const gateway = resolveGatewayCommand();
  return spawn(gateway.command, gateway.args, {
    cwd: options.repoRoot,
    env: {
      ...process.env,
      IMMACULATE_RUNTIME_DIR: options.runtimeDir,
      IMMACULATE_Q_API_KEYS_PATH: options.keysPath,
      IMMACULATE_Q_GATEWAY_HOST: "127.0.0.1",
      IMMACULATE_Q_GATEWAY_PORT: String(options.port),
      IMMACULATE_OLLAMA_URL: DEFAULT_OLLAMA_URL,
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

function buildStructuredPrompt(scenario: ScenarioDefinition): { system: string; user: string } {
  return {
    system:
      "You are Q inside Immaculate. Reply using exactly three lines and no extra text. ROUTE, REASON, and COMMIT must each be one sentence.",
    user: [
      `OBJECTIVE: ${scenario.objective}`,
      `CONTEXT: ${scenario.context}`,
      `GOVERNANCE_PRESSURE: ${scenario.governancePressure}`,
      `RECENT_GUARD_DENIALS: ${scenario.guardDeniedCount}`,
      "FORMAT:",
      "ROUTE: one sentence, max 18 words.",
      "REASON: one sentence, max 18 words, naming the decisive fault or health signal.",
      "COMMIT: one sentence, max 18 words, naming the concrete next control action."
    ].join("\n")
  };
}

async function runScenario(options: {
  gatewayUrl: string;
  authorization: string;
  scenario: ScenarioDefinition;
}): Promise<QGatewaySubstrateScenarioResult> {
  const prompt = buildStructuredPrompt(options.scenario);
  const started = performance.now();
  const chat = await checkHttp(`${options.gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: options.authorization,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: getQModelAlias(),
      stream: false,
      temperature: 0.05,
      max_tokens: 192,
      messages: [
        {
          role: "system",
          content: prompt.system
        },
        {
          role: "user",
          content: prompt.user
        }
      ]
    })
  });
  const responseBody =
    typeof chat.body === "object" && chat.body !== null ? (chat.body as Record<string, unknown>) : {};
  const rawContent = Array.isArray(responseBody.choices)
    ? String(
        ((responseBody.choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined)?.content ??
          ""
      )
    : "";
  const parsed = parseStructuredResponse(rawContent, "reasoner");
  const routeSuggestion = parsed.routeSuggestion ?? "";
  const reasonSummary = parsed.reasonSummary ?? "";
  const commitStatement = parsed.commitStatement ?? "";
  const structuredFieldCount = [routeSuggestion, reasonSummary, commitStatement].filter(Boolean).length;
  const parseSuccess = chat.status === 200 && structuredFieldCount === 3;

  const engine = createEngine({
    bootstrap: true,
    recordEvents: false
  });
  for (let index = 0; index < 6; index += 1) {
    engine.tick();
  }
  const snapshot = engine.getSnapshot();
  const frame = snapshot.neuroFrames[0];
  const layer = snapshot.intelligenceLayers.find((entry) => entry.role === "reasoner") ?? snapshot.intelligenceLayers[0];
  const completedAt = new Date().toISOString();
  const arbitrationStarted = performance.now();
  const plan = planExecutionArbitration({
    snapshot,
    frame,
    execution: {
      id: `q-gateway-substrate-${options.scenario.id}`,
      layerId: layer?.id ?? "benchmark-layer",
      model: getQModelTarget(),
      objective: options.scenario.objective,
      status: parseSuccess ? "completed" : "failed",
      latencyMs: Number(responseBody.latencyMs ?? chat.wallLatencyMs ?? 0),
      startedAt: new Date(Date.now() - Math.max(1, Math.round(chat.wallLatencyMs))).toISOString(),
      completedAt,
      promptDigest: `q-gateway-substrate-${options.scenario.id}`,
      responsePreview: truncate(rawContent || JSON.stringify(responseBody)),
      routeSuggestion: routeSuggestion || undefined,
      reasonSummary: reasonSummary || undefined,
      commitStatement: commitStatement || undefined,
      governancePressure: options.scenario.governancePressure,
      recentDeniedCount: options.scenario.guardDeniedCount
    },
    governanceStatus: {
      mode: "enforced",
      policyCount: 1,
      decisionCount: options.scenario.guardDeniedCount,
      deniedCount: options.scenario.guardDeniedCount,
      lastDecisionAt: completedAt,
      lastDecisionId: options.scenario.guardDeniedCount > 0 ? `gov-${options.scenario.id}-0` : undefined
    },
    governanceDecisions: Array.from({ length: options.scenario.guardDeniedCount }, (_, index) => ({
      id: `gov-${options.scenario.id}-${index}`,
      timestamp: completedAt,
      allowed: false,
      mode: "enforced" as const,
      action: "actuation-dispatch" as const,
      route: "/api/orchestration/mediate",
      policyId: "actuation-dispatch-default",
      purpose: ["actuation-dispatch"],
      consentScope:
        options.scenario.expectedPressure === "critical" ? "subject:benchmark" : "system:benchmark",
      actor: "benchmark",
      reason: "guard_denial"
    })),
    consentScope:
      options.scenario.expectedPressure === "critical" ? "subject:benchmark" : "system:benchmark"
  });
  const decision = buildExecutionArbitrationDecision({
    plan,
    consentScope:
      options.scenario.expectedPressure === "critical" ? "subject:benchmark" : "system:benchmark",
    frame,
    execution: undefined,
    selectedAt: completedAt
  });
  const arbitrationLatencyMs = Number((performance.now() - arbitrationStarted).toFixed(2));

  return {
    id: options.scenario.id,
    label: options.scenario.label,
    status: parseSuccess ? "completed" : "failed",
    parseSuccess,
    structuredFieldCount,
    latencyMs:
      typeof responseBody.latencyMs === "number" ? Number(responseBody.latencyMs) : Number(chat.wallLatencyMs.toFixed(2)),
    arbitrationLatencyMs,
    routeSuggestion: routeSuggestion || undefined,
    reasonSummary: reasonSummary || undefined,
    commitStatement: commitStatement || undefined,
    responsePreview: truncate(rawContent || JSON.stringify(responseBody)),
    arbitrationMode: decision.mode,
    arbitrationGovernancePressure: decision.governancePressure,
    shouldDispatchActuation: decision.shouldDispatchActuation,
    guardDeniedCount: options.scenario.guardDeniedCount,
    failureClass:
      parseSuccess
        ? undefined
        : (typeof responseBody.failureClass === "string" && responseBody.failureClass.trim()) ||
          "contract_invalid"
  };
}

export async function runQGatewaySubstrateBenchmark(options: {
  repoRoot: string;
  runtimeDir: string;
}): Promise<QGatewaySubstrateBenchmarkResult> {
  const benchmarkRuntimeDir = path.join(options.runtimeDir, "q-gateway-substrate");
  const gatewayRuntimeDir = path.join(benchmarkRuntimeDir, "gateway");
  const keysPath = path.join(gatewayRuntimeDir, "q-api-keys.json");
  const port = await allocateTcpPort();
  const gatewayUrl = `http://127.0.0.1:${port}`;
  await mkdir(gatewayRuntimeDir, { recursive: true });

  const child = startGatewayProcess({
    repoRoot: options.repoRoot,
    runtimeDir: gatewayRuntimeDir,
    keysPath,
    port
  });

  const registry = await createQApiKeyRegistry({
    rootDir: gatewayRuntimeDir,
    storePath: keysPath,
    defaultRateLimit: normalizeQApiRateLimitPolicy(undefined, {
      requestsPerMinute: 30,
      burst: 30,
      maxConcurrentRequests: 1
    })
  });
  const created = await registry.createKey({
    label: `q-gateway-substrate-${Date.now().toString(36)}`,
    rateLimit: {
      requestsPerMinute: 30,
      burst: 30,
      maxConcurrentRequests: 1
    }
  });

  try {
    const authorization = `Bearer ${created.plainTextKey}`;
    const health = await waitForGateway(gatewayUrl);
    const unauthorizedChat = await checkHttp(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: getQModelAlias(),
        messages: [{ role: "user", content: "health check" }],
        stream: false
      })
    });
    const info = await checkHttp(`${gatewayUrl}/api/q/info`, {
      headers: {
        Authorization: authorization
      }
    });
    const models = await checkHttp(`${gatewayUrl}/v1/models`, {
      headers: {
        Authorization: authorization
      }
    });
    const concurrencyPrimary = fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: getQModelAlias(),
        stream: false,
        messages: [
          {
            role: "user",
            content: "Reply with ROUTE, REASON, COMMIT only."
          }
        ]
      })
    });
    await delay(150);
    const concurrency = await checkHttp(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: getQModelAlias(),
        stream: false,
        messages: [
          {
            role: "user",
            content: "Reply with ROUTE, REASON, COMMIT only."
          }
        ]
      })
    });
    const primaryResponse = await concurrencyPrimary;
    await primaryResponse.text().catch(() => undefined);

    const scenarioResults: QGatewaySubstrateScenarioResult[] = [];
    for (const scenario of SCENARIOS) {
      scenarioResults.push(await runScenario({ gatewayUrl, authorization, scenario }));
    }
    const release = await resolveReleaseMetadata();

    return {
      gatewayUrl,
      qTrainingBundleId: release.q.trainingLock?.bundleId,
      checks: {
        health,
        unauthorizedChat,
        info,
        models,
        concurrency
      },
      scenarioResults
    };
  } finally {
    await registry.revokeKey(created.key.keyId).catch(() => undefined);
    await stopGatewayProcess(child);
  }
}

export function summarizeQGatewaySubstrateHardware(): string {
  const cpus = os.cpus();
  const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length;
  return `${os.hostname()} / ${os.platform()}-${os.arch()} / ${cpus[0]?.model?.trim() || "unknown-cpu"} / ${Math.max(1, cpuCount)} cores / ${truthfulModelLabel(getQModelTarget())}`;
}
