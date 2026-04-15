import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { BRIDGEBENCH_SCENARIOS, runBridgeBench, type BridgeBenchReport } from "./bridgebench.js";
import { type ReleaseMetadata } from "./release-metadata.js";

type BridgeBenchSoakTrainingRow = {
  attempt: number;
  scenarioId: string;
  label: string;
  objective: string;
  context: string;
  latencyMs: number;
  wallLatencyMs: number;
  parseSuccess: boolean;
  structuredFieldCount: number;
  status: "completed" | "failed";
  thinkingDetected: boolean;
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
};

type BridgeBenchSoakRunSummary = {
  attempt: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "failed";
  bridgeSuiteId?: string;
  bridgePackId?: string;
  parseSuccessCount?: number;
  taskCount?: number;
  parseSuccessRate?: number;
  averageLatencyMs?: number;
  p95LatencyMs?: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
  medianLatencyMs?: number;
  bridgeRuntimeFailedAssertions?: number;
  trainingRowCount?: number;
  error?: string;
};

type BridgeBenchSoakReport = {
  generatedAt: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  durationMs: number;
  deadlineAt: string;
  runCount: number;
  successfulRunCount: number;
  failedRunCount: number;
  taskCount: number;
  parseSuccessCount: number;
  parseSuccessRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  medianLatencyMs: number;
  averageRunLatencyMs: number;
  p95RunLatencyMs: number;
  bridgeRuntimeFailedAssertionsTotal: number;
  bridgeRuntimeFailedAssertionRuns: number;
  qAlias: string;
  truthfulModelLabel: string;
  release?: ReleaseMetadata;
  runs: BridgeBenchSoakRunSummary[];
  trainingRows: BridgeBenchSoakTrainingRow[];
  markdownSummaryLines: string[];
  markdownSummary: string;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

type ParsedSoakOptions = {
  durationSeconds: number;
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const OUTPUT_JSON_PATH = path.join("docs", "wiki", "BridgeBench-Soak.json");
const OUTPUT_MARKDOWN_PATH = path.join("docs", "wiki", "BridgeBench-Soak.md");
const DEFAULT_DURATION_SECONDS = 3_600;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1)
  );
  return sorted[index] ?? 0;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseSoakOptions(argv: string[]): ParsedSoakOptions {
  let durationSeconds = DEFAULT_DURATION_SECONDS;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) {
      continue;
    }
    if (argument === "--duration-seconds" || argument === "--duration") {
      durationSeconds = parsePositiveNumber(argv[index + 1]) ?? durationSeconds;
      index += 1;
      continue;
    }
    if (argument.startsWith("--duration-seconds=")) {
      durationSeconds = parsePositiveNumber(argument.slice("--duration-seconds=".length)) ?? durationSeconds;
      continue;
    }
    if (argument.startsWith("--duration=")) {
      durationSeconds = parsePositiveNumber(argument.slice("--duration=".length)) ?? durationSeconds;
    }
  }
  return {
    durationSeconds: Math.max(0, durationSeconds)
  };
}

function collectLatencies(report: BridgeBenchReport): number[] {
  if (report.models.length !== 1) {
    throw new Error(
      `BridgeBench soak expects exactly one Q-only model summary. Found ${report.models.length}.`
    );
  }
  return report.models[0]?.tasks.map((task) => task.latencyMs).filter((value) => value > 0) ?? [];
}

function summarizeRun(attempt: number, report: BridgeBenchReport, startedAt: string, durationMs: number): {
  summary: BridgeBenchSoakRunSummary;
  latencies: number[];
  parseSuccessCount: number;
  taskCount: number;
  trainingRows: BridgeBenchSoakTrainingRow[];
} {
  const model = report.models[0];
  if (!model) {
    throw new Error("BridgeBench soak expected a Q model summary.");
  }
  const scenarioMap = new Map(BRIDGEBENCH_SCENARIOS.map((scenario) => [scenario.id, scenario]));
  const latencies = collectLatencies(report);
  const parseSuccessCount = model.parseSuccessCount;
  const taskCount = model.taskCount;
  const completedAt = new Date().toISOString();
  const trainingRows = model.tasks
    .filter(
      (task) =>
        task.status === "completed" &&
        task.parseSuccess &&
        Boolean(task.routeSuggestion?.trim()) &&
        Boolean(task.reasonSummary?.trim()) &&
        Boolean(task.commitStatement?.trim())
    )
    .map((task) => {
      const scenario = scenarioMap.get(task.scenarioId);
      return {
        attempt,
        scenarioId: task.scenarioId,
        label: task.label,
        objective: scenario?.objective ?? task.label,
        context: scenario?.context ?? task.responsePreview,
        latencyMs: task.latencyMs,
        wallLatencyMs: task.wallLatencyMs,
        parseSuccess: task.parseSuccess,
        structuredFieldCount: task.structuredFieldCount,
        status: task.status,
        thinkingDetected: task.thinkingDetected,
        routeSuggestion: task.routeSuggestion,
        reasonSummary: task.reasonSummary,
        commitStatement: task.commitStatement
      } satisfies BridgeBenchSoakTrainingRow;
    });
  return {
    summary: {
      attempt,
      startedAt,
      completedAt,
      durationMs: Number(durationMs.toFixed(2)),
      status: "completed",
      bridgeSuiteId: report.bridgeRuntime.suiteId,
      bridgePackId: report.bridgeRuntime.packId,
      parseSuccessCount,
      taskCount,
      parseSuccessRate: Number((parseSuccessCount / Math.max(1, taskCount)).toFixed(2)),
      averageLatencyMs: Number(average(latencies).toFixed(2)),
      p95LatencyMs: Number(percentile(latencies, 0.95).toFixed(2)),
      minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
      medianLatencyMs: Number(percentile(latencies, 0.5).toFixed(2)),
      bridgeRuntimeFailedAssertions: report.bridgeRuntime.failedAssertions,
      trainingRowCount: trainingRows.length
    },
    latencies,
    parseSuccessCount,
    taskCount,
    trainingRows
  };
}

function buildMarkdownSummary(report: Pick<
  BridgeBenchSoakReport,
  | "generatedAt"
  | "durationSeconds"
  | "runCount"
  | "successfulRunCount"
  | "failedRunCount"
  | "parseSuccessCount"
  | "taskCount"
  | "parseSuccessRate"
  | "averageLatencyMs"
  | "p95LatencyMs"
  | "minLatencyMs"
  | "maxLatencyMs"
  | "medianLatencyMs"
  | "averageRunLatencyMs"
  | "p95RunLatencyMs"
  | "bridgeRuntimeFailedAssertionsTotal"
  | "bridgeRuntimeFailedAssertionRuns"
  | "qAlias"
  | "truthfulModelLabel"
  | "trainingRows"
>): string {
  return [
    "# BridgeBench Soak",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Duration: \`${report.durationSeconds}s\``,
    `- Runs: \`${report.runCount}\` attempted / \`${report.successfulRunCount}\` completed / \`${report.failedRunCount}\` failed`,
    `- Parse success: \`${report.parseSuccessCount}/${report.taskCount}\` (${report.parseSuccessRate})`,
    `- Latency ms: avg \`${report.averageLatencyMs}\` / p95 \`${report.p95LatencyMs}\` / min \`${report.minLatencyMs}\` / max \`${report.maxLatencyMs}\` / median \`${report.medianLatencyMs}\``,
    `- Run latency ms: avg \`${report.averageRunLatencyMs}\` / p95 \`${report.p95RunLatencyMs}\``,
    `- Bridge runtime failed assertions: \`${report.bridgeRuntimeFailedAssertionsTotal}\` across \`${report.bridgeRuntimeFailedAssertionRuns}\` runs`,
    `- Training rows: \`${report.trainingRows.length}\``,
    `- Q alias: \`${report.qAlias}\``,
    `- Truthful model label: \`${report.truthfulModelLabel}\``
  ].join("\n");
}

async function main(): Promise<void> {
  const { durationSeconds } = parseSoakOptions(process.argv.slice(2));
  await mkdir(WIKI_ROOT, { recursive: true });

  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  const deadlineAtMs = Date.now() + durationSeconds * 1000;
  const runs: BridgeBenchSoakRunSummary[] = [];
  const trainingRows: BridgeBenchSoakTrainingRow[] = [];
  const allLatencies: number[] = [];
  const runLatencies: number[] = [];
  let parseSuccessCount = 0;
  let taskCount = 0;
  let bridgeRuntimeFailedAssertionsTotal = 0;
  let bridgeRuntimeFailedAssertionRuns = 0;
  let release: ReleaseMetadata | undefined;
  let qAlias = "Q";
  let truthfulModelLabel = "Q";

  let attempt = 0;
  while (attempt === 0 || Date.now() < deadlineAtMs) {
    attempt += 1;
    const runStartedAt = new Date().toISOString();
    const runStartedMs = performance.now();

    try {
      const report = await runBridgeBench();
      const durationMs = performance.now() - runStartedMs;
      const run = summarizeRun(attempt, report, runStartedAt, durationMs);
      runs.push(run.summary);
      trainingRows.push(...run.trainingRows);
      allLatencies.push(...run.latencies);
      runLatencies.push(run.summary.averageLatencyMs ?? 0);
      parseSuccessCount += run.parseSuccessCount;
      taskCount += run.taskCount;
      bridgeRuntimeFailedAssertionsTotal += report.bridgeRuntime.failedAssertions;
      if (report.bridgeRuntime.failedAssertions > 0) {
        bridgeRuntimeFailedAssertionRuns += 1;
      }
      release ??= report.release;
      qAlias = report.qAlias;
      truthfulModelLabel = report.models[0]?.truthfulLabel ?? truthfulModelLabel;
    } catch (error) {
      runs.push({
        attempt,
        startedAt: runStartedAt,
        completedAt: new Date().toISOString(),
        durationMs: Number((performance.now() - runStartedMs).toFixed(2)),
        status: "failed",
        error: error instanceof Error ? error.message : "BridgeBench soak run failed"
      });
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = performance.now() - startedAtMs;
  const successfulRunCount = runs.filter((run) => run.status === "completed").length;
  const failedRunCount = runs.length - successfulRunCount;
  const averageLatencyMs = Number(average(allLatencies).toFixed(2));
  const p95LatencyMs = Number(percentile(allLatencies, 0.95).toFixed(2));
  const minLatencyMs = allLatencies.length > 0 ? Math.min(...allLatencies) : 0;
  const maxLatencyMs = allLatencies.length > 0 ? Math.max(...allLatencies) : 0;
  const medianLatencyMs = Number(percentile(allLatencies, 0.5).toFixed(2));
  const averageRunLatencyMs = Number(average(runLatencies).toFixed(2));
  const p95RunLatencyMs = Number(percentile(runLatencies, 0.95).toFixed(2));
  const parseSuccessRate = Number((parseSuccessCount / Math.max(1, taskCount)).toFixed(2));

  const report: BridgeBenchSoakReport = {
    generatedAt: completedAt,
    startedAt,
    completedAt,
    durationSeconds,
    durationMs: Number(durationMs.toFixed(2)),
    deadlineAt: new Date(deadlineAtMs).toISOString(),
    runCount: runs.length,
    successfulRunCount,
    failedRunCount,
    taskCount,
    parseSuccessCount,
    parseSuccessRate,
    averageLatencyMs,
    p95LatencyMs,
    minLatencyMs,
    maxLatencyMs,
    medianLatencyMs,
    averageRunLatencyMs,
    p95RunLatencyMs,
    bridgeRuntimeFailedAssertionsTotal,
    bridgeRuntimeFailedAssertionRuns,
    qAlias,
    truthfulModelLabel,
    release,
    runs,
    trainingRows,
    markdownSummaryLines: [],
    markdownSummary: "",
    output: {
      jsonPath: OUTPUT_JSON_PATH,
      markdownPath: OUTPUT_MARKDOWN_PATH
    }
  };

  report.markdownSummary = buildMarkdownSummary(report);
  report.markdownSummaryLines = report.markdownSummary.split("\n");

  await writeFile(path.join(REPO_ROOT, OUTPUT_JSON_PATH), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, OUTPUT_MARKDOWN_PATH), `${report.markdownSummary}\n`, "utf8");
  process.stdout.write(
    [
      `BridgeBench soak complete: ${successfulRunCount}/${runs.length} runs succeeded across ${durationSeconds}s.`,
      `Parse success: ${parseSuccessCount}/${taskCount} (${parseSuccessRate}).`,
      `Latency ms: avg ${averageLatencyMs} / p95 ${p95LatencyMs} / min ${minLatencyMs} / max ${maxLatencyMs} / median ${medianLatencyMs}.`,
      `Output: ${OUTPUT_JSON_PATH}`
    ].join("\n") + "\n"
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (failedRunCount > 0 || parseSuccessRate < 1 || bridgeRuntimeFailedAssertionsTotal > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "BridgeBench soak failed.");
  process.exitCode = 1;
});
