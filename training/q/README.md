# Q Training Bundle

`Q` is the truthful Immaculate alias for the local Gemma 4 base model used in the current harness path.

In plain English, this folder is the “make the next Q training run repeatable” bundle.
It does not pretend the model is already fully retrained. It makes sure the next run can be tied back to exact files, hashes, and configs.

The goal of this folder is not to pretend the fine-tune already happened.
It gives the repo a reproducible bridge from:

1. manifest-first curation
2. curated JSONL output
3. text-dataset shaping
4. a hybrid session that can coordinate local and cloud lanes under one tracked session id
5. cloud or local Unsloth QLoRA launch

## Suggested Flow

1. Create or refresh a corpus run:

```powershell
npm run training-data:curate -- fixtures/training/q-defsec-curation.example.json
```

2. Build a plain-text training dataset from the curated run:

```powershell
python training/q/build_q_text_dataset.py --input .training-output/training-data/runs/<run-id>/curated-records.jsonl --output .training-output/q/q-train-<run-id>.jsonl
```

3. Blend the governed corpus with the tracked BridgeBench seed set and the richer coding/long-context seed set:

```powershell
python training/q/build_q_mixture.py --base .training-output/q/q-train-<run-id>.jsonl --supplemental training/q/bridgebench_seed.json --supplemental training/q/coding_long_context_seed.json --output .training-output/q/q-mix-<run-id>.jsonl
```

4. Generate the tracked training lock so the future fine-tune can be replayed exactly:

```powershell
npm run q:training:lock -- --config .training-output/q/q-lora-config-<run-id>.json --mix-manifest .training-output/q/q-mix-<run-id>.manifest.json --curation-run .training-output/training-data/runs/<run-id>/run.json
```

5. Build the Immaculate orchestration bundle for the same session:

```powershell
npm run immaculate:training:bundle
```

6. Convert the live Q report failures into a tracked eval seed corpus:

```powershell
npm run q:failure-corpus
```

The failure export is now strict failure-only. When the direct Q lane is green,
this surface stays empty rather than mixing resolved successes into a fake
failure bucket.

7. Copy `hybrid_training_session.example.json` and point it at the concrete lock/config files for the run, or create a concrete session manifest under `.training-output/q/sessions/<session-id>/`.
8. Run the hybrid session doctor:

```powershell
npm run q:training:doctor -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json
```

9. Validate or launch the local and cloud lanes from the same tracked session:

```powershell
npm run q:training:session -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --launch
```

10. Validate the config and dataset shape before a GPU run:

```powershell
python training/q/train_q_lora_unsloth.py --config training/q/q_lora_config.example.json --dry-run
```

11. Launch `train_q_lora_unsloth.py` on a GPU instance with the required Python packages installed if the session doctor marks the cloud lane ready.

## Hybrid Session

The repo now has a session-level control surface for Q training:

- `training/q/hybrid_training_session.example.json`
- `training/q/run_q_training_session.py`
- `npm run q:training:doctor`
- `npm run q:training:session`

That session is the truthful place to say:

- which Q bundle is being trained
- which Immaculate orchestration bundle is paired with it
- whether the local lane is ready
- whether the cloud lane is actually configured or still blocked

The cloud lane is not allowed to silently pretend readiness. If OCI or another provider is not configured, the session stays explicit about that.

## Stronger Current Training Direction

The next truthful Q run should emphasize:

- coding repair and secure patch selection
- long-context repo synthesis instead of short reactive completions only
- control-plane and gateway hardening examples that preserve the route/reason/commit contract

The repo now carries a dedicated richer supplement for that purpose:

- `training/q/coding_long_context_seed.json`
- `training/q/q_lora_config.long_context.example.json`

## Truth Boundary

- This bundle keeps the training path inside the same provenance and secret-scanning discipline as the rest of Immaculate.
- It does not certify licenses or export-control posture by itself.
- It does not replace evaluation, red-team review, or legal review.

## Adopted Working Policy

The current `Q` training path intentionally keeps only the parts of the larger
defensive-security fine-tuning plan that this repo can enforce directly today:

- manifest-first dataset intake instead of blind scraping
- permissive-license allowlisting plus explicit review-state licenses
- best-effort secret scanning before records become training shards
- provenance chain hashes on curated outputs
- no deliberate inclusion of proprietary-LLM-generated outputs in the tracked
  example corpus path
- a tracked BridgeBench seed set so the next `Q` LoRA run gets higher-signal
  route/reason/commit examples around bridge safety, rate limiting, and
  defensive control-plane behavior
- a tracked failure-to-corpus path that turns the live BridgeBench and model
  comparison failures into eval seeds instead of letting them disappear into
  benchmark prose
- a QLoRA-style launch surface for `Q` through the Unsloth training entrypoint

The repo does **not** currently claim that every legal, export-control, or
insurance diligence requirement from the broader plan is already satisfied. It
only claims the policy surfaces that are actually implemented here.
