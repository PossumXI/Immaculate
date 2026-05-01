import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGovernedGoalAdmission,
  governedGoalStateContract,
  parseGovernedGoalInput,
  transitionGovernedGoal
} from "./goal-state.js";

const futureNow = new Date("2026-05-01T12:00:00.000Z");

function baseGoalInput() {
  return {
    objective: "Ship the governed goal-state admission gate",
    owner: "operator:gaetano",
    constraints: ["no self-approval", "preserve audit trace"],
    authorityScope: {
      actor: "operator:gaetano",
      consentScope: "system:intelligence",
      purpose: ["cognitive-execution"]
    },
    successCriteria: ["schema published", "admission blocks unknown tools"],
    deadline: "2026-05-02T12:00:00.000Z",
    allowedTools: ["cognitive-execution", "cognitive-trace-read"],
    rollbackPlan: "Disable planner use of the goal id and fall back to read-only trace review.",
    auditRequirements: ["decision trace", "ledger receipt"]
  };
}

test("governed goal parser normalizes the full mission contract", () => {
  const parsed = parseGovernedGoalInput(
    {
      ...baseGoalInput(),
      constraints: "no self-approval, preserve audit trace",
      successCriteria: ["schema published", "schema published", "admission blocks unknown tools"]
    },
    futureNow
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  assert.match(parsed.goal.id, /^goal-[a-f0-9]{18}$/);
  assert.equal(parsed.goal.schemaVersion, "governed-goal.v1");
  assert.equal(parsed.goal.status, "draft");
  assert.deepEqual(parsed.goal.constraints, ["no self-approval", "preserve audit trace"]);
  assert.deepEqual(parsed.goal.successCriteria, [
    "schema published",
    "admission blocks unknown tools"
  ]);
  assert.equal(parsed.goal.authorityScope.actor, "operator:gaetano");
  assert.equal(parsed.goal.createdAt, "2026-05-01T12:00:00.000Z");
});

test("governed goal admission accepts bounded goals with low-risk registered tools", () => {
  const result = buildGovernedGoalAdmission(baseGoalInput(), futureNow);

  assert.ok(result.goal);
  assert.equal(result.admission.accepted, true);
  assert.equal(result.admission.reason, "accepted");
  assert.equal(result.admission.maxRiskTier, 2);
  assert.equal(result.admission.approvalRequired, false);
  assert.equal(result.admission.toolDecisions.length, 2);
});

test("governed goal admission fails closed on missing mission fields", () => {
  const result = buildGovernedGoalAdmission(
    {
      objective: "",
      owner: "operator:gaetano",
      authorityScope: {
        consentScope: "system:intelligence"
      }
    },
    futureNow
  );

  assert.equal(result.goal, undefined);
  assert.equal(result.admission.accepted, false);
  assert.equal(result.admission.reason, "invalid_goal");
  assert.ok(result.admission.findings.includes("missing_objective"));
  assert.ok(result.admission.findings.includes("missing_constraints"));
  assert.ok(result.admission.findings.includes("missing_authority_purpose"));
  assert.ok(result.admission.findings.includes("missing_rollback_plan"));
  assert.ok(result.admission.findings.includes("missing_audit_requirements"));
});

test("governed goal admission blocks unknown tools and elapsed deadlines", () => {
  const result = buildGovernedGoalAdmission(
    {
      ...baseGoalInput(),
      deadline: "2026-04-30T12:00:00.000Z",
      allowedTools: ["shell", "cognitive-trace-read"]
    },
    futureNow
  );

  assert.equal(result.admission.accepted, false);
  assert.ok(result.admission.findings.includes("deadline_elapsed"));
  assert.ok(result.admission.findings.includes("unknown_allowed_tool:shell"));
  assert.ok(
    result.admission.findings.includes("tool_admission_blocked:shell:unknown_tool_action")
  );
});

test("governed goal admission requires approval for high-risk tool tiers", () => {
  const withoutApproval = buildGovernedGoalAdmission(
    {
      ...baseGoalInput(),
      authorityScope: {
        actor: "operator:gaetano",
        consentScope: "system:actuation",
        purpose: ["actuation-dispatch"]
      },
      allowedTools: ["actuation-dispatch"]
    },
    futureNow
  );

  assert.equal(withoutApproval.admission.accepted, false);
  assert.equal(withoutApproval.admission.maxRiskTier, 5);
  assert.equal(withoutApproval.admission.humanApprovalRequired, true);
  assert.ok(
    withoutApproval.admission.findings.includes(
      "tool_admission_blocked:actuation-dispatch:missing_approval_ref"
    )
  );

  const withHumanApproval = buildGovernedGoalAdmission(
    {
      ...baseGoalInput(),
      authorityScope: {
        actor: "operator:gaetano",
        consentScope: "system:actuation",
        approvalRef: "operator:gaetano",
        purpose: ["actuation-dispatch"]
      },
      allowedTools: ["actuation-dispatch"]
    },
    futureNow
  );

  assert.equal(withHumanApproval.admission.accepted, true);
  assert.deepEqual(withHumanApproval.admission.requiredApprovals, [
    "actuation-dispatch:human_or_operator"
  ]);
});

test("governed goal transitions prevent terminal-state rewrites", () => {
  const parsed = parseGovernedGoalInput(baseGoalInput(), futureNow);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }

  const active = transitionGovernedGoal(
    parsed.goal,
    "active",
    "planner accepted bounded mission",
    futureNow
  );
  assert.equal(active.allowed, true);
  assert.equal(active.goal?.status, "active");

  const completed = transitionGovernedGoal(
    active.goal!,
    "completed",
    "success criteria satisfied",
    new Date("2026-05-01T12:30:00.000Z")
  );
  assert.equal(completed.allowed, true);
  assert.equal(completed.goal?.updatedAt, "2026-05-01T12:30:00.000Z");

  const rewrite = transitionGovernedGoal(
    completed.goal!,
    "active",
    "reopen without new goal",
    new Date("2026-05-01T12:31:00.000Z")
  );
  assert.equal(rewrite.allowed, false);
  assert.deepEqual(rewrite.findings, ["transition_not_allowed:completed->active"]);
});

test("governed goal contract publishes required fields and transitions", () => {
  assert.equal(governedGoalStateContract.schemaVersion, "governed-goal.v1");
  assert.ok(governedGoalStateContract.requiredFields.includes("authorityScope.consentScope"));
  assert.deepEqual(governedGoalStateContract.transitionPolicy.draft, ["active", "cancelled"]);
  assert.match(governedGoalStateContract.toolPolicy, /risk-tier registry/);
});
