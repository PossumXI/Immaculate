# Q Benchmark Sweep (60m)

This page records the hour-class Q and Immaculate benchmark sweep. It ties the historical 60-minute W&B soak lane to the repeated BridgeBench and Harbor task-pack lanes in one stamped surface.

- Generated: `2026-04-17T20:51:08.584Z`
- Release: `0.1.0+30d48b7`
- Repo commit: `30d48b7`
- Q model name: `Q`
- Q foundation model: `Gemma 4`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14-30d48b7-248a8349`

## Latest W&B Publication

This is the current newest W&B benchmark publication tracked in git. Read this first if you want the latest published W&B result rather than the last hour-class soak rerun.

- Pack: `Substrate Readiness`
- Suite: `immaculate-benchmark-2026-04-17T02-09-25-503Z`
- Published: `2026-04-17T02:11:17.210524+00:00`
- Run URL: `https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/hp3m80eh`
- Failed assertions: `0` / `119`

## Historical W&B 60m Soak

This is the last published hour-class soak lane. It remains useful historical evidence, but it is not automatically the newest W&B benchmark unless the 60m pack is rerun.

- Suite: `immaculate-benchmark-2026-04-12T21-48-36-880Z`
- Pack: `Latency Soak (60m)`
- Published: `2026-04-12T22:53:03.131108+00:00`
- Planned duration ms: `3600000`
- Wall duration ms: `3600967.49`
- Failed assertions: `0` / `99`
- Run URL: `https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/5dnpoes7`

## BridgeBench Soak

- Generated: `2026-04-15T06:15:54.188Z`
- Duration seconds: `3600`
- Runs: `56` attempted / `56` completed / `0` failed
- Parse success: `224/224` (1.00)
- Latency ms: avg `15252.40` / p95 `21327.47` / min `11448.82` / max `46594.64` / median `15493.94`
- Run latency ms: avg `15252.40` / p95 `19741.32`
- Bridge runtime failed assertions: `0` across `0` runs

## Harbor Terminal Bench Soak

- Generated: `2026-04-16T13:05:24.510Z`
- Duration seconds: `3600`
- Total runs: `90`
- Oracle avg score: `1.000` | avg duration `8.99 s`
- Q avg score: `1.000` | avg duration `17.49 s`

### Q structured contract

- Oracle runs: `23` | avg score `1.000` | avg duration `9.09 s`
- Q runs: `23` | avg score `1.000` | avg duration `17.19 s`

### Immaculate bridge fail-closed

- Oracle runs: `22` | avg score `1.000` | avg duration `8.88 s`
- Q runs: `22` | avg score `1.000` | avg duration `17.81 s`

## Truth Boundary

- The latest W&B publication may be newer than the historical 60m soak lane shown here.
- Read `docs/wiki/Benchmark-Status.md` and `docs/wiki/Benchmark-Wandb-Export.md` for the newest published W&B result.
- The 60m section on this page is historical hour-class evidence, not an automatic "latest" claim.
- The BridgeBench and Harbor sections are repo-local repeated Q-only sweeps and remain distinct from W&B publication unless explicitly published there.
- If a section is missing, that run was not produced yet in this checkout.
