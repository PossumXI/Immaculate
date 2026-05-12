import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  getAllowedDataRoot,
  getAllowedDataRoots,
  resolvePathWithinAllowedRoot
} from "./utils.js";

function withEnv<T>(updates: Record<string, string | undefined>, run: () => T): T {
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

  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("resolves paths inside any configured data root", () => {
  const firstRoot = path.resolve(process.cwd(), ".tmp-root-a");
  const secondRoot = path.resolve(process.cwd(), ".tmp-root-b");

  withEnv(
    {
      IMMACULATE_DATA_ROOT: firstRoot,
      IMMACULATE_DATA_ROOTS: `${firstRoot};${secondRoot}`
    },
    () => {
      assert.deepEqual(getAllowedDataRoots(), [firstRoot, secondRoot]);
      assert.equal(getAllowedDataRoot(), firstRoot);
      assert.equal(
        resolvePathWithinAllowedRoot(path.join(secondRoot, "training", "manifest.json")),
        path.join(secondRoot, "training", "manifest.json")
      );
    }
  );
});

test("rejects sibling paths outside configured data roots", () => {
  const allowedRoot = path.resolve(process.cwd(), ".tmp-root");
  const sibling = `${allowedRoot}-sibling`;

  withEnv(
    {
      IMMACULATE_DATA_ROOT: undefined,
      IMMACULATE_DATA_ROOTS: allowedRoot
    },
    () => {
      assert.throws(
        () => resolvePathWithinAllowedRoot(path.join(sibling, "manifest.json")),
        /Path traversal rejected/
      );
    }
  );
});
