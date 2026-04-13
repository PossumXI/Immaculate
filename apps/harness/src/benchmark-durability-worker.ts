import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createEngine } from "@immaculate/core";
import { createPersistence } from "./persistence.js";

type FailureMode =
  | "hard-kill"
  | "abort"
  | "disk-full-simulated"
  | "checkpoint-corruption"
  | "power-loss-simulated";

type WorkerFlags = {
  runtimeDir: string;
  heartbeatPath: string;
  mode: FailureMode;
  iteration: number;
};

function parseFlags(argv: string[]): WorkerFlags {
  const flags: Partial<WorkerFlags> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (token === "--runtimeDir" && value) {
      flags.runtimeDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === "--heartbeatPath" && value) {
      flags.heartbeatPath = path.resolve(value);
      index += 1;
      continue;
    }
    if (token === "--mode" && value) {
      flags.mode = value as FailureMode;
      index += 1;
      continue;
    }
    if (token === "--iteration" && value) {
      flags.iteration = Number(value);
      index += 1;
    }
  }

  if (!flags.runtimeDir || !flags.heartbeatPath || !flags.mode || !Number.isFinite(flags.iteration)) {
    throw new Error("durability worker requires --runtimeDir, --heartbeatPath, --mode, and --iteration");
  }

  return flags as WorkerFlags;
}

async function writeHeartbeat(heartbeatPath: string, payload: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(heartbeatPath), { recursive: true });
  await writeFile(heartbeatPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const faultInjection =
    flags.mode === "disk-full-simulated"
      ? {
          triggerPersistCount: 19,
          target: "snapshot" as const,
          errorCode: "ENOSPC" as const
        }
      : undefined;

  const persistence = createPersistence(flags.runtimeDir, {
    faultInjection
  });
  const recoveredState = await persistence.load();
  const engine = createEngine(
    recoveredState
      ? {
          durableState: recoveredState,
          bootstrap: false
        }
      : {
          bootstrap: false
        }
  );

  for (let tick = 0; tick < 18; tick += 1) {
    engine.tick();
    await persistence.persist(engine.getDurableState());
    if (persistence.getStatus().checkpointCount > 0 && tick >= 8) {
      break;
    }
  }

  const safeMarkerState = engine.getDurableState();
  const expectedEventId = safeMarkerState.snapshot.lastEventId;
  await writeHeartbeat(flags.heartbeatPath, {
    iteration: flags.iteration,
    mode: flags.mode,
    stage: "armed",
    expectedEventId,
    cycle: safeMarkerState.snapshot.cycle,
    epoch: safeMarkerState.snapshot.epoch,
    timestamp: new Date().toISOString()
  });

  if (flags.mode === "disk-full-simulated") {
    engine.tick();
    await persistence.persist(engine.getDurableState());
    return;
  }

  if (flags.mode === "abort") {
    process.abort();
  }

  // The supervisor owns the hard-failure boundary for kill/corruption modes.
  await new Promise<void>(() => {
    setInterval(() => undefined, 1000);
  });
}

void main().catch(async (error) => {
  process.stderr.write(error instanceof Error ? error.message : "durability worker failed");
  process.exitCode = 1;
});
