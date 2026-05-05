import assert from "node:assert/strict";
import test from "node:test";
import type { PhaseSnapshot } from "@immaculate/core";
import { planExecutionArbitration } from "./arbitration.js";
import {
  deriveProtectionPosture,
  projectProtectionPostureForQ
} from "./protection-intelligence.js";
import { planAdaptiveRoute } from "./routing.js";

const now = "2026-05-05T12:00:00.000Z";

function createSnapshot(): PhaseSnapshot {
  return {
    epoch: 1,
    cycle: 1,
    timestamp: now,
    status: "running",
    profile: "test",
    intent: "test",
    objective: "protective routing test",
    nodes: [],
    edges: [],
    passes: [],
    metrics: {
      reflexLatencyMs: 0,
      cognitiveLatencyMs: 0,
      offlineUtilization: 0,
      propagationRate: 0,
      graphHealth: 1,
      coherence: 0,
      predictionError: 0,
      freeEnergyProxy: 0,
      throughput: 0,
      activeAgents: 0
    },
    highlightedNodeId: "router-core",
    datasets: [],
    neuroSessions: [],
    neuroReplays: [],
    neuroFrames: [
      {
        id: "frame-1",
        replayId: "replay-1",
        sessionId: "session-1",
        source: "live-socket",
        windowIndex: 0,
        sampleStart: 0,
        sampleEnd: 1,
        streamCount: 1,
        channelCount: 1,
        dominantKind: "timeseries",
        dominantRateHz: 256,
        meanAbs: 0.2,
        rms: 0.2,
        peak: 0.2,
        syncJitterMs: 1,
        decodeReady: true,
        decodeConfidence: 0.93,
        bandPower: {
          delta: 0.1,
          theta: 0.1,
          alpha: 0.1,
          beta: 0.8,
          gamma: 0.3,
          artifactPower: 0.02,
          totalPower: 1.32,
          dominantBand: "beta",
          dominantRatio: 0.82
        },
        capturedAt: now
      }
    ],
    neuralCoupling: {
      dominantBand: "beta",
      dominantRatio: 0.82,
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
      decodeConfidence: 0.93,
      decodeReadyRatio: 1,
      sourceFrameId: "frame-1",
      updatedAt: now
    },
    intelligenceLayers: [
      {
        id: "q-guard",
        name: "Q Guard",
        backend: "ollama",
        model: "Q",
        role: "guard",
        status: "ready",
        endpoint: "local",
        registeredAt: now
      }
    ],
    cognitiveExecutions: [],
    agentIntelligenceAssessments: [],
    conversations: [],
    executionArbitrations: [],
    executionSchedules: [],
    routingDecisions: [],
    actuationOutputs: [],
    sessionConversationSummary: {
      conversationCount: 0,
      blockedVerdictCount: 0,
      approvedVerdictCount: 0,
      recentRouteHints: [],
      recentCommits: []
    },
    logTail: []
  };
}

const governanceStatus = {
  mode: "enforced" as const,
  policyCount: 1,
  decisionCount: 0,
  deniedCount: 0
};

const adapters = [
  {
    id: "haptic-adapter",
    label: "Haptic",
    kind: "haptic-file" as const,
    channel: "haptic" as const,
    protocolId: "immaculate.haptic.rig.v1" as const,
    protocolLabel: "Haptic",
    deviceClass: "haptic",
    maxIntensity: 1,
    requiresSession: false,
    description: "test",
    deliveryCount: 0,
    minDispatchIntervalMs: 0,
    bridgeConnected: false,
    bridgeReady: false,
    bridgeCapabilities: [],
    lateAckCount: 0
  }
];

const transports = [
  {
    id: "haptic-transport",
    kind: "udp-osc" as const,
    label: "Haptic UDP",
    adapterId: "haptic-adapter",
    protocolId: "immaculate.haptic.rig.v1" as const,
    endpoint: "127.0.0.1:9000",
    enabled: true,
    deliveryCount: 0,
    heartbeatRequired: false,
    heartbeatIntervalMs: 1000,
    heartbeatTimeoutMs: 2000,
    health: "healthy" as const,
    capabilityHealth: [],
    failureCount: 0,
    consecutiveFailures: 0,
    isolationActive: false,
    preferenceScore: 1,
    preferenceRank: 0
  }
];

test("protection posture derives pressure from defensive governance and guard signals", () => {
  const posture = deriveProtectionPosture({
    now: new Date(now),
    governanceDecisions: [
      {
        id: "gov-1",
        timestamp: now,
        allowed: false,
        mode: "enforced",
        action: "actuation-dispatch",
        riskTier: 5,
        riskClass: "irreversible_or_regulated",
        route: "/api/actuation/dispatch?token=secret-token",
        policyId: "actuation-dispatch-default",
        purpose: ["actuation-dispatch"],
        consentScope: "system:actuation",
        actor: "operator:test",
        reason: "consent_scope_not_allowed Bearer abcdefghijklmnop C:\\Users\\Knight\\secret.txt"
      }
    ],
    conversations: [
      {
        id: "conversation-1",
        mode: "multi-turn",
        status: "blocked",
        executionTopology: "sequential",
        parallelWidth: 1,
        roles: ["guard"],
        turnCount: 2,
        guardVerdict: "blocked",
        summary: "Guard blocked outbound action to https://example.com/private",
        startedAt: now,
        completedAt: now,
        turns: []
      }
    ]
  });
  const qSummary = projectProtectionPostureForQ(posture);

  assert.equal(posture.pressure, "critical");
  assert.equal(qSummary.requiredAction, "suppress-outward-action");
  assert.doesNotMatch(JSON.stringify(posture), /Bearer abcdefghijklmnop/);
  assert.doesNotMatch(JSON.stringify(posture), /C:\\Users\\Knight\\secret/);
  assert.doesNotMatch(JSON.stringify(posture), /https:\/\/example\.com\/private/);
});

test("critical protection pressure forces route planning onto a guarded lane", () => {
  const plan = planAdaptiveRoute({
    snapshot: createSnapshot(),
    adapters,
    transports,
    governanceStatus,
    governanceDecisions: [],
    protectionPressure: "critical"
  });

  assert.equal(plan.mode, "guarded-fallback");
  assert.equal(plan.channel, "visual");
  assert.match(plan.rationale, /protection=critical/);
});

test("elevated protection pressure prevents reflex-local arbitration", () => {
  const plan = planExecutionArbitration({
    snapshot: createSnapshot(),
    governanceStatus,
    governanceDecisions: [],
    protectionPressure: "elevated"
  });

  assert.notEqual(plan.mode, "reflex-local");
  assert.equal(plan.shouldRunCognition, true);
  assert.match(plan.rationale, /protection=elevated/);
});
