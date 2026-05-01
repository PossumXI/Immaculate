import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNeuroReplayOptions } from "./neuro-replay-options.js";

test("neuro replay options clamp user-controlled timer pace", () => {
  assert.deepEqual(normalizeNeuroReplayOptions({ paceMs: 1 }), {
    windowSize: 2,
    paceMs: 20
  });
  assert.deepEqual(normalizeNeuroReplayOptions({ paceMs: 60_000 }), {
    windowSize: 2,
    paceMs: 10_000
  });
});

test("neuro replay options bound window sizing and replay length", () => {
  assert.deepEqual(
    normalizeNeuroReplayOptions({
      windowSize: 0,
      maxWindows: 100_000
    }),
    {
      windowSize: 1,
      paceMs: 120,
      maxWindows: 10_000
    }
  );
  assert.deepEqual(
    normalizeNeuroReplayOptions({
      windowSize: 2048,
      maxWindows: Number.NaN
    }),
    {
      windowSize: 512,
      paceMs: 120,
      maxWindows: 10_000
    }
  );
});
