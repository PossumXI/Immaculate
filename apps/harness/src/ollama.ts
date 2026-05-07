import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import {
  type CognitiveExecution,
  type GuardVerdict,
  type GovernancePressureLevel,
  type IntelligenceLayer,
  type IntelligenceLayerRole,
  type PhaseSnapshot
} from "@immaculate/core";
import {
  expandQModelSearchText,
  matchQModelCandidate,
  resolveQFoundationSpecification
} from "./q-foundation.js";
import { resolveQLocalOllamaUrl } from "./q-local-model.js";
import {
  resolveQOrchestrationContext,
  type QOrchestrationContext
} from "./q-orchestration-context.js";
import {
  getImmaculateHarnessName,
  getQDeveloperName,
  getQFoundationModelName,
  getQIdentityInstruction,
  getQIdentitySummary,
  getQImmaculateRelationshipSummary,
  getQLeadName,
  getQModelName
} from "./q-model.js";

type OllamaModelDetails = {
  family?: string;
  families?: string[];
  parameter_size?: string;
  quantization_level?: string;
};

type OllamaModelRecord = {
  name: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: OllamaModelDetails;
};

type OllamaTagResponse = {
  models?: OllamaModelRecord[];
};

type OllamaGenerateResponse = {
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  response?: string;
  total_duration?: number;
  eval_duration?: number;
  prompt_eval_duration?: number;
  done?: boolean;
  done_reason?: string;
};

export type OllamaFailureClass =
  | "transport_timeout"
  | "http_error"
  | "invalid_json"
  | "empty_response"
  | "contract_invalid";

export type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OllamaChatCompletionResult = {
  response: string;
  model: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  done: boolean;
  thinkingDetected: boolean;
  responsePreview: string;
  failureClass?: OllamaFailureClass;
  errorMessage?: string;
};

type OllamaResponseFormat = "json" | Record<string, unknown>;

export type OllamaExecutionResult = {
  response: string;
  execution: CognitiveExecution;
  failureClass?: OllamaFailureClass;
  thinkingDetected: boolean;
  structuredFieldCount: number;
};

const DEFAULT_OLLAMA_URL = resolveQLocalOllamaUrl();
const DEFAULT_MODEL = process.env.IMMACULATE_OLLAMA_MODEL;
const DEFAULT_ROLE = (process.env.IMMACULATE_OLLAMA_ROLE as IntelligenceLayerRole | undefined) ?? "mid";
const DEFAULT_CONTROL_TIMEOUT_MS = Number(process.env.IMMACULATE_OLLAMA_CONTROL_TIMEOUT_MS ?? 180000);
const DEFAULT_STRUCTURED_MAX_TOKENS = 120;
const DEFAULT_STRUCTURED_TEMPERATURE = 0.2;
const Q_STRUCTURED_MAX_TOKENS = Math.max(
  96,
  Number(process.env.IMMACULATE_OLLAMA_Q_EXECUTION_MAX_TOKENS ?? 160) || 160
);
const Q_STRUCTURED_TEMPERATURE = Number(
  process.env.IMMACULATE_OLLAMA_Q_EXECUTION_TEMPERATURE ?? 0.05
);
const Q_GENERATE_FAST_NUM_CTX = Math.max(
  512,
  Number(process.env.IMMACULATE_OLLAMA_Q_GENERATE_NUM_CTX ?? 768) || 768
);
const Q_GENERATE_FAST_NUM_BATCH = Math.max(
  32,
  Number(process.env.IMMACULATE_OLLAMA_Q_GENERATE_NUM_BATCH ?? 64) || 64
);
const HTTP_KEEP_ALIVE_AGENT = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15_000,
  maxSockets: 32
});
const HTTPS_KEEP_ALIVE_AGENT = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15_000,
  maxSockets: 32
});

function normalizeBaseUrl(baseUrl = DEFAULT_OLLAMA_URL): string {
  return baseUrl.replace(/\/+$/, "");
}

function truncate(value: string, maxLength = 280): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeWords(value: string, maxWords = 24): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
}

const STRUCTURED_ROUTE_VALUES = ["reflex", "cognitive", "guarded", "suppressed"] as const;
type StructuredRouteValue = (typeof STRUCTURED_ROUTE_VALUES)[number];

function clampTemperature(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeModel(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isQExecutionModel(value: string | undefined): boolean {
  const candidate = normalizeModel(value);
  if (!candidate) {
    return false;
  }

  const qFoundation = resolveQFoundationSpecification();
  const normalizedBase = normalizeModel(qFoundation.baseModel);
  const normalizedBaseWithoutTag = normalizedBase.split(":")[0] ?? normalizedBase;

  return (
    candidate === normalizedBase ||
    candidate === normalizedBaseWithoutTag ||
    candidate === normalizeModel(qFoundation.modelName) ||
    candidate === normalizeModel(qFoundation.displayName) ||
    candidate.startsWith(`${normalizedBaseWithoutTag}:`) ||
    candidate.startsWith(`${normalizedBaseWithoutTag}-`)
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

class OllamaRequestError extends Error {
  readonly failureClass: Exclude<OllamaFailureClass, "empty_response" | "contract_invalid">;

  constructor(
    failureClass: Exclude<OllamaFailureClass, "empty_response" | "contract_invalid">,
    message: string
  ) {
    super(message);
    this.name = "OllamaRequestError";
    this.failureClass = failureClass;
  }
}

function layerIdForModel(model: string, role: IntelligenceLayerRole): string {
  const normalized = model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `ollama-${role}-${normalized || "model"}`;
}

function modelSearchText(model: OllamaModelRecord): string {
  const baseSearchText = [
    model.name,
    model.model,
    model.details?.family,
    ...(model.details?.families ?? []),
    model.details?.parameter_size
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return expandQModelSearchText(model.name ?? model.model ?? "", baseSearchText);
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 5000,
  baseUrl = DEFAULT_OLLAMA_URL
): Promise<T> {
  const base = normalizeBaseUrl(baseUrl);
  const url = new URL(path.startsWith("/") ? `${base}${path}` : `${base}/${path}`);
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  const rawBody = init?.body;
  const body =
    typeof rawBody === "string"
      ? rawBody
      : rawBody instanceof Uint8Array
        ? Buffer.from(rawBody)
        : rawBody == null
          ? undefined
          : (() => {
              throw new OllamaRequestError("http_error", "Unsupported Ollama request body type.");
            })();

  try {
    return await new Promise<T>((resolve, reject) => {
      const requestImpl = url.protocol === "https:" ? https.request : http.request;
      const request = requestImpl(
        url,
        {
          method,
          headers: Object.fromEntries(headers.entries()),
          agent: url.protocol === "https:" ? HTTPS_KEEP_ALIVE_AGENT : HTTP_KEEP_ALIVE_AGENT
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.on("end", () => {
            const payloadText = Buffer.concat(chunks).toString("utf8");
            if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
              const detail = payloadText.trim().slice(0, 240);
              reject(
                new OllamaRequestError(
                  "http_error",
                  detail.length > 0
                    ? `Ollama request failed with status ${response.statusCode}: ${detail}`
                    : `Ollama request failed with status ${response.statusCode}.`
                )
              );
              return;
            }
            try {
              resolve(JSON.parse(payloadText) as T);
            } catch (error) {
              reject(
                new OllamaRequestError(
                  "invalid_json",
                  error instanceof Error
                    ? `Ollama returned invalid JSON: ${error.message}`
                    : "Ollama returned invalid JSON."
                )
              );
            }
          });
        }
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new OllamaRequestError(
            "transport_timeout",
            `Ollama request timed out after ${timeoutMs} ms.`
          )
        );
      });
      request.on("error", (error) => {
        reject(
          error instanceof OllamaRequestError
            ? error
            : new OllamaRequestError(
                "http_error",
                error instanceof Error ? error.message : "Unable to reach the configured Q runtime endpoint."
              )
        );
      });

      if (body) {
        request.write(body);
      }
      request.end();
    });
  } catch (error) {
    throw error;
  }
}

export async function listOllamaModels(baseUrl = DEFAULT_OLLAMA_URL): Promise<OllamaModelRecord[]> {
  const payload = await fetchJson<OllamaTagResponse>("/api/tags", undefined, 3500, baseUrl);
  return Array.isArray(payload.models) ? payload.models : [];
}

function pickPreferredModel(
  models: OllamaModelRecord[],
  role: IntelligenceLayerRole,
  explicitModel?: string
): OllamaModelRecord | null {
  void role;
  const qFoundation = resolveQFoundationSpecification();
  const preferredModel = explicitModel ?? DEFAULT_MODEL ?? qFoundation.modelName;
  const exactQCandidate =
    models.find(
      (model) =>
        normalizeModel(model.name) === normalizeModel(qFoundation.baseModel) ||
        normalizeModel(model.model) === normalizeModel(qFoundation.baseModel)
    ) ?? null;

  if (exactQCandidate) {
    return exactQCandidate;
  }

  return (
    matchQModelCandidate(models, preferredModel, modelSearchText) ??
    matchQModelCandidate(models, qFoundation.modelName, modelSearchText) ??
    matchQModelCandidate(models, qFoundation.baseModel, modelSearchText) ??
    null
  );
}

export async function discoverPreferredOllamaLayer(
  role: IntelligenceLayerRole = DEFAULT_ROLE,
  baseUrl = DEFAULT_OLLAMA_URL,
  explicitModel?: string
): Promise<IntelligenceLayer | null> {
  const models = await listOllamaModels(baseUrl);
  const preferred = pickPreferredModel(models, role, explicitModel);
  if (!preferred) {
    return null;
  }

  const modelName = preferred.name;
  const qFoundation = resolveQFoundationSpecification();
  const layerLabel = modelName === qFoundation.baseModel ? qFoundation.displayName : modelName;
  return {
    id: layerIdForModel(modelName, role),
    name: `${layerLabel} ${role === "mid" ? "Mid Layer" : role === "reasoner" ? "Reasoner Layer" : `${role} Layer`}`,
    backend: "ollama",
    model: modelName,
    role,
    status: "ready",
    endpoint: normalizeBaseUrl(baseUrl),
    family: preferred.details?.family ?? preferred.details?.families?.[0],
    parameterSize: preferred.details?.parameter_size,
    quantization: preferred.details?.quantization_level,
    registeredAt: new Date().toISOString()
  };
}

function formatDatasetSection(snapshot: PhaseSnapshot): string {
  if (snapshot.datasets.length === 0) {
    return "none";
  }

  return snapshot.datasets
    .slice(0, 4)
    .map(
      (dataset) =>
        `${dataset.name} | ${dataset.subjectCount} subjects | ${dataset.modalities.map((entry) => entry.modality).join(", ")}`
    )
    .join("\n");
}

function formatNeuroSection(snapshot: PhaseSnapshot): string {
  if (snapshot.neuroSessions.length === 0) {
    return "none";
  }

  return snapshot.neuroSessions
    .slice(0, 4)
    .map(
      (session) =>
        `${session.name} | ${session.streamCount} streams | ${session.totalChannels} channels | ${session.primaryRateHz ?? "variable"} Hz`
    )
    .join("\n");
}

function formatPassSection(snapshot: PhaseSnapshot): string {
  return snapshot.passes
    .map((pass) => `${pass.phase}:${pass.state}:${pass.latencyMs.toFixed(1)}ms`)
    .join("\n");
}

function formatRecentExecutionSection(snapshot: PhaseSnapshot): string {
  if (snapshot.cognitiveExecutions.length === 0) {
    return "none";
  }

  return snapshot.cognitiveExecutions
    .slice(0, 3)
    .map(
      (execution) =>
        `${execution.model} | ${execution.status} | ${execution.latencyMs.toFixed(1)}ms | ${truncate(execution.objective, 120)}`
    )
    .join("\n");
}

function formatQRecentExecutionSection(snapshot: PhaseSnapshot): string {
  if (snapshot.cognitiveExecutions.length === 0) {
    return "none";
  }

  return snapshot.cognitiveExecutions
    .slice(0, 2)
    .map(
      (execution) =>
        `${execution.status}:${execution.latencyMs.toFixed(0)}ms:${truncate(execution.objective, 72)}`
    )
    .join(" | ");
}

function formatScheduleSection(snapshot: PhaseSnapshot): string {
  if (snapshot.executionSchedules.length === 0) {
    return "none";
  }

  return snapshot.executionSchedules
    .slice(0, 3)
    .map(
      (schedule) =>
        `${schedule.mode} | width=${schedule.layerIds.length} | primary=${schedule.primaryLayerId ?? "none"} | ${schedule.estimatedLatencyMs.toFixed(1)}ms`
    )
    .join("\n");
}

function formatConversationSection(snapshot: PhaseSnapshot): string {
  if (snapshot.conversations.length === 0) {
    return "none";
  }

  return snapshot.conversations
    .slice(0, 2)
    .map(
      (conversation) =>
        `${conversation.mode} | turns=${conversation.turnCount} | verdict=${conversation.guardVerdict} | ${truncate(conversation.summary, 96)}`
    )
    .join("\n");
}

function responseContract(role: IntelligenceLayerRole): string {
  if (role === "guard") {
    return `Return exactly:
ROUTE: reflex, cognitive, guarded, or suppressed.
REASON: one sentence, max 18 words, naming the decisive fault or health signal.
COMMIT: one sentence, max 18 words, naming the concrete next control action.
VERDICT: approved or blocked.
No bullets. No preamble. No extra sections.`;
  }

  return `Return exactly:
ROUTE: reflex, cognitive, guarded, or suppressed.
REASON: one sentence, max 18 words, naming the decisive fault or health signal.
COMMIT: one sentence, max 18 words, naming the concrete next control action.
No bullets. No preamble. No extra sections.`;
}

function collectGroundingFacts(
  snapshot: PhaseSnapshot,
  objective: string,
  context: string,
  governancePressure?: GovernancePressureLevel,
  qContext?: QOrchestrationContext
): string[] {
  const haystack = [objective, context, snapshot.logTail.slice(0, 6).join(" | ")]
    .join(" ")
    .toLowerCase();
  const facts: string[] = [];
  const add = (fact: string, condition: boolean) => {
    if (condition && !facts.includes(fact)) {
      facts.push(fact);
    }
  };

  add("late ACK present", /\blate ack\b/.test(haystack));
  add(
    "nonce replay or mismatch present",
    /\bnonce\b.*\b(replay|mismatch)\b|\breplay\b.*\bnonce\b/.test(haystack)
  );
  add("bridge path degraded", /\bbridge\b.*\b(degraded|fault|unhealthy|late ack)\b/.test(haystack));
  add("direct path healthy", /\bdirect\b.*\b(healthy|http\/2|allowed)\b/.test(haystack));
  add("fail-closed semantics required", /\bfail-closed\b/.test(haystack));
  add("lease jitter present", /\blease jitter\b/.test(haystack));
  add("failed execution present", /\bfailed execution\b|\bone failed execution\b/.test(haystack));
  add("repair window pending", /\brepair window\b|\brepair pending\b/.test(haystack));
  add("same-origin operator access required", /\bsame-origin\b/.test(haystack));
  add("bearer tokens must stay out of URLs", /\bbearer token\b|\bbearer tokens\b|\burl\b/.test(haystack));
  add("mixed transport health", /\bmixed transport\b/.test(haystack));
  add("guarded action preferred", /\bguard(ed|)\b/.test(haystack));
  add("strong decode confidence present", snapshot.neuralCoupling.decodeConfidence >= 0.78);
  add("critical governance pressure", governancePressure === "critical");
  add("elevated governance pressure", governancePressure === "elevated");
  add("gateway substrate verified", Boolean(qContext?.gatewaySubstrateHealthy));
  add("cloud lane blocked", Boolean(qContext && !qContext.cloudLaneReady));
  add("local q lane preferred", qContext?.preferredExecutionLane === "local-q");

  if (facts.length === 0) {
    add(`top status ${snapshot.status}`, true);
    add(`latest event ${truncate(snapshot.logTail[0] ?? "none", 72)}`, true);
  }

  for (const fact of qContext?.groundedFacts ?? []) {
    add(fact, true);
  }

  return facts.slice(0, 8);
}

type QGroundingHints = {
  lateAck: boolean;
  nonceReplay: boolean;
  bridgeDegraded: boolean;
  directHealthy: boolean;
  failClosed: boolean;
  leaseJitter: boolean;
  failedExecution: boolean;
  repairPending: boolean;
  sameOrigin: boolean;
  tokenUrlRisk: boolean;
  mixedTransport: boolean;
  criticalPressure: boolean;
  elevatedPressure: boolean;
  gatewayVerified: boolean;
  cloudLaneBlocked: boolean;
  localQLanePreferred: boolean;
};

function deriveQGroundingHints(groundingFacts: string[]): QGroundingHints {
  const has = (value: string) => groundingFacts.includes(value);
  return {
    lateAck: has("late ACK present"),
    nonceReplay: has("nonce replay or mismatch present"),
    bridgeDegraded: has("bridge path degraded"),
    directHealthy: has("direct path healthy"),
    failClosed: has("fail-closed semantics required"),
    leaseJitter: has("lease jitter present"),
    failedExecution: has("failed execution present"),
    repairPending: has("repair window pending"),
    sameOrigin: has("same-origin operator access required"),
    tokenUrlRisk: has("bearer tokens must stay out of URLs"),
    mixedTransport: has("mixed transport health"),
    criticalPressure: has("critical governance pressure"),
    elevatedPressure: has("elevated governance pressure"),
    gatewayVerified: has("gateway substrate verified"),
    cloudLaneBlocked: has("cloud lane blocked"),
    localQLanePreferred: has("local q lane preferred")
  };
}

function selectQGroundingFacts(groundingFacts: string[]): string[] {
  if (groundingFacts.length <= 4) {
    return groundingFacts;
  }

  const priority = [
    `Q model name ${getQModelName()}`,
    `Q built on ${getQFoundationModelName()}`,
    `Q developed by ${getQDeveloperName()}`,
    `Q led by ${getQLeadName()}`,
    `${getImmaculateHarnessName()} governs Q`,
    "late ACK present",
    "nonce replay or mismatch present",
    "bridge path degraded",
    "direct path healthy",
    "fail-closed semantics required",
    "lease jitter present",
    "failed execution present",
    "repair window pending",
    "same-origin operator access required",
    "bearer tokens must stay out of URLs",
    "mixed transport health",
    "critical governance pressure",
    "elevated governance pressure",
    "gateway substrate verified",
    "cloud lane blocked",
    "local q lane preferred"
  ];

  const ranked = priority.filter((entry) => groundingFacts.includes(entry));
  return ranked.slice(0, 4);
}

function normalizeStructuredRoute(value: string | undefined): StructuredRouteValue | undefined {
  const candidate = normalizeWords(value ?? "", 12).toLowerCase();
  if (!candidate) {
    return undefined;
  }
  if ((STRUCTURED_ROUTE_VALUES as readonly string[]).includes(candidate)) {
    return candidate as StructuredRouteValue;
  }

  const exactMatch = STRUCTURED_ROUTE_VALUES.find((route) => new RegExp(`\\b${route}\\b`, "i").test(candidate));
  if (exactMatch) {
    return exactMatch;
  }

  if (candidate.includes("guard")) {
    return "guarded";
  }
  if (candidate.includes("suppress") || candidate.includes("block")) {
    return "suppressed";
  }
  if (candidate.includes("cognit") || candidate.includes("repair") || candidate.includes("stabil")) {
    return "cognitive";
  }
  if (candidate.includes("reflex") || candidate.includes("direct")) {
    return "reflex";
  }
  return undefined;
}

function normalizeStructuredClause(value: string | undefined, fallback: string): string {
  const candidate = normalizeWords(value ?? "", 24);
  return candidate.length > 0 ? candidate : fallback;
}

function refineQStructuredResponse(
  parsed: ReturnType<typeof parseStructuredResponse>,
  hints: QGroundingHints,
  qContext?: QOrchestrationContext
): ReturnType<typeof parseStructuredResponse> {
  if (!parsed.routeSuggestion || !parsed.reasonSummary || !parsed.commitStatement) {
    return parsed;
  }

  if ((hints.lateAck || hints.nonceReplay || hints.bridgeDegraded) && hints.directHealthy) {
    return {
      ...parsed,
      routeSuggestion: "guarded",
      reasonSummary: normalizeStructuredClause(
        parsed.reasonSummary,
        "Late ACK or nonce replay leaves the bridge untrusted while direct HTTP/2 remains healthy."
      ),
      commitStatement: normalizeStructuredClause(
        parsed.commitStatement,
        "Quarantine the bridge ACK path, keep delivery unresolved, and route only through verified direct HTTP/2 if allowed."
      )
    };
  }

  if (hints.lateAck || hints.nonceReplay || hints.bridgeDegraded || hints.failClosed) {
    return {
      ...parsed,
      routeSuggestion: "guarded",
      reasonSummary: normalizeStructuredClause(
        parsed.reasonSummary,
        "Late ACK or nonce replay leaves the bridge untrusted, so delivery must stay fail-closed and truthful."
      ),
      commitStatement: normalizeStructuredClause(
        parsed.commitStatement,
        "Reject the forged ACK, keep delivery unacknowledged, and record the containment action in the audit trail."
      )
    };
  }

  if (hints.leaseJitter || hints.failedExecution || hints.repairPending) {
    return {
      ...parsed,
      routeSuggestion: "cognitive",
      reasonSummary: normalizeStructuredClause(
        parsed.reasonSummary,
        "Lease jitter and failed execution show the peer is unstable and still needs bounded repair."
      ),
      commitStatement: normalizeStructuredClause(
        parsed.commitStatement,
        "Bound retries around the peer lease, mark the peer repairing, and preserve retry lineage in the ledger."
      )
    };
  }

  if (hints.sameOrigin || hints.tokenUrlRisk) {
    return {
      ...parsed,
      routeSuggestion: "cognitive",
      reasonSummary: normalizeStructuredClause(
        parsed.reasonSummary,
        "Same-origin operator access is required, and bearer tokens must stay out of browser-visible URLs."
      ),
      commitStatement: normalizeStructuredClause(
        parsed.commitStatement,
        "Move credentials into same-origin headers or cookies and keep tokens out of URLs."
      )
    };
  }

  if (hints.mixedTransport || hints.criticalPressure || hints.elevatedPressure) {
    return {
      ...parsed,
      routeSuggestion: normalizeStructuredRoute(parsed.routeSuggestion) ?? "guarded",
      reasonSummary: normalizeStructuredClause(
        parsed.reasonSummary,
        "Mixed transport health under governance pressure requires a truthful guarded route."
      ),
      commitStatement: normalizeStructuredClause(
        parsed.commitStatement,
        "Pause unsafe dispatch, re-check transport health, and continue only on a verified healthy lane."
      )
    };
  }

  if (hints.cloudLaneBlocked || hints.localQLanePreferred) {
    return {
      ...parsed,
      routeSuggestion: normalizeStructuredRoute(parsed.routeSuggestion) ?? "cognitive",
      reasonSummary: normalizeStructuredClause(
        parsed.reasonSummary,
        "The local governed Q lane is the ready execution path, and the blocked cloud lane should not be claimed."
      ),
      commitStatement: normalizeStructuredClause(
        parsed.commitStatement,
        `Keep reasoning on the local governed Q lane, stay bound to ${qContext?.trainingBundleId ?? "the tracked Q bundle"}, and avoid cloud claims.`
      )
    };
  }

  return {
    ...parsed,
    routeSuggestion: normalizeStructuredRoute(parsed.routeSuggestion) ?? "cognitive",
    reasonSummary: normalizeStructuredClause(parsed.reasonSummary, parsed.reasonSummary),
    commitStatement: normalizeStructuredClause(parsed.commitStatement, parsed.commitStatement)
  };
}

export function buildImmaculatePrompt(options: {
  snapshot: PhaseSnapshot;
  model?: string;
  role: IntelligenceLayerRole;
  objective?: string;
  governancePressure?: GovernancePressureLevel;
  recentDeniedCount?: number;
  context?: string;
  qContext?: QOrchestrationContext;
}): string {
  const activeObjective = options.objective?.trim() || options.snapshot.objective;
  const context = options.context?.trim() || "none";
  const qCompactPrompt = isQExecutionModel(options.model);
  const groundingFacts = collectGroundingFacts(
    options.snapshot,
    activeObjective,
    context,
    options.governancePressure,
    options.qContext
  );
  const qGroundingFacts = selectQGroundingFacts(groundingFacts);
  const qIdentityLine = options.qContext?.identityInstruction ?? getQIdentityInstruction();
  const qIdentitySummary = options.qContext?.identitySummary ?? getQIdentitySummary();
  const qRelationshipSummary =
    options.qContext?.relationshipSummary ?? getQImmaculateRelationshipSummary();
  const qDeveloperSummary =
    options.qContext?.developerSummary ??
    `${qIdentitySummary} ${qRelationshipSummary}`;
  const qLeadershipSummary =
    options.qContext?.leadershipSummary ??
    "Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer for Q.";
  const qHarnessDirective =
    options.qContext?.harnessDirective ??
    "Immaculate should perceive Q as its primary governed reasoning model.";
  const qOrchestrationDoctrine =
    options.qContext?.orchestrationDoctrine ??
    "Immaculate routes context into Q, enforces policy and arbitration, and keeps actions truthful.";
  const qOperatorDiscipline =
    options.qContext?.operatorDisciplineSummary ??
    "Keep Q grounded, terse, and operator-grade.";
  const qReasoningDirective =
    options.qContext?.reasoningDirective ??
    "Prefer the healthy local governed Q lane and do not claim blocked cloud capability.";
  const qKnownWeaknesses = options.qContext?.knownWeaknesses ?? [];
  const qFailureClassHints = options.qContext?.failureClassHints ?? [];
  const qIdentityFacts = [
    `name=${getQModelName()}`,
    `developer=${getQDeveloperName()}`,
    `lead=${getQLeadName()}`,
    `foundation=${getQFoundationModelName()}`,
    `harness=${getImmaculateHarnessName()}`
  ].join(" | ");

  if (qCompactPrompt) {
    return `Immaculate governed Q decision pass.
${qIdentityLine}
${responseContract(options.role)}

objective=${truncate(activeObjective, 160)}
context=${truncate(context, 180)}
governance=${options.governancePressure ?? "clear"} pressure | ${options.recentDeniedCount ?? 0} denials | status ${options.snapshot.status}
grounding-facts=${qGroundingFacts.join(" | ") || "none"}
identity-facts=${qIdentityFacts}
identity=${qIdentitySummary}
relationship=${qRelationshipSummary}
developer=${truncate(qDeveloperSummary, 180)}
leadership=${truncate(qLeadershipSummary, 180)}
harness-directive=${truncate(qHarnessDirective, 180)}
doctrine=${truncate(qOrchestrationDoctrine, 180)}
discipline=${truncate(qOperatorDiscipline, 180)}
reasoning-directive=${truncate(qReasoningDirective, 180)}
known-weaknesses=${qKnownWeaknesses.map((entry) => truncate(entry, 96)).join(" | ") || "none"}
failure-hints=${qFailureClassHints.join(" | ") || "none"}
orchestration=${truncate(options.qContext?.summaryLine ?? "none", 180)}
recent=${formatQRecentExecutionSection(options.snapshot)}
rules=ROUTE must be one of reflex/cognitive/guarded/suppressed; if late ACK or nonce replay appears, say the bridge is untrusted and stay fail-closed; if direct HTTP/2 is healthy, say it is the trusted lane; prefer technical operator status phrases like bridge untrusted, bridge health degraded, delivery unresolved, and direct HTTP/2 is the trusted lane over abstract safety wording; if lease jitter or failed execution appears, stabilize the peer and preserve retry lineage; if same-origin access and token secrecy appear, keep tokens out of URLs; if the cloud lane is blocked, keep work on the local governed Q lane and do not claim cloud availability; if mixed pressure appears while the local Q lane is healthy, keep mediation on the governed local Q lane without drift; if a public terminal-bench miss is referenced, keep it in the repair loop and do not restamp it as solved; if context is missing, say what is missing instead of inventing a route; keep route, reason, and commit terse and operator-grade; do not restamp underperforming Harbor behavior as success; do not invent faults not present in grounding-facts; if identity is requested, answer with Q, Arobi Technology Alliance, Gaetano Comparcola, and ${getQFoundationModelName()}`;
  }

  return `Immaculate live cognition pass.
${qIdentityLine}
${responseContract(options.role)}

cycle=${options.snapshot.cycle} epoch=${options.snapshot.epoch} status=${options.snapshot.status}
intent=${options.snapshot.intent}
objective=${activeObjective}
focus=${options.snapshot.highlightedNodeId}
GOVERNANCE: ${options.governancePressure ?? "clear"} pressure | ${options.recentDeniedCount ?? 0} denials (5 min window)
reflex_ms=${options.snapshot.metrics.reflexLatencyMs.toFixed(1)} cognitive_ms=${options.snapshot.metrics.cognitiveLatencyMs.toFixed(1)}
health=${options.snapshot.metrics.graphHealth.toFixed(3)} coherence=${options.snapshot.metrics.coherence.toFixed(3)} throughput=${Math.round(options.snapshot.metrics.throughput)}
passes=${formatPassSection(options.snapshot)}
datasets=${formatDatasetSection(options.snapshot)}
neuro=${formatNeuroSection(options.snapshot)}
recent=${formatRecentExecutionSection(options.snapshot)}
schedules=${formatScheduleSection(options.snapshot)}
conversations=${formatConversationSection(options.snapshot)}
context=${context}
events=${options.snapshot.logTail.slice(0, 4).join(" | ") || "none"}
grounding=prefer explicit facts like late ACK, nonce mismatch/replay, degraded bridge, or healthy direct path over generic safety language
identity-facts=${qIdentityFacts}
identity=${qIdentitySummary}
relationship=${qRelationshipSummary}
developer=${truncate(qDeveloperSummary, 180)}
leadership=${truncate(qLeadershipSummary, 180)}
harness-directive=${truncate(qHarnessDirective, 180)}
doctrine=${truncate(qOrchestrationDoctrine, 180)}
discipline=${truncate(qOperatorDiscipline, 180)}
reasoning-directive=${truncate(qReasoningDirective, 180)}
known-weaknesses=${qKnownWeaknesses.map((entry) => truncate(entry, 96)).join(" | ") || "none"}
failure-hints=${qFailureClassHints.join(" | ") || "none"}`;
}

function buildQStructuredGeneratePrompt(options: {
  system: string;
  prompt: string;
  role: IntelligenceLayerRole;
}): string {
  const lines = [
    options.system.trim(),
    "Return JSON only.",
    'Use keys "route", "reason", "commit".',
    'route must be one of "reflex", "cognitive", "guarded", or "suppressed".',
    "reason must be one short operator-grade sentence grounded in the decisive health or fault signal.",
    "commit must be one short operator-grade sentence naming the next truthful control action."
  ];
  if (options.role === "guard") {
    lines.push('Include key "verdict" with value "approved", "blocked", or "unknown".');
  }
  lines.push("", "TASK:", options.prompt.trim());
  return lines.join("\n").trim();
}

function parseGuardVerdict(value: string | undefined, role: IntelligenceLayerRole): GuardVerdict | undefined {
  if (!value) {
    return role === "guard" ? "unknown" : undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("block")) {
    return "blocked";
  }
  if (normalized.includes("approve")) {
    return "approved";
  }
  return role === "guard" ? "unknown" : undefined;
}

function extractStructuredLine(
  response: string,
  field: "ROUTE" | "REASON" | "COMMIT" | "VERDICT"
): string | undefined {
  const matches = Array.from(
    response.matchAll(
      new RegExp(`${field}\\s*:\\s*(.+?)(?=\\s+(?:ROUTE|REASON|COMMIT|VERDICT)\\s*:|$)`, "gis")
    )
  );
  const value = matches.at(-1)?.[1];
  return value ? normalizeWords(value) : undefined;
}

function extractChannelTail(response: string): string {
  const trimmed = response.trim();
  const channelIndex = trimmed.lastIndexOf("<channel|>");
  if (channelIndex >= 0) {
    const candidate = trimmed.slice(channelIndex + "<channel|>".length).trim();
    if (candidate.length > 0) {
      return candidate;
    }
  }
  return trimmed;
}

function selectStructuredResponseCandidate(response: string): string {
  const trimmed = extractChannelTail(response);
  const routeMatches = Array.from(trimmed.matchAll(/ROUTE\s*:/gi));

  for (let index = routeMatches.length - 1; index >= 0; index -= 1) {
    const routeIndex = routeMatches[index]?.index;
    if (typeof routeIndex !== "number") {
      continue;
    }
    const candidate = trimmed.slice(routeIndex).trim();
    const routeSuggestion = extractStructuredLine(candidate, "ROUTE");
    const reasonSummary = extractStructuredLine(candidate, "REASON");
    const commitStatement = extractStructuredLine(candidate, "COMMIT");
    if (routeSuggestion && reasonSummary && commitStatement) {
      return candidate;
    }
  }

  return trimmed;
}

function extractJsonObjectCandidate(response: string): Record<string, unknown> | undefined {
  const trimmed = extractChannelTail(response).trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }
}

export function renderStructuredResponseContract(options: {
  routeSuggestion?: string;
  reasonSummary?: string;
  commitStatement?: string;
  guardVerdict?: GuardVerdict;
}): string {
  const lines = [
    `ROUTE: ${options.routeSuggestion ?? ""}`.trimEnd(),
    `REASON: ${options.reasonSummary ?? ""}`.trimEnd(),
    `COMMIT: ${options.commitStatement ?? ""}`.trimEnd()
  ];
  if (options.guardVerdict) {
    lines.push(`VERDICT: ${options.guardVerdict}`);
  }
  return lines.join("\n").trim();
}

export function parseStructuredJsonResponse(response: string, role: IntelligenceLayerRole) {
  const parsed = extractJsonObjectCandidate(response);
  if (!parsed) {
    return undefined;
  }
  const routeSuggestion = normalizeStructuredRoute(
    typeof parsed.route === "string" ? parsed.route : undefined
  );
  const reasonRaw = typeof parsed.reason === "string" ? parsed.reason : "";
  const commitRaw = typeof parsed.commit === "string" ? parsed.commit : "";
  if (!routeSuggestion || !reasonRaw.trim() || !commitRaw.trim()) {
    return undefined;
  }
  const reasonSummary = normalizeStructuredClause(reasonRaw, reasonRaw);
  const commitStatement = normalizeStructuredClause(commitRaw, commitRaw);
  const guardVerdict = parseGuardVerdict(
    typeof parsed.verdict === "string" ? parsed.verdict : undefined,
    role
  );
  return {
    normalizedResponse: renderStructuredResponseContract({
      routeSuggestion,
      reasonSummary,
      commitStatement,
      guardVerdict
    }),
    routeSuggestion,
    reasonSummary,
    commitStatement,
    guardVerdict
  };
}

export function parseStructuredResponse(response: string, role: IntelligenceLayerRole) {
  const normalizedResponse = selectStructuredResponseCandidate(response);
  const routeSuggestion = normalizeStructuredRoute(extractStructuredLine(normalizedResponse, "ROUTE"));
  const reasonSummary = extractStructuredLine(normalizedResponse, "REASON");
  const commitStatement = extractStructuredLine(normalizedResponse, "COMMIT");
  const explicitVerdict = extractStructuredLine(normalizedResponse, "VERDICT");

  return {
    normalizedResponse,
    routeSuggestion,
    reasonSummary,
    commitStatement,
    guardVerdict: parseGuardVerdict(explicitVerdict, role)
  };
}

function resolveStructuredExecutionProfile(model: string) {
  if (isQExecutionModel(model)) {
    return {
      maxTokens: Q_STRUCTURED_MAX_TOKENS,
      temperature: clampTemperature(Q_STRUCTURED_TEMPERATURE, 0.1)
    };
  }

  return {
    maxTokens: DEFAULT_STRUCTURED_MAX_TOKENS,
    temperature: DEFAULT_STRUCTURED_TEMPERATURE
  };
}

function computeLatencyMs(
  payload: Pick<OllamaGenerateResponse, "total_duration">,
  startedAt: string,
  completedAt: string
): number {
  return typeof payload.total_duration === "number"
    ? Number((payload.total_duration / 1_000_000).toFixed(2))
    : Math.max(1, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}

function formatOllamaFailurePreview(
  failureClass: OllamaFailureClass,
  errorMessage?: string,
  response?: string
): string {
  if (failureClass === "empty_response") {
    return "No response returned by the Q runtime.";
  }
  if (failureClass === "contract_invalid") {
    return truncate(
      response?.trim().length
        ? `Structured contract invalid: ${response}`
        : "Structured contract invalid: missing ROUTE, REASON, or COMMIT."
    );
  }
  return truncate(errorMessage?.trim() || "Q runtime execution failed.");
}

const STRUCTURED_PROMPT_LEAK_PATTERNS = [
  /\bone sentence\b/i,
  /\bmax\s+\d+\s+words\b/i,
  /\bno bullets\b/i,
  /\bno preamble\b/i,
  /\bno extra sections\b/i,
  /\bthe user wants me\b/i,
  /\bmy output must\b/i,
  /^\s*thought\b/i
];

function containsStructuredPromptLeak(value: string | undefined): boolean {
  const candidate = value?.trim();
  if (!candidate) {
    return false;
  }
  return STRUCTURED_PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(candidate));
}

export async function runOllamaChatCompletion(options: {
  endpoint?: string;
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  think?: boolean;
  format?: OllamaResponseFormat;
  ollamaOptions?: Record<string, unknown>;
}): Promise<OllamaChatCompletionResult> {
  const startedAt = new Date().toISOString();
  try {
    const payload = await fetchJson<OllamaGenerateResponse>(
      "/api/chat",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          stream: false,
          think: options.think ?? false,
          ...(options.format ? { format: options.format } : {}),
          messages: options.messages,
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 120,
            ...(options.ollamaOptions ?? {})
          }
        })
      },
      options.timeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS,
      options.endpoint ?? DEFAULT_OLLAMA_URL
    );
    const completedAt = new Date().toISOString();
    const response =
      typeof payload.message?.content === "string"
        ? payload.message.content.trim()
        : typeof payload.response === "string"
          ? payload.response.trim()
          : "";
    const thinkingDetected =
      typeof payload.message?.thinking === "string" && payload.message.thinking.trim().length > 0;
    const latencyMs = computeLatencyMs(payload, startedAt, completedAt);
    const failureClass = response.length > 0 ? undefined : "empty_response";
    return {
      response,
      model: options.model,
      startedAt,
      completedAt,
      latencyMs,
      done: payload.done !== false,
      thinkingDetected,
      responsePreview: truncate(
        failureClass ? formatOllamaFailurePreview(failureClass) : response
      ),
      failureClass
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const failureClass =
      error instanceof OllamaRequestError ? error.failureClass : "http_error";
    const errorMessage =
      error instanceof Error ? error.message : "Unable to reach the configured Q runtime endpoint.";
    return {
      response: "",
      model: options.model,
      startedAt,
      completedAt,
      latencyMs: Math.max(1, Date.parse(completedAt) - Date.parse(startedAt)),
      done: false,
      thinkingDetected: false,
      responsePreview: formatOllamaFailurePreview(failureClass, errorMessage),
      failureClass,
      errorMessage
    };
  }
}

export async function runOllamaGenerateCompletion(options: {
  endpoint?: string;
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  format?: OllamaResponseFormat;
  ollamaOptions?: Record<string, unknown>;
}): Promise<OllamaChatCompletionResult> {
  const startedAt = new Date().toISOString();
  try {
    const payload = await fetchJson<OllamaGenerateResponse>(
      "/api/generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: options.model,
          stream: false,
          prompt: options.prompt,
          ...(options.format ? { format: options.format } : {}),
          options: {
            temperature: options.temperature ?? 0.2,
            num_predict: options.maxTokens ?? 120,
            ...(options.ollamaOptions ?? {})
          }
        })
      },
      options.timeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS,
      options.endpoint ?? DEFAULT_OLLAMA_URL
    );
    const completedAt = new Date().toISOString();
    const response = typeof payload.response === "string" ? payload.response.trim() : "";
    const latencyMs = computeLatencyMs(payload, startedAt, completedAt);
    const failureClass = response.length > 0 ? undefined : "empty_response";
    return {
      response,
      model: options.model,
      startedAt,
      completedAt,
      latencyMs,
      done: payload.done !== false,
      thinkingDetected: false,
      responsePreview: truncate(
        failureClass ? formatOllamaFailurePreview(failureClass) : response
      ),
      failureClass
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const failureClass =
      error instanceof OllamaRequestError ? error.failureClass : "http_error";
    const errorMessage =
      error instanceof Error ? error.message : "Unable to reach the configured Q runtime endpoint.";
    return {
      response: "",
      model: options.model,
      startedAt,
      completedAt,
      latencyMs: Math.max(1, Date.parse(completedAt) - Date.parse(startedAt)),
      done: false,
      thinkingDetected: false,
      responsePreview: formatOllamaFailurePreview(failureClass, errorMessage),
      failureClass,
      errorMessage
    };
  }
}

export async function prewarmOllamaModel(options: {
  endpoint?: string;
  model: string;
  timeoutMs?: number;
}): Promise<OllamaChatCompletionResult> {
  if (isQExecutionModel(options.model)) {
    return runOllamaChatCompletion({
      endpoint: options.endpoint,
      model: options.model,
      messages: [
        {
          role: "system",
          content: "Warm the local Q runtime and answer with one short word."
        },
        {
          role: "user",
          content: "ready"
        }
      ],
      temperature: 0,
      maxTokens: 8,
      timeoutMs: options.timeoutMs ?? Math.max(DEFAULT_CONTROL_TIMEOUT_MS, 240_000),
      think: false,
      ollamaOptions: {
        num_ctx: Q_GENERATE_FAST_NUM_CTX,
        num_batch: Q_GENERATE_FAST_NUM_BATCH
      }
    });
  }
  return runOllamaChatCompletion({
    endpoint: options.endpoint,
    model: options.model,
    messages: [
      {
        role: "system",
        content: "Warm the model and reply with one lowercase word."
      },
      {
        role: "user",
        content: "ready"
      }
    ],
    temperature: 0,
    maxTokens: 8,
    timeoutMs: options.timeoutMs ?? Math.max(DEFAULT_CONTROL_TIMEOUT_MS, 240_000),
    think: false
  });
}

export async function runOllamaExecution(options: {
  snapshot: PhaseSnapshot;
  layer: IntelligenceLayer;
  objective?: string;
  governancePressure?: GovernancePressureLevel;
  recentDeniedCount?: number;
  context?: string;
  qContext?: QOrchestrationContext;
  timeoutMs?: number;
  retryTimeoutMs?: number;
}): Promise<OllamaExecutionResult> {
  const activeObjective = options.objective?.trim() || options.snapshot.objective;
  const activeContext = options.context?.trim() || "none";
  const resolvedQContext =
    isQExecutionModel(options.layer.model)
      ? (options.qContext ??
        (await resolveQOrchestrationContext({
          snapshot: options.snapshot,
          objective: activeObjective,
          context: activeContext
        })))
      : undefined;
  const groundingFacts = collectGroundingFacts(
    options.snapshot,
    activeObjective,
    activeContext,
    options.governancePressure,
    resolvedQContext
  );
  const qGroundingHints = deriveQGroundingHints(groundingFacts);
  const executionProfile = resolveStructuredExecutionProfile(options.layer.model);
  const prompt = buildImmaculatePrompt({
    snapshot: options.snapshot,
    model: options.layer.model,
    role: options.layer.role,
    objective: options.objective,
    governancePressure: options.governancePressure,
    recentDeniedCount: options.recentDeniedCount,
    context: options.context,
    qContext: resolvedQContext
  });
  const system = `You are ${options.layer.name}, the ${options.layer.role} cognition layer inside Immaculate.
You convert state into route/reason/commit outputs for a durable orchestration substrate.${
    options.layer.role === "guard"
      ? " You must include VERDICT: approved or blocked."
      : ""
  } ${resolvedQContext?.identityInstruction ?? getQIdentityInstruction()} Keep the reason grounded in the decisive concrete fault or health signal and keep the commit as the next truthful control action.`;
  const qGeneratePrompt = buildQStructuredGeneratePrompt({
    system,
    prompt,
    role: options.layer.role
  });
  const controlTimeoutMs = options.timeoutMs ?? DEFAULT_CONTROL_TIMEOUT_MS;
  const retryTimeoutMs =
    options.retryTimeoutMs ?? (options.timeoutMs ?? Math.max(DEFAULT_CONTROL_TIMEOUT_MS, 240_000));
  const executeStructuredAttempt = async (
    attempt: "initial" | "retry"
  ): Promise<OllamaChatCompletionResult> => {
    if (!isQExecutionModel(options.layer.model)) {
      return runOllamaChatCompletion({
        endpoint: options.layer.endpoint,
        model: options.layer.model,
        messages: [
          {
            role: "system",
            content: system
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: executionProfile.temperature,
        maxTokens: executionProfile.maxTokens,
        timeoutMs: attempt === "initial" ? controlTimeoutMs : retryTimeoutMs,
        think: false
      });
    }

    const generated = await runOllamaChatCompletion({
      endpoint: options.layer.endpoint,
      model: options.layer.model,
      messages: [
        {
          role: "system",
          content: system
        },
        {
          role: "user",
          content: qGeneratePrompt
        }
      ],
      temperature: executionProfile.temperature,
      maxTokens: executionProfile.maxTokens,
      timeoutMs: attempt === "initial" ? controlTimeoutMs : retryTimeoutMs,
      format: "json",
      think: false,
      ollamaOptions: {
        num_ctx: Q_GENERATE_FAST_NUM_CTX,
        num_batch: Q_GENERATE_FAST_NUM_BATCH
      }
    });
    if (generated.failureClass) {
      return generated;
    }
    const parsed = parseStructuredJsonResponse(generated.response, options.layer.role);
    if (!parsed) {
      return {
        ...generated,
        failureClass: "contract_invalid",
        responsePreview:
          generated.responsePreview || "Structured contract invalid: missing route, reason, or commit."
      };
    }
    return {
      ...generated,
      response: parsed.normalizedResponse,
      responsePreview: parsed.normalizedResponse
    };
  };

  let completion = await executeStructuredAttempt("initial");
  if (
    isQExecutionModel(options.layer.model) &&
    completion.failureClass &&
    ["transport_timeout", "http_error", "empty_response", "contract_invalid"].includes(
      completion.failureClass
    )
  ) {
    completion = await executeStructuredAttempt("retry");
  }
  const parsed = parseStructuredResponse(completion.response, options.layer.role);
  const refinedParsed =
    isQExecutionModel(options.layer.model) && !completion.failureClass
      ? refineQStructuredResponse(parsed, qGroundingHints, resolvedQContext)
      : parsed;
  const response = refinedParsed.normalizedResponse || completion.response;
  const structuredFieldCount = [
    refinedParsed.routeSuggestion,
    refinedParsed.reasonSummary,
    refinedParsed.commitStatement
  ].filter(Boolean).length;
  const contractValid =
    completion.done &&
    structuredFieldCount === 3 &&
    !containsStructuredPromptLeak(response) &&
    !containsStructuredPromptLeak(refinedParsed.routeSuggestion) &&
    !containsStructuredPromptLeak(refinedParsed.reasonSummary) &&
    !containsStructuredPromptLeak(refinedParsed.commitStatement);
  const failureClass =
    completion.failureClass ??
    (!contractValid ? "contract_invalid" : undefined);
  const execution: CognitiveExecution = {
    id: `cog-${new Date(completion.completedAt).toISOString().replace(/[:.]/g, "-")}-${digest(options.layer.id).slice(0, 8)}`,
    layerId: options.layer.id,
    model: options.layer.model,
    objective: activeObjective,
    status: failureClass ? "failed" : "completed",
    latencyMs: completion.latencyMs,
    startedAt: completion.startedAt,
    completedAt: completion.completedAt,
    promptDigest: digest(prompt).slice(0, 24),
    responsePreview: failureClass
      ? formatOllamaFailurePreview(failureClass, completion.errorMessage, response)
      : truncate(response),
    routeSuggestion: refinedParsed.routeSuggestion,
    reasonSummary: refinedParsed.reasonSummary,
    commitStatement: refinedParsed.commitStatement,
    guardVerdict: refinedParsed.guardVerdict,
    governancePressure: options.governancePressure,
    recentDeniedCount: options.recentDeniedCount
  };

  return {
    response,
    execution,
    failureClass,
    thinkingDetected: completion.thinkingDetected,
    structuredFieldCount
  };
}
