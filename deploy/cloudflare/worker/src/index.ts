import { authorizeRequest } from "./auth";
import { buildGatewayConfig } from "./gateway";
import { coercePrompt, normalizeAssistantText, parseChatCompletionRequest } from "./openai";
import type { Env } from "./types";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function configuredQName(env: Env): string {
  return env.CLOUDFLARE_Q_NAME?.trim() || "Q";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const qName = configuredQName(env);

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        gateway: env.CLOUDFLARE_AI_GATEWAY_ID?.trim() || null,
        q: qName,
        baseModelConfigured: Boolean(env.CLOUDFLARE_Q_BASE_MODEL?.trim()),
        loraConfigured: Boolean(env.CLOUDFLARE_Q_LORA_NAME?.trim())
      });
    }

    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      return jsonResponse(
        {
          error: {
            message: "Not found",
            type: "invalid_request_error"
          }
        },
        404
      );
    }

    const authFailure = authorizeRequest(request, env.CLOUDFLARE_Q_WORKER_API_KEY);
    if (authFailure) {
      return authFailure;
    }

    const baseModel = env.CLOUDFLARE_Q_BASE_MODEL?.trim();
    if (!baseModel) {
      return jsonResponse(
        {
          error: {
            message: "CLOUDFLARE_Q_BASE_MODEL is not configured.",
            type: "configuration_error"
          }
        },
        500
      );
    }

    const requestId = crypto.randomUUID();

    try {
      const body = parseChatCompletionRequest(await request.json());
      if (body.stream) {
        return jsonResponse(
          {
            error: {
              message: "Streaming is not enabled on the Q Cloudflare worker.",
              type: "unsupported_error"
            }
          },
          501
        );
      }

      if (body.model && body.model.trim() && body.model.trim() !== qName) {
        return jsonResponse(
          {
            error: {
              message: `This worker only serves ${qName}.`,
              type: "invalid_request_error"
            }
          },
          400
        );
      }

      const gatewayConfig = buildGatewayConfig(env, body.metadata, requestId);
      const inputs: Record<string, unknown> = {
        prompt: coercePrompt(body.messages)
      };
      if (typeof body.max_tokens === "number") {
        inputs.max_tokens = body.max_tokens;
      }
      if (typeof body.temperature === "number") {
        inputs.temperature = body.temperature;
      }
      const loraName = body.lora?.trim() || env.CLOUDFLARE_Q_LORA_NAME?.trim();
      if (loraName) {
        inputs.lora = loraName;
      }

      const result = await env.AI.run(baseModel, inputs, gatewayConfig ? { gateway: gatewayConfig } : undefined);
      const content = normalizeAssistantText(result);

      return jsonResponse({
        id: `chatcmpl-${requestId}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: qName,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content
            }
          }
        ],
        usage: null,
        metadata: gatewayConfig?.metadata ?? null
      });
    } catch (error) {
      return jsonResponse(
        {
          error: {
            message: error instanceof Error ? error.message : "Cloudflare worker execution failed.",
            type: "execution_error"
          }
        },
        500
      );
    }
  }
};
