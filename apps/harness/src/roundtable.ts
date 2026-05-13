import path from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import type {
  AgentTurn,
  AgentWorkspaceScope,
  ExecutionSchedule,
  IntelligenceLayerRole,
  RoundtableAction,
  RoundtableActionStatus,
  RoundtableExecutionArtifact
} from "@immaculate/core";
import { hashValue } from "./utils.js";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WORKTREE_ROOT = path.join(REPO_ROOT, ".runtime", "agent-worktrees");
const ROUNDTABLE_EXECUTION_ROOT = path.join(REPO_ROOT, ".runtime", "roundtable-execution");
const DEFAULT_OPENJAWS_ROOT = "D:\\openjaws\\OpenJaws";
const DEFAULT_ASGARD_ROOT = "C:\\Users\\Knight\\Desktop\\cheeks\\Asgard";

type DiscoveredRoundtableRepo = AgentWorkspaceScope & {
  available: boolean;
  dirty: boolean;
};

export type RoundtableActionWorkspaceProbe = {
  repoId: string;
  repoLabel: string;
  cwd: string;
  activeBranch?: string;
  repoSha?: string;
  trackedFileCount: number;
  sampleFiles: string[];
  writeAuthority?: AgentWorkspaceScope["writeAuthority"];
  allowedPushRemote?: string;
  allowedPushBranch?: string;
  authorityBranchPreserved: boolean;
  probeSucceeded: boolean;
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

type MaterializedRoundtableActionExecution = {
  action: RoundtableAction;
  branch: string;
  worktreePath: string;
  bundlePath: string;
  taskDocumentPath: string;
  auditReceiptPath?: string;
  executionReceiptPath?: string;
  workspaceTaskPath?: string;
  probe: RoundtableActionWorkspaceProbe;
};

type RoundtableRepoAuditFinding = {
  id: string;
  severity: "info" | "warning";
  summary: string;
  file?: string;
  evidence?: string;
};

type RoundtableRepoAuditReceipt = {
  generatedAt: string;
  repoId: string;
  repoLabel: string;
  branch: string;
  objective: string;
  findingCount: number;
  actionableFindingCount: number;
  summary: string;
  findings: RoundtableRepoAuditFinding[];
};

type RoundtableExecutionCommandReceipt = {
  command: string;
  status: "completed" | "failed";
  detail: string;
};

type RoundtableExecutionReceipt = {
  generatedAt: string;
  repoId: string;
  repoLabel: string;
  branch: string;
  objective: string;
  workspacePath: string;
  commandSummary: string;
  summary: string;
  status: "completed" | "failed";
  findingCount: number;
  actionableFindingCount: number;
  authorityBranchPreserved: boolean;
  requiresManualCheckout: boolean;
  relevantFiles: string[];
  focusAreas: string[];
  auditReceiptPath?: string;
  commands: RoundtableExecutionCommandReceipt[];
};

type RoundtableTrackedWorkspaceSnapshot = {
  trackedFileCount: number;
  sampleFiles: string[];
  probeSucceeded: boolean;
};

const roundtableTrackedWorkspaceCache = new Map<string, RoundtableTrackedWorkspaceSnapshot>();
const roundtableRepoAuditFindingCache = new Map<string, RoundtableRepoAuditFinding[]>();

function pathIsInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasGitWorktreeMetadata(worktreePath: string): boolean {
  return existsSync(path.join(worktreePath, ".git"));
}

function removeStaleRoundtableWorktreeDirectory(repoPath: string, worktreePath: string): boolean {
  if (!existsSync(worktreePath) || hasGitWorktreeMetadata(worktreePath)) {
    return false;
  }
  if (!pathIsInside(WORKTREE_ROOT, worktreePath)) {
    throw new Error(`Refusing to remove stale roundtable worktree outside ${WORKTREE_ROOT}: ${worktreePath}`);
  }
  runGitDetailed(repoPath, ["worktree", "prune"]);
  rmSync(worktreePath, { recursive: true, force: true });
  return true;
}

function pruneStaleRoundtableWorktreeMetadata(repoPath: string): void {
  runGitDetailed(repoPath, ["worktree", "prune"]);
}

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

function preferredIsolationMode(repoId: string): AgentWorkspaceScope["isolationMode"] {
  if (repoId === "asgard") {
    return "branch";
  }
  return "worktree";
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

function runGitDetailed(root: string, args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true
  });
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim()
  };
}

function isGitWorktree(root: string): boolean {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    windowsHide: true
  });
  return result.status === 0 && (result.stdout || "").trim() === "true";
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
  const available = existsSync(args.root) && isGitWorktree(args.root);
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
    isolationMode: preferredIsolationMode(args.repoId),
    available,
    dirty
  };
}

export function discoverRoundtableProjects(sessionScope?: string): DiscoveredRoundtableRepo[] {
  const openjawsRoot = process.env.OPENJAWS_ROOT?.trim() || DEFAULT_OPENJAWS_ROOT;
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

function workspaceWriteAuthorityForRepo(
  repo: DiscoveredRoundtableRepo
): AgentWorkspaceScope["writeAuthority"] {
  return repo.available ? "agent-branch-only" : "repo-read-only";
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
  const isolation =
    args.repo.isolationMode === "worktree"
      ? dirtiness
      : "The repo is large or operationally dense enough that the safest default is an agent-only branch lane without expanding another full worktree on disk.";
  return `${args.repo.repoLabel} is the ${locality} for the ${args.role} role. ${isolation}`;
}

function relativeRepoPath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const relativePath = path.relative(REPO_ROOT, value).replaceAll("\\", "/");
  return relativePath.length > 0 ? relativePath : ".";
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, items): value is string => {
    return typeof value === "string" && value.trim().length > 0 && items.indexOf(value) === index;
  });
}

function buildRoundtableCacheKey(...parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim() || "none").join("|");
}

function relevantFilesForRepo(action: RoundtableAction, probe: RoundtableActionWorkspaceProbe): string[] {
  const defaults: Record<string, string[]> = {
    immaculate: [
      "apps/harness/src/server.ts",
      "apps/harness/src/roundtable.ts",
      "apps/harness/src/roundtable-runtime.ts",
      "apps/harness/src/decision-trace.ts"
    ],
    openjaws: [
      "src/immaculate/runtimeCoherence.ts",
      "src/utils/discordQAgentRuntime.ts",
      "scripts/q-terminalbench.ts",
      "src/immaculate/benchmarkTrace.ts"
    ],
    asgard: [
      "internal/fabric/roundtable.go",
      "internal/fabric/service.go",
      "internal/cortex/orchestrator.go",
      "internal/services/audit.go"
    ]
  };
  return uniqueStrings([...probe.sampleFiles, ...(defaults[action.repoId] ?? [])]).slice(0, 8);
}

function focusAreasForRepo(action: RoundtableAction): string[] {
  if (action.repoId === "openjaws") {
    return [
      "Tighten runtime coherence and benchmark provenance.",
      "Keep Q-facing runtime receipts structurally trustworthy.",
      "Stay on the agent-only branch and preserve terminal-task traceability."
    ];
  }
  if (action.repoId === "asgard") {
    return [
      "Preserve Arobi audit continuity and do not claim unavailable public-edge writes.",
      "Keep fabric roundtable governance reviewable under pressure.",
      "Treat branch-only isolation as plan-and-handoff until a clean working lane exists."
    ];
  }
  return [
    "Improve governed mediation and roundtable execution without drift.",
    "Keep Q primary, Immaculate reviewable, and audit evidence linked.",
    "Only edit inside the isolated agent branch or worktree."
  ];
}

async function readRepoFileIfPresent(repoRoot: string, relativePath: string): Promise<string | undefined> {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }
  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

function pushFinding(
  findings: RoundtableRepoAuditFinding[],
  finding: RoundtableRepoAuditFinding | undefined
): void {
  if (finding) {
    findings.push(finding);
  }
}

function cloneRoundtableAuditFindings(
  findings: RoundtableRepoAuditFinding[]
): RoundtableRepoAuditFinding[] {
  return findings.map((finding) => ({ ...finding }));
}

function getTrackedWorkspaceSnapshot(args: {
  cwd: string;
  repoSha?: string;
}): RoundtableTrackedWorkspaceSnapshot {
  const cacheKey = buildRoundtableCacheKey("tracked-workspace", args.cwd, args.repoSha);
  const cached = roundtableTrackedWorkspaceCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const trackedFilesResult = runGitDetailed(args.cwd, ["ls-files"]);
  const trackedFiles =
    trackedFilesResult.status === 0
      ? trackedFilesResult.stdout
          .split(/\r?\n/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  const snapshot: RoundtableTrackedWorkspaceSnapshot = {
    trackedFileCount: trackedFiles.length,
    sampleFiles: selectSampleFiles(trackedFiles),
    probeSucceeded: trackedFilesResult.status === 0
  };
  roundtableTrackedWorkspaceCache.set(cacheKey, snapshot);
  return snapshot;
}

async function collectRoundtableRepoAuditFindings(args: {
  repoId: string;
  repoRoot: string;
  repoSha?: string;
}): Promise<RoundtableRepoAuditFinding[]> {
  const cacheKey = buildRoundtableCacheKey(
    "repo-audit-findings",
    args.repoId,
    args.repoRoot,
    args.repoSha
  );
  const cached = roundtableRepoAuditFindingCache.get(cacheKey);
  if (cached) {
    return cloneRoundtableAuditFindings(cached);
  }

  const findings: RoundtableRepoAuditFinding[] = [];
  if (args.repoId === "immaculate") {
    const serverSource = await readRepoFileIfPresent(args.repoRoot, "apps/harness/src/server.ts");
    const runtimeSource = await readRepoFileIfPresent(
      args.repoRoot,
      "apps/harness/src/roundtable-runtime.ts"
    );
    pushFinding(
      findings,
      serverSource?.includes("materializeRoundtableActionExecutionArtifacts({")
        ? {
            id: "execution-bundles-live",
            severity: "info",
            summary: "Roundtable execution bundles are wired into the live mediated server path.",
            file: "apps/harness/src/server.ts"
          }
        : {
            id: "execution-bundles-missing",
            severity: "warning",
            summary: "Live mediated server path is missing roundtable execution bundle wiring.",
            file: "apps/harness/src/server.ts"
          }
    );
    pushFinding(
      findings,
      serverSource?.includes("if (!tracedScheduleDecision.shouldRunCognition)")
        ? {
            id: "suppressed-cognition-audit",
            severity: "info",
            summary: "Suppressed cognition still records a governed roundtable receipt.",
            file: "apps/harness/src/server.ts"
          }
        : undefined
    );
    pushFinding(
      findings,
      runtimeSource?.includes("roundtable-runtime-execution-bundles")
        ? {
            id: "runtime-bundle-benchmark",
            severity: "info",
            summary: "Roundtable runtime benchmark scores execution-bundle delivery explicitly.",
            file: "apps/harness/src/roundtable-runtime.ts"
          }
        : undefined
    );
  } else if (args.repoId === "openjaws") {
    const coherenceSource = await readRepoFileIfPresent(
      args.repoRoot,
      "src/immaculate/runtimeCoherence.ts"
    );
    const discordRuntimeSource = await readRepoFileIfPresent(
      args.repoRoot,
      "src/utils/discordQAgentRuntime.ts"
    );
    pushFinding(
      findings,
      coherenceSource?.includes("id: 'voice-runtime'") || coherenceSource?.includes('id: "voice-runtime"')
        ? {
            id: "voice-runtime-coherence",
            severity: "info",
            summary: "Runtime coherence now checks the voice plane explicitly when it is enabled.",
            file: "src/immaculate/runtimeCoherence.ts"
          }
        : undefined
    );
    pushFinding(
      findings,
      discordRuntimeSource &&
      (discordRuntimeSource.includes("as DiscordQAgentRouteState[]") ||
        discordRuntimeSource.includes("as DiscordQAgentReceipt['guilds']") ||
        discordRuntimeSource.includes("as DiscordQAgentEvent[]"))
        ? {
            id: "receipt-normalization-hardening",
            severity: "warning",
            summary:
              "Discord/Q receipt normalization still relies on direct casts in a few lanes; tighten schema validation before treating every local receipt as trusted.",
            file: "src/utils/discordQAgentRuntime.ts",
            evidence: "direct array casts remain in normalizeDiscordQAgentReceipt()"
          }
        : undefined
    );
  } else if (args.repoId === "asgard") {
    const fabricSource = await readRepoFileIfPresent(args.repoRoot, "internal/fabric/service.go");
    const orchestratorSource = await readRepoFileIfPresent(
      args.repoRoot,
      "internal/cortex/orchestrator.go"
    );
    const nysusSource = await readRepoFileIfPresent(args.repoRoot, "cmd/nysus/main.go");
    pushFinding(
      findings,
      fabricSource?.includes("GetPublicChainData") && fabricSource.includes("GetPrivateChainData")
        ? {
            id: "dual-telemetry-probes",
            severity: "info",
            summary: "Asgard fabric still probes both public and private chain telemetry surfaces.",
            file: "internal/fabric/service.go"
          }
        : undefined
    );
    pushFinding(
      findings,
      orchestratorSource?.includes("PublicChain: false")
        ? {
            id: "single-ledger-write-path",
            severity: "warning",
            summary:
              "Asgard still routes accountability through a single ledger write path instead of a live dual public/private write path.",
            file: "internal/cortex/orchestrator.go",
            evidence: "PublicChain: false"
          }
        : undefined
    );
    pushFinding(
      findings,
      nysusSource?.includes("AROBI_LEDGER_URL")
        ? {
            id: "single-ledger-endpoint-config",
            severity: "warning",
            summary:
              "Asgard controller wiring still depends on one AROBI_LEDGER_URL path; split public/private launch targets are not yet first-class.",
            file: "cmd/nysus/main.go",
            evidence: "AROBI_LEDGER_URL"
          }
        : undefined
    );
  }

  roundtableRepoAuditFindingCache.set(cacheKey, cloneRoundtableAuditFindings(findings));
  return findings;
}

async function buildRoundtableRepoAuditReceipt(args: {
  action: RoundtableAction;
  branch: string;
  objective: string;
  repoRoot: string;
  repoSha?: string;
}): Promise<RoundtableRepoAuditReceipt> {
  const findings = await collectRoundtableRepoAuditFindings({
    repoId: args.action.repoId,
    repoRoot: args.repoRoot,
    repoSha: args.repoSha
  });

  const actionableFindingCount = findings.filter((entry) => entry.severity === "warning").length;
  const summary =
    actionableFindingCount > 0
      ? `${args.action.repoLabel} audit captured ${findings.length} receipt(s) with ${actionableFindingCount} actionable follow-up target(s).`
      : `${args.action.repoLabel} audit captured ${findings.length} receipt(s) with no actionable follow-up target exposed by the bounded scan.`;

  return {
    generatedAt: new Date().toISOString(),
    repoId: args.action.repoId,
    repoLabel: args.action.repoLabel,
    branch: args.branch,
    objective: args.objective,
    findingCount: findings.length,
    actionableFindingCount,
    summary,
    findings
  };
}

function renderTaskDocument(args: {
  action: RoundtableAction;
  branch: string;
  bundlePath: string;
  taskDocumentPath: string;
  auditReceiptPath?: string;
  executionReceiptPath?: string;
  auditSummary?: string;
  findingCount?: number;
  actionableFindingCount?: number;
  workspaceTaskPath?: string;
  objective: string;
  probe: RoundtableActionWorkspaceProbe;
  relevantFiles: string[];
  focusAreas: string[];
  turn?: AgentTurn;
}): string {
  return [
    `# ${args.action.repoLabel} Roundtable Task`,
    "",
    "This file is generated from a live governed roundtable pass. It is the bounded execution brief for the isolated agent lane.",
    "",
    `- Repo: ${args.action.repoLabel}`,
    `- Role: ${args.action.role}`,
    `- Branch: \`${args.branch}\``,
    `- Isolation mode: \`${args.action.workspaceScope.isolationMode}\``,
    `- Write authority: \`${args.action.workspaceScope.writeAuthority ?? "none"}\``,
    `- Allowed push: \`${args.action.workspaceScope.allowedPushRemote ?? "none"}/${args.action.workspaceScope.allowedPushBranch ?? "none"}\``,
    `- Bundle path: \`${args.bundlePath}\``,
    `- Task document path: \`${args.taskDocumentPath}\``,
    `- Audit receipt path: \`${args.auditReceiptPath ?? "n/a"}\``,
    `- Execution receipt path: \`${args.executionReceiptPath ?? "n/a"}\``,
    `- Workspace task path: \`${args.workspaceTaskPath ?? "n/a"}\``,
    "",
    "## Objective",
    "",
    args.objective,
    "",
    "## Repo Rationale",
    "",
    args.action.rationale,
    "",
    "## Focus Areas",
    "",
    ...args.focusAreas.map((entry) => `- ${entry}`),
    "",
    "## Relevant Files",
    "",
    ...args.relevantFiles.map((entry) => `- \`${entry}\``),
    "",
    "## Latest Governed Turn",
    "",
    `- Route: \`${args.turn?.routeSuggestion ?? "n/a"}\``,
    `- Commit: \`${args.turn?.commitStatement ?? "n/a"}\``,
    `- Decision trace: \`${args.turn?.decisionTraceId ?? "n/a"}\``,
    "",
    "## Repo Audit Receipt",
    "",
    `- Summary: ${args.auditSummary ?? "n/a"}`,
    `- Findings: \`${args.findingCount ?? 0}\``,
    `- Actionable follow-ups: \`${args.actionableFindingCount ?? 0}\``,
    "",
    "## Boundaries",
    "",
    "- Keep edits inside the isolated agent branch or worktree only.",
    "- Preserve auditability: tie code changes back to the governed route and commit statement.",
    "- Do not rewrite unrelated local changes in the source repo.",
    "",
    "## Probe Snapshot",
    "",
    `- Branch preserved: \`${args.probe.authorityBranchPreserved}\``,
    `- Tracked files: \`${args.probe.trackedFileCount}\``,
    `- Sample files: \`${args.probe.sampleFiles.join(", ") || "n/a"}\``
  ].join("\n");
}

function buildRoundtableExecutionCommands(args: {
  action: RoundtableAction;
  cwd: string;
  auditReceiptPath?: string;
  relevantFiles: string[];
}): RoundtableExecutionCommandReceipt[] {
  const branchResult = runGitDetailed(args.cwd, ["branch", "--show-current"]);
  const shaResult = runGitDetailed(args.cwd, ["rev-parse", "--short", "HEAD"]);
  const statusResult = runGitDetailed(args.cwd, ["status", "--short"]);
  const commands: RoundtableExecutionCommandReceipt[] = [
    {
      command: "git branch --show-current",
      status: branchResult.status === 0 ? "completed" : "failed",
      detail: branchResult.stdout || branchResult.stderr || "branch unavailable"
    },
    {
      command: "git rev-parse --short HEAD",
      status: shaResult.status === 0 ? "completed" : "failed",
      detail: shaResult.stdout || shaResult.stderr || "sha unavailable"
    },
    {
      command: "git status --short",
      status: statusResult.status === 0 ? "completed" : "failed",
      detail:
        statusResult.stdout.length > 0
          ? statusResult.stdout
          : statusResult.stderr || "working tree clean"
    },
    {
      command: "roundtable bounded audit scan",
      status: "completed",
      detail:
        args.auditReceiptPath && args.relevantFiles.length > 0
          ? `audit receipt ${args.auditReceiptPath} linked with ${args.relevantFiles.length} relevant file(s)`
          : args.auditReceiptPath
            ? `audit receipt ${args.auditReceiptPath} linked`
            : "audit receipt unavailable"
    }
  ];
  if (args.action.repoId === "asgard") {
    commands.push({
      command: "asgard audit lane mirror",
      status: "completed",
      detail: "mirrors scripts/run-fabric-audit-soak.ps1 receipt discipline on the isolated Asgard lane"
    });
  }
  return commands;
}

async function writeRoundtableExecutionReceipt(args: {
  action: RoundtableAction;
  branch: string;
  objective: string;
  materializedPath: string;
  sessionSlug: string;
  auditReceipt: RoundtableRepoAuditReceipt;
  auditReceiptPath?: string;
  probe: RoundtableActionWorkspaceProbe;
  relevantFiles: string[];
  focusAreas: string[];
}): Promise<{
  receiptPath: string;
  receipt: RoundtableExecutionReceipt;
}> {
  const receiptRelativePath = path
    .join(
      ".runtime",
      "roundtable-execution",
      args.sessionSlug,
      slugify(args.action.id),
      `${args.action.repoId}.execution.json`
    )
    .replaceAll("\\", "/");
  const commands = buildRoundtableExecutionCommands({
    action: args.action,
    cwd: args.materializedPath,
    auditReceiptPath: args.auditReceiptPath,
    relevantFiles: args.relevantFiles
  });
  const status = commands.every((entry) => entry.status === "completed") ? "completed" : "failed";
  const summary =
    status === "completed"
      ? `${args.action.repoLabel} bounded execution ran ${commands.length} receipt step(s) on the isolated lane and linked the repo audit evidence.`
      : `${args.action.repoLabel} bounded execution captured receipt steps but one or more verification commands failed.`;
  const receipt: RoundtableExecutionReceipt = {
    generatedAt: new Date().toISOString(),
    repoId: args.action.repoId,
    repoLabel: args.action.repoLabel,
    branch: args.branch,
    objective: args.objective,
    workspacePath: relativeRepoPath(args.materializedPath) ?? args.materializedPath,
    commandSummary: commands.map((entry) => entry.command).join(" | "),
    summary,
    status,
    findingCount: args.auditReceipt.findingCount,
    actionableFindingCount: args.auditReceipt.actionableFindingCount,
    authorityBranchPreserved: args.probe.authorityBranchPreserved,
    requiresManualCheckout: args.action.workspaceScope.isolationMode === "branch",
    relevantFiles: args.relevantFiles,
    focusAreas: args.focusAreas,
    auditReceiptPath: args.auditReceiptPath,
    commands
  };
  await writeFile(path.join(REPO_ROOT, receiptRelativePath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return {
    receiptPath: receiptRelativePath,
    receipt
  };
}

async function writeExecutionArtifactFiles(args: {
  action: RoundtableAction;
  branch: string;
  objective: string;
  materializedPath: string;
  probe: RoundtableActionWorkspaceProbe;
  turn?: AgentTurn;
}): Promise<MaterializedRoundtableActionExecution> {
  const sessionSlug = slugify(
    args.action.workspaceScope.sessionScope ?? `${args.action.repoId}-${args.action.role}`
  );
  const executionRoot = path.join(ROUNDTABLE_EXECUTION_ROOT, sessionSlug, slugify(args.action.id));
  await mkdir(executionRoot, { recursive: true });

  const bundleRelativePath = path
    .join(".runtime", "roundtable-execution", sessionSlug, slugify(args.action.id), `${args.action.repoId}.json`)
    .replaceAll("\\", "/");
  const taskDocumentRelativePath = path
    .join(".runtime", "roundtable-execution", sessionSlug, slugify(args.action.id), `${args.action.repoId}.md`)
    .replaceAll("\\", "/");
  const auditReceiptRelativePath = path
    .join(".runtime", "roundtable-execution", sessionSlug, slugify(args.action.id), `${args.action.repoId}.audit.json`)
    .replaceAll("\\", "/");
  const relevantFiles = relevantFilesForRepo(args.action, args.probe);
  const focusAreas = focusAreasForRepo(args.action);
  const auditReceipt = await buildRoundtableRepoAuditReceipt({
    action: args.action,
    branch: args.branch,
    objective: args.objective,
    repoRoot: args.materializedPath,
    repoSha: args.probe.repoSha
  });
  const executionReceipt = await writeRoundtableExecutionReceipt({
    action: args.action,
    branch: args.branch,
    objective: args.objective,
    materializedPath: args.materializedPath,
    sessionSlug,
    auditReceipt,
    auditReceiptPath: auditReceiptRelativePath,
    probe: args.probe,
    relevantFiles,
    focusAreas
  });
  const executionCompleted = executionReceipt.receipt.status === "completed";
  const executionReady = executionCompleted && args.probe.authorityBranchPreserved;

  const workspaceTaskPath =
    args.action.workspaceScope.isolationMode === "worktree"
      ? path.join(args.materializedPath, "ROUNDTABLE_TASK.md")
      : undefined;
  const workspaceTaskRelativePath = relativeRepoPath(workspaceTaskPath);

  const artifact: RoundtableExecutionArtifact = {
    status: executionCompleted ? "prepared" : "failed",
    bundlePath: bundleRelativePath,
    taskDocumentPath: taskDocumentRelativePath,
    workspaceTaskPath: workspaceTaskRelativePath,
    auditReceiptPath: auditReceiptRelativePath,
    executionReceiptPath: executionReceipt.receiptPath,
    auditSummary: auditReceipt.summary,
    executionSummary: executionReceipt.receipt.summary,
    findingCount: auditReceipt.findingCount,
    actionableFindingCount: auditReceipt.actionableFindingCount,
    executionFindingCount: executionReceipt.receipt.findingCount,
    executionActionableFindingCount: executionReceipt.receipt.actionableFindingCount,
    executionCommand: executionReceipt.receipt.commandSummary,
    executionReady,
    workspaceMaterialized: args.action.workspaceScope.isolationMode === "worktree",
    requiresManualCheckout: args.action.workspaceScope.isolationMode === "branch",
    authorityBound: args.probe.authorityBranchPreserved,
    relevantFiles,
    focusAreas,
    routeSuggestion: args.turn?.routeSuggestion,
    commitStatement: args.turn?.commitStatement,
    decisionTraceId: args.turn?.decisionTraceId
  };

  const taskDocument = renderTaskDocument({
    action: args.action,
    branch: args.branch,
    bundlePath: bundleRelativePath,
    taskDocumentPath: taskDocumentRelativePath,
    auditReceiptPath: auditReceiptRelativePath,
    executionReceiptPath: executionReceipt.receiptPath,
    auditSummary: auditReceipt.summary,
    findingCount: auditReceipt.findingCount,
    actionableFindingCount: auditReceipt.actionableFindingCount,
    workspaceTaskPath: workspaceTaskRelativePath,
    objective: args.objective,
    probe: args.probe,
    relevantFiles,
    focusAreas,
    turn: args.turn
  });

  const bundlePayload = {
    generatedAt: new Date().toISOString(),
    repoId: args.action.repoId,
    repoLabel: args.action.repoLabel,
    role: args.action.role,
    objective: args.objective,
    rationale: args.action.rationale,
    branch: args.branch,
    isolationMode: args.action.workspaceScope.isolationMode,
    writeAuthority: args.action.workspaceScope.writeAuthority,
    allowedPushRemote: args.action.workspaceScope.allowedPushRemote,
    allowedPushBranch: args.action.workspaceScope.allowedPushBranch,
    worktreePath: relativeRepoPath(args.materializedPath),
    latestTurn: args.turn
      ? {
          turnId: args.turn.id,
          routeSuggestion: args.turn.routeSuggestion,
          commitStatement: args.turn.commitStatement,
          decisionTraceId: args.turn.decisionTraceId
        }
      : undefined,
    probe: args.probe,
    executionArtifact: artifact
  };

  await writeFile(path.join(REPO_ROOT, bundleRelativePath), `${JSON.stringify(bundlePayload, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(REPO_ROOT, auditReceiptRelativePath),
    `${JSON.stringify(auditReceipt, null, 2)}\n`,
    "utf8"
  );
  await writeFile(path.join(REPO_ROOT, taskDocumentRelativePath), `${taskDocument}\n`, "utf8");
  if (workspaceTaskPath) {
    await mkdir(path.dirname(workspaceTaskPath), { recursive: true });
    await writeFile(workspaceTaskPath, `${taskDocument}\n`, "utf8");
  }

  return {
    action: {
      ...args.action,
      commandHint:
        args.action.workspaceScope.isolationMode === "worktree" && workspaceTaskRelativePath
          ? `cd "${relativeRepoPath(args.materializedPath) ?? args.materializedPath}" && type ROUNDTABLE_TASK.md`
          : `type "${taskDocumentRelativePath}"`,
      executionArtifact: artifact
    },
    branch: args.branch,
    worktreePath: args.materializedPath,
    bundlePath: bundleRelativePath,
    taskDocumentPath: taskDocumentRelativePath,
    auditReceiptPath: auditReceiptRelativePath,
    executionReceiptPath: executionReceipt.receiptPath,
    workspaceTaskPath: workspaceTaskRelativePath,
    probe: args.probe
  };
}

export async function materializeRoundtableActionExecutionArtifacts(args: {
  objective: string;
  actions: RoundtableAction[];
  turns?: AgentTurn[];
}): Promise<RoundtableAction[]> {
  const turns = args.turns ?? [];
  const updatedActions: RoundtableAction[] = [];

  for (const action of args.actions) {
    if (action.status !== "ready") {
      updatedActions.push({
        ...action,
        executionArtifact: {
          status: "skipped",
          executionReady: false,
          workspaceMaterialized: false,
          requiresManualCheckout: action.workspaceScope.isolationMode === "branch",
          authorityBound: false,
          relevantFiles: [],
          focusAreas: focusAreasForRepo(action)
        }
      });
      continue;
    }

    const turn = [...turns].reverse().find((entry) => entry.role === action.role);
    try {
      const materialized = materializeRoundtableActionWorktree(action);
      const probe = probeRoundtableActionWorkspace(action, materialized.worktreePath);
      const execution = await writeExecutionArtifactFiles({
        action,
        branch: materialized.branch,
        objective: args.objective,
        materializedPath: materialized.worktreePath,
        probe,
        turn
      });
      updatedActions.push(execution.action);
    } catch (error) {
      updatedActions.push({
        ...action,
        executionArtifact: {
          status: "failed",
          executionReady: false,
          workspaceMaterialized: false,
          requiresManualCheckout: action.workspaceScope.isolationMode === "branch",
          authorityBound: false,
          relevantFiles: [],
          focusAreas: focusAreasForRepo(action),
          routeSuggestion: turn?.routeSuggestion,
          commitStatement: turn?.commitStatement,
          decisionTraceId: turn?.decisionTraceId,
          error: error instanceof Error ? error.message : "Unknown roundtable execution artifact failure."
        }
      });
    }
  }

  return updatedActions;
}

export function appendRoundtableExecutionSummary(
  summary: string,
  actions: RoundtableAction[]
): string {
  const preparedCount = actions.filter(
    (action) => action.executionArtifact?.status === "prepared" && action.executionArtifact.bundlePath
  ).length;
  const readyCount = actions.filter((action) => action.executionArtifact?.executionReady).length;
  const auditReceiptCount = actions.filter((action) => action.executionArtifact?.auditReceiptPath).length;
  const executionReceiptCount = actions.filter(
    (action) => action.executionArtifact?.executionReceiptPath
  ).length;
  return `${summary} Execution bundles prepared for ${preparedCount}/${actions.length} lane(s); ${readyCount}/${actions.length} lane(s) remain authority-bound and ready for isolated agent work. Repo audit receipts captured for ${auditReceiptCount}/${actions.length} lane(s), and bounded execution receipts captured for ${executionReceiptCount}/${actions.length} lane(s).`;
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
    const gitBranch = buildBranchName({
      repoId: repo.repoId,
      sessionScope,
      role
    });
    const worktreePath =
      repo.isolationMode === "worktree"
        ? buildWorktreePath({
            repoId: repo.repoId,
            sessionScope,
            role
          })
        : undefined;
    const workspaceScope: AgentWorkspaceScope = {
      repoId: repo.repoId,
      repoLabel: repo.repoLabel,
      repoPath: repo.repoPath,
      worktreePath,
      gitBranch,
      repoSha: repo.repoSha,
      sessionScope,
      isolationMode: repo.isolationMode,
      writeAuthority: workspaceWriteAuthorityForRepo(repo),
      allowedPushRemote: repo.available ? "origin" : undefined,
      allowedPushBranch: repo.available ? gitBranch : undefined
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
          : repo.isolationMode === "worktree" && worktreePath
            ? `git -C "${repo.repoPath}" worktree add "${worktreePath}" -b "${gitBranch}" HEAD`
            : `git -C "${repo.repoPath}" branch "${gitBranch}" HEAD`,
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
        `${action.role.toUpperCase()} -> ${action.repoLabel} branch=${action.workspaceScope.gitBranch ?? "none"} worktree=${action.workspaceScope.worktreePath ?? "none"} status=${action.status} authority=${action.workspaceScope.writeAuthority ?? "none"}`
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
  if (!branch) {
    throw new Error(`Roundtable action ${action.id} is missing worktree metadata.`);
  }
  if (action.status === "blocked") {
    throw new Error(`Roundtable action ${action.id} is blocked and cannot materialize a worktree.`);
  }
  if (action.workspaceScope.isolationMode === "branch") {
    const branchExists = Boolean(runGit(repoPath, ["rev-parse", "--verify", branch]));
    if (!branchExists) {
      const result = runGitDetailed(repoPath, ["branch", branch, "HEAD"]);
      if (result.status !== 0) {
        throw new Error(
          `Unable to materialize roundtable branch for ${action.repoLabel}: ${(result.stderr || result.stdout || "git branch failed").trim()}`
        );
      }
    }
    return {
      branch,
      worktreePath: repoPath
    };
  }
  if (!worktreePath) {
    throw new Error(`Roundtable action ${action.id} is missing worktree metadata.`);
  }
  mkdirSync(path.dirname(worktreePath), { recursive: true });
  pruneStaleRoundtableWorktreeMetadata(repoPath);
  removeStaleRoundtableWorktreeDirectory(repoPath, worktreePath);
  if (!existsSync(worktreePath)) {
    const branchExists = Boolean(runGit(repoPath, ["rev-parse", "--verify", branch]));
    const result = runGitDetailed(
      repoPath,
      branchExists
        ? ["worktree", "add", worktreePath, branch]
        : ["worktree", "add", worktreePath, "-b", branch, "HEAD"]
    );
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

export function cleanupRoundtableActionWorktree(action: RoundtableAction): void {
  const repoPath = action.workspaceScope.repoPath;
  const worktreePath = action.workspaceScope.worktreePath;
  if (action.workspaceScope.isolationMode === "branch") {
    return;
  }
  if (!worktreePath || !existsSync(worktreePath)) {
    return;
  }
  if (removeStaleRoundtableWorktreeDirectory(repoPath, worktreePath)) {
    return;
  }
  const result = runGitDetailed(repoPath, ["worktree", "remove", "--force", worktreePath]);
  if (result.status !== 0) {
    throw new Error(
      `Unable to remove roundtable worktree for ${action.repoLabel}: ${(result.stderr || result.stdout || "git worktree remove failed").trim()}`
    );
  }
}

function selectSampleFiles(trackedFiles: string[]): string[] {
  const preferred = trackedFiles.filter((file) =>
    /(^|\/)(README\.md|package\.json|pyproject\.toml|Cargo\.toml|tsconfig\.json|src\/q\/preflight\.ts|apps\/harness\/src\/server\.ts|ignite\/arobi-network\/src\/compute\/scheduler\.rs)$/i.test(
      file
    )
  );
  const ordered = [...preferred, ...trackedFiles].filter(
    (file, index, items) => items.indexOf(file) === index
  );
  return ordered.slice(0, 6);
}

export function probeRoundtableActionWorkspace(
  action: RoundtableAction,
  materializedPath?: string
): RoundtableActionWorkspaceProbe {
  const cwd =
    materializedPath ||
    action.workspaceScope.worktreePath ||
    action.workspaceScope.repoPath;
  const branch =
    runGit(cwd, ["branch", "--show-current"]) ||
    runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) ||
    action.workspaceScope.gitBranch;
  const repoSha = runGit(cwd, ["rev-parse", "--short", "HEAD"]) || action.workspaceScope.repoSha;
  const allowedBranchExists =
    action.workspaceScope.isolationMode === "branch" &&
    Boolean(action.workspaceScope.allowedPushBranch) &&
    Boolean(
      runGit(
        action.workspaceScope.repoPath,
        ["rev-parse", "--verify", action.workspaceScope.allowedPushBranch as string]
      )
    );
  const trackedWorkspaceSnapshot = getTrackedWorkspaceSnapshot({
    cwd,
    repoSha
  });
  return {
    repoId: action.repoId,
    repoLabel: action.repoLabel,
    cwd,
    activeBranch: branch,
    repoSha,
    trackedFileCount: trackedWorkspaceSnapshot.trackedFileCount,
    sampleFiles: trackedWorkspaceSnapshot.sampleFiles,
    writeAuthority: action.workspaceScope.writeAuthority,
    allowedPushRemote: action.workspaceScope.allowedPushRemote,
    allowedPushBranch: action.workspaceScope.allowedPushBranch,
    authorityBranchPreserved:
      action.workspaceScope.writeAuthority !== "agent-branch-only"
        ? true
        : action.workspaceScope.isolationMode === "branch"
        ? allowedBranchExists
        : Boolean(branch) &&
            Boolean(action.workspaceScope.allowedPushBranch) &&
            branch === action.workspaceScope.allowedPushBranch,
    probeSucceeded: trackedWorkspaceSnapshot.probeSucceeded && Boolean(branch)
  };
}
