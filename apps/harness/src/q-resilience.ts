export type CircuitState = "closed" | "open" | "half-open";

export type CircuitSnapshot = {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt?: string;
  nextProbeAt?: string;
  lastFailureAt?: string;
  lastFailureReason?: string;
  lastSuccessAt?: string;
};

type CircuitBreakerOptions = {
  failureThreshold?: number;
  cooldownMs?: number;
};

export function createFailureCircuitBreaker(options?: CircuitBreakerOptions) {
  const failureThreshold = Math.max(1, options?.failureThreshold ?? 3);
  const cooldownMs = Math.max(1_000, options?.cooldownMs ?? 120_000);

  let state: CircuitState = "closed";
  let consecutiveFailures = 0;
  let openedAt: string | undefined;
  let nextProbeAt: string | undefined;
  let lastFailureAt: string | undefined;
  let lastFailureReason: string | undefined;
  let lastSuccessAt: string | undefined;

  function snapshot(): CircuitSnapshot {
    return {
      state,
      consecutiveFailures,
      openedAt,
      nextProbeAt,
      lastFailureAt,
      lastFailureReason,
      lastSuccessAt
    };
  }

  function beforeRequest(now = Date.now()): {
    allowPrimary: boolean;
    state: CircuitState;
    reason?: string;
  } {
    if (state === "open") {
      const probeAt = nextProbeAt ? Date.parse(nextProbeAt) : Number.POSITIVE_INFINITY;
      if (now < probeAt) {
        return {
          allowPrimary: false,
          state,
          reason: "circuit_open"
        };
      }
      state = "half-open";
    }

    return {
      allowPrimary: true,
      state
    };
  }

  function recordSuccess(now = new Date()): CircuitSnapshot {
    state = "closed";
    consecutiveFailures = 0;
    openedAt = undefined;
    nextProbeAt = undefined;
    lastSuccessAt = now.toISOString();
    return snapshot();
  }

  function recordFailure(reason: string, now = new Date()): CircuitSnapshot {
    const timestamp = now.toISOString();
    lastFailureAt = timestamp;
    lastFailureReason = reason;
    consecutiveFailures += 1;

    if (state === "half-open" || consecutiveFailures >= failureThreshold) {
      state = "open";
      openedAt = timestamp;
      nextProbeAt = new Date(now.getTime() + cooldownMs).toISOString();
    }

    return snapshot();
  }

  return {
    beforeRequest,
    recordSuccess,
    recordFailure,
    snapshot
  };
}
