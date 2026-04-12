import { runPublishedBenchmark } from "./benchmark.js";

const report = await runPublishedBenchmark();

const failedAssertions = report.assertions.filter((assertion) => assertion.status === "fail");

console.log(
  JSON.stringify(
    {
      suiteId: report.suiteId,
      generatedAt: report.generatedAt,
      recoveryMode: report.recoveryMode,
      integrityStatus: report.integrity.status,
      checkpointCount: report.checkpointCount,
      failedAssertions: failedAssertions.length,
      publication: report.publication
    },
    null,
    2
  )
);

if (failedAssertions.length > 0) {
  process.exitCode = 1;
}
