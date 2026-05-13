import assert from "node:assert/strict";
import { test } from "node:test";
import { isVisibleGovernedAuditEntry, versionLooksCompatible } from "./arobi-live-ledger-receipt.js";

test("live ledger classifier accepts public-safe Immaculate showcase records", () => {
  assert.equal(
    isVisibleGovernedAuditEntry(
      {
        entry_id: "flightgear-q-public",
        timestamp: "2026-05-13T19:55:28.622Z",
        sourceLabel: "immaculate_showcase",
        model_id: "q-operator-public-showcase",
        model_version: "n/a",
        input_summary: "Simulator-only public-safe Q decision summary.",
        decision: "Q FlightGear decision: q_cruise",
        network_context: "PUBLIC"
      },
      "3.3.1"
    ),
    true
  );
});

test("live ledger classifier rejects unscoped showcase records", () => {
  assert.equal(
    isVisibleGovernedAuditEntry(
      {
        entry_id: "private-showcase",
        timestamp: "2026-05-13T19:55:28.622Z",
        sourceLabel: "immaculate_showcase",
        model_id: "q-operator-public-showcase",
        model_version: "n/a",
        input_summary: "Private mission trace.",
        decision: "private trace",
        network_context: "PRIVATE"
      },
      "3.3.1"
    ),
    false
  );
  assert.equal(
    isVisibleGovernedAuditEntry(
      {
        entry_id: "wrong-model",
        timestamp: "2026-05-13T19:55:28.622Z",
        sourceLabel: "immaculate_showcase",
        model_id: "unreviewed-model",
        model_version: "n/a",
        input_summary: "Simulator-only public-safe Q decision summary.",
        decision: "Q FlightGear decision: q_cruise",
        network_context: "PUBLIC"
      },
      "3.3.1"
    ),
    false
  );
});

test("live ledger classifier keeps governed audit records version-bound", () => {
  assert.equal(
    isVisibleGovernedAuditEntry(
      {
        entry_id: "control-fabric-compatible",
        timestamp: "2026-05-13T19:55:28.622Z",
        sourceLabel: "control_fabric",
        model_version: "3.3.1"
      },
      "3.3.1"
    ),
    true
  );
  assert.equal(
    isVisibleGovernedAuditEntry(
      {
        entry_id: "control-fabric-na",
        timestamp: "2026-05-13T19:55:28.622Z",
        sourceLabel: "control_fabric",
        model_version: "n/a"
      },
      "3.3.1"
    ),
    false
  );
});

test("version compatibility accepts exact or prefix-compatible network versions only", () => {
  assert.equal(versionLooksCompatible("3.3.1", "3.3.1"), true);
  assert.equal(versionLooksCompatible("3.3.1-build.5", "3.3.1"), true);
  assert.equal(versionLooksCompatible("3.3", "3.3.1"), true);
  assert.equal(versionLooksCompatible("n/a", "3.3.1"), false);
  assert.equal(versionLooksCompatible(undefined, "3.3.1"), false);
});
