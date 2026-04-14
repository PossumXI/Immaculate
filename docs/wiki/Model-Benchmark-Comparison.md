# Model and Orchestrator Comparison

This page is generated from direct local Ollama structured-contract runs plus the latest published orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the underlying local model path that the gateway depends on.

- Generated: 2026-04-14T12:20:33.056Z
- Surface: direct-local-ollama-structured-contract
- Ollama endpoint: http://127.0.0.1:11434
- Q alias: Q -> gemma4:e4b
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Model Results

### gemma3:4b

- Vendor: Google DeepMind
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `15012.42` ms
- P95 model latency: `20750.08` ms
- Average wall latency: `15024.51` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `20750.08` ms
- Wall latency: `20762.79` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Select the most reliable route to bypass the forged ACK path and ensure stability.
- Reason: Prioritize a stable connection over a potentially compromised path due to the late ACK.
- Commit: Implement fail-closed remediation by redirecting traffic through an alternative, verified route.

#### Ops recovery

- Status: `completed`
- Model latency: `12774.58` ms
- Wall latency: `12785` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Initiate a targeted repair window adjustment for the sensor-array peer.
- Reason: Lease jitter and a failed execution necessitate immediate stabilization efforts.
- Commit: Execute the repair window to resolve the pending issue and restore stability.

#### Coding fix

- Status: `completed`
- Model latency: `13179.36` ms
- Wall latency: `13189.22` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Deploy the updated service with CORS enabled to grant necessary access.
- Reason: This patch addresses the requirement for same-origin operator access securely.
- Commit: Implement the service update, ensuring bearer tokens remain private and URLs are safe.

#### Orchestration route

- Status: `completed`
- Model latency: `13345.66` ms
- Wall latency: `13361.02` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Initiate route selection prioritizing sensor-array data for immediate stabilization.
- Reason: The substrate requires cautious routing due to mixed decode confidence and arbitration’s deliberation.
- Commit: Execute the chosen route to stabilize orchestration, acknowledging potential overcommitment risks.

### qwen3:8b

- Vendor: Alibaba Cloud
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `29640.18` ms
- P95 model latency: `37900.7` ms
- Average wall latency: `29654.31` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `37900.7` ms
- Wall latency: `37915.59` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Route through sensor-array with fail-closed fallback for ACK latency.
- Reason: Stabilize control-plane with minimal risk under elevated pressure.
- Commit: Commit fail-closed path to ensure system integrity and coherence.

#### Ops recovery

- Status: `completed`
- Model latency: `26991.02` ms
- Wall latency: `27003.62` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Stabilize federated peer with lease jitter and pending repair.
- Reason: Avoid overclaiming health while preserving retry lineage.
- Commit: Route queued for stabilization with bounded recovery.

#### Coding fix

- Status: `completed`
- Model latency: `26876.4` ms
- Wall latency: `26890.23` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Secure same-origin access without exposing bearer tokens in URLs.
- Reason: Prevent token leakage while maintaining service functionality.
- Commit: Implement middleware to strip tokens from URLs before routing.

#### Orchestration route

- Status: `completed`
- Model latency: `26792.62` ms
- Wall latency: `26807.79` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Route through sensor-array with cautious arbitration to stabilize orchestration.
- Reason: Decode confidence is strong, but transport health is mixed requiring careful reasoning.
- Commit: Commit to sensor-array route with guarded action to prevent overcommitment.

### Q (gemma4:e4b)

- Vendor: Google DeepMind
- Completed tasks: `2/4`
- Structured parse success: `2/4` (0.5)
- Average model latency: `123048.25` ms
- P95 model latency: `180003` ms
- Average wall latency: `123058.39` ms
- Average structured fields: `1.5` / 3

#### Security triage

- Status: `failed`
- Model latency: `180003` ms
- Wall latency: `180006.11` ms
- Structured fields: `0/3`
- Thinking detected: `false`
- Failure class: `transport_timeout`
- Route: missing
- Reason: missing
- Commit: missing

#### Ops recovery

- Status: `failed`
- Model latency: `180000` ms
- Wall latency: `180002.69` ms
- Structured fields: `0/3`
- Thinking detected: `false`
- Failure class: `transport_timeout`
- Route: missing
- Reason: missing
- Commit: missing

#### Coding fix

- Status: `completed`
- Model latency: `114337.28` ms
- Wall latency: `114355.46` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize patching the TypeScript service to secure same-origin operator access.
- Reason: The objective requires a patch preventing bearer token leakage in URLs.
- Commit: Implement the necessary code change and verify its secure operation immediately.

#### Orchestration route

- Status: `completed`
- Model latency: `17852.72` ms
- Wall latency: `17869.31` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the orchestration flow by confirming the next necessary action.
- Reason: Mixed transport health and high cognitive load require deliberate, reasoned decision-making.
- Commit: Execute a measured, guarded action based on current sensor-array data interpretation.

