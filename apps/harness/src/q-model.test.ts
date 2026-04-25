import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQRuntimeContext,
  getQRuntimeContextInstruction
} from "./q-model.js";

test("Q runtime context exposes current date and knowledge cutoff", () => {
  const now = new Date("2026-04-25T12:00:00.000Z");
  const context = buildQRuntimeContext(now);

  assert.equal(context.currentDateIso, "2026-04-25");
  assert.equal(context.currentDateLabel, "April 25, 2026");
  assert.equal(context.knowledgeCutoff, "June 2024");
  assert.match(context.currentInformationPolicy, /approved retrieval\/tool lane/);
});

test("Q runtime context instruction tells Q not to guess current facts", () => {
  const instruction = getQRuntimeContextInstruction(new Date("2026-04-25T12:00:00.000Z"));

  assert.match(instruction, /Current date: April 25, 2026/);
  assert.match(instruction, /Static model knowledge cutoff: June 2024/);
  assert.match(instruction, /current verification is required/);
});
