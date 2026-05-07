import assert from "node:assert/strict";
import { test } from "node:test";
import { createFailureCircuitBreaker, shouldRecordQGatewayCircuitFailure } from "./q-resilience.js";

test("Q gateway contract-invalid failures do not poison the upstream circuit", () => {
  const circuit = createFailureCircuitBreaker({
    failureThreshold: 2,
    cooldownMs: 1_000
  });

  assert.equal(shouldRecordQGatewayCircuitFailure("contract_invalid"), false);
  assert.equal(shouldRecordQGatewayCircuitFailure("transport_timeout"), true);
  assert.equal(shouldRecordQGatewayCircuitFailure(undefined), false);

  if (shouldRecordQGatewayCircuitFailure("contract_invalid")) {
    circuit.recordFailure("contract_invalid");
  }

  assert.deepEqual(circuit.snapshot(), {
    state: "closed",
    consecutiveFailures: 0,
    openedAt: undefined,
    nextProbeAt: undefined,
    lastFailureAt: undefined,
    lastFailureReason: undefined,
    lastSuccessAt: undefined
  });

  if (shouldRecordQGatewayCircuitFailure("transport_timeout")) {
    circuit.recordFailure("transport_timeout");
  }

  assert.equal(circuit.snapshot().consecutiveFailures, 1);
  assert.equal(circuit.snapshot().lastFailureReason, "transport_timeout");
});
