import test from "node:test";
import assert from "node:assert/strict";
import { parseSoakOptions } from "./bridgebench-soak.js";

test("parses bare numeric duration passed through npm workspace scripts", () => {
  assert.deepEqual(parseSoakOptions(["120"]), {
    durationSeconds: 120,
    maxAttempts: undefined,
    prewarmTimeoutMs: undefined,
    executionTimeoutMs: undefined,
    retryTimeoutMs: undefined
  });
});

test("parses explicit duration and max attempt flags", () => {
  assert.deepEqual(parseSoakOptions(["--duration-seconds=90", "--max-attempts=2"]), {
    durationSeconds: 90,
    maxAttempts: 2,
    prewarmTimeoutMs: undefined,
    executionTimeoutMs: undefined,
    retryTimeoutMs: undefined
  });
});

test("clamps zero max attempts to one bounded attempt", () => {
  assert.deepEqual(parseSoakOptions(["--duration", "0", "--max-attempts", "0"]), {
    durationSeconds: 0,
    maxAttempts: 1,
    prewarmTimeoutMs: undefined,
    executionTimeoutMs: undefined,
    retryTimeoutMs: undefined
  });
});

test("parses bounded per-attempt timeout controls", () => {
  assert.deepEqual(
    parseSoakOptions([
      "--prewarm-timeout-ms=30000",
      "--execution-timeout-ms",
      "45000",
      "--retry-timeout-ms=100"
    ]),
    {
      durationSeconds: 3600,
      maxAttempts: undefined,
      prewarmTimeoutMs: 30000,
      executionTimeoutMs: 45000,
      retryTimeoutMs: 1000
    }
  );
});
