import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createQApiKeyRegistry, normalizeQApiRateLimitPolicy } from "./q-api-auth.js";
import { prewarmOllamaModel } from "./ollama.js";
import { resolveQLocalOllamaUrl } from "./q-local-model.js";
import { getQModelName, getQModelTarget } from "./q-model.js";
import { resolveReleaseMetadata } from "./release-metadata.js";

type SweepCheck = {
  status: number;
  body: unknown;
  wallLatencyMs: number;
};

type SweepFlags = {
  launch: boolean;
  checkOnly: boolean;
  jobName: string;
  jobsDir: string;
  attempts: number;
  concurrency: number;
  timeoutSec: number;
};

type SweepReceipt = {
  generatedAt: string;
  releaseBuildId: string;
  gitShortSha: string;
  modelName: string;
  foundationModel: string;
  expectedUniqueTasks: number;
  sweepMode: "check" | "launch";
  harbor: {
    binary?: string;
    ready: boolean;
  };
  docker: {
    ready: boolean;
    version?: string;
  };
  gateway: {
    url: string;
    health: SweepCheck;
    runtimeDir: string;
    keysPath: string;
  };
  config: {
    path: string;
    resultPath: string;
    jobName: string;
    jobsDir: string;
    attempts: number;
    concurrency: number;
    dataset: string;
    datasetRef: string;
    fullSweep: boolean;
  };
  launch?: {
    completed: boolean;
    exitCode?: number;
    command: string[];
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(MODULE_ROOT, "..");
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const DEFAULT_OLLAMA_URL = resolveQLocalOllamaUrl();
const DEFAULT_JOB_NAME = "q-terminal-bench-full-sweep-v1";
const DEFAULT_TASK_COUNT = 89;
const TERMINAL_BENCH_DATASET_REF =
  process.env.IMMACULATE_TERMINAL_BENCH_DATASET_REF ??
  "sha256:c6fc2e2382c1dbae99b2d5ecd2f4f4a60c3c01e0d84642d69b4afd92e99d078b";

function parseFlags(argv: string[]): SweepFlags {
  const flags: SweepFlags = {
    launch: false,
    checkOnly: true,
    jobName: DEFAULT_JOB_NAME,
    jobsDir: path.join(".runtime", "terminal-bench-jobs"),
    attempts: 1,
    concurrency: 1,
    timeoutSec: 240
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--launch") {
      flags.launch = true;
      flags.checkOnly = false;
      continue;
    }
    if (token === "--check") {
      flags.checkOnly = true;
      continue;
    }
    if (token === "--job-name") {
      flags.jobName = argv[index + 1]?.trim() || flags.jobName;
      index += 1;
      continue;
    }
    if (token.startsWith("--job-name=")) {
      flags.jobName = token.slice("--job-name=".length).trim() || flags.jobName;
      continue;
    }
    if (token === "--jobs-dir") {
      flags.jobsDir = argv[index + 1]?.trim() || flags.jobsDir;
      index += 1;
      continue;
    }
    if (token.startsWith("--jobs-dir=")) {
      flags.jobsDir = token.slice("--jobs-dir=".length).trim() || flags.jobsDir;
      continue;
    }
    if (token === "--attempts") {
      flags.attempts = Math.max(1, Number(argv[index + 1] ?? flags.attempts) || flags.attempts);
      index += 1;
      continue;
    }
    if (token.startsWith("--attempts=")) {
      flags.attempts = Math.max(1, Number(token.slice("--attempts=".length)) || flags.attempts);
      continue;
    }
    if (token === "--concurrency") {
      flags.concurrency = Math.max(1, Number(argv[index + 1] ?? flags.concurrency) || flags.concurrency);
      index += 1;
      continue;
    }
    if (token.startsWith("--concurrency=")) {
      flags.concurrency = Math.max(1, Number(token.slice("--concurrency=".length)) || flags.concurrency);
      continue;
    }
    if (token === "--timeout-sec") {
      flags.timeoutSec = Math.max(60, Number(argv[index + 1] ?? flags.timeoutSec) || flags.timeoutSec);
      index += 1;
      continue;
    }
    if (token.startsWith("--timeout-sec=")) {
      flags.timeoutSec = Math.max(60, Number(token.slice("--timeout-sec=".length)) || flags.timeoutSec);
      continue;
    }
  }
  return flags;
}

function detectHarborBinary(): string | undefined {
  const direct = process.platform === "win32" ? "harbor.exe" : "harbor";
  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, direct);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    const candidate = path.join(
      localAppData,
      "Packages",
      "PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0",
      "LocalCache",
      "local-packages",
      "Python313",
      "Scripts",
      "harbor.exe"
    );
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function dockerVersion(): string | undefined {
  try {
    return execFileSync("docker", ["--version"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
}

async function allocateTcpPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate a loopback TCP port for the Terminal-Bench sweep gateway."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function checkHttp(url: string, init?: RequestInit): Promise<SweepCheck> {
  const started = performance.now();
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {
    status: response.status,
    body,
    wallLatencyMs: Number((performance.now() - started).toFixed(2))
  };
}

async function waitForGateway(gatewayUrl: string): Promise<SweepCheck> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const health = await checkHttp(`${gatewayUrl}/health`);
      if (
        health.status === 200 &&
        typeof health.body === "object" &&
        health.body !== null &&
        (health.body as { ok?: boolean }).ok === true &&
        (health.body as { modelReady?: boolean }).modelReady === true
      ) {
        return health;
      }
      lastError = new Error(`Gateway health returned ${health.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error ? lastError : new Error("Q gateway did not become healthy in time.");
}

function resolveGatewayCommand(): { command: string; args: string[] } {
  const compiledGatewayPath = path.join(HARNESS_ROOT, "dist", "q-gateway.js");
  if (existsSync(compiledGatewayPath)) {
    return {
      command: process.execPath,
      args: [compiledGatewayPath]
    };
  }
  const tsxBinary = path.join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx"
  );
  return {
    command: tsxBinary,
    args: [path.join(HARNESS_ROOT, "src", "q-gateway.ts")]
  };
}

function startGatewayProcess(options: {
  runtimeDir: string;
  keysPath: string;
  port: number;
}): ChildProcess {
  const gateway = resolveGatewayCommand();
  return spawn(gateway.command, gateway.args, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      IMMACULATE_RUNTIME_DIR: options.runtimeDir,
      IMMACULATE_Q_API_KEYS_PATH: options.keysPath,
      IMMACULATE_Q_GATEWAY_HOST: "127.0.0.1",
      IMMACULATE_Q_GATEWAY_PORT: String(options.port),
      IMMACULATE_OLLAMA_URL: DEFAULT_OLLAMA_URL,
      IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT: "1",
      IMMACULATE_ENABLE_TERMINAL_BENCH_DIAGNOSTIC_SHIMS: "0"
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function stopGatewayProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  child.kill();
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5000).then(() => undefined)
  ]);
}

function buildJobConfig(options: {
  flags: SweepFlags;
  apiKey: string;
  gatewayUrl: string;
}) {
  return {
    job_name: options.flags.jobName,
    jobs_dir: options.flags.jobsDir.replaceAll("/", "\\"),
    n_attempts: options.flags.attempts,
    timeout_multiplier: 1.0,
    agent_timeout_multiplier: null,
    verifier_timeout_multiplier: null,
    agent_setup_timeout_multiplier: null,
    environment_build_timeout_multiplier: null,
    debug: false,
    n_concurrent_trials: options.flags.concurrency,
    quiet: true,
    retry: {
      max_retries: 0,
      include_exceptions: null,
      exclude_exceptions: [
        "RewardFileEmptyError",
        "AgentTimeoutError",
        "RewardFileNotFoundError",
        "VerifierTimeoutError",
        "VerifierOutputParseError"
      ],
      wait_multiplier: 1.0,
      min_wait_sec: 1.0,
      max_wait_sec: 60.0
    },
    environment: {
      type: "docker",
      import_path: null,
      force_build: false,
      delete: true,
      override_cpus: null,
      override_memory_mb: null,
      override_storage_mb: null,
      override_gpus: null,
      suppress_override_warnings: false,
      mounts_json: null,
      env: {},
      kwargs: {}
    },
    verifier: {
      override_timeout_sec: null,
      max_timeout_sec: null,
      env: {},
      disable: false
    },
    metrics: [],
    agents: [
      {
        name: null,
        import_path: "benchmarks.harbor.q_harbor_agent:HarborQAgent",
        model_name: getQModelName(),
        override_timeout_sec: null,
        override_setup_timeout_sec: null,
        max_timeout_sec: null,
        kwargs: {
          api_key: options.apiKey,
          api_base_url: `${options.gatewayUrl}/v1`,
          timeout_sec: options.flags.timeoutSec
        },
        env: {}
      }
    ],
    datasets: [
      {
        path: null,
        name: "terminal-bench/terminal-bench-2",
        version: null,
        ref: TERMINAL_BENCH_DATASET_REF,
        registry_url: null,
        registry_path: null,
        overwrite: false,
        download_dir: null,
        task_names: null,
        exclude_task_names: null,
        n_tasks: null
      }
    ],
    tasks: [],
    artifacts: []
  };
}

async function runHarbor(harborBin: string, configPath: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(
      harborBin,
      ["run", "--config", configPath, "--yes"],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          NO_COLOR: "1",
          TERM: "dumb"
        },
        stdio: "inherit",
        windowsHide: true
      }
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const release = await resolveReleaseMetadata();
  const jobsDir = path.resolve(REPO_ROOT, flags.jobsDir);
  const jobRoot = path.join(jobsDir, flags.jobName);
  const runtimeDir = path.join(jobRoot, "gateway");
  const keysPath = path.join(runtimeDir, "q-api-keys.json");
  const configPath = path.join(jobRoot, "config.json");
  const resultPath = path.join(jobRoot, "result.json");
  const receiptPath = path.join(jobRoot, "full-sweep-launch.json");
  const harborBin = detectHarborBinary();
  const docker = dockerVersion();
  const port = await allocateTcpPort();
  const gatewayUrl = `http://127.0.0.1:${port}`;
  let gateway: ChildProcess | undefined;

  await mkdir(runtimeDir, { recursive: true });
  await prewarmOllamaModel({
    endpoint: DEFAULT_OLLAMA_URL,
    model: getQModelTarget()
  });

  try {
    gateway = startGatewayProcess({
      runtimeDir,
      keysPath,
      port
    });
    const registry = await createQApiKeyRegistry({
      rootDir: runtimeDir,
      storePath: keysPath,
      defaultRateLimit: normalizeQApiRateLimitPolicy(undefined, {
        requestsPerMinute: 30,
        burst: 30,
        maxConcurrentRequests: 1
      })
    });
    const created = await registry.createKey({
      label: `${flags.jobName}-${Date.now().toString(36)}`,
      rateLimit: {
        requestsPerMinute: 30,
        burst: 30,
        maxConcurrentRequests: 1
      }
    });
    const health = await waitForGateway(gatewayUrl);
    const config = buildJobConfig({
      flags,
      apiKey: created.plainTextKey,
      gatewayUrl
    });
    await mkdir(jobRoot, { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const receipt: SweepReceipt = {
      generatedAt: new Date().toISOString(),
      releaseBuildId: release.buildId,
      gitShortSha: release.gitShortSha,
      modelName: getQModelName(),
      foundationModel: release.q.foundationModel,
      expectedUniqueTasks: DEFAULT_TASK_COUNT,
      sweepMode: flags.launch ? "launch" : "check",
      harbor: {
        binary: harborBin,
        ready: Boolean(harborBin)
      },
      docker: {
        ready: Boolean(docker),
        version: docker
      },
      gateway: {
        url: gatewayUrl,
        health,
        runtimeDir: path.relative(REPO_ROOT, runtimeDir).replaceAll("\\", "/"),
        keysPath: path.relative(REPO_ROOT, keysPath).replaceAll("\\", "/")
      },
      config: {
        path: path.relative(REPO_ROOT, configPath).replaceAll("\\", "/"),
        resultPath: path.relative(REPO_ROOT, resultPath).replaceAll("\\", "/"),
        jobName: flags.jobName,
        jobsDir: path.relative(REPO_ROOT, jobsDir).replaceAll("\\", "/"),
        attempts: flags.attempts,
        concurrency: flags.concurrency,
        dataset: "terminal-bench/terminal-bench-2",
        datasetRef: TERMINAL_BENCH_DATASET_REF,
        fullSweep: true
      }
    };

    if (flags.launch) {
      if (!harborBin) {
        throw new Error("Harbor CLI is not available. Run in check mode or install Harbor first.");
      }
      const exitCode = await runHarbor(harborBin, configPath);
      receipt.launch = {
        completed: exitCode === 0,
        exitCode,
        command: [harborBin, "run", "--config", configPath, "--yes"]
      };
      if (exitCode !== 0) {
        await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
        throw new Error(`Harbor full sweep exited with code ${exitCode}.`);
      }
    }

    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } finally {
    await stopGatewayProcess(gateway);
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Terminal-Bench full sweep launch failed.");
  process.exitCode = 1;
});
