import path from "node:path";
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import type { GuardVerdict, GovernancePressureLevel } from "@immaculate/core";
import { sha256Hash, sha256Json } from "./utils.js";

type DecisionTraceSource =
  | "q-api"
  | "cognitive-execution"
  | "conversation"
  | "benchmark"
  | "orchestration-arbitration"
  | "orchestration-schedule"
  | "roundtable-runtime";

type DecisionTracePrincipal = {
  kind: string;
  subject: string;
  keyId?: string;
  label?: string;
};

type DecisionTraceInput = {
  decisionTraceId?: string;
  source: DecisionTraceSource;
  sessionId?: string;
  executionId?: string;
  conversationId?: string;
  release: {
    buildId: string;
    gitShortSha: string;
    modelName: string;
    foundationModel: string;
    trainingBundleId?: string;
  };
  policy: {
    consentScope?: string;
    qRoutingDirective?: string;
    governancePressure?: GovernancePressureLevel;
    routeMode?: string;
    targetNodeId?: string;
    selectedLayerId?: string;
    selectedWorkerId?: string;
    selectedWorkerLabel?: string;
    selectedWorkerProfile?: string;
    selectedWorkerNodeId?: string;
    guardVerdict?: GuardVerdict;
    failureClass?: string;
  };
  evidence: {
    objectiveDigest?: string;
    contextDigest?: string;
    promptDigest?: string;
    responseDigest?: string;
    sourceIds?: string[];
    evidenceDigest?: string;
    contextFingerprint?: string;
  };
  decisionSummary: {
    routeSuggestion?: string;
    reasonSummary?: string;
    commitStatement?: string;
    responsePreview?: string;
  };
  selfEvaluation?: {
    status?: string;
    driftDetected?: boolean;
    driftReasonCodes?: string[];
    baselineSuiteId?: string;
    comparisonSuiteId?: string;
    failedAssertions?: number;
  };
  principal?: DecisionTracePrincipal;
};

export type DecisionTraceRecord = DecisionTraceInput & {
  generatedAt: string;
  decisionTraceId: string;
  ledger: {
    eventSeq: number;
    parentEventHash?: string;
    eventHash: string;
  };
};

export type DecisionTraceIntegrityFinding = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  eventSeq?: number;
  decisionTraceId?: string;
};

export type DecisionTraceIntegrityReport = {
  checkedAt: string;
  status: "verified" | "degraded" | "invalid";
  valid: boolean;
  eventCount: number;
  headEventHash?: string;
  headDecisionTraceId?: string;
  findingCount: number;
  findings: DecisionTraceIntegrityFinding[];
};

type PriorLedgerRecord = {
  ledger?: {
    eventSeq?: number;
    eventHash?: string;
  };
};

function compactId(seed: string): string {
  return `trace-${sha256Hash(seed).slice(0, 16)}`;
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
        const lines = buffer
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length > 0) {
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

function inspectDecisionTraceRecords(
  records: DecisionTraceRecord[],
  checkedAt: string
): DecisionTraceIntegrityReport {
  const findings: DecisionTraceIntegrityFinding[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (seenIds.has(record.decisionTraceId)) {
      findings.push({
        code: "duplicate_decision_trace_id",
        severity: "critical",
        message: `duplicate decision trace id ${record.decisionTraceId}`,
        eventSeq: record.ledger.eventSeq,
        decisionTraceId: record.decisionTraceId
      });
    } else {
      seenIds.add(record.decisionTraceId);
    }

    const expectedHash = computeDecisionTraceEventHash({
      decisionTraceId: record.decisionTraceId,
      generatedAt: record.generatedAt,
      source: record.source,
      sessionId: record.sessionId,
      executionId: record.executionId,
      conversationId: record.conversationId,
      release: record.release,
      policy: record.policy,
      evidence: record.evidence,
      decisionSummary: record.decisionSummary,
      selfEvaluation: record.selfEvaluation,
      principal: record.principal,
      eventSeq: record.ledger.eventSeq,
      parentEventHash: record.ledger.parentEventHash
    });

    if (record.ledger.eventHash !== expectedHash) {
      findings.push({
        code: "event_hash_mismatch",
        severity: "critical",
        message: `event ${record.ledger.eventSeq} hash does not match recomputed payload hash`,
        eventSeq: record.ledger.eventSeq,
        decisionTraceId: record.decisionTraceId
      });
    }

    const expectedParentHash = index > 0 ? records[index - 1]?.ledger.eventHash : undefined;
    if ((record.ledger.parentEventHash ?? undefined) !== (expectedParentHash ?? undefined)) {
      findings.push({
        code: "event_chain_mismatch",
        severity: "critical",
        message: `event ${record.ledger.eventSeq} parentEventHash does not match the previous event hash`,
        eventSeq: record.ledger.eventSeq,
        decisionTraceId: record.decisionTraceId
      });
    }

    const expectedEventSeq = index + 1;
    if (record.ledger.eventSeq !== expectedEventSeq) {
      findings.push({
        code: "event_seq_mismatch",
        severity: "warning",
        message: `event ${record.decisionTraceId} has seq ${record.ledger.eventSeq} but expected ${expectedEventSeq}`,
        eventSeq: record.ledger.eventSeq,
        decisionTraceId: record.decisionTraceId
      });
    }
  }

  const criticalCount = findings.filter((entry) => entry.severity === "critical").length;
  return {
    checkedAt,
    status: criticalCount > 0 ? "invalid" : findings.length > 0 ? "degraded" : "verified",
    valid: criticalCount === 0,
    eventCount: records.length,
    headEventHash: records.at(-1)?.ledger.eventHash,
    headDecisionTraceId: records.at(-1)?.decisionTraceId,
    findingCount: findings.length,
    findings
  };
}

async function readDecisionTraceRecords(filePath: string): Promise<DecisionTraceRecord[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DecisionTraceRecord);
}

function normalizeJsonHashValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createDecisionTraceSeed(options: {
  sessionId?: string;
  executionId?: string;
  conversationId?: string;
  source: DecisionTraceSource;
  objective?: string;
  promptDigest?: string;
}): string {
  return compactId(
    [
      options.source,
      options.sessionId ?? "none",
      options.executionId ?? "none",
      options.conversationId ?? "none",
      options.promptDigest ?? "none",
      options.objective ?? "none"
    ].join("|")
  );
}

function computeDecisionTraceEventHash(options: {
  decisionTraceId: string;
  generatedAt: string;
  source: DecisionTraceSource;
  sessionId?: string;
  executionId?: string;
  conversationId?: string;
  release: DecisionTraceInput["release"];
  policy: DecisionTraceInput["policy"];
  evidence: DecisionTraceInput["evidence"];
  decisionSummary: DecisionTraceInput["decisionSummary"];
  selfEvaluation?: DecisionTraceInput["selfEvaluation"];
  principal?: DecisionTraceInput["principal"];
  eventSeq: number;
  parentEventHash?: string;
}): string {
  return sha256Json(
    normalizeJsonHashValue({
      decisionTraceId: options.decisionTraceId,
      generatedAt: options.generatedAt,
      source: options.source,
      sessionId: options.sessionId,
      executionId: options.executionId,
      conversationId: options.conversationId,
      release: options.release,
      policy: options.policy,
      evidence: options.evidence,
      decisionSummary: options.decisionSummary,
      selfEvaluation: options.selfEvaluation,
      principal: options.principal,
      eventSeq: options.eventSeq,
      parentEventHash: options.parentEventHash
    })
  );
}

export async function appendDecisionTraceRecord(options: {
  rootDir: string;
  record: DecisionTraceInput;
}): Promise<DecisionTraceRecord> {
  const ledgerPath = path.join(options.rootDir, "arobi-network", "decision-ledger.ndjson");
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  const previousLine = await readLastNonEmptyLine(ledgerPath);
  const previousRecord = previousLine ? (JSON.parse(previousLine) as PriorLedgerRecord) : undefined;
  const eventSeq = (previousRecord?.ledger?.eventSeq ?? 0) + 1;
  const parentEventHash = previousRecord?.ledger?.eventHash;
  const decisionTraceId =
    options.record.decisionTraceId ??
    createDecisionTraceSeed({
      source: options.record.source,
      sessionId: options.record.sessionId,
      executionId: options.record.executionId,
      conversationId: options.record.conversationId,
      objective: options.record.decisionSummary.responsePreview,
      promptDigest: options.record.evidence.promptDigest
    });
  const generatedAt = new Date().toISOString();
  const eventHash = computeDecisionTraceEventHash({
    decisionTraceId,
    generatedAt,
    source: options.record.source,
    sessionId: options.record.sessionId,
    executionId: options.record.executionId,
    conversationId: options.record.conversationId,
    release: options.record.release,
    policy: options.record.policy,
    evidence: options.record.evidence,
    decisionSummary: options.record.decisionSummary,
    selfEvaluation: options.record.selfEvaluation,
    principal: options.record.principal,
    eventSeq,
    parentEventHash
  });
  const materialized: DecisionTraceRecord = {
    ...options.record,
    generatedAt,
    decisionTraceId,
    ledger: {
      eventSeq,
      parentEventHash,
      eventHash
    }
  };
  await appendFile(ledgerPath, `${JSON.stringify(materialized)}\n`, "utf8");
  return materialized;
}

export async function appendDecisionTraceMirrorRecord(options: {
  filePath: string;
  record: DecisionTraceRecord;
}): Promise<DecisionTraceRecord> {
  await mkdir(path.dirname(options.filePath), { recursive: true });
  const previousLine = await readLastNonEmptyLine(options.filePath);
  const previousRecord = previousLine ? (JSON.parse(previousLine) as PriorLedgerRecord) : undefined;
  const eventSeq = (previousRecord?.ledger?.eventSeq ?? 0) + 1;
  const parentEventHash = previousRecord?.ledger?.eventHash;
  const eventHash = computeDecisionTraceEventHash({
    decisionTraceId: options.record.decisionTraceId,
    generatedAt: options.record.generatedAt,
    source: options.record.source,
    sessionId: options.record.sessionId,
    executionId: options.record.executionId,
    conversationId: options.record.conversationId,
    release: options.record.release,
    policy: options.record.policy,
    evidence: options.record.evidence,
    decisionSummary: options.record.decisionSummary,
    selfEvaluation: options.record.selfEvaluation,
    principal: options.record.principal,
    eventSeq,
    parentEventHash
  });
  const mirrored: DecisionTraceRecord = {
    ...options.record,
    ledger: {
      eventSeq,
      parentEventHash,
      eventHash
    }
  };
  await appendFile(options.filePath, `${JSON.stringify(mirrored)}\n`, "utf8");
  return mirrored;
}

export async function inspectDecisionTraceLedger(rootDir: string): Promise<DecisionTraceIntegrityReport> {
  const checkedAt = new Date().toISOString();
  const ledgerPath = path.join(rootDir, "arobi-network", "decision-ledger.ndjson");

  try {
    return inspectDecisionTraceRecords(await readDecisionTraceRecords(ledgerPath), checkedAt);
  } catch (error) {
    return {
      checkedAt,
      status: "degraded",
      valid: true,
      eventCount: 0,
      findingCount: 1,
      findings: [
        {
          code: "ledger_unavailable",
          severity: "warning",
          message:
            error instanceof Error
              ? `decision trace ledger unavailable: ${error.message}`
              : "decision trace ledger unavailable"
        }
      ]
    };
  }
}

export async function inspectDecisionTraceFile(filePath: string): Promise<DecisionTraceIntegrityReport> {
  const checkedAt = new Date().toISOString();
  try {
    return inspectDecisionTraceRecords(await readDecisionTraceRecords(filePath), checkedAt);
  } catch (error) {
    return {
      checkedAt,
      status: "degraded",
      valid: true,
      eventCount: 0,
      findingCount: 1,
      findings: [
        {
          code: "trace_file_unavailable",
          severity: "warning",
          message:
            error instanceof Error
              ? `decision trace file unavailable: ${error.message}`
              : "decision trace file unavailable"
        }
      ]
    };
  }
}
