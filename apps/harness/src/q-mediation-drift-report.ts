import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadLatestBenchmarkReportForPack } from "./benchmark.js";
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
    latencyP95Ms?: number;
    runnerPathP95Ms?: number;
    arbitrationP95Ms?: number;
    schedulingP95Ms?: number;
    routingP95Ms?: number;
    hardware?: string;
  };
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
    `- Mediation latency P95: \`${report.benchmark.latencyP95Ms ?? "n/a"} ms\``,
    `- Runner path latency P95: \`${report.benchmark.runnerPathP95Ms ?? "n/a"} ms\``,
    `- Arbitration latency P95: \`${report.benchmark.arbitrationP95Ms ?? "n/a"} ms\``,
    `- Scheduling latency P95: \`${report.benchmark.schedulingP95Ms ?? "n/a"} ms\``,
    `- Routing latency P95: \`${report.benchmark.routingP95Ms ?? "n/a"} ms\``,
    `- Hardware: ${report.benchmark.hardware ?? "unknown"}`,
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
  const benchmark = await loadLatestBenchmarkReportForPack("q-mediation-drift");
  if (!benchmark) {
    throw new Error("No published q-mediation-drift benchmark report is available yet.");
  }

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
      latencyP95Ms: findSeriesValue(benchmark, "q_mediation_drift_latency_ms", "p95"),
      runnerPathP95Ms: findSeriesValue(benchmark, "q_mediation_drift_runner_path_ms", "p95"),
      arbitrationP95Ms: findSeriesValue(benchmark, "q_mediation_drift_arbitration_ms", "p95"),
      schedulingP95Ms: findSeriesValue(benchmark, "q_mediation_drift_scheduling_ms", "p95"),
      routingP95Ms: findSeriesValue(benchmark, "q_mediation_drift_routing_ms", "p95"),
      hardware: benchmark.hardwareContext
        ? `${benchmark.hardwareContext.host} / ${benchmark.hardwareContext.platform}-${benchmark.hardwareContext.arch} / ${benchmark.hardwareContext.cpuModel}`
        : undefined
    },
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
