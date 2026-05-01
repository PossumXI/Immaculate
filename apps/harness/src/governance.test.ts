import assert from "node:assert/strict";
import test from "node:test";
import {
  createGovernanceRegistry,
  evaluateGovernance
} from "./governance.js";

test("governance decisions carry risk-tier metadata", () => {
  const decision = evaluateGovernance({
    action: "actuation-dispatch",
    route: "/api/actuation/dispatch",
    actor: "operator:test",
    purpose: ["actuation-dispatch"],
    consentScope: "system:actuation"
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.riskTier, 5);
  assert.equal(decision.riskClass, "irreversible_or_regulated");
  assert.equal(decision.consentRequired, true);
  assert.equal(decision.approvalRequired, true);
  assert.equal(decision.humanApprovalRequired, true);
});

test("governance policies expose the action risk registry", () => {
  const registry = createGovernanceRegistry();
  const policies = registry.listPolicies();
  const qPublicPolicy = policies.find((policy) => policy.id === "q-public");

  assert.ok(qPublicPolicy);
  assert.equal(qPublicPolicy.riskTier, 2);
  assert.equal(qPublicPolicy.riskClass, "internal_write");
  assert.equal(qPublicPolicy.consentRequired, true);
  assert.equal(qPublicPolicy.rateLimit.requestsPerMinute, 60);

  assert.equal(registry.getStatus().governedActionCount, registry.listGovernedActions().length);
});

test("governance decisions still fail closed on policy mismatches", () => {
  const decision = evaluateGovernance({
    action: "benchmark-publication",
    route: "/api/benchmarks/publish",
    actor: "operator:test",
    purpose: ["dataset-read"],
    consentScope: "system:benchmark"
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "purpose_not_allowed");
  assert.equal(decision.riskTier, 3);
  assert.equal(decision.approvalRequired, true);
});
