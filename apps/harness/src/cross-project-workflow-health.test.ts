import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyWorkflowRunForReleaseHealth,
  redactWorkflowRunSummariesForVisibility
} from "./cross-project-workflow-health.js";

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

test("cross-project workflow health classifies dynamic Dependabot failures as non-actionable", () => {
  const classification = classifyWorkflowRunForReleaseHealth({
    name: "npm_and_yarn in /. for next - Update #1361215239",
    workflowPath: "dynamic/dependabot/dependabot-updates",
    event: "dynamic",
    status: "completed",
    conclusion: "failure"
  });

  assert.equal(classification.classification, "non_actionable");
  assert.equal(classification.healthy, true);
  assert.match(classification.reason, /Dependabot/u);
});

test("cross-project workflow health treats skipped runs as healthy but not observed-successful", () => {
  const classification = classifyWorkflowRunForReleaseHealth({
    name: "Require Issue Link",
    workflowPath: ".github/workflows/require-issue-link.yml",
    event: "pull_request",
    status: "completed",
    conclusion: "skipped"
  });

  assert.equal(classification.classification, "success");
  assert.equal(classification.healthy, true);
});

test("cross-project workflow health keeps normal failed CI actionable", () => {
  const classification = classifyWorkflowRunForReleaseHealth({
    name: "CI",
    workflowPath: ".github/workflows/ci.yml",
    event: "push",
    status: "completed",
    conclusion: "failure"
  });

  assert.equal(classification.classification, "failure");
  assert.equal(classification.healthy, false);
});
