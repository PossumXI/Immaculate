import assert from "node:assert/strict";
import test from "node:test";
import type { PhaseSnapshot } from "@immaculate/core";
import {
  assessAgentIntelligence,
  summarizeAgentIntelligenceAssessments
} from "./agent-intelligence-assessment.js";

function buildSnapshot(overrides: Partial<PhaseSnapshot> = {}): PhaseSnapshot {
  return {
    intelligenceLayers: [
      {
        id: "q-reasoner",
        name: "Q Reasoner",
        backend: "ollama",
        model: "Q",
        role: "reasoner",
        status: "ready",
        endpoint: "http://127.0.0.1:11434",
        registeredAt: "2026-05-01T00:00:00.000Z"
      }
    ],
    cognitiveExecutions: [
      {
        id: "exec-2",
        layerId: "q-reasoner",
        model: "Q",
        objective: "route a bounded inference request",
        status: "completed",
        latencyMs: 480,
        startedAt: "2026-05-01T00:00:01.000Z",
        completedAt: "2026-05-01T00:00:01.480Z",
        promptDigest: "prompt-2",
        responsePreview: "ROUTE: guarded. REASON: bounded. COMMIT: audit.",
        routeSuggestion: "guarded",
        reasonSummary: "Bounded inference must stay separate from private control.",
        commitStatement: "Keep the route audited and rate-limited.",
        guardVerdict: "approved",
        governancePressure: "clear"
      },
      {
        id: "exec-1",
        layerId: "q-reasoner",
        model: "Q",
        objective: "explain the current route",
        status: "completed",
        latencyMs: 520,
        startedAt: "2026-05-01T00:00:00.000Z",
        completedAt: "2026-05-01T00:00:00.520Z",
        promptDigest: "prompt-1",
        responsePreview: "ROUTE: cognitive. REASON: ready. COMMIT: proceed.",
        routeSuggestion: "cognitive",
        reasonSummary: "The agent has enough context to reason.",
        commitStatement: "Proceed under the harness policy.",
        guardVerdict: "approved",
        governancePressure: "clear"
      }
    ],
    conversations: [
      {
        id: "conv-1",
        mode: "multi-turn",
        status: "completed",
        executionTopology: "parallel",
        parallelWidth: 2,
        roles: ["reasoner"],
        turnCount: 1,
        guardVerdict: "approved",
        summary: "Q produced a bounded route.",
        startedAt: "2026-05-01T00:00:00.000Z",
        completedAt: "2026-05-01T00:00:01.480Z",
        turns: [
          {
            id: "turn-1",
            layerId: "q-reasoner",
            role: "reasoner",
            model: "Q",
            status: "completed",
            objective: "route a bounded inference request",
            responsePreview: "ROUTE: guarded. REASON: bounded. COMMIT: audit.",
            routeSuggestion: "guarded",
            reasonSummary: "Bounded inference must stay separate from private control.",
            commitStatement: "Keep the route audited and rate-limited.",
            guardVerdict: "approved",
            latencyMs: 480,
            startedAt: "2026-05-01T00:00:01.000Z",
            completedAt: "2026-05-01T00:00:01.480Z"
          }
        ]
      }
    ],
    executionSchedules: [
      {
        id: "schedule-1",
        source: "cognitive",
        mode: "single-layer",
        executionTopology: "sequential",
        parallelWidth: 1,
        layerIds: ["q-reasoner"],
        layerRoles: ["reasoner"],
        shouldRunCognition: true,
        shouldDispatchActuation: false,
        decodeConfidence: 0.92,
        governancePressure: "clear",
        estimatedLatencyMs: 500,
        estimatedCost: 0,
        objective: "route a bounded inference request",
        rationale: "Q is healthy and admitted.",
        selectedAt: "2026-05-01T00:00:00.000Z",
        admissionState: "admit"
      }
    ],
    neuralCoupling: {
      dominantBand: "alpha",
      dominantRatio: 0.7,
      artifactRatio: 0.02,
      signalQuality: 0.9,
      phaseBias: {
        ingest: 0,
        synchronize: 0,
        decode: 0,
        route: 0,
        reason: 0,
        commit: 0,
        verify: 0,
        feedback: 0,
        optimize: 0
      },
      decodeConfidence: 0.9,
      decodeReadyRatio: 1,
      updatedAt: "2026-05-01T00:00:01.480Z"
    },
    lastEventId: "evt-1",
    ...overrides
  } as unknown as PhaseSnapshot;
}

test("PoI assessment grades a healthy inference agent against the v1 baseline", () => {
  const assessment = assessAgentIntelligence({
    snapshot: buildSnapshot(),
    trigger: "cognitive-execution",
    targetLayerId: "q-reasoner",
    assessedAt: "2026-05-01T00:00:02.000Z",
    benchmarkSignal: {
      latestScore: 0.95,
      suiteId: "bridgebench-smoke"
    }
  });

  assert.equal(assessment.subjectAgentId, "q-reasoner");
  assert.equal(assessment.baselineVersion, "poi-v1");
  assert.equal(assessment.verdict, "pass");
  assert.ok(["S", "A"].includes(assessment.grade));
  assert.equal(assessment.driftFlags.length, 0);
  assert.ok(assessment.overallScore >= 0.9);
  assert.ok(assessment.evidenceIds.includes("exec-2"));
  assert.match(assessment.summary, /2 execution\(s\)/);
});

test("PoI assessment flags incomplete contracts and failed executions", () => {
  const snapshot = buildSnapshot({
    cognitiveExecutions: [
      {
        id: "exec-failed",
        layerId: "q-reasoner",
        model: "Q",
        objective: "unsafe public/private route",
        status: "failed",
        latencyMs: 12_000,
        startedAt: "2026-05-01T00:00:01.000Z",
        completedAt: "2026-05-01T00:00:13.000Z",
        promptDigest: "prompt-failed",
        responsePreview: "timeout",
        governancePressure: "critical"
      }
    ]
  });

  const assessment = assessAgentIntelligence({
    snapshot,
    trigger: "manual",
    targetLayerId: "q-reasoner",
    assessedAt: "2026-05-01T00:00:14.000Z",
    benchmarkSignal: {
      latestScore: 0.4,
      failedAssertions: 2,
      suiteId: "bridgebench-smoke"
    }
  });

  assert.equal(assessment.verdict, "fail");
  assert.equal(assessment.grade, "D");
  assert.ok(assessment.driftFlags.includes("failed_recent_execution"));
  assert.ok(assessment.driftFlags.includes("critical_governance_pressure"));
  assert.ok(assessment.driftFlags.includes("contract_coverage_low"));
});

test("PoI summary exposes current degraded-agent posture", () => {
  const pass = assessAgentIntelligence({
    snapshot: buildSnapshot(),
    trigger: "cognitive-execution",
    targetLayerId: "q-reasoner",
    assessedAt: "2026-05-01T00:00:02.000Z",
    benchmarkSignal: {
      latestScore: 0.95
    }
  });
  const fail = {
    ...pass,
    id: "poi-fail",
    verdict: "fail" as const,
    grade: "D" as const,
    overallScore: 0.3,
    driftFlags: ["failed_recent_execution"],
    assessedAt: "2026-05-01T00:00:03.000Z"
  };

  const summary = summarizeAgentIntelligenceAssessments([fail, pass]);

  assert.equal(summary.assessmentCount, 2);
  assert.equal(summary.latest?.id, "poi-fail");
  assert.equal(summary.failCount, 1);
  assert.deepEqual(summary.degradedAgentIds, ["q-reasoner"]);
});
