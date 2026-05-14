import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  describeSourceFreshnessReason,
  describeQGatewayContractReasons,
  DEFAULT_Q_READINESS_MODEL_COMPARISON_MAX_SOURCE_AGE_MS,
  DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS,
  resolveQReadinessSourceAgeBudgets,
  resolveQReadinessMaxSourceAgeMs,
  selectLatestQGatewayValidationReport,
  summarizeQGatewayContract,
  type QGatewayValidationReport,
  type QReadinessGateReport,
  writeQReadinessGateReport
} from "./q-release-gate.js";

const greenGatewayReport = {
  generatedAt: "2026-05-07T00:00:00.000Z",
  identity: { canonical: true },
  checks: {
    health: { status: 200 },
    unauthorizedChat: { status: 401 },
    info: { status: 200 },
    models: { status: 200 },
    authorizedChat: { status: 200 },
    identityChat: { status: 200 },
    concurrentRejection: { status: 429 }
  }
};

test("summarizeQGatewayContract requires the full live gateway contract", () => {
  const summary = summarizeQGatewayContract(greenGatewayReport);

  assert.equal(summary.ready, true);
  assert.deepEqual(describeQGatewayContractReasons(summary, true), []);
});

test("summarizeQGatewayContract fails closed when authenticated chat times out", () => {
  const summary = summarizeQGatewayContract({
    ...greenGatewayReport,
    checks: {
      ...greenGatewayReport.checks,
      authorizedChat: {
        status: 503,
        body: {
          error: "q_upstream_failure",
          failureClass: "transport_timeout"
        }
      }
    },
    localQFoundationRun: {
      failureClass: "transport_timeout"
    }
  });
  const reasons = describeQGatewayContractReasons(summary, true);

  assert.equal(summary.ready, false);
  assert.equal(summary.authorizedChatStatus, 503);
  assert.match(reasons.join("\n"), /authenticated chat returned 503 instead of 200/);
  assert.match(reasons.join("\n"), /authenticated chat failed with transport_timeout/);
  assert.match(reasons.join("\n"), /Direct local Q foundation call failed with transport_timeout/);
});

test("selectLatestQGatewayValidationReport prefers newer runtime failure evidence", () => {
  const tracked = {
    ...greenGatewayReport,
    generatedAt: "2026-05-07T00:00:00.000Z"
  } satisfies QGatewayValidationReport;
  const runtimeFailure = {
    ...greenGatewayReport,
    generatedAt: "2026-05-07T00:01:00.000Z",
    checks: {
      ...greenGatewayReport.checks,
      authorizedChat: {
        status: 503,
        body: {
          failureClass: "transport_timeout"
        }
      }
    }
  } satisfies QGatewayValidationReport;

  assert.equal(
    selectLatestQGatewayValidationReport({ tracked, runtimeFailure })?.checks?.authorizedChat?.status,
    503
  );
});

test("Q readiness source freshness rejects stale proof receipts", () => {
  const nowMs = Date.parse("2026-05-07T00:00:00.000Z");

  assert.equal(resolveQReadinessMaxSourceAgeMs(undefined), DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS);
  assert.equal(resolveQReadinessMaxSourceAgeMs("1000"), 60_000);
  assert.equal(
    describeSourceFreshnessReason({
      label: "Q gateway validation",
      generatedAt: "2026-05-06T23:59:00.000Z",
      nowMs,
      maxAgeMs: DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS
    }),
    undefined
  );
  assert.match(
    describeSourceFreshnessReason({
      label: "Q gateway validation",
      generatedAt: "2026-04-19T00:00:00.000Z",
      nowMs,
      maxAgeMs: DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS
    }) ?? "",
    /source is stale/
  );
});

test("Q readiness uses a bounded wider freshness budget for local model comparison receipts", () => {
  const nowMs = Date.parse("2026-05-14T12:00:00.000Z");
  const budgets = resolveQReadinessSourceAgeBudgets({});

  assert.equal(
    budgets.modelComparisonMs,
    DEFAULT_Q_READINESS_MODEL_COMPARISON_MAX_SOURCE_AGE_MS
  );
  assert.equal(budgets.bridgeBenchMs, DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS);
  assert.equal(budgets.qGatewayValidationMs, DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS);
  assert.equal(
    describeSourceFreshnessReason({
      label: "Model comparison",
      generatedAt: "2026-05-07T06:03:07.620Z",
      nowMs,
      maxAgeMs: budgets.modelComparisonMs
    }),
    undefined
  );
  assert.match(
    describeSourceFreshnessReason({
      label: "Q gateway validation",
      generatedAt: "2026-05-07T06:03:07.620Z",
      nowMs,
      maxAgeMs: budgets.qGatewayValidationMs
    }) ?? "",
    /source is stale/
  );
});

function readinessReport(
  overrides: Partial<QReadinessGateReport> = {}
): QReadinessGateReport {
  const report: QReadinessGateReport = {
    generatedAt: "2026-05-07T00:00:00.000Z",
    threshold: 0.75,
    ready: true,
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
        truthfulLabel: "Q"
      }
    },
    reasons: [],
    sources: {
      modelComparisonGeneratedAt: "2026-05-07T00:00:00.000Z",
      bridgeBenchGeneratedAt: "2026-05-07T00:00:00.000Z",
      qGatewayValidationGeneratedAt: "2026-05-07T00:00:00.000Z"
    },
    q: {
      modelComparison: {
        parseSuccessRate: 1,
        completedTaskCount: 1,
        taskCount: 1
      },
      bridgeBench: {
        parseSuccessRate: 1,
        taskCount: 1
      },
      gatewayIdentityCanonical: true,
      gatewayContract: summarizeQGatewayContract(greenGatewayReport)
    },
    output: {
      jsonPath: path.join("docs", "wiki", "Q-Readiness-Gate.json"),
      markdownPath: path.join("docs", "wiki", "Q-Readiness-Gate.md")
    }
  };
  return {
    ...report,
    ...overrides
  };
}

test("writeQReadinessGateReport keeps failed gate receipts in runtime state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "q-readiness-gate-"));
  try {
    const repoRoot = path.join(root, "repo");
    const runtimeDir = path.join(root, "runtime");
    const report = readinessReport({
      ready: false,
      reasons: ["Q gateway authenticated chat returned 503 instead of 200."]
    });

    const result = await writeQReadinessGateReport(report, {
      repoRoot,
      runtimeDir
    });

    assert.equal(result.published, false);
    assert.equal(
      existsSync(path.join(repoRoot, report.output.jsonPath)),
      false
    );
    assert.equal(result.jsonPath, path.join(runtimeDir, "q-readiness-gate", "latest-failed.json"));
    const failureJson = JSON.parse(await readFile(result.jsonPath, "utf8"));
    assert.equal(failureJson.ready, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeQReadinessGateReport publishes only a passing gate", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "q-readiness-gate-"));
  try {
    const repoRoot = path.join(root, "repo");
    const runtimeDir = path.join(root, "runtime");
    const report = readinessReport();

    const result = await writeQReadinessGateReport(report, {
      repoRoot,
      runtimeDir
    });

    assert.equal(result.published, true);
    assert.equal(result.jsonPath, path.join(repoRoot, report.output.jsonPath));
    assert.match(await readFile(result.markdownPath, "utf8"), /Q Readiness Gate/);
    assert.equal(
      existsSync(path.join(runtimeDir, "q-readiness-gate", "latest-failed.json")),
      false
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
