import test from "node:test";
import assert from "node:assert/strict";
import { buildBenchmarkWorkerSpawnPlan } from "./benchmark-worker-spawn.js";

test("benchmark worker spawn plan uses Node without a shell in TypeScript runtime", () => {
  const plan = buildBenchmarkWorkerSpawnPlan({
    isTsRuntime: true,
    workerPath: "D:/repo/apps/harness/src/benchmark-worker.ts",
    workerArgs: ["--packId", "latency-soak-30m;&whoami", "--publishWandb"],
    nodeExecPath: "node"
  });

  assert.equal(plan.command, "node");
  assert.deepEqual(plan.args, [
    "--import",
    "tsx",
    "D:/repo/apps/harness/src/benchmark-worker.ts",
    "--packId",
    "latency-soak-30m;&whoami",
    "--publishWandb"
  ]);
  assert.equal(plan.args.includes("/c"), false);
});

test("benchmark worker spawn plan runs built JavaScript directly", () => {
  const plan = buildBenchmarkWorkerSpawnPlan({
    isTsRuntime: false,
    workerPath: "D:/repo/apps/harness/dist/benchmark-worker.js",
    workerArgs: ["--packId", "q-gateway-substrate"],
    nodeExecPath: "node"
  });

  assert.equal(plan.command, "node");
  assert.deepEqual(plan.args, [
    "D:/repo/apps/harness/dist/benchmark-worker.js",
    "--packId",
    "q-gateway-substrate"
  ]);
});
