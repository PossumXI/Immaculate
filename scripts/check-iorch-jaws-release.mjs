import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { githubAssetUrl, readJawsReleaseConfig } from "./jaws-release-config.mjs";

const repoRoot = process.cwd();
const release = readJawsReleaseConfig(repoRoot);
const netlifyToml = readFileSync(resolve(repoRoot, "netlify.toml"), "utf8");
const deployScript = readFileSync(resolve(repoRoot, "scripts", "deploy-iorch-site.mjs"), "utf8");
const downloadsPage = readFileSync(resolve(repoRoot, "apps", "dashboard", "app", "downloads", "jaws", "page.tsx"), "utf8");
const functionTest = readFileSync(resolve(repoRoot, "tests", "netlify-functions", "jaws.test.mjs"), "utf8");
const docs = readFileSync(resolve(repoRoot, "Doc", "Planning", "IORCH_JAWS_MIRROR_2026-05-02.md"), "utf8");

const errors = [];

for (const download of release.downloads) {
  const expectedFrom = `from = "${download.path}"`;
  const expectedTo = `to = "${githubAssetUrl(release, download.file)}"`;
  if (!netlifyToml.includes(expectedFrom) || !netlifyToml.includes(expectedTo)) {
    errors.push(`netlify.toml is missing redirect fields: ${expectedFrom} / ${expectedTo}`);
  }
}

for (const staleVersion of ["0.1.6", "jaws-v0.1.6"]) {
  for (const [label, content] of [
    ["deploy-iorch-site.mjs", deployScript],
    ["downloads page", downloadsPage],
    ["jaws function test", functionTest],
  ]) {
    if (content.includes(staleVersion)) {
      errors.push(`${label} still contains stale ${staleVersion}`);
    }
  }
}

if (!deployScript.includes("assertDeployIncludesJawsFunction")) {
  errors.push("deploy guard must assert the jaws function is present in the Netlify deploy");
}
if (!deployScript.includes("Refusing to deploy legacy iorch.net static mirror from OpenJaws")) {
  errors.push("deploy guard must explicitly refuse the legacy OpenJaws iorch.net static mirror");
}
if (!deployScript.includes("NETLIFY_COMMAND_TIMEOUT_MS") || !deployScript.includes("AbortSignal.timeout")) {
  errors.push("deploy guard must keep bounded Netlify command/API/public smoke timeouts");
}
if (!downloadsPage.includes("jaws-release.json")) {
  errors.push("downloads page must read jaws-release.json instead of duplicating release metadata");
}
if (!docs.includes(release.tag) || !docs.includes("single release source of truth")) {
  errors.push("operator handoff must document the current release tag and source-of-truth rule");
}

if (errors.length > 0) {
  throw new Error(`IORCH JAWS release guard failed:\n- ${errors.join("\n- ")}`);
}

console.log(JSON.stringify({
  status: "ok",
  version: release.version,
  tag: release.tag,
  redirects: release.downloads.length,
  previousPatchVersion: release.previousPatchVersion,
}, null, 2));
