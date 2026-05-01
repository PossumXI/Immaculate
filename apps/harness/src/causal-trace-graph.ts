import path from "node:path";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  buildCognitiveRolePlanAdmission,
  type CognitiveRolePlan,
  type CognitiveRolePlanAdmissionDecision,
  type CognitiveRolePlanInput
} from "./cognitive-role-plan.js";
import type { GovernedGoal } from "./goal-state.js";
import { sha256Json } from "./utils.js";

export const causalTraceGraphSchemaVersion = "causal-trace-graph.v1";

export const causalTraceNodeKinds = [
  "goal",
  "governance",
  "plan",
  "step",
  "tool",
  "assessment",
  "memory",
  "ledger"
] as const;

export type CausalTraceNodeKind = (typeof causalTraceNodeKinds)[number];

export const causalTraceEdgeKinds = [
  "admits",
  "plans",
  "contains",
  "depends_on",
  "uses_tool",
  "assesses",
  "updates_memory",
  "records_proof"
] as const;

export type CausalTraceEdgeKind = (typeof causalTraceEdgeKinds)[number];

export type CausalTraceNode = {
  id: string;
  kind: CausalTraceNodeKind;
  label: string;
  createdAt: string;
  refs?: Record<string, string>;
  metadata?: Record<string, unknown>;
};

export type CausalTraceEdge = {
  id: string;
  from: string;
  to: string;
  kind: CausalTraceEdgeKind;
  label?: string;
  createdAt: string;
};

export type CausalTraceGraph = {
  schemaVersion: typeof causalTraceGraphSchemaVersion;
  id: string;
  goalId: string;
  planId: string;
  createdAt: string;
  nodes: CausalTraceNode[];
  edges: CausalTraceEdge[];
  chain: string[];
};

export type CausalTraceGraphRecord = CausalTraceGraph & {
  ledger: {
    eventSeq: number;
    parentGraphHash?: string;
    graphHash: string;
  };
};

export type CausalTraceGraphAdmissionResult = {
  goal?: GovernedGoal;
  plan?: CognitiveRolePlan;
  graph?: CausalTraceGraph;
  admission: CognitiveRolePlanAdmissionDecision;
};

export type CausalTraceGraphIntegrityFinding = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  eventSeq?: number;
  graphId?: string;
};

export type CausalTraceGraphIntegrityReport = {
  checkedAt: string;
  status: "verified" | "degraded" | "invalid";
  valid: boolean;
  graphCount: number;
  headGraphHash?: string;
  headGraphId?: string;
  findingCount: number;
  findings: CausalTraceGraphIntegrityFinding[];
};

type PriorGraphRecord = {
  ledger?: {
    eventSeq?: number;
    graphHash?: string;
  };
};

const TRACE_GRAPH_LOCK_RETRY_MS = 25;
const TRACE_GRAPH_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_TRACE_GRAPH_LIMIT = 100;

function graphPath(rootDir: string): string {
  return path.join(rootDir, "arobi-network", "causal-trace-graph.ndjson");
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function edgeId(from: string, to: string, kind: CausalTraceEdgeKind): string {
  return `edge-${sha256Json({ from, to, kind }).slice(0, 14)}`;
}

function graphId(goalId: string, planId: string, nodes: CausalTraceNode[], edges: CausalTraceEdge[]): string {
  return `graph-${sha256Json({
    goalId,
    planId,
    nodes: nodes.map((node) => `${node.kind}:${node.id}`),
    edges: edges.map((edge) => `${edge.kind}:${edge.from}->${edge.to}`)
  }).slice(0, 18)}`;
}

function normalizeJsonHashValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function graphHash(graph: CausalTraceGraph, eventSeq: number, parentGraphHash?: string): string {
  return sha256Json(
    normalizeJsonHashValue({
      schemaVersion: graph.schemaVersion,
      id: graph.id,
      goalId: graph.goalId,
      planId: graph.planId,
      createdAt: graph.createdAt,
      nodes: graph.nodes,
      edges: graph.edges,
      chain: graph.chain,
      eventSeq,
      parentGraphHash
    })
  );
}

async function readLastNonEmptyLine(filePath: string): Promise<string | null> {
  try {
    const handle = await open(filePath, "r");
    try {
      const stats = await handle.stat();
      if (stats.size <= 0) {
        return null;
      }
      let position = stats.size;
      let buffer = "";
      while (position > 0) {
        const chunkSize = Math.min(4096, position);
        position -= chunkSize;
        const chunk = Buffer.alloc(chunkSize);
        const { bytesRead } = await handle.read(chunk, 0, chunkSize, position);
        buffer = chunk.toString("utf8", 0, bytesRead) + buffer;
        const trimmedBuffer = buffer.trimEnd();
        if (trimmedBuffer.includes("\n") || position === 0) {
          const lines = trimmedBuffer
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
          return lines.at(-1) ?? null;
        }
      }
      return null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

async function withTraceGraphFileLock<T>(
  filePath: string,
  writer: () => Promise<T>
): Promise<T> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + TRACE_GRAPH_LOCK_TIMEOUT_MS;
  while (true) {
    let handle;
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for causal trace graph lock ${path.basename(lockPath)}: ${
            error instanceof Error ? error.message : "unknown lock failure"
          }`
        );
      }
      await delay(TRACE_GRAPH_LOCK_RETRY_MS);
      continue;
    }
    try {
      return await writer();
    } finally {
      await handle.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }
}

async function appendTraceGraphLine(
  filePath: string,
  record: CausalTraceGraphRecord
): Promise<void> {
  const handle = await open(filePath, "a");
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function chainEntry(kind: CausalTraceNodeKind, id: string, label: string): string {
  return `${kind}:${id}:${label}`;
}

export const causalTraceGraphContract = {
  schemaVersion: causalTraceGraphSchemaVersion,
  nodeKinds: [...causalTraceNodeKinds],
  edgeKinds: [...causalTraceEdgeKinds],
  chainPolicy:
    "Every graph must connect goal -> governance -> plan -> step/tool -> assessment -> memory -> ledger so reviewers can inspect why an action happened.",
  persistencePolicy:
    "Graphs are appended to arobi-network/causal-trace-graph.ndjson with a parent hash chain and integrity inspection."
} as const;

export function buildCausalTraceGraph(options: {
  goal: GovernedGoal;
  plan: CognitiveRolePlan;
  admission: CognitiveRolePlanAdmissionDecision;
  now?: Date;
}): CausalTraceGraph {
  const createdAt = (options.now ?? new Date()).toISOString();
  const goalNodeId = `goal:${options.goal.id}`;
  const governanceNodeId = `governance:${options.goal.id}:admission`;
  const planNodeId = `plan:${options.plan.id}`;
  const assessmentNodeId = `assessment:${options.plan.id}`;
  const memoryNodeId = `memory:${options.goal.id}`;
  const ledgerNodeId = `ledger:${options.goal.id}`;

  const nodes: CausalTraceNode[] = [
    {
      id: goalNodeId,
      kind: "goal",
      label: options.goal.objective,
      createdAt,
      refs: { goalId: options.goal.id },
      metadata: {
        owner: options.goal.owner,
        status: options.goal.status,
        deadline: options.goal.deadline,
        allowedTools: options.goal.allowedTools
      }
    },
    {
      id: governanceNodeId,
      kind: "governance",
      label: options.admission.accepted ? "goal and role plan admitted" : options.admission.reason,
      createdAt,
      refs: { goalId: options.goal.id, planId: options.plan.id },
      metadata: {
        accepted: options.admission.accepted,
        findings: options.admission.findings,
        maxRiskTier: options.admission.maxRiskTier,
        requiredRoles: options.admission.requiredRoles
      }
    },
    {
      id: planNodeId,
      kind: "plan",
      label: "role-separated execution plan",
      createdAt,
      refs: { goalId: options.goal.id, planId: options.plan.id },
      metadata: {
        roleCount: options.plan.roles.length,
        stepCount: options.plan.steps.length,
        roles: options.plan.roles.map((role) => `${role.role}:${role.actorId}`)
      }
    },
    ...options.plan.steps.map<CausalTraceNode>((step) => ({
      id: `step:${step.id}`,
      kind: "step",
      label: step.summary,
      createdAt,
      refs: { goalId: options.goal.id, planId: options.plan.id, stepId: step.id },
      metadata: {
        order: step.order,
        kind: step.kind,
        assignedRole: step.assignedRole,
        toolAction: step.toolAction,
        acceptanceCriteria: step.acceptanceCriteria,
        evidenceRequired: step.evidenceRequired
      }
    })),
    ...options.plan.steps
      .filter((step) => Boolean(step.toolAction))
      .map<CausalTraceNode>((step) => ({
        id: `tool:${step.toolAction}`,
        kind: "tool",
        label: step.toolAction ?? "unbound tool",
        createdAt,
        refs: { goalId: options.goal.id, planId: options.plan.id },
        metadata: {
          allowedByGoal: options.goal.allowedTools.includes(step.toolAction ?? "")
        }
      })),
    {
      id: assessmentNodeId,
      kind: "assessment",
      label: "verifier and critic score execution result",
      createdAt,
      refs: { goalId: options.goal.id, planId: options.plan.id },
      metadata: {
        verifierRequired: true,
        criticRequired: true,
        policyGovernorRequired: true
      }
    },
    {
      id: memoryNodeId,
      kind: "memory",
      label: "curated lessons retained for future behavior",
      createdAt,
      refs: { goalId: options.goal.id, planId: options.plan.id },
      metadata: {
        layers: ["working", "episodic", "semantic", "procedural"],
        policyAdjustedFutureBehavior: true
      }
    },
    {
      id: ledgerNodeId,
      kind: "ledger",
      label: "proof and receipts recorded for audit",
      createdAt,
      refs: { goalId: options.goal.id, planId: options.plan.id },
      metadata: {
        receiptRequired: true,
        replayable: true
      }
    }
  ];

  const edges: CausalTraceEdge[] = [
    {
      id: edgeId(goalNodeId, governanceNodeId, "admits"),
      from: goalNodeId,
      to: governanceNodeId,
      kind: "admits",
      createdAt
    },
    {
      id: edgeId(governanceNodeId, planNodeId, "plans"),
      from: governanceNodeId,
      to: planNodeId,
      kind: "plans",
      createdAt
    },
    ...options.plan.steps.map<CausalTraceEdge>((step) => ({
      id: edgeId(planNodeId, `step:${step.id}`, "contains"),
      from: planNodeId,
      to: `step:${step.id}`,
      kind: "contains",
      createdAt
    })),
    ...options.plan.steps.flatMap<CausalTraceEdge>((step) =>
      step.dependsOn.map((dependency) => ({
        id: edgeId(`step:${dependency}`, `step:${step.id}`, "depends_on"),
        from: `step:${dependency}`,
        to: `step:${step.id}`,
        kind: "depends_on",
        createdAt
      }))
    ),
    ...options.plan.steps
      .filter((step) => Boolean(step.toolAction))
      .map<CausalTraceEdge>((step) => ({
        id: edgeId(`step:${step.id}`, `tool:${step.toolAction}`, "uses_tool"),
        from: `step:${step.id}`,
        to: `tool:${step.toolAction}`,
        kind: "uses_tool",
        createdAt
      })),
    ...options.plan.steps.map<CausalTraceEdge>((step) => ({
      id: edgeId(`step:${step.id}`, assessmentNodeId, "assesses"),
      from: `step:${step.id}`,
      to: assessmentNodeId,
      kind: "assesses",
      createdAt
    })),
    {
      id: edgeId(assessmentNodeId, memoryNodeId, "updates_memory"),
      from: assessmentNodeId,
      to: memoryNodeId,
      kind: "updates_memory",
      createdAt
    },
    {
      id: edgeId(memoryNodeId, ledgerNodeId, "records_proof"),
      from: memoryNodeId,
      to: ledgerNodeId,
      kind: "records_proof",
      createdAt
    }
  ];

  const uniqueNodes = uniqueById(nodes);
  const uniqueEdges = uniqueById(edges);
  const chain = [
    chainEntry("goal", goalNodeId, options.goal.objective),
    chainEntry("governance", governanceNodeId, options.admission.reason),
    chainEntry("plan", planNodeId, options.plan.id),
    ...options.plan.steps.map((step) =>
      chainEntry("step", `step:${step.id}`, step.toolAction ?? step.kind)
    ),
    ...options.plan.steps
      .filter((step) => Boolean(step.toolAction))
      .map((step) => chainEntry("tool", `tool:${step.toolAction}`, step.toolAction ?? "")),
    chainEntry("assessment", assessmentNodeId, "verifier+critic"),
    chainEntry("memory", memoryNodeId, "curated-lessons"),
    chainEntry("ledger", ledgerNodeId, "recorded-proof")
  ];

  return {
    schemaVersion: causalTraceGraphSchemaVersion,
    id: graphId(options.goal.id, options.plan.id, uniqueNodes, uniqueEdges),
    goalId: options.goal.id,
    planId: options.plan.id,
    createdAt,
    nodes: uniqueNodes,
    edges: uniqueEdges,
    chain
  };
}

export function buildCausalTraceGraphAdmission(
  input: CognitiveRolePlanInput,
  now = new Date()
): CausalTraceGraphAdmissionResult {
  const rolePlanResult = buildCognitiveRolePlanAdmission(input, now);
  if (!rolePlanResult.goal || !rolePlanResult.plan || !rolePlanResult.admission.accepted) {
    return {
      goal: rolePlanResult.goal,
      plan: rolePlanResult.plan,
      admission: rolePlanResult.admission
    };
  }

  return {
    goal: rolePlanResult.goal,
    plan: rolePlanResult.plan,
    admission: rolePlanResult.admission,
    graph: buildCausalTraceGraph({
      goal: rolePlanResult.goal,
      plan: rolePlanResult.plan,
      admission: rolePlanResult.admission,
      now
    })
  };
}

export async function appendCausalTraceGraphRecord(options: {
  rootDir: string;
  graph: CausalTraceGraph;
}): Promise<CausalTraceGraphRecord> {
  const filePath = graphPath(options.rootDir);
  return withTraceGraphFileLock(filePath, async () => {
    const previousLine = await readLastNonEmptyLine(filePath);
    const previousRecord = previousLine ? (JSON.parse(previousLine) as PriorGraphRecord) : undefined;
    const eventSeq = (previousRecord?.ledger?.eventSeq ?? 0) + 1;
    const parentGraphHash = previousRecord?.ledger?.graphHash;
    const record: CausalTraceGraphRecord = {
      ...options.graph,
      ledger: {
        eventSeq,
        parentGraphHash,
        graphHash: graphHash(options.graph, eventSeq, parentGraphHash)
      }
    };
    await appendTraceGraphLine(filePath, record);
    return record;
  });
}

export async function readCausalTraceGraphRecords(options: {
  rootDir: string;
  goalId?: string;
  limit?: number;
}): Promise<CausalTraceGraphRecord[]> {
  const filePath = graphPath(options.rootDir);
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_TRACE_GRAPH_LIMIT, 500));
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CausalTraceGraphRecord)
    .filter((record) => !options.goalId || record.goalId === options.goalId)
    .slice(-limit)
    .reverse();

  return records;
}

export function inspectCausalTraceGraphRecords(
  records: CausalTraceGraphRecord[],
  checkedAt = new Date().toISOString()
): CausalTraceGraphIntegrityReport {
  const findings: CausalTraceGraphIntegrityFinding[] = [];
  const seenGraphIds = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (seenGraphIds.has(record.id)) {
      findings.push({
        code: "duplicate_graph_id",
        severity: "critical",
        message: `duplicate graph id ${record.id}`,
        eventSeq: record.ledger.eventSeq,
        graphId: record.id
      });
    } else {
      seenGraphIds.add(record.id);
    }

    const expectedParentHash = index > 0 ? records[index - 1]?.ledger.graphHash : undefined;
    if ((record.ledger.parentGraphHash ?? undefined) !== (expectedParentHash ?? undefined)) {
      findings.push({
        code: "graph_chain_mismatch",
        severity: "critical",
        message: `graph ${record.id} parentGraphHash does not match previous graph hash`,
        eventSeq: record.ledger.eventSeq,
        graphId: record.id
      });
    }

    const expectedSeq = index + 1;
    if (record.ledger.eventSeq !== expectedSeq) {
      findings.push({
        code: "graph_seq_mismatch",
        severity: "warning",
        message: `graph ${record.id} has seq ${record.ledger.eventSeq} but expected ${expectedSeq}`,
        eventSeq: record.ledger.eventSeq,
        graphId: record.id
      });
    }

    const recomputed = graphHash(
      {
        schemaVersion: record.schemaVersion,
        id: record.id,
        goalId: record.goalId,
        planId: record.planId,
        createdAt: record.createdAt,
        nodes: record.nodes,
        edges: record.edges,
        chain: record.chain
      },
      record.ledger.eventSeq,
      record.ledger.parentGraphHash
    );
    if (record.ledger.graphHash !== recomputed) {
      findings.push({
        code: "graph_hash_mismatch",
        severity: "critical",
        message: `graph ${record.id} hash does not match recomputed payload hash`,
        eventSeq: record.ledger.eventSeq,
        graphId: record.id
      });
    }

    const requiredKinds: CausalTraceNodeKind[] = [
      "goal",
      "governance",
      "plan",
      "step",
      "assessment",
      "memory",
      "ledger"
    ];
    const nodeKinds = new Set(record.nodes.map((node) => node.kind));
    for (const kind of requiredKinds) {
      if (!nodeKinds.has(kind)) {
        findings.push({
          code: "required_node_missing",
          severity: "critical",
          message: `graph ${record.id} is missing required ${kind} node`,
          eventSeq: record.ledger.eventSeq,
          graphId: record.id
        });
      }
    }
  }

  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  return {
    checkedAt,
    status: criticalCount > 0 ? "invalid" : findings.length > 0 ? "degraded" : "verified",
    valid: criticalCount === 0,
    graphCount: records.length,
    headGraphHash: records.at(-1)?.ledger.graphHash,
    headGraphId: records.at(-1)?.id,
    findingCount: findings.length,
    findings
  };
}

export async function inspectCausalTraceGraphLedger(rootDir: string): Promise<CausalTraceGraphIntegrityReport> {
  const records = await readCausalTraceGraphRecords({
    rootDir,
    limit: 500
  });
  return inspectCausalTraceGraphRecords([...records].reverse());
}
