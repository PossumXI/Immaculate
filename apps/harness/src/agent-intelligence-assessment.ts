import type {
  AgentIntelligenceAssessment,
  AgentIntelligenceAssessmentGrade,
  AgentIntelligenceAssessmentTrigger,
  AgentIntelligenceAssessmentVerdict,
  CognitiveExecution,
  EventEnvelope,
  IntelligenceLayer,
  MultiAgentConversation,
  PhaseSnapshot
} from "@immaculate/core";
import { sha256Hash, sha256Json } from "./utils.js";

type BenchmarkSignal = {
  latestScore?: number;
  failedAssertions?: number;
  suiteId?: string;
};

export type AgentIntelligenceAssessmentInput = {
  snapshot: PhaseSnapshot;
  events?: EventEnvelope[];
  trigger: AgentIntelligenceAssessmentTrigger;
  targetLayerId?: string;
  assessedAt?: string;
  benchmarkSignal?: BenchmarkSignal;
  ledgerEventHash?: string;
};

export type AgentIntelligenceAssessmentSummary = {
  baselineVersion: "poi-v1";
  assessmentCount: number;
  latest?: AgentIntelligenceAssessment;
  averageScore: number;
  passCount: number;
  watchCount: number;
  failCount: number;
  degradedAgentIds: string[];
  updatedAt?: string;
};

const SCORE_WEIGHTS: Record<keyof AgentIntelligenceAssessment["scorecard"], number> = {
  reasoning: 0.18,
  contract: 0.2,
  governance: 0.16,
  routing: 0.12,
  runtime: 0.12,
  benchmark: 0.12,
  neuro: 0.1
};

function clampScore(value: number, fallback = 0.5): number {
  const candidate = Number.isFinite(value) ? value : fallback;
  return Number(Math.min(1, Math.max(0, candidate)).toFixed(4));
}

function average(values: number[], fallback = 0.5): number {
  if (values.length === 0) {
    return fallback;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestExecutionForLayer(
  snapshot: PhaseSnapshot,
  targetLayerId?: string
): CognitiveExecution | undefined {
  if (targetLayerId) {
    return snapshot.cognitiveExecutions.find((execution) => execution.layerId === targetLayerId);
  }
  return snapshot.cognitiveExecutions[0];
}

function resolveSubjectLayer(
  snapshot: PhaseSnapshot,
  targetLayerId?: string
): { layer?: IntelligenceLayer; subjectAgentId: string; subjectModel?: string } {
  const latestExecution = latestExecutionForLayer(snapshot, targetLayerId);
  const layer =
    (targetLayerId
      ? snapshot.intelligenceLayers.find((candidate) => candidate.id === targetLayerId)
      : undefined) ??
    (latestExecution
      ? snapshot.intelligenceLayers.find((candidate) => candidate.id === latestExecution.layerId)
      : undefined) ??
    snapshot.intelligenceLayers.find((candidate) => candidate.status !== "offline") ??
    snapshot.intelligenceLayers[0];

  return {
    layer,
    subjectAgentId: layer?.id ?? latestExecution?.layerId ?? "planner-swarm",
    subjectModel: layer?.model ?? latestExecution?.model
  };
}

function layerExecutions(snapshot: PhaseSnapshot, layerId: string): CognitiveExecution[] {
  return snapshot.cognitiveExecutions
    .filter((execution) => execution.layerId === layerId)
    .slice(0, 12);
}

function layerConversations(
  snapshot: PhaseSnapshot,
  layerId: string
): MultiAgentConversation[] {
  return snapshot.conversations
    .filter((conversation) => conversation.turns.some((turn) => turn.layerId === layerId))
    .slice(0, 8);
}

function reasoningScore(executions: CognitiveExecution[]): number {
  if (executions.length === 0) {
    return 0.5;
  }
  const completedRatio =
    executions.filter((execution) => execution.status === "completed").length / executions.length;
  const summaryRatio =
    executions.filter((execution) => Boolean(execution.reasonSummary?.trim())).length /
    executions.length;
  return clampScore(completedRatio * 0.65 + summaryRatio * 0.35);
}

function contractScore(executions: CognitiveExecution[]): number {
  const completed = executions.filter((execution) => execution.status === "completed");
  if (completed.length === 0) {
    return executions.length === 0 ? 0.5 : 0.15;
  }
  const validContractCount = completed.filter(
    (execution) =>
      Boolean(execution.routeSuggestion?.trim()) &&
      Boolean(execution.reasonSummary?.trim()) &&
      Boolean(execution.commitStatement?.trim())
  ).length;
  return clampScore(validContractCount / completed.length);
}

function governanceScore(
  executions: CognitiveExecution[],
  conversations: MultiAgentConversation[]
): number {
  const blockedExecutions = executions.filter(
    (execution) => execution.guardVerdict === "blocked"
  ).length;
  const blockedConversations = conversations.filter(
    (conversation) => conversation.guardVerdict === "blocked"
  ).length;
  const criticalPressure = executions.filter(
    (execution) => execution.governancePressure === "critical"
  ).length;
  const elevatedPressure = executions.filter(
    (execution) => execution.governancePressure === "elevated"
  ).length;
  const total = Math.max(1, executions.length + conversations.length);
  return clampScore(
    1 -
      blockedExecutions / total * 0.45 -
      blockedConversations / total * 0.35 -
      criticalPressure / Math.max(1, executions.length) * 0.35 -
      elevatedPressure / Math.max(1, executions.length) * 0.14
  );
}

function routingScore(snapshot: PhaseSnapshot, layerId: string, executions: CognitiveExecution[]): number {
  const scheduleSignals = snapshot.executionSchedules
    .filter((schedule) => schedule.layerIds.includes(layerId))
    .slice(0, 8);
  const admittedRatio =
    scheduleSignals.length === 0
      ? 0.5
      : scheduleSignals.filter((schedule) => schedule.admissionState !== "hold").length /
        scheduleSignals.length;
  const routeContractRatio =
    executions.length === 0
      ? 0.5
      : executions.filter((execution) => Boolean(execution.routeSuggestion?.trim())).length /
        executions.length;
  return clampScore(admittedRatio * 0.45 + routeContractRatio * 0.55);
}

function runtimeScore(executions: CognitiveExecution[]): number {
  if (executions.length === 0) {
    return 0.5;
  }
  const latencyScore = 1 - average(executions.map((execution) => execution.latencyMs), 2500) / 10_000;
  const faultRatio =
    executions.filter((execution) => execution.status === "failed").length / executions.length;
  return clampScore(latencyScore * 0.72 + (1 - faultRatio) * 0.28);
}

function benchmarkScore(signal?: BenchmarkSignal): number {
  const base = clampScore(signal?.latestScore ?? 0.5);
  const failurePenalty = Math.min(0.35, (signal?.failedAssertions ?? 0) * 0.05);
  return clampScore(base - failurePenalty);
}

function neuroScore(snapshot: PhaseSnapshot): number {
  return clampScore(
    snapshot.neuralCoupling.decodeConfidence * 0.55 +
      snapshot.neuralCoupling.signalQuality * 0.35 +
      snapshot.neuralCoupling.decodeReadyRatio * 0.1
  );
}

function weightedOverall(scorecard: AgentIntelligenceAssessment["scorecard"]): number {
  const total = Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + scorecard[key as keyof typeof SCORE_WEIGHTS] * weight;
  }, 0);
  return clampScore(total);
}

function gradeFor(score: number): AgentIntelligenceAssessmentGrade {
  if (score >= 0.92) {
    return "S";
  }
  if (score >= 0.82) {
    return "A";
  }
  if (score >= 0.68) {
    return "B";
  }
  if (score >= 0.52) {
    return "C";
  }
  return "D";
}

function driftFlagsFor(options: {
  scorecard: AgentIntelligenceAssessment["scorecard"];
  executions: CognitiveExecution[];
  conversations: MultiAgentConversation[];
  benchmarkSignal?: BenchmarkSignal;
}): string[] {
  const flags: string[] = [];
  if (options.executions.some((execution) => execution.status === "failed")) {
    flags.push("failed_recent_execution");
  }
  if (
    options.executions.some((execution) => execution.guardVerdict === "blocked") ||
    options.conversations.some((conversation) => conversation.guardVerdict === "blocked")
  ) {
    flags.push("guard_blocked");
  }
  if (options.executions.some((execution) => execution.governancePressure === "critical")) {
    flags.push("critical_governance_pressure");
  }
  if (options.scorecard.contract < 0.6) {
    flags.push("contract_coverage_low");
  }
  if (options.scorecard.runtime < 0.55) {
    flags.push("runtime_slow_or_faulted");
  }
  if ((options.benchmarkSignal?.failedAssertions ?? 0) > 0) {
    flags.push("benchmark_failures");
  }
  if (options.scorecard.neuro < 0.45) {
    flags.push("low_neuro_signal");
  }
  return [...new Set(flags)];
}

function verdictFor(score: number, driftFlags: string[]): AgentIntelligenceAssessmentVerdict {
  if (
    score >= 0.72 &&
    !driftFlags.includes("critical_governance_pressure") &&
    !driftFlags.includes("guard_blocked")
  ) {
    return "pass";
  }
  if (score >= 0.52) {
    return "watch";
  }
  return "fail";
}

export function assessAgentIntelligence(
  input: AgentIntelligenceAssessmentInput
): AgentIntelligenceAssessment {
  const assessedAt = input.assessedAt ?? new Date().toISOString();
  const { layer, subjectAgentId, subjectModel } = resolveSubjectLayer(
    input.snapshot,
    input.targetLayerId
  );
  const executions = layerExecutions(input.snapshot, subjectAgentId);
  const conversations = layerConversations(input.snapshot, subjectAgentId);
  const scorecard = {
    reasoning: reasoningScore(executions),
    contract: contractScore(executions),
    governance: governanceScore(executions, conversations),
    routing: routingScore(input.snapshot, subjectAgentId, executions),
    runtime: runtimeScore(executions),
    benchmark: benchmarkScore(input.benchmarkSignal),
    neuro: neuroScore(input.snapshot)
  };
  const overallScore = weightedOverall(scorecard);
  const driftFlags = driftFlagsFor({
    scorecard,
    executions,
    conversations,
    benchmarkSignal: input.benchmarkSignal
  });
  const grade = gradeFor(overallScore);
  const verdict = verdictFor(overallScore, driftFlags);
  const evidenceIds = [
    layer?.id,
    ...executions.map((execution) => execution.id),
    ...conversations.map((conversation) => conversation.id),
    ...input.snapshot.executionSchedules
      .filter((schedule) => schedule.layerIds.includes(subjectAgentId))
      .slice(0, 4)
      .map((schedule) => schedule.id),
    input.benchmarkSignal?.suiteId,
    input.snapshot.lastEventId,
    input.events?.[0]?.eventId
  ].filter((entry): entry is string => Boolean(entry));
  const evidenceDigest = sha256Json({
    subjectAgentId,
    trigger: input.trigger,
    executions: executions.map((execution) => ({
      id: execution.id,
      status: execution.status,
      guardVerdict: execution.guardVerdict,
      governancePressure: execution.governancePressure,
      latencyMs: execution.latencyMs,
      contract: [
        execution.routeSuggestion,
        execution.reasonSummary,
        execution.commitStatement
      ].filter(Boolean).length
    })),
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      guardVerdict: conversation.guardVerdict,
      turnCount: conversation.turnCount
    })),
    benchmark: input.benchmarkSignal,
    neuralCoupling: input.snapshot.neuralCoupling,
    eventHead: input.events?.[0]?.integrity.hash
  });
  const id = `poi-${sha256Hash(`${subjectAgentId}:${input.trigger}:${assessedAt}:${evidenceDigest}`).slice(0, 18)}`;

  return {
    id,
    subjectAgentId,
    subjectLayerId: layer?.id,
    subjectModel,
    trigger: input.trigger,
    verdict,
    grade,
    overallScore,
    scorecard,
    evidenceIds: [...new Set(evidenceIds)].slice(0, 24),
    evidenceDigest,
    driftFlags,
    baselineVersion: "poi-v1",
    ledgerEventHash: input.ledgerEventHash,
    summary: `PoI assessment graded ${subjectAgentId} ${grade} at ${Math.round(overallScore * 100)}% from ${executions.length} execution(s), ${conversations.length} conversation(s), and ${driftFlags.length} drift flag(s).`,
    assessedAt
  };
}

export function summarizeAgentIntelligenceAssessments(
  assessments: AgentIntelligenceAssessment[]
): AgentIntelligenceAssessmentSummary {
  const latest = assessments[0];
  const averageScore = clampScore(
    average(assessments.map((assessment) => assessment.overallScore), 0),
    0
  );
  return {
    baselineVersion: "poi-v1",
    assessmentCount: assessments.length,
    latest,
    averageScore,
    passCount: assessments.filter((assessment) => assessment.verdict === "pass").length,
    watchCount: assessments.filter((assessment) => assessment.verdict === "watch").length,
    failCount: assessments.filter((assessment) => assessment.verdict === "fail").length,
    degradedAgentIds: assessments
      .filter((assessment) => assessment.verdict !== "pass")
      .map((assessment) => assessment.subjectAgentId)
      .filter((value, index, all) => all.indexOf(value) === index),
    updatedAt: latest?.assessedAt
  };
}
