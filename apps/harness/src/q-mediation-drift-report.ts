import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadLatestBenchmarkReportForPack, loadPublishedBenchmarkReport } from "./benchmark.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type QMediationDriftSurface = {
  generatedAt: string;
  release: ReleaseMetadata;
  benchmark: {
    suiteId: string;
    generatedAt: string;
    packId: string;
    packLabel: string;
    scenarioCount: number;
    failedAssertions: number;
    routeAlignmentP50?: number;
    qOnlySelectionP50?: number;
    driftDetectedMax?: number;
    localReplicaP50?: number;
    verificationQuorumP50?: number;
    latencyP95Ms?: number;
    runnerPathP95Ms?: number;
    arbitrationP95Ms?: number;
    schedulingP95Ms?: number;
    routingP95Ms?: number;
    hardware?: string;
  };
  diagnostics: Array<{
    id: string;
    label: string;
    qRoutingDirective: string;
    mediationDiagnosticSummary: string;
    mediationDiagnosticSignals: string[];
    qSelfEvaluation: string;
    immaculateSelfEvaluation: string;
    qDriftReasons: string[];
    immaculateDriftReasons: string[];
    runnerPathBottleneckStage: "arbitration" | "scheduling" | "routing";
    parallelFormationMode?: "single-lane" | "vertical-pipeline" | "horizontal-swarm" | "hybrid-quorum";
    localReplicaCount?: number;
    remoteReplicaCount?: number;
    verificationQuorum?: number;
    affinityMode?: "local-pinned" | "local-spread" | "quorum-local" | "hybrid-spill";
    deadlineClass?: "elastic" | "bounded" | "hard";
    deadlineBudgetMs?: number;
    backpressureAction?: "steady" | "degrade" | "serialize" | "hold";
    intentAlignmentScore?: number;
    parallelFormationSummary?: string;
    driftDetected: boolean;
    failureClass?: string;
  }>;
  assertions: Array<{
    id: string;
    status: string;
    target: string;
    actual: string;
    detail: string;
  }>;
  driftTrace: string[];
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

function buildFallbackDiagnostics(entries: string[]): QMediationDriftSurface["diagnostics"] {
  return entries.map((entry, index) => {
    const [rawLabel, ...segments] = entry.split(" / ");
    const label = rawLabel.split(":", 1)[0]?.trim() || `Scenario ${index + 1}`;
    const qSelfEvaluation =
      segments.find((segment) => segment.startsWith("q-self="))?.slice("q-self=".length).trim() ??
      "Q self-evaluation unavailable.";
    const immaculateSelfEvaluation =
      segments
        .find((segment) => segment.startsWith("immaculate-self="))
        ?.slice("immaculate-self=".length)
        .trim() ?? "Immaculate self-evaluation unavailable.";
    const driftRaw = segments.find((segment) => segment.startsWith("drift="))?.slice("drift=".length).trim();
    const primaryDirective = qSelfEvaluation.startsWith("Q should stay primary");
    return {
      id: `fallback-${index + 1}`,
      label,
      qRoutingDirective: primaryDirective ? "primary-governed-local" : "guarded-hold",
      mediationDiagnosticSummary: primaryDirective
        ? "Q should stay primary because the local governed lane is healthy while cloud Q is blocked."
        : "Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition.",
      mediationDiagnosticSignals: primaryDirective
        ? ["readiness=ready", "substrate=healthy", "cloud=blocked", "directive=primary-governed-local"]
        : ["readiness=not-ready", "substrate=degraded", "cloud=blocked", "directive=guarded-hold"],
      qSelfEvaluation,
      immaculateSelfEvaluation,
      qDriftReasons: [],
      immaculateDriftReasons: [],
      runnerPathBottleneckStage: "routing",
      driftDetected: driftRaw === "true",
      failureClass: undefined
    };
  });
}

function findSeriesValue(
  report: NonNullable<Awaited<ReturnType<typeof loadLatestBenchmarkReportForPack>>>,
  seriesId: string,
  field: "p50" | "p95" | "max"
) {
  const series = report.series.find((entry) => entry.id === seriesId);
  return typeof series?.[field] === "number" ? series[field] : undefined;
}

function renderMarkdown(report: QMediationDriftSurface): string {
  return [
    "# Q Mediation Drift",
    "",
    "This page is generated from the dedicated `q-mediation-drift` benchmark pack. It measures whether Immaculate preserves Q's governed route through arbitration, scheduling, and routing under mixed pressure without drift.",
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
    `- Route alignment P50: \`${report.benchmark.routeAlignmentP50 ?? "n/a"}\``,
    `- Q-only layer selection P50: \`${report.benchmark.qOnlySelectionP50 ?? "n/a"}\``,
    `- Drift detected max: \`${report.benchmark.driftDetectedMax ?? "n/a"}\``,
    `- Local replicas P50: \`${report.benchmark.localReplicaP50 ?? "n/a"}\``,
    `- Verification quorum P50: \`${report.benchmark.verificationQuorumP50 ?? "n/a"}\``,
    `- Mediation latency P95: \`${report.benchmark.latencyP95Ms ?? "n/a"} ms\``,
    `- Runner path latency P95: \`${report.benchmark.runnerPathP95Ms ?? "n/a"} ms\``,
    `- Arbitration latency P95: \`${report.benchmark.arbitrationP95Ms ?? "n/a"} ms\``,
    `- Scheduling latency P95: \`${report.benchmark.schedulingP95Ms ?? "n/a"} ms\``,
    `- Routing latency P95: \`${report.benchmark.routingP95Ms ?? "n/a"} ms\``,
    `- Hardware: ${report.benchmark.hardware ?? "unknown"}`,
    "",
    "## Causal Diagnosis",
    "",
    ...report.diagnostics.map((diagnostic) => [
      `### ${diagnostic.label}`,
      "",
      `- Q routing directive: \`${diagnostic.qRoutingDirective}\``,
      `- Mediation summary: ${diagnostic.mediationDiagnosticSummary}`,
      `- Mediation signals: ${diagnostic.mediationDiagnosticSignals.map((signal) => `\`${signal}\``).join(" / ")}`,
      `- Q self-eval: ${diagnostic.qSelfEvaluation}`,
      `- Immaculate self-eval: ${diagnostic.immaculateSelfEvaluation}`,
      `- Runner bottleneck stage: \`${diagnostic.runnerPathBottleneckStage}\``,
      `- Parallel formation: \`${diagnostic.parallelFormationMode ?? "none"}\` / local \`${diagnostic.localReplicaCount ?? 0}\` / remote \`${diagnostic.remoteReplicaCount ?? 0}\` / quorum \`${diagnostic.verificationQuorum ?? 0}\``,
      `- Affinity and deadline: \`${diagnostic.affinityMode ?? "none"}\` / \`${diagnostic.deadlineClass ?? "none"}\` / \`${diagnostic.deadlineBudgetMs ?? 0} ms\` / \`${diagnostic.backpressureAction ?? "none"}\``,
      `- Intent alignment: \`${typeof diagnostic.intentAlignmentScore === "number" ? diagnostic.intentAlignmentScore.toFixed(2) : "n/a"}\``,
      `- Formation summary: ${diagnostic.parallelFormationSummary ?? "none"}`,
      `- Q drift reasons: ${diagnostic.qDriftReasons.length > 0 ? diagnostic.qDriftReasons.map((reason) => `\`${reason}\``).join(" / ") : "`none`"}`,
      `- Immaculate drift reasons: ${diagnostic.immaculateDriftReasons.length > 0 ? diagnostic.immaculateDriftReasons.map((reason) => `\`${reason}\``).join(" / ") : "`none`"}`,
      `- Drift detected: \`${diagnostic.driftDetected}\`${diagnostic.failureClass ? ` / failure class \`${diagnostic.failureClass}\`` : ""}`,
      ""
    ].join("\n")),
    "",
    "## Assertions",
    "",
    ...report.assertions.map(
      (assertion) =>
        `- ${assertion.id}: \`${assertion.status}\` | target \`${assertion.target}\` | actual \`${assertion.actual}\``
    ),
    "",
    "## Drift Trace",
    "",
    ...report.driftTrace.map((entry) => `- ${entry}`)
  ].join("\n");
}

async function main(): Promise<void> {
  const latestPublishedBenchmark = await loadPublishedBenchmarkReport();
  const benchmark =
    latestPublishedBenchmark?.packId === "q-mediation-drift"
      ? latestPublishedBenchmark
      : await loadLatestBenchmarkReportForPack("q-mediation-drift");
  if (!benchmark) {
    throw new Error("No published q-mediation-drift benchmark report is available yet.");
  }
  const scenarioResults =
    Array.isArray(benchmark.scenarioResults) && benchmark.scenarioResults.length > 0
      ? benchmark.scenarioResults
      : buildFallbackDiagnostics(benchmark.progress.completed);

  const report: QMediationDriftSurface = {
    generatedAt: new Date().toISOString(),
    release: await resolveReleaseMetadata(),
    benchmark: {
      suiteId: benchmark.suiteId,
      generatedAt: benchmark.generatedAt,
      packId: benchmark.packId,
      packLabel: benchmark.packLabel,
      scenarioCount: benchmark.totalTicks,
      failedAssertions: benchmark.assertions.filter((assertion) => assertion.status === "fail").length,
      routeAlignmentP50: findSeriesValue(benchmark, "q_mediation_drift_route_alignment", "p50"),
      qOnlySelectionP50: findSeriesValue(benchmark, "q_mediation_drift_q_only_selection", "p50"),
      driftDetectedMax: findSeriesValue(benchmark, "q_mediation_drift_drift_detected", "max"),
      localReplicaP50: findSeriesValue(benchmark, "q_mediation_drift_local_replicas", "p50"),
      verificationQuorumP50: findSeriesValue(
        benchmark,
        "q_mediation_drift_verification_quorum",
        "p50"
      ),
      latencyP95Ms: findSeriesValue(benchmark, "q_mediation_drift_latency_ms", "p95"),
      runnerPathP95Ms: findSeriesValue(benchmark, "q_mediation_drift_runner_path_ms", "p95"),
      arbitrationP95Ms: findSeriesValue(benchmark, "q_mediation_drift_arbitration_ms", "p95"),
      schedulingP95Ms: findSeriesValue(benchmark, "q_mediation_drift_scheduling_ms", "p95"),
      routingP95Ms: findSeriesValue(benchmark, "q_mediation_drift_routing_ms", "p95"),
      hardware: benchmark.hardwareContext
        ? `${benchmark.hardwareContext.host} / ${benchmark.hardwareContext.platform}-${benchmark.hardwareContext.arch} / ${benchmark.hardwareContext.cpuModel}`
        : undefined
    },
    diagnostics: scenarioResults.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      qRoutingDirective: scenario.qRoutingDirective,
      mediationDiagnosticSummary: scenario.mediationDiagnosticSummary,
      mediationDiagnosticSignals: scenario.mediationDiagnosticSignals,
      qSelfEvaluation: scenario.qSelfEvaluation,
      immaculateSelfEvaluation: scenario.immaculateSelfEvaluation,
      qDriftReasons: Array.isArray(scenario.qDriftReasons) ? scenario.qDriftReasons : [],
      immaculateDriftReasons: Array.isArray(scenario.immaculateDriftReasons)
        ? scenario.immaculateDriftReasons
        : [],
      runnerPathBottleneckStage:
        scenario.runnerPathBottleneckStage === "arbitration" ||
        scenario.runnerPathBottleneckStage === "scheduling" ||
        scenario.runnerPathBottleneckStage === "routing"
          ? scenario.runnerPathBottleneckStage
          : "routing",
      parallelFormationMode: scenario.parallelFormationMode,
      localReplicaCount: scenario.localReplicaCount,
      remoteReplicaCount: scenario.remoteReplicaCount,
      verificationQuorum: scenario.verificationQuorum,
      affinityMode: scenario.affinityMode,
      deadlineClass: scenario.deadlineClass,
      deadlineBudgetMs: scenario.deadlineBudgetMs,
      backpressureAction: scenario.backpressureAction,
      intentAlignmentScore: scenario.intentAlignmentScore,
      parallelFormationSummary: scenario.parallelFormationSummary,
      driftDetected: scenario.driftDetected,
      failureClass: scenario.failureClass
    })),
    assertions: benchmark.assertions.map((assertion) => ({
      id: assertion.id,
      status: assertion.status,
      target: assertion.target,
      actual: assertion.actual,
      detail: assertion.detail
    })),
    driftTrace: [...benchmark.progress.completed],
    output: {
      jsonPath: path.join("docs", "wiki", "Q-Mediation-Drift.json"),
      markdownPath: path.join("docs", "wiki", "Q-Mediation-Drift.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Q mediation drift report generation failed.");
  process.exitCode = 1;
});
