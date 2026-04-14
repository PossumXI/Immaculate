import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { createPersistence } from "./persistence.js";
import {
  createQApiKeyRegistry,
  normalizeQApiRateLimitPolicy,
  type QApiKeyMetadata,
  type QApiRateLimitPolicy
} from "./q-api-auth.js";
import { createQRateLimiter } from "./q-rate-limit.js";
import {
  listOllamaModels,
  runOllamaChatCompletion,
  type OllamaChatCompletionResult,
  type OllamaChatMessage
} from "./ollama.js";
import { resolveReleaseMetadata } from "./release-metadata.js";
import { getQModelAlias, getQModelTarget, isQAlias, isQTargetModel, truthfulModelLabel } from "./q-model.js";
import { createFailureCircuitBreaker } from "./q-resilience.js";

type GatewayPrincipal = {
  subject: string;
  key: QApiKeyMetadata;
  rateLimit: QApiRateLimitPolicy;
};

type ChatMessageInput = {
  role?: string;
  content?: string;
};

type ChatCompletionRequestBody = {
  model?: string;
  messages?: ChatMessageInput[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
};

const app = Fastify({
  logger: true,
  trustProxy: false
});

const persistence = createPersistence(process.env.IMMACULATE_RUNTIME_DIR);
const GATEWAY_HOST = process.env.IMMACULATE_Q_GATEWAY_HOST ?? "127.0.0.1";
const GATEWAY_PORT = Number(process.env.IMMACULATE_Q_GATEWAY_PORT ?? 8897);
const OLLAMA_URL = process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const MAX_MESSAGE_COUNT = Math.max(1, Number(process.env.IMMACULATE_Q_GATEWAY_MAX_MESSAGES ?? 24) || 24);
const MAX_INPUT_CHARS = Math.max(512, Number(process.env.IMMACULATE_Q_GATEWAY_MAX_INPUT_CHARS ?? 16_000) || 16_000);
const DEFAULT_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.IMMACULATE_Q_GATEWAY_TIMEOUT_MS ?? process.env.IMMACULATE_OLLAMA_CONTROL_TIMEOUT_MS ?? 120_000) ||
    120_000
);
const PRIMARY_MODEL = getQModelTarget();
const FALLBACK_MODEL = process.env.IMMACULATE_Q_GATEWAY_FALLBACK_MODEL?.trim();
const FALLBACK_ENABLED = Boolean(FALLBACK_MODEL && FALLBACK_MODEL !== PRIMARY_MODEL);
const FALLBACK_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.IMMACULATE_Q_GATEWAY_FALLBACK_TIMEOUT_MS ?? Math.min(DEFAULT_TIMEOUT_MS, 90_000)) ||
    Math.min(DEFAULT_TIMEOUT_MS, 90_000)
);
const PRIMARY_FAILURE_THRESHOLD = Math.max(
  1,
  Number(process.env.IMMACULATE_Q_GATEWAY_PRIMARY_FAILURE_THRESHOLD ?? 2) || 2
);
const PRIMARY_COOLDOWN_MS = Math.max(
  5_000,
  Number(process.env.IMMACULATE_Q_GATEWAY_PRIMARY_COOLDOWN_MS ?? 120_000) || 120_000
);
const DEFAULT_RATE_LIMIT = normalizeQApiRateLimitPolicy(
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
const qApiKeyRegistry = await createQApiKeyRegistry({
  rootDir: persistence.getStatus().rootDir,
  storePath: process.env.IMMACULATE_Q_API_KEYS_PATH,
  defaultRateLimit: DEFAULT_RATE_LIMIT
});
const qRateLimiter = createQRateLimiter();
const qPrimaryCircuit = createFailureCircuitBreaker({
  failureThreshold: PRIMARY_FAILURE_THRESHOLD,
  cooldownMs: PRIMARY_COOLDOWN_MS
});
const releaseMetadata = await resolveReleaseMetadata();
const principals = new WeakMap<object, GatewayPrincipal>();

app.log.info(
  {
    runtimeDir: persistence.getStatus().rootDir,
    qApiKeyStorePath: qApiKeyRegistry.getStorePath(),
    release: releaseMetadata.buildId
  },
  "Q gateway configured"
);

function extractAuthorizationToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  const explicitApiKey = headers["x-api-key"];
  if (typeof explicitApiKey === "string" && explicitApiKey.trim().length > 0) {
    return explicitApiKey.trim();
  }
  if (Array.isArray(explicitApiKey)) {
    const candidate = explicitApiKey.find((value) => value.trim().length > 0);
    if (candidate) {
      return candidate.trim();
    }
  }

  const authHeader = headers.authorization;
  const raw =
    typeof authHeader === "string"
      ? authHeader
      : Array.isArray(authHeader)
        ? authHeader.find((value) => value.trim().length > 0)
        : undefined;
  if (typeof raw === "string" && raw.startsWith("Bearer ")) {
    return raw.slice("Bearer ".length).trim();
  }
  return undefined;
}

function attachRateLimitHeaders(
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

function normalizeAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeModelSelection(value: string | undefined): string {
  const requested = value?.trim() || getQModelAlias();
  if (isQAlias(requested) || isQTargetModel(requested)) {
    return getQModelTarget();
  }
  throw new Error(`Unsupported model: ${requested}`);
}

function validateMessages(value: ChatCompletionRequestBody["messages"]): OllamaChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one chat message is required.");
  }
  if (value.length > MAX_MESSAGE_COUNT) {
    throw new Error(`Message count exceeded the gateway bound of ${MAX_MESSAGE_COUNT}.`);
  }

  const messages = value.map((message, index) => {
    const role = message?.role?.trim();
    const content = message?.content?.trim();
    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw new Error(`Message ${index + 1} has an unsupported role.`);
    }
    if (!content) {
      throw new Error(`Message ${index + 1} is empty.`);
    }
    return {
      role,
      content
    } satisfies OllamaChatMessage;
  });

  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars > MAX_INPUT_CHARS) {
    throw new Error(`Input exceeded the gateway bound of ${MAX_INPUT_CHARS} characters.`);
  }

  return messages;
}

function sanitizeGatewayResponse(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const channelMarker = trimmed.lastIndexOf("<channel|>");
  if (channelMarker >= 0) {
    const candidate = trimmed.slice(channelMarker + "<channel|>".length).trim();
    if (candidate.length > 0) {
      return candidate;
    }
  }
  if (/^\s*thought\b/i.test(trimmed)) {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const candidate = lines.at(-1);
    if (candidate && !/^thought\b/i.test(candidate)) {
      return candidate;
    }
  }
  return trimmed;
}

function getPrincipal(request: FastifyRequest): GatewayPrincipal | undefined {
  return principals.get(request.raw);
}

async function runGatewayChatAttempt(options: {
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
}): Promise<OllamaChatCompletionResult> {
  return runOllamaChatCompletion({
    endpoint: OLLAMA_URL,
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    think: false
  });
}

await app.register(cors, {
  origin: (origin, callback) => {
    const allowlist = normalizeAllowedOrigins(process.env.IMMACULATE_Q_GATEWAY_ALLOWED_ORIGINS);
    if (allowlist.length === 0) {
      callback(null, false);
      return;
    }
    if (!origin) {
      callback(null, false);
      return;
    }
    callback(null, allowlist.includes(origin));
  }
});

app.addHook("onRequest", async (request, reply) => {
  if (request.method === "OPTIONS" || request.url === "/health") {
    return;
  }

  const token = extractAuthorizationToken(request.headers);
  if (!token) {
    reply.code(401).send({
      error: "unauthorized",
      message: "Q gateway requires Authorization: Bearer or X-API-Key."
    });
    return;
  }

  const authenticated = await qApiKeyRegistry.authenticate(token, {
    requiredScope: "invoke",
    ip: request.ip
  });
  if (!authenticated) {
    reply.code(401).send({
      error: "unauthorized",
      message: "Invalid Q API key."
    });
    return;
  }

  const principal: GatewayPrincipal = {
    subject: `qkey:${authenticated.key.keyId}`,
    key: authenticated.key,
    rateLimit: authenticated.key.rateLimit
  };
  const grant = qRateLimiter.acquire(principal.subject, principal.rateLimit);
  attachRateLimitHeaders(reply, grant);
  if (!grant.allowed) {
    reply.code(429).send({
      error: grant.reason,
      message:
        grant.reason === "concurrency_limited"
          ? "Q gateway concurrency limit exceeded."
          : "Q gateway rate limit exceeded.",
      retryAfterMs: grant.retryAfterMs
    });
    return;
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
  principals.set(request.raw, principal);
});

app.get("/health", async () => {
  const models = await listOllamaModels(OLLAMA_URL).catch(() => []);
  const installedModelNames = models.map((model) => model.name || model.model || "").filter(Boolean);
  const circuit = qPrimaryCircuit.snapshot();
  return {
    ok: true,
    release: {
      buildId: releaseMetadata.buildId,
      gitShortSha: releaseMetadata.gitShortSha
    },
    gateway: "q",
    alias: getQModelAlias(),
    model: truthfulModelLabel(PRIMARY_MODEL),
    modelReady: installedModelNames.includes(PRIMARY_MODEL),
    fallbackModel: FALLBACK_ENABLED ? truthfulModelLabel(FALLBACK_MODEL) : undefined,
    fallbackReady: FALLBACK_ENABLED ? installedModelNames.includes(FALLBACK_MODEL ?? "") : false,
    circuit,
    authMode: "api-key",
    host: GATEWAY_HOST,
    port: GATEWAY_PORT
  };
});

app.get("/api/q/info", async (request, reply) => {
  const principal = getPrincipal(request);
  if (!principal) {
    reply.code(401);
    return {
      error: "unauthorized"
    };
  }

  return {
    enabled: true,
    alias: getQModelAlias(),
    model: truthfulModelLabel(PRIMARY_MODEL),
    release: {
      buildId: releaseMetadata.buildId,
      gitShortSha: releaseMetadata.gitShortSha,
      qTrainingBundleId: releaseMetadata.q.trainingLock?.bundleId
    },
    fallbackModel: FALLBACK_ENABLED ? truthfulModelLabel(FALLBACK_MODEL) : undefined,
    circuit: qPrimaryCircuit.snapshot(),
    authMode: "api-key",
    keyId: principal.key.keyId,
    rateLimit: principal.rateLimit,
    routes: ["/health", "/api/q/info", "/v1/models", "/v1/chat/completions"]
  };
});

app.get("/v1/models", async () => ({
  object: "list",
  data: [
    {
      id: getQModelAlias(),
      object: "model",
      owned_by: "immaculate",
      metadata: {
        providerModel: truthfulModelLabel(PRIMARY_MODEL),
        fallbackModel: FALLBACK_ENABLED ? truthfulModelLabel(FALLBACK_MODEL) : undefined
      }
    }
  ]
}));

app.post("/v1/chat/completions", async (request, reply) => {
  const body = (request.body as ChatCompletionRequestBody | undefined) ?? {};
  if (body.stream) {
    reply.code(400);
    return {
      error: "streaming_not_supported",
      message: "The Q gateway currently supports non-streaming chat completions only."
    };
  }

  let messages: OllamaChatMessage[];
  try {
    normalizeModelSelection(body.model);
    messages = validateMessages(body.messages);
  } catch (error) {
    reply.code(400);
    return {
      error: "invalid_request",
      message: error instanceof Error ? error.message : "Invalid Q gateway request."
    };
  }

  const temperature = typeof body.temperature === "number" ? body.temperature : 0.2;
  const maxTokens = typeof body.max_tokens === "number" ? body.max_tokens : 256;
  const primaryDecision = qPrimaryCircuit.beforeRequest();
  const primaryModel = PRIMARY_MODEL;
  let primaryResult: OllamaChatCompletionResult | undefined;
  let primaryFailureClass: string | undefined = primaryDecision.reason;
  let servedModel = primaryModel;
  let servedResult: OllamaChatCompletionResult | undefined;
  let fallbackUsed = false;

  if (primaryDecision.allowPrimary) {
    primaryResult = await runGatewayChatAttempt({
      model: primaryModel,
      messages,
      temperature,
      maxTokens,
      timeoutMs: DEFAULT_TIMEOUT_MS
    });
    if (primaryResult.failureClass) {
      primaryFailureClass = primaryResult.failureClass;
      qPrimaryCircuit.recordFailure(primaryResult.failureClass);
    } else {
      qPrimaryCircuit.recordSuccess();
      servedResult = primaryResult;
    }
  }

  if (!servedResult && FALLBACK_ENABLED && FALLBACK_MODEL) {
    servedModel = FALLBACK_MODEL;
    fallbackUsed = true;
    servedResult = await runGatewayChatAttempt({
      model: FALLBACK_MODEL,
      messages,
      temperature,
      maxTokens,
      timeoutMs: FALLBACK_TIMEOUT_MS
    });
  }

  const circuit = qPrimaryCircuit.snapshot();
  reply.header("x-q-alias", getQModelAlias());
  reply.header("x-q-primary-model", truthfulModelLabel(primaryModel));
  reply.header("x-provider-model", truthfulModelLabel(servedModel));
  reply.header("x-q-fallback-used", fallbackUsed ? "true" : "false");
  reply.header("x-q-circuit-state", circuit.state);
  if (primaryFailureClass) {
    reply.header("x-q-primary-failure-class", primaryFailureClass);
  }
  if (primaryResult) {
    reply.header("x-q-primary-latency-ms", String(primaryResult.latencyMs));
  }
  if (servedResult) {
    reply.header("x-upstream-latency-ms", String(servedResult.latencyMs));
  }

  if (!servedResult || servedResult.failureClass) {
    reply.code(503);
    return {
      error: "q_upstream_failure",
      failureClass: servedResult?.failureClass ?? primaryFailureClass ?? "http_error",
      message: servedResult?.responsePreview ?? primaryResult?.responsePreview ?? "Q upstream failed.",
      model: getQModelAlias(),
      providerModel: truthfulModelLabel(servedModel),
      primaryModel: truthfulModelLabel(primaryModel),
      fallbackUsed,
      circuitState: circuit.state,
      primaryFailureClass,
      latencyMs: servedResult?.latencyMs ?? primaryResult?.latencyMs ?? 0,
      thinkingDetected: servedResult?.thinkingDetected ?? primaryResult?.thinkingDetected ?? false
    };
  }

  const content = sanitizeGatewayResponse(servedResult.response);

  return {
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: getQModelAlias(),
    providerModel: truthfulModelLabel(servedModel),
    primaryModel: truthfulModelLabel(primaryModel),
    fallbackUsed,
    primaryFailureClass,
    circuitState: circuit.state,
    latencyMs: servedResult.latencyMs,
    thinkingDetected: servedResult.thinkingDetected,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content
        },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
});

await app.listen({
  host: GATEWAY_HOST,
  port: GATEWAY_PORT
});
