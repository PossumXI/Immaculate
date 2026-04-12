import { parseBenchmarkGatePackIds, runBenchmarkGate } from "./benchmark-gate.js";

const packIds = parseBenchmarkGatePackIds(process.argv.slice(2));
const result = await runBenchmarkGate(packIds);

console.log(
  JSON.stringify(
    {
      generatedAt: result.generatedAt,
      passed: result.passed,
      runCount: result.runCount,
      violationCount: result.violationCount,
      packs: result.reports.map((report) => ({
        suiteId: report.suiteId,
        packId: report.packId,
        packLabel: report.packLabel,
        failedAssertions: report.assertions.filter((assertion) => assertion.status === "fail").length,
        comparisonRegressions:
          report.comparison?.deltas.filter((delta) => delta.trend === "regressed").length ?? 0
      })),
      violations: result.violations
    },
    null,
    2
  )
);

if (!result.passed) {
  process.exitCode = 1;
}
