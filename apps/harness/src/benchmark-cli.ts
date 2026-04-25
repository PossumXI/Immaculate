import { parseBenchmarkCliFlags } from "./benchmark-cli-flags.js";
import { runPublishedBenchmark } from "./benchmark.js";
import { publishBenchmarkToWandb } from "./wandb.js";

async function main(): Promise<void> {
  const flags = parseBenchmarkCliFlags(process.argv.slice(2));
  const report = await runPublishedBenchmark({
    packId: flags.packId
  });
  const wandb = flags.publishWandb ? await publishBenchmarkToWandb(report) : undefined;

  console.log(
    JSON.stringify(
      {
        suiteId: report.suiteId,
        generatedAt: report.generatedAt,
        packId: report.packId,
        packLabel: report.packLabel,
        runKind: report.runKind,
        plannedDurationMs: report.plannedDurationMs,
        totalDurationMs: report.totalDurationMs,
        recoveryMode: report.recoveryMode,
        integrityStatus: report.integrity.status,
        failedAssertions: report.assertions.filter((assertion) => assertion.status === "fail").length,
        publication: report.publication,
        wandb
      },
      null,
      2
    )
  );

  if (report.assertions.some((assertion) => assertion.status === "fail")) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Benchmark CLI failed.");
  process.exitCode = 1;
});
