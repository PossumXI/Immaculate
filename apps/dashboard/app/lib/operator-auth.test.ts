import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardProxyHeaders } from "./operator-auth";

test("dashboard proxy forwards real-world engagement evidence headers", () => {
  const previousApiKey = process.env.IMMACULATE_API_KEY;
  process.env.IMMACULATE_API_KEY = "dashboard-test-key";

  try {
    const request = new Request("http://localhost/api/operator/harness/api/control", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-immaculate-actor": "dashboard",
        "x-immaculate-budget-cents": "0",
        "x-immaculate-consent-scope": "operator:dashboard",
        "x-immaculate-operator-confirmed": "true",
        "x-immaculate-operator-summary": "Dashboard operator control update.",
        "x-immaculate-policy-id": "operator-control-default",
        "x-immaculate-purpose": "operator-control",
        "x-immaculate-receipt-target": "harness:control:dashboard",
        "x-immaculate-rollback-plan": "Restore the last persisted snapshot.",
        "x-immaculate-sanitization-proof": "Operator-reviewed public publication payload."
      }
    });

    const headers = getDashboardProxyHeaders(request);

    assert.equal(headers.get("authorization"), "Bearer dashboard-test-key");
    assert.equal(headers.get("x-immaculate-purpose"), "operator-control");
    assert.equal(headers.get("x-immaculate-policy-id"), "operator-control-default");
    assert.equal(headers.get("x-immaculate-consent-scope"), "operator:dashboard");
    assert.equal(headers.get("x-immaculate-actor"), "dashboard");
    assert.equal(headers.get("x-immaculate-receipt-target"), "harness:control:dashboard");
    assert.equal(headers.get("x-immaculate-operator-summary"), "Dashboard operator control update.");
    assert.equal(headers.get("x-immaculate-operator-confirmed"), "true");
    assert.equal(headers.get("x-immaculate-rollback-plan"), "Restore the last persisted snapshot.");
    assert.equal(
      headers.get("x-immaculate-sanitization-proof"),
      "Operator-reviewed public publication payload."
    );
    assert.equal(headers.get("x-immaculate-budget-cents"), "0");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.IMMACULATE_API_KEY;
    } else {
      process.env.IMMACULATE_API_KEY = previousApiKey;
    }
  }
});
