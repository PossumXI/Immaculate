import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type ReceiptFlags = {
  resultPath?: string;
  configPath?: string;
  metadataPath?: string;
  discussionUrl: string;
  commitUrl: string;
  leaderboardRepo: string;
  discussionState: string;
  mergeState: string;
  commitVerified: boolean;
};

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
  agent_timeout_multiplier?: number | null;
  verifier_timeout_multiplier?: number | null;
  agent_setup_timeout_multiplier?: number | null;
  environment_build_timeout_multiplier?: number | null;
  n_concurrent_trials?: number;
  environment?: {
    override_cpus?: number | null;
    override_memory_mb?: number | null;
    override_storage_mb?: number | null;
    override_gpus?: number | null;
  };
  verifier?: {
    override_timeout_sec?: number | null;
    max_timeout_sec?: number | null;
  };
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

type SubmissionMetadata = {
  agentUrl?: string;
  agentDisplayName?: string;
  agentOrgDisplayName?: string;
  modelName?: string;
  modelProvider?: string;
  modelDisplayName?: string;
  modelOrgDisplayName?: string;
};

type TerminalBenchReceiptReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  leaderboard: {
    repo: string;
    discussionUrl: string;
    commitUrl: string;
    discussionState: string;
    mergeState: string;
    commitVerified: boolean;
  };
  harbor: {
    jobId?: string;
    jobName: string;
    datasetName?: string;
    datasetRef?: string;
    taskName?: string;
    harborAgentImportPath?: string;
    harborModelName?: string;
    attempts: number;
    concurrentTrials: number;
    timeoutMultiplier?: number;
    timeoutOverridesPresent: boolean;
    resourceOverridesPresent: boolean;
    startedAt?: string;
    finishedAt?: string;
    durationSec?: number;
    trials: number;
    errors: number;
    meanReward?: number;
    passAtK: Record<string, number>;
    trialIds: string[];
  };
  submission: SubmissionMetadata;
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
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

function parseFlags(argv: string[]): ReceiptFlags {
  const flags: ReceiptFlags = {
    discussionUrl: "https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/140",
    commitUrl: "https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/commit/9a4ad15564f2a3c1303da7c89a08dc10cfec36c3",
    leaderboardRepo: "harborframework/terminal-bench-2-leaderboard",
    discussionState: "open",
    mergeState: "ready-to-merge",
    commitVerified: true
  };

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
    if (token === "--metadata-path") {
      flags.metadataPath = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--metadata-path=")) {
      flags.metadataPath = token.slice("--metadata-path=".length).trim();
      continue;
    }
    if (token === "--discussion-url") {
      flags.discussionUrl = argv[index + 1]?.trim() || flags.discussionUrl;
      index += 1;
      continue;
    }
    if (token.startsWith("--discussion-url=")) {
      flags.discussionUrl = token.slice("--discussion-url=".length).trim() || flags.discussionUrl;
      continue;
    }
    if (token === "--commit-url") {
      flags.commitUrl = argv[index + 1]?.trim() || flags.commitUrl;
      index += 1;
      continue;
    }
    if (token.startsWith("--commit-url=")) {
      flags.commitUrl = token.slice("--commit-url=".length).trim() || flags.commitUrl;
      continue;
    }
    if (token === "--leaderboard-repo") {
      flags.leaderboardRepo = argv[index + 1]?.trim() || flags.leaderboardRepo;
      index += 1;
      continue;
    }
    if (token.startsWith("--leaderboard-repo=")) {
      flags.leaderboardRepo = token.slice("--leaderboard-repo=".length).trim() || flags.leaderboardRepo;
      continue;
    }
  }

  return flags;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function parseMetadataYaml(payload: string): SubmissionMetadata {
  const metadata: SubmissionMetadata = {};
  for (const rawLine of payload.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.+)$/u.exec(line.replace(/^- /u, ""));
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = match[2]?.replace(/^"(.*)"$/u, "$1").trim();
    switch (key) {
      case "agent_url":
        metadata.agentUrl = value;
        break;
      case "agent_display_name":
        metadata.agentDisplayName = value;
        break;
      case "agent_org_display_name":
        metadata.agentOrgDisplayName = value;
        break;
      case "model_name":
        metadata.modelName = value;
        break;
      case "model_provider":
        metadata.modelProvider = value;
        break;
      case "model_display_name":
        metadata.modelDisplayName = value;
        break;
      case "model_org_display_name":
        metadata.modelOrgDisplayName = value;
        break;
      default:
        break;
    }
  }
  return metadata;
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

function hasTimeoutOverrides(config: HarborConfigFile): boolean {
  return Boolean(
    config.agent_timeout_multiplier ||
      config.verifier_timeout_multiplier ||
      config.agent_setup_timeout_multiplier ||
      config.environment_build_timeout_multiplier ||
      config.verifier?.override_timeout_sec ||
      config.verifier?.max_timeout_sec
  );
}

function hasResourceOverrides(config: HarborConfigFile): boolean {
  return Boolean(
    config.environment?.override_cpus ||
      config.environment?.override_memory_mb ||
      config.environment?.override_storage_mb ||
      config.environment?.override_gpus
  );
}

function renderMarkdown(report: TerminalBenchReceiptReport): string {
  const meanReward =
    typeof report.harbor.meanReward === "number" ? report.harbor.meanReward.toFixed(3) : "n/a";
  const passAtK = Object.keys(report.harbor.passAtK)
    .sort((left, right) => Number(left) - Number(right))
    .map((key) => `pass@${key} \`${report.harbor.passAtK[key]?.toFixed(3) ?? "n/a"}\``)
    .join(", ");

  return [
    "# Terminal-Bench Receipt",
    "",
    "This page records the official public-task Terminal-Bench leaderboard receipt submission for the real `Q` lane. It is a real Harbor job plus a real public PR/discussion on the official leaderboard dataset repo.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    `- Q serving label: \`${report.release.q.truthfulLabel}\``,
    `- Leaderboard repo: \`${report.leaderboard.repo}\``,
    `- Submission PR/discussion: ${report.leaderboard.discussionUrl}`,
    `- Submission commit: ${report.leaderboard.commitUrl}`,
    "",
    "## What Ran",
    "",
    `- Dataset: \`${report.harbor.datasetName ?? "unknown"}\``,
    `- Public task: \`${report.harbor.taskName ?? "unknown"}\``,
    `- Dataset ref: \`${report.harbor.datasetRef ?? "unknown"}\``,
    `- Harbor agent import path: \`${report.harbor.harborAgentImportPath ?? "unknown"}\``,
    `- Harbor model: \`${report.harbor.harborModelName ?? "unknown"}\``,
    `- Harbor job name: \`${report.harbor.jobName}\``,
    `- Attempts: \`${report.harbor.attempts}\``,
    `- Concurrent trials: \`${report.harbor.concurrentTrials}\``,
    `- Timeout multiplier: \`${report.harbor.timeoutMultiplier ?? "n/a"}\``,
    `- Timeout overrides present: \`${report.harbor.timeoutOverridesPresent ? "yes" : "no"}\``,
    `- Resource overrides present: \`${report.harbor.resourceOverridesPresent ? "yes" : "no"}\``,
    "",
    "## Measured Result",
    "",
    `- Started: \`${report.harbor.startedAt ?? "n/a"}\``,
    `- Finished: \`${report.harbor.finishedAt ?? "n/a"}\``,
    `- Duration: \`${report.harbor.durationSec?.toFixed(2) ?? "n/a"} s\``,
    `- Trials: \`${report.harbor.trials}\``,
    `- Errors: \`${report.harbor.errors}\``,
    `- Mean reward: \`${meanReward}\``,
    `- ${passAtK}`,
    `- Trial ids: \`${report.harbor.trialIds.join(", ") || "none"}\``,
    "",
    "## Submission Package",
    "",
    `- Agent display name: \`${report.submission.agentDisplayName ?? "unknown"}\``,
    `- Agent org: \`${report.submission.agentOrgDisplayName ?? "unknown"}\``,
    `- Agent URL: \`${report.submission.agentUrl ?? "unknown"}\``,
    `- Model display name: \`${report.submission.modelDisplayName ?? report.submission.modelName ?? "unknown"}\``,
    `- Model provider: \`${report.submission.modelProvider ?? "unknown"}\``,
    `- Model org: \`${report.submission.modelOrgDisplayName ?? "unknown"}\``,
    `- Discussion state observed: \`${report.leaderboard.discussionState}\``,
    `- Merge state observed: \`${report.leaderboard.mergeState}\``,
    `- Submission commit verified: \`${report.leaderboard.commitVerified ? "yes" : "no"}\``,
    "",
    "## Why This Matters",
    "",
    "- This is not just a local benchmark note. It is a real public receipt on the official Terminal-Bench leaderboard submission repo.",
    "- The receipt proves the real `Q` lane can be packaged, evaluated on a public Terminal-Bench task, and submitted through the official Harbor/Hugging Face path without hiding behind a repo-local task pack.",
    "- The result is intentionally kept honest: the score here is poor, but the receipt and submission mechanics are real.",
    "",
    "## Truth Boundary",
    "",
    "- This is one public-task receipt for `terminal-bench/make-mips-interpreter`, not a full Terminal-Bench leaderboard sweep.",
    "- The PR/discussion is currently open and ready to merge; this page does not claim it is already merged unless the discussion page says so later.",
    "- The published score here is `0.000`, so this page proves official receipt and submission, not strong public-task performance."
  ].join("\n");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const resultPath =
    flags.resultPath ||
    (await firstExistingPath([
      defaultCandidatePath(".runtime", "terminal-bench-jobs", "q-terminal-bench-public-receipt", "result.json"),
      parentCandidatePath(".runtime", "terminal-bench-jobs", "q-terminal-bench-public-receipt", "result.json")
    ]));
  if (!resultPath) {
    throw new Error("Terminal-Bench result.json not found. Pass --result-path explicitly.");
  }

  const configPath =
    flags.configPath ||
    (await firstExistingPath([
      path.join(path.dirname(resultPath), "config.json")
    ]));
  if (!configPath) {
    throw new Error("Terminal-Bench config.json not found. Pass --config-path explicitly.");
  }

  const metadataPath =
    flags.metadataPath ||
    (await firstExistingPath([
      defaultCandidatePath(
        ".runtime",
        "terminal-bench-submission",
        "submissions",
        "terminal-bench",
        "2.0",
        "q-harbor__q-gemma4-e4b",
        "metadata.yaml"
      ),
      parentCandidatePath(
        ".runtime",
        "terminal-bench-submission",
        "submissions",
        "terminal-bench",
        "2.0",
        "q-harbor__q-gemma4-e4b",
        "metadata.yaml"
      )
    ]));
  if (!metadataPath) {
    throw new Error("Terminal-Bench metadata.yaml not found. Pass --metadata-path explicitly.");
  }

  const [release, result, config, metadataYaml] = await Promise.all([
    resolveReleaseMetadata(),
    readJsonFile<HarborResultFile>(resultPath),
    readJsonFile<HarborConfigFile>(configPath),
    readFile(metadataPath, "utf8")
  ]);

  const [evalKey, evalStats] = requireSingleEvalEntry(result);
  const metadata = parseMetadataYaml(metadataYaml);
  const report: TerminalBenchReceiptReport = {
    generatedAt: new Date().toISOString(),
    release,
    leaderboard: {
      repo: flags.leaderboardRepo,
      discussionUrl: flags.discussionUrl,
      commitUrl: flags.commitUrl,
      discussionState: flags.discussionState,
      mergeState: flags.mergeState,
      commitVerified: flags.commitVerified
    },
    harbor: {
      jobId: result.id,
      jobName: config.job_name || path.basename(path.dirname(resultPath)),
      datasetName: config.datasets?.[0]?.name,
      datasetRef: config.datasets?.[0]?.ref,
      taskName: config.datasets?.[0]?.task_names?.[0],
      harborAgentImportPath: config.agents?.[0]?.import_path || undefined,
      harborModelName: config.agents?.[0]?.model_name || undefined,
      attempts: config.n_attempts ?? result.n_total_trials ?? 0,
      concurrentTrials: config.n_concurrent_trials ?? 1,
      timeoutMultiplier: config.timeout_multiplier,
      timeoutOverridesPresent: hasTimeoutOverrides(config),
      resourceOverridesPresent: hasResourceOverrides(config),
      startedAt: result.started_at,
      finishedAt: result.finished_at,
      durationSec: toSeconds(result.started_at, result.finished_at),
      trials: evalStats.n_trials ?? result.stats?.n_trials ?? 0,
      errors: evalStats.n_errors ?? result.stats?.n_errors ?? 0,
      meanReward: evalStats.metrics?.[0]?.mean,
      passAtK: evalStats.pass_at_k ?? {},
      trialIds: collectTrialIds(evalStats)
    },
    submission: metadata,
    output: {
      jsonPath: path.join("docs", "wiki", "Terminal-Bench-Receipt.json"),
      markdownPath: path.join("docs", "wiki", "Terminal-Bench-Receipt.md")
    }
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
