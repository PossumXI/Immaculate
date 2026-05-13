import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { RoundtableAction } from "@immaculate/core";
import {
  cleanupRoundtableActionWorktree,
  materializeRoundtableActionWorktree
} from "./roundtable.js";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WORKTREE_TEST_ROOT = path.join(REPO_ROOT, ".runtime", "agent-worktrees", "lifecycle-tests");

function testAction(worktreePath: string, branch: string): RoundtableAction {
  return {
    id: `test-${branch}`,
    repoId: "immaculate",
    repoLabel: "Immaculate",
    role: "mid",
    status: "ready",
    objective: "Validate stale roundtable worktree cleanup.",
    rationale: "Tests must prove runtime worktree lifecycle cleanup is resilient.",
    workspaceScope: {
      repoId: "immaculate",
      repoLabel: "Immaculate",
      repoPath: REPO_ROOT,
      worktreePath,
      gitBranch: branch,
      isolationMode: "worktree",
      writeAuthority: "agent-branch-only"
    }
  };
}

function deleteBranch(branch: string): void {
  spawnSync("git", ["branch", "-D", branch], {
    cwd: REPO_ROOT,
    stdio: "ignore"
  });
}

function pruneWorktrees(): void {
  spawnSync("git", ["worktree", "prune"], {
    cwd: REPO_ROOT,
    stdio: "ignore"
  });
}

test("roundtable cleanup removes stale runtime worktree directories with missing git metadata", () => {
  const worktreePath = path.join(WORKTREE_TEST_ROOT, `stale-cleanup-${process.pid}`);
  const branch = `agents/test-roundtable-stale-cleanup-${process.pid}`;
  rmSync(worktreePath, { recursive: true, force: true });
  mkdirSync(worktreePath, { recursive: true });

  try {
    cleanupRoundtableActionWorktree(testAction(worktreePath, branch));
    assert.equal(existsSync(worktreePath), false);
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
    deleteBranch(branch);
  }
});

test("roundtable materialization recovers a stale runtime worktree directory before adding a worktree", () => {
  const worktreePath = path.join(WORKTREE_TEST_ROOT, `stale-materialize-${process.pid}`);
  const branch = `agents/test-roundtable-stale-materialize-${process.pid}`;
  const action = testAction(worktreePath, branch);
  rmSync(worktreePath, { recursive: true, force: true });
  mkdirSync(worktreePath, { recursive: true });

  try {
    const materialized = materializeRoundtableActionWorktree(action);
    assert.equal(materialized.worktreePath, worktreePath);
    assert.equal(existsSync(path.join(worktreePath, ".git")), true);
  } finally {
    cleanupRoundtableActionWorktree(action);
    rmSync(worktreePath, { recursive: true, force: true });
    deleteBranch(branch);
  }
});

test("roundtable materialization prunes missing worktree metadata before re-adding", () => {
  const worktreePath = path.join(WORKTREE_TEST_ROOT, `stale-git-metadata-${process.pid}`);
  const branch = `agents/test-roundtable-stale-git-metadata-${process.pid}`;
  const action = testAction(worktreePath, branch);
  rmSync(worktreePath, { recursive: true, force: true });

  try {
    materializeRoundtableActionWorktree(action);
    rmSync(worktreePath, { recursive: true, force: true });

    const materialized = materializeRoundtableActionWorktree(action);

    assert.equal(materialized.worktreePath, worktreePath);
    assert.equal(existsSync(path.join(worktreePath, ".git")), true);
  } finally {
    cleanupRoundtableActionWorktree(action);
    rmSync(worktreePath, { recursive: true, force: true });
    pruneWorktrees();
    deleteBranch(branch);
  }
});

test("roundtable stale cleanup refuses directories outside the managed worktree root", () => {
  const worktreePath = path.join(REPO_ROOT, ".runtime", `outside-roundtable-worktree-${process.pid}`);
  const branch = `agents/test-roundtable-outside-cleanup-${process.pid}`;
  rmSync(worktreePath, { recursive: true, force: true });
  mkdirSync(worktreePath, { recursive: true });

  try {
    assert.throws(
      () => cleanupRoundtableActionWorktree(testAction(worktreePath, branch)),
      /Refusing to remove stale roundtable worktree outside/
    );
    assert.equal(existsSync(worktreePath), true);
  } finally {
    rmSync(worktreePath, { recursive: true, force: true });
    deleteBranch(branch);
  }
});
