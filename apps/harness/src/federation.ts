import { createHmac, timingSafeEqual } from "node:crypto";

export const federationSignatureAlgorithms = ["hmac-sha256"] as const;
export type FederationSignatureAlgorithm = (typeof federationSignatureAlgorithms)[number];

export type FederationSignedEnvelope<T> = {
  algorithm: FederationSignatureAlgorithm;
  keyId: string;
  issuerNodeId: string;
  issuedAt: string;
  payload: T;
  signature: string;
};

export type FederationNodeIdentityPayload = {
  nodeId: string;
  nodeLabel?: string | null;
  hostLabel?: string | null;
  locality: string;
  controlPlaneUrl?: string | null;
  registeredAt: string;
  heartbeatAt: string;
  leaseDurationMs: number;
  capabilities: string[];
  isLocal: boolean;
  costPerHourUsd?: number | null;
  deviceAffinityTags: string[];
};

export type FederationWorkerIdentityPayload = {
  workerId: string;
  workerLabel?: string | null;
  hostLabel?: string | null;
  nodeId?: string | null;
  locality?: string | null;
  executionProfile: "local" | "remote";
  executionEndpoint?: string | null;
  registeredAt: string;
  heartbeatAt: string;
  leaseDurationMs: number;
  watch: boolean;
  allowHostRisk: boolean;
  supportedBaseModels: string[];
  preferredLayerIds: string[];
  costPerHourUsd?: number | null;
  deviceAffinityTags: string[];
};

export type FederationNodeLeasePayload = {
  nodeId: string;
  heartbeatAt: string;
  leaseDurationMs: number;
};

export type FederationWorkerLeasePayload = {
  workerId: string;
  nodeId: string;
  heartbeatAt: string;
  leaseDurationMs: number;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  const candidate = value as Record<string, unknown>;
  return `{${Object.keys(candidate)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(candidate[key])}`)
    .join(",")}}`;
}

function computeEnvelopeSignature<T>(
  envelope: Omit<FederationSignedEnvelope<T>, "signature">,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(
      canonicalize({
        algorithm: envelope.algorithm,
        keyId: envelope.keyId,
        issuerNodeId: envelope.issuerNodeId,
        issuedAt: envelope.issuedAt,
        payload: envelope.payload
      })
    )
    .digest("hex");
}

export function buildFederationKeyId(secret: string): string {
  return createHmac("sha256", secret)
    .update("immaculate:federation:key-id:v1")
    .digest("hex")
    .slice(0, 12);
}

export function resolveFederationSecret(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const explicit = environment.IMMACULATE_FEDERATION_SHARED_SECRET?.trim();
  if (explicit) {
    return explicit;
  }
  const fallback = environment.IMMACULATE_API_KEY?.trim();
  return fallback || undefined;
}

export function signFederationPayload<T>(
  payload: T,
  options: {
    issuerNodeId: string;
    secret: string;
    issuedAt?: string;
    keyId?: string;
    algorithm?: FederationSignatureAlgorithm;
  }
): FederationSignedEnvelope<T> {
  const envelope: Omit<FederationSignedEnvelope<T>, "signature"> = {
    algorithm: options.algorithm ?? "hmac-sha256",
    keyId: options.keyId ?? buildFederationKeyId(options.secret),
    issuerNodeId: options.issuerNodeId,
    issuedAt: options.issuedAt ?? new Date().toISOString(),
    payload
  };
  return {
    ...envelope,
    signature: computeEnvelopeSignature(envelope, options.secret)
  };
}

export function verifyFederationEnvelope<T>(
  envelope: FederationSignedEnvelope<T>,
  options: {
    secret: string;
    expectedIssuerNodeId?: string;
    expectedKeyId?: string;
    now?: string;
    maxAgeMs?: number;
    maxClockSkewMs?: number;
  }
): { verified: boolean; reason?: string } {
  if (!federationSignatureAlgorithms.includes(envelope.algorithm)) {
    return { verified: false, reason: `unsupported algorithm ${String(envelope.algorithm)}` };
  }
  if (options.expectedIssuerNodeId && envelope.issuerNodeId !== options.expectedIssuerNodeId) {
    return { verified: false, reason: `unexpected issuer ${envelope.issuerNodeId}` };
  }
  const expectedKeyId = options.expectedKeyId ?? buildFederationKeyId(options.secret);
  if (envelope.keyId !== expectedKeyId) {
    return { verified: false, reason: `unexpected key ${envelope.keyId}` };
  }
  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const issuedAtMs = Date.parse(envelope.issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return { verified: false, reason: "invalid issuedAt" };
  }
  if (
    typeof options.maxClockSkewMs === "number" &&
    Number.isFinite(options.maxClockSkewMs) &&
    issuedAtMs - nowMs > options.maxClockSkewMs
  ) {
    return { verified: false, reason: "issuedAt exceeds clock skew window" };
  }
  if (
    typeof options.maxAgeMs === "number" &&
    Number.isFinite(options.maxAgeMs) &&
    nowMs - issuedAtMs > options.maxAgeMs
  ) {
    return { verified: false, reason: "envelope expired" };
  }
  const expectedSignature = computeEnvelopeSignature(
    {
      algorithm: envelope.algorithm,
      keyId: envelope.keyId,
      issuerNodeId: envelope.issuerNodeId,
      issuedAt: envelope.issuedAt,
      payload: envelope.payload
    },
    options.secret
  );
  const left = Buffer.from(envelope.signature, "utf8");
  const right = Buffer.from(expectedSignature, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { verified: false, reason: "signature mismatch" };
  }
  return { verified: true };
}

export function normalizeFederationControlPlaneUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Federation control-plane URLs must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Federation control-plane URLs must not embed credentials.");
  }
  parsed.search = "";
  parsed.hash = "";
  const pathname = parsed.pathname.replace(/\/+$/g, "");
  return `${parsed.origin}${pathname}`;
}
