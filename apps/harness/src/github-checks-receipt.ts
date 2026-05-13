import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveReleaseMetadata } from "./release-metadata.js";

type WorkflowRunsResponse = {
  total_count?: number;
  workflow_runs?: Array<{
    id: number;
    name: string;
    path?: string;
    html_url: string;
    event?: string;
    status?: string;
    conclusion?: string | null;
    run_number?: number;
    created_at?: string;
    updated_at?: string;
    head_sha?: string;
  }>;
};

type CheckRunsResponse = {
  total_count?: number;
  check_runs?: Array<{
    id: number;
    name: string;
    html_url?: string;
    details_url?: string;
    status?: string;
    conclusion?: string | null;
    started_at?: string;
    completed_at?: string;
  }>;
};

type CommitResponse = {
  html_url?: string;
};

type StatusResponse = {
  state?: string;
  statuses?: Array<{
    context?: string;
    state?: string;
    target_url?: string;
  }>;
};

type GitHubChecksReceipt = {
  generatedAt: string;
  repo: {
    fullName: string;
    htmlUrl: string;
  };
  targetCommit: {
    sha: string;
    shortSha: string;
    htmlUrl: string;
  };
  release: {
    buildId: string;
    branch: string;
  };
  verification: {
    source: string;
    classicStatusState?: string;
    classicStatusContexts: number;
    workflowRunCount: number;
    checkRunCount: number;
    allWorkflowRunsSuccessful: boolean;
    allCheckRunsSuccessful: boolean;
  };
  workflows: Array<{
    name: string;
    runNumber?: number;
    event?: string;
    status?: string;
    conclusion?: string | null;
    htmlUrl: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  checkRuns: Array<{
    name: string;
    status?: string;
    conclusion?: string | null;
    url?: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  truthBoundary: string[];
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

type GitHubChecksReceiptSource = "github-rest" | "gh-auth";

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const GH_CLI_API_TIMEOUT_MS = 30_000;

function runGit(args: string[]): string | undefined {
  const result = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return undefined;
  }
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

function parseArgs(argv: string[]): {
  repoFullName?: string;
  sha?: string;
  outputBaseName: string;
} {
  const parsed = {
    outputBaseName: "GitHub-Checks-Receipt"
  } as {
    repoFullName?: string;
    sha?: string;
    outputBaseName: string;
  };

  for (const arg of argv) {
    if (arg.startsWith("--repo=")) {
      parsed.repoFullName = arg.slice("--repo=".length).trim();
      continue;
    }
    if (arg.startsWith("--sha=")) {
      parsed.sha = arg.slice("--sha=".length).trim();
      continue;
    }
    if (arg.startsWith("--output-base-name=")) {
      parsed.outputBaseName = arg.slice("--output-base-name=".length).trim() || parsed.outputBaseName;
    }
  }

  return parsed;
}

function inferRepoFullName(): string {
  const remote = runGit(["remote", "get-url", "origin"]);
  if (!remote) {
    throw new Error("Unable to determine origin remote for GitHub checks receipt.");
  }

  const normalized = remote.trim().replace(/\.git$/u, "");
  const sshMatch = normalized.match(/github\.com[:/](.+\/.+)$/u);
  if (sshMatch?.[1]) {
    return sshMatch[1];
  }

  throw new Error(`Unable to parse GitHub repository from remote URL: ${remote}`);
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

export async function fetchGitHubJson<T>(
  apiPath: string,
  options?: {
    fetchImpl?: typeof fetch;
    ghApiImpl?: <Value>(apiPath: string) => Value;
    token?: string;
  }
): Promise<{
  data: T;
  source: GitHubChecksReceiptSource;
}> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const authToken = options?.token ?? token;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const ghApiImpl = options?.ghApiImpl ?? ghApi;
  const url = `https://api.github.com/${apiPath}`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "Immaculate-GitHub-Checks-Receipt",
        Accept: "application/vnd.github+json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
      }
    });

    if (response.ok) {
      return {
        data: (await response.json()) as T,
        source: "github-rest"
      };
    }
  } catch {
    // Fall back to the authenticated gh CLI path below.
  }

  return {
    data: ghApiImpl<T>(apiPath),
    source: "gh-auth"
  };
}

function normalizeConclusion(conclusion: string | null | undefined): string {
  return conclusion?.trim() || "unknown";
}

function workflowSuccess(workflow: { conclusion?: string | null; status?: string }): boolean {
  return workflow.status === "completed" && normalizeConclusion(workflow.conclusion) === "success";
}

function checkRunSuccess(checkRun: { conclusion?: string | null; status?: string }): boolean {
  if (checkRun.status !== "completed") {
    return false;
  }
  const conclusion = normalizeConclusion(checkRun.conclusion);
  return conclusion === "success" || conclusion === "skipped" || conclusion === "neutral";
}

function renderMarkdown(receipt: GitHubChecksReceipt): string {
  return [
    "# GitHub Checks Receipt",
    "",
    "This page is generated from GitHub's raw REST checks surfaces for a specific commit.",
    "It exists because classic commit status contexts can be empty even when GitHub Actions check-runs are green.",
    "",
    `- Generated: ${receipt.generatedAt}`,
    `- Repository: \`${receipt.repo.fullName}\``,
    `- Target commit: \`${receipt.targetCommit.shortSha}\``,
    `- Commit URL: ${receipt.targetCommit.htmlUrl}`,
    `- Release build: \`${receipt.release.buildId}\``,
    `- Branch hint: \`${receipt.release.branch}\``,
    "",
    "## Result",
    "",
    `- Workflow runs found: \`${receipt.verification.workflowRunCount}\``,
    `- Check runs found: \`${receipt.verification.checkRunCount}\``,
    `- Classic status contexts found: \`${receipt.verification.classicStatusContexts}\``,
    `- Classic combined status state: \`${receipt.verification.classicStatusState ?? "missing"}\``,
    `- All workflow runs successful: \`${receipt.verification.allWorkflowRunsSuccessful}\``,
    `- All check runs successful: \`${receipt.verification.allCheckRunsSuccessful}\``,
    "",
    "## Workflow Runs",
    "",
    ...receipt.workflows.map(
      (workflow) =>
        `- ${workflow.name} #${workflow.runNumber ?? "?"}: \`${workflow.conclusion ?? workflow.status ?? "unknown"}\` (${workflow.htmlUrl})`
    ),
    "",
    "## Check Runs",
    "",
    ...receipt.checkRuns.map(
      (checkRun) =>
        `- ${checkRun.name}: \`${checkRun.conclusion ?? checkRun.status ?? "unknown"}\`${checkRun.url ? ` (${checkRun.url})` : ""}`
    ),
    "",
    "## Truth Boundary",
    "",
    ...receipt.truthBoundary.map((entry) => `- ${entry}`)
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const release = await resolveReleaseMetadata();
  const repoFullName = args.repoFullName || inferRepoFullName();
  const sha = args.sha || release.gitSha;
  const outputBaseName = args.outputBaseName;

  const [workflowRunsResult, checkRunsResult, commitResult, classicStatusResult] = await Promise.all([
    fetchGitHubJson<WorkflowRunsResponse>(`repos/${repoFullName}/actions/runs?head_sha=${sha}`),
    fetchGitHubJson<CheckRunsResponse>(`repos/${repoFullName}/commits/${sha}/check-runs`),
    fetchGitHubJson<CommitResponse>(`repos/${repoFullName}/commits/${sha}`),
    fetchGitHubJson<StatusResponse>(`repos/${repoFullName}/commits/${sha}/status`).catch(
      () =>
        ({
          data: {
            state: undefined,
            statuses: []
          } satisfies StatusResponse,
          source: undefined
        })
    )
  ]);
  const workflowRuns = workflowRunsResult.data;
  const checkRuns = checkRunsResult.data;
  const commit = commitResult.data;
  const classicStatus = classicStatusResult.data;
  const receiptSource = [workflowRunsResult, checkRunsResult, commitResult, classicStatusResult].some(
    (result) => result.source === "gh-auth"
  )
    ? "github-rest+gh-auth"
    : "github-rest";

  const workflowEntries = (workflowRuns.workflow_runs || []).map((workflow) => ({
    name: workflow.name,
    runNumber: workflow.run_number,
    event: workflow.event,
    status: workflow.status,
    conclusion: workflow.conclusion,
    htmlUrl: workflow.html_url,
    createdAt: workflow.created_at,
    updatedAt: workflow.updated_at
  }));

  const checkRunEntries = (checkRuns.check_runs || []).map((checkRun) => ({
    name: checkRun.name,
    status: checkRun.status,
    conclusion: checkRun.conclusion,
    url: checkRun.details_url || checkRun.html_url,
    startedAt: checkRun.started_at,
    completedAt: checkRun.completed_at
  }));

  const receipt: GitHubChecksReceipt = {
    generatedAt: new Date().toISOString(),
    repo: {
      fullName: repoFullName,
      htmlUrl: `https://github.com/${repoFullName}`
    },
    targetCommit: {
      sha,
      shortSha: sha.slice(0, 7),
      htmlUrl: commit.html_url || `https://github.com/${repoFullName}/commit/${sha}`
    },
    release: {
      buildId: release.buildId,
      branch: release.gitBranch
    },
    verification: {
      source: receiptSource,
      classicStatusState: classicStatus.state,
      classicStatusContexts: classicStatus.statuses?.length ?? 0,
      workflowRunCount: workflowEntries.length,
      checkRunCount: checkRunEntries.length,
      allWorkflowRunsSuccessful: workflowEntries.length > 0 && workflowEntries.every(workflowSuccess),
      allCheckRunsSuccessful: checkRunEntries.length > 0 && checkRunEntries.every(checkRunSuccess)
    },
    workflows: workflowEntries,
    checkRuns: checkRunEntries,
    truthBoundary: [
      "GitHub Actions primarily publishes check-runs/check-suites, not classic commit status contexts.",
      "An empty classic status list does not mean the commit had no successful Actions runs.",
      "This receipt verifies the commit through raw GitHub REST workflow-run and check-run endpoints instead of a connector path that previously returned empty arrays."
    ],
    output: {
      jsonPath: path.join("docs", "wiki", `${outputBaseName}.json`),
      markdownPath: path.join("docs", "wiki", `${outputBaseName}.md`)
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, receipt.output.jsonPath), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, receipt.output.markdownPath), `${renderMarkdown(receipt)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : "GitHub checks receipt generation failed.");
    process.exitCode = 1;
  });
}
