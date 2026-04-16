type WorkGovernorLane = "benchmark" | "cognitive";

type WorkGovernorPriority = "critical" | "high" | "normal" | "low";

type WorkGovernorLaneOptions = {
  maxActiveWeight: number;
  maxQueueDepth?: number;
};

type WorkGovernorOptions = {
  maxActiveWeight?: number;
  maxQueueDepth?: number;
  lanes?: Partial<Record<WorkGovernorLane, WorkGovernorLaneOptions>>;
};

export type WorkGovernorRequest = {
  lane: WorkGovernorLane;
  priority?: WorkGovernorPriority;
  weight?: number;
  maxQueueMs?: number;
  label?: string;
};

export type WorkGovernorSnapshot = {
  maxActiveWeight: number;
  activeWeight: number;
  queueDepth: number;
  queuedWeight: number;
  lanes: Record<
    WorkGovernorLane,
    {
      maxActiveWeight: number;
      activeWeight: number;
      queueDepth: number;
      queuedWeight: number;
      maxQueueDepth: number;
    }
  >;
};

export type WorkGovernorGrant = {
  lane: WorkGovernorLane;
  priority: WorkGovernorPriority;
  weight: number;
  acquiredAt: string;
  release: () => void;
};

type QueueEntry = {
  id: number;
  lane: WorkGovernorLane;
  priority: WorkGovernorPriority;
  weight: number;
  label?: string;
  enqueuedAt: number;
  resolve: (grant: WorkGovernorGrant) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
};

const DEFAULT_LANE_LIMITS: Record<WorkGovernorLane, WorkGovernorLaneOptions> = {
  benchmark: { maxActiveWeight: 3, maxQueueDepth: 4 },
  cognitive: { maxActiveWeight: 5, maxQueueDepth: 8 }
};

const PRIORITY_SCORE: Record<WorkGovernorPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1
};

function clampWeight(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(8, Math.floor(value)));
}

export function createWorkGovernor(options?: WorkGovernorOptions) {
  const maxActiveWeight = Math.max(1, options?.maxActiveWeight ?? 6);
  const maxQueueDepth = Math.max(1, options?.maxQueueDepth ?? 12);
  const laneLimits: Record<WorkGovernorLane, WorkGovernorLaneOptions> = {
    benchmark: options?.lanes?.benchmark ?? DEFAULT_LANE_LIMITS.benchmark,
    cognitive: options?.lanes?.cognitive ?? DEFAULT_LANE_LIMITS.cognitive
  };
  const activeWeightByLane: Record<WorkGovernorLane, number> = {
    benchmark: 0,
    cognitive: 0
  };
  let activeWeight = 0;
  let sequence = 0;
  const queue: QueueEntry[] = [];

  function snapshot(): WorkGovernorSnapshot {
    return {
      maxActiveWeight,
      activeWeight,
      queueDepth: queue.length,
      queuedWeight: queue.reduce((sum, entry) => sum + entry.weight, 0),
      lanes: {
        benchmark: {
          maxActiveWeight: laneLimits.benchmark.maxActiveWeight,
          activeWeight: activeWeightByLane.benchmark,
          queueDepth: queue.filter((entry) => entry.lane === "benchmark").length,
          queuedWeight: queue
            .filter((entry) => entry.lane === "benchmark")
            .reduce((sum, entry) => sum + entry.weight, 0),
          maxQueueDepth: Math.max(1, laneLimits.benchmark.maxQueueDepth ?? DEFAULT_LANE_LIMITS.benchmark.maxQueueDepth ?? 4)
        },
        cognitive: {
          maxActiveWeight: laneLimits.cognitive.maxActiveWeight,
          activeWeight: activeWeightByLane.cognitive,
          queueDepth: queue.filter((entry) => entry.lane === "cognitive").length,
          queuedWeight: queue
            .filter((entry) => entry.lane === "cognitive")
            .reduce((sum, entry) => sum + entry.weight, 0),
          maxQueueDepth: Math.max(1, laneLimits.cognitive.maxQueueDepth ?? DEFAULT_LANE_LIMITS.cognitive.maxQueueDepth ?? 8)
        }
      }
    };
  }

  function canAcquire(lane: WorkGovernorLane, weight: number): boolean {
    return (
      activeWeight + weight <= maxActiveWeight &&
      activeWeightByLane[lane] + weight <= laneLimits[lane].maxActiveWeight
    );
  }

  function createGrant(lane: WorkGovernorLane, priority: WorkGovernorPriority, weight: number): WorkGovernorGrant {
    activeWeight += weight;
    activeWeightByLane[lane] += weight;
    let released = false;
    return {
      lane,
      priority,
      weight,
      acquiredAt: new Date().toISOString(),
      release: () => {
        if (released) {
          return;
        }
        released = true;
        activeWeight = Math.max(0, activeWeight - weight);
        activeWeightByLane[lane] = Math.max(0, activeWeightByLane[lane] - weight);
        drainQueue();
      }
    };
  }

  function removeEntry(entryId: number): void {
    const index = queue.findIndex((entry) => entry.id === entryId);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }

  function sortQueue(): void {
    queue.sort((left, right) => {
      const priorityDelta = PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      if (left.enqueuedAt !== right.enqueuedAt) {
        return left.enqueuedAt - right.enqueuedAt;
      }
      return left.id - right.id;
    });
  }

  function drainQueue(): void {
    sortQueue();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const entry of [...queue]) {
        if (!canAcquire(entry.lane, entry.weight)) {
          continue;
        }
        removeEntry(entry.id);
        if (entry.timer) {
          clearTimeout(entry.timer);
        }
        entry.resolve(createGrant(entry.lane, entry.priority, entry.weight));
        progressed = true;
        break;
      }
    }
  }

  async function acquire(request: WorkGovernorRequest): Promise<WorkGovernorGrant> {
    const lane = request.lane;
    const priority = request.priority ?? "normal";
    const weight = clampWeight(request.weight);
    const maxQueueMs = request.maxQueueMs;
    const laneQueueDepth = queue.filter((entry) => entry.lane === lane).length;
    const laneMaxQueueDepth = Math.max(1, laneLimits[lane].maxQueueDepth ?? DEFAULT_LANE_LIMITS[lane].maxQueueDepth ?? 4);
    if (canAcquire(lane, weight) && queue.length === 0) {
      return createGrant(lane, priority, weight);
    }
    if (queue.length >= maxQueueDepth) {
      throw new Error(`Work governor queue full for ${request.label ?? lane}: global queue depth ${queue.length}/${maxQueueDepth}.`);
    }
    if (laneQueueDepth >= laneMaxQueueDepth) {
      throw new Error(
        `Work governor queue full for ${request.label ?? lane}: lane queue depth ${laneQueueDepth}/${laneMaxQueueDepth}.`
      );
    }

    return await new Promise<WorkGovernorGrant>((resolve, reject) => {
      const id = ++sequence;
      const entry: QueueEntry = {
        id,
        lane,
        priority,
        weight,
        label: request.label,
        enqueuedAt: Date.now(),
        resolve,
        reject
      };
      if (typeof maxQueueMs === "number" && Number.isFinite(maxQueueMs) && maxQueueMs > 0) {
        entry.timer = setTimeout(() => {
          removeEntry(id);
          reject(
            new Error(
              `Work governor queue timeout for ${entry.label ?? entry.lane} after ${Math.floor(maxQueueMs)} ms.`
            )
          );
        }, maxQueueMs);
      }
      queue.push(entry);
      drainQueue();
    });
  }

  return {
    acquire,
    snapshot
  };
}
