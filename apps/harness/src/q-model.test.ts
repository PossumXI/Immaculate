import assert from "node:assert/strict";
import test from "node:test";
import {
  getCausalTracePolicySummary,
  getCognitiveRolePolicySummary,
  getGovernedGoalPolicySummary,
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
  assert.match(context.governedGoalPolicy, /governed-goal\.v1/);
  assert.match(context.cognitiveRolePolicy, /cognitive-role-plan\.v1/);
  assert.match(context.causalTracePolicy, /causal-trace-graph\.v1/);
});

test("Q runtime context instruction tells Q not to guess current facts", () => {
  const instruction = getQRuntimeContextInstruction(new Date("2026-04-25T12:00:00.000Z"));

  assert.match(instruction, /Current date: April 25, 2026/);
  assert.match(instruction, /Static model knowledge cutoff: June 2024/);
  assert.match(instruction, /current verification is required/);
  assert.match(instruction, /Governed tool policy:/);
  assert.match(instruction, /Governed goal policy:/);
  assert.match(instruction, /Cognitive role policy:/);
  assert.match(instruction, /Causal trace policy:/);
});

test("Q governed tool policy summary is compact and action-bound", () => {
  const summary = getGovernedToolPolicySummary();

  assert.match(summary, /risk-tiered from Tier 0/);
  assert.match(summary, /Tier 3\+ actions require an approval reference/);
  assert.match(summary, /do not improvise a tool path/);
});

test("Q governed goal policy summary points execution at mission objects", () => {
  const summary = getGovernedGoalPolicySummary();

  assert.match(summary, /objective, owner, constraints/);
  assert.match(summary, /allowedTools must map to the risk-tier registry/);
  assert.match(summary, /terminal goal states cannot be rewritten/);
});

test("Q cognitive role policy summary rejects self-approving execution", () => {
  const summary = getCognitiveRolePolicySummary();

  assert.match(summary, /Planner, executor, critic, and policy governor/);
  assert.match(summary, /distinct actors/);
  assert.match(summary, /memory curator/);
});

test("Q causal trace policy summary requires inspectable causes", () => {
  const summary = getCausalTracePolicySummary();

  assert.match(summary, /goal, governance, plan, steps, tools/);
  assert.match(summary, /memory, and ledger proof/);
  assert.match(summary, /inspectable causes/);
});
