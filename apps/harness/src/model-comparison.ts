import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createEngine, type BenchmarkReport, type GovernancePressureLevel, type IntelligenceLayerRole } from "@immaculate/core";
import { loadLatestBenchmarkReportForPack } from "./benchmark.js";
import { listOllamaModels, runOllamaExecution } from "./ollama.js";
import { resolveQAliasSpecification } from "./ollama-alias.js";
import {
  displayModelName,
  resolveQModel,
  truthfulModelLabel,
  vendorForModel
} from "./q-model.js";

type ComparisonTask = {
  id: string;
  label: string;
  objective: string;
  context: string;
  role: IntelligenceLayerRole;
  governancePressure: GovernancePressureLevel;
};

type HardwareContext = {
  host: string;
  platform: string;
  arch: string;
  osVersion: string;
  cpuModel: string;
  cpuCount: number;
  memoryGiB: number;
  nodeVersion: string;
};

type ModelTaskResult = {
  taskId: string;
  label: string;
  latencyMs: number;
  wallLatencyMs: number;
  structuredFieldCount: number;
  parseSuccess: boolean;
  status: "completed" | "failed";
  failureClass?: string;
  thinkingDetected: boolean;
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
  responsePreview: string;
  error?: string;
};

type ModelSummary = {
  requestedModel: string;
  actualModel: string;
  displayName: string;
  truthfulLabel: string;
  vendor: string;
  role: IntelligenceLayerRole;
  taskCount: number;
  completedTaskCount: number;
  parseSuccessCount: number;
  parseSuccessRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  averageWallLatencyMs: number;
  averageStructuredFields: number;
  tasks: ModelTaskResult[];
};

type OrchestratorComparison = {
  generatedFrom: {
    latencyBenchmarkSuiteId?: string;
    temporalSuiteId?: string;
  };
  immaculate?: {
    packId?: string;
    failedAssertions?: number;
    reflexP95Ms?: number;
    cognitiveP95Ms?: number;
    measuredEventThroughputEventsPerSecond?: number;
    hardware?: BenchmarkReport["hardwareContext"];
  };
  temporal?: {
    failedAssertions?: number;
    immaculateWorkflowWallClockP95Ms?: number;
    temporalWorkflowWallClockP95Ms?: number;
    immaculateRssPeakMiB?: number;
    temporalRssPeakMiB?: number;
    hardware?: BenchmarkReport["hardwareContext"];
  };
  interpretation?: string;
};

export type ModelComparisonReport = {
  generatedAt: string;
  surface: "direct-local-ollama-structured-contract";
  ollamaBaseUrl: string;
  qAlias: {
    alias: string;
    actualModel: string;
    truthfulLabel: string;
  };
  hardwareContext: HardwareContext;
  models: ModelSummary[];
  orchestrators?: OrchestratorComparison;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const DEFAULT_OLLAMA_URL = process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434";

const COMPARISON_TASKS: ComparisonTask[] = [
  {
    id: "security-triage",
    label: "Security triage",
    objective:
      "Review a live control-plane change with a forged ACK path and choose the safest route under elevated pressure.",
    context:
      "A bridge device can emit late ACKs. Recommend route, reason, and commit for a fail-closed remediation pass.",
    role: "reasoner",
    governancePressure: "elevated"
  },
  {
    id: "ops-recovery",
    label: "Ops recovery",
    objective:
      "Stabilize a federated peer that is showing lease jitter, one failed execution, and a pending repair window.",
    context:
      "Keep recovery bounded, avoid overclaiming health, and preserve the durable retry lineage.",
    role: "mid",
    governancePressure: "critical"
  },
  {
    id: "coding-fix",
    label: "Coding fix",
    objective:
      "Decide the next patch for a TypeScript service that needs same-origin operator access without leaking bearer tokens into browser-visible URLs.",
    context:
      "The answer should stay within route, reason, and commit structure rather than prose wandering.",
    role: "reasoner",
    governancePressure: "clear"
  },
  {
    id: "orchestration-route",
    label: "Orchestration route",
    objective:
      "Select the next orchestration move when decode confidence is strong, transport health is mixed, and arbitration must decide whether to think before acting.",
    context:
      "Prefer honest guarded action over unsafe reflex if the substrate would otherwise overcommit.",
    role: "mid",
      governancePressure: "elevated"
  }
];

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1)
  );
  return Number((sorted[index] ?? 0).toFixed(2));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function captureHardwareContext(): HardwareContext {
  const cpus = os.cpus();
  const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length;
  return {
    host: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    osVersion: os.version(),
    cpuModel: cpus[0]?.model?.trim() || "unknown-cpu",
    cpuCount: Math.max(1, cpuCount),
    memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    nodeVersion: process.version
  };
}

function buildComparisonModels(installedModelNames: string[]): string[] {
  const qAlias = resolveQAliasSpecification();
  const requested = (
    process.env.IMMACULATE_MODEL_COMPARISON_SET?.split(",").map((entry) => entry.trim()) ?? [
      qAlias.alias,
      "qwen3:8b",
      "gemma3:4b"
    ]
  ).filter(Boolean);

  return Array.from(
    new Set(
      requested.filter((candidate) => {
        const actual = resolveQModel(candidate) ?? candidate;
        return installedModelNames.includes(actual);
      })
    )
  );
}

function buildTaskResultsSummary(
  requestedModel: string,
  actualModel: string,
  role: IntelligenceLayerRole,
  tasks: ModelTaskResult[]
): ModelSummary {
  const latencies = tasks.map((task) => task.latencyMs).filter((value) => value > 0);
  const wallLatencies = tasks.map((task) => task.wallLatencyMs).filter((value) => value > 0);
  const parseSuccessCount = tasks.filter((task) => task.parseSuccess).length;
  return {
    requestedModel,
    actualModel,
    displayName: displayModelName(actualModel),
    truthfulLabel: truthfulModelLabel(actualModel),
    vendor: vendorForModel(actualModel),
    role,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.status === "completed").length,
    parseSuccessCount,
    parseSuccessRate: Number((parseSuccessCount / Math.max(1, tasks.length)).toFixed(2)),
    averageLatencyMs: average(latencies),
    p95LatencyMs: percentile(latencies, 0.95),
    averageWallLatencyMs: average(wallLatencies),
    averageStructuredFields: average(tasks.map((task) => task.structuredFieldCount)),
    tasks
  };
}

async function runModelComparisonTasks(
  requestedModel: string,
  actualModel: string,
  ollamaBaseUrl: string
): Promise<ModelSummary> {
  const tasks: ModelTaskResult[] = [];

  for (const task of COMPARISON_TASKS) {
    const engine = createEngine({
      bootstrap: true,
      recordEvents: false
    });
    for (let index = 0; index < 8; index += 1) {
      engine.tick();
    }

    const started = performance.now();
    try {
      const result = await runOllamaExecution({
        snapshot: engine.getSnapshot(),
        layer: {
          id: `comparison-${task.role}-${actualModel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
          name: `${displayModelName(actualModel)} ${task.role} comparison layer`,
          backend: "ollama",
          model: actualModel,
          role: task.role,
          status: "ready",
          endpoint: ollamaBaseUrl,
          registeredAt: new Date().toISOString()
        },
        objective: task.objective,
        governancePressure: task.governancePressure,
        context: task.context
      });
      const structuredFieldCount =
        result.structuredFieldCount ||
        [
          result.execution.routeSuggestion,
          result.execution.reasonSummary,
          result.execution.commitStatement
        ].filter(Boolean).length;
      tasks.push({
        taskId: task.id,
        label: task.label,
        latencyMs: result.execution.latencyMs,
        wallLatencyMs: Number((performance.now() - started).toFixed(2)),
        structuredFieldCount,
        parseSuccess: structuredFieldCount === 3 && result.execution.status === "completed",
        status: result.execution.status,
        failureClass: result.failureClass,
        thinkingDetected: result.thinkingDetected,
        routeSuggestion: result.execution.routeSuggestion,
        reasonSummary: result.execution.reasonSummary,
        commitStatement: result.execution.commitStatement,
        responsePreview: result.execution.responsePreview
      });
    } catch (error) {
      tasks.push({
        taskId: task.id,
        label: task.label,
        latencyMs: 0,
        wallLatencyMs: Number((performance.now() - started).toFixed(2)),
        structuredFieldCount: 0,
        parseSuccess: false,
        status: "failed",
        thinkingDetected: false,
        responsePreview: "",
        error: error instanceof Error ? error.message : "model comparison failed"
      });
    }
  }

  return buildTaskResultsSummary(requestedModel, actualModel, "reasoner", tasks);
}

function getSeriesValue(report: BenchmarkReport | null, seriesId: string, field: keyof BenchmarkReport["series"][number]) {
  const series = report?.series.find((entry) => entry.id === seriesId);
  const value = series?.[field];
  return typeof value === "number" ? value : undefined;
}

async function loadOrchestratorComparison(): Promise<OrchestratorComparison | undefined> {
  const latencyBenchmark = await loadLatestBenchmarkReportForPack("latency-benchmark-60s");
  const temporalBenchmark = await loadLatestBenchmarkReportForPack("temporal-baseline");
  if (!latencyBenchmark && !temporalBenchmark) {
    return undefined;
  }

  const temporalP95 = getSeriesValue(temporalBenchmark, "temporal_baseline_wall_clock_ms", "p95");
  const immaculateWorkflowP95 = getSeriesValue(
    temporalBenchmark,
    "immaculate_baseline_wall_clock_ms",
    "p95"
  );
  const latencyBenchmarkFailures =
    latencyBenchmark?.assertions.filter((assertion) => assertion.status === "fail").length ?? 0;
  let interpretation: string | undefined;
  if (latencyBenchmarkFailures > 0) {
    interpretation = `The latest local ${latencyBenchmark?.packId ?? "Immaculate"} run exposed ${latencyBenchmarkFailures} failing assertions on this machine, so treat its throughput line as a live regression signal rather than a release-clean baseline.`;
  } else if (temporalP95 !== undefined && immaculateWorkflowP95 !== undefined) {
    interpretation =
      temporalP95 < immaculateWorkflowP95
        ? "Temporal is still the faster control for pure workflow wall clock on this machine; Immaculate keeps the differentiated semantics in verify, arbitration, governance, and durable ledgers."
        : "Immaculate matched or beat Temporal on the simple workflow wall clock on this machine, while still carrying the heavier governed execution semantics.";
  }

  return {
    generatedFrom: {
      latencyBenchmarkSuiteId: latencyBenchmark?.suiteId,
      temporalSuiteId: temporalBenchmark?.suiteId
    },
    immaculate: latencyBenchmark
      ? {
          packId: latencyBenchmark.packId,
          failedAssertions: latencyBenchmark.assertions.filter((assertion) => assertion.status === "fail").length,
          reflexP95Ms: getSeriesValue(latencyBenchmark, "reflex_latency_ms", "p95"),
          cognitiveP95Ms: getSeriesValue(latencyBenchmark, "cognitive_latency_ms", "p95"),
          measuredEventThroughputEventsPerSecond: getSeriesValue(
            latencyBenchmark,
            "event_throughput_events_s",
            "p50"
          ),
          hardware: latencyBenchmark.hardwareContext
        }
      : undefined,
    temporal: temporalBenchmark
      ? {
          failedAssertions: temporalBenchmark.assertions.filter((assertion) => assertion.status === "fail").length,
          immaculateWorkflowWallClockP95Ms: immaculateWorkflowP95,
          temporalWorkflowWallClockP95Ms: temporalP95,
          immaculateRssPeakMiB: getSeriesValue(
            temporalBenchmark,
            "immaculate_baseline_rss_peak_mib",
            "p95"
          ),
          temporalRssPeakMiB: getSeriesValue(
            temporalBenchmark,
            "temporal_baseline_rss_peak_mib",
            "p95"
          ),
          hardware: temporalBenchmark.hardwareContext
        }
      : undefined,
    interpretation
  };
}

function renderMarkdown(report: ModelComparisonReport): string {
  const lines = [
    "# Model and Orchestrator Comparison",
    "",
    "This page is generated from direct local Ollama structured-contract runs plus the latest published orchestrator benchmark packs that exist on this machine.",
    "It does not measure the served Q gateway edge. It measures the underlying local model path that the gateway depends on.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Surface: ${report.surface}`,
    `- Ollama endpoint: ${report.ollamaBaseUrl}`,
    `- Q alias: ${report.qAlias.alias.toUpperCase()} -> ${report.qAlias.actualModel}`,
    `- Hardware: ${JSON.stringify(report.hardwareContext)}`,
    ""
  ];

  lines.push("## Live Model Results", "");
  for (const model of report.models) {
    lines.push(`### ${model.truthfulLabel}`, "");
    lines.push(`- Vendor: ${model.vendor}`);
    lines.push(`- Completed tasks: \`${model.completedTaskCount}/${model.taskCount}\``);
    lines.push(`- Structured parse success: \`${model.parseSuccessCount}/${model.taskCount}\` (${model.parseSuccessRate})`);
    lines.push(`- Average model latency: \`${model.averageLatencyMs}\` ms`);
    lines.push(`- P95 model latency: \`${model.p95LatencyMs}\` ms`);
    lines.push(`- Average wall latency: \`${model.averageWallLatencyMs}\` ms`);
    lines.push(`- Average structured fields: \`${model.averageStructuredFields}\` / 3`);
    lines.push("");
    for (const task of model.tasks) {
      lines.push(`#### ${task.label}`, "");
      lines.push(`- Status: \`${task.status}\``);
      lines.push(`- Model latency: \`${task.latencyMs}\` ms`);
      lines.push(`- Wall latency: \`${task.wallLatencyMs}\` ms`);
      lines.push(`- Structured fields: \`${task.structuredFieldCount}/3\``);
      lines.push(`- Thinking detected: \`${task.thinkingDetected}\``);
      lines.push(`- Failure class: \`${task.failureClass ?? "none"}\``);
      if (task.error) {
        lines.push(`- Error: \`${task.error}\``);
      } else {
        lines.push(`- Route: ${task.routeSuggestion ?? "missing"}`);
        lines.push(`- Reason: ${task.reasonSummary ?? "missing"}`);
        lines.push(`- Commit: ${task.commitStatement ?? "missing"}`);
      }
      lines.push("");
    }
  }

  if (report.orchestrators) {
    lines.push("## Orchestrator Baseline", "");
    if (report.orchestrators.immaculate) {
      lines.push(`- Immaculate pack: \`${report.orchestrators.immaculate.packId ?? "unknown"}\``);
      lines.push(
        `- Immaculate failed assertions: \`${report.orchestrators.immaculate.failedAssertions ?? "n/a"}\``
      );
      lines.push(`- Immaculate 60s reflex P95: \`${report.orchestrators.immaculate.reflexP95Ms ?? "n/a"}\` ms`);
      lines.push(`- Immaculate 60s cognitive P95: \`${report.orchestrators.immaculate.cognitiveP95Ms ?? "n/a"}\` ms`);
      lines.push(
        `- Immaculate measured throughput: \`${report.orchestrators.immaculate.measuredEventThroughputEventsPerSecond ?? "n/a"}\` events/s`
      );
    }
    if (report.orchestrators.temporal) {
      lines.push(
        `- Temporal failed assertions: \`${report.orchestrators.temporal.failedAssertions ?? "n/a"}\``
      );
      lines.push(
        `- Immaculate workflow wall clock P95 in Temporal pack: \`${report.orchestrators.temporal.immaculateWorkflowWallClockP95Ms ?? "n/a"}\` ms`
      );
      lines.push(
        `- Temporal workflow wall clock P95: \`${report.orchestrators.temporal.temporalWorkflowWallClockP95Ms ?? "n/a"}\` ms`
      );
      lines.push(
        `- Immaculate RSS peak P95: \`${report.orchestrators.temporal.immaculateRssPeakMiB ?? "n/a"}\` MiB`
      );
      lines.push(
        `- Temporal RSS peak P95: \`${report.orchestrators.temporal.temporalRssPeakMiB ?? "n/a"}\` MiB`
      );
    }
    if (report.orchestrators.interpretation) {
      lines.push(`- Interpretation: ${report.orchestrators.interpretation}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function runModelComparison(): Promise<ModelComparisonReport> {
  const generatedAt = new Date().toISOString();
  const installed = await listOllamaModels(DEFAULT_OLLAMA_URL);
  const installedModelNames = installed.map((model) => model.name);
  const requestedModels = buildComparisonModels(installedModelNames);
  if (requestedModels.length === 0) {
    throw new Error("No configured comparison models are installed in local Ollama.");
  }

  const models: ModelSummary[] = [];
  for (const requestedModel of requestedModels) {
    const actualModel = resolveQModel(requestedModel) ?? requestedModel;
    models.push(await runModelComparisonTasks(requestedModel, actualModel, DEFAULT_OLLAMA_URL));
  }

  models.sort(
    (left, right) =>
      right.parseSuccessRate - left.parseSuccessRate ||
      left.p95LatencyMs - right.p95LatencyMs ||
      left.truthfulLabel.localeCompare(right.truthfulLabel)
  );

  const report: ModelComparisonReport = {
    generatedAt,
    surface: "direct-local-ollama-structured-contract",
    ollamaBaseUrl: DEFAULT_OLLAMA_URL,
    qAlias: {
      alias: resolveQAliasSpecification().displayName,
      actualModel: resolveQAliasSpecification().baseModel,
      truthfulLabel: truthfulModelLabel(resolveQAliasSpecification().baseModel)
    },
    hardwareContext: captureHardwareContext(),
    models,
    orchestrators: await loadOrchestratorComparison(),
    output: {
      jsonPath: path.join("docs", "wiki", "Model-Benchmark-Comparison.json"),
      markdownPath: path.join("docs", "wiki", "Model-Benchmark-Comparison.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");

  return report;
}
