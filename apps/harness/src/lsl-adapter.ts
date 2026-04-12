import { createInterface } from "node:readline";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import type { LiveNeuroPayload } from "./live-neuro.js";

export type LslStreamDescriptor = {
  sourceId: string;
  name: string;
  uid?: string;
  sessionId?: string;
  kind?: string;
  rateHz?: number;
  channelCount?: number;
  description?: string;
};

export type LslDiscoveryResult = {
  available: boolean;
  reason?: string;
  streams: LslStreamDescriptor[];
  stderr: string[];
};

export type LslBridgeState =
  | {
      state: "idle";
      sourceId?: string;
      available: boolean;
      reason?: string;
    }
  | {
      state: "connecting" | "connected";
      sourceId: string;
      available: true;
      pid: number;
      startedAt: string;
    }
  | {
      state: "stopped" | "failed";
      sourceId: string;
      available: false;
      reason?: string;
      code?: number | null;
      signal?: NodeJS.Signals | null;
      stoppedAt: string;
    };

export type LslConnectOptions = {
  sourceId?: string;
  name?: string;
  uid?: string;
  sessionId?: string;
  label?: string;
  kind?: string;
  rateHz?: number;
  windowSize?: number;
  pullTimeoutMs?: number;
  maxRows?: number;
};

export type LslAdapterCallbacks = {
  onPayload?: (payload: LiveNeuroPayload) => Promise<void> | void;
  onState?: (state: LslBridgeState) => Promise<void> | void;
  onStatus?: (message: string) => Promise<void> | void;
};

export type LslBridgeConnection = {
  id: string;
  sourceId: string;
  state: () => LslBridgeState;
  stop: () => Promise<LslBridgeState>;
  wait: () => Promise<LslBridgeState>;
};

export type LslAdapterManager = {
  discover: () => Promise<LslDiscoveryResult>;
  connect: (options: LslConnectOptions) => Promise<LslBridgeConnection>;
  stop: (connectionIdOrSourceId: string) => Promise<boolean>;
  listConnections: () => LslBridgeState[];
  isAvailable: () => Promise<boolean>;
  dispose: () => Promise<void>;
};

type ManagedConnection = {
  id: string;
  sourceId: string;
  child: ChildProcessByStdio<null, Readable, Readable>;
  state: LslBridgeState;
  resolve: (state: LslBridgeState) => void;
  reject: (error: Error) => void;
  done: Promise<LslBridgeState>;
};

const DEFAULT_PULL_TIMEOUT_MS = 250;
const DEFAULT_WINDOW_SIZE = 16;
const DEFAULT_MAX_ROWS = 0;

function managerRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function scriptPath(name: "lsl_bridge.py" | "lsl_discover.py"): string {
  const override =
    name === "lsl_bridge.py"
      ? process.env.IMMACULATE_LSL_BRIDGE_SCRIPT
      : process.env.IMMACULATE_LSL_DISCOVER_SCRIPT;
  return override?.trim().length ? override.trim() : path.join(managerRoot(), "scripts", name);
}

function pythonCommand(): string {
  return (
    process.env.IMMACULATE_LSL_PYTHON ??
    process.env.PYTHON ??
    (process.platform === "win32" ? "python" : "python3")
  );
}

function safeJsonParse(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeStream(value: Record<string, unknown>): LslStreamDescriptor | undefined {
  const sourceId = asString(value.sourceId ?? value.uid ?? value.name);
  const name = asString(value.name);
  if (!sourceId || !name) {
    return undefined;
  }

  return {
    sourceId,
    name,
    uid: asString(value.uid),
    sessionId: asString(value.sessionId),
    kind: asString(value.kind ?? value.type),
    rateHz: asNumber(value.rateHz),
    channelCount: asNumber(value.channelCount),
    description: asString(value.description)
  };
}

function normalizePayload(value: Record<string, unknown>): LiveNeuroPayload | undefined {
  const sourceId = asString(value.sourceId);
  const samples = value.samples;
  if (!sourceId || !Array.isArray(samples)) {
    return undefined;
  }

  const normalizedSamples = samples.flatMap((row) => {
    if (Array.isArray(row)) {
      return [row.map((entry) => Number(entry))];
    }
    if (typeof row === "number") {
      return [[Number(row)]];
    }
    return [];
  });

  if (normalizedSamples.length === 0) {
    return undefined;
  }

  return {
    sourceId,
    label: asString(value.label),
    sessionId: asString(value.sessionId),
    kind: asString(value.kind) as LiveNeuroPayload["kind"],
    rateHz: asNumber(value.rateHz),
    syncJitterMs: asNumber(value.syncJitterMs),
    timestamp: asString(value.timestamp),
    samples: normalizedSamples,
    channels: asNumber(value.channels)
  };
}

function spawnPythonScript(scriptName: "lsl_bridge.py" | "lsl_discover.py", args: string[] = []) {
  const command = pythonCommand();
  const script = scriptPath(scriptName);
  if (!existsSync(script)) {
    throw new Error(`Missing LSL helper script: ${script}`);
  }

  return spawn(command, [script, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

async function collectLines(stream: NodeJS.ReadableStream): Promise<string[]> {
  const lines: string[] = [];
  const reader = createInterface({ input: stream });
  for await (const line of reader) {
    const trimmed = String(line).trim();
    if (trimmed.length > 0) {
      lines.push(trimmed);
    }
  }
  return lines;
}

export function createLslAdapterManager(callbacks: LslAdapterCallbacks = {}): LslAdapterManager {
  const connections = new Map<string, ManagedConnection>();
  let connectionSeq = 0;

  async function emitState(state: LslBridgeState): Promise<void> {
    await callbacks.onState?.(state);
  }

  async function discover(): Promise<LslDiscoveryResult> {
    try {
      const child = spawnPythonScript("lsl_discover.py");
      const stderrPromise = collectLines(child.stderr);
      const stdoutPromise = collectLines(child.stdout);
      const [stderr, stdout] = await Promise.all([
        stderrPromise,
        stdoutPromise.then((lines) => lines)
      ]);
      const streams: LslStreamDescriptor[] = [];
      let available = true;
      let reason: string | undefined;

      for (const line of stdout) {
        const parsed = safeJsonParse(line);
        if (!parsed) {
          continue;
        }
        if (asBoolean(parsed.available) === false) {
          available = false;
          reason = asString(parsed.reason) ?? reason;
          continue;
        }
        const stream = normalizeStream(parsed);
        if (stream) {
          streams.push(stream);
        }
      }

      for (const line of stderr) {
        const parsed = safeJsonParse(line);
        if (!parsed) {
          continue;
        }
        if (asBoolean(parsed.available) === false) {
          available = false;
          reason = asString(parsed.reason) ?? reason;
        }
      }

      const exitCode = await new Promise<number | null>((resolve) => {
        child.once("close", (code) => resolve(code));
        child.once("error", () => resolve(null));
      });

      if (exitCode !== 0 && streams.length === 0 && !reason) {
        available = false;
        reason = `lsl-discover-exit-${exitCode ?? "unknown"}`;
      }

      return {
        available,
        reason,
        streams,
        stderr
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : "lsl-discover-failed",
        streams: [],
        stderr: []
      };
    }
  }

  async function connect(options: LslConnectOptions): Promise<LslBridgeConnection> {
    const connectId = `lsl-${++connectionSeq}`;
    const sourceId = options.sourceId ?? options.uid ?? options.name ?? connectId;
    const existing = [...connections.values()].find((candidate) => candidate.sourceId === sourceId);
    if (existing) {
      return {
        id: existing.id,
        sourceId: existing.sourceId,
        state: () => existing.state,
        stop: async () => {
          await stop(existing.id);
          return existing.state;
        },
        wait: () => existing.done
      };
    }
    const state: LslBridgeState = {
      state: "connecting",
      sourceId,
      available: true,
      pid: -1,
      startedAt: new Date().toISOString()
    };
    await emitState(state);

    const child = spawnPythonScript("lsl_bridge.py", [
      "--source-id",
      sourceId,
      ...(options.name ? ["--name", options.name] : []),
      ...(options.uid ? ["--uid", options.uid] : []),
      ...(options.sessionId ? ["--session-id", options.sessionId] : []),
      ...(options.label ? ["--label", options.label] : []),
      ...(options.kind ? ["--kind", options.kind] : []),
      ...(typeof options.rateHz === "number" ? ["--rate-hz", String(options.rateHz)] : []),
      ...(typeof options.windowSize === "number" ? ["--window-size", String(options.windowSize)] : []),
      ...(typeof options.pullTimeoutMs === "number" ? ["--pull-timeout-ms", String(options.pullTimeoutMs)] : []),
      ...(typeof options.maxRows === "number" ? ["--max-rows", String(options.maxRows)] : [])
    ]);

    const pending: ManagedConnection = {
      id: connectId,
      sourceId,
      child,
      state: {
        state: "connecting",
        sourceId,
        available: true,
        pid: child.pid ?? -1,
        startedAt: new Date().toISOString()
      },
      resolve: () => undefined,
      reject: () => undefined,
      done: Promise.resolve(state)
    };

    const done = new Promise<LslBridgeState>((resolve, reject) => {
      pending.resolve = resolve;
      pending.reject = reject;
    });
    pending.done = done;
    connections.set(connectId, pending);
    let payloadChain = Promise.resolve();

    const stdoutReader = createInterface({ input: child.stdout });
    stdoutReader.on("line", (line) => {
      payloadChain = payloadChain
        .then(async () => {
          const parsed = safeJsonParse(line);
          if (!parsed) {
            return;
          }

          const payload = normalizePayload(parsed);
          if (!payload) {
            return;
          }

          await callbacks.onPayload?.(payload);
          const nextState: LslBridgeState = {
            state: "connected",
            sourceId,
            available: true,
            pid: child.pid ?? -1,
            startedAt:
              pending.state.state === "connecting"
                ? pending.state.startedAt
                : new Date().toISOString()
          };
          pending.state = nextState;
          await emitState(nextState);
        })
        .catch(async (error) => {
          await callbacks.onStatus?.(
            error instanceof Error ? error.message : "lsl-payload-processing-failed"
          );
        });
    });

    const stderrReader = createInterface({ input: child.stderr });
    stderrReader.on("line", async (line) => {
      const parsed = safeJsonParse(line);
      if (!parsed) {
        await callbacks.onStatus?.(line.trim());
        return;
      }
      if (asBoolean(parsed.available) === false) {
        const unavailable: LslBridgeState = {
          state: "failed",
          sourceId,
          available: false,
          reason: asString(parsed.reason) ?? "lsl-unavailable",
          code: child.exitCode,
          signal: child.signalCode,
          stoppedAt: new Date().toISOString()
        };
        pending.state = unavailable;
        await emitState(unavailable);
      }
      const status = asString(parsed.reason) ?? asString(parsed.type);
      if (status) {
        await callbacks.onStatus?.(status);
      }
    });

    child.once("error", async (error) => {
      const failed: LslBridgeState = {
        state: "failed",
        sourceId,
        available: false,
        reason: error.message,
        stoppedAt: new Date().toISOString()
      };
      pending.state = failed;
      await emitState(failed);
      pending.reject(error);
    });

    child.once("close", async (code, signal) => {
      const stopped: LslBridgeState = {
        state: code === 0 ? "stopped" : "failed",
        sourceId,
        available: false,
        reason: code === 0 ? "bridge-stopped" : "bridge-exited",
        code,
        signal,
        stoppedAt: new Date().toISOString()
      };
      pending.state = stopped;
      connections.delete(connectId);
      await emitState(stopped);
      pending.resolve(stopped);
    });

    return {
      id: connectId,
      sourceId,
      state: () => pending.state,
      stop: async () => {
        if (!child.killed) {
          child.kill();
        }
        const stopped: LslBridgeState = {
          state: "stopped",
          sourceId,
          available: false,
          reason: "stopped-by-request",
          stoppedAt: new Date().toISOString()
        };
        pending.state = stopped;
        connections.delete(connectId);
        await emitState(stopped);
        return stopped;
      },
      wait: () => done
    };
  }

  async function stop(connectionIdOrSourceId: string): Promise<boolean> {
    const entry =
      connections.get(connectionIdOrSourceId) ??
      [...connections.values()].find((candidate) => candidate.sourceId === connectionIdOrSourceId);
    if (!entry) {
      return false;
    }
    await entry.resolve({
      state: "stopped",
      sourceId: entry.sourceId,
      available: false,
      reason: "stopped-by-request",
      stoppedAt: new Date().toISOString()
    });
    if (!entry.child.killed) {
      entry.child.kill();
    }
    connections.delete(entry.id);
    await callbacks.onState?.({
      state: "stopped",
      sourceId: entry.sourceId,
      available: false,
      reason: "stopped-by-request",
      stoppedAt: new Date().toISOString()
    });
    return true;
  }

  async function isAvailable(): Promise<boolean> {
    const discovery = await discover();
    return discovery.available;
  }

  async function dispose(): Promise<void> {
    for (const entry of connections.values()) {
      if (!entry.child.killed) {
        entry.child.kill();
      }
    }
    connections.clear();
  }

  return {
    discover,
    connect,
    stop,
    listConnections: () =>
      [...connections.values()]
        .map((entry) => entry.state)
        .sort((left, right) => {
          const leftTime = "startedAt" in left ? Date.parse(left.startedAt) : 0;
          const rightTime = "startedAt" in right ? Date.parse(right.startedAt) : 0;
          return rightTime - leftTime;
        }),
    isAvailable,
    dispose
  };
}
