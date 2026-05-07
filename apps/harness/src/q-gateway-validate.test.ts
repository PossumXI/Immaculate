import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  checkHttp,
  captureHttpCheck,
  DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS,
  buildQGatewayValidationHeaders,
  hasOpenGatewayCircuit,
  isRetryableDirectQFoundationSmoke,
  isRetryableGatewaySmokeCheck,
  isQGatewayValidationAccepted,
  resolveQGatewayValidationTimeoutMs,
  shouldRunDirectQFoundationSmokeAfterGateway,
  type QGatewayValidationReport,
  writeQGatewayValidationReport
} from "./q-gateway-validate.js";

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind to a TCP address."));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("resolveQGatewayValidationTimeoutMs clamps invalid and extreme values", () => {
  assert.equal(
    resolveQGatewayValidationTimeoutMs(undefined, DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS),
    DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS
  );
  assert.equal(resolveQGatewayValidationTimeoutMs("not-a-number", 12_345), 12_345);
  assert.equal(resolveQGatewayValidationTimeoutMs("10", 12_345), 250);
  assert.equal(resolveQGatewayValidationTimeoutMs("900000", 12_345), 600_000);
});

test("Q gateway validation headers bind timeout overrides and fast smoke probes", () => {
  const normalHeaders = buildQGatewayValidationHeaders("test-key", {
    requestTimeoutMs: 900_000
  });
  assert.equal(normalHeaders.Authorization, "Bearer test-key");
  assert.equal(normalHeaders["content-type"], "application/json");
  assert.equal(normalHeaders["x-immaculate-request-timeout-ms"], "600000");
  assert.equal(normalHeaders["x-immaculate-q-fast-smoke"], undefined);

  const fastHeaders = buildQGatewayValidationHeaders("test-key", {
    requestTimeoutMs: 120_000,
    fastSmoke: true
  });
  assert.equal(fastHeaders["x-immaculate-request-timeout-ms"], "120000");
  assert.equal(fastHeaders["x-immaculate-q-fast-smoke"], "true");
});

test("checkHttp fails fast when the gateway accepts a socket but does not answer", async () => {
  const sockets = new Set<Socket>();
  const server = http.createServer(() => {
    // Intentionally leave the request open to verify the release gate timeout.
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const port = await listen(server);
  try {
    await assert.rejects(
      () => checkHttp(`http://127.0.0.1:${port}/health`, undefined, 50),
      /HTTP check timed out after 50 ms/
    );
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }
    await close(server);
  }
});

test("captureHttpCheck records hung gateway probes as transport timeout evidence", async () => {
  const sockets = new Set<Socket>();
  const server = http.createServer(() => {
    // Intentionally leave the request open to verify validation can still emit evidence.
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const port = await listen(server);
  try {
    const check = await captureHttpCheck(`http://127.0.0.1:${port}/health`, undefined, 50);
    assert.equal(check.status, 503);
    assert.equal((check.body as { failureClass?: string }).failureClass, "transport_timeout");
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }
    await close(server);
  }
});

test("Q gateway validation detects open circuit health payloads", () => {
  assert.equal(
    hasOpenGatewayCircuit({
      circuit: {
        state: "open"
      }
    }),
    true
  );
  assert.equal(
    hasOpenGatewayCircuit({
      circuit: {
        state: "closed"
      }
    }),
    false
  );
  assert.equal(hasOpenGatewayCircuit({ status: "ok" }), false);
});

test("Q gateway validation retries transient local model transport resets only", () => {
  assert.equal(
    isRetryableGatewaySmokeCheck({
      status: 503,
      body: {
        error: "q_upstream_failure",
        failureClass: "http_error",
        message: "read ECONNRESET"
      },
      headers: {},
      wallLatencyMs: 1
    }),
    true
  );
  assert.equal(
    isRetryableGatewaySmokeCheck({
      status: 503,
      body: {
        error: "q_upstream_failure",
        failureClass: "http_error",
        message: "model is loading"
      },
      headers: {},
      wallLatencyMs: 1
    }),
    true
  );
  assert.equal(
    isRetryableGatewaySmokeCheck({
      status: 503,
      body: {
        error: "q_upstream_failure",
        failureClass: "policy_denied",
        message: "blocked"
      },
      headers: {},
      wallLatencyMs: 1
    }),
    false
  );
});

test("direct Q foundation smoke retries refused local provider sockets", () => {
  assert.equal(
    isRetryableDirectQFoundationSmoke({
      response: "",
      model: "q:latest",
      startedAt: "2026-05-07T00:00:00.000Z",
      completedAt: "2026-05-07T00:00:00.000Z",
      latencyMs: 1,
      done: false,
      thinkingDetected: false,
      responsePreview: "connect ECONNREFUSED 127.0.0.1:11434",
      failureClass: "http_error"
    }),
    true
  );
  assert.equal(
    isRetryableDirectQFoundationSmoke({
      response: "",
      model: "q:latest",
      startedAt: "2026-05-07T00:00:00.000Z",
      completedAt: "2026-05-07T00:00:00.000Z",
      latencyMs: 1,
      done: false,
      thinkingDetected: false,
      responsePreview: "invalid credentials",
      failureClass: "http_error"
    }),
    false
  );
});

test("direct Q foundation smoke waits for successful gateway upstream proof", () => {
  assert.equal(
    shouldRunDirectQFoundationSmokeAfterGateway({
      status: 200,
      body: {},
      headers: {
        "x-upstream-latency-ms": "42.5"
      },
      wallLatencyMs: 44
    }),
    true
  );
  assert.equal(
    shouldRunDirectQFoundationSmokeAfterGateway({
      status: 503,
      body: {
        failureClass: "circuit_open"
      },
      headers: {},
      wallLatencyMs: 1
    }),
    false
  );
  assert.equal(
    shouldRunDirectQFoundationSmokeAfterGateway({
      status: 200,
      body: {},
      headers: {},
      wallLatencyMs: 1
    }),
    false
  );
});

function httpCheck(status: number) {
  return {
    status,
    body: {},
    headers: {},
    wallLatencyMs: 1
  };
}

function validationReport(
  overrides: Partial<QGatewayValidationReport> = {}
): QGatewayValidationReport {
  const report: QGatewayValidationReport = {
    generatedAt: "2026-05-07T00:00:00.000Z",
    gatewayUrl: "http://127.0.0.1:8897",
    modelName: "Q",
    foundationModel: "Gemma 4",
    release: {
      packageVersion: "0.1.0",
      harnessVersion: "0.1.0",
      coreVersion: "0.1.0",
      gitSha: "abc",
      gitShortSha: "abc",
      gitBranch: "main",
      buildId: "0.1.0+abc",
      q: {
        modelName: "Q",
        foundationModel: "Gemma 4",
        trainingLock: undefined,
        hybridSession: undefined
      }
    },
    hardwareContext: {
      host: "test",
      platform: "win32",
      arch: "x64",
      osVersion: "test",
      cpuModel: "test",
      cpuCount: 1,
      memoryGiB: 1,
      nodeVersion: "v0.0.0"
    },
    checks: {
      health: httpCheck(200),
      unauthorizedChat: httpCheck(401),
      info: httpCheck(200),
      models: httpCheck(200),
      authorizedChat: httpCheck(200),
      identityChat: httpCheck(200),
      concurrentRejection: httpCheck(429)
    },
    identity: {
      canonical: true,
      responsePreview: "I am Q."
    },
    localQFoundationRun: {
      latencyMs: 1,
      wallLatencyMs: 1,
      responsePreview: "ok"
    },
    comparison: {
      gatewayEndToEndLatencyMs: 1,
      gatewayUpstreamLatencyMs: 0.8,
      gatewayAddedLatencyMs: 0.2,
      localQFoundationLatencyMs: 1
    },
    output: {
      jsonPath: path.join("docs", "wiki", "Q-Gateway-Validation.json"),
      markdownPath: path.join("docs", "wiki", "Q-Gateway-Validation.md")
    }
  };
  return {
    ...report,
    ...overrides
  };
}

test("Q gateway validation accepts only the full live contract", () => {
  assert.equal(isQGatewayValidationAccepted(validationReport()), true);
  assert.equal(
    isQGatewayValidationAccepted(
      validationReport({
        checks: {
          ...validationReport().checks,
          authorizedChat: httpCheck(503)
        }
      })
    ),
    false
  );
  assert.equal(
    isQGatewayValidationAccepted(
      validationReport({
        localQFoundationRun: {
          latencyMs: 1,
          wallLatencyMs: 1,
          responsePreview: "timeout",
          failureClass: "transport_timeout"
        }
      })
    ),
    false
  );
  assert.equal(
    isQGatewayValidationAccepted(
      validationReport({
        comparison: {
          gatewayEndToEndLatencyMs: 1,
          localQFoundationLatencyMs: 1
        }
      })
    ),
    false
  );
});

test("failed Q gateway validation writes runtime evidence without touching tracked docs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "q-gateway-validation-"));
  try {
    const repoRoot = path.join(root, "repo");
    const runtimeDir = path.join(root, "runtime");
    const report = validationReport({
      checks: {
        ...validationReport().checks,
        authorizedChat: httpCheck(503)
      }
    });

    const result = await writeQGatewayValidationReport(report, {
      accepted: false,
      repoRoot,
      runtimeDir
    });

    assert.equal(result.published, false);
    assert.equal(
      existsSync(path.join(repoRoot, report.output.jsonPath)),
      false
    );
    assert.equal(result.jsonPath, path.join(runtimeDir, "q-gateway-validation", "latest-failed.json"));
    const failureJson = JSON.parse(await readFile(result.jsonPath, "utf8"));
    assert.equal(failureJson.checks.authorizedChat.status, 503);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepted Q gateway validation publishes tracked proof docs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "q-gateway-validation-"));
  try {
    const repoRoot = path.join(root, "repo");
    const runtimeDir = path.join(root, "runtime");
    const report = validationReport();

    const result = await writeQGatewayValidationReport(report, {
      accepted: true,
      repoRoot,
      runtimeDir
    });

    assert.equal(result.published, true);
    assert.equal(result.jsonPath, path.join(repoRoot, report.output.jsonPath));
    assert.match(await readFile(result.markdownPath, "utf8"), /Q Gateway Validation/);
    assert.equal(
      existsSync(path.join(runtimeDir, "q-gateway-validation", "latest-failed.json")),
      false
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
