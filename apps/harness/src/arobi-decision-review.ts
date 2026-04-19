import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type DecisionTraceRecord = {
  generatedAt?: string;
  decisionTraceId?: string;
  source?: string;
  sessionId?: string;
  executionId?: string;
  conversationId?: string;
  release?: {
    buildId?: string;
    gitShortSha?: string;
    modelName?: string;
    foundationModel?: string;
    trainingBundleId?: string;
  };
  policy?: {
    governancePressure?: string;
    routeMode?: string;
    qRoutingDirective?: string;
    selectedLayerId?: string;
    targetNodeId?: string;
    failureClass?: string;
  };
  evidence?: {
    objectiveDigest?: string;
    contextDigest?: string;
    promptDigest?: string;
    responseDigest?: string;
    evidenceDigest?: string;
    contextFingerprint?: string;
    sourceIds?: string[];
  };
  decisionSummary?: {
    routeSuggestion?: string;
    reasonSummary?: string;
    commitStatement?: string;
    responsePreview?: string;
  };
  selfEvaluation?: {
    status?: string;
    driftDetected?: boolean;
    driftReasonCodes?: string[];
  };
  ledger?: {
    eventSeq?: number;
    parentEventHash?: string;
    eventHash?: string;
  };
};

type DecisionLedgerSummary = {
  path: string;
  recordCount: number;
  linked: boolean;
  latestGeneratedAt?: string;
};

type DecisionReviewReport = {
  generatedAt: string;
  ledgerFiles: DecisionLedgerSummary[];
  linkedLedgerCount: number;
  linkedRecordCount: number;
  successfulLinkedRecordCount: number;
  latestSuccessfulRecord?: DecisionTraceRecord & {
    sourcePath: string;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const RUNTIME_ROOT = path.join(REPO_ROOT, ".runtime");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

async function walkFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(currentDir: string) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(nextPath);
      } else if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }
  await visit(rootDir);
  return files;
}

function parseLedgerRecords(contents: string): DecisionTraceRecord[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as DecisionTraceRecord;
        return [parsed];
      } catch {
        return [];
      }
    });
}

function isSuccessfulRecord(record: DecisionTraceRecord): boolean {
  if (!record.ledger?.eventHash || !record.decisionTraceId) {
    return false;
  }
  if (record.policy?.failureClass) {
    return false;
  }
  const status = String(record.selfEvaluation?.status ?? "").trim().toLowerCase();
  return status !== "failed" && status !== "hold";
}

function renderMarkdown(report: DecisionReviewReport): string {
  const latest = report.latestSuccessfulRecord;
  const digestCoverage = [
    latest?.evidence?.evidenceDigest ? "`evidence`" : undefined,
    latest?.evidence?.objectiveDigest ? "`objective`" : undefined,
    latest?.evidence?.contextDigest ? "`context`" : undefined,
    latest?.evidence?.responseDigest ? "`response`" : undefined,
    latest?.evidence?.contextFingerprint ? "`fingerprint`" : undefined
  ].filter((entry): entry is string => Boolean(entry));
  return [
    "# Arobi Decision Review",
    "",
    "This page is generated from the private Arobi decision ledgers under `.runtime`. Arobi Network is the ledger-backed private and public operator network and audit substrate for this stack. Immaculate is the governed harness and orchestrator inside it, and Q is the reasoning brain. This review page only surfaces structurally linked successful chains and the latest successful governed decision context without exposing hidden chain-of-thought.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Ledger files: \`${report.ledgerFiles.length}\``,
    `- Linked ledgers: \`${report.linkedLedgerCount}\``,
    `- Linked records: \`${report.linkedRecordCount}\``,
    `- Successful linked records: \`${report.successfulLinkedRecordCount}\``,
    "- Operating model: `Arobi Network = ledger and audit substrate | Immaculate = harness/orchestrator | Q = reasoning brain`",
    "",
    "## Latest Successful Governed Record",
    "",
    `- Source ledger: \`${latest?.sourcePath ?? "n/a"}\``,
    `- Source: \`${latest?.source ?? "n/a"}\``,
    `- Session: \`${latest?.sessionId ?? "n/a"}\``,
    `- Trace id: \`${latest?.decisionTraceId ?? "n/a"}\``,
    `- Trace hash: \`${latest?.ledger?.eventHash ?? "n/a"}\``,
    `- Release build: \`${latest?.release?.buildId ?? "n/a"}\``,
    `- Training bundle: \`${latest?.release?.trainingBundleId ?? "n/a"}\``,
    `- Governance pressure: \`${latest?.policy?.governancePressure ?? "n/a"}\``,
    `- Route: \`${latest?.decisionSummary?.routeSuggestion ?? latest?.policy?.routeMode ?? "n/a"}\``,
    `- Policy block present: \`${Boolean(latest?.policy)}\``,
    `- Evidence coverage: ${digestCoverage.length > 0 ? digestCoverage.join(", ") : "`n/a`"}`,
    `- Drift detected: \`${latest?.selfEvaluation?.driftDetected ?? "n/a"}\``,
    `- Decision summary: ${latest?.decisionSummary?.reasonSummary ?? latest?.decisionSummary?.responsePreview ?? "n/a"}`,
    "",
    "## Linked Ledgers",
    "",
    ...report.ledgerFiles.map(
      (ledger) =>
        `- \`${ledger.path}\`: linked=\`${ledger.linked}\`, records=\`${ledger.recordCount}\`, latest=\`${ledger.latestGeneratedAt ?? "n/a"}\``
    )
  ].join("\n");
}

async function main(): Promise<void> {
  const ledgerPaths = (await walkFiles(RUNTIME_ROOT)).filter((filePath) =>
    filePath.endsWith(path.join("arobi-network", "decision-ledger.ndjson"))
  );
  const ledgerFiles: DecisionLedgerSummary[] = [];
  const linkedRecords: Array<DecisionTraceRecord & { sourcePath: string }> = [];

  for (const ledgerPath of ledgerPaths) {
    const contents = await readFile(ledgerPath, "utf8").catch(() => "");
    const records = parseLedgerRecords(contents);
    let linked = records.length > 0;
    let previousHash: string | undefined;
    let previousSeq = 0;
    for (const record of records) {
      if ((record.ledger?.eventSeq ?? 0) !== previousSeq + 1) {
        linked = false;
        break;
      }
      if ((record.ledger?.parentEventHash ?? undefined) !== previousHash) {
        linked = false;
        break;
      }
      previousHash = record.ledger?.eventHash;
      previousSeq = record.ledger?.eventSeq ?? previousSeq;
      linkedRecords.push({
        ...record,
        sourcePath: path.relative(REPO_ROOT, ledgerPath).replaceAll("\\", "/")
      });
    }
    ledgerFiles.push({
      path: path.relative(REPO_ROOT, ledgerPath).replaceAll("\\", "/"),
      recordCount: records.length,
      linked,
      latestGeneratedAt: records.at(-1)?.generatedAt
    });
  }

  const successfulRecords = linkedRecords.filter(isSuccessfulRecord);
  const reviewCandidates =
    successfulRecords.filter((record) => record.source !== "conversation") || successfulRecords;
  const latestSuccessfulRecord = (reviewCandidates.length > 0 ? reviewCandidates : successfulRecords)
    .slice()
    .sort((left, right) =>
      String(left.generatedAt ?? "").localeCompare(String(right.generatedAt ?? ""))
    )
    .at(-1);
  const report: DecisionReviewReport = {
    generatedAt: new Date().toISOString(),
    ledgerFiles,
    linkedLedgerCount: ledgerFiles.filter((ledger) => ledger.linked).length,
    linkedRecordCount: linkedRecords.length,
    successfulLinkedRecordCount: successfulRecords.length,
    latestSuccessfulRecord,
    output: {
      jsonPath: path.join("docs", "wiki", "Arobi-Decision-Review.json"),
      markdownPath: path.join("docs", "wiki", "Arobi-Decision-Review.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Arobi decision review generation failed.");
  process.exitCode = 1;
});
