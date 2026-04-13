# Live Validation 2026-04-13

This page records the fresh live validation pass run from the local `knightly`
machine on `2026-04-13`.

## What Ran

- local Ollama alias creation for `Q -> gemma4:e4b`
- fresh Temporal baseline benchmark
- fresh paced `60s` latency benchmark
- live local model comparison across `Q`, `qwen3:8b`, and `gemma3:4b`
- real `Q` corpus curation run and dataset shaping pass

## Results

### Live Harness Runtime

- process: `node dist/server.js`
- pid: `23864`
- endpoint: `http://127.0.0.1:8896`
- status: `ok`
- integrity: `verified`
- governance mode: `enforced`
- persisted event count at last check: `2891`

The process was left running on loopback after validation.

### Q Alias

- command: `npm run ollama:alias:q -- --force`
- result: `q:latest` created successfully
- mapping: `Q -> gemma4:e4b`
- live registration: `Q Mid Layer`

### Live Harness Cognition Smoke

- `GET /api/health`: `200 ok`
- `GET /api/intelligence/ollama/models`: `4` models visible, including `q`
- `POST /api/intelligence/ollama/register` with `model=q`: `200`, layer `Q Mid Layer`
- `POST /api/intelligence/run` on `Q Mid Layer`: `503 cognitive_execution_failed`
- failure message: `No response returned by Ollama.`
- `Q` execution latency before failure: `88715.81 ms`

This matches the live comparison result: the alias path is real, but the current
`Q` runtime still needs fine-tune or prompt-contract work before it behaves like
the structured control-plane model the harness expects.

### Live Harness Gemma 3 Runtime Check

- `POST /api/intelligence/ollama/register` with `model=gemma3:4b`: `200`
- `POST /api/intelligence/run` on the registered Gemma 3 layer: request started
  and emitted `Executing governed cognitive pass.`
- no completion record existed in the live harness log at the last check
- `GET /api/health` continued to return `200 ok` while that request remained open

This means the direct comparison surface and the live governed server path are
currently telling different truths on the same machine:

- direct comparison CLI: `gemma3:4b` is the strongest structured-output model in
  the local set
- live harness route: the governed Gemma 3 execution path still has an unresolved
  hang that needs its own fix pass

### Temporal Baseline

- suite: `immaculate-benchmark-2026-04-13T22-40-03-299Z`
- status: `pass`
- wall-clock: `5471.35 ms`
- failed assertions: `0`

### Latency Benchmark (60s)

- suite: `immaculate-benchmark-2026-04-13T22-41-40-475Z`
- status: `fail`
- wall-clock: `115259.07 ms`
- failed assertions: `3`
- reflex P95: `17.85 ms`
- cognitive P95: `57.03 ms`
- measured throughput: `662.15 events/s`

Failed assertions:

1. `nwb-replay-ingest`
2. `live-socket-ingest`
3. `measured-event-throughput-floor`

This is a real regression signal on the current Windows machine, not a hidden or rewritten result.

### Live Model Comparison

Generated at: `2026-04-13T22:52:25.823Z`

- `gemma3:4b`:
  - parse success: `4/4`
  - average latency: `28840.36 ms`
  - P95 latency: `39780.76 ms`
- `qwen3:8b`:
  - parse success: `0/4`
  - average latency: `68709.82 ms`
  - P95 latency: `76901.56 ms`
- `Q (gemma4:e4b)`:
  - parse success: `0/4`
  - average latency: `73218.67 ms`
  - P95 latency: `154807.43 ms`

Tracked comparison pages:

- [[Model-Benchmark-Comparison]]
- `docs/wiki/Model-Benchmark-Comparison.json`

### Q Training Data Path

- curation run: `cur-fnv1a-b7a9289b`
- accepted sources: `2`
- accepted files: `969`
- secret findings: `2`
- provenance chain: `34b66e01ab3eb5bac117904f02b9edb75e77af4e656520cc201c51d5a7c7ef8b`
- shaped training rows: `969`
- output dataset: `.training-output/q/q-train-cur-fnv1a-b7a9289b.jsonl`

## OCI Boundary

The hardened OCI bundle now exists under `deploy/oci-private/` and is documented
in [[OCI-Private-Deployment]].

No real OCI instance was launched from this session because the local machine
still does not have OCI credentials or configuration.
