import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendCausalTraceGraphRecord,
  buildCausalTraceGraphAdmission,
  causalTraceGraphContract,
  inspectCausalTraceGraphLedger,
  inspectCausalTraceGraphRecords,
  readCausalTraceGraphRecords,
  type CausalTraceGraphRecord
} from "./causal-trace-graph.js";

const now = new Date("2026-05-01T15:00:00.000Z");

function goalInput(objective = "Execute an auditable governed route") {
  return {
    objective,
    owner: "operator:gaetano",
    constraints: ["no self-approval", "preserve every receipt"],
    authorityScope: {
      actor: "operator:gaetano",
      consentScope: "system:intelligence",
      purpose: ["cognitive-execution"]
    },
    successCriteria: ["route completes", "trace graph is queryable"],
    deadline: "2026-05-02T15:00:00.000Z",
    allowedTools: ["cognitive-execution", "cognitive-trace-read"],
    rollbackPlan: "Pause execution and preserve the causal graph for review.",
    auditRequirements: ["goal id", "role plan id", "graph hash"]
  };
}

function roleAssignments() {
  return [
    { role: "planner", actorId: "agent:planner" },
    { role: "researcher", actorId: "agent:researcher" },
    { role: "executor", actorId: "agent:executor" },
    { role: "verifier", actorId: "agent:verifier" },
    { role: "critic", actorId: "agent:critic" },
    { role: "policy_governor", actorId: "agent:governor" },
    { role: "ledger_recorder", actorId: "agent:ledger" },
    { role: "memory_curator", actorId: "agent:memory" }
  ];
}

test("causal trace graph admission materializes goal-plan-step-tool-memory-ledger chain", () => {
  const result = buildCausalTraceGraphAdmission(
    {
      goal: goalInput(),
      roles: roleAssignments()
    },
    now
  );

  assert.ok(result.goal);
  assert.ok(result.plan);
  assert.ok(result.graph);
  assert.equal(result.admission.accepted, true);
  assert.equal(result.graph?.schemaVersion, "causal-trace-graph.v1");
  assert.equal(result.graph?.goalId, result.goal?.id);
  assert.equal(result.graph?.planId, result.plan?.id);

  const kinds = new Set(result.graph?.nodes.map((node) => node.kind));
  for (const kind of ["goal", "governance", "plan", "step", "tool", "assessment", "memory", "ledger"]) {
    assert.ok(kinds.has(kind as never), `missing ${kind} node`);
  }
  assert.ok(result.graph?.edges.some((edge) => edge.kind === "uses_tool"));
  assert.ok(result.graph?.edges.some((edge) => edge.kind === "updates_memory"));
  assert.ok(result.graph?.edges.some((edge) => edge.kind === "records_proof"));
  assert.ok(result.graph?.chain.at(0)?.startsWith("goal:"));
  assert.ok(result.graph?.chain.at(-1)?.startsWith("ledger:"));
});

test("causal trace graph admission refuses invalid role-plan admission", () => {
  const result = buildCausalTraceGraphAdmission(
    {
      goal: goalInput(),
      roles: [
        { role: "planner", actorId: "agent:self" },
        { role: "executor", actorId: "agent:self" },
        { role: "verifier", actorId: "agent:verifier" },
        { role: "critic", actorId: "agent:self" },
        { role: "policy_governor", actorId: "agent:self" },
        { role: "ledger_recorder", actorId: "agent:ledger" },
        { role: "memory_curator", actorId: "agent:memory" }
      ]
    },
    now
  );

  assert.equal(result.admission.accepted, false);
  assert.equal(result.graph, undefined);
  assert.ok(
    result.admission.findings.some((finding) =>
      finding.startsWith("role_self_approval_risk:")
    )
  );
});

test("causal trace graph persists append-only records and filters by goal", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "immaculate-trace-graph-"));
  try {
    const first = buildCausalTraceGraphAdmission(
      {
        goal: goalInput("First governed route"),
        roles: roleAssignments()
      },
      now
    );
    const second = buildCausalTraceGraphAdmission(
      {
        goal: goalInput("Second governed route"),
        roles: roleAssignments()
      },
      new Date("2026-05-01T15:01:00.000Z")
    );

    assert.ok(first.graph);
    assert.ok(second.graph);
    const firstRecord = await appendCausalTraceGraphRecord({ rootDir, graph: first.graph! });
    const secondRecord = await appendCausalTraceGraphRecord({ rootDir, graph: second.graph! });

    assert.equal(firstRecord.ledger.eventSeq, 1);
    assert.equal(secondRecord.ledger.eventSeq, 2);
    assert.equal(secondRecord.ledger.parentGraphHash, firstRecord.ledger.graphHash);

    const all = await readCausalTraceGraphRecords({ rootDir });
    assert.deepEqual(all.map((record) => record.id), [secondRecord.id, firstRecord.id]);

    const filtered = await readCausalTraceGraphRecords({
      rootDir,
      goalId: firstRecord.goalId
    });
    assert.deepEqual(filtered.map((record) => record.id), [firstRecord.id]);

    const report = await inspectCausalTraceGraphLedger(rootDir);
    assert.equal(report.status, "verified");
    assert.equal(report.valid, true);
    assert.equal(report.graphCount, 2);
    assert.equal(report.headGraphId, secondRecord.id);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("causal trace graph integrity detects tampered hashes and missing required nodes", () => {
  const result = buildCausalTraceGraphAdmission(
    {
      goal: goalInput(),
      roles: roleAssignments()
    },
    now
  );
  assert.ok(result.graph);
  const record: CausalTraceGraphRecord = {
    ...result.graph!,
    nodes: result.graph!.nodes.filter((node) => node.kind !== "memory"),
    ledger: {
      eventSeq: 1,
      graphHash: "tampered"
    }
  };

  const report = inspectCausalTraceGraphRecords([record], "2026-05-01T15:10:00.000Z");
  assert.equal(report.status, "invalid");
  assert.equal(report.valid, false);
  assert.ok(report.findings.some((finding) => finding.code === "graph_hash_mismatch"));
  assert.ok(report.findings.some((finding) => finding.code === "required_node_missing"));
});

test("causal trace graph contract documents queryable proof policy", () => {
  assert.equal(causalTraceGraphContract.schemaVersion, "causal-trace-graph.v1");
  assert.ok(causalTraceGraphContract.nodeKinds.includes("memory"));
  assert.ok(causalTraceGraphContract.edgeKinds.includes("records_proof"));
  assert.match(causalTraceGraphContract.chainPolicy, /goal -> governance -> plan/);
  assert.match(causalTraceGraphContract.persistencePolicy, /parent hash chain/);
});
