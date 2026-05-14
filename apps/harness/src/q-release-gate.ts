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

export type QGatewayValidationReport = {
  generatedAt: string;
  identity?: {
    canonical?: boolean;
  };
  checks?: {
    health?: { status?: number };
    unauthorizedChat?: { status?: number };
    info?: { status?: number };
    models?: { status?: number };
    authorizedChat?: {
      status?: number;
      body?: {
        error?: string;
        failureClass?: string;
        message?: string;
      };
    };
    identityChat?: { status?: number };
    concurrentRejection?: { status?: number };
  };
  localQFoundationRun?: {
    failureClass?: string;
  };
};

export type QGatewayContractSummary = {
  healthStatus?: number;
  unauthorizedChatStatus?: number;
  infoStatus?: number;
  modelsStatus?: number;
  authorizedChatStatus?: number;
  identityChatStatus?: number;
  concurrentRejectionStatus?: number;
  authorizedChatFailureClass?: string;
  localQFailureClass?: string;
  ready: boolean;
};

export type QReadinessGateReport = {
  generatedAt: string;
  threshold: number;
  ready: boolean;
  release: ReleaseMetadata;
  reasons: string[];
  sources: {
    modelComparisonGeneratedAt?: string;
    bridgeBenchGeneratedAt?: string;
    qGatewayValidationGeneratedAt?: string;
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
    gatewayIdentityCanonical?: boolean;
    gatewayContract?: QGatewayContractSummary;
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

export type QReadinessGateWriteResult = {
  published: boolean;
  jsonPath: string;
  markdownPath: string;
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
export const DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_Q_READINESS_MODEL_COMPARISON_MAX_SOURCE_AGE_MS = 10 * 24 * 60 * 60 * 1000;

export type QReadinessSourceAgeBudgets = {
  modelComparisonMs: number;
  bridgeBenchMs: number;
  qGatewayValidationMs: number;
};

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

function generatedAtTime(value: { generatedAt?: string } | undefined): number {
  const parsed = Date.parse(value?.generatedAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQReadinessMaxSourceAgeMs(value: string | undefined): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.max(60_000, Math.round(parsed));
}

export function resolveQReadinessMaxSourceAgeMs(
  value: string | undefined,
  fallbackMs = DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS
): number {
  return parseQReadinessMaxSourceAgeMs(value) ?? fallbackMs;
}

export function resolveQReadinessSourceAgeBudgets(
  env: Record<string, string | undefined> = process.env
): QReadinessSourceAgeBudgets {
  const sharedOverrideMs = parseQReadinessMaxSourceAgeMs(
    env.IMMACULATE_Q_READINESS_MAX_SOURCE_AGE_MS
  );
  const sharedMs = sharedOverrideMs ?? DEFAULT_Q_READINESS_MAX_SOURCE_AGE_MS;

  return {
    modelComparisonMs:
      parseQReadinessMaxSourceAgeMs(
        env.IMMACULATE_Q_READINESS_MODEL_COMPARISON_MAX_SOURCE_AGE_MS
      ) ??
      sharedOverrideMs ??
      DEFAULT_Q_READINESS_MODEL_COMPARISON_MAX_SOURCE_AGE_MS,
    bridgeBenchMs:
      parseQReadinessMaxSourceAgeMs(env.IMMACULATE_Q_READINESS_BRIDGEBENCH_MAX_SOURCE_AGE_MS) ??
      sharedMs,
    qGatewayValidationMs:
      parseQReadinessMaxSourceAgeMs(env.IMMACULATE_Q_READINESS_GATEWAY_MAX_SOURCE_AGE_MS) ??
      sharedMs
  };
}

export function describeSourceFreshnessReason(options: {
  label: string;
  generatedAt?: string;
  nowMs: number;
  maxAgeMs: number;
}): string | undefined {
  const generatedAtMs = Date.parse(options.generatedAt ?? "");
  if (!Number.isFinite(generatedAtMs)) {
    return `${options.label} source is missing a valid generatedAt timestamp.`;
  }
  const ageMs = Math.max(0, options.nowMs - generatedAtMs);
  if (ageMs <= options.maxAgeMs) {
    return undefined;
  }
  const ageHours = Number((ageMs / 3_600_000).toFixed(1));
  const maxAgeHours = Number((options.maxAgeMs / 3_600_000).toFixed(1));
  return `${options.label} source is stale at ${ageHours} hours old; max allowed age is ${maxAgeHours} hours.`;
}

export function selectLatestQGatewayValidationReport(options: {
  tracked?: QGatewayValidationReport;
  runtimeFailure?: QGatewayValidationReport;
}): QGatewayValidationReport | undefined {
  if (
    options.runtimeFailure &&
    generatedAtTime(options.runtimeFailure) >= generatedAtTime(options.tracked)
  ) {
    return options.runtimeFailure;
  }
  return options.tracked;
}

function renderMarkdown(report: QReadinessGateReport): string {
  return [
    "# Q Readiness Gate",
    "",
    "This page is generated from the tracked direct-Q and gateway report surfaces. It fails closed when the model benchmarks pass but the live gateway contract cannot complete authenticated chat.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Ready: \`${report.ready}\``,
    `- Threshold: \`${report.threshold}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``,
    `- Model comparison source: \`${report.sources.modelComparisonGeneratedAt ?? "missing"}\``,
    `- BridgeBench source: \`${report.sources.bridgeBenchGeneratedAt ?? "missing"}\``,
    `- Q gateway validation source: \`${report.sources.qGatewayValidationGeneratedAt ?? "missing"}\``,
    "",
    "## Q Direct Results",
    "",
    `- Model comparison parse success: \`${report.q.modelComparison?.parseSuccessRate ?? "n/a"}\``,
    `- Model comparison completed tasks: \`${report.q.modelComparison?.completedTaskCount ?? "n/a"}/${report.q.modelComparison?.taskCount ?? "n/a"}\``,
    `- Model comparison dominant failure: \`${report.q.modelComparison?.dominantFailureClass ?? "none"}\``,
    `- BridgeBench parse success: \`${report.q.bridgeBench?.parseSuccessRate ?? "n/a"}\``,
    `- BridgeBench dominant failure: \`${report.q.bridgeBench?.dominantFailureClass ?? "none"}\``,
    `- Q gateway identity canonical: \`${report.q.gatewayIdentityCanonical ?? "n/a"}\``,
    `- Q gateway contract ready: \`${report.q.gatewayContract?.ready ?? "n/a"}\``,
    `- Q gateway authenticated chat status: \`${report.q.gatewayContract?.authorizedChatStatus ?? "n/a"}\``,
    `- Q gateway authenticated chat failure: \`${report.q.gatewayContract?.authorizedChatFailureClass ?? "none"}\``,
    `- Direct local Q failure: \`${report.q.gatewayContract?.localQFailureClass ?? "none"}\``,
    "",
    "## Reasons",
    "",
    ...report.reasons.map((reason) => `- ${reason}`)
  ].join("\n");
}

export async function writeQReadinessGateReport(
  report: QReadinessGateReport,
  options: {
    repoRoot?: string;
    runtimeDir: string;
  }
): Promise<QReadinessGateWriteResult> {
  if (report.ready) {
    const repoRoot = options.repoRoot ?? REPO_ROOT;
    const jsonPath = path.join(repoRoot, report.output.jsonPath);
    const markdownPath = path.join(repoRoot, report.output.markdownPath);
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(markdownPath, `${renderMarkdown(report)}\n`, "utf8");
    return {
      published: true,
      jsonPath,
      markdownPath
    };
  }

  const failureRoot = path.join(options.runtimeDir, "q-readiness-gate");
  const jsonPath = path.join(failureRoot, "latest-failed.json");
  const markdownPath = path.join(failureRoot, "latest-failed.md");
  await mkdir(failureRoot, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${renderMarkdown(report)}\n`, "utf8");
  return {
    published: false,
    jsonPath,
    markdownPath
  };
}

export function summarizeQGatewayContract(
  report: QGatewayValidationReport | undefined
): QGatewayContractSummary {
  const summary: QGatewayContractSummary = {
    healthStatus: report?.checks?.health?.status,
    unauthorizedChatStatus: report?.checks?.unauthorizedChat?.status,
    infoStatus: report?.checks?.info?.status,
    modelsStatus: report?.checks?.models?.status,
    authorizedChatStatus: report?.checks?.authorizedChat?.status,
    identityChatStatus: report?.checks?.identityChat?.status,
    concurrentRejectionStatus: report?.checks?.concurrentRejection?.status,
    authorizedChatFailureClass:
      report?.checks?.authorizedChat?.body?.failureClass ??
      report?.checks?.authorizedChat?.body?.error,
    localQFailureClass: report?.localQFoundationRun?.failureClass,
    ready: false
  };
  summary.ready =
    summary.healthStatus === 200 &&
    summary.unauthorizedChatStatus === 401 &&
    summary.infoStatus === 200 &&
    summary.modelsStatus === 200 &&
    summary.authorizedChatStatus === 200 &&
    summary.identityChatStatus === 200 &&
    summary.concurrentRejectionStatus === 429 &&
    report?.identity?.canonical === true &&
    !summary.authorizedChatFailureClass &&
    !summary.localQFailureClass;
  return summary;
}

export function describeQGatewayContractReasons(
  summary: QGatewayContractSummary,
  canonicalIdentity: boolean
): string[] {
  const reasons: string[] = [];
  const expectedStatuses: Array<[string, number | undefined, number]> = [
    ["Q gateway /health", summary.healthStatus, 200],
    ["Q gateway unauthorized chat guard", summary.unauthorizedChatStatus, 401],
    ["Q gateway /api/q/info", summary.infoStatus, 200],
    ["Q gateway /v1/models", summary.modelsStatus, 200],
    ["Q gateway authenticated chat", summary.authorizedChatStatus, 200],
    ["Q gateway identity smoke", summary.identityChatStatus, 200],
    ["Q gateway concurrent rejection", summary.concurrentRejectionStatus, 429]
  ];
  for (const [label, actual, expected] of expectedStatuses) {
    if (actual !== expected) {
      reasons.push(`${label} returned ${actual ?? "missing"} instead of ${expected}.`);
    }
  }
  if (!canonicalIdentity) {
    reasons.push("Q gateway identity validation is missing or not canonical.");
  }
  if (summary.authorizedChatFailureClass) {
    reasons.push(`Q gateway authenticated chat failed with ${summary.authorizedChatFailureClass}.`);
  }
  if (summary.localQFailureClass) {
    reasons.push(`Direct local Q foundation call failed with ${summary.localQFailureClass}.`);
  }
  return reasons;
}

async function main(): Promise<void> {
  const threshold = Number(process.env.IMMACULATE_Q_READINESS_THRESHOLD ?? 0.75);
  const sourceAgeBudgets = resolveQReadinessSourceAgeBudgets();
  const nowMs = Date.now();
  const comparisonPath = path.join(WIKI_ROOT, "Model-Benchmark-Comparison.json");
  const bridgeBenchPath = path.join(WIKI_ROOT, "BridgeBench.json");
  const qGatewayValidationPath = path.join(WIKI_ROOT, "Q-Gateway-Validation.json");
  const runtimeDir = process.env.IMMACULATE_RUNTIME_DIR?.trim()
    ? path.resolve(process.env.IMMACULATE_RUNTIME_DIR)
    : path.join(REPO_ROOT, ".runtime");
  const modelComparison = await readJson<ModelComparisonReport>(comparisonPath);
  const bridgeBench = await readJson<BridgeBenchReport>(bridgeBenchPath);
  const trackedQGatewayValidation = await readJson<QGatewayValidationReport>(qGatewayValidationPath);
  const runtimeQGatewayFailure = await readJson<QGatewayValidationReport>(
    path.join(runtimeDir, "q-gateway-validation", "latest-failed.json")
  );
  const qGatewayValidation = selectLatestQGatewayValidationReport({
    tracked: trackedQGatewayValidation,
    runtimeFailure: runtimeQGatewayFailure
  });

  const qComparison = modelComparison?.models.find((model) => model.truthfulLabel.trim().startsWith("Q"));
  const qBridgeBench = bridgeBench?.models.find((model) => model.truthfulLabel.trim().startsWith("Q"));

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
  for (const reason of [
    describeSourceFreshnessReason({
      label: "Model comparison",
      generatedAt: modelComparison?.generatedAt,
      nowMs,
      maxAgeMs: sourceAgeBudgets.modelComparisonMs
    }),
    describeSourceFreshnessReason({
      label: "BridgeBench",
      generatedAt: bridgeBench?.generatedAt,
      nowMs,
      maxAgeMs: sourceAgeBudgets.bridgeBenchMs
    }),
    describeSourceFreshnessReason({
      label: "Q gateway validation",
      generatedAt: qGatewayValidation?.generatedAt,
      nowMs,
      maxAgeMs: sourceAgeBudgets.qGatewayValidationMs
    })
  ]) {
    if (reason) {
      reasons.push(reason);
    }
  }
  const gatewayContract = summarizeQGatewayContract(qGatewayValidation);
  reasons.push(
    ...describeQGatewayContractReasons(
      gatewayContract,
      qGatewayValidation?.identity?.canonical === true
    )
  );

  const report: QReadinessGateReport = {
    generatedAt: new Date().toISOString(),
    threshold,
    ready: reasons.length === 0,
    release: await resolveReleaseMetadata(),
    reasons,
    sources: {
      modelComparisonGeneratedAt: modelComparison?.generatedAt,
      bridgeBenchGeneratedAt: bridgeBench?.generatedAt,
      qGatewayValidationGeneratedAt: qGatewayValidation?.generatedAt
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
        : undefined,
      gatewayIdentityCanonical: qGatewayValidation?.identity?.canonical === true,
      gatewayContract
    },
    output: {
      jsonPath: path.join("docs", "wiki", "Q-Readiness-Gate.json"),
      markdownPath: path.join("docs", "wiki", "Q-Readiness-Gate.md")
    }
  };

  const writeResult = await writeQReadinessGateReport(report, {
    repoRoot: REPO_ROOT,
    runtimeDir
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ...report,
        persistedOutput: writeResult
      },
      null,
      2
    )}\n`
  );
  if (!report.ready) {
    process.stderr.write(`Q readiness gate failed. Failure evidence: ${writeResult.jsonPath}\n`);
    process.exitCode = 1;
  }
}

const isDirectExecution =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Q readiness gate failed."}\n`);
    process.exitCode = 1;
  });
}
