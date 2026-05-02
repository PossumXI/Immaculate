import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export function readJawsReleaseConfig(repoRoot = process.cwd()) {
  const configPath = resolve(repoRoot, "jaws-release.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  validateJawsReleaseConfig(config);
  return config;
}

export function githubAssetUrl(config, fileName) {
  return `https://github.com/${config.githubRepo}/releases/download/${config.tag}/${fileName}`;
}

export function validateJawsReleaseConfig(config) {
  const errors = [];
  if (!SEMVER_PATTERN.test(config.version ?? "")) {
    errors.push("version must be a concrete semver string");
  }
  if (config.tag !== `jaws-v${config.version}`) {
    errors.push("tag must match jaws-v<version>");
  }
  if (!SEMVER_PATTERN.test(config.previousPatchVersion ?? "")) {
    errors.push("previousPatchVersion must be a concrete semver string");
  }
  if (!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(config.githubRepo ?? "")) {
    errors.push("githubRepo must be an owner/repo string");
  }
  if (!Array.isArray(config.downloads) || config.downloads.length === 0) {
    errors.push("downloads must include at least one release asset");
  }

  const paths = new Set();
  const files = new Set();
  for (const download of config.downloads ?? []) {
    if (!download.path?.startsWith("/downloads/jaws/")) {
      errors.push(`download path is invalid: ${download.path ?? "(missing)"}`);
    }
    if (!download.file || !download.file.includes(config.version)) {
      if (download.file !== "latest.json") {
        errors.push(`download file must include ${config.version}: ${download.file ?? "(missing)"}`);
      }
    }
    if (!/^[a-f0-9]{64}$/.test(download.digest ?? "")) {
      errors.push(`download digest must be sha256 hex for ${download.file ?? download.path}`);
    }
    if (paths.has(download.path)) {
      errors.push(`duplicate download path: ${download.path}`);
    }
    if (files.has(download.file)) {
      errors.push(`duplicate download file: ${download.file}`);
    }
    paths.add(download.path);
    files.add(download.file);
  }

  if (!paths.has("/downloads/jaws/latest.json")) {
    errors.push("downloads must include /downloads/jaws/latest.json");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid jaws-release.json:\n- ${errors.join("\n- ")}`);
  }
}
