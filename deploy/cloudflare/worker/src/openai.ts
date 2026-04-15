import type { ChatCompletionRequest, ChatMessage } from "./types";

export function parseChatCompletionRequest(payload: unknown): ChatCompletionRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be a JSON object.");
  }
  const candidate = payload as Partial<ChatCompletionRequest>;
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0) {
    throw new Error("messages must be a non-empty array.");
  }
  for (const message of candidate.messages) {
    if (!message || typeof message !== "object") {
      throw new Error("messages entries must be objects.");
    }
    const role = (message as Partial<ChatMessage>).role;
    const content = (message as Partial<ChatMessage>).content;
    if (!role || !content) {
      throw new Error("messages entries require role and content.");
    }
  }
  return candidate as ChatCompletionRequest;
}

export function coercePrompt(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
}

export function normalizeAssistantText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    const payload = result as Record<string, unknown>;
    const direct = payload.response;
    if (typeof direct === "string") {
      return direct;
    }
    const text = payload.text;
    if (typeof text === "string") {
      return text;
    }
    const resultField = payload.result;
    if (typeof resultField === "string") {
      return resultField;
    }
    if (Array.isArray(payload.messages)) {
      const messageTexts = payload.messages
        .map((entry) => (entry && typeof entry === "object" ? String((entry as Record<string, unknown>).content ?? "") : ""))
        .filter(Boolean);
      if (messageTexts.length > 0) {
        return messageTexts.join("\n");
      }
    }
  }
  return JSON.stringify(result);
}
