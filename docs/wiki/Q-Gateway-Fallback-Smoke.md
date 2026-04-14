# Q Gateway Fallback Smoke

This page is generated from a live gateway smoke where the primary Q model is intentionally invalid and the dedicated gateway must fail over honestly to the configured fallback model.

- Generated: 2026-04-14T03:03:47.684Z
- Gateway URL: http://127.0.0.1:8898
- Hardware: {"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"nodeVersion":"v22.13.1"}

## Checks

- /health: `200`
- first fallback chat: `200` via `gemma3:4b`
- second fallback chat: `200` with circuit state `open`
