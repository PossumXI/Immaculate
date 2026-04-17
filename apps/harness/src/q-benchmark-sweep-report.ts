import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type BridgeBenchSoakReport = {
  generatedAt?: string;
  durationSeconds?: number;
  runCount?: number;
  successfulRunCount?: number;
  failedRunCount?: number;
  parseSuccessCount?: number;
  taskCount?: number;
  parseSuccessRate?: number;
  averageLatencyMs?: number;
  p95LatencyMs?: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
  medianLatencyMs?: number;
  averageRunLatencyMs?: number;
  p95RunLatencyMs?: number;
  bridgeRuntimeFailedAssertionsTotal?: number;
  bridgeRuntimeFailedAssertionRuns?: number;
  qModelName?: string;
  foundationModelLabel?: string;
  output?: {
    jsonPath?: string;
  };
};

type HarborSoakStatSummary = {
  runs?: number;
  scoredRuns?: number;
  scoreAverage?: number;
  scoreMin?: number;
  scoreMax?: number;
  durationAverageSec?: number;
  durationMinSec?: number;
  durationMaxSec?: number;
  durationTotalSec?: number;
};

type HarborSoakTaskSummary = {
  taskId: string;
  taskLabel: string;
  oracle: HarborSoakStatSummary;
  q: HarborSoakStatSummary;
};

type HarborSoakReport = {
  generatedAt?: string;
  durationSeconds?: number;
  elapsedSeconds?: number;
  deadlineAt?: string;
  gatewayModel?: string;
  summary?: {
    totalRuns?: number;
    oracle?: HarborSoakStatSummary;
    q?: HarborSoakStatSummary;
    overall?: HarborSoakStatSummary;
    tasks?: HarborSoakTaskSummary[];
  };
  output?: {
    jsonPath?: string;
  };
};

type BenchmarkStatusEntry = {
  suiteId?: string;
  packId?: string;
  packLabel?: string;
  runKind?: string;
  generatedAt?: string;
  publishedAt?: string;
  runUrl?: string;
  artifactName?: string;
  totalDurationMs?: number;
  plannedDurationMs?: number;
  failedAssertions?: number;
  totalAssertions?: number;
};

type BenchmarkStatusReport = {
  updatedAt?: string;
  publications?: Record<string, BenchmarkStatusEntry>;
};

type SweepReport = {
  generatedAt: string;
  release: Omit<ReleaseMetadata, "q"> & {
    q: Pick<ReleaseMetadata["q"], "modelName" | "foundationModel" | "trainingLock" | "hybridSession">;
  };
  bridgeBenchSoak?: BridgeBenchSoakReport;
  harborSoak?: HarborSoakReport;
  wandbSoak?: BenchmarkStatusEntry;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

function sanitizeSweepValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSweepValue(entry)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key === "providerModel" ? "foundationModel" : key,
        sanitizeSweepValue(entry)
      ])
    ) as T;
  }
  if (typeof value === "string") {
    return value.replace(/\bollama\/Q\b/g, "Q") as T;
  }
  return value;
}

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const BRIDGEBENCH_SOAK_PATH = path.join(REPO_ROOT, "docs", "wiki", "BridgeBench-Soak.json");
const HARBOR_SOAK_PATH = path.join(REPO_ROOT, "docs", "wiki", "Harbor-Terminal-Bench-Soak.json");
const BENCHMARK_STATUS_PATH = path.join(REPO_ROOT, "docs", "wiki", "Benchmark-Status.json");

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function formatNumber(value: number | undefined, fractionDigits = 2): string {
  return typeof value === "number" ? value.toFixed(fractionDigits) : "n/a";
}

function formatRatio(numerator: number | undefined, denominator: number | undefined): string {
  if (typeof numerator !== "number" || typeof denominator !== "number") {
    return "n/a";
  }
  return `${numerator}/${denominator}`;
}

function renderHarborTask(task: HarborSoakTaskSummary): string[] {
  return [
    `### ${task.taskLabel}`,
    "",
    `- Oracle runs: \`${task.oracle.runs ?? 0}\` | avg score \`${formatNumber(task.oracle.scoreAverage, 3)}\` | avg duration \`${formatNumber(task.oracle.durationAverageSec, 2)} s\``,
    `- Q runs: \`${task.q.runs ?? 0}\` | avg score \`${formatNumber(task.q.scoreAverage, 3)}\` | avg duration \`${formatNumber(task.q.durationAverageSec, 2)} s\``,
    ""
  ];
}

function renderMarkdown(report: SweepReport): string {
  const lines: string[] = [
    "# Q Benchmark Sweep (60m)",
    "",
    "This page records the hour-class Q and Immaculate benchmark sweep. It ties the 60-minute benchmark publication lane to the repeated BridgeBench and Harbor task-pack lanes in one stamped surface.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Q model name: \`${report.release.q.modelName}\``,
    `- Q foundation model: \`${report.release.q.foundationModel}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none"}\``,
    ""
  ];

  if (report.wandbSoak) {
    lines.push("## W&B 60m Soak");
    lines.push("");
    lines.push(`- Suite: \`${report.wandbSoak.suiteId ?? "n/a"}\``);
    lines.push(`- Pack: \`${report.wandbSoak.packLabel ?? report.wandbSoak.packId ?? "n/a"}\``);
    lines.push(`- Published: \`${report.wandbSoak.publishedAt ?? "n/a"}\``);
    lines.push(`- Planned duration ms: \`${report.wandbSoak.plannedDurationMs ?? "n/a"}\``);
    lines.push(`- Wall duration ms: \`${report.wandbSoak.totalDurationMs ?? "n/a"}\``);
    lines.push(`- Failed assertions: \`${report.wandbSoak.failedAssertions ?? "n/a"}\` / \`${report.wandbSoak.totalAssertions ?? "n/a"}\``);
    lines.push(`- Run URL: \`${report.wandbSoak.runUrl ?? "n/a"}\``);
    lines.push("");
  }

  if (report.bridgeBenchSoak) {
    lines.push("## BridgeBench Soak");
    lines.push("");
    lines.push(`- Generated: \`${report.bridgeBenchSoak.generatedAt ?? "n/a"}\``);
    lines.push(`- Duration seconds: \`${report.bridgeBenchSoak.durationSeconds ?? "n/a"}\``);
    lines.push(`- Runs: \`${report.bridgeBenchSoak.runCount ?? 0}\` attempted / \`${report.bridgeBenchSoak.successfulRunCount ?? 0}\` completed / \`${report.bridgeBenchSoak.failedRunCount ?? 0}\` failed`);
    lines.push(`- Parse success: \`${formatRatio(report.bridgeBenchSoak.parseSuccessCount, report.bridgeBenchSoak.taskCount)}\` (${formatNumber(report.bridgeBenchSoak.parseSuccessRate, 2)})`);
    lines.push(`- Latency ms: avg \`${formatNumber(report.bridgeBenchSoak.averageLatencyMs)}\` / p95 \`${formatNumber(report.bridgeBenchSoak.p95LatencyMs)}\` / min \`${formatNumber(report.bridgeBenchSoak.minLatencyMs)}\` / max \`${formatNumber(report.bridgeBenchSoak.maxLatencyMs)}\` / median \`${formatNumber(report.bridgeBenchSoak.medianLatencyMs)}\``);
    lines.push(`- Run latency ms: avg \`${formatNumber(report.bridgeBenchSoak.averageRunLatencyMs)}\` / p95 \`${formatNumber(report.bridgeBenchSoak.p95RunLatencyMs)}\``);
    lines.push(`- Bridge runtime failed assertions: \`${report.bridgeBenchSoak.bridgeRuntimeFailedAssertionsTotal ?? 0}\` across \`${report.bridgeBenchSoak.bridgeRuntimeFailedAssertionRuns ?? 0}\` runs`);
    lines.push("");
  }

  if (report.harborSoak?.summary) {
    lines.push("## Harbor Terminal Bench Soak");
    lines.push("");
    lines.push(`- Generated: \`${report.harborSoak.generatedAt ?? "n/a"}\``);
    lines.push(`- Duration seconds: \`${report.harborSoak.durationSeconds ?? "n/a"}\``);
    lines.push(`- Total runs: \`${report.harborSoak.summary.totalRuns ?? 0}\``);
    lines.push(`- Oracle avg score: \`${formatNumber(report.harborSoak.summary.oracle?.scoreAverage, 3)}\` | avg duration \`${formatNumber(report.harborSoak.summary.oracle?.durationAverageSec, 2)} s\``);
    lines.push(`- Q avg score: \`${formatNumber(report.harborSoak.summary.q?.scoreAverage, 3)}\` | avg duration \`${formatNumber(report.harborSoak.summary.q?.durationAverageSec, 2)} s\``);
    lines.push("");
    for (const task of report.harborSoak.summary.tasks ?? []) {
      lines.push(...renderHarborTask(task));
    }
  }

  lines.push("## Truth Boundary");
  lines.push("");
  lines.push("- The W&B section is the published hour-class benchmark lane for Immaculate.");
  lines.push("- The BridgeBench and Harbor sections are repo-local repeated Q-only sweeps and remain distinct from W&B publication unless explicitly published there.");
  lines.push("- If a section is missing, that run was not produced yet in this checkout.");
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const [release, bridgeBenchSoak, harborSoak, benchmarkStatus] = await Promise.all([
    resolveReleaseMetadata(),
    readJsonFile<BridgeBenchSoakReport>(BRIDGEBENCH_SOAK_PATH),
    readJsonFile<HarborSoakReport>(HARBOR_SOAK_PATH),
    readJsonFile<BenchmarkStatusReport>(BENCHMARK_STATUS_PATH)
  ]);

  const report: SweepReport = {
    generatedAt: new Date().toISOString(),
    release: {
      ...release,
      q: {
        modelName: release.q.modelName,
        foundationModel: release.q.foundationModel,
        trainingLock: release.q.trainingLock,
        hybridSession: release.q.hybridSession
      }
    },
    bridgeBenchSoak: sanitizeSweepValue(bridgeBenchSoak),
    harborSoak: sanitizeSweepValue(harborSoak),
    wandbSoak: benchmarkStatus?.publications?.["latency-soak-60m"],
    output: {
      jsonPath: path.join("docs", "wiki", "Q-Benchmark-Sweep-60m.json"),
      markdownPath: path.join("docs", "wiki", "Q-Benchmark-Sweep-60m.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), renderMarkdown(report), "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Q benchmark sweep report generation failed.");
  process.exitCode = 1;
});
