# Q Structured Contract Benchmark

This page is generated from direct local Q structured-contract runs plus the latest published Immaculate orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the direct Q execution lane that the gateway depends on.

- Generated: 2026-04-17T10:03:22.220Z
- Release: 0.1.0+848d44f
- Repo commit: 848d44f
- Surface: direct-q-structured-contract
- Q runtime endpoint: http://127.0.0.1:11434
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13-848d44f-beff091d
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Q Results

### Q

- Vendor: Arobi Technology Alliance
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `32949.72` ms
- P95 model latency: `33443.11` ms
- Average wall latency: `33018.05` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `32996.62` ms
- Wall latency: `33248.46` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: guarded
- Reason: Forged ACK path signals untrusted bridge behavior requiring fail-closed remediation.
- Commit: Enforce fail-closed semantics immediately to maintain system integrity.

#### Ops recovery

- Status: `completed`
- Model latency: `32399.06` ms
- Wall latency: `32407.66` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: Lease jitter and failed execution signal instability requiring bounded stabilization.
- Commit: Isolate the peer's state and preserve the durable retry lineage for controlled recovery.

#### Coding fix

- Status: `completed`
- Model latency: `33443.11` ms
- Wall latency: `33449.96` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: cognitive
- Reason: The fault is the need for same-origin access without leaking tokens into URLs.
- Commit: Patch the service to use secure, non-URL-based operator access methods.

#### Orchestration route

- Status: `completed`
- Model latency: `32960.07` ms
- Wall latency: `32966.13` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: guarded
- Reason: Mixed transport health requires careful arbitration before committing to action.
- Commit: Prioritize local Q lane reasoning while awaiting clearer transport signals.

