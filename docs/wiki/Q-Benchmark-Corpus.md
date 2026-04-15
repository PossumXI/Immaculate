# Q Benchmark Corpus

This page is generated from the tracked Q benchmark/report surfaces.
It records the benchmark-derived corpus currently attached to Q. It is not a readiness gate and it does not replace the strict failure-only Q-Failure-Corpus surface.

- Generated: `2026-04-15T03:40:56Z`
- Release: `0.1.0+d6927bb`
- Repo commit: `d6927bb`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1-d6927bb-e16a056e`
- Records: `10`
- Row type: `decision_triplet`
- JSONL: `.training-output/q/q-benchmark-corpus.jsonl`

## Sources

- model-comparison: `4` via `docs/wiki/Model-Benchmark-Comparison.json`
- bridgebench: `4` via `docs/wiki/BridgeBench.json`
- harbor-terminal-bench: `2` via `docs/wiki/Harbor-Terminal-Bench.json`

## Truth Boundary

- This surface records successful benchmark-derived decision rows for Q so the training path can reuse tracked outputs without scraping markdown by hand.
- It is intentionally complementary to Q-Failure-Corpus, which remains strict failure-only and should stay empty when the current Q benchmark lane is green.
- These rows are output-side evidence from executed Q benchmarks. They help stabilize route/reason/commit behavior, but they are not a substitute for broader curation or new external truth sources.
