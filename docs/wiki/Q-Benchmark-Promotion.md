# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-17T02:45:47Z`
- Status: `promoted`
- Release: `0.1.0+3c3e41d`
- Repo commit: `3c3e41d`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `38ec3995ab672b28105eeebccd844c6d4f1d275d72f43487978d2246dd1bc512`
- Benchmark corpus rows: `19`
- Active Q bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2-3c3e41d-766c8ccf`
- Active run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2`
- Active session: `q-hybrid-harbor-opt-2384cf5-bench-v2`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Active mix rows: `31`
- Active mix manifest: `.training-output/q/q-mix-longctx-harbor-opt-2384cf5-bench-v2.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v2/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v3`
- Next candidate session id: `q-hybrid-harbor-opt-2384cf5-bench-v3`

## Latest Promotion

- Promoted bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2-3c3e41d-766c8ccf`
- Promoted run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2`
- Promoted session: `q-hybrid-harbor-opt-2384cf5-bench-v2`
- Dataset rows: `31`
- Mix manifest: `.training-output/q/q-mix-longctx-harbor-opt-2384cf5-bench-v2.manifest.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5-bench-v2.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus has been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
