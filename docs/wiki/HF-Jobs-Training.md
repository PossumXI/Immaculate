# HF Jobs Training

This page records the real Hugging Face Jobs workaround path for the active Q and Immaculate cloud bundle.

- Generated: `2026-04-15T18:57:58Z`
- Release: `0.1.0+bb5d749`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`
- Authenticated user: `TruLumecreator`
- HF CLI path: `C:\Users\Knight\Desktop\Immaculate\.tools\foundry-venv\Scripts\hf.exe`

## Bundle Staging

- Dataset repo: `TruLumecreator/immaculate-q-cloud-bundles`
- Archive path: `sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-cloud-bundle.tar.gz`
- Manifest path: `sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/bundle-manifest.json`
- Bundle staged: `True`

## Jobs Surface

- Hardware flavors visible: `18`
- GPU-capable flavors visible: `t4-small, t4-medium, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, h200, h200x2, h200x4, l4x1, l4x4, l40sx1, l40sx4`
- Existing jobs visible: `0`

## Smoke Launch

- Attempted: `True`
- Ready: `False`
- Flavor: `cpu-basic`
- Timeout: `5m`
- Job id: `n/a`
- Blocker: Error: Client error '402 Payment Required' for url 'https://huggingface.co/api/jobs/TruLumecreator' (Request ID: Root=1-69dfdfb3-6d068e3b2fa32b847cc2e8ec;644d56af-8af0-4c7d-a5f4-d3a14bca61cd)
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402

Pre-paid credit balance is insufficient - add more credits to your account to use Jobs.

## Truth Boundary

- This path proves Hugging Face Jobs auth, hardware visibility, and bundle staging separately from OCI.
- A successful dataset upload does not claim a cloud training run happened.
- A failed smoke launch is recorded as a billing or provider blocker, not papered over as cloud readiness.
