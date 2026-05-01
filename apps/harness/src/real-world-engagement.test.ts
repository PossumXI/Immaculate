import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyRealWorldEngagement,
  evaluateRealWorldEngagement
} from "./real-world-engagement.js";

test("real-world engagement classifies physical and public behavior separately from basic risk", () => {
  assert.equal(classifyRealWorldEngagement("event-read").mode, "observe-only");
  assert.equal(classifyRealWorldEngagement("benchmark-publication").mode, "public-publication");
  assert.equal(classifyRealWorldEngagement("operator-control").mode, "privileged-control");
  assert.equal(classifyRealWorldEngagement("actuation-dispatch").mode, "physical-actuation");
});

test("physical actuation is blocked until receipts, confirmation, and rollback evidence exist", () => {
  const blocked = evaluateRealWorldEngagement("actuation-dispatch", {
    consentScope: "system:actuation",
    purpose: ["actuation-dispatch"],
    receiptTarget: "runtime/receipts/actuation.ndjson",
    operatorSummary: "Dispatch the current mediated actuation output."
  });

  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.missingEvidence, ["operator_confirmation", "rollback_plan"]);

  const ready = evaluateRealWorldEngagement("actuation-dispatch", {
    consentScope: "system:actuation",
    purpose: ["actuation-dispatch"],
    receiptTarget: "runtime/receipts/actuation.ndjson",
    operatorSummary: "Dispatch the current mediated actuation output.",
    operatorConfirmed: true,
    rollbackPlan: "Reset the transport and preserve the failed delivery receipt."
  });

  assert.equal(ready.allowed, true);
});

test("public publication requires sanitization proof", () => {
  const blocked = evaluateRealWorldEngagement("benchmark-publication", {
    consentScope: "system:benchmark",
    purpose: ["benchmark-publication"],
    receiptTarget: "runtime/receipts/benchmark-publication.ndjson",
    operatorSummary: "Publish a benchmark report.",
    operatorConfirmed: true,
    rollbackPlan: "Supersede or remove the external run."
  });

  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.missingEvidence, ["sanitization_proof"]);
});

test("operator control requires an explicit bounded budget", () => {
  const blocked = evaluateRealWorldEngagement("operator-control", {
    consentScope: "operator:tui",
    purpose: ["operator-control"],
    receiptTarget: "runtime/receipts/operator-control.ndjson",
    operatorSummary: "Update the harness state.",
    operatorConfirmed: true,
    rollbackPlan: "Apply the inverse control command."
  });

  assert.equal(blocked.allowed, false);
  assert.deepEqual(blocked.missingEvidence, ["budget"]);

  const ready = evaluateRealWorldEngagement("operator-control", {
    consentScope: "operator:tui",
    purpose: ["operator-control"],
    receiptTarget: "runtime/receipts/operator-control.ndjson",
    operatorSummary: "Update the harness state.",
    operatorConfirmed: true,
    rollbackPlan: "Apply the inverse control command.",
    budgetCents: 0
  });

  assert.equal(ready.allowed, true);
});
