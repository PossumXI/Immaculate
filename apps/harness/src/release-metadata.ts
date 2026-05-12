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
    oci: HarnessReadinessLane;
  };
  discord: {
    transport: HarnessReadinessLane;
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
  qOciEndpoint?: string;
  qOciHealthy?: boolean;
  qOciDetail?: string;
  discordTransportEndpoint?: string;
  discordTransportHealthy?: boolean;
  discordTransportDetail?: string;
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
const RELEASE_SURFACE_PATH = path.join(REPO_ROOT, "docs", "wiki", "Release-Surface.json");
const TRACKED_TRAINING_LOCK_RECEIPTS = [
  RELEASE_SURFACE_PATH,
  path.join(REPO_ROOT, "docs", "wiki", "Arobi-Audit-Integrity.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Arobi-Live-Ledger-Receipt.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Live-Mission-Readiness.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Live-Operator-Activity.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Q-Gateway-Substrate.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Q-Mediation-Drift.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Roundtable-Actionability.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Roundtable-Runtime.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Supervised-Mission-Showcase.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Terminal-Bench-Public-Task.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Terminal-Bench-Receipt.json"),
  path.join(REPO_ROOT, "docs", "wiki", "Terminal-Bench-Rerun.json")
];
let cachedReleaseMetadata: ReleaseMetadata | undefined;

function shouldUseTrackedReleaseMetadataOnly(): boolean {
  return process.env.IMMACULATE_RELEASE_METADATA_TRACKED_ONLY === "1";
}

export function resetReleaseMetadataCacheForTests(): void {
  cachedReleaseMetadata = undefined;
}

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
    trainingLockPath?: string;
    modelId?: string;
    trainDatasetPath?: string;
    trainDatasetRowCount?: number;
    mixManifestPath?: string;
    curationRunPath?: string | null;
    curationRunId?: string | null;
  };
  immaculate?: {
    bundleId?: string;
    bundlePath?: string;
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

type QBenchmarkPromotionWikiFile = {
  generatedAt?: string;
  active?: {
    bundleId?: string;
    runName?: string;
    trainDatasetRowCount?: number;
    mixManifestPath?: string;
  };
  promotion?: {
    bundleId?: string;
    runName?: string;
    trainDatasetRowCount?: number;
    mixManifestPath?: string;
    lockPath?: string;
  };
};

type TrainingLockReceiptWikiFile = {
  release?: {
    q?: {
      trainingLock?: Partial<QTrainingLockSummary>;
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
  const qOci = buildHarnessReadinessLane({
    endpoint: options.qOciEndpoint,
    ready: options.qOciHealthy,
    successDetail: options.qOciDetail ?? "OCI-backed Q runtime is ready for this pass",
    blockedDetail: options.qOciDetail ?? "OCI-backed Q runtime did not prove readiness for this pass",
    notConfiguredDetail: "OCI-backed Q runtime not configured for this pass"
  });
  const discordTransport = buildHarnessReadinessLane({
    endpoint: options.discordTransportEndpoint,
    ready: options.discordTransportHealthy,
    successDetail:
      options.discordTransportDetail ?? "Discord transport is live and reachable for this pass",
    blockedDetail:
      options.discordTransportDetail ?? "Discord transport did not prove live reachability for this pass",
    notConfiguredDetail: "Discord transport not configured for this pass"
  });
  const missionLanes = [publicLedger, privateLedger, qLocal, qOci, discordTransport];
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
      local: qLocal,
      oci: qOci
    },
    discord: {
      transport: discordTransport
    },
    missionSurfaceReady,
    summary: missionSurfaceReady
      ? "shared ledger.public, ledger.private, q.local, q.oci, and discord.transport readiness verified for this pass"
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
  if (shouldUseTrackedReleaseMetadataOnly()) {
    return undefined;
  }
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
    return await readTrainingLockSummaryFromTrackedWiki();
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

async function readTrainingLockSummaryFromTrackedWiki(): Promise<QTrainingLockSummary | undefined> {
  const hybridPath = path.join(REPO_ROOT, "docs", "wiki", "Q-Hybrid-Training.json");
  const promotionPath = path.join(REPO_ROOT, "docs", "wiki", "Q-Benchmark-Promotion.json");
  const [hybrid, promotion] = await Promise.all([
    existsSync(hybridPath) ? readJsonFile<QHybridTrainingWikiFile>(hybridPath) : undefined,
    existsSync(promotionPath) ? readJsonFile<QBenchmarkPromotionWikiFile>(promotionPath) : undefined
  ]);
  const promoted = promotion?.promotion ?? promotion?.active;
  const hybridBundleId = hybrid?.q?.trainingBundleId?.trim();
  const promotedBundleId = promoted?.bundleId?.trim();
  const bundleId = hybridBundleId || promotedBundleId;
  if (!bundleId) {
    return undefined;
  }
  const currentPromotion = promotedBundleId === bundleId ? promoted : undefined;
  const currentPromotionLockPath =
    promotion?.promotion?.bundleId?.trim() === bundleId ? promotion.promotion.lockPath : undefined;
  const summary: QTrainingLockSummary = {
    generatedAt: promotion?.generatedAt ?? hybrid?.generatedAt,
    bundleId,
    runName: currentPromotion?.runName,
    modelName: hybrid?.q?.modelId,
    trainDatasetPath: normalizeReportedPath(hybrid?.q?.trainDatasetPath),
    trainDatasetRowCount: hybrid?.q?.trainDatasetRowCount ?? currentPromotion?.trainDatasetRowCount,
    mixManifestPath: normalizeReportedPath(currentPromotion?.mixManifestPath ?? hybrid?.q?.mixManifestPath),
    curationRunPath: normalizeReportedPath(hybrid?.q?.curationRunPath ?? undefined),
    curationRunId: hybrid?.q?.curationRunId ?? undefined,
    lockPath:
      normalizeReportedPath(currentPromotionLockPath ?? hybrid?.q?.trainingLockPath) ??
      "docs/wiki/Q-Hybrid-Training.json"
  };
  const trackedLock = await readTrainingLockSummaryFromTrackedReceipts(bundleId);
  return mergeTrackedTrainingLock(summary, trackedLock);
}

function hasCompleteTrainingProof(lock: QTrainingLockSummary): boolean {
  return Boolean(
    lock.trainDatasetSha256 &&
      lock.mixManifestSha256 &&
      typeof lock.mixSupplementalCount === "number" &&
      lock.mixSupplementalPaths &&
      lock.mixSupplementalPaths.length > 0
  );
}

async function readTrainingLockSummaryFromTrackedReceipts(
  bundleId: string
): Promise<QTrainingLockSummary | undefined> {
  const trackedLocks = await Promise.all(
    TRACKED_TRAINING_LOCK_RECEIPTS.map((receiptPath) => readTrainingLockSummaryFromTrackedReceipt(receiptPath))
  );
  const matchingLocks = trackedLocks.filter(
    (lock): lock is QTrainingLockSummary => lock?.bundleId === bundleId
  );
  return matchingLocks.find(hasCompleteTrainingProof) ?? matchingLocks[0];
}

async function readTrainingLockSummaryFromTrackedReceipt(
  receiptPath: string
): Promise<QTrainingLockSummary | undefined> {
  if (!existsSync(receiptPath)) {
    return undefined;
  }
  const payload = await readJsonFile<TrainingLockReceiptWikiFile>(receiptPath);
  const tracked = payload?.release?.q?.trainingLock;
  const bundleId = tracked?.bundleId?.trim();
  if (!tracked || !bundleId) {
    return undefined;
  }
  return {
    generatedAt: tracked.generatedAt,
    lockVersion: tracked.lockVersion,
    bundleId,
    runName: tracked.runName,
    modelName: tracked.modelName,
    trainDatasetPath: normalizeReportedPath(tracked.trainDatasetPath),
    trainDatasetSha256: tracked.trainDatasetSha256,
    trainDatasetRowCount: tracked.trainDatasetRowCount,
    mixManifestPath: normalizeReportedPath(tracked.mixManifestPath),
    mixManifestSha256: tracked.mixManifestSha256,
    mixSupplementalCount: tracked.mixSupplementalCount,
    mixSupplementalPaths: tracked.mixSupplementalPaths
      ?.map((entry) => normalizeReportedPath(entry))
      .filter((entry): entry is string => Boolean(entry)),
    curationRunPath: normalizeReportedPath(tracked.curationRunPath),
    curationRunId: tracked.curationRunId,
    lockPath:
      normalizeReportedPath(tracked.lockPath) ??
      normalizeReportedPath(receiptPath) ??
      path.relative(REPO_ROOT, receiptPath).replaceAll("\\", "/")
  };
}

function mergeTrackedTrainingLock(
  summary: QTrainingLockSummary,
  tracked: QTrainingLockSummary | undefined
): QTrainingLockSummary {
  if (!tracked || tracked.bundleId !== summary.bundleId) {
    return summary;
  }
  return {
    ...summary,
    generatedAt: tracked.generatedAt ?? summary.generatedAt,
    lockVersion: summary.lockVersion ?? tracked.lockVersion,
    trainDatasetSha256: summary.trainDatasetSha256 ?? tracked.trainDatasetSha256,
    mixManifestSha256: summary.mixManifestSha256 ?? tracked.mixManifestSha256,
    mixSupplementalCount: summary.mixSupplementalCount ?? tracked.mixSupplementalCount,
    mixSupplementalPaths:
      summary.mixSupplementalPaths && summary.mixSupplementalPaths.length > 0
        ? summary.mixSupplementalPaths
        : tracked.mixSupplementalPaths
  };
}

async function readLatestImmaculateBundle(): Promise<{
  bundleId?: string;
  bundlePath?: string;
}> {
  if (shouldUseTrackedReleaseMetadataOnly() || !existsSync(IMMACULATE_LATEST_BUNDLE_PATH)) {
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
      immaculateBundlePath:
        latestImmaculateBundle.bundlePath ??
        normalizeReportedPath(wikiPayload.immaculate?.bundlePath) ??
        normalizeReportedPath(wikiPayload.manifestPath)
    };
  }

  if (shouldUseTrackedReleaseMetadataOnly() || !existsSync(Q_LATEST_HYBRID_SESSION_PATH)) {
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
