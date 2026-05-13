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

type LiveOperatorActivityReceipt = {
  generatedAt?: string;
  publication?: {
    status?: "publishable" | "blocked";
    summary?: string;
  };
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
  agents?: Array<{
    label?: string;
    updatedAt?: string;
    status?: "ready" | "blocked";
    summary?: string;
  }>;
  operator?: {
    status?: "ready" | "blocked";
    summary?: string;
  };
};

type ArobiLiveLedgerReceipt = {
  generatedAt?: string;
  liveNode?: {
    version?: string;
    height?: number;
    totalEntries?: number;
    chainValid?: boolean;
    fabricSource?: string;
  };
  proof?: {
    publicEntryDelta?: number;
  };
};

type PublicShowcaseActivityEntry = {
  id: string;
  timestamp: string | null;
  title: string;
  summary: string | null;
  kind: string | null;
  status: string | null;
  source: string | null;
  subsystems: string[];
  artifacts: string[];
  tags: string[];
};

type PublicShowcaseStatus = {
  active: boolean;
  mode: "inactive" | "derived" | "controlled";
  title: string | null;
  summary: string | null;
  expiresAt: string | null;
  windowLabel: string | null;
  publishTargets: string[];
  resultsReady: boolean;
  fleetLabel: string | null;
  subsystemCount: number | null;
  onlineSubsystemCount: number | null;
  degradedSubsystemCount: number | null;
  offlineSubsystemCount: number | null;
  unconfiguredSubsystemCount: number | null;
  networkVersion: string | null;
  verifiedLedgerEntries: number | null;
  publicHeight: number | null;
  orchestrationProfile: string | null;
  qAuthMode: string | null;
  lastChecked: string | null;
  activityFeed: PublicShowcaseActivityEntry[];
};

type PublicExportSourceFreshnessEntry = {
  label: string;
  path: string;
  generatedAt?: string;
  ageMs?: number;
  status: "fresh" | "stale" | "missing" | "invalid";
  detail: string;
};

type PublicExportSourceFreshness = {
  maxAgeMs: number;
  allFresh: boolean;
  summary: string;
  sources: PublicExportSourceFreshnessEntry[];
};

type LiveOperatorPublicExportReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  contract: {
    target: "fabric.showcase";
    version: 1;
    summary: string;
  };
  publication: {
    status: "publishable" | "blocked";
    summary: string;
    target: string;
  };
  sourceFreshness: PublicExportSourceFreshness;
  showcase: PublicShowcaseStatus;
  truthBoundary: string[];
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_ROOT, "../../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const DEFAULT_SOURCE_FRESHNESS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PUBLISH_TARGETS = [
  "aura-genesis.org/status (public-safe aggregate only)",
  "iorch.net (results only)",
  "qline.site (results only; not published from this repo)"
];

function resolveSourceFreshnessMaxAgeMs(): number {
  const configured = Number(process.env.IMMACULATE_PUBLIC_EXPORT_SOURCE_MAX_AGE_MS);
  if (Number.isFinite(configured) && configured >= 5 * 60 * 1000) {
    return configured;
  }
  return DEFAULT_SOURCE_FRESHNESS_MAX_AGE_MS;
}

function relativeWikiPath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function resolveDefaultReadiness(): HarnessReadinessSummary {
  return {
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
  };
}

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
  return `${Math.round(value / 86_400_000)}d`;
}

export function evaluatePublicExportSourceFreshness(
  sources: Array<{
    label: string;
    path: string;
    generatedAt?: string;
  }>,
  options?: {
    nowMs?: number;
    maxAgeMs?: number;
  }
): PublicExportSourceFreshness {
  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_SOURCE_FRESHNESS_MAX_AGE_MS;
  const entries = sources.map((source): PublicExportSourceFreshnessEntry => {
    const parsed = parseIsoMs(source.generatedAt);
    if (!source.generatedAt) {
      return {
        label: source.label,
        path: source.path,
        status: "missing",
        detail: "source timestamp missing"
      };
    }
    if (parsed === undefined) {
      return {
        label: source.label,
        path: source.path,
        generatedAt: source.generatedAt,
        status: "invalid",
        detail: "source timestamp is not valid ISO time"
      };
    }
    const ageMs = Math.max(0, nowMs - parsed);
    const status = ageMs <= maxAgeMs ? "fresh" : "stale";
    return {
      label: source.label,
      path: source.path,
      generatedAt: source.generatedAt,
      ageMs,
      status,
      detail:
        status === "fresh"
          ? `fresh (${formatDurationMs(ageMs)} old, budget ${formatDurationMs(maxAgeMs)})`
          : `stale (${formatDurationMs(ageMs)} old, budget ${formatDurationMs(maxAgeMs)})`
    };
  });
  const staleOrMissing = entries.filter((entry) => entry.status !== "fresh");
  return {
    maxAgeMs,
    allFresh: staleOrMissing.length === 0,
    summary:
      staleOrMissing.length === 0
        ? `all ${entries.length} public-export source receipt(s) are fresh`
        : `${staleOrMissing.length}/${entries.length} public-export source receipt(s) are stale, missing, or invalid: ${staleOrMissing
            .map((entry) => `${entry.label} ${entry.detail}`)
            .join("; ")}`,
    sources: entries
  };
}

function publicationLaneBlockers(readiness: HarnessReadinessSummary): Array<{
  label: string;
  detail: string;
}> {
  return [
    {
      label: "ledger.public",
      ready: readiness.ledger.public.ready,
      detail: readiness.ledger.public.detail
    },
    {
      label: "q.oci",
      ready: readiness.q.oci.ready,
      detail: readiness.q.oci.detail
    },
    {
      label: "discord.transport",
      ready: readiness.discord.transport.ready,
      detail: readiness.discord.transport.detail
    }
  ]
    .filter((lane) => !lane.ready)
    .map(({ label, detail }) => ({ label, detail }));
}

export function resolvePublicExportPublication(
  activity: LiveOperatorActivityReceipt | undefined,
  readiness: HarnessReadinessSummary,
  sourceFreshness: PublicExportSourceFreshness
): { status: "publishable" | "blocked"; summary: string } {
  const blockers = [
    ...(activity?.publication?.status === "publishable"
      ? []
      : [
          {
            label: "operator.activity",
            detail: activity?.publication?.summary ?? "live operator activity receipt is not publishable"
          }
        ]),
    ...(sourceFreshness.allFresh
      ? []
      : [
          {
            label: "source.freshness",
            detail: sourceFreshness.summary
          }
        ]),
    ...publicationLaneBlockers(readiness)
  ];

  if (blockers.length === 0) {
    return {
      status: "publishable",
      summary: "public-safe operator export is publishable on the current workstation"
    };
  }
  if (blockers.length === 1) {
    return {
      status: "blocked",
      summary: `public publication is blocked by ${blockers[0].label}: ${blockers[0].detail}`
    };
  }
  return {
    status: "blocked",
    summary: `public publication is blocked by ${blockers
      .map((blocker) => `${blocker.label}: ${blocker.detail}`)
      .join(" | ")}`
  };
}

function countShowcaseLanes(readiness: HarnessReadinessSummary): {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  unconfigured: number;
} {
  const lanes = [
    readiness.ledger.public,
    readiness.ledger.private,
    readiness.q.local,
    readiness.q.oci,
    readiness.discord.transport
  ];
  return {
    total: lanes.length,
    online: lanes.filter((lane) => lane.ready).length,
    degraded: lanes.filter((lane) => lane.configured && !lane.ready).length,
    offline: 0,
    unconfigured: lanes.filter((lane) => !lane.configured).length
  };
}

function summarizeBotReadiness(activity: LiveOperatorActivityReceipt | undefined): {
  ready: number;
  total: number;
  labels: string[];
  latestAt?: string;
} {
  const agents = activity?.agents ?? [];
  const readyAgents = agents.filter((agent) => agent.status === "ready");
  const latestTimestamp = agents
    .map((agent) => agent.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))
    .at(0);
  return {
    ready: readyAgents.length,
    total: agents.length,
    labels: readyAgents
      .map((agent) => agent.label?.trim())
      .filter((value): value is string => Boolean(value && value.length > 0)),
    latestAt: latestTimestamp
  };
}

function deriveQAuthMode(
  activity: LiveOperatorActivityReceipt | undefined,
  readiness: HarnessReadinessSummary
): string | null {
  const summaries = [
    ...((activity?.agents ?? []).map((agent) => agent.summary) ?? []),
    readiness.q.oci.detail
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  if (summaries.includes("oci iam")) {
    return "oci_iam";
  }
  if (summaries.includes("local q")) {
    return "local_q";
  }
  if (readiness.q.oci.ready) {
    return "oci";
  }
  return null;
}

function buildShowcaseSummary(
  activity: LiveOperatorActivityReceipt | undefined,
  readiness: HarnessReadinessSummary,
  arobi: ArobiLiveLedgerReceipt | undefined
): string {
  const botReadiness = summarizeBotReadiness(activity);
  const roundtableLabel = activity?.roundtable?.channelName
    ? `#${activity.roundtable.channelName}`
    : "the bounded roundtable lane";
  const parts = [
    `Q patrol is ${activity?.qPatrol?.status ?? "blocked"}`,
    `roundtable is ${activity?.roundtable?.status ?? "blocked"} on ${roundtableLabel}`,
    typeof activity?.roundtable?.actionReceiptCount === "number"
      ? `${activity.roundtable.actionReceiptCount} bounded action receipts are present`
      : undefined,
    botReadiness.total > 0
      ? `${botReadiness.ready}/${botReadiness.total} bot receipts are ready`
      : undefined,
    `operator state is ${activity?.operator?.status ?? "blocked"}`,
    readiness.q.oci.ready ? "OCI-backed Q is ready" : undefined,
    readiness.discord.transport.ready ? "Discord transport is ready" : undefined,
    !readiness.ledger.public.ready
      ? `public ledger publication remains blocked: ${readiness.ledger.public.detail}`
      : "public ledger publication is currently ready"
  ].filter((value): value is string => Boolean(value));
  return parts.join("; ");
}

function createActivityEntry(
  entry: Omit<PublicShowcaseActivityEntry, "summary"> & {
    summary?: string | null;
  }
): PublicShowcaseActivityEntry {
  return {
    ...entry,
    summary: entry.summary ?? null
  };
}

function buildActivityFeed(
  activity: LiveOperatorActivityReceipt | undefined,
  readiness: HarnessReadinessSummary,
  arobi: ArobiLiveLedgerReceipt | undefined,
  generatedAt: string,
  publicationSummary: string
): PublicShowcaseActivityEntry[] {
  const botReadiness = summarizeBotReadiness(activity);
  const laneTones = {
    ready: "ok",
    blocked: "warning"
  } as const;
  const activityGeneratedAt = activity?.generatedAt ?? generatedAt;
  const roundtableSummary =
    activity?.roundtable?.summary ??
    (typeof activity?.roundtable?.actionReceiptCount === "number"
      ? `${activity.roundtable.actionReceiptCount} bounded action receipts recorded`
      : null);

  return [
    createActivityEntry({
      id: "showcase-summary",
      timestamp: generatedAt,
      title: "Supervised operator activity export updated",
      summary: buildShowcaseSummary(activity, readiness, arobi),
      kind: "showcase",
      status: readiness.ledger.public.ready ? "ok" : "warning",
      source: "fabric.showcase",
      subsystems: ["immaculate", "openjaws", "q"],
      artifacts: ["showcase:summary", "receipt:live-operator-public-export"],
      tags: ["showcase", "public", "operator"]
    }),
    createActivityEntry({
      id: "publication-gate",
      timestamp: generatedAt,
      title: "Public publication gate",
      summary: publicationSummary,
      kind: "publication",
      status: activity?.publication?.status === "publishable" ? "ok" : "warning",
      source: "immaculate.live_operator_activity",
      subsystems: ["arobi", "immaculate"],
      artifacts: ["gate:publication"],
      tags: ["public", "gate"]
    }),
    createActivityEntry({
      id: "q-patrol",
      timestamp: activityGeneratedAt,
      title: "Q patrol lane",
      summary:
        activity?.qPatrol?.summary ??
        (activity?.qPatrol?.recommendedLayerId
          ? `recommended layer ${activity.qPatrol.recommendedLayerId}`
          : null),
      kind: "agent",
      status: laneTones[activity?.qPatrol?.status ?? "blocked"],
      source: "immaculate.live_operator_activity",
      subsystems: ["q", "discord"],
      artifacts: [
        "receipt:q-patrol",
        ...(activity?.qPatrol?.recommendedLayerId
          ? [`layer:${activity.qPatrol.recommendedLayerId}`]
          : [])
      ],
      tags: ["q", "patrol", "operator"]
    }),
    createActivityEntry({
      id: "roundtable",
      timestamp: activityGeneratedAt,
      title: "Bounded roundtable lane",
      summary: roundtableSummary,
      kind: "roundtable",
      status: laneTones[activity?.roundtable?.status ?? "blocked"],
      source: "immaculate.live_operator_activity",
      subsystems: ["discord", "openjaws", "immaculate"],
      artifacts: [
        "receipt:roundtable",
        ...(typeof activity?.roundtable?.actionReceiptCount === "number"
          ? [`receipt:roundtable-actions-${activity.roundtable.actionReceiptCount}`]
          : [])
      ],
      tags: ["roundtable", "accountable", "operator"]
    }),
    createActivityEntry({
      id: "bot-receipts",
      timestamp: botReadiness.latestAt ?? activityGeneratedAt,
      title: "Discord bot receipts",
      summary:
        botReadiness.total > 0
          ? `${botReadiness.ready}/${botReadiness.total} bot receipts are ready${
              botReadiness.labels.length > 0
                ? ` (${botReadiness.labels.join(", ")})`
                : ""
            }.`
          : "No Discord bot receipts were available for this export.",
      kind: "discord",
      status:
        botReadiness.total > 0 && botReadiness.ready === botReadiness.total
          ? "ok"
          : botReadiness.total > 0
            ? "warning"
            : "warning",
      source: "immaculate.live_operator_activity",
      subsystems: ["discord", "openjaws", "q"],
      artifacts: ["receipt:discord-bots"],
      tags: ["discord", "receipts", "bots"]
    }),
    createActivityEntry({
      id: "operator-state",
      timestamp: activityGeneratedAt,
      title: "Operator state",
      summary: activity?.operator?.summary ?? "Operator state receipt missing.",
      kind: "operator",
      status: laneTones[activity?.operator?.status ?? "blocked"],
      source: "immaculate.live_operator_activity",
      subsystems: ["openjaws", "immaculate"],
      artifacts: ["receipt:operator-state"],
      tags: ["operator", "human-in-the-loop"]
    }),
    createActivityEntry({
      id: "discord-transport",
      timestamp: generatedAt,
      title: "Discord transport readiness",
      summary: readiness.discord.transport.detail,
      kind: "transport",
      status: readiness.discord.transport.ready ? "ok" : "warning",
      source: "immaculate.live_mission_readiness",
      subsystems: ["discord", "q"],
      artifacts: ["readiness:discord-transport"],
      tags: ["discord", "transport"]
    }),
    createActivityEntry({
      id: "public-ledger",
      timestamp: arobi?.generatedAt ?? generatedAt,
      title: "Public ledger visibility",
      summary: arobi?.liveNode
        ? `public ledger version ${arobi.liveNode.version ?? "unknown"} on block ${
            typeof arobi.liveNode.height === "number"
              ? arobi.liveNode.height.toLocaleString()
              : "unknown"
          } with ${
            typeof arobi.liveNode.totalEntries === "number"
              ? arobi.liveNode.totalEntries.toLocaleString()
              : "unknown"
          } visible aggregate entries; fabric source ${
            arobi.liveNode.fabricSource ?? "unknown"
          }`
        : "Arobi public-edge receipt missing.",
      kind: "ledger",
      status:
        readiness.ledger.public.ready &&
        arobi?.liveNode?.chainValid === true &&
        arobi.liveNode.fabricSource !== "synthesized"
          ? "ok"
          : "warning",
      source: "immaculate.arobi_live_ledger",
      subsystems: ["arobi", "ledger"],
      artifacts: ["receipt:arobi-live-ledger"],
      tags: ["ledger", "public", "audit"]
    })
  ];
}

function renderMarkdown(report: LiveOperatorPublicExportReport): string {
  return [
    "# Live Operator Public Export",
    "",
    "This page is the public-safe operator export for the current workstation. It mirrors the `fabric.showcase` contract already used by the aura-genesis status page, keeps the private mission lane closed, and only emits aggregate operator activity that is safe to publish on public surfaces.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    `- Contract target: \`${report.contract.target}\` v${report.contract.version}`,
    "",
    "## Publication Gate",
    "",
    `- Status: \`${report.publication.status}\``,
    `- Target: ${report.publication.target}`,
    `- Summary: ${report.publication.summary}`,
    `- Source freshness: \`${report.sourceFreshness.allFresh ? "fresh" : "blocked"}\` (${report.sourceFreshness.summary})`,
    `- Freshness budget: \`${formatDurationMs(report.sourceFreshness.maxAgeMs)}\``,
    "",
    "## Source Freshness",
    "",
    ...report.sourceFreshness.sources.map(
      (source) =>
        `- ${source.label}: \`${source.status}\` via \`${source.path}\`${source.generatedAt ? ` at \`${source.generatedAt}\`` : ""} - ${source.detail}`
    ),
    "",
    "## Public Showcase Status",
    "",
    `- Active: \`${report.showcase.active}\``,
    `- Mode: \`${report.showcase.mode}\``,
    `- Title: ${report.showcase.title ?? "none"}`,
    `- Summary: ${report.showcase.summary ?? "none"}`,
    `- Window label: ${report.showcase.windowLabel ?? "none"}`,
    `- Results ready: \`${report.showcase.resultsReady}\``,
    `- Fleet label: ${report.showcase.fleetLabel ?? "none"}`,
    `- Publish targets: ${report.showcase.publishTargets.join(" | ")}`,
    `- Subsystems: total \`${report.showcase.subsystemCount ?? 0}\` | online \`${report.showcase.onlineSubsystemCount ?? 0}\` | degraded \`${report.showcase.degradedSubsystemCount ?? 0}\` | offline \`${report.showcase.offlineSubsystemCount ?? 0}\` | unconfigured \`${report.showcase.unconfiguredSubsystemCount ?? 0}\``,
    `- Network version: \`${report.showcase.networkVersion ?? "unknown"}\``,
    `- Verified ledger entries: \`${report.showcase.verifiedLedgerEntries ?? "unknown"}\``,
    `- Public height: \`${report.showcase.publicHeight ?? "unknown"}\``,
    `- Orchestration profile: \`${report.showcase.orchestrationProfile ?? "unknown"}\``,
    `- Q auth mode: \`${report.showcase.qAuthMode ?? "unknown"}\``,
    `- Last checked: \`${report.showcase.lastChecked ?? "unknown"}\``,
    "",
    "## Activity Feed",
    "",
    ...report.showcase.activityFeed.flatMap((entry) => [
      `### ${entry.title}`,
      "",
      `- Status: \`${entry.status ?? "unknown"}\``,
      `- Kind: \`${entry.kind ?? "unknown"}\``,
      `- Timestamp: \`${entry.timestamp ?? "unknown"}\``,
      `- Source: \`${entry.source ?? "unknown"}\``,
      `- Summary: ${entry.summary ?? "none"}`,
      `- Subsystems: ${entry.subsystems.length > 0 ? entry.subsystems.join(", ") : "none"}`,
      `- Artifacts: ${entry.artifacts.length > 0 ? entry.artifacts.join(", ") : "none"}`,
      `- Tags: ${entry.tags.length > 0 ? entry.tags.join(", ") : "none"}`,
      ""
    ]),
    "## Truth Boundary",
    "",
    ...report.truthBoundary.map((entry) => `- ${entry}`)
  ].join("\n");
}

export function buildPublicExportTruthBoundary(args: { publicLedgerReady: boolean }): string[] {
  return [
    "This export is public-safe aggregate operator activity only; it does not prove that a live Discord operator command or a live mission was executed on this pass.",
    "This export is shaped to mirror the existing aura-genesis fabric.showcase contract; it does not mutate the public website or the public ledger by itself.",
    "The private mission lane remains closed here even when local Discord transport, OCI-backed Q, and roundtable receipts are ready.",
    "Private paths, worktree roots, secrets, Discord tokens, private ledger payloads, and raw chain-of-thought are intentionally excluded from this export.",
    args.publicLedgerReady
      ? "ledger.public has a fresh governed public Arobi write on this machine for this export."
      : "ledger.public remains blocked until a fresh governed public Arobi write is proven on this machine.",
    "The public publication gate also fails closed when any source receipt used to produce this aggregate export is stale, missing, or invalid."
  ];
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const liveMissionReadinessPath = path.join(REPO_ROOT, "docs", "wiki", "Live-Mission-Readiness.json");
  const liveOperatorActivityPath = path.join(REPO_ROOT, "docs", "wiki", "Live-Operator-Activity.json");
  const arobiLiveLedgerPath = path.join(REPO_ROOT, "docs", "wiki", "Arobi-Live-Ledger-Receipt.json");

  const [liveMissionReadiness, liveOperatorActivity, arobiLiveLedger] = await Promise.all([
    readJsonFile<LiveMissionReadinessReceipt>(liveMissionReadinessPath),
    readJsonFile<LiveOperatorActivityReceipt>(liveOperatorActivityPath),
    readJsonFile<ArobiLiveLedgerReceipt>(arobiLiveLedgerPath)
  ]);

  const readiness = liveMissionReadiness?.readiness ?? resolveDefaultReadiness();
  const generatedAt = new Date().toISOString();
  const sourceFreshness = evaluatePublicExportSourceFreshness(
    [
      {
        label: "Live mission readiness",
        path: relativeWikiPath(liveMissionReadinessPath),
        generatedAt: liveMissionReadiness?.generatedAt
      },
      {
        label: "Live operator activity",
        path: relativeWikiPath(liveOperatorActivityPath),
        generatedAt: liveOperatorActivity?.generatedAt
      },
      {
        label: "Arobi live ledger receipt",
        path: relativeWikiPath(arobiLiveLedgerPath),
        generatedAt: arobiLiveLedger?.generatedAt
      }
    ],
    {
      nowMs: Date.parse(generatedAt),
      maxAgeMs: resolveSourceFreshnessMaxAgeMs()
    }
  );
  const publication = resolvePublicExportPublication(liveOperatorActivity, readiness, sourceFreshness);
  const laneCounts = countShowcaseLanes(readiness);
  const activityFeed = buildActivityFeed(
    liveOperatorActivity,
    readiness,
    arobiLiveLedger,
    generatedAt,
    publication.summary
  );

  const report: LiveOperatorPublicExportReport = {
    generatedAt,
    release,
    contract: {
      target: "fabric.showcase",
      version: 1,
      summary: "Public-safe export that mirrors the aura-genesis fabric.showcase contract."
    },
    publication: {
      status: publication.status,
      summary: publication.summary,
      target: "aura-genesis.org/status"
    },
    sourceFreshness,
    showcase: {
      active: publication.status === "publishable",
      mode: "controlled",
      title: "Supervised operator audit export.",
      summary: buildShowcaseSummary(liveOperatorActivity, readiness, arobiLiveLedger),
      expiresAt: null,
      windowLabel:
        publication.status === "publishable"
          ? "Operator-supervised public verification window"
          : "Showcase line closed until public ledger publication is proven",
      publishTargets: PUBLISH_TARGETS,
      resultsReady: publication.status === "publishable" && activityFeed.length > 0,
      fleetLabel: "Immaculate / OpenJaws / Q operator loop",
      subsystemCount: laneCounts.total,
      onlineSubsystemCount: laneCounts.online,
      degradedSubsystemCount: laneCounts.degraded,
      offlineSubsystemCount: laneCounts.offline,
      unconfiguredSubsystemCount: laneCounts.unconfigured,
      networkVersion: arobiLiveLedger?.liveNode?.version ?? null,
      verifiedLedgerEntries: arobiLiveLedger?.liveNode?.totalEntries ?? null,
      publicHeight: arobiLiveLedger?.liveNode?.height ?? null,
      orchestrationProfile: "immaculate-supervised-operator-loop",
      qAuthMode: deriveQAuthMode(liveOperatorActivity, readiness),
      lastChecked: generatedAt,
      activityFeed
    },
    truthBoundary: buildPublicExportTruthBoundary({
      publicLedgerReady: readiness.ledger.public.ready === true
    }),
    output: {
      jsonPath: path.join("docs", "wiki", "Live-Operator-Public-Export.json"),
      markdownPath: path.join("docs", "wiki", "Live-Operator-Public-Export.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(error instanceof Error ? error.message : "Live operator public export generation failed.");
    process.exitCode = 1;
  });
}
