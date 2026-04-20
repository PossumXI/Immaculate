import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type {
  AgentWorkspaceScope,
  ExecutionSchedule,
  IntelligenceLayerRole,
  RoundtableAction,
  RoundtableActionStatus
} from "@immaculate/core";
import { hashValue } from "./utils.js";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WORKTREE_ROOT = path.join(REPO_ROOT, ".runtime", "agent-worktrees");
const DEFAULT_OPENJAWS_ROOT = "D:\\openjaws\\OpenJaws";
const DEFAULT_ASGARD_ROOT = "C:\\Users\\Knight\\Desktop\\cheeks\\Asgard";

type DiscoveredRoundtableRepo = AgentWorkspaceScope & {
  available: boolean;
  dirty: boolean;
};

export type RoundtablePlan = {
  sessionScope?: string;
  repositories: DiscoveredRoundtableRepo[];
  actions: RoundtableAction[];
  summary: string;
  sharedContext: string;
  readyCount: number;
  repoCount: number;
};

type BuildRoundtableActionPlanInput = {
  objective: string;
  sessionId?: string;
  consentScope?: string;
  schedule: Pick<
    ExecutionSchedule,
    | "id"
    | "mode"
    | "executionTopology"
    | "parallelWidth"
    | "parallelFormationMode"
    | "parallelFormationSummary"
    | "layerRoles"
  >;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeSessionScope(sessionId?: string, consentScope?: string): string | undefined {
  if (consentScope?.startsWith("session:")) {
    return consentScope;
  }
  return sessionId ? `session:${sessionId}` : undefined;
}

function runGit(root: string, args: string[]): string | undefined {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return undefined;
  }
  const value = (result.stdout || "").trim();
  return value.length > 0 ? value : undefined;
}

function repoDirty(root: string): boolean {
  const result = spawnSync("git", ["-C", root, "status", "--porcelain"], {
    encoding: "utf8",
    windowsHide: true
  });
  return result.status === 0 && (result.stdout || "").trim().length > 0;
}

function discoverRepo(args: {
  repoId: string;
  repoLabel: string;
  root: string;
  sessionScope?: string;
}): DiscoveredRoundtableRepo {
  const gitDir = path.join(args.root, ".git");
  const available = existsSync(args.root) && existsSync(gitDir);
  const gitBranch = available ? runGit(args.root, ["branch", "--show-current"]) : undefined;
  const repoSha = available ? runGit(args.root, ["rev-parse", "--short", "HEAD"]) : undefined;
  const dirty = available ? repoDirty(args.root) : false;
  return {
    repoId: args.repoId,
    repoLabel: args.repoLabel,
    repoPath: args.root,
    gitBranch,
    repoSha,
    sessionScope: args.sessionScope,
    isolationMode: "worktree",
    available,
    dirty
  };
}

export function discoverRoundtableProjects(sessionScope?: string): DiscoveredRoundtableRepo[] {
  const openjawsRoot =
    process.env.OPENJAWS_ROOT?.trim() ||
    process.env.ASGARD_OPENJAWS_ROOT?.trim() ||
    DEFAULT_OPENJAWS_ROOT;
  const asgardRoot = process.env.ASGARD_ROOT?.trim() || DEFAULT_ASGARD_ROOT;
  return [
    discoverRepo({
      repoId: "immaculate",
      repoLabel: "Immaculate",
      root: REPO_ROOT,
      sessionScope
    }),
    discoverRepo({
      repoId: "openjaws",
      repoLabel: "OpenJaws",
      root: openjawsRoot,
      sessionScope
    }),
    discoverRepo({
      repoId: "asgard",
      repoLabel: "Asgard",
      root: asgardRoot,
      sessionScope
    })
  ];
}

function selectRepoOrder(objective: string, repositories: DiscoveredRoundtableRepo[]): DiscoveredRoundtableRepo[] {
  const lowered = objective.toLowerCase();
  const selectedIds = new Set<string>(["immaculate"]);
  if (/(openjaws|terminalbench|bridgebench|cli|provider)/.test(lowered)) {
    selectedIds.add("openjaws");
  }
  if (/(asgard|arobi|ledger|audit|network|defense|health|insurance)/.test(lowered)) {
    selectedIds.add("asgard");
  }
  if (selectedIds.size === 1) {
    for (const repo of repositories) {
      if (repo.available) {
        selectedIds.add(repo.repoId);
      }
      if (selectedIds.size >= 3) {
        break;
      }
    }
  }
  return repositories.filter((repo) => selectedIds.has(repo.repoId) && repo.available);
}

function buildWorktreePath(args: {
  repoId: string;
  sessionScope?: string;
  role: IntelligenceLayerRole;
}): string {
  const scopeSlug = slugify(args.sessionScope ?? "system");
  const roleSlug = slugify(args.role);
  return path.join(WORKTREE_ROOT, args.repoId, `${scopeSlug}-${roleSlug}`);
}

function buildBranchName(args: {
  repoId: string;
  sessionScope?: string;
  role: IntelligenceLayerRole;
}): string {
  const scopeSlug = slugify(args.sessionScope ?? "system");
  return `agents/${scopeSlug}/${args.repoId}-${slugify(args.role)}`;
}

function actionStatusForRepo(repo: DiscoveredRoundtableRepo): RoundtableActionStatus {
  if (!repo.available) {
    return "blocked";
  }
  return "ready";
}

function actionRationale(args: {
  repo: DiscoveredRoundtableRepo;
  role: IntelligenceLayerRole;
  schedule: BuildRoundtableActionPlanInput["schedule"];
}): string {
  const locality =
    args.schedule.parallelFormationMode === "hybrid-quorum" ||
    args.schedule.parallelFormationMode === "horizontal-swarm"
      ? "parallel lane"
      : "primary lane";
  const dirtiness = args.repo.dirty
    ? "The base repo is currently dirty, so the isolated agent worktree should start from the current HEAD and leave unstaged local changes untouched."
    : "The repo is clean enough to materialize an isolated agent worktree immediately.";
  return `${args.repo.repoLabel} is the ${locality} for the ${args.role} role. ${dirtiness}`;
}

export function buildRoundtableActionPlan(
  input: BuildRoundtableActionPlanInput
): RoundtablePlan {
  const sessionScope = normalizeSessionScope(input.sessionId, input.consentScope);
  const repositories = discoverRoundtableProjects(sessionScope);
  const selectedRepos = selectRepoOrder(input.objective, repositories);
  const roleOrder: IntelligenceLayerRole[] =
    input.schedule.layerRoles.length > 0 ? [...input.schedule.layerRoles] : ["mid"];
  const actions: RoundtableAction[] = selectedRepos.map((repo, index) => {
    const role: IntelligenceLayerRole = roleOrder[index % roleOrder.length] ?? "mid";
    const worktreePath = buildWorktreePath({
      repoId: repo.repoId,
      sessionScope,
      role
    });
    const gitBranch = buildBranchName({
      repoId: repo.repoId,
      sessionScope,
      role
    });
    const workspaceScope: AgentWorkspaceScope = {
      repoId: repo.repoId,
      repoLabel: repo.repoLabel,
      repoPath: repo.repoPath,
      worktreePath,
      gitBranch,
      repoSha: repo.repoSha,
      sessionScope,
      isolationMode: "worktree"
    };
    const status = actionStatusForRepo(repo);
    return {
      id: `rt-${hashValue(`${input.schedule.id}:${repo.repoId}:${role}:${sessionScope ?? "system"}`)}`,
      repoId: repo.repoId,
      repoLabel: repo.repoLabel,
      role,
      status,
      objective: input.objective,
      rationale: actionRationale({
        repo,
        role,
        schedule: input.schedule
      }),
      commandHint:
        status === "blocked"
          ? undefined
          : `git -C "${repo.repoPath}" worktree add "${worktreePath}" -b "${gitBranch}" HEAD`,
      workspaceScope
    } satisfies RoundtableAction;
  });
  const readyCount = actions.filter((action) => action.status === "ready").length;
  const summary = `Roundtable ${input.schedule.parallelFormationMode ?? "single-lane"} plan across ${selectedRepos.length} repo(s) with ${actions.length} isolated agent action(s); ${readyCount} ready for immediate worktree materialization.`;
  const sharedContext = [
    "ROUNDTABLE ACTION PLAN:",
    summary,
    ...actions.map(
      (action) =>
        `${action.role.toUpperCase()} -> ${action.repoLabel} branch=${action.workspaceScope.gitBranch ?? "none"} worktree=${action.workspaceScope.worktreePath ?? "none"} status=${action.status}`
    )
  ].join("\n");
  return {
    sessionScope,
    repositories,
    actions,
    summary,
    sharedContext,
    readyCount,
    repoCount: selectedRepos.length
  };
}

export function materializeRoundtableActionWorktree(action: RoundtableAction): {
  branch: string;
  worktreePath: string;
} {
  const repoPath = action.workspaceScope.repoPath;
  const worktreePath = action.workspaceScope.worktreePath;
  const branch = action.workspaceScope.gitBranch;
  if (!worktreePath || !branch) {
    throw new Error(`Roundtable action ${action.id} is missing worktree metadata.`);
  }
  if (action.status === "blocked") {
    throw new Error(`Roundtable action ${action.id} is blocked and cannot materialize a worktree.`);
  }
  mkdirSync(path.dirname(worktreePath), { recursive: true });
  if (!existsSync(worktreePath)) {
    const result = spawnSync("git", ["-C", repoPath, "worktree", "add", worktreePath, "-b", branch, "HEAD"], {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0) {
      throw new Error(
        `Unable to materialize roundtable worktree for ${action.repoLabel}: ${(result.stderr || result.stdout || "git worktree add failed").trim()}`
      );
    }
  }
  return {
    branch,
    worktreePath
  };
}
