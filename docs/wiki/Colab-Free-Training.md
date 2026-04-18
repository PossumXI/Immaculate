# Colab Free Training

This page records the free supplemental Colab lane for the active Q and Immaculate hybrid session.

- Generated: `2026-04-18T06:20:57Z`
- Release: `0.1.0+d0bdd00`
- Session id: `q-hybrid-harbor-opt-2384cf5-bench-v18`
- Notebook path: `deploy/colab/notebooks/q-hybrid-harbor-opt-2384cf5-bench-v18-colab-free.ipynb`
- Open in Colab: `https://colab.research.google.com/github/PossumXI/Immaculate/blob/main/deploy/colab/notebooks/q-hybrid-harbor-opt-2384cf5-bench-v18-colab-free.ipynb`

## What This Lane Does

- Replays the staged hybrid cloud bundle inside a Colab runtime.
- Rebuilds the Immaculate orchestration bundle from the same session inputs.
- Runs a bounded Q micro-train only when the Colab GPU has enough memory.
- Stops at doctor plus dry-run when the free runtime is too small instead of overstating cloud readiness.

## Bundle Source

- Source type: `hf_dataset`
- Dataset repo: `TruLumecreator/immaculate-q-cloud-bundles`
- Archive path: `sessions/q-hybrid-harbor-opt-2384cf5-bench-v18/q-hybrid-harbor-opt-2384cf5-bench-v18-cloud-bundle.tar.gz`
- Manifest path: `sessions/q-hybrid-harbor-opt-2384cf5-bench-v18/bundle-manifest.json`
- Bundle staged: `True`

## Micro-Train Defaults

- Derived config path: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v18/colab/q-colab-micro-config.json`
- Max steps: `24`
- Max sequence length: `2048`
- Minimum GPU memory for train: `20 GB`
- W&B optional: `True`

## Truth Boundary

- This free lane is a supplemental bounded-training path. It does not replace the heavier tracked HF Jobs or OCI lane.
- The notebook only claims a real Q update when the runtime reaches the micro-train cell on a sufficiently large GPU.
- On smaller free runtimes, it still contributes value through session doctoring, bundle replay, and Immaculate bundle regeneration.
