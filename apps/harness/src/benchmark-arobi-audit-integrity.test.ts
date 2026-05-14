import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRealWorldEngagement } from "./real-world-engagement.js";
import { evaluateLiveGovernedRouteAdmission } from "./governance.js";
import {
  areArobiAuditRoutesContinuous,
  buildArobiAuditMediationHeaders,
  hasArobiAuditOperationalDrift,
  selectArobiAuditLatestReviewRouteRecord,
  type LedgerRecord
} from "./benchmark-arobi-audit-integrity.js";

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
  const governance = evaluateLiveGovernedRouteAdmission({
    action: "actuation-dispatch",
    route: "/api/orchestration/mediate",
    actor: headers["x-immaculate-actor"],
    purpose: headers["x-immaculate-purpose"].split(","),
    consentScope: headers["x-immaculate-consent-scope"],
    approvalRef: headers["x-immaculate-approval-ref"]
  });

  assert.equal(governance.allowed, true);
  assert.equal(headers["x-immaculate-actor"], "benchmark:arobi-audit-integrity");
  assert.match(headers["x-immaculate-approval-ref"], /^operator:benchmark-arobi-audit-integrity:/u);
  assert.match(headers["x-immaculate-operator-summary"], /review-only/u);
  assert.match(headers["x-immaculate-rollback-plan"], /dispatchOnApproval=false/u);
});

test("Arobi audit route continuity scores review routes, not later assessment targets", () => {
  const records: LedgerRecord[] = [
    {
      source: "cognitive-execution",
      decisionSummary: { routeSuggestion: "guarded" },
      ledger: { eventSeq: 1 }
    },
    {
      source: "conversation",
      decisionSummary: { routeSuggestion: "cognitive" },
      selfEvaluation: { status: "completed" },
      ledger: { eventSeq: 2 }
    },
    {
      source: "conversation",
      decisionSummary: { routeSuggestion: "conversation" },
      selfEvaluation: { status: "watch" },
      ledger: { eventSeq: 3 }
    },
    {
      source: "agent-intelligence-assessment",
      decisionSummary: { routeSuggestion: "conversation" },
      selfEvaluation: { status: "watch" },
      ledger: { eventSeq: 4 }
    }
  ];

  const latestReviewRoute = selectArobiAuditLatestReviewRouteRecord(records);

  assert.equal(latestReviewRoute?.source, "conversation");
  assert.equal(latestReviewRoute?.decisionSummary?.routeSuggestion, "cognitive");
  assert.equal(areArobiAuditRoutesContinuous("guarded", latestReviewRoute?.decisionSummary?.routeSuggestion), true);
  assert.equal(areArobiAuditRoutesContinuous("guarded", "conversation"), false);
});

test("Arobi audit operational drift ignores PoI watch assessments but keeps route drift fail-closed", () => {
  const assessmentOnlyDrift: LedgerRecord[] = [
    {
      source: "conversation",
      decisionSummary: { routeSuggestion: "cognitive" },
      selfEvaluation: { status: "completed", driftDetected: false },
      ledger: { eventSeq: 1 }
    },
    {
      source: "agent-intelligence-assessment",
      decisionSummary: { routeSuggestion: "conversation" },
      selfEvaluation: {
        status: "watch",
        driftDetected: true,
        driftReasonCodes: ["runtime_slow_or_faulted", "low_neuro_signal"]
      },
      ledger: { eventSeq: 2 }
    }
  ];
  const operationalDrift: LedgerRecord[] = [
    ...assessmentOnlyDrift,
    {
      source: "conversation",
      decisionSummary: { routeSuggestion: "conversation" },
      selfEvaluation: { status: "watch", driftDetected: true },
      ledger: { eventSeq: 3 }
    }
  ];

  assert.equal(hasArobiAuditOperationalDrift(assessmentOnlyDrift), false);
  assert.equal(hasArobiAuditOperationalDrift(operationalDrift), true);
});
