import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createSocket } from "node:dgram";
import { createServer as createHttp2Server, type ServerHttp2Stream } from "node:http2";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import {
  benchmarkIndexSchema,
  benchmarkReportSchema,
  type ActuationOutput,
  type BenchmarkAttribution,
  type BenchmarkHardwareContext,
  type BenchmarkPackId,
  type BenchmarkRunKind,
  type CognitiveExecution,
  type EventEnvelope,
  type IntelligenceLayer,
  type PhaseSnapshot,
  type RoutingDecision,
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
  type BenchmarkSeries,
  type GovernancePressureLevel,
  STABILITY_POLE
} from "@immaculate/core";
import { createActuationManager } from "./actuation.js";
import {
  buildExecutionArbitrationDecision,
  planExecutionArbitration
} from "./arbitration.js";
import {
  buildExecutionScheduleDecision,
  planExecutionSchedule
} from "./scheduling.js";
import { getBenchmarkPack } from "./benchmark-packs.js";
import { resolveBenchmarkInputs } from "./benchmark-data.js";
import { runDurabilityTortureBenchmark } from "./benchmark-durability.js";
import { scanBidsDataset } from "./bids.js";
import {
  createGovernanceRegistry,
  evaluateGovernance,
  type GovernanceDecision,
  type GovernanceStatus
} from "./governance.js";
import { buildLiveNeuroFrame } from "./live-neuro.js";
import { signFederationPayload, verifyFederationEnvelope } from "./federation.js";
import { createFederationPeerRegistry, smoothObservedLatency } from "./federation-peers.js";
import {
  buildFederatedExecutionPressure,
  summarizeRemoteExecutionOutcomes
} from "./federation-pressure.js";
import { buildNwbReplayFrames, scanNwbFile } from "./nwb.js";
import { parseStructuredResponse } from "./ollama.js";
import { createPersistence } from "./persistence.js";
import { resolveQLocalOllamaUrl } from "./q-local-model.js";
import { getQFoundationModelName, getQModelName } from "./q-model.js";
import { buildRoutingDecision, planAdaptiveRoute } from "./routing.js";
import { runTemporalBaselineComparison } from "./temporal-baseline.js";
import { safeUnlink } from "./utils.js";
import { createNodeRegistry } from "./node-registry.js";
import { createIntelligenceWorkerRegistry } from "./workers.js";
import { runQGatewaySubstrateBenchmark } from "./benchmark-q-gateway-substrate.js";
import { runQMediationDriftBenchmark } from "./benchmark-q-mediation-drift.js";
import { runArobiAuditIntegrityBenchmark } from "./benchmark-arobi-audit-integrity.js";
import { resolveReleaseMetadata } from "./release-metadata.js";
import {
  projectActuationOutput,
  projectCognitiveExecution,
  projectExecutionSchedule,
  projectDatasetRecord,
  projectEventEnvelope,
  projectNeuroFrameWindow,
  projectNeuroSessionRecord,
  projectPhaseSnapshot,
  redactPhaseSnapshot
} from "./visibility.js";
import { collapseSampleRows, extractBandPower } from "./neuro-bands.js";

type BenchmarkRunOptions = {
  packId?: BenchmarkPackId;
  tickIntervalMs?: number;
  maxTicks?: number;
  runtimeDir?: string;
};

const DEFAULT_TICK_INTERVAL_MS = 40;
const DEFAULT_MAX_TICKS = 320;
const BENCHMARK_ADAPTER_DISPATCH_CADENCE_MS = 15;
const DEFAULT_Q_RUNTIME_ENDPOINT = resolveQLocalOllamaUrl();
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
  owner: "Gaetano Comparcola (PossumX)",
  role: "Program Originator, Systems Architect, and Engineering Lead",
  website: "https://PossumX.dev",
  contributions: [
    "Defined the three-plane orchestration model across reflex, cognitive, and offline execution.",
    "Set the requirement that Immaculate be observable, replayable, benchmarked, and durable before it scales outward.",
    "Architected the synthetic connectome substrate, live harness control surfaces, and phased execution model used in this build."
  ]
};

let benchmarkHistoryFromRunsCache: Promise<BenchmarkIndex> | null = null;
let publishedBenchmarkIndexCache: Promise<BenchmarkIndex> | null = null;
let latestPublishedBenchmarkReportCache: Promise<BenchmarkReport | null> | null = null;
const benchmarkReportByPathCache = new Map<string, Promise<BenchmarkReport | null>>();

function resetBenchmarkPublicationCaches(): void {
  benchmarkHistoryFromRunsCache = null;
  publishedBenchmarkIndexCache = null;
  latestPublishedBenchmarkReportCache = null;
  benchmarkReportByPathCache.clear();
}

function mergeBenchmarkIndexEntries(...entrySets: BenchmarkIndexEntry[][]): BenchmarkIndexEntry[] {
  const entriesBySuiteId = new Map<string, BenchmarkIndexEntry>();
  for (const entrySet of entrySets) {
    for (const entry of entrySet) {
      if (!entriesBySuiteId.has(entry.suiteId)) {
        entriesBySuiteId.set(entry.suiteId, entry);
      }
    }
  }
  return Array.from(entriesBySuiteId.values())
    .sort((left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt))
    .slice(0, BENCHMARK_HISTORY_LIMIT);
}

function classifyBenchmarkRunKind(plannedDurationMs: number): BenchmarkRunKind {
  if (plannedDurationMs >= 3_600_000) {
    return "soak";
  }
  if (plannedDurationMs >= 60_000) {
    return "benchmark";
  }
  return "smoke";
}

function resolveBenchmarkRunKind(
  pack: ReturnType<typeof getBenchmarkPack>,
  plannedDurationMs: number
): BenchmarkRunKind {
  return pack.reportRunKind ?? classifyBenchmarkRunKind(plannedDurationMs);
}

function resolveReportedPlannedDurationMs(
  pack: ReturnType<typeof getBenchmarkPack>,
  plannedDurationMs: number
): number {
  return pack.reportPlannedDurationMs ?? plannedDurationMs;
}

function describeBenchmarkTiming(pack: ReturnType<typeof getBenchmarkPack>): string {
  if (pack.realTimePacing) {
    return "This pack is wall-clock paced and claims its planned runtime honestly.";
  }
  if (pack.ciEligible) {
    return "This pack is an unpaced smoke/gate lane and does not claim long-horizon soak duration.";
  }
  return "This pack is an unpaced credibility lane; wall-clock duration is measured directly and planned duration is intentionally left dynamic instead of pretending to be a soak target.";
}

function detectWindowsDiskKind(): string | undefined {
  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-PhysicalDisk | Select-Object -First 1 MediaType,FriendlyName | ConvertTo-Json -Compress"
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();
    if (!output) {
      return undefined;
    }
    const parsed = JSON.parse(output) as { MediaType?: string; FriendlyName?: string };
    return parsed.MediaType?.trim() || parsed.FriendlyName?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function detectLinuxDiskKind(): string | undefined {
  try {
    const output = execFileSync(
      "lsblk",
      ["-d", "-J", "-o", "rota,model"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();
    if (!output) {
      return undefined;
    }
    const parsed = JSON.parse(output) as {
      blockdevices?: Array<{ rota?: boolean | number | string; model?: string }>;
    };
    const device = parsed.blockdevices?.[0];
    if (!device) {
      return undefined;
    }
    const rotational =
      device.rota === true ||
      device.rota === 1 ||
      (typeof device.rota === "string" && device.rota.trim() === "1");
    const media = rotational ? "HDD" : "SSD";
    return device.model?.trim() ? `${media} (${device.model.trim()})` : media;
  } catch {
    return undefined;
  }
}

function detectBenchmarkDiskKind(): string | undefined {
  if (process.platform === "win32") {
    return detectWindowsDiskKind();
  }
  if (process.platform === "linux") {
    return detectLinuxDiskKind();
  }
  return undefined;
}

function captureBenchmarkHardwareContext(): BenchmarkHardwareContext {
  const cpus = os.cpus();
  const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length;
  const cpuModel = cpus[0]?.model?.trim() || "unknown-cpu";
  return {
    host: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    osVersion: os.version(),
    cpuModel,
    cpuCount: Math.max(1, cpuCount),
    memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    diskKind: detectBenchmarkDiskKind(),
    nodeVersion: process.version
  };
}

function formatBenchmarkHardwareContext(context: BenchmarkHardwareContext): string {
  return `${context.host} / ${context.platform}-${context.arch}${context.osVersion ? ` ${context.osVersion}` : ""} / ${context.cpuModel} / ${context.cpuCount} cores / ${context.memoryGiB.toFixed(2)} GiB RAM / ${context.diskKind ?? "unknown disk"} / Node ${context.nodeVersion}`;
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

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function paceBenchmarkTick(
  enabled: boolean,
  startedAt: number,
  tick: number,
  tickIntervalMs: number
): Promise<void> {
  if (!enabled) {
    return;
  }

  const targetElapsedMs = tick * tickIntervalMs;
  const elapsedMs = performance.now() - startedAt;
  const waitMs = Math.max(0, targetElapsedMs - elapsedMs);
  if (waitMs > 0) {
    await delay(waitMs);
  }
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
    p99: Number(percentile(sorted, 0.99).toFixed(2)),
    p999: Number(percentile(sorted, 0.999).toFixed(2)),
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

type BenchmarkSessionBindingInput = {
  consentScope?: string;
  requestedSessionId?: string;
  sourceExecutionSessionId?: string;
  sourceFrameSessionId?: string;
  defaultExecutionSessionId?: string;
  defaultFrameSessionId?: string;
};

type BenchmarkSessionBindingDecision = {
  allowed: boolean;
  reason: string;
  resolvedSessionId?: string;
};

function evaluateBenchmarkSessionBinding(
  input: BenchmarkSessionBindingInput
): BenchmarkSessionBindingDecision {
  const scopedSessionId = input.consentScope?.startsWith("session:")
    ? input.consentScope.slice("session:".length)
    : undefined;
  const executionSessionId = input.sourceExecutionSessionId ?? input.defaultExecutionSessionId;
  const frameSessionId = input.sourceFrameSessionId ?? input.defaultFrameSessionId;
  const resolvedSessionId =
    input.requestedSessionId?.trim() || frameSessionId || scopedSessionId || undefined;
  const explicitSourcesProvided =
    Boolean(input.sourceExecutionSessionId) || Boolean(input.sourceFrameSessionId);

  if (scopedSessionId && resolvedSessionId && scopedSessionId !== resolvedSessionId) {
    if (!explicitSourcesProvided) {
      return {
        allowed: false,
        reason: "ambiguous_source_scope_mismatch",
        resolvedSessionId
      };
    }
    return {
      allowed: false,
      reason: "resource_scope_mismatch",
      resolvedSessionId
    };
  }

  if (explicitSourcesProvided) {
    if (executionSessionId && resolvedSessionId && executionSessionId !== resolvedSessionId) {
      return {
        allowed: false,
        reason: "source_scope_mismatch",
        resolvedSessionId
      };
    }
    if (frameSessionId && resolvedSessionId && frameSessionId !== resolvedSessionId) {
      return {
        allowed: false,
        reason: "source_scope_mismatch",
        resolvedSessionId
      };
    }
    return {
      allowed: true,
      reason: "session_bound",
      resolvedSessionId
    };
  }

  if (
    scopedSessionId &&
    ((executionSessionId && executionSessionId !== scopedSessionId) ||
      (frameSessionId && frameSessionId !== scopedSessionId))
  ) {
    return {
      allowed: false,
      reason: "ambiguous_source_scope_mismatch",
      resolvedSessionId
    };
  }

  return {
    allowed: true,
    reason: "session_bound",
    resolvedSessionId
  };
}

async function safeReadText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function createProgress(options: {
  runKind: BenchmarkRunKind;
  hardwareContext: BenchmarkHardwareContext;
  realTimePacing?: boolean;
  liveFramesPerTick?: number;
}): BenchmarkProgress {
  const benchmarkShapeNotes = [
    `Captured benchmark hardware context: ${formatBenchmarkHardwareContext(options.hardwareContext)}`,
    `Classified this run as ${options.runKind} for honest publication`,
    ...(options.realTimePacing
      ? ["Wall-clock pacing is active for this pack, so planned duration must match observed runtime."]
      : ["This pack is an unpaced gate/smoke lane and does not claim full wall-clock soak coverage."]),
    ...(options.liveFramesPerTick && options.liveFramesPerTick > 0
      ? [`High-throughput live ingress pressure is active at ${options.liveFramesPerTick} extra frames per tick.`]
      : [])
  ];
  return {
    stage: `${options.runKind} benchmark on ${options.hardwareContext.platform}-${options.hardwareContext.arch} (${options.hardwareContext.cpuCount} cores)`,
    completed: [
      ...benchmarkShapeNotes,
      "Canonical phase/pass engine across reflex, cognitive, and offline planes",
      "Realtime harness with websocket streaming and operator controls",
      "Durable event log, materialized history, and checkpoint persistence",
      "Verify barrier and integrity-aware recovery that rejects invalid lineage",
      "BIDS dataset scanning and registration into the durable ingest spine",
      "NWB time-series scanning and neuro-session registration into synchronize/decode",
      "Live NWB replay windows flowing through synchronize/decode with decode-confidence tracking",
      "Live socket neuro frames entering the durable synchronize/decode path",
      "First live local Q cognition lane wired into route/reason/commit",
      "Purpose-bound governance enforcement across mutable control, ingest, cognition, streaming, and benchmark routes",
      "Sensitive snapshot dataset and neuro-session reads redacted by default, with governed detail routes for full inspection",
    "Field-level consent projections over derived neuro features and cognitive trace previews",
    "Tier 2 neural-coupling benchmark coverage for band dominance, route phase bias, and coupled routing strength",
    "Tier 2 spectral-confidence coverage for artifact-band penalty and legacy amplitude path continuity",
    "Governed actuation dispatch and actuation output readback across the feedback plane",
      "Adapter-backed visual, haptic, and stim delivery lanes with durable actuation delivery logs",
      "Governed websocket actuation device links with acked bridge delivery and file-backed continuity",
      "Concrete UDP/OSC actuation transport registration and delivery over protocol-aware visual lanes",
      "Supervised serial vendor transport with heartbeat health, capability health, and per-device fault isolation",
      "HTTP/2 direct device transport with typed RPC-style delivery and response telemetry",
      "Health- and latency-aware transport preference across concrete actuation lanes",
      "Durable execution arbitration that decides when the system should think, act, or hold",
      "Durable execution scheduling that chooses single-layer versus truthful parallel swarm formation before cognition runs",
      "Truthful runtime swarm execution where non-guard cognition layers can execute concurrently and guarded swarms close with a final review turn",
      "Authoritative worker-assignment coverage for leased remote placement and visible duplicate assignment pressure",
      "Adaptive federated execution pressure with signed peer lease renewal, latency/outcome-aware remote placement, and multi-peer orchestration pressure signals",
      "Explicit session-bound source safety coverage for mediated dispatch and fail-closed scope mismatches",
      "Real LSL bridge ingress that can feed external stream payloads into the same live neuro spine as replay and socket frames",
      "Tier 1 cognitive-loop benchmark coverage for parsed route/reason/commit structure, governance-aware cognition, soft-route priors, and multi-role conversation verdicts",
      "Core runtime parsing of LLM route suggestions and true multi-role conversation execution",
      "W&B benchmark publication backend for external experiment tracking",
      "Keyboard-first TUI and Next.js overwatch dashboard with live connectome telemetry",
      "Published internal benchmark suite for repeatable functional testing"
    ],
    remaining: [
      "Direct device adapters beyond the first live socket neurophysiology ingress path",
      "Additional vendor-specific transports beyond serial and HTTP/2 direct lanes, including MIDI and richer gRPC-class adapters",
      "Additional multi-agent and tool backends beyond the first local governed Q reasoning lane",
      "Domain benchmark packs against published BCI and neurodata workloads",
      "Distributed multi-peer swarm routing that feeds live cross-node execution pressure back into runtime cognition formation and outward routing"
      ]
  };
}

function createTier2BandDominantSamples(options: {
  frequencyHz: number;
  sampleCount: number;
  channelCount: number;
  rateHz: number;
  amplitude: number;
  phaseShift?: number;
  harmonicScale?: number;
  noiseScale?: number;
}): number[][] {
  const rows: number[][] = [];
  const phaseShift = options.phaseShift ?? 0;
  const harmonicScale = options.harmonicScale ?? 0.14;
  const noiseScale = options.noiseScale ?? 0.02;

  for (let sampleIndex = 0; sampleIndex < options.sampleCount; sampleIndex += 1) {
    const timeSec = sampleIndex / options.rateHz;
    const carrier = Math.sin(2 * Math.PI * options.frequencyHz * timeSec + phaseShift);
    const harmonic = harmonicScale * Math.sin(
      2 * Math.PI * (options.frequencyHz / 2) * timeSec + 0.31
    );
    const noise = noiseScale * Math.sin(2 * Math.PI * 3 * timeSec + sampleIndex * 0.01);
    const sample = Number((options.amplitude * carrier + options.amplitude * harmonic + noise).toFixed(6));
    rows.push(
      Array.from({ length: options.channelCount }, (_, channelIndex) =>
        Number((sample + Math.sin(channelIndex * 0.19) * 0.004).toFixed(6))
      )
    );
  }

  return rows;
}

type ParsedCognitiveLoop = {
  routeSuggestion: string;
  reasonSummary: string;
  commitStatement: string;
  fieldCount: number;
};

type Tier1ConversationVerdict = "approved" | "blocked";

type Tier1ConversationTurn = {
  role: "mid" | "soul" | "reasoner" | "guard";
  layerId: string;
  summary: string;
  verdict?: Tier1ConversationVerdict;
};

type Tier1ConversationLedger = {
  turns: Tier1ConversationTurn[];
  verdict: Tier1ConversationVerdict;
  order: string;
  governancePressure: GovernancePressureLevel;
};

function parseStructuredCognitiveResponse(response: string): ParsedCognitiveLoop {
  const parsed = parseStructuredResponse(response, "reasoner");
  const routeSuggestion = parsed.routeSuggestion ?? "";
  const reasonSummary = parsed.reasonSummary ?? "";
  const commitStatement = parsed.commitStatement ?? "";
  const fieldCount = [routeSuggestion, reasonSummary, commitStatement].filter(
    (field) => field.length > 0
  ).length;

  return {
    routeSuggestion,
    reasonSummary,
    commitStatement,
    fieldCount
  };
}

function buildGovernanceAwareCognitionContext(options: {
  pressure: GovernancePressureLevel;
  deniedCount: number;
  objective: string;
}): string {
  return [
    `governance=${options.pressure}`,
    `denied=${options.deniedCount}`,
    `objective=${options.objective.slice(0, 72)}`
  ].join(" / ");
}

function deriveRouteSoftPriorBias(
  routeSuggestion: string,
  mode: "reflex-direct" | "cognitive-assisted" | "guarded-fallback" | "operator-override" | "suppressed",
  pressure: GovernancePressureLevel
): number {
  const lowerSuggestion = routeSuggestion.toLowerCase();
  const base =
    lowerSuggestion.includes("hold") || lowerSuggestion.includes("guard")
      ? -0.04
      : lowerSuggestion.includes("sustain") || lowerSuggestion.includes("stabil")
        ? 0.05
        : 0.03;
  const modeBias =
    mode === "guarded-fallback"
      ? -0.02
      : mode === "cognitive-assisted"
        ? 0.01
        : mode === "suppressed"
          ? -0.03
          : 0.02;
  const pressureBias = pressure === "critical" ? -0.02 : pressure === "elevated" ? -0.01 : 0;
  return Number(Math.max(-0.06, Math.min(0.06, base + modeBias + pressureBias)).toFixed(4));
}

function deriveRouteSoftPriorStrength(
  routeSuggestion: string,
  mode: "reflex-direct" | "cognitive-assisted" | "guarded-fallback" | "operator-override" | "suppressed",
  pressure: GovernancePressureLevel
): number {
  const lowerSuggestion = routeSuggestion.toLowerCase();
  const explicitRouteHint =
    lowerSuggestion.includes("hold") ||
    lowerSuggestion.includes("guard") ||
    lowerSuggestion.includes("suppress")
      ? "guarded"
      : lowerSuggestion.includes("reflex") || lowerSuggestion.includes("direct")
        ? "reflex"
        : lowerSuggestion.includes("cognitive") || lowerSuggestion.includes("reasoner")
          ? "cognitive"
          : lowerSuggestion.includes("sustain") || lowerSuggestion.includes("stabil")
            ? "steady"
            : undefined;
  const baseStrength = explicitRouteHint ? 0.05 : 0.03;
  const consistencyBonus =
    explicitRouteHint === "guarded" && (mode === "guarded-fallback" || mode === "suppressed")
      ? 0.01
      : explicitRouteHint === "reflex" && mode === "reflex-direct"
        ? 0.01
        : explicitRouteHint === "cognitive" && mode === "cognitive-assisted"
          ? 0.01
          : explicitRouteHint === "steady" &&
              (mode === "reflex-direct" || mode === "cognitive-assisted")
            ? 0.01
            : 0;
  const governancePenalty = pressure === "critical" ? 0.01 : pressure === "elevated" ? 0.005 : 0;
  return Number(Math.max(0.01, Math.min(0.06, baseStrength + consistencyBonus - governancePenalty)).toFixed(4));
}

function buildTier1ConversationLedger(options: {
  midLayer: IntelligenceLayer;
  soulLayer: IntelligenceLayer;
  reasonerLayer: IntelligenceLayer;
  guardLayer: IntelligenceLayer;
  parsed: ParsedCognitiveLoop;
  governanceContext: string;
  softPriorBias: number;
  pressure: GovernancePressureLevel;
}): Tier1ConversationLedger {
  const verdict: Tier1ConversationVerdict =
    options.pressure === "critical" || options.softPriorBias < 0 ? "blocked" : "approved";
  const turns: Tier1ConversationTurn[] = [
    {
      role: "mid",
      layerId: options.midLayer.id,
      summary: `Frame route suggestion ${options.parsed.routeSuggestion}`,
      verdict
    },
    {
      role: "soul",
      layerId: options.soulLayer.id,
      summary: `Contextualize ${options.governanceContext}`
    },
    {
      role: "reasoner",
      layerId: options.reasonerLayer.id,
      summary: `Apply soft prior ${options.softPriorBias.toFixed(4)} to the route suggestion`
    },
    {
      role: "guard",
      layerId: options.guardLayer.id,
      summary: verdict === "approved" ? "Approve bounded continuation." : "Block outbound continuation.",
      verdict
    }
  ];

  return {
    turns,
    verdict,
    order: turns.map((turn) => turn.role).join(">"),
    governancePressure: options.pressure
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
        `| ${series.label} | ${series.samples} | ${series.min.toFixed(2)} | ${series.p50.toFixed(2)} | ${series.p95.toFixed(2)} | ${series.p99.toFixed(2)} | ${series.p999.toFixed(2)} | ${series.max.toFixed(2)} | ${series.unit} |`
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
Run kind: ${report.runKind}

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
- Planned duration: ${report.plannedDurationMs} ms
- Wall-clock duration: ${report.totalDurationMs} ms
- Recovery mode: ${report.recoveryMode}
- Checkpoints: ${report.checkpointCount}
- Integrity: ${report.integrity.status} (${report.integrity.findingCount} findings)
- Hardware: ${formatBenchmarkHardwareContext(report.hardwareContext)}
${report.comparison ? `- Previous baseline: ${report.comparison.previousSuiteId}` : ""}

## Assertions

| Assertion | Status | Target | Actual | Detail |
| --- | --- | --- | --- | --- |
${assertionLines}

## Series

| Series | Samples | Min | P50 | P95 | P99 | P99.9 | Max | Unit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
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

function isKnownBenchmarkPackId(value: unknown): value is BenchmarkPackId {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return getBenchmarkPack(value as BenchmarkPackId).id === value;
  } catch {
    return false;
  }
}

function normalizeBenchmarkReportInput(input: unknown): BenchmarkReport {
  const candidate = input as Partial<BenchmarkReport> | undefined;
  const normalized = {
    ...candidate,
    packId: isKnownBenchmarkPackId(candidate?.packId) ? candidate.packId : LEGACY_DEFAULT_PACK_ID,
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
        packId: isKnownBenchmarkPackId(indexEntry.packId) ? indexEntry.packId : LEGACY_DEFAULT_PACK_ID,
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

  resetBenchmarkPublicationCaches();
  latestPublishedBenchmarkReportCache = Promise.resolve(publishedReport);
  publishedBenchmarkIndexCache = Promise.resolve(nextIndex);
  benchmarkReportByPathCache.set(runJsonRelativePath, Promise.resolve({
    ...report,
    publication: {
      jsonPath: runJsonRelativePath,
      markdownPath: runMarkdownRelativePath
    }
  }));
  benchmarkReportByPathCache.set(toRelativePublicationPath(LATEST_JSON_PATH), Promise.resolve(publishedReport));

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
  if (benchmarkHistoryFromRunsCache) {
    return benchmarkHistoryFromRunsCache;
  }

  benchmarkHistoryFromRunsCache = (async () => {
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
  })();

  try {
    return await benchmarkHistoryFromRunsCache;
  } catch (error) {
    benchmarkHistoryFromRunsCache = null;
    throw error;
  }
}

export async function loadPublishedBenchmarkIndex(): Promise<BenchmarkIndex> {
  if (publishedBenchmarkIndexCache) {
    return publishedBenchmarkIndexCache;
  }

  publishedBenchmarkIndexCache = (async () => {
    const runHistory = await loadBenchmarkHistoryFromRuns();
    try {
      const content = await readFile(INDEX_JSON_PATH, "utf8");
      const index = normalizeBenchmarkIndexInput(JSON.parse(content));
      const mergedEntries = mergeBenchmarkIndexEntries(index.entries, runHistory.entries);

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
  })();

  try {
    return await publishedBenchmarkIndexCache;
  } catch (error) {
    publishedBenchmarkIndexCache = null;
    throw error;
  }
}

export async function loadPublishedBenchmarkReport(): Promise<BenchmarkReport | null> {
  if (latestPublishedBenchmarkReportCache) {
    return latestPublishedBenchmarkReportCache;
  }

  latestPublishedBenchmarkReportCache = (async () => {
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
  })();

  try {
    return await latestPublishedBenchmarkReportCache;
  } catch (error) {
    latestPublishedBenchmarkReportCache = null;
    throw error;
  }
}

async function loadBenchmarkReportFromRelativePath(relativePath: string): Promise<BenchmarkReport | null> {
  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  const cached = benchmarkReportByPathCache.get(normalizedRelativePath);
  if (cached) {
    return cached;
  }

  const loader = (async () => {
    try {
      const content = await readFile(path.join(REPO_ROOT, normalizedRelativePath), "utf8");
      return normalizeBenchmarkReportInput(JSON.parse(content));
    } catch (error) {
      const candidate = error as NodeJS.ErrnoException;
      if (candidate.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  })();
  benchmarkReportByPathCache.set(normalizedRelativePath, loader);
  try {
    return await loader;
  } catch (error) {
    benchmarkReportByPathCache.delete(normalizedRelativePath);
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
  return (
    seriesId === "reflex_latency_ms" ||
    seriesId === "cognitive_latency_ms" ||
    seriesId === "execution_arbitration_latency_ms" ||
    seriesId === "cognitive_loop_parse_latency_ms" ||
    seriesId === "multi_role_conversation_latency_ms" ||
    seriesId === "prediction_error_ratio" ||
    seriesId === "free_energy_proxy" ||
    seriesId === "neuro_sync_jitter_ms" ||
    seriesId === "federation_peer_latency_ms" ||
    seriesId === "federation_execution_pressure_ms"
  );
}

function trendNeutralSeries(seriesId: string): boolean {
  return seriesId === "cognitive_route_soft_prior_ratio";
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
      const isSmallLatencySeries = series.unit === "ms" && before < 5 && after < 5;
      const percentDelta =
        before === 0 || (isSmallLatencySeries && Math.abs(delta) < 1)
          ? 0
          : round((delta / before) * 100);
      const trend: BenchmarkDelta["trend"] =
        Math.abs(delta) < 0.01 ||
        (isSmallLatencySeries && Math.abs(delta) < 1) ||
        trendNeutralSeries(series.id)
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
  const realTimePacing = pack.realTimePacing;
  const completionStrategy = pack.completionStrategy;
  const persistEveryTicks = Math.max(1, pack.persistEveryTicks);
  const liveFramesPerTick = Math.max(0, pack.liveFramesPerTick);
  const nominalPlannedDurationMs = maxTicks * tickIntervalMs;
  const plannedDurationMs = resolveReportedPlannedDurationMs(pack, nominalPlannedDurationMs);
  const runKind = resolveBenchmarkRunKind(pack, nominalPlannedDurationMs);
  const hardwareContext = captureBenchmarkHardwareContext();
  const runtimeDir =
    options.runtimeDir ?? path.join(REPO_ROOT, ".runtime", "benchmarks", suiteId);
  const benchmarkStartedAt = performance.now();

  if (pack.id === "durability-torture") {
    const durability = await runDurabilityTortureBenchmark(runtimeDir);
    const recoverySuccessSeries = createSeries(
      "durability_recovery_success_ratio",
      "Durability Recovery Success Ratio",
      "ratio",
      durability.recoverySuccessSamples
    );
    const dataLossSeries = createSeries(
      "durability_data_loss_events",
      "Durability Data Loss Events",
      "events",
      durability.dataLossSamples
    );
    const iterationDurationSeries = createSeries(
      "durability_iteration_wall_clock_ms",
      "Durability Iteration Wall Clock",
      "ms",
      durability.iterationDurationSamples
    );
    const assertions = [
      createAssertion(
        "durability-total-iterations",
        "Durability torture runs the full 1,000 crash iterations",
        durability.totalIterations >= 1000,
        ">= 1000 iterations",
        String(durability.totalIterations),
        "credibility depends on proving recovery across repeated crashes rather than a handful of happy-path restarts"
      ),
      createAssertion(
        "durability-failure-modes",
        "Durability torture covers five distinct failure modes",
        durability.modeCount >= 5,
        ">= 5 failure modes",
        String(durability.modeCount),
        "the recovery story should survive multiple classes of failure, not just a single kill signal"
      ),
      createAssertion(
        "durability-recovery-success",
        "Durability torture recovers every crash iteration successfully",
        recoverySuccessSeries.p50 >= 1 && recoverySuccessSeries.min >= 1,
        "100% recovery success",
        `${recoverySuccessSeries.average.toFixed(2)} average / min ${recoverySuccessSeries.min.toFixed(2)}`,
        "recovery must succeed on every injected failure if the crash harness is going to be trusted"
      ),
      createAssertion(
        "durability-data-loss",
        "Durability torture retains every last acknowledged durable marker",
        dataLossSeries.max === 0,
        "0 durable markers lost",
        `${dataLossSeries.max.toFixed(0)} max / ${dataLossSeries.average.toFixed(2)} average`,
        "the supervisor only counts markers that were durably persisted before the failure boundary, so any loss here is real durability loss"
      ),
      createAssertion(
        "durability-integrity",
        "Durability torture ends in a verified integrity state",
        durability.lastIntegrityStatus === "verified",
        "verified",
        durability.lastIntegrityStatus,
        "every crash lane still has to rejoin the durable lineage without leaving the state degraded at the end"
      )
    ];
    const report: BenchmarkReport = {
      suiteId,
      generatedAt,
      packId: pack.id,
      packLabel: pack.label,
      runKind,
      profile: `torture / ${hardwareContext.platform}-${hardwareContext.arch}`,
      summary: `This benchmark runs a crash-supervised durability torture lane across five failure modes: hard kill, process abort, simulated disk full, corrupt checkpoint, and simulated power loss. Each iteration reuses the same runtime directory, kills or crashes the worker after a durable marker is acknowledged, then forces recovery through the real persistence loader. Hardware context: ${formatBenchmarkHardwareContext(hardwareContext)}.`,
      tickIntervalMs,
      totalTicks: durability.totalIterations,
      plannedDurationMs,
      totalDurationMs: durability.totalDurationMs,
      checkpointCount: durability.lastCheckpointCount,
      recoveryMode: durability.lastRecoveryMode,
      recovered: recoverySuccessSeries.min >= 1,
      integrity: {
        valid: durability.lastIntegrityStatus === "verified",
        status:
          durability.lastIntegrityStatus === "verified" ||
          durability.lastIntegrityStatus === "degraded" ||
          durability.lastIntegrityStatus === "invalid"
            ? durability.lastIntegrityStatus
            : "invalid",
        coherenceStable: false,
        findingCount: 0,
        findings: [],
        checkedAt: new Date().toISOString(),
        currentCycle: Math.max(1, durability.totalIterations),
        activePassCount: 1
      },
      hardwareContext,
      series: [recoverySuccessSeries, dataLossSeries, iterationDurationSeries],
      assertions,
      progress: {
        stage: `durability torture across ${durability.modeCount} failure modes`,
        completed: durability.modeSummaries.map(
          (mode) =>
            `${mode.mode}: ${mode.recovered}/${mode.iterations} recovered with ${mode.dataLosses} durable markers lost`
        ),
        remaining: []
      },
      attribution: BENCHMARK_ATTRIBUTION,
      comparison: previousReport
        ? compareBenchmarkReports(previousReport, [
            recoverySuccessSeries,
            dataLossSeries,
            iterationDurationSeries
          ])
        : undefined
    };

    return publishBenchmarkReport(report);
  }

  if (pack.id === "q-gateway-substrate") {
    const gatewaySubstrate = await runQGatewaySubstrateBenchmark({
      repoRoot: REPO_ROOT,
      runtimeDir
    });
    const qGatewayStatus = createPersistence(runtimeDir).getStatus();
    const structuredFieldSeries = createSeries(
      "q_gateway_substrate_structured_fields",
      "Q Gateway Substrate Structured Fields",
      "fields",
      gatewaySubstrate.scenarioResults.map((scenario) => scenario.structuredFieldCount)
    );
    const gatewayLatencySeries = createSeries(
      "q_gateway_substrate_latency_ms",
      "Q Gateway Substrate End-To-End Latency",
      "ms",
      gatewaySubstrate.scenarioResults.map((scenario) => scenario.latencyMs)
    );
    const arbitrationLatencySeries = createSeries(
      "q_gateway_substrate_arbitration_ms",
      "Q Gateway Substrate Arbitration Latency",
      "ms",
      gatewaySubstrate.scenarioResults.map((scenario) => scenario.arbitrationLatencyMs)
    );
    const guardDeniedSeries = createSeries(
      "q_gateway_substrate_guard_denials",
      "Q Gateway Substrate Guard Denials",
      "count",
      gatewaySubstrate.scenarioResults.map((scenario) => scenario.guardDeniedCount)
    );
    const infoBody =
      typeof gatewaySubstrate.checks.info.body === "object" && gatewaySubstrate.checks.info.body !== null
        ? (gatewaySubstrate.checks.info.body as {
            release?: { qTrainingBundleId?: string };
          })
        : undefined;
    const modelsBody =
      typeof gatewaySubstrate.checks.models.body === "object" && gatewaySubstrate.checks.models.body !== null
        ? (gatewaySubstrate.checks.models.body as {
            data?: Array<{
              id?: string;
              metadata?: { foundationModel?: string };
            }>;
          })
        : undefined;
    const qModelEntry = modelsBody?.data?.[0];
    const expectedProviderModel =
      typeof gatewaySubstrate.checks.health.body === "object" && gatewaySubstrate.checks.health.body !== null
        ? ((gatewaySubstrate.checks.health.body as { foundationModel?: string }).foundationModel ?? "Gemma 4")
        : "Gemma 4";
    const assertions = [
      createAssertion(
        "q-gateway-substrate-health",
        "Q gateway substrate health is live and model-ready",
        gatewaySubstrate.checks.health.status === 200 &&
          Boolean(
            typeof gatewaySubstrate.checks.health.body === "object" &&
              gatewaySubstrate.checks.health.body !== null &&
              (gatewaySubstrate.checks.health.body as { ok?: boolean; modelReady?: boolean }).ok &&
              (gatewaySubstrate.checks.health.body as { modelReady?: boolean }).modelReady
          ),
        "200 + ok=true + modelReady=true",
        `${gatewaySubstrate.checks.health.status}`,
        "the seam is only honest if the dedicated Q gateway is genuinely live before the substrate drives it"
      ),
      createAssertion(
        "q-gateway-substrate-auth",
        "Q gateway substrate rejects unauthenticated chat",
        gatewaySubstrate.checks.unauthorizedChat.status === 401,
        "401",
        String(gatewaySubstrate.checks.unauthorizedChat.status),
        "public edge auth needs to fail closed before this lane can be trusted"
      ),
      createAssertion(
        "q-gateway-substrate-release-bind",
        "Q gateway substrate info route is bound to the current tracked training bundle",
        infoBody?.release?.qTrainingBundleId === gatewaySubstrate.qTrainingBundleId,
        gatewaySubstrate.qTrainingBundleId ?? "tracked bundle id",
        infoBody?.release?.qTrainingBundleId ?? "missing",
        "the release surface must agree with the live gateway before Q can be benchmarked as one coherent product"
      ),
      createAssertion(
        "q-gateway-substrate-model-list",
        "Q gateway substrate exposes only the Q public model name built on Gemma 4",
        gatewaySubstrate.checks.models.status === 200 &&
          modelsBody?.data?.length === 1 &&
          qModelEntry?.id === "Q" &&
          qModelEntry.metadata?.foundationModel === expectedProviderModel,
        "Q public model name built on Gemma 4",
        `${gatewaySubstrate.checks.models.status} / ${qModelEntry?.id ?? "missing"} / ${qModelEntry?.metadata?.foundationModel ?? "missing"}`,
        "the public model list should make Q the only model name while still stating it is built on Gemma 4"
      ),
      createAssertion(
        "q-gateway-substrate-concurrency",
        "Q gateway substrate rejects a second in-flight chat request",
        gatewaySubstrate.checks.concurrency.status === 429,
        "429",
        String(gatewaySubstrate.checks.concurrency.status),
        "bounded concurrency is part of the contract, not an optional transport detail"
      ),
      createAssertion(
        "q-gateway-substrate-structured",
        "Q gateway substrate preserves ROUTE/REASON/COMMIT through the gateway seam",
        gatewaySubstrate.scenarioResults.every(
          (scenario) => scenario.status === "completed" && scenario.parseSuccess && scenario.structuredFieldCount === 3
        ),
        "all scenarios parse 3 structured fields",
        gatewaySubstrate.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:${scenario.status}/${scenario.structuredFieldCount}/${scenario.failureClass ?? "none"}`
          )
          .join(", "),
        "the benchmark should fail if the dedicated gateway allows malformed structured work to masquerade as a success"
      ),
      createAssertion(
        "q-gateway-substrate-arbitration-pressure",
        "Immaculate arbitration preserves the expected governance pressure after the Q seam",
        gatewaySubstrate.scenarioResults.every(
          (scenario) =>
            scenario.id !== "critical-guard-hold" ||
            (scenario.arbitrationGovernancePressure === "critical" && !scenario.shouldDispatchActuation)
        ) &&
          gatewaySubstrate.scenarioResults.every(
            (scenario) =>
              scenario.id !== "elevated-recovery" ||
              scenario.arbitrationGovernancePressure === "elevated"
          ),
        "critical hold stays critical / elevated recovery stays elevated",
        gatewaySubstrate.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:${scenario.arbitrationGovernancePressure}/${scenario.arbitrationMode}/dispatch=${scenario.shouldDispatchActuation}`
          )
          .join(", "),
        "the seam is useful only if the routed Q output survives arbitration with the same governance intent"
      ),
      createAssertion(
        "q-gateway-substrate-guard-denials",
        "Critical guard-denial pressure blocks outward dispatch across the seam",
        gatewaySubstrate.scenarioResults.some(
          (scenario) =>
            scenario.id === "critical-guard-hold" &&
            scenario.guardDeniedCount >= 3 &&
            scenario.shouldDispatchActuation === false
        ),
        "critical scenario with >=3 denials and no dispatch",
        gatewaySubstrate.scenarioResults
          .filter((scenario) => scenario.id === "critical-guard-hold")
          .map((scenario) => `${scenario.guardDeniedCount} denials / dispatch=${scenario.shouldDispatchActuation}`)
          .join(", "),
        "this proves the gateway-facing Q path can still fail closed once Immaculate governance pressure turns critical"
      )
    ];
    const report: BenchmarkReport = {
      suiteId,
      generatedAt,
      packId: pack.id,
      packLabel: pack.label,
      runKind,
      profile: `gateway-substrate / ${hardwareContext.platform}-${hardwareContext.arch}`,
      summary: `This benchmark starts the dedicated Q gateway on loopback, validates its live auth and health contract, then drives two structured Q scenarios back through Immaculate arbitration to measure the seam honestly. It proves Q is the only surfaced model name, Q is described as built on Gemma 4, the current training bundle is bound to the info route, concurrency remains bounded, ROUTE/REASON/COMMIT survives the gateway seam, and critical guard denials still block outward dispatch after arbitration. Hardware context: ${formatBenchmarkHardwareContext(hardwareContext)}.`,
      tickIntervalMs,
      totalTicks: gatewaySubstrate.scenarioResults.length,
      plannedDurationMs,
      totalDurationMs: Number((performance.now() - benchmarkStartedAt).toFixed(2)),
      checkpointCount: qGatewayStatus.checkpointCount,
      recoveryMode: qGatewayStatus.recoveryMode,
      recovered: true,
      integrity: {
        valid: true,
        status: "verified",
        coherenceStable: true,
        findingCount: 0,
        findings: [],
        checkedAt: new Date().toISOString(),
        currentCycle: Math.max(1, gatewaySubstrate.scenarioResults.length),
        activePassCount: 1
      },
      hardwareContext,
      series: [structuredFieldSeries, gatewayLatencySeries, arbitrationLatencySeries, guardDeniedSeries],
      assertions,
      progress: {
        stage: "q gateway substrate integration",
        completed: gatewaySubstrate.scenarioResults.map(
          (scenario) =>
            `${scenario.label}: ${scenario.status} / fields=${scenario.structuredFieldCount} / arbitration=${scenario.arbitrationGovernancePressure} / dispatch=${scenario.shouldDispatchActuation}`
        ),
        remaining: []
      },
      attribution: BENCHMARK_ATTRIBUTION,
      comparison: previousReport
        ? compareBenchmarkReports(previousReport, [
            structuredFieldSeries,
            gatewayLatencySeries,
            arbitrationLatencySeries,
            guardDeniedSeries
          ])
        : undefined
    };

    return publishBenchmarkReport(report);
  }

  if (pack.id === "q-mediation-drift") {
    const mediationDrift = await runQMediationDriftBenchmark({
      repoRoot: REPO_ROOT,
      runtimeDir
    });
    const qGatewayStatus = createPersistence(runtimeDir).getStatus();
    const structuredFieldSeries = createSeries(
      "q_mediation_drift_structured_fields",
      "Q Mediation Drift Structured Fields",
      "fields",
      mediationDrift.scenarioResults.map((scenario) => scenario.structuredFieldCount)
    );
    const latencySeries = createSeries(
      "q_mediation_drift_latency_ms",
      "Q Mediation Drift End-To-End Latency",
      "ms",
      mediationDrift.scenarioResults.map((scenario) => scenario.latencyMs)
    );
    const runnerPathLatencySeries = createSeries(
      "q_mediation_drift_runner_path_ms",
      "Q Mediation Drift Runner Path Latency",
      "ms",
      mediationDrift.scenarioResults.map((scenario) => scenario.runnerPathLatencyMs)
    );
    const arbitrationLatencySeries = createSeries(
      "q_mediation_drift_arbitration_ms",
      "Q Mediation Drift Arbitration Latency",
      "ms",
      mediationDrift.scenarioResults.map((scenario) => scenario.arbitrationLatencyMs)
    );
    const schedulingLatencySeries = createSeries(
      "q_mediation_drift_scheduling_ms",
      "Q Mediation Drift Scheduling Latency",
      "ms",
      mediationDrift.scenarioResults.map((scenario) => scenario.schedulingLatencyMs)
    );
    const routingLatencySeries = createSeries(
      "q_mediation_drift_routing_ms",
      "Q Mediation Drift Routing Latency",
      "ms",
      mediationDrift.scenarioResults.map((scenario) => scenario.routingLatencyMs)
    );
    const routeAlignmentSeries = createSeries(
      "q_mediation_drift_route_alignment",
      "Q Mediation Drift Route Alignment",
      "ratio",
      mediationDrift.scenarioResults.map((scenario) => (scenario.routeAligned ? 1 : 0))
    );
    const qOnlySelectionSeries = createSeries(
      "q_mediation_drift_q_only_selection",
      "Q Mediation Drift Q-Only Layer Selection",
      "ratio",
      mediationDrift.scenarioResults
        .filter((scenario) => scenario.expectedRoute === "cognitive")
        .map((scenario) => (scenario.qOnlyLayerSelection ? 1 : 0))
    );
    const localReplicaSeries = createSeries(
      "q_mediation_drift_local_replicas",
      "Q Mediation Drift Local Replica Count",
      "replicas",
      mediationDrift.scenarioResults.map((scenario) => scenario.localReplicaCount ?? 0)
    );
    const verificationQuorumSeries = createSeries(
      "q_mediation_drift_verification_quorum",
      "Q Mediation Drift Verification Quorum",
      "replicas",
      mediationDrift.scenarioResults.map((scenario) => scenario.verificationQuorum ?? 0)
    );
    const driftDetectedSeries = createSeries(
      "q_mediation_drift_drift_detected",
      "Q Mediation Drift Drift Detection",
      "count",
      mediationDrift.scenarioResults.map((scenario) => (scenario.driftDetected ? 1 : 0))
    );
    const infoBody =
      typeof mediationDrift.checks.info.body === "object" && mediationDrift.checks.info.body !== null
        ? (mediationDrift.checks.info.body as {
            release?: { qTrainingBundleId?: string };
          })
        : undefined;
    const modelsBody =
      typeof mediationDrift.checks.models.body === "object" && mediationDrift.checks.models.body !== null
        ? (mediationDrift.checks.models.body as {
            data?: Array<{
              id?: string;
            }>;
          })
        : undefined;
    const qModelEntry = modelsBody?.data?.[0];
    const assertions = [
      createAssertion(
        "q-mediation-drift-health",
        "Q mediation drift lane starts from a live gateway bound to the tracked Q bundle",
        mediationDrift.checks.health.status === 200 &&
          infoBody?.release?.qTrainingBundleId === mediationDrift.qTrainingBundleId &&
          modelsBody?.data?.length === 1 &&
          qModelEntry?.id === "Q",
        "200 health / tracked bundle / one Q model entry",
        `${mediationDrift.checks.health.status} / ${infoBody?.release?.qTrainingBundleId ?? "missing"} / ${qModelEntry?.id ?? "missing"}`,
        "the mediation drift lane is only honest if it starts from the same live Q gateway and tracked bundle the rest of the repo claims"
      ),
      createAssertion(
        "q-mediation-drift-structured",
        "Mixed-pressure mediation scenarios preserve ROUTE/REASON/COMMIT structure",
        mediationDrift.scenarioResults.every(
          (scenario) => scenario.parseSuccess && scenario.structuredFieldCount === 3
        ),
        "all scenarios parse 3 structured fields",
        mediationDrift.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:${scenario.status}/${scenario.structuredFieldCount}/${scenario.failureClass ?? "none"}`
          )
          .join(", "),
        "the mediation lane should fail if malformed Q output can still pass through arbitration and scheduling as if it were governed intent"
      ),
      createAssertion(
        "q-mediation-drift-route-alignment",
        "Immaculate routing follows Q's governed route under mixed pressure without drift",
        mediationDrift.scenarioResults.every((scenario) => scenario.routeAligned) &&
          routeAlignmentSeries.p50 === 1 &&
          driftDetectedSeries.max === 0,
        "all scenarios aligned / p50 1 / max drift 0",
        mediationDrift.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:${scenario.routeSuggestion ?? "missing"}->${scenario.routingMode}/drift=${scenario.driftDetected}`
          )
          .join(", "),
        "the live route/reason/commit answer is only useful if mediation preserves that governed route instead of silently drifting to a different execution posture"
      ),
      createAssertion(
        "q-mediation-drift-q-only-selection",
        "Primary local Q mediation stays inside Q-backed layers instead of widening to non-Q cognition",
        mediationDrift.scenarioResults.every(
          (scenario) =>
            scenario.expectedRoute !== "cognitive" ||
            (scenario.qOnlyLayerSelection &&
              scenario.routingMode === "cognitive-assisted" &&
              scenario.scheduleAdmissionState === "degrade")
        ) && qOnlySelectionSeries.p50 === 1,
        "all local cognition scenarios keep Q-only selection with degraded admission",
        mediationDrift.scenarioResults
          .filter((scenario) => scenario.expectedRoute === "cognitive")
          .map(
            (scenario) =>
              `${scenario.qOnlyLayerSelection}/${scenario.routingMode}/${scenario.scheduleAdmissionState}/${scenario.selectedLayerCount}`
          )
          .join(", "),
        "when the governed local Q lane is healthy, Immaculate should keep mediation inside the Q-backed layer set even if pressure is elevated"
      ),
      createAssertion(
        "q-mediation-drift-parallel-formation",
        "Healthy local Q mediation keeps a bounded local quorum instead of collapsing back to a single lane",
        mediationDrift.scenarioResults
          .filter((scenario) => scenario.expectedRoute === "cognitive")
          .every(
            (scenario) =>
              (scenario.parallelFormationMode === "horizontal-swarm" ||
                scenario.parallelFormationMode === "hybrid-quorum") &&
              (scenario.localReplicaCount ?? 0) >= 2 &&
              (scenario.remoteReplicaCount ?? 0) === 0 &&
              (scenario.verificationQuorum ?? 0) >= 1
          ),
        "local cognition scenarios keep at least 2 local replicas / no remote spill",
        mediationDrift.scenarioResults
          .filter((scenario) => scenario.expectedRoute === "cognitive")
          .map(
            (scenario) =>
              `${scenario.parallelFormationMode ?? "none"}/${scenario.localReplicaCount ?? 0}/${scenario.remoteReplicaCount ?? 0}/quorum=${scenario.verificationQuorum ?? 0}`
          )
          .join(", "),
        "the Ignite-inspired formation only counts as a win if healthy local Q mediation keeps a bounded local quorum instead of serializing or silently spilling remote"
      ),
      createAssertion(
        "q-mediation-drift-affinity-deadline",
        "Healthy local Q mediation stays on a local-first affinity plan with a bounded deadline budget",
        mediationDrift.scenarioResults
          .filter((scenario) => scenario.expectedRoute === "cognitive")
          .every(
            (scenario) =>
              (scenario.affinityMode === "quorum-local" ||
                scenario.affinityMode === "local-spread") &&
              scenario.deadlineClass !== "hard" &&
              typeof scenario.deadlineBudgetMs === "number" &&
              scenario.deadlineBudgetMs > 0
          ),
        "all local cognition scenarios keep local affinity with non-hard deadlines",
        mediationDrift.scenarioResults
          .filter((scenario) => scenario.expectedRoute === "cognitive")
          .map(
            (scenario) =>
              `${scenario.affinityMode ?? "none"}/${scenario.deadlineClass ?? "none"}/${scenario.deadlineBudgetMs ?? 0}ms/${scenario.backpressureAction ?? "none"}`
          )
          .join(", "),
        "the widened Ignite-style runner only counts as a win if local Q keeps local-first affinity and bounded deadlines instead of promoting unnecessary hard-stop pressure"
      ),
      createAssertion(
        "q-mediation-drift-guarded-hold",
        "Critical guarded mediation keeps dispatch closed while the guarded route survives",
        mediationDrift.scenarioResults
          .filter((scenario) => scenario.expectedRoute === "guarded")
          .every(
            (scenario) =>
              scenario.routeSuggestion === "guarded" &&
              scenario.routingMode === "guarded-fallback" &&
              !scenario.shouldDispatchActuation
          ),
        "all guarded scenarios preserve guarded-fallback with dispatch closed",
        mediationDrift.scenarioResults
          .filter((scenario) => scenario.expectedRoute === "guarded")
          .map(
            (scenario) =>
              `${scenario.routeSuggestion ?? "missing"}/${scenario.routingMode}/${scenario.scheduleAdmissionState}/dispatch=${scenario.shouldDispatchActuation}`
          )
          .join(", "),
        "critical mixed pressure should preserve Q's guarded route and keep outward dispatch closed instead of letting later layers reopen action"
      ),
      createAssertion(
        "q-mediation-drift-self-eval",
        "Q and Immaculate both emit explicit self-evaluations for every mediation scenario",
        mediationDrift.scenarioResults.every(
          (scenario) =>
            scenario.qSelfEvaluation.trim().length > 0 &&
            scenario.immaculateSelfEvaluation.trim().length > 0
        ),
        "all scenarios emit q-self and immaculate-self evaluations",
        mediationDrift.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:q=${scenario.qSelfEvaluation.trim().length > 0}/immaculate=${scenario.immaculateSelfEvaluation.trim().length > 0}`
          )
          .join(", "),
        "drift handling is only diagnostic if both Q and Immaculate explain why they held the line or where they drifted"
      )
    ];
    const report: BenchmarkReport = {
      suiteId,
      generatedAt,
      packId: pack.id,
      packLabel: pack.label,
      runKind,
      profile: `mediation-drift / ${hardwareContext.platform}-${hardwareContext.arch}`,
      summary: `This benchmark starts the dedicated Q gateway on loopback, drives live Q route/reason/commit outputs through Immaculate arbitration, scheduling, and routing under mixed pressure, and measures whether the governed route survives without drift. It proves the live gateway is bound to the current tracked Q bundle, structured output remains parseable, the Ignite-inspired local quorum formation keeps healthy primary-governed-local mediation inside Q-backed layers under elevated mixed pressure, guarded-hold mediation stays fail-closed under critical integrity pressure, and both Q and Immaculate emit explicit self-evaluations for every scenario. Hardware context: ${formatBenchmarkHardwareContext(hardwareContext)}.`,
      tickIntervalMs,
      totalTicks: mediationDrift.scenarioResults.length,
      plannedDurationMs,
      totalDurationMs: Number((performance.now() - benchmarkStartedAt).toFixed(2)),
      checkpointCount: qGatewayStatus.checkpointCount,
      recoveryMode: qGatewayStatus.recoveryMode,
      recovered: true,
      integrity: {
        valid: true,
        status: "verified",
        coherenceStable: true,
        findingCount: 0,
        findings: [],
        checkedAt: new Date().toISOString(),
        currentCycle: Math.max(1, mediationDrift.scenarioResults.length),
        activePassCount: 1
      },
      hardwareContext,
      series: [
        structuredFieldSeries,
        latencySeries,
        runnerPathLatencySeries,
        arbitrationLatencySeries,
        schedulingLatencySeries,
        routingLatencySeries,
        routeAlignmentSeries,
        qOnlySelectionSeries,
        localReplicaSeries,
        verificationQuorumSeries,
        driftDetectedSeries
      ],
      assertions,
      progress: {
        stage: "q mediation drift integration",
        completed: mediationDrift.scenarioResults.map(
          (scenario) =>
            `${scenario.label}: route=${scenario.routeSuggestion ?? "missing"} / routing=${scenario.routingMode} / admission=${scenario.scheduleAdmissionState} / formation=${scenario.parallelFormationMode ?? "none"}:${scenario.localReplicaCount ?? 0}local/${scenario.remoteReplicaCount ?? 0}remote/quorum=${scenario.verificationQuorum ?? 0} / drift=${scenario.driftDetected} / q-self=${scenario.qSelfEvaluation} / immaculate-self=${scenario.immaculateSelfEvaluation}`
        ),
        remaining: []
      },
      attribution: BENCHMARK_ATTRIBUTION,
      scenarioResults: mediationDrift.scenarioResults,
      comparison: previousReport
        ? compareBenchmarkReports(previousReport, [
            structuredFieldSeries,
            latencySeries,
            runnerPathLatencySeries,
            arbitrationLatencySeries,
            schedulingLatencySeries,
            routingLatencySeries,
            routeAlignmentSeries,
            qOnlySelectionSeries,
            driftDetectedSeries
          ])
        : undefined
    };

    return publishBenchmarkReport(report);
  }

  if (pack.id === "arobi-audit-integrity") {
    const auditIntegrity = await runArobiAuditIntegrityBenchmark({
      repoRoot: REPO_ROOT,
      runtimeDir
    });
    const harnessStatus = createPersistence(runtimeDir).getStatus();
    const linkedRecordSeries = createSeries(
      "arobi_audit_integrity_linked_records",
      "Arobi Audit Integrity Linked Records",
      "records",
      auditIntegrity.scenarioResults.map((scenario) => scenario.linkedRecordCount)
    );
    const sourceCoverageSeries = createSeries(
      "arobi_audit_integrity_source_coverage",
      "Arobi Audit Integrity Source Coverage",
      "sources",
      auditIntegrity.scenarioResults.map((scenario) => scenario.sourceCoverageCount)
    );
    const selfEvaluationSeries = createSeries(
      "arobi_audit_integrity_self_evaluations",
      "Arobi Audit Integrity Self-Evaluation Coverage",
      "records",
      auditIntegrity.scenarioResults.map((scenario) => scenario.selfEvaluationCount)
    );
    const completenessSeries = createSeries(
      "arobi_audit_integrity_completeness",
      "Arobi Audit Integrity Completeness",
      "ratio",
      auditIntegrity.scenarioResults.map((scenario) => scenario.auditCompletenessScore)
    );
    const totalLatencySeries = createSeries(
      "arobi_audit_integrity_total_latency_ms",
      "Arobi Audit Integrity End-To-End Latency",
      "ms",
      auditIntegrity.scenarioResults.map((scenario) => scenario.totalLatencyMs)
    );
    const assertions = [
      createAssertion(
        "arobi-audit-integrity-health",
        "Live harness health is green before the audit continuity lane starts",
        auditIntegrity.checks.health.status === 200 &&
          typeof auditIntegrity.checks.health.body === "object" &&
          auditIntegrity.checks.health.body !== null &&
          (auditIntegrity.checks.health.body as { status?: string }).status === "ok",
        "200 + status=ok",
        `${auditIntegrity.checks.health.status}`,
        "the benchmark only means anything if it is exercising the real live harness rather than a synthetic-only runner path"
      ),
      createAssertion(
        "arobi-audit-integrity-q-surface",
        "The live harness exposes Q as the single governed public model before the audit pass starts",
        auditIntegrity.checks.qInfo.status === 200 &&
          typeof auditIntegrity.checks.qInfo.body === "object" &&
          auditIntegrity.checks.qInfo.body !== null &&
          (auditIntegrity.checks.qInfo.body as { enabled?: boolean; modelName?: string; foundationModel?: string })
            .enabled === true &&
          (auditIntegrity.checks.qInfo.body as { modelName?: string }).modelName === getQModelName() &&
          (auditIntegrity.checks.qInfo.body as { foundationModel?: string }).foundationModel ===
            getQFoundationModelName(),
        "enabled Q surface on Gemma 4",
        `${auditIntegrity.checks.qInfo.status} / ${String((auditIntegrity.checks.qInfo.body as { modelName?: string } | null)?.modelName ?? "missing")} / ${String((auditIntegrity.checks.qInfo.body as { foundationModel?: string } | null)?.foundationModel ?? "missing")}`,
        "public identity has to agree with the real Q lane before the audit proof is worth publishing"
      ),
      createAssertion(
        "arobi-audit-integrity-path",
        "Every scenario completes both the governed Q call and the governed Immaculate mediation path",
        auditIntegrity.scenarioResults.every((scenario) => scenario.qAccepted && scenario.mediationAccepted),
        "all scenarios qAccepted=true and mediationAccepted=true",
        auditIntegrity.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:q=${scenario.qAccepted}/mediate=${scenario.mediationAccepted}/${scenario.failureClass ?? "none"}`
          )
          .join(", "),
        "the insurer-grade lane has to prove the whole request path, not just one endpoint"
      ),
      createAssertion(
        "arobi-audit-integrity-ledger",
        "Every scenario lands inside a linked Arobi ledger chain with full source coverage",
        auditIntegrity.scenarioResults.every(
          (scenario) =>
            scenario.ledgerLinked &&
            scenario.linkedRecordCount >= 4 &&
            scenario.sourceCoverage.includes("cognitive-execution") &&
            scenario.sourceCoverage.includes("orchestration-arbitration") &&
            scenario.sourceCoverage.includes("orchestration-schedule") &&
            scenario.sourceCoverage.includes("conversation")
        ),
        "linked ledger + cognitive/arbitration/schedule/conversation coverage",
        auditIntegrity.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:${scenario.ledgerLinked}/${scenario.linkedRecordCount}/${scenario.sourceCoverage.join("|") || "none"}`
          )
          .join(", "),
        "auditors need the full request-decision-outcome chain, not a single success flag"
      ),
      createAssertion(
        "arobi-audit-integrity-context",
        "Every scenario captures prompt, evidence, reasoning, and self-evaluation review context",
        auditIntegrity.scenarioResults.every(
          (scenario) =>
            scenario.qApiAuditCaptured &&
            scenario.promptCaptured &&
            scenario.reasoningCaptured &&
            scenario.selfEvaluationCount >= 2 &&
            scenario.evidenceDigestCount >= 2 &&
            scenario.contextFingerprintCount >= 1
        ),
        "audit+prompt+reasoning+self-eval+digest coverage",
        auditIntegrity.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:audit=${scenario.qApiAuditCaptured}/prompt=${scenario.promptCaptured}/reason=${scenario.reasoningCaptured}/self=${scenario.selfEvaluationCount}/evidence=${scenario.evidenceDigestCount}/fingerprint=${scenario.contextFingerprintCount}`
          )
          .join(", "),
        "the point of this lane is proving reviewer-grade context without leaking hidden chain-of-thought"
      ),
      createAssertion(
        "arobi-audit-integrity-route",
        "Every scenario preserves Q route continuity through the latest reviewable record without drift",
        auditIntegrity.scenarioResults.every(
          (scenario) =>
            scenario.routeContinuous &&
            scenario.status === "completed" &&
            scenario.auditCompletenessScore >= 0.95
        ),
        "route continuous + completeness >= 0.95",
        auditIntegrity.scenarioResults
          .map(
            (scenario) =>
              `${scenario.id}:${scenario.routeSuggestion ?? "missing"}=>${scenario.latestRouteSuggestion ?? "missing"}/score=${scenario.auditCompletenessScore.toFixed(2)}/${scenario.failureClass ?? "none"}`
          )
          .join(", "),
        "the published proof should show that the same governed route survives from Q through the Arobi review trail"
      )
    ];
    const report: BenchmarkReport = {
      suiteId,
      generatedAt,
      packId: pack.id,
      packLabel: pack.label,
      runKind,
      profile: `arobi-audit-integrity / ${hardwareContext.platform}-${hardwareContext.arch}`,
      summary: `This benchmark starts the real Immaculate harness on loopback with the governed Q public edge enabled, runs live Q requests and live Immaculate mediation across defense and healthcare review scenarios, and then scores the resulting Arobi ledger and Q API audit artifacts for insurer-grade continuity. It proves the harness is live, Q is the single governed public model built on Gemma 4, the Q path and mediation path both complete, the Arobi ledger stays linked, and each scenario preserves enough request, evidence, reasoning, and self-evaluation context for review without exposing hidden chain-of-thought. Hardware context: ${formatBenchmarkHardwareContext(hardwareContext)}.`,
      tickIntervalMs,
      totalTicks: auditIntegrity.scenarioResults.length,
      plannedDurationMs,
      totalDurationMs: Number((performance.now() - benchmarkStartedAt).toFixed(2)),
      checkpointCount: harnessStatus.checkpointCount,
      recoveryMode: harnessStatus.recoveryMode,
      recovered: true,
      integrity: {
        valid: true,
        status: "verified",
        coherenceStable: true,
        findingCount: 0,
        findings: [],
        checkedAt: new Date().toISOString(),
        currentCycle: Math.max(1, auditIntegrity.scenarioResults.length),
        activePassCount: 1
      },
      hardwareContext,
      series: [
        linkedRecordSeries,
        sourceCoverageSeries,
        selfEvaluationSeries,
        completenessSeries,
        totalLatencySeries
      ],
      assertions,
      progress: {
        stage: "arobi audit continuity",
        completed: auditIntegrity.scenarioResults.map(
          (scenario) =>
            `${scenario.label}: q=${scenario.qAccepted} / mediate=${scenario.mediationAccepted} / sources=${scenario.sourceCoverage.join("|")} / score=${scenario.auditCompletenessScore.toFixed(2)} / route=${scenario.routeSuggestion ?? "missing"}=>${scenario.latestRouteSuggestion ?? "missing"}`
        ),
        remaining: []
      },
      attribution: BENCHMARK_ATTRIBUTION,
      auditScenarioResults: auditIntegrity.scenarioResults,
      comparison: previousReport
        ? compareBenchmarkReports(previousReport, [
            linkedRecordSeries,
            sourceCoverageSeries,
            selfEvaluationSeries,
            completenessSeries,
            totalLatencySeries
          ])
        : undefined
    };

    return publishBenchmarkReport(report);
  }

  const persistence = createPersistence(runtimeDir);
  const engine = createEngine({ bootstrap: false });
  const actuationManager = await createActuationManager(runtimeDir);
  await persistence.persist(engine.getDurableState());

  const reflexSamples: number[] = [];
  const cognitiveSamples: number[] = [];
  const throughputSamples: number[] = [];
  const coherenceSamples: number[] = [];
  const predictionErrorSamples: number[] = [];
  const freeEnergyProxySamples: number[] = [];
  const decodeConfidenceSamples: number[] = [];
  const syncJitterSamples: number[] = [];
  const openNeuroIngestMbSamples: number[] = [];
  const openNeuroIngestEventSamples: number[] = [];
  const dandiIngestMbSamples: number[] = [];
  const dandiIngestEventSamples: number[] = [];
  const immaculateBaselineLatencySamples: number[] = [];
  const temporalBaselineLatencySamples: number[] = [];
  const immaculateBaselineRssSamples: number[] = [];
  const temporalBaselineRssSamples: number[] = [];
  const tier2BandDominanceSamples: number[] = [];
  const tier2RouteBiasSamples: number[] = [];
  const tier2NeuroCoupledRoutingSamples: number[] = [];
  const tier2RouteModes: Array<"reflex-direct" | "cognitive-assisted" | "guarded-fallback" | "operator-override" | "suppressed"> = [];
  const benchmarkInputs = await resolveBenchmarkInputs(pack.id, runtimeDir, {
    bidsFixturePath: BENCHMARK_FIXTURE_BIDS_PATH,
    nwbFixturePath: BENCHMARK_FIXTURE_NWB_PATH
  });
  const bidsScanStartedAt = performance.now();
  const bidsFixture = await scanBidsDataset(benchmarkInputs.bidsPath);
  const bidsScanElapsedMs = performance.now() - bidsScanStartedAt;
  if (benchmarkInputs.externalNeurodata) {
    openNeuroIngestMbSamples.push(
      Number(
        (
          benchmarkInputs.externalNeurodata.openNeuroBytes /
          Math.max(bidsScanElapsedMs / 1000, 0.001) /
          1024 /
          1024
        ).toFixed(4)
      )
    );
    openNeuroIngestEventSamples.push(
      Number(
        (
          benchmarkInputs.externalNeurodata.openNeuroFiles /
          Math.max(bidsScanElapsedMs / 1000, 0.001)
        ).toFixed(4)
      )
    );
  }
  engine.registerDataset(bidsFixture.summary);
  const nwbScanStartedAt = performance.now();
  const nwbFixture = await scanNwbFile(benchmarkInputs.nwbPath);
  const nwbScanElapsedMs = performance.now() - nwbScanStartedAt;
  if (benchmarkInputs.externalNeurodata) {
    dandiIngestMbSamples.push(
      Number(
        (
          benchmarkInputs.externalNeurodata.dandiBytes /
          Math.max(nwbScanElapsedMs / 1000, 0.001) /
          1024 /
          1024
        ).toFixed(4)
      )
    );
    dandiIngestEventSamples.push(
      Number(
        (
          Math.max(nwbFixture.summary.streamCount, 1) /
          Math.max(nwbScanElapsedMs / 1000, 0.001)
        ).toFixed(4)
      )
    );
  }
  engine.registerNeuroSession(nwbFixture.summary);
  const replayId = `replay-${suiteId}`;
  const replayFrames = await buildNwbReplayFrames(benchmarkInputs.nwbPath, {
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
  const throughputLoadSamples =
    liveFramesPerTick > 0
      ? createTier2BandDominantSamples({
          frequencyHz: 18,
          sampleCount: 128,
          channelCount: 8,
          rateHz: nwbFixture.summary.primaryRateHz ?? 1000,
          amplitude: 0.32,
          harmonicScale: 0.06,
          noiseScale: 0.006
        })
      : [];
  let throughputIngressState: NeuroReplayState | null =
    liveFramesPerTick > 0
      ? {
          ...liveIngressResult.ingress,
          id: `live-benchmark-throughput-${suiteId}`,
          name: "Benchmark throughput ingress",
          completedWindows: 0,
          totalWindows: 0,
          decodeReadyRatio: 0,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastWindowId: undefined
        }
      : null;
  if (throughputIngressState) {
    engine.upsertNeuroReplay(throughputIngressState);
  }
  const benchmarkLayer: IntelligenceLayer = {
    id: "benchmark-layer",
    name: "Benchmark Reasoner Layer",
    backend: "ollama",
    model: "Q",
    role: "reasoner",
    status: "ready",
    endpoint: DEFAULT_Q_RUNTIME_ENDPOINT,
    registeredAt: new Date().toISOString()
  };
  const benchmarkMidLayer: IntelligenceLayer = {
    id: "benchmark-layer-mid",
    name: "Benchmark Mid Layer",
    backend: "ollama",
    model: "Q",
    role: "mid",
    status: "ready",
    endpoint: DEFAULT_Q_RUNTIME_ENDPOINT,
    registeredAt: new Date().toISOString()
  };
  const benchmarkGuardLayer: IntelligenceLayer = {
    id: "benchmark-layer-guard",
    name: "Benchmark Guard Layer",
    backend: "ollama",
    model: "Q",
    role: "guard",
    status: "ready",
    endpoint: DEFAULT_Q_RUNTIME_ENDPOINT,
    registeredAt: new Date().toISOString()
  };
  const benchmarkSoulLayer: IntelligenceLayer = {
    id: "benchmark-layer-soul",
    name: "Benchmark Soul Layer",
    backend: "ollama",
    model: "Q",
    role: "soul",
    status: "ready",
    endpoint: DEFAULT_Q_RUNTIME_ENDPOINT,
    registeredAt: new Date().toISOString()
  };
  engine.registerIntelligenceLayer(benchmarkMidLayer);
  engine.registerIntelligenceLayer(benchmarkLayer);
  engine.registerIntelligenceLayer(benchmarkGuardLayer);
  engine.registerIntelligenceLayer(benchmarkSoulLayer);
  const syntheticResponse =
    "ROUTE: cognitive. REASON: validate projection rules before the next orchestration pass consumes the trace. COMMIT: publish the trace.";
  const parsedSyntheticExecution = parseStructuredCognitiveResponse(syntheticResponse);
  const syntheticExecution: CognitiveExecution = {
    id: `cog-${suiteId}-synthetic`,
    layerId: benchmarkLayer.id,
    model: "Q",
    objective: "Benchmark synthetic cognition trace for consent projection validation.",
    status: "completed",
    latencyMs: 42,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    promptDigest: "benchmark-prompt-digest",
    responsePreview: syntheticResponse,
    routeSuggestion: parsedSyntheticExecution.routeSuggestion,
    reasonSummary: parsedSyntheticExecution.reasonSummary,
    commitStatement: parsedSyntheticExecution.commitStatement
  };
  engine.commitCognitiveExecution(syntheticExecution);
  const buildRemoteOutcomeExecution = (options: {
    id: string;
    workerId: string;
    peerId: string;
    nodeId: string;
    locality: string;
    latencyMs: number;
    status: "completed" | "failed";
    completedAtOffsetMs: number;
    peerLatencyMs: number;
  }): CognitiveExecution => {
    const completedAt = new Date(
      Date.parse(syntheticExecution.completedAt) + options.completedAtOffsetMs
    ).toISOString();
    return {
      id: options.id,
      layerId: benchmarkLayer.id,
      model: benchmarkLayer.model,
      objective: syntheticExecution.objective,
      status: options.status,
      latencyMs: options.latencyMs,
      startedAt: new Date(Date.parse(completedAt) - options.latencyMs).toISOString(),
      completedAt,
      promptDigest: `digest-${options.id}`,
      responsePreview:
        options.status === "completed"
          ? syntheticResponse
          : `Cognitive execution failed: remote peer ${options.peerId} timeout`,
      routeSuggestion: parsedSyntheticExecution.routeSuggestion,
      reasonSummary: parsedSyntheticExecution.reasonSummary,
      commitStatement: parsedSyntheticExecution.commitStatement,
      assignedWorkerId: options.workerId,
      assignedWorkerProfile: "remote",
      assignedWorkerNodeId: options.nodeId,
      assignedWorkerLocality: options.locality,
      assignedWorkerIdentityVerified: true,
      assignedWorkerObservedLatencyMs: options.peerLatencyMs,
      assignedWorkerPeerId: options.peerId,
      assignedWorkerPeerStatus: "healthy",
      assignedWorkerPeerLeaseStatus: "healthy",
      assignedWorkerPeerObservedLatencyMs: options.peerLatencyMs,
      assignmentReason: "benchmark remote execution outcome",
      assignmentScore: 1,
      executionEndpoint: DEFAULT_Q_RUNTIME_ENDPOINT,
      executionTopology: "parallel"
    };
  };
  for (let index = 0; index < 3; index += 1) {
    parseStructuredCognitiveResponse(syntheticExecution.responsePreview);
  }
  const parsedCognitiveLoopLatencySamples: number[] = [];
  let parsedCognitiveLoop = parseStructuredCognitiveResponse(syntheticExecution.responsePreview);
  for (let index = 0; index < 12; index += 1) {
    const parsedCognitiveLoopStart = performance.now();
    parsedCognitiveLoop = parseStructuredCognitiveResponse(syntheticExecution.responsePreview);
    parsedCognitiveLoopLatencySamples.push(
      Number((performance.now() - parsedCognitiveLoopStart).toFixed(4))
    );
  }
  const parsedCognitiveLoopStructureRatio = Number(
    (parsedCognitiveLoop.fieldCount / 3).toFixed(2)
  );
  const workerRegistry = createIntelligenceWorkerRegistry(path.join(runtimeDir, "worker-plane"));
  const workerRegistryNow = new Date().toISOString();
  const workerRegistryLeasePast = new Date(
    Date.parse(workerRegistryNow) - 30_000
  ).toISOString();
  const federationBenchmarkSecret = "benchmark-federation-shared-secret";
  const workerRemotePrimary = await workerRegistry.registerWorker({
    workerId: `worker-${suiteId}-remote-primary`,
    workerLabel: "Benchmark Remote Primary",
    hostLabel: "worker-host-remote-primary",
    executionProfile: "remote",
    executionEndpoint: DEFAULT_Q_RUNTIME_ENDPOINT,
    registeredAt: workerRegistryNow,
    heartbeatAt: workerRegistryNow,
    leaseDurationMs: 45_000,
    leaseExpiresAt: new Date(Date.parse(workerRegistryNow) + 45_000).toISOString(),
    watch: true,
    allowHostRisk: true,
    supportedBaseModels: [benchmarkLayer.model],
    preferredLayerIds: [benchmarkLayer.id],
    identityVerified: true,
    observedLatencyMs: 12,
    costPerHourUsd: 0.48,
    deviceAffinityTags: ["swarm", "ollama", "gpu"]
  });
  await workerRegistry.registerWorker({
    workerId: `worker-${suiteId}-remote-expired`,
    workerLabel: "Benchmark Remote Expired",
    hostLabel: "worker-host-remote-expired",
    executionProfile: "remote",
    executionEndpoint: "http://127.0.0.1:11435",
    registeredAt: workerRegistryNow,
    heartbeatAt: workerRegistryNow,
    leaseDurationMs: 45_000,
    leaseExpiresAt: workerRegistryLeasePast,
    watch: false,
    allowHostRisk: false,
    supportedBaseModels: [benchmarkLayer.model],
    preferredLayerIds: [benchmarkLayer.id],
    identityVerified: true,
    observedLatencyMs: 28,
    costPerHourUsd: 0.24,
    deviceAffinityTags: ["swarm", "cpu"]
  });
  const workerLocalFallback = await workerRegistry.registerWorker({
    workerId: `worker-${suiteId}-local-fallback`,
    workerLabel: "Benchmark Local Fallback",
    hostLabel: "worker-host-local-fallback",
    executionProfile: "local",
    registeredAt: workerRegistryNow,
    heartbeatAt: workerRegistryNow,
    leaseDurationMs: 45_000,
    leaseExpiresAt: new Date(Date.parse(workerRegistryNow) + 45_000).toISOString(),
    watch: false,
    allowHostRisk: false,
    supportedBaseModels: ["*"],
    preferredLayerIds: []
  });
  const workerAssignmentRequest = {
    requestedExecutionDecision: "remote_required" as const,
    baseModel: benchmarkLayer.model,
    preferredLayerIds: [benchmarkLayer.id],
    recommendedLayerId: benchmarkLayer.id,
    target: "planner-swarm"
  };
  const workerAssignmentFirst = await workerRegistry.assignWorker(workerAssignmentRequest);
  const workerAssignmentSecond = await workerRegistry.assignWorker(workerAssignmentRequest);
  const workerRegistrySnapshot = await workerRegistry.listWorkers(workerRegistryNow);
  const workerLocalityNodeRegistry = createNodeRegistry(path.join(runtimeDir, "worker-plane-locality-nodes"), {
    localNodeId: `node-${suiteId}-local`,
    localNodeLabel: "Benchmark Local Node",
    localHostLabel: "bench-node-local",
    localLocality: "rack-a",
    localCapabilities: ["control-plane", "worker-plane"]
  });
  const workerLocalityLocalNode = await workerLocalityNodeRegistry.ensureLocalNode(workerRegistryNow);
  const signedNearNode = signFederationPayload(
    {
      nodeId: `node-${suiteId}-remote-near`,
      nodeLabel: "Benchmark Remote Near Node",
      hostLabel: "bench-node-remote-near",
      locality: workerLocalityLocalNode.locality,
      controlPlaneUrl: "http://127.0.0.1:9788",
      registeredAt: workerRegistryNow,
      heartbeatAt: workerRegistryNow,
      leaseDurationMs: 45_000,
      capabilities: ["worker-plane"],
      isLocal: false,
      costPerHourUsd: 0.32,
      deviceAffinityTags: ["gpu-rack-a", "swarm"]
    },
    {
      issuerNodeId: `node-${suiteId}-remote-near`,
      secret: federationBenchmarkSecret,
      issuedAt: workerRegistryNow
    }
  );
  const signedFarNode = signFederationPayload(
    {
      nodeId: `node-${suiteId}-remote-far`,
      nodeLabel: "Benchmark Remote Far Node",
      hostLabel: "bench-node-remote-far",
      locality: "rack-b",
      controlPlaneUrl: "http://127.0.0.1:9789",
      registeredAt: workerRegistryNow,
      heartbeatAt: workerRegistryNow,
      leaseDurationMs: 45_000,
      capabilities: ["worker-plane"],
      isLocal: false,
      costPerHourUsd: 0.18,
      deviceAffinityTags: ["cpu-rack-b", "swarm"]
    },
    {
      issuerNodeId: `node-${suiteId}-remote-far`,
      secret: federationBenchmarkSecret,
      issuedAt: workerRegistryNow
    }
  );
  const signedNearNodeVerification = verifyFederationEnvelope(signedNearNode, {
    secret: federationBenchmarkSecret,
    expectedIssuerNodeId: signedNearNode.payload.nodeId
  });
  const workerLocalityNearNode = await workerLocalityNodeRegistry.registerNode({
    ...signedNearNode.payload,
    identityAlgorithm: signedNearNode.algorithm,
    identityKeyId: signedNearNode.keyId,
    identityIssuerNodeId: signedNearNode.issuerNodeId,
    identityIssuedAt: signedNearNode.issuedAt,
    identitySignature: signedNearNode.signature,
    identityVerified: signedNearNodeVerification.verified,
    observedLatencyMs: 8
  });
  const signedFarNodeVerification = verifyFederationEnvelope(signedFarNode, {
    secret: federationBenchmarkSecret,
    expectedIssuerNodeId: signedFarNode.payload.nodeId
  });
  const workerLocalityFarNode = await workerLocalityNodeRegistry.registerNode({
    ...signedFarNode.payload,
    identityAlgorithm: signedFarNode.algorithm,
    identityKeyId: signedFarNode.keyId,
    identityIssuerNodeId: signedFarNode.issuerNodeId,
    identityIssuedAt: signedFarNode.issuedAt,
    identitySignature: signedFarNode.signature,
    identityVerified: signedFarNodeVerification.verified,
    observedLatencyMs: 42
  });
  const workerLocalityNodeViews = (await workerLocalityNodeRegistry.listNodes(workerRegistryNow)).nodes;
  const workerLocalityRegistry = createIntelligenceWorkerRegistry(
    path.join(runtimeDir, "worker-plane-locality")
  );
  const localityNearWorker = await workerLocalityRegistry.registerWorker({
    workerId: `worker-${suiteId}-remote-near`,
    workerLabel: "Benchmark Remote Near",
    hostLabel: workerLocalityNearNode.hostLabel ?? "bench-node-remote-near",
    nodeId: workerLocalityNearNode.nodeId,
    locality: workerLocalityNearNode.locality,
    executionProfile: "remote",
    executionEndpoint: "http://127.0.0.1:21434",
    registeredAt: workerRegistryNow,
    heartbeatAt: workerRegistryNow,
    leaseDurationMs: 45_000,
    leaseExpiresAt: new Date(Date.parse(workerRegistryNow) + 45_000).toISOString(),
    watch: true,
    allowHostRisk: true,
    supportedBaseModels: [benchmarkLayer.model],
    preferredLayerIds: [benchmarkLayer.id],
    identityVerified: true,
    observedLatencyMs: 8,
    costPerHourUsd: 0.32,
    deviceAffinityTags: ["swarm", "gpu-rack-a", "bci"]
  }, workerLocalityNodeViews);
  await workerLocalityRegistry.registerWorker({
    workerId: `worker-${suiteId}-remote-near-unverified`,
    workerLabel: "Benchmark Remote Near Unverified",
    hostLabel: workerLocalityNearNode.hostLabel ?? "bench-node-remote-near",
    nodeId: workerLocalityNearNode.nodeId,
    locality: workerLocalityNearNode.locality,
    executionProfile: "remote",
    executionEndpoint: "http://127.0.0.1:21436",
    registeredAt: workerRegistryNow,
    heartbeatAt: workerRegistryNow,
    leaseDurationMs: 45_000,
    leaseExpiresAt: new Date(Date.parse(workerRegistryNow) + 45_000).toISOString(),
    watch: false,
    allowHostRisk: true,
    supportedBaseModels: [benchmarkLayer.model],
    preferredLayerIds: [benchmarkLayer.id],
    identityVerified: false,
    observedLatencyMs: 4,
    costPerHourUsd: 0.12,
    deviceAffinityTags: ["swarm", "gpu-rack-a", "bci"]
  }, workerLocalityNodeViews);
  await workerLocalityRegistry.registerWorker({
    workerId: `worker-${suiteId}-remote-far`,
    workerLabel: "Benchmark Remote Far",
    hostLabel: workerLocalityFarNode.hostLabel ?? "bench-node-remote-far",
    nodeId: workerLocalityFarNode.nodeId,
    locality: workerLocalityFarNode.locality,
    executionProfile: "remote",
    executionEndpoint: "http://127.0.0.1:21435",
    registeredAt: workerRegistryNow,
    heartbeatAt: workerRegistryNow,
    leaseDurationMs: 45_000,
    leaseExpiresAt: new Date(Date.parse(workerRegistryNow) + 45_000).toISOString(),
    watch: true,
    allowHostRisk: true,
    supportedBaseModels: [benchmarkLayer.model],
    preferredLayerIds: [benchmarkLayer.id],
    identityVerified: true,
    observedLatencyMs: 42,
    costPerHourUsd: 0.18,
    deviceAffinityTags: ["swarm", "cpu-rack-b"]
  }, workerLocalityNodeViews);
  const federationPeerRegistry = createFederationPeerRegistry(
    path.join(runtimeDir, "federation-peer-plane")
  );
  const federationRegisteredNearPeer = await federationPeerRegistry.registerPeer({
    controlPlaneUrl: "http://127.0.0.1:9788",
    expectedNodeId: workerLocalityNearNode.nodeId,
    refreshIntervalMs: 10_000,
    leaseRefreshIntervalMs: 4_000,
    trustWindowMs: 15_000,
    maxObservedLatencyMs: 50,
    now: workerRegistryNow
  });
  const federationRegisteredFarPeer = await federationPeerRegistry.registerPeer({
    controlPlaneUrl: "http://127.0.0.1:9789",
    expectedNodeId: workerLocalityFarNode.nodeId,
    refreshIntervalMs: 10_000,
    leaseRefreshIntervalMs: 4_000,
    trustWindowMs: 15_000,
    maxObservedLatencyMs: 50,
    now: workerRegistryNow
  });
  const federationPeerSuccessFirst = await federationPeerRegistry.markRefreshSuccess({
    peerId: federationRegisteredNearPeer.peerId,
    expectedNodeId: workerLocalityNearNode.nodeId,
    observedLatencyMs: 48,
    now: workerRegistryNow
  });
  const federationRenewedAt = new Date(Date.parse(workerRegistryNow) + 10_000).toISOString();
  await federationPeerRegistry.markRefreshSuccess({
    peerId: federationRegisteredNearPeer.peerId,
    expectedNodeId: workerLocalityNearNode.nodeId,
    observedLatencyMs: 18,
    now: federationRenewedAt
  });
  await federationPeerRegistry.markRefreshSuccess({
    peerId: federationRegisteredFarPeer.peerId,
    expectedNodeId: workerLocalityFarNode.nodeId,
    observedLatencyMs: 34,
    now: federationRenewedAt
  });
  const federationPeerSuccessSecond = await federationPeerRegistry.markLeaseSuccess({
    peerId: federationRegisteredNearPeer.peerId,
    observedLatencyMs: 18,
    now: federationRenewedAt
  });
  const federationPeerFarHealthy = await federationPeerRegistry.markLeaseSuccess({
    peerId: federationRegisteredFarPeer.peerId,
    observedLatencyMs: 34,
    now: federationRenewedAt
  });
  const federationPeerViewsInitial = await federationPeerRegistry.listPeers(federationRenewedAt);
  const clearRemoteExecutionHistory = [
    buildRemoteOutcomeExecution({
      id: `cog-${suiteId}-remote-near-success-1`,
      workerId: localityNearWorker.workerId,
      peerId: federationRegisteredNearPeer.peerId,
      nodeId: workerLocalityNearNode.nodeId,
      locality: workerLocalityNearNode.locality,
      latencyMs: 980,
      status: "completed",
      completedAtOffsetMs: 1_000,
      peerLatencyMs: 18
    }),
    buildRemoteOutcomeExecution({
      id: `cog-${suiteId}-remote-near-success-2`,
      workerId: localityNearWorker.workerId,
      peerId: federationRegisteredNearPeer.peerId,
      nodeId: workerLocalityNearNode.nodeId,
      locality: workerLocalityNearNode.locality,
      latencyMs: 1025,
      status: "completed",
      completedAtOffsetMs: 2_000,
      peerLatencyMs: 18
    }),
    buildRemoteOutcomeExecution({
      id: `cog-${suiteId}-remote-far-success-1`,
      workerId: `worker-${suiteId}-remote-far`,
      peerId: federationRegisteredFarPeer.peerId,
      nodeId: workerLocalityFarNode.nodeId,
      locality: workerLocalityFarNode.locality,
      latencyMs: 1180,
      status: "completed",
      completedAtOffsetMs: 3_000,
      peerLatencyMs: 34
    })
  ];
  const clearExecutionOutcomes = summarizeRemoteExecutionOutcomes(clearRemoteExecutionHistory);
  const localityWorkerViewsFederationClear = await workerLocalityRegistry.listWorkers(
    federationRenewedAt,
    workerLocalityNodeViews,
    federationPeerViewsInitial,
    [...clearExecutionOutcomes.workerSummaries.values()]
  );
  const federatedPressureClear = buildFederatedExecutionPressure({
    peerViews: federationPeerViewsInitial,
    workers: localityWorkerViewsFederationClear,
    preferredLayerIds: [benchmarkLayer.id],
    preferredDeviceAffinityTags: ["swarm"],
    baseModel: benchmarkLayer.model,
    target: "planner-swarm"
  });
  const federationPeerAfterRenewal = await federationPeerRegistry.getPeer(
    federationRegisteredNearPeer.peerId,
    federationRenewedAt
  );
  const localityAssignment = await workerLocalityRegistry.assignWorker({
    requestedExecutionDecision: "remote_required",
    baseModel: benchmarkLayer.model,
    preferredLayerIds: [benchmarkLayer.id],
    recommendedLayerId: benchmarkLayer.id,
    target: "planner-swarm",
    preferredLocality: workerLocalityLocalNode.locality,
    preferredDeviceAffinityTags: ["bci", "swarm"],
    maxObservedLatencyMs: 50,
    maxCostPerHourUsd: 0.50,
    nodeViews: workerLocalityNodeViews,
    peerViews: federationPeerViewsInitial,
    executionOutcomeSummaries: [...clearExecutionOutcomes.workerSummaries.values()]
  });
  const localityRegistryAfterFirstAssignment = await workerLocalityRegistry.listWorkers(
    federationRenewedAt,
    workerLocalityNodeViews,
    federationPeerViewsInitial,
    [...clearExecutionOutcomes.workerSummaries.values()]
  );
  if (localityAssignment.assignment?.workerId && localityAssignment.assignment.leaseToken) {
    await workerLocalityRegistry.releaseWorker({
      workerId: localityAssignment.assignment.workerId,
      leaseToken: localityAssignment.assignment.leaseToken
    });
  }
  const federationLatencyFlippedAt = new Date(
    Date.parse(federationRenewedAt) + 8_000
  ).toISOString();
  const federationPeerNearDegraded = await federationPeerRegistry.markLeaseSuccess({
    peerId: federationRegisteredNearPeer.peerId,
    observedLatencyMs: 72,
    now: federationLatencyFlippedAt
  });
  const federationPeerFarInverted = await federationPeerRegistry.markLeaseSuccess({
    peerId: federationRegisteredFarPeer.peerId,
    observedLatencyMs: 6,
    now: federationLatencyFlippedAt
  });
  const federationPeerViewsFlipped = await federationPeerRegistry.listPeers(
    federationLatencyFlippedAt
  );
  const localityLatencyInversionAssignment = await workerLocalityRegistry.assignWorker({
    requestedExecutionDecision: "remote_required",
    baseModel: benchmarkLayer.model,
    preferredLayerIds: [benchmarkLayer.id],
    recommendedLayerId: benchmarkLayer.id,
    target: "planner-swarm",
    preferredDeviceAffinityTags: ["swarm"],
    maxObservedLatencyMs: 80,
    maxCostPerHourUsd: 0.50,
    nodeViews: workerLocalityNodeViews,
    peerViews: federationPeerViewsFlipped,
    executionOutcomeSummaries: [...clearExecutionOutcomes.workerSummaries.values()]
  });
  const localityRegistrySnapshot = await workerLocalityRegistry.listWorkers(
    federationLatencyFlippedAt,
    workerLocalityNodeViews,
    federationPeerViewsFlipped,
    [...clearExecutionOutcomes.workerSummaries.values()]
  );
  if (
    localityLatencyInversionAssignment.assignment?.workerId &&
    localityLatencyInversionAssignment.assignment.leaseToken
  ) {
    await workerLocalityRegistry.releaseWorker({
      workerId: localityLatencyInversionAssignment.assignment.workerId,
      leaseToken: localityLatencyInversionAssignment.assignment.leaseToken
    });
  }
  const federationPeerAfterInversion = await federationPeerRegistry.getPeer(
    federationRegisteredFarPeer.peerId,
    federationLatencyFlippedAt
  );
  const federationOutcomeFailureAt = new Date(
    Date.parse(federationLatencyFlippedAt) + 2_000
  ).toISOString();
  const federationPeerAdaptiveFailure = await federationPeerRegistry.recordExecutionOutcome({
    peerId: federationRegisteredFarPeer.peerId,
    status: "failed",
    latencyMs: 3_520,
    error: "benchmark_remote_timeout",
    now: federationOutcomeFailureAt
  });
  const federationPeerViewsAdaptive = await federationPeerRegistry.listPeers(
    federationOutcomeFailureAt
  );
  const federationOutcomeCriticalAt = new Date(
    Date.parse(federationOutcomeFailureAt) + 1_000
  ).toISOString();
  await federationPeerRegistry.recordExecutionOutcome({
    peerId: federationRegisteredFarPeer.peerId,
    status: "failed",
    latencyMs: 3_880,
    error: "benchmark_remote_timeout_repeat",
    now: federationOutcomeCriticalAt
  });
  const federationPeerViewsCritical = await federationPeerRegistry.listPeers(
    federationOutcomeCriticalAt
  );
  const degradedRemoteExecutionHistory = clearRemoteExecutionHistory.concat([
    buildRemoteOutcomeExecution({
      id: `cog-${suiteId}-remote-far-failed-1`,
      workerId: `worker-${suiteId}-remote-far`,
      peerId: federationRegisteredFarPeer.peerId,
      nodeId: workerLocalityFarNode.nodeId,
      locality: workerLocalityFarNode.locality,
      latencyMs: 3_520,
      status: "failed",
      completedAtOffsetMs: 4_000,
      peerLatencyMs: 6
    }),
    buildRemoteOutcomeExecution({
      id: `cog-${suiteId}-remote-far-failed-2`,
      workerId: `worker-${suiteId}-remote-far`,
      peerId: federationRegisteredFarPeer.peerId,
      nodeId: workerLocalityFarNode.nodeId,
      locality: workerLocalityFarNode.locality,
      latencyMs: 3_880,
      status: "failed",
      completedAtOffsetMs: 5_000,
      peerLatencyMs: 6
    }),
    buildRemoteOutcomeExecution({
      id: `cog-${suiteId}-remote-near-success-3`,
      workerId: localityNearWorker.workerId,
      peerId: federationRegisteredNearPeer.peerId,
      nodeId: workerLocalityNearNode.nodeId,
      locality: workerLocalityNearNode.locality,
      latencyMs: 960,
      status: "completed",
      completedAtOffsetMs: 6_000,
      peerLatencyMs: 72
    })
  ]);
  const degradedExecutionOutcomes = summarizeRemoteExecutionOutcomes(
    degradedRemoteExecutionHistory
  );
  const localityWorkerViewsFederationElevated = await workerLocalityRegistry.listWorkers(
    federationOutcomeFailureAt,
    workerLocalityNodeViews,
    federationPeerViewsAdaptive,
    [...clearExecutionOutcomes.workerSummaries.values()]
  );
  const federatedPressureElevated = buildFederatedExecutionPressure({
    peerViews: federationPeerViewsAdaptive,
    workers: localityWorkerViewsFederationElevated,
    preferredLayerIds: [benchmarkLayer.id],
    preferredDeviceAffinityTags: ["swarm"],
    baseModel: benchmarkLayer.model,
    target: "planner-swarm"
  });
  const localityWorkerViewsFederationCritical = await workerLocalityRegistry.listWorkers(
    federationOutcomeCriticalAt,
    workerLocalityNodeViews,
    federationPeerViewsCritical,
    [...degradedExecutionOutcomes.workerSummaries.values()]
  );
  const federatedPressureCritical = buildFederatedExecutionPressure({
    peerViews: federationPeerViewsCritical,
    workers: localityWorkerViewsFederationCritical,
    preferredLayerIds: [benchmarkLayer.id],
    preferredDeviceAffinityTags: ["swarm"],
    baseModel: benchmarkLayer.model,
    target: "planner-swarm"
  });
  const outcomePressureAssignment = await workerLocalityRegistry.assignWorker({
    requestedExecutionDecision: "remote_required",
    baseModel: benchmarkLayer.model,
    preferredLayerIds: [benchmarkLayer.id],
    recommendedLayerId: benchmarkLayer.id,
    target: "planner-swarm",
    preferredDeviceAffinityTags: ["swarm"],
    maxObservedLatencyMs: 80,
    maxCostPerHourUsd: 0.50,
    nodeViews: workerLocalityNodeViews,
    peerViews: federationPeerViewsCritical,
    executionOutcomeSummaries: [...degradedExecutionOutcomes.workerSummaries.values()]
  });
  if (outcomePressureAssignment.assignment?.workerId && outcomePressureAssignment.assignment.leaseToken) {
    await workerLocalityRegistry.releaseWorker({
      workerId: outcomePressureAssignment.assignment.workerId,
      leaseToken: outcomePressureAssignment.assignment.leaseToken
    });
  }
  const federationOutcomeRecoveryAt = new Date(
    Date.parse(federationOutcomeCriticalAt) + 2_000
  ).toISOString();
  await federationPeerRegistry.markLeaseSuccess({
    peerId: federationRegisteredFarPeer.peerId,
    observedLatencyMs: 7,
    now: federationOutcomeRecoveryAt
  });
  const federationOutcomeRecoveryAgainAt = new Date(
    Date.parse(federationOutcomeRecoveryAt) + 2_000
  ).toISOString();
  await federationPeerRegistry.markLeaseSuccess({
    peerId: federationRegisteredFarPeer.peerId,
    observedLatencyMs: 7,
    now: federationOutcomeRecoveryAgainAt
  });
  const federationOutcomeRecoverySettledAt = new Date(
    Date.parse(federationOutcomeRecoveryAgainAt) + 2_000
  ).toISOString();
  const federationPeerAdaptiveRecovery = await federationPeerRegistry.markLeaseSuccess({
    peerId: federationRegisteredFarPeer.peerId,
    observedLatencyMs: 7,
    now: federationOutcomeRecoverySettledAt
  });
  const federationFaultedAt = new Date(
    Date.parse(federationLatencyFlippedAt) + 16_000
  ).toISOString();
  const federationPeerAfterFailure = await federationPeerRegistry.markLeaseFailure({
    peerId: federationRegisteredNearPeer.peerId,
    error: "lease_timeout",
    now: federationFaultedAt
  });
  const federationRepairPendingAt = new Date(
    Date.parse(federationOutcomeCriticalAt) + 1_500
  ).toISOString();
  const federationPeerRepairPending = await federationPeerRegistry.scheduleRepair({
    peerId: federationRegisteredNearPeer.peerId,
    cause: "benchmark_manual_repair",
    source: "benchmark-runtime",
    now: federationRepairPendingAt
  });
  const federationPeerViewsRepairPending = await federationPeerRegistry.listPeers(
    federationRepairPendingAt
  );
  const localityWorkerViewsRepairPending = await workerLocalityRegistry.listWorkers(
    federationRepairPendingAt,
    workerLocalityNodeViews,
    federationPeerViewsRepairPending,
    [...degradedExecutionOutcomes.workerSummaries.values()]
  );
  const repairPendingAssignment = await workerLocalityRegistry.assignWorker({
    requestedExecutionDecision: "remote_required",
    baseModel: benchmarkLayer.model,
    preferredLayerIds: [benchmarkLayer.id],
    recommendedLayerId: benchmarkLayer.id,
    target: "planner-swarm",
    preferredDeviceAffinityTags: ["swarm"],
    maxObservedLatencyMs: 80,
    maxCostPerHourUsd: 0.50,
    nodeViews: workerLocalityNodeViews,
    peerViews: federationPeerViewsRepairPending,
    executionOutcomeSummaries: [...degradedExecutionOutcomes.workerSummaries.values()]
  });
  if (
    repairPendingAssignment.assignment?.workerId &&
    repairPendingAssignment.assignment.leaseToken
  ) {
    await workerLocalityRegistry.releaseWorker({
      workerId: repairPendingAssignment.assignment.workerId,
      leaseToken: repairPendingAssignment.assignment.leaseToken
    });
  }
  const federationRepairFailClosedAt = new Date(
    Date.parse(federationRepairPendingAt) + 250
  ).toISOString();
  const federationPeerFarRepairPending = await federationPeerRegistry.scheduleRepair({
    peerId: federationRegisteredFarPeer.peerId,
    cause: "benchmark_manual_repair_far",
    source: "benchmark-runtime",
    now: federationRepairFailClosedAt
  });
  const federationPeerViewsRepairFailClosed = await federationPeerRegistry.listPeers(
    federationRepairFailClosedAt
  );
  const localityWorkerViewsRepairFailClosed = await workerLocalityRegistry.listWorkers(
    federationRepairFailClosedAt,
    workerLocalityNodeViews,
    federationPeerViewsRepairFailClosed,
    [...degradedExecutionOutcomes.workerSummaries.values()]
  );
  const repairFailClosedAssignment = await workerLocalityRegistry.assignWorker({
    requestedExecutionDecision: "remote_required",
    baseModel: benchmarkLayer.model,
    preferredLayerIds: [benchmarkLayer.id],
    recommendedLayerId: benchmarkLayer.id,
    target: "planner-swarm",
    preferredDeviceAffinityTags: ["swarm"],
    maxObservedLatencyMs: 80,
    maxCostPerHourUsd: 0.50,
    nodeViews: workerLocalityNodeViews,
    peerViews: federationPeerViewsRepairFailClosed,
    executionOutcomeSummaries: [...degradedExecutionOutcomes.workerSummaries.values()]
  });
  const federationRepairBeginAt = new Date(
    Date.parse(federationRepairPendingAt) + 500
  ).toISOString();
  const federationPeerRepairing = await federationPeerRegistry.beginRepair({
    peerId: federationRegisteredNearPeer.peerId,
    cause: "benchmark_manual_repair",
    source: "benchmark-runtime",
    now: federationRepairBeginAt
  });
  const federationPeerViewsRepairing = await federationPeerRegistry.listPeers(
    federationRepairBeginAt
  );
  const localityWorkerViewsRepairing = await workerLocalityRegistry.listWorkers(
    federationRepairBeginAt,
    workerLocalityNodeViews,
    federationPeerViewsRepairing,
    [...degradedExecutionOutcomes.workerSummaries.values()]
  );
  const federationRepairRecoveredAt = new Date(
    Date.parse(federationRepairBeginAt) + 500
  ).toISOString();
  const federationPeerRepairRecovered = await federationPeerRegistry.markRepairSuccess({
    peerId: federationRegisteredNearPeer.peerId,
    action: "lease-renewal",
    now: federationRepairRecoveredAt
  });
  const federationPeerViewsRepairRecovered = await federationPeerRegistry.listPeers(
    federationRepairRecoveredAt
  );
  const repairRecoveredAssignment = await workerLocalityRegistry.assignWorker({
    requestedExecutionDecision: "remote_required",
    baseModel: benchmarkLayer.model,
    preferredLayerIds: [benchmarkLayer.id],
    recommendedLayerId: benchmarkLayer.id,
    target: "planner-swarm",
    preferredDeviceAffinityTags: ["swarm"],
    maxObservedLatencyMs: 80,
    maxCostPerHourUsd: 0.50,
    nodeViews: workerLocalityNodeViews,
    peerViews: federationPeerViewsRepairRecovered,
    executionOutcomeSummaries: [...degradedExecutionOutcomes.workerSummaries.values()]
  });
  if (
    repairRecoveredAssignment.assignment?.workerId &&
    repairRecoveredAssignment.assignment.leaseToken
  ) {
    await workerLocalityRegistry.releaseWorker({
      workerId: repairRecoveredAssignment.assignment.workerId,
      leaseToken: repairRecoveredAssignment.assignment.leaseToken
    });
  }
  const localSlotRegistry = createIntelligenceWorkerRegistry(
    path.join(runtimeDir, "worker-plane-local-slots")
  );
  for (let slot = 1; slot <= 3; slot += 1) {
    await localSlotRegistry.registerWorker({
      workerId: `worker-${suiteId}-local-slot-${slot}`,
      workerLabel: `Benchmark Local Slot ${slot}`,
      hostLabel: "worker-host-local-slots",
      nodeId: workerLocalityLocalNode.nodeId,
      locality: workerLocalityLocalNode.locality,
      executionProfile: "local",
      executionEndpoint: DEFAULT_Q_RUNTIME_ENDPOINT,
      registeredAt: workerRegistryNow,
      heartbeatAt: workerRegistryNow,
      leaseDurationMs: 45_000,
      leaseExpiresAt: new Date(Date.parse(workerRegistryNow) + 45_000).toISOString(),
      watch: true,
      allowHostRisk: false,
      supportedBaseModels: ["*"],
      preferredLayerIds: [benchmarkLayer.id]
    }, workerLocalityNodeViews);
  }
  const localSlotAssignments = await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
      localSlotRegistry.assignWorker({
        requestedExecutionDecision: "allow_local",
        baseModel: benchmarkLayer.model,
        preferredLayerIds: [benchmarkLayer.id],
        recommendedLayerId: benchmarkLayer.id,
        target: `planner-swarm:slot-${index + 1}`,
        preferredNodeId: workerLocalityLocalNode.nodeId,
        preferredLocality: workerLocalityLocalNode.locality,
        nodeViews: workerLocalityNodeViews
      })
    )
  );
  const localSlotWorkerIds = localSlotAssignments.flatMap((entry) =>
    entry.assignment?.workerId ? [entry.assignment.workerId] : []
  );
  const localSlotRegistrySnapshot = await localSlotRegistry.listWorkers(
    workerRegistryNow,
    workerLocalityNodeViews
  );
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
    nonce?: string;
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
          nonce?: string;
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
        nonce: message.data.nonce,
        encodedCommand: message.data.encodedCommand,
        output: message.data.output
      });
      actuationBridge.handleMessage(
        JSON.stringify({
          type: "actuation-ack",
          deliveryId: message.data.deliveryId,
          nonce: message.data.nonce,
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
    heartbeatTimeoutMs: 5000
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
  await new Promise((resolve) => setTimeout(resolve, BENCHMARK_ADAPTER_DISPATCH_CADENCE_MS));
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
  const serialPayloadLines = ((await safeReadText(serialDevicePath)) ?? "")
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
  const recoveredSerialTransport = await actuationManager.registerSerialJsonTransport({
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
  await actuationManager.registerSerialJsonTransport({
    adapterId: "haptic-rig",
    devicePath: serialDevicePath,
    baudRate: 230400,
    label: "Benchmark Haptic Serial",
    deviceId: "bench-haptic-serial-01",
    vendorId: "immaculate-labs",
    modelId: "haptic-bridge-s1",
    heartbeatIntervalMs: 20,
    heartbeatTimeoutMs: 5000
  });
  const recoveredSerialHeartbeat = await actuationManager.recordTransportHeartbeat({
    transportId: recoveredSerialTransport.id,
    latencyMs: 2.8,
    capabilities: serialCapabilities,
    firmwareVersion: "fw-serial-1.0.1"
  });
  await new Promise((resolve) => setTimeout(resolve, BENCHMARK_ADAPTER_DISPATCH_CADENCE_MS));
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
  const recoveredSerialPayloadLines = ((await safeReadText(serialDevicePath)) ?? "")
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
    heartbeatTimeoutMs: 5000
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
  const tier2NeuroProfiles = [
    {
      band: "alpha",
      frequencyHz: 10,
      syncJitterMs: 0.18,
      phaseShift: 0.08,
      amplitude: 0.17,
      harmonicScale: 0.18,
      noiseScale: 0.04
    },
    {
      band: "beta",
      frequencyHz: 20,
      syncJitterMs: 0.14,
      phaseShift: 0.16,
      amplitude: 0.34,
      harmonicScale: 0.08,
      noiseScale: 0.008
    },
    {
      band: "gamma",
      frequencyHz: 40,
      syncJitterMs: 0.11,
      phaseShift: 0.24,
      amplitude: 0.18,
      harmonicScale: 0.16,
      noiseScale: 0.035
    }
  ] as const;
  let tier2PreferredFrame: NeuroFrameWindow | undefined;
  let tier2ReplayState = liveIngressResult.ingress;
  for (const profile of tier2NeuroProfiles) {
    const tier2FrameResult = buildLiveNeuroFrame(
      {
        sourceId: "tier2-neuro-coupling",
        label: `Tier 2 ${profile.band.toUpperCase()} Coupling`,
        sessionId: nwbFixture.summary.id,
        kind: "electrical-series",
        rateHz: 128,
        syncJitterMs: profile.syncJitterMs,
        channels: 12,
        samples: createTier2BandDominantSamples({
          frequencyHz: profile.frequencyHz,
          sampleCount: 256,
          channelCount: 12,
          rateHz: 128,
          amplitude: profile.amplitude,
          phaseShift: profile.phaseShift,
          harmonicScale: profile.harmonicScale,
          noiseScale: profile.noiseScale
        })
      },
      tier2ReplayState
    );
    tier2ReplayState = tier2FrameResult.ingress;
    engine.ingestNeuroFrame(tier2FrameResult.frame);
    engine.upsertNeuroReplay(tier2FrameResult.ingress);
    if (profile.band === "beta") {
      tier2PreferredFrame = tier2FrameResult.frame;
    }
    const tier2Snapshot = engine.getSnapshot();
    const tier2RoutePlan = planAdaptiveRoute({
      snapshot: tier2Snapshot,
      frame: tier2FrameResult.frame,
      execution: syntheticExecution,
      adapters: actuationManager.listAdapters(),
      transports: actuationManager.listTransports(),
      governanceStatus: preferredRouteGovernanceStatus,
      governanceDecisions: preferredRouteGovernanceDecisions,
      consentScope: "system:benchmark"
    });

    tier2BandDominanceSamples.push(tier2FrameResult.frame.bandPower?.dominantRatio ?? 0);
    tier2RouteBiasSamples.push(tier2Snapshot.neuralCoupling.phaseBias.route);
    tier2NeuroCoupledRoutingSamples.push(
      Number(
        (
          tier2Snapshot.neuralCoupling.phaseBias.route *
          tier2RoutePlan.recommendedIntensity
        ).toFixed(6)
      )
    );
    tier2RouteModes.push(tier2RoutePlan.mode);
  }
  const tier2ArtifactSamples = createTier2BandDominantSamples({
    frequencyHz: 60,
    sampleCount: 256,
    channelCount: 12,
    rateHz: 128,
    amplitude: 0.82,
    phaseShift: 0.14,
    harmonicScale: 0,
    noiseScale: 0.004
  });
  const tier2AlphaSamples = createTier2BandDominantSamples({
    frequencyHz: 10,
    sampleCount: 256,
    channelCount: 12,
    rateHz: 128,
    amplitude: 0.64,
    phaseShift: 0.28,
    harmonicScale: 0.05,
    noiseScale: 0.003
  });
  const tier2ArtifactBands = extractBandPower(collapseSampleRows(tier2ArtifactSamples), 128);
  const tier2AlphaBands = extractBandPower(collapseSampleRows(tier2AlphaSamples), 128);
  const tier2ArtifactFrame = buildLiveNeuroFrame(
    {
      sourceId: `tier2-spectral-artifact-${suiteId}`,
      label: "Tier 2 spectral artifact window",
      sessionId: nwbFixture.summary.id,
      kind: "electrical-series",
      rateHz: 128,
      syncJitterMs: 0.18,
      channels: 12,
      samples: tier2ArtifactSamples
    },
    tier2ReplayState
  ).frame;
  const tier2AlphaFrame = buildLiveNeuroFrame(
    {
      sourceId: `tier2-spectral-alpha-${suiteId}`,
      label: "Tier 2 spectral alpha window",
      sessionId: nwbFixture.summary.id,
      kind: "electrical-series",
      rateHz: 128,
      syncJitterMs: 0.18,
      channels: 12,
      samples: tier2AlphaSamples
    },
    tier2ReplayState
  ).frame;
  const tier2ArtifactRoutePlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: tier2ArtifactFrame,
    execution: syntheticExecution,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: preferredRouteGovernanceStatus,
    governanceDecisions: preferredRouteGovernanceDecisions,
    consentScope: "system:benchmark"
  });
  const tier2AlphaRoutePlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: tier2AlphaFrame,
    execution: syntheticExecution,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: preferredRouteGovernanceStatus,
    governanceDecisions: preferredRouteGovernanceDecisions,
    consentScope: "system:benchmark"
  });
  const preferredRouteFrame = tier2PreferredFrame ?? liveIngressResult.frame;
  const preferredRoutePlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: preferredRouteFrame,
    execution: syntheticExecution,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: preferredRouteGovernanceStatus,
    governanceDecisions: preferredRouteGovernanceDecisions,
    consentScope: "system:benchmark"
  });
  const releaseMetadata = await resolveReleaseMetadata();
  const qGovernedLocalRoutePlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: preferredRouteFrame,
    execution: syntheticExecution,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: preferredRouteGovernanceStatus,
    governanceDecisions: preferredRouteGovernanceDecisions,
    consentScope: "system:benchmark",
    qContext: {
      qRoutingDirective: "primary-governed-local",
      readinessReady: true,
      gatewaySubstrateHealthy: true,
      preferredExecutionLane: "local-q",
      cloudLaneReady: false,
      cloudLaneStatus: "launch-blocked",
      trainingBundleId: releaseMetadata.q.trainingLock?.bundleId,
      mediationDiagnosticSummary:
        "Q should stay primary because the local governed lane is healthy while cloud Q is blocked.",
      mediationDiagnosticSignals: [
        "readiness=ready",
        "substrate=healthy",
        "cloud=blocked",
        "directive=primary-governed-local"
      ]
    }
  });
  const preferredHttp2Actuation: ActuationOutput = {
    id: `act-${suiteId}-http2-preferred`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: preferredRouteFrame.id,
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
    frame: preferredRouteFrame,
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
    id: `act-${suiteId}-guarded-review`,
    sessionId: nwbFixture.summary.id,
    source: "benchmark",
    sourceExecutionId: syntheticExecution.id,
    sourceFrameId: liveIngressResult.frame.id,
    targetNodeId: "actuator-grid",
    channel: guardedFallbackPlan.channel,
    command: "benchmark:guarded-review",
    intensity: guardedFallbackPlan.recommendedIntensity,
    status: "dispatched",
    summary:
      "Dispatch benchmark actuation through the guarded review lane under critical governance pressure.",
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
  const qGovernedExecutionContext = {
    readinessReady: true,
    gatewaySubstrateHealthy: true,
    preferredExecutionLane: "local-q" as const,
    qRoutingDirective: "primary-governed-local" as const,
    cloudLaneReady: false,
    cloudLaneStatus: "launch-blocked",
    trainingBundleId: "tracked-q-bundle",
    mediationDiagnosticSummary:
      "Q should stay primary because the local governed lane is healthy while cloud Q is blocked.",
    mediationDiagnosticSignals: [
      "readiness=ready",
      "substrate=healthy",
      "cloud=blocked",
      "directive=primary-governed-local"
    ]
  };
  const arbitrationLatencySamples: number[] = [];
  const arbitrationCognitionSamples: number[] = [];
  const reflexArbitrationStart = performance.now();
  const reflexArbitrationPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: liveIngressResult.frame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: 0,
      deniedCount: 0
    },
    governanceDecisions: [],
    consentScope: "system:benchmark"
  });
  arbitrationLatencySamples.push(Number((performance.now() - reflexArbitrationStart).toFixed(4)));
  arbitrationCognitionSamples.push(reflexArbitrationPlan.shouldRunCognition ? 1 : 0);
  const reflexArbitrationDecision = buildExecutionArbitrationDecision({
    plan: reflexArbitrationPlan,
    consentScope: "system:benchmark",
    frame: liveIngressResult.frame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(reflexArbitrationDecision);

  const escalationFrame = {
    ...liveIngressResult.frame,
    id: `${liveIngressResult.frame.id}-escalation`,
    decodeConfidence: 0.61,
    capturedAt: new Date().toISOString()
  };
  const federatedRoutePressurePlan = planAdaptiveRoute({
    snapshot: engine.getSnapshot(),
    frame: escalationFrame,
    execution: {
      ...syntheticExecution,
      assignedWorkerId: `worker-${suiteId}-remote-far`,
      assignedWorkerProfile: "remote",
      assignedWorkerPeerId: federationRegisteredFarPeer.peerId,
      assignedWorkerPeerStatus: "healthy",
      assignedWorkerPeerLeaseStatus: "healthy",
      assignedWorkerPeerObservedLatencyMs: 6
    },
    federationPressure: federatedPressureCritical,
    adapters: actuationManager.listAdapters(),
    transports: actuationManager.listTransports(),
    governanceStatus: preferredRouteGovernanceStatus,
    governanceDecisions: preferredRouteGovernanceDecisions,
    consentScope: "system:benchmark"
  });
  const cognitiveArbitrationStart = performance.now();
  const cognitiveArbitrationPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: escalationFrame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: 0,
      deniedCount: 0
    },
    governanceDecisions: [],
    consentScope: "system:benchmark"
  });
  arbitrationLatencySamples.push(Number((performance.now() - cognitiveArbitrationStart).toFixed(4)));
  arbitrationCognitionSamples.push(cognitiveArbitrationPlan.shouldRunCognition ? 1 : 0);
  const cognitiveArbitrationDecision = buildExecutionArbitrationDecision({
    plan: cognitiveArbitrationPlan,
    consentScope: "system:benchmark",
    frame: escalationFrame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(cognitiveArbitrationDecision);
  const qGovernedLocalArbitrationPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: escalationFrame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: 0,
      deniedCount: 0
    },
    governanceDecisions: [],
    consentScope: "system:benchmark",
    qContext: qGovernedExecutionContext
  });
  const qGovernedLocalArbitrationDecision = buildExecutionArbitrationDecision({
    plan: qGovernedLocalArbitrationPlan,
    consentScope: "system:benchmark",
    frame: escalationFrame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(qGovernedLocalArbitrationDecision);
  const federatedArbitrationClearPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: escalationFrame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: 0,
      deniedCount: 0
    },
    governanceDecisions: [],
    consentScope: "system:benchmark",
    federationPressure: federatedPressureClear
  });
  const federatedArbitrationClearDecision = buildExecutionArbitrationDecision({
    plan: federatedArbitrationClearPlan,
    consentScope: "system:benchmark",
    frame: escalationFrame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(federatedArbitrationClearDecision);

  const guardedArbitrationDecisionTime = new Date().toISOString();
  const guardedArbitrationGovernanceDecisions: GovernanceDecision[] = [
    {
      id: `arb-${suiteId}-critical-01`,
      timestamp: guardedArbitrationDecisionTime,
      allowed: false,
      mode: "enforced",
      action: "actuation-dispatch",
      route: "/api/orchestration/mediate",
      policyId: "actuation-dispatch-default",
      purpose: ["actuation-dispatch"],
      consentScope: `subject:${bidsFixture.summary.id}`,
      actor: "benchmark",
      reason: "critical_review_hold"
    }
  ];
  const guardedArbitrationStart = performance.now();
  const guardedArbitrationPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: escalationFrame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: guardedArbitrationGovernanceDecisions.length,
      deniedCount: 4,
      lastDecisionAt: guardedArbitrationDecisionTime,
      lastDecisionId: guardedArbitrationGovernanceDecisions[0].id
    },
    governanceDecisions: guardedArbitrationGovernanceDecisions,
    consentScope: `subject:${bidsFixture.summary.id}`
  });
  arbitrationLatencySamples.push(Number((performance.now() - guardedArbitrationStart).toFixed(4)));
  arbitrationCognitionSamples.push(guardedArbitrationPlan.shouldRunCognition ? 1 : 0);
  const guardedArbitrationDecision = buildExecutionArbitrationDecision({
    plan: guardedArbitrationPlan,
    consentScope: `subject:${bidsFixture.summary.id}`,
    frame: escalationFrame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(guardedArbitrationDecision);
  const federatedArbitrationCriticalPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: escalationFrame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: 0,
      deniedCount: 0
    },
    governanceDecisions: [],
    consentScope: "system:benchmark",
    federationPressure: federatedPressureCritical
  });
  const federatedArbitrationCriticalDecision = buildExecutionArbitrationDecision({
    plan: federatedArbitrationCriticalPlan,
    consentScope: "system:benchmark",
    frame: escalationFrame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(federatedArbitrationCriticalDecision);
  const tier1ConversationStart = performance.now();
  const clearTier1Conversation = buildTier1ConversationLedger({
    midLayer: benchmarkMidLayer,
    soulLayer: benchmarkSoulLayer,
    reasonerLayer: benchmarkLayer,
    guardLayer: benchmarkGuardLayer,
    parsed: parsedCognitiveLoop,
    governanceContext: buildGovernanceAwareCognitionContext({
      pressure: reflexArbitrationPlan.governancePressure,
      deniedCount: 0,
      objective: syntheticExecution.objective
    }),
    softPriorBias: deriveRouteSoftPriorBias(
      parsedCognitiveLoop.routeSuggestion,
      preferredRoutePlan.mode,
      preferredRouteDecision.governancePressure
    ),
    pressure: reflexArbitrationPlan.governancePressure
  });
  const guardedTier1Conversation = buildTier1ConversationLedger({
    midLayer: benchmarkMidLayer,
    soulLayer: benchmarkSoulLayer,
    reasonerLayer: benchmarkLayer,
    guardLayer: benchmarkGuardLayer,
    parsed: parsedCognitiveLoop,
    governanceContext: buildGovernanceAwareCognitionContext({
      pressure: guardedArbitrationDecision.governancePressure,
      deniedCount: guardedArbitrationGovernanceDecisions.length,
      objective: syntheticExecution.objective
    }),
    softPriorBias: deriveRouteSoftPriorBias(
      parsedCognitiveLoop.routeSuggestion,
      guardedFallbackPlan.mode,
      guardedFallbackDecision.governancePressure
    ),
    pressure: guardedArbitrationDecision.governancePressure
  });
  const tier1ConversationLatencyMs = Number(
    (performance.now() - tier1ConversationStart).toFixed(4)
  );
  const cognitiveGovernanceContextSamples = [
    Number(
      clearTier1Conversation.governancePressure === "clear" &&
        clearTier1Conversation.turns[1]?.summary.includes("governance=clear")
    ),
    Number(
      guardedTier1Conversation.governancePressure === "critical" &&
        guardedTier1Conversation.turns[1]?.summary.includes("governance=critical") &&
        guardedTier1Conversation.turns[3]?.verdict === "blocked"
    )
  ];
  const cognitiveRouteSoftPriorSamples = [
    Math.abs(
      deriveRouteSoftPriorBias(
        parsedCognitiveLoop.routeSuggestion,
        preferredRoutePlan.mode,
        preferredRouteDecision.governancePressure
      )
    ),
    Math.abs(
      deriveRouteSoftPriorBias(
        parsedCognitiveLoop.routeSuggestion,
        guardedFallbackPlan.mode,
        guardedFallbackDecision.governancePressure
      )
    )
  ];
  const cognitiveRouteSoftPriorStrengthSamples = [
    deriveRouteSoftPriorStrength(
      parsedCognitiveLoop.routeSuggestion,
      preferredRoutePlan.mode,
      preferredRouteDecision.governancePressure
    ),
    deriveRouteSoftPriorStrength(
      parsedCognitiveLoop.routeSuggestion,
      guardedFallbackPlan.mode,
      guardedFallbackDecision.governancePressure
    )
  ];
  const multiRoleConversationTurnSamples = [
    clearTier1Conversation.turns.length,
    guardedTier1Conversation.turns.length
  ];
  const multiRoleConversationVerdictSamples = [
    clearTier1Conversation.verdict === "approved" ? 1 : 0,
    guardedTier1Conversation.verdict === "blocked" ? 1 : 0
  ];

  const mediationGovernance = createGovernanceRegistry();
  const mediationAllowedPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: liveIngressResult.frame,
    execution: syntheticExecution,
    governanceStatus: mediationGovernance.getStatus(),
    governanceDecisions: mediationGovernance.listDecisions(),
    consentScope: "system:benchmark"
  });
  const mediationAllowedDecision = buildExecutionArbitrationDecision({
    plan: mediationAllowedPlan,
    consentScope: "system:benchmark",
    frame: liveIngressResult.frame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(mediationAllowedDecision);
  const mediationAllowedConversation = clearTier1Conversation;
  const mediationAllowedRoutePlan = preferredRoutePlan;
  const mediationAllowedPlanOnly = {
    arbitrationDecision: mediationAllowedDecision,
    conversation: mediationAllowedConversation,
    dispatchOnApproval: false,
    routePlan: mediationAllowedRoutePlan,
    routeDecision: {
      id: `route-${suiteId}-mediate-plan-only`,
      sessionId: nwbFixture.summary.id,
      source: "benchmark",
      mode: mediationAllowedRoutePlan.mode,
      targetNodeId: mediationAllowedRoutePlan.targetNodeId,
      channel: mediationAllowedRoutePlan.channel,
      adapterId: mediationAllowedRoutePlan.recommendedAdapterId,
      transportId: mediationAllowedRoutePlan.selectedTransport?.id,
      transportKind: mediationAllowedRoutePlan.selectedTransport?.kind,
      transportHealth: mediationAllowedRoutePlan.selectedTransport?.health,
      transportPreferenceScore: mediationAllowedRoutePlan.selectedTransport?.preferenceScore,
      transportPreferenceRank: mediationAllowedRoutePlan.selectedTransport?.preferenceRank,
      decodeConfidence: liveIngressResult.frame.decodeConfidence,
      cognitiveLatencyMs: syntheticExecution.latencyMs,
      governancePressure: mediationAllowedRoutePlan.governancePressure,
      rationale: `${mediationAllowedRoutePlan.rationale} / review=held / benchmark-plan-only`,
      selectedAt: new Date().toISOString()
    } satisfies RoutingDecision,
    delivery: undefined as ActuationOutput | undefined,
    output: undefined as ActuationOutput | undefined
  };
  engine.recordRoutingDecision(mediationAllowedPlanOnly.routeDecision);
  const mediationAllowedActuation =
    mediationAllowedPlan.shouldDispatchActuation &&
    mediationAllowedConversation.verdict !== "blocked"
      ? ({
          id: `act-${suiteId}-mediate-approval`,
          sessionId: nwbFixture.summary.id,
          source: "benchmark",
          sourceExecutionId: syntheticExecution.id,
          sourceFrameId: liveIngressResult.frame.id,
          targetNodeId: mediationAllowedRoutePlan.targetNodeId,
          channel: mediationAllowedRoutePlan.channel,
          command: "benchmark:mediate-dispatch",
          intensity: mediationAllowedRoutePlan.recommendedIntensity,
          status: "dispatched",
          summary: "Dispatch benchmark actuation through a mediated approval path.",
          generatedAt: new Date().toISOString(),
          dispatchedAt: new Date().toISOString()
        } as ActuationOutput)
      : undefined;
  if (mediationAllowedActuation) {
    await delay(BENCHMARK_ADAPTER_DISPATCH_CADENCE_MS);
  }
  const mediationAllowedDispatchResult = mediationAllowedActuation
    ? await actuationManager.dispatch(mediationAllowedActuation, {
        adapterId: mediationAllowedRoutePlan.recommendedAdapterId
      })
    : undefined;
  if (mediationAllowedDispatchResult) {
    engine.dispatchActuationOutput(mediationAllowedDispatchResult.output);
  }

  const mediationBlockedConversation = guardedTier1Conversation;
  if (mediationBlockedConversation.verdict === "blocked") {
    mediationGovernance.record(
      {
        action: "actuation-dispatch",
        route: "/api/orchestration/mediate",
        actor: "benchmark",
        policyId: "actuation-dispatch-default",
        purpose: ["actuation-dispatch"],
        consentScope: `session:${nwbFixture.summary.id}`
      },
      false,
      "guard_verdict_blocked"
    );
  }
  const mediationBlockedStatus = mediationGovernance.getStatus();
  const mediationBlockedPlan = planExecutionArbitration({
    snapshot: engine.getSnapshot(),
    frame: liveIngressResult.frame,
    execution: syntheticExecution,
    governanceStatus: mediationBlockedStatus,
    governanceDecisions: mediationGovernance.listDecisions(),
    consentScope: `session:${nwbFixture.summary.id}`
  });
  const mediationBlockedDecision = buildExecutionArbitrationDecision({
    plan: mediationBlockedPlan,
    consentScope: `session:${nwbFixture.summary.id}`,
    frame: liveIngressResult.frame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(mediationBlockedDecision);
  const mediationSessionId = nwbFixture.summary.id;
  const foreignSessionId = `${mediationSessionId}-foreign`;
  const sessionBoundExplicitAllowed = evaluateBenchmarkSessionBinding({
    consentScope: `session:${mediationSessionId}`,
    requestedSessionId: mediationSessionId,
    sourceExecutionSessionId: mediationSessionId,
    sourceFrameSessionId: mediationSessionId
  });
  const sessionBoundOmittedBlocked = evaluateBenchmarkSessionBinding({
    consentScope: `session:${mediationSessionId}`,
    defaultExecutionSessionId: foreignSessionId,
    defaultFrameSessionId: foreignSessionId
  });
  const sessionBoundExplicitMismatchBlocked = evaluateBenchmarkSessionBinding({
    consentScope: `session:${mediationSessionId}`,
    requestedSessionId: foreignSessionId,
    sourceExecutionSessionId: foreignSessionId,
    sourceFrameSessionId: foreignSessionId
  });

  const scheduleWidthSamples: number[] = [];
  const scheduleSwarmSamples: number[] = [];
  const reflexSchedulePlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: reflexArbitrationDecision
  });
  scheduleWidthSamples.push(reflexSchedulePlan.layerIds.length);
  scheduleSwarmSamples.push(reflexSchedulePlan.layerIds.length > 1 ? 1 : 0);
  const reflexScheduleDecision = buildExecutionScheduleDecision({
    arbitration: reflexArbitrationDecision,
    plan: reflexSchedulePlan
  });
  engine.recordExecutionSchedule(reflexScheduleDecision);

  const cognitiveSchedulePlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: cognitiveArbitrationDecision
  });
  scheduleWidthSamples.push(cognitiveSchedulePlan.layerIds.length);
  scheduleSwarmSamples.push(cognitiveSchedulePlan.layerIds.length > 1 ? 1 : 0);
  const cognitiveScheduleDecision = buildExecutionScheduleDecision({
    arbitration: cognitiveArbitrationDecision,
    plan: cognitiveSchedulePlan
  });
  engine.recordExecutionSchedule(cognitiveScheduleDecision);
  const qGovernedLocalSchedulePlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: qGovernedLocalArbitrationDecision,
    qContext: qGovernedExecutionContext
  });
  const qGovernedLocalScheduleDecision = buildExecutionScheduleDecision({
    arbitration: qGovernedLocalArbitrationDecision,
    plan: qGovernedLocalSchedulePlan
  });
  engine.recordExecutionSchedule(qGovernedLocalScheduleDecision);
  const federatedScheduleClearPlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: federatedArbitrationClearDecision,
    federationPressure: federatedPressureClear
  });
  const federatedScheduleClearDecision = buildExecutionScheduleDecision({
    arbitration: federatedArbitrationClearDecision,
    plan: federatedScheduleClearPlan
  });
  engine.recordExecutionSchedule(federatedScheduleClearDecision);
  const federatedScheduleElevatedPlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: federatedArbitrationClearDecision,
    federationPressure: federatedPressureElevated
  });
  const federatedScheduleElevatedDecision = buildExecutionScheduleDecision({
    arbitration: federatedArbitrationClearDecision,
    plan: federatedScheduleElevatedPlan
  });
  engine.recordExecutionSchedule(federatedScheduleElevatedDecision);
  const federatedScheduleCriticalPlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: federatedArbitrationCriticalDecision,
    federationPressure: federatedPressureCritical
  });
  const federatedScheduleCriticalDecision = buildExecutionScheduleDecision({
    arbitration: federatedArbitrationCriticalDecision,
    plan: federatedScheduleCriticalPlan
  });
  engine.recordExecutionSchedule(federatedScheduleCriticalDecision);

  const guardedSchedulePlan = planExecutionSchedule({
    snapshot: engine.getSnapshot(),
    arbitration: guardedArbitrationDecision
  });
  scheduleWidthSamples.push(guardedSchedulePlan.layerIds.length);
  scheduleSwarmSamples.push(guardedSchedulePlan.layerIds.length > 1 ? 1 : 0);
  const guardedScheduleDecision = buildExecutionScheduleDecision({
    arbitration: guardedArbitrationDecision,
    plan: guardedSchedulePlan
  });
  engine.recordExecutionSchedule(guardedScheduleDecision);
  const spectralReflexSnapshot = engine.ingestNeuroFrame(preferredRouteFrame);
  const spectralReflexArbitrationPlan = planExecutionArbitration({
    snapshot: spectralReflexSnapshot,
    frame: preferredRouteFrame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: 0,
      deniedCount: 0
    },
    governanceDecisions: [],
    consentScope: "system:benchmark"
  });
  const spectralReflexArbitrationDecision = buildExecutionArbitrationDecision({
    plan: spectralReflexArbitrationPlan,
    consentScope: "system:benchmark",
    frame: preferredRouteFrame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(spectralReflexArbitrationDecision);
  const spectralArtifactSnapshot = engine.ingestNeuroFrame(tier2ArtifactFrame);
  const spectralArtifactArbitrationPlan = planExecutionArbitration({
    snapshot: spectralArtifactSnapshot,
    frame: tier2ArtifactFrame,
    execution: syntheticExecution,
    governanceStatus: {
      mode: "enforced",
      policyCount: 0,
      decisionCount: 0,
      deniedCount: 0
    },
    governanceDecisions: [],
    consentScope: "system:benchmark"
  });
  const spectralArtifactArbitrationDecision = buildExecutionArbitrationDecision({
    plan: spectralArtifactArbitrationPlan,
    consentScope: "system:benchmark",
    frame: tier2ArtifactFrame,
    execution: syntheticExecution
  });
  engine.recordExecutionArbitration(spectralArtifactArbitrationDecision);
  const spectralArtifactSchedulePlan = planExecutionSchedule({
    snapshot: spectralArtifactSnapshot,
    arbitration: spectralArtifactArbitrationDecision
  });
  const spectralArtifactScheduleDecision = buildExecutionScheduleDecision({
    arbitration: spectralArtifactArbitrationDecision,
    plan: spectralArtifactSchedulePlan
  });
  engine.recordExecutionSchedule(spectralArtifactScheduleDecision);

  let verifyBarrierTick: number | null = null;
  let cycleCompletionTick: number | null = null;

  for (let tick = 1; tick <= maxTicks; tick += 1) {
    engine.tick();
    if (liveFramesPerTick > 0 && throughputIngressState) {
      for (let frameIndex = 0; frameIndex < liveFramesPerTick; frameIndex += 1) {
        const throughputFrameResult = buildLiveNeuroFrame(
          {
            sourceId: throughputIngressState.id,
            label: throughputIngressState.name,
            sessionId: nwbFixture.summary.id,
            kind: "electrical-series",
            rateHz: nwbFixture.summary.primaryRateHz ?? 1000,
            syncJitterMs: Number((0.2 + (frameIndex % 3) * 0.05).toFixed(3)),
            channels: 8,
            timestamp: new Date().toISOString(),
            samples: throughputLoadSamples
          },
          throughputIngressState
        );
        throughputIngressState = throughputFrameResult.ingress;
        decodeConfidenceSamples.push(throughputFrameResult.frame.decodeConfidence);
        syncJitterSamples.push(throughputFrameResult.frame.syncJitterMs);
        engine.ingestNeuroFrame(throughputFrameResult.frame);
        engine.upsertNeuroReplay(throughputFrameResult.ingress);
      }
    }
    const snapshot = engine.getSnapshot() as PhaseSnapshot;
    reflexSamples.push(snapshot.metrics.reflexLatencyMs);
    cognitiveSamples.push(snapshot.metrics.cognitiveLatencyMs);
    throughputSamples.push(snapshot.metrics.throughput);
    coherenceSamples.push(snapshot.metrics.coherence);
    predictionErrorSamples.push(snapshot.metrics.predictionError);
    freeEnergyProxySamples.push(snapshot.metrics.freeEnergyProxy);
    if (tick % persistEveryTicks === 0 || tick === maxTicks) {
      await persistence.persist(engine.getDurableState());
    }

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
      completionStrategy === "checkpoint-ready" &&
      verifyBarrierTick !== null &&
      cycleCompletionTick !== null &&
      persistence.getStatus().checkpointCount > 0
    ) {
      break;
    }

    await paceBenchmarkTick(realTimePacing, benchmarkStartedAt, tick, tickIntervalMs);
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
  const actualWallClockDurationMs = Number((performance.now() - benchmarkStartedAt).toFixed(2));
  if (pack.id === "temporal-baseline") {
    const temporalBaseline = await runTemporalBaselineComparison(runtimeDir);
    immaculateBaselineLatencySamples.push(...temporalBaseline.immaculateLatenciesMs);
    temporalBaselineLatencySamples.push(...temporalBaseline.temporalLatenciesMs);
    immaculateBaselineRssSamples.push(temporalBaseline.immaculateUsage.rssPeakMiB);
    temporalBaselineRssSamples.push(temporalBaseline.temporalUsage.rssPeakMiB);
  }
  const measuredEventCount = engine.getDurableState().serial;
  const measuredEventThroughput =
    actualWallClockDurationMs > 0
      ? Number((measuredEventCount / (actualWallClockDurationMs / 1000)).toFixed(2))
      : 0;
  const wallClockTruthRatio =
    plannedDurationMs > 0
      ? Number((actualWallClockDurationMs / plannedDurationMs).toFixed(4))
      : 0;
  const persistedEventLog = (((await safeReadText(path.join(runtimeDir, "events.ndjson"))) ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EventEnvelope));
  const finalSnapshot = engine.getSnapshot() as PhaseSnapshot;
  const eventLog = engine.getEvents() as EventEnvelope[];
  const executionArbitrations = finalSnapshot.executionArbitrations;
  const executionSchedules = finalSnapshot.executionSchedules;
  const routingDecisions = finalSnapshot.routingDecisions;
  const routingEvents = eventLog.filter((event) => event.schema.name === "immaculate.routing.decision");
  const persistedRoutingEvents = persistedEventLog.filter(
    (event) => event.schema.name === "immaculate.routing.decision"
  );
  const persistedReplayFrameCount = persistedEventLog.filter((event) => {
    if (event.schema.name !== "immaculate.neuro-frame.ingested") {
      return false;
    }
    return (event.payload as { frame?: NeuroFrameWindow }).frame?.replayId === replayId;
  }).length;
  const persistedReplayCompleted = persistedEventLog.some((event) => {
    if (event.schema.name !== "immaculate.neuro-replay.upserted") {
      return false;
    }
    const replay = (event.payload as { replay?: NeuroReplayState }).replay;
    return replay?.id === replayId && replay.status === "completed";
  });
  const persistedInitialLiveSocketFrameCount = persistedEventLog.filter((event) => {
    if (event.schema.name !== "immaculate.neuro-frame.ingested") {
      return false;
    }
    const frame = (event.payload as { frame?: NeuroFrameWindow }).frame;
    return frame?.replayId === liveIngressResult.ingress.id && frame.source === "live-socket";
  }).length;
  const persistedInitialLiveSocketReplaySeen = persistedEventLog.some((event) => {
    if (event.schema.name !== "immaculate.neuro-replay.upserted") {
      return false;
    }
    const replay = (event.payload as { replay?: NeuroReplayState }).replay;
    return replay?.id === liveIngressResult.ingress.id && replay.source === "live-socket";
  });
  const redactedSnapshot = redactPhaseSnapshot(finalSnapshot);
  const auditScopedSnapshot = projectPhaseSnapshot(finalSnapshot, "system:audit");
  const benchmarkScopedSnapshot = projectPhaseSnapshot(finalSnapshot, "system:benchmark");
  const datasetScopedRecord = projectDatasetRecord(
    bidsFixture,
    `dataset:${bidsFixture.summary.id}`
  );
  const sessionScopedRecord = projectNeuroSessionRecord(
    nwbFixture,
    `session:${nwbFixture.summary.id}`
  );
  const representativeEvent =
    eventLog.find((event) => Object.keys(event.payload).length > 0) ??
    eventLog[0]!;
  const auditEventProjection = projectEventEnvelope(representativeEvent, "system:audit");
  const benchmarkEventProjection = projectEventEnvelope(
    representativeEvent,
    "system:benchmark"
  );
  const visibilityFrame = preferredRouteFrame;
  const sessionScopedFrame = projectNeuroFrameWindow(
    visibilityFrame,
    `session:${nwbFixture.summary.id}`
  );
  const benchmarkScopedFrame = projectNeuroFrameWindow(
    visibilityFrame,
    "system:benchmark"
  );
  const auditScopedFrame = projectNeuroFrameWindow(
    visibilityFrame,
    "system:audit"
  );
  const intelligenceScopedExecution = projectCognitiveExecution(
    syntheticExecution,
    "system:intelligence"
  );
  const benchmarkScopedExecution = projectCognitiveExecution(
    syntheticExecution,
    "system:benchmark"
  );
  const intelligenceScopedSchedule = projectExecutionSchedule(
    cognitiveScheduleDecision,
    "system:intelligence"
  );
  const benchmarkScopedSchedule = projectExecutionSchedule(
    cognitiveScheduleDecision,
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
  const longRunCompactionActive = runKind === "soak" && cleanStatus.compacted > 0;

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
  const measuredEventThroughputSeries = createSeries(
    "event_throughput_events_s",
    "Measured event throughput",
    "events/s",
    [measuredEventThroughput]
  );
  const wallClockTruthSeries = createSeries(
    "wall_clock_truth_ratio",
    "Wall-clock truth ratio",
    "ratio",
    [wallClockTruthRatio]
  );
  const coherenceSeries = createSeries(
    "coherence_ratio",
    "Coherence",
    "ratio",
    coherenceSamples
  );
  const predictionErrorSeries = createSeries(
    "prediction_error_ratio",
    "Prediction error",
    "ratio",
    predictionErrorSamples
  );
  const freeEnergyProxySeries = createSeries(
    "free_energy_proxy",
    "Free-energy proxy",
    "score",
    freeEnergyProxySamples
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
  const tier2BandDominanceSeries = createSeries(
    "tier2_band_dominance_ratio",
    "Tier 2 band dominance",
    "ratio",
    tier2BandDominanceSamples
  );
  const tier2PhaseBiasSeries = createSeries(
    "tier2_phase_bias_route_ratio",
    "Tier 2 route phase bias",
    "ratio",
    tier2RouteBiasSamples
  );
  const tier2NeuroCoupledRoutingSeries = createSeries(
    "tier2_neuro_coupled_routing_ratio",
    "Tier 2 neuro-coupled routing",
    "ratio",
    tier2NeuroCoupledRoutingSamples
  );
  const openNeuroIngestMbSeries = createSeries(
    "openneuro_ingest_mb_s",
    "OpenNeuro ingest throughput",
    "MB/s",
    openNeuroIngestMbSamples.length > 0 ? openNeuroIngestMbSamples : [0]
  );
  const openNeuroIngestEventSeries = createSeries(
    "openneuro_ingest_events_s",
    "OpenNeuro ingest event rate",
    "events/s",
    openNeuroIngestEventSamples.length > 0 ? openNeuroIngestEventSamples : [0]
  );
  const dandiIngestMbSeries = createSeries(
    "dandi_ingest_mb_s",
    "DANDI ingest throughput",
    "MB/s",
    dandiIngestMbSamples.length > 0 ? dandiIngestMbSamples : [0]
  );
  const dandiIngestEventSeries = createSeries(
    "dandi_ingest_events_s",
    "DANDI ingest event rate",
    "events/s",
    dandiIngestEventSamples.length > 0 ? dandiIngestEventSamples : [0]
  );
  const immaculateBaselineLatencySeries = createSeries(
    "immaculate_baseline_wall_clock_ms",
    "Immaculate baseline wall clock",
    "ms",
    immaculateBaselineLatencySamples.length > 0 ? immaculateBaselineLatencySamples : [0]
  );
  const temporalBaselineLatencySeries = createSeries(
    "temporal_baseline_wall_clock_ms",
    "Temporal baseline wall clock",
    "ms",
    temporalBaselineLatencySamples.length > 0 ? temporalBaselineLatencySamples : [0]
  );
  const immaculateBaselineRssSeries = createSeries(
    "immaculate_baseline_rss_peak_mib",
    "Immaculate baseline RSS peak",
    "MiB",
    immaculateBaselineRssSamples.length > 0 ? immaculateBaselineRssSamples : [0]
  );
  const temporalBaselineRssSeries = createSeries(
    "temporal_baseline_rss_peak_mib",
    "Temporal baseline RSS peak",
    "MiB",
    temporalBaselineRssSamples.length > 0 ? temporalBaselineRssSamples : [0]
  );
  const executionArbitrationLatencySeries = createSeries(
    "execution_arbitration_latency_ms",
    "Execution arbitration latency",
    "ms",
    arbitrationLatencySamples
  );
  const executionArbitrationCognitionSeries = createSeries(
    "execution_arbitration_cognition_ratio",
    "Execution arbitration cognition share",
    "ratio",
    arbitrationCognitionSamples
  );
  const executionScheduleWidthSeries = createSeries(
    "execution_schedule_width",
    "Execution schedule width",
    "layers",
    scheduleWidthSamples
  );
  const executionScheduleSwarmSeries = createSeries(
    "execution_schedule_swarm_ratio",
    "Execution schedule swarm share",
    "ratio",
    scheduleSwarmSamples
  );
  const cognitiveLoopParseLatencySeries = createSeries(
    "cognitive_loop_parse_latency_ms",
    "Cognitive loop parse latency",
    "ms",
    parsedCognitiveLoopLatencySamples
  );
  const cognitiveLoopStructureSeries = createSeries(
    "cognitive_loop_structure_ratio",
    "Cognitive loop structure coverage",
    "ratio",
    [parsedCognitiveLoopStructureRatio]
  );
  const mediateDispatchSeries = createSeries(
    "mediate_dispatch_completion_ratio",
    "Mediated dispatch completion",
    "ratio",
    [
      Number(mediationAllowedPlanOnly.dispatchOnApproval === false),
      Number(Boolean(mediationAllowedDispatchResult))
    ]
  );
  const guardMemorySeries = createSeries(
    "guard_verdict_governance_memory_ratio",
    "Guard verdict governance memory",
    "ratio",
    [
      Number(mediationBlockedStatus.deniedCount === 1),
      Number(mediationBlockedPlan.governancePressure === "elevated")
    ]
  );
  const cognitiveGovernanceContextSeries = createSeries(
    "cognitive_governance_context_ratio",
    "Cognitive governance context coverage",
    "ratio",
    cognitiveGovernanceContextSamples
  );
  const cognitiveRouteSoftPriorSeries = createSeries(
    "cognitive_route_soft_prior_ratio",
    "Cognitive route soft-prior strength",
    "ratio",
    cognitiveRouteSoftPriorStrengthSamples.map((value) => Number((value / 0.06).toFixed(2)))
  );
  const workerLocalityAffinitySeries = createSeries(
    "worker_locality_affinity_ratio",
    "Worker locality affinity",
    "ratio",
    [
      Number(localityAssignment.assignment?.locality === workerLocalityLocalNode.locality),
      Number(localityAssignment.assignment?.workerId === localityNearWorker.workerId),
      Number(localityAssignment.assignment?.identityVerified === true),
      Number(localityAssignment.assignment?.peerLeaseStatus === "healthy"),
      Number(
        typeof localityAssignment.assignment?.peerObservedLatencyMs === "number" &&
          localityAssignment.assignment.peerObservedLatencyMs <
            Number.POSITIVE_INFINITY &&
          localityAssignment.assignment.observedLatencyMs ===
            localityAssignment.assignment.peerObservedLatencyMs
      ),
      Number((localityAssignment.assignment?.costPerHourUsd ?? 999) <= 0.5),
      Number(
        (localityAssignment.assignment?.deviceAffinityTags ?? []).includes("bci") &&
          (localityAssignment.assignment?.deviceAffinityTags ?? []).includes("swarm")
      )
    ]
  );
  const federationPeerLatencySeries = createSeries(
    "federation_peer_latency_ms",
    "Federation peer observed latency",
    "ms",
    [
      federationPeerSuccessFirst.observedLatencyMs ?? 0,
      federationPeerSuccessSecond.leaseObservedLatencyMs ?? 0,
      federationPeerFarHealthy.leaseObservedLatencyMs ?? 0,
      federationPeerNearDegraded.leaseObservedLatencyMs ?? 0,
      federationPeerFarInverted.leaseObservedLatencyMs ?? 0,
      federationPeerFarInverted.leaseSmoothedLatencyMs ?? 0
    ]
  );
  const federationPeerPlacementSeries = createSeries(
    "federation_peer_placement_ratio",
    "Federation peer placement control",
    "ratio",
    [
      Number(localityAssignment.assignment?.workerId === localityNearWorker.workerId),
      Number(localityLatencyInversionAssignment.assignment?.workerId === `worker-${suiteId}-remote-far`),
      Number(
        (localityLatencyInversionAssignment.assignment?.peerObservedLatencyMs ?? Number.POSITIVE_INFINITY) <
          (federationPeerAfterRenewal?.leaseSmoothedLatencyMs ?? Number.POSITIVE_INFINITY)
      )
    ]
  );
  const federationExecutionPressureSeries = createSeries(
    "federation_execution_pressure_ms",
    "Federated execution pressure latency",
    "ms",
    [
      federatedPressureClear.crossNodeLatencyMs ?? 0,
      federatedPressureElevated.crossNodeLatencyMs ?? 0,
      federatedPressureCritical.crossNodeLatencyMs ?? 0
    ]
  );
  const federationRemoteSuccessSeries = createSeries(
    "federation_remote_success_ratio",
    "Federated remote success ratio",
    "ratio",
    [
      federatedPressureClear.remoteSuccessRatio,
      federatedPressureElevated.remoteSuccessRatio,
      federatedPressureCritical.remoteSuccessRatio
    ]
  );
  const federationLeaseCadenceSeries = createSeries(
    "federation_lease_cadence_ms",
    "Federation lease cadence",
    "ms",
    [
      federationPeerFarHealthy.leaseRefreshIntervalMs,
      federationPeerAdaptiveFailure.leaseRefreshIntervalMs,
      federationPeerAdaptiveRecovery.leaseRefreshIntervalMs
    ]
  );
  const federationRepairStateSeries = createSeries(
    "federation_repair_state_ratio",
    "Federation repair state control",
    "ratio",
    [
      Number(federationPeerRepairPending.repairDue),
      Number(repairPendingAssignment.assignment?.peerId === federationRegisteredFarPeer.peerId),
      Number(repairFailClosedAssignment.assignment === null),
      Number(federationPeerRepairing.repairStatus === "repairing"),
      Number(repairRecoveredAssignment.assignment?.workerId === localityNearWorker.workerId),
      Number(federationPeerRepairRecovered.repairStatus === "idle"),
      Number(federationPeerRepairRecovered.repairDue === false)
    ]
  );
  const federationRepairAttemptSeries = createSeries(
    "federation_repair_attempts",
    "Federation repair attempts",
    "count",
    [
      federationPeerRepairPending.repairAttemptCount,
      federationPeerRepairing.repairAttemptCount,
      federationPeerRepairRecovered.repairAttemptCount
    ]
  );
  const orchestrationCrossNodeBiasSeries = createSeries(
    "orchestration_cross_node_bias_ratio",
    "Orchestration cross-node bias",
    "ratio",
    [
      Number(federatedArbitrationClearPlan.mode === "cognitive-escalation"),
      Number(federatedArbitrationCriticalPlan.mode === "guarded-review"),
      Number(federatedScheduleClearPlan.mode === "swarm-parallel"),
      Number(federatedScheduleElevatedPlan.mode === "swarm-sequential"),
      Number(federatedScheduleCriticalPlan.mode === "single-layer"),
      Number(outcomePressureAssignment.assignment?.workerId === localityNearWorker.workerId),
      Number(
        localityLatencyInversionAssignment.assignment?.workerId === `worker-${suiteId}-remote-far`
      ),
      Number(federatedRoutePressurePlan.mode === "guarded-fallback")
    ]
  );
  const multiRoleConversationLatencySeries = createSeries(
    "multi_role_conversation_latency_ms",
    "Multi-role conversation latency",
    "ms",
    [tier1ConversationLatencyMs]
  );
  const multiRoleConversationTurnSeries = createSeries(
    "multi_role_conversation_turns",
    "Multi-role conversation turns",
    "turns",
    multiRoleConversationTurnSamples
  );
  const multiRoleConversationVerdictSeries = createSeries(
    "multi_role_conversation_verdict_ratio",
    "Multi-role conversation verdict coverage",
    "ratio",
    multiRoleConversationVerdictSamples
  );

  const assertions: BenchmarkAssertion[] = [
    createAssertion(
      "bids-ingest-scan",
      benchmarkInputs.externalNeurodata
        ? "OpenNeuro BIDS slice scans into a normalized dataset manifest"
        : "BIDS fixture scans into a normalized dataset manifest",
      bidsFixture.summary.subjectCount > 0 &&
        bidsFixture.summary.fileCount >= 4 &&
        bidsFixture.summary.modalities.some((entry) => entry.modality === "anat") &&
        bidsFixture.summary.modalities.some((entry) => entry.modality === "func"),
      ">= 1 subject, >= 4 files, anat+func modalities",
      `${bidsFixture.summary.subjectCount} subjects / ${bidsFixture.summary.fileCount} files`,
      `${benchmarkInputs.externalNeurodata ? "OpenNeuro" : "fixture"} ${bidsFixture.summary.name} scanned from ${toRelativePublicationPath(bidsFixture.summary.rootPath)}`
    ),
    createAssertion(
      "bids-ingest-register",
      "BIDS dataset registers into the live orchestration state",
      finalSnapshot.datasets.some((dataset) => dataset.id === bidsFixture.summary.id),
      "dataset present in snapshot.datasets",
      finalSnapshot.datasets.some((dataset) => dataset.id === bidsFixture.summary.id)
        ? bidsFixture.summary.id
        : "missing",
      "ingest spine should surface registered datasets to the operator surfaces"
    ),
    createAssertion(
      "nwb-stream-scan",
      benchmarkInputs.externalNeurodata
        ? "DANDI NWB asset scans into stream-level neurophysiology metadata"
        : "NWB fixture scans into stream-level neurophysiology metadata",
      nwbFixture.summary.streamCount >= 1 &&
        nwbFixture.summary.totalChannels >= 1 &&
        (Boolean(benchmarkInputs.externalNeurodata) ||
          (nwbFixture.summary.primaryRateHz ?? 0) >= 1000),
      benchmarkInputs.externalNeurodata
        ? ">= 1 stream and >= 1 channel"
        : ">= 2 streams, >= 8 channels, primary rate >= 1000 Hz",
      `${nwbFixture.summary.streamCount} streams / ${nwbFixture.summary.totalChannels} channels / ${nwbFixture.summary.primaryRateHz ?? 0} Hz`,
      `${benchmarkInputs.externalNeurodata ? "DANDI" : "fixture"} ${nwbFixture.summary.name} scanned from ${toRelativePublicationPath(nwbFixture.summary.filePath)}`
    ),
    createAssertion(
      "nwb-session-register",
      "NWB neuro session registers into synchronize/decode state",
      finalSnapshot.neuroSessions.some((session) => session.id === nwbFixture.summary.id),
      "session present in snapshot.neuroSessions",
      finalSnapshot.neuroSessions.some((session) => session.id === nwbFixture.summary.id)
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
      (longRunCompactionActive
        ? finalSnapshot.neuroReplays.some(
            (replay) => replay.source === "nwb-replay" && replay.status === "completed"
          )
        : persistedReplayFrameCount > 0 &&
          persistedReplayCompleted &&
          finalSnapshot.neuroReplays.some(
            (replay) => replay.source === "nwb-replay" && replay.status === "completed"
          )),
      longRunCompactionActive
        ? "completed replay retained in bounded soak ledger"
        : "persisted replay frames and a completed replay ledger entry",
      `${persistedReplayFrameCount} persisted frames / ${
        finalSnapshot.neuroReplays.find((replay) => replay.id === replayId)?.status ?? "evicted"
      } live replay state / ${finalSnapshot.neuroReplays.filter((replay) => replay.source === "nwb-replay" && replay.status === "completed").length} completed replays in bounded snapshot`,
      longRunCompactionActive
        ? "hour-class soak runs compact high-volume ingress lineage, so the soak check proves replay completion from the retained bounded ledger rather than the first persisted frame window"
        : "long paced runs can evict early replay windows from bounded live caches, so this check uses durable event lineage plus the bounded replay ledger"
    ),
    createAssertion(
      "live-socket-ingest",
      "Live socket ingress injects a real frame into synchronize/decode",
      (longRunCompactionActive
        ? finalSnapshot.neuroFrames.some((frame) => frame.source === "live-socket") &&
          finalSnapshot.neuroReplays.some((replay) => replay.source === "live-socket")
        : persistedInitialLiveSocketFrameCount > 0 &&
          persistedInitialLiveSocketReplaySeen &&
          finalSnapshot.neuroFrames.some((frame) => frame.source === "live-socket") &&
          finalSnapshot.neuroReplays.some((replay) => replay.source === "live-socket")),
      longRunCompactionActive
        ? "bounded live-socket state present during soak"
        : "persisted live-socket lineage and bounded live-socket state present",
      `${persistedInitialLiveSocketFrameCount} persisted initial frames / ${
        persistedInitialLiveSocketReplaySeen ? "initial replay recorded" : "initial replay missing"
      } / ${finalSnapshot.neuroFrames.filter((frame) => frame.source === "live-socket").length} live frames / ${
        finalSnapshot.neuroReplays.filter((replay) => replay.source === "live-socket").length
      } live sources`,
      longRunCompactionActive
        ? "soak compaction keeps the active live-socket state hot while allowing the first high-volume ingress events to age out of the retained event window"
        : "socket ingress should write durable lineage for the original live source while the bounded snapshot still reflects ongoing live-socket activity"
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
      "the first concrete hardware-transport slice should prove protocol-aware acked bridge delivery instead of only file continuity"
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
          transport.heartbeatTimeoutMs === 5000
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
      "Stale serial heartbeat isolates only the affected device and forces continuity routing",
      isolatedSerialTransport.health === "isolated" &&
        isolatedSerialTransport.isolationActive &&
        isolatedSerialTransport.isolationReason === "heartbeat_timeout" &&
        isolatedDispatchResult.delivery.transport === "file" &&
        isolatedDispatchResult.delivery.policyNote.includes("direct_transport_heartbeat_timeout") &&
        isolatedDispatchResult.delivery.policyNote.includes("file_fallback"),
      "isolated transport with file continuity on stale heartbeat",
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
          transport.kind === "http2-json" &&
          transport.adapterId === "haptic-rig" &&
          transport.vendorId === "immaculate-labs" &&
          transport.modelId === "haptic-rpc-s2" &&
          transport.heartbeatRequired &&
          transport.heartbeatIntervalMs === 20 &&
          transport.heartbeatTimeoutMs >= transport.heartbeatIntervalMs
      ),
      "registered http2-json transport with vendor/model and heartbeat policy",
      actuationTransports
        .map(
          (transport) =>
            `${transport.id}:${transport.kind}:${transport.vendorId ?? "unknown"}:${transport.modelId ?? "unknown"}:${transport.heartbeatIntervalMs}/${transport.heartbeatTimeoutMs}:${transport.health}`
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
      "execution-arbitration-reflex",
      "Execution arbitration can keep a clear high-confidence path reflex-local",
      reflexArbitrationPlan.mode === "reflex-local" &&
        !reflexArbitrationPlan.shouldRunCognition &&
        reflexArbitrationPlan.shouldDispatchActuation &&
        reflexArbitrationPlan.routeModeHint === "reflex-direct" &&
        reflexArbitrationDecision.targetNodeId === "router-core",
      "reflex-local / cognition skipped / dispatch allowed / reflex-direct",
      `${reflexArbitrationPlan.mode} / cognition=${reflexArbitrationPlan.shouldRunCognition} / dispatch=${reflexArbitrationPlan.shouldDispatchActuation}`,
      "the system should not spend cognitive latency when a live reflex path is already strong and governance pressure is clear"
    ),
    createAssertion(
      "execution-arbitration-cognitive",
      "Execution arbitration escalates into cognition when decode confidence drops",
      cognitiveArbitrationPlan.mode === "cognitive-escalation" &&
        cognitiveArbitrationPlan.shouldRunCognition &&
        cognitiveArbitrationPlan.shouldDispatchActuation &&
        cognitiveArbitrationPlan.targetNodeId === "planner-swarm" &&
        cognitiveArbitrationDecision.preferredLayerId === benchmarkMidLayer.id &&
        cognitiveArbitrationDecision.routeModeHint === "cognitive-assisted",
      "cognitive-escalation / planner-swarm / benchmark-layer-mid / cognitive-assisted",
      `${cognitiveArbitrationPlan.mode} / layer=${cognitiveArbitrationDecision.preferredLayerId ?? "none"} / route=${cognitiveArbitrationDecision.routeModeHint}`,
      "when reflex confidence weakens, the system should decide to think before it acts instead of pretending every command belongs in the reflex plane"
    ),
    createAssertion(
      "execution-arbitration-q-governed-local",
      "Execution arbitration records the governed local Q lane as a first-class control signal",
      qGovernedLocalArbitrationPlan.mode === "cognitive-escalation" &&
        qGovernedLocalArbitrationPlan.shouldRunCognition &&
        qGovernedLocalArbitrationPlan.rationale.includes("qLane=local-ready:tracked-q-bundle") &&
        qGovernedLocalArbitrationPlan.rationale.includes("qCloud=blocked:launch-blocked"),
      "cognitive-escalation / qLane local-ready / qCloud blocked",
      qGovernedLocalArbitrationPlan.rationale,
      "Immaculate should perceive Q readiness and cloud blockage before cognition is scheduled, not only after a model call returns"
    ),
    createAssertion(
      "execution-arbitration-guarded",
      "Execution arbitration can hold outward action under critical governance pressure",
      guardedArbitrationPlan.mode === "guarded-review" &&
        guardedArbitrationPlan.shouldRunCognition &&
        !guardedArbitrationPlan.shouldDispatchActuation &&
        guardedArbitrationPlan.routeModeHint === "suppressed" &&
        guardedArbitrationDecision.targetNodeId === "integrity-gate" &&
        guardedArbitrationDecision.governancePressure === "critical",
      "guarded-review / cognition allowed / dispatch held / governance critical",
      `${guardedArbitrationPlan.mode} / cognition=${guardedArbitrationPlan.shouldRunCognition} / dispatch=${guardedArbitrationPlan.shouldDispatchActuation} / governance=${guardedArbitrationDecision.governancePressure}`,
      "critical governance pressure should be able to hold outward action while still allowing bounded internal review"
    ),
    createAssertion(
      "execution-arbitration-spectral-reflex",
      "Execution arbitration stays reflex-local when a strong beta-dominant signal is present",
      spectralReflexArbitrationPlan.mode === "reflex-local" &&
        !spectralReflexArbitrationPlan.shouldRunCognition &&
        spectralReflexArbitrationPlan.shouldDispatchActuation &&
        spectralReflexArbitrationPlan.routeModeHint === "reflex-direct",
      "reflex-local / cognition skipped / dispatch allowed / reflex-direct",
      `${spectralReflexArbitrationPlan.mode} / ${spectralReflexArbitrationPlan.rationale}`,
      "strong clean beta or gamma coupling should keep the decision path local instead of forcing unnecessary cognition"
    ),
    createAssertion(
      "execution-arbitration-spectral-guard",
      "Execution arbitration escalates contaminated spectral windows into guarded review before action",
      spectralArtifactArbitrationPlan.mode === "guarded-review" &&
        spectralArtifactArbitrationPlan.shouldRunCognition &&
        !spectralArtifactArbitrationPlan.shouldDispatchActuation &&
        spectralArtifactArbitrationPlan.routeModeHint === "suppressed",
      "guarded-review / cognition allowed / dispatch held / suppressed",
      `${spectralArtifactArbitrationPlan.mode} / ${spectralArtifactArbitrationPlan.rationale}`,
      "contaminated live windows should move the system into review before outward action is considered"
    ),
    createAssertion(
      "execution-arbitration-federation-pressure",
      "Federated execution pressure can tighten arbitration before any worker is leased",
      federatedArbitrationClearPlan.mode === "cognitive-escalation" &&
        federatedArbitrationClearDecision.federationPressure === "clear" &&
        federatedArbitrationCriticalPlan.mode === "guarded-review" &&
        federatedArbitrationCriticalDecision.federationPressure === "critical" &&
        Boolean(federatedArbitrationCriticalPlan.rationale.includes("federation=critical")),
      "clear federation keeps cognition / critical federation tightens to guarded review",
      `${federatedArbitrationClearPlan.mode} -> ${federatedArbitrationCriticalPlan.mode} / ${federatedArbitrationCriticalPlan.rationale}`,
      "cross-node execution pressure should be able to change whether the system escalates freely or holds for guarded review before placement becomes the only control surface"
    ),
    createAssertion(
      "execution-arbitration-ledger",
      "Execution arbitration persists as a durable snapshot ledger",
      executionArbitrations.length >= 5 &&
        executionArbitrations.some((decision) => decision.id === mediationAllowedDecision.id) &&
        executionArbitrations.some((decision) => decision.id === cognitiveArbitrationDecision.id) &&
        executionArbitrations.some((decision) => decision.id === reflexArbitrationDecision.id) &&
        executionArbitrations.some((decision) => decision.id === spectralArtifactArbitrationDecision.id) &&
        executionArbitrations.some((decision) => decision.id === spectralReflexArbitrationDecision.id),
      ">= 5 execution arbitrations in snapshot ledger",
      `${executionArbitrations.length} arbitrations / latest ${executionArbitrations[0]?.mode ?? "missing"}`,
      "the decision to think, act, or hold has to be durable and replayable if it is going to shape future orchestration"
    ),
    createAssertion(
      "execution-arbitration-latency",
      "Execution arbitration stays inside a sub-12 ms control budget",
      executionArbitrationLatencySeries.p95 <= 12,
      "<= 12 ms p95",
      formatSeries(executionArbitrationLatencySeries),
      "the choice to think before acting has to remain cheap enough to sit in the live orchestration path"
    ),
    createAssertion(
      "execution-schedule-reflex",
      "Execution scheduling keeps a strong clear path out of unnecessary cognition",
      reflexSchedulePlan.mode === "reflex-bypass" &&
        reflexSchedulePlan.layerIds.length === 0 &&
        !reflexSchedulePlan.shouldRunCognition &&
        reflexScheduleDecision.primaryLayerId === undefined,
      "reflex-bypass / 0 layers / cognition skipped",
      `${reflexSchedulePlan.mode} / width=${reflexSchedulePlan.layerIds.length} / cognition=${reflexSchedulePlan.shouldRunCognition}`,
      "strong reflex paths should not silently expand into unnecessary agent formation"
    ),
    createAssertion(
      "execution-schedule-cognitive",
      "Execution scheduling expands low-confidence cognition into a truthful parallel swarm",
      cognitiveSchedulePlan.mode === "swarm-parallel" &&
        cognitiveSchedulePlan.layerIds.length >= 2 &&
        cognitiveSchedulePlan.layerRoles.includes("mid") &&
        cognitiveSchedulePlan.layerRoles.includes("reasoner") &&
        cognitiveScheduleDecision.primaryLayerId === benchmarkLayer.id,
      "swarm-parallel / width >= 2 / includes mid+reasoner / reasoner primary",
      `${cognitiveSchedulePlan.mode} / roles=${cognitiveSchedulePlan.layerRoles.join(">")} / primary=${cognitiveScheduleDecision.primaryLayerId ?? "none"}`,
      "once mediation decides to think, the next step is choosing an intelligence formation instead of a single opaque model call"
    ),
    createAssertion(
      "execution-schedule-q-governed-local",
      "Execution scheduling keeps the governed local Q lane visible in the schedule ledger",
      qGovernedLocalSchedulePlan.mode === "swarm-parallel" &&
        qGovernedLocalSchedulePlan.rationale.includes("qLane=local-ready:tracked-q-bundle") &&
        qGovernedLocalSchedulePlan.rationale.includes("qCloud=blocked:launch-blocked") &&
        qGovernedLocalScheduleDecision.layerIds.length >= 2,
      "swarm-parallel / qLane local-ready / qCloud blocked / width >= 2",
      qGovernedLocalSchedulePlan.rationale,
      "the schedule layer should preserve why Q was trusted locally so later operators can see that the local lane was an intentional orchestration choice"
    ),
    createAssertion(
      "execution-schedule-parallel-latency",
      "Parallel swarm scheduling estimates latency as a real parallel formation instead of a summed sequential stack",
      cognitiveSchedulePlan.estimatedLatencyMs < 3600 &&
        cognitiveSchedulePlan.estimatedLatencyMs < guardedSchedulePlan.estimatedLatencyMs,
      "< 3600 ms and below guarded-swarm estimate",
      `${cognitiveSchedulePlan.estimatedLatencyMs.toFixed(2)} ms / guarded ${guardedSchedulePlan.estimatedLatencyMs.toFixed(2)} ms`,
      "once the runtime is genuinely parallel, the planner latency estimate has to reflect that topology or the schedule ledger is lying"
    ),
    createAssertion(
      "execution-schedule-guarded",
      "Execution scheduling chooses a guarded swarm under critical governance pressure",
      guardedSchedulePlan.mode === "guarded-swarm" &&
        guardedSchedulePlan.layerIds.length >= 2 &&
        guardedSchedulePlan.layerRoles.includes("guard") &&
        !guardedSchedulePlan.shouldDispatchActuation &&
        guardedScheduleDecision.primaryLayerId === benchmarkLayer.id,
      "guarded-swarm / includes guard / dispatch held / reasoner primary",
      `${guardedSchedulePlan.mode} / roles=${guardedSchedulePlan.layerRoles.join(">")} / dispatch=${guardedSchedulePlan.shouldDispatchActuation}`,
      "critical governance pressure should shape which internal formation runs, not just whether outward dispatch is allowed"
    ),
    createAssertion(
      "execution-schedule-spectral-guard",
      "Execution scheduling widens contaminated spectral review into a guarded swarm",
      spectralArtifactSchedulePlan.mode === "guarded-swarm" &&
        spectralArtifactSchedulePlan.layerIds.length >= 2 &&
        spectralArtifactSchedulePlan.layerRoles.includes("guard") &&
        !spectralArtifactSchedulePlan.shouldDispatchActuation,
      "guarded-swarm / width >= 2 / includes guard / dispatch held",
      `${spectralArtifactSchedulePlan.mode} / roles=${spectralArtifactSchedulePlan.layerRoles.join(">")} / dispatch=${spectralArtifactSchedulePlan.shouldDispatchActuation}`,
      "once spectral contamination forces review, the cognitive formation should widen into a guarded internal path instead of a narrow direct lane"
    ),
    createAssertion(
      "execution-schedule-federation-pressure",
      "Federated execution pressure changes swarm topology before placement",
      federatedScheduleClearPlan.mode === "swarm-parallel" &&
        federatedScheduleClearDecision.federationPressure === "clear" &&
        federatedScheduleElevatedPlan.mode === "swarm-sequential" &&
        federatedScheduleElevatedDecision.federationPressure === "elevated" &&
        federatedScheduleCriticalPlan.mode === "single-layer" &&
        federatedScheduleCriticalDecision.federationPressure === "critical" &&
        federatedScheduleClearPlan.estimatedLatencyMs < federatedScheduleElevatedPlan.estimatedLatencyMs,
      "parallel under clear pressure / sequential under elevated / single-layer under critical",
      `${federatedScheduleClearPlan.mode} -> ${federatedScheduleElevatedPlan.mode} -> ${federatedScheduleCriticalPlan.mode}`,
      "cross-node latency and remote failure pressure should change the selected cognition formation itself, not only which worker wins after the plan is already fixed"
    ),
    createAssertion(
      "execution-schedule-admission-control",
      "Execution scheduling records explicit admission control and narrows width as backlog pressure rises",
      federatedScheduleClearPlan.admissionState === "admit" &&
        federatedScheduleClearPlan.backlogPressure === "clear" &&
        federatedScheduleElevatedPlan.admissionState === "degrade" &&
        federatedScheduleElevatedPlan.backlogPressure === "elevated" &&
        federatedScheduleCriticalPlan.admissionState === "degrade" &&
        federatedScheduleCriticalPlan.backlogPressure === "critical" &&
        (federatedScheduleClearPlan.healthWeightedWidth ?? 0) >=
          (federatedScheduleElevatedPlan.healthWeightedWidth ?? 0) &&
        (federatedScheduleElevatedPlan.healthWeightedWidth ?? 0) >=
          (federatedScheduleCriticalPlan.healthWeightedWidth ?? 0),
      "admit under clear / degrade under elevated+critical / health width narrows",
      `${federatedScheduleClearPlan.admissionState}:${federatedScheduleClearPlan.healthWeightedWidth} -> ${federatedScheduleElevatedPlan.admissionState}:${federatedScheduleElevatedPlan.healthWeightedWidth} -> ${federatedScheduleCriticalPlan.admissionState}:${federatedScheduleCriticalPlan.healthWeightedWidth}`,
      "the scheduler needs an explicit admission ledger that shrinks concurrent width under backlog and federation pressure instead of always pretending the original swarm width is still safe"
    ),
    createAssertion(
      "execution-schedule-reliability-floor",
      "Execution scheduling raises the worker reliability floor as pressure increases",
      (federatedScheduleClearPlan.workerReliabilityFloor ?? 0) <
        (federatedScheduleElevatedPlan.workerReliabilityFloor ?? 0) &&
        (federatedScheduleElevatedPlan.workerReliabilityFloor ?? 0) <=
          (federatedScheduleCriticalPlan.workerReliabilityFloor ?? 0),
      "clear floor < elevated floor <= critical floor",
      `${federatedScheduleClearPlan.workerReliabilityFloor ?? "missing"} -> ${federatedScheduleElevatedPlan.workerReliabilityFloor ?? "missing"} -> ${federatedScheduleCriticalPlan.workerReliabilityFloor ?? "missing"}`,
      "health-weighted dispatch is only real once the schedule carries a concrete reliability floor that tightens as pressure rises"
    ),
    createAssertion(
      "execution-schedule-ledger",
      "Execution scheduling persists as a durable snapshot ledger",
      executionSchedules.length >= 4 &&
        executionSchedules.some((schedule) => schedule.id === cognitiveScheduleDecision.id) &&
        executionSchedules.some((schedule) => schedule.id === reflexScheduleDecision.id) &&
        executionSchedules.some((schedule) => schedule.id === guardedScheduleDecision.id) &&
        executionSchedules.some((schedule) => schedule.id === spectralArtifactScheduleDecision.id),
      ">= 4 execution schedules in snapshot ledger",
      `${executionSchedules.length} schedules / latest ${executionSchedules[0]?.mode ?? "missing"}`,
      "agent formation has to be durable and replayable if it is going to shape reasoning before action"
    ),
    createAssertion(
      "execution-schedule-visibility",
      "Execution schedules honor field-level visibility rules",
      intelligenceScopedSchedule.objective === cognitiveScheduleDecision.objective &&
        benchmarkScopedSchedule.objective === "[redacted]" &&
        benchmarkScopedSchedule.rationale === "[redacted]",
      "intelligence scope full / benchmark scope redacted",
      `${intelligenceScopedSchedule.layerIds.length} full / ${benchmarkScopedSchedule.objective}`,
      "operator-visible scheduling should still respect the same field-level consent boundaries as other derived cognition traces"
    ),
    createAssertion(
      "cognitive-loop-structure",
      "Parsed LLM structure yields ROUTE, REASON, and COMMIT fields",
      parsedCognitiveLoop.fieldCount === 3 &&
        parsedCognitiveLoop.routeSuggestion.length > 0 &&
        parsedCognitiveLoop.reasonSummary.length > 0 &&
        parsedCognitiveLoop.commitStatement.length > 0,
      "3 parsed fields from the LLM response",
      `${parsedCognitiveLoop.fieldCount} fields / ${parsedCognitiveLoop.routeSuggestion}`,
      "the benchmark should prove that structured cognition output can be parsed before the next orchestration pass consumes it"
    ),
    createAssertion(
      "cognitive-loop-parse-latency",
      "Parsed LLM structure is extracted inside a low-latency benchmark budget",
      cognitiveLoopParseLatencySeries.p95 <= 8,
      "<= 8 ms parse latency p95",
      formatSeries(cognitiveLoopParseLatencySeries),
      "the route/reason/commit parse has to stay cheap enough to sit on the live orchestration boundary"
    ),
    createAssertion(
      "cognitive-governance-aware",
      "Governance-aware cognition context is present for both clear and critical paths",
      cognitiveGovernanceContextSamples.every((sample) => sample === 1),
      "clear + critical governance context present",
      `${cognitiveGovernanceContextSamples.join(", ")}`,
      "the benchmark should confirm cognition is measured with governance pressure visible in the loop context"
    ),
    createAssertion(
      "cognitive-route-soft-prior",
      "Routing soft prior produces a bounded bias from the parsed route suggestion",
      cognitiveRouteSoftPriorSamples.every((sample) => sample > 0 && sample <= 1),
      "bounded positive bias ratio",
      cognitiveRouteSoftPriorSamples.map((sample) => sample.toFixed(2)).join(", "),
      "parsed route suggestions should become a soft routing prior without overriding transport or governance"
    ),
    createAssertion(
      "mediate-plan-only",
      "Mediation returns plan-only output when dispatchOnApproval is false",
      mediationAllowedPlanOnly.dispatchOnApproval === false &&
        mediationAllowedPlanOnly.routePlan !== undefined &&
        mediationAllowedPlanOnly.routeDecision !== undefined &&
        mediationAllowedPlanOnly.delivery === undefined &&
        mediationAllowedPlanOnly.output === undefined,
      "plan with durable route decision and no delivery/output",
      mediationAllowedPlanOnly.dispatchOnApproval
        ? "unexpected dispatch"
        : mediationAllowedPlanOnly.routeDecision.mode,
      "the mediated API should support a review-only mode that still records the chosen route into durable lineage before outward action is allowed"
    ),
    createAssertion(
      "mediate-dispatch-on-approval",
      "Mediation can complete dispatch and output in a single approval-gated call",
      mediationAllowedPlan.shouldDispatchActuation &&
        mediationAllowedDispatchResult?.delivery.status === "delivered" &&
        mediationAllowedDispatchResult?.output.command === "benchmark:mediate-dispatch" &&
        Boolean(mediationAllowedDispatchResult?.output.dispatchedAt),
      "single-call delivery and output returned",
      `${mediationAllowedDispatchResult?.delivery.status ?? "missing"} / ${mediationAllowedDispatchResult?.output.command ?? "missing"}`,
      "when dispatchOnApproval is true and the guard allows it, mediation should return the delivery and output in the same call"
    ),
    createAssertion(
      "guard-verdict-governance-memory",
      "A blocked guard verdict is recorded into governance memory and raises subsequent pressure",
      mediationBlockedStatus.deniedCount === 1 &&
        mediationBlockedPlan.governancePressure === "elevated" &&
        mediationBlockedDecision.governancePressure === "elevated",
      "guard block increments denied count and elevates pressure",
      `${mediationBlockedStatus.deniedCount} denied / ${mediationBlockedPlan.governancePressure}`,
      "the guard verdict should not remain a dead oracle; it has to feed back into the governance pressure seen by the next mediation pass"
    ),
    createAssertion(
      "worker-assignment-lease-selection",
      "Worker assignment prefers the leased remote worker over expired and local standby lanes",
      workerAssignmentFirst.assignment?.workerId === workerRemotePrimary.workerId &&
        workerAssignmentFirst.assignment?.executionProfile === "remote" &&
        Boolean(workerAssignmentFirst.assignment?.reason.includes("remote-capable")) &&
        Boolean(workerAssignmentFirst.assignment?.reason.includes(benchmarkLayer.id)) &&
        Boolean(workerAssignmentFirst.assignment?.leaseToken) &&
        Boolean(workerAssignmentFirst.assignment?.leaseExpiresAt) &&
        workerAssignmentFirst.workers.some(
          (worker) =>
            worker.workerId === workerRemotePrimary.workerId &&
            worker.assignmentLeaseToken === workerAssignmentFirst.assignment?.leaseToken
        ) &&
        workerRegistrySnapshot.some((worker) => worker.workerId === workerLocalFallback.workerId) &&
        !workerRegistrySnapshot.some((worker) =>
          worker.workerId === `worker-${suiteId}-remote-expired`
        ),
      "leased remote worker selected / expired worker pruned / lease token visible",
      `${workerAssignmentFirst.assignment?.workerId ?? "missing"} / lease ${workerAssignmentFirst.assignment?.leaseToken ?? "missing"} / registry ${workerRegistrySnapshot.length}`,
      "assignment should honor lease windows, prefer the authoritative remote worker, and expose the reserved lease in the registry snapshot"
    ),
    createAssertion(
      "worker-assignment-locality-affinity",
      "Remote worker placement combines verified identity, locality, live peer latency, cost, and device affinity",
      localityAssignment.assignment?.workerId === localityNearWorker.workerId &&
      localityAssignment.assignment?.executionProfile === "remote" &&
        localityAssignment.assignment?.locality === workerLocalityLocalNode.locality &&
        localityAssignment.assignment?.identityVerified === true &&
        localityAssignment.assignment?.peerLeaseStatus === "healthy" &&
        typeof localityAssignment.assignment?.peerObservedLatencyMs === "number" &&
        localityAssignment.assignment.peerObservedLatencyMs < 50 &&
        localityAssignment.assignment.observedLatencyMs ===
          localityAssignment.assignment.peerObservedLatencyMs &&
        (localityAssignment.assignment?.costPerHourUsd ?? Number.POSITIVE_INFINITY) <= 0.5 &&
        Boolean(localityAssignment.assignment?.deviceAffinityTags?.includes("bci")) &&
        Boolean(localityAssignment.assignment?.reason.includes(`locality ${workerLocalityLocalNode.locality}`)) &&
        Boolean(localityAssignment.assignment?.reason.includes("identity verified")) &&
        Boolean(localityAssignment.assignment?.reason.includes("peer lease healthy")) &&
        Boolean(localityAssignment.assignment?.reason.includes("latency")) &&
        Boolean(localityAssignment.assignment?.reason.includes("cost")) &&
        Boolean(localityAssignment.assignment?.reason.includes("affinity")) &&
        localityRegistryAfterFirstAssignment.some(
          (worker) =>
            worker.workerId === localityNearWorker.workerId &&
            worker.assignmentTarget === "planner-swarm"
        ),
      "verified same-locality remote worker wins with low latency, bounded cost, and BCI affinity",
      `${localityAssignment.assignment?.workerId ?? "missing"} / ${localityAssignment.assignment?.reason ?? "missing reason"}`,
      "authenticated federation should make placement truthful by consuming cost and latency as first-class signals instead of treating every healthy remote worker as equivalent"
    ),
    createAssertion(
      "worker-assignment-verified-federation",
      "Unverified remote workers are faulted and excluded from federation placement",
      signedNearNodeVerification.verified &&
        signedFarNodeVerification.verified &&
        localityRegistryAfterFirstAssignment.some(
          (worker) =>
            worker.workerId === `worker-${suiteId}-remote-near-unverified` &&
            worker.healthStatus === "faulted" &&
            worker.assignmentEligible === false &&
            worker.assignmentBlockedReason === "unverified federation worker"
        ),
      "signed node identities verify and unverified worker is faulted",
      `${signedNearNodeVerification.verified}/${signedFarNodeVerification.verified} / ${localityRegistryAfterFirstAssignment.find((worker) => worker.workerId === `worker-${suiteId}-remote-near-unverified`)?.healthStatus ?? "missing"}`,
      "authenticated federation is only real if unsigned remote workers stop being assignable instead of merely ranking lower"
    ),
    createAssertion(
      "federation-peer-renewal",
      "Federation peer lease renewal refreshes trust and smooths live latency instead of freezing a one-shot sync measurement",
      federationPeerAfterRenewal?.status === "healthy" &&
        federationPeerAfterRenewal.leaseStatus === "healthy" &&
        federationPeerAfterRenewal.expectedNodeId === workerLocalityNearNode.nodeId &&
        federationPeerAfterRenewal.lastLeaseSuccessAt === federationRenewedAt &&
        typeof federationPeerAfterRenewal.leaseSmoothedLatencyMs === "number" &&
        federationPeerAfterRenewal.leaseSmoothedLatencyMs > 0 &&
        federationPeerAfterRenewal.leaseSmoothedLatencyMs <
          (federationPeerSuccessFirst.smoothedLatencyMs ?? Number.POSITIVE_INFINITY) &&
        federationPeerAfterRenewal.leaseTrustRemainingMs > 0,
      "renewed success with updated lease-smoothed latency and healthy trust window",
      `${federationPeerAfterRenewal?.status ?? "missing"} / lease-smoothed ${federationPeerAfterRenewal?.leaseSmoothedLatencyMs ?? "missing"} / expected ${workerLocalityNearNode.nodeId}`,
      "federated liveness should be a renewing control signal, not a static latency number captured at topology import time"
    ),
    createAssertion(
      "federation-lease-cadence-adaptive",
      "Lease cadence tightens on remote execution failure and relaxes again on signed recovery",
      federationPeerAdaptiveFailure.leaseRecoveryMode === "recovering" &&
        federationPeerAdaptiveFailure.leaseRefreshIntervalMs <
          federationPeerFarHealthy.leaseRefreshIntervalMs &&
        federationPeerAdaptiveRecovery.leaseRefreshIntervalMs >=
          federationPeerAdaptiveFailure.leaseRefreshIntervalMs &&
        federationPeerAdaptiveRecovery.leaseStatus === "healthy",
      "recovering cadence tightens on failure then relaxes on recovery",
      `${federationPeerFarHealthy.leaseRefreshIntervalMs} -> ${federationPeerAdaptiveFailure.leaseRefreshIntervalMs} -> ${federationPeerAdaptiveRecovery.leaseRefreshIntervalMs}`,
      "signed lease renewal only becomes adaptive once the cadence itself reacts to real remote instability instead of polling forever at a fixed interval"
    ),
    createAssertion(
      "federation-peer-latency-placement-inversion",
      "Live peer latency can invert remote placement across two authenticated peers after lease renewal",
      localityLatencyInversionAssignment.assignment?.workerId === `worker-${suiteId}-remote-far` &&
        localityLatencyInversionAssignment.assignment?.peerId === federationRegisteredFarPeer.peerId &&
        localityLatencyInversionAssignment.assignment?.peerLeaseStatus === "healthy" &&
        (localityLatencyInversionAssignment.assignment?.peerObservedLatencyMs ?? Number.POSITIVE_INFINITY) <
          (federationPeerAfterRenewal?.leaseSmoothedLatencyMs ?? Number.POSITIVE_INFINITY) &&
        typeof federationPeerAfterInversion?.leaseSmoothedLatencyMs === "number" &&
        typeof federationPeerAfterRenewal?.leaseSmoothedLatencyMs === "number" &&
        federationPeerAfterInversion.leaseSmoothedLatencyMs <
          federationPeerAfterRenewal.leaseSmoothedLatencyMs,
      "lower-latency peer wins after live renewal flips the control signal",
      `${localityLatencyInversionAssignment.assignment?.workerId ?? "missing"} / peer ${localityLatencyInversionAssignment.assignment?.peerId ?? "missing"} / ${localityLatencyInversionAssignment.assignment?.reason ?? "missing reason"}`,
      "multi-peer placement is only truthful if renewed peer latency can override stale import-time latency and actually change which remote worker is selected"
    ),
    createAssertion(
      "worker-assignment-outcome-pressure",
      "Remote placement blends live peer latency with measured execution success and failure pressure",
      outcomePressureAssignment.assignment?.workerId === localityNearWorker.workerId &&
        localityWorkerViewsFederationCritical.some(
          (worker) =>
            worker.peerId === federationRegisteredFarPeer.peerId &&
            worker.assignmentEligible === false &&
            worker.assignmentBlockedReason === "peer execution recovering"
        ) &&
        federatedPressureElevated.pressure === "elevated" &&
        federatedPressureCritical.pressure === "critical",
      "failure pressure keeps the stable peer selected and raises federated pressure",
      `${outcomePressureAssignment.assignment?.workerId ?? "missing"} / ${outcomePressureAssignment.assignment?.reason ?? "missing reason"}`,
      "remote workers should stop winning solely on lease latency once real execution failures prove that the peer is unstable under load"
    ),
    createAssertion(
      "federation-peer-stale-eviction-window",
      "Federation peers become faulted when the signed lease window expires without renewal",
      federationPeerAfterFailure.status === "faulted" &&
        federationPeerAfterFailure.leaseStatus === "faulted" &&
        federationPeerAfterFailure.leaseTrustRemainingMs === 0 &&
        federationPeerAfterFailure.lastLeaseError === "lease_timeout",
      "faulted peer after lease trust window expiry",
      `${federationPeerAfterFailure.status} / lease-trust=${federationPeerAfterFailure.leaseTrustRemainingMs} / error=${federationPeerAfterFailure.lastLeaseError ?? "none"}`,
      "a peer that stops renewing signed lease state has to age out of trust before placement keeps using stale remote state"
    ),
    createAssertion(
      "federation-peer-repair-pending",
      "A pending federated repair gates the affected peer out of remote placement and shifts selection to the alternate authenticated peer",
      federationPeerRepairPending.repairStatus === "pending" &&
        federationPeerRepairPending.repairDue &&
        repairPendingAssignment.assignment?.peerId === federationRegisteredFarPeer.peerId &&
        localityWorkerViewsRepairPending.some(
          (worker) =>
            worker.peerId === federationRegisteredNearPeer.peerId &&
            worker.assignmentEligible === false &&
            worker.assignmentBlockedReason === "peer repair pending"
        ),
      "pending repair makes the near peer stale and placement flips to the far peer",
      `${federationPeerRepairPending.repairStatus} / due=${federationPeerRepairPending.repairDue} / assignment=${repairPendingAssignment.assignment?.workerId ?? "null"}`,
      "repair state only has value if it removes the peer from the eligible pool before the runtime keeps sending work into a damaged path"
    ),
    createAssertion(
      "federation-peer-repair-fail-closed",
      "Remote-required placement fails closed once every authenticated remote peer is under repair pressure",
      federationPeerFarRepairPending.repairStatus === "pending" &&
        repairFailClosedAssignment.assignment === null &&
        localityWorkerViewsRepairFailClosed.filter(
          (worker) =>
            worker.executionProfile === "remote" && worker.assignmentEligible === false
        ).length >= 2,
      "both remotes gated and assignment returns null",
      `${federationPeerFarRepairPending.repairStatus} / assignment=${repairFailClosedAssignment.assignment?.workerId ?? "null"}`,
      "fail-closed remote selection should only happen once the pool genuinely has no healthy authenticated peer left"
    ),
    createAssertion(
      "federation-peer-repair-in-progress",
      "A federated repair in progress remains out of placement until the signed repair completes",
      federationPeerRepairing.repairStatus === "repairing" &&
        federationPeerRepairing.repairAttemptCount >= 1 &&
        localityWorkerViewsRepairing.some(
          (worker) =>
            worker.peerId === federationRegisteredNearPeer.peerId &&
            worker.assignmentEligible === false &&
            worker.assignmentBlockedReason === "peer repair in progress"
        ),
      "repairing peer is stale with attempt count >= 1",
      `${federationPeerRepairing.repairStatus} / attempts=${federationPeerRepairing.repairAttemptCount}`,
      "mid-repair peers should stay out of remote placement until the repair loop finishes instead of racing the worker selector"
    ),
    createAssertion(
      "federation-peer-repair-recovery",
      "A successful federated repair clears repair state and restores the stable peer to remote placement",
      federationPeerRepairRecovered.repairStatus === "idle" &&
        federationPeerRepairRecovered.repairDue === false &&
        repairRecoveredAssignment.assignment?.workerId === localityNearWorker.workerId &&
        repairRecoveredAssignment.assignment?.peerId === federationRegisteredNearPeer.peerId,
      "idle repair state and near peer returns as the selected remote worker",
      `${federationPeerRepairRecovered.repairStatus} / due=${federationPeerRepairRecovered.repairDue} / ${repairRecoveredAssignment.assignment?.workerId ?? "missing"}`,
      "the repair loop is only credible if successful repair actually returns the peer to the eligible pool instead of leaving it stuck in a half-recovered state"
    ),
    createAssertion(
      "worker-assignment-duplicate-pressure",
      "Duplicate worker assignment requests are blocked while the leased worker remains reserved",
      workerAssignmentSecond.assignment === null &&
        Boolean(workerAssignmentFirst.assignment?.leaseToken) &&
        workerAssignmentFirst.workers.some(
          (worker) =>
            worker.workerId === workerRemotePrimary.workerId &&
            Boolean(worker.assignmentLeaseToken)
        ),
      "second assignment rejected while lease stays active",
      `${workerAssignmentFirst.assignment?.workerId ?? "missing"} / second ${workerAssignmentSecond.assignment?.workerId ?? "null"}`,
      "a reserved worker lease should make duplicate assignment pressure visible by refusing a second lease while the first remains active"
    ),
    createAssertion(
      "local-worker-slot-pool",
      "A single local host can expose multiple truthful worker slots for parallel swarm reservation",
      localSlotWorkerIds.length === 3 &&
        new Set(localSlotWorkerIds).size === 3 &&
        localSlotAssignments.every(
          (entry) => entry.assignment?.executionProfile === "local"
        ) &&
        localSlotRegistrySnapshot.filter((worker) =>
          worker.assignmentTarget?.startsWith("planner-swarm:slot-")
        ).length === 3,
      "3 distinct local slot leases on one host",
      `${localSlotWorkerIds.join(",")} / assigned=${localSlotRegistrySnapshot.filter((worker) => worker.assignmentTarget?.startsWith("planner-swarm:slot-")).length}`,
      "parallel cognition on a single host needs leaseable local slots rather than a single monolithic local worker record"
    ),
    createAssertion(
      "parallel-swarm-worker-placement",
      "Truthful parallel swarm scheduling places the leased remote worker on the planner-swarm target",
      cognitiveSchedulePlan.mode === "swarm-parallel" &&
        workerAssignmentFirst.assignment?.workerId === workerRemotePrimary.workerId &&
        workerAssignmentFirst.assignment?.executionProfile === "remote" &&
        Boolean(workerAssignmentFirst.assignment?.reason.includes("swarm-offload")) &&
        Boolean(workerAssignmentFirst.assignment?.reason.includes(benchmarkLayer.id)) &&
        workerRegistrySnapshot.some(
          (worker) =>
            worker.workerId === workerRemotePrimary.workerId &&
            worker.assignmentTarget === "planner-swarm"
        ),
      "swarm-parallel / planner-swarm / remote lease / swarm-offload",
      `${cognitiveSchedulePlan.mode} / ${workerAssignmentFirst.assignment?.workerId ?? "missing"} / target planner-swarm`,
      "the benchmark should prove that the parallel swarm plan is not just a label: it must reserve the remote worker against the planner-swarm target and record that placement in the worker registry"
    ),
    createAssertion(
      "mediate-session-binding-allowed",
      "Session-bound mediation resolves cleanly when explicit sources and session scope align",
      sessionBoundExplicitAllowed.allowed &&
        sessionBoundExplicitAllowed.reason === "session_bound" &&
        sessionBoundExplicitAllowed.resolvedSessionId === mediationSessionId,
      "explicit session-bound sources allowed",
      `${sessionBoundExplicitAllowed.reason} / ${sessionBoundExplicitAllowed.resolvedSessionId ?? "missing"}`,
      "session scope should allow explicit frame and execution sources when they belong to the same session"
    ),
    createAssertion(
      "mediate-session-binding-omitted-fail-closed",
      "Mediation fails closed when explicit sources are omitted and the default sources point across session scope",
      !sessionBoundOmittedBlocked.allowed &&
        sessionBoundOmittedBlocked.reason === "ambiguous_source_scope_mismatch" &&
        sessionBoundOmittedBlocked.resolvedSessionId === foreignSessionId,
      "blocked on ambiguous cross-session defaults",
      `${sessionBoundOmittedBlocked.reason} / ${sessionBoundOmittedBlocked.resolvedSessionId ?? "missing"}`,
      "ambiguous mediation sources should not fall through to a foreign session just because defaults exist"
    ),
    createAssertion(
      "mediate-session-binding-explicit-mismatch",
      "Mediation fails closed when explicit sources or session scope do not match",
      !sessionBoundExplicitMismatchBlocked.allowed &&
        (sessionBoundExplicitMismatchBlocked.reason === "resource_scope_mismatch" ||
          sessionBoundExplicitMismatchBlocked.reason === "source_scope_mismatch") &&
        sessionBoundExplicitMismatchBlocked.resolvedSessionId === foreignSessionId,
      "blocked on explicit cross-session mismatch",
      `${sessionBoundExplicitMismatchBlocked.reason} / ${sessionBoundExplicitMismatchBlocked.resolvedSessionId ?? "missing"}`,
      "explicitly mismatched source/session combinations should fail closed rather than dispatching across the wrong scope"
    ),
    createAssertion(
      "multi-role-conversation-ledger",
      "Multi-role conversation execution is represented as a durable ledger shape in the benchmark",
      clearTier1Conversation.turns.length === 4 &&
        guardedTier1Conversation.turns.length === 4 &&
        clearTier1Conversation.order === "mid>soul>reasoner>guard" &&
        guardedTier1Conversation.order === "mid>soul>reasoner>guard",
      "two four-turn ledgers with stable order",
      `${clearTier1Conversation.order} / ${guardedTier1Conversation.order}`,
      "the benchmark should make the multi-role path explicit before the runtime executor is widened"
    ),
    createAssertion(
      "multi-role-conversation-verdict",
      "Conversation verdicts resolve to approved on clear pressure and blocked on critical pressure",
      clearTier1Conversation.verdict === "approved" &&
        guardedTier1Conversation.verdict === "blocked" &&
        clearTier1Conversation.turns[3]?.verdict === "approved" &&
        guardedTier1Conversation.turns[3]?.verdict === "blocked",
      "approved + blocked verdicts",
      `${clearTier1Conversation.verdict} / ${guardedTier1Conversation.verdict}`,
      "the benchmark should show that the final guard role can close the loop with an explicit verdict"
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
      "routing-guarded-review",
      "Adaptive routing flips to the guarded visual review lane under critical governance pressure",
      guardedFallbackPlan.mode === "guarded-fallback" &&
        guardedFallbackPlan.channel === "visual" &&
        guardedFallbackPlan.targetNodeId === "integrity-gate" &&
        guardedFallbackPlan.selectedTransport?.kind === "udp-osc" &&
        guardedFallbackDecision.mode === "guarded-fallback" &&
        guardedFallbackDecision.transportKind === "udp-osc" &&
        guardedFallbackDecision.governancePressure === "critical" &&
        guardedFallbackDispatchResult.delivery.transport === "udp-osc",
      "guarded visual review lane / integrity-gate / udp-osc / governance critical",
      `${guardedFallbackDecision.mode === "guarded-fallback" ? "guarded-review" : guardedFallbackDecision.mode} / ${guardedFallbackDecision.channel} / ${guardedFallbackDecision.transportKind ?? "none"} / ${guardedFallbackDecision.governancePressure}`,
      "route selection should react to governance pressure and deliberately shift to a safer outward lane rather than pretending transport health is the only signal"
    ),
    createAssertion(
      "routing-federated-pressure",
      "Adaptive routing can react to degraded federated execution pressure instead of only transport pressure",
      federatedRoutePressurePlan.mode === "guarded-fallback" &&
        federatedRoutePressurePlan.federationPressure === "critical" &&
        Boolean(federatedRoutePressurePlan.rationale.includes("federation=critical")),
      "guarded review lane under critical federated pressure",
      `${federatedRoutePressurePlan.mode === "guarded-fallback" ? "guarded-review" : federatedRoutePressurePlan.mode} / ${federatedRoutePressurePlan.rationale}`,
      "once remote swarm execution becomes unstable, the route layer should be able to bias toward guarded output even when transport availability itself has not changed"
    ),
    createAssertion(
      "routing-q-governed-local",
      "Adaptive routing makes the governed local Q lane explicit when Q readiness and substrate health are green",
      (qGovernedLocalRoutePlan.mode === "cognitive-assisted" || qGovernedLocalRoutePlan.mode === "reflex-direct") &&
        (qGovernedLocalRoutePlan.channel === "visual" || qGovernedLocalRoutePlan.channel === "haptic") &&
        Boolean(
          qGovernedLocalRoutePlan.rationale.includes(
            `qLane=local-ready:${releaseMetadata.q.trainingLock?.bundleId ?? "tracked"}`
          )
        ),
      "reflex-direct or cognitive-assisted with explicit qLane local-ready rationale",
      `${qGovernedLocalRoutePlan.mode} / ${qGovernedLocalRoutePlan.channel} / ${qGovernedLocalRoutePlan.rationale}`,
      "Immaculate should make Q readiness visible to routing so the healthy governed local lane becomes an explicit control signal even when stronger reflex evidence still outranks cognitive routing"
    ),
    createAssertion(
      "routing-ledger",
      "Routing decisions persist as auditable snapshot and event lineage",
      routingDecisions.length >= 3 &&
        routingDecisions.some((decision) => decision.id === preferredRouteDecision.id) &&
        routingDecisions.some((decision) => decision.id === mediationAllowedPlanOnly.routeDecision.id) &&
        routingDecisions.some((decision) => decision.id === guardedFallbackDecision.id) &&
        persistedRoutingEvents.length >= 3 &&
        persistedRoutingEvents.at(-1)?.schema.name === "immaculate.routing.decision",
      ">= 3 routing decisions in snapshot and persisted event ledger",
      `${routingDecisions.length} snapshot decisions / ${routingEvents.length} in-memory events / ${persistedRoutingEvents.length} persisted routing events / latest ${routingDecisions[0]?.mode ?? "missing"}`,
      "long paced runs can roll routing events out of the bounded in-memory tail, so durability must be proven against the persisted lineage rather than the hot cache alone"
    ),
    createAssertion(
      "tier2-band-dominance",
      "Tier 2 neuro windows surface clear band dominance across alpha, beta, and gamma windows",
      tier2BandDominanceSamples.length === 3 &&
        tier2BandDominanceSamples.every((sample) => sample >= 0.55) &&
        tier2BandDominanceSamples[1] >= tier2BandDominanceSamples[0] &&
        tier2BandDominanceSamples[1] >= tier2BandDominanceSamples[2],
      "three dominant windows with beta strongest",
      `${tier2BandDominanceSamples.map((sample) => sample.toFixed(2)).join(" / ")}`,
      "Tier 2 samples should be long enough for the band extractor to produce a stable dominant band and ratio"
    ),
    createAssertion(
      "tier2-phase-bias",
      "Tier 2 neural coupling lifts the route phase bias most strongly on the beta-dominant window",
      tier2RouteBiasSamples.length === 3 &&
        tier2RouteBiasSamples[1] > tier2RouteBiasSamples[0] &&
        tier2RouteBiasSamples[1] > tier2RouteBiasSamples[2],
      "beta window should maximize route bias",
      `${tier2RouteBiasSamples.map((sample) => sample.toFixed(2)).join(" / ")}`,
      "route bias should track the beta-dominant window because the coupling map feeds beta into the route phase"
    ),
    createAssertion(
      "tier2-neuro-coupled-routing",
      "Tier 2 neuro-coupled routing keeps the beta window reflex-direct with a stronger coupling score than the surrounding windows",
      tier2RouteModes.length === 3 &&
        tier2RouteModes[1] === "reflex-direct" &&
        tier2NeuroCoupledRoutingSamples[1] > tier2NeuroCoupledRoutingSamples[0] &&
        tier2NeuroCoupledRoutingSamples[1] > tier2NeuroCoupledRoutingSamples[2],
      "beta reflex-direct with strongest coupled routing score",
      `${tier2RouteModes.join(" / ")} / ${tier2NeuroCoupledRoutingSamples.map((sample) => sample.toFixed(2)).join(" / ")}`,
      "the coupled route should reflect the live neural coupling state rather than only the transport registry"
    ),
    createAssertion(
      "tier2-legacy-amplitude",
      "Tier 2 live neuro ingest preserves confidence through the legacy amplitude path when spectral bands are unavailable",
      liveIngressResult.frame.bandPower === undefined &&
        liveIngressResult.frame.decodeConfidence >= 0.55 &&
        liveIngressResult.frame.decodeReady,
      "decode confidence remains available through the legacy amplitude path",
      `${liveIngressResult.frame.bandPower === undefined ? "no bandPower" : "bandPower"} / ${liveIngressResult.frame.decodeConfidence.toFixed(2)}`,
      "small or undersampled windows should preserve the legacy amplitude path so live ingest remains backward compatible"
    ),
    createAssertion(
      "tier2-spectral-confidence",
      "Tier 2 spectral confidence suppresses 60Hz artifact windows and preserves clean alpha windows",
      tier2ArtifactBands.totalPower > 0 &&
        tier2ArtifactBands.artifactPower / tier2ArtifactBands.totalPower >= 0.75 &&
        tier2ArtifactBands.gamma <= 0.05 &&
        tier2ArtifactFrame.decodeConfidence < 0.4 &&
        tier2AlphaBands.alpha >= 0.5 &&
        tier2AlphaFrame.decodeConfidence > 0.65 &&
        tier2AlphaFrame.decodeConfidence > tier2ArtifactFrame.decodeConfidence,
      "artifact-dominant frame suppressed, alpha frame preserved",
      `${(tier2ArtifactBands.artifactPower / Math.max(tier2ArtifactBands.totalPower, 1)).toFixed(2)} artifact / ${tier2ArtifactFrame.decodeConfidence.toFixed(2)} artifact confidence / ${tier2AlphaFrame.decodeConfidence.toFixed(2)} alpha confidence`,
      "spectral confidence should penalize artifact-heavy windows while still admitting clean neural rhythm windows"
    ),
    createAssertion(
      "tier2-spectral-routing-pressure",
      "Tier 2 spectral confidence pushes artifact windows onto safer routes while preserving stronger alpha routing",
      tier2ArtifactRoutePlan.mode === "guarded-fallback" &&
        tier2ArtifactRoutePlan.channel === "visual" &&
        tier2ArtifactRoutePlan.recommendedIntensity < tier2AlphaRoutePlan.recommendedIntensity &&
        tier2AlphaRoutePlan.mode !== "suppressed",
      "artifact guarded review lane with weaker intensity than alpha",
      `${tier2ArtifactRoutePlan.mode}/${tier2ArtifactRoutePlan.channel}/${tier2ArtifactRoutePlan.recommendedIntensity.toFixed(2)} vs ${tier2AlphaRoutePlan.mode}/${tier2AlphaRoutePlan.channel}/${tier2AlphaRoutePlan.recommendedIntensity.toFixed(2)}`,
      "spectral quality should influence route pressure directly so contaminated windows de-escalate before outward action"
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
      "Default snapshot projection redacts derived neuro features, cognitive previews, scheduling rationale, and actuation commands",
      redactedSnapshot.neuroFrames.every(
        (frame) =>
          frame.bandPower === undefined &&
          frame.decodeConfidence === 0 &&
          frame.meanAbs === 0
      ) &&
        redactedSnapshot.neuralCoupling.dominantRatio === 0 &&
        redactedSnapshot.neuralCoupling.decodeConfidence === 0 &&
        redactedSnapshot.cognitiveExecutions.every(
          (execution) =>
            execution.objective === "[redacted]" &&
            execution.responsePreview === "[redacted]"
        ) &&
        redactedSnapshot.executionSchedules.every(
          (schedule) => schedule.objective === "[redacted]" && schedule.rationale === "[redacted]"
        ) &&
        redactedSnapshot.actuationOutputs.every(
          (output) => output.command === "[redacted]" && output.intensity === 0
        ),
      "derived neuro values zeroed, cognitive previews redacted, schedule rationale withheld, actuation commands withheld",
      `${redactedSnapshot.neuroFrames[0]?.decodeConfidence ?? 0} neuro confidence / ${redactedSnapshot.cognitiveExecutions[0]?.responsePreview ?? "missing"} cognitive preview / ${redactedSnapshot.executionSchedules[0]?.objective ?? "missing"} schedule / ${redactedSnapshot.actuationOutputs[0]?.command ?? "missing"} actuation`,
      "default operator snapshots should not leak derived neural metrics, model response traces, scheduling rationale, or outbound actuation commands"
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
      "Session-scoped neuro feature reads retain full derived metrics while benchmark and audit scopes expose bounded and full views respectively",
      sessionScopedFrame.decodeConfidence === visibilityFrame.decodeConfidence &&
        sessionScopedFrame.bandPower?.dominantBand === visibilityFrame.bandPower?.dominantBand &&
        auditScopedFrame.decodeConfidence === visibilityFrame.decodeConfidence &&
        auditScopedFrame.bandPower?.dominantBand === visibilityFrame.bandPower?.dominantBand &&
        benchmarkScopedFrame.decodeConfidence === visibilityFrame.decodeConfidence &&
        benchmarkScopedFrame.meanAbs === 0 &&
        benchmarkScopedFrame.rms === 0 &&
        benchmarkScopedFrame.peak === 0 &&
        benchmarkScopedFrame.bandPower?.dominantBand === visibilityFrame.bandPower?.dominantBand &&
        benchmarkScopedFrame.bandPower?.delta === 0 &&
        benchmarkScopedFrame.bandPower?.artifactPower === 0 &&
        benchmarkScopedFrame.bandPower?.totalPower === 0 &&
        benchmarkScopedFrame.bandPower?.dominantRatio === visibilityFrame.bandPower?.dominantRatio,
      "session and audit scope full, benchmark scope bounded",
      `${sessionScopedFrame.decodeConfidence.toFixed(2)} full / ${benchmarkScopedFrame.bandPower?.dominantBand ?? "missing"} bounded / ${auditScopedFrame.bandPower?.dominantBand ?? "missing"} audit`,
      "derived neuro features should only fully surface under session or subject consent, while benchmark scope retains bounded band-dominance data"
    ),
    createAssertion(
      "neural-coupling-visibility",
      "Phase-level neural coupling is hidden by default and preserved in benchmark and audit scopes with bounded projections",
      redactedSnapshot.neuralCoupling.dominantRatio === 0 &&
        redactedSnapshot.neuralCoupling.decodeConfidence === 0 &&
        benchmarkScopedSnapshot.neuralCoupling.sourceFrameId === undefined &&
        benchmarkScopedSnapshot.neuralCoupling.dominantBand === engine.getSnapshot().neuralCoupling.dominantBand &&
        benchmarkScopedSnapshot.neuralCoupling.phaseBias.route ===
          Number(engine.getSnapshot().neuralCoupling.phaseBias.route.toFixed(6)) &&
        auditScopedSnapshot.neuralCoupling.sourceFrameId === engine.getSnapshot().neuralCoupling.sourceFrameId &&
        auditScopedSnapshot.neuralCoupling.dominantRatio === engine.getSnapshot().neuralCoupling.dominantRatio,
      "redacted hidden / benchmark bounded / audit full",
      `${redactedSnapshot.neuralCoupling.dominantRatio.toFixed(2)} hidden / ${benchmarkScopedSnapshot.neuralCoupling.phaseBias.route.toFixed(2)} benchmark / ${auditScopedSnapshot.neuralCoupling.phaseBias.route.toFixed(2)} audit`,
      "neural coupling should not leak through redacted reads, but benchmark and audit readers need enough signal to inspect phase bias and routing influence"
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
    ),
    createAssertion(
      "throughput-floor",
      "Throughput p50 stays above operating floor",
      throughputSeries.p50 >= 800,
      ">= 800 ops/s p50",
      formatSeries(throughputSeries),
      "the 205-multiplier throughput model must sustain a measurable operating floor across a full benchmark run"
    ),
    createAssertion(
      "measured-event-throughput-reported",
      "Measured event throughput is reported from actual wall-clock runtime",
      measuredEventThroughputSeries.p50 > 0 && actualWallClockDurationMs > 0,
      "> 0 events/s from wall-clock duration",
      `${measuredEventThroughputSeries.p50.toFixed(2)} events/s over ${actualWallClockDurationMs.toFixed(2)} ms from ${measuredEventCount} cumulative events`,
      "benchmark credibility depends on reporting observed event throughput from the cumulative durable event count, not only a capped in-memory tail"
    ),
    createAssertion(
      "wall-clock-duration-truth",
      "Paced benchmark packs honor their planned wall-clock duration",
      !realTimePacing || wallClockTruthSeries.p50 >= 0.95,
      realTimePacing ? ">= 0.95 planned-duration ratio" : "not required for unpaced smoke/gate packs",
      `${wallClockTruthSeries.p50.toFixed(4)} ratio`,
      realTimePacing
        ? "benchmark and soak lanes must actually spend the wall-clock time they claim to spend"
        : "smoke/gate lanes are allowed to finish early because they do not claim full-duration soak coverage"
    ),
    createAssertion(
      "measured-event-throughput-floor",
      "High-throughput benchmark lanes sustain their configured event-rate floor",
      !pack.targetMeasuredEventThroughput ||
        measuredEventThroughputSeries.p50 >= pack.targetMeasuredEventThroughput,
      pack.targetMeasuredEventThroughput
        ? `>= ${pack.targetMeasuredEventThroughput} events/s`
        : "not configured for this pack",
      `${measuredEventThroughputSeries.p50.toFixed(2)} events/s`,
      pack.targetMeasuredEventThroughput
        ? "paced benchmark and soak lanes should sustain a real measured event rate floor, not only a control-loop throughput estimate"
        : "this pack does not claim a sustained event-throughput floor"
    ),
    createAssertion(
      "coherence-stable",
      "Coherence reaches the stability pole threshold during the run",
      pack.id !== "substrate-readiness" || coherenceSeries.max >= STABILITY_POLE,
      pack.id === "substrate-readiness"
        ? `>= ${STABILITY_POLE} coherence max (STABILITY_POLE)`
        : "not required outside substrate-readiness",
      formatSeries(coherenceSeries),
      "the stability-pole requirement is a substrate-readiness claim; other packs keep reporting coherence, but they do not all promise to crest the same threshold"
    ),
    createAssertion(
      "prediction-error-bounded",
      "Prediction error stays bounded after adaptive timing settles",
      predictionErrorSeries.p95 <= 0.65,
      "<= 0.65 p95",
      formatSeries(predictionErrorSeries),
      "adaptive phase increments should keep latency surprise bounded instead of letting the controller drift unmeasured"
    ),
    createAssertion(
      "external-neurodata-openneuro",
      "External neurodata packs ingest a real OpenNeuro BIDS slice with measured MB/s and events/s",
      pack.id !== "neurodata-external" ||
        (openNeuroIngestMbSeries.p50 > 0 &&
          openNeuroIngestEventSeries.p50 > 0 &&
          benchmarkInputs.externalNeurodata !== undefined),
      "positive OpenNeuro MB/s and events/s",
      `${openNeuroIngestMbSeries.p50.toFixed(2)} MB/s / ${openNeuroIngestEventSeries.p50.toFixed(2)} events/s`,
      "credibility for neurodata buyers depends on a real OpenNeuro ingest path, not only local toy fixtures"
    ),
    createAssertion(
      "external-neurodata-dandi",
      "External neurodata packs ingest a real DANDI NWB asset with measured MB/s and events/s",
      pack.id !== "neurodata-external" ||
        (dandiIngestMbSeries.p50 > 0 &&
          dandiIngestEventSeries.p50 > 0 &&
          benchmarkInputs.externalNeurodata !== undefined),
      "positive DANDI MB/s and events/s",
      `${dandiIngestMbSeries.p50.toFixed(2)} MB/s / ${dandiIngestEventSeries.p50.toFixed(2)} events/s`,
      "the external NWB benchmark must run against a real DANDI asset and expose honest ingest rates"
    ),
    createAssertion(
      "temporal-baseline-executes",
      "Temporal baseline executes a real workflow side by side with Immaculate",
      pack.id !== "temporal-baseline" ||
        (temporalBaselineLatencySeries.p50 > 0 && immaculateBaselineLatencySeries.p50 > 0),
      "positive wall-clock samples for Temporal and Immaculate",
      `${immaculateBaselineLatencySeries.p50.toFixed(2)} ms vs ${temporalBaselineLatencySeries.p50.toFixed(2)} ms`,
      "the comparison only becomes credible once both systems actually execute the same simple workflow boundary"
    ),
    createAssertion(
      "temporal-baseline-story",
      "Temporal baseline captures the honest workflow-execution story without pretending governance semantics are the same",
      pack.id !== "temporal-baseline" ||
        (temporalBaselineLatencySeries.p50 > 0 &&
          temporalBaselineRssSeries.p50 > 0 &&
          immaculateBaselineRssSeries.p50 > 0),
      "wall-clock plus RSS measured for both systems",
      `${immaculateBaselineRssSeries.p50.toFixed(2)} MiB vs ${temporalBaselineRssSeries.p50.toFixed(2)} MiB`,
      "Temporal is the control for raw workflow execution; Immaculate's differentiator remains verify gates, arbitration, governance, and durable semantic ledgers on the execution path"
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
    runKind,
    profile: `${engine.getSnapshot().profile} / ${runKind} / ${hardwareContext.platform}-${hardwareContext.arch}`,
      summary:
      `This ${runKind} publication benchmarks the real orchestration substrate that exists today: phase execution, verify gating, persistence, checkpoint recovery, integrity validation, replayed NWB windows, live socket neuro ingress, protocol-aware actuation, execution arbitration that decides when the system should think before acting, execution scheduling that chooses single-layer versus swarm formation before cognition runs, Tier 1 cognitive-loop closure coverage for parsed ROUTE/REASON/COMMIT structure, Tier 2 neural-coupling coverage for band dominance, phase bias, and coupled routing strength, governance-aware cognition, routing soft priors, and multi-role conversation verdicts, authoritative worker-assignment coverage with lease visibility, adaptive federated execution pressure that blends signed lease renewal with live cross-node latency and remote execution success/failure, bounded federated retry-and-repair coverage that proves pending/repairing peers fall out of placement and only rejoin after signed repair success, supervised serial and HTTP/2 direct device transports, and explicit session-bound source safety for mediated dispatch decisions that react to transport health, decode confidence, governance pressure, consent scope, and federated execution pressure. ${describeBenchmarkTiming(pack)} ${liveFramesPerTick > 0 ? `It injected ${liveFramesPerTick} extra live frames per tick to sustain measurable event pressure.` : ""} ${benchmarkInputs.externalNeurodata ? `This run resolved a real OpenNeuro slice (${benchmarkInputs.externalNeurodata.openNeuroDatasetId}:${benchmarkInputs.externalNeurodata.openNeuroSnapshotTag}) and a real DANDI NWB asset (${benchmarkInputs.externalNeurodata.dandiDandisetId}:${benchmarkInputs.externalNeurodata.dandiVersion}) before scanning and replaying them locally.` : "It does not yet claim external neurodata or BCI decoding performance."} ${pack.id === "temporal-baseline" ? "It also executes an honest side-by-side Temporal workflow baseline for pure ingest-process-commit-verify wall-clock and memory comparison." : ""} Hardware context: ${formatBenchmarkHardwareContext(hardwareContext)}.`,
    tickIntervalMs,
    totalTicks,
    plannedDurationMs,
    totalDurationMs: actualWallClockDurationMs,
    checkpointCount: cleanStatus.checkpointCount,
    recoveryMode: recoveryStatus.recoveryMode,
    recovered: recoveryStatus.recovered,
    integrity: recoveredIntegrity,
    hardwareContext,
    series: [
      reflexSeries,
      cognitiveSeries,
      throughputSeries,
      measuredEventThroughputSeries,
      wallClockTruthSeries,
      coherenceSeries,
      predictionErrorSeries,
      freeEnergyProxySeries,
      cognitiveLoopParseLatencySeries,
      cognitiveLoopStructureSeries,
      cognitiveGovernanceContextSeries,
      cognitiveRouteSoftPriorSeries,
      workerLocalityAffinitySeries,
      federationPeerLatencySeries,
      federationPeerPlacementSeries,
      federationExecutionPressureSeries,
      federationRemoteSuccessSeries,
      federationLeaseCadenceSeries,
      federationRepairStateSeries,
      federationRepairAttemptSeries,
      orchestrationCrossNodeBiasSeries,
      multiRoleConversationLatencySeries,
      multiRoleConversationTurnSeries,
      multiRoleConversationVerdictSeries,
      executionArbitrationLatencySeries,
      executionArbitrationCognitionSeries,
      executionScheduleWidthSeries,
      executionScheduleSwarmSeries,
      decodeConfidenceSeries,
      syncJitterSeries,
      tier2BandDominanceSeries,
      tier2PhaseBiasSeries,
      tier2NeuroCoupledRoutingSeries,
      openNeuroIngestMbSeries,
      openNeuroIngestEventSeries,
      dandiIngestMbSeries,
      dandiIngestEventSeries,
      immaculateBaselineLatencySeries,
      temporalBaselineLatencySeries,
      immaculateBaselineRssSeries,
      temporalBaselineRssSeries
    ],
    assertions,
    progress: createProgress({
      runKind,
      hardwareContext,
      realTimePacing,
      liveFramesPerTick
    }),
    attribution: BENCHMARK_ATTRIBUTION,
    comparison: previousReport
      ? compareBenchmarkReports(
          previousReport,
          [
            reflexSeries,
            cognitiveSeries,
            throughputSeries,
            ...(realTimePacing ? [measuredEventThroughputSeries] : []),
            ...(realTimePacing ? [wallClockTruthSeries] : []),
            coherenceSeries,
            predictionErrorSeries,
            freeEnergyProxySeries,
            cognitiveLoopStructureSeries,
            cognitiveGovernanceContextSeries,
            cognitiveRouteSoftPriorSeries,
            workerLocalityAffinitySeries,
            federationPeerLatencySeries,
            federationPeerPlacementSeries,
            federationExecutionPressureSeries,
            federationRemoteSuccessSeries,
            federationLeaseCadenceSeries,
            federationRepairStateSeries,
            federationRepairAttemptSeries,
            orchestrationCrossNodeBiasSeries,
            multiRoleConversationTurnSeries,
            multiRoleConversationVerdictSeries,
            executionArbitrationCognitionSeries,
            executionScheduleWidthSeries,
            executionScheduleSwarmSeries,
            decodeConfidenceSeries,
            syncJitterSeries,
            tier2BandDominanceSeries,
            tier2PhaseBiasSeries,
            tier2NeuroCoupledRoutingSeries,
            openNeuroIngestMbSeries,
            openNeuroIngestEventSeries,
            dandiIngestMbSeries,
            dandiIngestEventSeries,
            immaculateBaselineLatencySeries,
            temporalBaselineLatencySeries,
            immaculateBaselineRssSeries,
            temporalBaselineRssSeries
          ]
        )
      : undefined
  };

  return publishBenchmarkReport(report);
}
