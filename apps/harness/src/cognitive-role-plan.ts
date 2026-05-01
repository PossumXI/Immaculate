import {
  buildGovernedGoalAdmission,
  type GovernedGoal,
  type GovernedGoalAdmissionDecision
} from "./goal-state.js";
import {
  listGovernedToolActions,
  type GovernedToolAction,
  type ToolRiskTier
} from "./tool-governance.js";
import { sha256Json } from "./utils.js";

export const cognitiveRolePlanSchemaVersion = "cognitive-role-plan.v1";

export const cognitiveRuntimeRoles = [
  "operator",
  "planner",
  "researcher",
  "executor",
  "verifier",
  "critic",
  "security_monitor",
  "memory_curator",
  "ledger_recorder",
  "escalation_agent",
  "policy_governor"
] as const;

export type CognitiveRuntimeRole = (typeof cognitiveRuntimeRoles)[number];

export const cognitivePlanStepKinds = [
  "plan",
  "research",
  "execute",
  "verify",
  "critique",
  "govern",
  "record",
  "memory_update",
  "escalate"
] as const;

export type CognitivePlanStepKind = (typeof cognitivePlanStepKinds)[number];

export type CognitiveRoleAssignment = {
  role: CognitiveRuntimeRole;
  actorId: string;
  authorityScope?: string[];
};

export type CognitiveRolePlanStep = {
  id: string;
  order: number;
  kind: CognitivePlanStepKind;
  assignedRole: CognitiveRuntimeRole;
  summary: string;
  toolAction?: string;
  acceptanceCriteria: string[];
  evidenceRequired: string[];
  dependsOn: string[];
};

export type CognitiveRolePlan = {
  schemaVersion: typeof cognitiveRolePlanSchemaVersion;
  id: string;
  goalId: string;
  createdAt: string;
  roles: CognitiveRoleAssignment[];
  steps: CognitiveRolePlanStep[];
  causalChain: string[];
};

export type CognitiveRolePlanAdmissionDecision = {
  accepted: boolean;
  schemaVersion: typeof cognitiveRolePlanSchemaVersion;
  reason: string;
  findings: string[];
  goalAdmission: GovernedGoalAdmissionDecision;
  maxRiskTier: ToolRiskTier;
  requiredRoles: CognitiveRuntimeRole[];
  selfApprovalBlocked: boolean;
  roleCoverage: Record<CognitiveRuntimeRole, boolean>;
};

export type CognitiveRolePlanAdmissionResult = {
  goal?: GovernedGoal;
  plan?: CognitiveRolePlan;
  admission: CognitiveRolePlanAdmissionDecision;
};

export type CognitiveRolePlanInput = {
  goal?: unknown;
  roles?: unknown;
  steps?: unknown;
};

const separationCriticalRoles: CognitiveRuntimeRole[] = [
  "planner",
  "executor",
  "critic",
  "policy_governor"
];

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

function normalizeRole(value: unknown): CognitiveRuntimeRole | null {
  const candidate = normalizeString(value);
  return cognitiveRuntimeRoles.includes(candidate as CognitiveRuntimeRole)
    ? (candidate as CognitiveRuntimeRole)
    : null;
}

function normalizeStepKind(value: unknown): CognitivePlanStepKind | null {
  const candidate = normalizeString(value);
  return cognitivePlanStepKinds.includes(candidate as CognitivePlanStepKind)
    ? (candidate as CognitivePlanStepKind)
    : null;
}

function parseRoleAssignments(input: unknown): CognitiveRoleAssignment[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const assignments: CognitiveRoleAssignment[] = [];
  const seen = new Set<CognitiveRuntimeRole>();
  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }
    const role = normalizeRole(item.role);
    const actorId = normalizeString(item.actorId);
    if (!role || !actorId || seen.has(role)) {
      continue;
    }
    seen.add(role);
    assignments.push({
      role,
      actorId,
      authorityScope: normalizeStringArray(item.authorityScope)
    });
  }
  return assignments;
}

function profileByAction(): Map<string, GovernedToolAction> {
  return new Map(listGovernedToolActions().map((profile) => [profile.action, profile]));
}

function requiredRolesForRisk(maxRiskTier: ToolRiskTier): CognitiveRuntimeRole[] {
  const required: CognitiveRuntimeRole[] = [
    "planner",
    "executor",
    "verifier",
    "critic",
    "policy_governor",
    "ledger_recorder",
    "memory_curator"
  ];
  if (maxRiskTier >= 3) {
    required.push("security_monitor");
  }
  if (maxRiskTier >= 4) {
    required.push("operator", "escalation_agent");
  }
  return required;
}

function actorForRole(roles: CognitiveRoleAssignment[], role: CognitiveRuntimeRole): string | undefined {
  return roles.find((assignment) => assignment.role === role)?.actorId;
}

function roleCoverageFor(
  roles: CognitiveRoleAssignment[],
  requiredRoles: CognitiveRuntimeRole[]
): Record<CognitiveRuntimeRole, boolean> {
  const assignedRoles = new Set(roles.map((assignment) => assignment.role));
  return Object.fromEntries(
    cognitiveRuntimeRoles.map((role) => [
      role,
      requiredRoles.includes(role) ? assignedRoles.has(role) : true
    ])
  ) as Record<CognitiveRuntimeRole, boolean>;
}

function buildStepId(goalId: string, order: number, kind: string, subject: string): string {
  return `step-${sha256Json({ goalId, order, kind, subject }).slice(0, 14)}`;
}

function buildDefaultSteps(goal: GovernedGoal): CognitiveRolePlanStep[] {
  const steps: CognitiveRolePlanStep[] = [];
  const pushStep = (
    kind: CognitivePlanStepKind,
    assignedRole: CognitiveRuntimeRole,
    summary: string,
    acceptanceCriteria: string[],
    evidenceRequired: string[],
    toolAction?: string
  ): string => {
    const order = steps.length + 1;
    const id = buildStepId(goal.id, order, kind, toolAction ?? summary);
    steps.push({
      id,
      order,
      kind,
      assignedRole,
      summary,
      toolAction,
      acceptanceCriteria,
      evidenceRequired,
      dependsOn: steps.at(-1)?.id ? [steps.at(-1)!.id] : []
    });
    return id;
  };

  pushStep(
    "plan",
    "planner",
    `Create bounded plan for ${goal.objective}.`,
    ["Plan maps to goal success criteria", "Plan keeps every tool inside allowedTools"],
    ["plan rationale", "goal id"]
  );

  if (goal.allowedTools.some((tool) => tool.includes("read"))) {
    pushStep(
      "research",
      "researcher",
      "Collect read-only context before execution.",
      ["Context is sourced from approved read lanes"],
      ["source list", "context summary"]
    );
  }

  for (const toolAction of goal.allowedTools) {
    pushStep(
      "execute",
      "executor",
      `Run bounded tool action ${toolAction}.`,
      [`${toolAction} stays within the goal envelope`],
      ["tool receipt", "output summary"],
      toolAction
    );
  }

  pushStep(
    "verify",
    "verifier",
    "Verify outputs against success criteria and constraints.",
    ["All success criteria have evidence or explicit failure notes"],
    ["verification notes", "test or probe receipt"]
  );
  pushStep(
    "critique",
    "critic",
    "Evaluate residual risk, reversibility, and hallucination exposure.",
    ["Critique names failure modes and confidence gaps"],
    ["critic finding list"]
  );
  pushStep(
    "govern",
    "policy_governor",
    "Approve, deny, or constrain the proposed outcome.",
    ["Governor decision references goal, plan, and critic output"],
    ["governor decision", "approval reference or denial reason"]
  );
  pushStep(
    "record",
    "ledger_recorder",
    "Record proof, receipts, and lineage for audit.",
    ["Ledger record contains goal id and step ids"],
    ["ledger receipt", "trace digest"]
  );
  pushStep(
    "memory_update",
    "memory_curator",
    "Retain reusable lessons without changing future policy blindly.",
    ["Memory update separates episodic and procedural lessons"],
    ["memory delta", "policy hint"]
  );

  return steps;
}

function parseSteps(input: unknown, goal: GovernedGoal): CognitiveRolePlanStep[] {
  if (!Array.isArray(input) || input.length === 0) {
    return buildDefaultSteps(goal);
  }

  const steps: CognitiveRolePlanStep[] = [];
  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }
    const kind = normalizeStepKind(item.kind);
    const assignedRole = normalizeRole(item.assignedRole);
    const summary = normalizeString(item.summary);
    const acceptanceCriteria = normalizeStringArray(item.acceptanceCriteria);
    const evidenceRequired = normalizeStringArray(item.evidenceRequired);
    if (!kind || !assignedRole || !summary) {
      continue;
    }
    const order = typeof item.order === "number" && Number.isFinite(item.order)
      ? Math.max(1, Math.floor(item.order))
      : steps.length + 1;
    const toolAction = normalizeString(item.toolAction) || undefined;
    steps.push({
      id: normalizeString(item.id) || buildStepId(goal.id, order, kind, toolAction ?? summary),
      order,
      kind,
      assignedRole,
      summary,
      toolAction,
      acceptanceCriteria,
      evidenceRequired,
      dependsOn: normalizeStringArray(item.dependsOn)
    });
  }

  return steps.length > 0
    ? steps.sort((left, right) => left.order - right.order)
    : buildDefaultSteps(goal);
}

function buildCausalChain(goal: GovernedGoal, steps: CognitiveRolePlanStep[]): string[] {
  return [
    `Goal:${goal.id}`,
    "GovernanceBinding:goal-admission",
    ...steps.map((step) =>
      step.toolAction
        ? `Step:${step.id}:${step.assignedRole}:${step.toolAction}`
        : `Step:${step.id}:${step.assignedRole}:${step.kind}`
    ),
    "Assessment:critic-verifier",
    "Memory:curated-lessons",
    "Ledger:recorded-proof"
  ];
}

function buildPlanId(goal: GovernedGoal, roles: CognitiveRoleAssignment[], steps: CognitiveRolePlanStep[]): string {
  return `role-plan-${sha256Json({
    goalId: goal.id,
    roles: roles.map((assignment) => `${assignment.role}:${assignment.actorId}`),
    steps: steps.map((step) => `${step.order}:${step.kind}:${step.assignedRole}:${step.toolAction ?? ""}`)
  }).slice(0, 18)}`;
}

export const cognitiveRolePlanContract = {
  schemaVersion: cognitiveRolePlanSchemaVersion,
  roles: [...cognitiveRuntimeRoles],
  requiredBaseRoles: requiredRolesForRisk(0),
  highRiskRolePolicy:
    "Tier 3+ plans require a security_monitor. Tier 4+ plans also require operator and escalation_agent coverage.",
  separationPolicy:
    "planner, executor, critic, and policy_governor must be assigned to distinct actor ids before execution can be admitted.",
  stepPolicy:
    "Every step requires an assigned role, acceptance criteria, and evidence requirements. Execute steps must use a tool action already allowed by the governed goal."
} as const;

export function buildCognitiveRolePlanAdmission(
  input: CognitiveRolePlanInput,
  now = new Date()
): CognitiveRolePlanAdmissionResult {
  const goalAdmissionResult = buildGovernedGoalAdmission(input.goal, now);
  const fallbackGoalAdmission = goalAdmissionResult.admission;
  if (!goalAdmissionResult.goal) {
    return {
      admission: {
        accepted: false,
        schemaVersion: cognitiveRolePlanSchemaVersion,
        reason: "invalid_goal",
        findings: ["invalid_goal", ...fallbackGoalAdmission.findings],
        goalAdmission: fallbackGoalAdmission,
        maxRiskTier: fallbackGoalAdmission.maxRiskTier,
        requiredRoles: requiredRolesForRisk(fallbackGoalAdmission.maxRiskTier),
        selfApprovalBlocked: false,
        roleCoverage: roleCoverageFor([], requiredRolesForRisk(fallbackGoalAdmission.maxRiskTier))
      }
    };
  }

  const goal = goalAdmissionResult.goal;
  const goalAdmission = goalAdmissionResult.admission;
  const roles = parseRoleAssignments(input.roles);
  const steps = parseSteps(input.steps, goal);
  const requiredRoles = requiredRolesForRisk(goalAdmission.maxRiskTier);
  const coverage = roleCoverageFor(roles, requiredRoles);
  const findings: string[] = [];
  const profiles = profileByAction();

  if (!goalAdmission.accepted) {
    findings.push("goal_admission_denied", ...goalAdmission.findings);
  }

  for (const role of requiredRoles) {
    if (!coverage[role]) {
      findings.push(`missing_role:${role}`);
    }
  }

  const separationActors = separationCriticalRoles.flatMap((role) => {
    const actorId = actorForRole(roles, role);
    return actorId ? [{ role, actorId }] : [];
  });
  for (const left of separationActors) {
    for (const right of separationActors) {
      if (left.role >= right.role) {
        continue;
      }
      if (left.actorId === right.actorId) {
        findings.push(`role_self_approval_risk:${left.role}:${right.role}:${left.actorId}`);
      }
    }
  }

  const assignedRoles = new Set(roles.map((assignment) => assignment.role));
  const allowedTools = new Set(goal.allowedTools);
  for (const step of steps) {
    if (!assignedRoles.has(step.assignedRole)) {
      findings.push(`step_role_unassigned:${step.id}:${step.assignedRole}`);
    }
    if (step.acceptanceCriteria.length === 0) {
      findings.push(`step_missing_acceptance_criteria:${step.id}`);
    }
    if (step.evidenceRequired.length === 0) {
      findings.push(`step_missing_evidence:${step.id}`);
    }
    if (step.kind === "execute") {
      if (!step.toolAction) {
        findings.push(`execute_step_missing_tool:${step.id}`);
      } else if (!allowedTools.has(step.toolAction)) {
        findings.push(`execute_step_tool_not_allowed:${step.id}:${step.toolAction}`);
      } else if (!profiles.has(step.toolAction)) {
        findings.push(`execute_step_unknown_tool:${step.id}:${step.toolAction}`);
      }
    }
  }

  const selfApprovalBlocked = findings.some((finding) => finding.startsWith("role_self_approval_risk:"));
  const plan: CognitiveRolePlan = {
    schemaVersion: cognitiveRolePlanSchemaVersion,
    id: buildPlanId(goal, roles, steps),
    goalId: goal.id,
    createdAt: now.toISOString(),
    roles,
    steps,
    causalChain: buildCausalChain(goal, steps)
  };

  return {
    goal,
    plan,
    admission: {
      accepted: findings.length === 0,
      schemaVersion: cognitiveRolePlanSchemaVersion,
      reason: findings[0] ?? "accepted",
      findings,
      goalAdmission,
      maxRiskTier: goalAdmission.maxRiskTier,
      requiredRoles,
      selfApprovalBlocked,
      roleCoverage: coverage
    }
  };
}
