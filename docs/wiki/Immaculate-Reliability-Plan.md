# Immaculate Reliability Plan

This page tracks the current high-value reliability pass for Immaculate itself.

It exists for one reason: the scheduler and dispatch path needed to get stronger before another long benchmark cycle was worth the burn.

## Why This Pass Started

The active three-hour benchmark sweep was stopped after the live Harbor Q lane exposed a real under-load failure:

- the Q Harbor task lane was returning `503 q_upstream_failure`
- the concrete upstream error was `llm server loading model`
- oracle Harbor runs were still scoring `1.000`
- the Q Harbor runs were falling to `0`

That made the next move obvious: stop spending more time on the same weak boundary and harden Immaculate’s planner and dispatch rules first.

## What Changed

The scheduler now carries explicit work-governor state instead of only role and latency heuristics.

Implemented in code:

- [apps/harness/src/scheduling.ts](/C:/Users/Knight/Desktop/Immaculate/Immaculate-q-gateway-push-oci-advisor/apps/harness/src/scheduling.ts)
  - explicit `admissionState`: `admit`, `degrade`, `hold`
  - explicit `backlogPressure` and numeric `backlogScore`
  - `healthWeightedWidth` so concurrency shrinks when the available layer set is busy or degraded
  - per-plan `workerReliabilityFloor`
  - ready/busy/degraded layer counts in the schedule ledger
- [apps/harness/src/server.ts](/C:/Users/Knight/Desktop/Immaculate/Immaculate-q-gateway-push-oci-advisor/apps/harness/src/server.ts)
  - worker reservation now consumes the schedule governor state
  - swarm and single-layer reservations pass a reliability floor and required healthy-worker count
  - latency limits tighten automatically under elevated and critical backlog
- [apps/harness/src/workers.ts](/C:/Users/Knight/Desktop/Immaculate/Immaculate-q-gateway-push-oci-advisor/apps/harness/src/workers.ts)
  - assignment now fail-closes when there are not enough healthy workers for the requested batch
  - assignment now fail-closes when the winning worker does not clear the schedule’s reliability floor
  - scoring is more health-weighted through lease, latency, and backlog-aware local bias
- [packages/core/src/index.ts](/C:/Users/Knight/Desktop/Immaculate/Immaculate-q-gateway-push-oci-advisor/packages/core/src/index.ts)
  - the execution schedule schema now persists the governor fields as first-class ledger state
- [apps/harness/src/benchmark.ts](/C:/Users/Knight/Desktop/Immaculate/Immaculate-q-gateway-push-oci-advisor/apps/harness/src/benchmark.ts)
  - benchmark assertions now verify admission control and the rising reliability floor under pressure

## Architectural Direction

The guiding model for this phase is simple:

- explicit admission control before execution
- backlog-aware width reduction before swarm placement
- health-weighted dispatch before remote/local selection
- fail-closed worker reservation when reliability falls below the floor

This is the direct bridge from the stronger Apex scheduler/resource patterns into Immaculate’s current harness.

## What Still Needs To Land

- a readiness gate in the Q Harbor agent path so `model loading` does not consume full task runs as hard failures
- direct BridgeBench soak backoff so transient upstream slowdown does not self-amplify
- a fuller resource governor for in-flight cognition batches rather than only lease-based worker gating
- a signed append-only route decision ledger for dispatch and retry lineage

## Verification

Verified locally:

- `npm run typecheck -w @immaculate/core`
- `npm run typecheck -w @immaculate/harness`
- `npm run build -w @immaculate/core`
- `npm run build -w @immaculate/harness`

## Truth Boundary

- This page records scheduler and dispatch improvements, not a fresh benchmark claim.
- The stopped three-hour sweep is still valid as a fault-discovery event, but it is not being published as a clean performance win.
