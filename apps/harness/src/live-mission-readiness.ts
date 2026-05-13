import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  resolveHarnessReadiness,
  resolveReleaseMetadata,
  type HarnessReadinessLane,
  type HarnessReadinessSummary,
  type ReleaseMetadata
} from "./release-metadata.js";

type RoundtableRuntimeReceipt = {
  generatedAt?: string;
  benchmark?: {
    failedAssertions?: number;
  };
  readiness?: {
    q?: {
      local?: HarnessReadinessLane;
    };
  };
};

type ArobiLiveLedgerReceipt = {
  generatedAt?: string;
  liveNode?: {
    apiBaseUrl?: string;
    version?: string | null;
    fabricSource?: string | null;
  };
  latestLocalRerun?: {
    outputDir?: string;
  };
  proof?: {
    liveRecordVisible?: boolean;
    publicEntryDelta?: number;
    privateEntryDelta?: number;
  };
};

type ArobiVerifiedRepairReport = {
  totalEntries?: number;
  finalVerification?: {
    ok?: boolean;
  };
};

export type ArobiMissionTreasuryStatus = {
  treasury_wallet?: string;
  pool_balance?: number;
  pool_balance_aura?: number;
  control_mode?: string;
  wallet_issue?: string;
};

type DiscordQAgentReceipt = {
  updatedAt?: string;
  status?: string;
  backend?: string;
  gateway?: {
    connected?: boolean;
    guildCount?: number;
    readyAt?: string;
    lastHeartbeatAt?: string;
  };
};

type SimpleHttpProbe = {
  status?: number;
  ok: boolean;
  body?: string;
  error?: string;
};

type LiveMissionReadinessReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  readiness: HarnessReadinessSummary;
  evidence: {
    roundtableRuntimePath: string;
    arobiLiveLedgerPath: string;
    discordAgentReceiptPath: string;
    discordAgentHealthUrl: string;
    arobiVerifiedTreasuryUrl: string;
    openjawsRoot: string;
    roundtableRuntimeGeneratedAt?: string;
    arobiLiveLedgerGeneratedAt?: string;
    discordAgentReceiptUpdatedAt?: string;
    qOciBackend?: string;
    discordHealth: SimpleHttpProbe;
    arobiLocalPublicReady: boolean;
    arobiLocalPrivateReady: boolean;
    arobiVerifiedTreasuryControlMode?: string;
    arobiVerifiedTreasuryGovernanceReady: boolean;
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
const DEFAULT_OPENJAWS_ROOT = "D:\\openjaws\\OpenJaws";
const ACTIVE_OPENJAWS_ROOT = process.env.OPENJAWS_ROOT?.trim() || DEFAULT_OPENJAWS_ROOT;
const DEFAULT_DISCORD_AGENT_HEALTH_URL =
  process.env.OPENJAWS_DISCORD_Q_AGENT_HEALTH_URL?.trim() || "http://127.0.0.1:8788/health";
const DISCORD_RECEIPT_STALE_AFTER_MS = Math.max(
  60_000,
  Number(process.env.OPENJAWS_DISCORD_Q_AGENT_STALE_AFTER_MS ?? 15 * 60 * 1000) || 15 * 60 * 1000
);
const DEFAULT_AROBI_ROOT = process.env.AROBI_ROOT?.trim() || "C:\\Users\\Knight\\.arobi";
const DEFAULT_AROBI_VERIFIED_ROOT =
  process.env.AROBI_PRIVATE_VERIFIED_ROOT?.trim() ||
  path.join(DEFAULT_AROBI_ROOT, "public-chain-verified");
const DEFAULT_AROBI_VERIFIED_BASE_URL =
  process.env.AROBI_PRIVATE_VERIFIED_BASE_URL?.trim() || "http://127.0.0.1:8101";
const DEFAULT_AROBI_VERIFIED_TREASURY_URL = `${DEFAULT_AROBI_VERIFIED_BASE_URL.replace(/\/+$/u, "")}/api/v1/autonomo/mission/treasury`;

function normalizeOptionalValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizePathKey(value: string): string {
  return path.resolve(value).replaceAll("\\", "/").toLowerCase();
}

function formatEvidencePath(filePath: string | undefined): string | undefined {
  const candidate = normalizeOptionalValue(filePath);
  if (!candidate) {
    return undefined;
  }
  const resolved = path.resolve(candidate);
  const roots = [
    { label: "immaculate", root: REPO_ROOT },
    { label: "openjaws", root: ACTIVE_OPENJAWS_ROOT },
    { label: "arobi", root: DEFAULT_AROBI_ROOT },
    { label: "arobi-private", root: DEFAULT_AROBI_VERIFIED_ROOT }
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
  return candidate;
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

function parseIsoMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatAgeDetail(timestamp: string | undefined, maxAgeMs: number): string {
  const parsed = parseIsoMs(timestamp);
  if (parsed === undefined) {
    return "timestamp unavailable";
  }
  const ageMs = Math.max(0, Date.now() - parsed);
  return `updated ${Math.round(ageMs / 1000)}s ago (budget ${Math.round(maxAgeMs / 1000)}s)`;
}

function extractBackendUrl(backend: string | undefined): string | undefined {
  const candidate = normalizeOptionalValue(backend);
  if (!candidate) {
    return undefined;
  }
  const match = candidate.match(/\((https?:\/\/[^)]+)\)/u);
  return normalizeOptionalValue(match?.[1]);
}

function backendLooksLikeOciQ(backend: string | undefined): boolean {
  const candidate = backend?.toLowerCase();
  return Boolean(candidate && candidate.includes("oci:q"));
}

async function probeHttp(url: string): Promise<SimpleHttpProbe> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Immaculate-Live-Mission-Readiness"
      }
    });
    const body = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      body: body.trim()
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "request failed"
    };
  }
}

async function probeJson<T>(url: string): Promise<T | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Immaculate-Live-Mission-Readiness"
      }
    });
    if (!response.ok) {
      return undefined;
    }
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function describeLedgerPublic(readiness: {
  receipt: ArobiLiveLedgerReceipt | undefined;
  localReady: boolean;
}): { endpoint?: string; ready?: boolean; detail: string } {
  const endpoint = normalizeOptionalValue(readiness.receipt?.liveNode?.apiBaseUrl);
  const liveRecordVisible = readiness.receipt?.proof?.liveRecordVisible === true;
  const publicDelta = readiness.receipt?.proof?.publicEntryDelta;
  const fabricSource = readiness.receipt?.liveNode?.fabricSource;
  const version = readiness.receipt?.liveNode?.version ?? "unknown";
  if (liveRecordVisible && readiness.localReady) {
    return {
      endpoint,
      ready: true,
      detail: `public edge surfaced a fresh governed audit record on live ${version} and the local public node contract is configured`
    };
  }
  if (fabricSource === "synthesized") {
    return {
      endpoint,
      ready: false,
      detail: `public edge is synthesized/offline; latest supervised rerun public delta was ${publicDelta ?? "unknown"} while local public node readiness is ${readiness.localReady}`
    };
  }
  return {
    endpoint,
    ready: false,
    detail: `public edge did not surface a fresh governed audit record (delta ${publicDelta ?? "unknown"}) and local public node readiness is ${readiness.localReady}`
  };
}

export function isArobiGovernanceTreasuryReady(
  treasuryStatus: ArobiMissionTreasuryStatus | undefined
): boolean {
  if (treasuryStatus?.control_mode !== "governance_release") {
    return false;
  }
  const wallet = normalizeOptionalValue(treasuryStatus.treasury_wallet);
  const poolBalanceAura = treasuryStatus.pool_balance_aura;
  const poolBalance = treasuryStatus.pool_balance;
  const positiveBalance =
    (typeof poolBalanceAura === "number" && poolBalanceAura > 0) ||
    (typeof poolBalance === "number" && poolBalance > 0);
  return Boolean(wallet) && positiveBalance;
}

export function resolveArobiLocalPrivateReadiness(options: {
  repairOk?: boolean;
  verifiedAuditLedgerCount: number;
  verifiedLog: string | undefined;
  treasuryStatus?: ArobiMissionTreasuryStatus;
}): {
  ready: boolean;
  signerBlocked: boolean;
  treasuryGovernanceReady: boolean;
} {
  const verifiedLog = options.verifiedLog ?? "";
  const signerBlocked = verifiedLog.includes("Mission treasury signer disabled");
  const treasuryGovernanceReady = isArobiGovernanceTreasuryReady(options.treasuryStatus);
  const ready =
    options.repairOk === true &&
    options.verifiedAuditLedgerCount > 0 &&
    verifiedLog.includes("Loaded ") &&
    verifiedLog.includes("AI Decision Audit Ledger initialized") &&
    verifiedLog.includes("API server on") &&
    (!signerBlocked || treasuryGovernanceReady);
  return {
    ready,
    signerBlocked,
    treasuryGovernanceReady
  };
}

export function describeLedgerPrivate(readiness: {
  receipt: ArobiLiveLedgerReceipt | undefined;
  localReady: boolean;
  signerBlocked: boolean;
  treasuryGovernanceReady?: boolean;
}): { endpoint?: string; ready?: boolean; detail: string } {
  const endpoint =
    formatEvidencePath(readiness.receipt?.latestLocalRerun?.outputDir) ??
    formatEvidencePath(DEFAULT_AROBI_VERIFIED_ROOT);
  const privateDelta = readiness.receipt?.proof?.privateEntryDelta;
  const advanced =
    typeof privateDelta === "number" && privateDelta > 0 && readiness.localReady;
  if (advanced && readiness.signerBlocked && readiness.treasuryGovernanceReady === true) {
    return {
      endpoint,
      ready: true,
      detail: `latest supervised rerun advanced the private ledger by ${privateDelta}; verified private node is governance-controlled, so the legacy mission treasury wallet warning is non-blocking`
    };
  }
  return {
    endpoint,
    ready: advanced && !readiness.signerBlocked,
    detail: readiness.signerBlocked
      ? `verified private node is blocked by mission treasury signer mismatch despite rerun delta ${privateDelta ?? "unknown"}`
      : advanced
        ? `latest supervised rerun advanced the private ledger by ${privateDelta} and the verified private node contract is intact`
        : `latest supervised rerun did not prove private ledger advance (delta ${privateDelta ?? "unknown"}) or the verified private node contract is incomplete`
  };
}

function describeQOci(readiness: {
  receipt: DiscordQAgentReceipt | undefined;
  healthUrl: string;
  health: SimpleHttpProbe;
}): { endpoint?: string; ready?: boolean; detail: string } {
  const backend = normalizeOptionalValue(readiness.receipt?.backend);
  const endpoint = extractBackendUrl(backend) ?? backend;
  const gatewayConnected = readiness.receipt?.gateway?.connected === true;
  const guildCount = readiness.receipt?.gateway?.guildCount ?? 0;
  const readyStatus = readiness.receipt?.status === "ready";
  const receiptFresh =
    (parseIsoMs(readiness.receipt?.gateway?.lastHeartbeatAt) ??
      parseIsoMs(readiness.receipt?.updatedAt)) !== undefined &&
    Date.now() -
      (parseIsoMs(readiness.receipt?.gateway?.lastHeartbeatAt) ??
        parseIsoMs(readiness.receipt?.updatedAt) ??
        0) <=
      DISCORD_RECEIPT_STALE_AFTER_MS;
  const healthy =
    readyStatus &&
    gatewayConnected &&
    guildCount > 0 &&
    backendLooksLikeOciQ(backend) &&
    readiness.health.ok &&
    receiptFresh;
  const healthLabel =
    readiness.health.status !== undefined
      ? `health ${readiness.health.status}`
      : `health error ${readiness.health.error ?? "unknown"}`;
  const staleness = formatAgeDetail(
    readiness.receipt?.gateway?.lastHeartbeatAt ?? readiness.receipt?.updatedAt,
    DISCORD_RECEIPT_STALE_AFTER_MS
  );
  return {
    endpoint,
    ready: healthy,
    detail: backend
      ? `Discord Q receipt reports ${backend}; gateway=${gatewayConnected}; guilds=${guildCount}; ${healthLabel}; ${staleness}`
      : `Discord Q receipt did not report an OCI backend; ${healthLabel}; ${staleness}`
  };
}

function describeDiscordTransport(readiness: {
  receipt: DiscordQAgentReceipt | undefined;
  healthUrl: string;
  health: SimpleHttpProbe;
}): { endpoint?: string; ready?: boolean; detail: string } {
  const gatewayConnected = readiness.receipt?.gateway?.connected === true;
  const guildCount = readiness.receipt?.gateway?.guildCount ?? 0;
  const readyStatus = readiness.receipt?.status === "ready";
  const lastHeartbeatAt = readiness.receipt?.gateway?.lastHeartbeatAt ?? readiness.receipt?.updatedAt;
  const receiptFresh =
    parseIsoMs(lastHeartbeatAt) !== undefined &&
    Date.now() - (parseIsoMs(lastHeartbeatAt) ?? 0) <= DISCORD_RECEIPT_STALE_AFTER_MS;
  const healthy = readyStatus && gatewayConnected && guildCount > 0 && readiness.health.ok && receiptFresh;
  const healthLabel =
    readiness.health.status !== undefined
      ? `health ${readiness.health.status}`
      : `health error ${readiness.health.error ?? "unknown"}`;
  return {
    endpoint: readiness.healthUrl,
    ready: healthy,
    detail: `status=${readiness.receipt?.status ?? "unknown"}; gateway=${gatewayConnected}; guilds=${guildCount}; ${healthLabel}; ${formatAgeDetail(lastHeartbeatAt, DISCORD_RECEIPT_STALE_AFTER_MS)}`
  };
}

function renderMarkdown(report: LiveMissionReadinessReport): string {
  return [
    "# Live Mission Readiness",
    "",
    "This page is the machine-stamped live mission gate for the current workstation. It compresses the current proof signals for the shared ledger, local Q, OCI-backed Q, and Discord transport into one operator-facing readiness contract.",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
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
    "## Evidence Sources",
    "",
    `- Roundtable runtime receipt: \`${report.evidence.roundtableRuntimePath}\` @ \`${report.evidence.roundtableRuntimeGeneratedAt ?? "missing"}\``,
    `- Arobi live ledger receipt: \`${report.evidence.arobiLiveLedgerPath}\` @ \`${report.evidence.arobiLiveLedgerGeneratedAt ?? "missing"}\``,
    `- Discord agent receipt: \`${report.evidence.discordAgentReceiptPath}\` @ \`${report.evidence.discordAgentReceiptUpdatedAt ?? "missing"}\``,
    `- Discord agent health: \`${report.evidence.discordAgentHealthUrl}\` -> \`${report.evidence.discordHealth.status ?? "error"}\`${report.evidence.discordHealth.body ? ` | ${report.evidence.discordHealth.body}` : report.evidence.discordHealth.error ? ` | ${report.evidence.discordHealth.error}` : ""}`,
    `- Verified Arobi treasury control: \`${report.evidence.arobiVerifiedTreasuryControlMode ?? "missing"}\` @ \`${report.evidence.arobiVerifiedTreasuryUrl}\` | governance ready \`${report.evidence.arobiVerifiedTreasuryGovernanceReady}\``,
    `- OpenJaws root: \`${report.evidence.openjawsRoot}\``,
    `- Receipt-backed OCI backend: \`${report.evidence.qOciBackend ?? "missing"}\``,
    `- Local Arobi public-ready markers: \`${report.evidence.arobiLocalPublicReady}\``,
    `- Local Arobi private-ready markers: \`${report.evidence.arobiLocalPrivateReady}\``,
    "",
    "## Truth Boundary",
    "",
    ...report.truthBoundary.map((entry) => `- ${entry}`)
  ].join("\n");
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const openjawsRoot = ACTIVE_OPENJAWS_ROOT;
  const roundtableRuntimePath = path.join(REPO_ROOT, "docs", "wiki", "Roundtable-Runtime.json");
  const arobiLiveLedgerPath = path.join(REPO_ROOT, "docs", "wiki", "Arobi-Live-Ledger-Receipt.json");
  const discordAgentReceiptPath = path.join(openjawsRoot, "local-command-station", "discord-q-agent-receipt.json");
  const arobiAdvertisePath = path.join(DEFAULT_AROBI_ROOT, "advertise.txt");
  const arobiSeedsPath = path.join(DEFAULT_AROBI_ROOT, "seeds.txt");
  const arobiRestartLogPath = path.join(DEFAULT_AROBI_ROOT, "logs", "restart-main-node.log");
  const arobiManualStartLogPath = path.join(DEFAULT_AROBI_ROOT, "manual-start.out.log");
  const arobiVerifiedRepairReportPath = path.join(DEFAULT_AROBI_VERIFIED_ROOT, "repair-report.json");
  const arobiVerifiedAuditLedgerPath = path.join(DEFAULT_AROBI_VERIFIED_ROOT, "audit_ledger.json");
  const arobiVerifiedLogPath = path.join(DEFAULT_AROBI_VERIFIED_ROOT, "logs", "verified-node.log");

  const [
    roundtableRuntime,
    arobiLiveLedger,
    discordAgentReceipt,
    discordHealth,
    arobiAdvertise,
    arobiSeeds,
    arobiRestartLog,
    arobiManualStartLog,
    arobiVerifiedRepairReport,
    arobiVerifiedAuditLedgerRaw,
    arobiVerifiedLog,
    arobiVerifiedTreasuryStatus
  ] = await Promise.all([
    readJsonFile<RoundtableRuntimeReceipt>(roundtableRuntimePath),
    readJsonFile<ArobiLiveLedgerReceipt>(arobiLiveLedgerPath),
    readJsonFile<DiscordQAgentReceipt>(discordAgentReceiptPath),
    probeHttp(DEFAULT_DISCORD_AGENT_HEALTH_URL),
    readOptionalText(arobiAdvertisePath),
    readOptionalText(arobiSeedsPath),
    readOptionalText(arobiRestartLogPath),
    readOptionalText(arobiManualStartLogPath),
    readJsonFile<ArobiVerifiedRepairReport>(arobiVerifiedRepairReportPath),
    readOptionalText(arobiVerifiedAuditLedgerPath),
    readOptionalText(arobiVerifiedLogPath),
    probeJson<ArobiMissionTreasuryStatus>(DEFAULT_AROBI_VERIFIED_TREASURY_URL)
  ]);

  const publicLogs = `${arobiRestartLog ?? ""}\n${arobiManualStartLog ?? ""}`;
  const arobiLocalPublicReady =
    Boolean(normalizeOptionalValue(arobiAdvertise)) &&
    Boolean(normalizeOptionalValue(arobiSeeds)) &&
    publicLogs.includes("P2P listening") &&
    publicLogs.includes("API server on") &&
    publicLogs.includes("Block ");
  const verifiedAuditLedgerCount = (() => {
    try {
      const parsed = JSON.parse(arobiVerifiedAuditLedgerRaw ?? "[]") as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  })();
  const arobiPrivateReadiness = resolveArobiLocalPrivateReadiness({
    repairOk: arobiVerifiedRepairReport?.finalVerification?.ok,
    verifiedAuditLedgerCount,
    verifiedLog: arobiVerifiedLog,
    treasuryStatus: arobiVerifiedTreasuryStatus
  });
  const arobiPrivateSignerBlocked = arobiPrivateReadiness.signerBlocked;
  const arobiLocalPrivateReady = arobiPrivateReadiness.ready;

  const publicLedger = describeLedgerPublic({
    receipt: arobiLiveLedger,
    localReady: arobiLocalPublicReady
  });
  const privateLedger = describeLedgerPrivate({
    receipt: arobiLiveLedger,
    localReady: arobiLocalPrivateReady,
    signerBlocked: arobiPrivateSignerBlocked,
    treasuryGovernanceReady: arobiPrivateReadiness.treasuryGovernanceReady
  });
  const qLocalLane = roundtableRuntime?.readiness?.q?.local;
  const qOci = describeQOci({
    receipt: discordAgentReceipt,
    healthUrl: DEFAULT_DISCORD_AGENT_HEALTH_URL,
    health: discordHealth
  });
  const discordTransport = describeDiscordTransport({
    receipt: discordAgentReceipt,
    healthUrl: DEFAULT_DISCORD_AGENT_HEALTH_URL,
    health: discordHealth
  });

  const readiness = resolveHarnessReadiness({
    publicLedgerBaseUrl: publicLedger.endpoint,
    privateLedgerBaseUrl: privateLedger.endpoint,
    publicLedgerAdvanced: publicLedger.ready,
    privateLedgerAdvanced: privateLedger.ready,
    publicLedgerDetail: publicLedger.detail,
    privateLedgerDetail: privateLedger.detail,
    qLocalEndpoint: qLocalLane?.endpoint,
    qLocalHealthy:
      qLocalLane?.ready === true &&
      (roundtableRuntime?.benchmark?.failedAssertions ?? Number.POSITIVE_INFINITY) === 0,
    qLocalDetail:
      qLocalLane?.detail ??
      "roundtable runtime receipt missing local Q readiness detail for this pass",
    qOciEndpoint: qOci.endpoint,
    qOciHealthy: qOci.ready,
    qOciDetail: qOci.detail,
    discordTransportEndpoint: discordTransport.endpoint,
    discordTransportHealthy: discordTransport.ready,
    discordTransportDetail: discordTransport.detail
  });

  const report: LiveMissionReadinessReport = {
    generatedAt: new Date().toISOString(),
    release,
    readiness,
    evidence: {
      roundtableRuntimePath: path.relative(REPO_ROOT, roundtableRuntimePath).replaceAll("\\", "/"),
      arobiLiveLedgerPath: path.relative(REPO_ROOT, arobiLiveLedgerPath).replaceAll("\\", "/"),
      discordAgentReceiptPath:
        formatEvidencePath(discordAgentReceiptPath) ?? discordAgentReceiptPath,
      discordAgentHealthUrl: DEFAULT_DISCORD_AGENT_HEALTH_URL,
      arobiVerifiedTreasuryUrl: DEFAULT_AROBI_VERIFIED_TREASURY_URL,
      openjawsRoot: formatEvidencePath(openjawsRoot) ?? openjawsRoot,
      roundtableRuntimeGeneratedAt: roundtableRuntime?.generatedAt,
      arobiLiveLedgerGeneratedAt: arobiLiveLedger?.generatedAt,
      discordAgentReceiptUpdatedAt: discordAgentReceipt?.updatedAt,
      qOciBackend: discordAgentReceipt?.backend,
      discordHealth,
      arobiLocalPublicReady,
      arobiLocalPrivateReady,
      arobiVerifiedTreasuryControlMode: arobiVerifiedTreasuryStatus?.control_mode,
      arobiVerifiedTreasuryGovernanceReady: arobiPrivateReadiness.treasuryGovernanceReady
    },
    truthBoundary: [
      "This page is a readiness receipt, not proof that a live Discord operator command or multi-subsystem mission was executed.",
      "q.local is taken from the latest machine-stamped roundtable runtime receipt and remains blocked if that receipt is missing or failed.",
      "q.oci is receipt-backed from the live Discord Q agent runtime plus the local health endpoint; it is not a fresh direct provider probe unless a separate OCI probe surface says so explicitly.",
      "ledger.public is only ready when the public aura-genesis edge surfaced a fresh governed audit record, not merely when the public read endpoints responded.",
      "ledger.private is only ready when the latest supervised rerun proved private ledger advance and the verified node proves either a valid signer path or governance_release treasury control.",
      "This page does not expose secrets, Discord tokens, OCI keys, or private ledger payloads."
    ],
    output: {
      jsonPath: path.join("docs", "wiki", "Live-Mission-Readiness.json"),
      markdownPath: path.join("docs", "wiki", "Live-Mission-Readiness.md")
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
    process.stderr.write(error instanceof Error ? error.message : "Live mission readiness generation failed.");
    process.exitCode = 1;
  });
}
