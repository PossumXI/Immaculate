export type QInferenceProvider = "ollama";

export type QInferenceProfile = {
  provider: QInferenceProvider;
  routeLabel: string;
  runtimeUrl: string;
  requestBounds: {
    maxMessages: number;
    maxInputChars: number;
  };
  timeouts: {
    defaultMs: number;
    structuredMs: number;
    structuredRepairMs: number;
    healthCacheTtlMs: number;
  };
  structured: {
    maxTokens: number;
    fastNumCtx: number;
    fastNumBatch: number;
  };
  benchmark: {
    numCtx: number;
    numBatch: number;
  };
  circuit: {
    primaryFailureThreshold: number;
    primaryCooldownMs: number;
  };
};

export type PublicQInferenceProfile = Omit<QInferenceProfile, "runtimeUrl"> & {
  runtime: {
    configured: boolean;
    endpointVisible: false;
  };
};

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum = 1
): number {
  const parsed = Number(envValue(env, key));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(minimum, Math.round(parsed));
}

function boundedPositiveInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.max(minimum, Math.min(maximum, positiveInteger(env, key, fallback, minimum)));
}

export function resolveQInferenceProvider(env: NodeJS.ProcessEnv = process.env): QInferenceProvider {
  const provider = envValue(env, "IMMACULATE_Q_INFERENCE_PROVIDER")?.toLowerCase();
  if (!provider || provider === "ollama") {
    return "ollama";
  }
  throw new Error(`Unsupported Q inference provider: ${provider}`);
}

export function resolveQInferenceProfile(
  env: NodeJS.ProcessEnv = process.env
): QInferenceProfile {
  const provider = resolveQInferenceProvider(env);
  const runtimeUrl =
    envValue(env, "IMMACULATE_Q_OLLAMA_URL") ??
    envValue(env, "IMMACULATE_OLLAMA_URL") ??
    "http://127.0.0.1:11434";
  const defaultTimeoutMs = positiveInteger(
    env,
    "IMMACULATE_Q_GATEWAY_TIMEOUT_MS",
    positiveInteger(env, "IMMACULATE_OLLAMA_CONTROL_TIMEOUT_MS", 120_000, 1_000),
    1_000
  );

  return {
    provider,
    routeLabel: envValue(env, "IMMACULATE_Q_INFERENCE_ROUTE_LABEL") ?? "q-primary-ollama",
    runtimeUrl,
    requestBounds: {
      maxMessages: positiveInteger(env, "IMMACULATE_Q_GATEWAY_MAX_MESSAGES", 24, 1),
      maxInputChars: positiveInteger(env, "IMMACULATE_Q_GATEWAY_MAX_INPUT_CHARS", 16_000, 512)
    },
    timeouts: {
      defaultMs: defaultTimeoutMs,
      structuredMs: Math.min(
        defaultTimeoutMs,
        positiveInteger(env, "IMMACULATE_Q_GATEWAY_STRUCTURED_TIMEOUT_MS", 45_000, 5_000)
      ),
      structuredRepairMs: positiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_STRUCTURED_REPAIR_TIMEOUT_MS",
        12_000,
        3_000
      ),
      healthCacheTtlMs: positiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_HEALTH_CACHE_TTL_MS",
        15_000,
        1_000
      )
    },
    structured: {
      maxTokens: positiveInteger(env, "IMMACULATE_Q_GATEWAY_STRUCTURED_MAX_TOKENS", 96, 48),
      fastNumCtx: boundedPositiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_STRUCTURED_FAST_NUM_CTX",
        768,
        256,
        131_072
      ),
      fastNumBatch: boundedPositiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_STRUCTURED_FAST_NUM_BATCH",
        64,
        1,
        4096
      )
    },
    benchmark: {
      numCtx: boundedPositiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_BENCHMARK_NUM_CTX",
        2048,
        512,
        131_072
      ),
      numBatch: boundedPositiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_BENCHMARK_NUM_BATCH",
        32,
        1,
        4096
      )
    },
    circuit: {
      primaryFailureThreshold: positiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_PRIMARY_FAILURE_THRESHOLD",
        2,
        1
      ),
      primaryCooldownMs: positiveInteger(
        env,
        "IMMACULATE_Q_GATEWAY_PRIMARY_COOLDOWN_MS",
        120_000,
        5_000
      )
    }
  };
}

export function redactQInferenceProfile(
  profile: QInferenceProfile
): PublicQInferenceProfile {
  const { runtimeUrl: _runtimeUrl, ...publicProfile } = profile;
  return {
    ...publicProfile,
    runtime: {
      configured: Boolean(_runtimeUrl.trim()),
      endpointVisible: false
    }
  };
}
