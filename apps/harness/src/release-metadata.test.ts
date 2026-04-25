import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata } from "./release-metadata.js";

test("release metadata preserves tracked Q training evidence in clean checkouts", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const hybrid = JSON.parse(
    readFileSync(path.join(repoRoot, "docs", "wiki", "Q-Hybrid-Training.json"), "utf8")
  ) as {
    q?: {
      trainingBundleId?: string;
      trainDatasetPath?: string;
      trainDatasetRowCount?: number;
    };
    immaculate?: {
      bundleId?: string;
      bundlePath?: string;
    };
  };

  const metadata = await resolveReleaseMetadata();

  assert.equal(metadata.q.trainingLock?.bundleId, hybrid.q?.trainingBundleId);
  assert.equal(metadata.q.trainingLock?.trainDatasetPath, hybrid.q?.trainDatasetPath);
  assert.equal(metadata.q.trainingLock?.trainDatasetRowCount, hybrid.q?.trainDatasetRowCount);
  assert.equal(metadata.q.hybridSession?.trainingBundleId, hybrid.q?.trainingBundleId);
  assert.equal(metadata.q.hybridSession?.immaculateBundleId, hybrid.immaculate?.bundleId);
});
