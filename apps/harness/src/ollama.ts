import { createHash } from "node:crypto";
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
  };
  response?: string;
  total_duration?: number;
  eval_duration?: number;
  prompt_eval_duration?: number;
  done?: boolean;
};

export type OllamaExecutionResult = {
  response: string;
  execution: CognitiveExecution;
};

const DEFAULT_OLLAMA_URL = process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.IMMACULATE_OLLAMA_MODEL;
const DEFAULT_ROLE = (process.env.IMMACULATE_OLLAMA_ROLE as IntelligenceLayerRole | undefined) ?? "mid";
const DEFAULT_GENERATE_TIMEOUT_MS = Number(process.env.IMMACULATE_OLLAMA_TIMEOUT_MS ?? 300000);

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

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}.`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
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

      if (/gemma4/.test(search)) {
        score += 12;
      }
      if (/gemma|qwen|mistral|llama|deepseek/.test(search)) {
        score += 6;
      }

      if (role === "soul") {
        if (/large|27b|32b|70b/.test(search) || scale >= 24) {
          score += 40;
        }
        if (/gemma|mistral|llama/.test(search)) {
          score += 12;
        }
        score += Math.min(scale, 40);
      } else if (role === "reasoner") {
        if (/reason|r1|deepseek|qwen/.test(search)) {
          score += 42;
        }
        if (/14b|12b|32b/.test(search) || scale >= 12) {
          score += 12;
        }
      } else if (role === "guard") {
        if (/mini|small|3b|4b|7b|8b/.test(search) || (scale > 0 && scale <= 8)) {
          score += 28;
        }
        if (/gemma|qwen|llama|mistral/.test(search)) {
          score += 8;
        }
        score -= Math.max(0, scale - 10) * 0.8;
      } else {
        if (/gemma4|gemma3|qwen/.test(search)) {
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
REASON: one sentence, max 18 words.
COMMIT: one sentence, max 18 words.
VERDICT: approved or blocked.
No bullets. No preamble. No extra sections.`;
  }

  return `Return exactly:
ROUTE: one sentence, max 18 words.
REASON: one sentence, max 18 words.
COMMIT: one sentence, max 18 words.
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
events=${options.snapshot.logTail.slice(0, 4).join(" | ") || "none"}`;
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
  const match = response.match(
    new RegExp(`${field}\\s*:\\s*(.+?)(?=\\s+(?:ROUTE|REASON|COMMIT|VERDICT)\\s*:|$)`, "is")
  );
  return match?.[1] ? normalizeWords(match[1]) : undefined;
}

export function parseStructuredResponse(response: string, role: IntelligenceLayerRole) {
  const routeSuggestion = extractStructuredLine(response, "ROUTE");
  const reasonSummary = extractStructuredLine(response, "REASON");
  const commitStatement = extractStructuredLine(response, "COMMIT");
  const explicitVerdict = extractStructuredLine(response, "VERDICT");

  return {
    routeSuggestion,
    reasonSummary,
    commitStatement,
    guardVerdict: parseGuardVerdict(explicitVerdict, role)
  };
}

export async function runOllamaExecution(options: {
  snapshot: PhaseSnapshot;
  layer: IntelligenceLayer;
  objective?: string;
  governancePressure?: GovernancePressureLevel;
  recentDeniedCount?: number;
  context?: string;
}): Promise<OllamaExecutionResult> {
  const startedAt = new Date().toISOString();
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
  }`;
  const payload = await fetchJson<OllamaGenerateResponse>(
    "/api/chat",
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.layer.model,
        stream: false,
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
        options: {
          temperature: 0.2,
          num_predict: 120
        }
      })
    },
    DEFAULT_GENERATE_TIMEOUT_MS,
    options.layer.endpoint
  );

  const completedAt = new Date().toISOString();
  const response =
    typeof payload.message?.content === "string"
      ? payload.message.content.trim()
      : typeof payload.response === "string"
        ? payload.response.trim()
        : "";
  const latencyMs =
    typeof payload.total_duration === "number"
      ? Number((payload.total_duration / 1_000_000).toFixed(2))
      : Math.max(1, new Date(completedAt).getTime() - new Date(startedAt).getTime());
  const activeObjective = options.objective?.trim() || options.snapshot.objective;
  const parsed = parseStructuredResponse(response, options.layer.role);
  const execution: CognitiveExecution = {
    id: `cog-${new Date(completedAt).toISOString().replace(/[:.]/g, "-")}-${digest(options.layer.id).slice(0, 8)}`,
    layerId: options.layer.id,
    model: options.layer.model,
    objective: activeObjective,
    status: response.length > 0 ? "completed" : "failed",
    latencyMs,
    startedAt,
    completedAt,
    promptDigest: digest(prompt).slice(0, 24),
    responsePreview: truncate(response.length > 0 ? response : "No response returned by Ollama."),
    routeSuggestion: parsed.routeSuggestion,
    reasonSummary: parsed.reasonSummary,
    commitStatement: parsed.commitStatement,
    guardVerdict: parsed.guardVerdict,
    governancePressure: options.governancePressure,
    recentDeniedCount: options.recentDeniedCount
  };

  return {
    response,
    execution
  };
}
