# Q Structured Contract Benchmark

This page is generated from direct local Q structured-contract runs plus the latest published Immaculate orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the direct Q execution lane that the gateway depends on.

- Generated: 2026-05-14T13:16:52.681Z
- Release: 0.1.0+18af0fd
- Repo commit: 18af0fd
- Surface: direct-q-structured-contract
- Q runtime endpoint: http://127.0.0.1:11434
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.28,"nodeVersion":"v22.13.1"}

## Live Q Results

### Q

- Vendor: Arobi Technology Alliance
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `42410.73` ms
- P95 model latency: `45005.82` ms
- Average wall latency: `42495.23` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `38415.07` ms
- Wall latency: `38698.33` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: guarded
- Reason: Mixed pressure requires mediation on the governed local Q lane.
- Commit: Keep mediation on the governed local Q lane without drift.

#### Ops recovery

- Status: `completed`
- Model latency: `41781.73` ms
- Wall latency: `41808.95` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Lease jitter and failed execution necessitate a cognitive assessment of the peer state.
- Commit: Initiate repair window action to stabilize the federated peer.

#### Coding fix

- Status: `completed`
- Model latency: `45005.82` ms
- Wall latency: `45019.59` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Same-origin access requires token removal from URLs for security.
- Commit: Implement same-origin operator access without exposing bearer tokens in URLs.

#### Orchestration route

- Status: `completed`
- Model latency: `44440.3` ms
- Wall latency: `44454.05` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Mixed transport health requires cognitive arbitration before acting.
- Commit: Arbitrate the mixed health signal to determine the next orchestration move.

