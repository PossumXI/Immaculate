# Cognitive Runtime Causal Trace Graph - 2026-05-01

## Root Cause

Immaculate had append-only decision records, governed goal objects, and role-separated plan admission. That made actions more auditable, but the system still lacked a queryable causal graph that ties the whole runtime loop together:

Goal -> Governance -> Plan -> Step -> Tool -> Assessment -> Memory -> Ledger

Without that graph, later operators can see records, but they have to reconstruct why a decision happened by reading logs and receipts manually.

## Change

This pass adds `causal-trace-graph.v1`.

- `apps/harness/src/causal-trace-graph.ts`
  - Builds a graph from an accepted `cognitive-role-plan.v1` admission.
  - Materializes goal, governance, plan, step, tool, assessment, memory, and ledger nodes.
  - Materializes edges for admission, planning, step containment, step dependencies, tool use, assessment, memory update, and ledger proof.
  - Persists graph records to `arobi-network/causal-trace-graph.ndjson`.
  - Hash-chains graph records with `parentGraphHash` and `graphHash`.
  - Provides read/filter and integrity inspection helpers.
- `apps/harness/src/server.ts`
  - Adds `GET /api/cognitive-runtime/trace-graph/schema`.
  - Adds `POST /api/cognitive-runtime/trace-graph/admission`.
  - Adds `POST /api/cognitive-runtime/trace-graph/records`.
  - Adds `GET /api/cognitive-runtime/trace-graph/records`.
  - Adds `GET /api/cognitive-runtime/trace-graph/integrity`.
- `apps/harness/src/q-model.ts`
  - Teaches Q that admitted runtime plans should persist causal trace graphs before future routing learns from them.

## Why This Shape

This is not a free-running executor. It is a durable proof surface. A graph is only materialized from an accepted governed goal plus role-separated plan. That keeps the loop controlled:

1. Goal admission
2. Role-plan admission
3. Causal graph persistence
4. Execution/assessment/memory/ledger phases can later attach live receipts to graph node ids

The graph is append-only and independently inspectable. A broken hash chain or missing required node marks integrity invalid.

## Operator Notes

- Use `POST /api/cognitive-runtime/trace-graph/admission` to preview the graph without writing.
- Use `POST /api/cognitive-runtime/trace-graph/records` to persist the graph once the goal and role plan are accepted.
- Use `GET /api/cognitive-runtime/trace-graph/records?goalId=<goal-id>` to audit one mission.
- Use `GET /api/cognitive-runtime/trace-graph/integrity` before publishing or relying on graph-derived summaries.
- The next phase should attach execution scorecards and memory deltas to these graph node ids.

## Validation

Run from the repository root:

```powershell
node --import tsx --test apps/harness/src/causal-trace-graph.test.ts apps/harness/src/cognitive-role-plan.test.ts apps/harness/src/q-model.test.ts
npm run typecheck -w @immaculate/harness
npm run test -w @immaculate/harness
npm run build -w @immaculate/harness
git diff --check
```
