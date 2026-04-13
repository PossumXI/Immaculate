import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { inspectDurableState } from "@immaculate/core";
import { createPersistence } from "./persistence.js";

type FailureMode =
  | "hard-kill"
  | "abort"
  | "disk-full-simulated"
  | "checkpoint-corruption"
  | "power-loss-simulated";

type HeartbeatRecord = {
  iteration: number;
  mode: FailureMode;
  stage: "armed";
  expectedEventId?: string;
};

export type DurabilityTortureModeSummary = {
  mode: FailureMode;
  iterations: number;
  recovered: number;
  dataLosses: number;
};

export type DurabilityTortureResult = {
  totalIterations: number;
  modeCount: number;
  totalDurationMs: number;
  recoverySuccessSamples: number[];
  dataLossSamples: number[];
  iterationDurationSamples: number[];
  modeSummaries: DurabilityTortureModeSummary[];
  lastRecoveryMode: string;
  lastCheckpointCount: number;
  lastIntegrityStatus: string;
};

const HARNESS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../..");
const execFileAsync = promisify(execFile);
const DURABILITY_HEARTBEAT_TIMEOUT_MS = 20000;
const DURABILITY_POLL_INTERVAL_MS = 50;

function resolveWorkerCommand(): { command: string; args: string[] } {
  const compiledWorkerPath = path.join(HARNESS_ROOT, "dist", "benchmark-durability-worker.js");
  if (existsSync(compiledWorkerPath)) {
    return {
      command: process.execPath,
      args: [compiledWorkerPath]
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
    args: [path.join(HARNESS_ROOT, "src", "benchmark-durability-worker.ts")]
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHeartbeat(
  heartbeatPath: string,
  expectedIteration: number
): Promise<HeartbeatRecord> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < DURABILITY_HEARTBEAT_TIMEOUT_MS) {
    try {
      const raw = await readFile(heartbeatPath, "utf8");
      const parsed = JSON.parse(raw) as HeartbeatRecord;
      if (parsed.iteration === expectedIteration && parsed.stage === "armed") {
        return parsed;
      }
    } catch {
      // Wait for the heartbeat to materialize fully.
    }
    await delay(DURABILITY_POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for durability heartbeat for iteration ${expectedIteration}.`);
}

async function forceKillProcess(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }
  process.kill(pid, "SIGKILL");
}

async function corruptLatestCheckpoint(runtimeDir: string): Promise<void> {
  const checkpointsPath = path.join(runtimeDir, "checkpoints.json");
  try {
    const raw = await readFile(checkpointsPath, "utf8");
    const parsed = JSON.parse(raw) as Array<{ filePath?: string }>;
    const latest = parsed[0]?.filePath;
    if (!latest) {
      return;
    }
    await writeFile(latest, '{"corrupt":', "utf8");
  } catch {
    // Ignore absent checkpoint metadata; the recovery path will account for it.
  }
}

async function simulatePowerLossArtifacts(runtimeDir: string): Promise<void> {
  await Promise.all(
    [path.join(runtimeDir, "snapshot.json"), path.join(runtimeDir, "persistence-status.json")].map(
      async (filePath) => {
        try {
          await writeFile(filePath, '{"power_loss":', "utf8");
        } catch {
          // Ignore absent files.
        }
      }
    )
  );
}

function buildFailureModes(): FailureMode[] {
  return [
    "hard-kill",
    "abort",
    "disk-full-simulated",
    "checkpoint-corruption",
    "power-loss-simulated"
  ];
}

function iterationsPerMode(): number {
  const configured = Number(process.env.IMMACULATE_DURABILITY_TORTURE_ITERATIONS ?? 1000);
  const modes = buildFailureModes().length;
  return Math.max(1, Math.floor(configured / modes));
}

export async function runDurabilityTortureBenchmark(runtimeDir: string): Promise<DurabilityTortureResult> {
  const failureModes = buildFailureModes();
  const perMode = iterationsPerMode();
  const heartbeatPath = path.join(runtimeDir, "durability-torture", "heartbeat.json");
  const recoverySuccessSamples: number[] = [];
  const dataLossSamples: number[] = [];
  const iterationDurationSamples: number[] = [];
  const modeSummaries = new Map<FailureMode, DurabilityTortureModeSummary>(
    failureModes.map((mode) => [
      mode,
      {
        mode,
        iterations: 0,
        recovered: 0,
        dataLosses: 0
      }
    ])
  );
  let lastRecoveryMode = "fresh";
  let lastCheckpointCount = 0;
  let lastIntegrityStatus = "invalid";
  const startedAt = performance.now();
  const worker = resolveWorkerCommand();

  for (const mode of failureModes) {
    for (let modeIteration = 0; modeIteration < perMode; modeIteration += 1) {
      const iteration = recoverySuccessSamples.length + 1;
      const modeSummary = modeSummaries.get(mode)!;
      modeSummary.iterations += 1;
      const iterationStartedAt = performance.now();
      const child = spawn(
        worker.command,
        [
          ...worker.args,
          "--runtimeDir",
          runtimeDir,
          "--heartbeatPath",
          heartbeatPath,
          "--mode",
          mode,
          "--iteration",
          String(iteration)
        ],
        {
          cwd: REPO_ROOT,
          stdio: ["ignore", "ignore", "pipe"]
        }
      );

      let childError = "";
      child.stderr.on("data", (chunk: Buffer | string) => {
        childError += String(chunk);
      });

      const heartbeat = await waitForHeartbeat(heartbeatPath, iteration);

      if (mode === "hard-kill" || mode === "checkpoint-corruption" || mode === "power-loss-simulated") {
        await forceKillProcess(child.pid!);
      }

      if (mode === "checkpoint-corruption") {
        await corruptLatestCheckpoint(runtimeDir);
      }
      if (mode === "power-loss-simulated") {
        await simulatePowerLossArtifacts(runtimeDir);
      }

      await new Promise<void>((resolve) => {
        child.once("close", () => resolve());
      });

      const persistence = createPersistence(runtimeDir);
      const recoveredState = await persistence.load();
      const replayTail = await persistence.replay({
        limit: 128
      });
      const recoveredIntegrity = recoveredState
        ? inspectDurableState(recoveredState)
        : undefined;
      const expectedEventPresent = Boolean(
        heartbeat.expectedEventId &&
          (replayTail.some((event) => event.eventId === heartbeat.expectedEventId) ||
            recoveredState?.snapshot.lastEventId === heartbeat.expectedEventId)
      );
      const recovered = Boolean(recoveredState && recoveredIntegrity?.valid);
      const dataLoss = heartbeat.expectedEventId ? Number(!expectedEventPresent) : 1;

      recoverySuccessSamples.push(recovered ? 1 : 0);
      dataLossSamples.push(dataLoss);
      iterationDurationSamples.push(
        Number((performance.now() - iterationStartedAt).toFixed(2))
      );
      if (recovered) {
        modeSummary.recovered += 1;
      }
      modeSummary.dataLosses += dataLoss;

      const status = persistence.getStatus();
      lastRecoveryMode = status.recoveryMode;
      lastCheckpointCount = status.checkpointCount;
      lastIntegrityStatus = recoveredIntegrity?.status ?? status.integrityStatus ?? "invalid";

      if (!recovered && childError.trim().length > 0 && mode === "disk-full-simulated") {
        // Disk-full simulation is expected to crash the child; recovery is the real signal.
      }
    }
  }

  return {
    totalIterations: recoverySuccessSamples.length,
    modeCount: failureModes.length,
    totalDurationMs: Number((performance.now() - startedAt).toFixed(2)),
    recoverySuccessSamples,
    dataLossSamples,
    iterationDurationSamples,
    modeSummaries: Array.from(modeSummaries.values()),
    lastRecoveryMode,
    lastCheckpointCount,
    lastIntegrityStatus
  };
}
