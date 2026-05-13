import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createEngine,
  type MultiAgentConversation,
  type RoundtableAction
} from "@immaculate/core";

function bulkyAction(index: number): RoundtableAction {
  const branch = `agents/durable-window-${index}`;
  return {
    id: `action-${index}`,
    repoId: "immaculate",
    repoLabel: "Immaculate",
    role: "mid",
    status: "ready",
    objective: `Audit durable-state bounded event window ${index}.`,
    rationale: "x".repeat(2048),
    workspaceScope: {
      repoId: "immaculate",
      repoLabel: "Immaculate",
      repoPath: "C:\\Users\\Knight\\Desktop\\Immaculate",
      worktreePath: `C:\\Users\\Knight\\Desktop\\Immaculate\\.runtime\\agent-worktrees\\durable-window-${index}`,
      gitBranch: branch,
      isolationMode: "worktree",
      writeAuthority: "agent-branch-only",
      allowedPushBranch: branch
    },
    executionArtifact: {
      status: "prepared",
      executionReady: true,
      workspaceMaterialized: true,
      requiresManualCheckout: false,
      authorityBound: true,
      relevantFiles: ["apps/harness/src/server.ts", "packages/core/src/index.ts"],
      focusAreas: ["durable-state", "roundtable-runtime"],
      executionSummary: "x".repeat(2048)
    }
  };
}

function bulkyConversation(index: number): MultiAgentConversation {
  const timestamp = new Date(1_770_000_000_000 + index).toISOString();
  return {
    id: `conversation-${index}`,
    sessionId: `session-${index}`,
    sessionScope: `session:durable-window-${index}`,
    mode: "multi-turn",
    status: "completed",
    executionTopology: "parallel-then-guard",
    parallelWidth: 3,
    roles: ["mid", "reasoner", "guard"],
    turnCount: 1,
    guardVerdict: "approved",
    finalRouteSuggestion: "cognitive",
    finalCommitStatement: "Keep durable snapshots bounded while preserving persisted audit evidence.",
    roundtableSummary: "x".repeat(2048),
    roundtableActions: [bulkyAction(index)],
    summary: "x".repeat(2048),
    startedAt: timestamp,
    completedAt: timestamp,
    turns: [
      {
        id: `turn-${index}`,
        layerId: "test-layer",
        role: "mid",
        model: "Q",
        status: "completed",
        objective: "Exercise bulky roundtable payload durability.",
        responsePreview: "x".repeat(2048),
        routeSuggestion: "cognitive",
        reasonSummary: "x".repeat(1024),
        commitStatement: "Preserve bounded durable-state behavior.",
        latencyMs: 10,
        startedAt: timestamp,
        completedAt: timestamp,
        workspaceScope: bulkyAction(index).workspaceScope
      }
    ]
  };
}

test("durable state keeps a bounded in-memory event window under bulky roundtable payloads", () => {
  const engine = createEngine({ bootstrap: false });
  for (let index = 0; index < 700; index += 1) {
    engine.recordConversation(bulkyConversation(index));
  }

  const durable = engine.getDurableState();
  assert.equal(durable.events.length, 512);
  assert.equal(durable.snapshot.conversations.length, 24);
});
