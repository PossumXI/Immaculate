import assert from "node:assert/strict";
import test from "node:test";
import { resolveModelComparisonTimeoutMs } from "./model-comparison.js";

test("resolveModelComparisonTimeoutMs clamps invalid and extreme values", () => {
  assert.equal(resolveModelComparisonTimeoutMs(undefined, 12_345), 12_345);
  assert.equal(resolveModelComparisonTimeoutMs("", 12_345), 12_345);
  assert.equal(resolveModelComparisonTimeoutMs("not-a-number", 12_345), 12_345);
  assert.equal(resolveModelComparisonTimeoutMs("250", 12_345), 1_000);
  assert.equal(resolveModelComparisonTimeoutMs("900000", 12_345), 600_000);
  assert.equal(resolveModelComparisonTimeoutMs(45_000, 12_345), 45_000);
});
