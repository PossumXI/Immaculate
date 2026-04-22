import path from "node:path";
import { existsSync } from "node:fs";
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
  operatorActions?: string[];
  subsystems: string[];
  artifacts: string[];
  tags: string[];
};

type SharedPublicShowcaseActivityFeed = {
  updatedAt?: string | null;
  entries?: Array<Partial<PublicShowcaseActivityEntry> | Record<string, unknown>>;
};

type SharedPublicShowcaseStatus = {
  active?: boolean;
  title?: string | null;
  summary?: string | null;
  operatorLine?: string | null;
  expiresAt?: string | null;
  windowLabel?: string | null;
  publishTargets?: unknown;
  resultsReady?: boolean;
  fleetLabel?: string | null;
  subsystemCount?: number | null;
  onlineSubsystemCount?: number | null;
  degradedSubsystemCount?: number | null;
  offlineSubsystemCount?: number | null;
  unconfiguredSubsystemCount?: number | null;
  networkVersion?: string | null;
  verifiedLedgerEntries?: number | null;
  publicHeight?: number | null;
  orchestrationProfile?: string | null;
  qAuthMode?: string | null;
  lastChecked?: string | null;
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
const OPENJAWS_ROOT = process.env.OPENJAWS_ROOT?.trim() || "D:\\openjaws\\OpenJaws";
const PUBLISH_TARGETS = [
  "aura-genesis.org/status (public-safe aggregate only)",
  "iorch.net (results only)",
  "qline.site (results only; not published from this repo)"
];

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

function normalizeInlineText(value: unknown, maxLength = 320): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeTimestamp(value: unknown): string | null {
  const candidate = normalizeInlineText(value, 64);
  if (!candidate) {
    return null;
  }
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeStringArray(value: unknown, maxLength = 64): string[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeInlineText(entry, maxLength))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : [];
}

function resolveSharedActivityFeedCandidates(): string[] {
  const home = process.env.USERPROFILE?.trim() || process.env.HOME?.trim();
  return [
    process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_MIRROR_FILE?.trim(),
    path.join(OPENJAWS_ROOT, "docs", "wiki", "Public-Showcase-Activity.json"),
    process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_FILE?.trim(),
    process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE?.trim(),
    home ? path.join(home, ".arobi-public", "showcase-activity.json") : null,
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.length > 0));
}

function resolveSharedShowcaseStatusCandidates(): string[] {
  const home = process.env.USERPROFILE?.trim() || process.env.HOME?.trim();
  return [
    process.env.AROBI_PUBLIC_SHOWCASE_FILE?.trim(),
    home ? path.join(home, ".arobi-public", "showcase-status.json") : null,
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.length > 0));
}

function normalizeSharedActivityEntry(
  value: Partial<PublicShowcaseActivityEntry> | Record<string, unknown>,
  index: number,
): PublicShowcaseActivityEntry | null {
  const title = normalizeInlineText(value.title, 96);
  const summary = normalizeInlineText(value.summary, 320);
  if (!title && !summary) {
    return null;
  }

  const timestamp = normalizeTimestamp(value.timestamp);
  const kind = normalizeInlineText(value.kind, 40);
  const source = normalizeInlineText(value.source, 64);
  const fallbackId = `${kind ?? "activity"}-${timestamp ?? index}`;
  return {
    id: normalizeInlineText(value.id, 96) ?? fallbackId,
    timestamp,
    title: title ?? summary ?? "Public showcase activity",
    summary,
    kind,
    status: normalizeInlineText(value.status, 24),
    source,
    operatorActions: normalizeStringArray(value.operatorActions, 48),
    subsystems: normalizeStringArray(value.subsystems, 48),
    artifacts: normalizeStringArray(value.artifacts, 72),
    tags: normalizeStringArray(value.tags, 48),
  };
}

async function readSharedOpenJawsActivityFeed(): Promise<PublicShowcaseActivityEntry[]> {
  for (const candidate of resolveSharedActivityFeedCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }
    const parsed = await readJsonFile<SharedPublicShowcaseActivityFeed>(candidate);
    if (!Array.isArray(parsed?.entries)) {
      continue;
    }
    const entries = parsed.entries
      .map((entry, index) => normalizeSharedActivityEntry(entry, index))
      .filter((entry): entry is PublicShowcaseActivityEntry => Boolean(entry));
    if (entries.length > 0) {
      return entries;
    }
  }
  return [];
}

async function readSharedPublicShowcaseStatus(): Promise<SharedPublicShowcaseStatus | undefined> {
  for (const candidate of resolveSharedShowcaseStatusCandidates()) {
    if (!existsSync(candidate)) {
      continue;
    }
    const parsed = await readJsonFile<SharedPublicShowcaseStatus>(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

function hasVerifiedSharedPublication(
  status: SharedPublicShowcaseStatus | undefined,
): boolean {
  const combined = [
    normalizeInlineText(status?.summary, 512),
    normalizeInlineText(status?.operatorLine, 512),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  return combined.includes("public-safe aggregate publication verified");
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

function buildPublicationSummary(
  activity: LiveOperatorActivityReceipt | undefined,
  readiness: HarnessReadinessSummary,
  sharedStatus?: SharedPublicShowcaseStatus,
): string {
  if (hasVerifiedSharedPublication(sharedStatus)) {
    return (
      normalizeInlineText(sharedStatus?.summary, 512) ??
      normalizeInlineText(sharedStatus?.operatorLine, 512) ??
      "public-safe aggregate publication has been verified on the Arobi public lane"
    );
  }
  const blockedLanes = [
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
  ].filter((lane) => !lane.ready);

  if (blockedLanes.length === 0) {
    return "public-safe operator export is publishable on the current workstation";
  }
  if (blockedLanes.length === 1) {
    return `public publication is blocked by ${blockedLanes[0].label}: ${blockedLanes[0].detail}`;
  }
  return `public publication is blocked by ${blockedLanes
    .map((lane) => lane.label)
    .join(", ")}.`;
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
  arobi: ArobiLiveLedgerReceipt | undefined,
  sharedStatus?: SharedPublicShowcaseStatus,
): string {
  if (hasVerifiedSharedPublication(sharedStatus)) {
    return (
      normalizeInlineText(sharedStatus?.summary, 512) ??
      normalizeInlineText(sharedStatus?.operatorLine, 512) ??
      "public-safe aggregate publication has been verified on the Arobi public lane"
    );
  }
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

function buildDerivedActivityFeed(
  activity: LiveOperatorActivityReceipt | undefined,
  readiness: HarnessReadinessSummary,
  arobi: ArobiLiveLedgerReceipt | undefined,
  sharedStatus: SharedPublicShowcaseStatus | undefined,
  generatedAt: string,
  publicationSummary: string,
  publicationVerified: boolean,
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
      summary: buildShowcaseSummary(activity, readiness, arobi, sharedStatus),
      kind: "showcase",
      status: publicationVerified ? "ok" : "warning",
      source: "fabric.showcase",
      operatorActions: ["public_showcase_export"],
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
      status: publicationVerified ? "ok" : "warning",
      source: "immaculate.live_operator_activity",
      operatorActions: ["publication_gate"],
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
      operatorActions: ["q_patrol"],
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
      operatorActions: ["roundtable_runtime"],
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
      operatorActions: ["discord_bot_receipts"],
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
      operatorActions: ["operator_state"],
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
      operatorActions: ["discord_transport_readiness"],
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
      operatorActions: ["public_ledger_visibility"],
      subsystems: ["arobi", "ledger"],
      artifacts: ["receipt:arobi-live-ledger"],
      tags: ["ledger", "public", "audit"]
    })
  ];
}

function buildActivityFeed(
  sharedEntries: PublicShowcaseActivityEntry[],
  derivedEntries: PublicShowcaseActivityEntry[],
): PublicShowcaseActivityEntry[] {
  if (sharedEntries.length === 0) {
    return derivedEntries;
  }

  const supplementalIds = new Set([
    "showcase-summary",
    "publication-gate",
    "operator-state",
    "discord-transport",
    "public-ledger",
  ]);

  const merged = [...derivedEntries.filter((entry) => supplementalIds.has(entry.id)), ...sharedEntries];
  const deduped = Array.from(
    merged.reduce<Map<string, PublicShowcaseActivityEntry>>((accumulator, entry) => {
      if (!accumulator.has(entry.id)) {
        accumulator.set(entry.id, entry);
      }
      return accumulator;
    }, new Map()).values(),
  );

  const prioritized = deduped.sort((left, right) => {
    const priority = (entry: PublicShowcaseActivityEntry): number => {
      if (entry.id === "showcase-summary") {
        return 0;
      }
      if (entry.id === "publication-gate") {
        return 1;
      }
      if (entry.id.startsWith("runtime-audit-")) {
        return 2;
      }
      if (entry.id.startsWith("roundtable-")) {
        return 3;
      }
      if (entry.id.startsWith("discord-q-")) {
        return 4;
      }
      if (entry.id.startsWith("discord-blackbeak-")) {
        return 5;
      }
      if (entry.id.startsWith("discord-viola-")) {
        return 6;
      }
      if (entry.id.startsWith("apex-operator-")) {
        return 7;
      }
      if (entry.id === "public-ledger") {
        return 8;
      }
      if (entry.id === "discord-transport") {
        return 9;
      }
      if (entry.id === "operator-state") {
        return 10;
      }
      return 20;
    };
    const leftPriority = priority(left);
    const rightPriority = priority(right);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0;
    const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0;
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return left.title.localeCompare(right.title);
  });

  return prioritized.slice(0, 10);
}

function renderMarkdown(report: LiveOperatorPublicExportReport): string {
  return [
    "# Live Operator Public Export",
    "",
    "This page is the public-safe operator export for the current workstation. It mirrors the `fabric.showcase` contract already used by the aura-genesis status page, keeps the private mission lane closed, and only emits aggregate operator activity that is safe to publish on public surfaces.",
    "When the repo-local OpenJaws public showcase mirror is present, this export consumes that shared sanitized activity feed instead of regenerating overlapping Discord/Q/roundtable entries locally.",
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
  const sharedShowcaseStatus = await readSharedPublicShowcaseStatus();
  const publicationVerified =
    liveOperatorActivity?.publication?.status === "publishable" ||
    hasVerifiedSharedPublication(sharedShowcaseStatus);
  const publicationSummary = buildPublicationSummary(
    liveOperatorActivity,
    readiness,
    sharedShowcaseStatus,
  );
  const laneCounts = countShowcaseLanes(readiness);
  const generatedAt = new Date().toISOString();
  const sharedOpenJawsActivityFeed = await readSharedOpenJawsActivityFeed();
  const activityFeed = buildActivityFeed(
    sharedOpenJawsActivityFeed,
    buildDerivedActivityFeed(
      liveOperatorActivity,
      readiness,
      arobiLiveLedger,
      sharedShowcaseStatus,
      generatedAt,
      publicationSummary,
      publicationVerified,
    ),
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
      status: publicationVerified ? "publishable" : "blocked",
      summary: publicationSummary,
      target: "aura-genesis.org/status"
    },
    showcase: {
      active:
        typeof sharedShowcaseStatus?.active === "boolean"
          ? sharedShowcaseStatus.active
          : publicationVerified,
      mode: "controlled",
      title:
        normalizeInlineText(sharedShowcaseStatus?.title, 128) ??
        "Supervised operator audit export.",
      summary: buildShowcaseSummary(
        liveOperatorActivity,
        readiness,
        arobiLiveLedger,
        sharedShowcaseStatus,
      ),
      expiresAt: normalizeTimestamp(sharedShowcaseStatus?.expiresAt),
      windowLabel:
        normalizeInlineText(sharedShowcaseStatus?.windowLabel, 160) ??
        (publicationVerified
          ? "Operator-supervised public verification window"
          : "Showcase line closed until public ledger publication is proven"),
      publishTargets:
        normalizeStringArray(sharedShowcaseStatus?.publishTargets, 160).length > 0
          ? normalizeStringArray(sharedShowcaseStatus?.publishTargets, 160)
          : PUBLISH_TARGETS,
      resultsReady:
        typeof sharedShowcaseStatus?.resultsReady === "boolean"
          ? sharedShowcaseStatus.resultsReady
          : activityFeed.length > 0,
      fleetLabel:
        normalizeInlineText(sharedShowcaseStatus?.fleetLabel, 128) ??
        "Immaculate / OpenJaws / Q operator loop",
      subsystemCount:
        typeof sharedShowcaseStatus?.subsystemCount === "number"
          ? sharedShowcaseStatus.subsystemCount
          : laneCounts.total,
      onlineSubsystemCount:
        typeof sharedShowcaseStatus?.onlineSubsystemCount === "number"
          ? sharedShowcaseStatus.onlineSubsystemCount
          : laneCounts.online,
      degradedSubsystemCount:
        typeof sharedShowcaseStatus?.degradedSubsystemCount === "number"
          ? sharedShowcaseStatus.degradedSubsystemCount
          : laneCounts.degraded,
      offlineSubsystemCount:
        typeof sharedShowcaseStatus?.offlineSubsystemCount === "number"
          ? sharedShowcaseStatus.offlineSubsystemCount
          : laneCounts.offline,
      unconfiguredSubsystemCount:
        typeof sharedShowcaseStatus?.unconfiguredSubsystemCount === "number"
          ? sharedShowcaseStatus.unconfiguredSubsystemCount
          : laneCounts.unconfigured,
      networkVersion:
        normalizeInlineText(sharedShowcaseStatus?.networkVersion, 32) ??
        arobiLiveLedger?.liveNode?.version ??
        null,
      verifiedLedgerEntries:
        typeof sharedShowcaseStatus?.verifiedLedgerEntries === "number"
          ? sharedShowcaseStatus.verifiedLedgerEntries
          : arobiLiveLedger?.liveNode?.totalEntries ?? null,
      publicHeight:
        typeof sharedShowcaseStatus?.publicHeight === "number"
          ? sharedShowcaseStatus.publicHeight
          : arobiLiveLedger?.liveNode?.height ?? null,
      orchestrationProfile:
        normalizeInlineText(sharedShowcaseStatus?.orchestrationProfile, 96) ??
        "immaculate-supervised-operator-loop",
      qAuthMode:
        normalizeInlineText(sharedShowcaseStatus?.qAuthMode, 32) ??
        deriveQAuthMode(liveOperatorActivity, readiness),
      lastChecked: normalizeTimestamp(sharedShowcaseStatus?.lastChecked) ?? generatedAt,
      activityFeed
    },
    truthBoundary: [
      "This export is public-safe aggregate operator activity only; it does not prove that a live Discord operator command or a live mission was executed on this pass.",
      "This export is shaped to mirror the existing aura-genesis fabric.showcase contract; it does not mutate the public website or the public ledger by itself.",
      "The private mission lane remains closed here even when local Discord transport, OCI-backed Q, and roundtable receipts are ready.",
      "Private paths, worktree roots, secrets, Discord tokens, private ledger payloads, and raw chain-of-thought are intentionally excluded from this export.",
      publicationVerified
        ? "Fresh public-safe Arobi public audit writes were accepted during the current controlled publish pass; this still does not open the private mission lane or prove live Discord mission execution."
        : "ledger.public remains blocked until a fresh governed public Arobi write is proven on this machine."
    ],
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

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Live operator public export generation failed.");
  process.exitCode = 1;
});
