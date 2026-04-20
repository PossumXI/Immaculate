# Q Benchmark Corpus

This page is generated from the tracked Q benchmark/report surfaces.
It records the benchmark-derived corpus currently attached to Q. It is not a readiness gate and it does not replace the strict failure-only Q-Failure-Corpus surface.

- Generated: `2026-04-20T02:38:43Z`
- Release: `0.1.0+a160517`
- Repo commit: `a160517`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`
- Records: `58`
- Row type: `mixed`
- JSONL: `.training-output/q/q-benchmark-corpus.jsonl`

## Sources

- model-comparison: `4` via `docs/wiki/Model-Benchmark-Comparison.json`
- bridgebench: `4` via `docs/wiki/BridgeBench.json`
- harbor-terminal-bench: `2` via `docs/wiki/Harbor-Terminal-Bench.json`
- q-gateway-substrate: `1` via `docs/wiki/Q-Gateway-Substrate.json`
- q-mediation-drift: `1` via `docs/wiki/Q-Mediation-Drift.json`
- arobi-audit-integrity: `1` via `docs/wiki/Arobi-Audit-Integrity.json`
- roundtable-actionability: `1` via `docs/wiki/Roundtable-Actionability.json`
- roundtable-runtime: `1` via `docs/wiki/Roundtable-Runtime.json`
- bridgebench-soak: `1` via `docs/wiki/BridgeBench-Soak.json`
- harbor-terminal-bench-soak: `7` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- terminal-bench-public-task: `1` via `docs/wiki/Terminal-Bench-Public-Task.json`
- q-harness-identity-seed: `14` via `training/q/q_harness_identity_seed.json`
- q-immaculate-reasoning-seed: `20` via `training/q/q_immaculate_reasoning_seed.json`

## Diagnostic-Only Sources Excluded

- terminal-bench-rerun: `1`

## Truth Boundary

- This surface records successful benchmark-derived decision rows for Q so the training path can reuse tracked outputs without scraping markdown by hand.
- Harbor rows that stayed parse-valid but underperformed are carried as benchmark observations so Q can learn the miss without promoting the weak wording as gold output.
- Successful local Harbor runs on the official public Terminal-Bench task can enter the positive benchmark corpus once the default Q-only path is genuinely green.
- Diagnostic-only Terminal-Bench reruns stay out of the positive benchmark corpus until the default public-task path is genuinely green and resubmitted.
- The official public Terminal-Bench receipt stays in the strict failure/eval path instead of being mixed into the positive benchmark corpus.
- It is intentionally complementary to Q-Failure-Corpus, which remains strict failure-only and should stay empty when the current Q benchmark lane is green.
- These rows are output-side evidence from executed Q benchmarks. They help stabilize route/reason/commit behavior, but they are not a substitute for broader curation or new external truth sources.
