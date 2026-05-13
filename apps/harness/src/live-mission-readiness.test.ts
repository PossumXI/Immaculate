import test from "node:test";
import assert from "node:assert/strict";
import {
  describeLedgerPrivate,
  resolveArobiLocalPrivateReadiness,
  type ArobiMissionTreasuryStatus
} from "./live-mission-readiness.js";

const READY_VERIFIED_LOG = [
  "Mission treasury signer disabled: legacy hot wallet ignored",
  "Loaded 395 audit entries from disk",
  "AI Decision Audit Ledger initialized (persisted)",
  "API server on http://127.0.0.1:8101"
].join("\n");

const GOVERNANCE_TREASURY: ArobiMissionTreasuryStatus = {
  treasury_wallet: "ARLPhd79954b2219b64cad9742dea7014e2e6156d2",
  pool_balance_aura: 4_000_000_000,
  control_mode: "governance_release",
  wallet_issue: "legacy hot-wallet warning"
};

test("private Arobi readiness accepts governance-controlled treasury release mode", () => {
  const readiness = resolveArobiLocalPrivateReadiness({
    repairOk: true,
    verifiedAuditLedgerCount: 395,
    verifiedLog: READY_VERIFIED_LOG,
    treasuryStatus: GOVERNANCE_TREASURY
  });

  assert.equal(readiness.signerBlocked, true);
  assert.equal(readiness.treasuryGovernanceReady, true);
  assert.equal(readiness.ready, true);

  const ledger = describeLedgerPrivate({
    receipt: {
      proof: {
        privateEntryDelta: 1
      }
    },
    localReady: readiness.ready,
    signerBlocked: readiness.signerBlocked,
    treasuryGovernanceReady: readiness.treasuryGovernanceReady
  });

  assert.equal(ledger.ready, true);
  assert.match(ledger.detail, /governance-controlled/u);
  assert.match(ledger.detail, /legacy mission treasury wallet warning is non-blocking/u);
});

test("private Arobi readiness still blocks signer warnings without governance control proof", () => {
  const readiness = resolveArobiLocalPrivateReadiness({
    repairOk: true,
    verifiedAuditLedgerCount: 395,
    verifiedLog: READY_VERIFIED_LOG,
    treasuryStatus: {
      ...GOVERNANCE_TREASURY,
      control_mode: "hot_wallet"
    }
  });

  assert.equal(readiness.signerBlocked, true);
  assert.equal(readiness.treasuryGovernanceReady, false);
  assert.equal(readiness.ready, false);
});
