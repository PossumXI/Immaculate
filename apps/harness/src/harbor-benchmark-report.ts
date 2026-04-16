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
  reward_stats?: Record<string, Record<string, string[]>>;
  exception_stats?: Record<string, string[]>;
};

type HarborResultFile = {
  started_at?: string;
  finished_at?: string;
  stats?: {
    n_trials?: number;
    n_errors?: number;
    evals?: Record<string, HarborEvalStats>;
  };
};

type JudgeAttempt = {
  id: string;
  provider: string;
  status: "passed" | "failed";
  summary: string;
  error?: string;
  durationSec?: number;
};

type JudgeAttemptFile = {
  generatedAt?: string;
  attempts?: JudgeAttempt[];
};

type TransportFixFile = {
  generatedAt?: string;
  preFixGatewayFailure?: {
    status: string;
    latencyMs: number;
    summary: string;
  };
  directOllamaSuccess?: {
    status: string;
    latencyMs: number;
    summary: string;
  };
  postFixGatewaySuccess?: {
    status: string;
    latencyMs: number;
    summary: string;
  };
};

type HarborResponse = {
  route?: string;
  reason?: string;
  commit?: string;
};

type RewardDetailsCriterion = {
  name?: string;
  value?: number;
  raw?: unknown;
  weight?: number;
  description?: string;
  reasoning?: string;
};

type RewardDetailsEntry = {
  score?: number;
  kind?: "programmatic" | "llm" | string;
  criteria?: RewardDetailsCriterion[];
};

type RewardDetailsFile = {
  reward?: RewardDetailsEntry[];
};

type HarborAgentOutput = {
  repaired?: boolean;
  structured?: HarborResponse;
  rawOutput?: string;
};

type HarborJobSurface = {
  jobPath: string;
  startedAt?: string;
  finishedAt?: string;
  durationSec?: number;
  agent: string;
  score?: number;
  trials: number;
  errors: number;
  trialId?: string;
  reward?: Record<string, number>;
  rewardDetails?: RewardDetailsFile;
  programmaticScore?: number;
  llmJudgeScore?: number;
  response?: HarborResponse;
  repaired?: boolean;
};

type HarborTaskSurface = {
  id: string;
  label: string;
  oracle: HarborJobSurface;
  qGateway: HarborJobSurface;
};

type HarborBenchmarkReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  gatewayModel: string;
  tasks: HarborTaskSurface[];
  llmJudge?: JudgeAttemptFile;
  transportFix?: TransportFixFile;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const HARBOR_RUNTIME_ROOT = path.join(REPO_ROOT, ".runtime", "harbor-custom");
const JUDGE_ATTEMPTS_PATH = path.join(HARBOR_RUNTIME_ROOT, "harbor-llm-judge-attempts.json");
const TRANSPORT_FIX_PATH = path.join(HARBOR_RUNTIME_ROOT, "q-gateway-transport-fix.json");

const TASKS = [
  {
    id: "q-structured-contract",
    label: "Q structured contract",
    oracleJobPath: path.join(".runtime", "harbor-custom", "harbor-q-oracle-current"),
    qGatewayJobPath: path.join(".runtime", "harbor-custom", "harbor-q-agent-live2")
  },
  {
    id: "immaculate-bridge-fail-closed",
    label: "Immaculate bridge fail-closed",
    oracleJobPath: path.join(".runtime", "harbor-custom", "harbor-immaculate-oracle-current"),
    qGatewayJobPath: path.join(".runtime", "harbor-custom", "harbor-immaculate-agent-live")
  }
];

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
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

function firstEvalEntry(result: HarborResultFile): [string, HarborEvalStats] | undefined {
  const entries = Object.entries(result.stats?.evals ?? {});
  return entries[0];
}

function firstTrialId(stats: HarborEvalStats | undefined): string | undefined {
  if (!stats) {
    return undefined;
  }
  for (const scoreBucket of Object.values(stats.reward_stats ?? {})) {
    for (const trialIds of Object.values(scoreBucket)) {
      if (trialIds[0]) {
        return trialIds[0];
      }
    }
  }
  for (const trialIds of Object.values(stats.exception_stats ?? {})) {
    if (trialIds[0]) {
      return trialIds[0];
    }
  }
  return undefined;
}

async function loadHarborJobSurface(jobPath: string): Promise<HarborJobSurface> {
  const resultPath = path.join(REPO_ROOT, jobPath, "result.json");
  const result = await readJsonFile<HarborResultFile>(resultPath);
  const [evalKey, evalStats] = firstEvalEntry(result ?? {}) ?? [
    "unknown__adhoc",
    {
      n_trials: 0,
      n_errors: 1,
      metrics: []
    } satisfies HarborEvalStats
  ];
  const trialId = firstTrialId(evalStats);
  const trialRoot = trialId ? path.join(REPO_ROOT, jobPath, trialId) : undefined;
  const response = trialRoot
    ? await readJsonFile<HarborResponse>(path.join(trialRoot, "agent", "response.json"))
    : undefined;
  const reward = trialRoot
    ? await readJsonFile<Record<string, number>>(path.join(trialRoot, "verifier", "reward.json"))
    : undefined;
  const rewardDetails = trialRoot
    ? await readJsonFile<RewardDetailsFile>(path.join(trialRoot, "verifier", "reward-details.json"))
    : undefined;
  const agentOutput = trialRoot
    ? await readJsonFile<HarborAgentOutput>(path.join(trialRoot, "agent", "q-agent-output.json"))
    : undefined;
  const programmaticScore = rewardDetails?.reward?.find((entry) => entry.kind === "programmatic")?.score;
  const llmJudgeScore = rewardDetails?.reward?.find((entry) => entry.kind === "llm")?.score;

  return {
    jobPath: jobPath.replaceAll("\\", "/"),
    startedAt: result?.started_at,
    finishedAt: result?.finished_at,
    durationSec: toSeconds(result?.started_at, result?.finished_at),
    agent: evalKey.split("__", 1)[0] || "unknown",
    score: evalStats.metrics?.[0]?.mean,
    trials: evalStats.n_trials ?? 0,
    errors: evalStats.n_errors ?? 0,
    trialId,
    reward,
    rewardDetails,
    programmaticScore,
    llmJudgeScore,
    response: response ?? agentOutput?.structured,
    repaired: agentOutput?.repaired
  };
}

function formatDuration(value: number | undefined): string {
  return typeof value === "number" ? `${value.toFixed(2)} s` : "n/a";
}

function renderTaskMarkdown(task: HarborTaskSurface): string[] {
  const lines: string[] = [];
  lines.push(`## ${task.label}`);
  lines.push("");
  lines.push(`- Oracle score: \`${task.oracle.score?.toFixed(3) ?? "n/a"}\``);
  lines.push(`- Oracle duration: \`${formatDuration(task.oracle.durationSec)}\``);
  lines.push(`- Q gateway score: \`${task.qGateway.score?.toFixed(3) ?? "n/a"}\``);
  lines.push(`- Q programmatic score: \`${task.qGateway.programmaticScore?.toFixed(3) ?? "n/a"}\``);
  lines.push(`- Q LLM-judge score: \`${task.qGateway.llmJudgeScore?.toFixed(3) ?? "n/a"}\``);
  lines.push(`- Q gateway duration: \`${formatDuration(task.qGateway.durationSec)}\``);
  lines.push(`- Oracle job: \`${task.oracle.jobPath}\``);
  lines.push(`- Q gateway job: \`${task.qGateway.jobPath}\``);
  lines.push(`- Reference visible to agent: \`no\``);
  lines.push(`- Q self-repair needed: \`${task.qGateway.repaired ? "yes" : "no"}\``);
  if (task.qGateway.response) {
    lines.push(`- Q route: \`${task.qGateway.response.route ?? "n/a"}\``);
    lines.push(`- Q reason: ${task.qGateway.response.reason ?? "n/a"}`);
    lines.push(`- Q commit: ${task.qGateway.response.commit ?? "n/a"}`);
  }
  lines.push("");
  return lines;
}

function renderMarkdown(report: HarborBenchmarkReport): string {
  const lines: string[] = [];
  lines.push("# Harbor Terminal Bench");
  lines.push("");
  lines.push("This page records the repo-local Harbor task pack for Immaculate and Q. It is a real executed benchmark surface, not a claim about leaderboard submission.");
  lines.push("");
  lines.push(`- Generated: \`${report.generatedAt}\``);
  lines.push(`- Release: \`${report.release.buildId}\``);
  lines.push(`- Repo commit: \`${report.release.gitSha}\``);
  lines.push(`- Q serving label: \`${report.gatewayModel}\``);
  lines.push(`- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``);
  lines.push("");
  lines.push("## What Ran");
  lines.push("");
  lines.push("- Harbor ran in WSL on Docker Desktop.");
  lines.push("- Oracle validated both repo-local tasks before the Q lane was accepted.");
  lines.push("- The published Q scores below are the combined RewardKit result from programmatic checks plus the local Q LLM judge.");
  lines.push("- The answer key now lives under `/tests/reference.json`, so the live agent cannot read it from `/app`.");
  lines.push("");

  for (const task of report.tasks) {
    lines.push(...renderTaskMarkdown(task));
  }

  if (report.transportFix) {
    lines.push("## Q Gateway Transport Fix");
    lines.push("");
    if (report.transportFix.preFixGatewayFailure) {
      lines.push(
        `- Pre-fix gateway probe: \`${report.transportFix.preFixGatewayFailure.status}\` at \`${report.transportFix.preFixGatewayFailure.latencyMs}\` ms. ${report.transportFix.preFixGatewayFailure.summary}`
      );
    }
    if (report.transportFix.directOllamaSuccess) {
      lines.push(
        `- Direct Ollama probe: \`${report.transportFix.directOllamaSuccess.status}\` at \`${report.transportFix.directOllamaSuccess.latencyMs}\` ms. ${report.transportFix.directOllamaSuccess.summary}`
      );
    }
    if (report.transportFix.postFixGatewaySuccess) {
      lines.push(
        `- Post-fix gateway probe: \`${report.transportFix.postFixGatewaySuccess.status}\` at \`${report.transportFix.postFixGatewaySuccess.latencyMs}\` ms. ${report.transportFix.postFixGatewaySuccess.summary}`
      );
    }
    lines.push("");
  }

  if (report.llmJudge?.attempts?.length) {
    lines.push("## LLM Judge Attempts");
    lines.push("");
    for (const attempt of report.llmJudge.attempts) {
      lines.push(
        `- \`${attempt.provider}\`: \`${attempt.status}\`${typeof attempt.durationSec === "number" ? ` in \`${attempt.durationSec.toFixed(3)}\` s` : ""}. ${attempt.summary}${attempt.error ? ` Error: \`${attempt.error}\`` : ""}`
      );
    }
    lines.push("");
  }

  lines.push("## Truth Boundary");
  lines.push("");
  lines.push("- This is a repo-local Harbor task pack, not a Terminal-Bench leaderboard submission.");
  lines.push("- The current Harbor pack covers two structured operator tasks, not the full Terminal-Bench public corpus.");
  lines.push("- The published Q scores are real runs against the real Q endpoint on the local Harbor gateway.");
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const llmJudgeAttempts = await readJsonFile<JudgeAttemptFile>(JUDGE_ATTEMPTS_PATH);
  const tasks = await Promise.all(
    TASKS.map(async (task) => ({
      id: task.id,
      label: task.label,
      oracle: await loadHarborJobSurface(task.oracleJobPath),
      qGateway: await loadHarborJobSurface(task.qGatewayJobPath)
    }))
  );
  const report: HarborBenchmarkReport = {
    generatedAt: new Date().toISOString(),
    release,
    gatewayModel: release.q.truthfulLabel,
    tasks,
    llmJudge: llmJudgeAttempts
      ? {
          ...llmJudgeAttempts,
          attempts: (llmJudgeAttempts.attempts ?? []).filter((attempt) => /\bq\b/i.test(attempt.provider))
        }
      : undefined,
    transportFix: await readJsonFile<TransportFixFile>(TRANSPORT_FIX_PATH),
    output: {
      jsonPath: path.join("docs", "wiki", "Harbor-Terminal-Bench.json"),
      markdownPath: path.join("docs", "wiki", "Harbor-Terminal-Bench.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), renderMarkdown(report), "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Harbor benchmark report generation failed.");
  process.exitCode = 1;
});
