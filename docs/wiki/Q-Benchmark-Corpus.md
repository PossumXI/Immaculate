# Q Benchmark Corpus

This page is generated from the tracked Q benchmark/report surfaces.
It records the benchmark-derived corpus currently attached to Q. It is not a readiness gate and it does not replace the strict failure-only Q-Failure-Corpus surface.

- Generated: `2026-04-17T02:02:39Z`
- Release: `0.1.0+6190f63`
- Repo commit: `6190f63`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v1-45280d5-a181f850`
- Records: `20`
- Row type: `mixed`
- JSONL: `.training-output/q/q-benchmark-corpus.jsonl`

## Sources

- model-comparison: `4` via `docs/wiki/Model-Benchmark-Comparison.json`
- bridgebench: `4` via `docs/wiki/BridgeBench.json`
- harbor-terminal-bench: `2` via `docs/wiki/Harbor-Terminal-Bench.json`
- q-gateway-substrate: `1` via `docs/wiki/Q-Gateway-Substrate.json`
- terminal-bench-receipt: `1` via `docs/wiki/Terminal-Bench-Receipt.json`
- bridgebench-soak: `1` via `docs/wiki/BridgeBench-Soak.json`
- harbor-terminal-bench-soak: `7` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`

## Truth Boundary

- This surface records successful benchmark-derived decision rows for Q so the training path can reuse tracked outputs without scraping markdown by hand.
- Harbor rows that stayed parse-valid but underperformed are carried as benchmark observations so Q can learn the miss without promoting the weak wording as gold output.
- The official public Terminal-Bench receipt is carried here as benchmark observation evidence, not as a fake successful decision-triplet row.
- It is intentionally complementary to Q-Failure-Corpus, which remains strict failure-only and should stay empty when the current Q benchmark lane is green.
- These rows are output-side evidence from executed Q benchmarks. They help stabilize route/reason/commit behavior, but they are not a substitute for broader curation or new external truth sources.
