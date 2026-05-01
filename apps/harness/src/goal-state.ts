import { sha256Json } from "./utils.js";
import {
  evaluateToolRiskAdmission,
  listGovernedToolActions,
  type ToolRiskAdmissionDecision,
  type ToolRiskTier
} from "./tool-governance.js";

export const governedGoalSchemaVersion = "governed-goal.v1";

export const goalStatuses = [
  "draft",
  "active",
  "blocked",
  "completed",
  "failed",
  "cancelled"
] as const;

export type GoalStatus = (typeof goalStatuses)[number];

export type GoalAuthorityScope = {
  actor: string;
  consentScope: string;
  approvalRef?: string;
  policyId?: string;
  purpose: string[];
};

export type GovernedGoal = {
  schemaVersion: typeof governedGoalSchemaVersion;
  id: string;
  objective: string;
  owner: string;
  constraints: string[];
  authorityScope: GoalAuthorityScope;
  successCriteria: string[];
  deadline: string;
  allowedTools: string[];
  rollbackPlan: string;
  auditRequirements: string[];
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
};

export type GovernedGoalParseResult =
  | {
      ok: true;
      goal: GovernedGoal;
      findings: [];
    }
  | {
      ok: false;
      findings: string[];
    };

export type GovernedGoalAdmissionDecision = {
  accepted: boolean;
  schemaVersion: typeof governedGoalSchemaVersion;
  goalId?: string;
  reason: string;
  findings: string[];
  maxRiskTier: ToolRiskTier;
  approvalRequired: boolean;
  humanApprovalRequired: boolean;
  requiredApprovals: string[];
  toolDecisions: ToolRiskAdmissionDecision[];
};

export type GovernedGoalAdmissionResult = {
  goal?: GovernedGoal;
  admission: GovernedGoalAdmissionDecision;
};

export type GovernedGoalTransitionDecision = {
  allowed: boolean;
  from: GoalStatus;
  to: GoalStatus;
  reason: string;
  findings: string[];
  goal?: GovernedGoal;
};

const allowedGoalTransitions: Record<GoalStatus, GoalStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["blocked", "completed", "failed", "cancelled"],
  blocked: ["active", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(
    new Set(
      source
        .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function normalizeStatus(value: unknown): GoalStatus | null {
  if (typeof value !== "string" || !value.trim()) {
    return "draft";
  }
  const candidate = value.trim();
  return goalStatuses.includes(candidate as GoalStatus) ? (candidate as GoalStatus) : null;
}

function normalizeDeadline(value: unknown): string | null {
  const candidate = normalizeString(value);
  if (!candidate) {
    return null;
  }
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : null;
}

function maxRiskTier(tiers: ToolRiskTier[]): ToolRiskTier {
  return tiers.reduce<ToolRiskTier>((max, tier) => (tier > max ? tier : max), 0);
}

function createGoalId(input: Omit<GovernedGoal, "id" | "createdAt" | "updatedAt">): string {
  return `goal-${sha256Json({
    schemaVersion: input.schemaVersion,
    objective: input.objective,
    owner: input.owner,
    consentScope: input.authorityScope.consentScope,
    deadline: input.deadline,
    allowedTools: input.allowedTools,
    successCriteria: input.successCriteria
  }).slice(0, 18)}`;
}

export const governedGoalStateContract = {
  schemaVersion: governedGoalSchemaVersion,
  requiredFields: [
    "objective",
    "owner",
    "constraints",
    "authorityScope.consentScope",
    "authorityScope.purpose",
    "successCriteria",
    "deadline",
    "allowedTools",
    "rollbackPlan",
    "auditRequirements"
  ],
  statuses: [...goalStatuses],
  toolPolicy:
    "allowedTools must be registered governed tool actions. Tool admission inherits consent, approval, human approval, confidence, and failure-hold rules from the risk-tier registry.",
  transitionPolicy: {
    ...allowedGoalTransitions
  }
} as const;

export function parseGovernedGoalInput(input: unknown, now = new Date()): GovernedGoalParseResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      findings: ["goal_input_not_object"]
    };
  }

  const objective = normalizeString(input.objective);
  const owner = normalizeString(input.owner);
  const constraints = normalizeStringArray(input.constraints);
  const successCriteria = normalizeStringArray(input.successCriteria);
  const deadline = normalizeDeadline(input.deadline);
  const allowedTools = normalizeStringArray(input.allowedTools);
  const rollbackPlan = normalizeString(input.rollbackPlan);
  const auditRequirements = normalizeStringArray(input.auditRequirements);
  const status = normalizeStatus(input.status);
  const authorityInput = isRecord(input.authorityScope) ? input.authorityScope : {};
  const purpose = normalizeStringArray(authorityInput.purpose);
  const actor = normalizeString(authorityInput.actor) || owner;
  const consentScope = normalizeString(authorityInput.consentScope);
  const approvalRef = normalizeString(authorityInput.approvalRef) || undefined;
  const policyId = normalizeString(authorityInput.policyId) || undefined;
  const findings: string[] = [];

  if (!objective) {
    findings.push("missing_objective");
  }
  if (!owner) {
    findings.push("missing_owner");
  }
  if (constraints.length === 0) {
    findings.push("missing_constraints");
  }
  if (!actor) {
    findings.push("missing_authority_actor");
  }
  if (!consentScope) {
    findings.push("missing_authority_consent_scope");
  }
  if (purpose.length === 0) {
    findings.push("missing_authority_purpose");
  }
  if (successCriteria.length === 0) {
    findings.push("missing_success_criteria");
  }
  if (!deadline) {
    findings.push("missing_or_invalid_deadline");
  }
  if (allowedTools.length === 0) {
    findings.push("missing_allowed_tools");
  }
  if (!rollbackPlan) {
    findings.push("missing_rollback_plan");
  }
  if (auditRequirements.length === 0) {
    findings.push("missing_audit_requirements");
  }
  if (!status) {
    findings.push("invalid_status");
  }

  if (findings.length > 0 || !deadline || !status) {
    return {
      ok: false,
      findings
    };
  }

  const timestamp = now.toISOString();
  const baseGoal: Omit<GovernedGoal, "id" | "createdAt" | "updatedAt"> = {
    schemaVersion: governedGoalSchemaVersion,
    objective,
    owner,
    constraints,
    authorityScope: {
      actor,
      consentScope,
      approvalRef,
      policyId,
      purpose
    },
    successCriteria,
    deadline,
    allowedTools,
    rollbackPlan,
    auditRequirements,
    status
  };

  return {
    ok: true,
    findings: [],
    goal: {
      ...baseGoal,
      id: createGoalId(baseGoal),
      createdAt: timestamp,
      updatedAt: timestamp
    }
  };
}

export function evaluateGovernedGoalAdmission(
  goal: GovernedGoal,
  now = new Date()
): GovernedGoalAdmissionDecision {
  const findings: string[] = [];
  const registeredActions = new Set<string>(listGovernedToolActions().map((tool) => tool.action));
  const unknownTools = goal.allowedTools.filter((tool) => !registeredActions.has(tool));
  const toolDecisions = goal.allowedTools.map((action) =>
    evaluateToolRiskAdmission({
      action,
      consentScope: goal.authorityScope.consentScope,
      approvalRef: goal.authorityScope.approvalRef
    })
  );

  if (goal.status !== "draft" && goal.status !== "active") {
    findings.push("goal_status_not_submittable");
  }

  if (Date.parse(goal.deadline) <= now.valueOf()) {
    findings.push("deadline_elapsed");
  }

  for (const unknownTool of unknownTools) {
    findings.push(`unknown_allowed_tool:${unknownTool}`);
  }

  for (const decision of toolDecisions) {
    if (!decision.allowed) {
      findings.push(`tool_admission_blocked:${decision.action}:${decision.reason}`);
    }
  }

  const riskTiers = toolDecisions.flatMap((decision) =>
    typeof decision.riskTier === "number" ? [decision.riskTier] : []
  );
  const maxTier = maxRiskTier(riskTiers);
  const requiredApprovals = toolDecisions
    .filter((decision) => decision.approvalRequired || decision.humanApprovalRequired)
    .map((decision) =>
      decision.humanApprovalRequired
        ? `${decision.action}:human_or_operator`
        : `${decision.action}:approval_ref`
    );

  return {
    accepted: findings.length === 0,
    schemaVersion: governedGoalSchemaVersion,
    goalId: goal.id,
    reason: findings[0] ?? "accepted",
    findings,
    maxRiskTier: maxTier,
    approvalRequired: toolDecisions.some((decision) => Boolean(decision.approvalRequired)),
    humanApprovalRequired: toolDecisions.some((decision) => Boolean(decision.humanApprovalRequired)),
    requiredApprovals,
    toolDecisions
  };
}

export function buildGovernedGoalAdmission(
  input: unknown,
  now = new Date()
): GovernedGoalAdmissionResult {
  const parsed = parseGovernedGoalInput(input, now);
  if (!parsed.ok) {
    return {
      admission: {
        accepted: false,
        schemaVersion: governedGoalSchemaVersion,
        reason: "invalid_goal",
        findings: parsed.findings,
        maxRiskTier: 0,
        approvalRequired: false,
        humanApprovalRequired: false,
        requiredApprovals: [],
        toolDecisions: []
      }
    };
  }

  return {
    goal: parsed.goal,
    admission: evaluateGovernedGoalAdmission(parsed.goal, now)
  };
}

export function transitionGovernedGoal(
  goal: GovernedGoal,
  to: GoalStatus,
  reason: string,
  now = new Date()
): GovernedGoalTransitionDecision {
  const normalizedReason = reason.trim();
  const allowedTargets = allowedGoalTransitions[goal.status];
  const findings: string[] = [];

  if (!normalizedReason) {
    findings.push("missing_transition_reason");
  }
  if (!allowedTargets.includes(to)) {
    findings.push(`transition_not_allowed:${goal.status}->${to}`);
  }

  if (findings.length > 0) {
    return {
      allowed: false,
      from: goal.status,
      to,
      reason: findings[0] ?? "transition_denied",
      findings
    };
  }

  return {
    allowed: true,
    from: goal.status,
    to,
    reason: normalizedReason,
    findings: [],
    goal: {
      ...goal,
      status: to,
      updatedAt: now.toISOString()
    }
  };
}
