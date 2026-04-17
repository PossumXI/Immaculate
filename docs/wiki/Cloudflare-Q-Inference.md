# Cloudflare Q Inference

This page records the Cloudflare deploy and evaluation lane for Q-only inference.

- Generated: `2026-04-17T02:46:23Z`
- Release: `0.1.0+3c3e41d`
- Session id: `q-hybrid-harbor-opt-2384cf5-bench-v2`
- Session path: `.training-output/q/latest-hybrid-session.json`
- Status: `auth-blocked`
- Worker config: `deploy/cloudflare/wrangler.toml`
- Worker typecheck ready: `True`

## Readiness

- Auth ready: `False`
- Adapter ready: `False`
- Worker ready: `False`
- Eval bundle ready: `True`
- Smoke ready: `False`
- Recommended next step: Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then rerun the Cloudflare inference check.

## Cloudflare Auth

- Account id ready: `False`
- API token ready: `False`
- Gateway id: `default`
- Gateway compat URL: `n/a`
- Auth header: `cf-aig-authorization: Bearer <token>`

## Adapter Export

- Ready: `False`
- Source dir: `.training-output/q/runs/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2`
- Output dir: `.training-output/q/cloudflare/q-hybrid-harbor-opt-2384cf5-bench-v2/adapter`
- Adapter config: `n/a`
- Adapter weights: `n/a`
- Weights size MB: `n/a`
- Adapter blocker: Adapter source directory is missing: .training-output/q/runs/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2
- Adapter blocker: adapter_config.json is missing from the candidate adapter source.
- Adapter blocker: adapter_model.safetensors is missing from the candidate adapter source.

## Eval Bundle

- Ready: `True`
- Record count: `19`
- Available source rows: `19`
- JSONL path: `.training-output/q/cloudflare/q-hybrid-harbor-opt-2384cf5-bench-v2/eval/cloudflare-q-eval-bundle.jsonl`
- Manifest path: `.training-output/q/cloudflare/q-hybrid-harbor-opt-2384cf5-bench-v2/eval/cloudflare-q-eval-bundle.json`
- Source surface counts: `{"bridgebench": 4, "bridgebench-soak": 1, "harbor-terminal-bench": 2, "harbor-terminal-bench-soak": 7, "model-comparison": 4, "q-gateway-substrate": 1}`
- Selection group counts: `{"bridgebench-soak:benchmark_observation:completed": 1, "bridgebench:decision_triplet:completed": 4, "harbor-terminal-bench-soak:benchmark_observation:completed": 1, "harbor-terminal-bench-soak:decision_triplet:completed": 6, "harbor-terminal-bench:benchmark_observation:degraded": 2, "model-comparison:decision_triplet:completed": 4, "q-gateway-substrate:benchmark_observation:completed": 1}`

## Worker And Gateway

- Worker package path: `deploy/cloudflare/worker`
- Deploy script: `deploy/cloudflare/scripts/deploy-cloudflare-worker.sh`
- Worker URL configured: `False`
- Worker URL: `n/a`
- Base model configured: `False`
- LoRA name configured: `False`
- Worker health attempted: `False`
- Worker health ready: `False`
- Worker health status: `n/a`
- Worker health payload: `n/a`
- Worker health blocker: n/a

## Smoke Eval

- Attempted: `False`
- Ready: `False`
- Evaluated rows: `0`
- Blocker: n/a

## Truth Boundary

- This lane treats Cloudflare as a Q inference and evaluation plane, not the heavy training backend.
- The worker serves only the public Q identity and rejects other model labels.
- A Cloudflare deploy is not claimed until account auth, a Cloudflare-ready adapter bundle, and worker deployment all exist together.
- AI Gateway is used for logging and evaluation metadata around the Q worker path instead of pretending Cloudflare is the source of the Q fine-tune itself.
