import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSocket } from "node:dgram";
import { connect as connectHttp2 } from "node:http2";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import type { ActuationChannel, ActuationOutput } from "@immaculate/core";
import { hashValue } from "./utils.js";

export const actuationAdapterKinds = [
  "visual-file",
  "haptic-file",
  "stim-file"
] as const;
export type ActuationAdapterKind = (typeof actuationAdapterKinds)[number];

export const actuationDeliveryTransports = [
  "file",
  "bridge",
  "udp-osc",
  "serial-json",
  "http2-json"
] as const;
export type ActuationDeliveryTransport = (typeof actuationDeliveryTransports)[number];

export const actuationTransportKinds = ["udp-osc", "serial-json", "http2-json"] as const;
export type ActuationTransportKind = (typeof actuationTransportKinds)[number];

export const actuationTransportHealthStates = [
  "unknown",
  "healthy",
  "degraded",
  "faulted",
  "isolated"
] as const;
export type ActuationTransportHealthState =
  (typeof actuationTransportHealthStates)[number];

export const actuationCapabilityHealthStates = [
  "available",
  "degraded",
  "missing"
] as const;
export type ActuationCapabilityHealthState =
  (typeof actuationCapabilityHealthStates)[number];

export const actuationProtocolIds = [
  "immaculate.visual.panel.v1",
  "immaculate.haptic.rig.v1",
  "immaculate.stim.sandbox.v1"
] as const;
export type ActuationProtocolId = (typeof actuationProtocolIds)[number];

export const actuationProtocolCapabilities = [
  "intensity",
  "target-node",
  "command-text",
  "duration-ms",
  "waveform",
  "cadence-hz",
  "pulse-width-ms",
  "frequency-hz",
  "color",
  "pattern"
] as const;
export type ActuationProtocolCapability = (typeof actuationProtocolCapabilities)[number];

export type ActuationProtocolProfile = {
  id: ActuationProtocolId;
  label: string;
  channel: ActuationChannel;
  deviceClass: string;
  description: string;
  requiredCapabilities: ActuationProtocolCapability[];
};

export type ActuationCapabilityHealth = {
  capability: ActuationProtocolCapability;
  status: ActuationCapabilityHealthState;
  checkedAt?: string;
  note?: string;
};

export type ActuationTransportState = {
  id: string;
  kind: ActuationTransportKind;
  label: string;
  adapterId: string;
  protocolId: ActuationProtocolId;
  deviceId?: string;
  endpoint: string;
  remoteHost?: string;
  remotePort?: number;
  devicePath?: string;
  endpointPath?: string;
  baudRate?: number;
  vendorId?: string;
  modelId?: string;
  firmwareVersion?: string;
  enabled: boolean;
  deliveryCount: number;
  lastDeliveredAt?: string;
  heartbeatRequired: boolean;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  lastHeartbeatAt?: string;
  lastHeartbeatLatencyMs?: number;
  lastHealthCheckAt?: string;
  health: ActuationTransportHealthState;
  capabilityHealth: ActuationCapabilityHealth[];
  failureCount: number;
  consecutiveFailures: number;
  isolationActive: boolean;
  isolationReason?: string;
  isolatedAt?: string;
  lastError?: string;
  lastRecoveredAt?: string;
  preferenceScore?: number;
  preferenceRank?: number;
};

export type ActuationAdapterState = {
  id: string;
  label: string;
  kind: ActuationAdapterKind;
  channel: ActuationChannel;
  protocolId: ActuationProtocolId;
  protocolLabel: string;
  deviceClass: string;
  maxIntensity: number;
  requiresSession: boolean;
  description: string;
  deliveryCount: number;
  minDispatchIntervalMs: number;
  lastDispatchAt?: string;
  lastDeliveredAt?: string;
  lastDeliveryTransport?: ActuationDeliveryTransport;
  bridgeConnected: boolean;
  bridgeReady: boolean;
  bridgeSessionId?: string;
  bridgeDeviceId?: string;
  bridgeCapabilities: ActuationProtocolCapability[];
  lateAckCount: number;
};

export type ActuationDelivery = {
  id: string;
  outputId: string;
  adapterId: string;
  adapterKind: ActuationAdapterKind;
  protocolId: ActuationProtocolId;
  deviceId?: string;
  channel: ActuationChannel;
  sessionId?: string;
  status: "delivered" | "suppressed";
  transport: ActuationDeliveryTransport;
  intensity: number;
  generatedAt: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  encodedCommand: string;
  policyNote: string;
};

type ActuationAdapterConfig = Omit<
  ActuationAdapterState,
  | "deliveryCount"
  | "lastDeliveredAt"
  | "lastDeliveryTransport"
  | "bridgeConnected"
  | "bridgeReady"
  | "bridgeSessionId"
  | "bridgeDeviceId"
  | "bridgeCapabilities"
> & {
  deliveryPath: string;
};

type ActuationTransportConfig = ActuationTransportState;

type DispatchResult = {
  adapter: ActuationAdapterState;
  output: ActuationOutput;
  delivery: ActuationDelivery;
};

type BridgeHelloMessage = {
  type: "actuation-device-hello";
  adapterId?: string;
  protocolId?: string;
  deviceId?: string;
  capabilities?: string[];
  maxIntensity?: number;
};

type BridgeAckMessage = {
  type: "actuation-ack";
  deliveryId: string;
  deviceId?: string;
  protocolId?: string;
  nonce?: string;
  acknowledgedAt?: string;
  policyNote?: string;
};

type PendingBridgeDispatch = {
  nonce: string;
  resolve: (ack: { acknowledgedAt: string; policyNote?: string }) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

type ActuationBridgeMessageResult =
  | {
      type: "hello-accepted";
      adapter: ActuationAdapterState;
      protocol: ActuationProtocolProfile;
    }
  | {
      type: "acknowledged";
      deliveryId: string;
    };

type ActuationBridgeState = {
  adapterId: string;
  sessionId?: string;
  send: (payload: string) => void;
  pending: Map<string, PendingBridgeDispatch>;
  ready: boolean;
  protocolId?: ActuationProtocolId;
  deviceId?: string;
  capabilities: ActuationProtocolCapability[];
  maxIntensity?: number;
};

const ACTUATION_HISTORY_LIMIT = 128;
const BRIDGE_ACK_TIMEOUT_MS = 2500;
const TRANSPORT_FAILURE_ISOLATION_THRESHOLD = 2;
const DEFAULT_TRANSPORT_HEARTBEAT_INTERVAL_MS = 5000;
const DEFAULT_TRANSPORT_HEARTBEAT_TIMEOUT_MS = 15000;
const DEFAULT_MIN_DISPATCH_INTERVAL_MS = 10;
const HTTP2_DISPATCH_TIMEOUT_MS = 2500;

async function safeRead(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

const protocolProfiles: ActuationProtocolProfile[] = [
  {
    id: "immaculate.visual.panel.v1",
    label: "Immaculate Visual Panel v1",
    channel: "visual",
    deviceClass: "visual-panel",
    description: "Protocol frame for color/pattern-based visual feedback panels.",
    requiredCapabilities: ["intensity", "target-node", "command-text", "color", "pattern", "duration-ms"]
  },
  {
    id: "immaculate.haptic.rig.v1",
    label: "Immaculate Haptic Rig v1",
    channel: "haptic",
    deviceClass: "haptic-rig",
    description: "Protocol frame for haptic waveform delivery with bounded cadence and duration.",
    requiredCapabilities: ["intensity", "target-node", "command-text", "duration-ms", "waveform", "cadence-hz"]
  },
  {
    id: "immaculate.stim.sandbox.v1",
    label: "Immaculate Stim Sandbox v1",
    channel: "stim",
    deviceClass: "stim-sandbox",
    description: "Protocol frame for conservative stimulation sandbox delivery with pulse width and frequency controls.",
    requiredCapabilities: ["intensity", "target-node", "command-text", "pulse-width-ms", "frequency-hz", "duration-ms"]
  }
];

function getProtocolProfile(protocolId: ActuationProtocolId): ActuationProtocolProfile {
  return protocolProfiles.find((profile) => profile.id === protocolId)!;
}

function buildAdapterConfigs(rootDir: string): ActuationAdapterConfig[] {
  const actuationRoot = path.join(rootDir, "actuation");
  return [
    {
      id: "visual-panel",
      label: "Visual Panel",
      kind: "visual-file",
      channel: "visual",
      protocolId: "immaculate.visual.panel.v1",
      protocolLabel: "Immaculate Visual Panel v1",
      deviceClass: "visual-panel",
      maxIntensity: 1,
      requiresSession: false,
      minDispatchIntervalMs: DEFAULT_MIN_DISPATCH_INTERVAL_MS,
      lastDispatchAt: undefined,
      lateAckCount: 0,
      description: "Visual actuation lane with file-backed persistence plus optional direct or bridge transports.",
      deliveryPath: path.join(actuationRoot, "visual-panel.ndjson")
    },
    {
      id: "haptic-rig",
      label: "Haptic Rig",
      kind: "haptic-file",
      channel: "haptic",
      protocolId: "immaculate.haptic.rig.v1",
      protocolLabel: "Immaculate Haptic Rig v1",
      deviceClass: "haptic-rig",
      maxIntensity: 0.85,
      requiresSession: true,
      minDispatchIntervalMs: DEFAULT_MIN_DISPATCH_INTERVAL_MS,
      lastDispatchAt: undefined,
      lateAckCount: 0,
      description: "Session-bound haptic lane with file-backed persistence plus optional direct or bridge transports.",
      deliveryPath: path.join(actuationRoot, "haptic-rig.ndjson")
    },
    {
      id: "stim-sandbox",
      label: "Stim Sandbox",
      kind: "stim-file",
      channel: "stim",
      protocolId: "immaculate.stim.sandbox.v1",
      protocolLabel: "Immaculate Stim Sandbox v1",
      deviceClass: "stim-sandbox",
      maxIntensity: 0.65,
      requiresSession: true,
      minDispatchIntervalMs: DEFAULT_MIN_DISPATCH_INTERVAL_MS,
      lastDispatchAt: undefined,
      lateAckCount: 0,
      description: "Conservative stimulation lane with file-backed persistence plus optional direct or bridge transports.",
      deliveryPath: path.join(actuationRoot, "stim-sandbox.ndjson")
    }
  ];
}

function toNewestFirst<T>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftValue = Date.parse((left as { generatedAt?: string }).generatedAt ?? "");
    const rightValue = Date.parse((right as { generatedAt?: string }).generatedAt ?? "");
    return rightValue - leftValue;
  });
}

function parseDeliveryLog(content: string | null): ActuationDelivery[] {
  if (!content) {
    return [];
  }

  return toNewestFirst(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as Partial<ActuationDelivery>;
          if (
            typeof parsed.id !== "string" ||
            typeof parsed.outputId !== "string" ||
            typeof parsed.adapterId !== "string" ||
            typeof parsed.channel !== "string" ||
            typeof parsed.generatedAt !== "string" ||
            typeof parsed.intensity !== "number" ||
            typeof parsed.policyNote !== "string" ||
            (parsed.status !== "delivered" && parsed.status !== "suppressed")
          ) {
            return [];
          }

          return [
            {
              id: parsed.id,
              outputId: parsed.outputId,
              adapterId: parsed.adapterId,
              adapterKind:
                parsed.adapterKind === "visual-file" ||
                parsed.adapterKind === "haptic-file" ||
                parsed.adapterKind === "stim-file"
                  ? parsed.adapterKind
                  : "visual-file",
              protocolId:
                parsed.protocolId === "immaculate.visual.panel.v1" ||
                parsed.protocolId === "immaculate.haptic.rig.v1" ||
                parsed.protocolId === "immaculate.stim.sandbox.v1"
                  ? parsed.protocolId
                  : parsed.adapterKind === "haptic-file" || parsed.channel === "haptic"
                    ? "immaculate.haptic.rig.v1"
                    : parsed.adapterKind === "stim-file" || parsed.channel === "stim"
                      ? "immaculate.stim.sandbox.v1"
                      : "immaculate.visual.panel.v1",
              deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : undefined,
              channel:
                parsed.channel === "visual" ||
                parsed.channel === "haptic" ||
                parsed.channel === "stim"
                  ? parsed.channel
                  : "visual",
              sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
              status: parsed.status,
              transport:
                parsed.transport === "bridge" ||
                parsed.transport === "file" ||
                parsed.transport === "udp-osc" ||
                parsed.transport === "serial-json"
                  ? parsed.transport
                  : "file",
              intensity: parsed.intensity,
              generatedAt: parsed.generatedAt,
              deliveredAt:
                typeof parsed.deliveredAt === "string" ? parsed.deliveredAt : undefined,
              acknowledgedAt:
                typeof parsed.acknowledgedAt === "string" ? parsed.acknowledgedAt : undefined,
              encodedCommand:
                typeof parsed.encodedCommand === "string" ? parsed.encodedCommand : "{}",
              policyNote: parsed.policyNote
            }
          ];
        } catch {
          return [];
        }
      })
  );
}

function createDeliveryId(outputId: string, adapterId: string, generatedAt: string): string {
  return `adl-${hashValue(`${outputId}:${adapterId}:${generatedAt}`)}`;
}

function appendPolicyNote(base: string, suffix: string): string {
  if (base === suffix) {
    return base;
  }
  return `${base}+${suffix}`;
}

function cloneCapabilityHealth(entries: ActuationCapabilityHealth[]): ActuationCapabilityHealth[] {
  return entries.map((entry) => ({ ...entry }));
}

function normalizePolicyToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function buildCapabilityHealth(
  protocolId: ActuationProtocolId,
  options?: {
    available?: ActuationProtocolCapability[];
    degraded?: ActuationProtocolCapability[];
    defaultStatus?: ActuationCapabilityHealthState;
    checkedAt?: string;
    missingNote?: string;
  }
): ActuationCapabilityHealth[] {
  const available = new Set(options?.available ?? []);
  const degraded = new Set(options?.degraded ?? []);
  const defaultStatus = options?.defaultStatus ?? "available";
  return getProtocolProfile(protocolId).requiredCapabilities.map((capability) => {
    const status = available.has(capability)
      ? "available"
      : degraded.has(capability)
        ? "degraded"
        : defaultStatus;
    return {
      capability,
      status,
      checkedAt: options?.checkedAt,
      note:
        status === "missing" && options?.missingNote
          ? options.missingNote
          : undefined
    };
  });
}

function normalizeCapabilityHealth(
  protocolId: ActuationProtocolId,
  candidate: unknown,
  fallbackDefaultStatus: ActuationCapabilityHealthState,
  checkedAt?: string
): ActuationCapabilityHealth[] {
  if (!Array.isArray(candidate)) {
    return buildCapabilityHealth(protocolId, {
      defaultStatus: fallbackDefaultStatus,
      checkedAt,
      missingNote:
        fallbackDefaultStatus === "missing" ? "awaiting_heartbeat" : undefined
    });
  }

  const values = candidate.flatMap((entry) => {
    const value = entry as Partial<ActuationCapabilityHealth>;
    if (
      !value ||
      typeof value.capability !== "string" ||
      !(actuationProtocolCapabilities as readonly string[]).includes(value.capability) ||
      (value.status !== "available" &&
        value.status !== "degraded" &&
        value.status !== "missing")
    ) {
      return [];
    }

    return [
      {
        capability: value.capability as ActuationProtocolCapability,
        status: value.status,
        checkedAt: typeof value.checkedAt === "string" ? value.checkedAt : checkedAt,
        note: typeof value.note === "string" ? value.note : undefined
      }
    ];
  });

  if (values.length === 0) {
    return buildCapabilityHealth(protocolId, {
      defaultStatus: fallbackDefaultStatus,
      checkedAt,
      missingNote:
        fallbackDefaultStatus === "missing" ? "awaiting_heartbeat" : undefined
    });
  }

  const byCapability = new Map(values.map((entry) => [entry.capability, entry]));
  return getProtocolProfile(protocolId).requiredCapabilities.map((capability) => {
    return (
      byCapability.get(capability) ?? {
        capability,
        status: fallbackDefaultStatus,
        checkedAt,
        note:
          fallbackDefaultStatus === "missing" ? "awaiting_heartbeat" : undefined
      }
    );
  });
}

function coercePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function coerceTransportHealth(
  value: unknown,
  fallback: ActuationTransportHealthState
): ActuationTransportHealthState {
  return (actuationTransportHealthStates as readonly string[]).includes(String(value))
    ? (value as ActuationTransportHealthState)
    : fallback;
}

function isWindowsDevicePath(value: string): boolean {
  return value.startsWith("\\\\.\\");
}

function parseTransportRegistry(content: string | null): ActuationTransportState[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((candidate) => {
      const value = candidate as Partial<ActuationTransportState>;
      if (
        typeof value.id !== "string" ||
        (value.kind !== "udp-osc" &&
          value.kind !== "serial-json" &&
          value.kind !== "http2-json") ||
        typeof value.label !== "string" ||
        typeof value.adapterId !== "string" ||
        (value.protocolId !== "immaculate.visual.panel.v1" &&
          value.protocolId !== "immaculate.haptic.rig.v1" &&
          value.protocolId !== "immaculate.stim.sandbox.v1") ||
        typeof value.enabled !== "boolean"
      ) {
        return [];
      }

      if (
        value.kind === "udp-osc" &&
        (typeof value.remoteHost !== "string" || typeof value.remotePort !== "number")
      ) {
        return [];
      }

      if (value.kind === "serial-json" && typeof value.devicePath !== "string") {
        return [];
      }

      if (value.kind === "http2-json" && typeof value.endpoint !== "string") {
        return [];
      }

      const heartbeatRequired =
        typeof value.heartbeatRequired === "boolean"
          ? value.heartbeatRequired
          : value.kind === "serial-json" || value.kind === "http2-json";
      const fallbackHealth =
        heartbeatRequired && typeof value.lastHeartbeatAt !== "string"
          ? "degraded"
          : value.kind === "udp-osc"
            ? "healthy"
            : "unknown";

      return [
        {
          id: value.id,
          kind: value.kind,
          label: value.label,
          adapterId: value.adapterId,
          protocolId: value.protocolId,
          deviceId: typeof value.deviceId === "string" ? value.deviceId : undefined,
          endpoint:
            typeof value.endpoint === "string"
              ? value.endpoint
              : value.kind === "serial-json"
                ? value.devicePath!
                : `${value.remoteHost!}:${value.remotePort!}`,
          remoteHost: value.kind === "udp-osc" ? value.remoteHost : undefined,
          remotePort: value.kind === "udp-osc" ? value.remotePort : undefined,
          devicePath: value.kind === "serial-json" ? value.devicePath : undefined,
          endpointPath:
            value.kind === "http2-json" && typeof value.endpointPath === "string"
              ? value.endpointPath
              : undefined,
          baudRate:
            value.kind === "serial-json" && typeof value.baudRate === "number"
              ? value.baudRate
              : undefined,
          vendorId: typeof value.vendorId === "string" ? value.vendorId : undefined,
          modelId: typeof value.modelId === "string" ? value.modelId : undefined,
          firmwareVersion:
            typeof value.firmwareVersion === "string" ? value.firmwareVersion : undefined,
          enabled: value.enabled,
          deliveryCount: typeof value.deliveryCount === "number" ? value.deliveryCount : 0,
          lastDeliveredAt:
            typeof value.lastDeliveredAt === "string" ? value.lastDeliveredAt : undefined,
          heartbeatRequired,
          heartbeatIntervalMs: coercePositiveInteger(
            value.heartbeatIntervalMs,
            DEFAULT_TRANSPORT_HEARTBEAT_INTERVAL_MS
          ),
          heartbeatTimeoutMs: coercePositiveInteger(
            value.heartbeatTimeoutMs,
            DEFAULT_TRANSPORT_HEARTBEAT_TIMEOUT_MS
          ),
          lastHeartbeatAt:
            typeof value.lastHeartbeatAt === "string" ? value.lastHeartbeatAt : undefined,
          lastHeartbeatLatencyMs:
            typeof value.lastHeartbeatLatencyMs === "number"
              ? value.lastHeartbeatLatencyMs
              : undefined,
          lastHealthCheckAt:
            typeof value.lastHealthCheckAt === "string" ? value.lastHealthCheckAt : undefined,
          health: coerceTransportHealth(value.health, fallbackHealth),
          capabilityHealth: normalizeCapabilityHealth(
            value.protocolId,
            value.capabilityHealth,
            heartbeatRequired ? "missing" : "available",
            typeof value.lastHealthCheckAt === "string" ? value.lastHealthCheckAt : undefined
          ),
          failureCount: typeof value.failureCount === "number" ? value.failureCount : 0,
          consecutiveFailures:
            typeof value.consecutiveFailures === "number" ? value.consecutiveFailures : 0,
          isolationActive:
            typeof value.isolationActive === "boolean" ? value.isolationActive : false,
          isolationReason:
            typeof value.isolationReason === "string" ? value.isolationReason : undefined,
          isolatedAt: typeof value.isolatedAt === "string" ? value.isolatedAt : undefined,
          lastError: typeof value.lastError === "string" ? value.lastError : undefined,
          lastRecoveredAt:
            typeof value.lastRecoveredAt === "string" ? value.lastRecoveredAt : undefined
        }
      ];
    });
  } catch {
    return [];
  }
}

async function appendOrWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function updateTransportHealth(
  transport: ActuationTransportState,
  health: ActuationTransportHealthState,
  checkedAt: string
): boolean {
  let changed = false;
  if (transport.health !== health) {
    transport.health = health;
    changed = true;
  }
  if (transport.lastHealthCheckAt !== checkedAt) {
    transport.lastHealthCheckAt = checkedAt;
    changed = true;
  }
  return changed;
}

function isolateTransport(
  transport: ActuationTransportState,
  reason: string,
  checkedAt: string
): boolean {
  const normalizedReason = normalizePolicyToken(reason);
  let changed = false;
  if (!transport.isolationActive) {
    transport.isolationActive = true;
    transport.isolatedAt = checkedAt;
    changed = true;
  }
  if (transport.isolationReason !== normalizedReason) {
    transport.isolationReason = normalizedReason;
    changed = true;
  }
  if (transport.lastError !== normalizedReason) {
    transport.lastError = normalizedReason;
    changed = true;
  }
  return updateTransportHealth(transport, "isolated", checkedAt) || changed;
}

function refreshTransportHealth(
  transport: ActuationTransportState,
  checkedAt: string
): boolean {
  const now = Date.parse(checkedAt);
  if (!transport.enabled) {
    return updateTransportHealth(transport, "isolated", checkedAt);
  }

  if (transport.isolationActive) {
    return updateTransportHealth(transport, "isolated", checkedAt);
  }

  if (
    transport.heartbeatRequired &&
    transport.lastHeartbeatAt &&
    Date.parse(transport.lastHeartbeatAt) + transport.heartbeatTimeoutMs < now
  ) {
    return isolateTransport(transport, "heartbeat_timeout", checkedAt);
  }

  if (transport.capabilityHealth.some((entry) => entry.status === "missing")) {
    return updateTransportHealth(transport, "degraded", checkedAt);
  }

  if (transport.consecutiveFailures > 0) {
    return updateTransportHealth(transport, "faulted", checkedAt);
  }

  if (
    transport.heartbeatRequired &&
    !transport.lastHeartbeatAt
  ) {
    return updateTransportHealth(transport, "degraded", checkedAt);
  }

  if (transport.capabilityHealth.some((entry) => entry.status === "degraded")) {
    return updateTransportHealth(transport, "degraded", checkedAt);
  }

  return updateTransportHealth(transport, "healthy", checkedAt);
}

function capabilityScore(transport: ActuationTransportState): number {
  return transport.capabilityHealth.reduce((score, entry) => {
    if (entry.status === "available") {
      return score + 14;
    }
    if (entry.status === "degraded") {
      return score - 8;
    }
    return score - 35;
  }, 0);
}

function healthScore(transport: ActuationTransportState): number {
  if (transport.health === "healthy") {
    return 520;
  }
  if (transport.health === "degraded") {
    return 220;
  }
  if (transport.health === "unknown") {
    return 120;
  }
  if (transport.health === "faulted") {
    return -700;
  }
  return -1200;
}

function kindScore(kind: ActuationTransportKind): number {
  if (kind === "http2-json") {
    return 320;
  }
  if (kind === "serial-json") {
    return 260;
  }
  return 180;
}

function computeTransportPreferenceScore(transport: ActuationTransportState): number {
  const latencyPenalty =
    typeof transport.lastHeartbeatLatencyMs === "number"
      ? Math.min(transport.lastHeartbeatLatencyMs, 500) / 2
      : transport.heartbeatRequired
        ? 40
        : 0;
  const vendorScore =
    (transport.vendorId && transport.vendorId !== "generic" ? 18 : 0) +
    (transport.modelId && transport.modelId !== "udp-osc" ? 10 : 0) +
    (transport.deviceId ? 8 : 0) +
    (transport.heartbeatRequired ? 16 : 0);
  const reliabilityPenalty =
    transport.failureCount * 20 + transport.consecutiveFailures * 45;
  const throughputScore = Math.min(transport.deliveryCount, 12) * 2;

  return Number(
    (
      healthScore(transport) +
      kindScore(transport.kind) +
      capabilityScore(transport) +
      vendorScore +
      throughputScore -
      latencyPenalty -
      reliabilityPenalty
    ).toFixed(2)
  );
}

function rankTransports(
  source: readonly ActuationTransportState[]
): Array<ActuationTransportState & { preferenceScore: number; preferenceRank: number }> {
  const ranked = source
    .map((transport) => ({
      transport,
      preferenceScore: computeTransportPreferenceScore(transport)
    }))
    .sort((left, right) => right.preferenceScore - left.preferenceScore);

  return ranked.map((entry, index) => ({
    ...entry.transport,
    capabilityHealth: cloneCapabilityHealth(entry.transport.capabilityHealth),
    preferenceScore: entry.preferenceScore,
    preferenceRank: index + 1
  }));
}

function normalizeCapabilities(values?: string[]): ActuationProtocolCapability[] {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value): value is ActuationProtocolCapability =>
          (actuationProtocolCapabilities as readonly string[]).includes(value)
        )
    )
  );
}

function encodeActuationCommand(
  adapter: ActuationAdapterConfig,
  output: ActuationOutput,
  bridge?: ActuationBridgeState
): string {
  const baseEnvelope = {
    protocolId: adapter.protocolId,
    deviceClass: adapter.deviceClass,
    deviceId: bridge?.deviceId,
    targetNodeId: output.targetNodeId,
    command: output.command,
    intensity: Number(output.intensity.toFixed(4))
  };

  if (adapter.channel === "visual") {
    return JSON.stringify({
      ...baseEnvelope,
      frame: {
        color: output.status === "suppressed" ? "amber" : "cyan",
        pattern: output.status === "suppressed" ? "hold" : "pulse",
        durationMs: output.status === "suppressed" ? 1200 : 900
      }
    });
  }

  if (adapter.channel === "haptic") {
    return JSON.stringify({
      ...baseEnvelope,
      frame: {
        waveform: output.status === "suppressed" ? "hold" : "pulse-train",
        durationMs: output.status === "suppressed" ? 180 : 240,
        cadenceHz: output.status === "suppressed" ? 0 : 9
      }
    });
  }

  return JSON.stringify({
    ...baseEnvelope,
    frame: {
      pulseWidthMs: output.status === "suppressed" ? 0 : 4,
      frequencyHz: output.status === "suppressed" ? 0 : 18,
      durationMs: output.status === "suppressed" ? 0 : 180
    }
  });
}

function warnBridgeAck(adapterId: string, deliveryId: string, reason: string): void {
  console.warn(
    `Actuation bridge ${adapterId} dropped ack for ${deliveryId}: ${normalizePolicyToken(reason)}.`
  );
}

function oscStringSize(value: string): number {
  const length = Buffer.byteLength(value, "utf8") + 1;
  return Math.ceil(length / 4) * 4;
}

function writeOscString(buffer: Buffer, offset: number, value: string): number {
  buffer.write(value, offset, "utf8");
  buffer[offset + Buffer.byteLength(value, "utf8")] = 0;
  return offset + oscStringSize(value);
}

function createOscPacket(address: string, args: Array<string | number>): Buffer {
  const typeTags = `,${args
    .map((value) => (typeof value === "number" ? "f" : "s"))
    .join("")}`;
  const size =
    oscStringSize(address) +
    oscStringSize(typeTags) +
    args.reduce<number>((total, value) => {
      if (typeof value === "number") {
        return total + 4;
      }
      return total + oscStringSize(value);
    }, 0);
  const buffer = Buffer.alloc(size);
  let offset = 0;
  offset = writeOscString(buffer, offset, address);
  offset = writeOscString(buffer, offset, typeTags);
  for (const value of args) {
    if (typeof value === "number") {
      buffer.writeFloatBE(value, offset);
      offset += 4;
      continue;
    }
    offset = writeOscString(buffer, offset, value);
  }
  return buffer;
}

function oscAddressForProtocol(protocolId: ActuationProtocolId): string {
  if (protocolId === "immaculate.visual.panel.v1") {
    return "/immaculate/visual/v1";
  }
  if (protocolId === "immaculate.haptic.rig.v1") {
    return "/immaculate/haptic/v1";
  }
  return "/immaculate/stim/v1";
}

async function sendUdpOscTransport(
  socket: ReturnType<typeof createSocket>,
  transport: ActuationTransportState,
  adapter: ActuationAdapterConfig,
  output: ActuationOutput,
  encodedCommand: string
): Promise<void> {
  const packet = createOscPacket(oscAddressForProtocol(adapter.protocolId), [
    adapter.protocolId,
    transport.deviceId ?? "",
    output.targetNodeId,
    output.command,
    Number(output.intensity.toFixed(4)),
    encodedCommand
  ]);

  await new Promise<void>((resolve, reject) => {
    socket.send(packet, transport.remotePort, transport.remoteHost, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function sendSerialJsonTransport(
  transport: ActuationTransportState,
  adapter: ActuationAdapterConfig,
  output: ActuationOutput,
  encodedCommand: string
): Promise<void> {
  if (!transport.devicePath) {
    throw new Error(`Serial transport ${transport.id} is missing a device path.`);
  }

  if (!isWindowsDevicePath(transport.devicePath)) {
    await mkdir(path.dirname(transport.devicePath), { recursive: true });
  }

  await appendFile(
    transport.devicePath,
    `${JSON.stringify({
      sentAt: new Date().toISOString(),
      transportId: transport.id,
      vendorId: transport.vendorId,
      modelId: transport.modelId,
      firmwareVersion: transport.firmwareVersion,
      protocolId: adapter.protocolId,
      deviceId: transport.deviceId,
      channel: output.channel,
      outputId: output.id,
      targetNodeId: output.targetNodeId,
      command: output.command,
      intensity: Number(output.intensity.toFixed(4)),
      encodedCommand: JSON.parse(encodedCommand)
    })}\n`,
    "utf8"
  );
}

type Http2TransportResponse = {
  acknowledgedAt?: string;
  policyNote?: string;
  deviceId?: string;
  firmwareVersion?: string;
  latencyMs?: number;
  capabilities?: string[];
  degradedCapabilities?: string[];
};

async function sendHttp2JsonTransport(
  transport: ActuationTransportState,
  adapter: ActuationAdapterConfig,
  output: ActuationOutput,
  encodedCommand: string
): Promise<Http2TransportResponse> {
  const endpointUrl = new URL(transport.endpoint);
  if (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") {
    throw new Error(`HTTP/2 transport ${transport.id} must use http:// or https:// endpoint.`);
  }

  const requestPath = `${endpointUrl.pathname}${endpointUrl.search}`;
  const authority = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const session = connectHttp2(authority);

  return await new Promise<Http2TransportResponse>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      session.destroy();
      reject(new Error(`HTTP/2 transport ${transport.id} timed out.`));
    }, HTTP2_DISPATCH_TIMEOUT_MS);

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      session.close();
      callback();
    };

    session.once("error", (error) => {
      finish(() => reject(error));
    });

    const request = session.request({
      ":method": "POST",
      ":path": requestPath,
      "content-type": "application/json",
      "x-immaculate-transport-id": transport.id,
      "x-immaculate-protocol-id": adapter.protocolId,
      "x-immaculate-device-id": transport.deviceId ?? ""
    });

    const chunks: Buffer[] = [];
    let statusCode = 0;

    request.on("response", (headers) => {
      const statusHeader = headers[":status"];
      statusCode = typeof statusHeader === "number" ? statusHeader : Number(statusHeader ?? 0);
    });

    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    request.once("error", (error) => {
      finish(() => reject(error));
    });

    request.once("end", () => {
      const body = Buffer.concat(chunks).toString("utf8").trim();
      if (statusCode < 200 || statusCode >= 300) {
        finish(() =>
          reject(
            new Error(
              `HTTP/2 transport ${transport.id} returned ${statusCode}${body ? `: ${body}` : ""}.`
            )
          )
        );
        return;
      }

      let parsed: Http2TransportResponse = {};
      if (body.length > 0) {
        try {
          parsed = JSON.parse(body) as Http2TransportResponse;
        } catch {
          finish(() =>
            reject(new Error(`HTTP/2 transport ${transport.id} returned invalid JSON.`))
          );
          return;
        }
      }

      finish(() => resolve(parsed));
    });

    request.end(
      JSON.stringify({
        sentAt: new Date().toISOString(),
        transportId: transport.id,
        vendorId: transport.vendorId,
        modelId: transport.modelId,
        firmwareVersion: transport.firmwareVersion,
        protocolId: adapter.protocolId,
        deviceId: transport.deviceId,
        channel: output.channel,
        outputId: output.id,
        targetNodeId: output.targetNodeId,
        command: output.command,
        intensity: Number(output.intensity.toFixed(4)),
        encodedCommand: JSON.parse(encodedCommand)
      })
    );
  });
}

function isDispatchRateLimited(
  lastDispatchAt: string | undefined,
  attemptedAt: string,
  minDispatchIntervalMs: number
): boolean {
  if (!lastDispatchAt) {
    return false;
  }

  const lastDispatchAtMs = Date.parse(lastDispatchAt);
  const attemptedAtMs = Date.parse(attemptedAt);
  if (!Number.isFinite(lastDispatchAtMs) || !Number.isFinite(attemptedAtMs)) {
    return false;
  }

  return attemptedAtMs - lastDispatchAtMs < minDispatchIntervalMs;
}

export async function createActuationManager(rootDir: string): Promise<{
  listProtocols: () => ActuationProtocolProfile[];
  listAdapters: () => ActuationAdapterState[];
  listTransports: () => ActuationTransportState[];
  listDeliveries: (limit?: number) => ActuationDelivery[];
  registerUdpOscTransport: (options: {
    adapterId: string;
    host: string;
    port: number;
    label?: string;
    deviceId?: string;
  }) => Promise<ActuationTransportState>;
  registerSerialJsonTransport: (options: {
    adapterId: string;
    devicePath: string;
    baudRate?: number;
    label?: string;
    deviceId?: string;
    vendorId?: string;
    modelId?: string;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
  }) => Promise<ActuationTransportState>;
  registerHttp2JsonTransport: (options: {
    adapterId: string;
    endpoint: string;
    label?: string;
    deviceId?: string;
    vendorId?: string;
    modelId?: string;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
  }) => Promise<ActuationTransportState>;
  recordTransportHeartbeat: (options: {
    transportId: string;
    latencyMs?: number;
    capabilities?: string[];
    degradedCapabilities?: string[];
    firmwareVersion?: string;
  }) => Promise<ActuationTransportState>;
  resetTransportFault: (transportId: string) => Promise<ActuationTransportState>;
  dispatch: (
    output: ActuationOutput,
    options?: {
      adapterId?: string;
    }
  ) => Promise<DispatchResult>;
  attachBridge: (options: {
    adapterId: string;
    sessionId?: string;
    send: (payload: string) => void;
  }) => {
    handleMessage: (raw: string | Buffer) => ActuationBridgeMessageResult | undefined;
    detach: () => void;
  };
}> {
  const actuationRoot = path.join(rootDir, "actuation");
  const deliveriesPath = path.join(actuationRoot, "deliveries.ndjson");
  const transportsPath = path.join(actuationRoot, "transports.json");
  await mkdir(actuationRoot, { recursive: true });

  const adapters = buildAdapterConfigs(rootDir);
  const deliveries = parseDeliveryLog(await safeRead(deliveriesPath));
  const udpSocket = createSocket("udp4");
  udpSocket.unref();
  const transports = parseTransportRegistry(await safeRead(transportsPath));
  const bridges = new Map<string, ActuationBridgeState>();

  for (const adapter of adapters) {
    const latestDelivery = deliveries.find((delivery) => delivery.adapterId === adapter.id);
    adapter.lastDispatchAt = latestDelivery?.deliveredAt ?? latestDelivery?.generatedAt;
  }

  async function persistTransportRegistry(): Promise<void> {
    await appendOrWriteJson(transportsPath, transports);
  }

  function refreshTransportRegistry(): void {
    const checkedAt = new Date().toISOString();
    let changed = false;
    for (const transport of transports) {
      changed = refreshTransportHealth(transport, checkedAt) || changed;
    }
    if (changed) {
      void persistTransportRegistry();
    }
  }

  function listProtocols(): ActuationProtocolProfile[] {
    return protocolProfiles.map((profile) => ({
      ...profile,
      requiredCapabilities: [...profile.requiredCapabilities]
    }));
  }

  function listTransports(): ActuationTransportState[] {
    refreshTransportRegistry();
    return rankTransports(transports);
  }

  function summarizeAdapters(): ActuationAdapterState[] {
    refreshTransportRegistry();
    return adapters.map((adapter) => {
      const adapterDeliveries = deliveries.filter(
        (delivery) => delivery.adapterId === adapter.id && delivery.status === "delivered"
      );
      const bridge = bridges.get(adapter.id);
      return {
        id: adapter.id,
        label: adapter.label,
        kind: adapter.kind,
        channel: adapter.channel,
        protocolId: adapter.protocolId,
        protocolLabel: adapter.protocolLabel,
        deviceClass: adapter.deviceClass,
        maxIntensity: adapter.maxIntensity,
        requiresSession: adapter.requiresSession,
        description: adapter.description,
        deliveryCount: adapterDeliveries.length,
        minDispatchIntervalMs: adapter.minDispatchIntervalMs,
        lastDispatchAt: adapter.lastDispatchAt,
        lastDeliveredAt: adapterDeliveries[0]?.deliveredAt,
        lastDeliveryTransport: adapterDeliveries[0]?.transport,
        bridgeConnected: Boolean(bridge),
        bridgeReady: Boolean(bridge?.ready),
        bridgeSessionId: bridge?.sessionId,
        bridgeDeviceId: bridge?.deviceId,
        bridgeCapabilities: bridge ? [...bridge.capabilities] : [],
        lateAckCount: adapter.lateAckCount
      };
    });
  }

  function listDeliveries(limit = 24): ActuationDelivery[] {
    return deliveries.slice(0, Math.max(1, limit));
  }

  async function appendDeliveryRecord(
    adapter: ActuationAdapterConfig,
    delivery: ActuationDelivery,
    output: ActuationOutput
  ): Promise<void> {
    await mkdir(path.dirname(deliveriesPath), { recursive: true });
    await mkdir(path.dirname(adapter.deliveryPath), { recursive: true });
    const serialized = `${JSON.stringify(delivery)}\n`;
    await appendFile(deliveriesPath, serialized, "utf8");
    if (delivery.status === "delivered") {
      await appendFile(
        adapter.deliveryPath,
        `${JSON.stringify({
          deliveryId: delivery.id,
          outputId: output.id,
          adapterId: adapter.id,
          protocolId: delivery.protocolId,
          deviceId: delivery.deviceId,
          sessionId: output.sessionId,
          generatedAt: output.generatedAt,
          deliveredAt: delivery.deliveredAt,
          acknowledgedAt: delivery.acknowledgedAt,
          transport: delivery.transport,
          channel: output.channel,
          intensity: output.intensity,
          command: output.command,
          encodedCommand: delivery.encodedCommand,
          summary: output.summary
        })}\n`,
        "utf8"
      );
    }
    deliveries.unshift(delivery);
    if (deliveries.length > ACTUATION_HISTORY_LIMIT) {
      deliveries.length = ACTUATION_HISTORY_LIMIT;
    }
    const transport = transports.find(
      (candidate) =>
        candidate.adapterId === adapter.id &&
        candidate.protocolId === delivery.protocolId &&
        candidate.kind === delivery.transport
    );
    if (transport && delivery.status === "delivered") {
      transport.deliveryCount += 1;
      transport.lastDeliveredAt = delivery.deliveredAt;
      void persistTransportRegistry();
    }
  }

  async function registerUdpOscTransport(options: {
    adapterId: string;
    host: string;
    port: number;
    label?: string;
    deviceId?: string;
  }): Promise<ActuationTransportState> {
    const adapter = adapters.find((candidate) => candidate.id === options.adapterId);
    if (!adapter) {
      throw new Error(`Unknown actuation adapter ${options.adapterId}.`);
    }

    if (!Number.isInteger(options.port) || options.port <= 0 || options.port > 65535) {
      throw new Error(`Invalid UDP/OSC port ${options.port}.`);
    }

    const remoteHost = options.host.trim();
    if (remoteHost.length === 0) {
      throw new Error("UDP/OSC transport requires a host.");
    }

    const id = `atx-${hashValue(`${adapter.id}:udp-osc:${remoteHost}:${options.port}`)}`;
    const existing = transports.find((candidate) => candidate.id === id);
    const transport: ActuationTransportState = {
      id,
      kind: "udp-osc",
      label: options.label?.trim() || `${adapter.label} UDP/OSC`,
      adapterId: adapter.id,
      protocolId: adapter.protocolId,
      deviceId: options.deviceId?.trim() || existing?.deviceId,
      endpoint: `${remoteHost}:${options.port}`,
      remoteHost,
      remotePort: options.port,
      enabled: true,
      deliveryCount: existing?.deliveryCount ?? 0,
      lastDeliveredAt: existing?.lastDeliveredAt,
      heartbeatRequired: false,
      heartbeatIntervalMs:
        existing?.heartbeatIntervalMs ?? DEFAULT_TRANSPORT_HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs:
        existing?.heartbeatTimeoutMs ?? DEFAULT_TRANSPORT_HEARTBEAT_TIMEOUT_MS,
      lastHeartbeatAt: existing?.lastHeartbeatAt,
      lastHeartbeatLatencyMs: existing?.lastHeartbeatLatencyMs,
      lastHealthCheckAt: existing?.lastHealthCheckAt,
      health: existing?.health ?? "healthy",
      capabilityHealth:
        existing?.capabilityHealth
          ? cloneCapabilityHealth(existing.capabilityHealth)
          : buildCapabilityHealth(adapter.protocolId, {
              defaultStatus: "available"
            }),
      failureCount: existing?.failureCount ?? 0,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      isolationActive: existing?.isolationActive ?? false,
      isolationReason: existing?.isolationReason,
      isolatedAt: existing?.isolatedAt,
      lastError: existing?.lastError,
      lastRecoveredAt: existing?.lastRecoveredAt,
      vendorId: existing?.vendorId ?? "generic",
      modelId: existing?.modelId ?? "udp-osc"
    };

    const filtered = transports.filter((candidate) => candidate.id !== id);
    filtered.unshift(transport);
    transports.length = 0;
    transports.push(...filtered);
    refreshTransportRegistry();
    await persistTransportRegistry();
    return listTransports().find((candidate) => candidate.id === id)!;
  }

  async function registerSerialJsonTransport(options: {
    adapterId: string;
    devicePath: string;
    baudRate?: number;
    label?: string;
    deviceId?: string;
    vendorId?: string;
    modelId?: string;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
  }): Promise<ActuationTransportState> {
    const adapter = adapters.find((candidate) => candidate.id === options.adapterId);
    if (!adapter) {
      throw new Error(`Unknown actuation adapter ${options.adapterId}.`);
    }

    const devicePath = options.devicePath.trim();
    if (devicePath.length === 0) {
      throw new Error("Serial transport requires a device path.");
    }

    const heartbeatIntervalMs = coercePositiveInteger(
      options.heartbeatIntervalMs,
      DEFAULT_TRANSPORT_HEARTBEAT_INTERVAL_MS
    );
    const heartbeatTimeoutMs = Math.max(
      heartbeatIntervalMs,
      coercePositiveInteger(
        options.heartbeatTimeoutMs,
        DEFAULT_TRANSPORT_HEARTBEAT_TIMEOUT_MS
      )
    );
    const id = `atx-${hashValue(`${adapter.id}:serial-json:${devicePath}`)}`;
    const existing = transports.find((candidate) => candidate.id === id);
    const transport: ActuationTransportState = {
      id,
      kind: "serial-json",
      label: options.label?.trim() || `${adapter.label} Serial JSON`,
      adapterId: adapter.id,
      protocolId: adapter.protocolId,
      deviceId: options.deviceId?.trim() || existing?.deviceId,
      endpoint: devicePath,
      devicePath,
      baudRate:
        typeof options.baudRate === "number" && Number.isFinite(options.baudRate)
          ? options.baudRate
          : existing?.baudRate ?? 115200,
      vendorId: options.vendorId?.trim() || existing?.vendorId || "vendor-serial",
      modelId: options.modelId?.trim() || existing?.modelId || adapter.deviceClass,
      firmwareVersion: existing?.firmwareVersion,
      enabled: true,
      deliveryCount: existing?.deliveryCount ?? 0,
      lastDeliveredAt: existing?.lastDeliveredAt,
      heartbeatRequired: true,
      heartbeatIntervalMs,
      heartbeatTimeoutMs,
      lastHeartbeatAt: existing?.lastHeartbeatAt,
      lastHeartbeatLatencyMs: existing?.lastHeartbeatLatencyMs,
      lastHealthCheckAt: existing?.lastHealthCheckAt,
      health: existing?.health ?? "degraded",
      capabilityHealth:
        existing?.capabilityHealth
          ? cloneCapabilityHealth(existing.capabilityHealth)
          : buildCapabilityHealth(adapter.protocolId, {
              defaultStatus: "missing",
              missingNote: "awaiting_heartbeat"
            }),
      failureCount: existing?.failureCount ?? 0,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      isolationActive: existing?.isolationActive ?? false,
      isolationReason: existing?.isolationReason,
      isolatedAt: existing?.isolatedAt,
      lastError: existing?.lastError,
      lastRecoveredAt: existing?.lastRecoveredAt
    };

    const filtered = transports.filter((candidate) => candidate.id !== id);
    filtered.unshift(transport);
    transports.length = 0;
    transports.push(...filtered);
    refreshTransportRegistry();
    await persistTransportRegistry();
    return listTransports().find((candidate) => candidate.id === id)!;
  }

  async function registerHttp2JsonTransport(options: {
    adapterId: string;
    endpoint: string;
    label?: string;
    deviceId?: string;
    vendorId?: string;
    modelId?: string;
    heartbeatIntervalMs?: number;
    heartbeatTimeoutMs?: number;
  }): Promise<ActuationTransportState> {
    const adapter = adapters.find((candidate) => candidate.id === options.adapterId);
    if (!adapter) {
      throw new Error(`Unknown actuation adapter ${options.adapterId}.`);
    }

    const endpoint = options.endpoint.trim();
    if (endpoint.length === 0) {
      throw new Error("HTTP/2 transport requires an endpoint.");
    }

    let endpointUrl: URL;
    try {
      endpointUrl = new URL(endpoint);
    } catch {
      throw new Error(`Invalid HTTP/2 endpoint ${endpoint}.`);
    }
    if (endpointUrl.protocol !== "http:" && endpointUrl.protocol !== "https:") {
      throw new Error("HTTP/2 transport endpoint must use http:// or https://.");
    }

    const heartbeatIntervalMs = coercePositiveInteger(
      options.heartbeatIntervalMs,
      DEFAULT_TRANSPORT_HEARTBEAT_INTERVAL_MS
    );
    const heartbeatTimeoutMs = Math.max(
      heartbeatIntervalMs,
      coercePositiveInteger(
        options.heartbeatTimeoutMs,
        DEFAULT_TRANSPORT_HEARTBEAT_TIMEOUT_MS
      )
    );
    const id = `atx-${hashValue(`${adapter.id}:http2-json:${endpoint}`)}`;
    const existing = transports.find((candidate) => candidate.id === id);
    const transport: ActuationTransportState = {
      id,
      kind: "http2-json",
      label: options.label?.trim() || `${adapter.label} HTTP/2 JSON`,
      adapterId: adapter.id,
      protocolId: adapter.protocolId,
      deviceId: options.deviceId?.trim() || existing?.deviceId,
      endpoint,
      endpointPath: `${endpointUrl.pathname}${endpointUrl.search}`,
      vendorId: options.vendorId?.trim() || existing?.vendorId || "vendor-http2",
      modelId: options.modelId?.trim() || existing?.modelId || adapter.deviceClass,
      firmwareVersion: existing?.firmwareVersion,
      enabled: true,
      deliveryCount: existing?.deliveryCount ?? 0,
      lastDeliveredAt: existing?.lastDeliveredAt,
      heartbeatRequired: true,
      heartbeatIntervalMs,
      heartbeatTimeoutMs,
      lastHeartbeatAt: existing?.lastHeartbeatAt,
      lastHeartbeatLatencyMs: existing?.lastHeartbeatLatencyMs,
      lastHealthCheckAt: existing?.lastHealthCheckAt,
      health: existing?.health ?? "degraded",
      capabilityHealth:
        existing?.capabilityHealth
          ? cloneCapabilityHealth(existing.capabilityHealth)
          : buildCapabilityHealth(adapter.protocolId, {
              defaultStatus: "missing",
              missingNote: "awaiting_heartbeat"
            }),
      failureCount: existing?.failureCount ?? 0,
      consecutiveFailures: existing?.consecutiveFailures ?? 0,
      isolationActive: existing?.isolationActive ?? false,
      isolationReason: existing?.isolationReason,
      isolatedAt: existing?.isolatedAt,
      lastError: existing?.lastError,
      lastRecoveredAt: existing?.lastRecoveredAt
    };

    const filtered = transports.filter((candidate) => candidate.id !== id);
    filtered.unshift(transport);
    transports.length = 0;
    transports.push(...filtered);
    refreshTransportRegistry();
    await persistTransportRegistry();
    return listTransports().find((candidate) => candidate.id === id)!;
  }

  async function recordTransportHeartbeat(options: {
    transportId: string;
    latencyMs?: number;
    capabilities?: string[];
    degradedCapabilities?: string[];
    firmwareVersion?: string;
  }): Promise<ActuationTransportState> {
    const transport = transports.find((candidate) => candidate.id === options.transportId);
    if (!transport) {
      throw new Error(`Unknown transport ${options.transportId}.`);
    }

    const checkedAt = new Date().toISOString();
    transport.lastHeartbeatAt = checkedAt;
    transport.lastHeartbeatLatencyMs =
      typeof options.latencyMs === "number" && Number.isFinite(options.latencyMs)
        ? options.latencyMs
        : transport.lastHeartbeatLatencyMs;
    transport.firmwareVersion =
      options.firmwareVersion?.trim() || transport.firmwareVersion;
    transport.capabilityHealth = buildCapabilityHealth(transport.protocolId, {
      available: normalizeCapabilities(options.capabilities),
      degraded: normalizeCapabilities(options.degradedCapabilities),
      defaultStatus: "missing",
      checkedAt,
      missingNote: "capability_not_reported"
    });
    transport.consecutiveFailures = 0;
    transport.lastError = undefined;
    refreshTransportRegistry();
    await persistTransportRegistry();
    return listTransports().find((candidate) => candidate.id === options.transportId)!;
  }

  async function applyTransportResponseTelemetry(
    transport: ActuationTransportState,
    response: Http2TransportResponse
  ): Promise<void> {
    const checkedAt = response.acknowledgedAt?.trim() || new Date().toISOString();
    transport.lastHeartbeatAt = checkedAt;
    if (typeof response.latencyMs === "number" && Number.isFinite(response.latencyMs)) {
      transport.lastHeartbeatLatencyMs = response.latencyMs;
    }
    if (response.deviceId?.trim()) {
      transport.deviceId = response.deviceId.trim();
    }
    if (response.firmwareVersion?.trim()) {
      transport.firmwareVersion = response.firmwareVersion.trim();
    }
    if (Array.isArray(response.capabilities) || Array.isArray(response.degradedCapabilities)) {
      transport.capabilityHealth = buildCapabilityHealth(transport.protocolId, {
        available: normalizeCapabilities(response.capabilities),
        degraded: normalizeCapabilities(response.degradedCapabilities),
        defaultStatus: "missing",
        checkedAt,
        missingNote: "capability_not_reported"
      });
    }
    transport.consecutiveFailures = 0;
    transport.lastError = undefined;
    refreshTransportRegistry();
    await persistTransportRegistry();
  }

  async function resetTransportFault(transportId: string): Promise<ActuationTransportState> {
    const transport = transports.find((candidate) => candidate.id === transportId);
    if (!transport) {
      throw new Error(`Unknown transport ${transportId}.`);
    }

    transport.isolationActive = false;
    transport.isolationReason = undefined;
    transport.isolatedAt = undefined;
    transport.lastError = undefined;
    transport.consecutiveFailures = 0;
    transport.lastHeartbeatAt = undefined;
    transport.lastHeartbeatLatencyMs = undefined;
    transport.lastRecoveredAt = new Date().toISOString();
    refreshTransportRegistry();
    await persistTransportRegistry();
    return listTransports().find((candidate) => candidate.id === transportId)!;
  }

  function recordTransportSuccess(transport: ActuationTransportState): void {
    transport.consecutiveFailures = 0;
    transport.lastError = undefined;
    refreshTransportRegistry();
    void persistTransportRegistry();
  }

  function recordTransportFailure(
    transport: ActuationTransportState,
    reason: string
  ): void {
    const checkedAt = new Date().toISOString();
    const normalizedReason = normalizePolicyToken(reason);
    transport.failureCount += 1;
    transport.consecutiveFailures += 1;
    transport.lastError = normalizedReason;
    if (transport.consecutiveFailures >= TRANSPORT_FAILURE_ISOLATION_THRESHOLD) {
      isolateTransport(transport, normalizedReason, checkedAt);
    } else {
      updateTransportHealth(transport, "faulted", checkedAt);
    }
    void persistTransportRegistry();
  }

  function getTransportBlockReason(
    transport: ActuationTransportState
  ): string | undefined {
    if (!transport.enabled) {
      return "disabled";
    }
    if (transport.isolationActive || transport.health === "isolated") {
      return transport.isolationReason ?? "isolated";
    }
    if (transport.heartbeatRequired && !transport.lastHeartbeatAt) {
      return "awaiting_heartbeat";
    }
    if (transport.capabilityHealth.some((entry) => entry.status === "missing")) {
      return "capability_missing";
    }
    if (transport.health === "faulted") {
      return transport.lastError ?? "faulted";
    }
    return undefined;
  }

  function selectTransport(adapterId: string): {
    transport?: ActuationTransportState;
    blockedReason?: string;
  } {
    refreshTransportRegistry();
    const candidates = rankTransports(
      transports.filter((candidate) => candidate.adapterId === adapterId)
    );
    let blockedReason: string | undefined;
    for (const candidate of candidates) {
      const reason = getTransportBlockReason(candidate);
      if (!reason) {
        return {
          transport: candidate
        };
      }
      blockedReason ??= reason;
    }
    return {
      blockedReason
    };
  }

  function dispatchViaBridge(
    bridge: ActuationBridgeState,
    adapter: ActuationAdapterConfig,
    output: ActuationOutput,
    deliveryId: string,
    encodedCommand: string
): Promise<{ acknowledgedAt: string; policyNote?: string }> {
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        bridge.pending.delete(deliveryId);
        adapter.lateAckCount += 1;
        warnBridgeAck(adapter.id, deliveryId, "ack_timeout");
        reject(new Error(`Timed out waiting for bridge ack from ${adapter.id}.`));
      }, BRIDGE_ACK_TIMEOUT_MS);

      bridge.pending.set(deliveryId, {
        nonce,
        resolve: (ack) => {
          clearTimeout(timer);
          bridge.pending.delete(deliveryId);
          resolve(ack);
        },
        reject: (error) => {
          clearTimeout(timer);
          bridge.pending.delete(deliveryId);
          reject(error);
        },
        timer
      });

      bridge.send(
        JSON.stringify({
          type: "actuation-dispatch",
          data: {
            deliveryId,
            adapterId: adapter.id,
            protocolId: adapter.protocolId,
            deviceId: bridge.deviceId,
            channel: adapter.channel,
            output,
            nonce,
            encodedCommand: JSON.parse(encodedCommand)
          }
        })
      );
    });
  }

  async function dispatch(
    requestedOutput: ActuationOutput,
    options?: {
      adapterId?: string;
    }
  ): Promise<DispatchResult> {
    const adapter =
      (options?.adapterId
        ? adapters.find((candidate) => candidate.id === options.adapterId)
        : undefined) ??
      adapters.find((candidate) => candidate.channel === requestedOutput.channel);

    if (!adapter) {
      throw new Error(
        `No actuation adapter is registered for ${options?.adapterId ?? requestedOutput.channel}.`
      );
    }

    if (adapter.channel !== requestedOutput.channel) {
      throw new Error(
        `Adapter ${adapter.id} does not support the ${requestedOutput.channel} channel.`
      );
    }

    let status = requestedOutput.status;
    let policyNote = "allowed";
    let intensity = requestedOutput.intensity;
    if (adapter.requiresSession && !requestedOutput.sessionId) {
      status = "suppressed";
      intensity = 0;
      policyNote = "session_required";
    } else if (intensity > adapter.maxIntensity) {
      intensity = adapter.maxIntensity;
      policyNote = "intensity_clamped";
    }

    if (requestedOutput.status === "suppressed") {
      status = "suppressed";
      intensity = 0;
      policyNote = "suppressed_by_request";
    }

    if (status === "dispatched") {
      const attemptedAt = new Date().toISOString();
      const wasRateLimited = isDispatchRateLimited(
        adapter.lastDispatchAt,
        attemptedAt,
        adapter.minDispatchIntervalMs
      );
      adapter.lastDispatchAt = attemptedAt;
      if (wasRateLimited) {
        status = "suppressed";
        intensity = 0;
        policyNote = appendPolicyNote(policyNote, "rate_limited");
      }
    }

    const normalizedOutput: ActuationOutput = {
      ...requestedOutput,
      adapterId: adapter.id,
      protocolId: adapter.protocolId,
      intensity
    };
    const bridge = bridges.get(adapter.id);
    const transportSelection = selectTransport(adapter.id);
    const transport = transportSelection.transport;
    if (
      status === "dispatched" &&
      bridge?.ready &&
      bridge.sessionId &&
      normalizedOutput.sessionId &&
      bridge.sessionId !== normalizedOutput.sessionId
    ) {
      policyNote = appendPolicyNote(policyNote, "bridge_session_mismatch_file_fallback");
    }
    if (
      status === "dispatched" &&
      bridge?.ready &&
      typeof bridge.maxIntensity === "number" &&
      normalizedOutput.intensity > bridge.maxIntensity
    ) {
      normalizedOutput.intensity = bridge.maxIntensity;
      policyNote = appendPolicyNote(policyNote, "device_intensity_clamped");
    }
    if (bridge?.ready && bridge.deviceId) {
      normalizedOutput.deviceId = bridge.deviceId;
    } else if (transport?.deviceId) {
      normalizedOutput.deviceId = transport.deviceId;
    }
    const deliveryGeneratedAt = new Date().toISOString();
    const deliveryId = createDeliveryId(normalizedOutput.id, adapter.id, deliveryGeneratedAt);
    const encodedCommand = encodeActuationCommand(adapter, normalizedOutput, bridge);
    let delivery: ActuationDelivery = {
      id: deliveryId,
      outputId: normalizedOutput.id,
      adapterId: adapter.id,
      adapterKind: adapter.kind,
      protocolId: adapter.protocolId,
      deviceId: bridge?.ready ? bridge.deviceId : transport?.deviceId,
      channel: adapter.channel,
      sessionId: normalizedOutput.sessionId,
      status: status === "dispatched" ? "delivered" : "suppressed",
      transport: "file",
      intensity: normalizedOutput.intensity,
      generatedAt: deliveryGeneratedAt,
      deliveredAt: status === "dispatched" ? deliveryGeneratedAt : undefined,
      encodedCommand,
      policyNote
    };

    normalizedOutput.deliveryId = delivery.id;
    normalizedOutput.status = status;
    normalizedOutput.summary = `${normalizedOutput.summary} via ${adapter.label}${policyNote !== "allowed" ? ` (${policyNote})` : ""}`;
    if (status !== "dispatched") {
      normalizedOutput.dispatchedAt = undefined;
    }

    if (status === "dispatched" && transportSelection.blockedReason) {
      policyNote = appendPolicyNote(
        policyNote,
        `direct_transport_${normalizePolicyToken(transportSelection.blockedReason)}`
      );
      delivery.policyNote = policyNote;
    }

    let delivered = false;

    if (status === "dispatched" && transport?.kind === "udp-osc") {
      try {
        await sendUdpOscTransport(udpSocket, transport, adapter, normalizedOutput, encodedCommand);
        recordTransportSuccess(transport);
        delivery = {
          ...delivery,
          transport: "udp-osc",
          deliveredAt: new Date().toISOString(),
          protocolId: transport.protocolId,
          deviceId: transport.deviceId,
          policyNote: appendPolicyNote(delivery.policyNote, "udp_osc_transport")
        };
        delivered = true;
      } catch (error) {
        recordTransportFailure(
          transport,
          error instanceof Error ? error.message : "udp_osc_failure"
        );
        delivery = {
          ...delivery,
          policyNote: appendPolicyNote(delivery.policyNote, "udp_osc_failure")
        };
      }
    } else if (status === "dispatched" && transport?.kind === "serial-json") {
      try {
        await sendSerialJsonTransport(transport, adapter, normalizedOutput, encodedCommand);
        recordTransportSuccess(transport);
        delivery = {
          ...delivery,
          transport: "serial-json",
          deliveredAt: new Date().toISOString(),
          protocolId: transport.protocolId,
          deviceId: transport.deviceId,
          policyNote: appendPolicyNote(delivery.policyNote, "serial_json_transport")
        };
        delivered = true;
      } catch (error) {
        recordTransportFailure(
          transport,
          error instanceof Error ? error.message : "serial_json_failure"
        );
        delivery = {
          ...delivery,
          policyNote: appendPolicyNote(delivery.policyNote, "serial_json_failure")
        };
      }
    } else if (status === "dispatched" && transport?.kind === "http2-json") {
      try {
        const response = await sendHttp2JsonTransport(
          transport,
          adapter,
          normalizedOutput,
          encodedCommand
        );
        await applyTransportResponseTelemetry(transport, response);
        recordTransportSuccess(transport);
        if (response.deviceId?.trim()) {
          normalizedOutput.deviceId = response.deviceId.trim();
        }
        const deliveredAt = response.acknowledgedAt?.trim() || new Date().toISOString();
        delivery = {
          ...delivery,
          transport: "http2-json",
          deliveredAt,
          acknowledgedAt: deliveredAt,
          protocolId: transport.protocolId,
          deviceId: normalizedOutput.deviceId ?? transport.deviceId,
          policyNote: appendPolicyNote(
            appendPolicyNote(delivery.policyNote, "http2_json_transport"),
            response.policyNote?.trim() || "http2_device_ack"
          )
        };
        delivered = true;
      } catch (error) {
        recordTransportFailure(
          transport,
          error instanceof Error ? error.message : "http2_json_failure"
        );
        delivery = {
          ...delivery,
          policyNote: appendPolicyNote(delivery.policyNote, "http2_json_failure")
        };
      }
    }

    if (
      status === "dispatched" &&
      !delivered &&
      bridge?.ready &&
      (!bridge.sessionId ||
        !normalizedOutput.sessionId ||
        bridge.sessionId === normalizedOutput.sessionId)
    ) {
      try {
        const ack = await dispatchViaBridge(
          bridge,
          adapter,
          normalizedOutput,
          delivery.id,
          encodedCommand
        );
        delivery = {
          ...delivery,
          transport: "bridge",
          deliveredAt: ack.acknowledgedAt,
          acknowledgedAt: ack.acknowledgedAt,
          policyNote: appendPolicyNote(delivery.policyNote, ack.policyNote ?? "bridge_ack")
        };
        delivered = true;
      } catch {
        delivery = {
          ...delivery,
          policyNote: appendPolicyNote(delivery.policyNote, "bridge_timeout")
        };
      }
    } else if (status === "dispatched" && !delivered && bridge && !bridge.ready) {
      delivery = {
        ...delivery,
        policyNote: appendPolicyNote(delivery.policyNote, "bridge_not_ready")
      };
    }

    if (status === "dispatched" && !delivered) {
      delivery = {
        ...delivery,
        transport: "file",
        policyNote: appendPolicyNote(delivery.policyNote, "file_fallback")
      };
    }

    normalizedOutput.summary = `${requestedOutput.summary} via ${adapter.label}${delivery.policyNote !== "allowed" ? ` (${delivery.policyNote})` : ""}`;

    await appendDeliveryRecord(adapter, delivery, normalizedOutput);

    return {
      adapter: summarizeAdapters().find((candidate) => candidate.id === adapter.id)!,
      output: normalizedOutput,
      delivery
    };
  }

  function attachBridge(options: {
    adapterId: string;
    sessionId?: string;
    send: (payload: string) => void;
  }): {
    handleMessage: (raw: string | Buffer) => ActuationBridgeMessageResult | undefined;
    detach: () => void;
  } {
    const adapter = adapters.find((candidate) => candidate.id === options.adapterId);
    if (!adapter) {
      throw new Error(`Unknown actuation adapter ${options.adapterId}.`);
    }
    const adapterConfig = adapter;

    const adapterId = adapterConfig.id;
    const bridge: ActuationBridgeState = {
      adapterId,
      sessionId: options.sessionId,
      send: options.send,
      pending: new Map(),
      ready: false,
      capabilities: []
    };
    bridges.set(adapterId, bridge);

    function detach(): void {
      if (bridges.get(adapterId) === bridge) {
        bridges.delete(adapterId);
      }
      for (const pending of bridge.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`Actuation bridge ${adapterId} disconnected.`));
      }
      bridge.pending.clear();
    }

    function handleMessage(raw: string | Buffer): ActuationBridgeMessageResult | undefined {
      const parsed = JSON.parse(String(raw)) as
        | Partial<BridgeAckMessage>
        | Partial<BridgeHelloMessage>;

      if (parsed.type === "actuation-device-hello") {
        if (parsed.adapterId !== adapterConfig.id) {
          throw new Error(`Device hello adapter mismatch for ${adapterConfig.id}.`);
        }
        if (parsed.protocolId !== adapterConfig.protocolId) {
          throw new Error(
            `Protocol mismatch for ${adapterConfig.id}: expected ${adapterConfig.protocolId}.`
          );
        }
        if (typeof parsed.deviceId !== "string" || parsed.deviceId.trim().length === 0) {
          throw new Error(`Device hello for ${adapterConfig.id} is missing deviceId.`);
        }

        const capabilities = normalizeCapabilities(parsed.capabilities);
        const required = getProtocolProfile(adapterConfig.protocolId).requiredCapabilities;
        const missingCapabilities = required.filter(
          (capability) => !capabilities.includes(capability)
        );
        if (missingCapabilities.length > 0) {
          throw new Error(
            `Device hello for ${adapterConfig.id} is missing capabilities: ${missingCapabilities.join(", ")}.`
          );
        }

        bridge.ready = true;
        bridge.protocolId = adapterConfig.protocolId;
        bridge.deviceId = parsed.deviceId.trim();
        bridge.capabilities = capabilities;
        bridge.maxIntensity =
          typeof parsed.maxIntensity === "number" && Number.isFinite(parsed.maxIntensity)
            ? Math.max(0, Math.min(adapterConfig.maxIntensity, parsed.maxIntensity))
            : undefined;

        return {
          type: "hello-accepted",
          adapter: summarizeAdapters().find((candidate) => candidate.id === adapterConfig.id)!,
          protocol: getProtocolProfile(adapterConfig.protocolId)
        };
      }

      if (parsed.type !== "actuation-ack" || typeof parsed.deliveryId !== "string") {
        throw new Error("Invalid actuation bridge payload.");
      }

      const pending = bridge.pending.get(parsed.deliveryId);
      if (!pending) {
        adapterConfig.lateAckCount += 1;
        warnBridgeAck(adapterConfig.id, parsed.deliveryId, "late_ack");
        return undefined;
      }

      if (!bridge.ready) {
        adapterConfig.lateAckCount += 1;
        warnBridgeAck(adapterConfig.id, parsed.deliveryId, "bridge_not_ready");
        return undefined;
      }
      if (parsed.protocolId && parsed.protocolId !== bridge.protocolId) {
        adapterConfig.lateAckCount += 1;
        warnBridgeAck(adapterConfig.id, parsed.deliveryId, "protocol_mismatch");
        return undefined;
      }
      if (parsed.deviceId && parsed.deviceId !== bridge.deviceId) {
        adapterConfig.lateAckCount += 1;
        warnBridgeAck(adapterConfig.id, parsed.deliveryId, "device_mismatch");
        return undefined;
      }
      if (!parsed.nonce || parsed.nonce !== pending.nonce) {
        adapterConfig.lateAckCount += 1;
        warnBridgeAck(adapterConfig.id, parsed.deliveryId, "nonce_mismatch");
        return undefined;
      }

      pending.resolve({
        acknowledgedAt: parsed.acknowledgedAt ?? new Date().toISOString(),
        policyNote: parsed.policyNote
      });

      return {
        type: "acknowledged",
        deliveryId: parsed.deliveryId
      };
    }

    return {
      handleMessage,
      detach
    };
  }

  return {
    listProtocols,
    listAdapters: summarizeAdapters,
    listTransports,
    listDeliveries,
    registerUdpOscTransport,
    registerSerialJsonTransport,
    registerHttp2JsonTransport,
    recordTransportHeartbeat,
    resetTransportFault,
    dispatch,
    attachBridge
  };
}
