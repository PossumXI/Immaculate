# Q Structured Contract Benchmark

This page is generated from direct local Q structured-contract runs plus the latest published Immaculate orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the direct Q execution lane that the gateway depends on.

- Generated: 2026-04-19T07:48:09.656Z
- Release: 0.1.0+5ed19b9
- Repo commit: 5ed19b9
- Surface: direct-q-structured-contract
- Q runtime endpoint: http://127.0.0.1:11435
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Q Results

### Q

- Vendor: Arobi Technology Alliance
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `23191.31` ms
- P95 model latency: `23715.52` ms
- Average wall latency: `23255.43` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `22884.85` ms
- Wall latency: `23113.21` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: guarded
- Reason: Bridge device emits late ACKs, requiring a fail-closed remediation pass.
- Commit: Remain on the local lane to enforce fail-closed semantics.

#### Ops recovery

- Status: `completed`
- Model latency: `22804.36` ms
- Wall latency: `22814` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Lease jitter and failed execution necessitate stabilization while preserving the retry lineage.
- Commit: Initiate repair window action to address the pending repair window.

#### Coding fix

- Status: `completed`
- Model latency: `23715.52` ms
- Wall latency: `23727.1` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Same-origin access and token secrecy require keeping tokens out of browser-visible URLs.
- Commit: Implement the necessary TypeScript changes to ensure same-origin operator access securely.

#### Orchestration route

- Status: `completed`
- Model latency: `23360.52` ms
- Wall latency: `23367.42` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Mixed transport health requires cognitive arbitration before taking an action.
- Commit: Proceed with cognitive arbitration to decide the next orchestration move.

