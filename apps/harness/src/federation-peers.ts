import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { hashValue, safeUnlink } from "./utils.js";

export type FederationPeerStatus = "healthy" | "stale" | "faulted";

export type FederationPeerRecord = {
  peerId: string;
  controlPlaneUrl: string;
  authorizationToken?: string | null;
  expectedNodeId?: string | null;
  registeredAt: string;
  refreshIntervalMs: number;
  leaseRefreshIntervalMs: number;
  trustWindowMs: number;
  maxObservedLatencyMs?: number | null;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastError?: string | null;
  consecutiveFailureCount: number;
  observedLatencyMs?: number | null;
  smoothedLatencyMs?: number | null;
  nextRefreshAt: string;
  lastLeaseSyncAt?: string | null;
  lastLeaseSuccessAt?: string | null;
  lastLeaseFailureAt?: string | null;
  lastLeaseError?: string | null;
  leaseConsecutiveFailureCount: number;
  leaseObservedLatencyMs?: number | null;
  leaseSmoothedLatencyMs?: number | null;
  nextLeaseRefreshAt: string;
};

export type FederationPeerView = Omit<FederationPeerRecord, "authorizationToken"> & {
  authorizationConfigured: boolean;
  status: FederationPeerStatus;
  refreshDue: boolean;
  trustExpiresAt: string;
  trustRemainingMs: number;
  leaseStatus: FederationPeerStatus;
  leaseRefreshDue: boolean;
  leaseTrustExpiresAt: string;
  leaseTrustRemainingMs: number;
};

type FederationPeerRegistryState = {
  peers: FederationPeerRecord[];
};

const DEFAULT_REFRESH_INTERVAL_MS = 10_000;
const DEFAULT_LEASE_REFRESH_INTERVAL_MS = 4_000;
const DEFAULT_TRUST_WINDOW_MS = 45_000;
const MAX_BACKOFF_MS = 300_000;
const SMOOTHING_ALPHA = 0.35;

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

function normalizeNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function parsePeers(content: string | null): FederationPeerRecord[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as FederationPeerRegistryState).peers)
        ? (parsed as FederationPeerRegistryState).peers
        : [];

    return items.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<FederationPeerRecord>;
      if (
        typeof candidate.peerId !== "string" ||
        typeof candidate.controlPlaneUrl !== "string" ||
        typeof candidate.registeredAt !== "string" ||
        typeof candidate.refreshIntervalMs !== "number" ||
        (candidate.leaseRefreshIntervalMs !== undefined &&
          typeof candidate.leaseRefreshIntervalMs !== "number") ||
        typeof candidate.trustWindowMs !== "number" ||
        typeof candidate.consecutiveFailureCount !== "number" ||
        typeof candidate.nextRefreshAt !== "string" ||
        (candidate.leaseConsecutiveFailureCount !== undefined &&
          typeof candidate.leaseConsecutiveFailureCount !== "number") ||
        (candidate.nextLeaseRefreshAt !== undefined &&
          candidate.nextLeaseRefreshAt !== null &&
          typeof candidate.nextLeaseRefreshAt !== "string")
      ) {
        return [];
      }
      return [
        {
          peerId: candidate.peerId,
          controlPlaneUrl: candidate.controlPlaneUrl,
          authorizationToken: normalizeNullableString(candidate.authorizationToken),
          expectedNodeId: normalizeNullableString(candidate.expectedNodeId),
          registeredAt: candidate.registeredAt,
          refreshIntervalMs: candidate.refreshIntervalMs,
          leaseRefreshIntervalMs:
            typeof candidate.leaseRefreshIntervalMs === "number" &&
            Number.isFinite(candidate.leaseRefreshIntervalMs) &&
            candidate.leaseRefreshIntervalMs > 0
              ? candidate.leaseRefreshIntervalMs
              : Math.max(2_000, Math.min(candidate.refreshIntervalMs, DEFAULT_LEASE_REFRESH_INTERVAL_MS)),
          trustWindowMs: candidate.trustWindowMs,
          maxObservedLatencyMs: normalizeNullableNumber(candidate.maxObservedLatencyMs),
          lastSyncAt: normalizeNullableString(candidate.lastSyncAt),
          lastSuccessAt: normalizeNullableString(candidate.lastSuccessAt),
          lastFailureAt: normalizeNullableString(candidate.lastFailureAt),
          lastError: normalizeNullableString(candidate.lastError),
          consecutiveFailureCount:
            Number.isFinite(candidate.consecutiveFailureCount) && candidate.consecutiveFailureCount >= 0
              ? candidate.consecutiveFailureCount
              : 0,
          observedLatencyMs: normalizeNullableNumber(candidate.observedLatencyMs),
          smoothedLatencyMs: normalizeNullableNumber(candidate.smoothedLatencyMs),
          nextRefreshAt: candidate.nextRefreshAt,
          lastLeaseSyncAt: normalizeNullableString(candidate.lastLeaseSyncAt ?? candidate.lastSyncAt),
          lastLeaseSuccessAt: normalizeNullableString(candidate.lastLeaseSuccessAt ?? candidate.lastSuccessAt),
          lastLeaseFailureAt: normalizeNullableString(candidate.lastLeaseFailureAt),
          lastLeaseError: normalizeNullableString(candidate.lastLeaseError),
          leaseConsecutiveFailureCount:
            Number.isFinite(candidate.leaseConsecutiveFailureCount) &&
            (candidate.leaseConsecutiveFailureCount ?? 0) >= 0
              ? (candidate.leaseConsecutiveFailureCount as number)
              : 0,
          leaseObservedLatencyMs: normalizeNullableNumber(
            candidate.leaseObservedLatencyMs ?? candidate.observedLatencyMs
          ),
          leaseSmoothedLatencyMs: normalizeNullableNumber(
            candidate.leaseSmoothedLatencyMs ?? candidate.smoothedLatencyMs
          ),
          nextLeaseRefreshAt:
            normalizeNullableString(candidate.nextLeaseRefreshAt) ?? candidate.nextRefreshAt
        }
      ];
    });
  } catch {
    return [];
  }
}

function sortPeers(peers: FederationPeerRecord[]): FederationPeerRecord[] {
  return [...peers].sort((left, right) => {
    if (left.nextRefreshAt !== right.nextRefreshAt) {
      return left.nextRefreshAt < right.nextRefreshAt ? -1 : 1;
    }
    return left.peerId < right.peerId ? -1 : left.peerId > right.peerId ? 1 : 0;
  });
}

function buildPeerId(controlPlaneUrl: string, expectedNodeId?: string | null): string {
  if (expectedNodeId?.trim()) {
    return expectedNodeId.trim();
  }
  return `peer-${hashValue(controlPlaneUrl)}`;
}

function computeBackoffMs(refreshIntervalMs: number, consecutiveFailureCount: number): number {
  return Math.min(refreshIntervalMs * 2 ** Math.max(0, consecutiveFailureCount), MAX_BACKOFF_MS);
}

function trustExpiresAt(peer: FederationPeerRecord): string {
  const anchor = peer.lastSuccessAt ?? peer.registeredAt;
  return new Date(Date.parse(anchor) + peer.trustWindowMs).toISOString();
}

function leaseTrustExpiresAt(peer: FederationPeerRecord): string {
  const anchor = peer.lastLeaseSuccessAt ?? peer.lastSuccessAt ?? peer.registeredAt;
  return new Date(Date.parse(anchor) + peer.trustWindowMs).toISOString();
}

function buildPeerView(peer: FederationPeerRecord, now: string): FederationPeerView {
  const { authorizationToken: _authorizationToken, ...publicPeer } = peer;
  const trustExpiration = trustExpiresAt(peer);
  const trustRemainingMs = Math.max(0, Date.parse(trustExpiration) - Date.parse(now));
  const leaseTrustExpiration = leaseTrustExpiresAt(peer);
  const leaseTrustRemainingMs = Math.max(0, Date.parse(leaseTrustExpiration) - Date.parse(now));
  let membershipStatus: FederationPeerStatus = "healthy";
  if (trustRemainingMs <= 0) {
    membershipStatus = "faulted";
  } else if (trustRemainingMs <= Math.max(2_000, Math.floor(peer.trustWindowMs * 0.25))) {
    membershipStatus = "stale";
  }
  let leaseStatus: FederationPeerStatus = "healthy";
  if (leaseTrustRemainingMs <= 0) {
    leaseStatus = "faulted";
  } else if (
    leaseTrustRemainingMs <= Math.max(2_000, Math.floor(peer.trustWindowMs * 0.25))
  ) {
    leaseStatus = "stale";
  }
  return {
    ...publicPeer,
    authorizationConfigured: Boolean(peer.authorizationToken?.trim()),
    status: membershipStatus,
    refreshDue: peer.nextRefreshAt <= now,
    trustExpiresAt: trustExpiration,
    trustRemainingMs,
    leaseStatus,
    leaseRefreshDue: peer.nextLeaseRefreshAt <= now,
    leaseTrustExpiresAt: leaseTrustExpiration,
    leaseTrustRemainingMs
  };
}

export function smoothObservedLatency(previous: number | null | undefined, observed: number): number {
  if (!Number.isFinite(previous ?? NaN)) {
    return Number(observed.toFixed(2));
  }
  return Number((((previous as number) * (1 - SMOOTHING_ALPHA)) + observed * SMOOTHING_ALPHA).toFixed(2));
}

export function createFederationPeerRegistry(rootDir: string) {
  const registryPath = path.join(rootDir, "federation-peers.json");

  async function readPeers(): Promise<FederationPeerRecord[]> {
    return sortPeers(parsePeers(await safeRead(registryPath)));
  }

  async function writePeers(peers: FederationPeerRecord[]): Promise<void> {
    await writeJsonAtomic(registryPath, { peers: sortPeers(peers) });
  }

  return {
    async listPeers(now = new Date().toISOString()): Promise<FederationPeerView[]> {
      return withRegistryLock(async () => (await readPeers()).map((peer) => buildPeerView(peer, now)));
    },
    async getPeer(peerId: string, now = new Date().toISOString()): Promise<FederationPeerView | null> {
      return withRegistryLock(async () => {
        const peer = (await readPeers()).find((candidate) => candidate.peerId === peerId);
        return peer ? buildPeerView(peer, now) : null;
      });
    },
    async findPeerByUrl(controlPlaneUrl: string, now = new Date().toISOString()): Promise<FederationPeerView | null> {
      return withRegistryLock(async () => {
        const peer = (await readPeers()).find((candidate) => candidate.controlPlaneUrl === controlPlaneUrl);
        return peer ? buildPeerView(peer, now) : null;
      });
    },
    async getPeerRecord(peerId: string): Promise<FederationPeerRecord | null> {
      return withRegistryLock(async () => {
        const peer = (await readPeers()).find((candidate) => candidate.peerId === peerId);
        return peer ?? null;
      });
    },
    async registerPeer(args: {
      controlPlaneUrl: string;
      authorizationToken?: string | null;
      expectedNodeId?: string | null;
      refreshIntervalMs?: number;
      leaseRefreshIntervalMs?: number;
      trustWindowMs?: number;
      maxObservedLatencyMs?: number | null;
      now?: string;
    }): Promise<FederationPeerView> {
      return withRegistryLock(async () => {
        const now = args.now ?? new Date().toISOString();
        const refreshIntervalMs =
          typeof args.refreshIntervalMs === "number" && Number.isFinite(args.refreshIntervalMs) && args.refreshIntervalMs > 0
            ? Number(args.refreshIntervalMs)
            : DEFAULT_REFRESH_INTERVAL_MS;
        const leaseRefreshIntervalMs =
          typeof args.leaseRefreshIntervalMs === "number" &&
          Number.isFinite(args.leaseRefreshIntervalMs) &&
          args.leaseRefreshIntervalMs > 0
            ? Number(args.leaseRefreshIntervalMs)
            : Math.max(2_000, Math.min(refreshIntervalMs, DEFAULT_LEASE_REFRESH_INTERVAL_MS));
        const trustWindowMs =
          typeof args.trustWindowMs === "number" && Number.isFinite(args.trustWindowMs) && args.trustWindowMs > 0
            ? Number(args.trustWindowMs)
            : DEFAULT_TRUST_WINDOW_MS;
        const peerId = buildPeerId(args.controlPlaneUrl, args.expectedNodeId);
        const peers = await readPeers();
        const existing = peers.find((peer) => peer.peerId === peerId || peer.controlPlaneUrl === args.controlPlaneUrl);
        const next: FederationPeerRecord = {
          peerId: existing?.peerId ?? peerId,
          controlPlaneUrl: args.controlPlaneUrl,
          authorizationToken:
            normalizeNullableString(args.authorizationToken) ?? existing?.authorizationToken ?? null,
          expectedNodeId: normalizeNullableString(args.expectedNodeId) ?? existing?.expectedNodeId ?? null,
          registeredAt: existing?.registeredAt ?? now,
          refreshIntervalMs,
          leaseRefreshIntervalMs,
          trustWindowMs,
          maxObservedLatencyMs:
            normalizeNullableNumber(args.maxObservedLatencyMs) ?? existing?.maxObservedLatencyMs ?? null,
          lastSyncAt: existing?.lastSyncAt ?? null,
          lastSuccessAt: existing?.lastSuccessAt ?? null,
          lastFailureAt: existing?.lastFailureAt ?? null,
          lastError: existing?.lastError ?? null,
          consecutiveFailureCount: existing?.consecutiveFailureCount ?? 0,
          observedLatencyMs: existing?.observedLatencyMs ?? null,
          smoothedLatencyMs: existing?.smoothedLatencyMs ?? null,
          nextRefreshAt: existing?.nextRefreshAt ?? now,
          lastLeaseSyncAt: existing?.lastLeaseSyncAt ?? existing?.lastSyncAt ?? null,
          lastLeaseSuccessAt: existing?.lastLeaseSuccessAt ?? existing?.lastSuccessAt ?? null,
          lastLeaseFailureAt: existing?.lastLeaseFailureAt ?? null,
          lastLeaseError: existing?.lastLeaseError ?? null,
          leaseConsecutiveFailureCount: existing?.leaseConsecutiveFailureCount ?? 0,
          leaseObservedLatencyMs: existing?.leaseObservedLatencyMs ?? existing?.observedLatencyMs ?? null,
          leaseSmoothedLatencyMs: existing?.leaseSmoothedLatencyMs ?? existing?.smoothedLatencyMs ?? null,
          nextLeaseRefreshAt: existing?.nextLeaseRefreshAt ?? now
        };
        await writePeers(peers.filter((peer) => peer.peerId !== next.peerId && peer.controlPlaneUrl !== args.controlPlaneUrl).concat(next));
        return buildPeerView(next, now);
      });
    },
    async markRefreshSuccess(args: {
      peerId: string;
      expectedNodeId?: string | null;
      observedLatencyMs: number;
      now?: string;
    }): Promise<FederationPeerView> {
      return withRegistryLock(async () => {
        const now = args.now ?? new Date().toISOString();
        const peers = await readPeers();
        const existing = peers.find((peer) => peer.peerId === args.peerId);
        if (!existing) {
          throw new Error(`Unknown federation peer ${args.peerId}.`);
        }
        const smoothedLatencyMs = smoothObservedLatency(existing.smoothedLatencyMs, args.observedLatencyMs);
        const next: FederationPeerRecord = {
          ...existing,
          expectedNodeId: normalizeNullableString(args.expectedNodeId) ?? existing.expectedNodeId ?? null,
          lastSyncAt: now,
          lastSuccessAt: now,
          lastError: null,
          consecutiveFailureCount: 0,
          observedLatencyMs: Number(args.observedLatencyMs.toFixed(2)),
          smoothedLatencyMs,
          lastLeaseSyncAt: existing.lastLeaseSyncAt ?? now,
          lastLeaseSuccessAt: existing.lastLeaseSuccessAt ?? now,
          lastLeaseError: existing.lastLeaseError ?? null,
          nextRefreshAt: new Date(Date.parse(now) + existing.refreshIntervalMs).toISOString()
        };
        await writePeers(peers.filter((peer) => peer.peerId !== args.peerId).concat(next));
        return buildPeerView(next, now);
      });
    },
    async markRefreshFailure(args: {
      peerId: string;
      error: string;
      now?: string;
    }): Promise<FederationPeerView> {
      return withRegistryLock(async () => {
        const now = args.now ?? new Date().toISOString();
        const peers = await readPeers();
        const existing = peers.find((peer) => peer.peerId === args.peerId);
        if (!existing) {
          throw new Error(`Unknown federation peer ${args.peerId}.`);
        }
        const next: FederationPeerRecord = {
          ...existing,
          lastSyncAt: now,
          lastFailureAt: now,
          lastError: args.error.trim() || "unknown error",
          consecutiveFailureCount: existing.consecutiveFailureCount + 1,
          nextRefreshAt: new Date(
            Date.parse(now) + computeBackoffMs(existing.refreshIntervalMs, existing.consecutiveFailureCount)
          ).toISOString()
        };
        await writePeers(peers.filter((peer) => peer.peerId !== args.peerId).concat(next));
        return buildPeerView(next, now);
      });
    },
    async markLeaseSuccess(args: {
      peerId: string;
      observedLatencyMs: number;
      now?: string;
    }): Promise<FederationPeerView> {
      return withRegistryLock(async () => {
        const now = args.now ?? new Date().toISOString();
        const peers = await readPeers();
        const existing = peers.find((peer) => peer.peerId === args.peerId);
        if (!existing) {
          throw new Error(`Unknown federation peer ${args.peerId}.`);
        }
        const leaseSmoothedLatencyMs = smoothObservedLatency(
          existing.leaseSmoothedLatencyMs,
          args.observedLatencyMs
        );
        const next: FederationPeerRecord = {
          ...existing,
          lastLeaseSyncAt: now,
          lastLeaseSuccessAt: now,
          lastLeaseError: null,
          leaseConsecutiveFailureCount: 0,
          leaseObservedLatencyMs: Number(args.observedLatencyMs.toFixed(2)),
          leaseSmoothedLatencyMs,
          nextLeaseRefreshAt: new Date(Date.parse(now) + existing.leaseRefreshIntervalMs).toISOString()
        };
        await writePeers(peers.filter((peer) => peer.peerId !== args.peerId).concat(next));
        return buildPeerView(next, now);
      });
    },
    async markLeaseFailure(args: {
      peerId: string;
      error: string;
      now?: string;
    }): Promise<FederationPeerView> {
      return withRegistryLock(async () => {
        const now = args.now ?? new Date().toISOString();
        const peers = await readPeers();
        const existing = peers.find((peer) => peer.peerId === args.peerId);
        if (!existing) {
          throw new Error(`Unknown federation peer ${args.peerId}.`);
        }
        const next: FederationPeerRecord = {
          ...existing,
          lastLeaseSyncAt: now,
          lastLeaseFailureAt: now,
          lastLeaseError: args.error.trim() || "unknown error",
          leaseConsecutiveFailureCount: existing.leaseConsecutiveFailureCount + 1,
          nextLeaseRefreshAt: new Date(
            Date.parse(now) +
              computeBackoffMs(existing.leaseRefreshIntervalMs, existing.leaseConsecutiveFailureCount)
          ).toISOString()
        };
        await writePeers(peers.filter((peer) => peer.peerId !== args.peerId).concat(next));
        return buildPeerView(next, now);
      });
    },
    async removePeer(peerId: string, now = new Date().toISOString()): Promise<FederationPeerView | null> {
      return withRegistryLock(async () => {
        const peers = await readPeers();
        const existing = peers.find((peer) => peer.peerId === peerId);
        if (!existing) {
          return null;
        }
        await writePeers(peers.filter((peer) => peer.peerId !== peerId));
        return buildPeerView(existing, now);
      });
    }
  };
}
