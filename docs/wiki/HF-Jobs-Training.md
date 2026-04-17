# HF Jobs Training

This page records the real Hugging Face Jobs workaround path for the active Q and Immaculate cloud bundle.

- Generated: `2026-04-17T10:09:58Z`
- Release: `0.1.0+848d44f`
- Session id: `q-hybrid-harbor-opt-2384cf5-bench-v13`
- Authenticated user: `TruLumecreator`
- HF CLI path: `C:\Users\Knight\Desktop\Immaculate\Immaculate-push-harbor\.tools\foundry-venv\Scripts\hf.exe`

## Bundle Staging

- Dataset repo: `TruLumecreator/immaculate-q-cloud-bundles`
- Archive path: `sessions/q-hybrid-harbor-opt-2384cf5-bench-v13/q-hybrid-harbor-opt-2384cf5-bench-v13-cloud-bundle.tar.gz`
- Manifest path: `sessions/q-hybrid-harbor-opt-2384cf5-bench-v13/bundle-manifest.json`
- Bundle staged: `True`

## Jobs Surface

- Hardware flavors visible: `18`
- GPU-capable flavors visible: `t4-small, t4-medium, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, h200, h200x2, h200x4, l4x1, l4x4, l40sx1, l40sx4`
- Existing jobs visible: `0`
- Job image: `python:3.12`
- Launch mode: `dry-run`
- Training bootstrap: `auto`

## Smoke Launch

- Attempted: `False`
- Ready: `False`
- Flavor: `cpu-basic`
- Timeout: `5m`
- Job id: `n/a`
- Blocker: None

## Truth Boundary

- This path proves Hugging Face Jobs auth, hardware visibility, and bundle staging separately from OCI.
- A successful dataset upload does not claim a cloud training run happened.
- In train mode the remote runner bootstraps the tracked Python training stack before it invokes the Q trainer.
- A failed smoke launch is recorded as a billing or provider blocker, not papered over as cloud readiness.
