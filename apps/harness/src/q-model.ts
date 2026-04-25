import { resolveQFoundationSpecification } from "./q-foundation.js";

const Q_MODEL_NAME = "Q";
const Q_DEVELOPER_NAME = "Arobi Technology Alliance";
const AROBI_NETWORK_NAME = "Arobi Network";
const Q_FOUNDATION_MODEL_NAME = "Gemma 4";
const Q_LEAD_NAME = "Gaetano Comparcola";
const IMMACULATE_HARNESS_NAME = "Immaculate";
const Q_CANONICAL_IDENTITY_RESPONSE =
  "I am Q, developed by Arobi Technology Alliance and built on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer behind the project. Immaculate is my governed orchestration harness, and Arobi Network is the operator ledger and audit substrate around us.";
const Q_PUBLIC_NAME_RESPONSE =
  "Users should see one public model name only: Q. Q was developed by Arobi Technology Alliance, built on Gemma 4, and led by Gaetano Comparcola. Immaculate is Q's governed orchestration harness, and Arobi Network is the operator ledger and audit substrate around that stack.";
const Q_HARNESS_RELATIONSHIP_RESPONSE =
  "Immaculate is Q's governed orchestration harness. Q provides the primary reasoning layer inside it, while Immaculate routes work, applies policy, records receipts, and decides which actions are allowed to proceed inside Arobi Network.";
const Q_NETWORK_RELATIONSHIP_RESPONSE =
  "Arobi Network is the ledger-backed private and public operator network and audit substrate for this system. Immaculate is the governed harness and orchestrator inside that network, and Q is the reasoning brain operating within it. The network anchors requests, decisions, evidence, and outcomes for review, replay, and insurability.";
const Q_BUILDER_RESPONSE =
  "Q was developed by Arobi Technology Alliance. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer for the project. Q is built on Gemma 4, operates inside Immaculate, and is anchored into Arobi Network.";
const Q_FOUNDATION_RESPONSE =
  "Q is built on Gemma 4. Q was developed by Arobi Technology Alliance, led by Gaetano Comparcola, and operates inside the Immaculate harness that anchors into Arobi Network.";
const Q_KNOWLEDGE_CUTOFF_LABEL = "June 2024";

export type QRuntimeContext = {
  currentDateIso: string;
  currentDateLabel: string;
  knowledgeCutoff: string;
  currentInformationPolicy: string;
};

export type QIdentityQuestionKind =
  | "identity"
  | "public-name"
  | "builder"
  | "foundation"
  | "harness"
  | "network";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function canonicalModelReference(value: string | undefined): string {
  const normalized = normalize(value ?? "");
  return normalized.endsWith(":latest") ? normalized.slice(0, -"latest".length - 1) : normalized;
}

export function getQModelName(): string {
  return Q_MODEL_NAME;
}

export function getQDeveloperName(): string {
  return Q_DEVELOPER_NAME;
}

export function getArobiNetworkName(): string {
  return AROBI_NETWORK_NAME;
}

export function getQLeadName(): string {
  return Q_LEAD_NAME;
}

export function getImmaculateHarnessName(): string {
  return IMMACULATE_HARNESS_NAME;
}

export function getQFoundationModelName(): string {
  return Q_FOUNDATION_MODEL_NAME;
}

export function getArobiOperatingModelSummary(): string {
  return `${getArobiNetworkName()} is the ledger-backed private and public operator network and audit substrate. ${getImmaculateHarnessName()} is the governed harness and orchestrator inside it. ${getQModelName()} is the reasoning brain running within that governed stack.`;
}

export function getQIdentitySummary(): string {
  return `${getQModelName()} is the only public model identity. Q was developed by ${getQDeveloperName()}, built on ${getQFoundationModelName()}, and led by founder, CEO, lead architect, and lead engineer ${getQLeadName()}. ${getArobiNetworkName()} is the ledger-backed private and public operator network and audit substrate. ${getImmaculateHarnessName()} is the governed harness around Q and should use Q as its primary reasoning model.`;
}

export function getQIdentityInstruction(): string {
  return `You are ${getQModelName()}, and Q is the only public model identity users should see. Do not present yourself as a different product name or as a swappable public alias. You were developed by ${getQDeveloperName()}, you are built on ${getQFoundationModelName()}, and ${getQLeadName()} is the founder, CEO, lead architect, and lead engineer for the project. ${getArobiNetworkName()} is the ledger-backed private and public operator network and audit substrate for this stack. ${getImmaculateHarnessName()} is your governed orchestration and harness, and it should use Q as its primary reasoning model. If the user asks who you are, who built you, what company developed you, how you relate to Immaculate, how you relate to ${getArobiNetworkName()}, or what your public name is, answer canonically with those facts and keep the answer explicit. If the user asks why a mediated route stayed on Q or held, explain it from the governed facts you were given rather than inventing a fallback story.`;
}

export function getQImmaculateRelationshipSummary(): string {
  return `${getImmaculateHarnessName()} governs Q's routing, policy, receipts, and action boundaries inside ${getArobiNetworkName()}, and should perceive Q as its primary governed reasoning model. Under mixed pressure, it should explain whether Q stayed primary because the local governed lane was healthy or whether it held because readiness or gateway substrate was not healthy enough.`;
}

export function buildQRuntimeContext(now = new Date()): QRuntimeContext {
  const currentDateIso = now.toISOString().slice(0, 10);
  const currentDateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(now);
  return {
    currentDateIso,
    currentDateLabel,
    knowledgeCutoff: Q_KNOWLEDGE_CUTOFF_LABEL,
    currentInformationPolicy:
      "For facts after the knowledge cutoff, use an approved retrieval/tool lane when available; if no retrieval lane is available, state that current verification is required instead of guessing."
  };
}

export function getQRuntimeContextInstruction(now = new Date()): string {
  const context = buildQRuntimeContext(now);
  return [
    `Current date: ${context.currentDateLabel} (${context.currentDateIso}, UTC).`,
    `Static model knowledge cutoff: ${context.knowledgeCutoff}.`,
    context.currentInformationPolicy
  ].join(" ");
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function detectQIdentityQuestion(
  value: string | undefined
): QIdentityQuestionKind | undefined {
  const candidate = normalize(value ?? "");
  if (!candidate) {
    return undefined;
  }

  if (
    containsAny(candidate, [
      /\bwho are you\b/i,
      /\bidentify yourself\b/i,
      /\bintroduce yourself\b/i,
      /\btell me about yourself\b/i,
      /\bwhat are you\b/i
    ])
  ) {
    return "identity";
  }

  if (
    containsAny(candidate, [
      /\bwhat model name should users see\b/i,
      /\bpublic model name\b/i,
      /\bpublic name\b/i,
      /\bwhat should users see\b/i,
      /\bwhat should i call you\b/i,
      /\bwhat are you called\b/i
    ])
  ) {
    return "public-name";
  }

  if (
    containsAny(candidate, [
      /\bwhat is immaculate\b/i,
      /\brole inside immaculate\b/i,
      /\bhow do you relate to immaculate\b/i,
      /\bwhat does immaculate do\b/i,
      /\bwhat is your role inside immaculate\b/i
    ])
  ) {
    return "harness";
  }

  if (
    containsAny(candidate, [
      /\bwhat is arobi network\b/i,
      /\bhow do you relate to arobi network\b/i,
      /\bwhat is the arobi network\b/i,
      /\bwhere are decisions anchored\b/i,
      /\bwhat ledger\b/i,
      /\bwhat network are you on\b/i
    ])
  ) {
    return "network";
  }

  if (
    containsAny(candidate, [
      /\bwho built you\b/i,
      /\bwho developed you\b/i,
      /\bwho made you\b/i,
      /\bwhat company\b/i,
      /\bwho led the project\b/i,
      /\bwho is the founder\b/i,
      /\bwho is the ceo\b/i
    ])
  ) {
    return "builder";
  }

  if (
    containsAny(candidate, [
      /\bwhat are you built on\b/i,
      /\bwhat is your foundation model\b/i,
      /\bwhat foundation model\b/i,
      /\bbuilt on gemma 4\b/i,
      /\bwhat is gemma 4 to you\b/i
    ])
  ) {
    return "foundation";
  }

  return undefined;
}

export function buildCanonicalQIdentityAnswer(
  kind: QIdentityQuestionKind = "identity"
): string {
  if (kind === "public-name") {
    return Q_PUBLIC_NAME_RESPONSE;
  }
  if (kind === "harness") {
    return Q_HARNESS_RELATIONSHIP_RESPONSE;
  }
  if (kind === "network") {
    return Q_NETWORK_RELATIONSHIP_RESPONSE;
  }
  if (kind === "builder") {
    return Q_BUILDER_RESPONSE;
  }
  if (kind === "foundation") {
    return Q_FOUNDATION_RESPONSE;
  }
  return Q_CANONICAL_IDENTITY_RESPONSE;
}

function identityAnswerHasRequiredFacts(
  value: string,
  kind: QIdentityQuestionKind
): boolean {
  const normalized = normalize(value);
  const required =
    kind === "public-name"
      ? ["q", "arobi technology alliance", "gemma 4", "gaetano comparcola", "immaculate"]
      : kind === "harness"
        ? ["immaculate", "q"]
        : kind === "network"
          ? ["arobi network", "immaculate", "q"]
        : kind === "builder"
          ? ["arobi technology alliance", "gaetano comparcola", "q"]
          : kind === "foundation"
            ? ["gemma 4", "q", "immaculate"]
            : ["q", "arobi technology alliance", "gaetano comparcola", "gemma 4", "immaculate"];

  return required.every((token) => normalized.includes(token));
}

export function canonicalizeQIdentityAnswer(
  question: string | undefined,
  response: string | undefined
): string {
  const kind = detectQIdentityQuestion(question);
  const candidate = response?.trim() ?? "";
  if (!kind) {
    return candidate;
  }
  if (!candidate) {
    return buildCanonicalQIdentityAnswer(kind);
  }
  if (/\bi am\b/i.test(candidate) && !/\bi am q\b/i.test(candidate)) {
    return buildCanonicalQIdentityAnswer(kind);
  }
  return identityAnswerHasRequiredFacts(candidate, kind)
    ? candidate
    : buildCanonicalQIdentityAnswer(kind);
}

export function getQModelTarget(): string {
  return resolveQFoundationSpecification().baseModel;
}

export function isQModelName(value: string | undefined): boolean {
  const candidate = canonicalModelReference(value);
  return (
    candidate === canonicalModelReference(resolveQFoundationSpecification().modelName) ||
    candidate === canonicalModelReference(resolveQFoundationSpecification().displayName)
  );
}

export function foundationModelLabel(value: string | undefined): string {
  const actual = resolveQModel(value) ?? resolveQFoundationSpecification().baseModel;
  return isQTargetModel(actual) ? getQFoundationModelName() : actual;
}

export function isQTargetModel(value: string | undefined): boolean {
  return canonicalModelReference(value) === canonicalModelReference(resolveQFoundationSpecification().baseModel);
}

export function resolveQModel(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return value;
  }
  return isQModelName(value) ? resolveQFoundationSpecification().baseModel : value.trim();
}

export function displayModelName(value: string | undefined): string {
  if (!value?.trim()) {
    return getQModelName();
  }
  return isQTargetModel(resolveQModel(value))
    ? getQModelName()
    : value.trim();
}

export function matchesModelReference(left: string | undefined, right: string | undefined): boolean {
  return canonicalModelReference(resolveQModel(left) ?? left) === canonicalModelReference(resolveQModel(right) ?? right);
}

export function truthfulModelLabel(value: string | undefined): string {
  const actual = resolveQModel(value) ?? resolveQFoundationSpecification().baseModel;
  return isQTargetModel(actual) ? getQModelName() : actual;
}

export function vendorForModel(value: string | undefined): string {
  const actual = resolveQModel(value) ?? "";
  if (isQTargetModel(actual) || isQModelName(value)) {
    return getQDeveloperName();
  }
  return "External";
}
