# Model and Orchestrator Comparison

This page is generated from live local Ollama runs plus the latest published orchestrator benchmark packs that exist on this machine.

- Generated: 2026-04-13T22:52:25.823Z
- Ollama endpoint: http://127.0.0.1:11434
- Q alias: Q -> gemma4:e4b
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Model Results

### gemma3:4b

- Vendor: Google DeepMind
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `28840.36` ms
- P95 model latency: `39780.76` ms
- Average wall latency: `28944.61` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `39780.76` ms
- Wall latency: `39835.29` ms
- Structured fields: `3/3`
- Route: Select the most reliable route to bypass the forged ACK path immediately.
- Reason: Prioritize a stable route to prevent further propagation of the control-plane error.
- Commit: Implement fail-closed remediation by redirecting traffic through an alternative pathway.

#### Ops recovery

- Status: `completed`
- Model latency: `24019.66` ms
- Wall latency: `24162.95` ms
- Structured fields: `3/3`
- Route: Initiate a targeted repair window adjustment for the sensor-array peer.
- Reason: Lease jitter and a failed execution necessitate immediate stabilization efforts.
- Commit: Execute the repair window adjustment to resolve the identified issues.

#### Coding fix

- Status: `completed`
- Model latency: `24850.61` ms
- Wall latency: `24859.87` ms
- Structured fields: `3/3`
- Route: Deploy the updated service with CORS headers to restrict sensitive data transmission.
- Reason: Implementing CORS allows controlled access while preventing bearer token exposure in URLs.
- Commit: Execute the patch, ensuring the TypeScript service securely handles same-origin requests.

#### Orchestration route

- Status: `completed`
- Model latency: `26710.4` ms
- Wall latency: `26920.35` ms
- Structured fields: `3/3`
- Route: Initiate route selection prioritizing sensor-array data for immediate stabilization.
- Reason: The substrate requires cautious navigation due to mixed decode confidence and arbitration’s deliberation.
- Commit: Execute the chosen route to stabilize the live orchestration, safeguarding against overcommitment.

### qwen3:8b

- Vendor: Alibaba Cloud
- Completed tasks: `0/4`
- Structured parse success: `0/4` (0)
- Average model latency: `68709.82` ms
- P95 model latency: `76901.56` ms
- Average wall latency: `68778.68` ms
- Average structured fields: `0` / 3

#### Security triage

- Status: `failed`
- Model latency: `76901.56` ms
- Wall latency: `76939.57` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

#### Ops recovery

- Status: `failed`
- Model latency: `62769.18` ms
- Wall latency: `62821.02` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

#### Coding fix

- Status: `failed`
- Model latency: `65005.67` ms
- Wall latency: `65069.6` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

#### Orchestration route

- Status: `failed`
- Model latency: `70162.88` ms
- Wall latency: `70284.52` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

### Q (gemma4:e4b)

- Vendor: Google DeepMind
- Completed tasks: `0/4`
- Structured parse success: `0/4` (0)
- Average model latency: `73218.67` ms
- P95 model latency: `154807.43` ms
- Average wall latency: `73473.05` ms
- Average structured fields: `0` / 3

#### Security triage

- Status: `failed`
- Model latency: `154807.43` ms
- Wall latency: `155502.91` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

#### Ops recovery

- Status: `failed`
- Model latency: `45885.21` ms
- Wall latency: `46039.46` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

#### Coding fix

- Status: `failed`
- Model latency: `46352.93` ms
- Wall latency: `46446.79` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

#### Orchestration route

- Status: `failed`
- Model latency: `45829.12` ms
- Wall latency: `45903.04` ms
- Structured fields: `0/3`
- Route: missing
- Reason: missing
- Commit: missing

## Orchestrator Baseline

- Immaculate pack: `latency-benchmark-60s`
- Immaculate failed assertions: `3`
- Immaculate 60s reflex P95: `17.85` ms
- Immaculate 60s cognitive P95: `57.03` ms
- Immaculate measured throughput: `662.15` events/s
- Temporal failed assertions: `0`
- Immaculate workflow wall clock P95 in Temporal pack: `86.92` ms
- Temporal workflow wall clock P95: `517.36` ms
- Immaculate RSS peak P95: `701.83` MiB
- Temporal RSS peak P95: `427.81` MiB
- Interpretation: The latest local latency-benchmark-60s run exposed 3 failing assertions on this machine, so treat its throughput line as a live regression signal rather than a release-clean baseline.

