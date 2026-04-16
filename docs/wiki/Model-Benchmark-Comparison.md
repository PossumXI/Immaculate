# Q Structured Contract Benchmark

This page is generated from direct local Q structured-contract runs plus the latest published Immaculate orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the direct Q execution lane that the gateway depends on.

- Generated: 2026-04-16T18:59:16.535Z
- Release: 0.1.0+2384cf5
- Repo commit: 2384cf5
- Surface: direct-q-structured-contract
- Ollama endpoint: http://127.0.0.1:11434
- Q lane: Q
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-2384cf5-57097d65
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Q Results

### Q

- Vendor: Immaculate
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `27913.26` ms
- P95 model latency: `51167.09` ms
- Average wall latency: `27920.5` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `51167.09` ms
- Wall latency: `51179.42` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize the explicit path verification over the potentially delayed ACK signal.
- Reason: The decisive signal is the potential for late ACKs from the bridge device.
- Commit: Initiate a controlled fail-closed remediation pass immediately.

#### Ops recovery

- Status: `completed`
- Model latency: `19553.93` ms
- Wall latency: `19559.48` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the federated peer's connection state immediately.
- Reason: Lease jitter and one failed execution signal peer instability.
- Commit: Initiate a controlled, bounded re-synchronization attempt on the peer.

#### Coding fix

- Status: `completed`
- Model latency: `20677.85` ms
- Wall latency: `20683.62` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Proceed with patching the TypeScript service to secure same-origin operator access.
- Reason: The decisive signal is the high `optimize` queue time indicating processing backlog.
- Commit: Prioritize reducing the `optimize` queue time by reviewing resource allocation.

#### Orchestration route

- Status: `completed`
- Model latency: `20254.19` ms
- Wall latency: `20259.5` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the orchestration flow by addressing the mixed transport health signal.
- Reason: The mixed transport health signal indicates potential instability requiring careful arbitration.
- Commit: Execute a controlled, deliberate action rather than an immediate, high-confidence reflex.

