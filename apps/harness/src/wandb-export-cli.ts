import { exportBenchmarkResultsFromWandb, inspectWandbStatus } from "./wandb.js";

async function main(): Promise<void> {
  const status = await inspectWandbStatus();

  if (!status.sdkInstalled) {
    throw new Error(
      `W&B SDK is not installed for ${status.pythonPath}. Run npm run wandb:bootstrap first.`
    );
  }

  if (!status.ready) {
    throw new Error(status.note);
  }

  const result = await exportBenchmarkResultsFromWandb();
  console.log(JSON.stringify(result, null, 2));
}

void main();
