import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resetReleaseMetadataCacheForTests, resolveReleaseMetadata } from "./release-metadata.js";

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
  const trackedProof = JSON.parse(
    readFileSync(path.join(repoRoot, "docs", "wiki", "Release-Surface.json"), "utf8")
  ) as {
    release?: {
      q?: {
        trainingLock?: {
          bundleId?: string;
          trainDatasetSha256?: string;
          mixManifestSha256?: string;
          mixSupplementalCount?: number;
          mixSupplementalPaths?: string[];
        };
      };
    };
  };
  const trackedPromotion = JSON.parse(
    readFileSync(path.join(repoRoot, "docs", "wiki", "Q-Benchmark-Promotion.json"), "utf8")
  ) as {
    active?: {
      bundleId?: string;
    };
    promotion?: {
      bundleId?: string;
    };
  };

  const priorTrackedOnly = process.env.IMMACULATE_RELEASE_METADATA_TRACKED_ONLY;
  process.env.IMMACULATE_RELEASE_METADATA_TRACKED_ONLY = "1";
  resetReleaseMetadataCacheForTests();
  let metadata: Awaited<ReturnType<typeof resolveReleaseMetadata>>;
  try {
    metadata = await resolveReleaseMetadata();
  } finally {
    if (priorTrackedOnly === undefined) {
      delete process.env.IMMACULATE_RELEASE_METADATA_TRACKED_ONLY;
    } else {
      process.env.IMMACULATE_RELEASE_METADATA_TRACKED_ONLY = priorTrackedOnly;
    }
    resetReleaseMetadataCacheForTests();
  }

  assert.equal(metadata.q.trainingLock?.bundleId, hybrid.q?.trainingBundleId);
  assert.equal(metadata.q.trainingLock?.trainDatasetPath, hybrid.q?.trainDatasetPath);
  assert.equal(metadata.q.trainingLock?.trainDatasetRowCount, hybrid.q?.trainDatasetRowCount);
  assert.ok(metadata.q.trainingLock?.trainDatasetSha256);
  assert.ok(metadata.q.trainingLock?.mixManifestSha256);
  assert.ok((metadata.q.trainingLock?.mixSupplementalCount ?? 0) > 0);
  assert.ok((metadata.q.trainingLock?.mixSupplementalPaths?.length ?? 0) > 0);
  assert.equal(trackedProof.release?.q?.trainingLock?.bundleId, hybrid.q?.trainingBundleId);
  assert.equal(
    trackedPromotion.promotion?.bundleId ?? trackedPromotion.active?.bundleId,
    hybrid.q?.trainingBundleId
  );
  assert.equal(
    metadata.q.trainingLock?.trainDatasetSha256,
    trackedProof.release?.q?.trainingLock?.trainDatasetSha256
  );
  assert.equal(
    metadata.q.trainingLock?.mixManifestSha256,
    trackedProof.release?.q?.trainingLock?.mixManifestSha256
  );
  assert.equal(
    metadata.q.trainingLock?.mixSupplementalCount,
    trackedProof.release?.q?.trainingLock?.mixSupplementalCount
  );
  assert.deepEqual(
    metadata.q.trainingLock?.mixSupplementalPaths,
    trackedProof.release?.q?.trainingLock?.mixSupplementalPaths
  );
  assert.equal(metadata.q.hybridSession?.trainingBundleId, hybrid.q?.trainingBundleId);
  assert.equal(metadata.q.hybridSession?.immaculateBundleId, hybrid.immaculate?.bundleId);
});
