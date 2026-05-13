import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBenchmarkChatHeaders,
  resolveQMediationDriftBenchmarkControls
} from "./benchmark-q-mediation-drift.js";

test("q mediation drift benchmark controls keep a bounded structured timeout budget", () => {
  const controls = resolveQMediationDriftBenchmarkControls({
    IMMACULATE_BENCHMARK_Q_MEDIATION_MAX_TOKENS: "24",
    IMMACULATE_BENCHMARK_Q_MEDIATION_TIMEOUT_MS: "1000",
    IMMACULATE_BENCHMARK_Q_MEDIATION_TIMEOUT_OVERRIDE_MS: "2000"
  });

  assert.deepEqual(controls, {
    maxTokens: 48,
    timeoutMs: 5_000,
    timeoutOverrideMs: 5_000
  });
});

test("q mediation drift benchmark headers propagate the timeout override", () => {
  const headers = buildBenchmarkChatHeaders("Bearer mediation-token", {
    timeoutOverrideMs: 240_000
  });

  assert.equal(headers.Authorization, "Bearer mediation-token");
  assert.equal(headers["x-immaculate-benchmark-skip-q-identity"], "1");
  assert.equal(headers["x-immaculate-request-timeout-ms"], "240000");
});
