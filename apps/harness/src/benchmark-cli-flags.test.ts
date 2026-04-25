import assert from "node:assert/strict";
import test from "node:test";
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
