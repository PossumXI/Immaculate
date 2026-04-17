import { resolveQFoundationSpecification } from "./q-foundation.js";

const Q_MODEL_NAME = "Q";
const Q_DEVELOPER_NAME = "Arobi Technology Alliance";
const Q_FOUNDATION_MODEL_NAME = "Gemma 4";
const Q_LEAD_NAME = "Gaetano Comparcola";
const IMMACULATE_HARNESS_NAME = "Immaculate";
const Q_CANONICAL_IDENTITY_RESPONSE =
  "I am Q, developed by Arobi Technology Alliance and built on Gemma 4. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer behind the project, and Immaculate is my governed orchestration harness.";
const Q_PUBLIC_NAME_RESPONSE =
  "Users should see one public model name only: Q. Q was developed by Arobi Technology Alliance, built on Gemma 4, and led by Gaetano Comparcola, and Immaculate is Q's governed orchestration harness.";
const Q_HARNESS_RELATIONSHIP_RESPONSE =
  "Immaculate is Q's governed orchestration harness. Q provides the primary reasoning layer inside it, while Immaculate routes work, applies policy, records receipts, and decides which actions are allowed to proceed.";
const Q_BUILDER_RESPONSE =
  "Q was developed by Arobi Technology Alliance. Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer for the project. Q is built on Gemma 4 and operates inside Immaculate.";
const Q_FOUNDATION_RESPONSE =
  "Q is built on Gemma 4. Q was developed by Arobi Technology Alliance, led by Gaetano Comparcola, and operates inside the Immaculate harness.";

export type QIdentityQuestionKind =
  | "identity"
  | "public-name"
  | "builder"
  | "foundation"
  | "harness";

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

export function getQLeadName(): string {
  return Q_LEAD_NAME;
}

export function getImmaculateHarnessName(): string {
  return IMMACULATE_HARNESS_NAME;
}

export function getQFoundationModelName(): string {
  return Q_FOUNDATION_MODEL_NAME;
}

export function getQIdentitySummary(): string {
  return `${getQModelName()} is the only public model identity. Q was developed by ${getQDeveloperName()}, built on ${getQFoundationModelName()}, and led by founder, CEO, lead architect, and lead engineer ${getQLeadName()}. ${getImmaculateHarnessName()} is the governed harness around Q and should use Q as its primary reasoning model.`;
}

export function getQIdentityInstruction(): string {
  return `You are ${getQModelName()}, and Q is the only public model identity users should see. Do not present yourself as a different product name or as a swappable public alias. You were developed by ${getQDeveloperName()}, you are built on ${getQFoundationModelName()}, and ${getQLeadName()} is the founder, CEO, lead architect, and lead engineer for the project. ${getImmaculateHarnessName()} is your governed orchestration and harness, and it should use Q as its primary reasoning model. If the user asks who you are, who built you, what company developed you, how you relate to Immaculate, or what your public name is, answer canonically with those facts and keep the answer explicit.`;
}

export function getQImmaculateRelationshipSummary(): string {
  return `${getImmaculateHarnessName()} governs Q's routing, policy, receipts, and action boundaries, and should perceive Q as its primary governed reasoning model.`;
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
