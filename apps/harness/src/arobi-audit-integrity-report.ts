import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadLatestBenchmarkReportForPack } from "./benchmark.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type ArobiAuditIntegritySurface = {
  generatedAt: string;
  release: ReleaseMetadata;
  benchmark: {
    suiteId: string;
    generatedAt: string;
    packId: string;
    packLabel: string;
    scenarioCount: number;
    failedAssertions: number;
    linkedRecordsP50?: number;
    sourceCoverageP50?: number;
    selfEvaluationsP50?: number;
    completenessP50?: number;
    latencyP95Ms?: number;
    hardware?: string;
  };
  diagnostics: Array<{
    id: string;
    label: string;
    sessionId: string;
    qAccepted: boolean;
    mediationAccepted: boolean;
    ledgerLinked: boolean;
    sourceCoverage: string[];
    selfEvaluationCount: number;
    evidenceDigestCount: number;
    contextFingerprintCount: number;
    qApiAuditCaptured: boolean;
    promptCaptured: boolean;
    reasoningCaptured: boolean;
    routeSuggestion?: string;
    latestRouteSuggestion?: string;
    routeContinuous: boolean;
    latestReviewStatus?: string;
    governancePressure?: string;
    auditCompletenessScore: number;
    latestEventHash?: string;
    failureClass?: string;
  }>;
  assertions: Array<{
    id: string;
    status: string;
    target: string;
    actual: string;
    detail: string;
  }>;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

function findSeriesValue(
  report: NonNullable<Awaited<ReturnType<typeof loadLatestBenchmarkReportForPack>>>,
  seriesId: string,
  field: "p50" | "p95" | "max"
) {
  const series = report.series.find((entry) => entry.id === seriesId);
  return typeof series?.[field] === "number" ? series[field] : undefined;
}

function renderMarkdown(report: ArobiAuditIntegritySurface): string {
  return [
    "# Arobi Audit Integrity",
    "",
    "This page is generated from the `arobi-audit-integrity` benchmark pack. It proves the real harness can run governed Q requests, mediate them through Immaculate, and preserve a reviewable Arobi ledger trail with enough context for audit and insurance review without exposing hidden chain-of-thought.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``,
    "",
    "## Benchmark",
    "",
    `- Suite: \`${report.benchmark.suiteId}\``,
    `- Pack: \`${report.benchmark.packLabel} (${report.benchmark.packId})\``,
    `- Scenario count: \`${report.benchmark.scenarioCount}\``,
    `- Failed assertions: \`${report.benchmark.failedAssertions}\``,
    `- Linked records P50: \`${report.benchmark.linkedRecordsP50 ?? "n/a"}\``,
    `- Source coverage P50: \`${report.benchmark.sourceCoverageP50 ?? "n/a"}\``,
    `- Self-evaluations P50: \`${report.benchmark.selfEvaluationsP50 ?? "n/a"}\``,
    `- Audit completeness P50: \`${report.benchmark.completenessP50 ?? "n/a"}\``,
    `- End-to-end latency P95: \`${report.benchmark.latencyP95Ms ?? "n/a"} ms\``,
    `- Hardware: ${report.benchmark.hardware ?? "unknown"}`,
    "",
    "## Scenario Diagnostics",
    "",
    ...report.diagnostics.map((scenario) => [
      `### ${scenario.label}`,
      "",
      `- Session: \`${scenario.sessionId}\``,
      `- Q accepted: \`${scenario.qAccepted}\``,
      `- Mediation accepted: \`${scenario.mediationAccepted}\``,
      `- Ledger linked: \`${scenario.ledgerLinked}\``,
      `- Source coverage: ${scenario.sourceCoverage.length > 0 ? scenario.sourceCoverage.map((source) => `\`${source}\``).join(" / ") : "`none`"}`,
      `- Self-evaluations: \`${scenario.selfEvaluationCount}\` / evidence digests \`${scenario.evidenceDigestCount}\` / fingerprints \`${scenario.contextFingerprintCount}\``,
      `- Q API audit captured: \`${scenario.qApiAuditCaptured}\` / prompt captured \`${scenario.promptCaptured}\` / reasoning captured \`${scenario.reasoningCaptured}\``,
      `- Route continuity: \`${scenario.routeSuggestion ?? "missing"} => ${scenario.latestRouteSuggestion ?? "missing"}\` / continuous \`${scenario.routeContinuous}\``,
      `- Latest review status: \`${scenario.latestReviewStatus ?? "n/a"}\``,
      `- Governance pressure: \`${scenario.governancePressure ?? "n/a"}\``,
      `- Completeness score: \`${scenario.auditCompletenessScore.toFixed(2)}\``,
      `- Latest event hash: \`${scenario.latestEventHash ?? "n/a"}\``,
      `- Failure class: \`${scenario.failureClass ?? "none"}\``,
      ""
    ].join("\n")),
    "",
    "## Assertions",
    "",
    ...report.assertions.map(
      (assertion) =>
        `- ${assertion.id}: \`${assertion.status}\` | target \`${assertion.target}\` | actual \`${assertion.actual}\``
    )
  ].join("\n");
}

async function main(): Promise<void> {
  const benchmark = await loadLatestBenchmarkReportForPack("arobi-audit-integrity");
  if (!benchmark) {
    throw new Error("No published arobi-audit-integrity benchmark report is available yet.");
  }

  const diagnostics = Array.isArray(benchmark.auditScenarioResults) ? benchmark.auditScenarioResults : [];

  const report: ArobiAuditIntegritySurface = {
    generatedAt: new Date().toISOString(),
    release: await resolveReleaseMetadata(),
    benchmark: {
      suiteId: benchmark.suiteId,
      generatedAt: benchmark.generatedAt,
      packId: benchmark.packId,
      packLabel: benchmark.packLabel,
      scenarioCount: benchmark.totalTicks,
      failedAssertions: benchmark.assertions.filter((assertion) => assertion.status === "fail").length,
      linkedRecordsP50: findSeriesValue(benchmark, "arobi_audit_integrity_linked_records", "p50"),
      sourceCoverageP50: findSeriesValue(benchmark, "arobi_audit_integrity_source_coverage", "p50"),
      selfEvaluationsP50: findSeriesValue(benchmark, "arobi_audit_integrity_self_evaluations", "p50"),
      completenessP50: findSeriesValue(benchmark, "arobi_audit_integrity_completeness", "p50"),
      latencyP95Ms: findSeriesValue(benchmark, "arobi_audit_integrity_total_latency_ms", "p95"),
      hardware: benchmark.hardwareContext
        ? `${benchmark.hardwareContext.host} / ${benchmark.hardwareContext.platform}-${benchmark.hardwareContext.arch} / ${benchmark.hardwareContext.cpuModel}`
        : undefined
    },
    diagnostics: diagnostics.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      sessionId: scenario.sessionId,
      qAccepted: scenario.qAccepted,
      mediationAccepted: scenario.mediationAccepted,
      ledgerLinked: scenario.ledgerLinked,
      sourceCoverage: scenario.sourceCoverage,
      selfEvaluationCount: scenario.selfEvaluationCount,
      evidenceDigestCount: scenario.evidenceDigestCount,
      contextFingerprintCount: scenario.contextFingerprintCount,
      qApiAuditCaptured: scenario.qApiAuditCaptured,
      promptCaptured: scenario.promptCaptured,
      reasoningCaptured: scenario.reasoningCaptured,
      routeSuggestion: scenario.routeSuggestion,
      latestRouteSuggestion: scenario.latestRouteSuggestion,
      routeContinuous: scenario.routeContinuous,
      latestReviewStatus: scenario.latestReviewStatus,
      governancePressure: scenario.governancePressure,
      auditCompletenessScore: scenario.auditCompletenessScore,
      latestEventHash: scenario.latestEventHash,
      failureClass: scenario.failureClass
    })),
    assertions: benchmark.assertions.map((assertion) => ({
      id: assertion.id,
      status: assertion.status,
      target: assertion.target,
      actual: assertion.actual,
      detail: assertion.detail
    })),
    output: {
      jsonPath: path.join("docs", "wiki", "Arobi-Audit-Integrity.json"),
      markdownPath: path.join("docs", "wiki", "Arobi-Audit-Integrity.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Arobi audit integrity report generation failed.");
  process.exitCode = 1;
});
