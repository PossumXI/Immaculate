import { z } from "zod";
import {
  neuroFrameWindowSchema,
  neuroReplayStateSchema,
  neuroStreamKinds,
  type NeuroFrameWindow,
  type NeuroReplayState,
  type NeuroStreamKind
} from "@immaculate/core";
import { collapseSampleRows, extractBandPower } from "./neuro-bands.js";
import { hashValue } from "./utils.js";

type LiveNeuroManagerCallbacks = {
  onIngressUpdate: (ingress: NeuroReplayState) => Promise<void> | void;
  onFrame: (frame: NeuroFrameWindow) => Promise<void> | void;
};

const liveNeuroPayloadSchema = z
  .object({
    sourceId: z.string().min(1),
    label: z.string().optional(),
    sessionId: z.string().optional(),
    kind: z.enum(neuroStreamKinds).optional(),
    rateHz: z.number().positive().optional(),
    syncJitterMs: z.number().nonnegative().optional(),
    timestamp: z.string().optional(),
    samples: z.union([z.array(z.array(z.number()).min(1)).min(1), z.array(z.number()).min(1)]),
    channels: z.number().int().positive().optional()
  })
  .strict();

export type LiveNeuroPayload = z.infer<typeof liveNeuroPayloadSchema>;

type ActiveIngressRecord = {
  state: NeuroReplayState;
  frameCount: number;
  readyCount: number;
};

function clamp(value: number, min = 0, max = 0.99): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSamples(samples: LiveNeuroPayload["samples"], channels?: number): number[][] {
  if (Array.isArray(samples[0])) {
    return samples as number[][];
  }

  const flat = samples as number[];
  const resolvedChannels = channels ?? 1;
  const rows: number[][] = [];
  for (let index = 0; index < flat.length; index += resolvedChannels) {
    rows.push(flat.slice(index, index + resolvedChannels));
  }
  return rows;
}

function deriveConfidence(meanAbs: number, rms: number, peak: number, syncJitterMs: number): number {
  return clamp(0.32 + meanAbs * 3.4 + rms * 2 + peak * 0.6 - syncJitterMs * 0.03);
}

function buildInitialIngress(sourceId: string, payload: LiveNeuroPayload, timestamp: string): NeuroReplayState {
  const rows = normalizeSamples(payload.samples, payload.channels);
  return neuroReplayStateSchema.parse({
    id: sourceId,
    sessionId: payload.sessionId ?? `live-session-${sourceId}`,
    name: payload.label ?? sourceId,
    source: "live-socket",
    status: "running",
    windowSize: rows.length,
    paceMs:
      payload.rateHz && rows.length > 0
        ? Math.max(1, Math.round((rows.length / payload.rateHz) * 1000))
        : 120,
    totalWindows: 0,
    completedWindows: 0,
    decodeReadyRatio: 0,
    lastMeanAbs: 0,
    lastSyncJitterMs: payload.syncJitterMs ?? 0,
    startedAt: timestamp,
    updatedAt: timestamp
  }) as NeuroReplayState;
}

export function buildLiveNeuroFrame(
  payloadInput: LiveNeuroPayload,
  priorState?: NeuroReplayState
): {
  ingress: NeuroReplayState;
  frame: NeuroFrameWindow;
} {
  const payload = liveNeuroPayloadSchema.parse(payloadInput);
  const capturedAt = payload.timestamp ?? new Date().toISOString();
  const samples = normalizeSamples(payload.samples, payload.channels);
  const sampleCount = samples.length;
  const channelCount = sampleCount > 0 ? Math.max(...samples.map((row) => row.length)) : payload.channels ?? 1;
  const flattened = samples.flatMap((row) => row.map((value) => Number(value)));
  const monoSamples = collapseSampleRows(samples);
  const observationCount = Math.max(flattened.length, 1);
  const sumAbs = flattened.reduce((sum, value) => sum + Math.abs(value), 0);
  const sumSquares = flattened.reduce((sum, value) => sum + value * value, 0);
  const peak = flattened.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const meanAbs = Number((sumAbs / observationCount).toFixed(6));
  const rms = Number(Math.sqrt(sumSquares / observationCount).toFixed(6));
  const syncJitterMs = Number((payload.syncJitterMs ?? 0).toFixed(3));
  const decodeConfidence = Number(
    deriveConfidence(meanAbs, rms, peak, syncJitterMs).toFixed(6)
  );
  const bandPower =
    payload.rateHz && monoSamples.length > 0
      ? extractBandPower(monoSamples, payload.rateHz)
      : undefined;
  const sourceId = payload.sourceId;
  const prior = priorState ?? buildInitialIngress(sourceId, payload, capturedAt);
  const nextWindowIndex = prior.completedWindows;
  const sampleStart = nextWindowIndex * sampleCount;
  const sampleEnd = sampleStart + sampleCount;

  const frame = neuroFrameWindowSchema.parse({
    id: `frame-${hashValue(`${sourceId}:${capturedAt}:${nextWindowIndex}`)}`,
    replayId: sourceId,
    sessionId: prior.sessionId,
    source: "live-socket",
    windowIndex: nextWindowIndex,
    sampleStart,
    sampleEnd,
    streamCount: 1,
    channelCount,
    dominantKind: payload.kind ?? ("timeseries" as NeuroStreamKind),
    dominantRateHz: payload.rateHz,
    meanAbs,
    rms,
    peak: Number(peak.toFixed(6)),
    syncJitterMs,
    decodeReady: decodeConfidence >= 0.55,
    decodeConfidence,
    bandPower,
    capturedAt
  }) as NeuroFrameWindow;

  const completedWindows = prior.completedWindows + 1;
  const readyCount = Math.round(prior.decodeReadyRatio * prior.completedWindows) + (frame.decodeReady ? 1 : 0);
  const ingress = neuroReplayStateSchema.parse({
    ...prior,
    id: sourceId,
    name: payload.label ?? prior.name,
    source: "live-socket",
    status: "running",
    windowSize: sampleCount,
    paceMs:
      payload.rateHz && sampleCount > 0
        ? Math.max(1, Math.round((sampleCount / payload.rateHz) * 1000))
        : prior.paceMs,
    totalWindows: completedWindows,
    completedWindows,
    decodeReadyRatio: Number((readyCount / completedWindows).toFixed(3)),
    lastMeanAbs: meanAbs,
    lastSyncJitterMs: syncJitterMs,
    updatedAt: capturedAt,
    lastWindowId: frame.id
  }) as NeuroReplayState;

  return {
    ingress,
    frame
  };
}

export function createLiveNeuroManager(callbacks: LiveNeuroManagerCallbacks) {
  const active = new Map<string, ActiveIngressRecord>();

  async function ingest(payloadInput: LiveNeuroPayload): Promise<{
    ingress: NeuroReplayState;
    frame: NeuroFrameWindow;
  }> {
    const sourceId = liveNeuroPayloadSchema.parse(payloadInput).sourceId;
    const prior = active.get(sourceId)?.state;
    const result = buildLiveNeuroFrame(payloadInput, prior);
    active.set(sourceId, {
      state: result.ingress,
      frameCount: result.ingress.completedWindows,
      readyCount: Math.round(result.ingress.decodeReadyRatio * result.ingress.completedWindows)
    });
    await callbacks.onFrame(result.frame);
    await callbacks.onIngressUpdate(result.ingress);
    return result;
  }

  async function stop(sourceId: string): Promise<NeuroReplayState | null> {
    const activeRecord = active.get(sourceId);
    if (!activeRecord) {
      return null;
    }

    const stopped = neuroReplayStateSchema.parse({
      ...activeRecord.state,
      status: "stopped",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }) as NeuroReplayState;
    active.delete(sourceId);
    await callbacks.onIngressUpdate(stopped);
    return stopped;
  }

  async function stopAll(): Promise<void> {
    await Promise.all([...active.keys()].map((sourceId) => stop(sourceId)));
  }

  return {
    ingest,
    stop,
    stopAll,
    list(): NeuroReplayState[] {
      return [...active.values()]
        .map((record) => neuroReplayStateSchema.parse(structuredClone(record.state)) as NeuroReplayState)
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    }
  };
}
