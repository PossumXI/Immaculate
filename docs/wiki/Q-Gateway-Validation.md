# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct Ollama call against the same Q lane.

- Generated: 2026-04-15T02:32:19.275Z
- Release: 0.1.0+194a8fc
- Repo commit: 194a8fc
- Gateway URL: http://127.0.0.1:8915
- Alias: Q
- Q serving label: Q
- Q training bundle: q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `19.97` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `941.53` ms
- concurrent rejection: `429`

## Latency Comparison

- gateway end-to-end latency: `941.53` ms
- gateway upstream latency header: `857.33` ms
- gateway added latency: `84.2` ms
- direct Ollama latency: `873.3` ms

## Direct Ollama Result

- failure class: `none`
- latency: `873.3` ms
- wall latency: `892.16` ms
- preview: Gateway reports healthy status.
