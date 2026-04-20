import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";
import { buildRoundtableActionPlan } from "./roundtable.js";

type RoundtableActionabilitySurface = {
  generatedAt: string;
  release: ReleaseMetadata;
  planner: {
    objective: string;
    sessionScope?: string;
    repoCount: number;
    actionCount: number;
    readyCount: number;
    isolatedActionCount: number;
    parallelFormationMode?: string;
    parallelFormationSummary?: string;
  };
  repositories: Array<{
    repoId: string;
    repoLabel: string;
    gitBranch?: string;
    repoSha?: string;
  }>;
  actions: Array<{
    id: string;
    repoLabel: string;
    role: string;
    gitBranch?: string;
    isolationMode: string;
    writeAuthority?: string;
    allowedPushRemote?: string;
    allowedPushBranch?: string;
    status: string;
  }>;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const OBJECTIVE =
  "Strengthen Q, Immaculate, OpenJaws, and Arobi Network audit routing under mixed pressure without drift while keeping agent work isolated per repo.";

function renderMarkdown(report: RoundtableActionabilitySurface): string {
  return [
    "# Roundtable Actionability",
    "",
    "This page is generated from the live roundtable planner. It proves Immaculate can turn a cross-project objective into isolated repo-scoped agent lanes instead of treating roundtable conversation as text only.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``,
    "",
    "## Planner",
    "",
    `- Objective: ${report.planner.objective}`,
    `- Session scope: \`${report.planner.sessionScope ?? "none"}\``,
    `- Repo coverage: \`${report.planner.repoCount}\` repo(s)`,
    `- Action count: \`${report.planner.actionCount}\``,
    `- Isolated actions: \`${report.planner.isolatedActionCount}\``,
    `- Ready actions: \`${report.planner.readyCount}\``,
    `- Parallel formation: \`${report.planner.parallelFormationMode ?? "n/a"}\``,
    `- Formation summary: ${report.planner.parallelFormationSummary ?? "n/a"}`,
    "",
    "## Repo Coverage",
    "",
    ...report.repositories.map(
      (repo) =>
        `- ${repo.repoLabel}: branch \`${repo.gitBranch ?? "unknown"}\` / commit \`${repo.repoSha ?? "unknown"}\``
    ),
    "",
    "## Isolated Actions",
    "",
    ...report.actions.map(
      (action) =>
        `- ${action.repoLabel} / ${action.role}: branch \`${action.gitBranch ?? "none"}\` / isolation \`${action.isolationMode}\` / authority \`${action.writeAuthority ?? "none"}\` / push \`${action.allowedPushRemote ?? "none"}/${action.allowedPushBranch ?? "none"}\` / status \`${action.status}\``
    )
  ].join("\n");
}

async function main(): Promise<void> {
  const plan = buildRoundtableActionPlan({
    objective: OBJECTIVE,
    consentScope: "session:roundtable-actionability",
    schedule: {
      id: "roundtable-actionability",
      mode: "guarded-swarm",
      executionTopology: "parallel-then-guard",
      parallelWidth: 3,
      parallelFormationMode: "hybrid-quorum",
      parallelFormationSummary: "vertical=2 / horizontal=2 / quorum=2 / backpressure=degrade",
      layerRoles: ["mid", "reasoner", "guard"]
    }
  });
  if (plan.actions.length === 0) {
    throw new Error("Roundtable planner did not produce any isolated actions.");
  }
  const report: RoundtableActionabilitySurface = {
    generatedAt: new Date().toISOString(),
    release: await resolveReleaseMetadata(),
    planner: {
      objective: OBJECTIVE,
      sessionScope: plan.sessionScope,
      repoCount: plan.repoCount,
      actionCount: plan.actions.length,
      readyCount: plan.readyCount,
      isolatedActionCount: plan.actions.filter(
        (action) => action.workspaceScope.isolationMode === "branch" || action.workspaceScope.isolationMode === "worktree"
      ).length,
      parallelFormationMode: "hybrid-quorum",
      parallelFormationSummary: plan.summary
    },
    repositories: plan.repositories
      .filter((repo) => repo.available)
      .map((repo) => ({
        repoId: repo.repoId,
        repoLabel: repo.repoLabel,
        gitBranch: repo.gitBranch,
        repoSha: repo.repoSha
      })),
    actions: plan.actions.map((action) => ({
      id: action.id,
      repoLabel: action.repoLabel,
      role: action.role,
      gitBranch: action.workspaceScope.gitBranch,
      isolationMode: action.workspaceScope.isolationMode,
      writeAuthority: action.workspaceScope.writeAuthority,
      allowedPushRemote: action.workspaceScope.allowedPushRemote,
      allowedPushBranch: action.workspaceScope.allowedPushBranch,
      status: action.status
    })),
    output: {
      jsonPath: "docs/wiki/Roundtable-Actionability.json",
      markdownPath: "docs/wiki/Roundtable-Actionability.md"
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Roundtable actionability generation failed.");
  process.exitCode = 1;
});
