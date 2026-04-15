import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createPersistence } from "./persistence.js";
import { createQApiKeyRegistry, normalizeQApiRateLimitPolicy } from "./q-api-auth.js";
import { getQModelAlias, getQModelTarget, truthfulModelLabel } from "./q-model.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";
import { runOllamaChatCompletion, type OllamaChatMessage } from "./ollama.js";

type ValidationFlags = {
  gatewayUrl: string;
  runtimeDir?: string;
  keysPath?: string;
};

type HttpCheck = {
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

type QGatewayValidationReport = {
  generatedAt: string;
  gatewayUrl: string;
  alias: string;
  qServingLabel: string;
  release: ReleaseMetadata;
  hardwareContext: HardwareContext;
  checks: {
    health: HttpCheck;
    unauthorizedChat: HttpCheck;
    info: HttpCheck;
    models: HttpCheck;
    authorizedChat: HttpCheck;
    concurrentRejection: HttpCheck;
  };
  directOllama: {
    latencyMs: number;
    wallLatencyMs: number;
    responsePreview: string;
    failureClass?: string;
  };
  comparison: {
    gatewayEndToEndLatencyMs: number;
    gatewayUpstreamLatencyMs?: number;
    gatewayAddedLatencyMs?: number;
    directOllamaLatencyMs: number;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

function parseFlags(argv: string[]): ValidationFlags {
  const flags: ValidationFlags = {
    gatewayUrl: "http://127.0.0.1:8897"
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

async function checkHttp(
  url: string,
  init?: RequestInit
): Promise<HttpCheck> {
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

function renderMarkdown(report: QGatewayValidationReport): string {
  return [
    "# Q Gateway Validation",
    "",
    "This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct Ollama call against the same Q lane.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: ${report.release.buildId}`,
    `- Repo commit: ${report.release.gitShortSha}`,
    `- Gateway URL: ${report.gatewayUrl}`,
    `- Alias: ${report.alias}`,
    `- Q serving label: ${report.qServingLabel}`,
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
    `- concurrent rejection: \`${report.checks.concurrentRejection.status}\``,
    "",
    "## Latency Comparison",
    "",
    `- gateway end-to-end latency: \`${report.comparison.gatewayEndToEndLatencyMs}\` ms`,
    `- gateway upstream latency header: \`${report.comparison.gatewayUpstreamLatencyMs ?? "n/a"}\` ms`,
    `- gateway added latency: \`${report.comparison.gatewayAddedLatencyMs ?? "n/a"}\` ms`,
    `- direct Ollama latency: \`${report.comparison.directOllamaLatencyMs}\` ms`,
    "",
    "## Direct Ollama Result",
    "",
    `- failure class: \`${report.directOllama.failureClass ?? "none"}\``,
    `- latency: \`${report.directOllama.latencyMs}\` ms`,
    `- wall latency: \`${report.directOllama.wallLatencyMs}\` ms`,
    `- preview: ${report.directOllama.responsePreview}`
  ].join("\n");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const persistence = createPersistence(flags.runtimeDir);
  const registry = await createQApiKeyRegistry({
    rootDir: persistence.getStatus().rootDir,
    storePath: flags.keysPath?.trim() || process.env.IMMACULATE_Q_API_KEYS_PATH,
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

  try {
    const gatewayUrl = flags.gatewayUrl.replace(/\/+$/, "");
    const gatewayHeaders = {
      Authorization: `Bearer ${created.plainTextKey}`,
      "content-type": "application/json"
    };
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
      model: getQModelAlias(),
      messages: chatMessages,
      max_tokens: 64,
      temperature: 0.1,
      stream: false
    };

    const health = await checkHttp(`${gatewayUrl}/health`);
    const unauthorizedChat = await checkHttp(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(chatBody)
    });
    const info = await checkHttp(`${gatewayUrl}/api/q/info`, {
      headers: gatewayHeaders
    });
    const models = await checkHttp(`${gatewayUrl}/v1/models`, {
      headers: gatewayHeaders
    });
    const authorizedChat = await checkHttp(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders,
      body: JSON.stringify(chatBody)
    });

    const concurrentPrimary = fetch(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders,
      body: JSON.stringify(chatBody)
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const concurrentRejection = await checkHttp(`${gatewayUrl}/v1/chat/completions`, {
      method: "POST",
      headers: gatewayHeaders,
      body: JSON.stringify(chatBody)
    });
    const primaryResponse = await concurrentPrimary;
    await primaryResponse.text();

    const directStarted = performance.now();
    const direct = await runOllamaChatCompletion({
      endpoint: process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434",
      model: getQModelTarget(),
      messages: chatMessages,
      maxTokens: 64,
      temperature: 0.1,
      think: false
    });
    const directWallLatencyMs = Number((performance.now() - directStarted).toFixed(2));

    const upstreamHeader = authorizedChat.headers["x-upstream-latency-ms"];
    const gatewayUpstreamLatencyMs =
      typeof upstreamHeader === "string" && upstreamHeader.trim().length > 0
        ? Number(upstreamHeader)
        : undefined;
    const report: QGatewayValidationReport = {
      generatedAt: new Date().toISOString(),
      gatewayUrl,
      alias: getQModelAlias(),
      qServingLabel: truthfulModelLabel(getQModelTarget()),
      release: await resolveReleaseMetadata(),
      hardwareContext: captureHardwareContext(),
      checks: {
        health,
        unauthorizedChat,
        info,
        models,
        authorizedChat,
        concurrentRejection
      },
      directOllama: {
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
        directOllamaLatencyMs: direct.latencyMs
      },
      output: {
        jsonPath: path.join("docs", "wiki", "Q-Gateway-Validation.json"),
        markdownPath: path.join("docs", "wiki", "Q-Gateway-Validation.md")
      }
    };

    await mkdir(WIKI_ROOT, { recursive: true });
    await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");

    if (
      health.status !== 200 ||
      unauthorizedChat.status !== 401 ||
      info.status !== 200 ||
      models.status !== 200 ||
      authorizedChat.status !== 200 ||
      concurrentRejection.status !== 429 ||
      direct.failureClass
    ) {
      throw new Error("Q gateway validation did not satisfy the expected contract.");
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          accepted: true,
          gatewayUrl,
          output: report.output,
          authorizedChatStatus: authorizedChat.status,
          concurrentRejectionStatus: concurrentRejection.status
        },
        null,
        2
      )}\n`
    );
  } finally {
    await registry.revokeKey(created.key.keyId).catch(() => undefined);
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Q gateway validation failed.");
  process.exitCode = 1;
});
