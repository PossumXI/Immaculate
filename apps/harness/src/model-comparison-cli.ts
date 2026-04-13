import { runModelComparison } from "./model-comparison.js";

async function main(): Promise<void> {
  const report = await runModelComparison();
  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        qAlias: report.qAlias,
        modelCount: report.models.length,
        topModel: report.models[0]
          ? {
              model: report.models[0].truthfulLabel,
              parseSuccessRate: report.models[0].parseSuccessRate,
              p95LatencyMs: report.models[0].p95LatencyMs
            }
          : null,
        output: report.output
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Model comparison failed.");
  process.exitCode = 1;
});
