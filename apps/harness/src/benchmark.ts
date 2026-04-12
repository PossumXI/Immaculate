import path from "node:path";
import { createSocket } from "node:dgram";
import { createServer as createHttp2Server, type ServerHttp2Stream } from "node:http2";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import {
  benchmarkIndexSchema,
  benchmarkReportSchema,
  type ActuationOutput,
  type BenchmarkAttribution,
  type BenchmarkPackId,
  type CognitiveExecution,
  createEngine,
  inspectDurableState,
  type BenchmarkAssertion,
  type BenchmarkComparison,
  type BenchmarkDelta,
  type BenchmarkIndex,
  type BenchmarkIndexEntry,
  type NeuroFrameWindow,
  type NeuroReplayState,
  type BenchmarkProgress,
  type BenchmarkReport,
  type BenchmarkSeries
} from "@immaculate/core";
import { createActuationManager } from "./actuation.js";
import { getBenchmarkPack } from "./benchmark-packs.js";
import { scanBidsDataset } from "./bids.js";
import {
  evaluateGovernance,
  type GovernanceDecision,
  type GovernanceStatus
} from "./governance.js";
import { buildLiveNeuroFrame } from "./live-neuro.js";
import { buildNwbReplayFrames, scanNwbFile } from "./nwb.js";
import { createPersistence } from "./persistence.js";
import { buildRoutingDecision, planAdaptiveRoute } from "./routing.js";
import { safeUnlink } from "./utils.js";
import {
  projectActuationOutput,
  projectCognitiveExecution,
  projectDatasetRecord,
  projectEventEnvelope,
  projectNeuroFrameWindow,
  projectNeuroSessionRecord,
  redactPhaseSnapshot
} from "./visibility.js";

type BenchmarkRunOptions = {
  packId?: BenchmarkPackId;
  tickIntervalMs?: number;
  maxTicks?: number;
  runtimeDir?: string;
};

const DEFAULT_TICK_INTERVAL_MS = 40;
const DEFAULT_MAX_TICKS = 320;
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const BENCHMARK_ROOT = path.join(REPO_ROOT, "benchmarks");
const BENCHMARK_RUNS_DIR = path.join(BENCHMARK_ROOT, "runs");
const LATEST_JSON_PATH = path.join(BENCHMARK_ROOT, "latest.json");
const LATEST_MARKDOWN_PATH = path.join(BENCHMARK_ROOT, "latest.md");
const INDEX_JSON_PATH = path.join(BENCHMARK_ROOT, "index.json");
const BENCHMARK_HISTORY_LIMIT = 32;
const BENCHMARK_FIXTURE_BIDS_PATH = path.join(REPO_ROOT, "fixtures", "bids", "minimal");
const BENCHMARK_FIXTURE_NWB_PATH = path.join(REPO_ROOT, "fixtures", "nwb", "minimal", "minimal-session.nwb");
const LEGACY_DEFAULT_PACK_ID: BenchmarkPackId = "substrate-readiness";
const LEGACY_DEFAULT_PACK_LABEL = "Substrate Readiness";
const BENCHMARK_ATTRIBUTION: BenchmarkAttribution = {
  owner: "Gaetano Comparcola",
  role: "Program Originator, Systems Architect, and Engineering Lead",
  website: "https://PossumX.dev",
  contributions: [
    "Defined the three-plane orchestration model across reflex, cognitive, and offline execution.",
    "Set the requirement that Immaculate be observable, replayable, benchmarked, and durable before it scales outward.",
    "Architected the synthetic connectome substrate, live harness control surfaces, and phased execution model used in this build."
  ]
};

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

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createSeries(id: string, label: string, unit: string, values: number[]): BenchmarkSeries {
  const sorted = [...values].sort((left, right) => left - right);

  return {
    id,
    label,
    unit,
    samples: values.length,
    min: Number((sorted[0] ?? 0).toFixed(2)),
    p50: Number(percentile(sorted, 0.5).toFixed(2)),
    p95: Number(percentile(sorted, 0.95).toFixed(2)),
    average: Number(average(sorted).toFixed(2)),
    max: Number((sorted[sorted.length - 1] ?? 0).toFixed(2))
  };
}

function createAssertion(
  id: string,
  label: string,
  condition: boolean,
  target: string,
  actual: string,
  detail: string,
  warning = false
): BenchmarkAssertion {
  return {
    id,
    label,
    status: condition ? "pass" : warning ? "warning" : "fail",
    target,
    actual,
    detail
  };
}

function createProgress(): BenchmarkProgress {
  return {
    stage: "integration-ready substrate for internal functional testing",
    completed: [
      "Canonical phase/pass engine across reflex, cognitive, and offline planes",
      "Realtime harness with websocket streaming and operator controls",
      "Durable event log, materialized history, and checkpoint persistence",
      "Verify barrier and integrity-aware recovery that rejects invalid lineage",
      "BIDS dataset scanning and registration into the durable ingest spine",
      "NWB time-series scanning and neuro-session registration into synchronize/decode",
      "Live NWB replay windows flowing through synchronize/decode with decode-confidence tracking",
      "Live socket neuro frames entering the durable synchronize/decode path",
      "First live local cognition backend through Ollama/Gemma wired into route/reason/commit",
      "Purpose-bound governance enforcement across mutable control, ingest, cognition, streaming, and benchmark routes",
      "Sensitive snapshot dataset and neuro-session reads redacted by default, with governed detail routes for full inspection",
      "Field-level consent projections over derived neuro features and cognitive trace previews",
      "Governed actuation dispatch and actuation output readback across the feedback plane",
      "Adapter-backed visual, haptic, and stim delivery lanes with durable actuation delivery logs",
      "Governed websocket actuation device links with acked bridge delivery and file fallback",
      "Concrete UDP/OSC actuation transport registration and delivery over protocol-aware visual lanes",
      "Supervised serial vendor transport with heartbeat health, capability health, and per-device fault isolation",
      "HTTP/2 direct device transport with typed RPC-style delivery and response telemetry",
      "Health- and latency-aware transport preference across concrete actuation lanes",
      "W&B benchmark publication backend for external experiment tracking",
      "Keyboard-first TUI and Next.js overwatch dashboard with live connectome telemetry",
      "Published internal benchmark suite for repeatable functional testing"
    ],
    remaining: [
      "Direct device adapters beyond the first live socket neurophysiology ingress path",
      "Additional vendor-specific transports beyond serial and HTTP/2 direct lanes, including MIDI and richer gRPC-class adapters",
      "Additional multi-agent and tool backends beyond the first local Ollama cognition layer",
      "Domain benchmark packs against published BCI and neurodata workloads",
      "Multi-node deployment, locality routing, and persisted historical benchmark trending"
      ]
  };
}

function formatSeries(series: BenchmarkSeries): string {
  return `${series.p95.toFixed(1)} ${series.unit} p95`;
}

function readOscString(buffer: Buffer, startOffset: number): { value: string; nextOffset: number } {
  let cursor = startOffset;
  while (cursor < buffer.length && buffer[cursor] !== 0) {
    cursor += 1;
  }
  const value = buffer.toString("utf8", startOffset, cursor);
  cursor += 1;
  while (cursor % 4 !== 0) {
    cursor += 1;
  }
  return {
    value,
    nextOffset: cursor
  };
}

function decodeOscPacket(buffer: Buffer): {
  address: string;
  typeTags: string;
  values: Array<string | number>;
} {
  const address = readOscString(buffer, 0);
  const tags = readOscString(buffer, address.nextOffset);
  const values: Array<string | number> = [];
  let cursor = tags.nextOffset;
  for (const tag of tags.value.slice(1)) {
    if (tag === "s") {
      const parsed = readOscString(buffer, cursor);
      values.push(parsed.value);
      cursor = parsed.nextOffset;
      continue;
    }
    if (tag === "f") {
      values.push(Number(buffer.readFloatBE(cursor).toFixed(4)));
      cursor += 4;
    }
  }

  return {
    address: address.value,
    typeTags: tags.value,
    values
  };
}

function toRelativePublicationPath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function renderMarkdown(report: BenchmarkReport): string {
  const assertionLines = report.assertions
    .map(
      (assertion) =>
        `| ${assertion.label} | ${assertion.status.toUpperCase()} | ${assertion.target} | ${assertion.actual} | ${assertion.detail} |`
    )
    .join("\n");

  const seriesLines = report.series
    .map(
      (series) =>
        `| ${series.label} | ${series.samples} | ${series.min.toFixed(2)} | ${series.p50.toFixed(2)} | ${series.p95.toFixed(2)} | ${series.max.toFixed(2)} | ${series.unit} |`
    )
    .join("\n");

  const completed = report.progress.completed.map((item) => `- ${item}`).join("\n");
  const remaining = report.progress.remaining.map((item) => `- ${item}`).join("\n");
  const comparisonLines = report.comparison
    ? report.comparison.deltas
        .map(
          (delta) =>
            `| ${delta.label} | ${delta.before.toFixed(2)} | ${delta.after.toFixed(2)} | ${delta.delta.toFixed(2)} | ${delta.percentDelta.toFixed(2)}% | ${delta.trend} |`
        )
        .join("\n")
    : "";

  return `# Immaculate Benchmark Publication

Generated: ${report.generatedAt}
Suite: ${report.suiteId}
Pack: ${report.packLabel} (${report.packId})

## Publication

- Owner: ${report.attribution?.owner ?? BENCHMARK_ATTRIBUTION.owner}
- Role: ${report.attribution?.role ?? BENCHMARK_ATTRIBUTION.role}
- Website: ${report.attribution?.website ?? BENCHMARK_ATTRIBUTION.website}
${(report.attribution?.contributions ?? BENCHMARK_ATTRIBUTION.contributions)
  .map((item) => `- ${item}`)
  .join("\n")}

## Summary

${report.summary}

- Tick interval: ${report.tickIntervalMs} ms
- Total ticks: ${report.totalTicks}
- Total duration: ${report.totalDurationMs} ms
- Recovery mode: ${report.recoveryMode}
- Checkpoints: ${report.checkpointCount}
- Integrity: ${report.integrity.status} (${report.integrity.findingCount} findings)
${report.comparison ? `- Previous baseline: ${report.comparison.previousSuiteId}` : ""}

## Assertions

| Assertion | Status | Target | Actual | Detail |
| --- | --- | --- | --- | --- |
${assertionLines}

## Series

| Series | Samples | Min | P50 | P95 | Max | Unit |
| --- | --- | --- | --- | --- | --- | --- |
${seriesLines}

${report.comparison ? `## Trend vs Previous Baseline

| Series | Before | After | Delta | Percent | Trend |
| --- | --- | --- | --- | --- | --- |
${comparisonLines}
` : ""}

## Current Progress

${completed}

## Remaining Progression

${remaining}
`;
}

function normalizeBenchmarkReportInput(input: unknown): BenchmarkReport {
  const candidate = input as Partial<BenchmarkReport> | undefined;
  const normalized = {
    ...candidate,
    packId:
      candidate?.packId === "substrate-readiness" ||
      candidate?.packId === "durability-recovery" ||
      candidate?.packId === "latency-soak"
        ? candidate.packId
        : LEGACY_DEFAULT_PACK_ID,
    packLabel:
      typeof candidate?.packLabel === "string" && candidate.packLabel.length > 0
        ? candidate.packLabel
        : LEGACY_DEFAULT_PACK_LABEL
  };

  return benchmarkReportSchema.parse(normalized) as BenchmarkReport;
}

function normalizeBenchmarkIndexInput(input: unknown): BenchmarkIndex {
  const candidate = input as Partial<BenchmarkIndex> | undefined;
  const entries = Array.isArray(candidate?.entries) ? candidate.entries : [];
  const normalized = {
    generatedAt:
      typeof candidate?.generatedAt === "string" ? candidate.generatedAt : new Date(0).toISOString(),
    entries: entries.map((entry) => {
      const indexEntry = entry as Partial<BenchmarkIndexEntry>;
      return {
        ...indexEntry,
        packId:
          indexEntry.packId === "substrate-readiness" ||
          indexEntry.packId === "durability-recovery" ||
          indexEntry.packId === "latency-soak"
            ? indexEntry.packId
            : LEGACY_DEFAULT_PACK_ID,
        packLabel:
          typeof indexEntry.packLabel === "string" && indexEntry.packLabel.length > 0
            ? indexEntry.packLabel
            : LEGACY_DEFAULT_PACK_LABEL
      };
    })
  };

  return benchmarkIndexSchema.parse(normalized) as BenchmarkIndex;
}

async function publishBenchmarkReport(report: BenchmarkReport): Promise<BenchmarkReport> {
  await mkdir(BENCHMARK_ROOT, { recursive: true });
  await mkdir(BENCHMARK_RUNS_DIR, { recursive: true });

  const runJsonPath = path.join(BENCHMARK_RUNS_DIR, `${report.suiteId}.json`);
  const runMarkdownPath = path.join(BENCHMARK_RUNS_DIR, `${report.suiteId}.md`);
  const index = await loadPublishedBenchmarkIndex();
  const runJsonRelativePath = toRelativePublicationPath(runJsonPath);
  const runMarkdownRelativePath = toRelativePublicationPath(runMarkdownPath);
  const entry: BenchmarkIndexEntry = {
    suiteId: report.suiteId,
    generatedAt: report.generatedAt,
    packId: report.packId,
    packLabel: report.packLabel,
    recoveryMode: report.recoveryMode,
    integrityStatus: report.integrity.status,
    failedAssertions: report.assertions.filter((assertion) => assertion.status === "fail").length,
    checkpointCount: report.checkpointCount,
    summary: report.summary,
    jsonPath: runJsonRelativePath,
    markdownPath: runMarkdownRelativePath
  };
  const nextIndex: BenchmarkIndex = {
    generatedAt: report.generatedAt,
    entries: [entry, ...index.entries.filter((candidate) => candidate.suiteId !== report.suiteId)].slice(
      0,
      BENCHMARK_HISTORY_LIMIT
    )
  };
  const publishedReport: BenchmarkReport = {
    ...report,
    publication: {
      jsonPath: toRelativePublicationPath(LATEST_JSON_PATH),
      markdownPath: toRelativePublicationPath(LATEST_MARKDOWN_PATH)
    }
  };

  const jsonPayload = JSON.stringify(publishedReport, null, 2);
  const markdownPayload = renderMarkdown(publishedReport);

  await Promise.all([
    writeFile(runJsonPath, jsonPayload, "utf8"),
    writeFile(runMarkdownPath, markdownPayload, "utf8"),
    writeFile(LATEST_JSON_PATH, jsonPayload, "utf8"),
    writeFile(LATEST_MARKDOWN_PATH, markdownPayload, "utf8"),
    writeFile(INDEX_JSON_PATH, JSON.stringify(nextIndex, null, 2), "utf8")
  ]);

  return publishedReport;
}

function toBenchmarkIndexEntry(report: BenchmarkReport): BenchmarkIndexEntry {
  return {
    suiteId: report.suiteId,
    generatedAt: report.generatedAt,
    packId: report.packId,
    packLabel: report.packLabel,
    recoveryMode: report.recoveryMode,
    integrityStatus: report.integrity.status,
    failedAssertions: report.assertions.filter((assertion) => assertion.status === "fail").length,
    checkpointCount: report.checkpointCount,
    summary: report.summary,
    jsonPath: report.publication?.jsonPath ?? `benchmarks/runs/${report.suiteId}.json`,
    markdownPath: report.publication?.markdownPath ?? `benchmarks/runs/${report.suiteId}.md`
  };
}

async function loadBenchmarkHistoryFromRuns(): Promise<BenchmarkIndex> {
  try {
    const files = await readdir(BENCHMARK_RUNS_DIR, {
      withFileTypes: true
    });
    const entries = (
      await Promise.all(
        files
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map(async (entry) => {
            const filePath = path.join(BENCHMARK_RUNS_DIR, entry.name);
            try {
              const content = await readFile(filePath, "utf8");
              const report = normalizeBenchmarkReportInput(JSON.parse(content));
              return toBenchmarkIndexEntry({
                ...report,
                publication: {
                  jsonPath: toRelativePublicationPath(filePath),
                  markdownPath: toRelativePublicationPath(
                    path.join(BENCHMARK_RUNS_DIR, `${report.suiteId}.md`)
                  )
                }
              });
            } catch {
              return null;
            }
          })
      )
    )
      .filter((entry): entry is BenchmarkIndexEntry => entry !== null)
      .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt))
      .slice(0, BENCHMARK_HISTORY_LIMIT);

    return {
      generatedAt: entries[0]?.generatedAt ?? new Date(0).toISOString(),
      entries
    };
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return {
        generatedAt: new Date(0).toISOString(),
        entries: []
      };
    }
    throw error;
  }
}

export async function loadPublishedBenchmarkIndex(): Promise<BenchmarkIndex> {
  const runHistory = await loadBenchmarkHistoryFromRuns();
  try {
    const content = await readFile(INDEX_JSON_PATH, "utf8");
    const index = normalizeBenchmarkIndexInput(JSON.parse(content));
    const mergedEntries = [...index.entries, ...runHistory.entries]
      .filter(
        (entry, indexValue, entries) =>
          entries.findIndex((candidate) => candidate.suiteId === entry.suiteId) === indexValue
      )
      .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt))
      .slice(0, BENCHMARK_HISTORY_LIMIT);

    return {
      generatedAt: mergedEntries[0]?.generatedAt ?? index.generatedAt,
      entries: mergedEntries
    };
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return runHistory;
    }
    throw error;
  }
}

export async function loadPublishedBenchmarkReport(): Promise<BenchmarkReport | null> {
  try {
    const content = await readFile(LATEST_JSON_PATH, "utf8");
    return normalizeBenchmarkReportInput(JSON.parse(content));
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function loadBenchmarkReportFromRelativePath(relativePath: string): Promise<BenchmarkReport | null> {
  try {
    const content = await readFile(path.join(REPO_ROOT, relativePath), "utf8");
    return normalizeBenchmarkReportInput(JSON.parse(content));
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function loadPublishedBenchmarkReportBySuiteId(
  suiteId: string
): Promise<BenchmarkReport | null> {
  const index = await loadPublishedBenchmarkIndex();
  const entry = index.entries.find((candidate) => candidate.suiteId === suiteId);
  if (!entry) {
    return null;
  }

  return loadBenchmarkReportFromRelativePath(entry.jsonPath);
}

export async function loadLatestBenchmarkReportForPack(
  packId: BenchmarkPackId
): Promise<BenchmarkReport | null> {
  const index = await loadPublishedBenchmarkIndex();
  const entry = index.entries.find((candidate) => candidate.packId === packId);
  if (!entry) {
    return null;
  }

  return loadBenchmarkReportFromRelativePath(entry.jsonPath);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function lowerIsBetter(seriesId: string): boolean {
  return seriesId === "reflex_latency_ms" || seriesId === "cognitive_latency_ms";
}

function compareBenchmarkReports(
  previous: BenchmarkReport,
  currentSeries: BenchmarkSeries[]
): BenchmarkComparison {
  const previousSeriesById = new Map(previous.series.map((series) => [series.id, series]));
  const deltas: BenchmarkDelta[] = currentSeries
    .flatMap((series) => {
      const baseline = previousSeriesById.get(series.id);
      if (!baseline) {
        return [];
      }

      const before = baseline.p95;
      const after = series.p95;
      const delta = round(after - before);
      const percentDelta = before === 0 ? 0 : round((delta / before) * 100);
      const trend: BenchmarkDelta["trend"] =
        Math.abs(delta) < 0.01
          ? "unchanged"
          : lowerIsBetter(series.id)
            ? delta < 0
              ? "improved"
              : "regressed"
            : delta > 0
              ? "improved"
              : "regressed";

      return [
        {
          seriesId: series.id,
          label: series.label,
          unit: series.unit,
          before: round(before),
          after: round(after),
          delta,
          percentDelta,
          trend
        }
      ];
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  return {
    previousSuiteId: previous.suiteId,
    previousGeneratedAt: previous.generatedAt,
    improvedCount: deltas.filter((delta) => delta.trend === "improved").length,
    regressedCount: deltas.filter((delta) => delta.trend === "regressed").length,
    unchangedCount: deltas.filter((delta) => delta.trend === "unchanged").length,
    deltas
  };
}

export async function runPublishedBenchmark(
  options: BenchmarkRunOptions = {}
): Promise<BenchmarkReport> {
  const pack = getBenchmarkPack(options.packId ?? "substrate-readiness");
  const previousReport = await loadLatestBenchmarkReportForPack(pack.id);
  const generatedAt = new Date().toISOString();
  const suiteId = `immaculate-benchmark-${generatedAt.replace(/[:.]/g, "-")}`;
  const tickIntervalMs = options.tickIntervalMs ?? pack.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const maxTicks = options.maxTicks ?? pack.maxTicks ?? DEFAULT_MAX_TICKS;
  const runtimeDir =
    options.runtimeDir ?? path.join(REPO_ROOT, ".runtime", "benchmarks", suiteId);

  const persistence = createPersistence(runtimeDir);
  const engine = createEngine();
  const actuationManager = await createActuationManager(runtimeDir);
  await persistence.persist(engine.getDurableState());

  const reflexSamples: number[] = [];
  const cognitiveSamples: number[] = [];
  const throughputSamples: number[] = [];
  const coherenceSamples: number[] = [];
  const decodeConfidenceSamples: number[] = [];
  const syncJitterSamples: number[] = [];
  const bidsFixture = await scanBidsDataset(BENCHMARK_FIXTURE_BIDS_PATH);
  engine.registerDataset(bidsFixture.summary);
  const nwbFixture = await scanNwbFile(BENCHMARK_FIXTURE_NWB_PATH);
  engine.registerNeuroSession(nwbFixture.summary);
  const replayId = `replay-${suiteId}`;
  const replayFrames = await buildNwbReplayFrames(BENCHMARK_FIXTURE_NWB_PATH, {
    replayId,
    windowSize: 2,
    maxWindows: 4
  });
  const replayStartedAt = new Date().toISOString();
  let replayReadyCount = 0;
  let replayState: NeuroReplayState = {
    id: replayId,
    sessionId: nwbFixture.summary.id,
    name: nwbFixture.summary.name,
    source: "nwb-replay",
    status: "running",
    windowSize: 2,
    paceMs: tickIntervalMs,
    totalWindows: replayFrames.length,
    completedWindows: 0,
    decodeReadyRatio: 0,
    lastMeanAbs: 0,
    lastSyncJitterMs: 0,
    startedAt: replayStartedAt,
    updatedAt: replayStartedAt
  };
  engine.upsertNeuroReplay(replayState);
  for (const replayFrame of replayFrames) {
    const frame: NeuroFrameWindow = {
      ...replayFrame,
      replayId,
      capturedAt: new Date().toISOString()
    };
    if (frame.decodeReady) {
      replayReadyCount += 1;
    }
    decodeConfidenceSamples.push(frame.decodeConfidence);
    syncJitterSamples.push(frame.syncJitterMs);
    engine.ingestNeuroFrame(frame);
    replayState = {
      ...replayState,
      status:
        replayState.completedWindows + 1 >= replayFrames.length ? "completed" : "running",
      completedWindows: replayState.completedWindows + 1,
      decodeReadyRatio: Number(
        (replayReadyCount / (replayState.completedWindows + 1)).toFixed(3)
      ),
      lastMeanAbs: frame.meanAbs,
      lastSyncJitterMs: frame.syncJitterMs,
      updatedAt: frame.capturedAt,
      completedAt:
        replayState.completedWindows + 1 >= replayFrames.length
          ? frame.capturedAt
          : undefined,
      lastWindowId: frame.id
    };
    engine.upsertNeuroReplay(replayState);
  }
  const liveIngressResult = buildLiveNeuroFrame({
    sourceId: "live-benchmark-socket",
    label: "Benchmark live socket",
    sessionId: nwbFixture.summary.id,
    kind: "electrical-series",
    rateHz: nwbFixture.summary.primaryRateHz ?? 1000,
    syncJitterMs: 0.4,
    channels: 8,
    samples: [
      [0.12, -0.14, 0.18, -0.09, 0.11, -0.13, 0.16, -0.1],
      [0.15, -0.1, 0.21, -0.08, 0.12, -0.11, 0.19, -0.07],
      [0.09, -0.12, 0.17, -0.06, 0.1, -0.15, 0.18, -0.08],
      [0.13, -0.09, 0.2, -0.05, 0.14, -0.12, 0.22, -0.06]
    ]
  });
  decodeConfidenceSamples.push(liveIngressResult.frame.decodeConfidence);
  syncJitterSamples.push(liveIngressResult.frame.syncJitterMs);
  engine.ingestNeuroFrame(liveIngressResult.frame);
  engine.upsertNeuroReplay(liveIngressResult.ingress);
  const syntheticExecution: CognitiveExecution = {
    id: `cog-${suiteId}-synthetic`,
    layerId: "benchmark-layer",
    model: "gemma4:e4b",
    objective: "Benchmark synthetic cognition trace for consent projection validation.",
    status: "completed",
    latencyMs: 42,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    promptDigest: "benchmark-prompt-digest",
    responsePreview:
      "ROUTE: sustain the benchmark lane. REASON: validate projection rules. COMMIT: publish the trace."
  };
  engine.commitCognitiveExecution(syntheticExecution);
  const syntheticActuation: ActuationOutput = {
    id: `act-${suiteId}-synthetic`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: "stim",
    command: "benchmark:stabilize-feedback",
    intensity: 0.82,
    status: "dispatched",
    summary: "Dispatch synthetic benchmark actuation across the actuator grid.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const actuationDispatchResult = await actuationManager.dispatch(syntheticActuation);
  engine.dispatchActuationOutput(actuationDispatchResult.output);
  const bridgeDispatches: Array<{
    deliveryId: string;
    adapterId: string;
    protocolId: string;
    encodedCommand: unknown;
    output: ActuationOutput;
  }> = [];
  let actuationBridge:
    | ReturnType<Awaited<ReturnType<typeof createActuationManager>>["attachBridge"]>
    | undefined;
  actuationBridge = actuationManager.attachBridge({
    adapterId: "haptic-rig",
    sessionId: nwbFixture.summary.id,
    send: (payload) => {
      const message = JSON.parse(payload) as {
        type: string;
        data?: {
          deliveryId: string;
          adapterId: string;
          protocolId: string;
          encodedCommand: unknown;
          output: ActuationOutput;
        };
      };
      if (message.type !== "actuation-dispatch" || !message.data || !actuationBridge) {
        return;
      }

      bridgeDispatches.push({
        deliveryId: message.data.deliveryId,
        adapterId: message.data.adapterId,
        protocolId: message.data.protocolId,
        encodedCommand: message.data.encodedCommand,
        output: message.data.output
      });
      actuationBridge.handleMessage(
        JSON.stringify({
          type: "actuation-ack",
          deliveryId: message.data.deliveryId,
          protocolId: message.data.protocolId,
          deviceId: "bench-haptic-01",
          acknowledgedAt: new Date().toISOString(),
          policyNote: "device_bridge_ack"
        })
      );
    }
  });
  const bridgeHelloResult = actuationBridge.handleMessage(
    JSON.stringify({
      type: "actuation-device-hello",
      adapterId: "haptic-rig",
      protocolId: "immaculate.haptic.rig.v1",
      deviceId: "bench-haptic-01",
      capabilities: [
        "intensity",
        "target-node",
        "command-text",
        "duration-ms",
        "waveform",
        "cadence-hz"
      ],
      maxIntensity: 0.5
    })
  );
  const bridgeLinkedAdapters = actuationManager.listAdapters();
  const bridgeActuation: ActuationOutput = {
    id: `act-${suiteId}-bridge`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: "haptic",
    command: "benchmark:bridge-feedback",
    intensity: 0.54,
    status: "dispatched",
    summary: "Dispatch benchmark actuation through the live device bridge.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const bridgeDispatchResult = await actuationManager.dispatch(bridgeActuation, {
    adapterId: "haptic-rig"
  });
  engine.dispatchActuationOutput(bridgeDispatchResult.output);
  actuationBridge.detach();
  const udpServer = createSocket("udp4");
  const udpPacketPromise = new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      udpServer.close();
      reject(new Error("Timed out waiting for UDP/OSC transport packet."));
    }, 4000);
    udpServer.once("message", (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    udpServer.once("error", (error) => {
      clearTimeout(timer);
      udpServer.close();
      reject(error);
    });
  });
  await new Promise<void>((resolve, reject) => {
    udpServer.bind(0, "127.0.0.1", () => resolve());
    udpServer.once("error", reject);
  });
  const udpAddress = udpServer.address();
  if (typeof udpAddress === "string") {
    throw new Error("Unexpected pipe binding for UDP transport benchmark.");
  }
  const udpTransport = await actuationManager.registerUdpOscTransport({
    adapterId: "visual-panel",
    host: "127.0.0.1",
    port: udpAddress.port,
    label: "Benchmark Visual UDP/OSC",
    deviceId: "bench-visual-udp-01"
  });
  const udpActuation: ActuationOutput = {
    id: `act-${suiteId}-udp`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: "visual",
    command: "benchmark:visual-udp",
    intensity: 0.41,
    status: "dispatched",
    summary: "Dispatch benchmark actuation through the concrete UDP/OSC transport.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const udpDispatchResult = await actuationManager.dispatch(udpActuation, {
    adapterId: "visual-panel"
  });
  engine.dispatchActuationOutput(udpDispatchResult.output);
  const udpPacket = await udpPacketPromise;
  udpServer.close();
  const udpOscPacket = decodeOscPacket(udpPacket);
  const serialDevicePath = path.join(runtimeDir, "vendor-devices", "bench-haptic-serial.ndjson");
  const serialTransport = await actuationManager.registerSerialJsonTransport({
    adapterId: "haptic-rig",
    devicePath: serialDevicePath,
    baudRate: 230400,
    label: "Benchmark Haptic Serial",
    deviceId: "bench-haptic-serial-01",
    vendorId: "immaculate-labs",
    modelId: "haptic-bridge-s1",
    heartbeatIntervalMs: 20,
    heartbeatTimeoutMs: 35
  });
  const serialCapabilities = [
    "intensity",
    "target-node",
    "command-text",
    "duration-ms",
    "waveform",
    "cadence-hz"
  ];
  const serialHeartbeat = await actuationManager.recordTransportHeartbeat({
    transportId: serialTransport.id,
    latencyMs: 3.2,
    capabilities: serialCapabilities,
    firmwareVersion: "fw-serial-1.0.0"
  });
  const serialActuation: ActuationOutput = {
    id: `act-${suiteId}-serial`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: "haptic",
    command: "benchmark:serial-feedback",
    intensity: 0.48,
    status: "dispatched",
    summary: "Dispatch benchmark actuation through the supervised serial vendor transport.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const serialDispatchResult = await actuationManager.dispatch(serialActuation, {
    adapterId: "haptic-rig"
  });
  engine.dispatchActuationOutput(serialDispatchResult.output);
  const serialPayloadLines = (await readFile(serialDevicePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const serialPayload = JSON.parse(
    serialPayloadLines[serialPayloadLines.length - 1] ?? "{}"
  ) as {
    transportId?: string;
    protocolId?: string;
    deviceId?: string;
    command?: string;
    encodedCommand?: {
      frame?: {
        waveform?: string;
      };
    };
  };
  await new Promise((resolve) => setTimeout(resolve, 45));
  const isolatedSerialTransport = actuationManager
    .listTransports()
    .find((transport) => transport.id === serialTransport.id)!;
  const isolatedActuation: ActuationOutput = {
    id: `act-${suiteId}-serial-isolated`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: "haptic",
    command: "benchmark:serial-isolated",
    intensity: 0.36,
    status: "dispatched",
    summary: "Attempt benchmark actuation after serial heartbeat expiry to validate transport isolation.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const isolatedDispatchResult = await actuationManager.dispatch(isolatedActuation, {
    adapterId: "haptic-rig"
  });
  engine.dispatchActuationOutput(isolatedDispatchResult.output);
  const resetSerialTransport = await actuationManager.resetTransportFault(serialTransport.id);
  const recoveredSerialHeartbeat = await actuationManager.recordTransportHeartbeat({
    transportId: serialTransport.id,
    latencyMs: 2.8,
    capabilities: serialCapabilities,
    firmwareVersion: "fw-serial-1.0.1"
  });
  const recoveredSerialActuation: ActuationOutput = {
    id: `act-${suiteId}-serial-recovered`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: "haptic",
    command: "benchmark:serial-recovered",
    intensity: 0.44,
    status: "dispatched",
    summary: "Dispatch benchmark actuation after serial transport recovery.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const recoveredSerialDispatchResult = await actuationManager.dispatch(
    recoveredSerialActuation,
    {
      adapterId: "haptic-rig"
    }
  );
  engine.dispatchActuationOutput(recoveredSerialDispatchResult.output);
  const recoveredSerialPayloadLines = (await readFile(serialDevicePath, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const recoveredSerialPayload = JSON.parse(
    recoveredSerialPayloadLines[recoveredSerialPayloadLines.length - 1] ?? "{}"
  ) as {
    command?: string;
    firmwareVersion?: string;
  };
  const http2Dispatches: Array<{
    transportId?: string;
    protocolId?: string;
    deviceId?: string;
    command?: string;
    intensity?: number;
    encodedCommand?: {
      frame?: {
        waveform?: string;
      };
    };
  }> = [];
  const http2Server = createHttp2Server();
  http2Server.unref();
  http2Server.on("stream", (stream: ServerHttp2Stream, headers) => {
    if (headers[":method"] !== "POST") {
      stream.respond({ ":status": 405 });
      stream.end();
      return;
    }

    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const parsed = JSON.parse(body || "{}") as {
        transportId?: string;
        protocolId?: string;
        deviceId?: string;
        command?: string;
        intensity?: number;
        encodedCommand?: {
          frame?: {
            waveform?: string;
          };
        };
      };
      http2Dispatches.push(parsed);
      stream.respond({
        ":status": 200,
        "content-type": "application/json"
      });
      stream.end(
        JSON.stringify({
          acknowledgedAt: new Date().toISOString(),
          policyNote: "http2_device_ack",
          deviceId: "bench-haptic-http2-01",
          firmwareVersion: "fw-http2-1.0.0",
          latencyMs: 1.7,
          capabilities: serialCapabilities
        })
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    http2Server.listen(0, "127.0.0.1", () => resolve());
    http2Server.once("error", reject);
  });
  const http2Address = http2Server.address();
  if (!http2Address || typeof http2Address === "string") {
    throw new Error("Unexpected binding for HTTP/2 transport benchmark.");
  }
  const http2Transport = await actuationManager.registerHttp2JsonTransport({
    adapterId: "haptic-rig",
    endpoint: `http://127.0.0.1:${http2Address.port}/immaculate/device/dispatch`,
    label: "Benchmark Haptic HTTP/2",
    deviceId: "bench-haptic-http2-01",
    vendorId: "immaculate-labs",
    modelId: "haptic-rpc-s2",
    heartbeatIntervalMs: 20,
    heartbeatTimeoutMs: 60
  });
  const http2Heartbeat = await actuationManager.recordTransportHeartbeat({
    transportId: http2Transport.id,
    latencyMs: 1.9,
    capabilities: serialCapabilities,
    firmwareVersion: "fw-http2-0.9.0"
  });
  const preferredRouteGovernanceStatus: GovernanceStatus = {
    mode: "enforced",
    policyCount: 0,
    decisionCount: 0,
    deniedCount: 0
  };
  const preferredRouteGovernanceDecisions: GovernanceDecision[] = [];
  const preferredRoutePlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: liveIngressResult.frame,
    execution: syntheticExecution,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: preferredRouteGovernanceStatus,
    governanceDecisions: preferredRouteGovernanceDecisions,
    consentScope: "system:benchmark"
  });
  const preferredHttp2Actuation: ActuationOutput = {
    id: `act-${suiteId}-http2-preferred`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: preferredRoutePlan.channel,
    command: "benchmark:http2-preferred",
    intensity: preferredRoutePlan.recommendedIntensity,
    status: "dispatched",
    summary:
      "Dispatch benchmark actuation through the preferred HTTP/2 direct transport.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const preferredHttp2DispatchResult = await actuationManager.dispatch(
    preferredHttp2Actuation,
    {
      adapterId: preferredRoutePlan.recommendedAdapterId
    }
  );
  engine.dispatchActuationOutput(preferredHttp2DispatchResult.output);
  const preferredRouteDecision = buildRoutingDecision({
    output: preferredHttp2DispatchResult.output,
    delivery: preferredHttp2DispatchResult.delivery,
    plan: preferredRoutePlan,
    frame: liveIngressResult.frame,
    execution: syntheticExecution
  });
  engine.recordRoutingDecision(preferredRouteDecision);
  http2Server.close();
  const guardedRouteDecisionTime = new Date().toISOString();
  const guardedRouteGovernanceDecisions: GovernanceDecision[] = [
    {
      id: `gdn-${suiteId}-01`,
      timestamp: guardedRouteDecisionTime,
      allowed: false,
      mode: "enforced",
      action: "actuation-dispatch",
      route: "/api/actuation/dispatch",
      policyId: "actuation-dispatch-default",
      purpose: ["actuation-dispatch"],
      consentScope: `subject:${bidsFixture.summary.id}`,
      actor: "benchmark",
      reason: "manual_guardrail_trip"
    },
    {
      id: `gdn-${suiteId}-02`,
      timestamp: guardedRouteDecisionTime,
      allowed: false,
      mode: "enforced",
      action: "actuation-dispatch",
      route: "/api/actuation/dispatch",
      policyId: "actuation-dispatch-default",
      purpose: ["actuation-dispatch"],
      consentScope: `subject:${bidsFixture.summary.id}`,
      actor: "benchmark",
      reason: "manual_guardrail_trip"
    }
  ];
  const guardedRouteGovernanceStatus: GovernanceStatus = {
    mode: "enforced",
    policyCount: 0,
    decisionCount: guardedRouteGovernanceDecisions.length,
    deniedCount: 4,
    lastDecisionAt: guardedRouteDecisionTime,
    lastDecisionId: guardedRouteGovernanceDecisions.at(-1)?.id
  };
  const guardedFallbackPlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: liveIngressResult.frame,
    execution: syntheticExecution,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: guardedRouteGovernanceStatus,
    governanceDecisions: guardedRouteGovernanceDecisions,
    consentScope: `subject:${bidsFixture.summary.id}`
  });
  const guardedFallbackActuation: ActuationOutput = {
    id: `act-${suiteId}-guarded-fallback`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: guardedFallbackPlan.channel,
    command: "benchmark:guarded-fallback",
    intensity: guardedFallbackPlan.recommendedIntensity,
    status: "dispatched",
    summary:
      "Dispatch benchmark actuation through the guarded fallback lane under critical governance pressure.",
    generatedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString()
  };
  const guardedFallbackDispatchResult = await actuationManager.dispatch(
    guardedFallbackActuation,
    {
      adapterId: guardedFallbackPlan.recommendedAdapterId
    }
  );
  engine.dispatchActuationOutput(guardedFallbackDispatchResult.output);
  const guardedFallbackDecision = buildRoutingDecision({
    output: guardedFallbackDispatchResult.output,
    delivery: guardedFallbackDispatchResult.delivery,
    plan: guardedFallbackPlan,
    frame: liveIngressResult.frame,
    execution: syntheticExecution
  });
  engine.recordRoutingDecision(guardedFallbackDecision);
  await persistence.persist(engine.getDurableState());
  const governanceControlAllow = evaluateGovernance({
    action: "operator-control",
    route: "/api/control",
    actor: "benchmark",
    policyId: "operator-control-default",
    purpose: ["operator-control"],
    consentScope: "operator:benchmark"
  });
  const governanceMissingPurpose = evaluateGovernance({
    action: "operator-control",
    route: "/api/control",
    actor: "benchmark",
    policyId: "operator-control-default",
    consentScope: "operator:benchmark"
  });
  const governanceBenchmarkAllow = evaluateGovernance({
    action: "benchmark-execution",
    route: "/api/benchmarks/run",
    actor: "benchmark",
    policyId: "benchmark-execution-default",
    purpose: ["benchmark-execution"],
    consentScope: "system:benchmark"
  });
  const governanceDatasetReadAllow = evaluateGovernance({
    action: "dataset-read",
    route: "/api/datasets/:datasetId",
    actor: "benchmark",
    policyId: "dataset-read-default",
    purpose: ["dataset-read"],
    consentScope: `dataset:${bidsFixture.summary.id}`
  });
  const governanceEventReadAllow = evaluateGovernance({
    action: "event-read",
    route: "/api/events",
    actor: "benchmark",
    policyId: "event-read-default",
    purpose: ["event-read"],
    consentScope: "system:audit"
  });
  const governanceNeuroFeatureReadAllow = evaluateGovernance({
    action: "neuro-feature-read",
    route: "/api/neuro/frames",
    actor: "benchmark",
    policyId: "neuro-feature-read-default",
    purpose: ["neuro-feature-read"],
    consentScope: `session:${nwbFixture.summary.id}`
  });
  const governanceCognitiveTraceReadAllow = evaluateGovernance({
    action: "cognitive-trace-read",
    route: "/api/intelligence/executions",
    actor: "benchmark",
    policyId: "cognitive-trace-read-default",
    purpose: ["cognitive-trace-read"],
    consentScope: "system:intelligence"
  });
    const governanceActuationDispatchAllow = evaluateGovernance({
      action: "actuation-dispatch",
      route: "/api/actuation/dispatch",
      actor: "benchmark",
    policyId: "actuation-dispatch-default",
      purpose: ["actuation-dispatch"],
      consentScope: `session:${nwbFixture.summary.id}`
    });
    const governanceActuationDeviceLinkAllow = evaluateGovernance({
      action: "actuation-device-link",
      route: "/stream/actuation/device",
      actor: "benchmark-device",
      policyId: "actuation-device-link-default",
      purpose: ["actuation-device-link"],
      consentScope: `session:${nwbFixture.summary.id}`
    });
    const governanceActuationReadAllow = evaluateGovernance({
      action: "actuation-read",
      route: "/api/actuation/outputs",
    actor: "benchmark",
    policyId: "actuation-read-default",
    purpose: ["actuation-read"],
    consentScope: "system:actuation"
  });
  const actuationProtocols = actuationManager.listProtocols();
  const actuationAdapters = actuationManager.listAdapters();
  const actuationTransports = actuationManager.listTransports();
  const actuationDeliveries = actuationManager.listDeliveries(8);
  const routingDecisions = engine.getSnapshot().routingDecisions;
  const routingEvents = engine
    .getEvents()
    .filter((event) => event.schema.name === "immaculate.routing.decision");
  const redactedSnapshot = redactPhaseSnapshot(engine.getSnapshot());
  const datasetScopedRecord = projectDatasetRecord(
    bidsFixture,
    `dataset:${bidsFixture.summary.id}`
  );
  const sessionScopedRecord = projectNeuroSessionRecord(
    nwbFixture,
    `session:${nwbFixture.summary.id}`
  );
  const representativeEvent =
    engine.getEvents().find((event) => Object.keys(event.payload).length > 0) ??
    engine.getEvents()[0]!;
  const auditEventProjection = projectEventEnvelope(representativeEvent, "system:audit");
  const benchmarkEventProjection = projectEventEnvelope(
    representativeEvent,
    "system:benchmark"
  );
  const sessionScopedFrame = projectNeuroFrameWindow(
    liveIngressResult.frame,
    `session:${nwbFixture.summary.id}`
  );
  const benchmarkScopedFrame = projectNeuroFrameWindow(
    liveIngressResult.frame,
    "system:benchmark"
  );
  const intelligenceScopedExecution = projectCognitiveExecution(
    syntheticExecution,
    "system:intelligence"
  );
  const benchmarkScopedExecution = projectCognitiveExecution(
    syntheticExecution,
    "system:benchmark"
  );
  const actuationScopedOutput = projectActuationOutput(
    actuationDispatchResult.output,
    "system:actuation"
  );
  const benchmarkScopedActuation = projectActuationOutput(
    actuationDispatchResult.output,
    "system:benchmark"
  );
  let verifyBarrierTick: number | null = null;
  let cycleCompletionTick: number | null = null;

  for (let tick = 1; tick <= maxTicks; tick += 1) {
    engine.tick();
    const snapshot = engine.getSnapshot();
    reflexSamples.push(snapshot.metrics.reflexLatencyMs);
    cognitiveSamples.push(snapshot.metrics.cognitiveLatencyMs);
    throughputSamples.push(snapshot.metrics.throughput);
    coherenceSamples.push(snapshot.metrics.coherence);
    await persistence.persist(engine.getDurableState());

    const cyclePasses = snapshot.passes.filter((pass) => pass.cycle === snapshot.cycle);
    const verifyPass = cyclePasses.find((pass) => pass.phase === "verify");
    const feedbackPass = cyclePasses.find((pass) => pass.phase === "feedback");
    if (
      verifyBarrierTick === null &&
      verifyPass?.state === "completed" &&
      feedbackPass?.state === "queued"
    ) {
      verifyBarrierTick = tick;
    }

    if (cycleCompletionTick === null && snapshot.cycle > 1) {
      cycleCompletionTick = tick;
    }

    if (
      verifyBarrierTick !== null &&
      cycleCompletionTick !== null &&
      persistence.getStatus().checkpointCount > 0
    ) {
      break;
    }
  }

  await persistence.flush();
  const cleanIntegrity = inspectDurableState(engine.getDurableState());
  const cleanStatus = persistence.getStatus();

  await safeUnlink(path.join(runtimeDir, "snapshot.json"));
  const recoveryPersistence = createPersistence(runtimeDir);
  const recoveredState = await recoveryPersistence.load();
  const recoveryStatus = recoveryPersistence.getStatus();
  const recoveredIntegrity = recoveredState
    ? inspectDurableState(recoveredState)
    : cleanIntegrity;

  const reflexSeries = createSeries(
    "reflex_latency_ms",
    "Reflex latency",
    "ms",
    reflexSamples
  );
  const cognitiveSeries = createSeries(
    "cognitive_latency_ms",
    "Cognitive latency",
    "ms",
    cognitiveSamples
  );
  const throughputSeries = createSeries(
    "throughput_ops_s",
    "Throughput",
    "ops/s",
    throughputSamples
  );
  const coherenceSeries = createSeries(
    "coherence_ratio",
    "Coherence",
    "ratio",
    coherenceSamples
  );
  const decodeConfidenceSeries = createSeries(
    "neuro_decode_confidence_ratio",
    "Neuro decode confidence",
    "ratio",
    decodeConfidenceSamples
  );
  const syncJitterSeries = createSeries(
    "neuro_sync_jitter_ms",
    "Neuro sync jitter",
    "ms",
    syncJitterSamples
  );

  const assertions: BenchmarkAssertion[] = [
    createAssertion(
      "bids-ingest-scan",
      "BIDS fixture scans into a normalized dataset manifest",
      bidsFixture.summary.subjectCount > 0 &&
        bidsFixture.summary.fileCount >= 4 &&
        bidsFixture.summary.modalities.some((entry) => entry.modality === "anat") &&
        bidsFixture.summary.modalities.some((entry) => entry.modality === "func"),
      ">= 1 subject, >= 4 files, anat+func modalities",
      `${bidsFixture.summary.subjectCount} subjects / ${bidsFixture.summary.fileCount} files`,
      `fixture ${bidsFixture.summary.name} scanned from ${toRelativePublicationPath(bidsFixture.summary.rootPath)}`
    ),
    createAssertion(
      "bids-ingest-register",
      "BIDS dataset registers into the live orchestration state",
      engine.getSnapshot().datasets.some((dataset) => dataset.id === bidsFixture.summary.id),
      "dataset present in snapshot.datasets",
      engine.getSnapshot().datasets.some((dataset) => dataset.id === bidsFixture.summary.id)
        ? bidsFixture.summary.id
        : "missing",
      "ingest spine should surface registered datasets to the operator surfaces"
    ),
    createAssertion(
      "nwb-stream-scan",
      "NWB fixture scans into stream-level neurophysiology metadata",
      nwbFixture.summary.streamCount >= 2 &&
        nwbFixture.summary.totalChannels >= 8 &&
        (nwbFixture.summary.primaryRateHz ?? 0) >= 1000,
      ">= 2 streams, >= 8 channels, primary rate >= 1000 Hz",
      `${nwbFixture.summary.streamCount} streams / ${nwbFixture.summary.totalChannels} channels / ${nwbFixture.summary.primaryRateHz ?? 0} Hz`,
      `fixture ${nwbFixture.summary.name} scanned from ${toRelativePublicationPath(nwbFixture.summary.filePath)}`
    ),
    createAssertion(
      "nwb-session-register",
      "NWB neuro session registers into synchronize/decode state",
      engine.getSnapshot().neuroSessions.some((session) => session.id === nwbFixture.summary.id),
      "session present in snapshot.neuroSessions",
      engine.getSnapshot().neuroSessions.some((session) => session.id === nwbFixture.summary.id)
        ? nwbFixture.summary.id
        : "missing",
      "synchronize/decode should be able to observe registered time-series metadata"
    ),
    createAssertion(
      "nwb-replay-prepare",
      "Live NWB replay prepares bounded sample windows",
      replayFrames.length >= 3 && replayFrames.some((frame) => frame.decodeReady),
      ">= 3 replay windows with at least one decode-ready window",
      `${replayFrames.length} windows / ${replayFrames.filter((frame) => frame.decodeReady).length} ready`,
      "real NWB arrays should materialize into bounded replay windows before streaming"
    ),
    createAssertion(
      "nwb-replay-ingest",
      "Live NWB replay ingests frame windows into synchronize/decode state",
      engine.getSnapshot().neuroFrames.some((frame) => frame.replayId === replayId) &&
        engine.getSnapshot().neuroReplays.some(
          (replay) => replay.id === replayId && replay.status === "completed"
        ),
      "replay frames present and replay marked completed",
      `${engine.getSnapshot().neuroFrames.filter((frame) => frame.replayId === replayId).length} frames / ${
        engine.getSnapshot().neuroReplays.find((replay) => replay.id === replayId)?.status ?? "missing"
      }`,
      "replayed sample windows should persist in the live snapshot and replay ledger"
    ),
    createAssertion(
      "live-socket-ingest",
      "Live socket ingress injects a real frame into synchronize/decode",
      engine.getSnapshot().neuroFrames.some(
        (frame) =>
          frame.replayId === liveIngressResult.ingress.id && frame.source === "live-socket"
      ) &&
        engine.getSnapshot().neuroReplays.some(
          (replay) =>
            replay.id === liveIngressResult.ingress.id && replay.source === "live-socket"
        ),
      "live-socket frame and source present in snapshot",
      `${engine.getSnapshot().neuroFrames.filter((frame) => frame.source === "live-socket").length} frames / ${
        engine.getSnapshot().neuroReplays.filter((replay) => replay.source === "live-socket").length
      } sources`,
      "socket ingress should drive the same durable synchronize/decode spine as replayed NWB windows"
    ),
    createAssertion(
      "governance-operator-allow",
      "Governance allows explicit operator control with matching purpose and scope",
      governanceControlAllow.allowed,
      "allowed",
      governanceControlAllow.reason,
      `policy ${governanceControlAllow.policyId} / scope ${governanceControlAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-missing-purpose-deny",
      "Governance denies mutable control without purpose binding",
      !governanceMissingPurpose.allowed && governanceMissingPurpose.reason === "missing_purpose",
      "denied with missing_purpose",
      governanceMissingPurpose.reason,
      "mutating control paths should reject unguided requests before execution"
    ),
    createAssertion(
      "governance-benchmark-allow",
      "Governance allows benchmark execution under benchmark system scope",
      governanceBenchmarkAllow.allowed,
      "allowed",
      governanceBenchmarkAllow.reason,
      `policy ${governanceBenchmarkAllow.policyId} / scope ${governanceBenchmarkAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-dataset-read-allow",
      "Governance allows dataset detail reads under an explicit dataset scope",
      governanceDatasetReadAllow.allowed,
      "allowed",
      governanceDatasetReadAllow.reason,
      `policy ${governanceDatasetReadAllow.policyId} / scope ${governanceDatasetReadAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-event-read-allow",
      "Governance allows audit/event reads under audit scope",
      governanceEventReadAllow.allowed,
      "allowed",
      governanceEventReadAllow.reason,
      `policy ${governanceEventReadAllow.policyId} / scope ${governanceEventReadAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-neuro-feature-read-allow",
      "Governance allows session-scoped neuro feature reads",
      governanceNeuroFeatureReadAllow.allowed,
      "allowed",
      governanceNeuroFeatureReadAllow.reason,
      `policy ${governanceNeuroFeatureReadAllow.policyId} / scope ${governanceNeuroFeatureReadAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-cognitive-trace-read-allow",
      "Governance allows intelligence-scoped cognitive trace reads",
      governanceCognitiveTraceReadAllow.allowed,
      "allowed",
      governanceCognitiveTraceReadAllow.reason,
      `policy ${governanceCognitiveTraceReadAllow.policyId} / scope ${governanceCognitiveTraceReadAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-actuation-dispatch-allow",
      "Governance allows session-scoped actuation dispatch",
      governanceActuationDispatchAllow.allowed,
      "allowed",
      governanceActuationDispatchAllow.reason,
      `policy ${governanceActuationDispatchAllow.policyId} / scope ${governanceActuationDispatchAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-actuation-device-link-allow",
      "Governance allows a session-scoped actuation device link",
      governanceActuationDeviceLinkAllow.allowed,
      "allowed",
      governanceActuationDeviceLinkAllow.reason,
      `policy ${governanceActuationDeviceLinkAllow.policyId} / scope ${governanceActuationDeviceLinkAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "governance-actuation-read-allow",
      "Governance allows explicit actuation output reads",
      governanceActuationReadAllow.allowed,
      "allowed",
      governanceActuationReadAllow.reason,
      `policy ${governanceActuationReadAllow.policyId} / scope ${governanceActuationReadAllow.consentScope ?? "missing"}`
    ),
    createAssertion(
      "actuation-protocols-registered",
      "Actuation exposes protocol profiles for visual, haptic, and stim lanes",
      actuationProtocols.length >= 3 &&
        actuationProtocols.some((protocol) => protocol.channel === "visual") &&
        actuationProtocols.some((protocol) => protocol.channel === "haptic") &&
        actuationProtocols.some((protocol) => protocol.channel === "stim"),
      "visual+haptic+stim protocol profiles present",
      actuationProtocols.map((protocol) => `${protocol.id}:${protocol.channel}`).join(", "),
      "device transport should negotiate against explicit protocol profiles instead of a generic opaque bridge"
    ),
    createAssertion(
      "actuation-adapters-registered",
      "Actuation adapters expose one policy lane per outward channel",
      actuationAdapters.length >= 3 &&
        actuationAdapters.some((adapter) => adapter.channel === "visual") &&
        actuationAdapters.some((adapter) => adapter.channel === "haptic") &&
        actuationAdapters.some((adapter) => adapter.channel === "stim"),
      "visual+haptic+stim adapters present",
      actuationAdapters.map((adapter) => `${adapter.id}:${adapter.channel}`).join(", "),
      "the feedback plane should route through explicit adapter policy lanes before delivery"
    ),
    createAssertion(
      "actuation-delivery-recorded",
      "Actuation dispatch records a concrete adapter delivery",
      actuationDeliveries.some(
        (delivery) =>
          delivery.outputId === actuationDispatchResult.output.id &&
          delivery.adapterId === actuationDispatchResult.adapter.id &&
          delivery.status === "delivered"
      ),
        "delivery recorded for dispatched output",
        `${actuationDispatchResult.adapter.id} / ${actuationDispatchResult.delivery.policyNote}`,
        "adapter-backed dispatch should persist a real delivery handoff, not just an abstract actuation intent"
      ),
    createAssertion(
      "actuation-device-hello",
      "A device hello negotiates protocol, capabilities, and effective device limits",
      bridgeHelloResult?.type === "hello-accepted" &&
        bridgeHelloResult.protocol.id === "immaculate.haptic.rig.v1" &&
        bridgeHelloResult.adapter.bridgeReady &&
        bridgeHelloResult.adapter.bridgeDeviceId === "bench-haptic-01" &&
        bridgeHelloResult.adapter.bridgeCapabilities.includes("waveform"),
      "hello accepted with protocol-aware ready state",
      bridgeHelloResult?.type === "hello-accepted"
        ? `${bridgeHelloResult.protocol.id} / ${bridgeHelloResult.adapter.bridgeDeviceId ?? "missing"}`
        : "hello rejected",
      "concrete device links should negotiate protocol identity and capability coverage before dispatch starts"
    ),
    createAssertion(
      "actuation-bridge-link-live",
      "Actuation adapters surface a live bridge link while a device transport is attached",
      bridgeLinkedAdapters.some(
        (adapter) =>
          adapter.id === "haptic-rig" &&
          adapter.bridgeConnected &&
          adapter.bridgeReady &&
          adapter.bridgeDeviceId === "bench-haptic-01" &&
          adapter.bridgeSessionId === nwbFixture.summary.id
      ),
      "haptic-rig bridge ready under session scope",
      bridgeLinkedAdapters
        .map(
          (adapter) =>
            `${adapter.id}:${adapter.bridgeReady ? adapter.bridgeDeviceId ?? "ready" : adapter.bridgeConnected ? "connected" : "disconnected"}`
        )
        .join(", "),
        "adapter policy lanes should expose whether a live device transport is currently attached"
      ),
    createAssertion(
      "actuation-bridge-delivery",
      "Actuation dispatch can complete over the live device bridge with protocol-aware acknowledgement",
      bridgeDispatches.length === 1 &&
        bridgeDispatchResult.delivery.transport === "bridge" &&
        bridgeDispatchResult.delivery.protocolId === "immaculate.haptic.rig.v1" &&
        bridgeDispatchResult.delivery.deviceId === "bench-haptic-01" &&
        Boolean(bridgeDispatchResult.delivery.acknowledgedAt) &&
        bridgeDispatchResult.delivery.policyNote.includes("device_bridge_ack") &&
        bridgeDispatches[0]?.protocolId === "immaculate.haptic.rig.v1",
      "one bridge dispatch / protocol-aware bridge transport / acknowledged",
      `${bridgeDispatches.length} dispatches / ${bridgeDispatchResult.delivery.transport} / ${bridgeDispatchResult.delivery.policyNote}`,
      "the first concrete hardware-transport slice should prove protocol-aware acked bridge delivery instead of only file fallback"
    ),
    createAssertion(
      "actuation-udp-transport-registered",
      "Concrete UDP/OSC transport registration exposes a durable visual device endpoint",
      actuationTransports.some(
        (transport) =>
          transport.id === udpTransport.id &&
          transport.kind === "udp-osc" &&
          transport.adapterId === "visual-panel" &&
          transport.protocolId === "immaculate.visual.panel.v1" &&
          transport.deviceId === "bench-visual-udp-01" &&
          transport.deliveryCount >= 1
      ),
      "registered udp-osc transport with >= 1 delivery",
      actuationTransports
        .map(
          (transport) =>
            `${transport.id}:${transport.kind}:${transport.adapterId}:${transport.deliveryCount}`
        )
        .join(", "),
      "concrete hardware transports should become durable operator-visible endpoints rather than ephemeral benchmark-only sockets"
    ),
    createAssertion(
      "actuation-udp-delivery",
      "Actuation dispatch can complete over UDP/OSC with a protocol-aware encoded command frame",
      udpDispatchResult.delivery.transport === "udp-osc" &&
        udpDispatchResult.delivery.protocolId === "immaculate.visual.panel.v1" &&
        udpDispatchResult.delivery.deviceId === "bench-visual-udp-01" &&
        udpDispatchResult.delivery.policyNote.includes("udp_osc_transport") &&
        udpDispatchResult.output.deviceId === "bench-visual-udp-01" &&
        udpOscPacket.address === "/immaculate/visual/v1" &&
        udpOscPacket.typeTags === ",ssssfs" &&
        udpOscPacket.values[0] === "immaculate.visual.panel.v1" &&
        udpOscPacket.values[1] === "bench-visual-udp-01" &&
        udpOscPacket.values[2] === "actuator-grid" &&
        udpOscPacket.values[3] === "benchmark:visual-udp" &&
        typeof udpOscPacket.values[4] === "number" &&
        Math.abs(udpOscPacket.values[4] - 0.41) < 0.0001 &&
        typeof udpOscPacket.values[5] === "string" &&
        udpOscPacket.values[5].includes("\"command\":\"benchmark:visual-udp\""),
      "udp-osc transport / visual protocol frame / encoded command payload",
      `${udpDispatchResult.delivery.transport} / ${udpOscPacket.address} / ${String(udpOscPacket.values[3] ?? "missing")}`,
      "the first concrete device transport slice should prove protocol-aware delivery over a non-bridge transport, not only websocket-mediated acks"
    ),
    createAssertion(
      "actuation-serial-transport-registered",
      "Supervised serial transport registration exposes vendor/device identity and heartbeat policy",
      actuationTransports.some(
        (transport) =>
          transport.id === serialTransport.id &&
          transport.kind === "serial-json" &&
          transport.vendorId === "immaculate-labs" &&
          transport.modelId === "haptic-bridge-s1" &&
          transport.heartbeatRequired &&
          transport.heartbeatIntervalMs === 20 &&
          transport.heartbeatTimeoutMs === 35
      ),
      "registered serial-json transport with vendor/model and heartbeat policy",
      actuationTransports
        .map(
          (transport) =>
            `${transport.id}:${transport.kind}:${transport.vendorId ?? "unknown"}:${transport.health}`
        )
        .join(", "),
      "vendor/device lanes should be durable registry entries with explicit supervision policy, not anonymous direct writes"
    ),
    createAssertion(
      "actuation-serial-heartbeat",
      "Serial transport heartbeat records capability health and raises the device to healthy",
      serialHeartbeat.health === "healthy" &&
        serialHeartbeat.lastHeartbeatLatencyMs === 3.2 &&
        serialHeartbeat.firmwareVersion === "fw-serial-1.0.0" &&
        serialHeartbeat.capabilityHealth.every((entry) => entry.status === "available"),
      "healthy heartbeat with full capability coverage",
      `${serialHeartbeat.health} / ${serialHeartbeat.lastHeartbeatLatencyMs?.toFixed(1) ?? "--"} ms / ${serialHeartbeat.firmwareVersion ?? "missing"}`,
      "direct vendor transports should advertise device liveness and capability coverage before they are eligible for low-latency delivery"
    ),
    createAssertion(
      "actuation-serial-delivery",
      "Actuation dispatch can complete over the supervised serial vendor transport",
      serialDispatchResult.delivery.transport === "serial-json" &&
        serialDispatchResult.delivery.protocolId === "immaculate.haptic.rig.v1" &&
        serialDispatchResult.delivery.deviceId === "bench-haptic-serial-01" &&
        serialDispatchResult.delivery.policyNote.includes("serial_json_transport") &&
        serialPayload.transportId === serialTransport.id &&
        serialPayload.protocolId === "immaculate.haptic.rig.v1" &&
        serialPayload.deviceId === "bench-haptic-serial-01" &&
        serialPayload.command === "benchmark:serial-feedback" &&
        serialPayload.encodedCommand?.frame?.waveform === "pulse-train",
      "serial-json delivery with persisted vendor payload",
      `${serialDispatchResult.delivery.transport} / ${serialPayload.command ?? "missing"} / ${serialPayload.protocolId ?? "missing"}`,
      "the first vendor-specific direct lane should prove concrete delivery without requiring the websocket bridge"
    ),
    createAssertion(
      "actuation-serial-isolation",
      "Stale serial heartbeat isolates only the affected device and forces fallback",
      isolatedSerialTransport.health === "isolated" &&
        isolatedSerialTransport.isolationActive &&
        isolatedSerialTransport.isolationReason === "heartbeat_timeout" &&
        isolatedDispatchResult.delivery.transport === "file" &&
        isolatedDispatchResult.delivery.policyNote.includes("direct_transport_heartbeat_timeout") &&
        isolatedDispatchResult.delivery.policyNote.includes("file_fallback"),
      "isolated transport with file fallback on stale heartbeat",
      `${isolatedSerialTransport.health} / ${isolatedSerialTransport.isolationReason ?? "none"} / ${isolatedDispatchResult.delivery.transport}`,
      "per-device fault isolation should contain a stale device without suppressing the rest of the adapter lane"
    ),
    createAssertion(
      "actuation-serial-recovery",
      "Operator reset plus renewed heartbeat restores the isolated serial transport",
      resetSerialTransport.health === "degraded" &&
        !resetSerialTransport.isolationActive &&
        recoveredSerialHeartbeat.health === "healthy" &&
        recoveredSerialDispatchResult.delivery.transport === "serial-json" &&
        recoveredSerialDispatchResult.delivery.policyNote.includes("serial_json_transport") &&
        recoveredSerialPayload.command === "benchmark:serial-recovered" &&
        recoveredSerialPayload.firmwareVersion === "fw-serial-1.0.1",
      "reset clears isolation, heartbeat restores health, direct serial delivery resumes",
      `${resetSerialTransport.health} -> ${recoveredSerialHeartbeat.health} -> ${recoveredSerialDispatchResult.delivery.transport}`,
      "device supervision should allow controlled recovery after an isolated fault instead of requiring transport re-registration"
    ),
    createAssertion(
      "actuation-http2-transport-registered",
      "HTTP/2 direct transport registration exposes a supervised RPC-class device endpoint",
      actuationTransports.some(
        (transport) =>
          transport.id === http2Transport.id &&
          transport.kind === "http2-json" &&
          transport.vendorId === "immaculate-labs" &&
          transport.modelId === "haptic-rpc-s2" &&
          transport.heartbeatRequired &&
          transport.heartbeatIntervalMs === 20 &&
          transport.heartbeatTimeoutMs === 60
      ),
      "registered http2-json transport with vendor/model and heartbeat policy",
      actuationTransports
        .map(
          (transport) =>
            `${transport.id}:${transport.kind}:${transport.vendorId ?? "unknown"}:${transport.health}`
        )
        .join(", "),
      "the next direct device lane should be a typed RPC-class endpoint, not just another file or datagram bridge"
    ),
    createAssertion(
      "actuation-http2-heartbeat",
      "HTTP/2 direct transport heartbeat establishes healthy low-latency readiness",
      http2Heartbeat.health === "healthy" &&
        http2Heartbeat.lastHeartbeatLatencyMs === 1.9 &&
        http2Heartbeat.firmwareVersion === "fw-http2-0.9.0" &&
        http2Heartbeat.capabilityHealth.every((entry) => entry.status === "available"),
      "healthy heartbeat with low latency and full capability coverage",
      `${http2Heartbeat.health} / ${http2Heartbeat.lastHeartbeatLatencyMs?.toFixed(1) ?? "--"} ms / ${http2Heartbeat.firmwareVersion ?? "missing"}`,
      "RPC-class direct lanes should prove liveness and capability coverage before they are eligible to outrank other transports"
    ),
    createAssertion(
      "actuation-http2-preferred-delivery",
      "Transport selection prefers the healthiest lowest-latency direct lane for haptic delivery",
      preferredHttp2DispatchResult.delivery.transport === "http2-json" &&
        preferredHttp2DispatchResult.delivery.protocolId === "immaculate.haptic.rig.v1" &&
        preferredHttp2DispatchResult.delivery.deviceId === "bench-haptic-http2-01" &&
        preferredHttp2DispatchResult.delivery.policyNote.includes("http2_json_transport") &&
        preferredHttp2DispatchResult.delivery.policyNote.includes("http2_device_ack") &&
        preferredHttp2DispatchResult.output.deviceId === "bench-haptic-http2-01" &&
        http2Dispatches.length === 1 &&
        http2Dispatches[0]?.transportId === http2Transport.id &&
        http2Dispatches[0]?.protocolId === "immaculate.haptic.rig.v1" &&
        http2Dispatches[0]?.command === "benchmark:http2-preferred" &&
        http2Dispatches[0]?.encodedCommand?.frame?.waveform === "pulse-train",
      "http2-json delivery selected over other healthy haptic transports",
      `${preferredHttp2DispatchResult.delivery.transport} / ${http2Dispatches[0]?.command ?? "missing"} / ${preferredHttp2DispatchResult.delivery.policyNote}`,
      "direct transport routing should use health and latency as a real preference signal instead of registry insertion order"
    ),
    createAssertion(
      "actuation-transport-ranking",
      "Transport registry surfaces ranked preference so operators can inspect why a lane wins",
      (() => {
        const rankedHapticTransports = actuationTransports.filter(
          (transport) => transport.adapterId === "haptic-rig"
        );
        const rankedHttp2Transport = rankedHapticTransports.find(
          (transport) => transport.id === http2Transport.id
        );
        const rankedSerialTransport = rankedHapticTransports.find(
          (transport) => transport.id === serialTransport.id
        );
        return Boolean(
          rankedHttp2Transport &&
            rankedSerialTransport &&
            typeof rankedHttp2Transport.preferenceRank === "number" &&
            typeof rankedSerialTransport.preferenceRank === "number" &&
            typeof rankedHttp2Transport.preferenceScore === "number" &&
            typeof rankedSerialTransport.preferenceScore === "number" &&
            rankedHttp2Transport.preferenceRank < rankedSerialTransport.preferenceRank &&
            rankedHttp2Transport.preferenceScore > rankedSerialTransport.preferenceScore
        );
      })(),
      "ranked haptic transports with HTTP/2 ahead of serial by score and rank",
      actuationTransports
        .filter((transport) => transport.adapterId === "haptic-rig")
        .map(
          (transport) =>
            `${transport.kind}:${transport.preferenceRank ?? 0}:${transport.preferenceScore ?? 0}`
        )
        .join(", "),
      "operators should be able to inspect why orchestration selected one concrete lane over another"
    ),
    createAssertion(
      "routing-reflex-direct",
      "Adaptive routing selects the healthy low-latency haptic lane for reflex-direct delivery",
      preferredRoutePlan.mode === "reflex-direct" &&
        preferredRoutePlan.channel === "haptic" &&
        preferredRoutePlan.selectedTransport?.id === http2Transport.id &&
        preferredRouteDecision.mode === "reflex-direct" &&
        preferredRouteDecision.transportId === http2Transport.id &&
        preferredRouteDecision.transportKind === "http2-json" &&
        preferredRouteDecision.transportPreferenceRank === 1 &&
        preferredRouteDecision.governancePressure === "clear",
      "reflex-direct / haptic / http2-json / rank 1 / governance clear",
      `${preferredRouteDecision.mode} / ${preferredRouteDecision.channel} / ${preferredRouteDecision.transportKind ?? "none"} / ${preferredRouteDecision.governancePressure}`,
      "route choice should become a first-class orchestration decision that explicitly favors the healthiest lowest-latency reflex lane"
    ),
    createAssertion(
      "routing-guarded-fallback",
      "Adaptive routing flips to the guarded visual lane under critical governance pressure",
      guardedFallbackPlan.mode === "guarded-fallback" &&
        guardedFallbackPlan.channel === "visual" &&
        guardedFallbackPlan.targetNodeId === "integrity-gate" &&
        guardedFallbackPlan.selectedTransport?.kind === "udp-osc" &&
        guardedFallbackDecision.mode === "guarded-fallback" &&
        guardedFallbackDecision.transportKind === "udp-osc" &&
        guardedFallbackDecision.governancePressure === "critical" &&
        guardedFallbackDispatchResult.delivery.transport === "udp-osc",
      "guarded-fallback / visual / integrity-gate / udp-osc / governance critical",
      `${guardedFallbackDecision.mode} / ${guardedFallbackDecision.channel} / ${guardedFallbackDecision.transportKind ?? "none"} / ${guardedFallbackDecision.governancePressure}`,
      "route selection should react to governance pressure and deliberately fall back to a safer outward lane rather than pretending transport health is the only signal"
    ),
    createAssertion(
      "routing-ledger",
      "Routing decisions persist as auditable snapshot and event lineage",
      routingDecisions.length >= 2 &&
        routingDecisions[0]?.id === guardedFallbackDecision.id &&
        routingDecisions.some((decision) => decision.id === preferredRouteDecision.id) &&
        routingEvents.length >= 2 &&
        routingEvents.at(-1)?.schema.name === "immaculate.routing.decision",
      ">= 2 routing decisions in snapshot and event ledger",
      `${routingDecisions.length} snapshot decisions / ${routingEvents.length} routing events / latest ${routingDecisions[0]?.mode ?? "missing"}`,
      "route choice must be durable and replayable, not an invisible side effect buried inside the dispatch path"
    ),
    createAssertion(
      "actuation-device-clamp",
      "Device negotiation can further clamp actuation intensity below the adapter ceiling",
      bridgeDispatchResult.output.intensity === 0.5 &&
        bridgeDispatchResult.delivery.intensity === 0.5 &&
        bridgeDispatchResult.delivery.policyNote.includes("device_intensity_clamped"),
      "bridge intensity clamped to negotiated device ceiling",
      `${bridgeDispatchResult.output.intensity.toFixed(2)} / ${bridgeDispatchResult.delivery.policyNote}`,
      "device-level capabilities should constrain delivery even after adapter-level policy has already admitted the command"
    ),
    createAssertion(
      "snapshot-redaction",
      "Default snapshot projection redacts sensitive dataset and neuro-session paths",
      redactedSnapshot.datasets.every((dataset) => dataset.rootPath === "[redacted]") &&
        redactedSnapshot.neuroSessions.every((session) => session.filePath === "[redacted]") &&
        redactedSnapshot.neuroSessions.every((session) =>
          session.streams.every((stream) => stream.path === "[redacted]")
        ),
      "dataset roots and neuro paths redacted",
      `${redactedSnapshot.datasets[0]?.rootPath ?? "missing"} / ${redactedSnapshot.neuroSessions[0]?.filePath ?? "missing"}`,
      "operator snapshots should keep orchestration telemetry while withholding raw filesystem paths by default"
    ),
    createAssertion(
      "snapshot-derived-redaction",
      "Default snapshot projection redacts derived neuro features, cognitive previews, and actuation commands",
      redactedSnapshot.neuroFrames.every((frame) => frame.decodeConfidence === 0 && frame.meanAbs === 0) &&
        redactedSnapshot.cognitiveExecutions.every(
          (execution) =>
            execution.objective === "[redacted]" &&
            execution.responsePreview === "[redacted]"
        ) &&
        redactedSnapshot.actuationOutputs.every(
          (output) => output.command === "[redacted]" && output.intensity === 0
        ),
      "derived neuro values zeroed, cognitive previews redacted, actuation commands withheld",
      `${redactedSnapshot.neuroFrames[0]?.decodeConfidence ?? 0} neuro confidence / ${redactedSnapshot.cognitiveExecutions[0]?.responsePreview ?? "missing"} cognitive preview / ${redactedSnapshot.actuationOutputs[0]?.command ?? "missing"} actuation`,
      "default operator snapshots should not leak derived neural metrics, model response traces, or outbound actuation commands"
    ),
    createAssertion(
      "dataset-field-visibility",
      "Dataset-scope detail reads retain dataset path while scrubbing subject identity fields",
      datasetScopedRecord.summary.rootPath === bidsFixture.summary.rootPath &&
        datasetScopedRecord.summary.subjects.length === 0 &&
        datasetScopedRecord.summary.sessions.length === 0 &&
        datasetScopedRecord.files.every((file) => !file.subject && !file.session) &&
        datasetScopedRecord.files.every((file) => !file.relativePath.includes("sub-01")),
      "dataset root retained, subject/session identities scrubbed",
      `${toRelativePublicationPath(datasetScopedRecord.summary.rootPath)} / subjects ${datasetScopedRecord.summary.subjects.length}`,
      "dataset consent should expose dataset-level location and file coverage without subject-level identifiers"
    ),
    createAssertion(
      "session-field-visibility",
      "Session-scope detail reads retain the file path while scrubbing session annotations",
      sessionScopedRecord.summary.filePath === nwbFixture.summary.filePath &&
        sessionScopedRecord.summary.identifier === undefined &&
        sessionScopedRecord.summary.sessionDescription === undefined,
      "file path retained, annotations scrubbed",
      `${toRelativePublicationPath(sessionScopedRecord.summary.filePath)} / identifier ${sessionScopedRecord.summary.identifier ?? "redacted"}`,
      "session consent should allow the time-series source while withholding richer annotations until broader consent exists"
    ),
    createAssertion(
      "neuro-feature-visibility",
      "Session-scoped neuro feature reads retain full derived metrics while benchmark scope bounds them",
      sessionScopedFrame.decodeConfidence === liveIngressResult.frame.decodeConfidence &&
        benchmarkScopedFrame.decodeConfidence === liveIngressResult.frame.decodeConfidence &&
        benchmarkScopedFrame.meanAbs === 0 &&
        benchmarkScopedFrame.rms === 0 &&
        benchmarkScopedFrame.peak === 0,
      "session scope full, benchmark scope bounded",
      `${sessionScopedFrame.decodeConfidence.toFixed(2)} full / ${benchmarkScopedFrame.meanAbs.toFixed(2)} bounded meanAbs`,
      "derived neuro features should only fully surface under session or subject consent"
    ),
    createAssertion(
      "cognitive-trace-visibility",
      "Intelligence-scoped cognitive trace reads retain previews while benchmark scope redacts them",
      intelligenceScopedExecution.responsePreview === syntheticExecution.responsePreview &&
        benchmarkScopedExecution.responsePreview === "[redacted]" &&
        benchmarkScopedExecution.objective === "[redacted]",
      "intelligence scope full, benchmark scope redacted",
      `${intelligenceScopedExecution.responsePreview.length} preview chars / ${benchmarkScopedExecution.responsePreview}`,
      "cognitive traces should be visible only to explicit intelligence-scope readers"
    ),
    createAssertion(
      "actuation-visibility",
      "Actuation-scoped output reads retain commands while benchmark scope redacts them",
      actuationScopedOutput.command === actuationDispatchResult.output.command &&
        actuationScopedOutput.intensity === actuationDispatchResult.output.intensity &&
        benchmarkScopedActuation.command === "[redacted]" &&
        benchmarkScopedActuation.intensity === 0,
      "actuation scope full, benchmark scope redacted",
      `${actuationScopedOutput.command} / ${benchmarkScopedActuation.command}`,
      "outbound write surfaces should only reveal full commands to explicit actuation readers"
    ),
    createAssertion(
      "actuation-policy-clamp",
      "Stim adapter policy clamps intensity to the hardware-specific ceiling",
      actuationDispatchResult.adapter.id === "stim-sandbox" &&
        actuationDispatchResult.output.intensity === 0.65 &&
        actuationDispatchResult.delivery.policyNote.includes("intensity_clamped"),
      "stim-sandbox / 0.65 / policy includes intensity_clamped",
      `${actuationDispatchResult.adapter.id} / ${actuationDispatchResult.output.intensity.toFixed(2)} / ${actuationDispatchResult.delivery.policyNote}`,
      "stim delivery should obey the conservative sandbox ceiling before entering the outward lane"
    ),
    createAssertion(
      "event-audit-visibility",
      "Audit-scope event reads retain full event payloads",
      JSON.stringify(auditEventProjection.payload) === JSON.stringify(representativeEvent.payload),
      "audit payload matches original event payload",
      `${Object.keys(auditEventProjection.payload).length} keys`,
      "audit readers should be able to inspect full lineage payloads"
    ),
    createAssertion(
      "event-benchmark-visibility",
      "Benchmark-scope event reads receive a bounded payload projection",
      Object.keys(benchmarkEventProjection.payload).every((key) =>
        ["eventType", "subjectType", "subjectId", "benchmarkVisible"].includes(key)
      ),
      "bounded benchmark payload keys",
      Object.keys(benchmarkEventProjection.payload).join(", "),
      "benchmark observers should receive enough lineage for trend validation without raw payload spillover"
    ),
    createAssertion(
      "verify-barrier",
      "Verify barrier opens before feedback",
      verifyBarrierTick !== null,
      "observe verify completed with feedback queued",
      verifyBarrierTick !== null
        ? `${verifyBarrierTick * tickIntervalMs} ms`
        : "not observed",
      verifyBarrierTick !== null
        ? `verify barrier opened at tick ${verifyBarrierTick}`
        : "verify never formed a checkpoint gate"
    ),
    createAssertion(
      "cycle-completes",
      "Canonical cycle completes",
      cycleCompletionTick !== null,
      "at least one cycle completion",
      cycleCompletionTick !== null
        ? `${cycleCompletionTick * tickIntervalMs} ms`
        : "not observed",
      cycleCompletionTick !== null
        ? `cycle advanced to ${engine.getSnapshot().cycle}`
        : "engine did not finish a full phase cycle"
    ),
    createAssertion(
      "reflex-latency-budget",
      "Reflex latency p95 stays inside prototype budget",
      reflexSeries.p95 <= 100,
      "<= 100 ms p95",
      formatSeries(reflexSeries),
      "prototype reflex budget from current orchestration architecture"
    ),
    createAssertion(
      "cognitive-latency-budget",
      "Cognitive latency p95 stays interactive",
      cognitiveSeries.p95 <= 250,
      "<= 250 ms p95",
      formatSeries(cognitiveSeries),
      "interactive routing and reasoning budget for the synthetic harness"
    ),
    createAssertion(
      "checkpoint-materialized",
      "Checkpoint materializes during benchmark run",
      cleanStatus.checkpointCount > 0,
      ">= 1 checkpoint",
      String(cleanStatus.checkpointCount),
      "verify/commit progression should produce a checkpoint"
    ),
    createAssertion(
      "integrity-clean",
      "Integrity report stays verified during clean run",
      cleanIntegrity.valid && cleanIntegrity.findingCount === 0,
      "verified / 0 findings",
      `${cleanIntegrity.status} / ${cleanIntegrity.findingCount} findings`,
      "structural and lineage checks over the live durable state"
    ),
    createAssertion(
      "recovery-checkpoint",
      "Recovery resumes from checkpoint lineage",
      recoveryStatus.recovered &&
        (recoveryStatus.recoveryMode === "checkpoint" ||
          recoveryStatus.recoveryMode === "checkpoint-replay"),
      "checkpoint or checkpoint-replay",
      recoveryStatus.recoveryMode,
      "snapshot removed before recovery to force durable lineage path"
    ),
    createAssertion(
      "recovery-integrity",
      "Recovered state remains verified",
      recoveredState !== null && recoveredIntegrity.valid,
      "verified recovered state",
      recoveredState ? recoveredIntegrity.status : "missing",
      recoveredState
        ? `recovered with ${recoveredIntegrity.findingCount} findings`
        : "persistence could not recover a durable state"
    )
  ];

  const totalTicks = Math.max(
    reflexSamples.length,
    cognitiveSamples.length,
    throughputSamples.length,
    coherenceSamples.length
  );
  const report: BenchmarkReport = {
    suiteId,
    generatedAt,
    packId: pack.id,
    packLabel: pack.label,
    profile: engine.getSnapshot().profile,
    summary:
      "This publication benchmarks the real orchestration substrate that exists today: phase execution, verify gating, persistence, checkpoint recovery, integrity validation, replayed NWB windows, live socket neuro ingress, protocol-aware actuation, supervised serial and HTTP/2 direct device transports, and explicit routing decisions that react to transport health, decode confidence, and governance pressure. It does not yet claim external neurodata or BCI decoding performance.",
    tickIntervalMs,
    totalTicks,
    totalDurationMs: totalTicks * tickIntervalMs,
    checkpointCount: cleanStatus.checkpointCount,
    recoveryMode: recoveryStatus.recoveryMode,
    recovered: recoveryStatus.recovered,
    integrity: recoveredIntegrity,
    series: [
      reflexSeries,
      cognitiveSeries,
      throughputSeries,
      coherenceSeries,
      decodeConfidenceSeries,
      syncJitterSeries
    ],
    assertions,
    progress: createProgress(),
    attribution: BENCHMARK_ATTRIBUTION,
    comparison: previousReport
      ? compareBenchmarkReports(previousReport, [
          reflexSeries,
          cognitiveSeries,
          throughputSeries,
          coherenceSeries,
          decodeConfidenceSeries,
          syncJitterSeries
        ])
      : undefined
  };

  return publishBenchmarkReport(report);
}
