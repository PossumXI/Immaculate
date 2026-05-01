export type BenchmarkWorkerSpawnPlan = {
  command: string;
  args: string[];
};

export function buildBenchmarkWorkerSpawnPlan(options: {
  isTsRuntime: boolean;
  workerPath: string;
  workerArgs: string[];
  nodeExecPath?: string;
}): BenchmarkWorkerSpawnPlan {
  const command = options.nodeExecPath?.trim() || process.execPath;
  const args = options.isTsRuntime
    ? ["--import", "tsx", options.workerPath, ...options.workerArgs]
    : [options.workerPath, ...options.workerArgs];
  return {
    command,
    args
  };
}
