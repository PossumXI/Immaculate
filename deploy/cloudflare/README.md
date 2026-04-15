# Cloudflare Q Inference

This lane treats Cloudflare as a Q-only deploy and evaluation plane.

It does not claim Cloudflare is the heavy training backend for the current Q bundle.

Use it for:

- packaging a Cloudflare-ready Q adapter artifact
- deploying a bounded Q-only worker through Workers AI
- routing inference through AI Gateway for logging and evaluations
- replaying a small benchmark-derived eval bundle against the deployed Q worker

Primary entrypoints:

- `npm run q:cloudflare:adapter -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --check`
- `npm run q:cloudflare:eval-bundle -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json`
- `npm run q:cloudflare:inference -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --check`
- `bash deploy/cloudflare/scripts/deploy-cloudflare-worker.sh --env-file deploy/cloudflare/env/immaculate-q-cloudflare.env.example --check`

Required Cloudflare env is documented in `deploy/cloudflare/env/immaculate-q-cloudflare.env.example`.
