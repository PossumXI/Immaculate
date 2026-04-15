import type { AiGatewayConfig, Env, GatewayMetadata } from "./types";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function limitMetadata(metadata: GatewayMetadata | undefined, requestId: string): GatewayMetadata | undefined {
  const entries = Object.entries(metadata ?? {}).slice(0, 4);
  const limited = Object.fromEntries(entries);
  limited.requestId = requestId;
  return Object.keys(limited).length > 0 ? limited : undefined;
}

export function buildGatewayConfig(
  env: Env,
  metadata: GatewayMetadata | undefined,
  requestId: string
): AiGatewayConfig | undefined {
  const gatewayId = env.CLOUDFLARE_AI_GATEWAY_ID?.trim();
  if (!gatewayId) {
    return undefined;
  }

  return {
    id: gatewayId,
    skipCache: parseBoolean(env.CLOUDFLARE_GATEWAY_SKIP_CACHE, false),
    cacheTtl: parseNumber(env.CLOUDFLARE_GATEWAY_CACHE_TTL, 0),
    metadata: limitMetadata(metadata, requestId)
  };
}
