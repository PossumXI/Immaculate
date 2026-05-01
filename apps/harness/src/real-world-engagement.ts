import type { GovernanceAction } from "./governance.js";
import { getGovernedToolAction, type ToolRiskTier } from "./tool-governance.js";

export type RealWorldEngagementMode =
  | "observe-only"
  | "internal-write"
  | "public-publication"
  | "privileged-control"
  | "physical-actuation";

export type RealWorldEngagementEvidence = {
  consentScope?: string;
  purpose?: string[];
  receiptTarget?: string;
  operatorSummary?: string;
  operatorConfirmed?: boolean;
  rollbackPlan?: string;
  sanitizationProof?: string;
  budgetCents?: number;
};

export type RealWorldEngagementProfile = {
  action: GovernanceAction;
  mode: RealWorldEngagementMode;
  riskTier: ToolRiskTier;
  operatorConfirmationRequired: boolean;
  rollbackRequired: boolean;
  publicSanitizationRequired: boolean;
  budgetRequired: boolean;
  requiredEvidence: string[];
};

export type RealWorldEngagementDecision = {
  allowed: boolean;
  action: GovernanceAction;
  mode: RealWorldEngagementMode;
  riskTier: ToolRiskTier;
  missingEvidence: string[];
  stopConditions: string[];
  reason: "ready" | "missing_real_world_engagement_evidence";
};

function modeForAction(action: GovernanceAction): RealWorldEngagementMode {
  switch (action) {
    case "dataset-read":
    case "neuro-session-read":
    case "neuro-feature-read":
    case "cognitive-trace-read":
    case "actuation-read":
    case "event-read":
      return "observe-only";
    case "benchmark-publication":
      return "public-publication";
    case "operator-control":
      return "privileged-control";
    case "actuation-dispatch":
    case "actuation-device-link":
      return "physical-actuation";
    default:
      return "internal-write";
  }
}

export function classifyRealWorldEngagement(action: GovernanceAction): RealWorldEngagementProfile {
  const tool = getGovernedToolAction(action);
  const mode = modeForAction(action);
  const operatorConfirmationRequired =
    tool.approvalRequired ||
    mode === "public-publication" ||
    mode === "privileged-control" ||
    mode === "physical-actuation";
  const rollbackRequired =
    mode === "internal-write" ||
    mode === "public-publication" ||
    mode === "privileged-control" ||
    mode === "physical-actuation";
  const publicSanitizationRequired = mode === "public-publication";
  const budgetRequired = mode === "privileged-control";
  const requiredEvidence = [
    "consent_scope",
    "purpose",
    "receipt_target",
    "operator_summary",
    ...(operatorConfirmationRequired ? ["operator_confirmation"] : []),
    ...(rollbackRequired ? ["rollback_plan"] : []),
    ...(publicSanitizationRequired ? ["sanitization_proof"] : []),
    ...(budgetRequired ? ["budget"] : [])
  ];

  return {
    action,
    mode,
    riskTier: tool.riskTier,
    operatorConfirmationRequired,
    rollbackRequired,
    publicSanitizationRequired,
    budgetRequired,
    requiredEvidence
  };
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function evaluateRealWorldEngagement(
  action: GovernanceAction,
  evidence: RealWorldEngagementEvidence = {}
): RealWorldEngagementDecision {
  const profile = classifyRealWorldEngagement(action);
  const missingEvidence = [
    ...(!hasText(evidence.consentScope) ? ["consent_scope"] : []),
    ...(!evidence.purpose?.some((purpose) => purpose.trim()) ? ["purpose"] : []),
    ...(!hasText(evidence.receiptTarget) ? ["receipt_target"] : []),
    ...(!hasText(evidence.operatorSummary) ? ["operator_summary"] : []),
    ...(profile.operatorConfirmationRequired && evidence.operatorConfirmed !== true
      ? ["operator_confirmation"]
      : []),
    ...(profile.rollbackRequired && !hasText(evidence.rollbackPlan) ? ["rollback_plan"] : []),
    ...(profile.publicSanitizationRequired && !hasText(evidence.sanitizationProof)
      ? ["sanitization_proof"]
      : []),
    ...(profile.budgetRequired &&
    (typeof evidence.budgetCents !== "number" || !Number.isFinite(evidence.budgetCents) || evidence.budgetCents < 0)
      ? ["budget"]
      : [])
  ];

  return {
    allowed: missingEvidence.length === 0,
    action,
    mode: profile.mode,
    riskTier: profile.riskTier,
    missingEvidence,
    stopConditions: missingEvidence.map((item) => `missing_${item}`),
    reason: missingEvidence.length === 0 ? "ready" : "missing_real_world_engagement_evidence"
  };
}
