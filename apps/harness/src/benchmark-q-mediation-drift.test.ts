import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import {
  buildStructuredPrompt,
  buildBenchmarkChatHeaders,
  checkHttp,
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
    timeoutOverrideMs: 5_000,
    httpTimeoutMs: 27_000,
    prewarmTimeoutMs: 5_000
  });
});

test("q mediation drift client timeout covers gateway primary retry and repair budgets", () => {
  const controls = resolveQMediationDriftBenchmarkControls({
    IMMACULATE_BENCHMARK_Q_MEDIATION_TIMEOUT_MS: "6000",
    IMMACULATE_BENCHMARK_Q_MEDIATION_TIMEOUT_OVERRIDE_MS: "8000"
  });

  assert.equal(controls.timeoutMs, 6_000);
  assert.equal(controls.timeoutOverrideMs, 8_000);
  assert.equal(controls.httpTimeoutMs, 33_000);
});

test("q mediation drift benchmark headers propagate the timeout override", () => {
  const headers = buildBenchmarkChatHeaders("Bearer mediation-token", {
    timeoutOverrideMs: 240_000
  });

  assert.equal(headers.Authorization, "Bearer mediation-token");
  assert.equal(headers["x-immaculate-benchmark-skip-q-identity"], "1");
  assert.equal(headers["x-immaculate-request-timeout-ms"], "240000");
});

test("q mediation drift prompt makes directive policy explicit without leaking expected answers", () => {
  const prompt = buildStructuredPrompt({
    id: "policy-check",
    label: "Policy check",
    objective: "Local Q is healthy and cloud is blocked.",
    context: "Do not over-escalate.",
    governancePressure: "elevated",
    expectedRoute: "cognitive",
    expectedRoutingMode: "cognitive-assisted",
    expectedAdmissionState: "degrade",
    expectedDispatchAllowed: true,
    qRoutingDirective: "primary-governed-local",
    readinessReady: true,
    gatewaySubstrateHealthy: true,
    guardDeniedCount: 1,
    sessionBlockedVerdictCount: 2,
    consentScope: "session:benchmark",
    frameDecodeReady: false,
    frameDecodeConfidence: 0.61,
    federatedPressure: {
      pressure: "elevated",
      healthyPeerCount: 1,
      recoveringPeerCount: 1,
      eligibleRemoteWorkerCount: 1,
      crossNodeLatencyMs: 88,
      remoteSuccessRatio: 0.44,
      remoteFailurePressure: 0.51,
      executionLatencyMs: 2100,
      rationale: "Remote jitter is elevated, but the governed local Q lane is healthy."
    }
  });

  assert.match(prompt.user, /ROUTE POLICY:/);
  assert.match(prompt.user, /DIRECTIVE POLICY:/);
  assert.match(prompt.user, /primary-governed-local must stay cognitive/);
  assert.match(prompt.user, /These benchmark scenarios are reviewable, not refusals/);
  assert.doesNotMatch(prompt.user, /expectedRoute|EXPECTED_EXECUTION|requires ROUTE/);
});

test("q mediation drift HTTP checks fail fast when a loopback socket never answers", async () => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await assert.rejects(
      () => checkHttp(`http://127.0.0.1:${address.port}/health`, undefined, 50),
      /HTTP check timed out after 50 ms/
    );
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
