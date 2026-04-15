# Q Structured Contract Benchmark

This page is generated from direct local Q structured-contract runs plus the latest published Immaculate orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the direct Q execution lane that the gateway depends on.

- Generated: 2026-04-15T02:25:01.093Z
- Release: 0.1.0+194a8fc
- Repo commit: 194a8fc
- Surface: direct-q-structured-contract
- Ollama endpoint: http://127.0.0.1:11434
- Q lane: Q
- Q training bundle: q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Q Results

### Q

- Vendor: Immaculate
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `28554.67` ms
- P95 model latency: `34277.28` ms
- Average wall latency: `28562.35` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `16514.57` ms
- Wall latency: `16526.11` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize fail-closed remediation by validating the forged ACK path immediately.
- Reason: Elevated pressure demands immediate stabilization against potential late ACK misinterpretations.
- Commit: Execute the fail-closed remediation pass to ensure system integrity now.

#### Ops recovery

- Status: `completed`
- Model latency: `34277.28` ms
- Wall latency: `34285.21` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the sensor-array peer by isolating the jitter source immediately.
- Reason: The jitter and failed execution require immediate, bounded intervention to maintain system integrity.
- Commit: Initiate a controlled, low-impact repair sequence while monitoring governance thresholds closely.

#### Coding fix

- Status: `completed`
- Model latency: `31302.4` ms
- Wall latency: `31307.92` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize patching the TypeScript service for secure same-origin operator access.
- Reason: The goal is to prevent bearer token leakage into browser-visible URLs.
- Commit: Implement a mechanism ensuring token handling remains strictly server-side.

#### Orchestration route

- Status: `completed`
- Model latency: `32124.44` ms
- Wall latency: `32130.17` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the orchestration by confirming the sensor-array's current state.
- Reason: Mixed transport health and high cognitive load necessitate a deliberate, cautious next step.
- Commit: Execute a measured assessment cycle before committing to any major system route change.

