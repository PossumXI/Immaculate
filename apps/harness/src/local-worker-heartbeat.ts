const DEFAULT_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS = 15_000;
const MIN_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS = 1_000;
const MAX_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS = 30_000;

function readInteger(value: string | number | undefined): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

export function resolveLocalWorkerHeartbeatIntervalMs(options: {
  envValue?: string | number;
  leaseDurationMs: number;
  fallbackMs?: number;
}): number {
  const leaseDurationMs = Number.isFinite(options.leaseDurationMs)
    ? Math.max(
        MIN_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS * 2,
        Math.trunc(options.leaseDurationMs)
      )
    : DEFAULT_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS * 3;
  const leaseSafeMax = Math.max(
    MIN_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS,
    Math.floor(leaseDurationMs * 0.5)
  );
  const maxIntervalMs = Math.min(
    MAX_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS,
    leaseSafeMax
  );
  const fallbackMs = Math.min(
    Math.max(
      Math.trunc(options.fallbackMs ?? DEFAULT_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS),
      MIN_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS
    ),
    maxIntervalMs
  );
  const requestedMs = readInteger(options.envValue) ?? fallbackMs;

  return Math.min(
    Math.max(requestedMs, MIN_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS),
    maxIntervalMs
  );
}
