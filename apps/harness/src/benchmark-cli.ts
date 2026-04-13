import type { BenchmarkPackId } from "@immaculate/core";
import { runPublishedBenchmark } from "./benchmark.js";
import { listBenchmarkPacks } from "./benchmark-packs.js";
import { publishBenchmarkToWandb } from "./wandb.js";

type BenchmarkCliFlags = {
  packId?: BenchmarkPackId;
  publishWandb: boolean;
};

function parseFlags(argv: string[]): BenchmarkCliFlags {
  const knownPackIds = new Set(listBenchmarkPacks().map((pack) => pack.id));
  const flags: BenchmarkCliFlags = {
    publishWandb: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--publish-wandb" || token === "--publishWandb") {
      flags.publishWandb = true;
      continue;
    }
    if (token.startsWith("--pack=")) {
      const value = token.slice("--pack=".length).trim();
      if (knownPackIds.has(value as BenchmarkPackId)) {
        flags.packId = value as BenchmarkPackId;
      }
      continue;
    }
    if (token === "--pack") {
      const value = argv[index + 1]?.trim();
      if (value && knownPackIds.has(value as BenchmarkPackId)) {
        flags.packId = value as BenchmarkPackId;
        index += 1;
      }
    }
  }

  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
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
