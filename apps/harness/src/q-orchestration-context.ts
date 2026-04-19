import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PhaseSnapshot } from "@immaculate/core";
import {
  getArobiNetworkName,
  getArobiOperatingModelSummary,
  getImmaculateHarnessName,
  getQDeveloperName,
  getQFoundationModelName,
  getQIdentityInstruction,
  getQIdentitySummary,
  getQImmaculateRelationshipSummary,
  getQLeadName,
  getQModelName
} from "./q-model.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";
import { sha256Json } from "./utils.js";

type QReadinessGateFile = {
  generatedAt?: string;
  ready?: boolean;
  q?: {
    modelComparison?: {
      parseSuccessRate?: number;
    };
    bridgeBench?: {
      parseSuccessRate?: number;
    };
  };
};

type QGatewaySubstrateFile = {
  generatedAt?: string;
  benchmark?: {
    suiteId?: string;
    failedAssertions?: number;
    structuredFieldsP50?: number;
    guardDenialsMax?: number;
  };
};

type QMediationDriftFile = {
  generatedAt?: string;
  benchmark?: {
    suiteId?: string;
    failedAssertions?: number;
    routeAlignmentP50?: number;
    driftDetectedMax?: number;
  };
};

type CloudflareQInferenceFile = {
  generatedAt?: string;
  summary?: {
    ready?: boolean;
    status?: string;
    recommendedNextStep?: string;
  };
};

type HarborTerminalBenchFile = {
  generatedAt?: string;
  tasks?: Array<{
    id?: string;
    qGateway?: {
      score?: number;
    };
  }>;
};

type QFailureCorpusFile = {
  generatedAt?: string;
  evalSeedCount?: number;
  failureClassCounts?: Record<string, number>;
};

export type QOrchestrationContext = {
  generatedAt: string;
  modelName: string;
  foundationModel: string;
  developer: string;
  lead: string;
  network: string;
  harness: string;
  identitySummary: string;
  identityInstruction: string;
  networkSummary: string;
  relationshipSummary: string;
  developerSummary: string;
  leadershipSummary: string;
  networkDirective: string;
  harnessDirective: string;
  orchestrationDoctrine: string;
  operatorDisciplineSummary: string;
  reasoningDirective: string;
  mediationDiagnosticSummary: string;
  mediationDiagnosticSignals: string[];
  knownWeaknesses: string[];
  failureClassHints: string[];
  evidenceIds: string[];
  evidenceDigest: string;
  contextFingerprint: string;
  trainingBundleId?: string;
  readinessGeneratedAt?: string;
  readinessReady: boolean;
  gatewaySubstrateGeneratedAt?: string;
  gatewaySubstrateSuiteId?: string;
  gatewaySubstrateHealthy: boolean;
  cloudLaneReady: boolean;
  cloudLaneStatus: string;
  blockedLanes: string[];
  qRoutingDirective: "primary-governed-local" | "guarded-hold";
  preferredExecutionLane: "local-q";
  groundedFacts: string[];
  summaryLine: string;
};

type ResolveQOrchestrationContextOptions = {
  snapshot?: PhaseSnapshot;
  objective?: string;
  context?: string;
  release?: ReleaseMetadata;
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function truncate(value: string, maxLength = 120): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function collectContextGroundingFacts(options: {
  release: ReleaseMetadata;
  readiness?: QReadinessGateFile;
  substrate?: QGatewaySubstrateFile;
  mediation?: QMediationDriftFile;
  cloud?: CloudflareQInferenceFile;
  snapshot?: PhaseSnapshot;
  objective?: string;
  context?: string;
}): string[] {
  const facts: string[] = [];
  const add = (fact: string | undefined, condition = true) => {
    if (condition && fact && !facts.includes(fact)) {
      facts.push(fact);
    }
  };

  add(`Q model name ${getQModelName()}`);
  add(`Q built on ${getQFoundationModelName()}`);
  add(`Q developed by ${getQDeveloperName()}`);
  add(`Q led by ${getQLeadName()}`);
  add(`${getArobiNetworkName()} anchors requests decisions evidence and outcomes`);
  add(`${getImmaculateHarnessName()} governs Q`);
  add(`${getImmaculateHarnessName()} should prefer the local governed Q lane when it is healthy`);
  add(`training bundle ${options.release.q.trainingLock?.bundleId ?? "unknown"}`);
  add(
    `readiness gate ${options.readiness?.ready ? "ready" : "not ready"}`,
    options.readiness !== undefined
  );
  add(
    `gateway substrate ${options.substrate?.benchmark?.failedAssertions === 0 ? "verified" : "degraded"}`,
    options.substrate !== undefined
  );
  add(
    `mediation drift ${options.mediation?.benchmark?.failedAssertions === 0 ? "verified" : "degraded"}`,
    options.mediation !== undefined
  );
  add(
    `cloud Q lane ${options.cloud?.summary?.ready ? "ready" : "blocked"}`,
    options.cloud !== undefined
  );
  add(
    `cloud status ${truncate(options.cloud?.summary?.status ?? "", 48)}`,
    Boolean(options.cloud?.summary?.status) && !options.cloud?.summary?.ready
  );
  add(
    "prefer local governed Q execution unless the cloud Q lane is explicitly ready",
    !options.cloud?.summary?.ready
  );
  add(
    `current phase status ${options.snapshot?.status}`,
    Boolean(options.snapshot?.status)
  );
  add(
    `objective ${truncate(options.objective ?? "", 72)}`,
    Boolean(options.objective?.trim())
  );
  add(
    `context ${truncate(options.context ?? "", 72)}`,
    Boolean(options.context?.trim())
  );

  return facts.slice(0, 8);
}

export async function resolveQOrchestrationContext(
  options: ResolveQOrchestrationContextOptions = {}
): Promise<QOrchestrationContext> {
  const release = options.release ?? (await resolveReleaseMetadata());
  const [readiness, substrate, mediation, cloud, harbor, failureCorpus] = await Promise.all([
    readJsonFile<QReadinessGateFile>(path.join(WIKI_ROOT, "Q-Readiness-Gate.json")),
    readJsonFile<QGatewaySubstrateFile>(path.join(WIKI_ROOT, "Q-Gateway-Substrate.json")),
    readJsonFile<QMediationDriftFile>(path.join(WIKI_ROOT, "Q-Mediation-Drift.json")),
    readJsonFile<CloudflareQInferenceFile>(path.join(WIKI_ROOT, "Cloudflare-Q-Inference.json")),
    readJsonFile<HarborTerminalBenchFile>(path.join(WIKI_ROOT, "Harbor-Terminal-Bench.json")),
    readJsonFile<QFailureCorpusFile>(path.join(WIKI_ROOT, "Q-Failure-Corpus.json"))
  ]);

  const blockedLanes: string[] = [];
  if (!cloud?.summary?.ready) {
    blockedLanes.push("cloud-q");
  }
  const readinessReady = Boolean(readiness?.ready);
  const gatewaySubstrateHealthy = (substrate?.benchmark?.failedAssertions ?? 1) === 0;
  const qRoutingDirective: QOrchestrationContext["qRoutingDirective"] =
    readinessReady && gatewaySubstrateHealthy ? "primary-governed-local" : "guarded-hold";
  const mediationDiagnosticSignals = [
    `readiness=${readinessReady ? "ready" : "not-ready"}`,
    `substrate=${gatewaySubstrateHealthy ? "healthy" : "degraded"}`,
    `cloud=${cloud?.summary?.ready ? "ready" : "blocked"}`,
    `directive=${qRoutingDirective}`
  ];
  const mediationDiagnosticSummary =
    qRoutingDirective === "primary-governed-local"
      ? cloud?.summary?.ready
        ? "Q should stay primary because the local governed lane is healthy and cloud Q is also ready."
        : "Q should stay primary because the local governed lane is healthy while cloud Q is blocked."
      : "Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition.";

  const harborStructuredScore =
    harbor?.tasks?.find((task) => task.id === "q-structured-contract")?.qGateway?.score;
  const harborBridgeScore =
    harbor?.tasks?.find((task) => task.id === "immaculate-bridge-fail-closed")?.qGateway?.score;
  const failureClassCounts = failureCorpus?.failureClassCounts ?? {};
  const knownWeaknesses = [
    ...(typeof harborStructuredScore === "number" && harborStructuredScore < 1
      ? ["Q still needs tighter operator wording and grounding on the Harbor structured-contract lane."]
      : []),
    ...(typeof harborBridgeScore === "number" && harborBridgeScore < 1
      ? ["Q still needs cleaner fail-closed bridge reasoning under governed Harbor pressure."]
      : []),
    ...(Number(mediation?.benchmark?.failedAssertions ?? 0) > 0
      ? ["Immaculate must follow Q's governed route under mixed pressure without mediation drift."]
      : []),
    ...(Number(failureClassCounts.harbor_structured_underperforming ?? 0) > 0
      ? ["Do not restamp Harbor underperformance as success; keep the miss explicit and reusable."]
      : []),
    ...(Number(failureClassCounts.terminal_bench_public_task_underperforming ?? 0) > 0
      ? ["Public coding-task misses should feed the repair loop as bounded decomposition work, not be restamped as solved."]
      : []),
    ...(Number(failureClassCounts.transport_timeout ?? 0) > 0
      ? ["Prefer bounded operator-grade answers that finish cleanly instead of drifting into timeout territory."]
      : []),
    ...(Number(failureClassCounts.missing_prompt ?? 0) > 0
      ? ["When context is missing, say which signal is missing instead of inventing a route."]
      : []),
    ...(Number(failureClassCounts.prompt_too_large ?? 0) > 0
      ? ["When context is large, keep route, reason, and commit compact and decisive."]
      : [])
  ].slice(0, 4);
  const failureClassHints = Object.entries(failureClassCounts)
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .map(([failureClass]) => failureClass)
    .slice(0, 4);
  const operatorDisciplineSummary =
    knownWeaknesses[0] ??
    "Q is currently meeting the tracked structured contract, but it should still keep route, reason, and commit wording terse, grounded, and operator-grade.";
  const reasoningDirective = [
    "Answer as Q inside Immaculate.",
    "Keep route, reason, and commit grounded in explicit runtime facts.",
    "Prefer the healthy local governed Q lane when it is ready.",
    "Do not claim blocked cloud capability or upgrade underperformance into success."
  ].join(" ");

  const groundedFacts = collectContextGroundingFacts({
    release,
    readiness,
    substrate,
    mediation,
    cloud,
    snapshot: options.snapshot,
    objective: options.objective,
    context: options.context
  });
  const evidenceIds = [
    readiness?.generatedAt ? "surface:q-readiness-gate" : undefined,
    substrate?.generatedAt ? "surface:q-gateway-substrate" : undefined,
    mediation?.generatedAt ? "surface:q-mediation-drift" : undefined,
    cloud?.generatedAt ? "surface:cloudflare-q-inference" : undefined,
    harbor?.generatedAt ? "surface:harbor-terminal-bench" : undefined,
    failureCorpus?.generatedAt ? "surface:q-failure-corpus" : undefined
  ].filter((entry): entry is string => Boolean(entry));
  const contextFingerprint = sha256Json({
    release: release.buildId,
    trainingBundleId: release.q.trainingLock?.bundleId,
    readinessReady,
    gatewaySubstrateHealthy,
    cloudLaneReady: Boolean(cloud?.summary?.ready),
    qRoutingDirective,
    groundedFacts,
    failureClassHints
  });
  const evidenceDigest = sha256Json({
    evidenceIds,
    groundedFacts,
    failureClassHints,
    knownWeaknesses
  });

  return {
    generatedAt: new Date().toISOString(),
    modelName: getQModelName(),
    foundationModel: getQFoundationModelName(),
    developer: getQDeveloperName(),
    lead: getQLeadName(),
    network: getArobiNetworkName(),
    harness: getImmaculateHarnessName(),
    identitySummary: getQIdentitySummary(),
    identityInstruction: getQIdentityInstruction(),
    networkSummary: getArobiOperatingModelSummary(),
    relationshipSummary: getQImmaculateRelationshipSummary(),
    developerSummary: `${getQModelName()} was developed by ${getQDeveloperName()}.`,
    leadershipSummary: `${getQLeadName()} is the founder, CEO, lead architect, and lead engineer for ${getQModelName()}.`,
    networkDirective: `${getArobiNetworkName()} should preserve the reviewable record of requests, decisions, evidence, and outcomes without exposing hidden chain-of-thought.`,
    harnessDirective: `${getImmaculateHarnessName()} should perceive ${getQModelName()} as its primary governed reasoning model, keep public identity fixed to Q, and anchor governed execution into ${getArobiNetworkName()}.`,
    orchestrationDoctrine: `${getImmaculateHarnessName()} should route context into ${getQModelName()}, enforce policy and arbitration around it, preserve durable receipts, and anchor the final request, decision, evidence, and outcome into ${getArobiNetworkName()} before any blocked cloud lane is treated as a substitute for the healthy local Q lane.`,
    operatorDisciplineSummary,
    reasoningDirective,
    mediationDiagnosticSummary,
    mediationDiagnosticSignals,
    knownWeaknesses,
    failureClassHints,
    evidenceIds,
    evidenceDigest,
    contextFingerprint,
    trainingBundleId: release.q.trainingLock?.bundleId,
    readinessGeneratedAt: readiness?.generatedAt,
    readinessReady,
    gatewaySubstrateGeneratedAt: substrate?.generatedAt,
    gatewaySubstrateSuiteId: substrate?.benchmark?.suiteId,
    gatewaySubstrateHealthy,
    cloudLaneReady: Boolean(cloud?.summary?.ready),
    cloudLaneStatus: cloud?.summary?.status?.trim() || "unknown",
    blockedLanes,
    qRoutingDirective,
    preferredExecutionLane: "local-q",
    groundedFacts,
    summaryLine: `${getArobiNetworkName()} is the reviewable ledger and operator network, ${getImmaculateHarnessName()} is the governed harness, and ${getQModelName()} is the only public model identity and reasoning brain. Keep reasoning on the healthy local Q lane, obey the ${qRoutingDirective} directive, stay bound to ${release.q.trainingLock?.bundleId ?? "the current tracked bundle"}, treat cloud Q as ${cloud?.summary?.ready ? "ready" : "not ready"}, and preserve operator-grade grounding on the Harbor and failure-corpus seams.`
  };
}
