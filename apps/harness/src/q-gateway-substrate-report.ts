import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadLatestBenchmarkReportForPack } from "./benchmark.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type QGatewaySubstrateSurface = {
  generatedAt: string;
  release: ReleaseMetadata;
  benchmark: {
    suiteId: string;
    generatedAt: string;
    packId: string;
    packLabel: string;
    failedAssertions: number;
    structuredFieldsP50?: number;
    latencyP95Ms?: number;
    arbitrationP95Ms?: number;
    guardDenialsMax?: number;
    hardware?: string;
  };
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

function findSeriesValue(report: NonNullable<Awaited<ReturnType<typeof loadLatestBenchmarkReportForPack>>>, seriesId: string, field: "p50" | "p95" | "max") {
  const series = report.series.find((entry) => entry.id === seriesId);
  return typeof series?.[field] === "number" ? series[field] : undefined;
}

function renderMarkdown(report: QGatewaySubstrateSurface): string {
  return [
    "# Q Gateway Substrate",
    "",
    "This page is generated from the dedicated `q-gateway-substrate` benchmark pack. It measures the real seam where the Q gateway hands structured work back into Immaculate arbitration.",
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
    `- Failed assertions: \`${report.benchmark.failedAssertions}\``,
    `- Structured fields P50: \`${report.benchmark.structuredFieldsP50 ?? "n/a"}\``,
    `- Gateway latency P95: \`${report.benchmark.latencyP95Ms ?? "n/a"} ms\``,
    `- Arbitration latency P95: \`${report.benchmark.arbitrationP95Ms ?? "n/a"} ms\``,
    `- Guard denials max: \`${report.benchmark.guardDenialsMax ?? "n/a"}\``,
    `- Hardware: ${report.benchmark.hardware ?? "unknown"}`,
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
  const benchmark = await loadLatestBenchmarkReportForPack("q-gateway-substrate");
  if (!benchmark) {
    throw new Error("No published q-gateway-substrate benchmark report is available yet.");
  }

  const report: QGatewaySubstrateSurface = {
    generatedAt: new Date().toISOString(),
    release: await resolveReleaseMetadata(),
    benchmark: {
      suiteId: benchmark.suiteId,
      generatedAt: benchmark.generatedAt,
      packId: benchmark.packId,
      packLabel: benchmark.packLabel,
      failedAssertions: benchmark.assertions.filter((assertion) => assertion.status === "fail").length,
      structuredFieldsP50: findSeriesValue(benchmark, "q_gateway_substrate_structured_fields", "p50"),
      latencyP95Ms: findSeriesValue(benchmark, "q_gateway_substrate_latency_ms", "p95"),
      arbitrationP95Ms: findSeriesValue(benchmark, "q_gateway_substrate_arbitration_ms", "p95"),
      guardDenialsMax: findSeriesValue(benchmark, "q_gateway_substrate_guard_denials", "max"),
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
    output: {
      jsonPath: path.join("docs", "wiki", "Q-Gateway-Substrate.json"),
      markdownPath: path.join("docs", "wiki", "Q-Gateway-Substrate.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Q gateway substrate report generation failed.");
  process.exitCode = 1;
});
