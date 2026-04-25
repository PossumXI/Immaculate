import type { BenchmarkPackId } from "@immaculate/core";
import { listBenchmarkPacks } from "./benchmark-packs.js";

export type BenchmarkCliFlags = {
  packId?: BenchmarkPackId;
  publishWandb: boolean;
};

function isTruthyFlag(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function parseBenchmarkCliFlags(
  argv: string[],
  env: Record<string, string | undefined> = process.env
): BenchmarkCliFlags {
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

  const envPackId = (env.IMMACULATE_BENCHMARK_PACK ?? env.npm_config_pack)?.trim();
  if (!flags.packId && envPackId && knownPackIds.has(envPackId as BenchmarkPackId)) {
    flags.packId = envPackId as BenchmarkPackId;
  }

  if (
    !flags.publishWandb &&
    (isTruthyFlag(env.IMMACULATE_PUBLISH_WANDB) ||
      isTruthyFlag(env.npm_config_publish_wandb) ||
      isTruthyFlag(env.npm_config_publishWandb))
  ) {
    flags.publishWandb = true;
  }

  return flags;
}
