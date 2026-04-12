import type { BenchmarkPackId } from "@immaculate/core";

export type BenchmarkPack = {
  id: BenchmarkPackId;
  label: string;
  description: string;
  tickIntervalMs: number;
  maxTicks: number;
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
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 2
  },
  {
    id: "latency-soak",
    label: "Latency Soak",
    description:
      "Higher-frequency pack that stresses reflex and cognitive latency consistency across more ticks.",
    tickIntervalMs: 20,
    maxTicks: 640,
    reflexP95MaxMs: 100,
    cognitiveP95MaxMs: 250,
    maxRegressedSeries: 0,
    percentRegressionTolerance: 2
  }
];

export function listBenchmarkPacks(): BenchmarkPack[] {
  return benchmarkPacks.map((pack) => ({ ...pack }));
}

export function getBenchmarkPack(packId: BenchmarkPackId): BenchmarkPack {
  const pack = benchmarkPacks.find((candidate) => candidate.id === packId);
  if (!pack) {
    throw new Error(`Unknown benchmark pack: ${packId}`);
  }
  return pack;
}
