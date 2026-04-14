# OCI Private Deployment

This bundle is the minimal hardened path for running the Immaculate harness on
Oracle Cloud Infrastructure without exposing the control plane to the public
internet.

It is intentionally scoped to the harness only.
It does not modify benchmark logic, comparison packs, or model-training code.
It can carry the narrow `Q` inference edge, but only when that edge is
explicitly enabled.

## Security Shape

- place the compute instance in a **private subnet**
- assign **no public IP** to the instance
- do **not** front it with a public load balancer
- reach the host only through OCI Bastion, VPN, FastConnect, or a private load
  balancer inside the VCN
- bind the published harness port to the **private VNIC IP only**
- store `IMMACULATE_API_KEY` and federation secrets in **OCI Vault** or
  root-readable files under `/etc/immaculate/secrets`
- keep the container itself non-root, read-only, capability-dropped, and
  protected with `no-new-privileges`

The bundle lives under:

- `deploy/oci-private/Dockerfile`
- `deploy/oci-private/cloud-init/immaculate-private-harness.cloud-init.yaml`
- `deploy/oci-private/systemd/immaculate-harness.service`
- `deploy/oci-private/env/immaculate-harness.env.example`
- `deploy/oci-private/scripts/*.sh`

## OCI Topology

Recommended network shape:

1. create a VCN with a private application subnet and, optionally, a separate
   bastion subnet
2. attach the Immaculate instance only to the private application subnet
3. remove any public IP assignment from the instance
4. restrict the NSG or security list so TCP `8787` is allowed only from your
   operator CIDR, bastion subnet, or private load balancer subnet
5. keep outbound egress limited to what the node actually needs:
   package mirrors, OCI Vault, your private Ollama endpoint, and W&B if you are
   publishing benchmarks from that node

The host-side bind should stay private:

```ini
IMMACULATE_PRIVATE_BIND_IP=10.0.1.10
IMMACULATE_PUBLISHED_PORT=8787
```

That keeps Podman listening only on the private interface even if the host later
gains an unexpected second NIC.

## Bootstrap

Use the cloud-init file when creating the OCI instance:

`deploy/oci-private/cloud-init/immaculate-private-harness.cloud-init.yaml`

That bootstrap does four real things:

- installs Podman, firewalld, and the OCI CLI prerequisites
- disables password SSH and keeps the machine private-first
- creates the runtime and secret directories
- applies a small host-hardening sysctl profile

After first boot:

1. clone this repository onto the instance, preferably at `/opt/immaculate/src`
2. copy the env template:

```bash
sudo cp deploy/oci-private/env/immaculate-harness.env.example /etc/immaculate/immaculate-harness.env
sudo chmod 600 /etc/immaculate/immaculate-harness.env
```

3. edit `/etc/immaculate/immaculate-harness.env`
4. either place secrets as files under `/etc/immaculate/secrets` or populate OCI
   Vault secret OCIDs in the env file
5. install the systemd unit:

```bash
sudo bash deploy/oci-private/scripts/install-oci-private-harness.sh --enable
```

## Secret Handling

The app still consumes environment variables.
This deployment bundle keeps that concern outside the codebase:

- `run-immaculate-harness.sh` reads `*_FILE` variables and exports the actual
  secret values only immediately before `podman run`
- `fetch-oci-vault-secrets.sh` can pull from OCI Vault using instance principals
- the env file contains **paths**, not secret values

Example:

```ini
IMMACULATE_API_KEY_FILE=/etc/immaculate/secrets/immaculate-api-key
IMMACULATE_FEDERATION_SHARED_SECRET_FILE=/etc/immaculate/secrets/federation-shared-secret
OCI_CLI_AUTH=instance_principal
OCI_IMMACULATE_API_KEY_SECRET_OCID=ocid1.vaultsecret.oc1..example
```

If you use OCI Vault, grant the instance dynamic group permission to read only
the specific secrets it needs.

## Q API on OCI

If you want the same private harness node to expose the bounded `Q` inference
edge, wire these env settings in `/etc/immaculate/immaculate-harness.env`:

```ini
IMMACULATE_Q_API_ENABLED=true
IMMACULATE_Q_API_KEYS_PATH=/var/lib/immaculate/runtime/q-api-keys.json
IMMACULATE_Q_API_DEFAULT_RPM=60
IMMACULATE_Q_API_DEFAULT_BURST=60
IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT=2
```

Keep the key store inside `/var/lib/immaculate/runtime` unless you are also
expanding the writable-path hardening model.

Create or rotate keys from the repo on the host:

```bash
cd /opt/immaculate/src
npm run q:keys -- create --label oci-q
```

This remains a private inference path on the same harness process. It is not a
claim of a separate public Q gateway.

## Operational Hardening

This bundle takes the following stance:

- container image built locally with Podman from `deploy/oci-private/Dockerfile`
- runtime container runs as UID `10001`
- `--read-only`, `--cap-drop=ALL`, and `--security-opt=no-new-privileges`
- writable state limited to:
  - `/var/lib/immaculate/runtime`
  - `/var/log/immaculate`
  - tmpfs mounts for `/tmp` and `/run`
- SELinux relabeling on mounted paths via `:Z`
- systemd restart supervision with no public repair or debug endpoints added
- optional host firewall rules that admit only `IMMACULATE_ALLOWED_OPERATOR_CIDR`
  and drop all other traffic for the published port

## Verification

Check the planned Podman invocation without starting the container:

```bash
bash deploy/oci-private/scripts/run-immaculate-harness.sh --print-config
```

Check OCI Vault mapping without fetching secrets:

```bash
sudo bash deploy/oci-private/scripts/fetch-oci-vault-secrets.sh --check
```

Check the install workflow without mutating the host:

```bash
sudo bash deploy/oci-private/scripts/install-oci-private-harness.sh --dry-run
```

Start and inspect:

```bash
sudo systemctl start immaculate-harness
sudo systemctl status immaculate-harness
curl http://10.0.1.10:8787/api/health
```

Run the final curl only from a private network path such as OCI Bastion, VPN, a
peered VCN, or a private load balancer.

## What This Does Not Claim

- it does not expose Immaculate as a public internet service
- it does not store secrets in git or plain-text cloud-init
- it does not weaken the existing harness auth model
- it does not claim OCI-managed Kubernetes or full autoscaling support

It is a minimal, real, private harness deployment bundle with OCI-specific
security guidance and operational glue.
