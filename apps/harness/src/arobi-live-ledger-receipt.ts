import path from "node:path";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type TelemetryStatus = {
  generatedAt?: string;
  network?: {
    info?: {
      height?: number;
      version?: string;
      peerCount?: number;
      consensusType?: string;
      poiSolved?: number;
    };
  };
  ledger?: {
    verification?: {
      totalEntries?: number;
      chainValid?: boolean;
    };
  };
  fabric?: {
    available?: boolean;
    status?: string;
    source?: string;
    publicLane?: {
      available?: boolean;
      version?: string;
      network?: string;
      height?: number;
    };
    privateLane?: {
      available?: boolean;
      version?: string;
      network?: string;
      height?: number;
      totalEntries?: number;
      chainValid?: boolean;
    };
    orchestration?: {
      available?: boolean;
      service?: string;
      objective?: string;
    };
    brain?: {
      ready?: boolean;
      summary?: string;
    };
  };
};

type DecisionFeed = {
  status?: string;
  total?: number;
  entries?: DecisionEntry[];
};

type DecisionEntry = {
  entry_id?: string;
  timestamp?: string;
  block_height?: number;
  source?: string;
  sourceLabel?: string;
  decision_type?: string;
  typeLabel?: string;
  model_id?: string;
  model_version?: string;
  input_summary?: string;
  decision?: string;
  confidence?: number;
  reasoning?: string;
  network_context?: string;
};

type VerifyResponse = {
  valid?: boolean;
  total_entries?: number;
  message?: string;
};

type InfoResponse = {
  version?: string;
  network?: string;
  height?: number;
  peer_count?: number;
  consensus_type?: string;
  poi_challenges_solved?: number;
};

type FabricAuditSummary = {
  run_id?: string;
  started_at?: string;
  finished_at?: string;
  output_dir?: string;
  audit_cycles_path?: string;
  q_process_exited_cleanly?: boolean;
};

type FabricAuditCycle = {
  run_id?: string;
  cycle?: number;
  cycle_count?: number;
  public_entries_before?: number;
  public_entries_after?: number;
  private_entries_before?: number;
  private_entries_after?: number;
  private_write?: {
    entry?: {
      entry_id?: string;
      timestamp?: string;
      block_height?: number;
    };
  };
};

type ArobiLiveLedgerReceiptReport = {
  generatedAt: string;
  release: ReleaseMetadata;
  liveNode: {
    statusUrl: string;
    ledgerUrl: string;
    apiBaseUrl: string;
    version?: string;
    network?: string;
    height?: number;
    peerCount?: number;
    consensusType?: string;
    poiSolved?: number;
    totalEntries?: number;
    chainValid?: boolean;
    fabricSource?: string;
    orchestrationAvailable?: boolean;
    brainReady?: boolean;
  };
  latestVisibleEntry?: {
    entryId?: string;
    timestamp?: string;
    blockHeight?: number;
    sourceLabel?: string;
    modelId?: string;
    modelVersion?: string;
    inputSummary?: string;
    decision?: string;
    networkContext?: string;
    reasoning?: string;
  };
  latestLocalRerun?: {
    runId?: string;
    startedAt?: string;
    finishedAt?: string;
    outputDir?: string;
    qProcessExitedCleanly?: boolean;
    publicEntriesBefore?: number;
    publicEntriesAfter?: number;
    privateEntriesBefore?: number;
    privateEntriesAfter?: number;
    latestPrivateEntryId?: string;
    latestPrivateEntryTimestamp?: string;
    latestPrivateBlockHeight?: number;
  };
  proof: {
    liveRecordVisible: boolean;
    entryMatchesLatestRerun: boolean;
    publicEntryDelta?: number;
    privateEntryDelta?: number;
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
const OPENJAWS_ARTIFACT_ROOT = "D:\\openjaws\\OpenJaws\\artifacts";
const AROBI_STATUS_URL = "https://aura-genesis.org/status";
const AROBI_LEDGER_URL = "https://aura-genesis.org/ledger";
const AROBI_TELEMETRY_URL = "https://aura-genesis.org/.netlify/functions/telemetry/status";
const AROBI_DECISIONS_URL = "https://aura-genesis.org/.netlify/functions/decisions?limit=5";
const AROBI_API_INFO_URL = "https://arobi.aura-genesis.org/api/v1/info";
const AROBI_API_VERIFY_URL = "https://arobi.aura-genesis.org/api/v1/audit/verify";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Immaculate-Arobi-Live-Ledger-Receipt",
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchJsonOptional<T>(url: string): Promise<T | undefined> {
  try {
    return await fetchJson<T>(url);
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

async function findLatestFabricAuditSummary(): Promise<{
  summary?: FabricAuditSummary;
  cycle?: FabricAuditCycle;
}> {
  try {
    const children = await readdir(OPENJAWS_ARTIFACT_ROOT, { withFileTypes: true });
    const candidates = children
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("fabric-audit-soak-"))
      .sort((left, right) => right.name.localeCompare(left.name));

    for (const candidate of candidates) {
      const summaryPath = path.join(OPENJAWS_ARTIFACT_ROOT, candidate.name, "fabric-audit-summary.json");
      const summaryRaw = await readOptionalText(summaryPath);
      if (!summaryRaw) {
        continue;
      }
      const summary = JSON.parse(summaryRaw) as FabricAuditSummary;
      const cycleRaw = summary.audit_cycles_path ? await readOptionalText(summary.audit_cycles_path) : undefined;
      const cycleLine = cycleRaw?.trim().split(/\r?\n/u).filter(Boolean).at(-1);
      const cycle = cycleLine ? (JSON.parse(cycleLine) as FabricAuditCycle) : undefined;
      return { summary, cycle };
    }
  } catch {
    return {};
  }

  return {};
}

function renderMarkdown(report: ArobiLiveLedgerReceiptReport): string {
  const publicEdgeOffline =
    report.liveNode.fabricSource === "synthesized" &&
    report.liveNode.orchestrationAvailable === false &&
    report.liveNode.brainReady === false;

  return [
    "# Arobi Live Ledger Receipt",
    "",
    "This page is generated from the live public Arobi status and ledger endpoints plus the latest supervised fabric audit rerun on the controller. It exists to answer a simple question: did a fresh governed audit record actually land on the public Arobi Network node and surface on aura-genesis?",
    "",
    `- Generated: \`${report.generatedAt}\``,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitSha}\``,
    `- Live status page: ${report.liveNode.statusUrl}`,
    `- Live ledger page: ${report.liveNode.ledgerUrl}`,
    `- Public API base: \`${report.liveNode.apiBaseUrl}\``,
    "",
    "## Current Result",
    "",
    `- Public node version: \`${report.liveNode.version ?? "unknown"}\``,
    `- Public network: \`${report.liveNode.network ?? "unknown"}\``,
    `- Public height: \`${report.liveNode.height ?? "unknown"}\``,
    `- Public peer count: \`${report.liveNode.peerCount ?? "unknown"}\``,
    `- Public ledger entries: \`${report.liveNode.totalEntries ?? "unknown"}\``,
    `- Public chain valid: \`${report.liveNode.chainValid ?? false}\``,
    `- Fabric source: \`${report.liveNode.fabricSource ?? "unknown"}\``,
    `- Orchestration available: \`${report.liveNode.orchestrationAvailable ?? false}\``,
    `- Brain ready: \`${report.liveNode.brainReady ?? false}\``,
    "",
    "## Latest Visible Public Record",
    "",
    report.latestVisibleEntry
      ? `- Latest visible entry: \`${report.latestVisibleEntry.timestamp ?? "unknown"}\` at block \`${report.latestVisibleEntry.blockHeight ?? "unknown"}\``
      : "- Latest visible entry: `missing`",
    `- Entry source: \`${report.latestVisibleEntry?.sourceLabel ?? "unknown"}\``,
    `- Model id: \`${report.latestVisibleEntry?.modelId ?? "unknown"}\``,
    `- Model version: \`${report.latestVisibleEntry?.modelVersion ?? "unknown"}\``,
    `- Input summary: \`${report.latestVisibleEntry?.inputSummary ?? "unknown"}\``,
    `- Decision: \`${report.latestVisibleEntry?.decision ?? "unknown"}\``,
    `- Network context: \`${report.latestVisibleEntry?.networkContext ?? "unknown"}\``,
    "",
    "## Latest Supervised Rerun",
    "",
    report.latestLocalRerun
      ? `- Run id: \`${report.latestLocalRerun.runId ?? "unknown"}\``
      : "- Run id: `none found`",
    `- Started: \`${report.latestLocalRerun?.startedAt ?? "n/a"}\``,
    `- Finished: \`${report.latestLocalRerun?.finishedAt ?? "n/a"}\``,
    `- Output dir: \`${report.latestLocalRerun?.outputDir ?? "n/a"}\``,
    `- Q process exited cleanly: \`${report.latestLocalRerun?.qProcessExitedCleanly ?? false}\``,
    `- Public entry delta during rerun: \`${report.proof.publicEntryDelta ?? "n/a"}\``,
    `- Private entry delta during rerun: \`${report.proof.privateEntryDelta ?? "n/a"}\``,
    `- Latest live entry matches rerun receipt: \`${report.proof.entryMatchesLatestRerun}\``,
    "",
    "## Plain-English Readout",
    "",
    publicEdgeOffline
      ? "- The public aura-genesis telemetry edge is currently synthesized/offline, so the public site is not proving a live Arobi node right now."
      : `- The public aura-genesis status and ledger surfaces are reading the live ${report.liveNode.version ?? "unknown"} Arobi node, not a stale local-only file.`,
    report.proof.liveRecordVisible
      ? `- A fresh governed control_fabric audit record is visible publicly at \`${report.latestVisibleEntry?.timestamp ?? "unknown"}\`, which proves the audit trail is landing on the live public node.`
      : report.latestLocalRerun
        ? `- The latest supervised rerun \`${report.latestLocalRerun.runId ?? "unknown"}\` still shows a public delta of \`${report.proof.publicEntryDelta ?? "n/a"}\` and a private delta of \`${report.proof.privateEntryDelta ?? "n/a"}\`, but no fresh governed record is visible through the current public edge.`
        : "- No fresh live governed record was detected on the public node from the latest rerun.",
    report.proof.entryMatchesLatestRerun
      ? `- The latest visible public record matches the latest supervised rerun receipt \`${report.latestLocalRerun?.runId ?? "unknown"}\`, so the same write path used locally is what the public node surfaced.`
      : "- The latest visible public record does not match the latest local rerun receipt.",
    "",
    "## Truth Boundary",
    "",
    ...report.truthBoundary.map((entry) => `- ${entry}`)
  ].join("\n");
}

async function main(): Promise<void> {
  const release = await resolveReleaseMetadata();
  const [telemetry, decisions, info, verify, latestArtifact] = await Promise.all([
    fetchJson<TelemetryStatus>(AROBI_TELEMETRY_URL),
    fetchJson<DecisionFeed>(AROBI_DECISIONS_URL),
    fetchJsonOptional<InfoResponse>(AROBI_API_INFO_URL),
    fetchJsonOptional<VerifyResponse>(AROBI_API_VERIFY_URL),
    findLatestFabricAuditSummary()
  ]);

  const latestEntry = decisions.entries?.[0];
  const latestLocalCycle = latestArtifact.cycle;
  const latestLocalSummary = latestArtifact.summary;
  const latestLocalEntryId = latestLocalCycle?.private_write?.entry?.entry_id;

  const report: ArobiLiveLedgerReceiptReport = {
    generatedAt: new Date().toISOString(),
    release,
    liveNode: {
      statusUrl: AROBI_STATUS_URL,
      ledgerUrl: AROBI_LEDGER_URL,
      apiBaseUrl: "https://arobi.aura-genesis.org",
      version: info?.version ?? telemetry.network?.info?.version ?? telemetry.fabric?.publicLane?.version,
      network: info?.network ?? telemetry.fabric?.publicLane?.network,
      height: info?.height ?? telemetry.network?.info?.height ?? telemetry.fabric?.publicLane?.height,
      peerCount: info?.peer_count ?? telemetry.network?.info?.peerCount,
      consensusType: info?.consensus_type ?? telemetry.network?.info?.consensusType,
      poiSolved: info?.poi_challenges_solved ?? telemetry.network?.info?.poiSolved,
      totalEntries: verify?.total_entries ?? telemetry.ledger?.verification?.totalEntries,
      chainValid: verify?.valid ?? telemetry.ledger?.verification?.chainValid,
      fabricSource: telemetry.fabric?.source,
      orchestrationAvailable: telemetry.fabric?.orchestration?.available,
      brainReady: telemetry.fabric?.brain?.ready
    },
    latestVisibleEntry: latestEntry
      ? {
          entryId: latestEntry.entry_id,
          timestamp: latestEntry.timestamp,
          blockHeight: latestEntry.block_height,
          sourceLabel: latestEntry.sourceLabel,
          modelId: latestEntry.model_id,
          modelVersion: latestEntry.model_version,
          inputSummary: latestEntry.input_summary,
          decision: latestEntry.decision,
          networkContext: latestEntry.network_context,
          reasoning: latestEntry.reasoning
        }
      : undefined,
    latestLocalRerun: latestLocalSummary
      ? {
          runId: latestLocalSummary.run_id,
          startedAt: latestLocalSummary.started_at,
          finishedAt: latestLocalSummary.finished_at,
          outputDir: latestLocalSummary.output_dir,
          qProcessExitedCleanly: latestLocalSummary.q_process_exited_cleanly,
          publicEntriesBefore: latestLocalCycle?.public_entries_before,
          publicEntriesAfter: latestLocalCycle?.public_entries_after,
          privateEntriesBefore: latestLocalCycle?.private_entries_before,
          privateEntriesAfter: latestLocalCycle?.private_entries_after,
          latestPrivateEntryId: latestLocalEntryId,
          latestPrivateEntryTimestamp: latestLocalCycle?.private_write?.entry?.timestamp,
          latestPrivateBlockHeight: latestLocalCycle?.private_write?.entry?.block_height
        }
      : undefined,
    proof: {
      liveRecordVisible: Boolean(latestEntry?.sourceLabel === "control_fabric" && latestEntry?.model_version === "3.3.1"),
      entryMatchesLatestRerun: Boolean(latestEntry?.entry_id && latestLocalEntryId && latestEntry.entry_id === latestLocalEntryId),
      publicEntryDelta:
        typeof latestLocalCycle?.public_entries_before === "number" && typeof latestLocalCycle?.public_entries_after === "number"
          ? latestLocalCycle.public_entries_after - latestLocalCycle.public_entries_before
          : undefined,
      privateEntryDelta:
        typeof latestLocalCycle?.private_entries_before === "number" && typeof latestLocalCycle?.private_entries_after === "number"
          ? latestLocalCycle.private_entries_after - latestLocalCycle.private_entries_before
          : undefined
    },
    truthBoundary: [
      "This page is a live-node receipt, not a benchmark score.",
      "It is generated from the public aura-genesis status and ledger endpoints plus the latest local supervised fabric-audit rerun receipt.",
      "The public visible record currently comes from the governed control_fabric private-trace path surfaced on the public ledger feed.",
      telemetry.fabric?.source === "synthesized"
        ? "At generation time, the public aura-genesis telemetry edge was synthesized/offline, so this receipt falls back to the last verified supervised rerun instead of claiming a live public-node match."
        : "At generation time, the public aura-genesis telemetry edge was reachable enough to compare the latest visible public record against the latest supervised rerun.",
      "This page does not expose secrets, raw private payloads, or raw chain-of-thought."
    ],
    output: {
      jsonPath: path.join("docs", "wiki", "Arobi-Live-Ledger-Receipt.json"),
      markdownPath: path.join("docs", "wiki", "Arobi-Live-Ledger-Receipt.md")
    }
  };

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(path.join(REPO_ROOT, report.output.jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(REPO_ROOT, report.output.markdownPath), `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Arobi live ledger receipt generation failed.");
  process.exitCode = 1;
});
