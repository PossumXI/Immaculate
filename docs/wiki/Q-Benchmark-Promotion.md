# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-17T20:29:42Z`
- Status: `promoted`
- Release: `0.1.0+30d48b7`
- Repo commit: `30d48b7`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `06f2da1ac20a206d1cbb0a49df6bd59acaa6452d15c204d0e6a7111804389134`
- Benchmark corpus rows: `54`
- Active Q bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14-30d48b7-248a8349`
- Active run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14`
- Active session: `q-hybrid-harbor-opt-2384cf5-bench-v14`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Failure corpus already in active mix: `True`
- Active mix rows: `109`
- Active mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v14/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v15`
- Next candidate session id: `q-hybrid-harbor-opt-2384cf5-bench-v15`

## Latest Promotion

- Promoted bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14-30d48b7-248a8349`
- Promoted run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14`
- Promoted session: `q-hybrid-harbor-opt-2384cf5-bench-v14`
- Dataset rows: `109`
- Mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14.manifest.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5-bench-v14.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus and any available strict failure corpus have been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash plus any available strict failure corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
