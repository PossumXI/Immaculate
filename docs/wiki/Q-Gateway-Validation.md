# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct Ollama call against the same provider model.

- Generated: 2026-04-14T15:45:30.608Z
- Release: 0.1.0+f3886f2
- Repo commit: f3886f2
- Gateway URL: http://127.0.0.1:8905
- Alias: Q
- Provider model: Q (gemma4:e4b)
- Q training bundle: q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `44.27` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `1117.09` ms
- concurrent rejection: `429`

## Latency Comparison

- gateway end-to-end latency: `1117.09` ms
- gateway upstream latency header: `1002.25` ms
- gateway added latency: `114.84` ms
- direct Ollama latency: `981.13` ms

## Direct Ollama Result

- failure class: `none`
- latency: `981.13` ms
- wall latency: `995.66` ms
- preview: Gateway reports healthy status.
