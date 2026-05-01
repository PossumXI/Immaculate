# Cognitive Runtime Role-Plan Contract - 2026-05-01

## Root Cause

The governed goal contract gave Immaculate a canonical mission object, but a goal alone does not prevent one agent from planning, executing, judging, approving, and recording its own work. That is the unsafe part of many agentic systems: the same actor can create the plan, run the tool, grade the result, and approve itself.

## Change

This pass adds `cognitive-role-plan.v1` as a pre-execution admission artifact.

- `apps/harness/src/cognitive-role-plan.ts`
  - Defines operator, planner, researcher, executor, verifier, critic, security monitor, memory curator, ledger recorder, escalation agent, and policy governor roles.
  - Requires base coverage for planner, executor, verifier, critic, policy governor, ledger recorder, and memory curator.
  - Adds security monitor for Tier 3+ goals.
  - Adds operator and escalation agent for Tier 4+ goals.
  - Blocks self-approval across planner, executor, critic, and policy governor.
  - Generates default role-bound steps from the governed goal allowed tools.
  - Blocks custom execute steps that use tools outside the governed goal envelope.
  - Emits a causal-chain preview from goal to ledger and memory.
- `apps/harness/src/server.ts`
  - Adds `GET /api/cognitive-runtime/role-plan/schema`.
  - Adds `POST /api/cognitive-runtime/role-plan/admission`.
- `apps/harness/src/q-model.ts`
  - Adds Q runtime guidance that executable goals must pass role-plan admission before action.

## Why This Shape

This is still an admission/preflight layer. It does not execute tools or mutate runtime state by itself. That keeps the cognitive runtime moving toward the safe loop:

Goal -> Governance -> Planner -> Executor -> Verifier -> Critic -> Governor -> Recorder -> Memory

The split makes it possible for future phases to bind actual traces, memory updates, scorecards, and release proposals to role-specific responsibility instead of generic agent output.

## Operator Notes

- Use `POST /api/cognitive-runtime/role-plan/admission` after `POST /api/goals/admission` and before execution.
- Do not allow the same actor id to occupy planner, executor, critic, and policy governor roles.
- For Tier 3+ goal tools, include a security monitor.
- For Tier 4+ goal tools, include an operator and escalation agent.
- This artifact is the bridge into the next phase: causal trace graph persistence.

## Validation

Run from the repository root:

```powershell
node --import tsx --test apps/harness/src/cognitive-role-plan.test.ts apps/harness/src/goal-state.test.ts apps/harness/src/q-model.test.ts
npm run typecheck -w @immaculate/harness
npm run test -w @immaculate/harness
npm run build -w @immaculate/harness
```
