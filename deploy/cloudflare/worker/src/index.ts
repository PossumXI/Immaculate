import { authorizeRequest } from "./auth";
import { buildGatewayConfig } from "./gateway";
import { coercePrompt, normalizeAssistantText, parseChatCompletionRequest } from "./openai";
import { cloudflareQProfile, prependQProfileSystemMessage } from "./profile";
import type { ChatMessage, Env } from "./types";

const Q_FOUNDATION_MODEL = "Gemma 4";
const Q_DEVELOPER = "Arobi Technology Alliance";
const Q_LEAD = "Gaetano Comparcola";
const Q_HARNESS = "Immaculate";

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

function latestUserMessage(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && message.content.trim().length > 0) {
      return message.content.trim().toLowerCase();
    }
  }
  return "";
}

function canonicalQIdentityReply(qName: string, prompt: string): string | undefined {
  if (
    /\bwhat model name should users see\b|\bpublic model name\b|\bpublic name\b|\bwhat should users see\b|\bwhat should i call you\b/.test(
      prompt
    )
  ) {
    return `Users should see one public model name only: ${qName}. ${qName} was developed by ${Q_DEVELOPER}, built on ${Q_FOUNDATION_MODEL}, led by ${Q_LEAD}, and governed by ${Q_HARNESS}.`;
  }
  if (
    /\bwhat is immaculate\b|\brole inside immaculate\b|\bhow do you relate to immaculate\b|\bwhat does immaculate do\b/.test(
      prompt
    )
  ) {
    return `${Q_HARNESS} is ${qName}'s governed orchestration harness. ${qName} provides the primary reasoning layer, while ${Q_HARNESS} routes work, applies policy, records receipts, and decides what actions may proceed.`;
  }
  if (
    /\bwho built you\b|\bwho developed you\b|\bwhat company\b|\bwho led the project\b|\bwho is the founder\b|\bwho is the ceo\b/.test(
      prompt
    )
  ) {
    return `${qName} was developed by ${Q_DEVELOPER}. ${Q_LEAD} is the founder, CEO, lead architect, and lead engineer for the project. ${qName} is built on ${Q_FOUNDATION_MODEL} and operates inside ${Q_HARNESS}.`;
  }
  if (
    /\bwhat are you built on\b|\bwhat is your foundation model\b|\bwhat foundation model\b/.test(
      prompt
    )
  ) {
    return `${qName} is built on ${Q_FOUNDATION_MODEL}. ${qName} was developed by ${Q_DEVELOPER}, led by ${Q_LEAD}, and operates inside ${Q_HARNESS}.`;
  }
  if (/\bwho are you\b|\bidentify yourself\b|\bintroduce yourself\b|\btell me about yourself\b/.test(prompt)) {
    return `I am ${qName}, developed by ${Q_DEVELOPER} and built on ${Q_FOUNDATION_MODEL}. ${Q_LEAD} is the founder, CEO, lead architect, and lead engineer behind the project, and ${Q_HARNESS} is my governed orchestration harness.`;
  }
  return undefined;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const qName = configuredQName(env);

    if (request.method === "GET" && url.pathname === "/health") {
      const profile = cloudflareQProfile();
      return jsonResponse({
        ok: true,
        gateway: env.CLOUDFLARE_AI_GATEWAY_ID?.trim() || null,
        q: qName,
        model: qName,
        foundationModel: Q_FOUNDATION_MODEL,
        profileReady: true,
        profileId: profile.profileId,
        profileRuleCount: profile.rules.length,
        trainingBundleId: profile.trainingBundleId,
        foundationModelConfigured: Boolean(env.CLOUDFLARE_Q_BASE_MODEL?.trim()),
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
            message: "Q foundation model is not configured.",
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
      const profileMode = env.CLOUDFLARE_Q_PROFILE_MODE?.trim().toLowerCase() || "enabled";
      const promptMessages =
        profileMode === "disabled" ? body.messages : prependQProfileSystemMessage(body.messages, qName);
      const canonicalIdentity = canonicalQIdentityReply(qName, latestUserMessage(promptMessages));
      if (canonicalIdentity) {
        return jsonResponse({
          id: `chatcmpl-${requestId}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: qName,
          foundationModel: Q_FOUNDATION_MODEL,
          developer: Q_DEVELOPER,
          lead: Q_LEAD,
          harness: Q_HARNESS,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: canonicalIdentity
              }
            }
          ],
          usage: null,
          metadata: {
            ...(gatewayConfig?.metadata ?? {}),
            qProfileId: cloudflareQProfile().profileId,
            qProfileMode: profileMode === "disabled" ? "disabled" : "enabled",
            foundationModel: Q_FOUNDATION_MODEL
          }
        });
      }
      const inputs: Record<string, unknown> = {
        prompt: coercePrompt(promptMessages)
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
        foundationModel: Q_FOUNDATION_MODEL,
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
        metadata: {
          ...(gatewayConfig?.metadata ?? {}),
          qProfileId: cloudflareQProfile().profileId,
          qProfileMode: profileMode === "disabled" ? "disabled" : "enabled",
          foundationModel: Q_FOUNDATION_MODEL
        }
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
