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
  release: ReleaseMetadata;
  surfaces: SurfaceTimestamp[];
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
    label: "Model comparison",
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
    label: "W&B benchmark export",
    path: path.join("docs", "wiki", "Benchmark-Wandb-Export.json")
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

function renderMarkdown(report: ReleaseSurfaceReport): string {
  const trainingLock = report.release.q.trainingLock;
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
    `- Q serving label: \`${report.release.q.truthfulLabel}\``,
    `- Q alias: \`${report.release.q.alias}\``,
    `- Q provider model: \`${report.release.q.providerModel}\``,
    `- Q training bundle: \`${trainingLock?.bundleId ?? "none generated yet"}\``,
    "",
    "## What This Means In Plain English",
    "",
    `- Immaculate build \`${report.release.buildId}\` is the current repo build stamp.`,
    `- Q is still served as \`${report.release.q.truthfulLabel}\`, not a mystery renamed model.`,
    trainingLock
      ? `- The latest tracked Q training bundle is \`${trainingLock.bundleId}\`, tied to dataset \`${trainingLock.trainDatasetPath ?? "unknown"}\` and config/provenance captured in \`${trainingLock.lockPath}\`.`
      : "- No tracked Q training bundle has been generated yet in this checkout.",
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
    `- Base model: \`${trainingLock?.baseModel ?? report.release.q.providerModel}\``,
    `- Training dataset rows: \`${trainingLock?.trainDatasetRowCount ?? "n/a"}\``,
    `- Training dataset SHA-256: \`${trainingLock?.trainDatasetSha256 ?? "n/a"}\``,
    `- Mix manifest: \`${trainingLock?.mixManifestPath ?? "n/a"}\``,
    `- Curation run: \`${trainingLock?.curationRunId ?? "n/a"}\``,
    "",
    "## Truth Boundary",
    "",
    "- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.",
    "- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state."
  ].join("\n");
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const surfaces = await Promise.all(
    SURFACE_FILES.map(async (surface) => ({
      ...surface,
      generatedAt: await readGeneratedAt(surface.path)
    }))
  );

  const report: ReleaseSurfaceReport = {
    generatedAt: new Date().toISOString(),
    release,
    surfaces,
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
