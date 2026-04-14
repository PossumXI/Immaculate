# Model and Orchestrator Comparison

This page is generated from direct local Ollama structured-contract runs plus the latest published orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the underlying local model path that the gateway depends on.

- Generated: 2026-04-14T15:27:29.352Z
- Release: 0.1.0+f3886f2
- Repo commit: f3886f2
- Surface: direct-local-ollama-structured-contract
- Ollama endpoint: http://127.0.0.1:11434
- Q alias: Q -> gemma4:e4b
- Q training bundle: q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Model Results

### gemma3:4b

- Vendor: Google DeepMind
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `17224.93` ms
- P95 model latency: `23433.6` ms
- Average wall latency: `17239.16` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `23433.6` ms
- Wall latency: `23449.65` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Select the most reliable route to bypass the forged ACK path immediately.
- Reason: Prioritize a stable connection to avoid further disruptions during the control-plane change.
- Commit: Implement fail-closed remediation by redirecting traffic through an alternative, verified pathway.

#### Ops recovery

- Status: `completed`
- Model latency: `14887.43` ms
- Wall latency: `14897.45` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Initiate a targeted repair window adjustment for the sensor-array peer.
- Reason: Lease jitter and a failed execution necessitate immediate stabilization efforts.
- Commit: Execute the repair window to resolve the pending issue and restore stability.

#### Coding fix

- Status: `completed`
- Model latency: `15330.37` ms
- Wall latency: `15338.87` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Deploy the updated service with CORS headers to restrict sensitive data transmission.
- Reason: Implementing CORS mitigates the risk of bearer token exposure during same-origin operations.
- Commit: Execute the patch, ensuring secure access while maintaining browser URL integrity.

#### Orchestration route

- Status: `completed`
- Model latency: `15248.32` ms
- Wall latency: `15270.67` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Initiate route selection prioritizing sensor-array data for immediate stabilization.
- Reason: The substrate requires cautious navigation due to mixed decode confidence and arbitration's deliberation.
- Commit: Execute the chosen route to stabilize live orchestration, acknowledging potential overcommitment risks.

### qwen3:8b

- Vendor: Alibaba Cloud
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `30330.64` ms
- P95 model latency: `36493.14` ms
- Average wall latency: `30344.06` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `36493.14` ms
- Wall latency: `36511.44` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Route through sensor-array with fail-closed fallback for ACK latency.
- Reason: Stabilize control-plane with minimal risk under elevated pressure.
- Commit: Confirm route via sensor-array to ensure fail-closed integrity.

#### Ops recovery

- Status: `completed`
- Model latency: `27987.19` ms
- Wall latency: `27998.84` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Stabilize federated peer with lease jitter and pending repair.
- Reason: Avoid overclaiming health while preserving retry lineage.
- Commit: Route queued for stabilization with bounded recovery.

#### Coding fix

- Status: `completed`
- Model latency: `27379.83` ms
- Wall latency: `27391.3` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Secure same-origin access without exposing bearer tokens in URLs.
- Reason: Prevent token leakage by isolating credentials from browser-visible paths.
- Commit: Implement middleware to enforce origin checks and URL sanitization.

#### Orchestration route

- Status: `completed`
- Model latency: `29462.4` ms
- Wall latency: `29474.66` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Stabilize route with cautious arbitration before committing next orchestration step.
- Reason: Decode confidence is strong but transport health is mixed requiring guarded action.
- Commit: Commit route with verified coherence to prevent overcommitting substrate.

### Q (gemma4:e4b)

- Vendor: Google DeepMind
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `25329.15` ms
- P95 model latency: `49010.48` ms
- Average wall latency: `25345.71` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `49010.48` ms
- Wall latency: `49032.8` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize fail-closed remediation by validating the forged ACK path immediately.
- Reason: Elevated pressure demands immediate stabilization against potential late ACK spoofing.
- Commit: Execute the fail-closed remediation pass to ensure system integrity now.

#### Ops recovery

- Status: `completed`
- Model latency: `18175.9` ms
- Wall latency: `18186.24` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the peer's lease jitter by isolating the sensor-array data stream.
- Reason: The jitter and failed execution require immediate focus on the sensor-array component.
- Commit: Initiate a controlled, bounded retry sequence specifically for the sensor-array module.

#### Coding fix

- Status: `completed`
- Model latency: `17417.47` ms
- Wall latency: `17437.72` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize patching the TypeScript service to secure same-origin operator access.
- Reason: The objective requires a patch preventing bearer token leakage in URLs.
- Commit: Implement the necessary code change and verify its secure operation immediately.

#### Orchestration route

- Status: `completed`
- Model latency: `16712.74` ms
- Wall latency: `16726.07` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the orchestration by confirming the next necessary action.
- Reason: Mixed transport health and strong decode confidence require deliberate arbitration.
- Commit: Execute a measured, guarded action rather than an immediate, risky reflex.

