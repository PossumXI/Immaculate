# Full Stack Audit Inventory

Generated from repo source. This is the operator handoff surface for route, endpoint, component, service, file-backed state, and readiness drift.

- Generated: 2026-05-14T01:58:55.996Z
- Commit: `c1b2c2a85d8244048ed980bf12ca6bbaadcedafb`
- Branch: `main`
- Frontend routes: `8`
- Frontend components: `5`
- Harness/gateway endpoints: `105`
- Exported backend/core files: `79`
- File interaction records: `569`
- Tests: `177` assertions across `46` files
- Readiness: Green `5`, Yellow `118`, Red `2`

## Frontend Routes

| Route | Kind | Methods | File | Readiness | Notes |
| --- | --- | --- | --- | --- | --- |
| / | page | GET | apps/dashboard/app/page.tsx | Yellow | Page is implemented and statically discoverable. No page-level build snapshot or browser flow tests were found. |
| /api/operator/harness/*path | api-route | DELETE, GET, POST | apps/dashboard/app/api/operator/harness/[...path]/route.ts | Green | Server-side dashboard proxy is authenticated and same-origin. It forwards GET, POST, and the explicit governed DELETE allowlist for harness removal routes. |
| /api/operator/session | api-route | DELETE, POST | apps/dashboard/app/api/operator/session/route.ts | Yellow | Route has explicit handler methods. No dashboard API route tests were found in this repo. |
| /api/operator/socket-ticket | api-route | POST | apps/dashboard/app/api/operator/socket-ticket/route.ts | Yellow | Route has explicit handler methods. No dashboard API route tests were found in this repo. |
| /downloads/jaws | page | GET | apps/dashboard/app/downloads/jaws/page.tsx | Yellow | Page is implemented and statically discoverable. No page-level build snapshot or browser flow tests were found. |
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
| GET | /api/actuation/adapters | harness | apps/harness/src/server.ts:6445 | dashboard-ui /api/actuation/adapters (apps/dashboard/app/ui/dashboard-client.tsx:754) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/deliveries | harness | apps/harness/src/server.ts:6467 | dashboard-ui /api/actuation/deliveries (apps/dashboard/app/ui/dashboard-client.tsx:864) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/dispatch | harness | apps/harness/src/server.ts:7291 | dashboard-ui /api/actuation/dispatch (apps/dashboard/app/ui/dashboard-client.tsx:1468)<br>tui /api/actuation/dispatch (apps/tui/src/index.tsx:472) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/outputs | harness | apps/harness/src/server.ts:6411 | dashboard-ui /api/actuation/outputs (apps/dashboard/app/ui/dashboard-client.tsx:851) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/protocols | harness | apps/harness/src/server.ts:6449 | dashboard-ui /api/actuation/protocols (apps/dashboard/app/ui/dashboard-client.tsx:755) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/actuation/transports | harness | apps/harness/src/server.ts:6453 | dashboard-ui /api/actuation/transports (apps/dashboard/app/ui/dashboard-client.tsx:757) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/:transportId/heartbeat | harness | apps/harness/src/server.ts:7505 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/:transportId/reset | harness | apps/harness/src/server.ts:7552 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/http2/register | harness | apps/harness/src/server.ts:7447 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/serial/register | harness | apps/harness/src/server.ts:7386 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/actuation/transports/udp/register | harness | apps/harness/src/server.ts:7340 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/history | harness | apps/harness/src/server.ts:5294 | dashboard-ui /api/benchmarks/history (apps/dashboard/app/ui/dashboard-client.tsx:663)<br>dashboard-ui /api/benchmarks/history (apps/dashboard/app/ui/dashboard-client.tsx:1078) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/jobs/:jobId | harness | apps/harness/src/server.ts:5348 | dashboard-ui /api/benchmarks/jobs/:param (apps/dashboard/app/ui/dashboard-client.tsx:1060) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/latest | harness | apps/harness/src/server.ts:5279 | dashboard-ui /api/benchmarks/latest (apps/dashboard/app/ui/dashboard-client.tsx:644) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/packs | harness | apps/harness/src/server.ts:5382 | dashboard-ui /api/benchmarks/packs (apps/dashboard/app/ui/dashboard-client.tsx:729) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/benchmarks/publish/wandb | harness | apps/harness/src/server.ts:8269 | dashboard-ui /api/benchmarks/publish/wandb (apps/dashboard/app/ui/dashboard-client.tsx:1142)<br>tui /api/benchmarks/publish/wandb (apps/tui/src/index.tsx:494) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/benchmarks/run | harness | apps/harness/src/server.ts:8234 | dashboard-ui /api/benchmarks/run (apps/dashboard/app/ui/dashboard-client.tsx:1035) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/benchmarks/trend | harness | apps/harness/src/server.ts:5309 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/checkpoints | harness | apps/harness/src/server.ts:4986 | dashboard-ui /api/checkpoints (apps/dashboard/app/ui/dashboard-client.tsx:723) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/cognitive-runtime/role-plan/admission | harness | apps/harness/src/server.ts:5137 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/cognitive-runtime/role-plan/schema | harness | apps/harness/src/server.ts:5122 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/cognitive-runtime/trace-graph/admission | harness | apps/harness/src/server.ts:5165 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/cognitive-runtime/trace-graph/integrity | harness | apps/harness/src/server.ts:5229 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/cognitive-runtime/trace-graph/records | harness | apps/harness/src/server.ts:5204 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/cognitive-runtime/trace-graph/records | harness | apps/harness/src/server.ts:5178 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/cognitive-runtime/trace-graph/schema | harness | apps/harness/src/server.ts:5150 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/control | harness | apps/harness/src/server.ts:8329 | tui /api/control (apps/tui/src/index.tsx:435) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/datasets | harness | apps/harness/src/server.ts:5412 | dashboard-ui /api/datasets (apps/dashboard/app/ui/dashboard-client.tsx:750) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/datasets/:datasetId | harness | apps/harness/src/server.ts:5428 | dashboard-ui /api/datasets/:param (apps/dashboard/app/ui/dashboard-client.tsx:788) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/devices/lsl/:sourceId/stop | harness | apps/harness/src/server.ts:5667 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/devices/lsl/connect | harness | apps/harness/src/server.ts:5607 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/devices/lsl/connections | harness | apps/harness/src/server.ts:5588 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/devices/lsl/streams | harness | apps/harness/src/server.ts:5568 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/events | harness | apps/harness/src/server.ts:4910 | dashboard-ui /api/events (apps/dashboard/app/ui/dashboard-client.tsx:731) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/leases | harness | apps/harness/src/server.ts:6250 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/membership | harness | apps/harness/src/server.ts:6229 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/peers | harness | apps/harness/src/server.ts:6313 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| DELETE | /api/federation/peers/:peerId | harness | apps/harness/src/server.ts:7171 | No dashboard/TUI caller detected | Yellow | Delete route is governed server-side. Dashboard access must stay constrained to the explicit governed DELETE allowlist. |
| POST | /api/federation/peers/:peerId/lease-renew | harness | apps/harness/src/server.ts:7136 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/federation/peers/:peerId/refresh | harness | apps/harness/src/server.ts:7102 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/federation/peers/register | harness | apps/harness/src/server.ts:6971 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/federation/peers/sync | harness | apps/harness/src/server.ts:7038 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/private-00/leases | harness | apps/harness/src/server.ts:6292 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/federation/private-00/membership | harness | apps/harness/src/server.ts:6271 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/goals/admission | harness | apps/harness/src/server.ts:5109 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/goals/schema | harness | apps/harness/src/server.ts:5094 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/decisions | harness | apps/harness/src/server.ts:5244 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/policies | harness | apps/harness/src/server.ts:5016 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/real-world-engagement | harness | apps/harness/src/server.ts:5046 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/status | harness | apps/harness/src/server.ts:5001 | dashboard-ui /api/governance/status (apps/dashboard/app/ui/dashboard-client.tsx:726)<br>tui /api/governance/status (apps/tui/src/index.tsx:738) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/governance/tool-actions | harness | apps/harness/src/server.ts:5031 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/governance/tool-actions/admission | harness | apps/harness/src/server.ts:5063 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/health | harness | apps/harness/src/server.ts:4877 | No dashboard/TUI caller detected | Green | Read-only health endpoint. |
| GET | /api/history | harness | apps/harness/src/server.ts:4906 | dashboard-ui /api/history (apps/dashboard/app/ui/dashboard-client.tsx:608) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/ingest/bids/scan | harness | apps/harness/src/server.ts:7583 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/ingest/nwb/scan | harness | apps/harness/src/server.ts:8051 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/integrity | harness | apps/harness/src/server.ts:4971 | dashboard-ui /api/integrity (apps/dashboard/app/ui/dashboard-client.tsx:720) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence | harness | apps/harness/src/server.ts:5735 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/arbitrations | harness | apps/harness/src/server.ts:6356 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/assessments | harness | apps/harness/src/server.ts:5782 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/assessments/run | harness | apps/harness/src/server.ts:5815 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/conversations | harness | apps/harness/src/server.ts:6392 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/executions | harness | apps/harness/src/server.ts:6188 | dashboard-ui /api/intelligence/executions (apps/dashboard/app/ui/dashboard-client.tsx:838)<br>tui /api/intelligence/executions (apps/tui/src/index.tsx:752) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/ollama/models | harness | apps/harness/src/server.ts:6525 | dashboard-ui /api/intelligence/ollama/models (apps/dashboard/app/ui/dashboard-client.tsx:766) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/ollama/register | harness | apps/harness/src/server.ts:6580 | dashboard-ui /api/intelligence/ollama/register (apps/dashboard/app/ui/dashboard-client.tsx:1401) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/q/models | harness | apps/harness/src/server.ts:6524 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/q/register | harness | apps/harness/src/server.ts:6574 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/run | harness | apps/harness/src/server.ts:7618 | dashboard-ui /api/intelligence/run (apps/dashboard/app/ui/dashboard-client.tsx:1101)<br>tui /api/intelligence/run (apps/tui/src/index.tsx:456) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/schedules | harness | apps/harness/src/server.ts:6373 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/status | harness | apps/harness/src/server.ts:5749 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/intelligence/workers | harness | apps/harness/src/server.ts:6325 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/:workerId/heartbeat | harness | apps/harness/src/server.ts:6695 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/:workerId/unregister | harness | apps/harness/src/server.ts:6804 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/assign | harness | apps/harness/src/server.ts:6834 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/intelligence/workers/register | harness | apps/harness/src/server.ts:6587 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/frames | harness | apps/harness/src/server.ts:5701 | dashboard-ui /api/neuro/frames (apps/dashboard/app/ui/dashboard-client.tsx:822) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/live/:sourceId/stop | harness | apps/harness/src/server.ts:8203 | dashboard-ui /api/neuro/live/:param/stop (apps/dashboard/app/ui/dashboard-client.tsx:1366)<br>tui /api/neuro/live/:param/stop (apps/tui/src/index.tsx:568) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/live/frame | harness | apps/harness/src/server.ts:8177 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/live/sources | harness | apps/harness/src/server.ts:5564 | dashboard-ui /api/neuro/live/sources (apps/dashboard/app/ui/dashboard-client.tsx:753) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/replays | harness | apps/harness/src/server.ts:5560 | dashboard-ui /api/neuro/replays (apps/dashboard/app/ui/dashboard-client.tsx:752) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/replays/:replayId/stop | harness | apps/harness/src/server.ts:8147 | dashboard-ui /api/neuro/replays/:param/stop (apps/dashboard/app/ui/dashboard-client.tsx:1243)<br>tui /api/neuro/replays/:param/stop (apps/tui/src/index.tsx:544) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/neuro/replays/start | harness | apps/harness/src/server.ts:8086 | dashboard-ui /api/neuro/replays/start (apps/dashboard/app/ui/dashboard-client.tsx:1190)<br>tui /api/neuro/replays/start (apps/tui/src/index.tsx:519) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/sessions | harness | apps/harness/src/server.ts:5485 | dashboard-ui /api/neuro/sessions (apps/dashboard/app/ui/dashboard-client.tsx:751) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/neuro/sessions/:sessionId | harness | apps/harness/src/server.ts:5501 | dashboard-ui /api/neuro/sessions/:param (apps/dashboard/app/ui/dashboard-client.tsx:807) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/nodes | harness | apps/harness/src/server.ts:6212 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| DELETE | /api/nodes/:nodeId | harness | apps/harness/src/server.ts:7268 | No dashboard/TUI caller detected | Yellow | Delete route is governed server-side. Dashboard access must stay constrained to the explicit governed DELETE allowlist. |
| POST | /api/nodes/:nodeId/heartbeat | harness | apps/harness/src/server.ts:7197 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/nodes/register | harness | apps/harness/src/server.ts:6900 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/orchestration/mediate | harness | apps/harness/src/server.ts:7705 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/persistence | harness | apps/harness/src/server.ts:4956 | dashboard-ui /api/persistence (apps/dashboard/app/ui/dashboard-client.tsx:626)<br>tui /api/persistence (apps/tui/src/index.tsx:710) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/protection/posture | harness | apps/harness/src/server.ts:5259 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/q/info | harness | apps/harness/src/server.ts:5875 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| POST | /api/q/run | harness | apps/harness/src/server.ts:5922 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/replay | harness | apps/harness/src/server.ts:4930 | dashboard-ui /api/replay (apps/dashboard/app/ui/dashboard-client.tsx:741) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/snapshot | harness | apps/harness/src/server.ts:4901 | dashboard-ui /api/snapshot (apps/dashboard/app/ui/dashboard-client.tsx:909)<br>dashboard-ui /api/snapshot (apps/dashboard/app/ui/dashboard-client.tsx:1341)<br>tui /api/snapshot (apps/tui/src/index.tsx:786) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/topology | harness | apps/harness/src/server.ts:8304 | dashboard-ui /api/topology (apps/dashboard/app/ui/dashboard-client.tsx:719) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/wandb/status | harness | apps/harness/src/server.ts:5397 | dashboard-ui /api/wandb/status (apps/dashboard/app/ui/dashboard-client.tsx:684)<br>tui /api/wandb/status (apps/tui/src/index.tsx:724) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/work-governor | harness | apps/harness/src/server.ts:4897 | No dashboard/TUI caller detected | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /stream | harness | apps/harness/src/server.ts:8352 | dashboard-ui /stream (apps/dashboard/app/ui/dashboard-client.tsx:946) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /stream/actuation/device | harness | apps/harness/src/server.ts:8456 | No dashboard/TUI caller detected | Yellow | Actuation device stream has governance checks and adapter validation. It is not reachable through the dashboard websocket ticket route yet. |
| GET | /stream/neuro/live | harness | apps/harness/src/server.ts:8400 | dashboard-ui /stream/neuro/live (apps/dashboard/app/ui/dashboard-client.tsx:1279) | Yellow | Endpoint is implemented in the harness. Production readiness depends on caller coverage, governance headers, and integration tests. |
| GET | /api/q/info | q-gateway | apps/harness/src/q-gateway.ts:749 | No dashboard/TUI caller detected | Yellow | Gateway has API key authentication, rate limits, and bounded model selection. Runtime availability still depends on local Q/Ollama readiness and current benchmark restamps. |
| GET | /health | q-gateway | apps/harness/src/q-gateway.ts:723 | No dashboard/TUI caller detected | Green | Health endpoint is narrow and read-only. |
| POST | /v1/chat/completions | q-gateway | apps/harness/src/q-gateway.ts:811 | No dashboard/TUI caller detected | Yellow | Gateway has API key authentication, rate limits, and bounded model selection. Runtime availability still depends on local Q/Ollama readiness and current benchmark restamps. |
| GET | /v1/models | q-gateway | apps/harness/src/q-gateway.ts:789 | No dashboard/TUI caller detected | Yellow | Gateway has API key authentication, rate limits, and bounded model selection. Runtime availability still depends on local Q/Ollama readiness and current benchmark restamps. |

## Orphaned Or Non-UI Backend Endpoints

| Method | Route | Surface | File:line | Disposition needed |
| --- | --- | --- | --- | --- |
| POST | /api/actuation/transports/:transportId/heartbeat | harness | apps/harness/src/server.ts:7505 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/:transportId/reset | harness | apps/harness/src/server.ts:7552 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/http2/register | harness | apps/harness/src/server.ts:7447 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/serial/register | harness | apps/harness/src/server.ts:7386 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/actuation/transports/udp/register | harness | apps/harness/src/server.ts:7340 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/benchmarks/trend | harness | apps/harness/src/server.ts:5309 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/cognitive-runtime/role-plan/admission | harness | apps/harness/src/server.ts:5137 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/cognitive-runtime/role-plan/schema | harness | apps/harness/src/server.ts:5122 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/cognitive-runtime/trace-graph/admission | harness | apps/harness/src/server.ts:5165 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/cognitive-runtime/trace-graph/integrity | harness | apps/harness/src/server.ts:5229 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/cognitive-runtime/trace-graph/records | harness | apps/harness/src/server.ts:5204 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/cognitive-runtime/trace-graph/records | harness | apps/harness/src/server.ts:5178 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/cognitive-runtime/trace-graph/schema | harness | apps/harness/src/server.ts:5150 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/devices/lsl/:sourceId/stop | harness | apps/harness/src/server.ts:5667 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/devices/lsl/connect | harness | apps/harness/src/server.ts:5607 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/devices/lsl/connections | harness | apps/harness/src/server.ts:5588 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/devices/lsl/streams | harness | apps/harness/src/server.ts:5568 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/leases | harness | apps/harness/src/server.ts:6250 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/membership | harness | apps/harness/src/server.ts:6229 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/peers | harness | apps/harness/src/server.ts:6313 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| DELETE | /api/federation/peers/:peerId | harness | apps/harness/src/server.ts:7171 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/:peerId/lease-renew | harness | apps/harness/src/server.ts:7136 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/:peerId/refresh | harness | apps/harness/src/server.ts:7102 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/register | harness | apps/harness/src/server.ts:6971 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/federation/peers/sync | harness | apps/harness/src/server.ts:7038 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/private-00/leases | harness | apps/harness/src/server.ts:6292 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/federation/private-00/membership | harness | apps/harness/src/server.ts:6271 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/goals/admission | harness | apps/harness/src/server.ts:5109 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/goals/schema | harness | apps/harness/src/server.ts:5094 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/governance/decisions | harness | apps/harness/src/server.ts:5244 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/governance/policies | harness | apps/harness/src/server.ts:5016 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/governance/real-world-engagement | harness | apps/harness/src/server.ts:5046 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/governance/tool-actions | harness | apps/harness/src/server.ts:5031 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/governance/tool-actions/admission | harness | apps/harness/src/server.ts:5063 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/health | harness | apps/harness/src/server.ts:4877 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/ingest/bids/scan | harness | apps/harness/src/server.ts:7583 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/ingest/nwb/scan | harness | apps/harness/src/server.ts:8051 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence | harness | apps/harness/src/server.ts:5735 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/arbitrations | harness | apps/harness/src/server.ts:6356 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/assessments | harness | apps/harness/src/server.ts:5782 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/assessments/run | harness | apps/harness/src/server.ts:5815 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/conversations | harness | apps/harness/src/server.ts:6392 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/q/models | harness | apps/harness/src/server.ts:6524 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/q/register | harness | apps/harness/src/server.ts:6574 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/schedules | harness | apps/harness/src/server.ts:6373 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/status | harness | apps/harness/src/server.ts:5749 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/intelligence/workers | harness | apps/harness/src/server.ts:6325 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/:workerId/heartbeat | harness | apps/harness/src/server.ts:6695 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/:workerId/unregister | harness | apps/harness/src/server.ts:6804 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/assign | harness | apps/harness/src/server.ts:6834 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/intelligence/workers/register | harness | apps/harness/src/server.ts:6587 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/neuro/live/frame | harness | apps/harness/src/server.ts:8177 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/nodes | harness | apps/harness/src/server.ts:6212 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| DELETE | /api/nodes/:nodeId | harness | apps/harness/src/server.ts:7268 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/nodes/:nodeId/heartbeat | harness | apps/harness/src/server.ts:7197 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/nodes/register | harness | apps/harness/src/server.ts:6900 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/orchestration/mediate | harness | apps/harness/src/server.ts:7705 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/protection/posture | harness | apps/harness/src/server.ts:5259 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/q/info | harness | apps/harness/src/server.ts:5875 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /api/q/run | harness | apps/harness/src/server.ts:5922 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/work-governor | harness | apps/harness/src/server.ts:4897 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /stream/actuation/device | harness | apps/harness/src/server.ts:8456 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /api/q/info | q-gateway | apps/harness/src/q-gateway.ts:749 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /health | q-gateway | apps/harness/src/q-gateway.ts:723 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| POST | /v1/chat/completions | q-gateway | apps/harness/src/q-gateway.ts:811 | Classify as CLI-only, worker-only, public gateway, or product gap. |
| GET | /v1/models | q-gateway | apps/harness/src/q-gateway.ts:789 | Classify as CLI-only, worker-only, public gateway, or product gap. |

## Backend Services, Utilities, And Core Contracts

| File | Category | Exports | Exported symbols |
| --- | --- | --- | --- |
| apps/harness/src/actuation.ts | service | 20 | ActuationAdapterKind, actuationAdapterKinds, ActuationAdapterState, ActuationCapabilityHealth, ActuationCapabilityHealthState, actuationCapabilityHealthStates, ActuationDelivery, ActuationDeliveryTransport, actuationDeliveryTransports, actuationProtocolCapabilities, ActuationProtocolCapability, ActuationProtocolId, actuationProtocolIds, ActuationProtocolProfile, ActuationTransportHealthState, actuationTransportHealthStates, ActuationTransportKind, actuationTransportKinds, ActuationTransportState, createActuationManager |
| apps/harness/src/agent-intelligence-assessment.ts | utility | 4 | AgentIntelligenceAssessmentInput, AgentIntelligenceAssessmentSummary, assessAgentIntelligence, summarizeAgentIntelligenceAssessments |
| apps/harness/src/arbitration.ts | utility | 3 | buildExecutionArbitrationDecision, ExecutionArbitrationPlan, planExecutionArbitration |
| apps/harness/src/arobi-live-ledger-receipt.ts | cli-report-benchmark | 2 | isVisibleGovernedAuditEntry, versionLooksCompatible |
| apps/harness/src/benchmark-arobi-audit-integrity.ts | cli-report-benchmark | 4 | ArobiAuditIntegrityBenchmarkResult, ArobiAuditIntegrityScenarioResult, runArobiAuditIntegrityBenchmark, summarizeArobiAuditIntegrityHardware |
| apps/harness/src/benchmark-cli-flags.ts | cli-report-benchmark | 2 | BenchmarkCliFlags, parseBenchmarkCliFlags |
| apps/harness/src/benchmark-data.ts | cli-report-benchmark | 3 | ExternalNeurodataEvidence, resolveBenchmarkInputs, ResolvedBenchmarkInputs |
| apps/harness/src/benchmark-durability.ts | cli-report-benchmark | 3 | DurabilityTortureModeSummary, DurabilityTortureResult, runDurabilityTortureBenchmark |
| apps/harness/src/benchmark-gate.ts | cli-report-benchmark | 4 | BenchmarkGateResult, BenchmarkGateViolation, parseBenchmarkGatePackIds, runBenchmarkGate |
| apps/harness/src/benchmark-packs.ts | cli-report-benchmark | 5 | BenchmarkPack, benchmarkPacks, getBenchmarkPack, listBenchmarkGatePacks, listBenchmarkPacks |
| apps/harness/src/benchmark-q-gateway-substrate.ts | cli-report-benchmark | 6 | buildBenchmarkChatHeaders, QGatewaySubstrateBenchmarkControls, QGatewaySubstrateBenchmarkResult, resolveQGatewaySubstrateBenchmarkControls, runQGatewaySubstrateBenchmark, summarizeQGatewaySubstrateHardware |
| apps/harness/src/benchmark-q-mediation-drift.ts | cli-report-benchmark | 8 | buildBenchmarkChatHeaders, buildStructuredPrompt, checkHttp, QMediationDriftBenchmarkControls, QMediationDriftBenchmarkResult, resolveQMediationDriftBenchmarkControls, runQMediationDriftBenchmark, summarizeQMediationDriftHardware |
| apps/harness/src/benchmark-trend.ts | cli-report-benchmark | 6 | BenchmarkTrendPoint, BenchmarkTrendResult, BenchmarkTrendVerdict, loadAllBenchmarkTrends, loadBenchmarkTrend, loadLatestBenchmarkTrend |
| apps/harness/src/benchmark-worker-spawn.ts | cli-report-benchmark | 2 | BenchmarkWorkerSpawnPlan, buildBenchmarkWorkerSpawnPlan |
| apps/harness/src/benchmark.ts | cli-report-benchmark | 5 | loadLatestBenchmarkReportForPack, loadPublishedBenchmarkIndex, loadPublishedBenchmarkReport, loadPublishedBenchmarkReportBySuiteId, runPublishedBenchmark |
| apps/harness/src/bids.ts | service | 4 | BidsDatasetFile, BidsDatasetRecord, createDatasetRegistry, scanBidsDataset |
| apps/harness/src/bridgebench-soak.ts | cli-report-benchmark | 1 | parseSoakOptions |
| apps/harness/src/bridgebench.ts | cli-report-benchmark | 5 | BRIDGEBENCH_SCENARIOS, BridgeBenchReport, BridgeBenchRunOptions, BridgeBenchScenario, runBridgeBench |
| apps/harness/src/causal-trace-graph.ts | utility | 19 | appendCausalTraceGraphRecord, buildCausalTraceGraph, buildCausalTraceGraphAdmission, CausalTraceEdge, CausalTraceEdgeKind, causalTraceEdgeKinds, CausalTraceGraph, CausalTraceGraphAdmissionResult, causalTraceGraphContract, CausalTraceGraphIntegrityFinding, CausalTraceGraphIntegrityReport, CausalTraceGraphRecord, causalTraceGraphSchemaVersion, CausalTraceNode, CausalTraceNodeKind, causalTraceNodeKinds, inspectCausalTraceGraphLedger, inspectCausalTraceGraphRecords, readCausalTraceGraphRecords |
| apps/harness/src/cognitive-role-plan.ts | utility | 13 | buildCognitiveRolePlanAdmission, CognitivePlanStepKind, cognitivePlanStepKinds, CognitiveRoleAssignment, CognitiveRolePlan, CognitiveRolePlanAdmissionDecision, CognitiveRolePlanAdmissionResult, cognitiveRolePlanContract, CognitiveRolePlanInput, cognitiveRolePlanSchemaVersion, CognitiveRolePlanStep, CognitiveRuntimeRole, cognitiveRuntimeRoles |
| apps/harness/src/conversation.ts | service | 5 | buildAgentTurn, buildConversationObjective, buildConversationRecord, buildSessionConversationMemory, SessionConversationMemory |
| apps/harness/src/cross-project-workflow-health.ts | utility | 2 | classifyWorkflowRunForReleaseHealth, redactWorkflowRunSummariesForVisibility |
| apps/harness/src/dashboard-socket-ticket.ts | utility | 2 | DashboardSocketTicketClaims, verifyDashboardSocketTicketFromUrl |
| apps/harness/src/decision-trace.ts | utility | 8 | appendDecisionTraceMirrorRecord, appendDecisionTraceRecord, createDecisionTraceSeed, DecisionTraceIntegrityFinding, DecisionTraceIntegrityReport, DecisionTraceRecord, inspectDecisionTraceFile, inspectDecisionTraceLedger |
| apps/harness/src/federation-peers.ts | service | 7 | createFederationPeerRegistry, FederationLeaseRecoveryMode, FederationPeerRecord, FederationPeerRepairStatus, FederationPeerStatus, FederationPeerView, smoothObservedLatency |
| apps/harness/src/federation-pressure.ts | service | 6 | buildFederatedExecutionPressure, FederatedExecutionPressure, FederatedExecutionPressureWorkerView, IntelligencePeerExecutionOutcomeSummary, IntelligenceWorkerExecutionOutcomeSummary, summarizeRemoteExecutionOutcomes |
| apps/harness/src/federation.ts | service | 27 | assertFederationPrivate00ExportClaim, assertFederationPublicExportClaim, buildFederationKeyId, classifyFederationWorkerLane, FederationExportClass, federationExportClasses, FederationLane, federationLanes, FederationNodeIdentityPayload, FederationNodeLeasePayload, FederationSignatureAlgorithm, federationSignatureAlgorithms, FederationSignedEnvelope, FederationVisibilityClaim, FederationWorkerIdentityPayload, FederationWorkerLeasePayload, hasPrivateFederationLaneMarker, isPublicFederationEndpoint, normalizeFederationControlPlaneUrl, PRIVATE_00_FEDERATION_LEASE_EXPORT_CLASS, PRIVATE_00_FEDERATION_MEMBERSHIP_EXPORT_CLASS, PUBLIC_FEDERATION_LEASE_EXPORT_CLASS, PUBLIC_FEDERATION_MEMBERSHIP_EXPORT_CLASS, resolveFederationSecret, sanitizePublicFederationTags, signFederationPayload, verifyFederationEnvelope |
| apps/harness/src/github-checks-receipt.ts | cli-report-benchmark | 1 | fetchGitHubJson |
| apps/harness/src/goal-state.ts | utility | 14 | buildGovernedGoalAdmission, evaluateGovernedGoalAdmission, GoalAuthorityScope, GoalStatus, goalStatuses, GovernedGoal, GovernedGoalAdmissionDecision, GovernedGoalAdmissionResult, GovernedGoalParseResult, governedGoalSchemaVersion, governedGoalStateContract, GovernedGoalTransitionDecision, parseGovernedGoalInput, transitionGovernedGoal |
| apps/harness/src/governance.ts | service | 8 | createGovernanceRegistry, evaluateGovernance, GovernanceAction, governanceActions, GovernanceBinding, GovernanceDecision, GovernancePolicy, GovernanceStatus |
| apps/harness/src/harbor-soak.ts | utility | 7 | HarborSoakAgentKind, HarborSoakReport, HarborSoakRunRecord, HarborSoakStatSummary, HarborSoakTaskSpec, HarborSoakTaskSummary, runHarborSoak |
| apps/harness/src/intelligence-status.ts | utility | 3 | buildPublicIntelligenceStatus, PublicIntelligenceStatus, PublicIntelligenceStatusInput |
| apps/harness/src/live-mission-readiness.ts | utility | 4 | ArobiMissionTreasuryStatus, describeLedgerPrivate, isArobiGovernanceTreasuryReady, resolveArobiLocalPrivateReadiness |
| apps/harness/src/live-neuro.ts | utility | 3 | buildLiveNeuroFrame, createLiveNeuroManager, LiveNeuroPayload |
| apps/harness/src/live-operator-public-export.ts | utility | 3 | buildPublicExportTruthBoundary, evaluatePublicExportSourceFreshness, resolvePublicExportPublication |
| apps/harness/src/local-worker-heartbeat.ts | utility | 1 | resolveLocalWorkerHeartbeatIntervalMs |
| apps/harness/src/lsl-adapter.ts | utility | 8 | createLslAdapterManager, LslAdapterCallbacks, LslAdapterManager, LslBridgeConnection, LslBridgeState, LslConnectOptions, LslDiscoveryResult, LslStreamDescriptor |
| apps/harness/src/model-comparison.ts | utility | 3 | ModelComparisonReport, resolveModelComparisonTimeoutMs, runModelComparison |
| apps/harness/src/neuro-bands.ts | utility | 3 | collapseSampleRows, extractBandPower, SpectralBandPower |
| apps/harness/src/neuro-replay-options.ts | utility | 3 | NormalizedReplayOptions, normalizeNeuroReplayOptions, StartReplayOptions |
| apps/harness/src/neuro-replay.ts | utility | 1 | createNeuroReplayManager |
| apps/harness/src/node-registry.ts | service | 5 | createNodeRegistry, NodeDescriptor, NodeHealthStatus, NodeRegistrySummary, NodeView |
| apps/harness/src/nwb.ts | service | 6 | buildNwbReplayFrames, createNeuroRegistry, loadNwbReplaySource, NwbReplaySource, NwbSessionRecord, scanNwbFile |
| apps/harness/src/oci-iam-bridge.ts | utility | 1 | runOciIamBridgeResponsesCompletion |
| apps/harness/src/ollama.ts | service | 16 | buildImmaculatePrompt, discoverPreferredOllamaLayer, listOllamaModels, OllamaChatCompletionResult, OllamaChatMessage, OllamaExecutionResult, OllamaFailureClass, parseStructuredJsonResponse, parseStructuredResponse, prewarmOllamaModel, QGenerateFastOptions, renderStructuredResponseContract, resolveQGenerateFastOptions, runOllamaChatCompletion, runOllamaExecution, runOllamaGenerateCompletion |
| apps/harness/src/openai-compatible.ts | utility | 4 | buildOpenAICompatibleRequestUrl, buildOpenAICompatibleResponsesBody, extractOpenAICompatibleResponseText, runOpenAICompatibleResponsesCompletion |
| apps/harness/src/parallel-engine.ts | utility | 3 | buildParallelFormation, ParallelFormation, ParallelFormationMode |
| apps/harness/src/persistence.ts | service | 3 | CheckpointMetadata, createPersistence, PersistenceStatus |
| apps/harness/src/protection-intelligence.ts | utility | 11 | deriveProtectionPosture, deriveProtectionPressure, mergeProtectionPressure, projectProtectionPostureForQ, ProtectionPosture, ProtectionPostureInput, ProtectionPostureSummary, ProtectionPressure, ProtectionSeverity, ProtectionSignal, ProtectionSignalKind |
| apps/harness/src/q-api-auth.ts | service | 8 | createQApiKeyRegistry, defaultQApiKeysPath, normalizeQApiRateLimitPolicy, QApiAuthenticatedKey, QApiKeyCreationResult, QApiKeyMetadata, QApiKeyScope, QApiRateLimitPolicy |
| apps/harness/src/q-foundation.ts | service | 4 | expandQModelSearchText, matchQModelCandidate, QModelFoundationSpecification, resolveQFoundationSpecification |
| apps/harness/src/q-gateway-validate.ts | cli-report-benchmark | 15 | buildQGatewayValidationHeaders, captureHttpCheck, checkHttp, DEFAULT_Q_GATEWAY_HTTP_TIMEOUT_MS, DEFAULT_Q_GATEWAY_LOCAL_Q_TIMEOUT_MS, hasOpenGatewayCircuit, HttpCheck, isQGatewayValidationAccepted, isRetryableDirectQFoundationSmoke, isRetryableGatewaySmokeCheck, QGatewayValidationReport, QGatewayValidationWriteResult, resolveQGatewayValidationTimeoutMs, shouldRunDirectQFoundationSmokeAfterGateway, writeQGatewayValidationReport |
| apps/harness/src/q-inference-profile.ts | service | 8 | PublicQInferenceProfile, QInferenceAuthMode, QInferenceProfile, QInferenceProvider, QOciIamBridgeProfile, redactQInferenceProfile, resolveQInferenceProfile, resolveQInferenceProvider |
| apps/harness/src/q-local-model.ts | service | 4 | buildQLocalModelfile, QLocalModelSpecification, resolveQLocalModelSpecification, resolveQLocalOllamaUrl |
| apps/harness/src/q-model.ts | service | 30 | buildCanonicalQIdentityAnswer, buildQRuntimeContext, canonicalizeQIdentityAnswer, detectQIdentityQuestion, displayModelName, foundationModelLabel, getArobiNetworkName, getArobiOperatingModelSummary, getCausalTracePolicySummary, getCognitiveRolePolicySummary, getGovernedGoalPolicySummary, getGovernedToolPolicySummary, getImmaculateHarnessName, getQDeveloperName, getQFoundationModelName, getQIdentityInstruction, getQIdentitySummary, getQImmaculateRelationshipSummary, getQLeadName, getQModelName, getQModelTarget, getQRuntimeContextInstruction, isQModelName, isQTargetModel, matchesModelReference, QIdentityQuestionKind, QRuntimeContext, resolveQModel, truthfulModelLabel, vendorForModel |
| apps/harness/src/q-orchestration-context.ts | service | 2 | QOrchestrationContext, resolveQOrchestrationContext |
| apps/harness/src/q-rate-limit.ts | service | 3 | createQRateLimiter, RateLimitGrant, RateLimitRejection |
| apps/harness/src/q-release-gate.ts | cli-report-benchmark | 11 | DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS, describeQGatewayContractReasons, describeSourceFreshnessReason, QGatewayContractSummary, QGatewayValidationReport, QReadinessGateReport, QReadinessGateWriteResult, resolveQReadinessMaxSourceAgeMs, selectLatestQGatewayValidationReport, summarizeQGatewayContract, writeQReadinessGateReport |
| apps/harness/src/q-resilience.ts | service | 4 | CircuitSnapshot, CircuitState, createFailureCircuitBreaker, shouldRecordQGatewayCircuitFailure |
| apps/harness/src/real-world-engagement.ts | utility | 6 | classifyRealWorldEngagement, evaluateRealWorldEngagement, RealWorldEngagementDecision, RealWorldEngagementEvidence, RealWorldEngagementMode, RealWorldEngagementProfile |
| apps/harness/src/release-metadata.ts | cli-report-benchmark | 9 | HarnessReadinessLane, HarnessReadinessSummary, QHybridTrainingSessionSummary, QTrainingLockSummary, ReleaseMetadata, resetReleaseMetadataCacheForTests, resolveHarnessReadiness, ResolveHarnessReadinessOptions, resolveReleaseMetadata |
| apps/harness/src/release-surface.ts | cli-report-benchmark | 5 | DEFAULT_RELEASE_SURFACE_MAX_AGE_MS, evaluateReleaseSurfaceEvidence, inferSurfaceHealth, renderReleaseAccountabilityGapLines, SurfaceTimestamp |
| apps/harness/src/roundtable-runtime.ts | cli-report-benchmark | 10 | buildRoundtableMediationHeaders, buildRoundtableMediationRequestBody, resolveRoundtableOllamaUrl, resolveRoundtableRuntimeTimeoutControls, resolveRoundtableSharedQFallbackAllowed, RoundtableRuntimeSurface, RoundtableRuntimeTimeoutControls, shouldAbortRoundtableRuntimeAfterPrewarm, shouldAttemptRoundtableSharedQFallback, writeRoundtableRuntimeCanonicalReport |
| apps/harness/src/roundtable.ts | cli-report-benchmark | 11 | appendRoundtableExecutionSummary, buildRoundtableActionPlan, cleanupRoundtableActionWorktree, collectRoundtableRepoAuditFindings, discoverRoundtableProjects, materializeRoundtableActionExecutionArtifacts, materializeRoundtableActionWorktree, probeRoundtableActionWorkspace, resolveRoundtableRepoRoot, RoundtableActionWorkspaceProbe, RoundtablePlan |
| apps/harness/src/routing.ts | service | 4 | AdaptiveRoutePlan, buildRoutingDecision, deriveGovernancePressure, planAdaptiveRoute |
| apps/harness/src/scheduling.ts | utility | 5 | buildExecutionScheduleDecision, ExecutionSchedulePlan, isParallelScheduleMode, planExecutionSchedule, preferredScheduleRoles |
| apps/harness/src/startup-banner.ts | utility | 2 | emitHarnessStartupBanner, StartupBannerOptions |
| apps/harness/src/startup-trace.ts | utility | 1 | resolveStartupTracePath |
| apps/harness/src/temporal-activities.ts | utility | 6 | commitEnvelope, ingest, processEnvelope, TemporalBaselineEnvelope, TemporalBaselinePayload, verifyEnvelope |
| apps/harness/src/temporal-baseline.ts | utility | 2 | runTemporalBaselineComparison, TemporalBaselineComparison |
| apps/harness/src/temporal-workflow.ts | utility | 1 | immaculateTemporalBaselineWorkflow |
| apps/harness/src/tool-governance.ts | service | 15 | evaluateToolRiskAdmission, getGovernedToolAction, GovernedToolAction, listGovernedToolActions, riskClassForTier, ToolRiskAdmissionDecision, ToolRiskAdmissionInput, ToolRiskClass, ToolRiskRateLimit, toolRiskRateLimits, toolRiskRequiresApproval, toolRiskRequiresConsent, toolRiskRequiresHumanApproval, ToolRiskTier, toolRiskTiers |
| apps/harness/src/training-data.ts | cli-report-benchmark | 3 | createTrainingCorpusRegistry, curateTrainingCorpus, loadTrainingCorpusManifest |
| apps/harness/src/utils.ts | utility | 9 | getAllowedDataRoot, getAllowedDataRoots, getLocalVenvPythonPath, hashValue, resolvePathWithinAllowedRoot, safeUnlink, sha256Hash, sha256Json, stableStringify |
| apps/harness/src/visibility.ts | utility | 23 | deriveVisibilityScope, projectActuationOutput, projectCognitiveExecution, projectConversation, projectDatasetRecord, projectDatasetSummary, projectEventEnvelope, projectExecutionSchedule, projectIntelligenceLayer, projectNeuroFrameWindow, projectNeuroSessionRecord, projectNeuroSessionSummary, projectPhaseSnapshot, redactActuationOutput, redactCognitiveExecution, redactDatasetSummary, redactExecutionSchedule, redactNeuroFrameWindow, redactNeuroSessionSummary, redactNeuroStreamSummary, redactPhaseSnapshot, summarizeEventEnvelope, VisibilityScope |
| apps/harness/src/wandb.ts | cli-report-benchmark | 7 | exportBenchmarkResultsFromWandb, inspectWandbStatus, publishBenchmarkToWandb, WandbBenchmarkExportResult, WandbMode, WandbPublicationResult, WandbStatus |
| apps/harness/src/work-governor.ts | utility | 4 | createWorkGovernor, WorkGovernorGrant, WorkGovernorRequest, WorkGovernorSnapshot |
| apps/harness/src/workers.ts | service | 8 | createIntelligenceWorkerRegistry, IntelligenceWorkerAssignment, IntelligenceWorkerAssignmentRequest, IntelligenceWorkerExecutionProfile, IntelligenceWorkerHealthStatus, IntelligenceWorkerRecord, IntelligenceWorkerSummary, IntelligenceWorkerView |
| packages/core/src/index.ts | core-contract | 190 | ActuationChannel, actuationChannels, ActuationOutput, actuationOutputSchema, ActuationOutputSource, actuationOutputSources, ActuationOutputStatus, actuationOutputStatuses, AgentIntelligenceAssessment, AgentIntelligenceAssessmentGrade, agentIntelligenceAssessmentGrades, agentIntelligenceAssessmentSchema, AgentIntelligenceAssessmentTrigger, agentIntelligenceAssessmentTriggers, AgentIntelligenceAssessmentVerdict, agentIntelligenceAssessmentVerdicts, AgentIntelligenceScorecard, agentIntelligenceScorecardSchema, AgentTurn, agentTurnSchema, AgentWorkspaceIsolationMode, agentWorkspaceIsolationModes, AgentWorkspaceScope, agentWorkspaceWriteAuthorities, AgentWorkspaceWriteAuthority, ArobiNetworkExportScope, arobiNetworkExportScopes, ArobiNetworkLaneId, arobiNetworkLaneIds, ArobiNetworkLanePolicy, arobiNetworkLanePolicySchema, ArobiNetworkRetentionClass, arobiNetworkRetentionClasses, arobiNetworkTrainingPolicies, ArobiNetworkTrainingPolicy, BenchmarkArobiAuditScenarioResult, BenchmarkAssertion, BenchmarkAttribution, BenchmarkComparison, BenchmarkDelta, BenchmarkHardwareContext, BenchmarkIndex, BenchmarkIndexEntry, benchmarkIndexSchema, BenchmarkMediationDriftScenarioResult, BenchmarkPackId, benchmarkPackIds, BenchmarkProgress, BenchmarkPublication, BenchmarkReport, benchmarkReportSchema, BenchmarkRunKind, benchmarkRunKinds, BenchmarkSeries, CognitiveExecution, cognitiveExecutionSchema, ConnectomeEdge, ConnectomeNode, ControlAction, controlActions, ControlEnvelope, controlEnvelopeSchema, createEngine, datasetModalities, DatasetModality, DatasetModalitySummary, datasetSummarySchema, defaultArobiNetworkLanePolicy, EngineDurableState, engineDurableStateSchema, EventEnvelope, eventEnvelopeSchema, ExecutionAdmissionState, executionAdmissionStates, ExecutionArbitration, ExecutionArbitrationMode, executionArbitrationModes, executionArbitrationSchema, ExecutionParallelAffinityMode, executionParallelAffinityModes, ExecutionParallelBackpressureAction, executionParallelBackpressureActions, ExecutionParallelDeadlineClass, executionParallelDeadlineClasses, ExecutionParallelFormationMode, executionParallelFormationModes, ExecutionSchedule, ExecutionScheduleMode, executionScheduleModes, executionScheduleSchema, executionTopologies, ExecutionTopology, formatPercent, GovernancePressureLevel, governancePressureLevels, GuardVerdict, guardVerdicts, IngestedDatasetSummary, inspectDurableState, IntegrityFinding, IntegrityReport, integrityReportSchema, IntelligenceLayer, IntelligenceLayerBackend, intelligenceLayerBackends, IntelligenceLayerRole, intelligenceLayerRoles, intelligenceLayerSchema, IntelligenceLayerStatus, intelligenceLayerStatuses, MultiAgentConversation, multiAgentConversationSchema, NeuralCouplingState, neuralCouplingStateSchema, NeuroBand, NeuroBandPower, neuroBandPowerSchema, neuroBands, NeuroFrameWindow, neuroFrameWindowSchema, NeuroIngressSource, neuroIngressSources, NeuroReplayState, neuroReplayStateSchema, NeuroReplayStatus, neuroReplayStatuses, NeuroSessionSummary, neuroSessionSummarySchema, NeuroStreamKind, neuroStreamKinds, NeuroStreamSummary, NodeKind, nodeKinds, OrchestrationPlane, orchestrationPlanes, PassState, passStates, PhaseId, phaseIds, PhaseMetrics, PhasePass, PhaseSnapshot, phaseSnapshotSchema, planeColor, rebuildDurableStateFromEvents, resolveArobiNetworkLanePolicy, RoundtableAction, RoundtableActionStatus, roundtableActionStatuses, RoundtableExecutionArtifact, RoundtableExecutionArtifactStatus, roundtableExecutionArtifactStatuses, RoutingDecision, RoutingDecisionMode, routingDecisionModes, routingDecisionSchema, RoutingDecisionSource, routingDecisionSources, SessionConversationSummary, sessionConversationSummarySchema, SnapshotHistoryPoint, snapshotHistoryPointSchema, STABILITY_POLE, TrainingCorpusCurationStatus, trainingCorpusCurationStatuses, TrainingCorpusFileRecord, trainingCorpusFileRecordSchema, TrainingCorpusLicenseDecision, trainingCorpusLicenseDecisions, TrainingCorpusManifest, trainingCorpusManifestSchema, TrainingCorpusOutputShard, trainingCorpusOutputShardSchema, TrainingCorpusPolicy, trainingCorpusPolicySchema, TrainingCorpusRun, trainingCorpusRunSchema, TrainingCorpusRunSummary, trainingCorpusRunSummarySchema, TrainingCorpusSecretScanStatus, trainingCorpusSecretScanStatuses, TrainingCorpusSourceHost, trainingCorpusSourceHosts, TrainingCorpusSourceKind, trainingCorpusSourceKinds, TrainingCorpusSourceManifest, trainingCorpusSourceManifestSchema, TrainingCorpusSourceSummary, trainingCorpusSourceSummarySchema, Vec3 |

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
| apps/harness/src/arobi-live-ledger-receipt.ts | 270 | readFile | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 281 | readdir | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 473 | mkdir | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 474 | writeFile | evidence-output |
| apps/harness/src/arobi-live-ledger-receipt.ts | 475 | writeFile | evidence-output |
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
| apps/harness/src/benchmark-q-gateway-substrate.ts | 508 | mkdir | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 5 | node:fs | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 6 | node:fs | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 7 | mkdir | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 7 | node:fs/promises | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 1022 | mkdir | evidence-output |
| apps/harness/src/benchmark-q-mediation-drift.ts | 1023 | mkdir | evidence-output |
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
| apps/harness/src/bridgebench-soak.ts | 335 | mkdir | file-utility |
| apps/harness/src/bridgebench-soak.ts | 445 | writeFile | file-utility |
| apps/harness/src/bridgebench-soak.ts | 446 | writeFile | file-utility |
| apps/harness/src/bridgebench.ts | 3 | mkdir | file-utility |
| apps/harness/src/bridgebench.ts | 3 | writeFile | file-utility |
| apps/harness/src/bridgebench.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/bridgebench.ts | 137 | access | file-utility |
| apps/harness/src/bridgebench.ts | 349 | mkdir | file-utility |
| apps/harness/src/bridgebench.ts | 394 | writeFile | file-utility |
| apps/harness/src/bridgebench.ts | 395 | writeFile | file-utility |
| apps/harness/src/causal-trace-graph.test.ts | 2 | rm | file-utility |
| apps/harness/src/causal-trace-graph.test.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/causal-trace-graph.test.ts | 145 | rm | file-utility |
| apps/harness/src/causal-trace-graph.ts | 2 | mkdir | file-utility |
| apps/harness/src/causal-trace-graph.ts | 2 | open | file-utility |
| apps/harness/src/causal-trace-graph.ts | 2 | readFile | file-utility |
| apps/harness/src/causal-trace-graph.ts | 2 | unlink | file-utility |
| apps/harness/src/causal-trace-graph.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/causal-trace-graph.ts | 168 | open | file-utility |
| apps/harness/src/causal-trace-graph.ts | 170 | stat | file-utility |
| apps/harness/src/causal-trace-graph.ts | 204 | mkdir | file-utility |
| apps/harness/src/causal-trace-graph.ts | 210 | open | file-utility |
| apps/harness/src/causal-trace-graph.ts | 226 | unlink | file-utility |
| apps/harness/src/causal-trace-graph.ts | 235 | open | file-utility |
| apps/harness/src/causal-trace-graph.ts | 237 | writeFile | file-utility |
| apps/harness/src/causal-trace-graph.ts | 524 | readFile | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 2 | mkdir | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 2 | writeFile | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 75 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 376 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 414 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 414 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 512 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 520 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 586 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 586 | access | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 597 | mkdir | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 598 | writeFile | file-utility |
| apps/harness/src/cross-project-workflow-health.ts | 599 | writeFile | file-utility |
| apps/harness/src/decision-trace.ts | 2 | mkdir | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | readFile | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | unlink | runtime-state |
| apps/harness/src/decision-trace.ts | 2 | node:fs/promises | runtime-state |
| apps/harness/src/decision-trace.ts | 122 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 124 | stat | runtime-state |
| apps/harness/src/decision-trace.ts | 157 | mkdir | runtime-state |
| apps/harness/src/decision-trace.ts | 163 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 179 | unlink | runtime-state |
| apps/harness/src/decision-trace.ts | 185 | open | runtime-state |
| apps/harness/src/decision-trace.ts | 187 | writeFile | runtime-state |
| apps/harness/src/decision-trace.ts | 279 | readFile | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | mkdir | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | readFile | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | rename | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | writeFile | runtime-state |
| apps/harness/src/federation-peers.ts | 3 | node:fs/promises | runtime-state |
| apps/harness/src/federation-peers.ts | 85 | readFile | runtime-state |
| apps/harness/src/federation-peers.ts | 96 | mkdir | runtime-state |
| apps/harness/src/federation-peers.ts | 99 | writeFile | runtime-state |
| apps/harness/src/federation-peers.ts | 100 | rename | runtime-state |
| apps/harness/src/federation.test.ts | 4 | node:fs | file-utility |
| apps/harness/src/github-checks-receipt.ts | 2 | mkdir | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 2 | writeFile | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 387 | mkdir | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 388 | writeFile | evidence-output |
| apps/harness/src/github-checks-receipt.ts | 389 | writeFile | evidence-output |
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
| apps/harness/src/live-mission-readiness.ts | 159 | readFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 167 | readFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 593 | mkdir | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 594 | writeFile | evidence-output |
| apps/harness/src/live-mission-readiness.ts | 595 | writeFile | evidence-output |
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
| apps/harness/src/live-operator-public-export.ts | 801 | mkdir | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 802 | writeFile | evidence-output |
| apps/harness/src/live-operator-public-export.ts | 803 | writeFile | evidence-output |
| apps/harness/src/lsl-adapter.ts | 6 | node:fs | file-utility |
| apps/harness/src/model-comparison.ts | 3 | mkdir | file-utility |
| apps/harness/src/model-comparison.ts | 3 | writeFile | file-utility |
| apps/harness/src/model-comparison.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/model-comparison.ts | 199 | access | file-utility |
| apps/harness/src/model-comparison.ts | 570 | mkdir | file-utility |
| apps/harness/src/model-comparison.ts | 571 | writeFile | file-utility |
| apps/harness/src/model-comparison.ts | 572 | writeFile | file-utility |
| apps/harness/src/neuro-stream-engagement-contract.test.ts | 2 | readFile | file-utility |
| apps/harness/src/neuro-stream-engagement-contract.test.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/neuro-stream-engagement-contract.test.ts | 6 | readFile | file-utility |
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
| apps/harness/src/oci-iam-bridge.test.ts | 2 | rm | file-utility |
| apps/harness/src/oci-iam-bridge.test.ts | 2 | writeFile | file-utility |
| apps/harness/src/oci-iam-bridge.test.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/oci-iam-bridge.test.ts | 14 | writeFile | file-utility |
| apps/harness/src/oci-iam-bridge.test.ts | 17 | node:fs | file-utility |
| apps/harness/src/oci-iam-bridge.test.ts | 32 | writeFile | file-utility |
| apps/harness/src/oci-iam-bridge.test.ts | 65 | rm | file-utility |
| apps/harness/src/oci-iam-bridge.ts | 2 | rm | file-utility |
| apps/harness/src/oci-iam-bridge.ts | 2 | writeFile | file-utility |
| apps/harness/src/oci-iam-bridge.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/oci-iam-bridge.ts | 120 | rm | file-utility |
| apps/harness/src/oci-iam-bridge.ts | 148 | writeFile | file-utility |
| apps/harness/src/ollama.ts | 561 | access | file-utility |
| apps/harness/src/ollama.ts | 614 | access | file-utility |
| apps/harness/src/ollama.ts | 644 | access | file-utility |
| apps/harness/src/ollama.ts | 752 | access | file-utility |
| apps/harness/src/ollama.ts | 874 | access | file-utility |
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
| apps/harness/src/q-gateway-validate.test.ts | 2 | node:fs | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 3 | readFile | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 3 | rm | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 3 | node:fs/promises | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 80 | open | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 103 | open | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 122 | open | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 126 | open | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 389 | readFile | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 392 | rm | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 411 | readFile | evidence-output |
| apps/harness/src/q-gateway-validate.test.ts | 417 | rm | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 3 | node:fs | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 4 | appendFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 4 | mkdir | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 4 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 4 | node:fs/promises | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 541 | open | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 687 | mkdir | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 688 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 689 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 700 | mkdir | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 701 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 702 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 736 | mkdir | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 737 | writeFile | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 746 | mkdir | evidence-output |
| apps/harness/src/q-gateway-validate.ts | 747 | appendFile | evidence-output |
| apps/harness/src/q-inference-profile.test.ts | 3 | node:fs | file-utility |
| apps/harness/src/q-inference-profile.ts | 1 | node:fs | file-utility |
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
| apps/harness/src/q-orchestration-context.ts | 135 | readFile | file-utility |
| apps/harness/src/q-release-gate.test.ts | 2 | node:fs | evidence-output |
| apps/harness/src/q-release-gate.test.ts | 3 | readFile | evidence-output |
| apps/harness/src/q-release-gate.test.ts | 3 | rm | evidence-output |
| apps/harness/src/q-release-gate.test.ts | 3 | node:fs/promises | evidence-output |
| apps/harness/src/q-release-gate.test.ts | 188 | readFile | evidence-output |
| apps/harness/src/q-release-gate.test.ts | 191 | rm | evidence-output |
| apps/harness/src/q-release-gate.test.ts | 209 | readFile | evidence-output |
| apps/harness/src/q-release-gate.test.ts | 215 | rm | evidence-output |
| apps/harness/src/q-release-gate.ts | 2 | mkdir | evidence-output |
| apps/harness/src/q-release-gate.ts | 2 | readFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 2 | writeFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/q-release-gate.ts | 127 | readFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 236 | mkdir | evidence-output |
| apps/harness/src/q-release-gate.ts | 237 | writeFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 238 | writeFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 249 | mkdir | evidence-output |
| apps/harness/src/q-release-gate.ts | 250 | writeFile | evidence-output |
| apps/harness/src/q-release-gate.ts | 251 | writeFile | evidence-output |
| apps/harness/src/q-resilience.ts | 1 | open | file-utility |
| apps/harness/src/q-resilience.ts | 1 | open | file-utility |
| apps/harness/src/q-resilience.ts | 53 | open | file-utility |
| apps/harness/src/q-resilience.ts | 62 | open | file-utility |
| apps/harness/src/q-resilience.ts | 86 | open | file-utility |
| apps/harness/src/q-resilience.ts | 87 | open | file-utility |
| apps/harness/src/release-metadata.test.ts | 2 | node:fs | file-utility |
| apps/harness/src/release-metadata.ts | 2 | node:fs | file-utility |
| apps/harness/src/release-metadata.ts | 3 | readdir | file-utility |
| apps/harness/src/release-metadata.ts | 3 | readFile | file-utility |
| apps/harness/src/release-metadata.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/release-metadata.ts | 358 | readFile | file-utility |
| apps/harness/src/release-metadata.ts | 410 | readdir | file-utility |
| apps/harness/src/release-surface.ts | 2 | mkdir | evidence-output |
| apps/harness/src/release-surface.ts | 2 | readFile | evidence-output |
| apps/harness/src/release-surface.ts | 2 | writeFile | evidence-output |
| apps/harness/src/release-surface.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/release-surface.ts | 552 | readFile | evidence-output |
| apps/harness/src/release-surface.ts | 571 | readFile | evidence-output |
| apps/harness/src/release-surface.ts | 718 | mkdir | evidence-output |
| apps/harness/src/release-surface.ts | 719 | writeFile | evidence-output |
| apps/harness/src/release-surface.ts | 720 | writeFile | evidence-output |
| apps/harness/src/roundtable-actionability.ts | 2 | mkdir | file-utility |
| apps/harness/src/roundtable-actionability.ts | 2 | writeFile | file-utility |
| apps/harness/src/roundtable-actionability.ts | 2 | node:fs/promises | file-utility |
| apps/harness/src/roundtable-actionability.ts | 147 | mkdir | file-utility |
| apps/harness/src/roundtable-actionability.ts | 148 | writeFile | file-utility |
| apps/harness/src/roundtable-actionability.ts | 149 | writeFile | file-utility |
| apps/harness/src/roundtable-discovery.test.ts | 2 | node:fs | file-utility |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 2 | readFile | evidence-output |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 2 | rm | evidence-output |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 2 | node:fs/promises | evidence-output |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 129 | readFile | evidence-output |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 131 | readFile | evidence-output |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 139 | rm | evidence-output |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 154 | rm | evidence-output |
| apps/harness/src/roundtable-runtime.ts | 7 | node:fs | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | appendFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | writeFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 8 | node:fs/promises | file-utility |
| apps/harness/src/roundtable-runtime.ts | 411 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 412 | writeFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 416 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 417 | appendFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 1831 | writeFile | file-utility |
| apps/harness/src/roundtable-runtime.ts | 1857 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 1858 | mkdir | file-utility |
| apps/harness/src/roundtable-runtime.ts | 1859 | mkdir | file-utility |
| apps/harness/src/roundtable-worktree-lifecycle.test.ts | 3 | node:fs | file-utility |
| apps/harness/src/roundtable.ts | 2 | node:fs | file-utility |
| apps/harness/src/roundtable.ts | 3 | mkdir | file-utility |
| apps/harness/src/roundtable.ts | 3 | readFile | file-utility |
| apps/harness/src/roundtable.ts | 3 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/roundtable.ts | 437 | readFile | file-utility |
| apps/harness/src/roundtable.ts | 866 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 885 | mkdir | file-utility |
| apps/harness/src/roundtable.ts | 994 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 995 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 1000 | writeFile | file-utility |
| apps/harness/src/roundtable.ts | 1002 | mkdir | file-utility |
| apps/harness/src/roundtable.ts | 1003 | writeFile | file-utility |
| apps/harness/src/server.ts | 3 | appendFile | file-utility |
| apps/harness/src/server.ts | 3 | mkdir | file-utility |
| apps/harness/src/server.ts | 3 | node:fs/promises | file-utility |
| apps/harness/src/server.ts | 206 | mkdir | file-utility |
| apps/harness/src/server.ts | 207 | appendFile | file-utility |
| apps/harness/src/server.ts | 767 | mkdir | file-utility |
| apps/harness/src/server.ts | 768 | appendFile | file-utility |
| apps/harness/src/server.ts | 8535 | open | file-utility |
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
| apps/harness/src/training-data.test.ts | 2 | mkdir | runtime-state |
| apps/harness/src/training-data.test.ts | 2 | writeFile | runtime-state |
| apps/harness/src/training-data.test.ts | 2 | node:fs/promises | runtime-state |
| apps/harness/src/training-data.test.ts | 35 | mkdir | runtime-state |
| apps/harness/src/training-data.test.ts | 36 | writeFile | runtime-state |
| apps/harness/src/training-data.test.ts | 41 | writeFile | runtime-state |
| apps/harness/src/training-data.test.ts | 42 | writeFile | runtime-state |
| apps/harness/src/training-data.test.ts | 43 | writeFile | runtime-state |
| apps/harness/src/training-data.test.ts | 46 | writeFile | runtime-state |
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
| apps/harness/src/training-data.ts | 483 | readdir | runtime-state |
| apps/harness/src/training-data.ts | 588 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 622 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 672 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 835 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 836 | writeFile | runtime-state |
| apps/harness/src/training-data.ts | 866 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 879 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 986 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 1032 | mkdir | runtime-state |
| apps/harness/src/training-data.ts | 1059 | readFile | runtime-state |
| apps/harness/src/training-data.ts | 1073 | readFile | runtime-state |
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
| apps/dashboard/app/api/operator/harness/[...path]/route.test.ts | 1 |
| apps/dashboard/app/lib/operator-auth.test.ts | 1 |
| apps/harness/src/agent-intelligence-assessment.test.ts | 3 |
| apps/harness/src/arobi-live-ledger-receipt.test.ts | 4 |
| apps/harness/src/benchmark-cli-flags.test.ts | 5 |
| apps/harness/src/benchmark-q-gateway-substrate.test.ts | 2 |
| apps/harness/src/benchmark-q-mediation-drift.test.ts | 5 |
| apps/harness/src/benchmark-worker-spawn.test.ts | 2 |
| apps/harness/src/bridgebench-soak.test.ts | 4 |
| apps/harness/src/causal-trace-graph.test.ts | 5 |
| apps/harness/src/cognitive-role-plan.test.ts | 6 |
| apps/harness/src/core-durable-state.test.ts | 1 |
| apps/harness/src/cross-project-workflow-health.test.ts | 4 |
| apps/harness/src/dashboard-socket-ticket.test.ts | 3 |
| apps/harness/src/durable-state-window.test.ts | 1 |
| apps/harness/src/federation.test.ts | 7 |
| apps/harness/src/github-checks-receipt.test.ts | 1 |
| apps/harness/src/goal-state.test.ts | 7 |
| apps/harness/src/governance.test.ts | 4 |
| apps/harness/src/intelligence-status.test.ts | 3 |
| apps/harness/src/live-mission-readiness.test.ts | 2 |
| apps/harness/src/live-operator-public-export.test.ts | 5 |
| apps/harness/src/local-worker-heartbeat.test.ts | 3 |
| apps/harness/src/model-comparison.test.ts | 1 |
| apps/harness/src/neuro-replay.test.ts | 2 |
| apps/harness/src/neuro-stream-engagement-contract.test.ts | 3 |
| apps/harness/src/oci-iam-bridge.test.ts | 1 |
| apps/harness/src/ollama.test.ts | 3 |
| apps/harness/src/openai-compatible.test.ts | 4 |
| apps/harness/src/protection-intelligence.test.ts | 3 |
| apps/harness/src/q-gateway-validate.test.ts | 11 |
| apps/harness/src/q-inference-profile.test.ts | 8 |
| apps/harness/src/q-model.test.ts | 6 |
| apps/harness/src/q-release-gate.test.ts | 6 |
| apps/harness/src/q-resilience.test.ts | 1 |
| apps/harness/src/real-world-engagement.test.ts | 5 |
| apps/harness/src/release-metadata.test.ts | 1 |
| apps/harness/src/release-surface.test.ts | 11 |
| apps/harness/src/roundtable-discovery.test.ts | 3 |
| apps/harness/src/roundtable-runtime-canonical-report.test.ts | 9 |
| apps/harness/src/roundtable-worktree-lifecycle.test.ts | 6 |
| apps/harness/src/startup-trace.test.ts | 2 |
| apps/harness/src/tool-governance.test.ts | 5 |
| apps/harness/src/training-data.test.ts | 1 |
| apps/harness/src/utils.test.ts | 2 |
| apps/harness/src/visibility.test.ts | 4 |

## Issue Detection

| Readiness | Issue | Evidence | Surgical fix |
| --- | --- | --- | --- |
| Red | No cross-repo product inventory existed before this generated audit surface. | Routes, endpoints, UI calls, exports, tests, and file-backed stores were discoverable only by manual search. | Keep `npm run audit:inventory` in the release checklist and update this report before broad product claims. |
| Green | Dashboard proxy covers governed harness DELETE routes. | Dashboard proxy exports governed DELETE support for the explicit harness removal-route allowlist. | Keep DELETE route expansion behind explicit allowlist tests. |
| Yellow | Actuation websocket is implemented but not part of the dashboard ticket route allowlist. | `/stream/actuation/device` exists in the harness; dashboard socket tickets support only `/stream` and `/stream/neuro/live`. | Add a dedicated dashboard ticket type for actuation device links or keep it intentionally external and document that boundary. |
| Red | Frontend and TUI flows have no direct automated tests. | Dashboard tests: 2; TUI tests: 0. Harness tests: 175. | Add dashboard route-handler tests for auth/proxy behavior and TUI command tests for governed request headers. |
| Green | Q current-date awareness is now a first-class exported runtime context. | A date/time context export was detected. | Keep the runtime context injected anywhere Q or Discord agents answer questions about current facts. |
| Yellow | Several backend endpoints are not called by the dashboard or TUI. | 66 endpoint(s) have no operator UI caller in this scan. Some are valid CLI/worker/public-gateway surfaces; the rest need route ownership decisions. | Mark each no-UI endpoint as public gateway, CLI-only, worker-only, or product gap, then add tests or remove it. |

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
