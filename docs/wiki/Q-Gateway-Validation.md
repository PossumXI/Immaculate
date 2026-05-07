# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct configured Q inference call against the same Q stack.

- Generated: 2026-05-07T07:32:32.750Z
- Release: 0.1.0+d1c83bf
- Repo commit: d1c83bf
- Gateway URL: http://127.0.0.1:51008
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.28,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `4.24` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `58653.35` ms
- authenticated identity smoke: `200` | canonical `true`
- concurrent rejection: `429`

## Identity Smoke

- preview: I am Q, developed by Arobi Technology Alliance and built on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer behind the project. Immaculate is my governed orchestration harness, and Arobi Network is the operator ledger and audit substrate around us.

## Latency Comparison

- gateway end-to-end latency: `58653.35` ms
- gateway upstream latency header: `58423.98` ms
- gateway added latency: `229.37` ms
- direct configured Q inference latency: `1889.15` ms

## Direct Q Inference Result

- failure class: `none`
- latency: `1889.15` ms
- wall latency: `1912.07` ms
- preview: Gateway is fine
