import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type BenchmarkReport } from "@immaculate/core";
import { getLocalVenvPythonPath } from "./utils.js";

export type WandbMode = "online" | "offline" | "disabled";

export type WandbStatus = {
  mode: WandbMode;
  entity: string;
  project: string;
  pythonPath: string;
  publisherScriptPath: string;
  apiKeyPresent: boolean;
  sdkInstalled: boolean;
  usingLocalVenv: boolean;
  configured: boolean;
  ready: boolean;
  note: string;
};

export type WandbPublicationResult = {
  mode: WandbMode;
  entity: string;
  project: string;
  runName: string;
  suiteId: string;
  packId: string;
  url?: string;
  artifactName: string;
  artifactType: string;
  localRunDir?: string;
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(MODULE_ROOT, "..");
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../..");
const LOCAL_VENV_PYTHON = getLocalVenvPythonPath(REPO_ROOT);
const PUBLISHER_SCRIPT_PATH = path.join(HARNESS_ROOT, "scripts", "publish_wandb.py");
const DEFAULT_ENTITY =
  process.env.IMMACULATE_WANDB_ENTITY ?? process.env.WANDB_ENTITY ?? "arobi-arobi-technology-alliance";
const DEFAULT_PROJECT =
  process.env.IMMACULATE_WANDB_PROJECT ?? process.env.WANDB_PROJECT ?? "immaculate";
const DEFAULT_MODE = (
  process.env.IMMACULATE_WANDB_MODE ?? process.env.WANDB_MODE ?? "online"
) as WandbMode;
const STATUS_CACHE_TTL_MS = 15000;
let cachedStatus: { value: WandbStatus; cachedAt: number } | null = null;

function resolvePythonPath(): string {
  if (existsSync(LOCAL_VENV_PYTHON)) {
    return LOCAL_VENV_PYTHON;
  }

  return process.env.IMMACULATE_WANDB_PYTHON ?? "python";
}

function resolveMode(): WandbMode {
  if (DEFAULT_MODE === "offline" || DEFAULT_MODE === "disabled") {
    return DEFAULT_MODE;
  }
  return "online";
}

function resolveApiKey(): string | undefined {
  return process.env.IMMACULATE_WANDB_API_KEY ?? process.env.WANDB_API_KEY;
}

function runPython(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs = 15000
): Promise<{ stdout: string; stderr: string }> {
  const pythonPath = resolvePythonPath();

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, {
      cwd: REPO_ROOT,
      env
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`W&B python process timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `W&B python exited with code ${code}.`));
        return;
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

export async function inspectWandbStatus(): Promise<WandbStatus> {
  if (cachedStatus && Date.now() - cachedStatus.cachedAt < STATUS_CACHE_TTL_MS) {
    return cachedStatus.value;
  }

  const pythonPath = resolvePythonPath();
  const mode = resolveMode();
  const apiKeyPresent = Boolean(resolveApiKey());
  const baseEnv = {
    ...process.env
  };

  try {
    const probe = await runPython(
      [
        "-c",
        "import importlib.util, json; print(json.dumps({'installed': bool(importlib.util.find_spec('wandb'))}))"
      ],
      baseEnv,
      12000
    );
    const payload = JSON.parse(probe.stdout) as { installed?: boolean };
    const sdkInstalled = Boolean(payload.installed);
    const configured = mode === "offline" ? sdkInstalled : sdkInstalled && apiKeyPresent;
    const ready = mode === "disabled" ? false : configured;

    const status = {
      mode,
      entity: DEFAULT_ENTITY,
      project: DEFAULT_PROJECT,
      pythonPath,
      publisherScriptPath: PUBLISHER_SCRIPT_PATH,
      apiKeyPresent,
      sdkInstalled,
      usingLocalVenv: pythonPath === LOCAL_VENV_PYTHON,
      configured,
      ready,
      note:
        mode === "disabled"
          ? "W&B publication is disabled by configuration."
          : !sdkInstalled
            ? "W&B SDK is not installed in the selected Python environment."
            : mode === "offline"
              ? "W&B offline mode is active; runs will be stored locally until synced."
              : apiKeyPresent
                ? "W&B is ready for online publication."
                : "Set WANDB_API_KEY or IMMACULATE_WANDB_API_KEY for online publication."
    };
    cachedStatus = {
      value: status,
      cachedAt: Date.now()
    };
    return status;
  } catch (error) {
    const status = {
      mode,
      entity: DEFAULT_ENTITY,
      project: DEFAULT_PROJECT,
      pythonPath,
      publisherScriptPath: PUBLISHER_SCRIPT_PATH,
      apiKeyPresent,
      sdkInstalled: false,
      usingLocalVenv: pythonPath === LOCAL_VENV_PYTHON,
      configured: false,
      ready: false,
      note: error instanceof Error ? error.message : "Unable to inspect W&B status."
    };
    cachedStatus = {
      value: status,
      cachedAt: Date.now()
    };
    return status;
  }
}

export async function publishBenchmarkToWandb(report: BenchmarkReport): Promise<WandbPublicationResult> {
  const status = await inspectWandbStatus();
  if (!status.ready) {
    throw new Error(status.note);
  }

  const runJsonPath = path.join(REPO_ROOT, "benchmarks", "runs", `${report.suiteId}.json`);
  const runMarkdownPath = path.join(REPO_ROOT, "benchmarks", "runs", `${report.suiteId}.md`);
  const env = {
    ...process.env,
    WANDB_MODE: status.mode,
    WANDB_ENTITY: status.entity,
    WANDB_PROJECT: status.project,
    IMMACULATE_WANDB_ENTITY: status.entity,
    IMMACULATE_WANDB_PROJECT: status.project
  } as NodeJS.ProcessEnv;
  const apiKey = resolveApiKey();
  if (apiKey) {
    env.WANDB_API_KEY = apiKey;
  }

  const execution = await runPython(
    [
      PUBLISHER_SCRIPT_PATH,
      "--report-json",
      runJsonPath,
      "--report-markdown",
      runMarkdownPath,
      "--entity",
      status.entity,
      "--project",
      status.project,
      "--mode",
      status.mode
    ],
    env,
    180000
  );

  return JSON.parse(execution.stdout) as WandbPublicationResult;
}
