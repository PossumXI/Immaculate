import assert from "node:assert/strict";
import test from "node:test";
import type { HarnessReadinessSummary } from "./release-metadata.js";
import {
  buildPublicExportTruthBoundary,
  evaluatePublicExportSourceFreshness,
  resolvePublicExportPublication
} from "./live-operator-public-export.js";

function readiness(overrides?: Partial<HarnessReadinessSummary>): HarnessReadinessSummary {
  const readyLane = {
    status: "ready" as const,
    configured: true,
    ready: true,
    endpoint: "https://example.invalid",
    detail: "ready"
  };
  const summary: HarnessReadinessSummary = {
    ledger: {
      public: readyLane,
      private: readyLane
    },
    q: {
      local: readyLane,
      oci: readyLane
    },
    discord: {
      transport: readyLane
    },
    missionSurfaceReady: true,
    summary: "ready"
  };
  return {
    ...summary,
    ...overrides,
    ledger: {
      ...summary.ledger,
      ...overrides?.ledger
    },
    q: {
      ...summary.q,
      ...overrides?.q
    },
    discord: {
      ...summary.discord,
      ...overrides?.discord
    }
  };
}

test("public export source freshness detects stale and missing receipts", () => {
  const nowMs = Date.parse("2026-04-25T12:00:00Z");
  const freshness = evaluatePublicExportSourceFreshness(
    [
      {
        label: "fresh",
        path: "docs/wiki/fresh.json",
        generatedAt: "2026-04-25T11:30:00Z"
      },
      {
        label: "stale",
        path: "docs/wiki/stale.json",
        generatedAt: "2026-04-23T11:30:00Z"
      },
      {
        label: "missing",
        path: "docs/wiki/missing.json"
      }
    ],
    {
      nowMs,
      maxAgeMs: 24 * 60 * 60 * 1000
    }
  );

  assert.equal(freshness.allFresh, false);
  assert.equal(freshness.sources[0].status, "fresh");
  assert.equal(freshness.sources[1].status, "stale");
  assert.equal(freshness.sources[2].status, "missing");
  assert.match(freshness.summary, /2\/3 public-export source receipt\(s\)/u);
});

test("public export publication fails closed on stale source receipts", () => {
  const publication = resolvePublicExportPublication(
    {
      publication: {
        status: "publishable",
        summary: "operator receipt says publishable"
      }
    },
    readiness(),
    {
      maxAgeMs: 24 * 60 * 60 * 1000,
      allFresh: false,
      summary: "live operator activity stale",
      sources: []
    }
  );

  assert.equal(publication.status, "blocked");
  assert.match(publication.summary, /source\.freshness/u);
});

test("public export publication fails closed on blocked public lanes", () => {
  const publication = resolvePublicExportPublication(
    {
      publication: {
        status: "publishable",
        summary: "operator receipt says publishable"
      }
    },
    readiness({
      ledger: {
        public: {
          status: "blocked",
          configured: true,
          ready: false,
          endpoint: "https://arobi.aura-genesis.org",
          detail: "public ledger did not prove a fresh governed write"
        },
        private: {
          status: "ready",
          configured: true,
          ready: true,
          endpoint: "private",
          detail: "ready"
        }
      }
    }),
    {
      maxAgeMs: 24 * 60 * 60 * 1000,
      allFresh: true,
      summary: "fresh",
      sources: []
    }
  );

  assert.equal(publication.status, "blocked");
  assert.match(publication.summary, /ledger\.public/u);
});

test("public export publication opens only when operator, freshness, and public lanes are ready", () => {
  const publication = resolvePublicExportPublication(
    {
      publication: {
        status: "publishable",
        summary: "operator receipt says publishable"
      }
    },
    readiness(),
    {
      maxAgeMs: 24 * 60 * 60 * 1000,
      allFresh: true,
      summary: "fresh",
      sources: []
    }
  );

  assert.equal(publication.status, "publishable");
  assert.match(publication.summary, /publishable/u);
});

test("public export truth boundary describes the actual public ledger state", () => {
  assert.match(
    buildPublicExportTruthBoundary({ publicLedgerReady: true }).join("\n"),
    /ledger\.public has a fresh governed public Arobi write/u
  );
  assert.doesNotMatch(
    buildPublicExportTruthBoundary({ publicLedgerReady: true }).join("\n"),
    /ledger\.public remains blocked/u
  );
  assert.match(
    buildPublicExportTruthBoundary({ publicLedgerReady: false }).join("\n"),
    /ledger\.public remains blocked/u
  );
});
