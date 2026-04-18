# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-18T02:33:22Z`
- Status: `promoted`
- Release: `0.1.0+35ab7e8`
- Repo commit: `35ab7e8`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `d1d95230ba6c39234dc49b75e9c926288162ffd60fee6f718e017ac6a312899f`
- Benchmark corpus rows: `54`
- Active Q bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16-35ab7e8-de7361fa`
- Active run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16`
- Active session: `q-hybrid-harbor-opt-2384cf5-bench-v16`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Failure corpus already in active mix: `True`
- Active mix rows: `109`
- Active mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v16/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v17`
- Next candidate session id: `q-hybrid-harbor-opt-2384cf5-bench-v17`

## Latest Promotion

- Promoted bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16-35ab7e8-de7361fa`
- Promoted run: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16`
- Promoted session: `q-hybrid-harbor-opt-2384cf5-bench-v16`
- Dataset rows: `109`
- Mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16.manifest.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5-bench-v16.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus and any available strict failure corpus have been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash plus any available strict failure corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
