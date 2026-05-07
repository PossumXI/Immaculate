import assert from "node:assert/strict";
import test from "node:test";
import { redactWorkflowRunSummariesForVisibility } from "./cross-project-workflow-health.js";

test("cross-project workflow health redacts private workflow run URLs in data receipts", () => {
  const runs = [
    {
      name: "private-ci",
      htmlUrl: "https://github.com/PossumXI/Asgard_Arobi/actions/runs/1",
      conclusion: "success"
    }
  ];

  assert.equal(
    redactWorkflowRunSummariesForVisibility(runs, "public")[0]?.htmlUrl,
    runs[0]?.htmlUrl
  );
  assert.equal(
    "htmlUrl" in (redactWorkflowRunSummariesForVisibility(runs, "private")[0] ?? {}),
    false
  );
});
