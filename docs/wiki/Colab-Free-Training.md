# Colab Free Training

This page records the free supplemental Colab lane for the active Q and Immaculate hybrid session.

- Generated: `2026-04-15T19:43:02Z`
- Release: `0.1.0+58a73db`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`
- Notebook path: `deploy/colab/notebooks/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-colab-free.ipynb`
- Open in Colab: `https://colab.research.google.com/github/PossumXI/Immaculate/blob/main/deploy/colab/notebooks/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-colab-free.ipynb`

## What This Lane Does

- Replays the staged hybrid cloud bundle inside a Colab runtime.
- Rebuilds the Immaculate orchestration bundle from the same session inputs.
- Runs a bounded Q micro-train only when the Colab GPU has enough memory.
- Stops at doctor plus dry-run when the free runtime is too small instead of overstating cloud readiness.

## Bundle Source

- Source type: `hf_dataset`
- Dataset repo: `TruLumecreator/immaculate-q-cloud-bundles`
- Archive path: `sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-cloud-bundle.tar.gz`
- Manifest path: `sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/bundle-manifest.json`
- Bundle staged: `True`

## Micro-Train Defaults

- Derived config path: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/colab/q-colab-micro-config.json`
- Max steps: `24`
- Max sequence length: `2048`
- Minimum GPU memory for train: `20 GB`
- W&B optional: `True`

## Truth Boundary

- This free lane is a supplemental bounded-training path. It does not replace the heavier tracked HF Jobs or OCI lane.
- The notebook only claims a real Q update when the runtime reaches the micro-train cell on a sufficiently large GPU.
- On smaller free runtimes, it still contributes value through session doctoring, bundle replay, and Immaculate bundle regeneration.
