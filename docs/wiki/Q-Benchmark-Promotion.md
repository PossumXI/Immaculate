# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-18T05:48:17Z`
- Status: `promoted`
- Release: `0.1.0+d0bdd00`
- Repo commit: `d0bdd00`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `52053ab3a1399e120143bc58a00e745182d5fab78f0081a65841b6ed81a5de88`
- Benchmark corpus rows: `55`
- Active Q bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v18-d0bdd00-4db18397`
- Active run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v18`
- Active session: `q-hybrid-harbor-opt-2384cf5-bench-v18`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Failure corpus already in active mix: `True`
- Active mix rows: `110`
- Active mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v18.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v18/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v19`
- Next candidate session id: `q-hybrid-harbor-opt-2384cf5-bench-v19`

## Latest Promotion

- Promoted bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v18-d0bdd00-4db18397`
- Promoted run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v18`
- Promoted session: `q-hybrid-harbor-opt-2384cf5-bench-v18`
- Dataset rows: `110`
- Mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v18.manifest.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5-bench-v18.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus and any available strict failure corpus have been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash plus any available strict failure corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
