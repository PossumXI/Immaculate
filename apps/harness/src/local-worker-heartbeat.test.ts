import assert from "node:assert/strict";
import test from "node:test";
import { resolveLocalWorkerHeartbeatIntervalMs } from "./local-worker-heartbeat.js";

test("uses a bounded default local worker heartbeat interval", () => {
  assert.equal(
    resolveLocalWorkerHeartbeatIntervalMs({
      leaseDurationMs: 45_000
    }),
    15_000
  );
});

test("clamps local worker heartbeat overrides inside the lease-safe window", () => {
  assert.equal(
    resolveLocalWorkerHeartbeatIntervalMs({
      envValue: "250",
      leaseDurationMs: 45_000
    }),
    1_000
  );
  assert.equal(
    resolveLocalWorkerHeartbeatIntervalMs({
      envValue: "60000",
      leaseDurationMs: 45_000
    }),
    22_500
  );
});

test("falls back when the local worker heartbeat override is invalid", () => {
  assert.equal(
    resolveLocalWorkerHeartbeatIntervalMs({
      envValue: "not-a-number",
      leaseDurationMs: 45_000
    }),
    15_000
  );
});
