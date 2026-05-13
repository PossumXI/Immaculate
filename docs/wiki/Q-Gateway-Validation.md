# Q Gateway Validation

This page is generated from a real live loopback validation pass against the dedicated Q gateway process, plus a direct configured Q inference call against the same Q stack.

- Generated: 2026-05-13T19:56:21.252Z
- Release: 0.1.0+f4777be
- Repo commit: f4777be
- Gateway URL: http://127.0.0.1:57932
- Q model name: Q
- Q foundation model: Gemma 4
- Q training bundle: q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.28,"nodeVersion":"v22.13.1"}

## Contract Checks

- /health: `200` in `5.14` ms
- unauthorized /v1/chat/completions: `401`
- authenticated /api/q/info: `200`
- authenticated /v1/models: `200`
- authenticated /v1/chat/completions: `200` in `11657.69` ms
- authenticated identity smoke: `200` | canonical `true`
- concurrent rejection: `429`

## Identity Smoke

- preview: I am Q, developed by Arobi Technology Alliance and built on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer behind the project. Immaculate is my governed orchestration harness, and Arobi Network is the operator ledger and audit substrate around us.

## Latency Comparison

- gateway end-to-end latency: `11657.69` ms
- gateway upstream latency header: `11496.21` ms
- gateway added latency: `161.48` ms
- direct configured Q inference latency: `11729.24` ms

## Direct Q Inference Result

- failure class: `none`
- latency: `11729.24` ms
- wall latency: `11735.63` ms
- preview: Gateway is fine.
