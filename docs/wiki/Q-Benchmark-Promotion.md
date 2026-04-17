# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-17T09:49:30Z`
- Status: `promoted`
- Release: `0.1.0+848d44f`
- Repo commit: `848d44f`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `82a3c06884df39c8e93091e315a94aca34801509bfbe708f1dc1d6edf7ff8eab`
- Benchmark corpus rows: `49`
- Active Q bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13-848d44f-beff091d`
- Active run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13`
- Active session: `q-hybrid-harbor-opt-2384cf5-bench-v13`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Failure corpus already in active mix: `True`
- Active mix rows: `100`
- Active mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v13/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14`
- Next candidate session id: `q-hybrid-harbor-opt-2384cf5-bench-v14`

## Latest Promotion

- Promoted bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13-848d44f-beff091d`
- Promoted run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13`
- Promoted session: `q-hybrid-harbor-opt-2384cf5-bench-v13`
- Dataset rows: `100`
- Mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13.manifest.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5-bench-v13.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus and any available strict failure corpus have been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash plus any available strict failure corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
