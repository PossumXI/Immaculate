import assert from "node:assert/strict";
import test from "node:test";
import { governanceActions } from "./governance.js";
import {
  evaluateToolRiskAdmission,
  getGovernedToolAction,
  listGovernedToolActions
} from "./tool-governance.js";

test("governed tool registry covers every governance action exactly once", () => {
  const actions = listGovernedToolActions();
  const actionNames = new Set(actions.map((action) => action.action));

  assert.equal(actions.length, governanceActions.length);
  for (const action of governanceActions) {
    assert.ok(actionNames.has(action), `missing governed tool profile for ${action}`);
  }
});

test("risk metadata classifies read-only and high-risk actions", () => {
  const traceRead = getGovernedToolAction("cognitive-trace-read");
  assert.equal(traceRead.riskTier, 0);
  assert.equal(traceRead.riskClass, "read_only_observation");
  assert.equal(traceRead.consentRequired, false);
  assert.equal(traceRead.approvalRequired, false);

  const actuationDispatch = getGovernedToolAction("actuation-dispatch");
  assert.equal(actuationDispatch.riskTier, 5);
  assert.equal(actuationDispatch.riskClass, "irreversible_or_regulated");
  assert.equal(actuationDispatch.consentRequired, true);
  assert.equal(actuationDispatch.approvalRequired, true);
  assert.equal(actuationDispatch.humanApprovalRequired, true);
  assert.equal(actuationDispatch.rateLimit.maxConcurrentRequests, 1);
});

test("tool admission allows observation without consent", () => {
  assert.deepEqual(evaluateToolRiskAdmission({ action: "event-read" }), {
    allowed: true,
    action: "event-read",
    reason: "allowed",
    riskTier: 0,
    riskClass: "read_only_observation",
    consentRequired: false,
    approvalRequired: false,
    humanApprovalRequired: false,
    minimumConfidence: 0,
    failureHoldThreshold: 8
  });
});

test("tool admission fails closed for unknown or insufficiently governed actions", () => {
  assert.deepEqual(evaluateToolRiskAdmission({ action: "shell" }), {
    allowed: false,
    action: "shell",
    reason: "unknown_tool_action"
  });

  assert.equal(
    evaluateToolRiskAdmission({ action: "cognitive-execution" }).reason,
    "missing_consent_scope"
  );
  assert.equal(
    evaluateToolRiskAdmission({
      action: "benchmark-publication",
      consentScope: "system:benchmark"
    }).reason,
    "missing_approval_ref"
  );
  assert.equal(
    evaluateToolRiskAdmission({
      action: "actuation-device-link",
      consentScope: "system:actuation",
      approvalRef: "auto:planner"
    }).reason,
    "human_approval_required"
  );
});

test("tool admission applies confidence floors and failure holds", () => {
  assert.equal(
    evaluateToolRiskAdmission({
      action: "actuation-dispatch",
      consentScope: "system:actuation",
      approvalRef: "operator:gaetano",
      confidence: 0.5
    }).reason,
    "confidence_below_risk_floor"
  );

  assert.equal(
    evaluateToolRiskAdmission({
      action: "actuation-dispatch",
      consentScope: "system:actuation",
      approvalRef: "operator:gaetano",
      confidence: 0.99,
      recentFailureCount: 1
    }).reason,
    "failure_hold_threshold_reached"
  );

  assert.equal(
    evaluateToolRiskAdmission({
      action: "actuation-dispatch",
      consentScope: "system:actuation",
      approvalRef: "operator:gaetano",
      confidence: 0.99,
      recentFailureCount: 0
    }).reason,
    "allowed"
  );
});
