import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildRoundtableMediationHeaders,
  buildRoundtableMediationRequestBody,
  resolveRoundtableOllamaUrl,
  resolveRoundtableRuntimeTimeoutControls,
  resolveRoundtableSharedQFallbackAllowed,
  shouldAttemptRoundtableSharedQFallback,
  shouldAbortRoundtableRuntimeAfterPrewarm,
  writeRoundtableRuntimeCanonicalReport,
  type RoundtableRuntimeSurface
} from "./roundtable-runtime.js";

function buildFailedReport(): RoundtableRuntimeSurface {
  return {
    generatedAt: "2026-05-13T20:27:16.157Z",
    release: {
      packageVersion: "0.1.0",
      harnessVersion: "0.1.0",
      coreVersion: "0.1.0",
      gitSha: "abc123",
      gitShortSha: "abc123",
      gitBranch: "main",
      buildId: "0.1.0+abc123",
      q: {
        modelName: "Q",
        foundationModel: "Gemma 4",
        truthfulLabel: "Q"
      }
    },
    benchmark: {
      harnessUrl: "http://127.0.0.1:56066",
      scenarioCount: 3,
      failedAssertions: 5,
      seedAcceptedCount: 0,
      mediationAcceptedCount: 0,
      repoCoverageP50: 3,
      materializedActionsP50: 3,
      probedActionsP50: 3,
      authorityBoundActionsP50: 3,
      executionBundlesP50: 0,
      executionReadyP50: 0,
      taskDocumentsP50: 0,
      auditReceiptsP50: 0,
      executionReceiptsP50: 0,
      workspaceScopedTurnsP50: 0,
      recordedActionsP50: 0,
      trackedFilesP50: 369,
      runnerPathP95Ms: 13162.83,
      seedLatencyP95Ms: 11148.32,
      mediationLatencyP95Ms: 7.07,
      hardware: "test-host / win32-x64 / test cpu / Q foundation Gemma 4",
      executionIntegrityDigest: "57b9dadd956103455f25773ba44ceac09d8fea811e28b31418f1bed9758a7a0c",
      decisionTraceStatus: "verified",
      decisionTraceEventCount: 1,
      decisionTraceFindingCount: 0,
      decisionTraceHeadHash: "cc46fc538d1e6bc1dfd51437566864e17a7f554384e3de03d216a0541d214dc8"
    },
    scenarios: [],
    assertions: [
      {
        id: "roundtable-runtime-scenarios-green",
        status: "fail",
        target: "all scenarios completed",
        actual: "0/3",
        detail: "Every scenario should seed cognition, mediate successfully, and record repo-scoped roundtable actions."
      }
    ],
    output: {
      jsonPath: "docs/wiki/Roundtable-Runtime.json",
      markdownPath: "docs/wiki/Roundtable-Runtime.md"
    },
    readiness: {
      ledger: {
        public: {
          status: "not_configured",
          configured: false,
          ready: false,
          detail: "public ledger endpoint not configured for this pass"
        },
        private: {
          status: "not_configured",
          configured: false,
          ready: false,
          detail: "private ledger endpoint not configured for this pass"
        }
      },
      q: {
        local: {
          status: "blocked",
          configured: true,
          ready: false,
          endpoint: "http://127.0.0.1:11434",
          detail: "local Q accepted 0/3 seed+mediation scenario pair(s)"
        },
        oci: {
          status: "not_configured",
          configured: false,
          ready: false,
          detail: "OCI-backed Q runtime not configured for this pass"
        }
      },
      discord: {
        transport: {
          status: "not_configured",
          configured: false,
          ready: false,
          detail: "Discord transport not configured for this pass"
        }
      },
      missionSurfaceReady: false,
      summary: "shared readiness blocked: local Q accepted 0/3 seed+mediation scenario pair(s)"
    }
  };
}

test("roundtable runtime writes failed reports to canonical evidence files", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "roundtable-runtime-canonical-"));
  try {
    const report = buildFailedReport();

    await writeRoundtableRuntimeCanonicalReport(report, { repoRoot: tempRoot });

    const json = JSON.parse(
      await readFile(path.join(tempRoot, "docs/wiki/Roundtable-Runtime.json"), "utf8")
    ) as RoundtableRuntimeSurface;
    const markdown = await readFile(
      path.join(tempRoot, "docs/wiki/Roundtable-Runtime.md"),
      "utf8"
    );

    assert.equal(json.benchmark.failedAssertions, 5);
    assert.match(markdown, /Failed assertions: `5`/u);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("roundtable runtime refuses canonical evidence paths outside the repo root", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "roundtable-runtime-canonical-"));
  try {
    const report = buildFailedReport();
    report.output.jsonPath = "../outside.json";

    await assert.rejects(
      () => writeRoundtableRuntimeCanonicalReport(report, { repoRoot: tempRoot }),
      /outside repo root/u
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("roundtable runtime allows shared Q fallback by default with explicit opt-out", () => {
  assert.equal(resolveRoundtableSharedQFallbackAllowed({}), true);
  assert.equal(
    resolveRoundtableSharedQFallbackAllowed({
      IMMACULATE_ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK: "true"
    }),
    true
  );
  assert.equal(
    resolveRoundtableSharedQFallbackAllowed({
      IMMACULATE_ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK: "false"
    }),
    false
  );
});

test("roundtable runtime defaults to the shared local Q lane unless explicitly isolated", () => {
  assert.equal(
    resolveRoundtableOllamaUrl({}, "http://127.0.0.1:11434"),
    "http://127.0.0.1:11434"
  );
  assert.equal(
    resolveRoundtableOllamaUrl(
      {
        IMMACULATE_ROUNDTABLE_OLLAMA_URL: " http://127.0.0.1:11435 "
      },
      "http://127.0.0.1:11434"
    ),
    "http://127.0.0.1:11435"
  );
});

test("roundtable runtime does not start shared fallback while dedicated Q is still loading", () => {
  assert.equal(
    shouldAttemptRoundtableSharedQFallback({
      dedicatedLaneRequested: true,
      sharedFallbackAllowed: true,
      sharedEndpointHealthy: true,
      dedicatedFailureClass: "transport_timeout"
    }),
    false
  );
  assert.equal(
    shouldAttemptRoundtableSharedQFallback({
      dedicatedLaneRequested: true,
      sharedFallbackAllowed: true,
      sharedEndpointHealthy: true,
      dedicatedFailureClass: "http_error"
    }),
    true
  );
});

test("roundtable runtime default timeouts finish before the release command budget", () => {
  const controls = resolveRoundtableRuntimeTimeoutControls({});

  assert.equal(controls.prewarmTimeoutMs, 180_000);
  assert.equal(controls.cognitiveRequestTimeoutMs, 180_000);
});

test("roundtable runtime aborts after failed local Q prewarm instead of leaving stale evidence", () => {
  assert.equal(
    shouldAbortRoundtableRuntimeAfterPrewarm({
      prewarmReady: false,
      prewarmWarning: "dedicated prewarm transport_timeout; shared fallback prewarm transport_timeout"
    }),
    true
  );
  assert.equal(
    shouldAbortRoundtableRuntimeAfterPrewarm({
      prewarmReady: true,
      prewarmWarning: "dedicated prewarm transport_timeout; fell back to shared local Q lane"
    }),
    false
  );
});

test("roundtable runtime mediation stays plan-only while carrying engagement evidence", () => {
  const body = buildRoundtableMediationRequestBody({
    sessionId: "roundtable-runtime-demo",
    sourceExecutionId: "cog-demo",
    objective: "Create a governed repo-scoped action plan.",
    receiptTarget: ".runtime/roundtable-runtime/runs/demo/engagement.ndjson"
  });

  assert.equal(body.dispatchOnApproval, false);
  assert.equal(body.suppressed, true);
  assert.equal(body.operatorConfirmed, true);
  assert.equal(body.receiptTarget, ".runtime/roundtable-runtime/runs/demo/engagement.ndjson");
  assert.match(body.operatorSummary, /suppressed plan-only roundtable mediation/u);
  assert.match(body.rollbackPlan, /No external dispatch is authorized/u);
});

test("roundtable runtime mediation headers carry prehandler engagement evidence", () => {
  const headers = buildRoundtableMediationHeaders({
    consentScope: "session:roundtable-runtime-test",
    receiptTarget: ".runtime/roundtable-runtime/engagement/test.ndjson"
  });

  assert.equal(headers["x-immaculate-purpose"], "actuation-dispatch,cognitive-execution");
  assert.equal(headers["x-immaculate-consent-scope"], "session:roundtable-runtime-test");
  assert.equal(headers["x-immaculate-actor"], "roundtable-runtime");
  assert.equal(headers["x-immaculate-receipt-target"], ".runtime/roundtable-runtime/engagement/test.ndjson");
  assert.equal(headers["x-immaculate-operator-confirmed"], "true");
  assert.match(headers["x-immaculate-operator-summary"], /suppressed plan-only roundtable mediation/u);
  assert.match(headers["x-immaculate-rollback-plan"], /dispatchOnApproval=false/u);
});
