# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct Ollama call against the same Q lane.

- Generated: 2026-04-17T02:48:43.496Z
- Release: 0.1.0+3c3e41d
- Repo commit: 3c3e41d
- Gateway URL: http://127.0.0.1:8902
- Alias: Q
- Q serving label: Q
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2-3c3e41d-766c8ccf
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `15.69` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `929.25` ms
- concurrent rejection: `429`

## Latency Comparison

- gateway end-to-end latency: `929.25` ms
- gateway upstream latency header: `848.61` ms
- gateway added latency: `80.64` ms
- direct Ollama latency: `905.93` ms

## Direct Ollama Result

- failure class: `none`
- latency: `905.93` ms
- wall latency: `922.76` ms
- preview: Gateway reports healthy status.
