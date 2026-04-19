# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-19T07:46:03Z`
- Status: `promoted`
- Release: `0.1.0+5ed19b9`
- Repo commit: `5ed19b9`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `841dc9cff8ca792ce2d907b1b3fe74d52b34bb194bb7847e97be26eb6f4daae0`
- Benchmark corpus rows: `55`
- Active Q bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`
- Active run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23`
- Active session: `q-hybrid-harbor-opt-2384cf5-bench-v23`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Failure corpus already in active mix: `True`
- Active mix rows: `117`
- Active mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v23/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v24`
- Next candidate session id: `q-hybrid-harbor-opt-2384cf5-bench-v24`

## Latest Promotion

- Promoted bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`
- Promoted run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23`
- Promoted session: `q-hybrid-harbor-opt-2384cf5-bench-v23`
- Dataset rows: `117`
- Mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23.manifest.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5-bench-v23.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus and any available strict failure corpus have been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash plus any available strict failure corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
