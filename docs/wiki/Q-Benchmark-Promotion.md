# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-16T19:03:51Z`
- Status: `already-current`
- Release: `0.1.0+2384cf5`
- Repo commit: `2384cf5`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `b5322794988792306dbbab8264ce800d91da9cc2681d9f1e84f6accfc36b0ce2`
- Benchmark corpus rows: `19`
- Active Q bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-2384cf5-57097d65`
- Active run: `q-defsec-code-longctx-harbor-opt-2384cf5`
- Active session: `q-hybrid-harbor-opt-2384cf5`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Active mix rows: `31`
- Active mix manifest: `.training-output/q/q-mix-longctx-harbor-opt-2384cf5.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v1`
- Next candidate session id: `q-hybrid-harbor-opt-2384cf5-bench-v1`

## Truth Boundary

- A promoted state means the benchmark corpus has been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
