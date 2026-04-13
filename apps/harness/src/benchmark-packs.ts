import type { BenchmarkPackId, BenchmarkRunKind } from "@immaculate/core";

export type BenchmarkPack = {
  id: BenchmarkPackId;
  label: string;
  description: string;
  reportRunKind?: BenchmarkRunKind;
  reportPlannedDurationMs?: number;
  tickIntervalMs: number;
  maxTicks: number;
  ciEligible: boolean;
  completionStrategy: "checkpoint-ready" | "full-duration";
  realTimePacing: boolean;
  persistEveryTicks: number;
  liveFramesPerTick: number;
  targetMeasuredEventThroughput?: number;
  reflexP95MaxMs: number;
  cognitiveP95MaxMs: number;
  maxRegressedSeries: number;
  percentRegressionTolerance: number;
};

export const benchmarkPacks: BenchmarkPack[] = [
  {
    id: "substrate-readiness",
    label: "Substrate Readiness",
    description:
      "Default release-readiness pack covering canonical phase execution, verify gating, checkpointing, and recovery.",
    tickIntervalMs: 40,
    maxTicks: 320,
    ciEligible: true,
    completionStrategy: "checkpoint-ready",
    realTimePacing: false,
    persistEveryTicks: 1,
    liveFramesPerTick: 0,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 2
  },
  {
    id: "durability-recovery",
    label: "Durability Recovery",
    description:
      "Longer-run durability pack focused on checkpoint production, replay recovery, and integrity continuity across more cycles.",
    tickIntervalMs: 40,
    maxTicks: 520,
    ciEligible: true,
    completionStrategy: "checkpoint-ready",
    realTimePacing: false,
    persistEveryTicks: 1,
    liveFramesPerTick: 0,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 2
  },
  {
    id: "durability-torture",
    label: "Durability Torture",
    description:
      "Crash-supervised durability lane that injects repeated hard failures, corruption, and write faults against a shared runtime directory before forcing recovery.",
    reportRunKind: "benchmark",
    reportPlannedDurationMs: 0,
    tickIntervalMs: 10,
    maxTicks: 1000,
    ciEligible: false,
    completionStrategy: "checkpoint-ready",
    realTimePacing: false,
    persistEveryTicks: 1,
    liveFramesPerTick: 0,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 5
  },
  {
    id: "latency-soak",
    label: "Latency Smoke",
    description:
      "Higher-frequency short-run pack that stresses reflex and cognitive latency consistency without claiming long-horizon soak coverage.",
    tickIntervalMs: 20,
    maxTicks: 640,
    ciEligible: true,
    completionStrategy: "checkpoint-ready",
    realTimePacing: false,
    persistEveryTicks: 1,
    liveFramesPerTick: 0,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 2
  },
  {
    id: "latency-benchmark-60s",
    label: "Latency Benchmark (60s)",
    description:
      "Paced benchmark-class run that holds the harness on a real 60-second wall-clock and sustains high live-ingest event pressure.",
    tickIntervalMs: 20,
    maxTicks: 3000,
    ciEligible: false,
    completionStrategy: "full-duration",
    realTimePacing: true,
    persistEveryTicks: 25,
    liveFramesPerTick: 12,
    targetMeasuredEventThroughput: 1000,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 5
  },
  {
    id: "latency-soak-60m",
    label: "Latency Soak (60m)",
    description:
      "Paced 60-minute soak lane for long-run latency percentiles, sustained event throughput, and durability under real wall-clock pressure.",
    tickIntervalMs: 20,
    maxTicks: 180000,
    ciEligible: false,
    completionStrategy: "full-duration",
    realTimePacing: true,
    persistEveryTicks: 50,
    liveFramesPerTick: 12,
    targetMeasuredEventThroughput: 1000,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 5
  },
  {
    id: "neurodata-external",
    label: "External Neurodata Ingest",
    description:
      "External-data credibility lane that downloads a real OpenNeuro BIDS slice and a real DANDI NWB asset, then measures ingest MB/s and events/s honestly.",
    reportRunKind: "benchmark",
    reportPlannedDurationMs: 0,
    tickIntervalMs: 20,
    maxTicks: 960,
    ciEligible: false,
    completionStrategy: "checkpoint-ready",
    realTimePacing: false,
    persistEveryTicks: 1,
    liveFramesPerTick: 0,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 5
  },
  {
    id: "temporal-baseline",
    label: "Temporal Baseline",
    description:
      "Opt-in comparative lane that runs a minimal ingest-process-commit-verify workflow through Temporal alongside Immaculate and reports wall-clock plus memory honestly.",
    reportRunKind: "benchmark",
    reportPlannedDurationMs: 0,
    tickIntervalMs: 20,
    maxTicks: 960,
    ciEligible: false,
    completionStrategy: "checkpoint-ready",
    realTimePacing: false,
    persistEveryTicks: 1,
    liveFramesPerTick: 0,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 5
  }
];

export function listBenchmarkPacks(): BenchmarkPack[] {
  return benchmarkPacks.map((pack) => ({ ...pack }));
}

export function listBenchmarkGatePacks(): BenchmarkPack[] {
  return benchmarkPacks.filter((pack) => pack.ciEligible).map((pack) => ({ ...pack }));
}

export function getBenchmarkPack(packId: BenchmarkPackId): BenchmarkPack {
  const pack = benchmarkPacks.find((candidate) => candidate.id === packId);
  if (!pack) {
    throw new Error(`Unknown benchmark pack: ${packId}`);
  }
  return pack;
}
