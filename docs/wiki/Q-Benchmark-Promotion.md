# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-15T04:39:43Z`
- Status: `already-current`
- Release: `0.1.0+72ce54c`
- Repo commit: `72ce54c`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `8eba105be5172066bafddad02fe1f92f2549e909afabb879dc46bbe67fec56b6`
- Benchmark corpus rows: `10`
- Active Q bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1-5e51e00-e16a056e`
- Active run: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1`
- Active session: `q-hybrid-cur-fnv1a-8f551a5c-bench-v1`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Active mix rows: `1023`
- Active mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v1.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v1/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2`
- Next candidate session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`

## Truth Boundary

- A promoted state means the benchmark corpus has been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
