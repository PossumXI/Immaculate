import { runHarborSoak } from "./harbor-soak.js";

type SoakFlags = {
  durationSeconds?: number;
  runtimeRoot?: string;
  outputJsonPath?: string;
  collectOnly?: boolean;
};

function parseFlags(argv: string[]): SoakFlags {
  const flags: SoakFlags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--collect-only") {
      flags.collectOnly = true;
      continue;
    }
    if (token === "--runtime-root") {
      flags.runtimeRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--runtime-root=")) {
      flags.runtimeRoot = token.slice("--runtime-root=".length);
      continue;
    }
    if (token === "--output-json-path") {
      flags.outputJsonPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--output-json-path=")) {
      flags.outputJsonPath = token.slice("--output-json-path=".length);
      continue;
    }
    if (token.startsWith("--duration-seconds=")) {
      const value = Number(token.slice("--duration-seconds=".length));
      if (Number.isFinite(value) && value > 0) {
        flags.durationSeconds = value;
      }
      continue;
    }
    if (token === "--duration-seconds" || token === "--duration") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        flags.durationSeconds = value;
      }
      index += 1;
    }
  }
  return flags;
}

function formatOptionalNumber(value: number | undefined): string {
  return typeof value === "number" ? value.toFixed(3) : "n/a";
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const report = await runHarborSoak({
    durationSeconds: flags.durationSeconds,
    runtimeRoot: flags.runtimeRoot,
    outputJsonPath: flags.outputJsonPath,
    collectOnly: flags.collectOnly
  });

  const summary = {
    generatedAt: report.generatedAt,
    durationSeconds: report.durationSeconds,
    elapsedSeconds: report.elapsedSeconds,
    deadlineAt: report.deadlineAt,
    totalRuns: report.summary.totalRuns,
    oracle: {
      runs: report.summary.oracle.runs,
      scoreAverage: formatOptionalNumber(report.summary.oracle.scoreAverage),
      durationAverageSec: formatOptionalNumber(report.summary.oracle.durationAverageSec),
      durationTotalSec: report.summary.oracle.durationTotalSec.toFixed(2)
    },
    q: {
      runs: report.summary.q.runs,
      scoreAverage: formatOptionalNumber(report.summary.q.scoreAverage),
      durationAverageSec: formatOptionalNumber(report.summary.q.durationAverageSec),
      durationTotalSec: report.summary.q.durationTotalSec.toFixed(2)
    },
    overall: {
      runs: report.summary.overall.runs,
      scoreAverage: formatOptionalNumber(report.summary.overall.scoreAverage),
      durationAverageSec: formatOptionalNumber(report.summary.overall.durationAverageSec),
      durationTotalSec: report.summary.overall.durationTotalSec.toFixed(2)
    },
    output: report.output.jsonPath
  };

  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Harbor soak runner failed.");
  process.exitCode = 1;
});
