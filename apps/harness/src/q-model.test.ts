import assert from "node:assert/strict";
import test from "node:test";
import {
  getGovernedToolPolicySummary,
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
  assert.match(context.governedToolPolicy, /registered action classes/);
  assert.match(context.governedToolPolicy, /Tier 4\+ actions require human or operator approval/);
});

test("Q runtime context instruction tells Q not to guess current facts", () => {
  const instruction = getQRuntimeContextInstruction(new Date("2026-04-25T12:00:00.000Z"));

  assert.match(instruction, /Current date: April 25, 2026/);
  assert.match(instruction, /Static model knowledge cutoff: June 2024/);
  assert.match(instruction, /current verification is required/);
  assert.match(instruction, /Governed tool policy:/);
});

test("Q governed tool policy summary is compact and action-bound", () => {
  const summary = getGovernedToolPolicySummary();

  assert.match(summary, /risk-tiered from Tier 0/);
  assert.match(summary, /Tier 3\+ actions require an approval reference/);
  assert.match(summary, /do not improvise a tool path/);
});
