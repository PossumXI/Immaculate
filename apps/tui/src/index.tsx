import React, { useEffect, useState } from "react";
import {
  Box,
  Text,
  render,
  useApp,
  useInput,
  useWindowSize
} from "ink";
import {
  formatPercent,
  phaseIds,
  planeColor,
  type ConnectomeNode,
  type ControlEnvelope,
  type MultiAgentConversation,
  type PhasePass,
  type PhaseSnapshot
} from "@immaculate/core";

const harnessBaseUrl = process.env.IMMACULATE_HARNESS_URL ?? "http://127.0.0.1:8787";
const harnessApiKey = process.env.IMMACULATE_API_KEY;
const harnessWsUrlBase = process.env.IMMACULATE_HARNESS_WS_URL ?? "ws://127.0.0.1:8787/stream";
const liveNeuroWsUrlBase =
  process.env.IMMACULATE_NEURO_WS_URL ?? "ws://127.0.0.1:8787/stream/neuro/live";

type GovernanceRequest = {
  purpose: string[];
  policyId: string;
  consentScope: string;
  actor?: string;
};

type FocusPane = "nodes" | "passes" | "logs";
type PersistenceState = {
  recovered: boolean;
  recoveryMode: "fresh" | "checkpoint" | "checkpoint-replay" | "snapshot" | "replay";
  persistedEventCount: number;
  persistedHistoryCount: number;
  lastSnapshotAt?: string;
  checkpointCount: number;
  lastCheckpointId?: string;
  lastCheckpointEventId?: string;
  lastCheckpointAt?: string;
  integrityValid: boolean;
  integrityStatus?: "verified" | "degraded" | "invalid";
  integrityFindingCount: number;
  lastIntegrityCheckedAt?: string;
  invalidArtifactCount: number;
};

type WandbState = {
  mode: "online" | "offline" | "disabled";
  entity: string;
  project: string;
  ready: boolean;
  note: string;
};

type GovernanceState = {
  mode: "enforced";
  policyCount: number;
  decisionCount: number;
  deniedCount: number;
  lastDecisionAt?: string;
  lastDecisionId?: string;
};

type CognitiveExecutionTrace = {
  id: string;
  layerId: string;
  model: string;
  objective: string;
  status: "completed" | "failed";
  latencyMs: number;
  startedAt: string;
  completedAt: string;
  promptDigest: string;
  responsePreview: string;
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
  guardVerdict?: string;
};

type SnapshotWithConversations = PhaseSnapshot & {
  conversations?: MultiAgentConversation[];
};

function useAltScreen() {
  useEffect(() => {
    process.stdout.write("\u001B[?1049h");
    process.stdout.write("\u001B[?25l");

    return () => {
      process.stdout.write("\u001B[?25h");
      process.stdout.write("\u001B[?1049l");
    };
  }, []);
}

function withOperatorWsUrl(urlValue: string, governance?: GovernanceRequest): string {
  const nextUrl = new URL(urlValue);
  if (harnessApiKey) {
    nextUrl.searchParams.set("token", harnessApiKey);
  }
  if (governance) {
    nextUrl.searchParams.delete("purpose");
    for (const purpose of governance.purpose) {
      nextUrl.searchParams.append("purpose", purpose);
    }
    nextUrl.searchParams.set("policyId", governance.policyId);
    nextUrl.searchParams.set("consentScope", governance.consentScope);
    if (governance.actor) {
      nextUrl.searchParams.set("actor", governance.actor);
    }
  }
  return nextUrl.toString();
}

function summarizeRoutingDecision(
  decision?: PhaseSnapshot["routingDecisions"][number]
): string {
  if (!decision) {
    return "none";
  }

  const transportBits = [decision.transportKind, decision.transportHealth].filter(Boolean).join("/");
  const scoreBits = [
    typeof decision.transportPreferenceRank === "number" ? `#${decision.transportPreferenceRank}` : "",
    typeof decision.transportPreferenceScore === "number"
      ? decision.transportPreferenceScore.toFixed(1)
      : ""
  ]
    .filter(Boolean)
    .join("/");
  const rationale = decision.rationale.length > 74 ? `${decision.rationale.slice(0, 74)}…` : decision.rationale;

  return [
    decision.mode,
    decision.channel,
    decision.targetNodeId,
    transportBits,
    scoreBits,
    decision.governancePressure,
    rationale
  ]
    .filter(Boolean)
    .join(" · ");
}

function summarizeExecutionArbitration(
  arbitration?: PhaseSnapshot["executionArbitrations"][number]
): string {
  if (!arbitration) {
    return "none";
  }

  const layerBits = [arbitration.preferredLayerRole, arbitration.preferredLayerId]
    .filter(Boolean)
    .join("/");
  const rationale =
    arbitration.rationale.length > 74 ? `${arbitration.rationale.slice(0, 74)}…` : arbitration.rationale;

  return [
    arbitration.mode,
    arbitration.targetNodeId,
    arbitration.targetPlane,
    `cognition ${arbitration.shouldRunCognition ? "yes" : "no"}`,
    `dispatch ${arbitration.shouldDispatchActuation ? "yes" : "no"}`,
    layerBits,
    arbitration.governancePressure,
    rationale
  ]
    .filter(Boolean)
    .join(" · ");
}

function summarizeExecutionSchedule(
  schedule?: PhaseSnapshot["executionSchedules"][number]
): string {
  if (!schedule) {
    return "none";
  }

  const layerBits = [
    schedule.layerRoles.join(">"),
    schedule.primaryLayerId,
    `${schedule.layerIds.length} layer${schedule.layerIds.length === 1 ? "" : "s"}`
  ]
    .filter(Boolean)
    .join("/");
  const rationale =
    schedule.rationale.length > 74 ? `${schedule.rationale.slice(0, 74)}…` : schedule.rationale;

  return [
    schedule.mode,
    layerBits,
    `cognition ${schedule.shouldRunCognition ? "yes" : "no"}`,
    `dispatch ${schedule.shouldDispatchActuation ? "yes" : "no"}`,
    schedule.governancePressure,
    rationale
  ]
    .filter(Boolean)
    .join(" · ");
}

function summarizeNeuralCoupling(snapshot?: PhaseSnapshot | null): string {
  if (!snapshot) {
    return "none";
  }

  const { neuralCoupling } = snapshot;
  return [
    neuralCoupling.dominantBand,
    formatPercent(neuralCoupling.dominantRatio),
    `route ${formatPercent(neuralCoupling.phaseBias.route)}`,
    `feedback ${formatPercent(neuralCoupling.phaseBias.feedback)}`
  ]
    .filter(Boolean)
    .join(" · ");
}

function summarizeBandPower(frame?: PhaseSnapshot["neuroFrames"][number] | null): string {
  if (!frame?.bandPower) {
    return "band none";
  }

  return `${frame.bandPower.dominantBand} ${formatPercent(frame.bandPower.dominantRatio)}`;
}

function summarizeCognitiveTrace(execution?: CognitiveExecutionTrace): string {
  if (!execution) {
    return "none";
  }

  const parts = [
    execution.routeSuggestion,
    execution.reasonSummary,
    execution.commitStatement,
    execution.guardVerdict ? `guard=${execution.guardVerdict}` : ""
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .map((value) => (value.length > 60 ? `${value.slice(0, 60)}…` : value));

  return parts.length > 0 ? parts.join(" · ") : "trace pending";
}

function summarizeConversation(conversation?: MultiAgentConversation): string {
  if (!conversation) {
    return "none";
  }

  const turnCount = conversation.turnCount ?? conversation.turns?.length ?? 0;
  const order = conversation.turns?.length
    ? conversation.turns.map((turn) => turn.role).filter(Boolean).join(">")
    : conversation.roles?.join(">") ?? "none";
  const summary = conversation.summary?.trim() || "none";
  return `${summary} / turns ${turnCount} / order ${order}`;
}

async function harnessFetch(
  input: string,
  init?: RequestInit,
  governance?: GovernanceRequest
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (harnessApiKey) {
    headers.set("authorization", `Bearer ${harnessApiKey}`);
  }
  if (governance) {
    headers.set("x-immaculate-purpose", governance.purpose.join(","));
    headers.set("x-immaculate-policy-id", governance.policyId);
    headers.set("x-immaculate-consent-scope", governance.consentScope);
    if (governance.actor) {
      headers.set("x-immaculate-actor", governance.actor);
    }
  }

  return fetch(input, {
    ...init,
    headers
  });
}

async function ensureSuccessfulResponse(
  response: Response,
  fallbackMessage: string
): Promise<void> {
  if (response.ok) {
    return;
  }

  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    throw new Error(payload.message ?? payload.error ?? fallbackMessage);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(fallbackMessage);
  }
}

async function sendControl(envelope: ControlEnvelope): Promise<void> {
  const response = await harnessFetch(`${harnessBaseUrl}/api/control`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(envelope)
  }, {
    purpose: ["operator-control"],
    policyId: "operator-control-default",
    consentScope: "operator:tui",
    actor: "tui"
  });
  await ensureSuccessfulResponse(response, "Failed to send control.");
}

async function runCognition(): Promise<void> {
  const response = await harnessFetch(`${harnessBaseUrl}/api/intelligence/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  }, {
    purpose: ["cognitive-execution"],
    policyId: "cognitive-run-default",
    consentScope: "system:intelligence",
    actor: "tui"
  });
  await ensureSuccessfulResponse(response, "Failed to run cognition.");
}

async function dispatchActuation(sessionId?: string): Promise<void> {
  const response = await harnessFetch(`${harnessBaseUrl}/api/actuation/dispatch`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sessionId
    })
  }, {
    purpose: ["actuation-dispatch"],
    policyId: "actuation-dispatch-default",
    consentScope: sessionId ? `session:${sessionId}` : "system:actuation",
    actor: "tui"
  });
  await ensureSuccessfulResponse(response, "Failed to dispatch actuation.");
}

async function publishBenchmarkToWandb(): Promise<void> {
  const response = await harnessFetch(`${harnessBaseUrl}/api/benchmarks/publish/wandb`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  }, {
    purpose: ["benchmark-publication"],
    policyId: "benchmark-publication-default",
    consentScope: "system:benchmark",
    actor: "tui"
  });
  await ensureSuccessfulResponse(response, "Failed to publish benchmark to W&B.");
}

async function startLatestReplay(sessionId?: string): Promise<void> {
  if (!sessionId) {
    return;
  }

  const response = await harnessFetch(`${harnessBaseUrl}/api/neuro/replays/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sessionId,
      windowSize: 2,
      paceMs: 120
    })
  }, {
    purpose: ["neuro-replay"],
    policyId: "neuro-replay-default",
    consentScope: `session:${sessionId}`,
    actor: "tui"
  });
  await ensureSuccessfulResponse(response, "Failed to start replay.");
}

async function stopLatestReplay(replayId?: string, sessionId?: string): Promise<void> {
  if (!replayId || !sessionId) {
    return;
  }

  const response = await harnessFetch(`${harnessBaseUrl}/api/neuro/replays/${replayId}/stop`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  }, {
    purpose: ["neuro-replay"],
    policyId: "neuro-replay-default",
    consentScope: `session:${sessionId}`,
    actor: "tui"
  });
  await ensureSuccessfulResponse(response, "Failed to stop replay.");
}

async function stopLatestLiveSource(sourceId?: string): Promise<void> {
  if (!sourceId) {
    return;
  }

  const response = await harnessFetch(`${harnessBaseUrl}/api/neuro/live/${sourceId}/stop`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({})
  }, {
    purpose: ["neuro-streaming"],
    policyId: "neuro-stream-default",
    consentScope: `live-source:${sourceId}`,
    actor: "tui"
  });
  await ensureSuccessfulResponse(response, "Failed to stop live source.");
}

async function injectLiveFrame(sessionId?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(
      withOperatorWsUrl(liveNeuroWsUrlBase, {
        purpose: ["neuro-streaming"],
        policyId: "neuro-stream-default",
        consentScope: sessionId ? `session:${sessionId}` : "live-source:tui-live-socket",
        actor: "tui"
      })
    );
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.close();
        reject(new Error("Timed out waiting for live frame acknowledgement."));
      }
    }, 8000);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          sourceId: "tui-live-socket",
          label: "TUI live socket",
          sessionId,
          kind: "electrical-series",
          rateHz: 1000,
          syncJitterMs: 0.4,
          channels: 8,
          samples: [
            [0.1, -0.14, 0.18, -0.07, 0.13, -0.12, 0.17, -0.09],
            [0.12, -0.1, 0.2, -0.06, 0.15, -0.11, 0.21, -0.08],
            [0.09, -0.13, 0.16, -0.05, 0.11, -0.15, 0.18, -0.07],
            [0.14, -0.09, 0.22, -0.04, 0.12, -0.1, 0.19, -0.06]
          ]
        })
      );
    };

    socket.onmessage = (event) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const message = JSON.parse(String(event.data)) as { type: string; message?: string };
      socket.close();
      if (message.type === "error") {
        reject(new Error(message.message ?? "Failed to inject live frame."));
        return;
      }
      resolve();
    };

    socket.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("Live neuro websocket failed."));
      }
    };
  });
}

function metricBar(value: number, width = 14): string {
  const filled = Math.max(0, Math.min(width, Math.round(value * width)));
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

function planeGlyph(plane: ConnectomeNode["plane"]): string {
  switch (plane) {
    case "reflex":
      return "R";
    case "cognitive":
      return "C";
    case "offline":
      return "O";
  }
}

function passGlyph(pass: PhasePass): string {
  if (pass.state === "completed") {
    return "●";
  }
  if (pass.state === "running") {
    return "◉";
  }
  if (pass.state === "degraded") {
    return "◌";
  }
  if (pass.state === "queued") {
    return "○";
  }
  return "·";
}

function App() {
  useAltScreen();

  const { exit } = useApp();
  const dimensions = useWindowSize();
  const [snapshot, setSnapshot] = useState<PhaseSnapshot | null>(null);
  const [focusPane, setFocusPane] = useState<FocusPane>("nodes");
  const [nodeIndex, setNodeIndex] = useState(0);
  const [passIndex, setPassIndex] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [connected, setConnected] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceState | null>(null);
  const [wandb, setWandb] = useState<WandbState | null>(null);
  const [governance, setGovernance] = useState<GovernanceState | null>(null);
  const [intelligenceExecutionDetails, setIntelligenceExecutionDetails] = useState<CognitiveExecutionTrace[]>([]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let retryMs = 500;
    const loadPersistence = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/persistence`);
        const payload = (await response.json()) as { persistence: PersistenceState };
        if (!disposed) {
          setPersistence(payload.persistence);
        }
      } catch {
        if (!disposed) {
          setPersistence(null);
        }
      }
    };

    const loadWandb = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/wandb/status`);
        const payload = (await response.json()) as { wandb: WandbState };
        if (!disposed) {
          setWandb(payload.wandb);
        }
      } catch {
        if (!disposed) {
          setWandb(null);
        }
      }
    };

    const loadGovernance = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/governance/status`);
        const payload = (await response.json()) as { governance: GovernanceState };
        if (!disposed) {
          setGovernance(payload.governance);
        }
      } catch {
        if (!disposed) {
          setGovernance(null);
        }
      }
    };

    const loadIntelligence = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/intelligence/executions`, {
          headers: {
            "content-type": "application/json"
          }
        }, {
          purpose: ["cognitive-trace-read"],
          policyId: "cognitive-trace-read-default",
          consentScope: "system:intelligence",
          actor: "tui"
        });
        const payload = (await response.json()) as { executions?: CognitiveExecutionTrace[] };
        if (!disposed) {
          setIntelligenceExecutionDetails(payload.executions ?? []);
        }
      } catch {
        if (!disposed) {
          setIntelligenceExecutionDetails([]);
        }
      }
    };

    void loadPersistence();
    void loadWandb();
    void loadGovernance();
    void loadIntelligence();
    const timer = setInterval(() => {
      void loadPersistence();
      void loadWandb();
      void loadGovernance();
      void loadIntelligence();
    }, 2000);

    const loadSnapshot = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/snapshot`);
        const payload = (await response.json()) as { snapshot: PhaseSnapshot };
        if (!disposed) {
          setSnapshot(payload.snapshot);
        }
      } catch {}
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      socket = new WebSocket(withOperatorWsUrl(harnessWsUrlBase));

      socket.onopen = () => {
        if (!disposed) {
          retryMs = 500;
          setConnected(true);
          setErrorText(null);
        }
      };

      socket.onmessage = (event) => {
        if (disposed) {
          return;
        }

        try {
          const message = JSON.parse(String(event.data)) as {
            type: "snapshot" | "error";
            data?: PhaseSnapshot;
            message?: string;
          };

          if (message.type === "snapshot" && message.data) {
            setSnapshot(message.data);
          } else if (message.type === "error") {
            setErrorText(message.message ?? "Harness error");
          }
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : "Invalid harness payload");
        }
      };

      socket.onerror = () => {
        if (!disposed) {
          setConnected(false);
          setErrorText("Unable to connect to harness stream.");
        }
      };

      socket.onclose = () => {
        if (!disposed) {
          setConnected(false);
          void loadSnapshot();
          reconnectTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(Math.round(retryMs * 1.6), 30000);
        }
      };
    };

    void loadSnapshot();
    connect();

    return () => {
      disposed = true;
      clearInterval(timer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, []);

  const selectedNode = snapshot?.nodes[nodeIndex] ?? null;
  const selectedPass = snapshot?.passes[passIndex] ?? null;
  const selectedLog = snapshot?.logTail[logIndex] ?? null;
  const latestCognitiveExecution = intelligenceExecutionDetails[0] ?? null;
  const latestPoIAssessment = snapshot?.agentIntelligenceAssessments?.[0] ?? null;
  const latestConversation = (snapshot as SnapshotWithConversations | null)?.conversations?.[0] ?? null;

  const phaseLane = phaseIds
    .map((phase) => {
      const pass = snapshot?.passes.find((item) => item.phase === phase);
      if (!pass) {
        return `${phase}:·`;
      }
      return `${phase}:${passGlyph(pass)}`;
    })
    .join("  ");

  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (input === "?") {
      setShowHelp((value) => !value);
      return;
    }

    if (key.tab) {
      setFocusPane((value) =>
        value === "nodes" ? "passes" : value === "passes" ? "logs" : "nodes"
      );
      return;
    }

    if (!snapshot) {
      return;
    }

    if (input === " ") {
      void sendControl({
        action: snapshot.status === "running" ? "pause" : "resume"
      });
      return;
    }

    if (input === "b") {
      void sendControl({ action: "boost", value: 0.85 });
      return;
    }

    if (input === "p") {
      void sendControl({ action: "pulse", value: 0.45 });
      return;
    }

    if (input === "x") {
      void sendControl({ action: "reset" });
      return;
    }

    if (input === "n") {
      void sendControl({ action: "step" });
      return;
    }

    if (input === "g") {
      void runCognition();
      return;
    }

    if (input === "a") {
      void dispatchActuation(snapshot.neuroSessions[0]?.id);
      return;
    }

    if (input === "w") {
      void publishBenchmarkToWandb();
      return;
    }

    if (input === "v") {
      void startLatestReplay(snapshot.neuroSessions[0]?.id);
      return;
    }

    if (input === "s") {
      void stopLatestReplay(
        snapshot.neuroReplays.find(
          (candidate) => candidate.source === "nwb-replay" && candidate.status === "running"
        )?.id,
        snapshot.neuroReplays.find(
          (candidate) => candidate.source === "nwb-replay" && candidate.status === "running"
        )?.sessionId
      );
      return;
    }

    if (input === "l") {
      void injectLiveFrame(snapshot.neuroSessions[0]?.id);
      return;
    }

    if (input === "o") {
      void stopLatestLiveSource(
        snapshot.neuroReplays.find(
          (candidate) => candidate.source === "live-socket" && candidate.status === "running"
        )?.id
      );
      return;
    }

    if (input === "r" && selectedNode) {
      void sendControl({ action: "reroute", target: selectedNode.id });
      return;
    }

    if (key.upArrow || input === "k") {
      if (focusPane === "nodes") {
        setNodeIndex((value) => Math.max(0, value - 1));
      } else if (focusPane === "passes") {
        setPassIndex((value) => Math.max(0, value - 1));
      } else {
        setLogIndex((value) => Math.max(0, value - 1));
      }
    }

    if (key.downArrow || input === "j") {
      if (focusPane === "nodes") {
        setNodeIndex((value) => Math.min(snapshot.nodes.length - 1, value + 1));
      } else if (focusPane === "passes") {
        setPassIndex((value) => Math.min(snapshot.passes.length - 1, value + 1));
      } else {
        setLogIndex((value) => Math.min(snapshot.logTail.length - 1, value + 1));
      }
    }
  });

  return (
    <Box flexDirection="column" width={dimensions.columns} minHeight={dimensions.rows}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Box flexGrow={1} justifyContent="space-between">
          <Text color="cyanBright">IMMACULATE / CONTROL HARNESS</Text>
          <Text color={connected ? "green" : "red"}>
            {connected ? "LIVE LINK" : "LINK DOWN"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Box flexGrow={1} justifyContent="space-between">
          <Text>
            {snapshot ? `${snapshot.profile} | cycle ${snapshot.cycle} | ${snapshot.status.toUpperCase()}` : "Awaiting snapshot"}
          </Text>
          <Text>
            {persistence
              ? `${persistence.recoveryMode.toUpperCase()} | ${persistence.integrityStatus?.toUpperCase() ?? "UNCHECKED"} | ev ${persistence.persistedEventCount} | chk ${persistence.checkpointCount}`
              : snapshot?.timestamp ?? "No clock"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="yellow">{snapshot?.objective ?? "Bootstrapping orchestration substrate..."}</Text>
      </Box>

      <Box marginTop={1}>
        <Text>{phaseLane}</Text>
      </Box>

      <Box flexGrow={1} marginTop={1}>
        <Box
          width="34%"
          borderStyle="round"
          borderColor={focusPane === "nodes" ? "green" : "gray"}
          flexDirection="column"
          paddingX={1}
        >
          <Text color="greenBright">Nodes</Text>
          {snapshot?.nodes.map((node, index) => (
            <Text
              key={node.id}
              color={index === nodeIndex ? "black" : undefined}
              backgroundColor={index === nodeIndex ? "green" : undefined}
            >
              {index === nodeIndex ? "▶" : " "} {planeGlyph(node.plane)} {node.label.padEnd(18)} act {formatPercent(node.activation)} load {formatPercent(node.load)}
            </Text>
          ))}
        </Box>

        <Box
          width="33%"
          marginLeft={1}
          borderStyle="round"
          borderColor={focusPane === "passes" ? "yellow" : "gray"}
          flexDirection="column"
          paddingX={1}
        >
          <Text color="yellowBright">Passes</Text>
          {snapshot?.passes.map((pass, index) => (
            <Text
              key={pass.id}
              color={index === passIndex ? "black" : undefined}
              backgroundColor={index === passIndex ? "yellow" : undefined}
            >
              {passGlyph(pass)} {pass.phase.padEnd(11)} {String(Math.round(pass.latencyMs)).padStart(4)}ms {formatPercent(pass.progress).padStart(6)}
            </Text>
          ))}
        </Box>

        <Box
          width="33%"
          marginLeft={1}
          borderStyle="round"
          borderColor={focusPane === "logs" ? "magenta" : "gray"}
          flexDirection="column"
          paddingX={1}
        >
          <Text color="magentaBright">Logs</Text>
          {snapshot?.logTail.map((line, index) => (
            <Text
              key={`${line}-${index}`}
              color={index === logIndex ? "black" : undefined}
              backgroundColor={index === logIndex ? "magenta" : undefined}
            >
              {index === logIndex ? "▶" : " "} {line}
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Box width="50%" borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text color="cyanBright">Metrics</Text>
          <Text>Reflex latency     {snapshot ? `${snapshot.metrics.reflexLatencyMs.toFixed(1)}ms` : "-"}</Text>
          <Text>Cognitive latency  {snapshot ? `${snapshot.metrics.cognitiveLatencyMs.toFixed(1)}ms` : "-"}</Text>
          <Text>Graph health       {snapshot ? `${metricBar(snapshot.metrics.graphHealth)} ${formatPercent(snapshot.metrics.graphHealth)}` : "-"}</Text>
          <Text>Coherence          {snapshot ? `${metricBar(snapshot.metrics.coherence)} ${formatPercent(snapshot.metrics.coherence)}` : "-"}</Text>
          <Text>Propagation        {snapshot ? `${metricBar(snapshot.metrics.propagationRate)} ${formatPercent(snapshot.metrics.propagationRate)}` : "-"}</Text>
          <Text>Throughput         {snapshot ? `${Math.round(snapshot.metrics.throughput)} ops/s` : "-"}</Text>
          <Text>Coupling           {snapshot ? summarizeNeuralCoupling(snapshot) : "-"}</Text>
        </Box>

        <Box width="50%" marginLeft={1} borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1}>
          <Text color="cyanBright">Selection</Text>
          {selectedNode ? (
            <>
              <Text color={planeColor(selectedNode.plane)}>Node {selectedNode.label}</Text>
              <Text>Kind {selectedNode.kind}</Text>
              <Text>Plane {selectedNode.plane}</Text>
              <Text>Trust {formatPercent(selectedNode.trust)} | Drift {formatPercent(selectedNode.drift)}</Text>
              <Text>Throughput {formatPercent(selectedNode.throughput)} | Saturation {formatPercent(selectedNode.saturation)}</Text>
            </>
          ) : (
            <Text>No selected node</Text>
          )}
          {selectedPass ? (
            <Text>Pass c{selectedPass.cycle} s{selectedPass.sequence} / {selectedPass.phase} / {selectedPass.state} / {selectedPass.latencyMs.toFixed(1)}ms</Text>
          ) : null}
          {snapshot ? (
            <Text>
              Intelligence {snapshot.intelligenceLayers.length} / latest{" "}
              {snapshot.cognitiveExecutions[0]
                ? `${snapshot.cognitiveExecutions[0].model} ${snapshot.cognitiveExecutions[0].latencyMs.toFixed(1)}ms`
                : "none"}
            </Text>
          ) : null}
          {latestPoIAssessment ? (
            <Text>
              PoI {latestPoIAssessment.subjectAgentId} / {latestPoIAssessment.grade} /{" "}
              {latestPoIAssessment.verdict} / {formatPercent(latestPoIAssessment.overallScore)}
            </Text>
          ) : null}
          {latestCognitiveExecution ? (
            <Text>
              Cognition {latestCognitiveExecution.model} / {summarizeCognitiveTrace(latestCognitiveExecution)}
            </Text>
          ) : null}
          {latestConversation ? (
            <Text>
              Conversation / {summarizeConversation(latestConversation)}
            </Text>
          ) : null}
          {snapshot ? (
            <Text>
              Actuation {snapshot.actuationOutputs.length} / latest{" "}
              {snapshot.actuationOutputs[0]
                ? `${snapshot.actuationOutputs[0].channel} ${snapshot.actuationOutputs[0].status}`
                : "none"}
            </Text>
          ) : null}
          {snapshot ? (
            <Text>
              Route {snapshot.routingDecisions?.[0] ? snapshot.routingDecisions[0].mode : "none"} /{" "}
              {summarizeRoutingDecision(snapshot.routingDecisions?.[0])}
            </Text>
          ) : null}
          {snapshot ? (
            <Text>
              Phase bias route {formatPercent(snapshot.neuralCoupling.phaseBias.route)} / reason{" "}
              {formatPercent(snapshot.neuralCoupling.phaseBias.reason)} / feedback{" "}
              {formatPercent(snapshot.neuralCoupling.phaseBias.feedback)}
            </Text>
          ) : null}
          {snapshot ? (
            <Text>
              Arbitration {snapshot.executionArbitrations?.[0] ? snapshot.executionArbitrations[0].mode : "none"} /{" "}
              {summarizeExecutionArbitration(snapshot.executionArbitrations?.[0])}
            </Text>
          ) : null}
          {snapshot ? (
            <Text>
              Schedule {snapshot.executionSchedules?.[0] ? snapshot.executionSchedules[0].mode : "none"} /{" "}
              {summarizeExecutionSchedule(snapshot.executionSchedules?.[0])}
            </Text>
          ) : null}
          {snapshot ? (
            <Text>
              Neuro ingress {snapshot.neuroReplays[0] ? `${snapshot.neuroReplays[0].source} ${snapshot.neuroReplays[0].status} ${snapshot.neuroReplays[0].completedWindows}/${snapshot.neuroReplays[0].totalWindows}` : "none"} / latest frame{" "}
              {snapshot.neuroFrames[0]
                ? `${snapshot.neuroFrames[0].source} ${snapshot.neuroFrames[0].windowIndex + 1} ${formatPercent(snapshot.neuroFrames[0].decodeConfidence)} / ${summarizeBandPower(snapshot.neuroFrames[0])}`
                : "none"}
            </Text>
          ) : null}
          {persistence ? (
            <Text>
              Persistence {persistence.recoveryMode} / integrity {persistence.integrityStatus ?? "unchecked"} / findings{" "}
              {persistence.integrityFindingCount}
            </Text>
          ) : null}
          {wandb ? (
            <Text>
              W&B {wandb.mode} / {wandb.entity} / {wandb.project} / {wandb.ready ? "ready" : "not-ready"}
            </Text>
          ) : null}
          {governance ? (
            <Text>
              Governance {governance.mode} / decisions {governance.decisionCount} / denied {governance.deniedCount}
            </Text>
          ) : null}
          {persistence ? (
            <Text>
              Checkpoints {persistence.checkpointCount} / rejected artifacts {persistence.invalidArtifactCount} /{" "}
              {persistence.lastCheckpointAt ?? persistence.lastSnapshotAt ?? "no durability clock"}
            </Text>
          ) : null}
          {selectedLog ? <Text>Log {selectedLog}</Text> : null}
        </Box>
      </Box>

      {errorText ? (
        <Box marginTop={1}>
          <Text color="redBright">{errorText}</Text>
        </Box>
      ) : null}

      {showHelp ? (
        <Box marginTop={1} borderStyle="double" borderColor="white" flexDirection="column" paddingX={1}>
          <Text color="whiteBright">Help</Text>
          <Text>`tab` cycle pane  `j/k` or arrows move  `space` pause/resume</Text>
          <Text>`b` boost  `p` pulse  `n` single-step  `g` run cognition  `a` dispatch actuation  `v` replay latest NWB  `s` stop replay  `l` inject live frame  `o` stop live  `w` publish W&B  `r` reroute  `x` reset  `q` quit</Text>
          <Text>The TUI runs in an alternate screen and stays keyboard-primary by design.</Text>
        </Box>
      ) : null}

      <Box marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text>
          q quit  ? help  tab focus  j/k nav  space run/pause  n step  g cognition  a actuation  v replay  s stop-replay  l live-frame  o stop-live  w wandb  b boost  p pulse  r reroute  x reset
        </Text>
      </Box>
    </Box>
  );
}

render(<App />, {
  exitOnCtrlC: true
});
