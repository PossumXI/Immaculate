# Immaculate — Audit Action Plan (2026-04-11)

Top 10 actionable fixes, ordered by severity and implementation cost.

---

## 1. [P0] Add authentication to the API (server.ts)

Every endpoint is open. Add a Fastify preHandler that checks a bearer token from `IMMACULATE_API_KEY` env var:
```ts
app.addHook('preHandler', (req, reply, done) => {
  const expected = process.env.IMMACULATE_API_KEY;
  if (!expected) return done();
  if (req.headers.authorization !== `Bearer ${expected}`) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  done();
});
```
Exempt `/api/health` and `/stream` (handle WS auth via query param or first-message token).

---

## 2. [P0] Offload benchmark run to a worker thread (server.ts + benchmark.ts)

`POST /api/benchmarks/run` blocks the event loop for 10–30 seconds. Move `runPublishedBenchmark()` to a `node:worker_threads` Worker. The route should return `{ accepted: true, jobId }` immediately and stream progress via the existing WebSocket snapshot channel or a polling endpoint.

---

## 3. [P0] Fix Three.js memory leak in ConnectomeScene (connectome-scene.tsx)

Replace the `<primitive object={new THREE.Line(...)} />` pattern with R3F declarative elements so the renderer manages disposal:
```tsx
<line ref={lineRef}>
  <bufferGeometry />
  <lineBasicMaterial color="#7bc7ff" transparent opacity={0.14 + strength * 0.55} />
</line>
```
Update the geometry in a `useEffect` using `lineRef.current.geometry.setFromPoints(...)`.

---

## 4. [P1] Implement WebSocket reconnection in Dashboard and TUI

Add exponential backoff reconnect to both clients. Pattern (Dashboard):
```ts
let retryMs = 500;
function connect() {
  const socket = new WebSocket(harnessWsUrl);
  socket.onclose = () => { if (!cancelled) { setConnected(false); setTimeout(connect, Math.min(retryMs *= 1.6, 30_000)); } };
  // … attach other handlers
}
```
Also call `GET /api/snapshot` as a continuity path when the socket is down.

---

## 5. [P1] Sanitise file paths on ingest endpoints (server.ts, bids.ts, nwb.ts)

After `path.resolve(inputPath)`, verify the result is within an allowed root:
```ts
const ALLOWED_ROOT = process.env.IMMACULATE_DATA_ROOT ?? os.homedir();
if (!resolvedPath.startsWith(path.normalize(ALLOWED_ROOT + path.sep))) {
  reply.code(400); return { error: 'path_traversal_rejected' };
}
```
Apply to `POST /api/ingest/bids/scan` and `POST /api/ingest/nwb/scan`.

---

## 6. [P1] Fix W&B Python path for Linux (wandb.ts + CI)

`LOCAL_VENV_PYTHON` currently resolves to `Scripts/python.exe` (Windows). Add platform detection:
```ts
const VENV_BIN = process.platform === 'win32' ? 'Scripts' : 'bin';
const VENV_EXE = process.platform === 'win32' ? 'python.exe' : 'python3';
const LOCAL_VENV_PYTHON = path.join(REPO_ROOT, '.tools', 'wandb-venv', VENV_BIN, VENV_EXE);
```
Add a Linux bootstrap script (`scripts/bootstrap-wandb.sh`) and update the CI workflow to run it on Linux runners.

---

## 7. [P2] Replace `useEffectEvent` with stable alternatives (dashboard-client.tsx)

`useEffectEvent` is experimental. Replace each usage with a `useCallback` with explicit `useRef`-forwarded dependencies, or migrate fetch/mutation logic to React Query (`useMutation` / `useQuery`). This also eliminates the 5× manual polling interval and replaces it with a single query client.

---

## 8. [P2] Split DashboardClient into panel components (dashboard-client.tsx)

Extract each of the 10 panels into its own component file:
- `BenchmarkPanel.tsx`, `NodePanel.tsx`, `PassPanel.tsx`, `NeuroPanel.tsx`,
  `IntelligencePanel.tsx`, `PersistencePanel.tsx`, `HistoryPanel.tsx`, etc.

Wrap each with `React.memo`. Move shared state (snapshot, persistence, wandbStatus) to a React context or Zustand store.

---

## 9. [P2] Add NDJSON event log rotation (persistence.ts)

Add a size check before each append. When `events.ndjson` exceeds a threshold (e.g. 50 MB), rotate to `events.1.ndjson` and start a new file:
```ts
const MAX_LOG_BYTES = 50 * 1024 * 1024;
const info = await stat(eventsPath).catch(() => null);
if (info && info.size > MAX_LOG_BYTES) await rotate(eventsPath);
```
Alternatively, compact events into the latest checkpoint file and truncate the log after a successful checkpoint.

---

## 10. [P3] Consolidate `hashValue` and `safeUnlink` into shared utilities

Four copies of `hashValue` (FNV-1a) exist in `bids.ts`, `nwb.ts`, `live-neuro.ts`, and `neuro-replay.ts`. Two copies of `safeUnlink` exist in `persistence.ts` and `benchmark.ts`. Move both to `apps/harness/src/utils.ts` and import them where needed. If hash utilities need to be shared with core, export from `packages/core/src/index.ts`.

---

*See `ProjectAudit2026-04-11.html` for the full audit with backend table, flow diagrams, and per-feature readiness badges.*
