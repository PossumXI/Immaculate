import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { setTimeout as delay } from "node:timers/promises";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
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
  parseStructuredJsonResponse,
  parseStructuredResponse,
  renderStructuredResponseContract,
  runOllamaChatCompletion,
  runOllamaGenerateCompletion,
  type OllamaChatCompletionResult,
  type OllamaChatMessage
} from "./ollama.js";
import { runOpenAICompatibleResponsesCompletion } from "./openai-compatible.js";
import { runOciIamBridgeResponsesCompletion } from "./oci-iam-bridge.js";
import { resolveReleaseMetadata } from "./release-metadata.js";
import {
  buildCanonicalQIdentityAnswer,
  canonicalizeQIdentityAnswer,
  detectQIdentityQuestion,
  getQDeveloperName,
  getQFoundationModelName,
  buildQRuntimeContext,
  getQIdentityInstruction,
  getQIdentitySummary,
  getQLeadName,
  getQModelName,
  getQModelTarget,
  getQRuntimeContextInstruction,
  getImmaculateHarnessName,
  matchesModelReference,
} from "./q-model.js";
import {
  redactQInferenceProfile,
  resolveQInferenceProfile
} from "./q-inference-profile.js";
import { createFailureCircuitBreaker, shouldRecordQGatewayCircuitFailure } from "./q-resilience.js";

type GatewayPrincipal = {
  subject: string;
  key: QApiKeyMetadata;
  rateLimit: QApiRateLimitPolicy;
};

type ChatMessageContentPartInput = {
  type?: string;
  text?: string;
};

type ChatMessageInput = {
  role?: string;
  content?: string | ChatMessageContentPartInput[];
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
const INFERENCE_PROFILE = resolveQInferenceProfile();
const PUBLIC_INFERENCE_PROFILE = redactQInferenceProfile(INFERENCE_PROFILE);
const OLLAMA_URL = INFERENCE_PROFILE.runtimeUrl;
const MAX_MESSAGE_COUNT = INFERENCE_PROFILE.requestBounds.maxMessages;
const MAX_INPUT_CHARS = INFERENCE_PROFILE.requestBounds.maxInputChars;
const DEFAULT_TIMEOUT_MS = INFERENCE_PROFILE.timeouts.defaultMs;
const STRUCTURED_REQUEST_MAX_TOKENS = INFERENCE_PROFILE.structured.maxTokens;
const STRUCTURED_REQUEST_TIMEOUT_MS = INFERENCE_PROFILE.timeouts.structuredMs;
const STRUCTURED_REPAIR_TIMEOUT_MS = INFERENCE_PROFILE.timeouts.structuredRepairMs;
const STRUCTURED_FAST_NUM_CTX = INFERENCE_PROFILE.structured.fastNumCtx;
const STRUCTURED_FAST_NUM_BATCH = INFERENCE_PROFILE.structured.fastNumBatch;
const FAST_SMOKE_MAX_TOKENS = 16;
const BENCHMARK_NUM_CTX = INFERENCE_PROFILE.benchmark.numCtx;
const BENCHMARK_NUM_BATCH = INFERENCE_PROFILE.benchmark.numBatch;
const Q_MODEL_TARGET = getQModelTarget();
const PRIMARY_FAILURE_THRESHOLD = INFERENCE_PROFILE.circuit.primaryFailureThreshold;
const PRIMARY_COOLDOWN_MS = INFERENCE_PROFILE.circuit.primaryCooldownMs;
const HEALTH_MODEL_CACHE_TTL_MS = INFERENCE_PROFILE.timeouts.healthCacheTtlMs;
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
const Q_GATEWAY_ROUTE_RATE_LIMIT_MAX = Math.max(
  1,
  Number(process.env.IMMACULATE_Q_GATEWAY_ROUTE_RATE_LIMIT_MAX ?? DEFAULT_RATE_LIMIT.burst) ||
    DEFAULT_RATE_LIMIT.burst
);
const Q_GATEWAY_ROUTE_RATE_LIMIT_WINDOW =
  process.env.IMMACULATE_Q_GATEWAY_ROUTE_RATE_LIMIT_WINDOW ?? "1 minute";
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
let cachedModelReadiness:
  | {
      expiresAtMs: number;
      installedModelNames: string[];
    }
  | undefined;
const BENCHMARK_SKIP_Q_IDENTITY_HEADER = "x-immaculate-benchmark-skip-q-identity";
const REQUEST_TIMEOUT_OVERRIDE_HEADER = "x-immaculate-request-timeout-ms";
const FAST_SMOKE_HEADER = "x-immaculate-q-fast-smoke";
const FAST_SMOKE_HOLD_HEADER = "x-immaculate-q-fast-smoke-hold-ms";

app.log.info(
  {
    runtimeDir: persistence.getStatus().rootDir,
    qApiKeyStorePath: qApiKeyRegistry.getStorePath(),
    release: releaseMetadata.buildId,
    inference: PUBLIC_INFERENCE_PROFILE
  },
  "Q gateway configured"
);

async function getInstalledModelNames(forceRefresh = false): Promise<string[]> {
  if (
    INFERENCE_PROFILE.provider === "openai-compatible" ||
    INFERENCE_PROFILE.provider === "oci-iam-bridge"
  ) {
    return PUBLIC_INFERENCE_PROFILE.auth.configured ? [Q_MODEL_TARGET] : [];
  }
  if (!forceRefresh && cachedModelReadiness && cachedModelReadiness.expiresAtMs > Date.now()) {
    return cachedModelReadiness.installedModelNames;
  }
  const models = await listOllamaModels(OLLAMA_URL).catch(() => []);
  const installedModelNames = models.map((model) => model.name || model.model || "").filter(Boolean);
  cachedModelReadiness = {
    expiresAtMs: Date.now() + HEALTH_MODEL_CACHE_TTL_MS,
    installedModelNames
  };
  return installedModelNames;
}

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
  const requested = value?.trim() || getQModelName();
  if (requested === getQModelName()) {
    return Q_MODEL_TARGET;
  }
  throw new Error(`Unsupported model: ${requested}`);
}

function normalizeMessageContent(value: ChatMessageInput["content"]): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .flatMap((part) => {
      if (typeof part?.text === "string" && (part.type === undefined || part.type === "text" || part.type === "input_text")) {
        return [part.text];
      }
      return [];
    })
    .join("\n")
    .trim();
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
    const content = normalizeMessageContent(message?.content);
    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw new Error(`Message ${index + 1} has an unsupported role.`);
    }
    if (!content) {
      throw new Error(`Message ${index + 1} is empty or has no supported text content.`);
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

function isTruthyHeaderValue(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value.find((entry) => entry.trim().length > 0) : value;
  if (typeof raw !== "string") {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "0" && normalized !== "false" && normalized !== "off";
}

function parseTimeoutOverrideMs(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value.find((entry) => entry.trim().length > 0) : value;
  if (typeof raw !== "string") {
    return undefined;
  }
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.max(1_000, Math.min(DEFAULT_TIMEOUT_MS, Math.round(parsed)));
}

function parseFastSmokeHoldMs(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value.find((entry) => entry.trim().length > 0) : value;
  if (typeof raw !== "string") {
    return 0;
  }
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(5_000, Math.round(parsed)));
}

function isRetryableStructuredFailure(failureClass: string | undefined): boolean {
  return (
    failureClass === "transport_timeout" ||
    failureClass === "http_error" ||
    failureClass === "empty_response"
  );
}

function finalizeGatewayCircuit(failureClass?: string) {
  if (shouldRecordQGatewayCircuitFailure(failureClass)) {
    qPrimaryCircuit.recordFailure(failureClass);
  } else if (!failureClass) {
    qPrimaryCircuit.recordSuccess();
  }
  return qPrimaryCircuit.snapshot();
}

function latestUserPrompt(messages: OllamaChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && message.content.trim().length > 0) {
      return message.content.trim();
    }
  }
  return undefined;
}

function isStructuredContractRequest(messages: OllamaChatMessage[]): boolean {
  const combined = messages.map((message) => message.content).join("\n");
  return /\bROUTE\s*:/i.test(combined) && /\bREASON\s*:/i.test(combined) && /\bCOMMIT\s*:/i.test(combined);
}

function structuredFieldCount(value: string): number {
  const parsed = parseStructuredResponse(value, "reasoner");
  return [parsed.routeSuggestion, parsed.reasonSummary, parsed.commitStatement].filter(Boolean).length;
}

function buildStructuredRepairMessages(
  messages: OllamaChatMessage[],
  previousResponse: string
): OllamaChatMessage[] {
  const originalPrompt =
    latestUserPrompt(messages) ??
    messages
      .filter((message) => message.role !== "assistant")
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join("\n\n");
  return [
    {
      role: "system",
      content:
        "Repair the prior answer. Return exactly three lines and no extra text. ROUTE must be one of reflex, cognitive, guarded, or suppressed. REASON and COMMIT must each be one sentence."
    },
    {
      role: "user",
      content: [
        "Original task:",
        originalPrompt,
        "",
        "Previous answer:",
        previousResponse || "(empty)",
        "",
        "Return only:",
        "ROUTE: one label only.",
        "REASON: one sentence.",
        "COMMIT: one sentence."
      ].join("\n")
    }
  ];
}

function compactStructuredPromptSource(messages: OllamaChatMessage[]): string {
  const latestPrompt = latestUserPrompt(messages);
  const source =
    latestPrompt ??
    messages
      .filter((message) => message.role !== "assistant")
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join("\n");
  return source
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildStructuredGeneratePrompt(options: {
  messages: OllamaChatMessage[];
  previousResponse?: string;
  repair?: boolean;
}): string {
  const task = compactStructuredPromptSource(options.messages);
  const lines = [
    "You are Q inside Immaculate.",
    getQRuntimeContextInstruction(),
    "Return JSON only with keys route, reason, commit.",
    "route must be one of reflex, cognitive, guarded, suppressed.",
    "reason must be one short sentence naming the decisive fault or health signal.",
    "commit must be one short sentence naming the next truthful control action.",
    "Do not emit analysis, markdown, or extra keys.",
    "",
    "TASK:",
    task
  ];
  if (options.repair && options.previousResponse?.trim()) {
    lines.push("", "PREVIOUS_ATTEMPT:", options.previousResponse.trim(), "", "Fix the prior attempt and return only valid JSON.");
  }
  return lines.join("\n").trim();
}

function buildGatewayMessages(
  messages: OllamaChatMessage[],
  includeIdentityInstruction = true,
  fastSmoke = false
): OllamaChatMessage[] {
  if (fastSmoke && includeIdentityInstruction) {
    return [
      {
        role: "system",
        content: "Answer only with final visible text. Do not think. Do not explain."
      },
      ...messages
    ];
  }
  if (!includeIdentityInstruction) {
    return messages;
  }
  const context = buildQRuntimeContext();
  return [
    {
      role: "system",
      content: `${getQIdentityInstruction()} Current date: ${context.currentDateLabel} (${context.currentDateIso}, UTC). Static model knowledge cutoff: ${context.knowledgeCutoff}. ${context.currentInformationPolicy} Keep answers grounded, truthful, and consistent with your actual deployment state. If the user asks who you are, who developed you, who led the project, how you relate to Immaculate, or what public model name they should see, answer canonically with Q, Arobi Technology Alliance, Gaetano Comparcola, Gemma 4, and Immaculate.`
    },
    ...messages
  ];
}

function getPrincipal(request: FastifyRequest): GatewayPrincipal | undefined {
  return principals.get(request.raw);
}

async function requireGatewayPrincipal(request: FastifyRequest, reply: FastifyReply) {
  const token = extractAuthorizationToken(request.headers);
  if (!token) {
    reply.code(401).send({
      error: "unauthorized",
      message: "Q gateway requires Authorization: Bearer or X-API-Key."
    });
    return reply;
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
    return reply;
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
    return reply;
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
  return undefined;
}

async function runGatewayChatAttempt(options: {
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs: number;
  includeIdentityInstruction?: boolean;
  fastSmoke?: boolean;
  ollamaOptions?: Record<string, unknown>;
}): Promise<OllamaChatCompletionResult> {
  if (INFERENCE_PROFILE.provider === "openai-compatible") {
    return runOpenAICompatibleResponsesCompletion({
      profile: INFERENCE_PROFILE,
      model: options.model,
      messages: buildGatewayMessages(
        options.messages,
        options.includeIdentityInstruction ?? true,
        options.fastSmoke ?? false
      ),
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs
    });
  }
  if (INFERENCE_PROFILE.provider === "oci-iam-bridge") {
    return runOciIamBridgeResponsesCompletion({
      profile: INFERENCE_PROFILE,
      model: options.model,
      messages: buildGatewayMessages(
        options.messages,
        options.includeIdentityInstruction ?? true,
        options.fastSmoke ?? false
      ),
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      timeoutMs: options.timeoutMs
    });
  }
  return runOllamaChatCompletion({
    endpoint: OLLAMA_URL,
    model: options.model,
    messages: buildGatewayMessages(
      options.messages,
      options.includeIdentityInstruction ?? true,
      options.fastSmoke ?? false
    ),
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs,
    think: false,
    ollamaOptions: options.ollamaOptions
  });
}

async function runGatewayStructuredAttempt(options: {
  model: string;
  messages: OllamaChatMessage[];
  timeoutMs: number;
  maxTokens: number;
  previousResponse?: string;
  repair?: boolean;
  includeIdentityInstruction?: boolean;
  ollamaOptions?: Record<string, unknown>;
}): Promise<OllamaChatCompletionResult> {
  const prompt = buildStructuredGeneratePrompt({
    messages: options.messages,
    previousResponse: options.previousResponse,
    repair: options.repair
  });
  const generated =
    INFERENCE_PROFILE.provider === "openai-compatible"
      ? await runOpenAICompatibleResponsesCompletion({
          profile: INFERENCE_PROFILE,
          model: options.model,
          messages: buildGatewayMessages(
            [
              {
                role: "user",
                content: prompt
              }
            ],
            options.includeIdentityInstruction ?? true
          ),
          temperature: 0,
          maxTokens: Math.min(options.maxTokens, STRUCTURED_REQUEST_MAX_TOKENS),
          timeoutMs: options.timeoutMs,
          format: "json"
        })
      : INFERENCE_PROFILE.provider === "oci-iam-bridge"
        ? await runOciIamBridgeResponsesCompletion({
            profile: INFERENCE_PROFILE,
            model: options.model,
            messages: buildGatewayMessages(
              [
                {
                  role: "user",
                  content: prompt
                }
              ],
              options.includeIdentityInstruction ?? true
            ),
            temperature: 0,
            maxTokens: Math.min(options.maxTokens, STRUCTURED_REQUEST_MAX_TOKENS),
            timeoutMs: options.timeoutMs,
            format: "json"
          })
      : await runOllamaGenerateCompletion({
          endpoint: OLLAMA_URL,
          model: options.model,
          prompt,
          temperature: 0,
          maxTokens: Math.min(options.maxTokens, STRUCTURED_REQUEST_MAX_TOKENS),
          timeoutMs: options.timeoutMs,
          format: "json",
          ollamaOptions: {
            num_ctx: STRUCTURED_FAST_NUM_CTX,
            num_batch: STRUCTURED_FAST_NUM_BATCH,
            ...(options.ollamaOptions ?? {})
          }
        });
  if (generated.failureClass) {
    return generated;
  }
  const parsed = parseStructuredJsonResponse(generated.response, "reasoner");
  if (!parsed) {
    return {
      ...generated,
      failureClass: "contract_invalid",
      responsePreview:
        generated.responsePreview || "Structured contract invalid: missing route, reason, or commit."
    };
  }
  return {
    ...generated,
    response: renderStructuredResponseContract(parsed),
    responsePreview: renderStructuredResponseContract(parsed)
  };
}

function attachQResponseHeaders(
  reply: FastifyReply,
  circuitState: ReturnType<typeof qPrimaryCircuit.snapshot>,
  primaryFailureClass?: string,
  primaryResult?: OllamaChatCompletionResult,
  servedResult?: OllamaChatCompletionResult
): void {
  reply.header("x-q-model-name", getQModelName());
  reply.header("x-q-foundation-model", getQFoundationModelName());
  reply.header("x-q-developer", getQDeveloperName());
  reply.header("x-q-lead", getQLeadName());
  reply.header("x-q-circuit-state", circuitState.state);
  if (primaryFailureClass) {
    reply.header("x-q-failure-class", primaryFailureClass);
  }
  if (primaryResult) {
    reply.header("x-q-latency-ms", String(primaryResult.latencyMs));
  }
  if (servedResult) {
    reply.header("x-upstream-latency-ms", String(servedResult.latencyMs));
  }
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

await app.register(rateLimit, {
  max: Q_GATEWAY_ROUTE_RATE_LIMIT_MAX,
  timeWindow: Q_GATEWAY_ROUTE_RATE_LIMIT_WINDOW
});

app.get("/health", async () => {
  const installedModelNames = await getInstalledModelNames();
  const circuit = qPrimaryCircuit.snapshot();
  return {
    ok: true,
    release: {
      buildId: releaseMetadata.buildId,
      gitShortSha: releaseMetadata.gitShortSha
    },
    gateway: "q",
    modelName: getQModelName(),
    model: getQModelName(),
    developer: getQDeveloperName(),
    lead: getQLeadName(),
    foundationModel: getQFoundationModelName(),
    harness: getImmaculateHarnessName(),
    identitySummary: getQIdentitySummary(),
    modelReady: installedModelNames.some((installedModelName) => matchesModelReference(installedModelName, Q_MODEL_TARGET)),
    circuit,
    inference: PUBLIC_INFERENCE_PROFILE,
    authMode: "api-key",
    host: GATEWAY_HOST,
    port: GATEWAY_PORT
  };
});

app.get("/api/q/info", {
  preHandler: requireGatewayPrincipal,
  config: {
    rateLimit: {
      max: Q_GATEWAY_ROUTE_RATE_LIMIT_MAX,
      timeWindow: Q_GATEWAY_ROUTE_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
  const principal = getPrincipal(request);
  if (!principal) {
    reply.code(401);
    return {
      error: "unauthorized"
    };
  }

  return {
    enabled: true,
    modelName: getQModelName(),
    model: getQModelName(),
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
    circuit: qPrimaryCircuit.snapshot(),
    inference: PUBLIC_INFERENCE_PROFILE,
    authMode: "api-key",
    keyId: principal.key.keyId,
    rateLimit: principal.rateLimit,
    routes: ["/health", "/api/q/info", "/v1/models", "/v1/chat/completions"]
  };
});

app.get("/v1/models", {
  preHandler: requireGatewayPrincipal,
  config: {
    rateLimit: {
      max: Q_GATEWAY_ROUTE_RATE_LIMIT_MAX,
      timeWindow: Q_GATEWAY_ROUTE_RATE_LIMIT_WINDOW
    }
  }
}, async () => ({
  object: "list",
  data: [
    {
      id: getQModelName(),
      object: "model",
      owned_by: getQDeveloperName(),
      metadata: {
        foundationModel: getQFoundationModelName()
      }
    }
  ]
}));

app.post("/v1/chat/completions", {
  preHandler: requireGatewayPrincipal,
  config: {
    rateLimit: {
      max: Q_GATEWAY_ROUTE_RATE_LIMIT_MAX,
      timeWindow: Q_GATEWAY_ROUTE_RATE_LIMIT_WINDOW
    }
  }
}, async (request, reply) => {
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
  const structuredRequest = isStructuredContractRequest(messages);
  const qFastSmokeRequest = isTruthyHeaderValue(request.headers[FAST_SMOKE_HEADER]);
  const effectiveMaxTokens = structuredRequest
    ? Math.min(maxTokens, STRUCTURED_REQUEST_MAX_TOKENS)
    : qFastSmokeRequest
      ? Math.min(maxTokens, FAST_SMOKE_MAX_TOKENS)
    : maxTokens;
  const timeoutOverrideMs = parseTimeoutOverrideMs(
    request.headers[REQUEST_TIMEOUT_OVERRIDE_HEADER]
  );
  const baseTimeoutMs = structuredRequest
    ? Math.min(DEFAULT_TIMEOUT_MS, STRUCTURED_REQUEST_TIMEOUT_MS)
    : DEFAULT_TIMEOUT_MS;
  const effectiveTimeoutMs = timeoutOverrideMs
    ? Math.max(1_000, Math.min(DEFAULT_TIMEOUT_MS, timeoutOverrideMs))
    : baseTimeoutMs;
  const userPrompt = latestUserPrompt(messages);
  const canonicalIdentityKind = detectQIdentityQuestion(userPrompt);
  const skipBenchmarkIdentity = isTruthyHeaderValue(
    request.headers[BENCHMARK_SKIP_Q_IDENTITY_HEADER]
  );
  const fastSmokeRequest =
    skipBenchmarkIdentity || qFastSmokeRequest;
  const benchmarkOllamaOptions = fastSmokeRequest
    ? {
        num_ctx: qFastSmokeRequest ? STRUCTURED_FAST_NUM_CTX : BENCHMARK_NUM_CTX,
        num_batch: qFastSmokeRequest ? STRUCTURED_FAST_NUM_BATCH : BENCHMARK_NUM_BATCH
      }
    : undefined;
  if (canonicalIdentityKind && !skipBenchmarkIdentity) {
    const circuit = qPrimaryCircuit.snapshot();
    attachQResponseHeaders(reply, circuit);
    return {
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: getQModelName(),
      foundationModel: getQFoundationModelName(),
      developer: getQDeveloperName(),
      lead: getQLeadName(),
      harness: getImmaculateHarnessName(),
      circuitState: circuit.state,
      latencyMs: 0,
      thinkingDetected: false,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: buildCanonicalQIdentityAnswer(canonicalIdentityKind)
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
  }

  const fastSmokeHoldMs =
    qFastSmokeRequest && !structuredRequest
      ? parseFastSmokeHoldMs(request.headers[FAST_SMOKE_HOLD_HEADER])
      : 0;
  if (fastSmokeHoldMs > 0) {
    await delay(fastSmokeHoldMs);
    const circuit = qPrimaryCircuit.snapshot();
    attachQResponseHeaders(reply, circuit);
    return {
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: getQModelName(),
      foundationModel: getQFoundationModelName(),
      developer: getQDeveloperName(),
      lead: getQLeadName(),
      harness: getImmaculateHarnessName(),
      circuitState: circuit.state,
      latencyMs: fastSmokeHoldMs,
      thinkingDetected: false,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Q gateway healthy."
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
  }

  const primaryDecision = qPrimaryCircuit.beforeRequest();
  const qModel = Q_MODEL_TARGET;
  let primaryResult: OllamaChatCompletionResult | undefined;
  let primaryFailureClass: string | undefined = primaryDecision.reason;
  let servedResult: OllamaChatCompletionResult | undefined;
  let structuredRetryAttempted = false;
  let structuredRetryUsed = false;
  let structuredRetryFailureClass: string | undefined;
  let contractRepairAttempted = false;
  let contractRepairUsed = false;
  let contractRepairFailureClass: string | undefined;

  if (primaryDecision.allowPrimary) {
    primaryResult = structuredRequest
      ? await runGatewayStructuredAttempt({
          model: qModel,
          messages,
          maxTokens: effectiveMaxTokens,
          timeoutMs: effectiveTimeoutMs,
          includeIdentityInstruction: !skipBenchmarkIdentity,
          ollamaOptions: benchmarkOllamaOptions
        })
      : await runGatewayChatAttempt({
          model: qModel,
          messages,
          temperature,
          maxTokens: effectiveMaxTokens,
          timeoutMs: effectiveTimeoutMs,
          includeIdentityInstruction: !skipBenchmarkIdentity,
          fastSmoke: fastSmokeRequest,
          ollamaOptions: benchmarkOllamaOptions
        });
    if (!primaryResult.failureClass || (structuredRequest && primaryResult.failureClass === "contract_invalid")) {
      servedResult = primaryResult;
    } else if (structuredRequest && isRetryableStructuredFailure(primaryResult.failureClass)) {
      structuredRetryAttempted = true;
      const retryResult = await runGatewayStructuredAttempt({
        model: qModel,
        messages,
        maxTokens: effectiveMaxTokens,
        timeoutMs: Math.min(
          effectiveTimeoutMs,
          Math.max(STRUCTURED_REPAIR_TIMEOUT_MS * 2, Math.round(effectiveTimeoutMs * 0.5))
        ),
        includeIdentityInstruction: !skipBenchmarkIdentity,
        ollamaOptions: benchmarkOllamaOptions
      });
      primaryResult = retryResult;
      if (!retryResult.failureClass || retryResult.failureClass === "contract_invalid") {
        servedResult = retryResult;
        structuredRetryUsed = !retryResult.failureClass;
      } else {
        primaryFailureClass = retryResult.failureClass;
        structuredRetryFailureClass = retryResult.failureClass;
      }
    } else {
      primaryFailureClass = primaryResult.failureClass;
    }
  }

  if (!servedResult || (servedResult.failureClass && servedResult.failureClass !== "contract_invalid")) {
    const failureClass = servedResult?.failureClass ?? primaryFailureClass ?? "http_error";
    const circuit = finalizeGatewayCircuit(failureClass);
    attachQResponseHeaders(reply, circuit, failureClass, primaryResult, servedResult);
    reply.code(503);
    return {
      error: "q_upstream_failure",
      failureClass,
      message: servedResult?.responsePreview ?? primaryResult?.responsePreview ?? "Q upstream failed.",
      model: getQModelName(),
      foundationModel: getQFoundationModelName(),
      developer: getQDeveloperName(),
      lead: getQLeadName(),
      harness: getImmaculateHarnessName(),
      circuitState: circuit.state,
      latencyMs: servedResult?.latencyMs ?? primaryResult?.latencyMs ?? 0,
      thinkingDetected: servedResult?.thinkingDetected ?? primaryResult?.thinkingDetected ?? false,
      structuredRetryAttempted,
      structuredRetryUsed,
      structuredRetryFailureClass,
      contractRepairAttempted,
      contractRepairUsed,
      contractRepairFailureClass
    };
  }

  let servedLatencyMs = servedResult.latencyMs;
  let servedThinkingDetected = servedResult.thinkingDetected;
  let content = sanitizeGatewayResponse(servedResult.response);
  if (canonicalIdentityKind) {
    content = canonicalizeQIdentityAnswer(userPrompt, content);
  }
  if (structuredRequest && structuredFieldCount(content) !== 3) {
    contractRepairAttempted = true;
    const repairResult = structuredRequest
      ? await runGatewayStructuredAttempt({
          model: qModel,
          messages,
          previousResponse: content,
          repair: true,
          maxTokens: Math.min(effectiveMaxTokens, STRUCTURED_REQUEST_MAX_TOKENS),
          timeoutMs: STRUCTURED_REPAIR_TIMEOUT_MS,
          includeIdentityInstruction: !skipBenchmarkIdentity,
          ollamaOptions: benchmarkOllamaOptions
        })
      : await runGatewayChatAttempt({
          model: qModel,
          messages: buildStructuredRepairMessages(messages, content),
          temperature: 0,
          maxTokens: Math.min(effectiveMaxTokens, STRUCTURED_REQUEST_MAX_TOKENS),
          timeoutMs: STRUCTURED_REPAIR_TIMEOUT_MS,
          includeIdentityInstruction: !skipBenchmarkIdentity,
          ollamaOptions: benchmarkOllamaOptions
        });
    servedLatencyMs += repairResult.latencyMs;
    servedThinkingDetected = servedThinkingDetected || repairResult.thinkingDetected;
    if (!repairResult.failureClass) {
      const repairedContentRaw = sanitizeGatewayResponse(repairResult.response);
      const repairedContent = canonicalIdentityKind
        ? canonicalizeQIdentityAnswer(userPrompt, repairedContentRaw)
        : repairedContentRaw;
      if (structuredFieldCount(repairedContent) === 3) {
        content = repairedContent;
        contractRepairUsed = true;
      } else {
        contractRepairFailureClass = "contract_invalid";
      }
    } else {
      contractRepairFailureClass = repairResult.failureClass;
    }
  }
  if (structuredRequest && structuredFieldCount(content) !== 3) {
    const failureClass =
      contractRepairFailureClass ?? servedResult.failureClass ?? primaryFailureClass ?? "contract_invalid";
    const circuit = finalizeGatewayCircuit(failureClass);
    attachQResponseHeaders(reply, circuit, failureClass, primaryResult, servedResult);
    reply.code(503);
    return {
      error: "q_upstream_failure",
      failureClass,
      message: content || "Structured contract invalid: missing ROUTE, REASON, or COMMIT.",
      model: getQModelName(),
      foundationModel: getQFoundationModelName(),
      developer: getQDeveloperName(),
      lead: getQLeadName(),
      harness: getImmaculateHarnessName(),
      circuitState: circuit.state,
      latencyMs: servedLatencyMs,
      thinkingDetected: servedThinkingDetected,
      structuredRetryAttempted,
      structuredRetryUsed,
      structuredRetryFailureClass,
      contractRepairAttempted,
      contractRepairUsed,
      contractRepairFailureClass
    };
  }

  const circuit = finalizeGatewayCircuit(undefined);
  attachQResponseHeaders(reply, circuit, primaryFailureClass, primaryResult, servedResult);

  return {
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: getQModelName(),
    foundationModel: getQFoundationModelName(),
    developer: getQDeveloperName(),
    lead: getQLeadName(),
    harness: getImmaculateHarnessName(),
    circuitState: circuit.state,
    latencyMs: servedLatencyMs,
    thinkingDetected: servedThinkingDetected,
    structuredRetryAttempted,
    structuredRetryUsed,
    structuredRetryFailureClass,
    contractRepairAttempted,
    contractRepairUsed,
    contractRepairFailureClass,
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
