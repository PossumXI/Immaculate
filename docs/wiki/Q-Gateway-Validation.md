# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct local Q foundation-model call against the same Q stack.

- Generated: 2026-04-17T10:12:01.155Z
- Release: 0.1.0+848d44f
- Repo commit: 848d44f
- Gateway URL: http://127.0.0.1:8910
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13-848d44f-beff091d
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `3.61` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `1552.89` ms
- authenticated identity smoke: `200` | canonical `true`
- concurrent rejection: `429`

## Identity Smoke

- preview: I am Q, developed by Arobi Technology Alliance and built on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer behind the project, and Immaculate is my governed orchestration harness.

## Latency Comparison

- gateway end-to-end latency: `1552.89` ms
- gateway upstream latency header: `1471.39` ms
- gateway added latency: `81.5` ms
- direct local Q foundation-model latency: `1402.67` ms

## Direct Local Q Foundation Result

- failure class: `none`
- latency: `1402.67` ms
- wall latency: `1424.07` ms
- preview: Gateway reports healthy status.
