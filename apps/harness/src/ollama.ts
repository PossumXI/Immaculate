import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import {
  type CognitiveExecution,
  type GuardVerdict,
  type GovernancePressureLevel,
  type IntelligenceLayer,
  type IntelligenceLayerRole,
  type PhaseSnapshot
} from "@immaculate/core";
import {
  expandOllamaAliasSearchText,
  matchAliasedOllamaModel,
  resolveQAliasSpecification
} from "./ollama-alias.js";

type OllamaModelDetails = {
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
};

type OllamaModelRecord = {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: OllamaModelDetails;
};

type OllamaTagResponse = {
  models?: OllamaModelRecord[];
};

type OllamaGenerateResponse = {
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  response?: string;
  total_duration?: number;
  eval_duration?: number;
  prompt_eval_duration?: number;
  done?: boolean;
};

export type OllamaFailureClass =
  | "transport_timeout"
  | "http_error"
  | "invalid_json"
  | "empty_response"
  | "contract_invalid";

export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OllamaChatCompletionResult = {
  response: string;
  model: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  done: boolean;
  thinkingDetected: boolean;
  responsePreview: string;
  failureClass?: OllamaFailureClass;
  errorMessage?: string;
};

export type OllamaExecutionResult = {
  response: string;
  execution: CognitiveExecution;
  failureClass?: OllamaFailureClass;
  thinkingDetected: boolean;
  structuredFieldCount: number;
};

const DEFAULT_OLLAMA_URL = process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.IMMACULATE_OLLAMA_MODEL;
const DEFAULT_ROLE = (process.env.IMMACULATE_OLLAMA_ROLE as IntelligenceLayerRole | undefined) ?? "mid";
const DEFAULT_CONTROL_TIMEOUT_MS = Number(process.env.IMMACULATE_OLLAMA_CONTROL_TIMEOUT_MS ?? 180000);
const DEFAULT_STRUCTURED_MAX_TOKENS = 120;
const DEFAULT_STRUCTURED_TEMPERATURE = 0.2;
const Q_STRUCTURED_MAX_TOKENS = Math.max(
  DEFAULT_STRUCTURED_MAX_TOKENS,
  Number(process.env.IMMACULATE_OLLAMA_Q_EXECUTION_MAX_TOKENS ?? 256) || 256
);
const Q_STRUCTURED_TEMPERATURE = Number(
  process.env.IMMACULATE_OLLAMA_Q_EXECUTION_TEMPERATURE ?? 0.05
);

function normalizeBaseUrl(baseUrl = DEFAULT_OLLAMA_URL): string {
  return baseUrl.replace(/\/+$/, "");
}

function truncate(value: string, maxLength = 280): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeWords(value: string, maxWords = 24): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

function clampTemperature(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeModel(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isQExecutionModel(value: string | undefined): boolean {
  return normalizeModel(value) === normalizeModel(resolveQAliasSpecification().baseModel);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

class OllamaRequestError extends Error {
  readonly failureClass: Exclude<OllamaFailureClass, "empty_response" | "contract_invalid">;

  constructor(
    failureClass: Exclude<OllamaFailureClass, "empty_response" | "contract_invalid">,
    message: string
  ) {
    super(message);
    this.name = "OllamaRequestError";
    this.failureClass = failureClass;
  }
}

function layerIdForModel(model: string, role: IntelligenceLayerRole): string {
  const normalized = model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `ollama-${role}-${normalized || "model"}`;
}

function modelSearchText(model: OllamaModelRecord): string {
  const baseSearchText = [
    model.name,
    model.model,
    model.details?.family,
    ...(model.details?.families ?? []),
    model.details?.parameter_size
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return expandOllamaAliasSearchText(model.name ?? model.model ?? "", baseSearchText);
}

function parseModelScale(model: OllamaModelRecord): number {
  const raw = model.details?.parameter_size?.toLowerCase() ?? "";
  const match = raw.match(/(\d+(?:\.\d+)?)\s*b/);
  return match ? Number(match[1]) : 0;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 5000,
  baseUrl = DEFAULT_OLLAMA_URL
): Promise<T> {
  const base = normalizeBaseUrl(baseUrl);
  const url = new URL(path.startsWith("/") ? `${base}${path}` : `${base}/${path}`);
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  const rawBody = init?.body;
  const body =
    typeof rawBody === "string"
      ? rawBody
      : rawBody instanceof Uint8Array
        ? Buffer.from(rawBody)
        : rawBody == null
          ? undefined
          : (() => {
              throw new OllamaRequestError("http_error", "Unsupported Ollama request body type.");
            })();

  try {
    return await new Promise<T>((resolve, reject) => {
      const requestImpl = url.protocol === "https:" ? https.request : http.request;
      const request = requestImpl(
        url,
        {
          method,
          headers: Object.fromEntries(headers.entries())
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            const payloadText = Buffer.concat(chunks).toString("utf8");
            if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
              const detail = payloadText.trim().slice(0, 240);
              reject(
                new OllamaRequestError(
                  "http_error",
                  detail.length > 0
                    ? `Ollama request failed with status ${response.statusCode}: ${detail}`
                    : `Ollama request failed with status ${response.statusCode}.`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(payloadText) as T);
            } catch (error) {
              reject(
                new OllamaRequestError(
                  "invalid_json",
                  error instanceof Error
                    ? `Ollama returned invalid JSON: ${error.message}`
                    : "Ollama returned invalid JSON."
                )
              );
            }
          });
        }
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new OllamaRequestError(
            "transport_timeout",
            `Ollama request timed out after ${timeoutMs} ms.`
          )
        );
      });
      request.on("error", (error) => {
        reject(
          error instanceof OllamaRequestError
            ? error
            : new OllamaRequestError(
                "http_error",
                error instanceof Error ? error.message : "Unable to reach the configured Ollama endpoint."
              )
        );
      });

      if (body) {
        request.write(body);
      }
      request.end();
    });
  } catch (error) {
    throw error;
  }
}

export async function listOllamaModels(baseUrl = DEFAULT_OLLAMA_URL): Promise<OllamaModelRecord[]> {
  const payload = await fetchJson<OllamaTagResponse>("/api/tags", undefined, 3500, baseUrl);
  return Array.isArray(payload.models) ? payload.models : [];
}

function pickPreferredModel(
  models: OllamaModelRecord[],
  role: IntelligenceLayerRole,
  explicitModel?: string
): OllamaModelRecord | null {
  const preferredModel = explicitModel ?? DEFAULT_MODEL;
  if (preferredModel) {
    return (
      models.find((model) => model.name === preferredModel || model.model === preferredModel) ??
      matchAliasedOllamaModel(models, preferredModel, modelSearchText) ??
      null
    );
  }

  const scored = models
    .map((model) => {
      const search = modelSearchText(model);
      const scale = parseModelScale(model);
      let score = 0;

      if (search.includes(resolveQAliasSpecification().alias.toLowerCase())) {
        score += 12;
      }

      if (role === "soul") {
        if (/large|27b|32b|70b/.test(search) || scale >= 24) {
          score += 40;
        }
        score += Math.min(scale, 40);
      } else if (role === "reasoner") {
        if (/reason|r1/.test(search)) {
          score += 42;
        }
        if (/14b|12b|32b/.test(search) || scale >= 12) {
          score += 12;
        }
      } else if (role === "guard") {
        if (/mini|small|3b|4b|7b|8b/.test(search) || (scale > 0 && scale <= 8)) {
          score += 28;
        }
        score -= Math.max(0, scale - 10) * 0.8;
      } else {
        if (search.includes(resolveQAliasSpecification().alias.toLowerCase())) {
          score += 24;
        }
        if (/9b|12b|14b/.test(search) || (scale >= 8 && scale <= 16)) {
          score += 10;
        }
      }

      return {
        model,
        score
      };
    })
    .sort((left, right) => right.score - left.score || left.model.name.localeCompare(right.model.name));

  return scored[0]?.model ?? null;
}

export async function discoverPreferredOllamaLayer(
  role: IntelligenceLayerRole = DEFAULT_ROLE,
  baseUrl = DEFAULT_OLLAMA_URL,
  explicitModel?: string
): Promise<IntelligenceLayer | null> {
  const models = await listOllamaModels(baseUrl);
  const preferred = pickPreferredModel(models, role, explicitModel);
  if (!preferred) {
    return null;
  }

  const modelName = preferred.name;
  const qAlias = resolveQAliasSpecification();
  const layerLabel = modelName === qAlias.baseModel ? qAlias.displayName : modelName;
  return {
    id: layerIdForModel(modelName, role),
    name: `${layerLabel} ${role === "mid" ? "Mid Layer" : role === "reasoner" ? "Reasoner Layer" : `${role} Layer`}`,
    backend: "ollama",
    model: modelName,
    role,
    status: "ready",
    endpoint: normalizeBaseUrl(baseUrl),
    family: preferred.details?.family ?? preferred.details?.families?.[0],
    parameterSize: preferred.details?.parameter_size,
    quantization: preferred.details?.quantization_level,
    registeredAt: new Date().toISOString()
  };
}

function formatDatasetSection(snapshot: PhaseSnapshot): string {
  if (snapshot.datasets.length === 0) {
    return "none";
  }

  return snapshot.datasets
    .slice(0, 4)
    .map(
      (dataset) =>
        `${dataset.name} | ${dataset.subjectCount} subjects | ${dataset.modalities.map((entry) => entry.modality).join(", ")}`
    )
    .join("\n");
}

function formatNeuroSection(snapshot: PhaseSnapshot): string {
  if (snapshot.neuroSessions.length === 0) {
    return "none";
  }

  return snapshot.neuroSessions
    .slice(0, 4)
    .map(
      (session) =>
        `${session.name} | ${session.streamCount} streams | ${session.totalChannels} channels | ${session.primaryRateHz ?? "variable"} Hz`
    )
    .join("\n");
}

function formatPassSection(snapshot: PhaseSnapshot): string {
  return snapshot.passes
    .map((pass) => `${pass.phase}:${pass.state}:${pass.latencyMs.toFixed(1)}ms`)
    .join("\n");
}

function formatRecentExecutionSection(snapshot: PhaseSnapshot): string {
  if (snapshot.cognitiveExecutions.length === 0) {
    return "none";
  }

  return snapshot.cognitiveExecutions
    .slice(0, 3)
    .map(
      (execution) =>
        `${execution.model} | ${execution.status} | ${execution.latencyMs.toFixed(1)}ms | ${truncate(execution.objective, 120)}`
    )
    .join("\n");
}

function formatScheduleSection(snapshot: PhaseSnapshot): string {
  if (snapshot.executionSchedules.length === 0) {
    return "none";
  }

  return snapshot.executionSchedules
    .slice(0, 3)
    .map(
      (schedule) =>
        `${schedule.mode} | width=${schedule.layerIds.length} | primary=${schedule.primaryLayerId ?? "none"} | ${schedule.estimatedLatencyMs.toFixed(1)}ms`
    )
    .join("\n");
}

function formatConversationSection(snapshot: PhaseSnapshot): string {
  if (snapshot.conversations.length === 0) {
    return "none";
  }

  return snapshot.conversations
    .slice(0, 2)
    .map(
      (conversation) =>
        `${conversation.mode} | turns=${conversation.turnCount} | verdict=${conversation.guardVerdict} | ${truncate(conversation.summary, 96)}`
    )
    .join("\n");
}

function responseContract(role: IntelligenceLayerRole): string {
  if (role === "guard") {
    return `Return exactly:
ROUTE: one sentence, max 18 words.
REASON: one sentence, max 18 words, naming the decisive fault or health signal.
COMMIT: one sentence, max 18 words, naming the concrete next control action.
VERDICT: approved or blocked.
No bullets. No preamble. No extra sections.`;
  }

  return `Return exactly:
ROUTE: one sentence, max 18 words.
REASON: one sentence, max 18 words, naming the decisive fault or health signal.
COMMIT: one sentence, max 18 words, naming the concrete next control action.
No bullets. No preamble. No extra sections.`;
}

export function buildImmaculatePrompt(options: {
  snapshot: PhaseSnapshot;
  role: IntelligenceLayerRole;
  objective?: string;
  governancePressure?: GovernancePressureLevel;
  recentDeniedCount?: number;
  context?: string;
}): string {
  const activeObjective = options.objective?.trim() || options.snapshot.objective;
  const context = options.context?.trim() || "none";

  return `Immaculate live cognition pass.
${responseContract(options.role)}

cycle=${options.snapshot.cycle} epoch=${options.snapshot.epoch} status=${options.snapshot.status}
intent=${options.snapshot.intent}
objective=${activeObjective}
focus=${options.snapshot.highlightedNodeId}
GOVERNANCE: ${options.governancePressure ?? "clear"} pressure | ${options.recentDeniedCount ?? 0} denials (5 min window)
reflex_ms=${options.snapshot.metrics.reflexLatencyMs.toFixed(1)} cognitive_ms=${options.snapshot.metrics.cognitiveLatencyMs.toFixed(1)}
health=${options.snapshot.metrics.graphHealth.toFixed(3)} coherence=${options.snapshot.metrics.coherence.toFixed(3)} throughput=${Math.round(options.snapshot.metrics.throughput)}
passes=${formatPassSection(options.snapshot)}
datasets=${formatDatasetSection(options.snapshot)}
neuro=${formatNeuroSection(options.snapshot)}
recent=${formatRecentExecutionSection(options.snapshot)}
schedules=${formatScheduleSection(options.snapshot)}
conversations=${formatConversationSection(options.snapshot)}
context=${context}
events=${options.snapshot.logTail.slice(0, 4).join(" | ") || "none"}
grounding=prefer explicit facts like late ACK, nonce mismatch/replay, degraded bridge, or healthy direct path over generic safety language`;
}

function parseGuardVerdict(value: string | undefined, role: IntelligenceLayerRole): GuardVerdict | undefined {
  if (!value) {
    return role === "guard" ? "unknown" : undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("block")) {
    return "blocked";
  }
  if (normalized.includes("approve")) {
    return "approved";
  }
  return role === "guard" ? "unknown" : undefined;
}

function extractStructuredLine(
  response: string,
  field: "ROUTE" | "REASON" | "COMMIT" | "VERDICT"
): string | undefined {
  const matches = Array.from(
    response.matchAll(
      new RegExp(`${field}\\s*:\\s*(.+?)(?=\\s+(?:ROUTE|REASON|COMMIT|VERDICT)\\s*:|$)`, "gis")
    )
  );
  const value = matches.at(-1)?.[1];
  return value ? normalizeWords(value) : undefined;
}

function extractChannelTail(response: string): string {
  const trimmed = response.trim();
  const channelIndex = trimmed.lastIndexOf("<channel|>");
  if (channelIndex >= 0) {
    const candidate = trimmed.slice(channelIndex + "<channel|>".length).trim();
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return trimmed;
}

function selectStructuredResponseCandidate(response: string): string {
  const trimmed = extractChannelTail(response);
  const routeMatches = Array.from(trimmed.matchAll(/ROUTE\s*:/gi));

  for (let index = routeMatches.length - 1; index >= 0; index -= 1) {
    const routeIndex = routeMatches[index]?.index;
    if (typeof routeIndex !== "number") {
      continue;
    }
    const candidate = trimmed.slice(routeIndex).trim();
    const routeSuggestion = extractStructuredLine(candidate, "ROUTE");
    const reasonSummary = extractStructuredLine(candidate, "REASON");
    const commitStatement = extractStructuredLine(candidate, "COMMIT");
    if (routeSuggestion && reasonSummary && commitStatement) {
      return candidate;
    }
  }

  return trimmed;
}

export function parseStructuredResponse(response: string, role: IntelligenceLayerRole) {
  const normalizedResponse = selectStructuredResponseCandidate(response);
  const routeSuggestion = extractStructuredLine(normalizedResponse, "ROUTE");
  const reasonSummary = extractStructuredLine(normalizedResponse, "REASON");
  const commitStatement = extractStructuredLine(normalizedResponse, "COMMIT");
  const explicitVerdict = extractStructuredLine(normalizedResponse, "VERDICT");

  return {
    normalizedResponse,
    routeSuggestion,
    reasonSummary,
    commitStatement,
    guardVerdict: parseGuardVerdict(explicitVerdict, role)
  };
}

function resolveStructuredExecutionProfile(model: string) {
  if (isQExecutionModel(model)) {
    return {
      maxTokens: Q_STRUCTURED_MAX_TOKENS,
      temperature: clampTemperature(Q_STRUCTURED_TEMPERATURE, 0.1)
    };
  }

  return {
    maxTokens: DEFAULT_STRUCTURED_MAX_TOKENS,
    temperature: DEFAULT_STRUCTURED_TEMPERATURE
  };
}

function computeLatencyMs(
  payload: Pick<OllamaGenerateResponse, "total_duration">,
  startedAt: string,
  completedAt: string
): number {
  return typeof payload.total_duration === "number"
    ? Number((payload.total_duration / 1_000_000).toFixed(2))
    : Math.max(1, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}

function formatOllamaFailurePreview(
  failureClass: OllamaFailureClass,
  errorMessage?: string,
  response?: string
): string {
  if (failureClass === "empty_response") {
    return "No response returned by Ollama.";
  }
  if (failureClass === "contract_invalid") {
    return truncate(
      response?.trim().length
        ? `Structured contract invalid: ${response}`
        : "Structured contract invalid: missing ROUTE, REASON, or COMMIT."
    );
  }
  return truncate(errorMessage?.trim() || "Ollama execution failed.");
}

const STRUCTURED_PROMPT_LEAK_PATTERNS = [
  /\bone sentence\b/i,
  /\bmax\s+\d+\s+words\b/i,
  /\bno bullets\b/i,
  /\bno preamble\b/i,
  /\bno extra sections\b/i,
  /\bthe user wants me\b/i,
  /\bmy output must\b/i,
  /^\s*thought\b/i
];

function containsStructuredPromptLeak(value: string | undefined): boolean {
  const candidate = value?.trim();
  if (!candidate) {
    return false;
  }
  return STRUCTURED_PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(candidate));
}

export async function runOllamaChatCompletion(options: {
  endpoint?: string;
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  think?: boolean;
}): Promise<OllamaChatCompletionResult> {
  const startedAt = new Date().toISOString();
  try {
    const payload = await fetchJson<OllamaGenerateResponse>(
      "/api/chat",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          stream: false,
          think: options.think ?? false,
          messages: options.messages,
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 120
          }
        })
      },
      options.timeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS,
      options.endpoint ?? DEFAULT_OLLAMA_URL
    );
    const completedAt = new Date().toISOString();
    const response =
      typeof payload.message?.content === "string"
        ? payload.message.content.trim()
        : typeof payload.response === "string"
          ? payload.response.trim()
          : "";
    const thinkingDetected =
      typeof payload.message?.thinking === "string" && payload.message.thinking.trim().length > 0;
    const latencyMs = computeLatencyMs(payload, startedAt, completedAt);
    const failureClass = response.length > 0 ? undefined : "empty_response";

    return {
      response,
      model: options.model,
      startedAt,
      completedAt,
      latencyMs,
      done: payload.done !== false,
      thinkingDetected,
      responsePreview: truncate(
        failureClass ? formatOllamaFailurePreview(failureClass) : response
      ),
      failureClass
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const failureClass =
      error instanceof OllamaRequestError ? error.failureClass : "http_error";
    const errorMessage =
      error instanceof Error ? error.message : "Unable to reach the configured Ollama endpoint.";
    return {
      response: "",
      model: options.model,
      startedAt,
      completedAt,
      latencyMs: Math.max(1, Date.parse(completedAt) - Date.parse(startedAt)),
      done: false,
      thinkingDetected: false,
      responsePreview: formatOllamaFailurePreview(failureClass, errorMessage),
      failureClass,
      errorMessage
    };
  }
}

export async function runOllamaExecution(options: {
  snapshot: PhaseSnapshot;
  layer: IntelligenceLayer;
  objective?: string;
  governancePressure?: GovernancePressureLevel;
  recentDeniedCount?: number;
  context?: string;
}): Promise<OllamaExecutionResult> {
  const executionProfile = resolveStructuredExecutionProfile(options.layer.model);
  const prompt = buildImmaculatePrompt({
    snapshot: options.snapshot,
    role: options.layer.role,
    objective: options.objective,
    governancePressure: options.governancePressure,
    recentDeniedCount: options.recentDeniedCount,
    context: options.context
  });
  const system = `You are ${options.layer.name}, the ${options.layer.role} cognition layer inside Immaculate.
You convert state into route/reason/commit outputs for a durable orchestration substrate.${
    options.layer.role === "guard"
      ? " You must include VERDICT: approved or blocked."
      : ""
  } Keep the reason grounded in the decisive concrete fault or health signal and keep the commit as the next truthful control action.`;
  const completion = await runOllamaChatCompletion({
    endpoint: options.layer.endpoint,
    model: options.layer.model,
    messages: [
      {
        role: "system",
        content: system
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: executionProfile.temperature,
    maxTokens: executionProfile.maxTokens,
    timeoutMs: DEFAULT_CONTROL_TIMEOUT_MS,
    think: false
  });
  const parsed = parseStructuredResponse(completion.response, options.layer.role);
  const response = parsed.normalizedResponse || completion.response;
  const activeObjective = options.objective?.trim() || options.snapshot.objective;
  const structuredFieldCount = [
    parsed.routeSuggestion,
    parsed.reasonSummary,
    parsed.commitStatement
  ].filter(Boolean).length;
  const contractValid =
    completion.done &&
    structuredFieldCount === 3 &&
    !containsStructuredPromptLeak(response) &&
    !containsStructuredPromptLeak(parsed.routeSuggestion) &&
    !containsStructuredPromptLeak(parsed.reasonSummary) &&
    !containsStructuredPromptLeak(parsed.commitStatement);
  const failureClass =
    completion.failureClass ??
    (!contractValid ? "contract_invalid" : undefined);
  const execution: CognitiveExecution = {
    id: `cog-${new Date(completion.completedAt).toISOString().replace(/[:.]/g, "-")}-${digest(options.layer.id).slice(0, 8)}`,
    layerId: options.layer.id,
    model: options.layer.model,
    objective: activeObjective,
    status: failureClass ? "failed" : "completed",
    latencyMs: completion.latencyMs,
    startedAt: completion.startedAt,
    completedAt: completion.completedAt,
    promptDigest: digest(prompt).slice(0, 24),
    responsePreview: failureClass
      ? formatOllamaFailurePreview(failureClass, completion.errorMessage, response)
      : truncate(response),
    routeSuggestion: parsed.routeSuggestion,
    reasonSummary: parsed.reasonSummary,
    commitStatement: parsed.commitStatement,
    guardVerdict: parsed.guardVerdict,
    governancePressure: options.governancePressure,
    recentDeniedCount: options.recentDeniedCount
  };

  return {
    response,
    execution,
    failureClass,
    thinkingDetected: completion.thinkingDetected,
    structuredFieldCount
  };
}
