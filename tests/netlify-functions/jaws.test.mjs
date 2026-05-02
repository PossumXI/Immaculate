import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handler } from "../../netlify/functions/jaws.mjs";
import { githubAssetUrl, readJawsReleaseConfig } from "../../scripts/jaws-release-config.mjs";

const originalFetch = globalThis.fetch;
const originalReleaseTag = process.env.JAWS_UPDATER_RELEASE_TAG;
const release = readJawsReleaseConfig();
const windowsDownload = release.downloads.find((download) => download.path === "/downloads/jaws/windows");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalReleaseTag === undefined) {
    delete process.env.JAWS_UPDATER_RELEASE_TAG;
  } else {
    process.env.JAWS_UPDATER_RELEASE_TAG = originalReleaseTag;
  }
});

function makeEvent(path) {
  return {
    path,
    rawUrl: `https://iorch.net${path}`,
    queryStringParameters: null,
  };
}

function installManifestFetch(manifest) {
  globalThis.fetch = async url => {
    assert.equal(
      url,
      githubAssetUrl(release, "latest.json"),
    );
    return {
      ok: true,
      json: async () => manifest,
    };
  };
  process.env.JAWS_UPDATER_RELEASE_TAG = release.tag;
}

const manifest = {
  version: release.version,
  notes: "Signed JAWS Desktop update.",
  pub_date: release.publishedAt,
  platforms: {
    "windows-x86_64": {
      signature: "signed-windows-payload",
      url: githubAssetUrl(release, windowsDownload.file),
    },
  },
};

test("returns an update payload for an older Windows x64 install", async () => {
  installManifestFetch(manifest);

  const response = await handler(makeEvent(`/api/jaws/windows/x86_64/${release.previousPatchVersion}`));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.version, release.version);
  assert.equal(body.signature, "signed-windows-payload");
  assert.equal(body.url, manifest.platforms["windows-x86_64"].url);
});

test("returns no content for a current Windows x64 install", async () => {
  installManifestFetch(manifest);

  const response = await handler(makeEvent(`/api/jaws/windows/x86_64/${release.version}`));

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, "");
});

test("rejects malformed updater requests before network access", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called");
  };

  const response = await handler(makeEvent(`/api/jaws/unknown/x86_64/${release.previousPatchVersion}`));
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 400);
  assert.equal(body.code, "invalid_update_request");
});
