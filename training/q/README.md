# Q Training Bundle

`Q` is the tracked Immaculate reasoning lane used throughout the current harness, benchmark, and hybrid training path.

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

When `.training-output/q/q-benchmark-corpus.jsonl` exists, treat it as another tracked `--supplemental` on the next mixture pass so benchmark-derived Q decision rows enter through the same manifest-recorded seam.

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

When `docs/wiki/Terminal-Bench-Receipt.json` exists and the official public-task
receipt is still weak, that receipt now becomes a tracked eval seed here instead
of staying trapped as a standalone public proof page.

7. Convert the executed Q benchmark successes into a tracked benchmark-derived corpus:

```powershell
npm run q:benchmark:corpus
```

This surface complements the strict failure-only export. It captures current successful
Q benchmark decision triplets so the hybrid session can stage them directly instead of
inferring corpus state from raw benchmark pages.

When `docs/wiki/Terminal-Bench-Receipt.json` exists, this same build also carries
the official public-task receipt as benchmark observation evidence, so the public
proof surface enters the Q improvement loop without pretending it was a successful
decision-triplet row.

8. Promote the current benchmark corpus into the next Q lineage when the active lock is stale against it:

```powershell
npm run q:training:promote-benchmark
```

This command no-ops honestly when the active Q bundle already carries the current
benchmark corpus hash. When the benchmark corpus changed, it creates the next
bench lineage, regenerates the lock, and restamps the hybrid session instead of
requiring hand-edited config and session files.

9. Copy `hybrid_training_session.example.json` and point it at the concrete lock/config files for the run, or create a concrete session manifest under `.training-output/q/sessions/<session-id>/`.
10. Run the hybrid session doctor:

```powershell
npm run q:training:doctor -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json
```

11. Validate or launch the local and cloud lanes from the same tracked session:

```powershell
npm run q:training:session -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --launch
```

12. Validate the config and dataset shape before a GPU run:

```powershell
python training/q/train_q_lora_unsloth.py --config training/q/q_lora_config.example.json --dry-run
```

13. Launch `train_q_lora_unsloth.py` on a GPU instance with the required Python packages installed if the session doctor marks the cloud lane ready.

For the OCI controller path specifically:

- use `deploy/oci-training/env/immaculate-q-training.env.example` as the controller and remote-launch template
- local controller launches should use `OCI_CLI_CONFIG_FILE` plus `OCI_CLI_PROFILE` for API-key auth, while the launched OCI node should stay on instance-principal auth
- when a local `~/.oci/config` exists, the hybrid session doctor can materialize a corrected controller config and wire it into the session-local `oci-cloud.env`
- put the OCI launch target OCIDs in that env file or a session-local overlay env file
- prefer `OCI_Q_TRAINING_HF_TOKEN_SECRET_OCID` and `OCI_Q_TRAINING_WANDB_API_KEY_SECRET_OCID` over plain-text token exports
- use `deploy/oci-training/scripts/launch-oci-q-training.sh --check` to verify the launch-target shape before a real billable launch
- keep the hybrid session as the source of truth; the OCI launcher consumes the session bundle instead of inventing its own dataset state

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
- which env files and OCI launch target settings are shaping the cloud lane

The cloud lane is not allowed to silently pretend readiness. If OCI or another provider is not configured, the session stays explicit about that.

The active workaround cloud lane can also run through Hugging Face Jobs:

- use `deploy/hf-jobs/env/immaculate-q-training.env.example` as the non-secret controller template
- keep the token in a separate env file such as `C:/Users/Knight/Desktop/cheeks/Asgard/.env`
- validate and stage the active bundle with `npm run q:hf:jobs -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --env-file C:/Users/Knight/Desktop/cheeks/Asgard/.env --env-file .training-output/q/sessions/<session-id>/hf-jobs.env --smoke-launch`
- treat `docs/wiki/HF-Jobs-Training.md` as the truth surface for auth, staged bundle state, visible hardware, and any billing blocker
- keep the session doctor as the source of truth for whether the HF Jobs lane is actually ready to launch

The active session can also emit a free supplemental Colab lane:

- use `deploy/colab/env/immaculate-q-colab.env.example` as the non-secret reference
- export the tracked notebook with `npm run q:colab:export -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json`
- provide `HF_TOKEN` in Colab so the staged bundle can be pulled from the tracked dataset repo
- let the notebook rebuild the Immaculate bundle and run the Q dry-run on any runtime, then only allow the bounded Q micro-train when Colab exposes a large enough GPU
- treat `docs/wiki/Colab-Free-Training.md` as the truth surface for what the free lane can honestly do

The active session can also stage a Q-only Cloudflare deploy and eval lane:

- use `deploy/cloudflare/env/immaculate-q-cloudflare.env.example` as the non-secret Cloudflare reference
- export a Cloudflare-ready adapter bundle with `npm run q:cloudflare:adapter -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --check`
- build the benchmark-derived eval replay bundle with `npm run q:cloudflare:eval-bundle -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json`
- typecheck the worker with `npm run q:cloudflare:worker:typecheck`
- materialize the Cloudflare deploy/eval report with `npm run q:cloudflare:inference -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --env-file deploy/cloudflare/env/immaculate-q-cloudflare.env.example --check`
- treat `docs/wiki/Cloudflare-Q-Inference.md` as the truth surface for Cloudflare auth, worker readiness, adapter packaging, AI Gateway routing, and smoke-eval blockers

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
