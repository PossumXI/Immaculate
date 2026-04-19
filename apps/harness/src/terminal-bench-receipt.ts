import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type SubmissionAttemptFile = {
  generatedAt?: string;
  repoId?: string;
  submissionDir?: string;
  runLabel?: string;
  uploaded?: boolean;
  commitUrl?: string;
  pullRequestUrl?: string;
};

type TerminalBenchReceiptReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  leaderboard: {
    repo: string;
    status: "waiting-for-full-sweep";
    eligibleSubmissionActive: boolean;
    requiredUniqueTasks: number;
    localPublicTaskQualified: boolean;
    note: string;
    latestAttemptGeneratedAt?: string;
  };
  localPublicTask: {
    markdownPath: string;
    jsonPath: string;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function readOptionalJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return undefined;
  }
}

function renderMarkdown(report: TerminalBenchReceiptReport): string {
  return [
    "# Terminal-Bench Leaderboard Status",
    "",
    "This page tracks the real public leaderboard state for Q. The local public-task Harbor win is real, but the official Terminal-Bench leaderboard validator currently requires the full 89-task sweep, so there is no eligible current public receipt claimed from this checkout.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    `- Q serving label: \`${report.release.q.truthfulLabel}\``,
    `- Leaderboard repo: \`${report.leaderboard.repo}\``,
    `- Status: \`${report.leaderboard.status}\``,
    `- Eligible official receipt active: \`${report.leaderboard.eligibleSubmissionActive ? "yes" : "no"}\``,
    `- Required unique tasks: \`${report.leaderboard.requiredUniqueTasks}\``,
    `- Local public-task win qualified for leaderboard by itself: \`${report.leaderboard.localPublicTaskQualified ? "yes" : "no"}\``,
    "",
    "## Current Truth",
    "",
    `- ${report.leaderboard.note}`,
    `- The wins-first public measurement for Q remains [Terminal-Bench-Public-Task](${report.localPublicTask.markdownPath.replaceAll("\\", "/")}).`,
    "",
    ...(report.leaderboard.latestAttemptGeneratedAt
      ? [
          "## Latest Draft Submission Attempt",
          "",
          `- Generated: \`${report.leaderboard.latestAttemptGeneratedAt}\``,
          "",
        ]
      : []),
    "## Truth Boundary",
    "",
    "- This page is intentionally not a scorecard.",
    "- It does not claim a live official leaderboard win until a full 89-task sweep is submitted and accepted.",
    "- The local 5/5 Harbor public-task win is still real engineering evidence and remains published on the dedicated public-task page.",
  ].join("\n");
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const latestAttempt = await readOptionalJsonFile<SubmissionAttemptFile>(
    path.join(REPO_ROOT, ".runtime", "terminal-bench-submission", "latest-public-receipt-submission.json")
  );

  const report: TerminalBenchReceiptReport = {
    generatedAt: new Date().toISOString(),
    release,
    leaderboard: {
      repo: "harborframework/terminal-bench-2-leaderboard",
      status: "waiting-for-full-sweep",
      eligibleSubmissionActive: false,
      requiredUniqueTasks: 89,
      localPublicTaskQualified: false,
      note:
        "The official leaderboard validator expects the full 89-task Terminal-Bench 2.0 sweep. A single-task public-task win is not an eligible leaderboard receipt by itself.",
      latestAttemptGeneratedAt: latestAttempt?.generatedAt,
    },
    localPublicTask: {
      markdownPath: path.join("docs", "wiki", "Terminal-Bench-Public-Task.md"),
      jsonPath: path.join("docs", "wiki", "Terminal-Bench-Public-Task.json"),
    },
    output: {
      jsonPath: path.join("docs", "wiki", "Terminal-Bench-Receipt.json"),
      markdownPath: path.join("docs", "wiki", "Terminal-Bench-Receipt.md"),
    },
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Terminal-Bench receipt generation failed.");
  process.exitCode = 1;
});
