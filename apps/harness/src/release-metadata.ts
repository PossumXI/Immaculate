import path from "node:path";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getQModelAlias, getQModelTarget, truthfulModelLabel } from "./q-model.js";

export type QTrainingLockSummary = {
  generatedAt?: string;
  lockVersion?: number;
  bundleId: string;
  runName?: string;
  aliasName?: string;
  trainDatasetPath?: string;
  trainDatasetSha256?: string;
  trainDatasetRowCount?: number;
  mixManifestPath?: string;
  mixManifestSha256?: string;
  mixSupplementalCount?: number;
  mixSupplementalPaths?: string[];
  curationRunPath?: string;
  curationRunId?: string;
  lockPath: string;
};

export type QHybridTrainingSessionSummary = {
  generatedAt?: string;
  sessionId: string;
  sessionPath: string;
  localStatus?: string;
  cloudStatus?: string;
  cloudProvider?: string;
  trainingBundleId?: string;
  immaculateBundleId?: string;
};

export type ReleaseMetadata = {
  packageVersion: string;
  harnessVersion: string;
  coreVersion: string;
  gitSha: string;
  gitShortSha: string;
  gitBranch: string;
  buildId: string;
  q: {
    alias: string;
    providerModel: string;
    truthfulLabel: string;
    trainingLock?: QTrainingLockSummary;
    hybridSession?: QHybridTrainingSessionSummary;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(MODULE_ROOT, "..");
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../..");
const ROOT_PACKAGE_PATH = path.join(REPO_ROOT, "package.json");
const HARNESS_PACKAGE_PATH = path.join(HARNESS_ROOT, "package.json");
const CORE_PACKAGE_PATH = path.join(REPO_ROOT, "packages", "core", "package.json");
const Q_OUTPUT_ROOT = path.join(REPO_ROOT, ".training-output", "q");
const Q_LOCK_ROOT = path.join(Q_OUTPUT_ROOT, "locks");
const Q_LATEST_LOCK_PATH = path.join(Q_OUTPUT_ROOT, "latest-training-lock.json");
const Q_LATEST_HYBRID_SESSION_PATH = path.join(Q_OUTPUT_ROOT, "latest-hybrid-session.json");
let cachedReleaseMetadata: ReleaseMetadata | undefined;

type PackageJson = {
  version?: string;
};

type QTrainingLockFile = {
  generatedAt?: string;
  lockVersion?: number;
  bundleId?: string;
  run?: {
    runName?: string;
    aliasName?: string;
    baseModel?: string;
    trainDatasetPath?: string;
    trainDatasetSha256?: string;
    trainDatasetRowCount?: number;
  };
  mixManifest?: {
    path?: string;
    sha256?: string;
    supplemental?: Array<{
      path?: string;
    }>;
  };
  curation?: {
    runPath?: string;
    runId?: string;
  };
};

type QHybridTrainingSessionFile = {
  generatedAt?: string;
  sessionId?: string;
  q?: {
    trainingBundleId?: string;
  };
  immaculate?: {
    bundleId?: string;
  };
  lanes?: {
    local?: {
      status?: string;
    };
    cloud?: {
      status?: string;
      provider?: string;
    };
  };
  output?: {
    sessionJsonPath?: string;
  };
};

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const payload = await readFile(filePath, "utf8");
    return JSON.parse(payload) as T;
  } catch {
    return undefined;
  }
}

function runGit(args: string[]): string | undefined {
  const result = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    return undefined;
  }
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

async function readVersion(filePath: string): Promise<string> {
  const payload = await readJsonFile<PackageJson>(filePath);
  return payload?.version?.trim() || "0.0.0";
}

function normalizeReportedPath(pathValue: string | undefined): string | undefined {
  const trimmed = pathValue?.trim();
  if (!trimmed) {
    return undefined;
  }
  const candidate = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(REPO_ROOT, trimmed);
  const repoMarkers = [".training-output", "training", "docs", "deploy", "benchmarks"];
  const parts = candidate.split(path.sep);
  for (const marker of repoMarkers) {
    const markerIndex = parts.indexOf(marker);
    if (markerIndex >= 0) {
      return path.join(...parts.slice(markerIndex)).replaceAll("\\", "/");
    }
  }
  return path.relative(REPO_ROOT, candidate).replaceAll("\\", "/");
}

async function resolveLatestTrainingLockPath(): Promise<string | undefined> {
  if (existsSync(Q_LATEST_LOCK_PATH)) {
    return Q_LATEST_LOCK_PATH;
  }
  if (!existsSync(Q_LOCK_ROOT)) {
    return undefined;
  }
  const entries = await readdir(Q_LOCK_ROOT, {
    withFileTypes: true
  });
  const lockNames = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("q-training-lock-") && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  return lockNames[0] ? path.join(Q_LOCK_ROOT, lockNames[0]) : undefined;
}

async function readTrainingLockSummary(): Promise<QTrainingLockSummary | undefined> {
  const lockPath = await resolveLatestTrainingLockPath();
  if (!lockPath) {
    return undefined;
  }
  const payload = await readJsonFile<QTrainingLockFile>(lockPath);
  if (!payload?.bundleId) {
    return undefined;
  }
  return {
    generatedAt: payload.generatedAt,
    lockVersion: payload.lockVersion,
    bundleId: payload.bundleId,
    runName: payload.run?.runName,
    aliasName: payload.run?.aliasName,
    trainDatasetPath: normalizeReportedPath(payload.run?.trainDatasetPath),
    trainDatasetSha256: payload.run?.trainDatasetSha256,
    trainDatasetRowCount: payload.run?.trainDatasetRowCount,
    mixManifestPath: normalizeReportedPath(payload.mixManifest?.path),
    mixManifestSha256: payload.mixManifest?.sha256,
    mixSupplementalCount: payload.mixManifest?.supplemental?.length ?? 0,
    mixSupplementalPaths: payload.mixManifest?.supplemental
      ?.map((entry) => normalizeReportedPath(entry.path))
      .filter((entry): entry is string => Boolean(entry)),
    curationRunPath: normalizeReportedPath(payload.curation?.runPath),
    curationRunId: payload.curation?.runId,
    lockPath: path.relative(REPO_ROOT, lockPath).replaceAll("\\", "/")
  };
}

async function readHybridSessionSummary(): Promise<QHybridTrainingSessionSummary | undefined> {
  if (!existsSync(Q_LATEST_HYBRID_SESSION_PATH)) {
    return undefined;
  }
  const payload = await readJsonFile<QHybridTrainingSessionFile>(Q_LATEST_HYBRID_SESSION_PATH);
  if (!payload?.sessionId) {
    return undefined;
  }
  return {
    generatedAt: payload.generatedAt,
    sessionId: payload.sessionId,
    sessionPath: payload.output?.sessionJsonPath || path.relative(REPO_ROOT, Q_LATEST_HYBRID_SESSION_PATH).replaceAll("\\", "/"),
    localStatus: payload.lanes?.local?.status,
    cloudStatus: payload.lanes?.cloud?.status,
    cloudProvider: payload.lanes?.cloud?.provider,
    trainingBundleId: payload.q?.trainingBundleId,
    immaculateBundleId: payload.immaculate?.bundleId
  };
}

export async function resolveReleaseMetadata(): Promise<ReleaseMetadata> {
  if (cachedReleaseMetadata) {
    return cachedReleaseMetadata;
  }

  const [packageVersion, harnessVersion, coreVersion, trainingLock, hybridSession] = await Promise.all([
    readVersion(ROOT_PACKAGE_PATH),
    readVersion(HARNESS_PACKAGE_PATH),
    readVersion(CORE_PACKAGE_PATH),
    readTrainingLockSummary(),
    readHybridSessionSummary()
  ]);

  const gitSha = runGit(["rev-parse", "HEAD"]) ?? "unknown";
  const gitShortSha = runGit(["rev-parse", "--short=7", "HEAD"]) ?? (gitSha.slice(0, 7) || "unknown");
  const gitBranch = runGit(["branch", "--show-current"]) ?? "detached";

  cachedReleaseMetadata = {
    packageVersion,
    harnessVersion,
    coreVersion,
    gitSha,
    gitShortSha,
    gitBranch,
    buildId: `${packageVersion}+${gitShortSha}`,
    q: {
      alias: getQModelAlias(),
      providerModel: getQModelAlias(),
      truthfulLabel: truthfulModelLabel(getQModelTarget()),
      trainingLock,
      hybridSession
    }
  };

  return cachedReleaseMetadata;
}
