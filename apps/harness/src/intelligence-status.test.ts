import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicIntelligenceStatus, type PublicIntelligenceStatusInput } from "./intelligence-status.js";

function baseInput(overrides: Partial<PublicIntelligenceStatusInput> = {}): PublicIntelligenceStatusInput {
  return {
    timestamp: "2026-05-01T18:30:00.000Z",
    snapshot: {
      intelligenceLayers: [{ id: "q-local", status: "ready" }],
      cognitiveExecutions: [
        { status: "completed", assignedWorkerProfile: "local" },
        { status: "failed", assignedWorkerProfile: "remote" }
      ],
      executionSchedules: [
        { shouldRunCognition: true, admissionState: "admit" },
        { shouldRunCognition: true, admissionState: "hold" }
      ]
    },
    workers: [
      {
        workerId: "worker-secret-id",
        workerLabel: "private worker",
        hostLabel: "private-host",
        executionEndpoint: "http://private-worker:8799",
        executionProfile: "local",
        registeredAt: "2026-05-01T18:29:00.000Z",
        heartbeatAt: "2026-05-01T18:29:59.000Z",
        leaseExpiresAt: "2026-05-01T18:30:59.000Z",
        leaseDurationMs: 60_000,
        watch: true,
        allowHostRisk: false,
        supportedBaseModels: ["*"],
        preferredLayerIds: ["q-local"],
        identityVerified: true,
        deviceAffinityTags: ["cpu"],
        healthStatus: "healthy",
        healthSummary: "healthy",
        healthReason: "lease healthy",
        lastHealthAt: "2026-05-01T18:30:00.000Z",
        leaseRemainingMs: 59_000,
        assignmentEligible: true
      }
    ],
    workerSummary: {
      workerCount: 1,
      healthyWorkerCount: 1,
      staleWorkerCount: 0,
      faultedWorkerCount: 0,
      eligibleWorkerCount: 1,
      blockedWorkerCount: 0
    },
    nodeSummary: {
      nodeCount: 1,
      healthyNodeCount: 1,
      staleNodeCount: 0,
      offlineNodeCount: 0,
      faultedNodeCount: 0
    },
    recommendedLayerId: "q-local",
    governance: {
      mode: "enforced",
      decisionCount: 4,
      deniedCount: 0
    },
    persistence: {
      recoveryMode: "snapshot",
      persistedEventCount: 128,
      integrityStatus: "verified",
      integrityFindingCount: 0
    },
    poi: {
      status: "pass"
    },
    workGovernor: {
      maxActiveWeight: 6,
      activeWeight: 0,
      queueDepth: 0,
      queuedWeight: 0,
      lanes: {
        benchmark: {
          maxActiveWeight: 3,
          activeWeight: 0,
          queueDepth: 0,
          queuedWeight: 0,
          maxQueueDepth: 4
        },
        cognitive: {
          maxActiveWeight: 5,
          activeWeight: 0,
          queueDepth: 0,
          queuedWeight: 0,
          maxQueueDepth: 8
        }
      }
    },
    ...overrides
  };
}

test("buildPublicIntelligenceStatus returns a redacted ready routing summary", () => {
  const status = buildPublicIntelligenceStatus(baseInput());

  assert.equal(status.status, "ready");
  assert.equal(status.visibility, "public-redacted");
  assert.equal(status.workerPlane.workerCount, 1);
  assert.equal(status.workerPlane.localWorkerCount, 1);
  assert.equal(status.executionPlane.failedExecutionCount, 1);
  assert.equal(status.executionPlane.heldScheduleCount, 1);

  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes("worker-secret-id"), false);
  assert.equal(serialized.includes("private worker"), false);
  assert.equal(serialized.includes("private-host"), false);
  assert.equal(serialized.includes("private-worker:8799"), false);
});

test("buildPublicIntelligenceStatus degrades when workers are missing or queued work exists", () => {
  const governor = baseInput().workGovernor;
  const status = buildPublicIntelligenceStatus(
    baseInput({
      workers: [],
      workerSummary: {
        workerCount: 0,
        healthyWorkerCount: 0,
        staleWorkerCount: 0,
        faultedWorkerCount: 0,
        eligibleWorkerCount: 0,
        blockedWorkerCount: 0
      },
      workGovernor: {
        ...governor,
        queueDepth: 2,
        queuedWeight: 2,
        lanes: {
          ...governor.lanes,
          cognitive: {
            ...governor.lanes.cognitive,
            queueDepth: 2,
            queuedWeight: 2
          }
        }
      }
    })
  );

  assert.equal(status.status, "degraded");
  assert.equal(status.workerPlane.readiness, "no_workers");
  assert.match(status.summary, /no intelligence workers/);
  assert.deepEqual(status.reasons.slice(0, 2), [
    "no intelligence workers are registered",
    "2 governed work items are queued"
  ]);
  assert.equal(status.governor.cognitiveQueueDepth, 2);
});

test("buildPublicIntelligenceStatus blocks when no ready layer or integrity is failing", () => {
  const input = baseInput();
  const status = buildPublicIntelligenceStatus(
    baseInput({
      snapshot: {
        ...input.snapshot,
        intelligenceLayers: [{ id: "q-local", status: "offline" }]
      },
      persistence: {
        ...input.persistence,
        integrityStatus: "invalid",
        integrityFindingCount: 3
      }
    })
  );

  assert.equal(status.status, "blocked");
  assert.equal(status.layerPlane.readyLayerCount, 0);
  assert.deepEqual(status.reasons.slice(0, 2), [
    "no ready intelligence layer is registered",
    "3 persistence integrity findings are active"
  ]);
});
