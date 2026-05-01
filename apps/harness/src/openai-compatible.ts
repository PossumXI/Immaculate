import { performance } from "node:perf_hooks";
import type {
  OllamaChatCompletionResult,
  OllamaChatMessage,
  OllamaFailureClass
} from "./ollama.js";
import type { QInferenceProfile } from "./q-inference-profile.js";

type ResponsesInputItem = {
  role: OllamaChatMessage["role"];
  content: Array<{
    type: "input_text";
    text: string;
  }>;
};

type ResponsesRequestBody = {
  model: string;
  input: ResponsesInputItem[];
  stream: false;
  temperature: number;
  max_output_tokens: number;
  text?: {
    format: {
      type: "json_object";
    };
  };
};

type ResponsesTextContent = {
  type?: string;
  text?: string;
};

type ResponsesOutputItem = {
  type?: string;
  role?: string;
  content?: ResponsesTextContent[];
};

type ResponsesPayload = {
  output_text?: string;
  output?: ResponsesOutputItem[];
  response?: string;
  text?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
};

function truncate(value: string, maxLength = 280): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3)}...`;
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function formatFailurePreview(
  failureClass: OllamaFailureClass,
  errorMessage?: string,
  response?: string
): string {
  if (failureClass === "empty_response") {
    return "No response returned by the Q responses runtime.";
  }
  if (failureClass === "contract_invalid") {
    return truncate(
      response?.trim().length
        ? `Structured contract invalid: ${response}`
        : "Structured contract invalid: missing ROUTE, REASON, or COMMIT."
    );
  }
  return truncate(errorMessage?.trim() || "Q responses runtime execution failed.");
}

export function buildOpenAICompatibleRequestUrl(profile: QInferenceProfile): string {
  return `${profile.runtimeUrl.replace(/\/+$/, "")}${profile.runtimePath}`;
}

export function buildOpenAICompatibleResponsesBody(options: {
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  format?: "json";
}): ResponsesRequestBody {
  return {
    model: options.model,
    input: options.messages.map((message) => ({
      role: message.role,
      content: [
        {
          type: "input_text",
          text: message.content
        }
      ]
    })),
    stream: false,
    temperature: boundedNumber(options.temperature, 0.2, 0, 2),
    max_output_tokens: boundedInteger(options.maxTokens, 120, 1, 8_192),
    ...(options.format === "json"
      ? {
          text: {
            format: {
              type: "json_object"
            }
          }
        }
      : {})
  };
}

export function extractOpenAICompatibleResponseText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const outputText =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .flatMap((content) => (typeof content.text === "string" ? [content.text] : []))
      .join("")
      .trim() ?? "";
  if (outputText.length > 0) {
    return outputText;
  }

  const choiceText = payload.choices
    ?.flatMap((choice) => [choice.message?.content, choice.text])
    .find((value) => typeof value === "string" && value.trim().length > 0);
  if (typeof choiceText === "string") {
    return choiceText.trim();
  }

  if (typeof payload.response === "string" && payload.response.trim().length > 0) {
    return payload.response.trim();
  }
  if (typeof payload.text === "string" && payload.text.trim().length > 0) {
    return payload.text.trim();
  }
  return "";
}

export async function runOpenAICompatibleResponsesCompletion(options: {
  profile: QInferenceProfile;
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  format?: "json";
}): Promise<OllamaChatCompletionResult> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  if (options.profile.auth.mode === "bearer" && !options.profile.auth.bearerToken?.trim()) {
    const completedAt = new Date().toISOString();
    return {
      response: "",
      model: options.model,
      startedAt,
      completedAt,
      latencyMs: Math.max(1, Number((performance.now() - started).toFixed(2))),
      done: false,
      thinkingDetected: false,
      failureClass: "http_error",
      responsePreview: formatFailurePreview(
        "http_error",
        "Q responses runtime is configured for bearer auth but no bearer token is available."
      ),
      errorMessage: "Q responses runtime is configured for bearer auth but no bearer token is available."
    };
  }

  const controller = new AbortController();
  const requestTimeoutMs = boundedInteger(options.timeoutMs, 120_000, 1_000, 300_000);
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1_000 ||
    requestTimeoutMs > 300_000
  ) {
    throw new Error(`Normalized responses timeout ${requestTimeoutMs}ms is outside governed bounds.`);
  }
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (options.profile.auth.mode === "bearer") {
      headers.authorization = `Bearer ${options.profile.auth.bearerToken}`;
    }
    const response = await fetch(buildOpenAICompatibleRequestUrl(options.profile), {
      method: "POST",
      headers,
      body: JSON.stringify(
        buildOpenAICompatibleResponsesBody({
          model: options.model,
          messages: options.messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          format: options.format
        })
      ),
      signal: controller.signal
    });
    const raw = await response.text();
    let payload: ResponsesPayload = {};
    try {
      payload = raw.trim().length > 0 ? (JSON.parse(raw) as ResponsesPayload) : {};
    } catch {
      payload = {
        response: raw
      };
    }
    const completedAt = new Date().toISOString();
    const text = response.ok ? extractOpenAICompatibleResponseText(payload) : "";
    const failureClass: OllamaFailureClass | undefined = response.ok
      ? text.length > 0
        ? undefined
        : "empty_response"
      : "http_error";
    const errorMessage = response.ok
      ? undefined
      : truncate(raw || `Responses endpoint returned HTTP ${response.status}.`);
    return {
      response: text,
      model: options.model,
      startedAt,
      completedAt,
      latencyMs: Math.max(1, Number((performance.now() - started).toFixed(2))),
      done: response.ok,
      thinkingDetected: false,
      responsePreview: truncate(
        failureClass ? formatFailurePreview(failureClass, errorMessage, raw) : text
      ),
      failureClass,
      errorMessage
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const failureClass: OllamaFailureClass =
      error instanceof Error && error.name === "AbortError" ? "transport_timeout" : "http_error";
    const errorMessage =
      error instanceof Error ? error.message : "Unable to reach the configured Q responses endpoint.";
    return {
      response: "",
      model: options.model,
      startedAt,
      completedAt,
      latencyMs: Math.max(1, Number((performance.now() - started).toFixed(2))),
      done: false,
      thinkingDetected: false,
      responsePreview: formatFailurePreview(failureClass, errorMessage),
      failureClass,
      errorMessage
    };
  } finally {
    clearTimeout(timeout);
  }
}
