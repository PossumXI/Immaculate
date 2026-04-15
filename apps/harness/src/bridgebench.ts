import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createEngine, type BenchmarkAssertion, type BenchmarkReport, type GovernancePressureLevel, type IntelligenceLayerRole } from "@immaculate/core";
import { runPublishedBenchmark, loadLatestBenchmarkReportForPack } from "./benchmark.js";
import { listOllamaModels, runOllamaExecution } from "./ollama.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";
import { getQModelAlias, matchesModelReference, resolveQModel, truthfulModelLabel, vendorForModel } from "./q-model.js";

export type BridgeBenchScenario = {
  id: string;
  label: string;
  objective: string;
  context: string;
  role: IntelligenceLayerRole;
  governancePressure: GovernancePressureLevel;
};

type BridgeBenchTaskResult = {
  scenarioId: string;
  label: string;
  latencyMs: number;
  wallLatencyMs: number;
  parseSuccess: boolean;
  structuredFieldCount: number;
  status: "completed" | "failed";
  failureClass?: string;
  thinkingDetected: boolean;
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
  responsePreview: string;
  error?: string;
};

type BridgeBenchModelSummary = {
  requestedModel: string;
  actualModel: string;
  truthfulLabel: string;
  vendor: string;
  taskCount: number;
  parseSuccessCount: number;
  parseSuccessRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  tasks: BridgeBenchTaskResult[];
};

type BridgeRuntimeSummary = {
  suiteId: string;
  packId: string;
  failedAssertions: number;
  selectedAssertions: BenchmarkAssertion[];
};

type TemporalSummary = {
  suiteId?: string;
  failedAssertions?: number;
  immaculateWorkflowWallClockP95Ms?: number;
  temporalWorkflowWallClockP95Ms?: number;
};

export type BridgeBenchReport = {
  generatedAt: string;
  modelLaneSurface: "direct-q-structured-contract";
  ollamaBaseUrl: string;
  release: ReleaseMetadata;
  qAlias: string;
  hardwareContext: {
    host: string;
    platform: string;
    arch: string;
    osVersion: string;
    cpuModel: string;
    cpuCount: number;
    memoryGiB: number;
    nodeVersion: string;
  };
  models: BridgeBenchModelSummary[];
  bridgeRuntime: BridgeRuntimeSummary;
  temporalBaseline?: TemporalSummary;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const DEFAULT_OLLAMA_URL = process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434";

export const BRIDGEBENCH_SCENARIOS: BridgeBenchScenario[] = [
  {
    id: "bridge-ack-fail-closed",
    label: "Bridge ACK fail-closed",
    objective:
      "A haptic bridge emits a late ACK after timeout. Choose the safest route, reason, and commit for the next controlled pass.",
    context:
      "The response must preserve fail-closed behavior, keep the durable audit trail honest, and avoid unsafe reflex delivery.",
    role: "reasoner",
    governancePressure: "critical"
  },
  {
    id: "nonce-forgery-response",
    label: "ACK nonce forgery response",
    objective:
      "An attacker replays a forged bridge ACK without the correct nonce. Decide the immediate control-plane response.",
    context:
      "Prefer explicit containment, truthful delivery state, and no hidden success path.",
    role: "reasoner",
    governancePressure: "elevated"
  },
  {
    id: "public-q-rate-limit",
    label: "Public Q edge throttling",
    objective:
      "Design the next action when a public Q API key bursts above quota while the private operator plane must stay stable.",
    context:
      "The answer should stay within route/reason/commit structure and reflect rate-limited public access rather than global failure.",
    role: "mid",
    governancePressure: "clear"
  },
  {
    id: "bridge-continuity-routing",
    label: "Bridge continuity routing",
    objective:
      "Transport health is mixed: the websocket bridge is degraded, HTTP/2 direct is healthy, and governance pressure is elevated. Pick the next route.",
    context:
      "Prefer the safest truthful outward lane without pretending the bridge is still healthy.",
    role: "mid",
    governancePressure: "elevated"
  }
];

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return Number((sorted[index] ?? 0).toFixed(2));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function captureHardwareContext() {
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

function buildBridgeBenchModels(installedModelNames: string[]): string[] {
  const requested = (
    process.env.IMMACULATE_BRIDGEBENCH_MODEL_SET?.split(",").map((entry) => entry.trim()) ?? [getQModelAlias()]
  ).filter(Boolean);

  return Array.from(
    new Set(
      requested.filter((candidate) => {
        return installedModelNames.some((installedModelName) => matchesModelReference(installedModelName, candidate));
      })
    )
  );
}

async function runBridgeBenchModel(requestedModel: string, actualModel: string): Promise<BridgeBenchModelSummary> {
  const tasks: BridgeBenchTaskResult[] = [];

  for (const scenario of BRIDGEBENCH_SCENARIOS) {
    const engine = createEngine({
      bootstrap: true,
      recordEvents: false
    });
    for (let index = 0; index < 6; index += 1) {
      engine.tick();
    }

    const started = performance.now();
    try {
      const result = await runOllamaExecution({
        snapshot: engine.getSnapshot(),
        layer: {
          id: `bridgebench-${scenario.role}-${actualModel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
          name: `${truthfulModelLabel(actualModel)} ${scenario.role} BridgeBench Layer`,
          backend: "ollama",
          model: actualModel,
          role: scenario.role,
          status: "ready",
          endpoint: DEFAULT_OLLAMA_URL,
          registeredAt: new Date().toISOString()
        },
        objective: scenario.objective,
        governancePressure: scenario.governancePressure,
        context: scenario.context
      });
      const structuredFieldCount =
        result.structuredFieldCount ||
        [
          result.execution.routeSuggestion,
          result.execution.reasonSummary,
          result.execution.commitStatement
        ].filter(Boolean).length;
      tasks.push({
        scenarioId: scenario.id,
        label: scenario.label,
        latencyMs: result.execution.latencyMs,
        wallLatencyMs: Number((performance.now() - started).toFixed(2)),
        parseSuccess: structuredFieldCount === 3 && result.execution.status === "completed",
        structuredFieldCount,
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
        scenarioId: scenario.id,
        label: scenario.label,
        latencyMs: 0,
        wallLatencyMs: Number((performance.now() - started).toFixed(2)),
        parseSuccess: false,
        structuredFieldCount: 0,
        status: "failed",
        thinkingDetected: false,
        responsePreview: "",
        error: error instanceof Error ? error.message : "BridgeBench model execution failed"
      });
    }
  }

  const latencies = tasks.map((task) => task.latencyMs).filter((value) => value > 0);
  const parseSuccessCount = tasks.filter((task) => task.parseSuccess).length;
  return {
    requestedModel,
    actualModel,
    truthfulLabel: truthfulModelLabel(actualModel),
    vendor: vendorForModel(actualModel),
    taskCount: tasks.length,
    parseSuccessCount,
    parseSuccessRate: Number((parseSuccessCount / Math.max(1, tasks.length)).toFixed(2)),
    averageLatencyMs: average(latencies),
    p95LatencyMs: percentile(latencies, 0.95),
    tasks
  };
}

function selectBridgeAssertions(assertions: BenchmarkAssertion[]): BenchmarkAssertion[] {
  return assertions.filter((assertion) => {
    const combined = `${assertion.id} ${assertion.label} ${assertion.detail}`.toLowerCase();
    return (
      combined.includes("bridge") ||
      combined.includes("udp-osc") ||
      combined.includes("serial") ||
      combined.includes("http2")
    );
  });
}

function buildMarkdown(report: BridgeBenchReport): string {
  const lines: string[] = [];
  lines.push("# BridgeBench");
  lines.push("");
  lines.push(`Generated at: \`${report.generatedAt}\``);
  lines.push(`Release: \`${report.release.buildId}\``);
  lines.push(`Repo commit: \`${report.release.gitShortSha}\``);
  lines.push(`Model lane surface: \`${report.modelLaneSurface}\``);
  lines.push(`Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``);
  lines.push("The Q lane below measures direct local Q structured-contract behavior, not the served Q gateway edge.");
  lines.push("");
  lines.push("## Q Lane");
  lines.push("");
  for (const model of report.models) {
    lines.push(`### ${model.truthfulLabel}`);
    lines.push("");
    lines.push(`- vendor: \`${model.vendor}\``);
    lines.push(`- parse success: \`${model.parseSuccessCount}/${model.taskCount}\``);
    lines.push(`- average latency: \`${model.averageLatencyMs} ms\``);
    lines.push(`- P95 latency: \`${model.p95LatencyMs} ms\``);
    lines.push("");
  }
  lines.push("## Bridge Runtime Lane");
  lines.push("");
  lines.push(`- pack: \`${report.bridgeRuntime.packId}\``);
  lines.push(`- suite: \`${report.bridgeRuntime.suiteId}\``);
  lines.push(`- failed assertions: \`${report.bridgeRuntime.failedAssertions}\``);
  lines.push("");
  for (const assertion of report.bridgeRuntime.selectedAssertions) {
    lines.push(`- ${assertion.id}: \`${assertion.status}\` | target \`${assertion.target}\` | actual \`${assertion.actual}\``);
  }
  if (report.temporalBaseline) {
    lines.push("");
    lines.push("## Orchestrator Baseline");
    lines.push("");
    lines.push(`- temporal suite: \`${report.temporalBaseline.suiteId ?? "missing"}\``);
    lines.push(`- failed assertions: \`${report.temporalBaseline.failedAssertions ?? 0}\``);
    if (
      typeof report.temporalBaseline.immaculateWorkflowWallClockP95Ms === "number" ||
      typeof report.temporalBaseline.temporalWorkflowWallClockP95Ms === "number"
    ) {
      lines.push(
        `- workflow wall-clock P95: Immaculate \`${report.temporalBaseline.immaculateWorkflowWallClockP95Ms ?? "n/a"} ms\` / Temporal \`${report.temporalBaseline.temporalWorkflowWallClockP95Ms ?? "n/a"} ms\``
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function runBridgeBench(): Promise<BridgeBenchReport> {
  await mkdir(WIKI_ROOT, { recursive: true });
  const installedModels = await listOllamaModels(DEFAULT_OLLAMA_URL);
  const models = buildBridgeBenchModels(installedModels.map((model) => model.name));
  const modelSummaries: BridgeBenchModelSummary[] = [];

  for (const requestedModel of models) {
    const actualModel = resolveQModel(requestedModel) ?? requestedModel;
    modelSummaries.push(await runBridgeBenchModel(requestedModel, actualModel));
  }

  const bridgeRuntimeReport = await runPublishedBenchmark({
    packId: "substrate-readiness"
  });
  const temporalBaseline = await loadLatestBenchmarkReportForPack("temporal-baseline");

  const report: BridgeBenchReport = {
    generatedAt: new Date().toISOString(),
    modelLaneSurface: "direct-q-structured-contract",
    ollamaBaseUrl: DEFAULT_OLLAMA_URL,
    release: await resolveReleaseMetadata(),
    qAlias: getQModelAlias(),
    hardwareContext: captureHardwareContext(),
    models: modelSummaries,
    bridgeRuntime: {
      suiteId: bridgeRuntimeReport.suiteId,
      packId: bridgeRuntimeReport.packId,
      failedAssertions: bridgeRuntimeReport.assertions.filter((assertion) => assertion.status === "fail").length,
      selectedAssertions: selectBridgeAssertions(bridgeRuntimeReport.assertions)
    },
    temporalBaseline: temporalBaseline
      ? {
          suiteId: temporalBaseline.suiteId,
          failedAssertions: temporalBaseline.assertions.filter((assertion) => assertion.status === "fail").length,
          immaculateWorkflowWallClockP95Ms:
            temporalBaseline.series.find((series) => series.id === "immaculate_baseline_wall_clock_ms")?.p95,
          temporalWorkflowWallClockP95Ms:
            temporalBaseline.series.find((series) => series.id === "temporal_workflow_wall_clock_ms")?.p95
        }
      : undefined,
    output: {
      jsonPath: path.join("docs", "wiki", "BridgeBench.json"),
      markdownPath: path.join("docs", "wiki", "BridgeBench.md")
    }
  };

  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), buildMarkdown(report), "utf8");
  return report;
}
