import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { safeUnlink } from "./utils.js";

export type NodeHealthStatus = "healthy" | "stale" | "offline" | "faulted";

export type NodeDescriptor = {
  nodeId: string;
  nodeLabel?: string | null;
  hostLabel?: string | null;
  locality: string;
  controlPlaneUrl?: string | null;
  registeredAt: string;
  heartbeatAt: string;
  leaseExpiresAt: string;
  leaseDurationMs: number;
  capabilities: string[];
  isLocal: boolean;
};

export type NodeView = NodeDescriptor & {
  healthStatus: NodeHealthStatus;
  healthSummary: string;
  healthReason: string;
  lastHealthAt: string;
  leaseRemainingMs: number;
};

export type NodeRegistrySummary = {
  nodeCount: number;
  healthyNodeCount: number;
  staleNodeCount: number;
  offlineNodeCount: number;
  faultedNodeCount: number;
};

type NodeRegistryState = {
  nodes: NodeDescriptor[];
};

type LocalNodeOptions = {
  localNodeId?: string;
  localNodeLabel?: string;
  localHostLabel?: string;
  localLocality?: string;
  localControlPlaneUrl?: string;
  localLeaseDurationMs?: number;
  localCapabilities?: string[];
};

const DEFAULT_NODE_LEASE_MS = 45_000;
const MIN_NODE_HEALTH_WINDOW_MS = 5_000;
const MAX_NODE_HEALTH_WINDOW_MS = 15_000;

let registryWriteChain: Promise<void> = Promise.resolve();

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

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  } finally {
    await safeUnlink(tempPath);
  }
}

async function withRegistryLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = registryWriteChain;
  let release!: () => void;
  registryWriteChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean))];
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function sortNodes(nodes: NodeDescriptor[]): NodeDescriptor[] {
  return [...nodes].sort((left, right) => {
    if (left.heartbeatAt !== right.heartbeatAt) {
      return left.heartbeatAt > right.heartbeatAt ? -1 : 1;
    }
    return left.nodeId < right.nodeId ? -1 : left.nodeId > right.nodeId ? 1 : 0;
  });
}

function parseNodeRegistry(content: string | null): NodeDescriptor[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as NodeRegistryState).nodes)
        ? (parsed as NodeRegistryState).nodes
        : [];

    return items.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<NodeDescriptor>;
      if (
        typeof candidate.nodeId !== "string" ||
        typeof candidate.locality !== "string" ||
        typeof candidate.registeredAt !== "string" ||
        typeof candidate.heartbeatAt !== "string" ||
        typeof candidate.leaseExpiresAt !== "string" ||
        typeof candidate.leaseDurationMs !== "number" ||
        typeof candidate.isLocal !== "boolean" ||
        (candidate.nodeLabel !== undefined &&
          candidate.nodeLabel !== null &&
          typeof candidate.nodeLabel !== "string") ||
        (candidate.hostLabel !== undefined &&
          candidate.hostLabel !== null &&
          typeof candidate.hostLabel !== "string") ||
        (candidate.controlPlaneUrl !== undefined &&
          candidate.controlPlaneUrl !== null &&
          typeof candidate.controlPlaneUrl !== "string")
      ) {
        return [];
      }

      return [
        {
          nodeId: candidate.nodeId,
          nodeLabel: typeof candidate.nodeLabel === "string" ? candidate.nodeLabel : undefined,
          hostLabel: typeof candidate.hostLabel === "string" ? candidate.hostLabel : undefined,
          locality: candidate.locality.trim(),
          controlPlaneUrl: normalizeNullableString(candidate.controlPlaneUrl),
          registeredAt: candidate.registeredAt,
          heartbeatAt: candidate.heartbeatAt,
          leaseExpiresAt: candidate.leaseExpiresAt,
          leaseDurationMs: candidate.leaseDurationMs,
          capabilities: normalizeStringArray(candidate.capabilities),
          isLocal: candidate.isLocal
        }
      ];
    });
  } catch {
    return [];
  }
}

function resolveNodeHealthWindowMs(node: NodeDescriptor): number {
  const derived = Math.floor(node.leaseDurationMs * 0.25);
  return Math.max(
    MIN_NODE_HEALTH_WINDOW_MS,
    Math.min(
      MAX_NODE_HEALTH_WINDOW_MS,
      Number.isFinite(derived) && derived > 0 ? derived : MIN_NODE_HEALTH_WINDOW_MS
    )
  );
}

function buildNodeView(node: NodeDescriptor, now: string): NodeView {
  const leaseRemainingMs = Date.parse(node.leaseExpiresAt) - Date.parse(now);
  let healthStatus: NodeHealthStatus = "healthy";
  let healthReason = "heartbeat healthy";

  if (!node.locality.trim()) {
    healthStatus = "faulted";
    healthReason = "missing locality";
  } else if (leaseRemainingMs <= 0) {
    healthStatus = "offline";
    healthReason = "heartbeat expired";
  } else if (leaseRemainingMs <= resolveNodeHealthWindowMs(node)) {
    healthStatus = "stale";
    healthReason = "heartbeat nearing expiry";
  }

  return {
    ...node,
    healthStatus,
    healthSummary:
      healthStatus === "healthy"
        ? `healthy · ${Math.max(1, Math.round(leaseRemainingMs / 1_000))}s lease remaining`
        : `${healthStatus} · ${healthReason}`,
    healthReason,
    lastHealthAt: now,
    leaseRemainingMs: Math.max(0, leaseRemainingMs)
  };
}

function summarizeNodes(nodes: NodeView[]): NodeRegistrySummary {
  return nodes.reduce<NodeRegistrySummary>(
    (summary, node) => {
      summary.nodeCount += 1;
      if (node.healthStatus === "healthy") {
        summary.healthyNodeCount += 1;
      } else if (node.healthStatus === "stale") {
        summary.staleNodeCount += 1;
      } else if (node.healthStatus === "offline") {
        summary.offlineNodeCount += 1;
      } else {
        summary.faultedNodeCount += 1;
      }
      return summary;
    },
    {
      nodeCount: 0,
      healthyNodeCount: 0,
      staleNodeCount: 0,
      offlineNodeCount: 0,
      faultedNodeCount: 0
    }
  );
}

export function createNodeRegistry(rootDir: string, options: LocalNodeOptions = {}) {
  const registryPath = path.join(rootDir, "cluster-nodes.json");
  const localNodeId =
    options.localNodeId?.trim() ||
    `node-${os.hostname().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()}-${process.pid}`;
  const localLocality = options.localLocality?.trim() || `local:${os.hostname().toLowerCase()}`;
  const localHostLabel = options.localHostLabel?.trim() || os.hostname();
  const localNodeLabel = options.localNodeLabel?.trim() || "Immaculate Local Node";
  const localControlPlaneUrl = options.localControlPlaneUrl?.trim() || undefined;
  const localLeaseDurationMs =
    Number.isFinite(options.localLeaseDurationMs) && options.localLeaseDurationMs && options.localLeaseDurationMs > 0
      ? Number(options.localLeaseDurationMs)
      : DEFAULT_NODE_LEASE_MS;
  const localCapabilities = normalizeStringArray(options.localCapabilities ?? ["control-plane", "worker-plane"]);

  async function readNodes(): Promise<NodeDescriptor[]> {
    return sortNodes(parseNodeRegistry(await safeRead(registryPath)));
  }

  async function writeNodes(nodes: NodeDescriptor[]): Promise<void> {
    await writeJsonAtomic(registryPath, sortNodes(nodes));
  }

  async function ensureLocalNode(now = new Date().toISOString()): Promise<NodeView> {
    return registerNode({
      nodeId: localNodeId,
      nodeLabel: localNodeLabel,
      hostLabel: localHostLabel,
      locality: localLocality,
      controlPlaneUrl: localControlPlaneUrl,
      registeredAt: now,
      heartbeatAt: now,
      leaseDurationMs: localLeaseDurationMs,
      capabilities: localCapabilities,
      isLocal: true
    });
  }

  async function registerNode(
    node: Omit<NodeDescriptor, "leaseExpiresAt"> & { leaseExpiresAt?: string | null }
  ): Promise<NodeView> {
    return withRegistryLock(async () => {
      const heartbeatAt = node.heartbeatAt || new Date().toISOString();
      const leaseDurationMs =
        Number.isFinite(node.leaseDurationMs) && node.leaseDurationMs > 0
          ? node.leaseDurationMs
          : DEFAULT_NODE_LEASE_MS;
      const leaseExpiresAt =
        node.leaseExpiresAt?.trim() ||
        new Date(Date.parse(heartbeatAt) + leaseDurationMs).toISOString();
      const nodes = await readNodes();
      const existing = nodes.find((entry) => entry.nodeId === node.nodeId);
      const next: NodeDescriptor = {
        nodeId: node.nodeId,
        nodeLabel: node.nodeLabel ?? null,
        hostLabel: node.hostLabel ?? null,
        locality: node.locality.trim(),
        controlPlaneUrl: normalizeNullableString(node.controlPlaneUrl),
        registeredAt: existing?.registeredAt ?? node.registeredAt ?? heartbeatAt,
        heartbeatAt,
        leaseExpiresAt,
        leaseDurationMs,
        capabilities: normalizeStringArray(node.capabilities),
        isLocal: node.isLocal
      };
      const updated = nodes.filter((entry) => entry.nodeId !== node.nodeId).concat(next);
      await writeNodes(updated);
      return buildNodeView(next, heartbeatAt);
    });
  }

  return {
    localNodeId,
    localLocality,
    async listNodes(now = new Date().toISOString()): Promise<{ nodes: NodeView[]; summary: NodeRegistrySummary }> {
      return withRegistryLock(async () => {
        const nodes = (await readNodes()).map((node) => buildNodeView(node, now));
        return {
          nodes,
          summary: summarizeNodes(nodes)
        };
      });
    },
    async getNode(nodeId: string, now = new Date().toISOString()): Promise<NodeView | null> {
      return withRegistryLock(async () => {
        const node = (await readNodes()).find((candidate) => candidate.nodeId === nodeId);
        return node ? buildNodeView(node, now) : null;
      });
    },
    registerNode,
    async heartbeatNode(args: {
      nodeId: string;
      heartbeatAt?: string;
      leaseDurationMs?: number;
      nodeLabel?: string | null;
      hostLabel?: string | null;
      locality?: string;
      controlPlaneUrl?: string | null;
      capabilities?: string[];
    }): Promise<NodeView> {
      return withRegistryLock(async () => {
        const heartbeatAt = args.heartbeatAt || new Date().toISOString();
        const nodes = await readNodes();
        const existing = nodes.find((node) => node.nodeId === args.nodeId);
        if (!existing) {
          throw new Error(`Unknown node ${args.nodeId}.`);
        }
        const leaseDurationMs =
          Number.isFinite(args.leaseDurationMs) && args.leaseDurationMs && args.leaseDurationMs > 0
            ? args.leaseDurationMs
            : existing.leaseDurationMs;
        const next: NodeDescriptor = {
          ...existing,
          nodeLabel: args.nodeLabel !== undefined ? args.nodeLabel : existing.nodeLabel ?? null,
          hostLabel: args.hostLabel !== undefined ? args.hostLabel : existing.hostLabel ?? null,
          locality: args.locality?.trim() || existing.locality,
          controlPlaneUrl:
            args.controlPlaneUrl !== undefined
              ? normalizeNullableString(args.controlPlaneUrl)
              : existing.controlPlaneUrl,
          heartbeatAt,
          leaseDurationMs,
          leaseExpiresAt: new Date(Date.parse(heartbeatAt) + leaseDurationMs).toISOString(),
          capabilities:
            args.capabilities !== undefined
              ? normalizeStringArray(args.capabilities)
              : existing.capabilities
        };
        const updated = nodes.filter((node) => node.nodeId !== args.nodeId).concat(next);
        await writeNodes(updated);
        return buildNodeView(next, heartbeatAt);
      });
    },
    async removeNode(nodeId: string, now = new Date().toISOString()): Promise<NodeView | null> {
      return withRegistryLock(async () => {
        const nodes = await readNodes();
        const existing = nodes.find((node) => node.nodeId === nodeId) ?? null;
        if (!existing) {
          return null;
        }
        await writeNodes(nodes.filter((node) => node.nodeId !== nodeId));
        return buildNodeView(existing, now);
      });
    },
    ensureLocalNode
  };
}
