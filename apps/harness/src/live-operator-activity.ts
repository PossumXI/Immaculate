import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  resolveReleaseMetadata,
  type HarnessReadinessSummary,
  type ReleaseMetadata
} from "./release-metadata.js";

type DiscordAgentEvent = {
  at?: string;
  status?: string;
  summary?: string;
  channelName?: string | null;
};

type DiscordAgentReceipt = {
  updatedAt?: string;
  status?: string;
  backend?: string;
  gateway?: {
    connected?: boolean;
    guildCount?: number;
    readyAt?: string | null;
    lastHeartbeatAt?: string | null;
    lastMessageAt?: string | null;
    lastReplyAt?: string | null;
  };
  schedule?: {
    enabled?: boolean;
    intervalMs?: number;
    cycleCount?: number;
    nextRunAt?: string | null;
    lastSummary?: string | null;
  };
  routing?: {
    lastDecision?: string | null;
    lastPostedChannelName?: string | null;
    lastPostedReason?: string | null;
  };
  voice?: {
    enabled?: boolean;
    provider?: string | null;
    ready?: boolean;
    connected?: boolean;
    channelName?: string | null;
  };
  patrol?: {
    lastCompletedAt?: string | null;
    lastSummary?: string | null;
    snapshot?: {
      harnessReachable?: boolean;
      harnessSummary?: string | null;
      deckSummary?: string | null;
      workerSummary?: string | null;
      trainingSummary?: string | null;
      hybridSummary?: string | null;
      routeQueueSummary?: string | null;
      queueLength?: number;
      recommendedLayerId?: string | null;
    } | null;
  };
  knowledge?: {
    enabled?: boolean;
    ready?: boolean;
    rootLabel?: string | null;
    generatedAt?: string | null;
    fileCount?: number;
    chunkCount?: number;
  };
  operator?: {
    operatorLabel?: string | null;
    lastAction?: string | null;
    lastCompletedAt?: string | null;
    lastSummary?: string | null;
  };
  events?: DiscordAgentEvent[];
};

type OpenJawsOperatorState = {
  pid?: number;
  cwd?: string;
  startedAt?: string;
};

type RoundtableStateReceipt = {
  updatedAt?: string;
  status?: string;
  roundtableChannelName?: string | null;
  lastSummary?: string | null;
  jobs?: Array<{
    status?: string | null;
    approvalState?: string | null;
    verificationSummary?: string | null;
  }>;
};

type RoundtableSessionReceipt = {
  updatedAt?: string;
  status?: string;
  startedAt?: string | null;
  endsAt?: string | null;
  roundtableChannelName?: string | null;
  turnCount?: number;
  nextPersona?: string | null;
  lastSpeaker?: string | null;
  lastSummary?: string | null;
};

type RoundtableActionReceipt = {
  version?: number;
  personaId?: string;
  personaName?: string;
  title?: string;
  reason?: string;
  targetRoot?: string;
  startedAt?: string;
  completedAt?: string;
  changedFiles?: string[];
  verificationSummary?: string;
  executionQuality?: {
    verificationPassed?: boolean;
    mergeable?: boolean;
    hasCodeChanges?: boolean;
  };
};

type LiveMissionReadinessReceipt = {
  generatedAt?: string;
  readiness?: HarnessReadinessSummary;
};

type ActivityLaneStatus = "ready" | "blocked";

type AgentActivitySummary = {
  label: string;
  sourcePath: string;
  updatedAt?: string;
  status: ActivityLaneStatus;
  backend?: string;
  connected: boolean;
  guildCount: number;
  summary: string;
  recentEvents: Array<{
    at?: string;
    status?: string;
    summary?: string;
    channelName?: string | null;
  }>;
};

type RoundtableActionSummary = {
  persona: string;
  title: string;
  targetRoot: string;
  startedAt?: string;
  completedAt?: string;
  changedFileCount: number;
  verificationPassed: boolean;
  mergeable: boolean;
  verificationSummary?: string;
  sourcePath: string;
};

type LiveOperatorActivityReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  publication: {
    status: "publishable" | "blocked";
    publicLedgerReady: boolean;
    summary: string;
  };
  qPatrol: {
    status: ActivityLaneStatus;
    summary: string;
    sourcePath: string;
    lastDecision?: string | null;
    lastPostedChannelName?: string | null;
    lastSummary?: string | null;
    queueLength?: number;
    recommendedLayerId?: string | null;
  };
  roundtable: {
    status: ActivityLaneStatus;
    summary: string;
    sourcePath: string;
    sessionSourcePath: string;
    channelName?: string | null;
    sessionStatus?: string;
    turnCount?: number;
    nextPersona?: string | null;
    lastSpeaker?: string | null;
    lastSummary?: string | null;
    actionReceiptCount: number;
    actions: RoundtableActionSummary[];
  };
  agents: AgentActivitySummary[];
  operator: {
    status: ActivityLaneStatus;
    summary: string;
    sourcePath: string;
    operatorLabel?: string | null;
    lastAction?: string | null;
    lastSummary?: string | null;
    lastCompletedAt?: string | null;
    activeProcessPresent: boolean;
  };
  readiness: HarnessReadinessSummary;
  evidence: {
    openjawsRoot: string;
    readinessPath: string;
    aggregateReceiptPath: string;
    roundtableStatePath: string;
    roundtableSessionPath: string;
    roundtableActionReceiptPaths: string[];
    botReceiptPaths: string[];
    operatorStatePath: string;
  };
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
const DEFAULT_BOT_IDS = ["q", "blackbeak", "viola"];
const BOT_LABELS: Record<string, string> = {
  q: "Q agent",
  blackbeak: "Blackbeak",
  viola: "Viola"
};

function normalizePathKey(value: string): string {
  return path.resolve(value).replaceAll("\\", "/").toLowerCase();
}

function formatEvidencePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const roots = [
    { label: "immaculate", root: REPO_ROOT },
    { label: "openjaws", root: OPENJAWS_ROOT }
  ];
  const normalizedResolved = normalizePathKey(resolved);
  for (const entry of roots) {
    const normalizedRoot = normalizePathKey(entry.root);
    if (
      normalizedResolved === normalizedRoot ||
      normalizedResolved.startsWith(`${normalizedRoot}/`)
    ) {
      const relative = path.relative(entry.root, resolved).replaceAll("\\", "/");
      return relative.length > 0 ? `${entry.label}/${relative}` : entry.label;
    }
  }
  return path.basename(resolved);
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") {
      return undefined;
    }
    throw new Error(
      `Unable to parse ${formatEvidencePath(filePath)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function formatNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "unknown";
}

function sanitizeBackend(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\s*\((https?:\/\/[^)]+)\)\s*/gi, "").trim();
}

function formatRecentEvent(event: DiscordAgentEvent | undefined): string | undefined {
  if (!event) {
    return undefined;
  }
  const parts = [
    event.status?.trim(),
    event.summary?.trim(),
    event.channelName?.trim() ? `#${event.channelName.trim()}` : undefined
  ].filter((value): value is string => Boolean(value && value.length > 0));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function resolveBotLabel(botId: string, index: number): string {
  return BOT_LABELS[botId] ?? `${botId || `bot-${index + 1}`}`;
}

function isHarnessReadinessSummary(value: unknown): value is HarnessReadinessSummary {
  const candidate = value as HarnessReadinessSummary | undefined;
  return Boolean(
    candidate &&
      typeof candidate.summary === "string" &&
      typeof candidate.missionSurfaceReady === "boolean" &&
      candidate.ledger?.public &&
      candidate.ledger?.private &&
      candidate.q?.local &&
      candidate.q?.oci &&
      candidate.discord?.transport &&
      typeof candidate.ledger.public.ready === "boolean" &&
      typeof candidate.ledger.private.ready === "boolean" &&
      typeof candidate.q.local.ready === "boolean" &&
      typeof candidate.q.oci.ready === "boolean" &&
      typeof candidate.discord.transport.ready === "boolean"
  );
}

function buildAgentSummary(args: {
  label: string;
  receipt: DiscordAgentReceipt | undefined;
  sourcePath: string;
}): AgentActivitySummary {
  const receipt = args.receipt;
  const connected = receipt?.gateway?.connected === true;
  const guildCount = receipt?.gateway?.guildCount ?? 0;
  const recentEvents = (receipt?.events ?? []).slice(0, 5);
  const latestEvent = formatRecentEvent(recentEvents[0]);
  const knowledgeReady = receipt?.knowledge?.ready === true;
  const voiceEnabled = receipt?.voice?.enabled === true;
  const voiceState = voiceEnabled
    ? `${receipt?.voice?.connected ? "voice connected" : "voice staged"}${
        receipt?.voice?.channelName ? ` @ ${receipt.voice.channelName}` : ""
      }`
    : "voice off";
  const summary = [
    receipt?.status ?? "missing",
    connected ? `gateway online (${guildCount} guild)` : `gateway offline (${guildCount} guild)`,
    sanitizeBackend(receipt?.backend),
    latestEvent,
    knowledgeReady
      ? `knowledge ${formatNumber(receipt?.knowledge?.fileCount)} files`
      : "knowledge not ready",
    voiceState
  ]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .join(" | ");
  return {
    label: args.label,
    sourcePath: formatEvidencePath(args.sourcePath),
    updatedAt: receipt?.updatedAt,
    status: receipt?.status === "ready" && connected ? "ready" : "blocked",
    backend: sanitizeBackend(receipt?.backend),
    connected,
    guildCount,
    summary,
    recentEvents: recentEvents.map((event) => ({
      at: event.at,
      status: event.status,
      summary: event.summary,
      channelName: event.channelName
    }))
  };
}

async function readRoundtableActionSummaries(
  actionsRoot: string
): Promise<RoundtableActionSummary[]> {
  try {
    const entries = await readdir(actionsRoot, { withFileTypes: true });
    const receipts: RoundtableActionSummary[] = [];
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const receiptPath = path.join(actionsRoot, entry.name, "receipt.json");
      const receipt = await readJsonFile<RoundtableActionReceipt>(receiptPath);
      if (!receipt) {
        continue;
      }
      receipts.push({
        persona: receipt.personaName?.trim() || receipt.personaId?.trim() || "Unknown",
        title: receipt.title?.trim() || "Roundtable action",
        targetRoot: receipt.targetRoot?.trim() || "Unknown",
        startedAt: receipt.startedAt,
        completedAt: receipt.completedAt,
        changedFileCount: receipt.changedFiles?.length ?? 0,
        verificationPassed: receipt.executionQuality?.verificationPassed === true,
        mergeable: receipt.executionQuality?.mergeable === true,
        verificationSummary: receipt.verificationSummary,
        sourcePath: formatEvidencePath(receiptPath)
      });
    }
    return receipts.sort((left, right) =>
        String(right.completedAt ?? right.startedAt ?? "").localeCompare(
          String(left.completedAt ?? left.startedAt ?? "")
        )
      );
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function renderMarkdown(report: LiveOperatorActivityReport): string {
  return [
    "# Live Operator Activity",
    "",
    "This page is the machine-stamped local activity feed for the supervised Discord/Q/OpenJaws loop. It summarizes the canonical OpenJaws receipts so Immaculate can expose one operator-facing activity surface without inventing a duplicate schema.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    "",
    "## Publication Gate",
    "",
    `- Status: \`${report.publication.status}\``,
    `- Public ledger ready: \`${report.publication.publicLedgerReady}\``,
    `- Summary: ${report.publication.summary}`,
    "",
    "## Shared Readiness Context",
    "",
    `- Mission-surface ready: \`${report.readiness.missionSurfaceReady}\``,
    `- Summary: ${report.readiness.summary}`,
    `- ledger.public: \`${report.readiness.ledger.public.status}\`${report.readiness.ledger.public.endpoint ? ` @ \`${report.readiness.ledger.public.endpoint}\`` : ""} | ${report.readiness.ledger.public.detail}`,
    `- discord.transport: \`${report.readiness.discord.transport.status}\`${report.readiness.discord.transport.endpoint ? ` @ \`${report.readiness.discord.transport.endpoint}\`` : ""} | ${report.readiness.discord.transport.detail}`,
    `- q.oci: \`${report.readiness.q.oci.status}\`${report.readiness.q.oci.endpoint ? ` @ \`${report.readiness.q.oci.endpoint}\`` : ""} | ${report.readiness.q.oci.detail}`,
    "",
    "## Q Patrol",
    "",
    `- Status: \`${report.qPatrol.status}\``,
    `- Summary: ${report.qPatrol.summary}`,
    `- Last decision: \`${report.qPatrol.lastDecision ?? "none"}\``,
    `- Last posted channel: \`${report.qPatrol.lastPostedChannelName ?? "none"}\``,
    `- Last summary: ${report.qPatrol.lastSummary ?? "none"}`,
    `- Queue length: \`${formatNumber(report.qPatrol.queueLength)}\``,
    `- Recommended layer: \`${report.qPatrol.recommendedLayerId ?? "none"}\``,
    `- Source: \`${report.qPatrol.sourcePath}\``,
    "",
    "## Roundtable Activity",
    "",
    `- Status: \`${report.roundtable.status}\``,
    `- Session status: \`${report.roundtable.sessionStatus ?? "missing"}\``,
    `- Channel: \`${report.roundtable.channelName ?? "missing"}\``,
    `- Turns: \`${formatNumber(report.roundtable.turnCount)}\``,
    `- Next persona: \`${report.roundtable.nextPersona ?? "none"}\``,
    `- Last speaker: \`${report.roundtable.lastSpeaker ?? "none"}\``,
    `- Last summary: ${report.roundtable.lastSummary ?? "none"}`,
    `- Action receipts: \`${report.roundtable.actionReceiptCount}\``,
    `- Summary: ${report.roundtable.summary}`,
    `- State source: \`${report.roundtable.sourcePath}\``,
    `- Session source: \`${report.roundtable.sessionSourcePath}\``,
    ...(report.roundtable.actions.length > 0
      ? [
          "",
          "### Recent bounded actions",
          "",
          ...report.roundtable.actions.flatMap((action) => [
            `- ${action.persona} -> ${action.targetRoot} | \`${action.title}\` | changed files \`${action.changedFileCount}\` | verification \`${action.verificationPassed}\` | mergeable \`${action.mergeable}\` | completed \`${action.completedAt ?? "unknown"}\``,
            `- Action source: \`${action.sourcePath}\``,
            `- Verification summary: ${action.verificationSummary ?? "none recorded"}`
          ])
        ]
      : ["- Recent bounded actions: none"]),
    "",
    "## Discord Agents",
    "",
    ...report.agents.flatMap((agent) => [
      `### ${agent.label}`,
      "",
      `- Status: \`${agent.status}\``,
      `- Updated: \`${agent.updatedAt ?? "missing"}\``,
      `- Guilds: \`${agent.guildCount}\``,
      `- Backend: \`${agent.backend ?? "missing"}\``,
      `- Summary: ${agent.summary}`,
      `- Source: \`${agent.sourcePath}\``,
      ...(agent.recentEvents.length > 0
        ? [
            "- Recent events:",
            ...agent.recentEvents.map(
              (event) =>
                `  - \`${event.at ?? "unknown"}\` | \`${event.status ?? "unknown"}\`${event.channelName ? ` @ \`#${event.channelName}\`` : ""} | ${event.summary ?? "no summary"}`
            )
          ]
        : ["- Recent events: none"]),
      ""
    ]),
    "## Operator State",
    "",
    `- Status: \`${report.operator.status}\``,
    `- Summary: ${report.operator.summary}`,
    `- Operator label: \`${report.operator.operatorLabel ?? "missing"}\``,
    `- Last action: \`${report.operator.lastAction ?? "none"}\``,
    `- Last summary: ${report.operator.lastSummary ?? "none"}`,
    `- Last completed: \`${report.operator.lastCompletedAt ?? "none"}\``,
    `- Active process present: \`${report.operator.activeProcessPresent}\``,
    `- Source: \`${report.operator.sourcePath}\``,
    "",
    "## Evidence",
    "",
    `- OpenJaws root: \`${report.evidence.openjawsRoot}\``,
    `- Shared readiness receipt: \`${report.evidence.readinessPath}\``,
    `- Aggregate Discord/Q receipt: \`${report.evidence.aggregateReceiptPath}\``,
    `- Roundtable state: \`${report.evidence.roundtableStatePath}\``,
    `- Roundtable session: \`${report.evidence.roundtableSessionPath}\``,
    ...report.evidence.roundtableActionReceiptPaths.map((entry) => `- Roundtable action receipt: \`${entry}\``),
    ...report.evidence.botReceiptPaths.map((entry) => `- Bot receipt: \`${entry}\``),
    `- Operator state: \`${report.evidence.operatorStatePath}\``,
    "",
    "## Truth Boundary",
    "",
    ...report.truthBoundary.map((entry) => `- ${entry}`)
  ].join("\n");
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const readinessPath = path.join(WIKI_ROOT, "Live-Mission-Readiness.json");
  const aggregateReceiptPath = path.join(
    OPENJAWS_ROOT,
    "local-command-station",
    "discord-q-agent-receipt.json"
  );
  const operatorStatePath = path.join(
    OPENJAWS_ROOT,
    "local-command-station",
    "openjaws-operator-state.json"
  );
  const roundtableStatePath = path.join(
    OPENJAWS_ROOT,
    "local-command-station",
    "roundtable-runtime",
    "discord-roundtable.state.json"
  );
  const roundtableSessionPath = path.join(
    OPENJAWS_ROOT,
    "local-command-station",
    "roundtable-runtime",
    "discord-roundtable.session.json"
  );
  const roundtableActionsRoot = path.join(
    OPENJAWS_ROOT,
    "local-command-station",
    "roundtable-runtime",
    "actions"
  );
  const botReceiptPaths = DEFAULT_BOT_IDS.map((botId) =>
    path.join(
      OPENJAWS_ROOT,
      "local-command-station",
      "bots",
      botId,
      "discord-agent-receipt.json"
    )
  );

  const [
    readinessReceipt,
    aggregateReceipt,
    operatorState,
    roundtableState,
    roundtableSession,
    ...botReceipts
  ] = await Promise.all([
    readJsonFile<LiveMissionReadinessReceipt>(readinessPath),
    readJsonFile<DiscordAgentReceipt>(aggregateReceiptPath),
    readJsonFile<OpenJawsOperatorState>(operatorStatePath),
    readJsonFile<RoundtableStateReceipt>(roundtableStatePath),
    readJsonFile<RoundtableSessionReceipt>(roundtableSessionPath),
    ...botReceiptPaths.map((receiptPath) => readJsonFile<DiscordAgentReceipt>(receiptPath))
  ]);

  const readiness = readinessReceipt?.readiness;
  if (!isHarnessReadinessSummary(readiness)) {
    throw new Error(
      "Live mission readiness receipt missing or invalid; run live:mission:readiness first."
    );
  }

  const roundtableActions = await readRoundtableActionSummaries(roundtableActionsRoot);
  const agents = botReceipts.map((receipt, index) =>
    buildAgentSummary({
      label: resolveBotLabel(DEFAULT_BOT_IDS[index] ?? "", index),
      receipt,
      sourcePath: botReceiptPaths[index] ?? aggregateReceiptPath
    })
  );

  const qPatrolStatus: ActivityLaneStatus =
    aggregateReceipt?.status === "ready" &&
    aggregateReceipt?.gateway?.connected === true &&
    Boolean(aggregateReceipt?.routing?.lastDecision || aggregateReceipt?.events?.length)
      ? "ready"
      : "blocked";

  const operatorStatus: ActivityLaneStatus =
    Boolean(aggregateReceipt?.operator?.lastAction) || typeof operatorState?.pid === "number"
      ? "ready"
      : "blocked";

  const roundtableStatus: ActivityLaneStatus =
    roundtableState?.status === "running" || roundtableActions.length > 0 ? "ready" : "blocked";

  const roundtableBlockedJobs =
    roundtableState?.jobs?.filter(
      (job) =>
        job.status?.toLowerCase() === "blocked" ||
        job.approvalState?.toLowerCase() === "rejected"
    ).length ?? 0;

  const report: LiveOperatorActivityReport = {
    generatedAt: new Date().toISOString(),
    release,
    publication: {
      status:
        readiness.ledger.public.ready &&
        readiness.q.oci.ready &&
        readiness.discord.transport.ready
          ? "publishable"
          : "blocked",
      publicLedgerReady: readiness.ledger.public.ready,
      summary:
        readiness.ledger.public.ready &&
        readiness.q.oci.ready &&
        readiness.discord.transport.ready
          ? "shared public ledger, Discord transport, and OCI-backed Q are all ready, so this activity feed is eligible for supervised publication"
          : "public publication is blocked until the public ledger, Discord transport, and OCI-backed Q all prove readiness on the current workstation"
    },
    qPatrol: {
      status: qPatrolStatus,
      summary:
        aggregateReceipt?.routing?.lastDecision?.trim() ||
        aggregateReceipt?.patrol?.lastSummary?.trim() ||
        "aggregate Q patrol receipt missing recent routing or patrol state",
      sourcePath: formatEvidencePath(aggregateReceiptPath),
      lastDecision: aggregateReceipt?.routing?.lastDecision,
      lastPostedChannelName: aggregateReceipt?.routing?.lastPostedChannelName,
      lastSummary: aggregateReceipt?.patrol?.lastSummary,
      queueLength: aggregateReceipt?.patrol?.snapshot?.queueLength,
      recommendedLayerId: aggregateReceipt?.patrol?.snapshot?.recommendedLayerId
    },
    roundtable: {
      status: roundtableStatus,
      summary: [
        roundtableState?.status?.trim() || "missing",
        roundtableSession?.lastSummary?.trim() || roundtableState?.lastSummary?.trim(),
        typeof roundtableSession?.turnCount === "number"
          ? `${roundtableSession.turnCount} turns`
          : undefined,
        roundtableActions.length > 0
          ? `${roundtableActions.filter((action) => action.verificationPassed).length}/${roundtableActions.length} recent actions passed verification`
          : "no recent bounded action receipts",
        roundtableBlockedJobs > 0 ? `${roundtableBlockedJobs} blocked job(s)` : undefined
      ]
        .filter((value): value is string => Boolean(value && value.length > 0))
        .join(" | "),
      sourcePath: formatEvidencePath(roundtableStatePath),
      sessionSourcePath: formatEvidencePath(roundtableSessionPath),
      channelName:
        roundtableSession?.roundtableChannelName ?? roundtableState?.roundtableChannelName ?? null,
      sessionStatus: roundtableSession?.status ?? roundtableState?.status,
      turnCount: roundtableSession?.turnCount,
      nextPersona: roundtableSession?.nextPersona,
      lastSpeaker: roundtableSession?.lastSpeaker,
      lastSummary: roundtableSession?.lastSummary ?? roundtableState?.lastSummary,
      actionReceiptCount: roundtableActions.length,
      actions: roundtableActions.slice(0, 3)
    },
    agents,
    operator: {
      status: operatorStatus,
      summary: [
        aggregateReceipt?.operator?.operatorLabel?.trim(),
        aggregateReceipt?.operator?.lastAction?.trim(),
        aggregateReceipt?.operator?.lastSummary?.trim(),
        typeof operatorState?.pid === "number" ? "active process present" : undefined
      ]
        .filter((value): value is string => Boolean(value && value.length > 0))
        .join(" | ") || "operator state file is present but no recent operator activity is recorded",
      sourcePath: formatEvidencePath(operatorStatePath),
      operatorLabel: aggregateReceipt?.operator?.operatorLabel,
      lastAction: aggregateReceipt?.operator?.lastAction,
      lastSummary: aggregateReceipt?.operator?.lastSummary,
      lastCompletedAt: aggregateReceipt?.operator?.lastCompletedAt,
      activeProcessPresent: typeof operatorState?.pid === "number"
    },
    readiness,
    evidence: {
      openjawsRoot: "openjaws",
      readinessPath: formatEvidencePath(readinessPath),
      aggregateReceiptPath: formatEvidencePath(aggregateReceiptPath),
      roundtableStatePath: formatEvidencePath(roundtableStatePath),
      roundtableSessionPath: formatEvidencePath(roundtableSessionPath),
      roundtableActionReceiptPaths: roundtableActions.map((entry) => entry.sourcePath),
      botReceiptPaths: botReceiptPaths
        .filter((filePath) => existsSync(filePath))
        .map((filePath) => formatEvidencePath(filePath)),
      operatorStatePath: formatEvidencePath(operatorStatePath)
    },
    truthBoundary: [
      "This page reflects local OpenJaws receipt files and operator state, not a fresh public-ledger publication proof by itself.",
      "Discord transport presence does not imply a live Discord operator command was executed during this pass.",
      "The aggregate Q receipt is authoritative for the patrol/routing loop; per-bot receipts are supporting transport evidence.",
      "Roundtable state and action receipts summarize bounded job outcomes only; they do not expose worktree paths, prompts, private channel IDs, or raw workspace diffs.",
      "Public publication stays blocked until the live mission readiness gate proves ledger.public, q.oci, and discord.transport together."
    ],
    output: {
      jsonPath: "docs/wiki/Live-Operator-Activity.json",
      markdownPath: "docs/wiki/Live-Operator-Activity.md"
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(
    path.join(REPO_ROOT, report.output.jsonPath),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(REPO_ROOT, report.output.markdownPath),
    `${renderMarkdown(report)}\n`,
    "utf8"
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    error instanceof Error ? error.message : "Live operator activity generation failed."
  );
  process.exitCode = 1;
});
