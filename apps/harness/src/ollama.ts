import { createHash } from "node:crypto";
import {
  type CognitiveExecution,
  type IntelligenceLayer,
  type IntelligenceLayerRole,
  type PhaseSnapshot
} from "@immaculate/core";

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
const DEFAULT_GENERATE_TIMEOUT_MS = Number(process.env.IMMACULATE_OLLAMA_TIMEOUT_MS ?? 120000);

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

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function layerIdForModel(model: string, role: IntelligenceLayerRole): string {
  const normalized = model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `ollama-${role}-${normalized || "model"}`;
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

function pickPreferredModel(models: OllamaModelRecord[]): OllamaModelRecord | null {
  if (DEFAULT_MODEL) {
    return models.find((model) => model.name === DEFAULT_MODEL || model.model === DEFAULT_MODEL) ?? null;
  }

  const priorities = [/^gemma4/i, /^gemma/i, /^qwen/i];
  for (const matcher of priorities) {
    const match = models.find((model) => matcher.test(model.name) || matcher.test(model.model ?? ""));
    if (match) {
      return match;
    }
  }

  return models[0] ?? null;
}

export async function discoverPreferredOllamaLayer(
  role: IntelligenceLayerRole = DEFAULT_ROLE,
  baseUrl = DEFAULT_OLLAMA_URL
): Promise<IntelligenceLayer | null> {
  const models = await listOllamaModels(baseUrl);
  const preferred = pickPreferredModel(models);
  if (!preferred) {
    return null;
  }

  const modelName = preferred.name;
  return {
    id: layerIdForModel(modelName, role),
    name: `${modelName} ${role === "mid" ? "Mid Layer" : role === "reasoner" ? "Reasoner Layer" : `${role} Layer`}`,
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

export function buildImmaculatePrompt(snapshot: PhaseSnapshot, objective?: string): string {
  const activeObjective = objective?.trim() || snapshot.objective;
  return `Immaculate live cognition pass.
Return exactly:
ROUTE: one sentence, max 18 words.
REASON: one sentence, max 18 words.
COMMIT: one sentence, max 18 words.
No bullets. No preamble. No extra sections.

cycle=${snapshot.cycle} epoch=${snapshot.epoch} status=${snapshot.status}
intent=${snapshot.intent}
objective=${activeObjective}
focus=${snapshot.highlightedNodeId}
reflex_ms=${snapshot.metrics.reflexLatencyMs.toFixed(1)} cognitive_ms=${snapshot.metrics.cognitiveLatencyMs.toFixed(1)}
health=${snapshot.metrics.graphHealth.toFixed(3)} coherence=${snapshot.metrics.coherence.toFixed(3)} throughput=${Math.round(snapshot.metrics.throughput)}
passes=${formatPassSection(snapshot)}
datasets=${formatDatasetSection(snapshot)}
neuro=${formatNeuroSection(snapshot)}
recent=${formatRecentExecutionSection(snapshot)}
schedules=${formatScheduleSection(snapshot)}
events=${snapshot.logTail.slice(0, 4).join(" | ") || "none"}`;
}

export async function runOllamaExecution(options: {
  snapshot: PhaseSnapshot;
  layer: IntelligenceLayer;
  objective?: string;
}): Promise<OllamaExecutionResult> {
  const startedAt = new Date().toISOString();
  const prompt = buildImmaculatePrompt(options.snapshot, options.objective);
  const system = `You are ${options.layer.name}, the ${options.layer.role} cognition layer inside Immaculate.
You convert state into route/reason/commit outputs for a durable orchestration substrate.`;
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
  const response = typeof payload.message?.content === "string"
    ? payload.message.content.trim()
    : typeof payload.response === "string"
      ? payload.response.trim()
      : "";
  const latencyMs =
    typeof payload.total_duration === "number"
      ? Number((payload.total_duration / 1_000_000).toFixed(2))
      : Math.max(1, new Date(completedAt).getTime() - new Date(startedAt).getTime());
  const activeObjective = options.objective?.trim() || options.snapshot.objective;
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
    responsePreview: truncate(response.length > 0 ? response : "No response returned by Ollama.")
  };

  return {
    response,
    execution
  };
}
