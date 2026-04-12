"use client";

import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from "react";
import {
  type ActuationOutput,
  type CognitiveExecution,
  formatPercent,
  type NeuroFrameWindow,
  planeColor,
  type BenchmarkIndex,
  type BenchmarkReport,
  type ConnectomeNode,
  type PhasePass,
  type PhaseSnapshot,
  type SnapshotHistoryPoint
} from "@immaculate/core";
import { ConnectomeScene } from "./connectome-scene";

const harnessBaseUrl = process.env.NEXT_PUBLIC_IMMACULATE_HARNESS_URL ?? "http://127.0.0.1:8787";
const harnessApiKey = process.env.NEXT_PUBLIC_IMMACULATE_API_KEY;
const harnessWsUrlBase =
  process.env.NEXT_PUBLIC_IMMACULATE_HARNESS_WS_URL ?? "ws://127.0.0.1:8787/stream";
const liveNeuroWsUrlBase =
  process.env.NEXT_PUBLIC_IMMACULATE_NEURO_WS_URL ?? "ws://127.0.0.1:8787/stream/neuro/live";

type GovernanceRequest = {
  purpose: string[];
  policyId: string;
  consentScope: string;
  actor?: string;
};

function withOperatorHeaders(init?: RequestInit, governance?: GovernanceRequest): RequestInit {
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

  return {
    ...init,
    headers
  };
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

async function harnessFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, withOperatorHeaders(init));
}

async function governedHarnessFetch(
  input: string,
  governance: GovernanceRequest,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, withOperatorHeaders(init, governance));
}

function MetricCard({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="metric-card" style={{ borderColor: accent }}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}

function NodeRow({ node }: { node: ConnectomeNode }) {
  return (
    <div className="data-row">
      <span className="pill" style={{ borderColor: planeColor(node.plane), color: planeColor(node.plane) }}>
        {node.plane}
      </span>
      <span>{node.label}</span>
      <span>{formatPercent(node.activation)}</span>
      <span>{formatPercent(node.load)}</span>
      <span>{formatPercent(node.trust)}</span>
    </div>
  );
}

function PassRow({ pass }: { pass: PhasePass }) {
  return (
    <div className="data-row">
      <span>{pass.phase}</span>
      <span>{pass.plane}</span>
      <span>{pass.state}</span>
      <span>{pass.latencyMs.toFixed(1)} ms</span>
      <span>{formatPercent(pass.progress)}</span>
    </div>
  );
}

function HistoryRow({ point }: { point: SnapshotHistoryPoint }) {
  return (
    <div className="data-row">
      <span>c{point.cycle}</span>
      <span>{point.timestamp.slice(11, 19)}</span>
      <span>{point.reflexLatencyMs.toFixed(1)} ms</span>
      <span>{formatPercent(point.coherence)}</span>
      <span>{Math.round(point.throughput)} ops/s</span>
    </div>
  );
}

type PersistenceState = {
  recovered: boolean;
  recoveryMode: "fresh" | "checkpoint" | "checkpoint-replay" | "snapshot" | "replay";
  persistedEventCount: number;
  persistedHistoryCount: number;
  lastPersistedEventId?: string;
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

type WandbStatus = {
  mode: "online" | "offline" | "disabled";
  entity: string;
  project: string;
  pythonPath: string;
  publisherScriptPath: string;
  apiKeyPresent: boolean;
  sdkInstalled: boolean;
  usingLocalVenv: boolean;
  configured: boolean;
  ready: boolean;
  note: string;
};

type BenchmarkJobState = {
  id: string;
  packId?: string;
  publishWandb: boolean;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  benchmark?: BenchmarkReport;
  error?: string;
};

type GovernanceStatus = {
  mode: "enforced";
  policyCount: number;
  decisionCount: number;
  deniedCount: number;
  lastDecisionAt?: string;
  lastDecisionId?: string;
};

type TopologyState = {
  profile: string;
  objective: string;
  nodes: number;
  edges: number;
  planes: string[];
  cycle: number;
  lastEventId?: string;
};

type IntegrityState = {
  valid: boolean;
  status: "verified" | "degraded" | "invalid";
  checkedAt: string;
  currentCycle: number;
  activePassCount: number;
  findingCount: number;
};

type CheckpointState = {
  id: string;
  createdAt: string;
  cycle: number;
  epoch: number;
  lastEventId?: string;
};

type DatasetDetail = {
  id: string;
  name: string;
  rootPath: string;
  fileCount: number;
};

type NeuroSessionDetail = {
  id: string;
  name: string;
  filePath: string;
  streamCount: number;
};

type OllamaModelState = {
  model: string;
  name?: string;
};

type ActuationAdapterState = {
  id: string;
  label: string;
  kind: string;
  channel: string;
  protocolId: string;
  protocolLabel: string;
  deviceClass: string;
  maxIntensity: number;
  requiresSession: boolean;
  description: string;
  deliveryCount: number;
  lastDeliveredAt?: string;
  lastDeliveryTransport?: "file" | "bridge" | "udp-osc";
  bridgeConnected: boolean;
  bridgeReady: boolean;
  bridgeSessionId?: string;
  bridgeDeviceId?: string;
  bridgeCapabilities: string[];
};

type ActuationProtocolState = {
  id: string;
  label: string;
  channel: string;
  deviceClass: string;
  description: string;
  requiredCapabilities: string[];
};

type ActuationCapabilityHealth = {
  capability: string;
  status: "available" | "degraded" | "missing";
  checkedAt?: string;
  note?: string;
};

type ActuationTransportState = {
  id: string;
  kind: "udp-osc" | "serial-json";
  label: string;
  adapterId: string;
  protocolId: string;
  deviceId?: string;
  endpoint: string;
  remoteHost?: string;
  remotePort?: number;
  devicePath?: string;
  baudRate?: number;
  vendorId?: string;
  modelId?: string;
  firmwareVersion?: string;
  enabled: boolean;
  deliveryCount: number;
  lastDeliveredAt?: string;
  heartbeatRequired: boolean;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  lastHeartbeatAt?: string;
  lastHeartbeatLatencyMs?: number;
  lastHealthCheckAt?: string;
  health: "unknown" | "healthy" | "degraded" | "faulted" | "isolated";
  capabilityHealth: ActuationCapabilityHealth[];
  failureCount: number;
  consecutiveFailures: number;
  isolationActive: boolean;
  isolationReason?: string;
  isolatedAt?: string;
  lastError?: string;
  lastRecoveredAt?: string;
};

type ActuationDeliveryState = {
  id: string;
  outputId: string;
  adapterId: string;
  adapterKind: string;
  protocolId: string;
  deviceId?: string;
  channel: string;
  sessionId?: string;
  status: "delivered" | "suppressed";
  transport: "file" | "bridge" | "udp-osc";
  intensity: number;
  generatedAt: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  encodedCommand: string;
  policyNote: string;
};

export function DashboardClient() {
  const [snapshot, setSnapshot] = useState<PhaseSnapshot | null>(null);
  const [history, setHistory] = useState<SnapshotHistoryPoint[]>([]);
  const [persistence, setPersistence] = useState<PersistenceState | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkReport | null>(null);
  const [benchmarkHistory, setBenchmarkHistory] = useState<BenchmarkIndex | null>(null);
  const [wandbStatus, setWandbStatus] = useState<WandbStatus | null>(null);
  const [governance, setGovernance] = useState<GovernanceStatus | null>(null);
  const [topology, setTopology] = useState<TopologyState | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityState | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointState[]>([]);
  const [benchmarkPackCount, setBenchmarkPackCount] = useState(0);
  const [activeReplayCount, setActiveReplayCount] = useState(0);
  const [activeLiveSourceCount, setActiveLiveSourceCount] = useState(0);
  const [rawEventCount, setRawEventCount] = useState(0);
  const [replayEventCount, setReplayEventCount] = useState(0);
  const [datasetDetail, setDatasetDetail] = useState<DatasetDetail | null>(null);
  const [sessionDetail, setSessionDetail] = useState<NeuroSessionDetail | null>(null);
  const [neuroFrameDetails, setNeuroFrameDetails] = useState<NeuroFrameWindow[]>([]);
  const [cognitiveExecutionDetails, setCognitiveExecutionDetails] = useState<CognitiveExecution[]>([]);
  const [actuationDetails, setActuationDetails] = useState<ActuationOutput[]>([]);
  const [actuationAdapters, setActuationAdapters] = useState<ActuationAdapterState[]>([]);
  const [actuationProtocols, setActuationProtocols] = useState<ActuationProtocolState[]>([]);
  const [actuationTransports, setActuationTransports] = useState<ActuationTransportState[]>([]);
  const [actuationDeliveries, setActuationDeliveries] = useState<ActuationDeliveryState[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelState[]>([]);
  const deferredSnapshot = useDeferredValue(snapshot);
  const [connected, setConnected] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkJobId, setBenchmarkJobId] = useState<string | null>(null);
  const [cognitionRunning, setCognitionRunning] = useState(false);
  const [registeringLayer, setRegisteringLayer] = useState(false);
  const [wandbPublishing, setWandbPublishing] = useState(false);
  const [replayRunning, setReplayRunning] = useState(false);
  const [replayStopping, setReplayStopping] = useState(false);
  const [liveIngressRunning, setLiveIngressRunning] = useState(false);
  const [liveIngressStopping, setLiveIngressStopping] = useState(false);

  const handleSnapshot = useEffectEvent((nextSnapshot: PhaseSnapshot) => {
    startTransition(() => {
      setSnapshot(nextSnapshot);
    });
  });

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let retryMs = 500;

    const loadHistory = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/history`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { history: SnapshotHistoryPoint[] };
        if (!cancelled) {
          startTransition(() => {
            setHistory(payload.history.slice(0, 8));
          });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "Failed to fetch history.");
        }
      }
    };

    const loadPersistence = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/persistence`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { persistence: PersistenceState };
        if (!cancelled) {
          startTransition(() => {
            setPersistence(payload.persistence);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "Failed to fetch persistence.");
        }
      }
    };

    const loadBenchmark = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/benchmarks/latest`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { benchmark: BenchmarkReport | null };
        if (!cancelled) {
          startTransition(() => {
            setBenchmark(payload.benchmark);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "Failed to fetch benchmark.");
        }
      }
    };

    const loadBenchmarkHistory = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/benchmarks/history`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { history: BenchmarkIndex };
        if (!cancelled) {
          startTransition(() => {
            setBenchmarkHistory(payload.history);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "Failed to fetch benchmark history.");
        }
      }
    };

    const loadWandbStatus = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/wandb/status`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { wandb: WandbStatus };
        if (!cancelled) {
          startTransition(() => {
            setWandbStatus(payload.wandb);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "Failed to fetch W&B status.");
        }
      }
    };

    const loadOperatorState = async () => {
      try {
        const [
          topologyResponse,
          integrityResponse,
          checkpointsResponse,
          governanceResponse,
          packsResponse,
          eventsResponse,
          replayResponse,
          datasetsResponse,
          sessionsResponse,
          replaysResponse,
          liveSourcesResponse,
          actuationAdaptersResponse,
          actuationProtocolsResponse,
          actuationTransportsResponse,
          modelsResponse
        ] = await Promise.all([
          harnessFetch(`${harnessBaseUrl}/api/topology`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/integrity`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/checkpoints`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/governance/status`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/benchmarks/packs`, { cache: "no-store" }),
          governedHarnessFetch(
            `${harnessBaseUrl}/api/events`,
            {
              purpose: ["event-read"],
              policyId: "event-read-default",
              consentScope: "system:audit",
              actor: "dashboard"
            },
            { cache: "no-store" }
          ),
          governedHarnessFetch(
            `${harnessBaseUrl}/api/replay?limit=20`,
            {
              purpose: ["event-read"],
              policyId: "event-read-default",
              consentScope: "system:audit",
              actor: "dashboard"
            },
            { cache: "no-store" }
          ),
          harnessFetch(`${harnessBaseUrl}/api/datasets`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/neuro/sessions`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/neuro/replays`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/neuro/live/sources`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/actuation/adapters`, { cache: "no-store" }),
          harnessFetch(`${harnessBaseUrl}/api/actuation/protocols`, { cache: "no-store" }),
          governedHarnessFetch(
            `${harnessBaseUrl}/api/actuation/transports`,
            {
              purpose: ["actuation-read"],
              policyId: "actuation-read-default",
              consentScope: "system:actuation",
              actor: "dashboard"
            },
            { cache: "no-store" }
          ),
          harnessFetch(`${harnessBaseUrl}/api/intelligence/ollama/models`, { cache: "no-store" })
        ]);

        const topologyPayload = (await topologyResponse.json()) as { profile: string; objective: string; nodes: number; edges: number; planes: string[]; cycle: number; lastEventId?: string };
        const integrityPayload = (await integrityResponse.json()) as { integrity: IntegrityState };
        const checkpointsPayload = (await checkpointsResponse.json()) as { checkpoints: CheckpointState[] };
        const governancePayload = (await governanceResponse.json()) as { governance: GovernanceStatus };
        const packsPayload = (await packsResponse.json()) as { packs: Array<{ id: string }> };
        const eventsPayload = (await eventsResponse.json()) as { events: Array<{ eventId: string }> };
        const replayPayload = (await replayResponse.json()) as { events: Array<{ eventId: string }> };
        const datasetsPayload = (await datasetsResponse.json()) as { datasets: DatasetDetail[] };
        const sessionsPayload = (await sessionsResponse.json()) as { sessions: NeuroSessionDetail[] };
        const replaysPayload = (await replaysResponse.json()) as { replays: Array<{ id: string }> };
        const liveSourcesPayload = (await liveSourcesResponse.json()) as { sources: Array<{ id: string }> };
        const actuationAdaptersPayload = (await actuationAdaptersResponse.json()) as { adapters: ActuationAdapterState[] };
        const actuationProtocolsPayload = (await actuationProtocolsResponse.json()) as { protocols: ActuationProtocolState[] };
        const actuationTransportsPayload = (await actuationTransportsResponse.json()) as { transports: ActuationTransportState[] };
        const modelsPayload = (await modelsResponse.json()) as { models?: OllamaModelState[]; error?: string };

        let nextDatasetDetail: DatasetDetail | null = null;
        if (datasetsPayload.datasets[0]?.id) {
          const datasetDetailResponse = await governedHarnessFetch(
            `${harnessBaseUrl}/api/datasets/${datasetsPayload.datasets[0].id}`,
            {
              purpose: ["dataset-read"],
              policyId: "dataset-read-default",
              consentScope: `dataset:${datasetsPayload.datasets[0].id}`,
              actor: "dashboard"
            },
            { cache: "no-store" }
          );
          const datasetDetailPayload = (await datasetDetailResponse.json()) as {
            dataset?: { summary: DatasetDetail };
          };
          nextDatasetDetail = datasetDetailPayload.dataset?.summary ?? null;
        }

        let nextSessionDetail: NeuroSessionDetail | null = null;
        let nextFrameDetails: NeuroFrameWindow[] = [];
        if (sessionsPayload.sessions[0]?.id) {
          const sessionDetailResponse = await governedHarnessFetch(
            `${harnessBaseUrl}/api/neuro/sessions/${sessionsPayload.sessions[0].id}`,
            {
              purpose: ["neuro-session-read"],
              policyId: "neuro-session-read-default",
              consentScope: `session:${sessionsPayload.sessions[0].id}`,
              actor: "dashboard"
            },
            { cache: "no-store" }
          );
          const sessionDetailPayload = (await sessionDetailResponse.json()) as {
            session?: { summary: NeuroSessionDetail };
          };
          nextSessionDetail = sessionDetailPayload.session?.summary ?? null;

          const frameDetailResponse = await governedHarnessFetch(
            `${harnessBaseUrl}/api/neuro/frames?sessionId=${encodeURIComponent(sessionsPayload.sessions[0].id)}`,
            {
              purpose: ["neuro-feature-read"],
              policyId: "neuro-feature-read-default",
              consentScope: `session:${sessionsPayload.sessions[0].id}`,
              actor: "dashboard"
            },
            { cache: "no-store" }
          );
          const frameDetailPayload = (await frameDetailResponse.json()) as {
            frames?: NeuroFrameWindow[];
          };
          nextFrameDetails = frameDetailPayload.frames ?? [];
        }

        const intelligenceDetailResponse = await governedHarnessFetch(
          `${harnessBaseUrl}/api/intelligence/executions`,
          {
            purpose: ["cognitive-trace-read"],
            policyId: "cognitive-trace-read-default",
            consentScope: "system:intelligence",
            actor: "dashboard"
          },
          { cache: "no-store" }
        );
        const intelligenceDetailPayload = (await intelligenceDetailResponse.json()) as {
          executions?: CognitiveExecution[];
        };
        const actuationDetailResponse = await governedHarnessFetch(
          `${harnessBaseUrl}/api/actuation/outputs`,
          {
            purpose: ["actuation-read"],
            policyId: "actuation-read-default",
            consentScope: "system:actuation",
            actor: "dashboard"
          },
          { cache: "no-store" }
        );
        const actuationDetailPayload = (await actuationDetailResponse.json()) as {
          outputs?: ActuationOutput[];
        };
        const actuationDeliveriesResponse = await governedHarnessFetch(
          `${harnessBaseUrl}/api/actuation/deliveries?limit=12`,
          {
            purpose: ["actuation-read"],
            policyId: "actuation-read-default",
            consentScope: "system:actuation",
            actor: "dashboard"
          },
          { cache: "no-store" }
        );
        const actuationDeliveriesPayload = (await actuationDeliveriesResponse.json()) as {
          deliveries?: ActuationDeliveryState[];
        };

        if (!cancelled) {
          startTransition(() => {
            setTopology(topologyPayload);
            setIntegrity(integrityPayload.integrity);
            setCheckpoints(checkpointsPayload.checkpoints);
            setGovernance(governancePayload.governance);
            setBenchmarkPackCount(packsPayload.packs.length);
            setRawEventCount(eventsPayload.events.length);
            setReplayEventCount(replayPayload.events.length);
            setDatasetDetail(nextDatasetDetail);
            setSessionDetail(nextSessionDetail);
            setNeuroFrameDetails(nextFrameDetails);
              setCognitiveExecutionDetails(intelligenceDetailPayload.executions ?? []);
              setActuationDetails(actuationDetailPayload.outputs ?? []);
              setActuationAdapters(actuationAdaptersPayload.adapters ?? []);
              setActuationProtocols(actuationProtocolsPayload.protocols ?? []);
              setActuationTransports(actuationTransportsPayload.transports ?? []);
              setActuationDeliveries(actuationDeliveriesPayload.deliveries ?? []);
            setActiveReplayCount(replaysPayload.replays.length);
            setActiveLiveSourceCount(liveSourcesPayload.sources.length);
            setOllamaModels(modelsPayload.models ?? []);
          });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "Failed to fetch operator state.");
        }
      }
    };

    const boot = async () => {
      try {
        const response = await harnessFetch(`${harnessBaseUrl}/api/snapshot`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as { snapshot: PhaseSnapshot };
        if (!cancelled) {
          handleSnapshot(payload.snapshot);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(error instanceof Error ? error.message : "Failed to fetch initial snapshot.");
        }
      }
    };

    void boot();
    void loadHistory();
    void loadPersistence();
    void loadBenchmark();
    void loadBenchmarkHistory();
    void loadWandbStatus();
    void loadOperatorState();
    const historyInterval = window.setInterval(() => {
      void loadHistory();
      void loadPersistence();
      void loadBenchmark();
      void loadBenchmarkHistory();
      void loadWandbStatus();
      void loadOperatorState();
    }, 2000);

    const connect = () => {
      if (cancelled) {
        return;
      }

      socket = new WebSocket(withOperatorWsUrl(harnessWsUrlBase));

      socket.onopen = () => {
        if (!cancelled) {
          retryMs = 500;
          setConnected(true);
          setErrorText(null);
        }
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type: "snapshot" | "error";
            data?: PhaseSnapshot;
            message?: string;
          };

          if (message.type === "snapshot" && message.data) {
            handleSnapshot(message.data);
          } else if (message.type === "error" && !cancelled) {
            setErrorText(message.message ?? "Harness error");
          }
        } catch (error) {
          if (!cancelled) {
            setErrorText(error instanceof Error ? error.message : "Invalid stream payload.");
          }
        }
      };

      socket.onerror = () => {
        if (!cancelled) {
          setConnected(false);
          setErrorText("Harness stream failed.");
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          setConnected(false);
          void boot();
          reconnectTimer = window.setTimeout(connect, retryMs);
          retryMs = Math.min(Math.round(retryMs * 1.6), 30000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      window.clearInterval(historyInterval);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [handleSnapshot]);

  const runBenchmark = useEffectEvent(async () => {
    try {
      setBenchmarkRunning(true);
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/benchmarks/run`,
        {
          purpose: ["benchmark-execution"],
          policyId: "benchmark-execution-default",
          consentScope: "system:benchmark",
          actor: "dashboard"
        },
        {
        method: "POST",
        cache: "no-store"
        }
      );
      const payload = (await response.json()) as {
        accepted?: boolean;
        job?: BenchmarkJobState;
        error?: string;
      };
      if (!response.ok || !payload.job) {
        throw new Error(payload.error ?? "Failed to schedule benchmark.");
      }

      setBenchmarkJobId(payload.job.id);
      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const jobResponse = await harnessFetch(
          `${harnessBaseUrl}/api/benchmarks/jobs/${payload.job.id}`,
          {
            cache: "no-store"
          }
        );
        const jobPayload = (await jobResponse.json()) as { job: BenchmarkJobState };
        if (jobPayload.job.status === "failed") {
          throw new Error(jobPayload.job.error ?? "Benchmark job failed.");
        }
        if (jobPayload.job.status === "completed" && jobPayload.job.benchmark) {
          startTransition(() => {
            setBenchmark(jobPayload.job.benchmark ?? null);
          });
          break;
        }
      }

      const historyResponse = await harnessFetch(`${harnessBaseUrl}/api/benchmarks/history`, {
        cache: "no-store"
      });
      const historyPayload = (await historyResponse.json()) as { history: BenchmarkIndex };
      startTransition(() => {
        setBenchmarkHistory(historyPayload.history);
      });
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to run benchmark.");
    } finally {
      setBenchmarkJobId(null);
      setBenchmarkRunning(false);
    }
  });

  const runCognition = useEffectEvent(async () => {
    try {
      setCognitionRunning(true);
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/intelligence/run`,
        {
          purpose: ["cognitive-execution"],
          policyId: "cognitive-run-default",
          consentScope: "system:intelligence",
          actor: "dashboard"
        },
        {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
        }
      );
      const payload = (await response.json()) as {
        snapshot?: PhaseSnapshot;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Failed to run local cognition.");
      }

      if (payload.snapshot) {
        handleSnapshot(payload.snapshot);
      }
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to run local cognition.");
    } finally {
      setCognitionRunning(false);
    }
  });

  const publishBenchmarkToWandb = useEffectEvent(async () => {
    try {
      setWandbPublishing(true);
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/benchmarks/publish/wandb`,
        {
          purpose: ["benchmark-publication"],
          policyId: "benchmark-publication-default",
          consentScope: "system:benchmark",
          actor: "dashboard"
        },
        {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
        }
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Failed to publish benchmark to W&B.");
      }

      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to publish benchmark to W&B.");
    } finally {
      setWandbPublishing(false);
    }
  });

  const startLatestReplay = useEffectEvent(async () => {
    if (!snapshot?.neuroSessions[0]) {
      setErrorText("No registered neuro session is available for replay.");
      return;
    }

    try {
      setReplayRunning(true);
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/neuro/replays/start`,
        {
          purpose: ["neuro-replay"],
          policyId: "neuro-replay-default",
          consentScope: `session:${snapshot.neuroSessions[0].id}`,
          actor: "dashboard"
        },
        {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sessionId: snapshot.neuroSessions[0].id,
          windowSize: 2,
          paceMs: 120
        })
        }
      );
      const payload = (await response.json()) as {
        snapshot?: PhaseSnapshot;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Failed to start neuro replay.");
      }

      if (payload.snapshot) {
        handleSnapshot(payload.snapshot);
      }
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to start neuro replay.");
    } finally {
      setReplayRunning(false);
    }
  });

  const stopLatestReplay = useEffectEvent(async () => {
    const replay = snapshot?.neuroReplays.find(
      (candidate) => candidate.source === "nwb-replay" && candidate.status === "running"
    );
    if (!replay) {
      setErrorText("No active NWB replay is available to stop.");
      return;
    }

    try {
      setReplayStopping(true);
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/neuro/replays/${replay.id}/stop`,
        {
          purpose: ["neuro-replay"],
          policyId: "neuro-replay-default",
          consentScope: `session:${replay.sessionId}`,
          actor: "dashboard"
        },
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({})
        }
      );
      const payload = (await response.json()) as { snapshot?: PhaseSnapshot; error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Failed to stop replay.");
      }
      if (payload.snapshot) {
        handleSnapshot(payload.snapshot);
      }
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to stop replay.");
    } finally {
      setReplayStopping(false);
    }
  });

  const injectLiveFrame = useEffectEvent(async () => {
    try {
      setLiveIngressRunning(true);
      const sessionId = snapshot?.neuroSessions[0]?.id;
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(
          withOperatorWsUrl(liveNeuroWsUrlBase, {
            purpose: ["neuro-streaming"],
            policyId: "neuro-stream-default",
            consentScope: sessionId ? `session:${sessionId}` : "live-source:dashboard-live-socket",
            actor: "dashboard"
          })
        );
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true;
            socket.close();
            reject(new Error("Timed out waiting for live neuro websocket acknowledgement."));
          }
        }, 8000);

        socket.onopen = () => {
          socket.send(
            JSON.stringify({
              sourceId: "dashboard-live-socket",
              label: "Dashboard live socket",
              sessionId,
              kind: "electrical-series",
              rateHz: snapshot?.neuroSessions[0]?.primaryRateHz ?? 1000,
              syncJitterMs: 0.35,
              channels: 8,
              samples: [
                [0.11, -0.14, 0.19, -0.07, 0.12, -0.11, 0.18, -0.08],
                [0.13, -0.1, 0.21, -0.05, 0.14, -0.09, 0.2, -0.07],
                [0.1, -0.12, 0.17, -0.06, 0.11, -0.14, 0.16, -0.08],
                [0.14, -0.09, 0.22, -0.04, 0.13, -0.1, 0.19, -0.05]
              ]
            })
          );
        };

        socket.onmessage = (event) => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeout);
          const message = JSON.parse(String(event.data)) as { type: string; message?: string };
          socket.close();
          if (message.type === "error") {
            reject(new Error(message.message ?? "Failed to ingest live neuro frame."));
            return;
          }
          resolve();
        };

        socket.onerror = () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error("Live neuro websocket failed."));
          }
        };
      });

      const snapshotResponse = await harnessFetch(`${harnessBaseUrl}/api/snapshot`, {
        cache: "no-store"
      });
      const snapshotPayload = (await snapshotResponse.json()) as { snapshot: PhaseSnapshot };
      handleSnapshot(snapshotPayload.snapshot);
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to inject live neuro frame.");
    } finally {
      setLiveIngressRunning(false);
    }
  });

  const stopLatestLiveSource = useEffectEvent(async () => {
    const source = snapshot?.neuroReplays.find(
      (candidate) => candidate.source === "live-socket" && candidate.status === "running"
    );
    if (!source) {
      setErrorText("No active live source is available to stop.");
      return;
    }

    try {
      setLiveIngressStopping(true);
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/neuro/live/${source.id}/stop`,
        {
          purpose: ["neuro-streaming"],
          policyId: "neuro-stream-default",
          consentScope: `live-source:${source.id}`,
          actor: "dashboard"
        },
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({})
        }
      );
      const payload = (await response.json()) as { snapshot?: PhaseSnapshot; error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Failed to stop live source.");
      }
      if (payload.snapshot) {
        handleSnapshot(payload.snapshot);
      }
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to stop live source.");
    } finally {
      setLiveIngressStopping(false);
    }
  });

  const registerPreferredLayer = useEffectEvent(async () => {
    try {
      setRegisteringLayer(true);
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/intelligence/ollama/register`,
        {
          purpose: ["cognitive-registration"],
          policyId: "cognitive-ops-default",
          consentScope: "system:intelligence",
          actor: "dashboard"
        },
        {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
        }
      );
      const payload = (await response.json()) as { snapshot?: PhaseSnapshot; error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Failed to register preferred layer.");
      }
      if (payload.snapshot) {
        handleSnapshot(payload.snapshot);
      }
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to register preferred layer.");
    } finally {
      setRegisteringLayer(false);
    }
  });

  const visibleNeuroFrames =
    neuroFrameDetails.length > 0 ? neuroFrameDetails : (snapshot?.neuroFrames ?? []);
  const visibleCognitiveExecutions =
    cognitiveExecutionDetails.length > 0
      ? cognitiveExecutionDetails
      : (snapshot?.cognitiveExecutions ?? []);
  const visibleActuationOutputs =
    actuationDetails.length > 0 ? actuationDetails : (snapshot?.actuationOutputs ?? []);

  const dispatchActuation = useEffectEvent(async () => {
    try {
      const response = await governedHarnessFetch(
        `${harnessBaseUrl}/api/actuation/dispatch`,
        {
          purpose: ["actuation-dispatch"],
          policyId: "actuation-dispatch-default",
          consentScope:
            snapshot?.neuroSessions[0]?.id
              ? `session:${snapshot.neuroSessions[0].id}`
              : "system:actuation",
          actor: "dashboard"
        },
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sessionId: snapshot?.neuroSessions[0]?.id
          })
        }
      );
      const payload = (await response.json()) as {
        snapshot?: PhaseSnapshot;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "Failed to dispatch actuation.");
      }
      if (payload.snapshot) {
        handleSnapshot(payload.snapshot);
      }
      setErrorText(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to dispatch actuation.");
    }
  });

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Immaculate / Overwatch</p>
          <h1>Realtime orchestration visibility across reflex, cognitive, and offline planes.</h1>
          <p className="lede">
            Live synthetic connectome propagation, phase pass telemetry, and operator-grade status
            coherence from one dashboard.
          </p>
        </div>
        <div className="hero-status">
          <span className={`status-dot ${connected ? "online" : "offline"}`} />
          <span>{connected ? "stream connected" : "stream offline"}</span>
          <span>{snapshot?.timestamp ?? "waiting for clock"}</span>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Reflex latency"
          value={snapshot ? `${snapshot.metrics.reflexLatencyMs.toFixed(1)} ms` : "--"}
          accent="#7ef5d3"
        />
        <MetricCard
          label="Cognitive latency"
          value={snapshot ? `${snapshot.metrics.cognitiveLatencyMs.toFixed(1)} ms` : "--"}
          accent="#ffd166"
        />
        <MetricCard
          label="Graph health"
          value={snapshot ? formatPercent(snapshot.metrics.graphHealth) : "--"}
          accent="#8ec5ff"
        />
        <MetricCard
          label="Coherence"
          value={snapshot ? formatPercent(snapshot.metrics.coherence) : "--"}
          accent="#ff7b72"
        />
        <MetricCard
          label="Propagation"
          value={snapshot ? formatPercent(snapshot.metrics.propagationRate) : "--"}
          accent="#5ecbff"
        />
        <MetricCard
          label="Throughput"
          value={snapshot ? `${Math.round(snapshot.metrics.throughput)} ops/s` : "--"}
          accent="#f5af5b"
        />
        <MetricCard
          label="Intelligence layers"
          value={snapshot ? String(snapshot.intelligenceLayers.length) : "--"}
          accent="#c7a6ff"
        />
        <MetricCard
          label="Last cognition"
          value={
            visibleCognitiveExecutions[0]
              ? `${visibleCognitiveExecutions[0].latencyMs.toFixed(1)} ms`
              : "--"
          }
          accent="#ff9cba"
        />
        <MetricCard
          label="Actuation outputs"
          value={String(visibleActuationOutputs.length)}
          accent="#7cf0ff"
        />
      </section>

      <section className="panel hero-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">3D propagation</p>
            <h2>Live connectome movement</h2>
          </div>
          <div className="meta-block">
            <span>Profile: {snapshot?.profile ?? "booting"}</span>
            <span>Intent: {snapshot?.intent ?? "waiting"}</span>
            <span>Cycle: {snapshot?.cycle ?? "--"}</span>
            <span>
              {persistence
                ? `${persistence.recoveryMode} lineage / ${persistence.integrityStatus ?? "unchecked"} integrity / ${persistence.checkpointCount} checkpoints`
                : "fresh lineage"}
            </span>
          </div>
        </div>
        <div className="scene-wrap">
          <ConnectomeScene snapshot={deferredSnapshot} />
        </div>
      </section>

      <section className="panel benchmark-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Benchmark</p>
            <h2>Published readiness benchmark</h2>
          </div>
          <div className="benchmark-actions">
            <button
              className="benchmark-button"
              onClick={() => {
                void runBenchmark();
              }}
              disabled={benchmarkRunning}
              type="button"
            >
              {benchmarkRunning ? "Running benchmark..." : "Run and publish benchmark"}
            </button>
            <button
              className="benchmark-button"
              onClick={() => {
                void publishBenchmarkToWandb();
              }}
              disabled={wandbPublishing || !(wandbStatus?.sdkInstalled ?? false)}
              type="button"
            >
              {wandbPublishing ? "Publishing to W&B..." : "Publish latest to W&B"}
            </button>
          </div>
        </div>
        <p className="body-copy">
          {benchmark?.summary ??
            "No published benchmark yet. Run the suite to publish the current orchestration baseline."}
        </p>
        <p className="body-copy">
          Benchmark packs: <strong>{benchmarkPackCount}</strong>
          {benchmarkJobId ? (
            <>
              {" "}
              / active job: <strong>{benchmarkJobId}</strong>
            </>
          ) : null}
        </p>
        <p className="body-copy">
          W&B:{" "}
          <strong>
            {wandbStatus
              ? `${wandbStatus.mode} / ${wandbStatus.entity} / ${wandbStatus.project}`
              : "status unavailable"}
          </strong>
        </p>
        <p className="body-copy">{wandbStatus?.note ?? "W&B status not loaded yet."}</p>
        {benchmark?.attribution ? (
          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Publication owner</p>
                <h2>{benchmark.attribution.owner}</h2>
              </div>
              <span>{benchmark.attribution.role}</span>
            </div>
            {benchmark.attribution.website ? (
              <p className="body-copy">
                <a href={benchmark.attribution.website} rel="noreferrer" target="_blank">
                  {benchmark.attribution.website}
                </a>
              </p>
            ) : null}
            <div className="log-stack">
              {benchmark.attribution.contributions.map((item) => (
                <div className="log-line" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="data-table benchmark-table">
          <div className="data-row head benchmark-assertion-head">
            <span>Assertion</span>
            <span>Status</span>
            <span>Target</span>
            <span>Actual</span>
            <span>Detail</span>
          </div>
          {benchmark?.assertions.slice(0, 8).map((assertion) => (
            <div className="data-row benchmark-assertion-row" key={assertion.id}>
              <span>{assertion.label}</span>
              <span>{assertion.status}</span>
              <span>{assertion.target}</span>
              <span>{assertion.actual}</span>
              <span>{assertion.detail}</span>
            </div>
          ))}
        </div>
        <div className="content-grid benchmark-progress-grid">
          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Current progress</p>
                <h2>{benchmark?.progress.stage ?? "No published stage yet"}</h2>
              </div>
            </div>
            <div className="log-stack">
              {benchmark?.progress.completed.map((item) => (
                <div className="log-line" key={item}>
                  {item}
                </div>
              )) ?? <div className="log-line">Run the benchmark suite to publish the current stage.</div>}
            </div>
          </div>

          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Remaining progression</p>
                <h2>Next real milestones</h2>
              </div>
            </div>
            <div className="log-stack">
              {benchmark?.progress.remaining.map((item) => (
                <div className="log-line" key={item}>
                  {item}
                </div>
              )) ?? <div className="log-line">No published roadmap items yet.</div>}
            </div>
          </div>
        </div>
        {benchmark?.comparison ? (
          <div className="content-grid benchmark-progress-grid">
            <div className="panel benchmark-subpanel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Trend</p>
                  <h2>Delta vs previous baseline</h2>
                </div>
                <span>
                  +{benchmark.comparison.improvedCount} / -{benchmark.comparison.regressedCount} / ={benchmark.comparison.unchangedCount}
                </span>
              </div>
              <div className="data-table benchmark-table">
                <div className="data-row head benchmark-delta-head">
                  <span>Series</span>
                  <span>Before</span>
                  <span>After</span>
                  <span>Delta</span>
                  <span>Trend</span>
                </div>
                {benchmark.comparison.deltas.map((delta) => (
                  <div className="data-row benchmark-delta-row" key={delta.seriesId}>
                    <span>{delta.label}</span>
                    <span>{delta.before.toFixed(2)}</span>
                    <span>{delta.after.toFixed(2)}</span>
                    <span>{delta.percentDelta.toFixed(2)}%</span>
                    <span>{delta.trend}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel benchmark-subpanel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">History</p>
                  <h2>Recent benchmark ledger</h2>
                </div>
              </div>
              <div className="data-table benchmark-table">
                <div className="data-row head benchmark-history-head">
                  <span>Suite</span>
                  <span>Time</span>
                  <span>Integrity</span>
                  <span>Failures</span>
                  <span>Recovery</span>
                </div>
                {benchmarkHistory?.entries.slice(0, 6).map((entry) => (
                  <div className="data-row benchmark-history-row" key={entry.suiteId}>
                    <span>{entry.suiteId.replace("immaculate-benchmark-", "")}</span>
                    <span>{entry.generatedAt.slice(11, 19)}</span>
                    <span>{entry.integrityStatus}</span>
                    <span>{entry.failedAssertions}</span>
                    <span>{entry.recoveryMode}</span>
                  </div>
                )) ?? <div className="log-line">No benchmark history published yet.</div>}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Nodes</p>
              <h2>Active topology</h2>
            </div>
            <span>{snapshot?.nodes.length ?? 0} nodes</span>
          </div>
          <div className="data-table">
            <div className="data-row head">
              <span>Plane</span>
              <span>Label</span>
              <span>Activation</span>
              <span>Load</span>
              <span>Trust</span>
            </div>
            {snapshot?.nodes.map((node) => (
              <NodeRow key={node.id} node={node} />
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Phases</p>
              <h2>Pass execution</h2>
            </div>
            <span>{snapshot?.status ?? "waiting"}</span>
          </div>
          <div className="data-table">
            <div className="data-row head">
              <span>Phase</span>
              <span>Plane</span>
              <span>State</span>
              <span>Latency</span>
              <span>Progress</span>
            </div>
            {snapshot?.passes.map((pass) => (
              <PassRow key={pass.id} pass={pass} />
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Datasets</p>
            <h2>Registered neurodata inputs</h2>
          </div>
          <span>{snapshot?.datasets.length ?? 0} datasets</span>
        </div>
        <div className="data-table">
          <div className="data-row head">
            <span>Name</span>
            <span>Source</span>
            <span>Subjects</span>
            <span>Files</span>
            <span>Modalities</span>
          </div>
          {snapshot?.datasets.map((dataset) => (
            <div className="data-row" key={dataset.id}>
              <span>{dataset.name}</span>
              <span>{dataset.source}</span>
              <span>{dataset.subjectCount}</span>
              <span>{dataset.fileCount}</span>
              <span>{dataset.modalities.map((entry) => entry.modality).join(", ")}</span>
            </div>
          )) ?? <div className="log-line">No datasets registered yet.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Neuro sessions</p>
            <h2>Registered time-series inputs</h2>
          </div>
          <div className="benchmark-actions">
            <span>{snapshot?.neuroSessions.length ?? 0} sessions</span>
            <button
              className="benchmark-button"
              onClick={() => {
                void injectLiveFrame();
              }}
              disabled={liveIngressRunning}
              type="button"
            >
              {liveIngressRunning ? "Injecting live frame..." : "Inject live frame"}
            </button>
            <button
              className="benchmark-button"
              onClick={() => {
                void startLatestReplay();
              }}
              disabled={replayRunning || !(snapshot?.neuroSessions.length ?? 0)}
              type="button"
            >
              {replayRunning ? "Starting replay..." : "Replay latest session"}
            </button>
            <button
              className="benchmark-button"
              onClick={() => {
                void stopLatestReplay();
              }}
              disabled={replayStopping}
              type="button"
            >
              {replayStopping ? "Stopping replay..." : "Stop latest replay"}
            </button>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row head">
            <span>Name</span>
            <span>Streams</span>
            <span>Channels</span>
            <span>Primary rate</span>
            <span>Source</span>
          </div>
          {snapshot?.neuroSessions.map((session) => (
            <div className="data-row" key={session.id}>
              <span>{session.name}</span>
              <span>{session.streamCount}</span>
              <span>{session.totalChannels}</span>
              <span>{session.primaryRateHz ? `${session.primaryRateHz} Hz` : "variable"}</span>
              <span>{session.source}</span>
            </div>
          )) ?? <div className="log-line">No neuro sessions registered yet.</div>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Neuro ingress</p>
            <h2>Live synchronize/decode windows</h2>
          </div>
          <span>
            {snapshot?.neuroReplays.length ?? 0} sources / {activeReplayCount} active replay / {activeLiveSourceCount} active live
          </span>
        </div>
        <div className="benchmark-actions">
          <button
            className="benchmark-button"
            onClick={() => {
              void stopLatestLiveSource();
            }}
            disabled={liveIngressStopping}
            type="button"
          >
            {liveIngressStopping ? "Stopping live source..." : "Stop latest live source"}
          </button>
        </div>
        <div className="content-grid benchmark-progress-grid">
          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Ingress ledger</p>
                <h2>Active and recent sources</h2>
              </div>
            </div>
            <div className="data-table">
              <div className="data-row head">
                <span>Name</span>
                <span>Source</span>
                <span>Status</span>
                <span>Windows</span>
                <span>Decode-ready</span>
                <span>Last jitter</span>
              </div>
              {snapshot?.neuroReplays.map((replay) => (
                <div className="data-row" key={replay.id}>
                  <span>{replay.name}</span>
                  <span>{replay.source}</span>
                  <span>{replay.status}</span>
                  <span>
                    {replay.completedWindows}/{replay.totalWindows}
                  </span>
                  <span>{formatPercent(replay.decodeReadyRatio)}</span>
                  <span>{replay.lastSyncJitterMs.toFixed(2)} ms</span>
                </div>
              )) ?? <div className="log-line">No neuro replays active yet.</div>}
            </div>
          </div>

          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Frame windows</p>
                <h2>Latest bounded sample windows</h2>
              </div>
            </div>
            <div className="data-table">
              <div className="data-row head">
                <span>Window</span>
                <span>Source</span>
                <span>Channels</span>
                <span>Confidence</span>
                <span>Jitter</span>
                <span>Status</span>
              </div>
              {visibleNeuroFrames.slice(0, 8).map((frame) => (
                <div className="data-row" key={frame.id}>
                  <span>
                    {frame.windowIndex + 1} ({frame.sampleStart}-{frame.sampleEnd})
                  </span>
                  <span>{frame.source}</span>
                  <span>{frame.channelCount}</span>
                  <span>{formatPercent(frame.decodeConfidence)}</span>
                  <span>{frame.syncJitterMs.toFixed(2)} ms</span>
                  <span>{frame.decodeReady ? "decode-ready" : "warming"}</span>
                </div>
              )) ?? <div className="log-line">No live neuro frame windows ingested yet.</div>}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Intelligence</p>
            <h2>Live cognitive layer</h2>
          </div>
          <div className="benchmark-actions">
            <button
              className="benchmark-button"
              onClick={() => {
                void runCognition();
              }}
              disabled={cognitionRunning}
              type="button"
            >
              {cognitionRunning ? "Running local cognition..." : "Run local Gemma pass"}
            </button>
            <button
              className="benchmark-button"
              onClick={() => {
                void dispatchActuation();
              }}
              disabled={
                !(snapshot?.cognitiveExecutions.length ?? 0) &&
                !(snapshot?.neuroFrames.length ?? 0)
              }
              type="button"
            >
              Dispatch actuation
            </button>
          </div>
        </div>
        <div className="content-grid benchmark-progress-grid">
          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Layers</p>
                <h2>Registered cognition backends</h2>
              </div>
              <div className="benchmark-actions">
                <span>{snapshot?.intelligenceLayers.length ?? 0} layers / {ollamaModels.length} local models</span>
                <button
                  className="benchmark-button"
                  onClick={() => {
                    void registerPreferredLayer();
                  }}
                  disabled={registeringLayer}
                  type="button"
                >
                  {registeringLayer ? "Registering..." : "Register preferred layer"}
                </button>
              </div>
            </div>
            <div className="data-table">
              <div className="data-row head">
                <span>Role</span>
                <span>Name</span>
                <span>Model</span>
                <span>Status</span>
                <span>Backend</span>
              </div>
              {snapshot?.intelligenceLayers.map((layer) => (
                <div className="data-row" key={layer.id}>
                  <span>{layer.role}</span>
                  <span>{layer.name}</span>
                  <span>{layer.model}</span>
                  <span>{layer.status}</span>
                  <span>{layer.backend}</span>
                </div>
              )) ?? <div className="log-line">No intelligence layers registered yet.</div>}
            </div>
          </div>

          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Executions</p>
                <h2>Committed cognitive traces</h2>
              </div>
              <span>{visibleCognitiveExecutions.length} traces</span>
            </div>
            <div className="data-table">
              <div className="data-row head">
                <span>Time</span>
                <span>Model</span>
                <span>Status</span>
                <span>Latency</span>
                <span>Preview</span>
              </div>
              {visibleCognitiveExecutions.slice(0, 6).map((execution) => (
                <div className="data-row" key={execution.id}>
                  <span>{execution.completedAt.slice(11, 19)}</span>
                  <span>{execution.model}</span>
                  <span>{execution.status}</span>
                  <span>{execution.latencyMs.toFixed(1)} ms</span>
                  <span>{execution.responsePreview}</span>
                </div>
              )) ?? <div className="log-line">No cognitive executions committed yet.</div>}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Actuation</p>
            <h2>Governed outbound feedback</h2>
          </div>
          <span>{visibleActuationOutputs.length} outputs / {actuationAdapters.length} adapters</span>
        </div>
        <div className="content-grid benchmark-progress-grid">
          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Outputs</p>
                <h2>Governed write intents</h2>
              </div>
            </div>
            <div className="data-table">
              <div className="data-row head">
                <span>Time</span>
                <span>Channel</span>
                <span>Status</span>
                <span>Intensity</span>
                <span>Command</span>
              </div>
              {visibleActuationOutputs.slice(0, 6).map((output) => (
                <div className="data-row" key={output.id}>
                  <span>{output.generatedAt.slice(11, 19)}</span>
                  <span>{output.channel}</span>
                  <span>{output.status}</span>
                  <span>{formatPercent(output.intensity)}</span>
                  <span>{output.command}</span>
                </div>
              )) ?? <div className="log-line">No actuation outputs dispatched yet.</div>}
            </div>
          </div>

          <div className="panel benchmark-subpanel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Adapters</p>
                <h2>Device policy lanes</h2>
              </div>
            </div>
            <div className="data-table">
              <div className="data-row head">
                <span>Adapter</span>
                <span>Protocol</span>
                <span>Channel</span>
                <span>Link</span>
                <span>Max</span>
                <span>Last transport</span>
                <span>Deliveries</span>
              </div>
              {actuationAdapters.slice(0, 6).map((adapter) => (
                <div className="data-row" key={adapter.id}>
                  <span>{adapter.label}</span>
                  <span>{adapter.protocolLabel}</span>
                  <span>{adapter.channel}</span>
                  <span>
                    {adapter.bridgeConnected
                      ? adapter.bridgeReady
                        ? `ready ${adapter.bridgeDeviceId ?? "device"}${adapter.bridgeSessionId ? ` (${adapter.bridgeSessionId})` : ""}`
                        : "connected / awaiting hello"
                      : "file fallback"}
                  </span>
                  <span>{formatPercent(adapter.maxIntensity)}</span>
                  <span>{adapter.lastDeliveryTransport ?? "--"}</span>
                  <span>{adapter.deliveryCount}</span>
                </div>
              )) ?? <div className="log-line">No actuation adapters available.</div>}
            </div>
          </div>
        </div>
        <div className="panel benchmark-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Deliveries</p>
              <h2>Recent adapter handoff</h2>
            </div>
          </div>
          <div className="data-table">
              <div className="data-row head">
                <span>Time</span>
                <span>Adapter</span>
                <span>Protocol</span>
                <span>Status</span>
                <span>Transport</span>
                <span>Intensity</span>
                <span>Ack</span>
                <span>Policy</span>
            </div>
            {actuationDeliveries.slice(0, 6).map((delivery) => (
              <div className="data-row" key={delivery.id}>
                <span>{delivery.generatedAt.slice(11, 19)}</span>
                <span>{delivery.adapterId}</span>
                <span>{delivery.protocolId}</span>
                <span>{delivery.status}</span>
                <span>{delivery.transport}</span>
                <span>{formatPercent(delivery.intensity)}</span>
                <span>{delivery.acknowledgedAt?.slice(11, 19) ?? "--"}</span>
                <span>{delivery.policyNote}</span>
              </div>
            )) ?? <div className="log-line">No actuation deliveries recorded yet.</div>}
          </div>
        </div>
        <div className="panel benchmark-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Protocols</p>
              <h2>Device transport profiles</h2>
            </div>
          </div>
          <div className="data-table">
            <div className="data-row head">
              <span>Protocol</span>
              <span>Device class</span>
              <span>Channel</span>
              <span>Capabilities</span>
            </div>
            {actuationProtocols.slice(0, 6).map((protocol) => (
              <div className="data-row" key={protocol.id}>
                <span>{protocol.label}</span>
                <span>{protocol.deviceClass}</span>
                <span>{protocol.channel}</span>
                <span>{protocol.requiredCapabilities.join(", ")}</span>
              </div>
            )) ?? <div className="log-line">No actuation protocols registered.</div>}
          </div>
        </div>
        <div className="panel benchmark-subpanel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Transports</p>
              <h2>Concrete hardware endpoints</h2>
            </div>
          </div>
          <div className="data-table">
            <div className="data-row head">
              <span>Label</span>
              <span>Kind</span>
              <span>Adapter</span>
              <span>Health</span>
              <span>Endpoint</span>
              <span>Device</span>
              <span>Heartbeat</span>
              <span>Caps</span>
              <span>Fault</span>
              <span>Deliveries</span>
            </div>
            {actuationTransports.slice(0, 6).map((transport) => (
              <div className="data-row" key={transport.id}>
                <span>{transport.label}</span>
                <span>{transport.kind}</span>
                <span>{transport.adapterId}</span>
                <span>{transport.health}</span>
                <span>{transport.kind === "serial-json" ? transport.devicePath ?? transport.endpoint : `${transport.remoteHost ?? "--"}:${transport.remotePort ?? "--"}`}</span>
                <span>{transport.deviceId ?? "--"}</span>
                <span>
                  {transport.heartbeatRequired
                    ? transport.lastHeartbeatAt
                      ? `${transport.lastHeartbeatAt.slice(11, 19)} / ${transport.lastHeartbeatLatencyMs?.toFixed(1) ?? "--"} ms`
                      : "awaiting"
                    : "not required"}
                </span>
                <span>
                  {transport.capabilityHealth
                    .map((entry) => `${entry.capability}:${entry.status}`)
                    .join(", ")}
                </span>
                <span>
                  {transport.isolationActive
                    ? `${transport.isolationReason ?? "isolated"}`
                    : transport.lastError ?? "--"}
                </span>
                <span>{transport.deliveryCount}</span>
              </div>
            )) ?? <div className="log-line">No concrete actuation transports registered.</div>}
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Narrative</p>
              <h2>Mission state</h2>
            </div>
          </div>
          <p className="body-copy">{snapshot?.objective ?? "No objective yet."}</p>
          <p className="body-copy">
            Highlight node: <strong>{snapshot?.highlightedNodeId ?? "none"}</strong>
          </p>
          <p className="body-copy">
            Last event: <strong>{snapshot?.lastEventId ?? "none"}</strong>
          </p>
          <p className="body-copy">
            Persisted events: <strong>{persistence?.persistedEventCount ?? 0}</strong> / history:{" "}
            <strong>{persistence?.persistedHistoryCount ?? 0}</strong>
          </p>
          <p className="body-copy">
            Checkpoints: <strong>{persistence?.checkpointCount ?? 0}</strong> / last checkpoint:{" "}
            <strong>{persistence?.lastCheckpointId ?? "none"}</strong>
          </p>
          <p className="body-copy">
            Neuro ingress windows: <strong>{visibleNeuroFrames.length}</strong> / live sources:{" "}
            <strong>
              {snapshot?.neuroReplays.filter((replay) => replay.source === "live-socket").length ?? 0}
            </strong>
          </p>
          <p className="body-copy">
            Intelligence layers: <strong>{snapshot?.intelligenceLayers.length ?? 0}</strong> / latest
            execution: <strong>{visibleCognitiveExecutions[0]?.model ?? "none"}</strong>
          </p>
          <p className="body-copy">
            Actuation outputs: <strong>{visibleActuationOutputs.length}</strong> / latest command:{" "}
            <strong>{visibleActuationOutputs[0]?.command ?? "none"}</strong>
          </p>
          <p className="body-copy">
            Integrity: <strong>{persistence?.integrityStatus ?? "unchecked"}</strong> / findings:{" "}
            <strong>{persistence?.integrityFindingCount ?? 0}</strong>
          </p>
          <p className="body-copy">
            Governance: <strong>{governance?.mode ?? "unknown"}</strong> / decisions:{" "}
            <strong>{governance?.decisionCount ?? 0}</strong> / denied:{" "}
            <strong>{governance?.deniedCount ?? 0}</strong>
          </p>
          <p className="body-copy">
            Topology API: <strong>{topology?.nodes ?? 0}</strong> nodes /{" "}
            <strong>{topology?.edges ?? 0}</strong> edges / last event{" "}
            <strong>{topology?.lastEventId ?? "none"}</strong>
          </p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Logs</p>
              <h2>Event tail</h2>
            </div>
          </div>
          <div className="log-stack">
            {snapshot?.logTail.map((line, index) => (
              <div className="log-line" key={`${line}-${index}`}>
                {line}
              </div>
            ))}
          </div>
          {errorText ? <p className="error-text">{errorText}</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Operator API</p>
            <h2>Surfaced backend control plane</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row head">
            <span>Surface</span>
            <span>State</span>
            <span>Preview</span>
            <span>Source</span>
          </div>
          <div className="data-row">
            <span>Governance</span>
            <span>{governance?.mode ?? "unknown"}</span>
            <span>{governance?.decisionCount ?? 0} decisions / {governance?.deniedCount ?? 0} denied</span>
            <span>/api/governance/status</span>
          </div>
          <div className="data-row">
            <span>Topology</span>
            <span>{topology?.cycle ?? "--"}</span>
            <span>{topology?.planes.join(", ") ?? "none"}</span>
            <span>/api/topology</span>
          </div>
          <div className="data-row">
            <span>Integrity</span>
            <span>{integrity?.status ?? "unchecked"}</span>
            <span>{integrity?.findingCount ?? 0} findings</span>
            <span>/api/integrity</span>
          </div>
          <div className="data-row">
            <span>Checkpoints</span>
            <span>{checkpoints.length}</span>
            <span>{checkpoints[0]?.id ?? "none"}</span>
            <span>/api/checkpoints</span>
          </div>
          <div className="data-row">
            <span>Raw events</span>
            <span>{rawEventCount}</span>
            <span>{replayEventCount} replay tail</span>
            <span>/api/events + /api/replay</span>
          </div>
          <div className="data-row">
            <span>Dataset detail</span>
            <span>{datasetDetail?.name ?? "none"}</span>
            <span>{datasetDetail?.rootPath ?? "not loaded"}</span>
            <span>/api/datasets + /api/datasets/:id</span>
          </div>
          <div className="data-row">
            <span>Session detail</span>
            <span>{sessionDetail?.name ?? "none"}</span>
            <span>{sessionDetail?.filePath ?? "not loaded"}</span>
            <span>/api/neuro/sessions + /api/neuro/sessions/:id</span>
          </div>
          <div className="data-row">
            <span>Replay managers</span>
            <span>{activeReplayCount}</span>
            <span>{activeLiveSourceCount} live sources</span>
            <span>/api/neuro/replays + /api/neuro/live/sources</span>
          </div>
          <div className="data-row">
            <span>Ollama registry</span>
            <span>{ollamaModels.length}</span>
            <span>{ollamaModels[0]?.model ?? "no models"}</span>
            <span>/api/intelligence/ollama/models + register</span>
          </div>
          <div className="data-row">
            <span>Derived reads</span>
            <span>{visibleNeuroFrames.length} frames</span>
            <span>{visibleCognitiveExecutions.length} executions</span>
            <span>/api/neuro/frames + /api/intelligence/executions</span>
          </div>
          <div className="data-row">
            <span>Actuation</span>
            <span>{visibleActuationOutputs.length} outputs</span>
            <span>{actuationDeliveries[0]?.adapterId ?? visibleActuationOutputs[0]?.status ?? "none"}</span>
            <span>/api/actuation/protocols + /api/actuation/transports + /api/actuation/transports/udp/register + /api/actuation/transports/serial/register + /api/actuation/transports/:transportId/heartbeat + /api/actuation/transports/:transportId/reset + /api/actuation/adapters + /api/actuation/deliveries + /api/actuation/outputs + /api/actuation/dispatch + WS /stream/actuation/device</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Materialization</p>
            <h2>Snapshot history</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row head">
            <span>Cycle</span>
            <span>Time</span>
            <span>Reflex</span>
            <span>Coherence</span>
            <span>Throughput</span>
          </div>
          {history.map((point) => (
            <HistoryRow key={`${point.cycle}-${point.epoch}`} point={point} />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Durability</p>
            <h2>Recovery spine</h2>
          </div>
        </div>
        <div className="data-table">
          <div className="data-row head">
            <span>Lineage</span>
            <span>Integrity</span>
            <span>Last snapshot</span>
            <span>Checkpoints</span>
            <span>Persisted events</span>
            <span>Rejected artifacts</span>
          </div>
          <div className="data-row">
            <span>{persistence?.recoveryMode ?? "fresh"}</span>
            <span>{persistence?.integrityStatus ?? "unchecked"}</span>
            <span>{persistence?.lastSnapshotAt?.slice(11, 19) ?? "--"}</span>
            <span>{persistence?.checkpointCount ?? 0}</span>
            <span>{persistence?.persistedEventCount ?? 0}</span>
            <span>{persistence?.invalidArtifactCount ?? 0}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
