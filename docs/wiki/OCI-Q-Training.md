# OCI Q Training

This page documents the OCI cloud-training bundle for `Q`.

In plain English, this is the launch path that turns one tracked hybrid session
into a real OCI GPU training attempt without pretending the cloud lane is ready
when auth, Vault mappings, or launch-target OCIDs are still missing.

The bundle lives under:

- `deploy/oci-training/cloud-init/immaculate-q-training.cloud-init.yaml`
- `deploy/oci-training/env/immaculate-q-training.env.example`
- `deploy/oci-training/scripts/fetch-oci-training-secrets.sh`
- `deploy/oci-training/scripts/run-immaculate-q-training.sh`
- `deploy/oci-training/scripts/launch-oci-q-training.sh`

## What It Actually Does

- stages the tracked hybrid session into a cloud bundle tarball
- uploads that bundle into OCI Object Storage
- launches an OCI compute instance with cloud-init metadata
- clones the repo on the training node at the tracked git commit
- downloads the exact session bundle onto the node
- verifies the staged bundle SHA-256 before extracting it on the training node
- fetches Hugging Face and optional W&B secrets from OCI Vault or root-readable files
- runs `training/q/train_q_lora_unsloth.py` against the session-tracked config and manifest

## Security Shape

- prefer OCI Vault secret OCIDs over plain-text tokens in env files
- keep the training node in a private subnet unless you have a specific reason not to
- use a dedicated training image or a hardened GPU base image, not an ad hoc workstation clone
- keep the staged session bundle in a controlled Object Storage bucket
- treat the controller machine and the training node separately: controller auth launches the node, instance principals fetch the staged bundle and secrets

## Current Manifest Shape

The hybrid session now supports:

- `cloud.envFilePath`
- `cloud.inlineEnv`
- `cloud.launchCommand`
- `OCI_TARGET_REGION`
- `OCI_OBJECT_STORAGE_REGION`

That means the same session can carry:

- controller-side OCI auth
- cloud-launch target OCIDs
- session bundle staging settings
- remote secret/Vault mappings

without depending on whatever happened to already be exported in the shell.

For local controller auth, the expected shape is API-key auth through
`OCI_CLI_CONFIG_FILE` plus `OCI_CLI_PROFILE`. When a workstation already has a
real `~/.oci/config`, the session doctor can materialize a corrected
session-local controller config and wire it into the session-local
`oci-cloud.env` instead of editing the operator's home-directory config in
place.

The current live capacity advice now has its own generated surface:

- `[[OCI-GPU-Advisor]]`
- `[[OCI-Region-Capacity]]`

That page is where the repo records:

- the verified GPU-capable shapes visible in subscribed OCI regions
- the difference between controller auth region and launch target region
- whether the next blocker is missing capacity, missing subscription, or missing env wiring
- the public expansion candidates that are discoverable but not yet verified for capacity
- the actual tenancy response when the controller tries to subscribe the next GPU-candidate region

## Truth Boundary

- This bundle does not claim a real cloud fine-tune happened unless the hybrid session says the cloud lane launched or completed.
- It does not claim OCI auth exists on this machine unless the doctor reports a concrete controller auth mode and config path.
- It does not claim the Q cloud lane is safe just because a GPU node can be launched; the session still has to carry the exact locked dataset and config.
- It does not claim public OCI regions have verified GPU capacity until the advisor proves a subscribed region can actually expose GPU-capable shapes to the current controller auth.
