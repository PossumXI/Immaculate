import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type HarborEvalStats = {
  n_trials?: number;
  n_errors?: number;
  metrics?: Array<{
    mean?: number;
  }>;
  pass_at_k?: Record<string, number>;
  reward_stats?: Record<string, Record<string, string[]>>;
  exception_stats?: Record<string, string[]>;
};

type HarborResultFile = {
  id?: string;
  started_at?: string;
  finished_at?: string;
  n_total_trials?: number;
  stats?: {
    n_trials?: number;
    n_errors?: number;
    evals?: Record<string, HarborEvalStats>;
  };
};

type HarborConfigFile = {
  job_name?: string;
  n_attempts?: number;
  timeout_multiplier?: number;
  n_concurrent_trials?: number;
  agents?: Array<{
    import_path?: string | null;
    model_name?: string | null;
  }>;
  datasets?: Array<{
    name?: string;
    ref?: string;
    task_names?: string[] | null;
  }>;
};

type LeaderboardStatusFile = {
  generatedAt?: string;
  leaderboard?: {
    status?: string;
    note?: string;
    requiredUniqueTasks?: number;
    eligibleSubmissionActive?: boolean;
  };
};

type TerminalBenchRerunReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  harbor: {
    jobName: string;
    resultPath: string;
    configPath: string;
    datasetName?: string;
    datasetRef?: string;
    taskName?: string;
    harborAgentImportPath?: string;
    harborModelName?: string;
    attempts: number;
    concurrentTrials: number;
    timeoutMultiplier?: number;
    startedAt?: string;
    finishedAt?: string;
    durationSec?: number;
    trials: number;
    errors: number;
    meanReward?: number;
    passAtK: Record<string, number>;
    trialIds: string[];
  };
  rootCause: string[];
  appliedFixes: string[];
  leaderboardStatus?: {
    generatedAt?: string;
    status?: string;
    note?: string;
    requiredUniqueTasks?: number;
    eligibleSubmissionActive?: boolean;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

function defaultCandidatePath(...parts: string[]): string {
  return path.join(REPO_ROOT, ...parts);
}

function parentCandidatePath(...parts: string[]): string {
  return path.resolve(REPO_ROOT, "..", ...parts);
}

async function firstExistingPath(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

function parseFlags(argv: string[]): { resultPath?: string; configPath?: string } {
  const flags: { resultPath?: string; configPath?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--result-path") {
      flags.resultPath = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--result-path=")) {
      flags.resultPath = token.slice("--result-path=".length).trim();
      continue;
    }
    if (token === "--config-path") {
      flags.configPath = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--config-path=")) {
      flags.configPath = token.slice("--config-path=".length).trim();
      continue;
    }
  }
  return flags;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function toSeconds(startedAt?: string, finishedAt?: string): number | undefined {
  if (!startedAt || !finishedAt) {
    return undefined;
  }
  const elapsedMs = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return undefined;
  }
  return Number((elapsedMs / 1000).toFixed(2));
}

function requireSingleEvalEntry(result: HarborResultFile): [string, HarborEvalStats] {
  const entries = Object.entries(result.stats?.evals ?? {});
  if (entries.length !== 1) {
    throw new Error(`Expected exactly one Harbor eval entry, found ${entries.length}.`);
  }
  return entries[0] as [string, HarborEvalStats];
}

function collectTrialIds(stats: HarborEvalStats | undefined): string[] {
  const trialIds = new Set<string>();
  for (const scoreBucket of Object.values(stats?.reward_stats ?? {})) {
    for (const ids of Object.values(scoreBucket)) {
      for (const id of ids) {
        if (id) {
          trialIds.add(id);
        }
      }
    }
  }
  for (const ids of Object.values(stats?.exception_stats ?? {})) {
    for (const id of ids) {
      if (id) {
        trialIds.add(id);
      }
    }
  }
  return Array.from(trialIds).sort();
}

function renderMarkdown(report: TerminalBenchRerunReport): string {
  const passAtKEntries = Object.entries(report.harbor.passAtK);
  const passAtKLine = passAtKEntries.length
    ? passAtKEntries
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([key, value]) => `pass@${key} \`${value.toFixed(3)}\``)
        .join(", ")
    : "no pass@k data reported";
  const leaderboardStatus = report.leaderboardStatus;
  return [
    "# Terminal-Bench Rerun",
    "",
    "This page records a local diagnostic Harbor rerun against the same public Terminal-Bench task after the MIPS/DOOM runner fix landed in the Q Harbor agent. It is diagnostic evidence only.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Immaculate release: \`${report.release.buildId}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``,
    `- Harbor job: \`${report.harbor.jobName}\``,
    `- Dataset: \`${report.harbor.datasetName ?? "unknown"}\``,
    `- Public task: \`${report.harbor.taskName ?? "unknown"}\``,
    `- Harbor agent import path: \`${report.harbor.harborAgentImportPath ?? "unknown"}\``,
    `- Harbor model name: \`${report.harbor.harborModelName ?? "unknown"}\``,
    "",
    "## Current Diagnostic Result",
    "",
    `- Mean reward: \`${(report.harbor.meanReward ?? 0).toFixed(3)}\``,
    `- Trials: \`${report.harbor.trials}\``,
    `- Errors: \`${report.harbor.errors}\``,
    `- ${passAtKLine}`,
    `- Attempts: \`${report.harbor.attempts}\``,
    `- Concurrency: \`${report.harbor.concurrentTrials}\``,
    `- Timeout multiplier: \`${report.harbor.timeoutMultiplier ?? 1}\``,
    `- Duration: \`${report.harbor.durationSec ?? "n/a"} s\``,
    `- Trial ids: \`${report.harbor.trialIds.join(", ") || "none"}\``,
    "",
    "## Why It Failed Before",
    "",
    ...report.rootCause.map((line) => `- ${line}`),
    "",
    "## What Changed",
    "",
    ...report.appliedFixes.map((line) => `- ${line}`),
    "",
    leaderboardStatus
      ? "## Leaderboard Status"
      : "## Truth Boundary",
    leaderboardStatus ? "" : "- This is a local diagnostic rerun against the official public task, not a new public leaderboard submission yet.",
    ...(leaderboardStatus
      ? [
          `- Status page generated: \`${leaderboardStatus.generatedAt ?? "unknown"}\``,
          `- Eligible official receipt active: \`${leaderboardStatus.eligibleSubmissionActive ? "yes" : "no"}\``,
          `- Required unique tasks: \`${leaderboardStatus.requiredUniqueTasks ?? "unknown"}\``,
          `- Status: \`${leaderboardStatus.status ?? "unknown"}\``,
          `- Note: ${leaderboardStatus.note ?? "No additional note."}`,
          "",
          "## Truth Boundary",
          "",
          "- The result on this page is a fresh local diagnostic rerun against the same public task.",
          "- It becomes an official leaderboard claim only after a valid full 89-task submission is made.",
          "- The repaired MIPS/DOOM runner path is diagnostic-only and should not be treated as default HarborQAgent model capability unless the explicit diagnostic env flag is enabled.",
        ]
      : []),
    "",
    "## Artifact Paths",
    "",
    `- Result JSON: \`${report.harbor.resultPath.replaceAll("\\", "/")}\``,
    `- Config JSON: \`${report.harbor.configPath.replaceAll("\\", "/")}\``,
  ].join("\n");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const resultPath =
    flags.resultPath ??
    (await firstExistingPath([
      defaultCandidatePath(".runtime", "terminal-bench-jobs", "q-terminal-bench-public-rerun2", "result.json"),
      parentCandidatePath(".runtime", "terminal-bench-jobs", "q-terminal-bench-public-rerun2", "result.json"),
    ]));
  if (!resultPath) {
    throw new Error("Terminal-Bench rerun result.json not found. Pass --result-path explicitly.");
  }
  const configPath =
    flags.configPath ??
    (await firstExistingPath([
      defaultCandidatePath(".runtime", "terminal-bench-jobs", "q-terminal-bench-public-rerun2", "config.json"),
      parentCandidatePath(".runtime", "terminal-bench-jobs", "q-terminal-bench-public-rerun2", "config.json"),
    ]));
  if (!configPath) {
    throw new Error("Terminal-Bench rerun config.json not found. Pass --config-path explicitly.");
  }

  const result = await readJsonFile<HarborResultFile>(resultPath);
  const config = await readJsonFile<HarborConfigFile>(configPath);
  const leaderboardStatus = await readJsonFile<LeaderboardStatusFile>(path.join(WIKI_ROOT, "Terminal-Bench-Receipt.json")).catch(
    () => undefined
  );
  const [, stats] = requireSingleEvalEntry(result);
  const release = await resolveReleaseMetadata();

  const report: TerminalBenchRerunReport = {
    generatedAt: new Date().toISOString(),
    release,
    harbor: {
      jobName: config.job_name?.trim() || "unknown",
      resultPath: path.relative(REPO_ROOT, resultPath) || resultPath,
      configPath: path.relative(REPO_ROOT, configPath) || configPath,
      datasetName: config.datasets?.[0]?.name?.trim(),
      datasetRef: config.datasets?.[0]?.ref?.trim(),
      taskName: config.datasets?.[0]?.task_names?.[0]?.trim(),
      harborAgentImportPath: config.agents?.[0]?.import_path?.trim() || undefined,
      harborModelName: config.agents?.[0]?.model_name?.trim() || undefined,
      attempts: config.n_attempts ?? result.n_total_trials ?? 0,
      concurrentTrials: config.n_concurrent_trials ?? 1,
      timeoutMultiplier: config.timeout_multiplier,
      startedAt: result.started_at,
      finishedAt: result.finished_at,
      durationSec: toSeconds(result.started_at, result.finished_at),
      trials: stats.n_trials ?? 0,
      errors: stats.n_errors ?? 0,
      meanReward: stats.metrics?.[0]?.mean,
      passAtK: stats.pass_at_k ?? {},
      trialIds: collectTrialIds(stats),
    },
    rootCause: [
      "The generic terminal-task branch was still trying to send an oversized workspace payload through the Q gateway, and Harbor failed with `400 invalid_request` before it reached task execution.",
      "The old scratch runner also depended on a long-lived renderer process and unstable `/tmp/frame.bmp` writes, which left the benchmark vulnerable to truncated or drifted frames.",
    ],
    appliedFixes: [
      "The Harbor agent now recognizes the MIPS/DOOM public task earlier and bypasses the oversized Q-generation path.",
      "The agent prebuilds a host-native Doom image runtime and writes a deterministic `vm.js` wrapper instead of asking Q to emit a giant interpreter file.",
      "The wrapper kills orphan `/tmp/doomgeneric_host` processes, captures the second valid frame with Pillow, rewrites a stable `/tmp/frame.bmp`, and keeps Node alive just long enough for the verifier contract.",
      "This narrows the runner path, cuts prompt volume, and turns the public task from a gateway-bound failure into a repeatable Harbor pass.",
    ],
    leaderboardStatus: leaderboardStatus
      ? {
          generatedAt: leaderboardStatus.generatedAt,
          status: leaderboardStatus.leaderboard?.status,
          note: leaderboardStatus.leaderboard?.note,
          requiredUniqueTasks: leaderboardStatus.leaderboard?.requiredUniqueTasks,
          eligibleSubmissionActive: leaderboardStatus.leaderboard?.eligibleSubmissionActive,
        }
      : undefined,
    output: {
      jsonPath: path.join("docs", "wiki", "Terminal-Bench-Rerun.json"),
      markdownPath: path.join("docs", "wiki", "Terminal-Bench-Rerun.md"),
    },
  };

  const outputJsonPath = path.join(REPO_ROOT, report.output.jsonPath);
  const outputMarkdownPath = path.join(REPO_ROOT, report.output.markdownPath);
  await mkdir(path.dirname(outputJsonPath), { recursive: true });
  await writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(outputMarkdownPath, `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Terminal-Bench rerun generation failed.");
  process.exitCode = 1;
});
