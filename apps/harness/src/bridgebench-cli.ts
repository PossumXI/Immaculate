import { runBridgeBench } from "./bridgebench.js";

async function main(): Promise<void> {
  const report = await runBridgeBench();
  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        qModelName: report.qModelName,
        modelCount: report.models.length,
        bridgeSuiteId: report.bridgeRuntime.suiteId,
        bridgeFailedAssertions: report.bridgeRuntime.failedAssertions,
        output: report.output
      },
      null,
      2
    )
  );

  if (
    report.bridgeRuntime.failedAssertions > 0 ||
    report.bridgeRuntime.selectedAssertions.some((assertion) => assertion.status === "fail")
  ) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "BridgeBench failed.");
  process.exitCode = 1;
});
