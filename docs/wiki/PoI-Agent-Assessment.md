# PoI Agent Assessment

This page records the first production-facing Proof of Intelligence assessment loop inside Immaculate.

PoI assessment is not a model claim. It is a harness measurement. Each governed Q or agent execution can now produce a durable assessment record that grades the agent against the same baseline signals every time:

- reasoning completion
- `ROUTE / REASON / COMMIT` contract coverage
- governance and guard posture
- routing admission
- runtime reliability and latency
- benchmark signal
- neuro/connectome signal quality when available

## Runtime Surface

- `GET /api/health` now includes a `poi` summary with latest grade, verdict counts, average score, and degraded agent IDs.
- `GET /api/topology` now includes `poiAssessmentSummary` beside worker and cluster posture.
- `GET /api/intelligence` now includes `assessments` and a summarized `poi` block.
- `GET /api/intelligence/assessments` reads the governed assessment ledger under `cognitive-trace-read` consent, the global harness throttle, and a route-local read throttle.
- `POST /api/intelligence/assessments/run` manually records a governed PoI assessment under `cognitive-execution` consent, the global harness throttle, and a stricter route-local run throttle.

## Durability

The core engine now stores `agentIntelligenceAssessments` in the `PhaseSnapshot`.
Each assessment is also emitted as `immaculate.agent-intelligence-assessment.recorded`, so recovery and replay can rebuild the same monitor state from the durable event stream.

The harness also writes a linked local Arobi decision-trace record with source `agent-intelligence-assessment`.
The trace stores hashes, scores, verdicts, drift flags, and evidence IDs. It does not store raw chain-of-thought.

## Baseline

The first scoring baseline is `poi-v1`.

Current weighted scorecard:

- reasoning: `0.18`
- contract: `0.20`
- governance: `0.16`
- routing: `0.12`
- runtime: `0.12`
- benchmark: `0.12`
- neuro: `0.10`

Grades:

- `S`: score >= `0.92`
- `A`: score >= `0.82`
- `B`: score >= `0.68`
- `C`: score >= `0.52`
- `D`: score < `0.52`

Verdicts:

- `pass`: score >= `0.72` with no guard block or critical governance flag
- `watch`: score >= `0.52`
- `fail`: score < `0.52`

## Why This Matters

Before this pass, Immaculate had execution traces, benchmark reports, worker assignment, and governance decisions, but no durable per-agent intelligence monitor that joined those signals into one replayable baseline.

This pass makes the inference lane measurable in the harness itself. Q and future integrated agents can now be compared, drift-flagged, and graded from the same event spine instead of relying on scattered logs or one-off benchmark pages.

## Operator Notes

- Automatic assessments are recorded after cognitive executions and multi-agent conversations.
- Manual assessments can be run when an operator wants a fresh point-in-time grade for a layer.
- The harness now has a global Fastify throttle, and the assessment endpoints keep their own stricter route throttles so operator reads cannot become an unbounded ledger-scrape path and manual runs cannot become an unbounded inference-pressure path.
- Assessment failures are logged and fail open for the original cognitive execution, because PoI monitoring must not break the user-facing inference response path.
- Raw private prompts and responses stay governed by the existing projection/redaction layer.
