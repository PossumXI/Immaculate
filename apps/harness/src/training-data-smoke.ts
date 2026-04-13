import path from "node:path";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { curateTrainingCorpus, createTrainingCorpusRegistry } from "./training-data.js";
import { getAllowedDataRoot } from "./utils.js";

const execFileAsync = promisify(execFile);

async function createRepo(
  rootPath: string,
  files: Record<string, string>
): Promise<void> {
  await mkdir(rootPath, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(rootPath, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }
  await execFileAsync("git", ["init", "-b", "main"], { cwd: rootPath });
  await execFileAsync("git", ["config", "user.email", "smoke@immaculate.local"], { cwd: rootPath });
  await execFileAsync("git", ["config", "user.name", "Immaculate Smoke"], { cwd: rootPath });
  await execFileAsync("git", ["add", "."], { cwd: rootPath });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: rootPath });
}

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(
    path.join(getAllowedDataRoot(), "immaculate-training-data-")
  );
  const outputRoot = path.join(tempRoot, "output");
  try {
    const allowedRepo = path.join(tempRoot, "allowed-repo");
    const duplicateRepo = path.join(tempRoot, "duplicate-repo");
    const unknownRepo = path.join(tempRoot, "unknown-repo");

    await createRepo(allowedRepo, {
      LICENSE: "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n",
      "src/index.ts": "export function safeHash(input: string) { return input.trim(); }\n",
      "security/policy.rego": "package security\nallow := true\n",
      "docs/guide.md": "# Defensive guide\n"
    });
    await createRepo(duplicateRepo, {
      LICENSE: "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n",
      "src/index.ts": "export function safeHash(input: string) { return input.trim(); }\n",
      "src/secret.ts": "export const leaked = 'wandb_v1_fakefakefakefakefakefakefakefake';\n"
    });
    await createRepo(unknownRepo, {
      "src/main.py": "print('no license')\n"
    });

    const manifestPath = path.join(tempRoot, "curation-manifest.json");
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          id: "gemma4-defensive-security-smoke",
          name: "Gemma 4 Defensive Security Smoke",
          createdAt: new Date().toISOString(),
          createdBy: "smoke-test",
          purposeTags: ["coding", "security", "ops"],
          sources: [
            {
              id: "allowed",
              kind: "git",
              host: "local",
              location: allowedRepo,
              tags: ["coding", "security"]
            },
            {
              id: "duplicate",
              kind: "git",
              host: "local",
              location: duplicateRepo,
              tags: ["coding"]
            },
            {
              id: "unknown",
              kind: "git",
              host: "local",
              location: unknownRepo,
              tags: ["coding"]
            }
          ],
          policy: {
            allowedHosts: ["local"],
            allowedLicenses: ["MIT", "Apache-2.0"],
            reviewLicenses: ["MPL-2.0"],
            maxFileBytes: 262144,
            includeExtensions: [".ts", ".rego", ".md", ".py"],
            includeFileNames: ["LICENSE"],
            excludeDirectories: [".git", "dist"],
            excludeFilePatterns: [".png", ".jpg"],
            secretScanningEnabled: true,
            deduplicate: true
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const run = await curateTrainingCorpus({
      manifestPath,
      outputRoot,
      actor: "smoke-test"
    });
    const registry = createTrainingCorpusRegistry(outputRoot);
    await registry.register(run);
    const listedRuns = await registry.list();
    const loadedRun = await registry.get(run.id);
    const curatedJsonl = await readFile(run.outputJsonlPath, "utf8");

    const unknownSource = run.sources.find((source) => source.sourceId === "unknown");
    if (!unknownSource || unknownSource.status !== "rejected") {
      throw new Error("Expected the unknown-license source to be rejected.");
    }
    if (run.secretFindingCount < 1) {
      throw new Error("Expected at least one secret finding in the smoke corpus.");
    }
    if (run.duplicateFileCount < 1) {
      throw new Error("Expected duplicate content to be removed from the smoke corpus.");
    }
    if (run.acceptedFileCount < 3) {
      throw new Error("Expected accepted records from the MIT-licensed sources.");
    }
    if (listedRuns.length !== 1 || !loadedRun || loadedRun.id !== run.id) {
      throw new Error("Training-data registry did not round-trip the curated run.");
    }
    if (!curatedJsonl.includes("\"provenanceRecordId\"")) {
      throw new Error("Expected the curated JSONL to carry provenance record identifiers.");
    }

    console.log(
      JSON.stringify(
        {
          accepted: true,
          runId: run.id,
          acceptedSourceCount: run.acceptedSourceCount,
          rejectedSourceCount: run.rejectedSourceCount,
          acceptedFileCount: run.acceptedFileCount,
          duplicateFileCount: run.duplicateFileCount,
          secretFindingCount: run.secretFindingCount,
          provenanceChainHash: run.provenanceChainHash
        },
        null,
        2
      )
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Training-data smoke failed.");
  process.exitCode = 1;
});
