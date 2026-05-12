import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { curateTrainingCorpus } from "./training-data.js";

function withEnv<T>(updates: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(updates)) {
    previous.set(key, process.env[key]);
    const value = updates[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test("training curation honors max files per source before exporting records", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "immaculate-corpus-limit-"));
  const sourceRoot = path.join(root, "source");
  const outputRoot = path.join(root, "output");
  await mkdir(path.join(sourceRoot, "src"), { recursive: true });
  await writeFile(
    path.join(sourceRoot, "LICENSE"),
    "Permission is hereby granted, free of charge, to any person obtaining a copy\n",
    "utf8"
  );
  await writeFile(path.join(sourceRoot, "src", "a.ts"), "export const a = 1;\n", "utf8");
  await writeFile(path.join(sourceRoot, "src", "b.ts"), "export const b = 2;\n", "utf8");
  await writeFile(path.join(sourceRoot, "src", "c.ts"), "export const c = 3;\n", "utf8");

  const manifestPath = path.join(root, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        id: "limited-corpus",
        name: "Limited Corpus",
        createdAt: "2026-05-12T00:00:00.000Z",
        purposeTags: ["coding"],
        sources: [
          {
            id: "source",
            kind: "git",
            host: "local",
            location: sourceRoot,
            tags: ["coding"]
          }
        ],
        policy: {
          allowedHosts: ["local"],
          allowedLicenses: ["MIT"],
          reviewLicenses: [],
          maxFileBytes: 262144,
          maxFilesPerSource: 2,
          includeExtensions: [".ts"],
          includeFileNames: ["LICENSE"],
          excludeDirectories: [],
          excludeFilePatterns: [],
          secretScanningEnabled: true,
          deduplicate: true
        }
      },
      null,
      2
    ),
    "utf8"
  );

  await withEnv({ IMMACULATE_DATA_ROOTS: root }, async () => {
    const run = await curateTrainingCorpus({ manifestPath, outputRoot });
    assert.equal(run.outputRecordCount, 2);
    assert.equal(run.sources[0]?.acceptedFileCount, 2);
  });
});
