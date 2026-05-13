import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readRepoFile(relativeUrl: string): Promise<string> {
  return readFile(new URL(relativeUrl, import.meta.url), "utf8");
}

function routeRequiresEngagement(source: string, route: string): boolean {
  const routeIndex = source.indexOf(`"${route}"`);
  if (routeIndex < 0) {
    return false;
  }
  const routeBlock = source.slice(routeIndex, routeIndex + 520);
  return routeBlock.includes('realWorldEngagement: "required"');
}

test("live neuro write routes require real-world engagement evidence", async () => {
  const server = await readRepoFile("./server.ts");

  for (const route of [
    "/api/devices/lsl/connect",
    "/api/devices/lsl/:sourceId/stop",
    "/api/neuro/live/frame",
    "/api/neuro/live/:sourceId/stop",
    "/stream/neuro/live"
  ]) {
    assert.equal(routeRequiresEngagement(server, route), true, `${route} must require engagement`);
  }
});

test("dashboard and TUI live neuro callers propagate engagement evidence", async () => {
  const dashboard = await readRepoFile("../../dashboard/app/ui/dashboard-client.tsx");
  const tui = await readRepoFile("../../tui/src/index.tsx");

  for (const source of [dashboard, tui]) {
    assert.equal(source.includes("buildLiveNeuroGovernance("), true);
    assert.equal(source.includes("receiptTarget"), true);
    assert.equal(source.includes("operatorSummary"), true);
    assert.equal(source.includes("operatorConfirmed: true"), true);
    assert.equal(source.includes("rollbackPlan"), true);
  }
});

test("server engagement extractor accepts JSON body evidence", async () => {
  const server = await readRepoFile("./server.ts");

  assert.match(server, /request\.body/u);
  assert.match(server, /bodyNames/u);
  assert.match(server, /operatorConfirmed/u);
});
