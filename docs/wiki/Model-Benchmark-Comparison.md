# Model and Orchestrator Comparison

This page is generated from direct local Ollama structured-contract runs plus the latest published orchestrator benchmark packs that exist on this machine.
It does not measure the served Q gateway edge. It measures the underlying local model path that the gateway depends on.

- Generated: 2026-04-14T11:31:40.656Z
- Surface: direct-local-ollama-structured-contract
- Ollama endpoint: http://127.0.0.1:11434
- Q alias: Q -> gemma4:e4b
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Live Model Results

### gemma3:4b

- Vendor: Google DeepMind
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `15310.61` ms
- P95 model latency: `21471.99` ms
- Average wall latency: `15320.66` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `21471.99` ms
- Wall latency: `21485.75` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Select the most reliable sensor-array route to bypass the potentially problematic bridge device.
- Reason: Prioritize a stable route to mitigate the risk of delayed acknowledgements and ensure data integrity.
- Commit: Implement fail-closed remediation by directing traffic through an alternative, verified sensor-array path.

#### Ops recovery

- Status: `completed`
- Model latency: `12872.2` ms
- Wall latency: `12880.03` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Initiate a targeted repair window adjustment for the sensor-array peer.
- Reason: Lease jitter and a failed execution necessitate immediate stabilization efforts.
- Commit: Execute the repair window to resolve the pending issue and restore stability.

#### Coding fix

- Status: `completed`
- Model latency: `13535.79` ms
- Wall latency: `13543.97` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Initiate a patch deployment to the TypeScript service addressing same-origin operator access.
- Reason: This patch will prevent bearer token exposure by modifying browser-visible URLs.
- Commit: The service will receive the updated patch, ensuring secure same-origin operator access.

#### Orchestration route

- Status: `completed`
- Model latency: `13362.45` ms
- Wall latency: `13372.87` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Initiate route selection prioritizing sensor-array data for immediate stabilization.
- Reason: The substrate requires cautious navigation due to mixed decode confidence and arbitration’s deliberation.
- Commit: Execute the chosen route to stabilize the live orchestration, safeguarding against overcommitment.

### qwen3:8b

- Vendor: Alibaba Cloud
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `25742.22` ms
- P95 model latency: `33662.37` ms
- Average wall latency: `25754.28` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `33662.37` ms
- Wall latency: `33673.79` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Route through sensor-array with fail-closed fallback for stability.
- Reason: Ensures control-plane integrity under elevated pressure and denials.
- Commit: Confirm route execution to stabilize live orchestration safely.

#### Ops recovery

- Status: `completed`
- Model latency: `22282.15` ms
- Wall latency: `22293.95` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Stabilize federated peer with lease jitter and pending repair.
- Reason: Avoid overclaiming health while preserving retry lineage.
- Commit: Route queued for stabilization with bounded recovery.

#### Coding fix

- Status: `completed`
- Model latency: `22236.13` ms
- Wall latency: `22247.81` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Secure same-origin access without exposing bearer tokens in URLs.
- Reason: Prevent token leakage while maintaining service functionality.
- Commit: Implement middleware to strip tokens from URLs before routing.

#### Orchestration route

- Status: `completed`
- Model latency: `24788.21` ms
- Wall latency: `24801.55` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Stabilize route selection with cautious arbitration before committing to transport health.
- Reason: Decode confidence is strong, but transport health is mixed requiring guarded action.
- Commit: Commit to route with verified coherence to avoid overcommitting on unstable health.

### Q (gemma4:e4b)

- Vendor: Google DeepMind
- Completed tasks: `4/4`
- Structured parse success: `4/4` (1)
- Average model latency: `21992.15` ms
- P95 model latency: `41569.58` ms
- Average wall latency: `22004.56` ms
- Average structured fields: `3` / 3

#### Security triage

- Status: `completed`
- Model latency: `41569.58` ms
- Wall latency: `41583.79` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize fail-closed remediation by validating the forged ACK path immediately.
- Reason: Elevated pressure demands immediate stabilization against potential late ACK misinterpretations.
- Commit: Execute the fail-closed remediation pass to ensure system integrity now.

#### Ops recovery

- Status: `completed`
- Model latency: `16341.56` ms
- Wall latency: `16354.84` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the peer's lease jitter by isolating the sensor-array data stream.
- Reason: The jitter and failed execution require immediate focus on the sensor-array component.
- Commit: Initiate a controlled, bounded repair cycle while maintaining the existing retry lineage.

#### Coding fix

- Status: `completed`
- Model latency: `14792.85` ms
- Wall latency: `14804.36` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the orchestration by addressing the token leakage vulnerability.
- Reason: The core objective requires a patch ensuring same-origin access without exposing tokens.
- Commit: Implement a secure mechanism to handle operator access tokens client-side.

#### Orchestration route

- Status: `completed`
- Model latency: `15264.59` ms
- Wall latency: `15275.23` ms
- Structured fields: `3/3`
- Thinking detected: `false`
- Failure class: `none`
- Route: Prioritize stabilizing the orchestration by confirming the next logical step.
- Reason: Mixed transport health and strong decode confidence require deliberate arbitration.
- Commit: Execute a measured action, favoring caution over immediate, potentially risky movement.

