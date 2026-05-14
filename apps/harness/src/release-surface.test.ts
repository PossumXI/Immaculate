import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RELEASE_SURFACE_MAX_AGE_MS,
  evaluateReleaseSurfaceEvidence,
  inferSurfaceHealth,
  listReleaseSurfaceDefinitions,
  renderReleaseAccountabilityGapLines,
  type SurfaceTimestamp
} from "./release-surface.js";

test("release surface requires the strict Q failure corpus", () => {
  const surfaces = listReleaseSurfaceDefinitions();
  const byPath = new Map(
    surfaces.map((surface) => [surface.path.replaceAll("\\", "/"), surface])
  );
  const failureCorpus = byPath.get("docs/wiki/Q-Failure-Corpus.json");
  const benchmarkCorpus = byPath.get("docs/wiki/Q-Benchmark-Corpus.json");

  assert.ok(failureCorpus);
  assert.equal(failureCorpus.label, "Q failure corpus");
  assert.equal(failureCorpus.required, true);
  assert.ok(benchmarkCorpus);
  assert.equal(benchmarkCorpus.required, true);
});

test("release surface evidence marks stale required receipts as blocking", () => {
  const nowMs = Date.parse("2026-05-13T12:00:00.000Z");
  const surfaces: SurfaceTimestamp[] = [
    {
      label: "Q gateway validation",
      path: "docs/wiki/Q-Gateway-Validation.json",
      generatedAt: "2026-05-13T11:45:00.000Z",
      required: true
    },
    {
      label: "GitHub checks receipt",
      path: "docs/wiki/GitHub-Checks-Receipt.json",
      generatedAt: "2026-04-16T17:54:12.583Z",
      required: true
    },
    {
      label: "Experimental optional receipt",
      path: "docs/wiki/Experimental.json",
      required: false
    }
  ];

  const evidence = evaluateReleaseSurfaceEvidence(surfaces, {
    nowMs,
    maxAgeMs: DEFAULT_RELEASE_SURFACE_MAX_AGE_MS
  });

  assert.equal(evidence.status, "blocked");
  assert.equal(evidence.counts.fresh, 1);
  assert.equal(evidence.counts.blocking, 1);
  assert.equal(evidence.surfaces[0].status, "fresh");
  assert.equal("ageMs" in evidence.surfaces[0], false);
  assert.equal(evidence.surfaces[1].status, "stale");
  assert.equal(evidence.surfaces[1].blocking, true);
  assert.match(evidence.surfaces[1].reason, /stale/u);
  assert.equal(evidence.surfaces[2].status, "optional");
  assert.equal(evidence.surfaces[2].blocking, false);
  assert.match(evidence.summary, /1 blocking release evidence gap/u);
});

test("release surface evidence fails closed on missing required receipts", () => {
  const evidence = evaluateReleaseSurfaceEvidence(
    [
      {
        label: "Live mission readiness",
        path: "docs/wiki/Live-Mission-Readiness.json",
        required: true
      }
    ],
    {
      nowMs: Date.parse("2026-05-13T12:00:00.000Z"),
      maxAgeMs: DEFAULT_RELEASE_SURFACE_MAX_AGE_MS
    }
  );

  assert.equal(evidence.status, "blocked");
  assert.equal(evidence.surfaces[0].status, "missing");
  assert.equal(evidence.surfaces[0].blocking, true);
  assert.match(evidence.summary, /missing/u);
});

test("release surface evidence blocks fresh required receipts that report unhealthy state", () => {
  const evidence = evaluateReleaseSurfaceEvidence(
    [
      {
        label: "Roundtable runtime",
        path: "docs/wiki/Roundtable-Runtime.json",
        generatedAt: "2026-05-13T11:55:00.000Z",
        required: true,
        healthStatus: "unhealthy",
        healthReason: "benchmark reports 1 failed assertion(s)"
      },
      {
        label: "Optional public export",
        path: "docs/wiki/Optional-Public-Export.json",
        generatedAt: "2026-05-13T11:55:00.000Z",
        required: false,
        healthStatus: "unhealthy",
        healthReason: "publication status is blocked"
      }
    ],
    {
      nowMs: Date.parse("2026-05-13T12:00:00.000Z"),
      maxAgeMs: DEFAULT_RELEASE_SURFACE_MAX_AGE_MS
    }
  );

  assert.equal(evidence.status, "blocked");
  assert.equal(evidence.counts.unhealthy, 2);
  assert.equal(evidence.counts.blocking, 1);
  assert.equal(evidence.surfaces[0].status, "unhealthy");
  assert.equal(evidence.surfaces[0].blocking, true);
  assert.match(evidence.surfaces[0].reason, /failed assertion/u);
  assert.equal(evidence.surfaces[1].status, "unhealthy");
  assert.equal(evidence.surfaces[1].blocking, false);
});

test("release surface health honors actionable workflow health over noisy observed bot runs", () => {
  const health = inferSurfaceHealth({
    summary: {
      allObservedWorkflowRunsSuccessful: false,
      allActionableWorkflowRunsHealthy: true
    }
  });

  assert.equal(health.healthStatus, "healthy");
  assert.match(health.healthReason ?? "", /no failed receipt signals/u);
});

test("release surface health blocks non-green actionable workflow receipts", () => {
  const health = inferSurfaceHealth({
    summary: {
      allObservedWorkflowRunsSuccessful: false,
      allActionableWorkflowRunsHealthy: false
    }
  });

  assert.equal(health.healthStatus, "unhealthy");
  assert.match(health.healthReason ?? "", /actionable/u);
});

test("release surface health blocks receipts that explicitly report not ready", () => {
  const health = inferSurfaceHealth({
    ready: false,
    reasons: ["Q BridgeBench parse success is below threshold."]
  });

  assert.equal(health.healthStatus, "unhealthy");
  assert.match(health.healthReason ?? "", /ready=false/u);
});

test("release surface health keeps mission readiness fail-closed on missionSurfaceReady=false", () => {
  const health = inferSurfaceHealth(
    {
      readiness: {
        missionSurfaceReady: false
      }
    },
    { label: "Live mission readiness" }
  );

  assert.equal(health.healthStatus, "unhealthy");
  assert.match(health.healthReason ?? "", /missionSurfaceReady=false/u);
});

test("release surface health judges roundtable runtime by benchmark and local Q readiness", () => {
  const health = inferSurfaceHealth(
    {
      benchmark: {
        failedAssertions: 0
      },
      readiness: {
        missionSurfaceReady: false,
        q: {
          local: {
            ready: true
          }
        }
      }
    },
    { label: "Roundtable runtime" }
  );

  assert.equal(health.healthStatus, "healthy");
  assert.match(health.healthReason ?? "", /no failed receipt signals/u);
});

test("release surface health lets publishable operator activity stand apart from private mission readiness", () => {
  const health = inferSurfaceHealth(
    {
      publication: {
        status: "publishable"
      },
      readiness: {
        missionSurfaceReady: false
      }
    },
    { label: "Live operator activity" }
  );

  assert.equal(health.healthStatus, "healthy");
  assert.match(health.healthReason ?? "", /no failed receipt signals/u);
});

test("release surface health blocks model lanes with incomplete parse success", () => {
  const health = inferSurfaceHealth({
    models: [
      {
        truthfulLabel: "Q",
        taskCount: 4,
        parseSuccessCount: 0,
        parseSuccessRate: 0
      }
    ]
  });

  assert.equal(health.healthStatus, "unhealthy");
  assert.match(health.healthReason ?? "", /parse success/u);
});

test("release accountability markdown lists blockers before warnings", () => {
  const evidence = evaluateReleaseSurfaceEvidence(
    [
      {
        label: "Required stale",
        path: "docs/wiki/Required-Stale.json",
        generatedAt: "2026-04-01T00:00:00.000Z",
        required: true
      },
      {
        label: "Optional stale",
        path: "docs/wiki/Optional-Stale.json",
        generatedAt: "2026-04-01T00:00:00.000Z",
        required: false
      }
    ],
    {
      nowMs: Date.parse("2026-05-13T12:00:00.000Z"),
      maxAgeMs: DEFAULT_RELEASE_SURFACE_MAX_AGE_MS
    }
  );

  const lines = renderReleaseAccountabilityGapLines(evidence);

  assert.match(lines.join("\n"), /Blocking gaps/u);
  assert.match(lines.join("\n"), /Required stale/u);
  assert.match(lines.join("\n"), /Non-blocking warnings/u);
  assert.match(lines.join("\n"), /Optional stale/u);
});
