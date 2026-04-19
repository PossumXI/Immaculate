# Benchmark Status

This page is the tracked public benchmark surface for Immaculate.

- W&B project: https://wandb.ai/arobi-arobi-technology-alliance/immaculate
- Owner: Gaetano Comparcola (PossumX)
- Role: Program Originator, Systems Architect, and Engineering Lead
- Website: https://PossumX.dev
- Updated: 2026-04-19T01:15:07.415506+00:00

Raw benchmark ledgers remain generated runtime artifacts under `benchmarks/` and stay out of git.
This page only carries the public summary and links for the latest published run per pack.

## Latest Public Runs By Pack

### Latency Smoke

- Suite: `immaculate-benchmark-2026-04-19T01-14-47-581Z`
- Generated: `2026-04-19T01:14:47.581Z`
- Published: `2026-04-19T01:14:53.227803+00:00`
- Assertions: `122/122` passed
- Run kind: `smoke`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `12800` ms
- Wall-clock duration: `432.42` ms
- Hardware: `{"host":"runnervmeorf1","platform":"linux","arch":"x64","osVersion":"#10~24.04.1-Ubuntu SMP Fri Mar  6 22:00:57 UTC 2026","cpuModel":"AMD EPYC 9V74 80-Core Processor","cpuCount":4,"memoryGiB":15.61,"diskKind":"HDD (Virtual Disk)","nodeVersion":"v22.22.2"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/b9nbppzy
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-19T01-14-47-581Z` (`benchmark-report`)

### Durability Recovery

- Suite: `immaculate-benchmark-2026-04-19T01-14-47-136Z`
- Generated: `2026-04-19T01:14:47.136Z`
- Published: `2026-04-19T01:14:59.956645+00:00`
- Assertions: `122/122` passed
- Run kind: `smoke`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `20800` ms
- Wall-clock duration: `433.35` ms
- Hardware: `{"host":"runnervmeorf1","platform":"linux","arch":"x64","osVersion":"#10~24.04.1-Ubuntu SMP Fri Mar  6 22:00:57 UTC 2026","cpuModel":"AMD EPYC 9V74 80-Core Processor","cpuCount":4,"memoryGiB":15.61,"diskKind":"HDD (Virtual Disk)","nodeVersion":"v22.22.2"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/drszlqrl
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-19T01-14-47-136Z` (`benchmark-report`)

### Substrate Readiness

- Suite: `immaculate-benchmark-2026-04-19T01-14-46-480Z`
- Generated: `2026-04-19T01:14:46.480Z`
- Published: `2026-04-19T01:15:07.415484+00:00`
- Assertions: `122/122` passed
- Run kind: `smoke`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `12800` ms
- Wall-clock duration: `636.83` ms
- Hardware: `{"host":"runnervmeorf1","platform":"linux","arch":"x64","osVersion":"#10~24.04.1-Ubuntu SMP Fri Mar  6 22:00:57 UTC 2026","cpuModel":"AMD EPYC 9V74 80-Core Processor","cpuCount":4,"memoryGiB":15.61,"diskKind":"HDD (Virtual Disk)","nodeVersion":"v22.22.2"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/4o8uvhcy
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-19T01-14-46-480Z` (`benchmark-report`)

### Latency Soak (30m)

- Suite: `immaculate-benchmark-2026-04-15T23-30-50-517Z`
- Generated: `2026-04-15T23:30:50.517Z`
- Published: `2026-04-16T00:01:09.166729+00:00`
- Assertions: `115/117` passed
- Run kind: `benchmark`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `1800000` ms
- Wall-clock duration: `1800685.92` ms
- Hardware: `{"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"diskKind":"SSD","nodeVersion":"v22.13.1"}`
- W&B run: not available
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-15T23-30-50-517Z` (`benchmark-report`)

### Durability Torture

- Suite: `immaculate-benchmark-2026-04-13T01-57-58-711Z`
- Generated: `2026-04-13T01:57:58.711Z`
- Published: `2026-04-13T02:40:45.000040+00:00`
- Assertions: `5/5` passed
- Run kind: `benchmark`
- Integrity: `verified`
- Recovery mode: `checkpoint-replay`
- Planned duration: `dynamic / unpaced`
- Wall-clock duration: `2544132.71` ms
- Hardware: `{"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"diskKind":"SSD","nodeVersion":"v22.13.1"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/uhn1uwia
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-13T01-57-58-711Z` (`benchmark-report`)

### Temporal Baseline

- Suite: `immaculate-benchmark-2026-04-13T01-44-55-523Z`
- Generated: `2026-04-13T01:44:55.523Z`
- Published: `2026-04-13T01:45:21.866038+00:00`
- Assertions: `103/103` passed
- Run kind: `benchmark`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `dynamic / unpaced`
- Wall-clock duration: `1339.55` ms
- Hardware: `{"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"diskKind":"SSD","nodeVersion":"v22.13.1"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/k4v22stk
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-13T01-44-55-523Z` (`benchmark-report`)

### External Neurodata Ingest

- Suite: `immaculate-benchmark-2026-04-13T01-44-55-493Z`
- Generated: `2026-04-13T01:44:55.493Z`
- Published: `2026-04-13T01:45:09.006035+00:00`
- Assertions: `103/103` passed
- Run kind: `benchmark`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `dynamic / unpaced`
- Wall-clock duration: `3393.65` ms
- Hardware: `{"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"diskKind":"SSD","nodeVersion":"v22.13.1"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/4q19ci5g
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-13T01-44-55-493Z` (`benchmark-report`)

### Latency Soak (60m)

- Suite: `immaculate-benchmark-2026-04-12T21-48-36-880Z`
- Generated: `2026-04-12T21:48:36.880Z`
- Published: `2026-04-12T22:53:03.131108+00:00`
- Assertions: `99/99` passed
- Run kind: `soak`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `3600000` ms
- Wall-clock duration: `3600967.49` ms
- Hardware: `{"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"diskKind":"SSD","nodeVersion":"v22.13.1"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/5dnpoes7
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-12T21-48-36-880Z` (`benchmark-report`)

### Latency Benchmark (60s)

- Suite: `immaculate-benchmark-2026-04-12T19-36-44-817Z`
- Generated: `2026-04-12T19:36:44.817Z`
- Published: `2026-04-12T23:03:59.459136+00:00`
- Assertions: `99/99` passed
- Run kind: `benchmark`
- Integrity: `verified`
- Recovery mode: `checkpoint`
- Planned duration: `60000` ms
- Wall-clock duration: `61098.97` ms
- Hardware: `{"host":"knightly","platform":"win32","arch":"x64","osVersion":"Windows 11 Pro","cpuModel":"AMD Ryzen 7 7735HS with Radeon Graphics","cpuCount":16,"memoryGiB":23.29,"diskKind":"SSD","nodeVersion":"v22.13.1"}`
- W&B run: https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/wm8wf7bf
- W&B artifact: `immaculate-immaculate-benchmark-2026-04-12T19-36-44-817Z` (`benchmark-report`)
