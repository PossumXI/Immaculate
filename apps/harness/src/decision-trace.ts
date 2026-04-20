import path from "node:path";
import { appendFile, mkdir, open } from "node:fs/promises";
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
  const eventHash = sha256Json({
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
