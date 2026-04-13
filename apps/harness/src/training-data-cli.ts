import path from "node:path";
import { curateTrainingCorpus, createTrainingCorpusRegistry } from "./training-data.js";
import { resolvePathWithinAllowedRoot } from "./utils.js";

type ParsedArgs = {
  command: "curate" | "list" | "show" | "help";
  manifestPath?: string;
  outputRoot?: string;
  runId?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [commandRaw, ...rest] = argv;
  const options = new Map<string, string>();
  const positionals: string[] = [];
  const parseEntries = commandRaw?.startsWith("--") ? argv : rest;
  for (let index = 0; index < parseEntries.length; index += 1) {
    const entry = parseEntries[index];
    if (!entry.startsWith("--")) {
      positionals.push(entry);
      continue;
    }
    const [key, inlineValue] = entry.split("=", 2);
    if (inlineValue) {
      options.set(key.slice(2), inlineValue);
      continue;
    }
    const nextEntry = parseEntries[index + 1];
    if (nextEntry && !nextEntry.startsWith("--")) {
      options.set(key.slice(2), nextEntry);
      index += 1;
    }
  }

  let command: ParsedArgs["command"] = "help";
  if (commandRaw === "curate" || commandRaw === "list" || commandRaw === "show") {
    command = commandRaw;
  } else if (options.has("manifest")) {
    command = "curate";
  } else if (options.has("run")) {
    command = "show";
  } else if (positionals.length > 0) {
    command = "curate";
  }

  return {
    command,
    manifestPath: options.get("manifest") ?? (command === "curate" ? positionals[0] : undefined),
    outputRoot: options.get("output-root"),
    runId: options.get("run") ?? (command === "show" ? positionals[0] : undefined)
  };
}

function printHelp(): void {
  console.log(`Usage:
  npm run training-data:curate -- C:/path/to/manifest.json [--output-root C:/path/to/output]
  npm run training-data:curate -- curate --manifest C:/path/to/manifest.json [--output-root C:/path/to/output]
  npm run training-data:list [--output-root C:/path/to/output]
  npm run training-data:show -- <runId> [--output-root C:/path/to/output]
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outputRoot =
    args.outputRoot?.trim() || path.resolve(process.cwd(), ".training-output");
  const resolvedOutputRoot = resolvePathWithinAllowedRoot(outputRoot);
  const registry = createTrainingCorpusRegistry(resolvedOutputRoot);

  if (args.command === "help") {
    printHelp();
    return;
  }

  if (args.command === "curate") {
    if (!args.manifestPath?.trim()) {
      throw new Error("Missing manifest path for curate.");
    }
    const run = await curateTrainingCorpus({
      manifestPath: args.manifestPath.trim(),
      outputRoot: resolvedOutputRoot
    });
    await registry.register(run);
    console.log(
      JSON.stringify(
        {
          accepted: true,
          runId: run.id,
          manifestName: run.manifestName,
          acceptedSourceCount: run.acceptedSourceCount,
          acceptedFileCount: run.acceptedFileCount,
          secretFindingCount: run.secretFindingCount,
          outputJsonlPath: run.outputJsonlPath,
          provenanceChainHash: run.provenanceChainHash
        },
        null,
        2
      )
    );
    return;
  }

  if (args.command === "list") {
    const runs = await registry.list();
    console.log(JSON.stringify({ runCount: runs.length, runs }, null, 2));
    return;
  }

  if (!args.runId?.trim()) {
    throw new Error("Missing run id for show.");
  }

  const run = await registry.get(args.runId.trim());
  if (!run) {
    throw new Error(`Unknown training-data run ${args.runId.trim()}.`);
  }
  console.log(JSON.stringify(run, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Training-data CLI failed.");
  process.exitCode = 1;
});
