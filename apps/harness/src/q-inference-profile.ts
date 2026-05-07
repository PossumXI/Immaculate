import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type QInferenceProvider = "ollama" | "openai-compatible" | "oci-iam-bridge";
export type QInferenceAuthMode = "none" | "bearer" | "oci-iam";

export type QOciIamBridgeProfile = {
  scriptPath: string;
  pythonCommand: string;
  pythonPrefixArgs: string[];
  configFile: string;
  profile: string;
  projectId: string;
  compartmentId: string;
  model: string;
};

export type QInferenceProfile = {
  provider: QInferenceProvider;
  routeLabel: string;
  runtimeUrl: string;
  runtimePath: string;
  auth: {
    mode: QInferenceAuthMode;
    bearerToken?: string;
  };
  ociBridge?: QOciIamBridgeProfile;
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

export type PublicQInferenceProfile = Omit<QInferenceProfile, "runtimeUrl" | "auth" | "ociBridge"> & {
  runtime: {
    configured: boolean;
    endpointVisible: false;
    path: string;
  };
  auth: {
    mode: QInferenceAuthMode;
    configured: boolean;
    secretVisible: false;
  };
};

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function envChain(env: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = envValue(env, key);
    if (value) {
      return value;
    }
  }
  return undefined;
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
  if (
    provider === "oci-iam" ||
    provider === "oci-iam-bridge" ||
    provider === "oci-bridge" ||
    provider === "openjaws-oci-bridge"
  ) {
    return "oci-iam-bridge";
  }
  if (
    provider === "openai" ||
    provider === "openai-compatible" ||
    provider === "responses" ||
    provider === "oci" ||
    provider === "oci-openai"
  ) {
    return "openai-compatible";
  }
  throw new Error(`Unsupported Q inference provider: ${provider}`);
}

function resolveQInferenceAuthMode(env: NodeJS.ProcessEnv): QInferenceAuthMode | undefined {
  const mode = envValue(env, "IMMACULATE_Q_INFERENCE_AUTH_MODE")?.toLowerCase();
  if (!mode) {
    return undefined;
  }
  if (mode === "none" || mode === "bearer") {
    return mode;
  }
  throw new Error(`Unsupported Q inference auth mode: ${mode}`);
}

function normalizeRuntimePath(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() || fallback;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeRuntimeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveDefaultOciConfigFile(): string | undefined {
  const candidate = path.join(homedir(), ".oci", "config");
  return existsSync(candidate) ? candidate : undefined;
}

function resolveOciBridgeScriptPath(env: NodeJS.ProcessEnv): string | undefined {
  const configured = envChain(env, [
    "IMMACULATE_Q_OCI_BRIDGE_SCRIPT",
    "OPENJAWS_OCI_BRIDGE_SCRIPT"
  ]);
  if (configured) {
    return configured;
  }

  const candidates = [
    path.resolve(process.cwd(), "scripts", "oci-q-response.py"),
    path.resolve(process.cwd(), "..", "OpenJaws", "scripts", "oci-q-response.py"),
    path.resolve("D:\\openjaws\\OpenJaws\\scripts\\oci-q-response.py")
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function resolveOciBridgePythonInvocation(env: NodeJS.ProcessEnv): {
  command: string;
  prefixArgs: string[];
} {
  const configured = envChain(env, ["IMMACULATE_Q_OCI_PYTHON", "OCI_Q_PYTHON"]);
  if (configured) {
    return {
      command: configured,
      prefixArgs: []
    };
  }
  if (process.platform === "win32") {
    return {
      command: "py",
      prefixArgs: ["-3.13"]
    };
  }
  return {
    command: "python3",
    prefixArgs: []
  };
}

function resolveOciBridgeProfile(env: NodeJS.ProcessEnv): QOciIamBridgeProfile {
  const scriptPath = resolveOciBridgeScriptPath(env);
  const configFile =
    envChain(env, ["IMMACULATE_Q_OCI_CONFIG_FILE", "OCI_CONFIG_FILE"]) ??
    resolveDefaultOciConfigFile();
  const profile = envChain(env, ["IMMACULATE_Q_OCI_PROFILE", "OCI_PROFILE"]) ?? "DEFAULT";
  const projectId = envChain(env, [
    "IMMACULATE_Q_OCI_PROJECT_ID",
    "IMMACULATE_Q_OCI_GENAI_PROJECT_ID",
    "OCI_GENAI_PROJECT_ID"
  ]);
  const compartmentId = envChain(env, [
    "IMMACULATE_Q_OCI_COMPARTMENT_ID",
    "OCI_COMPARTMENT_ID"
  ]);
  const baseModel = envChain(env, [
    "IMMACULATE_Q_OCI_MODEL",
    "Q_MODEL",
    "OCI_MODEL"
  ]);
  const missing = [
    scriptPath ? undefined : "IMMACULATE_Q_OCI_BRIDGE_SCRIPT or OPENJAWS_OCI_BRIDGE_SCRIPT",
    configFile ? undefined : "IMMACULATE_Q_OCI_CONFIG_FILE or OCI_CONFIG_FILE",
    projectId ? undefined : "IMMACULATE_Q_OCI_PROJECT_ID or OCI_GENAI_PROJECT_ID",
    compartmentId ? undefined : "IMMACULATE_Q_OCI_COMPARTMENT_ID or OCI_COMPARTMENT_ID",
    baseModel ? undefined : "IMMACULATE_Q_OCI_MODEL, Q_MODEL, or OCI_MODEL"
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0 || !scriptPath || !configFile || !projectId || !compartmentId || !baseModel) {
    throw new Error(`OCI IAM bridge Q inference is incomplete: missing ${missing.join(", ")}.`);
  }
  const python = resolveOciBridgePythonInvocation(env);
  return {
    scriptPath,
    pythonCommand: python.command,
    pythonPrefixArgs: python.prefixArgs,
    configFile,
    profile,
    projectId,
    compartmentId,
    model: baseModel
  };
}

export function resolveQInferenceProfile(
  env: NodeJS.ProcessEnv = process.env
): QInferenceProfile {
  const provider = resolveQInferenceProvider(env);
  const routeLabel =
    envValue(env, "IMMACULATE_Q_INFERENCE_ROUTE_LABEL") ??
    (provider === "ollama"
      ? "q-primary-ollama"
      : provider === "oci-iam-bridge"
        ? "q-primary-oci-iam-bridge"
        : "q-primary-responses");
  const runtimeUrl =
    provider === "ollama"
      ? envValue(env, "IMMACULATE_Q_OLLAMA_URL") ??
        envValue(env, "IMMACULATE_OLLAMA_URL") ??
        "http://127.0.0.1:11434"
      : provider === "oci-iam-bridge"
        ? envChain(env, [
            "IMMACULATE_Q_OCI_BASE_URL",
            "Q_BASE_URL",
            "OCI_BASE_URL"
          ])
      : envValue(env, "IMMACULATE_Q_RESPONSES_BASE_URL") ??
        envValue(env, "IMMACULATE_Q_OPENAI_BASE_URL") ??
        envValue(env, "IMMACULATE_Q_OCI_BASE_URL");
  if (!runtimeUrl) {
    throw new Error(
      provider === "oci-iam-bridge"
        ? "OCI IAM bridge Q inference requires IMMACULATE_Q_OCI_BASE_URL, Q_BASE_URL, or OCI_BASE_URL."
        : "OpenAI-compatible Q inference requires IMMACULATE_Q_RESPONSES_BASE_URL, IMMACULATE_Q_OPENAI_BASE_URL, or IMMACULATE_Q_OCI_BASE_URL."
    );
  }
  const ociBridge = provider === "oci-iam-bridge" ? resolveOciBridgeProfile(env) : undefined;
  const bearerToken =
    envValue(env, "IMMACULATE_Q_RESPONSES_API_KEY") ??
    envValue(env, "IMMACULATE_Q_OPENAI_API_KEY") ??
    envValue(env, "IMMACULATE_Q_OCI_BEARER_TOKEN");
  const requestedAuthMode = resolveQInferenceAuthMode(env);
  const authMode =
    provider === "oci-iam-bridge"
      ? "oci-iam"
      : requestedAuthMode ?? (provider === "openai-compatible" ? "bearer" : "none");
  const defaultTimeoutMs = positiveInteger(
    env,
    "IMMACULATE_Q_GATEWAY_TIMEOUT_MS",
    positiveInteger(env, "IMMACULATE_OLLAMA_CONTROL_TIMEOUT_MS", 120_000, 1_000),
    1_000
  );

  return {
    provider,
    routeLabel,
    runtimeUrl: normalizeRuntimeUrl(runtimeUrl),
    runtimePath:
      provider === "ollama"
        ? "/api/chat"
        : normalizeRuntimePath(envValue(env, "IMMACULATE_Q_RESPONSES_PATH"), "/responses"),
    auth: {
      mode: authMode,
      bearerToken: authMode === "bearer" ? bearerToken : undefined
    },
    ociBridge,
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
  const { runtimeUrl: _runtimeUrl, auth, ociBridge: _ociBridge, ...publicProfile } = profile;
  return {
    ...publicProfile,
    runtime: {
      configured: Boolean(_runtimeUrl.trim()),
      endpointVisible: false,
      path: profile.runtimePath
    },
    auth: {
      mode: auth.mode,
      configured:
        auth.mode === "none" ||
        auth.mode === "oci-iam" ||
        Boolean(auth.bearerToken?.trim()),
      secretVisible: false
    }
  };
}
