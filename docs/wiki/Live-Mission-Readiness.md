# Live Mission Readiness

This page is the machine-stamped live mission gate for the current workstation. It compresses the current proof signals for the shared ledger, local Q, OCI-backed Q, and Discord transport into one operator-facing readiness contract.

- Generated: `2026-05-13T22:36:24.073Z`
- Release: `0.1.0+b73c0b1`
- Repo commit: `b73c0b1f6ceba8a94e504407b68537e07121aded`

## Shared Readiness

- Mission-surface ready: `false`
- Summary: shared readiness blocked: openjaws/artifacts/fabric-audit-soak-20260420T022653Z: verified private node is blocked by mission treasury signer mismatch despite rerun delta 1
- ledger.public: `ready` @ `https://arobi.aura-genesis.org` | public edge surfaced a fresh governed audit record on live 3.3.1 and the local public node contract is configured
- ledger.private: `blocked` @ `openjaws/artifacts/fabric-audit-soak-20260420T022653Z` | verified private node is blocked by mission treasury signer mismatch despite rerun delta 1
- q.local: `ready` @ `http://127.0.0.1:11434` | local Q accepted 3/3 seed+mediation scenario pair(s)
- q.oci: `ready` @ `https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1` | Discord Q receipt reports Q backend: oci:Q via OCI IAM (https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1); gateway=true; guilds=1; health 200; updated 34s ago (budget 900s)
- discord.transport: `ready` @ `http://127.0.0.1:8788/health` | status=ready; gateway=true; guilds=1; health 200; updated 34s ago (budget 900s)

## Evidence Sources

- Roundtable runtime receipt: `docs/wiki/Roundtable-Runtime.json` @ `2026-05-13T22:01:54.879Z`
- Arobi live ledger receipt: `docs/wiki/Arobi-Live-Ledger-Receipt.json` @ `2026-05-13T21:02:56.622Z`
- Discord agent receipt: `openjaws/local-command-station/discord-q-agent-receipt.json` @ `2026-05-13T22:36:13.406Z`
- Discord agent health: `http://127.0.0.1:8788/health` -> `200` | {"status":"ok","profile":"q","label":"Q","interactionReady":true,"gatewayReady":true,"gatewayConnected":true,"guildCount":1,"gatewayLastError":null,"gatewayLastCloseCode":null,"gatewayBlocked":false,"gatewayReconnectable":null,"updatedAt":"2026-05-13T22:36:13.406Z"}
- OpenJaws root: `openjaws`
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
