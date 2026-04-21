# Live Mission Readiness

This page is the machine-stamped live mission gate for the current workstation. It compresses the current proof signals for the shared ledger, local Q, OCI-backed Q, and Discord transport into one operator-facing readiness contract.

- Generated: `2026-04-21T22:19:55.023Z`
- Release: `0.1.0+10e6816`
- Repo commit: `10e6816632ef94f923762f27421f77a6e2ffc52a`

## Shared Readiness

- Mission-surface ready: `false`
- Summary: shared readiness blocked: https://arobi.aura-genesis.org: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true | D:\openjaws\OpenJaws\artifacts\fabric-audit-soak-20260420T022653Z: verified private node is blocked by mission treasury signer mismatch despite rerun delta 1 | https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1: Discord Q receipt reports Q backend: oci:Q via OCI IAM (https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1); gateway=true; guilds=1; health error fetch failed; updated 1901s ago (budget 900s) | http://127.0.0.1:8788/health: status=ready; gateway=true; guilds=1; health error fetch failed; updated 1901s ago (budget 900s)
- ledger.public: `blocked` @ `https://arobi.aura-genesis.org` | public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- ledger.private: `blocked` @ `D:\openjaws\OpenJaws\artifacts\fabric-audit-soak-20260420T022653Z` | verified private node is blocked by mission treasury signer mismatch despite rerun delta 1
- q.local: `ready` @ `http://127.0.0.1:11434` | local Q accepted 3/3 seed+mediation scenario pair(s)
- q.oci: `blocked` @ `https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1` | Discord Q receipt reports Q backend: oci:Q via OCI IAM (https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1); gateway=true; guilds=1; health error fetch failed; updated 1901s ago (budget 900s)
- discord.transport: `blocked` @ `http://127.0.0.1:8788/health` | status=ready; gateway=true; guilds=1; health error fetch failed; updated 1901s ago (budget 900s)

## Evidence Sources

- Roundtable runtime receipt: `docs/wiki/Roundtable-Runtime.json` @ `2026-04-21T22:19:50.626Z`
- Arobi live ledger receipt: `docs/wiki/Arobi-Live-Ledger-Receipt.json` @ `2026-04-21T22:18:04.712Z`
- Discord agent receipt: `D:\openjaws\OpenJaws\local-command-station\discord-q-agent-receipt.json` @ `2026-04-21T21:46:20.581Z`
- Discord agent health: `http://127.0.0.1:8788/health` -> `error` | fetch failed
- OpenJaws root: `D:\openjaws\OpenJaws`
- Receipt-backed OCI backend: `Q backend: oci:Q via OCI IAM (https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1)`
- Local Arobi public-ready markers: `true`
- Local Arobi private-ready markers: `false`

## Truth Boundary

- This page is a readiness receipt, not proof that a live Discord operator command or multi-subsystem mission was executed.
- q.local is taken from the latest machine-stamped roundtable runtime receipt and remains blocked if that receipt is missing or failed.
- q.oci is receipt-backed from the live Discord Q agent runtime plus the local health endpoint; it is not a fresh direct provider probe unless a separate OCI probe surface says so explicitly.
- ledger.public is only ready when the public aura-genesis edge surfaced a fresh governed audit record, not merely when the public read endpoints responded.
- ledger.private is only ready when the latest supervised rerun proved private ledger advance.
- This page does not expose secrets, Discord tokens, OCI keys, or private ledger payloads.
