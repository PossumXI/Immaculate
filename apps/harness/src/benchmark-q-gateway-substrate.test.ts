import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBenchmarkChatHeaders,
  resolveQGatewaySubstrateBenchmarkControls
} from "./benchmark-q-gateway-substrate.js";

test("q gateway substrate benchmark controls clamp unsafe low operator overrides", () => {
  const controls = resolveQGatewaySubstrateBenchmarkControls({
    IMMACULATE_BENCHMARK_Q_SUBSTRATE_MAX_TOKENS: "12",
    IMMACULATE_BENCHMARK_Q_SUBSTRATE_TIMEOUT_MS: "2000",
    IMMACULATE_BENCHMARK_Q_SUBSTRATE_TIMEOUT_OVERRIDE_MS: "1000"
  });

  assert.deepEqual(controls, {
    maxTokens: 48,
    timeoutMs: 5_000,
    timeoutOverrideMs: 5_000
  });
});

test("q gateway substrate benchmark headers carry the structured timeout budget", () => {
  const headers = buildBenchmarkChatHeaders("Bearer test-token", {
    timeoutOverrideMs: 240_000
  });

  assert.equal(headers.Authorization, "Bearer test-token");
  assert.equal(headers["x-immaculate-benchmark-skip-q-identity"], "1");
  assert.equal(headers["x-immaculate-request-timeout-ms"], "240000");
});
