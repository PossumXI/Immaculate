import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getArobiNetworkName, getImmaculateHarnessName, getQModelName } from "./q-model.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

export type SurfaceTimestamp = {
  label: string;
  path: string;
  generatedAt?: string;
  required?: boolean;
  maxAgeMs?: number;
  healthStatus?: "healthy" | "unhealthy" | "unknown";
  healthReason?: string;
};

type ReleaseSurfaceEvidenceStatus =
  | "fresh"
  | "stale"
  | "missing"
  | "invalid"
  | "optional"
  | "unhealthy";

type ReleaseSurfaceEvidenceEntry = SurfaceTimestamp & {
  required: boolean;
  maxAgeMs: number;
  status: ReleaseSurfaceEvidenceStatus;
  blocking: boolean;
  reason: string;
};

type ReleaseSurfaceEvidence = {
  status: "ready" | "blocked";
  maxAgeMs: number;
  counts: {
    total: number;
    required: number;
    fresh: number;
    stale: number;
    missing: number;
    invalid: number;
    unhealthy: number;
    optional: number;
    blocking: number;
  };
  summary: string;
  surfaces: ReleaseSurfaceEvidenceEntry[];
};

type ReleaseSurfaceReport = {
  generatedAt: string;
  release: Omit<ReleaseMetadata, "q"> & {
    q: Pick<ReleaseMetadata["q"], "modelName" | "foundationModel" | "trainingLock" | "hybridSession">;
  };
  surfaces: SurfaceTimestamp[];
  releaseEvidence: ReleaseSurfaceEvidence;
  cloudflare?: {
    generatedAt?: string;
    sessionId?: string;
    status?: string;
    authReady?: boolean;
    adapterReady?: boolean;
    workerReady?: boolean;
    evalBundleReady?: boolean;
    smokeReady?: boolean;
    recommendedNextStep?: string;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const RELEASE_SURFACE_JSON_PATH = path.join("docs", "wiki", "Release-Surface.json");
const RELEASE_SURFACE_MARKDOWN_PATH = path.join("docs", "wiki", "Release-Surface.md");
const GENERATED_WIKI_PATHSPEC = ":(exclude)docs/wiki/**";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RELEASE_SURFACE_MAX_AGE_MS = 7 * ONE_DAY_MS;

function surface(
  label: string,
  filePath: string,
  options?: { required?: boolean; maxAgeMs?: number }
): SurfaceTimestamp {
  return {
    label,
    path: path.join("docs", "wiki", filePath),
    required: options?.required ?? false,
    maxAgeMs: options?.maxAgeMs
  };
}

const SURFACE_FILES: SurfaceTimestamp[] = [
  surface("BridgeBench", "BridgeBench.json", { required: true }),
  surface("BridgeBench soak", "BridgeBench-Soak.json", { required: true }),
  surface("Q structured contract benchmark", "Model-Benchmark-Comparison.json", {
    required: true
  }),
  surface("Q readiness gate", "Q-Readiness-Gate.json", { required: true }),
  surface("Q gateway validation", "Q-Gateway-Validation.json", { required: true }),
  surface("Q gateway substrate", "Q-Gateway-Substrate.json", { required: true }),
  surface("Q mediation drift", "Q-Mediation-Drift.json", { required: true }),
  surface("Arobi audit integrity", "Arobi-Audit-Integrity.json", { required: true }),
  surface("Arobi live ledger receipt", "Arobi-Live-Ledger-Receipt.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Live mission readiness", "Live-Mission-Readiness.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Live operator activity", "Live-Operator-Activity.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Live operator public export", "Live-Operator-Public-Export.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Cross-project workflow health", "Cross-Project-Workflow-Health.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Supervised mission showcase", "Supervised-Mission-Showcase.json"),
  surface("Roundtable actionability", "Roundtable-Actionability.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Roundtable runtime", "Roundtable-Runtime.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Q API audit", "Q-API-Audit.json"),
  surface("Arobi decision review", "Arobi-Decision-Review.json"),
  surface("Q hybrid training", "Q-Hybrid-Training.json", { required: true }),
  surface("HF Jobs training", "HF-Jobs-Training.json"),
  surface("Colab free training", "Colab-Free-Training.json"),
  surface("Kaggle free training", "Kaggle-Free-Training.json"),
  surface("Cloudflare Q inference", "Cloudflare-Q-Inference.json"),
  surface("OCI GPU advisor", "OCI-GPU-Advisor.json"),
  surface("OCI region capacity", "OCI-Region-Capacity.json"),
  surface("Q benchmark corpus", "Q-Benchmark-Corpus.json", { required: true }),
  surface("Q benchmark promotion", "Q-Benchmark-Promotion.json", { required: true }),
  surface("W&B benchmark export", "Benchmark-Wandb-Export.json", { required: true }),
  surface("Harbor terminal bench", "Harbor-Terminal-Bench.json"),
  surface("Terminal-Bench public task", "Terminal-Bench-Public-Task.json"),
  surface("Terminal-Bench leaderboard status", "Terminal-Bench-Receipt.json"),
  surface("Terminal-Bench rerun (diagnostic-only)", "Terminal-Bench-Rerun.json"),
  surface("GitHub checks receipt", "GitHub-Checks-Receipt.json", {
    required: true,
    maxAgeMs: ONE_DAY_MS
  }),
  surface("Harbor terminal bench soak", "Harbor-Terminal-Bench-Soak.json"),
  surface("Q benchmark sweep (60m)", "Q-Benchmark-Sweep-60m.json")
];

function parseIsoMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatDurationMs(value: number): string {
  const minutes = Math.round(value / 60_000);
  if (minutes < 90) {
    return `${minutes}m`;
  }
  const hours = Math.round(value / 3_600_000);
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.round(value / ONE_DAY_MS)}d`;
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

function resolveReleaseSurfaceSourceCommit(): Pick<
  ReleaseMetadata,
  "gitSha" | "gitShortSha" | "buildId" | "packageVersion"
> | undefined {
  const gitSha = runGit([
    "log",
    "-1",
    "--format=%H",
    "--",
    ".",
    GENERATED_WIKI_PATHSPEC,
    `:(exclude)${RELEASE_SURFACE_JSON_PATH.replaceAll("\\", "/")}`,
    `:(exclude)${RELEASE_SURFACE_MARKDOWN_PATH.replaceAll("\\", "/")}`
  ]);
  if (!gitSha) {
    return undefined;
  }
  const gitShortSha =
    runGit([
      "log",
      "-1",
      "--format=%h",
      "--abbrev=7",
      "--",
      ".",
      GENERATED_WIKI_PATHSPEC,
      `:(exclude)${RELEASE_SURFACE_JSON_PATH.replaceAll("\\", "/")}`,
      `:(exclude)${RELEASE_SURFACE_MARKDOWN_PATH.replaceAll("\\", "/")}`
    ]) ?? gitSha.slice(0, 7);
  return {
    gitSha,
    gitShortSha,
    packageVersion: "0.0.0",
    buildId: `0.0.0+${gitShortSha}`
  };
}

function bindReleaseSurfaceSourceCommit(release: ReleaseMetadata): ReleaseMetadata {
  const sourceCommit = resolveReleaseSurfaceSourceCommit();
  if (!sourceCommit) {
    return release;
  }
  return {
    ...release,
    gitSha: sourceCommit.gitSha,
    gitShortSha: sourceCommit.gitShortSha,
    buildId: `${release.packageVersion}+${sourceCommit.gitShortSha}`
  };
}

function resolveStableReportGeneratedAt(surfaces: SurfaceTimestamp[]): string {
  const newestTimestamp = surfaces
    .map((surface) => surface.generatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  return newestTimestamp ?? new Date(0).toISOString();
}

export function evaluateReleaseSurfaceEvidence(
  surfaces: SurfaceTimestamp[],
  options?: {
    nowMs?: number;
    maxAgeMs?: number;
  }
): ReleaseSurfaceEvidence {
  const nowMs = options?.nowMs ?? Date.now();
  const defaultMaxAgeMs = options?.maxAgeMs ?? DEFAULT_RELEASE_SURFACE_MAX_AGE_MS;
  const entries = surfaces.map((surface): ReleaseSurfaceEvidenceEntry => {
    const required = surface.required === true;
    const maxAgeMs = surface.maxAgeMs ?? defaultMaxAgeMs;
    const parsed = parseIsoMs(surface.generatedAt);
    if (!surface.generatedAt) {
      return {
        ...surface,
        required,
        maxAgeMs,
        status: required ? "missing" : "optional",
        blocking: required,
        reason: required ? "required evidence timestamp missing" : "optional evidence missing"
      };
    }
    if (parsed === undefined) {
      return {
        ...surface,
        required,
        maxAgeMs,
        status: "invalid",
        blocking: required,
        reason: "evidence timestamp is not valid ISO time"
      };
    }
    const ageMs = Math.max(0, nowMs - parsed);
    const fresh = ageMs <= maxAgeMs;
    if (fresh && surface.healthStatus === "unhealthy") {
      return {
        ...surface,
        required,
        maxAgeMs,
        status: "unhealthy",
        blocking: required,
        reason: surface.healthReason ?? "required receipt reports an unhealthy state"
      };
    }
    return {
      ...surface,
      required,
      maxAgeMs,
      status: fresh ? "fresh" : "stale",
      blocking: required && !fresh,
      reason: fresh
        ? `fresh within ${formatDurationMs(maxAgeMs)} budget`
        : `stale outside ${formatDurationMs(maxAgeMs)} budget`
    };
  });
  const blocking = entries.filter((entry) => entry.blocking);
  const counts = {
    total: entries.length,
    required: entries.filter((entry) => entry.required).length,
    fresh: entries.filter((entry) => entry.status === "fresh").length,
    stale: entries.filter((entry) => entry.status === "stale").length,
    missing: entries.filter((entry) => entry.status === "missing").length,
    invalid: entries.filter((entry) => entry.status === "invalid").length,
    unhealthy: entries.filter((entry) => entry.status === "unhealthy").length,
    optional: entries.filter((entry) => entry.status === "optional").length,
    blocking: blocking.length
  };
  return {
    status: blocking.length === 0 ? "ready" : "blocked",
    maxAgeMs: defaultMaxAgeMs,
    counts,
    summary:
      blocking.length === 0
        ? `all ${counts.required} required release evidence receipt(s) are fresh`
        : `${blocking.length} blocking release evidence gap(s): ${blocking
            .map((entry) => `${entry.label} ${entry.reason}`)
            .join("; ")}`,
    surfaces: entries
  };
}

export function renderReleaseAccountabilityGapLines(evidence: ReleaseSurfaceEvidence): string[] {
  const blocking = evidence.surfaces.filter((surface) => surface.blocking);
  const warnings = evidence.surfaces.filter(
    (surface) => !surface.blocking && surface.status !== "fresh"
  );
  const lines = [
    "## Release Accountability Gaps",
    "",
    `- Status: \`${evidence.status}\``,
    `- Summary: ${evidence.summary}`,
    `- Counts: \`${evidence.counts.fresh} fresh / ${evidence.counts.blocking} blocking / ${evidence.counts.unhealthy} unhealthy / ${evidence.counts.optional} optional missing\``,
    ""
  ];
  if (blocking.length > 0) {
    lines.push("### Blocking gaps", "");
    lines.push(
      ...blocking.map(
        (surface) =>
          `- ${surface.label}: \`${surface.status}\` via \`${surface.path.replaceAll("\\", "/")}\` - ${surface.reason}`
      ),
      ""
    );
  } else {
    lines.push("- No blocking release evidence gaps.", "");
  }
  if (warnings.length > 0) {
    lines.push("### Non-blocking warnings", "");
    lines.push(
      ...warnings.map(
        (surface) =>
          `- ${surface.label}: \`${surface.status}\` via \`${surface.path.replaceAll("\\", "/")}\` - ${surface.reason}`
      ),
      ""
    );
  }
  return lines;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nestedRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | undefined {
  return asRecord(record[key]);
}

export function inferSurfaceHealth(payload: unknown): Pick<
  SurfaceTimestamp,
  "healthStatus" | "healthReason"
> {
  const record = asRecord(payload);
  if (!record) {
    return {
      healthStatus: "unknown",
      healthReason: "receipt payload was not a JSON object"
    };
  }

  const benchmark = nestedRecord(record, "benchmark");
  const failedAssertions = benchmark?.failedAssertions;
  if (typeof failedAssertions === "number" && failedAssertions > 0) {
    return {
      healthStatus: "unhealthy",
      healthReason: `benchmark reports ${failedAssertions} failed assertion(s)`
    };
  }

  const assertions = record.assertions;
  if (
    Array.isArray(assertions) &&
    assertions.some((entry) => asRecord(entry)?.status === "fail")
  ) {
    return {
      healthStatus: "unhealthy",
      healthReason: "receipt assertions include failing checks"
    };
  }

  if (record.ready === false) {
    return {
      healthStatus: "unhealthy",
      healthReason: "receipt reports ready=false"
    };
  }

  const models = record.models;
  if (
    Array.isArray(models) &&
    models.some((entry) => {
      const model = asRecord(entry);
      if (!model) {
        return false;
      }
      const parseSuccessRate = model.parseSuccessRate;
      if (typeof parseSuccessRate === "number" && parseSuccessRate < 1) {
        return true;
      }
      const parseSuccessCount = model.parseSuccessCount;
      const taskCount = model.taskCount;
      return (
        typeof parseSuccessCount === "number" &&
        typeof taskCount === "number" &&
        taskCount > 0 &&
        parseSuccessCount < taskCount
      );
    })
  ) {
    return {
      healthStatus: "unhealthy",
      healthReason: "model lane receipt reports incomplete structured parse success"
    };
  }

  const verification = nestedRecord(record, "verification");
  if (verification?.allWorkflowRunsSuccessful === false) {
    return {
      healthStatus: "unhealthy",
      healthReason: "GitHub workflow receipt reports non-green workflow runs"
    };
  }
  if (verification?.allCheckRunsSuccessful === false) {
    return {
      healthStatus: "unhealthy",
      healthReason: "GitHub checks receipt reports non-green check runs"
    };
  }

  const summary = nestedRecord(record, "summary");
  if (summary?.allActionableWorkflowRunsHealthy === false) {
    return {
      healthStatus: "unhealthy",
      healthReason: "cross-project workflow receipt reports non-green actionable runs"
    };
  }
  if (
    summary?.allActionableWorkflowRunsHealthy !== true &&
    summary?.allObservedWorkflowRunsSuccessful === false
  ) {
    return {
      healthStatus: "unhealthy",
      healthReason: "cross-project workflow receipt reports non-green observed runs"
    };
  }

  const readiness = nestedRecord(record, "readiness");
  if (readiness?.missionSurfaceReady === false) {
    return {
      healthStatus: "unhealthy",
      healthReason: "mission readiness receipt reports missionSurfaceReady=false"
    };
  }

  const publication = nestedRecord(record, "publication");
  const publicationStatus = publication?.status;
  if (
    typeof publicationStatus === "string" &&
    /blocked|failed|degraded/i.test(publicationStatus)
  ) {
    return {
      healthStatus: "unhealthy",
      healthReason: `publication status is ${publicationStatus}`
    };
  }

  const proof = nestedRecord(record, "proof");
  if (proof?.liveRecordVisible === false) {
    return {
      healthStatus: "unhealthy",
      healthReason: "live ledger receipt does not show the latest governed record publicly"
    };
  }

  const topLevelStatus = record.status;
  if (typeof topLevelStatus === "string" && /blocked|failed|degraded/i.test(topLevelStatus)) {
    return {
      healthStatus: "unhealthy",
      healthReason: `receipt status is ${topLevelStatus}`
    };
  }

  const summaryStatus = summary?.status;
  if (typeof summaryStatus === "string" && /blocked|failed|degraded/i.test(summaryStatus)) {
    return {
      healthStatus: "unhealthy",
      healthReason: `summary status is ${summaryStatus}`
    };
  }

  return {
    healthStatus: "healthy",
    healthReason: "no failed receipt signals detected"
  };
}

async function readSurfaceReceipt(filePath: string): Promise<
  Pick<SurfaceTimestamp, "generatedAt" | "healthStatus" | "healthReason">
> {
  try {
    const payload = JSON.parse(await readFile(path.join(REPO_ROOT, filePath), "utf8")) as {
      generatedAt?: string;
      exportedAt?: string;
    };
    return {
      generatedAt: payload.generatedAt ?? payload.exportedAt,
      ...inferSurfaceHealth(payload)
    };
  } catch {
    return {
      healthStatus: "unknown",
      healthReason: "receipt could not be read or parsed"
    };
  }
}

async function readCloudflareSummary(): Promise<ReleaseSurfaceReport["cloudflare"]> {
  const filePath = path.join(REPO_ROOT, "docs", "wiki", "Cloudflare-Q-Inference.json");
  try {
    const payload = JSON.parse(await readFile(filePath, "utf8")) as {
      generatedAt?: string;
      sessionId?: string;
      readiness?: {
        authReady?: boolean;
        adapterReady?: boolean;
        workerReady?: boolean;
        evalBundleReady?: boolean;
        smokeReady?: boolean;
      };
      summary?: {
        status?: string;
        recommendedNextStep?: string;
      };
    };
    return {
      generatedAt: payload.generatedAt,
      sessionId: payload.sessionId,
      status: payload.summary?.status,
      authReady: payload.readiness?.authReady,
      adapterReady: payload.readiness?.adapterReady,
      workerReady: payload.readiness?.workerReady,
      evalBundleReady: payload.readiness?.evalBundleReady,
      smokeReady: payload.readiness?.smokeReady,
      recommendedNextStep: payload.summary?.recommendedNextStep
    };
  } catch {
    return undefined;
  }
}

function renderMarkdown(report: ReleaseSurfaceReport): string {
  const trainingLock = report.release.q.trainingLock;
  const hybridSession = report.release.q.hybridSession;
  const cloudflare = report.cloudflare;
  return [
    "# Release Surface",
    "",
    "This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Immaculate release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    `- Branch: \`${report.release.gitBranch}\``,
    `- Root package version: \`${report.release.packageVersion}\``,
    `- Harness package version: \`${report.release.harnessVersion}\``,
    `- Core package version: \`${report.release.coreVersion}\``,
    `- Q model name: \`${report.release.q.modelName}\``,
    `- Q foundation model: \`${report.release.q.foundationModel}\``,
    `- Q training bundle: \`${trainingLock?.bundleId ?? "none generated yet"}\``,
    `- Q hybrid session: \`${hybridSession?.sessionId ?? "none generated yet"}\``,
    "",
    "## What This Means In Plain English",
    "",
    `- Immaculate build \`${report.release.buildId}\` is the current repo build stamp.`,
    `- ${getArobiNetworkName()} is the ledger-backed private and public operator network and audit substrate. ${getImmaculateHarnessName()} is the governed harness and orchestrator inside it. ${getQModelName()} is the reasoning brain inside that governed stack.`,
    `- Q is the only public model name used across the repo, and it is built on \`${report.release.q.foundationModel}\`.`,
    trainingLock
      ? `- The latest tracked Q training bundle is \`${trainingLock.bundleId}\`, tied to dataset \`${trainingLock.trainDatasetPath ?? "unknown"}\` and config/provenance captured in \`${trainingLock.lockPath}\`.`
      : "- No tracked Q training bundle has been generated yet in this checkout.",
    hybridSession
      ? `- The latest hybrid session is \`${hybridSession.sessionId}\`, with local lane \`${hybridSession.localStatus ?? "unknown"}\` and cloud lane \`${hybridSession.cloudStatus ?? "unknown"}\` on provider \`${hybridSession.cloudProvider ?? "unknown"}\`.`
      : "- No tracked hybrid Q training session has been generated yet in this checkout.",
    cloudflare
      ? `- A separate Cloudflare inference readiness surface is tracked for session \`${cloudflare.sessionId ?? "unknown"}\`, while the current public wins remain the Terminal-Bench public-task pass, the green mediation/substrate lanes, and the linked Arobi decision review.`
      : "- No Cloudflare inference summary has been generated yet in this checkout.",
    "",
    "## Current Evidence Surfaces",
    "",
    ...report.surfaces.map(
      (surface) => `- ${surface.label}: \`${surface.generatedAt ?? "missing"}\` via \`${surface.path.replaceAll("\\", "/")}\``
    ),
    "",
    ...renderReleaseAccountabilityGapLines(report.releaseEvidence),
    "",
    "## Q Training Bundle",
    "",
    `- Lock path: \`${trainingLock?.lockPath ?? "none"}\``,
    `- Lock generated: \`${trainingLock?.generatedAt ?? "n/a"}\``,
    `- Run name: \`${trainingLock?.runName ?? "n/a"}\``,
    `- Training dataset rows: \`${trainingLock?.trainDatasetRowCount ?? "n/a"}\``,
    `- Training dataset SHA-256: \`${trainingLock?.trainDatasetSha256 ?? "n/a"}\``,
    `- Mix manifest: \`${trainingLock?.mixManifestPath ?? "n/a"}\``,
    `- Mix supplemental count: \`${trainingLock?.mixSupplementalCount ?? "n/a"}\``,
    `- Mix supplementals: \`${trainingLock?.mixSupplementalPaths?.join(", ") ?? "n/a"}\``,
    `- Curation run: \`${trainingLock?.curationRunId ?? "n/a"}\``,
    "",
    "## Hybrid Training Session",
    "",
    `- Session path: \`${hybridSession?.sessionPath ?? "none"}\``,
    `- Session generated: \`${hybridSession?.generatedAt ?? "n/a"}\``,
    `- Local lane status: \`${hybridSession?.localStatus ?? "n/a"}\``,
    `- Cloud lane status: \`${hybridSession?.cloudStatus ?? "n/a"}\``,
    `- Cloud provider: \`${hybridSession?.cloudProvider ?? "n/a"}\``,
    `- Immaculate orchestration bundle: \`${hybridSession?.immaculateBundleId ?? "n/a"}\``,
    `- Immaculate bundle source: \`${hybridSession?.immaculateBundlePath ?? "n/a"}\``,
    "",
    "## Cloudflare Inference Readiness",
    "",
    `- Session id: \`${cloudflare?.sessionId ?? "n/a"}\``,
    `- Generated: \`${cloudflare?.generatedAt ?? "n/a"}\``,
    `- Auth ready: \`${cloudflare?.authReady ?? "n/a"}\``,
    `- Adapter ready: \`${cloudflare?.adapterReady ?? "n/a"}\``,
    `- Worker ready: \`${cloudflare?.workerReady ?? "n/a"}\``,
    `- Eval bundle ready: \`${cloudflare?.evalBundleReady ?? "n/a"}\``,
    `- Smoke ready: \`${cloudflare?.smokeReady ?? "n/a"}\``,
    "",
    "## Truth Boundary",
    "",
    "- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.",
    "- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state."
  ].join("\n");
}

async function main(): Promise<void> {
  const release = bindReleaseSurfaceSourceCommit(await resolveReleaseMetadata());
  const [surfaces, cloudflare] = await Promise.all([
    Promise.all(
      SURFACE_FILES.map(async (surface) => ({
        ...surface,
        ...(await readSurfaceReceipt(surface.path))
      }))
    ),
    readCloudflareSummary()
  ]);
  const releaseEvidence = evaluateReleaseSurfaceEvidence(surfaces);

  const report: ReleaseSurfaceReport = {
    generatedAt: resolveStableReportGeneratedAt(surfaces),
    release: {
      ...release,
      q: {
        modelName: release.q.modelName,
        foundationModel: release.q.foundationModel,
        trainingLock: release.q.trainingLock,
        hybridSession: release.q.hybridSession
      }
    },
    surfaces,
    releaseEvidence,
    cloudflare,
    output: {
      jsonPath: RELEASE_SURFACE_JSON_PATH,
      markdownPath: RELEASE_SURFACE_MARKDOWN_PATH
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : "Release surface generation failed.");
    process.exitCode = 1;
  });
}
