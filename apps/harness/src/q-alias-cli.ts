import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  buildQAliasModelfile,
  resolveQAliasSpecification
} from "./ollama-alias.js";

type ParsedArgs = {
  alias?: string;
  baseModel?: string;
  output?: string;
  printOnly: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    printOnly: false,
    force: false
  };

  for (const entry of argv) {
    if (entry === "--print-only") {
      parsed.printOnly = true;
      continue;
    }
    if (entry === "--force") {
      parsed.force = true;
      continue;
    }
    if (entry.startsWith("--alias=")) {
      parsed.alias = entry.slice("--alias=".length).trim();
      continue;
    }
    if (entry.startsWith("--base=")) {
      parsed.baseModel = entry.slice("--base=".length).trim();
      continue;
    }
    if (entry.startsWith("--output=")) {
      parsed.output = entry.slice("--output=".length).trim();
      continue;
    }
  }

  return parsed;
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage: tsx src/q-alias-cli.ts [--alias=q] [--base=gemma4:e4b] [--output=<Modelfile path>] [--print-only] [--force]",
      "",
      "Creates or previews a local Ollama alias so Immaculate can refer to Gemma 4 as Q."
    ].join("\n")
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function runOllamaCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("ollama", args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(stderr.trim() || stdout.trim() || `Ollama exited with code ${code ?? "unknown"}.`)
      );
    });
  });
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const parsed = parseArgs(process.argv.slice(2));
  const base = resolveQAliasSpecification();
  const specification = {
    ...base,
    alias: parsed.alias?.toLowerCase() || base.alias,
    displayName: (parsed.alias?.trim() || base.alias).toUpperCase(),
    baseModel: parsed.baseModel?.trim() || base.baseModel
  };
  const modelfile = buildQAliasModelfile(specification);

  if (parsed.printOnly) {
    process.stdout.write(
      JSON.stringify(
        {
          alias: specification.alias,
          displayName: specification.displayName,
          baseModel: specification.baseModel,
          modelfile
        },
        null,
        2
      )
    );
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "immaculate-q-alias-"));
  const modelfilePath = parsed.output?.trim()
    ? path.resolve(parsed.output)
    : path.join(tempDir, "Q.Modelfile");

  try {
    await writeFile(modelfilePath, modelfile, "utf8");

    if (parsed.force) {
      await runOllamaCommand(["rm", specification.alias]).catch(() => undefined);
    }

    const createResult = await runOllamaCommand(["create", specification.alias, "-f", modelfilePath]);
    const listResult = await runOllamaCommand(["list"]);
    const aliasPresent = stripAnsi(listResult.stdout)
      .toLowerCase()
      .split(/\r?\n/)
      .some((line) => {
        const modelName = line.trim().split(/\s+/)[0]?.toLowerCase();
        return (
          modelName === specification.alias.toLowerCase() ||
          modelName === `${specification.alias.toLowerCase()}:latest` ||
          Boolean(modelName?.startsWith(`${specification.alias.toLowerCase()}:`))
        );
      });

    process.stdout.write(
      JSON.stringify(
        {
          alias: specification.alias,
          displayName: specification.displayName,
          baseModel: specification.baseModel,
          modelfilePath,
          created: aliasPresent,
          createOutput:
            stripAnsi(createResult.stdout).trim() || stripAnsi(createResult.stderr).trim() || "ok"
        },
        null,
        2
      )
    );
  } finally {
    if (!parsed.output?.trim()) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exit(1);
});
