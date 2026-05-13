import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type RepoMetadataResponse = {
  full_name?: string;
  html_url?: string;
  private?: boolean;
  default_branch?: string;
};

type WorkflowDefinitionsResponse = {
  workflows?: Array<{
    id?: number;
    name?: string;
    path?: string;
    state?: string;
  }>;
};

type WorkflowRunsResponse = {
  workflow_runs?: Array<{
    id?: number;
    workflow_id?: number;
    name?: string;
    path?: string;
    html_url?: string;
    status?: string;
    conclusion?: string | null;
    run_number?: number;
    event?: string;
    created_at?: string;
    updated_at?: string;
    head_branch?: string;
    head_sha?: string;
  }>;
};

type WorkflowRun = NonNullable<WorkflowRunsResponse["workflow_runs"]>[number];

type GitHubFetchSource = "github-rest-public" | "github-rest-token" | "gh-auth";

type WorkflowRunSummary = {
  name: string;
  workflowPath?: string;
  runNumber?: number;
  event?: string;
  status?: string;
  conclusion?: string | null;
  classification?: WorkflowRunClassification;
  classificationReason?: string;
  createdAt?: string;
  updatedAt?: string;
  htmlUrl?: string;
  headSha?: string;
};

type WorkflowRunClassification = "success" | "pending" | "failure" | "non_actionable";

type ActiveWorkflowDefinition = {
  id?: number;
  name: string;
  path?: string;
  state?: string;
};

type RepoWorkflowHealth = {
  label: string;
  repoFullName: string;
  repositoryUrl: string;
  visibility: "public" | "private";
  defaultBranch: string;
  access: {
    source: GitHubFetchSource;
    detail: string;
  };
  verification: {
    activeWorkflowCount: number;
    observedWorkflowCount: number;
    notRecentlyObservedWorkflowCount: number;
    nonActionableWorkflowCount: number;
    allObservedRunsSuccessful: boolean;
    allActionableRunsHealthy: boolean;
    latestObservedRunAt?: string;
  };
  workflows: {
    active: Array<{
      name: string;
      path?: string;
      state?: string;
    }>;
    latestObservedRuns: WorkflowRunSummary[];
    notRecentlyObserved: string[];
  };
};

type CrossProjectWorkflowHealthReport = {
  generatedAt: string;
  release: Omit<ReleaseMetadata, "q"> & {
    q: Pick<ReleaseMetadata["q"], "modelName" | "foundationModel" | "trainingLock" | "hybridSession">;
  };
  summary: {
    repoCount: number;
    fullyHealthyRepoCount: number;
    allObservedWorkflowRunsSuccessful: boolean;
    allActionableWorkflowRunsHealthy: boolean;
    detail: string;
  };
  repos: RepoWorkflowHealth[];
  truthBoundary: string[];
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const GITHUB_FETCH_TIMEOUT_MS = 15_000;
const GH_CLI_API_TIMEOUT_MS = 30_000;

const REPO_TARGETS = [
  {
    label: "Immaculate",
    repoFullName: "PossumXI/Immaculate"
  },
  {
    label: "OpenJaws",
    repoFullName: "PossumXI/OpenJaws"
  },
  {
    label: "Asgard_Arobi",
    repoFullName: "PossumXI/Asgard_Arobi"
  }
] as const;

function normalizeConclusion(conclusion: string | null | undefined): string {
  return conclusion?.trim() || "unknown";
}

function workflowRunSuccess(run: { status?: string; conclusion?: string | null }): boolean {
  return run.status === "completed" && normalizeConclusion(run.conclusion) === "success";
}

function isDynamicDependabotUpdate(run: {
  name?: string;
  workflowPath?: string;
  event?: string;
}): boolean {
  const name = run.name?.toLowerCase() ?? "";
  const workflowPath = run.workflowPath?.toLowerCase() ?? "";
  return (
    run.event === "dynamic" &&
    (name.includes("dependabot") || workflowPath.startsWith("dynamic/dependabot"))
  );
}

export function classifyWorkflowRunForReleaseHealth(run: {
  name?: string;
  workflowPath?: string;
  event?: string;
  status?: string;
  conclusion?: string | null;
}): {
  classification: WorkflowRunClassification;
  healthy: boolean;
  reason: string;
} {
  const conclusion = normalizeConclusion(run.conclusion);
  if (run.status === "completed" && (conclusion === "success" || conclusion === "skipped")) {
    return {
      classification: "success",
      healthy: true,
      reason: `workflow concluded ${conclusion}`
    };
  }
  if (run.status === "completed" && conclusion === "failure" && isDynamicDependabotUpdate(run)) {
    return {
      classification: "non_actionable",
      healthy: true,
      reason:
        "dynamic Dependabot update failure is tracked as dependency automation noise; code-bearing workflow evidence remains listed separately"
    };
  }
  if (run.status !== "completed") {
    return {
      classification: "pending",
      healthy: false,
      reason: `workflow is ${run.status ?? "unknown"}`
    };
  }
  return {
    classification: "failure",
    healthy: false,
    reason: `workflow concluded ${conclusion}`
  };
}

function ghApi<T>(apiPath: string): T {
  const result = spawnSync("gh", ["api", apiPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      GH_PAGER: "",
      PAGER: ""
    },
    timeout: GH_CLI_API_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) {
    throw new Error(
      `gh api failed for ${apiPath}: ${result.error.message || String(result.error)}`
    );
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `gh api failed for ${apiPath}`).trim());
  }
  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new Error(
      `gh api returned invalid JSON for ${apiPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function fetchGitHubJson<T>(
  apiPath: string
): Promise<{
  data: T;
  source: GitHubFetchSource;
}> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const request = async (authToken?: string) =>
    fetch(`https://api.github.com/${apiPath}`, {
      headers: {
        "User-Agent": "Immaculate-Cross-Project-Workflow-Health",
        Accept: "application/vnd.github+json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      },
      signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS)
    });

  let response: Response;
  try {
    response = await request(token);
  } catch (error) {
    try {
      return {
        data: ghApi<T>(apiPath),
        source: "gh-auth"
      };
    } catch (ghError) {
      throw new Error(
        `GitHub request failed for ${apiPath}: ${
          error instanceof Error ? error.message : String(error)
        }; gh fallback failed: ${
          ghError instanceof Error ? ghError.message : String(ghError)
        }`
      );
    }
  }
  if (response.ok) {
    return {
      data: (await response.json()) as T,
      source: token ? "github-rest-token" : "github-rest-public"
    };
  }

  try {
    return {
      data: ghApi<T>(apiPath),
      source: "gh-auth"
    };
  } catch (error) {
    throw new Error(
      `GitHub request failed (${response.status}) for ${apiPath}; gh fallback failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function dedupeLatestWorkflowRuns(
  runs: WorkflowRunsResponse["workflow_runs"],
  activeWorkflows: ActiveWorkflowDefinition[]
): {
  latestObservedRuns: WorkflowRunSummary[];
  notRecentlyObserved: string[];
} {
  const latestObservedRuns: WorkflowRunSummary[] = [];
  const seen = new Set<string>();
  const activeKeys = new Map<string, string>();

  for (const workflow of activeWorkflows) {
    const key =
      typeof workflow.id === "number" ? `id:${workflow.id}` : workflow.path?.trim() || workflow.name?.trim() || "";
    if (key.length > 0 && workflow.name) {
      activeKeys.set(key, workflow.name);
    }
  }

  for (const run of runs ?? []) {
    const key =
      typeof run.workflow_id === "number" ? `id:${run.workflow_id}` : run.path?.trim() || run.name?.trim() || "";
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const baseSummary = {
      name: run.name?.trim() || "unknown",
      workflowPath: run.path?.trim(),
      runNumber: run.run_number,
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url,
      headSha: run.head_sha
    };
    const classification = classifyWorkflowRunForReleaseHealth(baseSummary);
    latestObservedRuns.push({
      ...baseSummary,
      classification: classification.classification,
      classificationReason: classification.reason
    });
  }

  const notRecentlyObserved = [...activeKeys.entries()]
    .filter(([key]) => !seen.has(key))
    .map(([, name]) => name)
    .sort((left, right) => left.localeCompare(right));

  return {
    latestObservedRuns,
    notRecentlyObserved
  };
}

async function fetchLatestWorkflowRun(
  repoFullName: string,
  defaultBranch: string,
  workflow: ActiveWorkflowDefinition
): Promise<{
  run?: WorkflowRun;
  source: GitHubFetchSource;
}> {
  const workflowRef =
    typeof workflow.id === "number"
      ? String(workflow.id)
      : workflow.path?.trim() || workflow.name.trim();
  const response = await fetchGitHubJson<WorkflowRunsResponse>(
    `repos/${repoFullName}/actions/workflows/${encodeURIComponent(workflowRef)}/runs?branch=${encodeURIComponent(defaultBranch)}&per_page=1`
  );
  return {
    run: response.data.workflow_runs?.[0],
    source: response.source
  };
}

function summarizeRepoHealth(repo: RepoWorkflowHealth): string {
  const observed = repo.verification.observedWorkflowCount;
  const missing = repo.verification.notRecentlyObservedWorkflowCount;
  const outcome = repo.verification.allActionableRunsHealthy
    ? "latest actionable runs green"
    : "some actionable runs not green";
  const visibility = repo.visibility === "private" ? "private repo" : "public repo";
  return `${repo.label} (${visibility}, ${repo.access.source}): ${outcome}; observed ${observed}/${repo.verification.activeWorkflowCount} active workflows${missing > 0 ? `, ${missing} not recently observed` : ""}${repo.verification.nonActionableWorkflowCount > 0 ? `, ${repo.verification.nonActionableWorkflowCount} non-actionable dynamic workflow(s)` : ""}`;
}

export function redactWorkflowRunSummariesForVisibility(
  runs: WorkflowRunSummary[],
  visibility: RepoWorkflowHealth["visibility"]
): WorkflowRunSummary[] {
  if (visibility !== "private") {
    return runs;
  }
  return runs.map(({ htmlUrl: _htmlUrl, ...run }) => run);
}

function renderMarkdown(report: CrossProjectWorkflowHealthReport): string {
  return [
    "# Cross-Project Workflow Health",
    "",
    "This page is the machine-stamped GitHub Actions truth surface for the three coordinated repos in the current workstation orbit.",
    "It exists so operational claims do not rely on one green repo while another repo is red, inaccessible, or only visible through private GitHub auth.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Immaculate release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    "",
    "## Summary",
    "",
    `- Repo count: \`${report.summary.repoCount}\``,
    `- Fully healthy repos: \`${report.summary.fullyHealthyRepoCount}\``,
    `- All observed workflow runs successful: \`${report.summary.allObservedWorkflowRunsSuccessful}\``,
    `- All actionable workflow runs healthy: \`${report.summary.allActionableWorkflowRunsHealthy}\``,
    `- Detail: ${report.summary.detail}`,
    "",
    ...report.repos.flatMap((repo) => [
      `## ${repo.label}`,
      "",
      `- Repository: \`${repo.repoFullName}\``,
      `- Visibility: \`${repo.visibility}\``,
      `- Default branch: \`${repo.defaultBranch}\``,
      `- Access path: \`${repo.access.source}\` | ${repo.access.detail}`,
      `- Active workflows: \`${repo.verification.activeWorkflowCount}\``,
      `- Latest observed workflow runs: \`${repo.verification.observedWorkflowCount}\``,
      `- Not recently observed in the sampled branch window: \`${repo.verification.notRecentlyObservedWorkflowCount}\``,
      `- Non-actionable dynamic workflow runs: \`${repo.verification.nonActionableWorkflowCount}\``,
      `- All observed workflow runs successful: \`${repo.verification.allObservedRunsSuccessful}\``,
      `- All actionable workflow runs healthy: \`${repo.verification.allActionableRunsHealthy}\``,
      `- Latest observed run updated: \`${repo.verification.latestObservedRunAt ?? "unknown"}\``,
      "",
      "### Latest Observed Workflow Runs",
      "",
      ...(repo.workflows.latestObservedRuns.length > 0
        ? repo.workflows.latestObservedRuns.map((run) => {
            const link =
              repo.visibility === "public" && run.htmlUrl ? ` (${run.htmlUrl})` : repo.visibility === "private" ? " (private run URL withheld)" : "";
            return `- ${run.name} #${run.runNumber ?? "?"}: \`${run.conclusion ?? run.status ?? "unknown"}\` | \`${run.classification ?? "unknown"}\` - ${run.classificationReason ?? "unclassified"}${link}`;
          })
        : ["- none observed"]),
      "",
      "### Active Workflow Definitions",
      "",
      ...repo.workflows.active.map(
        (workflow) =>
          `- ${workflow.name}${workflow.path ? ` | \`${workflow.path}\`` : ""}${workflow.state ? ` | \`${workflow.state}\`` : ""}`
      ),
      "",
      "### Not Recently Observed",
      "",
      ...(repo.workflows.notRecentlyObserved.length > 0
        ? repo.workflows.notRecentlyObserved.map((name) => `- ${name}`)
        : ["- none"]),
      ""
    ]),
    "## Truth Boundary",
    "",
    ...report.truthBoundary.map((entry) => `- ${entry}`)
  ].join("\n");
}

async function buildRepoWorkflowHealth(
  target: (typeof REPO_TARGETS)[number]
): Promise<RepoWorkflowHealth> {
  const repoResponse = await fetchGitHubJson<RepoMetadataResponse>(`repos/${target.repoFullName}`);
  const repoData = repoResponse.data;
  const defaultBranch = repoData.default_branch?.trim() || "main";

  const workflowResponse = await fetchGitHubJson<WorkflowDefinitionsResponse>(
    `repos/${target.repoFullName}/actions/workflows?per_page=100`
  );

  const activeWorkflows: ActiveWorkflowDefinition[] = (workflowResponse.data.workflows ?? [])
    .filter((workflow) => workflow.state === "active")
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name?.trim() || "unknown",
      path: workflow.path?.trim(),
      state: workflow.state
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const workflowRunResponses: Array<Awaited<ReturnType<typeof fetchLatestWorkflowRun>>> = [];
  for (const workflow of activeWorkflows) {
    workflowRunResponses.push(
      await fetchLatestWorkflowRun(target.repoFullName, defaultBranch, workflow)
    );
  }
  const sampledRuns = workflowRunResponses
    .map((response) => response.run)
    .filter((run): run is WorkflowRun => Boolean(run));

  const { latestObservedRuns, notRecentlyObserved } = dedupeLatestWorkflowRuns(
    sampledRuns,
    activeWorkflows
  );

  const visibility = repoData.private === true ? "private" : "public";
  const visibleLatestObservedRuns = redactWorkflowRunSummariesForVisibility(
    latestObservedRuns,
    visibility
  );
  const nonActionableWorkflowCount = latestObservedRuns.filter(
    (run) => run.classification === "non_actionable"
  ).length;
  const allActionableRunsHealthy =
    latestObservedRuns.length > 0 &&
    latestObservedRuns.every((run) => classifyWorkflowRunForReleaseHealth(run).healthy);
  const sources = new Set<GitHubFetchSource>([
    repoResponse.source,
    workflowResponse.source,
    ...workflowRunResponses.map((response) => response.source)
  ]);

  return {
    label: target.label,
    repoFullName: repoData.full_name?.trim() || target.repoFullName,
    repositoryUrl: repoData.html_url?.trim() || `https://github.com/${target.repoFullName}`,
    visibility,
    defaultBranch,
    access: {
      source: sources.has("gh-auth")
        ? "gh-auth"
        : sources.has("github-rest-token")
          ? "github-rest-token"
          : "github-rest-public",
      detail:
        visibility === "private"
          ? "private repo required authenticated GitHub access; private workflow run URLs are withheld on this public receipt"
          : "public repo verified through GitHub Actions REST surfaces"
    },
    verification: {
      activeWorkflowCount: activeWorkflows.length,
      observedWorkflowCount: latestObservedRuns.length,
      notRecentlyObservedWorkflowCount: notRecentlyObserved.length,
      nonActionableWorkflowCount,
      allObservedRunsSuccessful:
        latestObservedRuns.length > 0 && latestObservedRuns.every(workflowRunSuccess),
      allActionableRunsHealthy,
      latestObservedRunAt: latestObservedRuns
        .map((run) => run.updatedAt || run.createdAt)
        .find((value) => typeof value === "string" && value.length > 0)
    },
    workflows: {
      active: activeWorkflows,
      latestObservedRuns: visibleLatestObservedRuns,
      notRecentlyObserved
    }
  };
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const repos: RepoWorkflowHealth[] = [];
  for (const target of REPO_TARGETS) {
    repos.push(await buildRepoWorkflowHealth(target));
  }
  const fullyHealthyRepoCount = repos.filter(
    (repo) =>
      repo.verification.observedWorkflowCount > 0 && repo.verification.allActionableRunsHealthy
  ).length;

  const report: CrossProjectWorkflowHealthReport = {
    generatedAt: new Date().toISOString(),
    release: {
      packageVersion: release.packageVersion,
      harnessVersion: release.harnessVersion,
      coreVersion: release.coreVersion,
      gitSha: release.gitSha,
      gitShortSha: release.gitShortSha,
      gitBranch: release.gitBranch,
      buildId: release.buildId,
      q: {
        modelName: release.q.modelName,
        foundationModel: release.q.foundationModel,
        trainingLock: release.q.trainingLock,
        hybridSession: release.q.hybridSession
      }
    },
    summary: {
      repoCount: repos.length,
      fullyHealthyRepoCount,
      allObservedWorkflowRunsSuccessful: repos.every(
        (repo) => repo.verification.observedWorkflowCount > 0 && repo.verification.allObservedRunsSuccessful
      ),
      allActionableWorkflowRunsHealthy: repos.every(
        (repo) => repo.verification.observedWorkflowCount > 0 && repo.verification.allActionableRunsHealthy
      ),
      detail: repos.map(summarizeRepoHealth).join(" | ")
    },
    repos,
    truthBoundary: [
      "This receipt verifies the latest observed GitHub Actions workflow runs on each repo's default branch; it does not claim local dirty branches were pushed or validated.",
      "Public repos are verified through raw GitHub REST endpoints when possible.",
      "Private repos fail closed unless authenticated GitHub access is available; when private access is used, private workflow run URLs are withheld from this public receipt.",
      "Dynamic Dependabot update failures are classified as non-actionable dependency automation noise; they remain listed instead of hidden and code-bearing workflow evidence remains separate.",
      "A workflow not recently observed in the sampled branch window is not treated as green by absence; it is explicitly listed as not recently observed.",
      "This page does not claim a live Discord mission, a fresh public Arobi write, or a fresh OCI provider probe."
    ],
    output: {
      jsonPath: path.join("docs", "wiki", "Cross-Project-Workflow-Health.json"),
      markdownPath: path.join("docs", "wiki", "Cross-Project-Workflow-Health.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : "Cross-project workflow health generation failed.");
    process.exitCode = 1;
  });
}
