import assert from "node:assert/strict";
import test from "node:test";
import { fetchGitHubJson } from "./github-checks-receipt.js";

test("GitHub checks receipt falls back to gh api when REST is unavailable", async () => {
  const requestedPaths: string[] = [];
  const result = await fetchGitHubJson<{ ok: true }>("repos/PossumXI/Immaculate/actions/runs", {
    fetchImpl: async () => new Response("rate limited", { status: 403 }),
    ghApiImpl: <Value>(apiPath: string) => {
      requestedPaths.push(apiPath);
      return { ok: true } as Value;
    }
  });

  assert.deepEqual(result, {
    data: { ok: true },
    source: "gh-auth"
  });
  assert.deepEqual(requestedPaths, ["repos/PossumXI/Immaculate/actions/runs"]);
});

