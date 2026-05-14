import assert from "node:assert/strict";
import test from "node:test";
import {
  createGovernanceRegistry,
  evaluateGovernance,
  evaluateLiveGovernedRouteAdmission
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

test("live governed route admission requires approval refs for selected high-risk execution routes", () => {
  const missingApproval = evaluateLiveGovernedRouteAdmission({
    action: "actuation-dispatch",
    route: "/api/actuation/dispatch",
    actor: "operator:test",
    purpose: ["actuation-dispatch"],
    consentScope: "system:actuation"
  });
  assert.equal(missingApproval.allowed, false);
  assert.equal(missingApproval.reason, "tool_admission_missing_approval_ref");

  const automatedApproval = evaluateLiveGovernedRouteAdmission({
    action: "actuation-device-link",
    route: "/api/actuation/transports/udp/register",
    actor: "operator:test",
    purpose: ["actuation-device-link"],
    consentScope: "system:actuation",
    approvalRef: "auto:planner"
  });
  assert.equal(automatedApproval.allowed, false);
  assert.equal(automatedApproval.reason, "tool_admission_human_approval_required");

  const operatorApproved = evaluateLiveGovernedRouteAdmission({
    action: "actuation-dispatch",
    route: "/api/actuation/dispatch",
    actor: "operator:test",
    purpose: ["actuation-dispatch"],
    consentScope: "system:actuation",
    approvalRef: "operator:gaetano"
  });
  assert.equal(operatorApproved.allowed, true);
  assert.equal(operatorApproved.approvalRef, "operator:gaetano");
});

test("live governed route admission does not globally gate every tier three route yet", () => {
  const neuroStreaming = evaluateLiveGovernedRouteAdmission({
    action: "neuro-streaming",
    route: "/stream/neuro/live",
    actor: "operator:test",
    purpose: ["neuro-streaming"],
    consentScope: "live-source:dashboard"
  });

  assert.equal(neuroStreaming.allowed, true);
  assert.equal(neuroStreaming.approvalRequired, true);
  assert.equal(neuroStreaming.approvalRef, undefined);
});

test("protection posture reads require founder, operator, audit, or intelligence scope", () => {
  const allowed = evaluateGovernance({
    action: "protection-signal-read",
    route: "/api/protection/posture",
    actor: "founder:test",
    purpose: ["protection-signal-read"],
    consentScope: "founder:gaetano"
  });
  const denied = evaluateGovernance({
    action: "protection-signal-read",
    route: "/api/protection/posture",
    actor: "remote:test",
    purpose: ["protection-signal-read"],
    consentScope: "session:demo"
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.riskTier, 0);
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, "consent_scope_not_allowed");
});
