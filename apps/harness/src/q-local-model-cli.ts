import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  buildQLocalModelfile,
  resolveQLocalModelSpecification,
} from "./q-local-model.js";

type ParsedArgs = {
  modelName?: string;
  lineageSource?: string;
  output?: string;
  printOnly: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    printOnly: false,
    force: false,
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
    if (entry.startsWith("--model=")) {
      parsed.modelName = entry.slice("--model=".length).trim();
      continue;
    }
    if (entry.startsWith("--lineage=")) {
      parsed.lineageSource = entry.slice("--lineage=".length).trim();
      continue;
    }
    if (entry.startsWith("--output=")) {
      parsed.output = entry.slice("--output=".length).trim();
    }
  }

  return parsed;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function runOllamaCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("ollama", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
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
  const parsed = parseArgs(process.argv.slice(2));
  const base = resolveQLocalModelSpecification();
  const specification = {
    ...base,
    modelName: parsed.modelName?.trim() || base.modelName,
    lineageSource: parsed.lineageSource?.trim() || base.lineageSource,
  };
  const modelfile = buildQLocalModelfile(specification);

  if (parsed.printOnly) {
    process.stdout.write(
      `${JSON.stringify(
        {
          modelName: specification.modelName,
          displayName: specification.displayName,
          lineageSource: specification.lineageSource,
          modelfile,
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "immaculate-q-model-"));
  const modelfilePath = parsed.output?.trim()
    ? path.resolve(parsed.output)
    : path.join(tempDir, "Q.Modelfile");

  try {
    await writeFile(modelfilePath, modelfile, "utf8");
    if (parsed.force) {
      await runOllamaCommand(["rm", specification.modelName]).catch(() => undefined);
    }
    const createResult = await runOllamaCommand([
      "create",
      specification.modelName,
      "-f",
      modelfilePath,
    ]);
    const listResult = await runOllamaCommand(["list"]);
    const normalizedModelName = specification.modelName.toLowerCase();
    const created = stripAnsi(listResult.stdout)
      .toLowerCase()
      .split(/\r?\n/)
      .some((line) => line.trim().split(/\s+/)[0] === normalizedModelName);

    process.stdout.write(
      `${JSON.stringify(
        {
          modelName: specification.modelName,
          displayName: specification.displayName,
          lineageSource: specification.lineageSource,
          modelfilePath,
          created,
          createOutput:
            stripAnsi(createResult.stdout).trim() || stripAnsi(createResult.stderr).trim() || "ok",
        },
        null,
        2
      )}\n`
    );
  } finally {
    if (!parsed.output?.trim()) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
