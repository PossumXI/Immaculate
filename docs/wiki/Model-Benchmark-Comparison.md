# Q Structured Contract Benchmark

This page is generated from direct local Q structured-contract runs plus the latest published Immaculate orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the direct Q execution lane that the gateway depends on.

- Generated: 2026-05-07T06:03:07.620Z
- Release: 0.1.0+af0899f
- Repo commit: af0899f
- Surface: direct-q-structured-contract
- Q runtime endpoint: http://127.0.0.1:11434
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.28,"nodeVersion":"v22.13.1"}

## Live Q Results

### Q

- Vendor: Arobi Technology Alliance
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `23900.66` ms
- P95 model latency: `24496.84` ms
- Average wall latency: `54977.23` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `23154.93` ms
- Wall latency: `53871.52` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: guarded
- Reason: Mixed pressure requires mediation on the governed local Q lane.
- Commit: Keep mediation on the governed local Q lane without drift.

#### Ops recovery

- Status: `completed`
- Model latency: `24114.01` ms
- Wall latency: `54165.65` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Lease jitter and failed execution necessitate cognitive processing for stabilization.
- Commit: Initiate stabilization sequence for the federated peer immediately.

#### Coding fix

- Status: `completed`
- Model latency: `23836.85` ms
- Wall latency: `56670.7` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Same-origin operator access requires keeping bearer tokens out of browser-visible URLs.
- Commit: Implement same-origin operator access while ensuring bearer tokens remain out of URLs.

#### Orchestration route

- Status: `completed`
- Model latency: `24496.84` ms
- Wall latency: `55201.04` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Mixed transport health requires cognitive arbitration before acting.
- Commit: Arbitrate the mixed health signal to determine the next orchestration move.

## Orchestrator Baseline

- Temporal failed assertions: `0`
- Immaculate workflow wall clock P95 in Temporal pack: `28.57` ms
- Temporal workflow wall clock P95: `464.75` ms
- Immaculate RSS peak P95: `742.59` MiB
- Temporal RSS peak P95: `351.84` MiB
- Interpretation: Immaculate matched or beat Temporal on the simple workflow wall clock on this machine, while still carrying the heavier governed execution semantics.

