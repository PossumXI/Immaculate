import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRoundtableActionPlan,
  materializeRoundtableActionExecutionArtifacts,
  materializeRoundtableActionWorktree
} from "./roundtable.js";

type CliOptions = {
  command: "plan" | "materialize" | "bundle";
  objective: string;
  sessionId?: string;
  consentScope?: string;
  output?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "plan",
    objective:
      "Harden Q, Immaculate, OpenJaws, and Arobi Network routing under mixed pressure without drift."
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "plan" || arg === "materialize" || arg === "bundle") {
      options.command = arg;
      continue;
    }
    if (arg === "--objective" && argv[index + 1]) {
      options.objective = argv[++index] ?? options.objective;
      continue;
    }
    if (arg === "--session-id" && argv[index + 1]) {
      options.sessionId = argv[++index];
      continue;
    }
    if (arg === "--consent-scope" && argv[index + 1]) {
      options.consentScope = argv[++index];
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      options.output = path.resolve(argv[++index] ?? "");
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildRoundtableActionPlan({
    objective: options.objective,
    sessionId: options.sessionId,
    consentScope: options.consentScope,
    schedule: {
      id: `roundtable-${Date.now().toString(36)}`,
      mode: "guarded-swarm",
      executionTopology: "parallel-then-guard",
      parallelWidth: 3,
      parallelFormationMode: "hybrid-quorum",
      parallelFormationSummary: "vertical=2 / horizontal=2 / quorum=2 / backpressure=degrade",
      layerRoles: ["mid", "reasoner", "guard"]
    }
  });

  const materialized =
    options.command === "materialize" || options.command === "bundle"
      ? plan.actions
          .filter((action) => action.status === "ready")
          .map((action) => ({
            actionId: action.id,
            ...materializeRoundtableActionWorktree(action)
          }))
      : [];
  const bundled =
    options.command === "bundle"
      ? await materializeRoundtableActionExecutionArtifacts({
          objective: options.objective,
          actions: plan.actions
        })
      : plan.actions;

  const payload = {
    generatedAt: new Date().toISOString(),
    ...plan,
    actions: bundled,
    materialized
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (options.output) {
    await writeFile(options.output, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Agent worktree planning failed.");
  process.exitCode = 1;
});
