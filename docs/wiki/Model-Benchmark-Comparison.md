# Q Structured Contract Benchmark

This page is generated from direct local Q structured-contract runs plus the latest published Immaculate orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the direct Q execution lane that the gateway depends on.

- Generated: 2026-04-17T02:40:21.770Z
- Release: 0.1.0+3c3e41d
- Repo commit: 3c3e41d
- Surface: direct-q-structured-contract
- Ollama endpoint: http://127.0.0.1:11434
- Q lane: Q
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v1-45280d5-a181f850
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Q Results

### Q

- Vendor: Immaculate
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `24527.89` ms
- P95 model latency: `51935` ms
- Average wall latency: `24535.8` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `51935` ms
- Wall latency: `51951.95` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize fail-closed semantics due to elevated governance pressure and potential late ACKs.
- Reason: The decisive signal is the requirement for fail-closed semantics under elevated governance pressure.
- Commit: Immediately enforce fail-closed semantics across the control plane path.

#### Ops recovery

- Status: `completed`
- Model latency: `15325.88` ms
- Wall latency: `15331.9` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the peer by addressing the lease jitter and failed execution.
- Reason: Lease jitter and failed execution signal instability requiring immediate focus.
- Commit: Initiate a controlled, bounded retry sequence targeting the peer's lease mechanism.

#### Coding fix

- Status: `completed`
- Model latency: `15446.86` ms
- Wall latency: `15451.62` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Patching requires same-origin access while preventing token leakage in URLs.
- Reason: The decisive signal is the requirement to keep bearer tokens out of URLs.
- Commit: Implement a mechanism to handle same-origin access without URL exposure.

#### Orchestration route

- Status: `completed`
- Model latency: `15403.82` ms
- Wall latency: `15407.74` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize guarded action due to elevated governance pressure and mixed transport health.
- Reason: The decisive signal is elevated governance pressure requiring cautious decision-making.
- Commit: Initiate a deliberate pause to re-evaluate the current operational state.

