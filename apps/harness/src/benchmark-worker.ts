import { type BenchmarkPackId } from "@immaculate/core";
import { runPublishedBenchmark } from "./benchmark.js";
import { listBenchmarkPacks } from "./benchmark-packs.js";
import { publishBenchmarkToWandb } from "./wandb.js";

type BenchmarkWorkerFlags = {
  packId?: BenchmarkPackId;
  publishWandb: boolean;
};

function parseFlags(argv: string[]): BenchmarkWorkerFlags {
  const knownPackIds = new Set(listBenchmarkPacks().map((pack) => pack.id));
  const flags: BenchmarkWorkerFlags = {
    publishWandb: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--packId") {
      const value = argv[index + 1];
      if (value && knownPackIds.has(value as BenchmarkPackId)) {
        flags.packId = value as BenchmarkPackId;
        index += 1;
      }
      continue;
    }

    if (token === "--publishWandb") {
      flags.publishWandb = true;
    }
  }

  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const benchmark = await runPublishedBenchmark({
    packId: flags.packId
  });
  const wandb = flags.publishWandb
    ? await publishBenchmarkToWandb(benchmark)
    : undefined;

  process.stdout.write(
    JSON.stringify({
      benchmark,
      wandb
    })
  );
}

void main().catch((error) => {
  process.stderr.write(
    error instanceof Error ? error.message : "Benchmark worker failed."
  );
  process.exitCode = 1;
});
