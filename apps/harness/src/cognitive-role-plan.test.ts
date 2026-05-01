import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCognitiveRolePlanAdmission,
  cognitiveRolePlanContract
} from "./cognitive-role-plan.js";

const now = new Date("2026-05-01T14:30:00.000Z");

function baseGoalInput() {
  return {
    objective: "Execute a governed cognitive runtime route",
    owner: "operator:gaetano",
    constraints: ["no self-approval", "record every decision"],
    authorityScope: {
      actor: "operator:gaetano",
      consentScope: "system:intelligence",
      purpose: ["cognitive-execution"]
    },
    successCriteria: ["route completes", "critic and governor decisions are recorded"],
    deadline: "2026-05-02T14:30:00.000Z",
    allowedTools: ["cognitive-execution", "cognitive-trace-read"],
    rollbackPlan: "Pause execution and fall back to read-only trace review.",
    auditRequirements: ["goal id", "role plan id", "ledger receipt"]
  };
}

function baseRoles() {
  return [
    { role: "planner", actorId: "agent:planner" },
    { role: "researcher", actorId: "agent:researcher" },
    { role: "executor", actorId: "agent:executor" },
    { role: "verifier", actorId: "agent:verifier" },
    { role: "critic", actorId: "agent:critic" },
    { role: "policy_governor", actorId: "agent:governor" },
    { role: "ledger_recorder", actorId: "agent:ledger" },
    { role: "memory_curator", actorId: "agent:memory" }
  ];
}

test("role plan admission accepts separated base cognitive roles", () => {
  const result = buildCognitiveRolePlanAdmission(
    {
      goal: baseGoalInput(),
      roles: baseRoles()
    },
    now
  );

  assert.ok(result.goal);
  assert.ok(result.plan);
  assert.equal(result.admission.accepted, true);
  assert.equal(result.admission.reason, "accepted");
  assert.equal(result.plan?.schemaVersion, "cognitive-role-plan.v1");
  assert.equal(result.plan?.goalId, result.goal?.id);
  assert.ok(result.plan?.steps.some((step) => step.kind === "execute"));
  assert.ok(result.plan?.causalChain[0].startsWith("Goal:"));
  assert.ok(result.plan?.causalChain.includes("Ledger:recorded-proof"));
});

test("role plan admission denies one actor planning executing critiquing and approving", () => {
  const result = buildCognitiveRolePlanAdmission(
    {
      goal: baseGoalInput(),
      roles: [
        { role: "planner", actorId: "agent:self" },
        { role: "executor", actorId: "agent:self" },
        { role: "verifier", actorId: "agent:verifier" },
        { role: "critic", actorId: "agent:self" },
        { role: "policy_governor", actorId: "agent:self" },
        { role: "ledger_recorder", actorId: "agent:ledger" },
        { role: "memory_curator", actorId: "agent:memory" }
      ]
    },
    now
  );

  assert.equal(result.admission.accepted, false);
  assert.equal(result.admission.selfApprovalBlocked, true);
  assert.ok(
    result.admission.findings.some((finding) =>
      finding.startsWith("role_self_approval_risk:")
    )
  );
});

test("role plan admission requires security and escalation coverage for high-risk tools", () => {
  const result = buildCognitiveRolePlanAdmission(
    {
      goal: {
        ...baseGoalInput(),
        authorityScope: {
          actor: "operator:gaetano",
          consentScope: "system:actuation",
          approvalRef: "operator:gaetano",
          purpose: ["actuation-dispatch"]
        },
        allowedTools: ["actuation-dispatch"]
      },
      roles: [
        ...baseRoles(),
        { role: "security_monitor", actorId: "agent:security" }
      ]
    },
    now
  );

  assert.equal(result.admission.accepted, false);
  assert.equal(result.admission.maxRiskTier, 5);
  assert.ok(result.admission.requiredRoles.includes("operator"));
  assert.ok(result.admission.requiredRoles.includes("escalation_agent"));
  assert.ok(result.admission.findings.includes("missing_role:operator"));
  assert.ok(result.admission.findings.includes("missing_role:escalation_agent"));

  const complete = buildCognitiveRolePlanAdmission(
    {
      goal: {
        ...baseGoalInput(),
        authorityScope: {
          actor: "operator:gaetano",
          consentScope: "system:actuation",
          approvalRef: "operator:gaetano",
          purpose: ["actuation-dispatch"]
        },
        allowedTools: ["actuation-dispatch"]
      },
      roles: [
        ...baseRoles(),
        { role: "security_monitor", actorId: "agent:security" },
        { role: "operator", actorId: "operator:gaetano" },
        { role: "escalation_agent", actorId: "agent:escalation" }
      ]
    },
    now
  );

  assert.equal(complete.admission.accepted, true);
});

test("role plan admission blocks custom execute steps outside the goal envelope", () => {
  const result = buildCognitiveRolePlanAdmission(
    {
      goal: baseGoalInput(),
      roles: baseRoles(),
      steps: [
        {
          kind: "plan",
          assignedRole: "planner",
          summary: "Plan the route.",
          acceptanceCriteria: ["bounded plan exists"],
          evidenceRequired: ["plan receipt"]
        },
        {
          kind: "execute",
          assignedRole: "executor",
          summary: "Attempt an unapproved tool.",
          toolAction: "actuation-dispatch",
          acceptanceCriteria: ["dispatch attempted"],
          evidenceRequired: ["dispatch receipt"]
        }
      ]
    },
    now
  );

  assert.equal(result.admission.accepted, false);
  assert.ok(
    result.admission.findings.some((finding) =>
      finding.includes("execute_step_tool_not_allowed")
    )
  );
});

test("role plan admission surfaces invalid goal admission before role execution", () => {
  const result = buildCognitiveRolePlanAdmission(
    {
      goal: {
        ...baseGoalInput(),
        objective: "",
        successCriteria: []
      },
      roles: baseRoles()
    },
    now
  );

  assert.equal(result.goal, undefined);
  assert.equal(result.plan, undefined);
  assert.equal(result.admission.accepted, false);
  assert.equal(result.admission.reason, "invalid_goal");
  assert.ok(result.admission.findings.includes("invalid_goal"));
  assert.ok(result.admission.findings.includes("missing_objective"));
  assert.ok(result.admission.findings.includes("missing_success_criteria"));
});

test("role plan contract documents required separation policy", () => {
  assert.equal(cognitiveRolePlanContract.schemaVersion, "cognitive-role-plan.v1");
  assert.ok(cognitiveRolePlanContract.requiredBaseRoles.includes("planner"));
  assert.ok(cognitiveRolePlanContract.requiredBaseRoles.includes("memory_curator"));
  assert.match(cognitiveRolePlanContract.separationPolicy, /distinct actor ids/);
  assert.match(cognitiveRolePlanContract.stepPolicy, /Execute steps/);
});
