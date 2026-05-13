import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RELEASE_SURFACE_MAX_AGE_MS,
  evaluateReleaseSurfaceEvidence,
  renderReleaseAccountabilityGapLines,
  type SurfaceTimestamp
} from "./release-surface.js";

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
