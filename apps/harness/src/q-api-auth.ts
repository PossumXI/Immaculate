import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { safeUnlink } from "./utils.js";

export type QApiKeyScope = "invoke";

export type QApiRateLimitPolicy = {
  requestsPerMinute: number;
  burst: number;
  maxConcurrentRequests: number;
};

type StoredQApiKeyRecord = {
  keyId: string;
  label: string;
  prefix: string;
  scopes: QApiKeyScope[];
  salt: string;
  hash: string;
  createdAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  lastUsedIp?: string;
  rateLimit: QApiRateLimitPolicy;
};

type QApiKeyStore = {
  version: 1;
  keys: StoredQApiKeyRecord[];
};

export type QApiKeyMetadata = {
  keyId: string;
  label: string;
  prefix: string;
  scopes: QApiKeyScope[];
  createdAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  lastUsedIp?: string;
  rateLimit: QApiRateLimitPolicy;
};

export type QApiKeyCreationResult = {
  plainTextKey: string;
  key: QApiKeyMetadata;
};

export type QApiAuthenticatedKey = {
  key: QApiKeyMetadata;
};

const STORE_VERSION = 1;
const DEFAULT_KEYS_FILENAME = "q-api-keys.json";
const AUTH_METADATA_TOUCH_INTERVAL_MS = 15_000;
const METADATA_FLUSH_DEBOUNCE_MS = 1_500;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : fallback;
}

export function normalizeQApiRateLimitPolicy(
  input: Partial<QApiRateLimitPolicy> | undefined,
  fallback: QApiRateLimitPolicy
): QApiRateLimitPolicy {
  const requestsPerMinute = normalizePositiveInteger(input?.requestsPerMinute, fallback.requestsPerMinute);
  const burst = Math.max(requestsPerMinute, normalizePositiveInteger(input?.burst, fallback.burst));
  const maxConcurrentRequests = normalizePositiveInteger(
    input?.maxConcurrentRequests,
    fallback.maxConcurrentRequests
  );
  return {
    requestsPerMinute,
    burst,
    maxConcurrentRequests
  };
}

function toMetadata(record: StoredQApiKeyRecord): QApiKeyMetadata {
  return {
    keyId: record.keyId,
    label: record.label,
    prefix: record.prefix,
    scopes: [...record.scopes],
    createdAt: record.createdAt,
    revokedAt: record.revokedAt,
    lastUsedAt: record.lastUsedAt,
    lastUsedIp: record.lastUsedIp,
    rateLimit: { ...record.rateLimit }
  };
}

function encodeSalt(): string {
  return randomBytes(16).toString("hex");
}

function encodeSecret(): string {
  return randomBytes(24).toString("base64url");
}

function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 32).toString("hex");
}

function timingSafeHexEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseStoredStore(content: string | null): QApiKeyStore {
  if (!content) {
    return {
      version: STORE_VERSION,
      keys: []
    };
  }

  try {
    const parsed = JSON.parse(content) as Partial<QApiKeyStore>;
    if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.keys)) {
      return {
        version: STORE_VERSION,
        keys: []
      };
    }

    return {
      version: STORE_VERSION,
      keys: parsed.keys.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const candidate = item as Partial<StoredQApiKeyRecord>;
        if (
          typeof candidate.keyId !== "string" ||
          typeof candidate.label !== "string" ||
          typeof candidate.prefix !== "string" ||
          !Array.isArray(candidate.scopes) ||
          typeof candidate.salt !== "string" ||
          typeof candidate.hash !== "string" ||
          typeof candidate.createdAt !== "string" ||
          !candidate.rateLimit ||
          typeof candidate.rateLimit !== "object"
        ) {
          return [];
        }

        return [
          {
            keyId: candidate.keyId,
            label: candidate.label,
            prefix: candidate.prefix,
            scopes: candidate.scopes.filter((scope): scope is QApiKeyScope => scope === "invoke"),
            salt: candidate.salt,
            hash: candidate.hash,
            createdAt: candidate.createdAt,
            revokedAt: typeof candidate.revokedAt === "string" ? candidate.revokedAt : undefined,
            lastUsedAt: typeof candidate.lastUsedAt === "string" ? candidate.lastUsedAt : undefined,
            lastUsedIp: typeof candidate.lastUsedIp === "string" ? candidate.lastUsedIp : undefined,
            rateLimit: normalizeQApiRateLimitPolicy(candidate.rateLimit, {
              requestsPerMinute: 60,
              burst: 60,
              maxConcurrentRequests: 2
            })
          }
        ];
      })
    };
  } catch {
    return {
      version: STORE_VERSION,
      keys: []
    };
  }
}

function mergeKeyRecord(
  preferred: StoredQApiKeyRecord,
  incoming: StoredQApiKeyRecord
): StoredQApiKeyRecord {
  return {
    ...incoming,
    revokedAt: incoming.revokedAt ?? preferred.revokedAt,
    lastUsedAt: preferred.lastUsedAt ?? incoming.lastUsedAt,
    lastUsedIp: preferred.lastUsedIp ?? incoming.lastUsedIp
  };
}

function mergeStores(preferred: QApiKeyStore, incoming: QApiKeyStore): QApiKeyStore {
  const incomingById = new Map(incoming.keys.map((record) => [record.keyId, record]));
  const mergedKeys: StoredQApiKeyRecord[] = [];
  const seen = new Set<string>();

  for (const record of preferred.keys) {
    const incomingRecord = incomingById.get(record.keyId);
    mergedKeys.push(incomingRecord ? mergeKeyRecord(record, incomingRecord) : record);
    seen.add(record.keyId);
  }

  for (const record of incoming.keys) {
    if (!seen.has(record.keyId)) {
      mergedKeys.push(record);
    }
  }

  return {
    version: STORE_VERSION,
    keys: mergedKeys
  };
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await safeUnlink(tempPath);
    throw error;
  }
}

export function defaultQApiKeysPath(rootDir: string): string {
  return path.join(rootDir, DEFAULT_KEYS_FILENAME);
}

export async function createQApiKeyRegistry(options: {
  rootDir: string;
  storePath?: string;
  defaultRateLimit: QApiRateLimitPolicy;
}) {
  const storePath = options.storePath?.trim() || defaultQApiKeysPath(options.rootDir);
  let cachedStore: QApiKeyStore | undefined;
  let metadataFlushTimer: NodeJS.Timeout | undefined;

  async function ensureRoot(): Promise<void> {
    await mkdir(path.dirname(storePath), { recursive: true });
  }

  async function readStoreFromDisk(): Promise<QApiKeyStore> {
    await ensureRoot();
    try {
      const content = await readFile(storePath, "utf8");
      return parseStoredStore(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          version: STORE_VERSION,
          keys: []
        };
      }
      throw error;
    }
  }

  async function writeStoreToDisk(store: QApiKeyStore): Promise<void> {
    await ensureRoot();
    const mergedStore = mergeStores(store, await readStoreFromDisk());
    cachedStore = mergedStore;
    const serialized = `${JSON.stringify(mergedStore, null, 2)}\n`;
    await atomicWrite(storePath, serialized);
  }

  function clearMetadataFlushTimer(): void {
    if (metadataFlushTimer) {
      clearTimeout(metadataFlushTimer);
      metadataFlushTimer = undefined;
    }
  }

  function queueMetadataFlush(): void {
    clearMetadataFlushTimer();
    metadataFlushTimer = setTimeout(() => {
      metadataFlushTimer = undefined;
      if (!cachedStore) {
        return;
      }
      void writeStoreToDisk(cachedStore).catch(() => undefined);
    }, METADATA_FLUSH_DEBOUNCE_MS);
    metadataFlushTimer.unref?.();
  }

  async function loadStore(forceReload = false): Promise<QApiKeyStore> {
    if (cachedStore && !forceReload) {
      return cachedStore;
    }
    cachedStore = await readStoreFromDisk();
    return cachedStore;
  }

  async function saveStore(store: QApiKeyStore): Promise<void> {
    cachedStore = store;
    clearMetadataFlushTimer();
    await writeStoreToDisk(store);
  }

  function generateKeyId(): string {
    return `qkey-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  }

  function createPlainTextKey(keyId: string, secret: string): string {
    return `qk.${keyId}.${secret}`;
  }

  function parsePlainTextKey(token: string): { keyId: string; secret: string } | null {
    const trimmed = token.trim();
    if (!trimmed.startsWith("qk.")) {
      return null;
    }
    const segments = trimmed.split(".");
    if (segments.length !== 3) {
      return null;
    }
    const [, keyId, secret] = segments;
    if (!keyId?.trim() || !secret?.trim()) {
      return null;
    }
    return {
      keyId: keyId.trim(),
      secret: secret.trim()
    };
  }

  return {
    getStorePath(): string {
      return storePath;
    },
    async listKeys(): Promise<QApiKeyMetadata[]> {
      const store = await loadStore();
      return store.keys.map((record) => toMetadata(record));
    },
    async createKey(input: {
      label: string;
      scopes?: QApiKeyScope[];
      rateLimit?: Partial<QApiRateLimitPolicy>;
    }): Promise<QApiKeyCreationResult> {
      const label = input.label.trim();
      if (!label) {
        throw new Error("Q API key label is required.");
      }

      const store = await loadStore();
      const keyId = generateKeyId();
      const secret = encodeSecret();
      const salt = encodeSalt();
      const scopes = (input.scopes?.filter((scope): scope is QApiKeyScope => scope === "invoke") ?? [
        "invoke"
      ]) as QApiKeyScope[];
      const rateLimit = normalizeQApiRateLimitPolicy(input.rateLimit, options.defaultRateLimit);
      const record: StoredQApiKeyRecord = {
        keyId,
        label,
        prefix: createPlainTextKey(keyId, secret).slice(0, 20),
        scopes,
        salt,
        hash: hashSecret(secret, salt),
        createdAt: nowIso(),
        rateLimit
      };
      store.keys = [record, ...store.keys];
      await saveStore(store);
      return {
        plainTextKey: createPlainTextKey(keyId, secret),
        key: toMetadata(record)
      };
    },
    async revokeKey(keyId: string): Promise<QApiKeyMetadata> {
      const store = await loadStore();
      const record = store.keys.find((candidate) => candidate.keyId === keyId.trim());
      if (!record) {
        throw new Error(`Unknown Q API key: ${keyId}`);
      }
      if (!record.revokedAt) {
        record.revokedAt = nowIso();
        await saveStore(store);
      }
      return toMetadata(record);
    },
    async authenticate(
      token: string,
      options?: {
        requiredScope?: QApiKeyScope;
        ip?: string;
      }
    ): Promise<QApiAuthenticatedKey | null> {
      const parsed = parsePlainTextKey(token);
      if (!parsed) {
        return null;
      }

      let store = await loadStore();
      let record = store.keys.find((candidate) => candidate.keyId === parsed.keyId);
      if (!record) {
        store = mergeStores(store, await readStoreFromDisk());
        cachedStore = store;
        record = store.keys.find((candidate) => candidate.keyId === parsed.keyId);
      }
      if (!record || record.revokedAt) {
        return null;
      }

      if (options?.requiredScope && !record.scopes.includes(options.requiredScope)) {
        return null;
      }

      const computedHash = hashSecret(parsed.secret, record.salt);
      if (!timingSafeHexEqual(computedHash, record.hash)) {
        store = mergeStores(store, await readStoreFromDisk());
        cachedStore = store;
        record = store.keys.find((candidate) => candidate.keyId === parsed.keyId);
        if (!record || record.revokedAt) {
          return null;
        }
        const refreshedHash = hashSecret(parsed.secret, record.salt);
        if (!timingSafeHexEqual(refreshedHash, record.hash)) {
          return null;
        }
      }

      const previousLastUsedAt = record.lastUsedAt;
      const previousLastUsedIp = record.lastUsedIp;
      const nextIp = options?.ip?.trim() || previousLastUsedIp;
      const lastUsedAtMs = previousLastUsedAt ? Date.parse(previousLastUsedAt) : 0;
      const shouldPersistMetadata =
        !previousLastUsedAt ||
        !Number.isFinite(lastUsedAtMs) ||
        Date.now() - lastUsedAtMs >= AUTH_METADATA_TOUCH_INTERVAL_MS ||
        nextIp !== previousLastUsedIp;
      record.lastUsedAt = nowIso();
      record.lastUsedIp = nextIp;
      if (shouldPersistMetadata) {
        queueMetadataFlush();
      }
      return {
        key: toMetadata(record)
      };
    }
  };
}
