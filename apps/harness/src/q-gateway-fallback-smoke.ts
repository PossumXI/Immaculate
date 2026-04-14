import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createPersistence } from "./persistence.js";
import { createQApiKeyRegistry, normalizeQApiRateLimitPolicy } from "./q-api-auth.js";
import { truthfulModelLabel } from "./q-model.js";

type SmokeFlags = {
  gatewayUrl: string;
  runtimeDir?: string;
  keysPath?: string;
};

type HttpCheck = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

type FallbackSmokeReport = {
  generatedAt: string;
  gatewayUrl: string;
  hardwareContext: {
    host: string;
    platform: string;
    arch: string;
    osVersion: string;
    cpuModel: string;
    cpuCount: number;
    memoryGiB: number;
    nodeVersion: string;
  };
  checks: {
    health: HttpCheck;
    firstFallbackChat: HttpCheck;
    secondFallbackChat: HttpCheck;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

function parseFlags(argv: string[]): SmokeFlags {
  const flags: SmokeFlags = {
    gatewayUrl: "http://127.0.0.1:8898"
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
    }
  }

  return flags;
}

function captureHardwareContext() {
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

async function checkHttp(url: string, init?: RequestInit): Promise<HttpCheck> {
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
    headers
  };
}

async function waitForHealth(url: string): Promise<HttpCheck> {
  const deadline = Date.now() + 60_000;
  let lastError = "gateway did not start";
  while (Date.now() < deadline) {
    try {
      const response = await checkHttp(url);
      if (response.status === 200) {
        return response;
      }
      lastError = `health returned ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "health probe failed";
    }
    await delay(750);
  }
  throw new Error(`Timed out waiting for fallback smoke gateway: ${lastError}`);
}

function renderMarkdown(report: FallbackSmokeReport): string {
  return [
    "# Q Gateway Fallback Smoke",
    "",
    "This page is generated from a live gateway smoke where the primary Q model is intentionally invalid and the dedicated gateway must fail over honestly to the configured fallback model.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Gateway URL: ${report.gatewayUrl}`,
    `- Hardware: ${JSON.stringify(report.hardwareContext)}`,
    "",
    "## Checks",
    "",
    `- /health: \`${report.checks.health.status}\``,
    `- first fallback chat: \`${report.checks.firstFallbackChat.status}\` via \`${String((report.checks.firstFallbackChat.body as { providerModel?: string } | undefined)?.providerModel ?? "unknown")}\``,
    `- second fallback chat: \`${report.checks.secondFallbackChat.status}\` with circuit state \`${report.checks.secondFallbackChat.headers["x-q-circuit-state"] ?? "unknown"}\``
  ].join("\n");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const gatewayUrl = flags.gatewayUrl.replace(/\/+$/, "");
  const gateway = new URL(gatewayUrl);
  const runtimeDir = flags.runtimeDir?.trim() || path.join(REPO_ROOT, ".runtime", "q-gateway-fallback-smoke");
  const keysPath = flags.keysPath?.trim() || path.join(runtimeDir, "q-api-keys.json");
  const tsxCliPath = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const gatewayEntrypoint = path.join(REPO_ROOT, "apps", "harness", "src", "q-gateway.ts");

  await mkdir(runtimeDir, { recursive: true });

  const gatewayProcess = spawn(
    process.execPath,
    [tsxCliPath, gatewayEntrypoint],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        IMMACULATE_RUNTIME_DIR: runtimeDir,
        IMMACULATE_Q_API_KEYS_PATH: keysPath,
        IMMACULATE_Q_GATEWAY_HOST: gateway.hostname,
        IMMACULATE_Q_GATEWAY_PORT: gateway.port || "8898",
        IMMACULATE_OLLAMA_Q_BASE_MODEL: "q-primary-unavailable-for-smoke",
        IMMACULATE_Q_GATEWAY_FALLBACK_MODEL: "gemma3:4b",
        IMMACULATE_Q_GATEWAY_PRIMARY_FAILURE_THRESHOLD: "1",
        IMMACULATE_Q_GATEWAY_PRIMARY_COOLDOWN_MS: "60000",
        IMMACULATE_Q_API_DEFAULT_RPM: "12",
        IMMACULATE_Q_API_DEFAULT_BURST: "12",
        IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let stderr = "";
  gatewayProcess.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const persistence = createPersistence(runtimeDir);
  const registry = await createQApiKeyRegistry({
    rootDir: persistence.getStatus().rootDir,
    storePath: keysPath,
    defaultRateLimit: normalizeQApiRateLimitPolicy(undefined, {
      requestsPerMinute: 12,
      burst: 12,
      maxConcurrentRequests: 1
    })
  });
  const created = await registry.createKey({
    label: `q-gateway-fallback-smoke-${Date.now().toString(36)}`,
    rateLimit: {
      requestsPerMinute: 12,
      burst: 12,
      maxConcurrentRequests: 1
    }
  });

  try {
    const health = await waitForHealth(`${gatewayUrl}/health`);
    const headers = {
      Authorization: `Bearer ${created.plainTextKey}`,
      "content-type": "application/json"
    };
    const body = JSON.stringify({
      model: "Q",
      messages: [
        {
          role: "user",
          content: "Reply with exactly three words that confirm Q fallback is healthy."
        }
      ],
      max_tokens: 48,
      temperature: 0.1,
      stream: false
    });
    const firstFallbackChat = await checkHttp(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body
    });
    const secondFallbackChat = await checkHttp(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body
    });

    const report: FallbackSmokeReport = {
      generatedAt: new Date().toISOString(),
      gatewayUrl,
      hardwareContext: captureHardwareContext(),
      checks: {
        health,
        firstFallbackChat,
        secondFallbackChat
      },
      output: {
        jsonPath: path.join("docs", "wiki", "Q-Gateway-Fallback-Smoke.json"),
        markdownPath: path.join("docs", "wiki", "Q-Gateway-Fallback-Smoke.md")
      }
    };

    await mkdir(WIKI_ROOT, { recursive: true });
    await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");

    const firstProviderModel = String(
      (firstFallbackChat.body as { providerModel?: string } | undefined)?.providerModel ?? ""
    );
    const secondProviderModel = String(
      (secondFallbackChat.body as { providerModel?: string } | undefined)?.providerModel ?? ""
    );
    if (
      health.status !== 200 ||
      firstFallbackChat.status !== 200 ||
      secondFallbackChat.status !== 200 ||
      firstFallbackChat.headers["x-q-fallback-used"] !== "true" ||
      secondFallbackChat.headers["x-q-fallback-used"] !== "true" ||
      firstProviderModel !== truthfulModelLabel("gemma3:4b") ||
      secondProviderModel !== truthfulModelLabel("gemma3:4b") ||
      secondFallbackChat.headers["x-q-primary-failure-class"] !== "circuit_open"
    ) {
      throw new Error("Q gateway fallback smoke did not satisfy the expected contract.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          accepted: true,
          gatewayUrl,
          output: report.output,
          firstFallbackStatus: firstFallbackChat.status,
          secondFallbackStatus: secondFallbackChat.status
        },
        null,
        2
      )}\n`
    );
  } finally {
    await registry.revokeKey(created.key.keyId).catch(() => undefined);
    gatewayProcess.kill();
    await Promise.race([
      new Promise<void>((resolve) => {
        gatewayProcess.once("exit", () => resolve());
      }),
      delay(5_000).then(() => undefined)
    ]);
    if (stderr.trim().length > 0 && !/listening|Server listening/i.test(stderr)) {
      process.stderr.write(stderr);
    }
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Q gateway fallback smoke failed.");
  process.exitCode = 1;
});
