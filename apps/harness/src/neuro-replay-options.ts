export type StartReplayOptions = {
  windowSize?: number;
  paceMs?: number;
  maxWindows?: number;
};

export type NormalizedReplayOptions = {
  windowSize: number;
  paceMs: number;
  maxWindows?: number;
};

const DEFAULT_REPLAY_WINDOW_SIZE = 2;
const MIN_REPLAY_WINDOW_SIZE = 1;
const MAX_REPLAY_WINDOW_SIZE = 512;
const DEFAULT_REPLAY_PACE_MS = 120;
const MIN_REPLAY_PACE_MS = 20;
const MAX_REPLAY_PACE_MS = 10_000;
const MIN_REPLAY_WINDOWS = 1;
const MAX_REPLAY_WINDOWS = 10_000;

function normalizeBoundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeNeuroReplayOptions(
  options: StartReplayOptions = {}
): NormalizedReplayOptions {
  const normalized: NormalizedReplayOptions = {
    windowSize: normalizeBoundedInteger(
      options.windowSize,
      DEFAULT_REPLAY_WINDOW_SIZE,
      MIN_REPLAY_WINDOW_SIZE,
      MAX_REPLAY_WINDOW_SIZE
    ),
    paceMs: normalizeBoundedInteger(
      options.paceMs,
      DEFAULT_REPLAY_PACE_MS,
      MIN_REPLAY_PACE_MS,
      MAX_REPLAY_PACE_MS
    )
  };
  if (typeof options.maxWindows === "number") {
    normalized.maxWindows = normalizeBoundedInteger(
      options.maxWindows,
      MAX_REPLAY_WINDOWS,
      MIN_REPLAY_WINDOWS,
      MAX_REPLAY_WINDOWS
    );
  }
  return normalized;
}
