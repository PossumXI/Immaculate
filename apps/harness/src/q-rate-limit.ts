import type { QApiRateLimitPolicy } from "./q-api-auth.js";

type BucketState = {
  tokens: number;
  lastRefillAt: number;
  inFlight: number;
  lastSeenAt: number;
};

export type RateLimitGrant = {
  allowed: true;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  release: () => void;
};

export type RateLimitRejection = {
  allowed: false;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  reason: "rate_limited" | "concurrency_limited";
};

function refillBucket(state: BucketState, policy: QApiRateLimitPolicy, now: number): BucketState {
  const refillPerMs = policy.requestsPerMinute / 60_000;
  const elapsed = Math.max(0, now - state.lastRefillAt);
  const replenished = elapsed * refillPerMs;
  return {
    ...state,
    tokens: Math.min(policy.burst, state.tokens + replenished),
    lastRefillAt: now,
    lastSeenAt: now
  };
}

export function createQRateLimiter(options?: {
  idleTtlMs?: number;
}) {
  const buckets = new Map<string, BucketState>();
  const idleTtlMs = Math.max(60_000, options?.idleTtlMs ?? 10 * 60_000);

  function prune(now: number): void {
    for (const [subject, state] of buckets.entries()) {
      if (state.inFlight === 0 && now - state.lastSeenAt > idleTtlMs) {
        buckets.delete(subject);
      }
    }
  }

  return {
    acquire(subject: string, policy: QApiRateLimitPolicy): RateLimitGrant | RateLimitRejection {
      const now = Date.now();
      prune(now);

      const existing =
        buckets.get(subject) ??
        ({
          tokens: policy.burst,
          lastRefillAt: now,
          inFlight: 0,
          lastSeenAt: now
        } satisfies BucketState);
      const state = refillBucket(existing, policy, now);

      if (state.inFlight >= policy.maxConcurrentRequests) {
        buckets.set(subject, state);
        return {
          allowed: false,
          limit: policy.requestsPerMinute,
          remaining: Math.max(0, Math.floor(state.tokens)),
          retryAfterMs: 1000,
          reason: "concurrency_limited"
        };
      }

      if (state.tokens < 1) {
        const refillPerMs = policy.requestsPerMinute / 60_000;
        const retryAfterMs =
          refillPerMs > 0 ? Math.max(1, Math.ceil((1 - state.tokens) / refillPerMs)) : 60_000;
        buckets.set(subject, state);
        return {
          allowed: false,
          limit: policy.requestsPerMinute,
          remaining: 0,
          retryAfterMs,
          reason: "rate_limited"
        };
      }

      state.tokens -= 1;
      state.inFlight += 1;
      state.lastSeenAt = now;
      buckets.set(subject, state);

      let released = false;
      return {
        allowed: true,
        limit: policy.requestsPerMinute,
        remaining: Math.max(0, Math.floor(state.tokens)),
        retryAfterMs: 0,
        release: () => {
          if (released) {
            return;
          }
          released = true;
          const current = buckets.get(subject);
          if (!current) {
            return;
          }
          current.inFlight = Math.max(0, current.inFlight - 1);
          current.lastSeenAt = Date.now();
          buckets.set(subject, current);
        }
      };
    }
  };
}
