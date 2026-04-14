import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type ModelComparisonTask = {
  status: "completed" | "failed";
  parseSuccess: boolean;
  failureClass?: string;
};

type ModelComparisonModel = {
  truthfulLabel: string;
  parseSuccessRate: number;
  completedTaskCount: number;
  taskCount: number;
  tasks: ModelComparisonTask[];
};

type ModelComparisonReport = {
  generatedAt: string;
  models: ModelComparisonModel[];
};

type BridgeBenchTask = {
  status: "completed" | "failed";
  parseSuccess: boolean;
  failureClass?: string;
};

type BridgeBenchModel = {
  truthfulLabel: string;
  parseSuccessRate: number;
  taskCount: number;
  tasks: BridgeBenchTask[];
};

type BridgeBenchReport = {
  generatedAt: string;
  models: BridgeBenchModel[];
};

type QReadinessGateReport = {
  generatedAt: string;
  threshold: number;
  ready: boolean;
  release: ReleaseMetadata;
  reasons: string[];
  sources: {
    modelComparisonGeneratedAt?: string;
    bridgeBenchGeneratedAt?: string;
  };
  q: {
    modelComparison?: {
      parseSuccessRate: number;
      completedTaskCount: number;
      taskCount: number;
      dominantFailureClass?: string;
    };
    bridgeBench?: {
      parseSuccessRate: number;
      taskCount: number;
      dominantFailureClass?: string;
    };
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    const value = await readFile(filePath, "utf8");
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function dominantFailureClass(values: Array<{ failureClass?: string }>): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value.failureClass) {
      continue;
    }
    counts.set(value.failureClass, (counts.get(value.failureClass) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function renderMarkdown(report: QReadinessGateReport): string {
  return [
    "# Q Readiness Gate",
    "",
    "This page is generated from the tracked direct-Q report surfaces. It does not grade the gateway transport; it grades whether the underlying Q model is ready for structured route/reason/commit work on this machine.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Ready: \`${report.ready}\``,
    `- Threshold: \`${report.threshold}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``,
    `- Model comparison source: \`${report.sources.modelComparisonGeneratedAt ?? "missing"}\``,
    `- BridgeBench source: \`${report.sources.bridgeBenchGeneratedAt ?? "missing"}\``,
    "",
    "## Q Direct Results",
    "",
    `- Model comparison parse success: \`${report.q.modelComparison?.parseSuccessRate ?? "n/a"}\``,
    `- Model comparison completed tasks: \`${report.q.modelComparison?.completedTaskCount ?? "n/a"}/${report.q.modelComparison?.taskCount ?? "n/a"}\``,
    `- Model comparison dominant failure: \`${report.q.modelComparison?.dominantFailureClass ?? "none"}\``,
    `- BridgeBench parse success: \`${report.q.bridgeBench?.parseSuccessRate ?? "n/a"}\``,
    `- BridgeBench dominant failure: \`${report.q.bridgeBench?.dominantFailureClass ?? "none"}\``,
    "",
    "## Reasons",
    "",
    ...report.reasons.map((reason) => `- ${reason}`)
  ].join("\n");
}

async function main(): Promise<void> {
  const threshold = Number(process.env.IMMACULATE_Q_READINESS_THRESHOLD ?? 0.75);
  const comparisonPath = path.join(WIKI_ROOT, "Model-Benchmark-Comparison.json");
  const bridgeBenchPath = path.join(WIKI_ROOT, "BridgeBench.json");
  const modelComparison = await readJson<ModelComparisonReport>(comparisonPath);
  const bridgeBench = await readJson<BridgeBenchReport>(bridgeBenchPath);

  const qComparison = modelComparison?.models.find((model) => model.truthfulLabel.startsWith("Q "));
  const qBridgeBench = bridgeBench?.models.find((model) => model.truthfulLabel.startsWith("Q "));

  const reasons: string[] = [];
  if (!qComparison) {
    reasons.push("Model comparison report did not contain a direct Q lane.");
  }
  if (!qBridgeBench) {
    reasons.push("BridgeBench report did not contain a direct Q lane.");
  }
  if (qComparison && qComparison.parseSuccessRate < threshold) {
    reasons.push(
      `Q model-comparison parse success ${qComparison.parseSuccessRate} is below the ${threshold} readiness threshold.`
    );
  }
  if (qBridgeBench && qBridgeBench.parseSuccessRate < threshold) {
    reasons.push(
      `Q BridgeBench parse success ${qBridgeBench.parseSuccessRate} is below the ${threshold} readiness threshold.`
    );
  }

  const report: QReadinessGateReport = {
    generatedAt: new Date().toISOString(),
    threshold,
    ready: reasons.length === 0,
    release: await resolveReleaseMetadata(),
    reasons,
    sources: {
      modelComparisonGeneratedAt: modelComparison?.generatedAt,
      bridgeBenchGeneratedAt: bridgeBench?.generatedAt
    },
    q: {
      modelComparison: qComparison
        ? {
            parseSuccessRate: qComparison.parseSuccessRate,
            completedTaskCount: qComparison.completedTaskCount,
            taskCount: qComparison.taskCount,
            dominantFailureClass: dominantFailureClass(qComparison.tasks)
          }
        : undefined,
      bridgeBench: qBridgeBench
        ? {
            parseSuccessRate: qBridgeBench.parseSuccessRate,
            taskCount: qBridgeBench.taskCount,
            dominantFailureClass: dominantFailureClass(qBridgeBench.tasks)
          }
        : undefined
    },
    output: {
      jsonPath: path.join("docs", "wiki", "Q-Readiness-Gate.json"),
      markdownPath: path.join("docs", "wiki", "Q-Readiness-Gate.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Q readiness gate failed.");
  process.exitCode = 1;
});
