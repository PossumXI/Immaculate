# Cognitive Runtime Goal-State Contract - 2026-05-01

## Root Cause

Immaculate already had governance bindings, tool risk tiers, intelligence assessments, and traceable orchestration events, but agent work still entered the harness as loose objectives and route-specific payloads. That left no canonical object for planner/executor/critic separation, rollback planning, audit requirements, memory retention, or later scorecards to attach to.

## Change

This pass adds an additive governed goal-state contract:

- `apps/harness/src/goal-state.ts`
  - Publishes `governed-goal.v1`.
  - Requires objective, owner, constraints, authority scope, success criteria, deadline, allowed tools, rollback plan, and audit requirements.
  - Normalizes goal inputs into deterministic goal IDs.
  - Fails closed on missing fields, unknown tools, elapsed deadlines, or tool-risk admission denial.
  - Enforces one-way terminal states so completed, failed, and cancelled goals cannot be rewritten in place.
- `apps/harness/src/server.ts`
  - Adds `GET /api/goals/schema`.
  - Adds `POST /api/goals/admission`.
  - Both endpoints use the existing harness read rate limit because this is a preflight/admission surface, not an execution surface.
- `apps/harness/src/q-model.ts`
  - Teaches Q's runtime context that execution should be framed as governed goal objects before bounded action.

## Why This Shape

This is intentionally additive. It does not mutate the core engine durable state yet, so current snapshots, persisted events, benchmark fixtures, and route queues remain compatible. The goal object now exists as a shared contract that the next phases can safely bind to:

- planner/executor/critic separation
- causal trace graph
- memory records
- evaluation scorecards
- governed release proposals

## Operator Notes

- Use `GET /api/goals/schema` to inspect the current contract before wiring new planner flows.
- Use `POST /api/goals/admission` to preflight any proposed mission. Do not let an executor run directly from a free-form objective.
- High-risk allowed tools still inherit the risk-tier registry:
  - Tier 2+ requires consent scope.
  - Tier 3+ requires approval reference.
  - Tier 4+ requires `human:` or `operator:` approval.
- Unknown tool names are blocked even when the rest of the goal is well formed.

## Validation

Run from the repository root:

```powershell
node --import tsx --test apps/harness/src/goal-state.test.ts apps/harness/src/q-model.test.ts
npm run typecheck -w @immaculate/harness
npm run test -w @immaculate/harness
npm run build -w @immaculate/harness
```
