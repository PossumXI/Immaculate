import { loadPublishedBenchmarkReport, loadPublishedBenchmarkReportBySuiteId } from "./benchmark.js";
import { inspectWandbStatus, publishBenchmarkToWandb } from "./wandb.js";

function parseSuiteId(argv: string[]): string | undefined {
  const suiteIndex = argv.findIndex((argument) => argument === "--suite");
  if (suiteIndex >= 0) {
    return argv[suiteIndex + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const suiteId = parseSuiteId(process.argv.slice(2));
  const status = await inspectWandbStatus();

  if (!status.sdkInstalled) {
    throw new Error(
      `W&B SDK is not installed for ${status.pythonPath}. Run .\\scripts\\bootstrap-wandb.ps1 first.`
    );
  }

  if (!status.ready) {
    throw new Error(status.note);
  }

  const report = suiteId
    ? await loadPublishedBenchmarkReportBySuiteId(suiteId)
    : await loadPublishedBenchmarkReport();

  if (!report) {
    throw new Error(suiteId ? `Benchmark suite ${suiteId} was not found.` : "No published benchmark exists yet.");
  }

  const publication = await publishBenchmarkToWandb(report);
  console.log(JSON.stringify(publication, null, 2));
}

void main();
