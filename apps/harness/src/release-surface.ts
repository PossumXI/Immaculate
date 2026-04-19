import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type SurfaceTimestamp = {
  label: string;
  path: string;
  generatedAt?: string;
};

type ReleaseSurfaceReport = {
  generatedAt: string;
  release: Omit<ReleaseMetadata, "q"> & {
    q: Pick<ReleaseMetadata["q"], "modelName" | "foundationModel" | "trainingLock" | "hybridSession">;
  };
  surfaces: SurfaceTimestamp[];
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

const SURFACE_FILES: SurfaceTimestamp[] = [
  {
    label: "BridgeBench",
    path: path.join("docs", "wiki", "BridgeBench.json")
  },
  {
    label: "BridgeBench soak",
    path: path.join("docs", "wiki", "BridgeBench-Soak.json")
  },
  {
    label: "Q structured contract benchmark",
    path: path.join("docs", "wiki", "Model-Benchmark-Comparison.json")
  },
  {
    label: "Q readiness gate",
    path: path.join("docs", "wiki", "Q-Readiness-Gate.json")
  },
  {
    label: "Q gateway validation",
    path: path.join("docs", "wiki", "Q-Gateway-Validation.json")
  },
  {
    label: "Q gateway substrate",
    path: path.join("docs", "wiki", "Q-Gateway-Substrate.json")
  },
  {
    label: "Q mediation drift",
    path: path.join("docs", "wiki", "Q-Mediation-Drift.json")
  },
  {
    label: "Q API audit",
    path: path.join("docs", "wiki", "Q-API-Audit.json")
  },
  {
    label: "Q hybrid training",
    path: path.join("docs", "wiki", "Q-Hybrid-Training.json")
  },
  {
    label: "HF Jobs training",
    path: path.join("docs", "wiki", "HF-Jobs-Training.json")
  },
  {
    label: "Colab free training",
    path: path.join("docs", "wiki", "Colab-Free-Training.json")
  },
  {
    label: "Kaggle free training",
    path: path.join("docs", "wiki", "Kaggle-Free-Training.json")
  },
  {
    label: "Cloudflare Q inference",
    path: path.join("docs", "wiki", "Cloudflare-Q-Inference.json")
  },
  {
    label: "OCI GPU advisor",
    path: path.join("docs", "wiki", "OCI-GPU-Advisor.json")
  },
  {
    label: "OCI region capacity",
    path: path.join("docs", "wiki", "OCI-Region-Capacity.json")
  },
  {
    label: "Q benchmark corpus",
    path: path.join("docs", "wiki", "Q-Benchmark-Corpus.json")
  },
  {
    label: "Q failure corpus",
    path: path.join("docs", "wiki", "Q-Failure-Corpus.json")
  },
  {
    label: "Q benchmark promotion",
    path: path.join("docs", "wiki", "Q-Benchmark-Promotion.json")
  },
  {
    label: "W&B benchmark export",
    path: path.join("docs", "wiki", "Benchmark-Wandb-Export.json")
  },
  {
    label: "Harbor terminal bench",
    path: path.join("docs", "wiki", "Harbor-Terminal-Bench.json")
  },
  {
    label: "Terminal-Bench public task",
    path: path.join("docs", "wiki", "Terminal-Bench-Public-Task.json")
  },
  {
    label: "Terminal-Bench receipt (historical public)",
    path: path.join("docs", "wiki", "Terminal-Bench-Receipt.json")
  },
  {
    label: "Terminal-Bench rerun (diagnostic-only)",
    path: path.join("docs", "wiki", "Terminal-Bench-Rerun.json")
  },
  {
    label: "GitHub checks receipt",
    path: path.join("docs", "wiki", "GitHub-Checks-Receipt.json")
  },
  {
    label: "Harbor terminal bench soak",
    path: path.join("docs", "wiki", "Harbor-Terminal-Bench-Soak.json")
  },
  {
    label: "Q benchmark sweep (60m)",
    path: path.join("docs", "wiki", "Q-Benchmark-Sweep-60m.json")
  }
];

async function readGeneratedAt(filePath: string): Promise<string | undefined> {
  try {
    const payload = JSON.parse(await readFile(path.join(REPO_ROOT, filePath), "utf8")) as {
      generatedAt?: string;
      exportedAt?: string;
    };
    return payload.generatedAt ?? payload.exportedAt;
  } catch {
    return undefined;
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
    `- Q is the only public model name used across the repo, and it is built on \`${report.release.q.foundationModel}\`.`,
    trainingLock
      ? `- The latest tracked Q training bundle is \`${trainingLock.bundleId}\`, tied to dataset \`${trainingLock.trainDatasetPath ?? "unknown"}\` and config/provenance captured in \`${trainingLock.lockPath}\`.`
      : "- No tracked Q training bundle has been generated yet in this checkout.",
    hybridSession
      ? `- The latest hybrid session is \`${hybridSession.sessionId}\`, with local lane \`${hybridSession.localStatus ?? "unknown"}\` and cloud lane \`${hybridSession.cloudStatus ?? "unknown"}\` on provider \`${hybridSession.cloudProvider ?? "unknown"}\`.`
      : "- No tracked hybrid Q training session has been generated yet in this checkout.",
    cloudflare
      ? `- The Cloudflare inference lane is currently \`${cloudflare.status ?? "unknown"}\` for session \`${cloudflare.sessionId ?? "unknown"}\`, with auth \`${cloudflare.authReady}\`, adapter \`${cloudflare.adapterReady}\`, worker \`${cloudflare.workerReady}\`, eval bundle \`${cloudflare.evalBundleReady}\`, and smoke \`${cloudflare.smokeReady}\`.`
      : "- No Cloudflare inference summary has been generated yet in this checkout.",
    "",
    "## Current Evidence Surfaces",
    "",
    ...report.surfaces.map(
      (surface) => `- ${surface.label}: \`${surface.generatedAt ?? "missing"}\` via \`${surface.path.replaceAll("\\", "/")}\``
    ),
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
    "## Cloudflare Inference Lane",
    "",
    `- Session id: \`${cloudflare?.sessionId ?? "n/a"}\``,
    `- Generated: \`${cloudflare?.generatedAt ?? "n/a"}\``,
    `- Status: \`${cloudflare?.status ?? "n/a"}\``,
    `- Auth ready: \`${cloudflare?.authReady ?? "n/a"}\``,
    `- Adapter ready: \`${cloudflare?.adapterReady ?? "n/a"}\``,
    `- Worker ready: \`${cloudflare?.workerReady ?? "n/a"}\``,
    `- Eval bundle ready: \`${cloudflare?.evalBundleReady ?? "n/a"}\``,
    `- Smoke ready: \`${cloudflare?.smokeReady ?? "n/a"}\``,
    `- Recommended next step: ${cloudflare?.recommendedNextStep ?? "n/a"}`,
    "",
    "## Truth Boundary",
    "",
    "- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.",
    "- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state."
  ].join("\n");
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const [surfaces, cloudflare] = await Promise.all([
    Promise.all(
    SURFACE_FILES.map(async (surface) => ({
      ...surface,
      generatedAt: await readGeneratedAt(surface.path)
    }))
    ),
    readCloudflareSummary()
  ]);

  const report: ReleaseSurfaceReport = {
    generatedAt: new Date().toISOString(),
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
    cloudflare,
    output: {
      jsonPath: path.join("docs", "wiki", "Release-Surface.json"),
      markdownPath: path.join("docs", "wiki", "Release-Surface.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Release surface generation failed.");
  process.exitCode = 1;
});
