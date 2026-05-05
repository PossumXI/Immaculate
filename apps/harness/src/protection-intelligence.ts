import type {
  CognitiveExecution,
  GovernancePressureLevel,
  MultiAgentConversation,
  RoutingDecision
} from "@immaculate/core";
import type { GovernanceDecision } from "./governance.js";
import { hashValue } from "./utils.js";

export type ProtectionPressure = GovernancePressureLevel;

export type ProtectionSignalKind =
  | "governance-denial"
  | "guard-block"
  | "execution-failure"
  | "route-hold";

export type ProtectionSeverity = "watch" | "elevated" | "critical";

export type ProtectionSignal = {
  id: string;
  kind: ProtectionSignalKind;
  severity: ProtectionSeverity;
  reasonClass: string;
  sourceId: string;
  observedAt: string;
  confidence: number;
  evidenceCount: number;
  summary: string;
};

export type ProtectionPosture = {
  generatedAt: string;
  pressure: ProtectionPressure;
  signalCount: number;
  highSeverityCount: number;
  criticalCount: number;
  newestReasonClass?: string;
  requiredAction: "observe" | "guarded-review" | "suppress-outward-action";
  signals: ProtectionSignal[];
};

export type ProtectionPostureSummary = {
  pressure: ProtectionPressure;
  signalCount: number;
  highSeverityCount: number;
  criticalCount: number;
  newestReasonClass?: string;
  requiredAction: ProtectionPosture["requiredAction"];
  summaryLine: string;
};

export type ProtectionPostureInput = {
  governanceDecisions?: readonly GovernanceDecision[];
  conversations?: readonly MultiAgentConversation[];
  executions?: readonly CognitiveExecution[];
  routingDecisions?: readonly RoutingDecision[];
  now?: Date;
  limit?: number;
};

const SIGNAL_LIMIT = 24;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function parseTime(value: string | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function redactSignalText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*[A-Za-z0-9._~+/=-]{6,}/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z]:\\(?:[^\\\s]+\\)+[^\\\s]+/g, "[redacted-path]")
    .replace(/\bhttps?:\/\/[^\s)]+/gi, "[redacted-url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function buildSignalId(input: {
  kind: ProtectionSignalKind;
  sourceId: string;
  reasonClass: string;
  observedAt: string;
}): string {
  return `protection-${hashValue(`${input.kind}:${input.sourceId}:${input.reasonClass}:${input.observedAt}`)}`;
}

function createSignal(input: Omit<ProtectionSignal, "id" | "summary"> & { summary: string }): ProtectionSignal {
  const summary = redactSignalText(input.summary);
  const reasonClass = redactSignalText(input.reasonClass);
  return {
    ...input,
    reasonClass,
    id: buildSignalId(input),
    summary
  };
}

function governanceDenialSeverity(decision: GovernanceDecision): ProtectionSeverity {
  if (
    (decision.riskTier ?? 0) >= 4 ||
    decision.action === "actuation-dispatch" ||
    decision.reason === "governance_rate_limited"
  ) {
    return "critical";
  }
  if (
    decision.reason.includes("consent") ||
    decision.reason.includes("purpose") ||
    decision.reason.includes("rate")
  ) {
    return "elevated";
  }
  return "watch";
}

function deriveGovernanceSignals(decisions: readonly GovernanceDecision[]): ProtectionSignal[] {
  return decisions
    .filter((decision) => !decision.allowed)
    .map((decision) => {
      const severity = governanceDenialSeverity(decision);
      return createSignal({
        kind: "governance-denial",
        severity,
        reasonClass: decision.reason,
        sourceId: decision.id,
        observedAt: decision.timestamp,
        confidence: severity === "critical" ? 0.96 : severity === "elevated" ? 0.82 : 0.64,
        evidenceCount: 1,
        summary: `Governance denied ${decision.action} on ${decision.route}: ${decision.reason}`
      });
    });
}

function deriveConversationSignals(conversations: readonly MultiAgentConversation[]): ProtectionSignal[] {
  return conversations
    .filter((conversation) => conversation.guardVerdict === "blocked" || conversation.status === "blocked")
    .map((conversation) =>
      createSignal({
        kind: "guard-block",
        severity: conversation.guardVerdict === "blocked" ? "elevated" : "watch",
        reasonClass: "guard_verdict_blocked",
        sourceId: conversation.id,
        observedAt: conversation.completedAt,
        confidence: 0.88,
        evidenceCount: Math.max(1, conversation.turnCount),
        summary: conversation.summary || "Guard verdict blocked a multi-agent conversation."
      })
    );
}

function deriveExecutionSignals(executions: readonly CognitiveExecution[]): ProtectionSignal[] {
  return executions
    .filter((execution) => execution.status === "failed" || execution.guardVerdict === "blocked")
    .map((execution) =>
      createSignal({
        kind: execution.guardVerdict === "blocked" ? "guard-block" : "execution-failure",
        severity: execution.guardVerdict === "blocked" ? "elevated" : "watch",
        reasonClass: execution.guardVerdict === "blocked" ? "guard_verdict_blocked" : "execution_failed",
        sourceId: execution.id,
        observedAt: execution.completedAt,
        confidence: execution.guardVerdict === "blocked" ? 0.88 : 0.62,
        evidenceCount: 1,
        summary: execution.reasonSummary || execution.responsePreview || "Cognitive execution failed."
      })
    );
}

function deriveRoutingSignals(decisions: readonly RoutingDecision[]): ProtectionSignal[] {
  return decisions
    .filter((decision) => decision.mode === "suppressed" || decision.mode === "guarded-fallback")
    .map((decision) =>
      createSignal({
        kind: "route-hold",
        severity: decision.mode === "suppressed" ? "elevated" : "watch",
        reasonClass: decision.mode === "suppressed" ? "route_suppressed" : "route_guarded",
        sourceId: decision.id,
        observedAt: decision.selectedAt,
        confidence: decision.mode === "suppressed" ? 0.82 : 0.58,
        evidenceCount: 1,
        summary: decision.rationale
      })
    );
}

export function mergeProtectionPressure(
  left: ProtectionPressure,
  right: ProtectionPressure
): ProtectionPressure {
  if (left === "critical" || right === "critical") {
    return "critical";
  }
  if (left === "elevated" || right === "elevated") {
    return "elevated";
  }
  return "clear";
}

export function deriveProtectionPressure(
  signals: readonly ProtectionSignal[]
): ProtectionPressure {
  const criticalCount = signals.filter((signal) => signal.severity === "critical").length;
  const elevatedCount = signals.filter((signal) => signal.severity === "elevated").length;
  const highConfidenceBlockCount = signals.filter(
    (signal) => signal.kind === "guard-block" && signal.confidence >= 0.8
  ).length;

  if (criticalCount > 0 || highConfidenceBlockCount >= 2) {
    return "critical";
  }
  if (elevatedCount > 0 || signals.length >= 3) {
    return "elevated";
  }
  return "clear";
}

export function deriveProtectionPosture(
  input: ProtectionPostureInput
): ProtectionPosture {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const signals = [
    ...deriveGovernanceSignals(input.governanceDecisions ?? []),
    ...deriveConversationSignals(input.conversations ?? []),
    ...deriveExecutionSignals(input.executions ?? []),
    ...deriveRoutingSignals(input.routingDecisions ?? [])
  ]
    .sort((left, right) => parseTime(right.observedAt) - parseTime(left.observedAt))
    .slice(0, input.limit ?? SIGNAL_LIMIT);
  const pressure = deriveProtectionPressure(signals);
  const highSeverityCount = signals.filter((signal) => signal.severity !== "watch").length;
  const criticalCount = signals.filter((signal) => signal.severity === "critical").length;
  return {
    generatedAt,
    pressure,
    signalCount: signals.length,
    highSeverityCount,
    criticalCount,
    newestReasonClass: signals[0]?.reasonClass,
    requiredAction:
      pressure === "critical"
        ? "suppress-outward-action"
        : pressure === "elevated"
          ? "guarded-review"
          : "observe",
    signals
  };
}

export function projectProtectionPostureForQ(
  posture: ProtectionPosture
): ProtectionPostureSummary {
  const newestReasonClass = posture.newestReasonClass
    ? redactSignalText(posture.newestReasonClass)
    : undefined;
  return {
    pressure: posture.pressure,
    signalCount: posture.signalCount,
    highSeverityCount: posture.highSeverityCount,
    criticalCount: posture.criticalCount,
    newestReasonClass,
    requiredAction: posture.requiredAction,
    summaryLine: [
      `protection=${posture.pressure}`,
      `signals=${posture.signalCount}`,
      `high=${posture.highSeverityCount}`,
      `critical=${posture.criticalCount}`,
      `action=${posture.requiredAction}`,
      newestReasonClass ? `newest=${newestReasonClass}` : undefined
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join(" / ")
  };
}
