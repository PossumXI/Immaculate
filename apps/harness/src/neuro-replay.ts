import {
  neuroFrameWindowSchema,
  neuroReplayStateSchema,
  type NeuroFrameWindow,
  type NeuroReplayState,
  type NeuroSessionSummary
} from "@immaculate/core";
import { buildNwbReplayFrames } from "./nwb.js";
import {
  normalizeNeuroReplayOptions,
  type StartReplayOptions
} from "./neuro-replay-options.js";
import { hashValue } from "./utils.js";

type ReplayRecord = {
  state: NeuroReplayState;
  frames: NeuroFrameWindow[];
  timer: NodeJS.Timeout;
  cursor: number;
  readyCount: number;
  inflight: boolean;
};

type ReplayCallbacks = {
  onReplayUpdate: (replay: NeuroReplayState) => Promise<void> | void;
  onFrame: (frame: NeuroFrameWindow) => Promise<void> | void;
};

function cloneReplayState(replay: NeuroReplayState): NeuroReplayState {
  return neuroReplayStateSchema.parse(structuredClone(replay)) as NeuroReplayState;
}

function withCapturedAt(frame: NeuroFrameWindow, replayId: string): NeuroFrameWindow {
  return neuroFrameWindowSchema.parse({
    ...frame,
    replayId,
    capturedAt: new Date().toISOString()
  }) as NeuroFrameWindow;
}

export function createNeuroReplayManager(callbacks: ReplayCallbacks) {
  const active = new Map<string, ReplayRecord>();

  async function settleReplay(replayId: string, status: NeuroReplayState["status"]): Promise<void> {
    const record = active.get(replayId);
    if (!record) {
      return;
    }

    clearInterval(record.timer);
    const timestamp = new Date().toISOString();
    record.state = neuroReplayStateSchema.parse({
      ...record.state,
      status,
      updatedAt: timestamp,
      completedAt: timestamp
    }) as NeuroReplayState;
    await callbacks.onReplayUpdate(record.state);
    active.delete(replayId);
  }

  async function tickReplay(replayId: string): Promise<void> {
    const record = active.get(replayId);
    if (!record || record.inflight) {
      return;
    }

    record.inflight = true;
    try {
      if (record.cursor >= record.frames.length) {
        await settleReplay(replayId, "completed");
        return;
      }

      const frame = withCapturedAt(record.frames[record.cursor]!, replayId);
      if (frame.decodeReady) {
        record.readyCount += 1;
      }

      await callbacks.onFrame(frame);

      record.cursor += 1;
      record.state = neuroReplayStateSchema.parse({
        ...record.state,
        status: record.cursor >= record.frames.length ? "completed" : "running",
        completedWindows: record.cursor,
        decodeReadyRatio:
          record.cursor > 0 ? Number((record.readyCount / record.cursor).toFixed(3)) : 0,
        lastMeanAbs: frame.meanAbs,
        lastSyncJitterMs: frame.syncJitterMs,
        updatedAt: frame.capturedAt,
        completedAt: record.cursor >= record.frames.length ? frame.capturedAt : undefined,
        lastWindowId: frame.id
      }) as NeuroReplayState;
      await callbacks.onReplayUpdate(record.state);

      if (record.cursor >= record.frames.length) {
        clearInterval(record.timer);
        active.delete(replayId);
      }
    } finally {
      record.inflight = false;
    }
  }

  return {
    async start(
      session: NeuroSessionSummary,
      options: StartReplayOptions = {}
    ): Promise<NeuroReplayState> {
      const startedAt = new Date().toISOString();
      const replayId = `replay-${hashValue(`${session.id}:${startedAt}`)}`;
      const replayOptions = normalizeNeuroReplayOptions(options);
      const frames = await buildNwbReplayFrames(session.filePath, {
        replayId,
        windowSize: replayOptions.windowSize,
        maxWindows: replayOptions.maxWindows
      });

      const replay = neuroReplayStateSchema.parse({
        id: replayId,
        sessionId: session.id,
        name: session.name,
        source: "nwb-replay",
        status: "running",
        windowSize: replayOptions.windowSize,
        paceMs: replayOptions.paceMs,
        totalWindows: frames.length,
        completedWindows: 0,
        decodeReadyRatio: 0,
        lastMeanAbs: 0,
        lastSyncJitterMs: 0,
        startedAt,
        updatedAt: startedAt
      }) as NeuroReplayState;

      if (frames.length === 0) {
        return neuroReplayStateSchema.parse({
          ...replay,
          status: "stopped",
          completedAt: startedAt
        }) as NeuroReplayState;
      }

      const intervalPaceMs = replayOptions.paceMs;
      if (!Number.isSafeInteger(intervalPaceMs) || intervalPaceMs < 20 || intervalPaceMs > 10_000) {
        throw new Error(`Normalized replay pace ${intervalPaceMs}ms is outside the governed timer bounds.`);
      }

      const timer = setInterval(() => {
        void tickReplay(replayId);
      }, intervalPaceMs);
      active.set(replayId, {
        state: replay,
        frames,
        timer,
        cursor: 0,
        readyCount: 0,
        inflight: false
      });

      await callbacks.onReplayUpdate(replay);
      await tickReplay(replayId);
      return cloneReplayState(active.get(replayId)?.state ?? replay);
    },

    async stop(replayId: string): Promise<NeuroReplayState | null> {
      const record = active.get(replayId);
      if (!record) {
        return null;
      }

      await settleReplay(replayId, "stopped");
      return cloneReplayState(record.state);
    },

    async stopAll(): Promise<void> {
      await Promise.all([...active.keys()].map((replayId) => settleReplay(replayId, "stopped")));
    },

    list(): NeuroReplayState[] {
      return [...active.values()]
        .map((record) => cloneReplayState(record.state))
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    }
  };
}
