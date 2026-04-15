# Immaculate Training Bundle

`Immaculate` is not a separate model-weight lane in this repo.
In plain English, this folder is the training-and-improvement lane for the orchestration system itself: benchmark traces, gateway checks, Harbor tasks, and release signals that can be fed back into routing logic, evals, and policy hardening.

## What This Bundle Does

- captures the latest orchestration evidence from tracked wiki JSON surfaces
- turns that evidence into one reproducible bundle under `.training-output/immaculate/`
- keeps the boundary honest: `Q` gets fine-tuned, while `Immaculate` gets improved through orchestration signals and evaluation data

## Command

```powershell
npm run immaculate:training:bundle
```

Default output:

- `.training-output/immaculate/immaculate-training-bundle.json`
- `.training-output/immaculate/latest-training-bundle.json`

## Current Inputs

- `docs/wiki/Harbor-Terminal-Bench.json`
- `docs/wiki/BridgeBench.json`
- `docs/wiki/Model-Benchmark-Comparison.json`
- `docs/wiki/Q-Gateway-Validation.json`
- `docs/wiki/Q-Readiness-Gate.json`

## Truth Boundary

- This bundle improves orchestration and evaluation.
- It does not claim there is a separate Immaculate weight fine-tune.
- It does not replace benchmark reruns, security review, or operator validation.
