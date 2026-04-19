# Q Gateway Substrate

This page is generated from the dedicated `q-gateway-substrate` benchmark pack. It measures the real seam where the Q gateway hands structured work back into Immaculate arbitration.

- Generated: 2026-04-19T07:42:56.365Z
- Release: `0.1.0+5ed19b9`
- Repo commit: `5ed19b9`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v22-5ed19b9-e0c8b138`

## Benchmark

- Suite: `immaculate-benchmark-2026-04-19T07-22-36-454Z`
- Pack: `Q Gateway Substrate (q-gateway-substrate)`
- Failed assertions: `0`
- Structured fields P50: `3`
- Gateway latency P95: `18109.65 ms`
- Arbitration latency P95: `1.83 ms`
- Guard denials max: `3`
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics

## Assertions

- q-gateway-substrate-health: `pass` | target `200 + ok=true + modelReady=true` | actual `200`
- q-gateway-substrate-auth: `pass` | target `401` | actual `401`
- q-gateway-substrate-release-bind: `pass` | target `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v22-5ed19b9-e0c8b138` | actual `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v22-5ed19b9-e0c8b138`
- q-gateway-substrate-model-list: `pass` | target `Q public model name built on Gemma 4` | actual `200 / Q / Gemma 4`
- q-gateway-substrate-concurrency: `pass` | target `429` | actual `429`
- q-gateway-substrate-structured: `pass` | target `all scenarios parse 3 structured fields` | actual `elevated-recovery:completed/3/none, critical-guard-hold:completed/3/none`
- q-gateway-substrate-arbitration-pressure: `pass` | target `critical hold stays critical / elevated recovery stays elevated` | actual `elevated-recovery:elevated/guarded-review/dispatch=false, critical-guard-hold:critical/guarded-review/dispatch=false`
- q-gateway-substrate-guard-denials: `pass` | target `critical scenario with >=3 denials and no dispatch` | actual `3 denials / dispatch=false`
