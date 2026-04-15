export type GatewayMetadataValue = string | number | boolean;
export type GatewayMetadata = Record<string, GatewayMetadataValue>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionRequest = {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  metadata?: GatewayMetadata;
  lora?: string;
};

export type AiGatewayConfig = {
  id: string;
  skipCache?: boolean;
  cacheTtl?: number;
  metadata?: GatewayMetadata;
};

export type AiBinding = {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: {
      gateway?: AiGatewayConfig;
    }
  ): Promise<unknown>;
};

export interface Env {
  AI: AiBinding;
  CLOUDFLARE_Q_NAME?: string;
  CLOUDFLARE_Q_BASE_MODEL?: string;
  CLOUDFLARE_Q_LORA_NAME?: string;
  CLOUDFLARE_AI_GATEWAY_ID?: string;
  CLOUDFLARE_Q_WORKER_API_KEY?: string;
  CLOUDFLARE_GATEWAY_SKIP_CACHE?: string;
  CLOUDFLARE_GATEWAY_CACHE_TTL?: string;
}
