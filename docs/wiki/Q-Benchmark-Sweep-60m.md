# Q Benchmark Sweep (60m)

This page records the hour-class Q and Immaculate benchmark sweep. It ties the 60-minute benchmark publication lane to the repeated BridgeBench and Harbor task-pack lanes in one stamped surface.

- Generated: `2026-04-17T07:13:20.835Z`
- Release: `0.1.0+848d44f`
- Repo commit: `848d44f`
- Q model name: `Q`
- Q foundation model: `Gemma 4`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v8-848d44f-4a805f5f`

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

- The W&B section is the published hour-class benchmark lane for Immaculate.
- The BridgeBench and Harbor sections are repo-local repeated Q-only sweeps and remain distinct from W&B publication unless explicitly published there.
- If a section is missing, that run was not produced yet in this checkout.
