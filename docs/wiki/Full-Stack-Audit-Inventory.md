# Full Stack Audit Inventory

Generated from repo source. This is the operator handoff surface for route, endpoint, component, service, file-backed state, and readiness drift.

- Generated: 2026-04-25T19:13:50.476Z
- Commit: `8891b1bdfa88586779a4f2066438faaa64baeea3`
- Branch: `audit/full-stack-inventory-copy-refresh`
- Frontend routes: `7`
- Frontend components: `5`
- Harness/gateway endpoints: `87`
- Exported backend/core files: `55`
- File interaction records: `484`
- Tests: `12` assertions across `4` files
- Readiness: Green `3`, Yellow `101`, Red `2`

## Frontend Routes

| Route | Kind | Methods | File | Readiness | Notes |
| --- | --- | --- | --- | --- | --- |
| / | page | GET | apps/dashboard/app/page.tsx | Yellow | Page is implemented and statically discoverable. No page-level build snapshot or browser flow tests were found. |
| /api/operator/harness/*path | api-route | GET, POST | apps/dashboard/app/api/operator/harness/[...path]/route.ts | Yellow | Server-side dashboard proxy is authenticated and same-origin. It currently exposes GET and POST only, while the harness has DELETE endpoints that cannot pass through this proxy. |
| /api/operator/session | api-route | DELETE, POST | apps/dashboard/app/api/operator/session/route.ts | Yellow | Route has explicit handler methods. No dashboard API route tests were found in this repo. |
| /api/operator/socket-ticket | api-route | POST | apps/dashboard/app/api/operator/socket-ticket/route.ts | Yellow | Route has explicit handler methods. No dashboard API route tests were found in this repo. |
| /legal | page | GET | apps/dashboard/app/legal/page.tsx | Yellow | Page is implemented and statically discoverable. No page-level build snapshot or browser flow tests were found. |
| /operator | page | GET | apps/dashboard/app/operator/page.tsx | Yellow | Operator dashboard is gated by a signed server-side session. It is a trusted-private console and lacks browser integration tests. |
| /terms | page | GET | apps/dashboard/app/terms/page.tsx | Yellow | Page is implemented and statically discoverable. No page-level build snapshot or browser flow tests were found. |

## Frontend Components And Features

| File | Components/features | Readiness | Notes |
| --- | --- | --- | --- |
| apps/dashboard/app/ui/connectome-scene.tsx | ConnectomeScene, EdgeLink, NodeCloud | Yellow | Component is exported or locally declared; no component tests were found. |
| apps/dashboard/app/ui/dashboard-client.tsx | DashboardClient, HistoryRow, MetricCard, NodeRow, PassRow | Yellow | Connects to the governed harness API and websocket ticket flow. Large single component carries many operator workflows without component tests. |
| apps/dashboard/app/ui/dashboard-login.tsx | DashboardLogin | Yellow | Component is exported or locally declared; no component tests were found. |
| apps/dashboard/app/ui/landing-page.tsx | LandingPage | Yellow | Public page is implemented with product copy and proof cards. Marketing surface still needs cross-site copy alignment with qline.site and aura-genesis.org. |
| apps/dashboard/app/ui/landing-scene.tsx | CoreAssembly, LandingScene, ParticleField | Yellow | Component is exported or locally declared; no component tests were found. |

## TUI Surface

| File | Feature functions | Readiness | Notes |
| --- | --- | --- | --- |
| apps/tui/src/index.tsx | dispatchActuation, ensureSuccessfulResponse, harnessFetch, injectLiveFrame, publishBenchmarkToWandb, runCognition, sendControl, startLatestReplay, stopLatestLiveSource, stopLatestReplay | Yellow | Interactive operator TUI is implemented against the harness, but there are no TUI tests in this repo. The TUI connects directly to the harness and depends on local operator credentials. |

## Backend Endpoints And UI Mapping

| Method | Route | Surface | File:line | UI callers | Readiness | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| GET | /api/actuation/adapters | harness | apps/harness/src/server.ts:5264 | dashboard-ui /api/actuation/adapters (apps/dashboard/app/ui/dashboard-client.tsx:698) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/deliveries | harness | apps/harness/src/server.ts:5292 | dashboard-ui /api/actuation/deliveries (apps/dashboard/app/ui/dashboard-client.tsx:808) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/dispatch | harness | apps/harness/src/server.ts:6210 | dashboard-ui /api/actuation/dispatch (apps/dashboard/app/ui/dashboard-client.tsx:1375)<br>tui /api/actuation/dispatch (apps/tui/src/index.tsx:339) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/outputs | harness | apps/harness/src/server.ts:5224 | dashboard-ui /api/actuation/outputs (apps/dashboard/app/ui/dashboard-client.tsx:795) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/protocols | harness | apps/harness/src/server.ts:5268 | dashboard-ui /api/actuation/protocols (apps/dashboard/app/ui/dashboard-client.tsx:699) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/transports | harness | apps/harness/src/server.ts:5272 | dashboard-ui /api/actuation/transports (apps/dashboard/app/ui/dashboard-client.tsx:701) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/:transportId/heartbeat | harness | apps/harness/src/server.ts:6444 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/:transportId/reset | harness | apps/harness/src/server.ts:6497 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/http2/register | harness | apps/harness/src/server.ts:6381 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/serial/register | harness | apps/harness/src/server.ts:6315 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/udp/register | harness | apps/harness/src/server.ts:6264 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/history | harness | apps/harness/src/server.ts:4310 | dashboard-ui /api/benchmarks/history (apps/dashboard/app/ui/dashboard-client.tsx:607)<br>dashboard-ui /api/benchmarks/history (apps/dashboard/app/ui/dashboard-client.tsx:1017) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/jobs/:jobId | harness | apps/harness/src/server.ts:4342 | dashboard-ui /api/benchmarks/jobs/:param (apps/dashboard/app/ui/dashboard-client.tsx:999) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/latest | harness | apps/harness/src/server.ts:4306 | dashboard-ui /api/benchmarks/latest (apps/dashboard/app/ui/dashboard-client.tsx:588) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/packs | harness | apps/harness/src/server.ts:4365 | dashboard-ui /api/benchmarks/packs (apps/dashboard/app/ui/dashboard-client.tsx:673) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/benchmarks/publish/wandb | harness | apps/harness/src/server.ts:7255 | dashboard-ui /api/benchmarks/publish/wandb (apps/dashboard/app/ui/dashboard-client.tsx:1081)<br>tui /api/benchmarks/publish/wandb (apps/tui/src/index.tsx:357) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/benchmarks/run | harness | apps/harness/src/server.ts:7214 | dashboard-ui /api/benchmarks/run (apps/dashboard/app/ui/dashboard-client.tsx:974) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/trend | harness | apps/harness/src/server.ts:4314 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/checkpoints | harness | apps/harness/src/server.ts:4290 | dashboard-ui /api/checkpoints (apps/dashboard/app/ui/dashboard-client.tsx:667) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/control | harness | apps/harness/src/server.ts:7317 | tui /api/control (apps/tui/src/index.tsx:307) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/datasets | harness | apps/harness/src/server.ts:4373 | dashboard-ui /api/datasets (apps/dashboard/app/ui/dashboard-client.tsx:694) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/datasets/:datasetId | harness | apps/harness/src/server.ts:4378 | dashboard-ui /api/datasets/:param (apps/dashboard/app/ui/dashboard-client.tsx:732) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/devices/lsl/:sourceId/stop | harness | apps/harness/src/server.ts:4583 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/devices/lsl/connect | harness | apps/harness/src/server.ts:4524 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/devices/lsl/connections | harness | apps/harness/src/server.ts:4505 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/devices/lsl/streams | harness | apps/harness/src/server.ts:4485 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/events | harness | apps/harness/src/server.ts:4218 | dashboard-ui /api/events (apps/dashboard/app/ui/dashboard-client.tsx:675) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/leases | harness | apps/harness/src/server.ts:5063 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/membership | harness | apps/harness/src/server.ts:5033 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/peers | harness | apps/harness/src/server.ts:5093 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| DELETE | /api/federation/peers/:peerId | harness | apps/harness/src/server.ts:6069 | No dashboard/TUI caller detected | Yellow | Delete route is governed server-side. The dashboard proxy does not currently forward DELETE, so this is not a complete UI flow. |
| POST | /api/federation/peers/:peerId/lease-renew | harness | apps/harness/src/server.ts:6025 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/federation/peers/:peerId/refresh | harness | apps/harness/src/server.ts:5982 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/federation/peers/register | harness | apps/harness/src/server.ts:5833 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/federation/peers/sync | harness | apps/harness/src/server.ts:5909 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/decisions | harness | apps/harness/src/server.ts:4302 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/policies | harness | apps/harness/src/server.ts:4298 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/status | harness | apps/harness/src/server.ts:4294 | dashboard-ui /api/governance/status (apps/dashboard/app/ui/dashboard-client.tsx:670)<br>tui /api/governance/status (apps/tui/src/index.tsx:585) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/health | harness | apps/harness/src/server.ts:4186 | No dashboard/TUI caller detected | Green | Read-only health endpoint. |
| GET | /api/history | harness | apps/harness/src/server.ts:4214 | dashboard-ui /api/history (apps/dashboard/app/ui/dashboard-client.tsx:552) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/ingest/bids/scan | harness | apps/harness/src/server.ts:6533 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/ingest/nwb/scan | harness | apps/harness/src/server.ts:7003 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/integrity | harness | apps/harness/src/server.ts:4286 | dashboard-ui /api/integrity (apps/dashboard/app/ui/dashboard-client.tsx:664) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence | harness | apps/harness/src/server.ts:4662 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/arbitrations | harness | apps/harness/src/server.ts:5151 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/conversations | harness | apps/harness/src/server.ts:5199 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/executions | harness | apps/harness/src/server.ts:4980 | dashboard-ui /api/intelligence/executions (apps/dashboard/app/ui/dashboard-client.tsx:782)<br>tui /api/intelligence/executions (apps/tui/src/index.tsx:599) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/ollama/models | harness | apps/harness/src/server.ts:5356 | dashboard-ui /api/intelligence/ollama/models (apps/dashboard/app/ui/dashboard-client.tsx:710) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/ollama/register | harness | apps/harness/src/server.ts:5417 | dashboard-ui /api/intelligence/ollama/register (apps/dashboard/app/ui/dashboard-client.tsx:1331) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/q/models | harness | apps/harness/src/server.ts:5355 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/q/register | harness | apps/harness/src/server.ts:5416 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/run | harness | apps/harness/src/server.ts:6574 | dashboard-ui /api/intelligence/run (apps/dashboard/app/ui/dashboard-client.tsx:1040)<br>tui /api/intelligence/run (apps/tui/src/index.tsx:323) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/schedules | harness | apps/harness/src/server.ts:5174 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/workers | harness | apps/harness/src/server.ts:5114 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/:workerId/heartbeat | harness | apps/harness/src/server.ts:5533 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/:workerId/unregister | harness | apps/harness/src/server.ts:5648 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/assign | harness | apps/harness/src/server.ts:5684 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/register | harness | apps/harness/src/server.ts:5419 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/frames | harness | apps/harness/src/server.ts:4622 | dashboard-ui /api/neuro/frames (apps/dashboard/app/ui/dashboard-client.tsx:766) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/live/:sourceId/stop | harness | apps/harness/src/server.ts:7178 | dashboard-ui /api/neuro/live/:param/stop (apps/dashboard/app/ui/dashboard-client.tsx:1296)<br>tui /api/neuro/live/:param/stop (apps/tui/src/index.tsx:421) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/live/frame | harness | apps/harness/src/server.ts:7147 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/live/sources | harness | apps/harness/src/server.ts:4481 | dashboard-ui /api/neuro/live/sources (apps/dashboard/app/ui/dashboard-client.tsx:697) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/replays | harness | apps/harness/src/server.ts:4477 | dashboard-ui /api/neuro/replays (apps/dashboard/app/ui/dashboard-client.tsx:696) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/replays/:replayId/stop | harness | apps/harness/src/server.ts:7111 | dashboard-ui /api/neuro/replays/:param/stop (apps/dashboard/app/ui/dashboard-client.tsx:1176)<br>tui /api/neuro/replays/:param/stop (apps/tui/src/index.tsx:401) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/replays/start | harness | apps/harness/src/server.ts:7044 | dashboard-ui /api/neuro/replays/start (apps/dashboard/app/ui/dashboard-client.tsx:1123)<br>tui /api/neuro/replays/start (apps/tui/src/index.tsx:377) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/sessions | harness | apps/harness/src/server.ts:4424 | dashboard-ui /api/neuro/sessions (apps/dashboard/app/ui/dashboard-client.tsx:695) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/sessions/:sessionId | harness | apps/harness/src/server.ts:4429 | dashboard-ui /api/neuro/sessions/:param (apps/dashboard/app/ui/dashboard-client.tsx:751) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/nodes | harness | apps/harness/src/server.ts:5010 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| DELETE | /api/nodes/:nodeId | harness | apps/harness/src/server.ts:6181 | No dashboard/TUI caller detected | Yellow | Delete route is governed server-side. The dashboard proxy does not currently forward DELETE, so this is not a complete UI flow. |
| POST | /api/nodes/:nodeId/heartbeat | harness | apps/harness/src/server.ts:6104 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/nodes/register | harness | apps/harness/src/server.ts:5756 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/orchestration/mediate | harness | apps/harness/src/server.ts:6667 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/persistence | harness | apps/harness/src/server.ts:4282 | dashboard-ui /api/persistence (apps/dashboard/app/ui/dashboard-client.tsx:570)<br>tui /api/persistence (apps/tui/src/index.tsx:557) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/q/info | harness | apps/harness/src/server.ts:4674 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/q/run | harness | apps/harness/src/server.ts:4714 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/replay | harness | apps/harness/src/server.ts:4247 | dashboard-ui /api/replay (apps/dashboard/app/ui/dashboard-client.tsx:685) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/snapshot | harness | apps/harness/src/server.ts:4209 | dashboard-ui /api/snapshot (apps/dashboard/app/ui/dashboard-client.tsx:853)<br>dashboard-ui /api/snapshot (apps/dashboard/app/ui/dashboard-client.tsx:1271)<br>tui /api/snapshot (apps/tui/src/index.tsx:633) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/topology | harness | apps/harness/src/server.ts:7295 | dashboard-ui /api/topology (apps/dashboard/app/ui/dashboard-client.tsx:663) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/wandb/status | harness | apps/harness/src/server.ts:4369 | dashboard-ui /api/wandb/status (apps/dashboard/app/ui/dashboard-client.tsx:628)<br>tui /api/wandb/status (apps/tui/src/index.tsx:571) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/work-governor | harness | apps/harness/src/server.ts:4205 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /stream | harness | apps/harness/src/server.ts:7345 | dashboard-ui /stream (apps/dashboard/app/ui/dashboard-client.tsx:890) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /stream/actuation/device | harness | apps/harness/src/server.ts:7441 | No dashboard/TUI caller detected | Yellow | Actuation device stream has governance checks and adapter validation. It is not reachable through the dashboard websocket ticket route yet. |
| GET | /stream/neuro/live | harness | apps/harness/src/server.ts:7389 | dashboard-ui /stream/neuro/live (apps/dashboard/app/ui/dashboard-client.tsx:1211) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/q/info | q-gateway | apps/harness/src/q-gateway.ts:662 | No dashboard/TUI caller detected | Yellow | Gateway has API key authentication, rate limits, and bounded model selection. Runtime availability still depends on local Q/Ollama readiness and current benchmark restamps. |
| GET | /health | q-gateway | apps/harness/src/q-gateway.ts:637 | No dashboard/TUI caller detected | Green | Health endpoint is narrow and read-only. |
| POST | /v1/chat/completions | q-gateway | apps/harness/src/q-gateway.ts:707 | No dashboard/TUI caller detected | Yellow | Gateway has API key authentication, rate limits, and bounded model selection. Runtime availability still depends on local Q/Ollama readiness and current benchmark restamps. |
| GET | /v1/models | q-gateway | apps/harness/src/q-gateway.ts:693 | No dashboard/TUI caller detected | Yellow | Gateway has API key authentication, rate limits, and bounded model selection. Runtime availability still depends on local Q/Ollama readiness and current benchmark restamps. |

## Orphaned Or Non-UI Backend Endpoints

| Method | Route | Surface | File:line | Disposition needed |
| --- | --- | --- | --- | --- |
| POST | /api/actuation/transports/:transportId/heartbeat | harness | apps/harness/src/server.ts:6444 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/:transportId/reset | harness | apps/harness/src/server.ts:6497 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/http2/register | harness | apps/harness/src/server.ts:6381 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/serial/register | harness | apps/harness/src/server.ts:6315 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/udp/register | harness | apps/harness/src/server.ts:6264 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/benchmarks/trend | harness | apps/harness/src/server.ts:4314 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/devices/lsl/:sourceId/stop | harness | apps/harness/src/server.ts:4583 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/devices/lsl/connect | harness | apps/harness/src/server.ts:4524 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/devices/lsl/connections | harness | apps/harness/src/server.ts:4505 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/devices/lsl/streams | harness | apps/harness/src/server.ts:4485 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/leases | harness | apps/harness/src/server.ts:5063 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/membership | harness | apps/harness/src/server.ts:5033 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/peers | harness | apps/harness/src/server.ts:5093 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| DELETE | /api/federation/peers/:peerId | harness | apps/harness/src/server.ts:6069 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/:peerId/lease-renew | harness | apps/harness/src/server.ts:6025 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/:peerId/refresh | harness | apps/harness/src/server.ts:5982 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/register | harness | apps/harness/src/server.ts:5833 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/sync | harness | apps/harness/src/server.ts:5909 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/governance/decisions | harness | apps/harness/src/server.ts:4302 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/governance/policies | harness | apps/harness/src/server.ts:4298 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/health | harness | apps/harness/src/server.ts:4186 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/ingest/bids/scan | harness | apps/harness/src/server.ts:6533 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/ingest/nwb/scan | harness | apps/harness/src/server.ts:7003 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence | harness | apps/harness/src/server.ts:4662 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/arbitrations | harness | apps/harness/src/server.ts:5151 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/conversations | harness | apps/harness/src/server.ts:5199 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/q/models | harness | apps/harness/src/server.ts:5355 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/q/register | harness | apps/harness/src/server.ts:5416 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/schedules | harness | apps/harness/src/server.ts:5174 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/workers | harness | apps/harness/src/server.ts:5114 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/:workerId/heartbeat | harness | apps/harness/src/server.ts:5533 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/:workerId/unregister | harness | apps/harness/src/server.ts:5648 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/assign | harness | apps/harness/src/server.ts:5684 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/register | harness | apps/harness/src/server.ts:5419 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/neuro/live/frame | harness | apps/harness/src/server.ts:7147 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/nodes | harness | apps/harness/src/server.ts:5010 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| DELETE | /api/nodes/:nodeId | harness | apps/harness/src/server.ts:6181 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/nodes/:nodeId/heartbeat | harness | apps/harness/src/server.ts:6104 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/nodes/register | harness | apps/harness/src/server.ts:5756 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/orchestration/mediate | harness | apps/harness/src/server.ts:6667 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/q/info | harness | apps/harness/src/server.ts:4674 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/q/run | harness | apps/harness/src/server.ts:4714 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/work-governor | harness | apps/harness/src/server.ts:4205 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /stream/actuation/device | harness | apps/harness/src/server.ts:7441 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/q/info | q-gateway | apps/harness/src/q-gateway.ts:662 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /health | q-gateway | apps/harness/src/q-gateway.ts:637 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /v1/chat/completions | q-gateway | apps/harness/src/q-gateway.ts:707 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /v1/models | q-gateway | apps/harness/src/q-gateway.ts:693 | Classify as CLI-only, worker-only, public gateway, or product gap. |

## Backend Services, Utilities, And Core Contracts

| File | Category | Exports | Exported symbols |
| --- | --- | --- | --- |
| apps/harness/src/actuation.ts | service | 20 | ActuationAdapterKind, actuationAdapterKinds, ActuationAdapterState, ActuationCapabilityHealth, ActuationCapabilityHealthState, actuationCapabilityHealthStates, ActuationDelivery, ActuationDeliveryTransport, actuationDeliveryTransports, actuationProtocolCapabilities, ActuationProtocolCapability, ActuationProtocolId, actuationProtocolIds, ActuationProtocolProfile, ActuationTransportHealthState, actuationTransportHealthStates, ActuationTransportKind, actuationTransportKinds, ActuationTransportState, createActuationManager |
| apps/harness/src/arbitration.ts | utility | 3 | buildExecutionArbitrationDecision, ExecutionArbitrationPlan, planExecutionArbitration |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | cli-report-benchmark | 4 | ArobiAuditIntegrityBenchmarkResult, ArobiAuditIntegrityScenarioResult, runArobiAuditIntegrityBenchmark, summarizeArobiAuditIntegrityHardware |
| apps/harness/src/benchmark-cli-flags.ts | cli-report-benchmark | 2 | BenchmarkCliFlags, parseBenchmarkCliFlags |
| apps/harness/src/benchmark-data.ts | cli-report-benchmark | 3 | ExternalNeurodataEvidence, resolveBenchmarkInputs, ResolvedBenchmarkInputs |
| apps/harness/src/benchmark-durability.ts | cli-report-benchmark | 3 | DurabilityTortureModeSummary, DurabilityTortureResult, runDurabilityTortureBenchmark |
| apps/harness/src/benchmark-gate.ts | cli-report-benchmark | 4 | BenchmarkGateResult, BenchmarkGateViolation, parseBenchmarkGatePackIds, runBenchmarkGate |
| apps/harness/src/benchmark-packs.ts | cli-report-benchmark | 5 | BenchmarkPack, benchmarkPacks, getBenchmarkPack, listBenchmarkGatePacks, listBenchmarkPacks |
| apps/harness/src/benchmark-q-gateway-substrate.ts | cli-report-benchmark | 3 | QGatewaySubstrateBenchmarkResult, runQGatewaySubstrateBenchmark, summarizeQGatewaySubstrateHardware |
| apps/harness/src/benchmark-q-mediation-drift.ts | cli-report-benchmark | 3 | QMediationDriftBenchmarkResult, runQMediationDriftBenchmark, summarizeQMediationDriftHardware |
| apps/harness/src/benchmark-trend.ts | cli-report-benchmark | 6 | BenchmarkTrendPoint, BenchmarkTrendResult, BenchmarkTrendVerdict, loadAllBenchmarkTrends, loadBenchmarkTrend, loadLatestBenchmarkTrend |
| apps/harness/src/benchmark.ts | cli-report-benchmark | 5 | loadLatestBenchmarkReportForPack, loadPublishedBenchmarkIndex, loadPublishedBenchmarkReport, loadPublishedBenchmarkReportBySuiteId, runPublishedBenchmark |
| apps/harness/src/bids.ts | service | 4 | BidsDatasetFile, BidsDatasetRecord, createDatasetRegistry, scanBidsDataset |
| apps/harness/src/bridgebench.ts | cli-report-benchmark | 4 | BRIDGEBENCH_SCENARIOS, BridgeBenchReport, BridgeBenchScenario, runBridgeBench |
| apps/harness/src/conversation.ts | service | 5 | buildAgentTurn, buildConversationObjective, buildConversationRecord, buildSessionConversationMemory, SessionConversationMemory |
| apps/harness/src/dashboard-socket-ticket.ts | utility | 2 | DashboardSocketTicketClaims, verifyDashboardSocketTicketFromUrl |
| apps/harness/src/decision-trace.ts | utility | 8 | appendDecisionTraceMirrorRecord, appendDecisionTraceRecord, createDecisionTraceSeed, DecisionTraceIntegrityFinding, DecisionTraceIntegrityReport, DecisionTraceRecord, inspectDecisionTraceFile, inspectDecisionTraceLedger |
| apps/harness/src/federation-peers.ts | service | 7 | createFederationPeerRegistry, FederationLeaseRecoveryMode, FederationPeerRecord, FederationPeerRepairStatus, FederationPeerStatus, FederationPeerView, smoothObservedLatency |
| apps/harness/src/federation-pressure.ts | service | 6 | buildFederatedExecutionPressure, FederatedExecutionPressure, FederatedExecutionPressureWorkerView, IntelligencePeerExecutionOutcomeSummary, IntelligenceWorkerExecutionOutcomeSummary, summarizeRemoteExecutionOutcomes |
| apps/harness/src/federation.ts | service | 12 | buildFederationKeyId, FederationNodeIdentityPayload, FederationNodeLeasePayload, FederationSignatureAlgorithm, federationSignatureAlgorithms, FederationSignedEnvelope, FederationWorkerIdentityPayload, FederationWorkerLeasePayload, normalizeFederationControlPlaneUrl, resolveFederationSecret, signFederationPayload, verifyFederationEnvelope |
| apps/harness/src/governance.ts | service | 8 | createGovernanceRegistry, evaluateGovernance, GovernanceAction, governanceActions, GovernanceBinding, GovernanceDecision, GovernancePolicy, GovernanceStatus |
| apps/harness/src/harbor-soak.ts | utility | 7 | HarborSoakAgentKind, HarborSoakReport, HarborSoakRunRecord, HarborSoakStatSummary, HarborSoakTaskSpec, HarborSoakTaskSummary, runHarborSoak |
| apps/harness/src/live-neuro.ts | utility | 3 | buildLiveNeuroFrame, createLiveNeuroManager, LiveNeuroPayload |
| apps/harness/src/live-operator-public-export.ts | utility | 2 | evaluatePublicExportSourceFreshness, resolvePublicExportPublication |
| apps/harness/src/lsl-adapter.ts | utility | 8 | createLslAdapterManager, LslAdapterCallbacks, LslAdapterManager, LslBridgeConnection, LslBridgeState, LslConnectOptions, LslDiscoveryResult, LslStreamDescriptor |
| apps/harness/src/model-comparison.ts | utility | 2 | ModelComparisonReport, runModelComparison |
| apps/harness/src/neuro-bands.ts | utility | 3 | collapseSampleRows, extractBandPower, SpectralBandPower |
| apps/harness/src/neuro-replay.ts | utility | 1 | createNeuroReplayManager |
| apps/harness/src/node-registry.ts | service | 5 | createNodeRegistry, NodeDescriptor, NodeHealthStatus, NodeRegistrySummary, NodeView |
| apps/harness/src/nwb.ts | service | 6 | buildNwbReplayFrames, createNeuroRegistry, loadNwbReplaySource, NwbReplaySource, NwbSessionRecord, scanNwbFile |
| apps/harness/src/ollama.ts | service | 14 | buildImmaculatePrompt, discoverPreferredOllamaLayer, listOllamaModels, OllamaChatCompletionResult, OllamaChatMessage, OllamaExecutionResult, OllamaFailureClass, parseStructuredJsonResponse, parseStructuredResponse, prewarmOllamaModel, renderStructuredResponseContract, runOllamaChatCompletion, runOllamaExecution, runOllamaGenerateCompletion |
| apps/harness/src/parallel-engine.ts | utility | 3 | buildParallelFormation, ParallelFormation, ParallelFormationMode |
| apps/harness/src/persistence.ts | service | 3 | CheckpointMetadata, createPersistence, PersistenceStatus |
| apps/harness/src/q-api-auth.ts | service | 8 | createQApiKeyRegistry, defaultQApiKeysPath, normalizeQApiRateLimitPolicy, QApiAuthenticatedKey, QApiKeyCreationResult, QApiKeyMetadata, QApiKeyScope, QApiRateLimitPolicy |
| apps/harness/src/q-foundation.ts | service | 4 | expandQModelSearchText, matchQModelCandidate, QModelFoundationSpecification, resolveQFoundationSpecification |
| apps/harness/src/q-local-model.ts | service | 4 | buildQLocalModelfile, QLocalModelSpecification, resolveQLocalModelSpecification, resolveQLocalOllamaUrl |
| apps/harness/src/q-model.ts | service | 26 | buildCanonicalQIdentityAnswer, buildQRuntimeContext, canonicalizeQIdentityAnswer, detectQIdentityQuestion, displayModelName, foundationModelLabel, getArobiNetworkName, getArobiOperatingModelSummary, getImmaculateHarnessName, getQDeveloperName, getQFoundationModelName, getQIdentityInstruction, getQIdentitySummary, getQImmaculateRelationshipSummary, getQLeadName, getQModelName, getQModelTarget, getQRuntimeContextInstruction, isQModelName, isQTargetModel, matchesModelReference, QIdentityQuestionKind, QRuntimeContext, resolveQModel, truthfulModelLabel, vendorForModel |
| apps/harness/src/q-orchestration-context.ts | service | 2 | QOrchestrationContext, resolveQOrchestrationContext |
| apps/harness/src/q-rate-limit.ts | service | 3 | createQRateLimiter, RateLimitGrant, RateLimitRejection |
| apps/harness/src/q-resilience.ts | service | 3 | CircuitSnapshot, CircuitState, createFailureCircuitBreaker |
| apps/harness/src/release-metadata.ts | cli-report-benchmark | 8 | HarnessReadinessLane, HarnessReadinessSummary, QHybridTrainingSessionSummary, QTrainingLockSummary, ReleaseMetadata, resolveHarnessReadiness, ResolveHarnessReadinessOptions, resolveReleaseMetadata |
| apps/harness/src/roundtable.ts | cli-report-benchmark | 9 | appendRoundtableExecutionSummary, buildRoundtableActionPlan, cleanupRoundtableActionWorktree, discoverRoundtableProjects, materializeRoundtableActionExecutionArtifacts, materializeRoundtableActionWorktree, probeRoundtableActionWorkspace, RoundtableActionWorkspaceProbe, RoundtablePlan |
| apps/harness/src/routing.ts | service | 4 | AdaptiveRoutePlan, buildRoutingDecision, deriveGovernancePressure, planAdaptiveRoute |
| apps/harness/src/scheduling.ts | utility | 5 | buildExecutionScheduleDecision, ExecutionSchedulePlan, isParallelScheduleMode, planExecutionSchedule, preferredScheduleRoles |
| apps/harness/src/startup-banner.ts | utility | 2 | emitHarnessStartupBanner, StartupBannerOptions |
| apps/harness/src/temporal-activities.ts | utility | 6 | commitEnvelope, ingest, processEnvelope, TemporalBaselineEnvelope, TemporalBaselinePayload, verifyEnvelope |
| apps/harness/src/temporal-baseline.ts | utility | 2 | runTemporalBaselineComparison, TemporalBaselineComparison |
| apps/harness/src/temporal-workflow.ts | utility | 1 | immaculateTemporalBaselineWorkflow |
| apps/harness/src/training-data.ts | cli-report-benchmark | 3 | createTrainingCorpusRegistry, curateTrainingCorpus, loadTrainingCorpusManifest |
| apps/harness/src/utils.ts | utility | 8 | getAllowedDataRoot, getLocalVenvPythonPath, hashValue, resolvePathWithinAllowedRoot, safeUnlink, sha256Hash, sha256Json, stableStringify |
| apps/harness/src/visibility.ts | utility | 23 | deriveVisibilityScope, projectActuationOutput, projectCognitiveExecution, projectConversation, projectDatasetRecord, projectDatasetSummary, projectEventEnvelope, projectExecutionSchedule, projectIntelligenceLayer, projectNeuroFrameWindow, projectNeuroSessionRecord, projectNeuroSessionSummary, projectPhaseSnapshot, redactActuationOutput, redactCognitiveExecution, redactDatasetSummary, redactExecutionSchedule, redactNeuroFrameWindow, redactNeuroSessionSummary, redactNeuroStreamSummary, redactPhaseSnapshot, summarizeEventEnvelope, VisibilityScope |
| apps/harness/src/wandb.ts | cli-report-benchmark | 7 | exportBenchmarkResultsFromWandb, inspectWandbStatus, publishBenchmarkToWandb, WandbBenchmarkExportResult, WandbMode, WandbPublicationResult, WandbStatus |
| apps/harness/src/work-governor.ts | utility | 4 | createWorkGovernor, WorkGovernorGrant, WorkGovernorRequest, WorkGovernorSnapshot |
| apps/harness/src/workers.ts | service | 8 | createIntelligenceWorkerRegistry, IntelligenceWorkerAssignment, IntelligenceWorkerAssignmentRequest, IntelligenceWorkerExecutionProfile, IntelligenceWorkerHealthStatus, IntelligenceWorkerRecord, IntelligenceWorkerSummary, IntelligenceWorkerView |
| packages/core/src/index.ts | core-contract | 168 | ActuationChannel, actuationChannels, ActuationOutput, actuationOutputSchema, ActuationOutputSource, actuationOutputSources, ActuationOutputStatus, actuationOutputStatuses, AgentTurn, agentTurnSchema, AgentWorkspaceIsolationMode, agentWorkspaceIsolationModes, AgentWorkspaceScope, agentWorkspaceWriteAuthorities, AgentWorkspaceWriteAuthority, BenchmarkArobiAuditScenarioResult, BenchmarkAssertion, BenchmarkAttribution, BenchmarkComparison, BenchmarkDelta, BenchmarkHardwareContext, BenchmarkIndex, BenchmarkIndexEntry, benchmarkIndexSchema, BenchmarkMediationDriftScenarioResult, BenchmarkPackId, benchmarkPackIds, BenchmarkProgress, BenchmarkPublication, BenchmarkReport, benchmarkReportSchema, BenchmarkRunKind, benchmarkRunKinds, BenchmarkSeries, CognitiveExecution, cognitiveExecutionSchema, ConnectomeEdge, ConnectomeNode, ControlAction, controlActions, ControlEnvelope, controlEnvelopeSchema, createEngine, datasetModalities, DatasetModality, DatasetModalitySummary, datasetSummarySchema, EngineDurableState, engineDurableStateSchema, EventEnvelope, eventEnvelopeSchema, ExecutionAdmissionState, executionAdmissionStates, ExecutionArbitration, ExecutionArbitrationMode, executionArbitrationModes, executionArbitrationSchema, ExecutionParallelAffinityMode, executionParallelAffinityModes, ExecutionParallelBackpressureAction, executionParallelBackpressureActions, ExecutionParallelDeadlineClass, executionParallelDeadlineClasses, ExecutionParallelFormationMode, executionParallelFormationModes, ExecutionSchedule, ExecutionScheduleMode, executionScheduleModes, executionScheduleSchema, executionTopologies, ExecutionTopology, formatPercent, GovernancePressureLevel, governancePressureLevels, GuardVerdict, guardVerdicts, IngestedDatasetSummary, inspectDurableState, IntegrityFinding, IntegrityReport, integrityReportSchema, IntelligenceLayer, IntelligenceLayerBackend, intelligenceLayerBackends, IntelligenceLayerRole, intelligenceLayerRoles, intelligenceLayerSchema, IntelligenceLayerStatus, intelligenceLayerStatuses, MultiAgentConversation, multiAgentConversationSchema, NeuralCouplingState, neuralCouplingStateSchema, NeuroBand, NeuroBandPower, neuroBandPowerSchema, neuroBands, NeuroFrameWindow, neuroFrameWindowSchema, NeuroIngressSource, neuroIngressSources, NeuroReplayState, neuroReplayStateSchema, NeuroReplayStatus, neuroReplayStatuses, NeuroSessionSummary, neuroSessionSummarySchema, NeuroStreamKind, neuroStreamKinds, NeuroStreamSummary, NodeKind, nodeKinds, OrchestrationPlane, orchestrationPlanes, PassState, passStates, PhaseId, phaseIds, PhaseMetrics, PhasePass, PhaseSnapshot, phaseSnapshotSchema, planeColor, rebuildDurableStateFromEvents, RoundtableAction, RoundtableActionStatus, roundtableActionStatuses, RoundtableExecutionArtifact, RoundtableExecutionArtifactStatus, roundtableExecutionArtifactStatuses, RoutingDecision, RoutingDecisionMode, routingDecisionModes, routingDecisionSchema, RoutingDecisionSource, routingDecisionSources, SessionConversationSummary, sessionConversationSummarySchema, SnapshotHistoryPoint, snapshotHistoryPointSchema, STABILITY_POLE, TrainingCorpusCurationStatus, trainingCorpusCurationStatuses, TrainingCorpusFileRecord, trainingCorpusFileRecordSchema, TrainingCorpusLicenseDecision, trainingCorpusLicenseDecisions, TrainingCorpusManifest, trainingCorpusManifestSchema, TrainingCorpusOutputShard, trainingCorpusOutputShardSchema, TrainingCorpusPolicy, trainingCorpusPolicySchema, TrainingCorpusRun, trainingCorpusRunSchema, TrainingCorpusRunSummary, trainingCorpusRunSummarySchema, TrainingCorpusSecretScanStatus, trainingCorpusSecretScanStatuses, TrainingCorpusSourceHost, trainingCorpusSourceHosts, TrainingCorpusSourceKind, trainingCorpusSourceKinds, TrainingCorpusSourceManifest, trainingCorpusSourceManifestSchema, TrainingCorpusSourceSummary, trainingCorpusSourceSummarySchema, Vec3 |

## Database And File-Backed State Interactions

No SQL database client was detected in this repo slice. Persistence is file-backed through runtime ledgers, JSON, JSONL, benchmark reports, training outputs, and evidence receipts.

| File | Line | Operation | Category |
| --- | --- | --- | --- |
| apps/harness/src/actuation.ts | 5 | appendFile | runtime-state |
| apps/harness/src/actuation.ts | 5 | mkdir | runtime-state |
| apps/harness/src/actuation.ts | 5 | readFile | runtime-state |
| apps/harness/src/actuation.ts | 5 | writeFile | runtime-state |
| apps/harness/src/actuation.ts | 5 | node:fs/promises | runtime-state |
| apps/harness/src/actuation.ts | 245 | readFile | runtime-state |
| apps/harness/src/actuation.ts | 688 | mkdir | runtime-state |
| apps/harness/src/actuation.ts | 689 | writeFile | runtime-state |
| apps/harness/src/actuation.ts | 1011 | mkdir | runtime-state |
| apps/harness/src/actuation.ts | 1014 | appendFile | runtime-state |
| apps/harness/src/actuation.ts | 1235 | mkdir | runtime-state |
| apps/harness/src/actuation.ts | 1318 | mkdir | runtime-state |
| apps/harness/src/actuation.ts | 1319 | mkdir | runtime-state |
| apps/harness/src/actuation.ts | 1321 | appendFile | runtime-state |
| apps/harness/src/actuation.ts | 1323 | appendFile | runtime-state |
| apps/harness/src/agent-worktree-cli.ts | 1 | writeFile | file-utility |
| apps/harness/src/agent-worktree-cli.ts | 1 | node:fs/promises | file-utility |
| apps/harness/src/agent-worktree-cli.ts | 91 | writeFile | file-utility |
| apps/harness/src/arobi-audit-integrity-report.ts | 2 | mkdir | evidence-output |
| apps/harness/src/arobi-audit-integrity-report.ts | 2 | writeFile | evidence-output |
| apps/harness/src/arobi-audit-integrity-report.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/arobi-audit-integrity-report.ts | 190 | mkdir | evidence-output |
| apps/harness/src/arobi-audit-integrity-report.ts | 191 | writeFile | evidence-output |
| apps/harness/src/arobi-audit-integrity-report.ts | 192 | writeFile | evidence-output |
| apps/harness/src/arobi-decision-review.ts | 2 | mkdir | file-utility |
| apps/harness/src/arobi-decision-review.ts | 2 | readdir | file-utility |
| apps/harness/src/arobi-decision-review.ts | 2 | readFile | file-utility |
| apps/harness/src/arobi-decision-review.ts | 2 | writeFile | file-utility |
| apps/harness/src/arobi-decision-review.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/arobi-decision-review.ts | 86 | readdir | file-utility |
| apps/harness/src/arobi-decision-review.ts | 183 | readFile | file-utility |
| apps/harness/src/arobi-decision-review.ts | 234 | mkdir | file-utility |
| apps/harness/src/arobi-decision-review.ts | 235 | writeFile | file-utility |
| apps/harness/src/arobi-decision-review.ts | 236 | writeFile | file-utility |
| apps/harness/src/arobi-live-ledger-receipt.ts | 2 | mkdir | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 2 | readFile | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 2 | readdir | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 2 | writeFile | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 254 | readFile | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 265 | readdir | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 457 | mkdir | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 458 | writeFile | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 459 | writeFile | evidence-output |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | 5 | node:fs | evidence-output |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | 6 | mkdir | evidence-output |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | 6 | readFile | evidence-output |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | 6 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | 318 | readFile | evidence-output |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | 611 | mkdir | evidence-output |
| apps/harness/src/benchmark-cli-flags.test.ts | 2 | node:fs | evidence-output |
| apps/harness/src/benchmark-data.ts | 2 | node:fs | evidence-output |
| apps/harness/src/benchmark-data.ts | 3 | mkdir | evidence-output |
| apps/harness/src/benchmark-data.ts | 3 | stat | evidence-output |
| apps/harness/src/benchmark-data.ts | 3 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark-data.ts | 104 | mkdir | evidence-output |
| apps/harness/src/benchmark-data.ts | 109 | stat | evidence-output |
| apps/harness/src/benchmark-data.ts | 224 | mkdir | evidence-output |
| apps/harness/src/benchmark-data.ts | 268 | stat | evidence-output |
| apps/harness/src/benchmark-durability-worker.ts | 2 | mkdir | evidence-output |
| apps/harness/src/benchmark-durability-worker.ts | 2 | writeFile | evidence-output |
| apps/harness/src/benchmark-durability-worker.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark-durability-worker.ts | 55 | mkdir | evidence-output |
| apps/harness/src/benchmark-durability-worker.ts | 56 | writeFile | evidence-output |
| apps/harness/src/benchmark-durability.ts | 2 | node:fs | evidence-output |
| apps/harness/src/benchmark-durability.ts | 3 | readFile | evidence-output |
| apps/harness/src/benchmark-durability.ts | 3 | writeFile | evidence-output |
| apps/harness/src/benchmark-durability.ts | 3 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark-durability.ts | 84 | readFile | evidence-output |
| apps/harness/src/benchmark-durability.ts | 109 | readFile | evidence-output |
| apps/harness/src/benchmark-durability.ts | 115 | writeFile | evidence-output |
| apps/harness/src/benchmark-durability.ts | 126 | writeFile | evidence-output |
| apps/harness/src/benchmark-q-gateway-substrate.ts | 5 | node:fs | evidence-output |
| apps/harness/src/benchmark-q-gateway-substrate.ts | 6 | mkdir | evidence-output |
| apps/harness/src/benchmark-q-gateway-substrate.ts | 6 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark-q-gateway-substrate.ts | 466 | mkdir | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 5 | node:fs | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 6 | mkdir | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 6 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 906 | mkdir | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 907 | mkdir | evidence-output |
| apps/harness/src/benchmark.ts | 9 | mkdir | evidence-output |
| apps/harness/src/benchmark.ts | 9 | readdir | evidence-output |
| apps/harness/src/benchmark.ts | 9 | readFile | evidence-output |
| apps/harness/src/benchmark.ts | 9 | writeFile | evidence-output |
| apps/harness/src/benchmark.ts | 9 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark.ts | 432 | readFile | evidence-output |
| apps/harness/src/benchmark.ts | 879 | mkdir | evidence-output |
| apps/harness/src/benchmark.ts | 880 | mkdir | evidence-output |
| apps/harness/src/benchmark.ts | 919 | writeFile | evidence-output |
| apps/harness/src/benchmark.ts | 920 | writeFile | evidence-output |
| apps/harness/src/benchmark.ts | 921 | writeFile | evidence-output |
| apps/harness/src/benchmark.ts | 922 | writeFile | evidence-output |
| apps/harness/src/benchmark.ts | 923 | writeFile | evidence-output |
| apps/harness/src/benchmark.ts | 964 | readdir | evidence-output |
| apps/harness/src/benchmark.ts | 974 | readFile | evidence-output |
| apps/harness/src/benchmark.ts | 1027 | readFile | evidence-output |
| apps/harness/src/benchmark.ts | 1059 | readFile | evidence-output |
| apps/harness/src/benchmark.ts | 1087 | readFile | evidence-output |
| apps/harness/src/bids.ts | 2 | mkdir | dataset-ingest |
| apps/harness/src/bids.ts | 2 | readdir | dataset-ingest |
| apps/harness/src/bids.ts | 2 | readFile | dataset-ingest |
| apps/harness/src/bids.ts | 2 | writeFile | dataset-ingest |
| apps/harness/src/bids.ts | 2 | node:fs/promises | dataset-ingest |
| apps/harness/src/bids.ts | 105 | readdir | dataset-ingest |
| apps/harness/src/bids.ts | 137 | readFile | dataset-ingest |
| apps/harness/src/bids.ts | 203 | mkdir | dataset-ingest |
| apps/harness/src/bids.ts | 210 | readFile | dataset-ingest |
| apps/harness/src/bids.ts | 255 | writeFile | dataset-ingest |
| apps/harness/src/bids.ts | 262 | writeFile | dataset-ingest |
| apps/harness/src/bids.ts | 282 | readFile | dataset-ingest |
| apps/harness/src/bids.ts | 297 | readFile | dataset-ingest |
| apps/harness/src/bridgebench-soak.ts | 4 | mkdir | file-utility |
| apps/harness/src/bridgebench-soak.ts | 4 | writeFile | file-utility |
| apps/harness/src/bridgebench-soak.ts | 4 | node:fs/promises | file-utility |
| apps/harness/src/bridgebench-soak.ts | 265 | mkdir | file-utility |
| apps/harness/src/bridgebench-soak.ts | 368 | writeFile | file-utility |
| apps/harness/src/bridgebench-soak.ts | 369 | writeFile | file-utility |
| apps/harness/src/bridgebench.ts | 3 | mkdir | file-utility |
| apps/harness/src/bridgebench.ts | 3 | writeFile | file-utility |
| apps/harness/src/bridgebench.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/bridgebench.ts | 131 | access | file-utility |
| apps/harness/src/bridgebench.ts | 336 | mkdir | file-utility |
| apps/harness/src/bridgebench.ts | 381 | writeFile | file-utility |
| apps/harness/src/bridgebench.ts | 382 | writeFile | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 2 | mkdir | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 2 | writeFile | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 71 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 276 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 303 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 303 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 386 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 394 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 452 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 452 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 462 | mkdir | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 463 | writeFile | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 464 | writeFile | file-utility |
| apps/harness/src/decision-trace.ts | 2 | mkdir | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | readFile | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | unlink | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | node:fs/promises | runtime-state |
| apps/harness/src/decision-trace.ts | 121 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 123 | stat | runtime-state |
| apps/harness/src/decision-trace.ts | 156 | mkdir | runtime-state |
| apps/harness/src/decision-trace.ts | 162 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 178 | unlink | runtime-state |
| apps/harness/src/decision-trace.ts | 184 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 186 | writeFile | runtime-state |
| apps/harness/src/decision-trace.ts | 278 | readFile | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | mkdir | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | readFile | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | rename | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | writeFile | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | node:fs/promises | runtime-state |
| apps/harness/src/federation-peers.ts | 85 | readFile | runtime-state |
| apps/harness/src/federation-peers.ts | 96 | mkdir | runtime-state |
| apps/harness/src/federation-peers.ts | 99 | writeFile | runtime-state |
| apps/harness/src/federation-peers.ts | 100 | rename | runtime-state |
| apps/harness/src/github-checks-receipt.ts | 2 | mkdir | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 2 | writeFile | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 315 | mkdir | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 316 | writeFile | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 317 | writeFile | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 2 | access | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 2 | mkdir | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 2 | readFile | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 2 | writeFile | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 173 | readFile | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 227 | access | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 238 | readFile | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 417 | mkdir | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 418 | writeFile | evidence-output |
| apps/harness/src/harbor-benchmark-report.ts | 419 | writeFile | evidence-output |
| apps/harness/src/harbor-soak.ts | 2 | mkdir | file-utility |
| apps/harness/src/harbor-soak.ts | 2 | readFile | file-utility |
| apps/harness/src/harbor-soak.ts | 2 | readdir | file-utility |
| apps/harness/src/harbor-soak.ts | 2 | writeFile | file-utility |
| apps/harness/src/harbor-soak.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/harbor-soak.ts | 154 | readFile | file-utility |
| apps/harness/src/harbor-soak.ts | 162 | readdir | file-utility |
| apps/harness/src/harbor-soak.ts | 471 | mkdir | file-utility |
| apps/harness/src/harbor-soak.ts | 472 | writeFile | file-utility |
| apps/harness/src/harbor-soak.ts | 473 | writeFile | file-utility |
| apps/harness/src/harbor-soak.ts | 581 | mkdir | file-utility |
| apps/harness/src/harbor-soak.ts | 606 | mkdir | file-utility |
| apps/harness/src/live-mission-readiness.ts | 2 | mkdir | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 2 | readFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 2 | writeFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 145 | readFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 153 | readFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 508 | mkdir | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 509 | writeFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 510 | writeFile | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 2 | mkdir | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 2 | readFile | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 2 | writeFile | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 129 | open | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 159 | readFile | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 175 | open | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 180 | open | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 326 | open | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 453 | mkdir | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 454 | writeFile | evidence-output |
| apps/harness/src/live-mission-showcase.ts | 455 | writeFile | evidence-output |
| apps/harness/src/live-operator-activity.ts | 2 | node:fs | evidence-output |
| apps/harness/src/live-operator-activity.ts | 3 | mkdir | evidence-output |
| apps/harness/src/live-operator-activity.ts | 3 | readFile | evidence-output |
| apps/harness/src/live-operator-activity.ts | 3 | readdir | evidence-output |
| apps/harness/src/live-operator-activity.ts | 3 | writeFile | evidence-output |
| apps/harness/src/live-operator-activity.ts | 3 | node:fs/promises | evidence-output |
| apps/harness/src/live-operator-activity.ts | 264 | readFile | evidence-output |
| apps/harness/src/live-operator-activity.ts | 375 | readdir | evidence-output |
| apps/harness/src/live-operator-activity.ts | 717 | mkdir | evidence-output |
| apps/harness/src/live-operator-activity.ts | 718 | writeFile | evidence-output |
| apps/harness/src/live-operator-activity.ts | 723 | writeFile | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 2 | mkdir | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 2 | readFile | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 2 | writeFile | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 158 | readFile | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 793 | mkdir | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 794 | writeFile | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 795 | writeFile | evidence-output |
| apps/harness/src/lsl-adapter.ts | 6 | node:fs | file-utility |
| apps/harness/src/model-comparison.ts | 3 | mkdir | file-utility |
| apps/harness/src/model-comparison.ts | 3 | writeFile | file-utility |
| apps/harness/src/model-comparison.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/model-comparison.ts | 150 | access | file-utility |
| apps/harness/src/model-comparison.ts | 517 | mkdir | file-utility |
| apps/harness/src/model-comparison.ts | 518 | writeFile | file-utility |
| apps/harness/src/model-comparison.ts | 519 | writeFile | file-utility |
| apps/harness/src/node-registry.ts | 4 | mkdir | runtime-state |
| apps/harness/src/node-registry.ts | 4 | readFile | runtime-state |
| apps/harness/src/node-registry.ts | 4 | rename | runtime-state |
| apps/harness/src/node-registry.ts | 4 | writeFile | runtime-state |
| apps/harness/src/node-registry.ts | 4 | node:fs/promises | runtime-state |
| apps/harness/src/node-registry.ts | 73 | readFile | runtime-state |
| apps/harness/src/node-registry.ts | 84 | mkdir | runtime-state |
| apps/harness/src/node-registry.ts | 87 | writeFile | runtime-state |
| apps/harness/src/node-registry.ts | 88 | rename | runtime-state |
| apps/harness/src/nwb.ts | 2 | mkdir | dataset-ingest |
| apps/harness/src/nwb.ts | 2 | readFile | dataset-ingest |
| apps/harness/src/nwb.ts | 2 | writeFile | dataset-ingest |
| apps/harness/src/nwb.ts | 2 | node:fs/promises | dataset-ingest |
| apps/harness/src/nwb.ts | 489 | mkdir | dataset-ingest |
| apps/harness/src/nwb.ts | 496 | readFile | dataset-ingest |
| apps/harness/src/nwb.ts | 542 | writeFile | dataset-ingest |
| apps/harness/src/nwb.ts | 549 | writeFile | dataset-ingest |
| apps/harness/src/nwb.ts | 569 | readFile | dataset-ingest |
| apps/harness/src/nwb.ts | 584 | readFile | dataset-ingest |
| apps/harness/src/ollama.ts | 519 | access | file-utility |
| apps/harness/src/ollama.ts | 572 | access | file-utility |
| apps/harness/src/ollama.ts | 602 | access | file-utility |
| apps/harness/src/ollama.ts | 710 | access | file-utility |
| apps/harness/src/ollama.ts | 832 | access | file-utility |
| apps/harness/src/persistence.ts | 2 | mkdir | runtime-state |
| apps/harness/src/persistence.ts | 2 | appendFile | runtime-state |
| apps/harness/src/persistence.ts | 2 | open | runtime-state |
| apps/harness/src/persistence.ts | 2 | readFile | runtime-state |
| apps/harness/src/persistence.ts | 2 | rename | runtime-state |
| apps/harness/src/persistence.ts | 2 | writeFile | runtime-state |
| apps/harness/src/persistence.ts | 2 | node:fs/promises | runtime-state |
| apps/harness/src/persistence.ts | 100 | readFile | runtime-state |
| apps/harness/src/persistence.ts | 112 | open | runtime-state |
| apps/harness/src/persistence.ts | 114 | stat | runtime-state |
| apps/harness/src/persistence.ts | 387 | writeFile | runtime-state |
| apps/harness/src/persistence.ts | 391 | rename | runtime-state |
| apps/harness/src/persistence.ts | 399 | writeFile | runtime-state |
| apps/harness/src/persistence.ts | 449 | mkdir | runtime-state |
| apps/harness/src/persistence.ts | 450 | mkdir | runtime-state |
| apps/harness/src/persistence.ts | 812 | appendFile | runtime-state |
| apps/harness/src/persistence.ts | 821 | appendFile | runtime-state |
| apps/harness/src/q-api-auth.ts | 2 | mkdir | runtime-state |
| apps/harness/src/q-api-auth.ts | 2 | readFile | runtime-state |
| apps/harness/src/q-api-auth.ts | 2 | rename | runtime-state |
| apps/harness/src/q-api-auth.ts | 2 | writeFile | runtime-state |
| apps/harness/src/q-api-auth.ts | 2 | node:fs/promises | runtime-state |
| apps/harness/src/q-api-auth.ts | 225 | writeFile | runtime-state |
| apps/harness/src/q-api-auth.ts | 227 | rename | runtime-state |
| apps/harness/src/q-api-auth.ts | 248 | mkdir | runtime-state |
| apps/harness/src/q-api-auth.ts | 254 | readFile | runtime-state |
| apps/harness/src/q-benchmark-sweep-report.ts | 2 | mkdir | evidence-output |
| apps/harness/src/q-benchmark-sweep-report.ts | 2 | readFile | evidence-output |
| apps/harness/src/q-benchmark-sweep-report.ts | 2 | writeFile | evidence-output |
| apps/harness/src/q-benchmark-sweep-report.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/q-benchmark-sweep-report.ts | 130 | readFile | evidence-output |
| apps/harness/src/q-benchmark-sweep-report.ts | 279 | mkdir | evidence-output |
| apps/harness/src/q-benchmark-sweep-report.ts | 280 | writeFile | evidence-output |
| apps/harness/src/q-benchmark-sweep-report.ts | 281 | writeFile | evidence-output |
| apps/harness/src/q-gateway-substrate-report.ts | 2 | mkdir | evidence-output |
| apps/harness/src/q-gateway-substrate-report.ts | 2 | writeFile | evidence-output |
| apps/harness/src/q-gateway-substrate-report.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/q-gateway-substrate-report.ts | 111 | mkdir | evidence-output |
| apps/harness/src/q-gateway-substrate-report.ts | 112 | writeFile | evidence-output |
| apps/harness/src/q-gateway-substrate-report.ts | 113 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 3 | node:fs | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 4 | mkdir | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 4 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 4 | node:fs/promises | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 518 | mkdir | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 519 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 520 | writeFile | evidence-output |
| apps/harness/src/q-local-model-cli.ts | 1 | rm | file-utility |
| apps/harness/src/q-local-model-cli.ts | 1 | writeFile | file-utility |
| apps/harness/src/q-local-model-cli.ts | 1 | node:fs/promises | file-utility |
| apps/harness/src/q-local-model-cli.ts | 114 | writeFile | file-utility |
| apps/harness/src/q-local-model-cli.ts | 116 | rm | file-utility |
| apps/harness/src/q-local-model-cli.ts | 148 | rm | file-utility |
| apps/harness/src/q-mediation-drift-report.ts | 2 | mkdir | evidence-output |
| apps/harness/src/q-mediation-drift-report.ts | 2 | writeFile | evidence-output |
| apps/harness/src/q-mediation-drift-report.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/q-mediation-drift-report.ts | 272 | mkdir | evidence-output |
| apps/harness/src/q-mediation-drift-report.ts | 273 | writeFile | evidence-output |
| apps/harness/src/q-mediation-drift-report.ts | 274 | writeFile | evidence-output |
| apps/harness/src/q-orchestration-context.ts | 2 | readFile | file-utility |
| apps/harness/src/q-orchestration-context.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/q-orchestration-context.ts | 132 | readFile | file-utility |
| apps/harness/src/q-release-gate.ts | 2 | mkdir | evidence-output |
| apps/harness/src/q-release-gate.ts | 2 | readFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 2 | writeFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/q-release-gate.ts | 87 | readFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 204 | mkdir | evidence-output |
| apps/harness/src/q-release-gate.ts | 205 | writeFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 206 | writeFile | evidence-output |
| apps/harness/src/q-resilience.ts | 1 | open | file-utility |
| apps/harness/src/q-resilience.ts | 1 | open | file-utility |
| apps/harness/src/q-resilience.ts | 47 | open | file-utility |
| apps/harness/src/q-resilience.ts | 56 | open | file-utility |
| apps/harness/src/q-resilience.ts | 80 | open | file-utility |
| apps/harness/src/q-resilience.ts | 81 | open | file-utility |
| apps/harness/src/release-metadata.test.ts | 2 | node:fs | file-utility |
| apps/harness/src/release-metadata.ts | 2 | node:fs | file-utility |
| apps/harness/src/release-metadata.ts | 3 | readdir | file-utility |
| apps/harness/src/release-metadata.ts | 3 | readFile | file-utility |
| apps/harness/src/release-metadata.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/release-metadata.ts | 326 | readFile | file-utility |
| apps/harness/src/release-metadata.ts | 375 | readdir | file-utility |
| apps/harness/src/release-surface.ts | 2 | mkdir | evidence-output |
| apps/harness/src/release-surface.ts | 2 | readFile | evidence-output |
| apps/harness/src/release-surface.ts | 2 | writeFile | evidence-output |
| apps/harness/src/release-surface.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/release-surface.ts | 185 | readFile | evidence-output |
| apps/harness/src/release-surface.ts | 198 | readFile | evidence-output |
| apps/harness/src/release-surface.ts | 341 | mkdir | evidence-output |
| apps/harness/src/release-surface.ts | 342 | writeFile | evidence-output |
| apps/harness/src/release-surface.ts | 343 | writeFile | evidence-output |
| apps/harness/src/roundtable-actionability.ts | 2 | mkdir | file-utility |
| apps/harness/src/roundtable-actionability.ts | 2 | writeFile | file-utility |
| apps/harness/src/roundtable-actionability.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/roundtable-actionability.ts | 147 | mkdir | file-utility |
| apps/harness/src/roundtable-actionability.ts | 148 | writeFile | file-utility |
| apps/harness/src/roundtable-actionability.ts | 149 | writeFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 7 | node:fs | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | appendFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | writeFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | node:fs/promises | file-utility |
| apps/harness/src/roundtable-runtime.ts | 379 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 380 | writeFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 384 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 385 | appendFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 1724 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 1725 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 1726 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 2005 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 2 | node:fs | file-utility |
| apps/harness/src/roundtable.ts | 3 | mkdir | file-utility |
| apps/harness/src/roundtable.ts | 3 | readFile | file-utility |
| apps/harness/src/roundtable.ts | 3 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/roundtable.ts | 396 | readFile | file-utility |
| apps/harness/src/roundtable.ts | 801 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 820 | mkdir | file-utility |
| apps/harness/src/roundtable.ts | 929 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 930 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 935 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 937 | mkdir | file-utility |
| apps/harness/src/roundtable.ts | 938 | writeFile | file-utility |
| apps/harness/src/server.ts | 3 | appendFile | file-utility |
| apps/harness/src/server.ts | 3 | mkdir | file-utility |
| apps/harness/src/server.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/server.ts | 160 | mkdir | file-utility |
| apps/harness/src/server.ts | 161 | appendFile | file-utility |
| apps/harness/src/server.ts | 651 | mkdir | file-utility |
| apps/harness/src/server.ts | 652 | appendFile | file-utility |
| apps/harness/src/server.ts | 7520 | open | file-utility |
| apps/harness/src/temporal-baseline.ts | 2 | node:fs | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 2 | access | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 2 | mkdir | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 2 | readFile | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 2 | writeFile | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 107 | access | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 121 | readdir | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 121 | stat | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 121 | node:fs/promises | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 122 | readdir | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 129 | stat | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 170 | readFile | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 340 | mkdir | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 341 | writeFile | file-utility |
| apps/harness/src/terminal-bench-public-task.ts | 342 | writeFile | file-utility |
| apps/harness/src/terminal-bench-receipt.ts | 2 | mkdir | evidence-output |
| apps/harness/src/terminal-bench-receipt.ts | 2 | readFile | evidence-output |
| apps/harness/src/terminal-bench-receipt.ts | 2 | writeFile | evidence-output |
| apps/harness/src/terminal-bench-receipt.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/terminal-bench-receipt.ts | 43 | readFile | evidence-output |
| apps/harness/src/terminal-bench-receipt.ts | 120 | mkdir | evidence-output |
| apps/harness/src/terminal-bench-receipt.ts | 121 | writeFile | evidence-output |
| apps/harness/src/terminal-bench-receipt.ts | 122 | writeFile | evidence-output |
| apps/harness/src/terminal-bench-rerun.ts | 2 | mkdir | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 2 | readFile | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 2 | writeFile | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 109 | readFile | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 145 | readFile | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 338 | mkdir | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 339 | writeFile | file-utility |
| apps/harness/src/terminal-bench-rerun.ts | 340 | writeFile | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 5 | node:fs | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 6 | mkdir | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 6 | writeFile | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 6 | node:fs/promises | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 451 | mkdir | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 488 | mkdir | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 489 | writeFile | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 540 | writeFile | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 550 | writeFile | file-utility |
| apps/harness/src/terminal-bench-sweep.ts | 555 | writeFile | file-utility |
| apps/harness/src/training-data-smoke.ts | 3 | mkdir | runtime-state |
| apps/harness/src/training-data-smoke.ts | 3 | readFile | runtime-state |
| apps/harness/src/training-data-smoke.ts | 3 | rm | runtime-state |
| apps/harness/src/training-data-smoke.ts | 3 | writeFile | runtime-state |
| apps/harness/src/training-data-smoke.ts | 3 | node:fs/promises | runtime-state |
| apps/harness/src/training-data-smoke.ts | 14 | mkdir | runtime-state |
| apps/harness/src/training-data-smoke.ts | 17 | mkdir | runtime-state |
| apps/harness/src/training-data-smoke.ts | 18 | writeFile | runtime-state |
| apps/harness/src/training-data-smoke.ts | 53 | writeFile | runtime-state |
| apps/harness/src/training-data-smoke.ts | 113 | readFile | runtime-state |
| apps/harness/src/training-data-smoke.ts | 152 | rm | runtime-state |
| apps/harness/src/training-data.ts | 4 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 4 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 4 | readdir | runtime-state |
| apps/harness/src/training-data.ts | 4 | rename | runtime-state |
| apps/harness/src/training-data.ts | 4 | writeFile | runtime-state |
| apps/harness/src/training-data.ts | 4 | node:fs/promises | runtime-state |
| apps/harness/src/training-data.ts | 151 | access | runtime-state |
| apps/harness/src/training-data.ts | 442 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 445 | writeFile | runtime-state |
| apps/harness/src/training-data.ts | 446 | rename | runtime-state |
| apps/harness/src/training-data.ts | 454 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 465 | readdir | runtime-state |
| apps/harness/src/training-data.ts | 559 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 593 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 639 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 802 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 803 | writeFile | runtime-state |
| apps/harness/src/training-data.ts | 833 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 846 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 953 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 999 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 1026 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 1040 | readFile | runtime-state |
| apps/harness/src/utils.ts | 4 | unlink | file-utility |
| apps/harness/src/utils.ts | 4 | node:fs/promises | file-utility |
| apps/harness/src/utils.ts | 38 | unlink | file-utility |
| apps/harness/src/wandb.ts | 2 | node:fs | evidence-output |
| apps/harness/src/workers.ts | 3 | mkdir | runtime-state |
| apps/harness/src/workers.ts | 3 | readFile | runtime-state |
| apps/harness/src/workers.ts | 3 | rename | runtime-state |
| apps/harness/src/workers.ts | 3 | writeFile | runtime-state |
| apps/harness/src/workers.ts | 3 | node:fs/promises | runtime-state |
| apps/harness/src/workers.ts | 146 | readFile | runtime-state |
| apps/harness/src/workers.ts | 157 | mkdir | runtime-state |
| apps/harness/src/workers.ts | 160 | writeFile | runtime-state |
| apps/harness/src/workers.ts | 161 | rename | runtime-state |

## Tests

| File | Test count |
| --- | --- |
| apps/harness/src/benchmark-cli-flags.test.ts | 5 |
| apps/harness/src/live-operator-public-export.test.ts | 4 |
| apps/harness/src/q-model.test.ts | 2 |
| apps/harness/src/release-metadata.test.ts | 1 |

## Issue Detection

| Readiness | Issue | Evidence | Surgical fix |
| --- | --- | --- | --- |
| Red | No cross-repo product inventory existed before this generated audit surface. | Routes, endpoints, UI calls, exports, tests, and file-backed stores were discoverable only by manual search. | Keep `npm run audit:inventory` in the release checklist and update this report before broad product claims. |
| Yellow | Dashboard proxy does not cover every harness method. | Harness DELETE routes without dashboard proxy coverage: /api/federation/peers/:peerId, /api/nodes/:nodeId. | Add governed DELETE support to the dashboard proxy only for explicitly allowed operator routes, with tests. |
| Yellow | Actuation websocket is implemented but not part of the dashboard ticket route allowlist. | `/stream/actuation/device` exists in the harness; dashboard socket tickets support only `/stream` and `/stream/neuro/live`. | Add a dedicated dashboard ticket type for actuation device links or keep it intentionally external and document that boundary. |
| Red | Frontend and TUI flows have no direct automated tests. | Dashboard tests: 0; TUI tests: 0. Harness tests: 12. | Add dashboard route-handler tests for auth/proxy behavior and TUI command tests for governed request headers. |
| Green | Q current-date awareness is now a first-class exported runtime context. | A date/time context export was detected. | Keep the runtime context injected anywhere Q or Discord agents answer questions about current facts. |
| Yellow | Several backend endpoints are not called by the dashboard or TUI. | 48 endpoint(s) have no operator UI caller in this scan. Some are valid CLI/worker/public-gateway surfaces; the rest need route ownership decisions. | Mark each no-UI endpoint as public gateway, CLI-only, worker-only, or product gap, then add tests or remove it. |

## Surgical Fix Plan

| Priority | Target | Action |
| --- | --- | --- |
| 1 | Q and Discord command runtime | Add a shared runtime context block with current date, knowledge cutoff, project roles, and governed tool policy; inject it into Q gateway, Immaculate Q API, and Discord-agent prompts. |
| 2 | Dashboard proxy and websocket route coverage | Add tests first, then extend the proxy/ticket allowlists only for governed operator flows that need same-origin browser access. |
| 3 | Backend endpoint ownership | Classify all no-UI endpoints as UI, CLI, worker, public gateway, or retired. Remove or document dead code. |
| 4 | Public marketing surfaces | Keep iorch.net, qline.site, and aura-genesis.org copy short, customer-facing, and evidence-backed without internal footnote language. |
| 5 | Benchmarks and CI | Restamp Terminal-Bench, BridgeBench, W&B export, release surface, and GitHub checks from the same commit before publishing readiness claims. |

## Production Readiness Definition

- Green means implemented, tested, error-handled, secure enough for its stated boundary, and performant for current expected load.
- Yellow means mostly implemented but missing tests, complete UI coverage, deployment proof, or an explicit ownership boundary.
- Red means broken, untested in a critical path, incomplete, or dangerous if exposed broadly.
