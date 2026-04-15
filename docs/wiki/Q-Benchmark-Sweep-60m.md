# Q Benchmark Sweep (60m)

This page records the hour-class Q and Immaculate benchmark sweep. It ties the 60-minute benchmark publication lane to the repeated BridgeBench and Harbor task-pack lanes in one stamped surface.

- Generated: `2026-04-15T08:24:47.464Z`
- Release: `0.1.0+dd31cfa`
- Repo commit: `dd31cfa`
- Q serving label: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1-5e51e00-e16a056e`

## W&B 60m Soak

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

- Generated: `2026-04-15T08:22:53.565Z`
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

- The W&B section is the published hour-class benchmark lane for Immaculate.
- The BridgeBench and Harbor sections are repo-local repeated Q-only sweeps and remain distinct from W&B publication unless explicitly published there.
- If a section is missing, that run was not produced yet in this checkout.
