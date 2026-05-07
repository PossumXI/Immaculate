import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveStartupTracePath } from "./startup-trace.js";

test("defaults startup traces into ignored runtime state", () => {
  assert.equal(
    resolveStartupTracePath({ cwd: "C:\\repo\\apps\\harness" }),
    path.join("C:\\repo\\apps\\harness", ".runtime", "startup-trace.ndjson")
  );
});

test("honors explicit Immaculate runtime directories for startup traces", () => {
  assert.equal(
    resolveStartupTracePath({ runtimeDir: "D:\\immaculate-runtime" }),
    path.join("D:\\immaculate-runtime", "startup-trace.ndjson")
  );
});
