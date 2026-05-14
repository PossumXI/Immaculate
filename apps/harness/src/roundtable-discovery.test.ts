import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  collectRoundtableRepoAuditFindings,
  resolveRoundtableRepoRoot
} from "./roundtable.js";

test("roundtable repo root resolver prefers explicit env roots", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "roundtable-root-resolver-"));
  const candidate = path.join(tempRoot, "candidate");
  mkdirSync(candidate, { recursive: true });

  try {
    assert.equal(resolveRoundtableRepoRoot("  D:\\explicit\\Asgard  ", [candidate]), "D:\\explicit\\Asgard");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("roundtable repo root resolver chooses the first existing candidate", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "roundtable-root-resolver-"));
  const preferred = path.join(tempRoot, "preferred");
  const fallback = path.join(tempRoot, "fallback");
  mkdirSync(fallback, { recursive: true });

  try {
    assert.equal(resolveRoundtableRepoRoot(undefined, [preferred, fallback]), fallback);

    mkdirSync(preferred, { recursive: true });

    assert.equal(resolveRoundtableRepoRoot(undefined, [preferred, fallback]), preferred);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("roundtable Asgard audit recognizes current lane-aware audit record wiring", async () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "roundtable-asgard-audit-"));
  mkdirSync(path.join(tempRoot, "internal", "cortex", "audit"), { recursive: true });
  mkdirSync(path.join(tempRoot, "internal", "cortex"), { recursive: true });
  mkdirSync(path.join(tempRoot, "cmd", "nysus"), { recursive: true });
  writeFileSync(
    path.join(tempRoot, "internal", "cortex", "audit", "ledger_client.go"),
    [
      'const auditRoute = "/api/v1/audit/record"',
      "type AuditRecordRequest struct {",
      "  Lane string",
      "  Metadata map[string]string",
      "}",
      "func (e AuditEvent) toBoundedAuditMetadata() map[string]string { return nil }"
    ].join("\n"),
    "utf8"
  );
  writeFileSync(
    path.join(tempRoot, "internal", "cortex", "orchestrator.go"),
    [
      "func (o *Orchestrator) logToChains() {",
      "  audit := ChainAudit{PublicChain: false}",
      "  event := o.ledger.NewEvent(\"STRIKE\", \"cortex\", \"Classified defense decision authorized\", \"bounded\")",
      "  o.ledger.Log(event)",
      "  _ = audit",
      "}"
    ].join("\n"),
    "utf8"
  );
  writeFileSync(path.join(tempRoot, "cmd", "nysus", "main.go"), "package main\n", "utf8");

  try {
    const findings = await collectRoundtableRepoAuditFindings({
      repoId: "asgard",
      repoRoot: tempRoot,
      repoSha: `test-${process.pid}-${Date.now()}`
    });

    assert.equal(
      findings.some((finding) => finding.id === "arobi-audit-record-lane-metadata"),
      true
    );
    assert.equal(
      findings.some((finding) => finding.id === "single-ledger-write-path"),
      false
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
