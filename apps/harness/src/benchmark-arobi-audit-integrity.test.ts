import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRealWorldEngagement } from "./real-world-engagement.js";
import { buildArobiAuditMediationHeaders } from "./benchmark-arobi-audit-integrity.js";

test("Arobi audit benchmark mediation headers satisfy engagement evidence", () => {
  const headers = buildArobiAuditMediationHeaders({
    scenarioId: "critical-integrity-hold",
    sessionScope: "session:arobi-audit-critical-integrity-hold-test"
  });

  const decision = evaluateRealWorldEngagement("actuation-dispatch", {
    consentScope: headers["x-immaculate-consent-scope"],
    purpose: headers["x-immaculate-purpose"].split(","),
    receiptTarget: headers["x-immaculate-receipt-target"],
    operatorSummary: headers["x-immaculate-operator-summary"],
    operatorConfirmed: headers["x-immaculate-operator-confirmed"] === "true",
    rollbackPlan: headers["x-immaculate-rollback-plan"]
  });

  assert.equal(decision.allowed, true);
  assert.equal(headers["x-immaculate-actor"], "benchmark:arobi-audit-integrity");
  assert.match(headers["x-immaculate-operator-summary"], /review-only/u);
  assert.match(headers["x-immaculate-rollback-plan"], /dispatchOnApproval=false/u);
});
