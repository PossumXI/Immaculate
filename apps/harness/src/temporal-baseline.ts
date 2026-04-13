import path from "node:path";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { createEngine } from "@immaculate/core";
import { createPersistence } from "./persistence.js";
import { buildLiveNeuroFrame } from "./live-neuro.js";
import * as temporalActivities from "./temporal-activities.js";
import { immaculateTemporalBaselineWorkflow } from "./temporal-workflow.js";

type ResourceUsageStats = {
  rssPeakMiB: number;
  heapPeakMiB: number;
  rssEndMiB: number;
  heapEndMiB: number;
};

export type TemporalBaselineComparison = {
  iterations: number;
  immaculateLatenciesMs: number[];
  temporalLatenciesMs: number[];
  immaculateUsage: ResourceUsageStats;
  temporalUsage: ResourceUsageStats;
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));

function resolveWorkflowsPath(): string {
  const compiledPath = path.join(MODULE_ROOT, "temporal-workflow.js");
  if (existsSync(compiledPath)) {
    return compiledPath;
  }
  return path.join(MODULE_ROOT, "temporal-workflow.ts");
}

function toMiB(bytes: number): number {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

async function sampleResourceUsage<T>(operation: () => Promise<T>): Promise<{
  result: T;
  usage: ResourceUsageStats;
}> {
  let rssPeak = 0;
  let heapPeak = 0;
  const timer = setInterval(() => {
    const usage = process.memoryUsage();
    rssPeak = Math.max(rssPeak, usage.rss);
    heapPeak = Math.max(heapPeak, usage.heapUsed);
  }, 20);
  timer.unref();

  try {
    const result = await operation();
    const finalUsage = process.memoryUsage();
    return {
      result,
      usage: {
        rssPeakMiB: toMiB(Math.max(rssPeak, finalUsage.rss)),
        heapPeakMiB: toMiB(Math.max(heapPeak, finalUsage.heapUsed)),
        rssEndMiB: toMiB(finalUsage.rss),
        heapEndMiB: toMiB(finalUsage.heapUsed)
      }
    };
  } finally {
    clearInterval(timer);
  }
}

async function runImmaculateMicroBaseline(
  runtimeDir: string,
  iterations: number
): Promise<{
  latenciesMs: number[];
  usage: ResourceUsageStats;
}> {
  return sampleResourceUsage(async () => {
    const latenciesMs: number[] = [];
    const persistence = createPersistence(path.join(runtimeDir, "immaculate-micro"));
    const recovered = await persistence.load();
    const engine = createEngine(
      recovered
        ? {
            durableState: recovered,
            bootstrap: false
          }
        : {
            bootstrap: false
          }
    );

    for (let index = 0; index < iterations; index += 1) {
      const startedAt = performance.now();
      const liveFrame = buildLiveNeuroFrame({
        sourceId: "temporal-baseline",
        label: "Temporal baseline ingress",
        sessionId: `baseline-session-${index}`,
        kind: "electrical-series",
        rateHz: 1000,
        syncJitterMs: 0.25,
        channels: 4,
        samples: [
          [0.11, -0.12, 0.18, -0.07],
          [0.16, -0.08, 0.22, -0.06],
          [0.13, -0.09, 0.2, -0.05],
          [0.1, -0.1, 0.17, -0.04]
        ]
      });
      engine.ingestNeuroFrame(liveFrame.frame);
      engine.upsertNeuroReplay(liveFrame.ingress);
      for (let tick = 0; tick < 9; tick += 1) {
        engine.tick();
      }
      await persistence.persist(engine.getDurableState());
      latenciesMs.push(Number((performance.now() - startedAt).toFixed(4)));
    }

    await persistence.flush();
    return latenciesMs;
  }).then(({ result, usage }) => ({
    latenciesMs: result,
    usage
  }));
}

async function runTemporalWorkflowBaseline(iterations: number): Promise<{
  latenciesMs: number[];
  usage: ResourceUsageStats;
}> {
  const environment = await TestWorkflowEnvironment.createLocal();
  try {
    const taskQueue = `immaculate-temporal-baseline-${Date.now()}`;
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace ?? "default",
      taskQueue,
      workflowsPath: resolveWorkflowsPath(),
      activities: temporalActivities
    });

    const sampled = await sampleResourceUsage(async () =>
      worker.runUntil(async () => {
        const latenciesMs: number[] = [];
        for (let index = 0; index < iterations; index += 1) {
          const startedAt = performance.now();
          const result = await environment.client.workflow.execute(
            immaculateTemporalBaselineWorkflow,
            {
              taskQueue,
              workflowId: `immaculate-temporal-baseline-${index}-${Date.now()}`,
              args: [
                {
                  eventId: `temporal-event-${index}`,
                  value: index + 1
                }
              ]
            }
          );
          if (!result.verified || result.route.at(-1) !== "verify") {
            throw new Error(`Temporal baseline verification failed at iteration ${index}.`);
          }
          latenciesMs.push(Number((performance.now() - startedAt).toFixed(4)));
        }
        return latenciesMs;
      })
    );

    return {
      latenciesMs: sampled.result,
      usage: sampled.usage
    };
  } finally {
    await environment.teardown();
  }
}

export async function runTemporalBaselineComparison(
  runtimeDir: string,
  iterations = Number(process.env.IMMACULATE_TEMPORAL_BASELINE_ITERATIONS ?? 24)
): Promise<TemporalBaselineComparison> {
  const safeIterations = Math.max(4, iterations);
  const immaculate = await runImmaculateMicroBaseline(runtimeDir, safeIterations);
  const temporal = await runTemporalWorkflowBaseline(safeIterations);

  return {
    iterations: safeIterations,
    immaculateLatenciesMs: immaculate.latenciesMs,
    temporalLatenciesMs: temporal.latenciesMs,
    immaculateUsage: immaculate.usage,
    temporalUsage: temporal.usage
  };
}
