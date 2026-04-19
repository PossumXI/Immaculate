# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct local Q foundation-model call against the same Q stack.

- Generated: 2026-04-19T07:47:33.854Z
- Release: 0.1.0+5ed19b9
- Repo commit: 5ed19b9
- Gateway URL: http://127.0.0.1:8937
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `3.8` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `18131.48` ms
- authenticated identity smoke: `200` | canonical `true`
- concurrent rejection: `429`

## Identity Smoke

- preview: I am Q, developed by Arobi Technology Alliance and built on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer behind the project, and Immaculate is my governed orchestration harness.

## Latency Comparison

- gateway end-to-end latency: `18131.48` ms
- gateway upstream latency header: `18047.79` ms
- gateway added latency: `83.69` ms
- direct local Q foundation-model latency: `1059.12` ms

## Direct Local Q Foundation Result

- failure class: `none`
- latency: `1059.12` ms
- wall latency: `1079.29` ms
- preview: Gateway is fine.
