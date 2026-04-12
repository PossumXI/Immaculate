import type { BenchmarkPackId, BenchmarkReport } from "@immaculate/core";
import {
  getBenchmarkPack,
  listBenchmarkGatePacks,
  listBenchmarkPacks,
  type BenchmarkPack
} from "./benchmark-packs.js";
import { runPublishedBenchmark } from "./benchmark.js";

export type BenchmarkGateViolation = {
  packId: BenchmarkPackId;
  level: "fail" | "warning";
  source: "assertion" | "budget" | "trend";
  metric: string;
  message: string;
};

export type BenchmarkGateResult = {
  generatedAt: string;
  passed: boolean;
  runCount: number;
  violationCount: number;
  reports: BenchmarkReport[];
  violations: BenchmarkGateViolation[];
};

export function parseBenchmarkGatePackIds(argv: string[]): BenchmarkPackId[] {
  const packArgs = argv
    .flatMap((argument) => {
      if (argument.startsWith("--packs=")) {
        return argument.slice("--packs=".length).split(",");
      }
      if (argument === "--all") {
        return listBenchmarkGatePacks().map((pack) => pack.id);
      }
      if (argument.startsWith("--pack=")) {
        return [argument.slice("--pack=".length)];
      }
      return [];
    })
    .map((value) => value.trim())
    .filter(Boolean);

  const uniquePackIds = Array.from(new Set(packArgs));
  if (uniquePackIds.length === 0) {
    return ["substrate-readiness"];
  }

  return uniquePackIds.map((packId) => getBenchmarkPack(packId as BenchmarkPackId).id);
}

function seriesAverage(report: BenchmarkReport, seriesId: string): number {
  return report.series.find((series) => series.id === seriesId)?.p95 ?? 0;
}

function evaluateReport(pack: BenchmarkPack, report: BenchmarkReport): BenchmarkGateViolation[] {
  const violations: BenchmarkGateViolation[] = [];

  for (const assertion of report.assertions) {
    if (assertion.status === "fail") {
      violations.push({
        packId: pack.id,
        level: "fail",
        source: "assertion",
        metric: assertion.id,
        message: `${assertion.label} failed: ${assertion.detail}`
      });
    }
  }

  const reflexP95 = seriesAverage(report, "reflex_latency_ms");
  if (reflexP95 > pack.reflexP95MaxMs) {
    violations.push({
      packId: pack.id,
      level: "fail",
      source: "budget",
      metric: "reflex_latency_ms",
      message: `reflex p95 ${reflexP95.toFixed(2)} ms exceeds ${pack.reflexP95MaxMs} ms budget`
    });
  }

  const cognitiveP95 = seriesAverage(report, "cognitive_latency_ms");
  if (cognitiveP95 > pack.cognitiveP95MaxMs) {
    violations.push({
      packId: pack.id,
      level: "fail",
      source: "budget",
      metric: "cognitive_latency_ms",
      message: `cognitive p95 ${cognitiveP95.toFixed(2)} ms exceeds ${pack.cognitiveP95MaxMs} ms budget`
    });
  }

  const meaningfulRegressions =
    report.comparison?.deltas.filter(
      (delta) =>
        delta.trend === "regressed" &&
        Math.abs(delta.percentDelta) > pack.percentRegressionTolerance
    ) ?? [];

  if (meaningfulRegressions.length > pack.maxRegressedSeries) {
    for (const regression of meaningfulRegressions) {
      violations.push({
        packId: pack.id,
        level: "fail",
        source: "trend",
        metric: regression.seriesId,
        message: `${regression.label} regressed by ${regression.percentDelta.toFixed(2)}% vs ${report.comparison?.previousSuiteId}`
      });
    }
  }

  return violations;
}

export async function runBenchmarkGate(packIds: BenchmarkPackId[]): Promise<BenchmarkGateResult> {
  const reports: BenchmarkReport[] = [];
  const violations: BenchmarkGateViolation[] = [];

  for (const packId of packIds) {
    const pack = getBenchmarkPack(packId);
    const report = await runPublishedBenchmark({
      packId: pack.id,
      tickIntervalMs: pack.tickIntervalMs,
      maxTicks: pack.maxTicks
    });
    reports.push(report);
    violations.push(...evaluateReport(pack, report));
  }

  return {
    generatedAt: new Date().toISOString(),
    passed: violations.length === 0,
    runCount: reports.length,
    violationCount: violations.length,
    reports,
    violations
  };
}
