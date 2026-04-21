import path from "node:path";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { foundationModelLabel, getQModelName, getQModelTarget, truthfulModelLabel } from "./q-model.js";

export type QTrainingLockSummary = {
  generatedAt?: string;
  lockVersion?: number;
  bundleId: string;
  runName?: string;
  modelName?: string;
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
  immaculateBundlePath?: string;
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
    modelName: string;
    foundationModel: string;
    truthfulLabel: string;
    trainingLock?: QTrainingLockSummary;
    hybridSession?: QHybridTrainingSessionSummary;
  };
};

export type HarnessReadinessLane = {
  status: "ready" | "blocked" | "not_configured";
  configured: boolean;
  ready: boolean;
  endpoint?: string;
  detail: string;
};

export type HarnessReadinessSummary = {
  ledger: {
    public: HarnessReadinessLane;
    private: HarnessReadinessLane;
  };
  q: {
    local: HarnessReadinessLane;
  };
  missionSurfaceReady: boolean;
  summary: string;
};

export type ResolveHarnessReadinessOptions = {
  publicLedgerBaseUrl?: string;
  privateLedgerBaseUrl?: string;
  publicLedgerAdvanced?: boolean;
  privateLedgerAdvanced?: boolean;
  publicLedgerDetail?: string;
  privateLedgerDetail?: string;
  qLocalEndpoint?: string;
  qLocalHealthy?: boolean;
  qLocalDetail?: string;
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
const IMMACULATE_OUTPUT_ROOT = path.join(REPO_ROOT, ".training-output", "immaculate");
const IMMACULATE_LATEST_BUNDLE_PATH = path.join(IMMACULATE_OUTPUT_ROOT, "latest-training-bundle.json");
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
    modelName?: string;
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

type QHybridTrainingWikiFile = {
  generatedAt?: string;
  sessionId?: string;
  manifestPath?: string;
  q?: {
    trainingBundleId?: string;
  };
  immaculate?: {
    bundleId?: string;
  };
  doctor?: {
    local?: {
      ready?: boolean;
      mode?: string;
    };
    cloud?: {
      ready?: boolean;
      provider?: string;
    };
  };
  lanes?: {
    local?: {
      status?: string;
      mode?: string;
    };
    cloud?: {
      status?: string;
      provider?: string;
      mode?: string;
    };
  };
};

type ImmaculateTrainingBundleFile = {
  bundleId?: string;
};

function normalizeOptionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function buildHarnessReadinessLane(options: {
  endpoint?: string;
  ready?: boolean;
  successDetail: string;
  blockedDetail: string;
  notConfiguredDetail: string;
}): HarnessReadinessLane {
  const endpoint = normalizeOptionalValue(options.endpoint);
  if (!endpoint) {
    return {
      status: "not_configured",
      configured: false,
      ready: false,
      detail: options.notConfiguredDetail
    };
  }
  const ready = options.ready === true;
  return {
    status: ready ? "ready" : "blocked",
    configured: true,
    ready,
    endpoint,
    detail: ready ? options.successDetail : options.blockedDetail
  };
}

export function resolveHarnessReadiness(
  options: ResolveHarnessReadinessOptions
): HarnessReadinessSummary {
  const publicLedger = buildHarnessReadinessLane({
    endpoint: options.publicLedgerBaseUrl,
    ready: options.publicLedgerAdvanced,
    successDetail: options.publicLedgerDetail ?? "public ledger advanced during this bounded pass",
    blockedDetail:
      options.publicLedgerDetail ?? "public ledger did not prove a bounded entry advance during this pass",
    notConfiguredDetail: "public ledger endpoint not configured for this pass"
  });
  const privateLedger = buildHarnessReadinessLane({
    endpoint: options.privateLedgerBaseUrl,
    ready: options.privateLedgerAdvanced,
    successDetail: options.privateLedgerDetail ?? "private ledger advanced during this bounded pass",
    blockedDetail:
      options.privateLedgerDetail ?? "private ledger did not prove a bounded entry advance during this pass",
    notConfiguredDetail: "private ledger endpoint not configured for this pass"
  });
  const qLocal = buildHarnessReadinessLane({
    endpoint: options.qLocalEndpoint,
    ready: options.qLocalHealthy,
    successDetail: options.qLocalDetail ?? "local Q accepted the bounded runtime path for every scenario",
    blockedDetail:
      options.qLocalDetail ?? "local Q did not accept the bounded runtime path for every scenario",
    notConfiguredDetail: "local Q endpoint not configured for this pass"
  });
  const missionLanes = [publicLedger, privateLedger, qLocal];
  const missionSurfaceReady =
    missionLanes.every((lane) => lane.configured) && missionLanes.every((lane) => lane.ready);
  const blockedLanes = missionLanes
    .filter((lane) => !lane.ready)
    .map((lane) => `${lane.endpoint ?? "unconfigured"}: ${lane.detail}`);
  return {
    ledger: {
      public: publicLedger,
      private: privateLedger
    },
    q: {
      local: qLocal
    },
    missionSurfaceReady,
    summary: missionSurfaceReady
      ? "shared ledger.public, ledger.private, and q.local readiness verified for this pass"
      : `shared readiness blocked: ${blockedLanes.join(" | ")}`
  };
}

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
    modelName: payload.run?.modelName,
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

async function readLatestImmaculateBundle(): Promise<{
  bundleId?: string;
  bundlePath?: string;
}> {
  if (!existsSync(IMMACULATE_LATEST_BUNDLE_PATH)) {
    return {};
  }
  const payload = await readJsonFile<ImmaculateTrainingBundleFile>(IMMACULATE_LATEST_BUNDLE_PATH);
  return {
    bundleId: payload?.bundleId?.trim() || undefined,
    bundlePath: path.relative(REPO_ROOT, IMMACULATE_LATEST_BUNDLE_PATH).replaceAll("\\", "/")
  };
}

async function readHybridSessionSummary(): Promise<QHybridTrainingSessionSummary | undefined> {
  const trainingLock = await readTrainingLockSummary();
  const latestImmaculateBundle = await readLatestImmaculateBundle();
  const wikiPath = path.join(REPO_ROOT, "docs", "wiki", "Q-Hybrid-Training.json");
  const wikiPayload = existsSync(wikiPath) ? await readJsonFile<QHybridTrainingWikiFile>(wikiPath) : undefined;
  const wikiBundleId = wikiPayload?.q?.trainingBundleId?.trim();
  const lockBundleId = trainingLock?.bundleId?.trim();
  const wikiMatchesCurrentLock = wikiBundleId && lockBundleId ? wikiBundleId === lockBundleId : Boolean(wikiPayload?.sessionId);
  if (wikiPayload?.sessionId && wikiMatchesCurrentLock) {
    const localStatus =
      wikiPayload.lanes?.local?.status ||
      (wikiPayload.doctor?.local?.ready ? wikiPayload.doctor.local.mode || "ready" : "failed");
    const cloudStatus =
      wikiPayload.lanes?.cloud?.status || (wikiPayload.doctor?.cloud?.ready ? "ready" : "not-configured");
    return {
      generatedAt: wikiPayload.generatedAt,
      sessionId: wikiPayload.sessionId,
      sessionPath:
        normalizeReportedPath(wikiPayload.manifestPath)?.replace(/\.manifest\.json$/u, ".json") ||
        path.relative(REPO_ROOT, wikiPath).replaceAll("\\", "/"),
      localStatus,
      cloudStatus,
      cloudProvider: wikiPayload.lanes?.cloud?.provider || wikiPayload.doctor?.cloud?.provider,
      trainingBundleId: wikiPayload.q?.trainingBundleId,
      immaculateBundleId: latestImmaculateBundle.bundleId ?? wikiPayload.immaculate?.bundleId,
      immaculateBundlePath: latestImmaculateBundle.bundlePath ?? normalizeReportedPath(wikiPayload.manifestPath)
    };
  }

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
    sessionPath:
      payload.output?.sessionJsonPath || path.relative(REPO_ROOT, Q_LATEST_HYBRID_SESSION_PATH).replaceAll("\\", "/"),
    localStatus: payload.lanes?.local?.status,
    cloudStatus: payload.lanes?.cloud?.status,
    cloudProvider: payload.lanes?.cloud?.provider,
    trainingBundleId: payload.q?.trainingBundleId,
    immaculateBundleId: latestImmaculateBundle.bundleId ?? payload.immaculate?.bundleId,
    immaculateBundlePath: latestImmaculateBundle.bundlePath
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
      modelName: getQModelName(),
      foundationModel: foundationModelLabel(getQModelTarget()),
      truthfulLabel: truthfulModelLabel(getQModelTarget()),
      trainingLock,
      hybridSession
    }
  };

  return cachedReleaseMetadata;
}
