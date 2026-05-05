import type { GovernanceAction } from "./governance.js";

export const toolRiskTiers = [0, 1, 2, 3, 4, 5] as const;

export type ToolRiskTier = (typeof toolRiskTiers)[number];

export type ToolRiskClass =
  | "read_only_observation"
  | "draft_or_suggest"
  | "internal_write"
  | "external_communication"
  | "money_credentials_infrastructure"
  | "irreversible_or_regulated";

export type ToolRiskRateLimit = {
  requestsPerMinute: number;
  burst: number;
  maxConcurrentRequests: number;
};

export type GovernedToolAction = {
  action: GovernanceAction;
  label: string;
  description: string;
  riskTier: ToolRiskTier;
  riskClass: ToolRiskClass;
  consentRequired: boolean;
  approvalRequired: boolean;
  humanApprovalRequired: boolean;
  minimumConfidence: number;
  failureHoldThreshold: number;
  allowedScopes: string[];
  rateLimit: ToolRiskRateLimit;
};

export type ToolRiskAdmissionInput = {
  action: string;
  consentScope?: string;
  approvalRef?: string;
  confidence?: number;
  recentFailureCount?: number;
};

export type ToolRiskAdmissionDecision = {
  allowed: boolean;
  action: string;
  reason: string;
  riskTier?: ToolRiskTier;
  riskClass?: ToolRiskClass;
  consentRequired?: boolean;
  approvalRequired?: boolean;
  humanApprovalRequired?: boolean;
  minimumConfidence?: number;
  failureHoldThreshold?: number;
};

type GovernedToolActionDefinition = Omit<
  GovernedToolAction,
  "riskClass" | "consentRequired" | "approvalRequired" | "humanApprovalRequired" | "rateLimit"
>;

export const toolRiskRateLimits: Record<ToolRiskTier, ToolRiskRateLimit> = {
  0: {
    requestsPerMinute: 240,
    burst: 60,
    maxConcurrentRequests: 16
  },
  1: {
    requestsPerMinute: 120,
    burst: 30,
    maxConcurrentRequests: 12
  },
  2: {
    requestsPerMinute: 60,
    burst: 16,
    maxConcurrentRequests: 8
  },
  3: {
    requestsPerMinute: 24,
    burst: 8,
    maxConcurrentRequests: 4
  },
  4: {
    requestsPerMinute: 10,
    burst: 3,
    maxConcurrentRequests: 2
  },
  5: {
    requestsPerMinute: 2,
    burst: 1,
    maxConcurrentRequests: 1
  }
};

const governedToolActionDefinitions = {
  "operator-control": {
    action: "operator-control",
    label: "Operator Control",
    description: "Controls harness orchestration and operator-facing runtime switches.",
    riskTier: 4,
    minimumConfidence: 0.82,
    failureHoldThreshold: 2,
    allowedScopes: ["operator-control", "orchestration-control"]
  },
  "dataset-ingestion": {
    action: "dataset-ingestion",
    label: "Dataset Ingestion",
    description: "Writes dataset catalog records or imports research data into the runtime.",
    riskTier: 2,
    minimumConfidence: 0.55,
    failureHoldThreshold: 4,
    allowedScopes: ["dataset-ingestion", "research-ingestion"]
  },
  "dataset-read": {
    action: "dataset-read",
    label: "Dataset Read",
    description: "Reads dataset metadata and redacted research records.",
    riskTier: 0,
    minimumConfidence: 0,
    failureHoldThreshold: 8,
    allowedScopes: ["dataset-read", "research-read"]
  },
  "neuro-session-ingestion": {
    action: "neuro-session-ingestion",
    label: "Neuro Session Ingestion",
    description: "Registers neurophysiology session data and session-linked metadata.",
    riskTier: 2,
    minimumConfidence: 0.6,
    failureHoldThreshold: 4,
    allowedScopes: ["neuro-session-ingestion", "neuro-ingestion"]
  },
  "neuro-session-read": {
    action: "neuro-session-read",
    label: "Neuro Session Read",
    description: "Reads governed neuro session records through visibility scopes.",
    riskTier: 0,
    minimumConfidence: 0,
    failureHoldThreshold: 8,
    allowedScopes: ["neuro-session-read", "neuro-analysis"]
  },
  "neuro-feature-read": {
    action: "neuro-feature-read",
    label: "Neuro Feature Read",
    description: "Reads derived neuro features and replay analysis windows.",
    riskTier: 0,
    minimumConfidence: 0,
    failureHoldThreshold: 8,
    allowedScopes: ["neuro-feature-read", "neuro-analysis"]
  },
  "neuro-replay": {
    action: "neuro-replay",
    label: "Neuro Replay",
    description: "Runs bounded replay of existing neuro session data.",
    riskTier: 2,
    minimumConfidence: 0.65,
    failureHoldThreshold: 3,
    allowedScopes: ["neuro-replay", "neuro-analysis"]
  },
  "neuro-streaming": {
    action: "neuro-streaming",
    label: "Live Neuro Streaming",
    description: "Starts or controls live neurophysiology ingestion streams.",
    riskTier: 3,
    minimumConfidence: 0.7,
    failureHoldThreshold: 2,
    allowedScopes: ["neuro-streaming", "neuro-ingestion"]
  },
  "cognitive-registration": {
    action: "cognitive-registration",
    label: "Cognitive Registration",
    description: "Registers cognitive layers or worker identities for routing.",
    riskTier: 2,
    minimumConfidence: 0.6,
    failureHoldThreshold: 3,
    allowedScopes: ["cognitive-registration", "cognitive-execution"]
  },
  "cognitive-execution": {
    action: "cognitive-execution",
    label: "Cognitive Execution",
    description: "Runs bounded reasoning or assessment inside the harness.",
    riskTier: 2,
    minimumConfidence: 0.62,
    failureHoldThreshold: 3,
    allowedScopes: ["cognitive-execution", "cognitive-reasoning", "q-public-inference"]
  },
  "cognitive-trace-read": {
    action: "cognitive-trace-read",
    label: "Cognitive Trace Read",
    description: "Reads intelligence assessments, traces, and audit summaries.",
    riskTier: 0,
    minimumConfidence: 0,
    failureHoldThreshold: 8,
    allowedScopes: ["cognitive-trace-read", "cognitive-analysis"]
  },
  "protection-signal-read": {
    action: "protection-signal-read",
    label: "Protection Signal Read",
    description: "Reads defensive protection posture and bounded self-defense signals.",
    riskTier: 0,
    minimumConfidence: 0,
    failureHoldThreshold: 8,
    allowedScopes: ["protection-signal-read", "security-review", "audit-read"]
  },
  "actuation-dispatch": {
    action: "actuation-dispatch",
    label: "Actuation Dispatch",
    description: "Dispatches outward commands through actuation adapters or mediation routes.",
    riskTier: 5,
    minimumConfidence: 0.94,
    failureHoldThreshold: 1,
    allowedScopes: ["actuation-dispatch", "feedback-dispatch"]
  },
  "actuation-device-link": {
    action: "actuation-device-link",
    label: "Actuation Device Link",
    description: "Links or resets concrete actuation transports and bridges.",
    riskTier: 4,
    minimumConfidence: 0.85,
    failureHoldThreshold: 2,
    allowedScopes: ["actuation-device-link", "feedback-device-link"]
  },
  "actuation-read": {
    action: "actuation-read",
    label: "Actuation Read",
    description: "Reads actuation outputs, transports, adapters, and deliveries.",
    riskTier: 0,
    minimumConfidence: 0,
    failureHoldThreshold: 8,
    allowedScopes: ["actuation-read", "audit-read"]
  },
  "event-read": {
    action: "event-read",
    label: "Event Read",
    description: "Reads event lineage and persistence replay records.",
    riskTier: 0,
    minimumConfidence: 0,
    failureHoldThreshold: 8,
    allowedScopes: ["event-read", "audit-read"]
  },
  "benchmark-execution": {
    action: "benchmark-execution",
    label: "Benchmark Execution",
    description: "Runs local benchmark packs or scorecard generation.",
    riskTier: 2,
    minimumConfidence: 0.58,
    failureHoldThreshold: 4,
    allowedScopes: ["benchmark-execution", "benchmark-validation"]
  },
  "benchmark-publication": {
    action: "benchmark-publication",
    label: "Benchmark Publication",
    description: "Publishes benchmark artifacts to public or external score surfaces.",
    riskTier: 3,
    minimumConfidence: 0.72,
    failureHoldThreshold: 2,
    allowedScopes: ["benchmark-publication", "benchmark-execution"]
  }
} satisfies Record<GovernanceAction, GovernedToolActionDefinition>;

export function riskClassForTier(tier: ToolRiskTier): ToolRiskClass {
  switch (tier) {
    case 0:
      return "read_only_observation";
    case 1:
      return "draft_or_suggest";
    case 2:
      return "internal_write";
    case 3:
      return "external_communication";
    case 4:
      return "money_credentials_infrastructure";
    case 5:
      return "irreversible_or_regulated";
  }
}

export function toolRiskRequiresConsent(tier: ToolRiskTier): boolean {
  return tier >= 2;
}

export function toolRiskRequiresApproval(tier: ToolRiskTier): boolean {
  return tier >= 3;
}

export function toolRiskRequiresHumanApproval(tier: ToolRiskTier): boolean {
  return tier >= 4;
}

function projectGovernedToolAction(
  definition: GovernedToolActionDefinition
): GovernedToolAction {
  return {
    ...definition,
    allowedScopes: [...definition.allowedScopes],
    riskClass: riskClassForTier(definition.riskTier),
    consentRequired: toolRiskRequiresConsent(definition.riskTier),
    approvalRequired: toolRiskRequiresApproval(definition.riskTier),
    humanApprovalRequired: toolRiskRequiresHumanApproval(definition.riskTier),
    rateLimit: { ...toolRiskRateLimits[definition.riskTier] }
  };
}

export function getGovernedToolAction(action: GovernanceAction): GovernedToolAction {
  return projectGovernedToolAction(governedToolActionDefinitions[action]);
}

export function listGovernedToolActions(): GovernedToolAction[] {
  return Object.values(governedToolActionDefinitions)
    .map((definition) => projectGovernedToolAction(definition))
    .sort((left, right) => left.action.localeCompare(right.action));
}

export function evaluateToolRiskAdmission(
  input: ToolRiskAdmissionInput
): ToolRiskAdmissionDecision {
  const action = input.action.trim();
  const profile = listGovernedToolActions().find((candidate) => candidate.action === action);
  if (!profile) {
    return {
      allowed: false,
      action,
      reason: "unknown_tool_action"
    };
  }

  const base = {
    action,
    riskTier: profile.riskTier,
    riskClass: profile.riskClass,
    consentRequired: profile.consentRequired,
    approvalRequired: profile.approvalRequired,
    humanApprovalRequired: profile.humanApprovalRequired,
    minimumConfidence: profile.minimumConfidence,
    failureHoldThreshold: profile.failureHoldThreshold
  };

  if (profile.consentRequired && !input.consentScope?.trim()) {
    return {
      ...base,
      allowed: false,
      reason: "missing_consent_scope"
    };
  }

  if (profile.approvalRequired && !input.approvalRef?.trim()) {
    return {
      ...base,
      allowed: false,
      reason: "missing_approval_ref"
    };
  }

  if (
    profile.humanApprovalRequired &&
    !/^(human|operator):[A-Za-z0-9_.:-]+$/.test(input.approvalRef?.trim() ?? "")
  ) {
    return {
      ...base,
      allowed: false,
      reason: "human_approval_required"
    };
  }

  if (
    typeof input.confidence === "number" &&
    Number.isFinite(input.confidence) &&
    input.confidence < profile.minimumConfidence
  ) {
    return {
      ...base,
      allowed: false,
      reason: "confidence_below_risk_floor"
    };
  }

  if (
    typeof input.recentFailureCount === "number" &&
    Number.isFinite(input.recentFailureCount) &&
    input.recentFailureCount >= profile.failureHoldThreshold
  ) {
    return {
      ...base,
      allowed: false,
      reason: "failure_hold_threshold_reached"
    };
  }

  return {
    ...base,
    allowed: true,
    reason: "allowed"
  };
}
