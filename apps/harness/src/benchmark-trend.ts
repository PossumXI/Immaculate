import type { BenchmarkPackId, BenchmarkReport } from "@immaculate/core";
import { getBenchmarkPack, listBenchmarkPacks } from "./benchmark-packs.js";
import {
  loadLatestBenchmarkReportForPack,
  loadPublishedBenchmarkIndex,
  loadPublishedBenchmarkReportBySuiteId
} from "./benchmark.js";

export type BenchmarkTrendVerdict = "improving" | "stable" | "warning" | "critical";

export type BenchmarkTrendPoint = {
  suiteId: string;
  generatedAt: string;
  packId: BenchmarkPackId;
  packLabel: string;
  runKind: BenchmarkReport["runKind"];
  failedAssertions: number;
  integrityStatus: BenchmarkReport["integrity"]["status"];
  wallClockDurationMs: number;
  primaryMetricId: string;
  primaryMetricLabel: string;
  primaryMetricValue: number;
  reflexP95Ms?: number;
  cognitiveP95Ms?: number;
  throughputP50?: number;
  measuredEventThroughputP50?: number;
  predictionErrorP95?: number;
  freeEnergyProxyP50?: number;
};

export type BenchmarkTrendResult = {
  packId: BenchmarkPackId;
  packLabel: string;
  analysisBasis: "published_run_order";
  window: number;
  sampleCount: number;
  primaryMetricId: string;
  primaryMetricLabel: string;
  lowerIsBetter: boolean;
  slope: number;
  normalizedSlope: number;
  rSquared: number;
  cusum: number;
  sigma: number;
  verdict: BenchmarkTrendVerdict;
  latestSuiteId?: string;
  latestGeneratedAt?: string;
  latestFailedAssertions?: number;
  latestIntegrityStatus?: BenchmarkReport["integrity"]["status"];
  points: BenchmarkTrendPoint[];
};

type SelectedMetric = {
  id: string;
  label: string;
  value: number;
  lowerIsBetter: boolean;
};

function selectSeries(report: BenchmarkReport, seriesId: string) {
  return report.series.find((series) => series.id === seriesId);
}

function selectPrimaryMetric(report: BenchmarkReport): SelectedMetric {
  if (report.packId === "durability-torture") {
    const series = selectSeries(report, "durability_iteration_wall_clock_ms");
    return {
      id: "durability_iteration_wall_clock_ms",
      label: "Durability Iteration Wall Clock",
      value: series?.p95 ?? report.totalDurationMs,
      lowerIsBetter: true
    };
  }

  if (report.packId === "neurodata-external") {
    const dandi = selectSeries(report, "dandi_ingest_mb_s");
    const openNeuro = selectSeries(report, "openneuro_ingest_mb_s");
    return {
      id: "external_neurodata_ingest_mb_s",
      label: "External Neurodata Ingest Throughput",
      value: Number(((dandi?.p50 ?? 0) + (openNeuro?.p50 ?? 0)).toFixed(6)),
      lowerIsBetter: false
    };
  }

  if (report.packId === "temporal-baseline") {
    const series = selectSeries(report, "immaculate_baseline_wall_clock_ms");
    return {
      id: "immaculate_baseline_wall_clock_ms",
      label: "Immaculate Baseline Wall Clock",
      value: series?.p50 ?? report.totalDurationMs,
      lowerIsBetter: true
    };
  }

  const reflexLatency = selectSeries(report, "reflex_latency_ms");
  return {
    id: "reflex_latency_ms",
    label: "Reflex Latency",
    value: reflexLatency?.p95 ?? report.totalDurationMs,
    lowerIsBetter: true
  };
}

function calculateLinearRegression(values: number[]): {
  slope: number;
  rSquared: number;
} {
  if (values.length < 2) {
    return {
      slope: 0,
      rSquared: 0
    };
  }

  const xs = values.map((_, index) => index);
  const n = values.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;
  let totalVariance = 0;
  let explainedVariance = 0;

  for (let index = 0; index < values.length; index += 1) {
    const x = xs[index] ?? index;
    const y = values[index] ?? 0;
    numerator += (x - meanX) * (y - meanY);
    denominator += (x - meanX) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  for (let index = 0; index < values.length; index += 1) {
    const x = xs[index] ?? index;
    const y = values[index] ?? 0;
    const predicted = slope * x + intercept;
    totalVariance += (y - meanY) ** 2;
    explainedVariance += (predicted - meanY) ** 2;
  }

  return {
    slope: Number(slope.toFixed(6)),
    rSquared:
      totalVariance === 0 ? 0 : Number(Math.max(0, explainedVariance / totalVariance).toFixed(6))
  };
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Number(Math.sqrt(Math.max(variance, 0)).toFixed(6));
}

function calculateCusum(values: number[], lowerIsBetter: boolean): number {
  if (values.length < 3) {
    return 0;
  }
  const baselineWindow = values.slice(0, Math.max(3, Math.floor(values.length / 2)));
  const baselineMean =
    baselineWindow.reduce((sum, value) => sum + value, 0) / baselineWindow.length;
  let positive = 0;
  let negative = 0;
  let maxMagnitude = 0;

  for (const value of values) {
    const deviation = value - baselineMean;
    const signed = lowerIsBetter ? deviation : -deviation;
    positive = Math.max(0, positive + signed);
    negative = Math.min(0, negative + signed);
    maxMagnitude = Math.max(maxMagnitude, Math.abs(positive), Math.abs(negative));
  }

  return Number(maxMagnitude.toFixed(6));
}

function classifyTrend(
  points: BenchmarkTrendPoint[],
  slope: number,
  normalizedSlope: number,
  rSquared: number,
  cusum: number,
  sigma: number,
  lowerIsBetter: boolean
): BenchmarkTrendVerdict {
  if (points.some((point) => point.failedAssertions > 0 || point.integrityStatus !== "verified")) {
    return "critical";
  }

  if (points.length < 3) {
    return "stable";
  }

  const signalStrong = rSquared >= 0.45;
  const driftCritical = sigma > 0 && cusum >= sigma * 4;
  const driftWarning = sigma > 0 && cusum >= sigma * 2.5;
  const worsening = lowerIsBetter ? normalizedSlope > 0.015 : normalizedSlope < -0.015;
  const improving = lowerIsBetter ? normalizedSlope < -0.01 : normalizedSlope > 0.01;

  if (driftCritical || (signalStrong && worsening && Math.abs(normalizedSlope) >= 0.03)) {
    return "critical";
  }
  if (driftWarning || (signalStrong && worsening)) {
    return "warning";
  }
  if (signalStrong && improving) {
    return "improving";
  }
  return "stable";
}

function buildTrendPoint(report: BenchmarkReport): BenchmarkTrendPoint {
  const primaryMetric = selectPrimaryMetric(report);
  return {
    suiteId: report.suiteId,
    generatedAt: report.generatedAt,
    packId: report.packId,
    packLabel: report.packLabel,
    runKind: report.runKind,
    failedAssertions: report.assertions.filter((assertion) => assertion.status === "fail").length,
    integrityStatus: report.integrity.status,
    wallClockDurationMs: report.totalDurationMs,
    primaryMetricId: primaryMetric.id,
    primaryMetricLabel: primaryMetric.label,
    primaryMetricValue: Number(primaryMetric.value.toFixed(6)),
    reflexP95Ms: selectSeries(report, "reflex_latency_ms")?.p95,
    cognitiveP95Ms: selectSeries(report, "cognitive_latency_ms")?.p95,
    throughputP50: selectSeries(report, "throughput_ops_s")?.p50,
    measuredEventThroughputP50: selectSeries(report, "event_throughput_events_s")?.p50,
    predictionErrorP95: selectSeries(report, "prediction_error")?.p95,
    freeEnergyProxyP50: selectSeries(report, "free_energy_proxy")?.p50
  };
}

async function loadReportsSequentially(entries: Array<{ suiteId: string }>): Promise<BenchmarkReport[]> {
  const reports: BenchmarkReport[] = [];
  for (const entry of entries) {
    const report = await loadPublishedBenchmarkReportBySuiteId(entry.suiteId);
    if (report) {
      reports.push(report);
    }
  }
  return reports;
}

export async function loadBenchmarkTrend(
  packId: BenchmarkPackId,
  requestedWindow = 20
): Promise<BenchmarkTrendResult> {
  const pack = getBenchmarkPack(packId);
  const window = Math.max(3, Math.min(64, Number.isFinite(requestedWindow) ? requestedWindow : 20));
  const index = await loadPublishedBenchmarkIndex();
  const entries = index.entries.filter((entry) => entry.packId === packId).slice(0, window).reverse();
  const reports = await loadReportsSequentially(entries);
  const points = reports.map(buildTrendPoint);
  const latest = points.at(-1);
  const primaryMetric = latest
    ? {
        id: latest.primaryMetricId,
        label: latest.primaryMetricLabel,
        lowerIsBetter: selectPrimaryMetric(reports.at(-1) as BenchmarkReport).lowerIsBetter
      }
    : {
        id: "reflex_latency_ms",
        label: "Reflex Latency",
        lowerIsBetter: true
      };
  const values = points.map((point) => point.primaryMetricValue);
  const { slope, rSquared } = calculateLinearRegression(values);
  const sigma = calculateStandardDeviation(values);
  const cusum = calculateCusum(values, primaryMetric.lowerIsBetter);
  const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const normalizedSlope = mean === 0 ? 0 : Number((slope / Math.abs(mean)).toFixed(6));
  const verdict = classifyTrend(
    points,
    slope,
    normalizedSlope,
    rSquared,
    cusum,
    sigma,
    primaryMetric.lowerIsBetter
  );

  return {
    packId,
    packLabel: pack.label,
    analysisBasis: "published_run_order",
    window,
    sampleCount: points.length,
    primaryMetricId: primaryMetric.id,
    primaryMetricLabel: primaryMetric.label,
    lowerIsBetter: primaryMetric.lowerIsBetter,
    slope,
    normalizedSlope,
    rSquared,
    cusum,
    sigma,
    verdict,
    latestSuiteId: latest?.suiteId,
    latestGeneratedAt: latest?.generatedAt,
    latestFailedAssertions: latest?.failedAssertions,
    latestIntegrityStatus: latest?.integrityStatus,
    points: points.reverse()
  };
}

export async function loadAllBenchmarkTrends(requestedWindow = 20): Promise<BenchmarkTrendResult[]> {
  const history = await loadPublishedBenchmarkIndex();
  const packIds = new Set<BenchmarkPackId>(history.entries.map((entry) => entry.packId));
  const orderedPackIds = listBenchmarkPacks()
    .map((pack) => pack.id)
    .filter((packId) => packIds.has(packId));
  const trends: BenchmarkTrendResult[] = [];
  for (const packId of orderedPackIds) {
    trends.push(await loadBenchmarkTrend(packId, requestedWindow));
  }
  return trends;
}

export async function loadLatestBenchmarkTrend(
  packId: BenchmarkPackId
): Promise<BenchmarkTrendResult | null> {
  const latest = await loadLatestBenchmarkReportForPack(packId);
  if (!latest) {
    return null;
  }
  return loadBenchmarkTrend(packId, 20);
}
