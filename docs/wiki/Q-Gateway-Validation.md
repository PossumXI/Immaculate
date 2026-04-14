# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct Ollama call against the same provider model.

- Generated: 2026-04-14T11:48:11.906Z
- Gateway URL: http://127.0.0.1:8900
- Alias: Q
- Provider model: Q (gemma4:e4b)
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `43.47` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `1195.16` ms
- concurrent rejection: `429`

## Latency Comparison

- gateway end-to-end latency: `1195.16` ms
- gateway upstream latency header: `1095.24` ms
- gateway added latency: `99.92` ms
- direct Ollama latency: `1026.41` ms

## Direct Ollama Result

- failure class: `none`
- latency: `1026.41` ms
- wall latency: `1037.22` ms
- preview: Gateway reports healthy.
