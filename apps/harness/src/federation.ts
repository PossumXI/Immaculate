import { createHmac, timingSafeEqual } from "node:crypto";

export const federationSignatureAlgorithms = ["hmac-sha256"] as const;
export type FederationSignatureAlgorithm = (typeof federationSignatureAlgorithms)[number];

export const federationLanes = ["public", "private-00"] as const;
export type FederationLane = (typeof federationLanes)[number];

export const PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS = "public-federation-membership-v1";
export const PUBLIC_FEDERATION_LEASE_EXPORT_CLASS = "public-federation-lease-v1";
export const PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS =
  "private-00-federation-membership-v1";
export const PRIVATE_00_FEDERATION_LEASE_EXPORT_CLASS = "private-00-federation-lease-v1";

export const federationExportClasses = [
  PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
  PUBLIC_FEDERATION_LEASE_EXPORT_CLASS,
  PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS,
  PRIVATE_00_FEDERATION_LEASE_EXPORT_CLASS
] as const;
export type FederationExportClass = (typeof federationExportClasses)[number];

export type FederationVisibilityClaim = {
  federationLane: FederationLane;
  exportClass: FederationExportClass;
};

export type FederationSignedEnvelope<T> = {
  algorithm: FederationSignatureAlgorithm;
  keyId: string;
  issuerNodeId: string;
  issuedAt: string;
  payload: T;
  signature: string;
};

export type FederationNodeIdentityPayload = FederationVisibilityClaim & {
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

export type FederationWorkerIdentityPayload = FederationVisibilityClaim & {
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

export type FederationNodeLeasePayload = FederationVisibilityClaim & {
  nodeId: string;
  heartbeatAt: string;
  leaseDurationMs: number;
};

export type FederationWorkerLeasePayload = FederationVisibilityClaim & {
  workerId: string;
  nodeId: string;
  heartbeatAt: string;
  leaseDurationMs: number;
};

const privateFederationMarkerPattern =
  /(^|[-_:./\s])(00|0-0|zero-zero|private-00|private|restricted|classified|sensitive|secret|defense-00)([-_:./\s]|$)/i;

function normalizeTags(values: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? []).map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)
    )
  ];
}

function hasPrivateFederationMarker(value: string | null | undefined): boolean {
  return typeof value === "string" && privateFederationMarkerPattern.test(value.trim());
}

export function hasPrivateFederationLaneMarker(values: readonly string[] | undefined): boolean {
  return normalizeTags(values).some((entry) => hasPrivateFederationMarker(entry));
}

export function sanitizePublicFederationTags(values: readonly string[] | undefined): string[] {
  return normalizeTags(values).filter((entry) => !hasPrivateFederationMarker(entry));
}

function isPrivateIpHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower === "::1" ||
    lower === "[::1]"
  ) {
    return true;
  }
  const ipv4 = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) {
    return false;
  }
  const octets = ipv4.slice(1).map((entry) => Number(entry));
  if (octets.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)) {
    return true;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function isPublicFederationEndpoint(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) {
    return false;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") {
      return false;
    }
    return !isPrivateIpHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function classifyFederationWorkerLane(options: {
  allowHostRisk?: boolean;
  executionEndpoint?: string | null;
  deviceAffinityTags?: readonly string[];
  preferredLayerIds?: readonly string[];
  locality?: string | null;
  hostLabel?: string | null;
  workerLabel?: string | null;
}): FederationLane {
  if (options.allowHostRisk === true) {
    return "private-00";
  }
  if (
    hasPrivateFederationLaneMarker(options.deviceAffinityTags) ||
    hasPrivateFederationLaneMarker(options.preferredLayerIds) ||
    hasPrivateFederationMarker(options.locality) ||
    hasPrivateFederationMarker(options.hostLabel) ||
    hasPrivateFederationMarker(options.workerLabel)
  ) {
    return "private-00";
  }
  if (options.executionEndpoint && !isPublicFederationEndpoint(options.executionEndpoint)) {
    return "private-00";
  }
  return "public";
}

export function assertFederationPublicExportClaim(
  payload: Partial<FederationVisibilityClaim>,
  expectedExportClass: FederationExportClass,
  subject: string
): void {
  if (payload.federationLane !== "public") {
    throw new Error(
      `${subject} is not valid for the public federation lane: expected lane public, got ${String(payload.federationLane)}.`
    );
  }
  if (payload.exportClass !== expectedExportClass) {
    throw new Error(
      `${subject} is not valid for the public federation lane: expected export class ${expectedExportClass}, got ${String(payload.exportClass)}.`
    );
  }
}

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
