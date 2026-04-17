# Q Benchmark Corpus

This page is generated from the tracked Q benchmark/report surfaces.
It records the benchmark-derived corpus currently attached to Q. It is not a readiness gate and it does not replace the strict failure-only Q-Failure-Corpus surface.

- Generated: `2026-04-17T10:18:30Z`
- Release: `0.1.0+848d44f`
- Repo commit: `848d44f`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13-848d44f-beff091d`
- Records: `49`
- Row type: `mixed`
- JSONL: `.training-output/q/q-benchmark-corpus.jsonl`

## Sources

- model-comparison: `4` via `docs/wiki/Model-Benchmark-Comparison.json`
- bridgebench: `4` via `docs/wiki/BridgeBench.json`
- harbor-terminal-bench: `2` via `docs/wiki/Harbor-Terminal-Bench.json`
- q-gateway-substrate: `1` via `docs/wiki/Q-Gateway-Substrate.json`
- bridgebench-soak: `1` via `docs/wiki/BridgeBench-Soak.json`
- harbor-terminal-bench-soak: `7` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- q-harness-identity-seed: `14` via `training/q/q_harness_identity_seed.json`
- q-immaculate-reasoning-seed: `16` via `training/q/q_immaculate_reasoning_seed.json`

## Truth Boundary

- This surface records successful benchmark-derived decision rows for Q so the training path can reuse tracked outputs without scraping markdown by hand.
- Harbor rows that stayed parse-valid but underperformed are carried as benchmark observations so Q can learn the miss without promoting the weak wording as gold output.
- The official public Terminal-Bench receipt stays in the strict failure/eval path instead of being mixed into the positive benchmark corpus.
- It is intentionally complementary to Q-Failure-Corpus, which remains strict failure-only and should stay empty when the current Q benchmark lane is green.
- These rows are output-side evidence from executed Q benchmarks. They help stabilize route/reason/commit behavior, but they are not a substitute for broader curation or new external truth sources.
