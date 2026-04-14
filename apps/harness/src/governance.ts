import { hashValue } from "./utils.js";

export const governanceActions = [
  "operator-control",
  "dataset-ingestion",
  "dataset-read",
  "neuro-session-ingestion",
  "neuro-session-read",
  "neuro-feature-read",
  "neuro-replay",
  "neuro-streaming",
  "cognitive-registration",
  "cognitive-execution",
  "cognitive-trace-read",
  "actuation-dispatch",
  "actuation-device-link",
  "actuation-read",
  "event-read",
  "benchmark-execution",
  "benchmark-publication"
] as const;

export type GovernanceAction = (typeof governanceActions)[number];

export type GovernancePolicy = {
  id: string;
  label: string;
  action: GovernanceAction;
  allowedPurposes: string[];
  requiredConsentPrefixes: string[];
  description: string;
};

export type GovernanceDecision = {
  id: string;
  timestamp: string;
  allowed: boolean;
  mode: "enforced";
  action: GovernanceAction;
  route: string;
  policyId: string;
  purpose: string[];
  consentScope?: string;
  actor: string;
  reason: string;
};

export type GovernanceStatus = {
  mode: "enforced";
  policyCount: number;
  decisionCount: number;
  deniedCount: number;
  lastDecisionAt?: string;
  lastDecisionId?: string;
};

export type GovernanceBinding = {
  action: GovernanceAction;
  route: string;
  actor: string;
  policyId?: string;
  purpose?: string[];
  consentScope?: string;
};

const GOVERNANCE_HISTORY_LIMIT = 128;

const policies: GovernancePolicy[] = [
  {
    id: "operator-control-default",
    label: "Operator Control",
    action: "operator-control",
    allowedPurposes: ["operator-control", "orchestration-control"],
    requiredConsentPrefixes: ["operator:"],
    description: "Allows bounded operator control over the live harness."
  },
  {
    id: "dataset-ingestion-default",
    label: "Dataset Ingestion",
    action: "dataset-ingestion",
    allowedPurposes: ["dataset-ingestion", "research-ingestion"],
    requiredConsentPrefixes: ["dataset:", "subject:"],
    description: "Allows BIDS and dataset catalog ingestion under dataset or subject scope."
  },
  {
    id: "dataset-read-default",
    label: "Dataset Read",
    action: "dataset-read",
    allowedPurposes: ["dataset-read", "research-read"],
    requiredConsentPrefixes: ["dataset:", "subject:"],
    description: "Allows detailed dataset reads under explicit dataset or subject scope."
  },
  {
    id: "neuro-session-default",
    label: "Neuro Session Ingestion",
    action: "neuro-session-ingestion",
    allowedPurposes: ["neuro-session-ingestion", "neuro-ingestion"],
    requiredConsentPrefixes: ["session:", "subject:"],
    description: "Allows NWB session registration under explicit session or subject scope."
  },
  {
    id: "neuro-session-read-default",
    label: "Neuro Session Read",
    action: "neuro-session-read",
    allowedPurposes: ["neuro-session-read", "neuro-analysis"],
    requiredConsentPrefixes: ["session:", "subject:"],
    description: "Allows detailed neuro-session reads under explicit session or subject scope."
  },
  {
    id: "neuro-feature-read-default",
    label: "Neuro Feature Read",
    action: "neuro-feature-read",
    allowedPurposes: ["neuro-feature-read", "neuro-analysis"],
    requiredConsentPrefixes: ["session:", "subject:", "system:benchmark"],
    description: "Allows derived neuro-feature reads under explicit session, subject, or benchmark scope."
  },
  {
    id: "neuro-replay-default",
    label: "Neuro Replay",
    action: "neuro-replay",
    allowedPurposes: ["neuro-replay", "neuro-analysis"],
    requiredConsentPrefixes: ["session:", "subject:"],
    description: "Allows bounded neuro replay control under session-linked consent."
  },
  {
    id: "neuro-stream-default",
    label: "Live Neuro Streaming",
    action: "neuro-streaming",
    allowedPurposes: ["neuro-streaming", "neuro-ingestion"],
    requiredConsentPrefixes: ["session:", "live-source:", "subject:"],
    description: "Allows live neurophysiology ingress under explicit live source or session scope."
  },
  {
    id: "cognitive-ops-default",
    label: "Cognitive Operations",
    action: "cognitive-registration",
    allowedPurposes: ["cognitive-registration", "cognitive-execution"],
    requiredConsentPrefixes: ["system:intelligence", "session:", "subject:"],
    description: "Allows cognition layer registration and execution under system or session scope."
  },
  {
    id: "cognitive-run-default",
    label: "Cognitive Execution",
    action: "cognitive-execution",
    allowedPurposes: ["cognitive-execution", "cognitive-reasoning"],
    requiredConsentPrefixes: ["system:intelligence", "session:", "subject:"],
    description: "Allows reasoning and execution under system or session-linked scope."
  },
  {
    id: "q-public",
    label: "Public Q Inference",
    action: "cognitive-execution",
    allowedPurposes: ["q-public-inference", "cognitive-execution"],
    requiredConsentPrefixes: ["intelligence:q-public"],
    description: "Allows the narrow public Q inference edge under a dedicated per-key consent boundary."
  },
  {
    id: "cognitive-trace-read-default",
    label: "Cognitive Trace Read",
    action: "cognitive-trace-read",
    allowedPurposes: ["cognitive-trace-read", "cognitive-analysis"],
    requiredConsentPrefixes: ["system:intelligence", "system:benchmark"],
    description: "Allows cognitive trace reads under explicit intelligence or benchmark scope."
  },
  {
    id: "actuation-dispatch-default",
    label: "Actuation Dispatch",
    action: "actuation-dispatch",
    allowedPurposes: ["actuation-dispatch", "feedback-dispatch"],
    requiredConsentPrefixes: ["system:actuation", "session:", "subject:", "system:benchmark"],
    description: "Allows outward actuation dispatch under explicit actuation, session, subject, or benchmark scope."
  },
  {
    id: "actuation-device-link-default",
    label: "Actuation Device Link",
    action: "actuation-device-link",
    allowedPurposes: ["actuation-device-link", "feedback-device-link"],
    requiredConsentPrefixes: ["system:actuation", "session:", "subject:"],
    description: "Allows a concrete device transport to attach to an actuation adapter under explicit actuation, session, or subject scope."
  },
  {
    id: "actuation-read-default",
    label: "Actuation Read",
    action: "actuation-read",
    allowedPurposes: ["actuation-read", "audit-read"],
    requiredConsentPrefixes: ["system:actuation", "system:audit", "system:benchmark", "session:", "subject:"],
    description: "Allows actuation output inspection under explicit actuation, audit, benchmark, session, or subject scope."
  },
  {
    id: "event-read-default",
    label: "Event Read",
    action: "event-read",
    allowedPurposes: ["event-read", "audit-read"],
    requiredConsentPrefixes: ["system:audit", "system:benchmark", "session:", "dataset:", "subject:"],
    description: "Allows audit/event lineage reads under explicit audit, benchmark, dataset, or session scope."
  },
  {
    id: "benchmark-execution-default",
    label: "Benchmark Execution",
    action: "benchmark-execution",
    allowedPurposes: ["benchmark-execution", "benchmark-validation"],
    requiredConsentPrefixes: ["system:benchmark"],
    description: "Allows local benchmark execution under benchmark system scope."
  },
  {
    id: "benchmark-publication-default",
    label: "Benchmark Publication",
    action: "benchmark-publication",
    allowedPurposes: ["benchmark-publication", "benchmark-execution"],
    requiredConsentPrefixes: ["system:benchmark"],
    description: "Allows publication of benchmark artifacts under benchmark system scope."
  }
];

function normalizePurpose(purpose?: string[]): string[] {
  return Array.from(
    new Set(
      (purpose ?? [])
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function getPolicy(action: GovernanceAction, policyId?: string): GovernancePolicy | null {
  if (policyId) {
    return (
      policies.find((policy) => policy.id === policyId && policy.action === action) ?? null
    );
  }

  return policies.find((policy) => policy.action === action) ?? null;
}

function consentAllowed(policy: GovernancePolicy, consentScope?: string): boolean {
  if (!consentScope) {
    return false;
  }

  return policy.requiredConsentPrefixes.some((prefix) => consentScope.startsWith(prefix));
}

function purposeAllowed(policy: GovernancePolicy, purpose: string[]): boolean {
  return purpose.some((entry) => policy.allowedPurposes.includes(entry));
}

function buildDecision(
  allowed: boolean,
  binding: GovernanceBinding,
  policy: GovernancePolicy | null,
  reason: string
): GovernanceDecision {
  const timestamp = new Date().toISOString();
  return {
    id: `gov-${hashValue(`${binding.route}:${binding.actor}:${timestamp}:${reason}`)}`,
    timestamp,
    allowed,
    mode: "enforced",
    action: binding.action,
    route: binding.route,
    policyId: policy?.id ?? binding.policyId ?? "unresolved",
    purpose: normalizePurpose(binding.purpose),
    consentScope: binding.consentScope,
    actor: binding.actor,
    reason
  };
}

export function evaluateGovernance(
  binding: GovernanceBinding
): GovernanceDecision {
  const normalizedPurpose = normalizePurpose(binding.purpose);
  const policy = getPolicy(binding.action, binding.policyId);
  if (!policy) {
    return buildDecision(false, binding, null, "policy_not_found");
  }

  if (normalizedPurpose.length === 0) {
    return buildDecision(false, binding, policy, "missing_purpose");
  }

  if (!purposeAllowed(policy, normalizedPurpose)) {
    return buildDecision(false, binding, policy, "purpose_not_allowed");
  }

  if (!binding.consentScope) {
    return buildDecision(false, binding, policy, "missing_consent_scope");
  }

  if (!consentAllowed(policy, binding.consentScope)) {
    return buildDecision(false, binding, policy, "consent_scope_not_allowed");
  }

  return buildDecision(true, { ...binding, purpose: normalizedPurpose }, policy, "allowed");
}

export function createGovernanceRegistry() {
  const decisions: GovernanceDecision[] = [];

  function record(decision: GovernanceDecision): GovernanceDecision {
    decisions.unshift(decision);
    if (decisions.length > GOVERNANCE_HISTORY_LIMIT) {
      decisions.length = GOVERNANCE_HISTORY_LIMIT;
    }
    return decision;
  }

  return {
    evaluate(binding: GovernanceBinding): GovernanceDecision {
      return record(evaluateGovernance(binding));
    },
    record(binding: GovernanceBinding, allowed: boolean, reason: string): GovernanceDecision {
      return record(buildDecision(allowed, binding, getPolicy(binding.action, binding.policyId), reason));
    },
    listPolicies(): GovernancePolicy[] {
      return policies.map((policy) => ({ ...policy, allowedPurposes: [...policy.allowedPurposes], requiredConsentPrefixes: [...policy.requiredConsentPrefixes] }));
    },
    listDecisions(): GovernanceDecision[] {
      return decisions.map((decision) => ({ ...decision, purpose: [...decision.purpose] }));
    },
    getStatus(): GovernanceStatus {
      return {
        mode: "enforced",
        policyCount: policies.length,
        decisionCount: decisions.length,
        deniedCount: decisions.filter((decision) => !decision.allowed).length,
        lastDecisionAt: decisions[0]?.timestamp,
        lastDecisionId: decisions[0]?.id
      };
    }
  };
}
