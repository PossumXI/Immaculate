import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  resolveReleaseMetadata,
  type HarnessReadinessSummary,
  type ReleaseMetadata
} from "./release-metadata.js";

type LiveMissionReadinessReceipt = {
  generatedAt?: string;
  readiness?: HarnessReadinessSummary;
};

type RoundtableRuntimeReceipt = {
  generatedAt?: string;
  benchmark?: {
    scenarioCount?: number;
    failedAssertions?: number;
    seedAcceptedCount?: number;
    mediationAcceptedCount?: number;
    executionBundlesP50?: number;
    executionReceiptsP50?: number;
  };
};

type TerminalBenchPublicTaskReceipt = {
  generatedAt?: string;
  harbor?: {
    taskName?: string;
    trials?: number;
    errors?: number;
    meanReward?: number;
    passAtK?: Record<string, number>;
  };
  leaderboardStatus?: {
    status?: string;
    requiredUniqueTasks?: number;
    eligibleSubmissionActive?: boolean;
    note?: string;
  };
};

type HarborTerminalBenchReceipt = {
  generatedAt?: string;
  gatewayModel?: string;
  tasks?: Array<{
    label?: string;
    referenceVisibleToAgent?: boolean;
    qGateway?: {
      score?: number;
    };
  }>;
};

type ArobiLiveLedgerReceipt = {
  generatedAt?: string;
  liveNode?: {
    version?: string;
    height?: number;
    peerCount?: number;
    chainValid?: boolean;
    fabricSource?: string | null;
  };
  proof?: {
    liveRecordVisible?: boolean;
    publicEntryDelta?: number;
  };
};

type LiveOperatorActivityReceipt = {
  generatedAt?: string;
  publication?: {
    status?: "publishable" | "blocked";
    summary?: string;
  };
  agents?: Array<{
    label: string;
    status: "ready" | "blocked";
  }>;
  qPatrol?: {
    status?: "ready" | "blocked";
    summary?: string;
    recommendedLayerId?: string | null;
  };
  roundtable?: {
    status?: "ready" | "blocked";
    channelName?: string | null;
    sessionStatus?: string;
    actionReceiptCount?: number;
    summary?: string;
  };
  operator?: {
    status?: "ready" | "blocked";
    summary?: string;
  };
};

type LiveOperatorPublicExportReceipt = {
  generatedAt?: string;
  publication?: {
    status?: "publishable" | "blocked";
    summary?: string;
    target?: string;
  };
  showcase?: {
    title?: string | null;
    summary?: string | null;
    resultsReady?: boolean;
    publishTargets?: string[];
    activityFeed?: Array<{
      id?: string;
    }>;
  };
};

type ShowcaseSnippet = {
  label: string;
  status: "publishable" | "blocked";
  summary: string;
  sourcePath: string;
  generatedAt?: string;
};

type LiveMissionShowcaseReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  showcase: {
    status: "open" | "closed" | "closed_by_default";
    publicWindowRequested: boolean;
    publicWindowOpen: boolean;
    privateMissionLanePublished: false;
    summary: string;
  };
  readiness: HarnessReadinessSummary;
  publishableSnippets: ShowcaseSnippet[];
  truthBoundary: string[];
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const SHOWCASE_ALLOW_OPEN =
  process.env.IMMACULATE_PUBLIC_SHOWCASE_ALLOW_OPEN?.trim().toLowerCase() === "true";

function formatNumber(value: number | undefined, digits = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }
  return digits > 0 ? value.toFixed(digits) : String(value);
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function relativeWikiPath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function buildShowcaseStatus(
  readiness: HarnessReadinessSummary | undefined
): LiveMissionShowcaseReport["showcase"] {
  const missionReady = readiness?.missionSurfaceReady === true;
  const publicWindowOpen = missionReady && SHOWCASE_ALLOW_OPEN;
  return {
    status: publicWindowOpen ? "open" : missionReady ? "closed_by_default" : "closed",
    publicWindowRequested: SHOWCASE_ALLOW_OPEN,
    publicWindowOpen,
    privateMissionLanePublished: false,
    summary: publicWindowOpen
      ? "supervised public showcase is operator-open on safe snippets only; the private mission lane remains closed"
      : missionReady
        ? "shared readiness is green, but the supervised public showcase remains closed until an explicit operator opt-in is provided"
        : `supervised public showcase remains closed because ${readiness?.summary ?? "shared readiness is not yet proven"}`
  };
}

function buildRoundtableSnippet(
  receipt: RoundtableRuntimeReceipt | undefined,
  sourcePath: string
): ShowcaseSnippet {
  return {
    label: "Roundtable runtime",
    status:
      (receipt?.benchmark?.failedAssertions ?? Number.POSITIVE_INFINITY) === 0 ? "publishable" : "blocked",
    summary:
      typeof receipt?.benchmark?.scenarioCount === "number"
        ? `${receipt.benchmark.scenarioCount} scenarios, ${formatNumber(
            receipt.benchmark.failedAssertions
          )} failed assertions, ${formatNumber(
            receipt.benchmark.executionBundlesP50
          )} execution bundles P50, ${formatNumber(
            receipt.benchmark.executionReceiptsP50
          )} execution receipts P50, seed accepted ${formatNumber(
            receipt.benchmark.seedAcceptedCount
          )}/${formatNumber(receipt.benchmark.scenarioCount)}, mediation accepted ${formatNumber(
            receipt.benchmark.mediationAcceptedCount
          )}/${formatNumber(receipt.benchmark.scenarioCount)}`
        : "roundtable runtime receipt missing benchmark detail for this pass",
    sourcePath,
    generatedAt: receipt?.generatedAt
  };
}

function buildPublicTaskSnippet(
  receipt: TerminalBenchPublicTaskReceipt | undefined,
  sourcePath: string
): ShowcaseSnippet {
  const harbor = receipt?.harbor;
  const passAt = harbor?.passAtK ?? {};
  return {
    label: "Terminal-Bench public task",
    status: harbor?.errors === 0 ? "publishable" : "blocked",
    summary:
      typeof harbor?.trials === "number"
        ? `${harbor.taskName ?? "official public task"}: ${harbor.trials} trials, ${formatNumber(
            harbor.errors
          )} errors, mean reward ${formatNumber(harbor.meanReward, 3)}, pass@2 ${formatNumber(
            passAt["2"],
            3
          )}, pass@4 ${formatNumber(passAt["4"], 3)}, pass@5 ${formatNumber(
            passAt["5"],
            3
          )}; leaderboard eligibility remains ${receipt?.leaderboardStatus?.status ?? "unknown"}`
        : "public task receipt missing Harbor detail for this pass",
    sourcePath,
    generatedAt: receipt?.generatedAt
  };
}

function buildHarborSnippet(
  receipt: HarborTerminalBenchReceipt | undefined,
  sourcePath: string
): ShowcaseSnippet {
  const supervisedTasks =
    receipt?.tasks?.filter(
      (task) =>
        task.referenceVisibleToAgent === false &&
        typeof task.qGateway?.score === "number"
    ) ?? [];
  const summary =
    supervisedTasks.length > 0
      ? supervisedTasks
          .map((task) => `${task.label ?? "unknown"} ${formatNumber(task.qGateway?.score, 3)}`)
          .join(" | ")
      : "no supervised Harbor task scores were available";
  return {
    label: "Harbor supervised tasks",
    status: supervisedTasks.length > 0 ? "publishable" : "blocked",
    summary:
      supervisedTasks.length > 0
        ? `${supervisedTasks.length} repo-local supervised task(s) through ${
            receipt?.gatewayModel ?? "Q"
          }: ${summary}. These are supervised local receipts, not a public leaderboard claim.`
        : "Harbor supervised task receipt missing publishable local scores for this pass",
    sourcePath,
    generatedAt: receipt?.generatedAt
  };
}

function buildArobiSnippet(
  receipt: ArobiLiveLedgerReceipt | undefined,
  sourcePath: string
): ShowcaseSnippet {
  const publicDelta = receipt?.proof?.publicEntryDelta;
  const liveRecordVisible = receipt?.proof?.liveRecordVisible === true;
  return {
    label: "Arobi public-edge summary",
    status: "publishable",
    summary: `public node ${receipt?.liveNode?.version ?? "unknown"} on height ${formatNumber(
      receipt?.liveNode?.height
    )}, peers ${formatNumber(receipt?.liveNode?.peerCount)}, chain valid ${String(
      receipt?.liveNode?.chainValid ?? false
    )}, fabric source ${receipt?.liveNode?.fabricSource ?? "unknown"}, live record visible ${String(
      liveRecordVisible
    )}, latest supervised public delta ${formatNumber(
      publicDelta
    )}. This is a safe public-edge summary only; it does not expose private mission-lane payloads.`,
    sourcePath,
    generatedAt: receipt?.generatedAt
  };
}

function buildOperatorActivitySnippet(
  receipt: LiveOperatorPublicExportReceipt | undefined,
  sourcePath: string
): ShowcaseSnippet {
  const gateStatus = receipt?.publication?.status ?? "blocked";
  const activityItemCount = receipt?.showcase?.activityFeed?.length ?? 0;
  const publishTargets =
    receipt?.showcase?.publishTargets?.filter((entry) => entry.trim().length > 0) ?? [];
  return {
    label: "Discord and operator activity",
    status: receipt ? "publishable" : "blocked",
    summary: receipt
      ? `${receipt.showcase?.summary ?? "public-safe operator export generated"}; activity items \`${activityItemCount}\`; activity publication gate is \`${gateStatus}\`; targets ${publishTargets.length > 0 ? publishTargets.join(" | ") : "not declared"}; ${receipt.publication?.summary ?? "no publication summary recorded"}.`
      : "live operator activity receipt missing for this pass",
    sourcePath,
    generatedAt: receipt?.generatedAt
  };
}

function renderMarkdown(report: LiveMissionShowcaseReport): string {
  return [
    "# Supervised Mission Showcase",
    "",
    "This page is the public-safe showcase receipt for the current workstation. It keeps the showcase fail-closed by default, publishes only safe snippets/results, and keeps the private mission lane out of the public proof package.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    "",
    "## Showcase Gate",
    "",
    `- Status: \`${report.showcase.status}\``,
    `- Public window requested: \`${report.showcase.publicWindowRequested}\``,
    `- Public window open: \`${report.showcase.publicWindowOpen}\``,
    `- Private mission lane published: \`${report.showcase.privateMissionLanePublished}\``,
    `- Summary: ${report.showcase.summary}`,
    "",
    "## Shared Readiness",
    "",
    `- Mission-surface ready: \`${report.readiness.missionSurfaceReady}\``,
    `- Summary: ${report.readiness.summary}`,
    `- ledger.public: \`${report.readiness.ledger.public.status}\`${report.readiness.ledger.public.endpoint ? ` @ \`${report.readiness.ledger.public.endpoint}\`` : ""} | ${report.readiness.ledger.public.detail}`,
    `- ledger.private: \`${report.readiness.ledger.private.status}\`${report.readiness.ledger.private.endpoint ? ` @ \`${report.readiness.ledger.private.endpoint}\`` : ""} | ${report.readiness.ledger.private.detail}`,
    `- q.local: \`${report.readiness.q.local.status}\`${report.readiness.q.local.endpoint ? ` @ \`${report.readiness.q.local.endpoint}\`` : ""} | ${report.readiness.q.local.detail}`,
    `- q.oci: \`${report.readiness.q.oci.status}\`${report.readiness.q.oci.endpoint ? ` @ \`${report.readiness.q.oci.endpoint}\`` : ""} | ${report.readiness.q.oci.detail}`,
    `- discord.transport: \`${report.readiness.discord.transport.status}\`${report.readiness.discord.transport.endpoint ? ` @ \`${report.readiness.discord.transport.endpoint}\`` : ""} | ${report.readiness.discord.transport.detail}`,
    "",
    "## Publishable Snippets",
    "",
    ...report.publishableSnippets.flatMap((snippet) => [
      `### ${snippet.label}`,
      "",
      `- Status: \`${snippet.status}\``,
      `- Summary: ${snippet.summary}`,
      `- Source: \`${snippet.sourcePath}\` @ \`${snippet.generatedAt ?? "missing"}\``,
      ""
    ]),
    "## Truth Boundary",
    "",
    ...report.truthBoundary.map((entry) => `- ${entry}`)
  ].join("\n");
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const liveMissionReadinessPath = path.join(REPO_ROOT, "docs", "wiki", "Live-Mission-Readiness.json");
  const roundtableRuntimePath = path.join(REPO_ROOT, "docs", "wiki", "Roundtable-Runtime.json");
  const terminalBenchPublicTaskPath = path.join(
    REPO_ROOT,
    "docs",
    "wiki",
    "Terminal-Bench-Public-Task.json"
  );
  const harborTerminalBenchPath = path.join(REPO_ROOT, "docs", "wiki", "Harbor-Terminal-Bench.json");
  const arobiLiveLedgerPath = path.join(REPO_ROOT, "docs", "wiki", "Arobi-Live-Ledger-Receipt.json");
  const liveOperatorActivityPath = path.join(REPO_ROOT, "docs", "wiki", "Live-Operator-Public-Export.json");

  const [liveMissionReadiness, roundtableRuntime, terminalBenchPublicTask, harborTerminalBench, arobiLiveLedger, liveOperatorActivity] =
    await Promise.all([
      readJsonFile<LiveMissionReadinessReceipt>(liveMissionReadinessPath),
      readJsonFile<RoundtableRuntimeReceipt>(roundtableRuntimePath),
      readJsonFile<TerminalBenchPublicTaskReceipt>(terminalBenchPublicTaskPath),
      readJsonFile<HarborTerminalBenchReceipt>(harborTerminalBenchPath),
      readJsonFile<ArobiLiveLedgerReceipt>(arobiLiveLedgerPath),
      readJsonFile<LiveOperatorPublicExportReceipt>(liveOperatorActivityPath)
    ]);

  const readiness = liveMissionReadiness?.readiness ?? {
    ledger: {
      public: {
        status: "not_configured",
        configured: false,
        ready: false,
        detail: "live mission readiness receipt missing"
      },
      private: {
        status: "not_configured",
        configured: false,
        ready: false,
        detail: "live mission readiness receipt missing"
      }
    },
    q: {
      local: {
        status: "not_configured",
        configured: false,
        ready: false,
        detail: "live mission readiness receipt missing"
      },
      oci: {
        status: "not_configured",
        configured: false,
        ready: false,
        detail: "live mission readiness receipt missing"
      }
    },
    discord: {
      transport: {
        status: "not_configured",
        configured: false,
        ready: false,
        detail: "live mission readiness receipt missing"
      }
    },
    missionSurfaceReady: false,
    summary: "live mission readiness receipt missing"
  } satisfies HarnessReadinessSummary;

  const report: LiveMissionShowcaseReport = {
    generatedAt: new Date().toISOString(),
    release,
    showcase: buildShowcaseStatus(readiness),
    readiness,
    publishableSnippets: [
      buildRoundtableSnippet(roundtableRuntime, relativeWikiPath(roundtableRuntimePath)),
      buildPublicTaskSnippet(
        terminalBenchPublicTask,
        relativeWikiPath(terminalBenchPublicTaskPath)
      ),
      buildHarborSnippet(harborTerminalBench, relativeWikiPath(harborTerminalBenchPath)),
      buildArobiSnippet(arobiLiveLedger, relativeWikiPath(arobiLiveLedgerPath)),
      buildOperatorActivitySnippet(
        liveOperatorActivity,
        relativeWikiPath(liveOperatorActivityPath)
      )
    ],
    truthBoundary: [
      "This page is a supervised showcase receipt, not proof that a live Discord operator command or a live 16-subsystem mission was executed on this pass.",
      "The public showcase remains fail-closed by default until the shared mission gate is green and an explicit operator opt-in opens the window.",
      "The private mission lane remains closed here even when safe public snippets are publishable.",
      "The Arobi summary here is limited to safe public-edge status and rerun-delta context; it does not expose raw private payloads, private ledger internals, or chain-of-thought.",
      "The Harbor and Terminal-Bench snippets are supervised receipts, not an official public leaderboard submission beyond the explicit public-task receipt.",
      "This page does not prove a fresh live public Arobi write or a fresh live OCI provider probe unless those claims appear on their own dedicated machine-stamped surfaces."
    ],
    output: {
      jsonPath: path.join("docs", "wiki", "Supervised-Mission-Showcase.json"),
      markdownPath: path.join("docs", "wiki", "Supervised-Mission-Showcase.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Supervised mission showcase generation failed.");
  process.exitCode = 1;
});
