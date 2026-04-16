import path from "node:path";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
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

type HarborResponse = {
  route?: string;
  reason?: string;
  commit?: string;
};

export type HarborSoakAgentKind = "oracle" | "q";

export type HarborSoakTaskSpec = {
  id: string;
  label: string;
  taskPath: string;
};

export type HarborSoakRunRecord = {
  taskId: string;
  taskLabel: string;
  agent: HarborSoakAgentKind;
  iteration: number;
  jobName: string;
  jobPath: string;
  startedAt?: string;
  finishedAt?: string;
  durationSec?: number;
  score?: number;
  trials: number;
  errors: number;
  trialId?: string;
  reward?: Record<string, number>;
  response?: HarborResponse;
};

export type HarborSoakStatSummary = {
  runs: number;
  scoredRuns: number;
  scoreAverage?: number;
  scoreMin?: number;
  scoreMax?: number;
  durationAverageSec?: number;
  durationMinSec?: number;
  durationMaxSec?: number;
  durationTotalSec: number;
};

export type HarborSoakTaskSummary = {
  taskId: string;
  taskLabel: string;
  oracle: HarborSoakStatSummary;
  q: HarborSoakStatSummary;
};

export type HarborSoakReport = {
  generatedAt: string;
  state: "running" | "completed";
  startedAt?: string;
  finishedAt?: string;
  durationSeconds: number;
  elapsedSeconds: number;
  deadlineAt: string;
  runtimeRoot: string;
  release: ReleaseMetadata;
  gatewayModel: string;
  taskPack: {
    id: string;
    label: string;
    taskIds: string[];
  };
  summary: {
    totalRuns: number;
    oracle: HarborSoakStatSummary;
    q: HarborSoakStatSummary;
    overall: HarborSoakStatSummary;
    tasks: HarborSoakTaskSummary[];
  };
  runs: HarborSoakRunRecord[];
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

type HarborSoakOptions = {
  durationSeconds?: number;
  runtimeRoot?: string;
  outputJsonPath?: string;
  collectOnly?: boolean;
  harborBinary?: string;
  harborDistro?: string;
  qAgentImportPath?: string;
  qAgentModel?: string;
  qOpenAiApiBase?: string;
  qOpenAiApiKey?: string;
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const DEFAULT_DURATION_SECONDS = 3600;
const SOAK_TASKS: HarborSoakTaskSpec[] = [
  {
    id: "q-structured-contract",
    label: "Q structured contract",
    taskPath: path.join(REPO_ROOT, "benchmarks", "harbor", "q-structured-contract")
  },
  {
    id: "immaculate-bridge-fail-closed",
    label: "Immaculate bridge fail-closed",
    taskPath: path.join(REPO_ROOT, "benchmarks", "harbor", "immaculate-bridge-fail-closed")
  }
];
const DEFAULT_OUTPUT_JSON_PATH = path.join(REPO_ROOT, "docs", "wiki", "Harbor-Terminal-Bench-Soak.json");
const DEFAULT_RUNTIME_ROOT = path.join(REPO_ROOT, ".runtime", "harbor-soak");

function toWslPath(filePath: string): string {
  const normalized = path.resolve(filePath).replaceAll("\\", "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) {
    return normalized;
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function bashSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(root, {
    withFileTypes: true
  });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function firstEvalEntry(result: HarborResultFile): [string, HarborEvalStats] | undefined {
  const entries = Object.entries(result.stats?.evals ?? {});
  return entries[0];
}

function requireSingleTrialId(stats: HarborEvalStats | undefined, jobDir: string): string {
  if (!stats) {
    throw new Error(`Missing Harbor eval stats for ${jobDir}.`);
  }
  const trialIds = new Set<string>();
  for (const scoreBucket of Object.values(stats.reward_stats ?? {})) {
    for (const bucketTrialIds of Object.values(scoreBucket)) {
      for (const trialId of bucketTrialIds) {
        if (trialId) {
          trialIds.add(trialId);
        }
      }
    }
  }
  for (const exceptionTrialIds of Object.values(stats.exception_stats ?? {})) {
    for (const trialId of exceptionTrialIds) {
      if (trialId) {
        trialIds.add(trialId);
      }
    }
  }
  if (trialIds.size !== 1) {
    throw new Error(`Expected exactly one Harbor trial id for ${jobDir}, found ${trialIds.size}.`);
  }
  return Array.from(trialIds)[0] as string;
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

function aggregateStatSummary(records: HarborSoakRunRecord[]): HarborSoakStatSummary {
  const scored = records.filter((record) => typeof record.score === "number");
  const durations = records.filter((record) => typeof record.durationSec === "number");
  const scoreValues = scored.map((record) => record.score as number);
  const durationValues = durations.map((record) => record.durationSec as number);
  const average = (values: number[]): number | undefined =>
    values.length > 0 ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : undefined;

  return {
    runs: records.length,
    scoredRuns: scored.length,
    scoreAverage: average(scoreValues),
    scoreMin: scoreValues.length > 0 ? Math.min(...scoreValues) : undefined,
    scoreMax: scoreValues.length > 0 ? Math.max(...scoreValues) : undefined,
    durationAverageSec: average(durationValues),
    durationMinSec: durationValues.length > 0 ? Number(Math.min(...durationValues).toFixed(2)) : undefined,
    durationMaxSec: durationValues.length > 0 ? Number(Math.max(...durationValues).toFixed(2)) : undefined,
    durationTotalSec: Number(durationValues.reduce((sum, value) => sum + value, 0).toFixed(2))
  };
}

function formatStatValue(value: number | undefined, digits = 3): string {
  return typeof value === "number" ? value.toFixed(digits) : "n/a";
}

function deriveMarkdownPath(jsonPath: string): string {
  return jsonPath.endsWith(".json") ? `${jsonPath.slice(0, -".json".length)}.md` : `${jsonPath}.md`;
}

function renderHarborSoakMarkdown(report: HarborSoakReport): string {
  const metDurationTarget = report.elapsedSeconds >= report.durationSeconds;
  const lines: string[] = [
    "# Harbor Terminal Bench Soak",
    "",
    "This page records the repeated Q-only Harbor task-pack lane. Oracle and Q run side by side on the same terminal tasks so the repo can keep the control truth and the Q truth in one surface.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- State: \`${report.state}\``,
    `- Started: \`${report.startedAt ?? "n/a"}\``,
    `- Finished: \`${report.finishedAt ?? "n/a"}\``,
    `- Duration target: \`${report.durationSeconds}s\``,
    `- Elapsed seconds: \`${report.elapsedSeconds}\``,
    `- Duration target met: \`${metDurationTarget ? "yes" : "no"}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Q serving label: \`${report.gatewayModel}\``,
    `- Runtime root: \`${report.runtimeRoot}\``,
    `- Total runs: \`${report.summary.totalRuns}\``,
    "",
    "## Aggregate",
    "",
    `- Oracle runs: \`${report.summary.oracle.runs}\` | avg score \`${formatStatValue(report.summary.oracle.scoreAverage)}\` | avg duration \`${formatStatValue(report.summary.oracle.durationAverageSec, 2)} s\``,
    `- Q runs: \`${report.summary.q.runs}\` | avg score \`${formatStatValue(report.summary.q.scoreAverage)}\` | avg duration \`${formatStatValue(report.summary.q.durationAverageSec, 2)} s\``,
    `- Overall runs: \`${report.summary.overall.runs}\` | avg score \`${formatStatValue(report.summary.overall.scoreAverage)}\` | avg duration \`${formatStatValue(report.summary.overall.durationAverageSec, 2)} s\``,
    ""
  ];

  for (const task of report.summary.tasks) {
    lines.push(`## ${task.taskLabel}`);
    lines.push("");
    lines.push(
      `- Oracle: \`${task.oracle.runs}\` runs | avg score \`${formatStatValue(task.oracle.scoreAverage)}\` | avg duration \`${formatStatValue(task.oracle.durationAverageSec, 2)} s\``
    );
    lines.push(
      `- Q: \`${task.q.runs}\` runs | avg score \`${formatStatValue(task.q.scoreAverage)}\` | avg duration \`${formatStatValue(task.q.durationAverageSec, 2)} s\``
    );
    lines.push("");
  }

  lines.push("## Truth Boundary");
  lines.push("");
  lines.push("- Oracle and Q are measured on the same Harbor task pack, but this remains a repo-local task lane rather than a W&B publication lane.");
  lines.push("- A `running` state means the soak was interrupted or is still in flight; a `completed` state means the runtime root was fully collected, not that the duration target was necessarily met.");
  return `${lines.join("\n")}\n`;
}

async function loadHarborRunRecord(
  task: HarborSoakTaskSpec,
  agent: HarborSoakAgentKind,
  iteration: number,
  jobDir: string
): Promise<HarborSoakRunRecord> {
  const resultPath = path.join(jobDir, "result.json");
  const result = await readJsonFile<HarborResultFile>(resultPath);
  const evalEntries = Object.entries(result?.stats?.evals ?? {});
  if (evalEntries.length !== 1) {
    throw new Error(`Expected exactly one Harbor eval entry for ${jobDir}, found ${evalEntries.length}.`);
  }
  const evalStats = evalEntries[0]?.[1];
  const trialId = requireSingleTrialId(evalStats, jobDir);
  const trialRoot = trialId ? path.join(jobDir, trialId) : undefined;
  const response = trialRoot ? await readJsonFile<HarborResponse>(path.join(trialRoot, "agent", "response.json")) : undefined;
  const reward = trialRoot ? await readJsonFile<Record<string, number>>(path.join(trialRoot, "verifier", "reward.json")) : undefined;

  return {
    taskId: task.id,
    taskLabel: task.label,
    agent,
    iteration,
    jobName: path.basename(jobDir),
    jobPath: jobDir.replaceAll("\\", "/"),
    startedAt: result?.started_at,
    finishedAt: result?.finished_at,
    durationSec: toSeconds(result?.started_at, result?.finished_at),
    score: evalStats.metrics?.[0]?.mean,
    trials: evalStats.n_trials ?? 0,
    errors: evalStats.n_errors ?? 0,
    trialId,
    reward,
    response
  };
}

function timestampSegment(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

async function loadHarborRunRecordsFromRuntime(jobsRoot: string): Promise<HarborSoakRunRecord[]> {
  const taskSpecById = new Map(SOAK_TASKS.map((task) => [task.id, task] as const));
  const runtimeFiles = await walkFiles(jobsRoot);
  const resultFiles = runtimeFiles.filter((filePath) => path.basename(filePath) === "result.json");
  const records: HarborSoakRunRecord[] = [];

  for (const resultPath of resultFiles) {
    const jobDir = path.dirname(resultPath);
    const relative = path.relative(jobsRoot, jobDir);
    const segments = relative.split(path.sep);
    if (segments.length !== 4) {
      continue;
    }
    const [taskId, agent, iterationSegment] = segments;
    if (agent !== "oracle" && agent !== "q") {
      continue;
    }
    const task = taskSpecById.get(taskId);
    if (!task) {
      continue;
    }
    const iteration = Number(iterationSegment.replace(/^iter-/, ""));
    if (!Number.isFinite(iteration) || iteration <= 0) {
      continue;
    }
    records.push(await loadHarborRunRecord(task, agent, iteration, jobDir));
  }

  return records.sort((left, right) => {
    if (left.iteration !== right.iteration) {
      return left.iteration - right.iteration;
    }
    if (left.taskId !== right.taskId) {
      return left.taskId.localeCompare(right.taskId);
    }
    return left.agent.localeCompare(right.agent);
  });
}

function computeRunWindow(records: HarborSoakRunRecord[]): {
  startedAt?: string;
  finishedAt?: string;
  elapsedSeconds: number;
} {
  const started = records
    .map((record) => record.startedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  const finished = records
    .map((record) => record.finishedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();

  const startedAt = started[0];
  const finishedAt = finished.at(-1);
  if (!startedAt || !finishedAt) {
    return {
      startedAt,
      finishedAt,
      elapsedSeconds: 0
    };
  }
  const elapsedMs = Date.parse(finishedAt) - Date.parse(startedAt);
  return {
    startedAt,
    finishedAt,
    elapsedSeconds: Number((Math.max(0, elapsedMs) / 1000).toFixed(2))
  };
}

function buildHarborSoakReport(options: {
  results: HarborSoakRunRecord[];
  durationSeconds: number;
  deadlineAt: string;
  release: ReleaseMetadata;
  runtimeRoot: string;
  outputJsonPath: string;
  state: "running" | "completed";
}): HarborSoakReport {
  const byTask = new Map<string, HarborSoakRunRecord[]>();
  for (const run of options.results) {
    const taskRuns = byTask.get(run.taskId) ?? [];
    taskRuns.push(run);
    byTask.set(run.taskId, taskRuns);
  }

  const tasks = SOAK_TASKS.map((task) => {
    const taskRuns = byTask.get(task.id) ?? [];
    return {
      taskId: task.id,
      taskLabel: task.label,
      oracle: aggregateStatSummary(taskRuns.filter((run) => run.agent === "oracle")),
      q: aggregateStatSummary(taskRuns.filter((run) => run.agent === "q"))
    };
  });

  const oracleRuns = options.results.filter((run) => run.agent === "oracle");
  const qRuns = options.results.filter((run) => run.agent === "q");
  const runWindow = computeRunWindow(options.results);

  return {
    generatedAt: new Date().toISOString(),
    state: options.state,
    startedAt: runWindow.startedAt,
    finishedAt: runWindow.finishedAt,
    durationSeconds: options.durationSeconds,
    elapsedSeconds: runWindow.elapsedSeconds,
    deadlineAt: options.deadlineAt,
    runtimeRoot: path.relative(REPO_ROOT, options.runtimeRoot).replaceAll("\\", "/"),
    release: options.release,
    gatewayModel: options.release.q.truthfulLabel,
    taskPack: {
      id: "q-only-harbor-task-pack",
      label: "Q-only Harbor task pack",
      taskIds: SOAK_TASKS.map((task) => task.id)
    },
    summary: {
      totalRuns: options.results.length,
      oracle: aggregateStatSummary(oracleRuns),
      q: aggregateStatSummary(qRuns),
      overall: aggregateStatSummary(options.results),
      tasks
    },
    runs: options.results,
    output: {
      jsonPath: path.relative(REPO_ROOT, options.outputJsonPath).replaceAll("\\", "/"),
      markdownPath: path.relative(REPO_ROOT, deriveMarkdownPath(options.outputJsonPath)).replaceAll("\\", "/")
    }
  };
}

async function persistHarborSoakReport(options: Parameters<typeof buildHarborSoakReport>[0]): Promise<HarborSoakReport> {
  const report = buildHarborSoakReport(options);
  await mkdir(path.dirname(options.outputJsonPath), { recursive: true });
  await writeFile(options.outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(deriveMarkdownPath(options.outputJsonPath), renderHarborSoakMarkdown(report), "utf8");
  return report;
}

function buildHarborArgs(options: {
  taskPath: string;
  agent: HarborSoakAgentKind;
  jobName: string;
  jobsDir: string;
  qAgentImportPath: string;
  qAgentModel: string;
}): string[] {
  if (options.agent === "oracle") {
    return [
      "run",
      "--path",
      options.taskPath,
      "--env",
      "docker",
      "-n",
      "1",
      "-l",
      "1",
      "-o",
      options.jobsDir,
      "--job-name",
      options.jobName,
      "--quiet",
      "-a",
      "oracle"
    ];
  }

  return [
    "run",
    "--path",
    options.taskPath,
    "--env",
    "docker",
    "-n",
    "1",
    "-l",
    "1",
    "-o",
    options.jobsDir,
    "--job-name",
    options.jobName,
    "--quiet",
    "--agent-import-path",
    options.qAgentImportPath,
    "--model",
    options.qAgentModel
  ];
}

function runSyncCommand(command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env
    },
    stdio: "inherit",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function runHarborJob(args: string[], env?: NodeJS.ProcessEnv, harborBinary?: string, harborDistro?: string): void {
  if (harborBinary) {
    runSyncCommand(harborBinary, args, env);
    return;
  }

  if (process.platform !== "win32") {
    runSyncCommand("harbor", args, env);
    return;
  }

  const distro = harborDistro?.trim() || process.env.IMMACULATE_HARBOR_WSL_DISTRO?.trim() || "Ubuntu-24.04";
  const harborBin = process.env.IMMACULATE_HARBOR_BIN?.trim() || "~/.local/bin/harbor";
  const scriptLines = [
    "set -euo pipefail",
    `cd ${bashSingleQuote(toWslPath(REPO_ROOT))}`,
    ...Object.entries(env ?? {}).map(([key, value]) => `export ${key}=${bashSingleQuote(String(value))}`),
    `${harborBin} ${args.map((arg) => bashSingleQuote(arg)).join(" ")}`
  ];
  runSyncCommand("wsl.exe", ["-d", distro, "--", "bash", "-lc", scriptLines.join("; ")], process.env);
}

async function runSingleHarborSoakJob(options: {
  task: HarborSoakTaskSpec;
  agent: HarborSoakAgentKind;
  iteration: number;
  jobsRoot: string;
  harborBinary?: string;
  harborDistro?: string;
  qAgentImportPath: string;
  qAgentModel: string;
  qEnv?: NodeJS.ProcessEnv;
}): Promise<HarborSoakRunRecord> {
  const jobName = `harbor-soak-${options.task.id}-${options.agent}-iter-${String(options.iteration).padStart(4, "0")}`;
  const jobDirWindows = path.join(options.jobsRoot, options.task.id, options.agent, `iter-${String(options.iteration).padStart(4, "0")}`);
  const useWslPaths = process.platform === "win32" && !options.harborBinary;
  const jobDirCommand = useWslPaths ? toWslPath(jobDirWindows) : jobDirWindows;
  const taskPathCommand = useWslPaths ? toWslPath(options.task.taskPath) : options.task.taskPath;
  await mkdir(jobDirWindows, { recursive: true });

  const args = buildHarborArgs({
    taskPath: taskPathCommand,
    agent: options.agent,
    jobName,
    jobsDir: jobDirCommand,
    qAgentImportPath: options.qAgentImportPath,
    qAgentModel: options.qAgentModel
  });

  const env = options.agent === "q" ? options.qEnv : undefined;
  runHarborJob(args, env, options.harborBinary, options.harborDistro);

  return loadHarborRunRecord(options.task, options.agent, options.iteration, path.join(jobDirWindows, jobName));
}

export async function runHarborSoak(options: HarborSoakOptions = {}): Promise<HarborSoakReport> {
  const durationSeconds = Math.max(1, Math.floor(options.durationSeconds ?? DEFAULT_DURATION_SECONDS));
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + durationSeconds * 1000;
  const deadlineAt = new Date(deadlineAtMs).toISOString();
  const runtimeRoot = options.runtimeRoot ?? path.join(DEFAULT_RUNTIME_ROOT, timestampSegment());
  const outputJsonPath = options.outputJsonPath ?? DEFAULT_OUTPUT_JSON_PATH;
  const release = await resolveReleaseMetadata();
  await mkdir(runtimeRoot, { recursive: true });

  if (options.collectOnly) {
    const existingResults = await loadHarborRunRecordsFromRuntime(runtimeRoot);
    return persistHarborSoakReport({
      results: existingResults,
      durationSeconds,
      deadlineAt,
      release,
      runtimeRoot,
      outputJsonPath,
      state: "completed"
    });
  }

  const qOpenAiApiBase = options.qOpenAiApiBase ?? process.env.OPENAI_API_BASE?.trim() ?? process.env.Q_OPENAI_API_BASE?.trim();
  const qOpenAiApiKey = options.qOpenAiApiKey ?? process.env.OPENAI_API_KEY?.trim() ?? process.env.Q_OPENAI_API_KEY?.trim();

  if (!qOpenAiApiBase || !qOpenAiApiKey) {
    throw new Error(
      "Q soak requires OPENAI_API_BASE and OPENAI_API_KEY (or Q_OPENAI_API_BASE and Q_OPENAI_API_KEY) for the repo-local Q gateway agent."
    );
  }

  const qEnv: NodeJS.ProcessEnv = {
    OPENAI_API_BASE: qOpenAiApiBase,
    OPENAI_API_KEY: qOpenAiApiKey
  };

  const results: HarborSoakRunRecord[] = [];
  let iteration = 0;

  outer: while (Date.now() < deadlineAtMs) {
    iteration += 1;
    for (const task of SOAK_TASKS) {
      for (const agent of ["oracle", "q"] as const) {
        if (Date.now() >= deadlineAtMs && results.length > 0) {
          break outer;
        }
        const run = await runSingleHarborSoakJob({
          task,
          agent,
          iteration,
          jobsRoot: runtimeRoot,
          harborBinary: options.harborBinary,
          harborDistro: options.harborDistro,
          qAgentImportPath: options.qAgentImportPath ?? "benchmarks.harbor_agents:QGatewayAgent",
          qAgentModel: options.qAgentModel ?? "openai:Q",
          qEnv
        });
        results.push(run);
        await persistHarborSoakReport({
          results,
          durationSeconds,
          deadlineAt,
          release,
          runtimeRoot,
          outputJsonPath,
          state: "running"
        });
      }
    }
  }
  return persistHarborSoakReport({
    results,
    durationSeconds,
    deadlineAt,
    release,
    runtimeRoot,
    outputJsonPath,
    state: "completed"
  });
}
