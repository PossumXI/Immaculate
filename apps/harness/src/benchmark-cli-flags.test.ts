import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseBenchmarkCliFlags } from "./benchmark-cli-flags.js";

test("benchmark CLI accepts direct pack and W&B flags", () => {
  const flags = parseBenchmarkCliFlags(["--pack=durability-recovery", "--publish-wandb"], {});

  assert.equal(flags.packId, "durability-recovery");
  assert.equal(flags.publishWandb, true);
});

test("benchmark CLI reads npm config flags when npm does not forward argv", () => {
  const flags = parseBenchmarkCliFlags([], {
    npm_config_pack: "temporal-baseline",
    npm_config_publish_wandb: "true"
  });

  assert.equal(flags.packId, "temporal-baseline");
  assert.equal(flags.publishWandb, true);
});

test("benchmark CLI prefers explicit argv over environment pack", () => {
  const flags = parseBenchmarkCliFlags(["--pack", "neurodata-external"], {
    IMMACULATE_BENCHMARK_PACK: "durability-recovery"
  });

  assert.equal(flags.packId, "neurodata-external");
});

test("benchmark CLI tolerates npm separator argv", () => {
  const flags = parseBenchmarkCliFlags(["--", "--pack=q-gateway-substrate"], {});

  assert.equal(flags.packId, "q-gateway-substrate");
});

test("root benchmark aliases forward pack selection to the harness benchmark CLI", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const benchmarkAliases = Object.entries(packageJson.scripts ?? {}).filter(
    ([name, command]) =>
      name.startsWith("benchmark:") &&
      command.includes("npm run benchmark -w @immaculate/harness") &&
      command.includes("--pack=")
  );

  assert.ok(benchmarkAliases.length > 0);
  for (const [name, command] of benchmarkAliases) {
    assert.match(
      command,
      /npm run benchmark -w @immaculate\/harness -- --pack=[^\s]+/,
      name
    );
  }
});
