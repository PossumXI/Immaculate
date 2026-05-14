import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedDashboardHarnessDeletePath } from "./route";

test("dashboard harness proxy only allows governed delete routes", () => {
  assert.equal(isAllowedDashboardHarnessDeletePath("/api/federation/peers/peer-1"), true);
  assert.equal(isAllowedDashboardHarnessDeletePath("/api/nodes/node-1"), true);

  assert.equal(isAllowedDashboardHarnessDeletePath("/api/federation/peers"), false);
  assert.equal(isAllowedDashboardHarnessDeletePath("/api/federation/peers/peer-1/leases"), false);
  assert.equal(isAllowedDashboardHarnessDeletePath("/api/nodes/node-1/workers"), false);
  assert.equal(isAllowedDashboardHarnessDeletePath("/api/control"), false);
  assert.equal(isAllowedDashboardHarnessDeletePath("/stream"), false);
});
