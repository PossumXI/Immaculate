type OllamaModelCandidate = {
  name?: string;
  model?: string;
};

export type QModelFoundationSpecification = {
  modelName: string;
  displayName: string;
  baseModel: string;
  lineageSource: string;
  terms: string[];
};

const DEFAULT_Q_MODEL_TOKEN = "q";
const DEFAULT_Q_DISPLAY_NAME = "Q";
const DEFAULT_Q_LINEAGE_SOURCE =
  process.env.IMMACULATE_OLLAMA_Q_LINEAGE_SOURCE ??
  process.env.IMMACULATE_OLLAMA_Q_SOURCE_MODEL ??
  "gemma4:e2b";
const DEFAULT_Q_BASE_MODEL =
  process.env.IMMACULATE_OLLAMA_Q_BASE_MODEL ??
  process.env.IMMACULATE_OLLAMA_Q_MODEL ??
  process.env.IMMACULATE_OLLAMA_Q_NAME ??
  DEFAULT_Q_MODEL_TOKEN;

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeTerms(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function defaultQTerms(baseModel: string): string[] {
  const normalizedBase = normalizeToken(baseModel);
  const baseWithoutTag = normalizedBase.split(":")[0] ?? normalizedBase;

  return dedupeTerms([
    normalizedBase,
    baseWithoutTag,
    baseWithoutTag.replace(/[^a-z0-9]+/g, ""),
    DEFAULT_Q_MODEL_TOKEN,
    DEFAULT_Q_DISPLAY_NAME,
    "immaculate q",
    "q lane"
  ]);
}

function buildQSearchTerms(): string[] {
  return defaultQTerms(DEFAULT_Q_BASE_MODEL);
}

function isQReference(value: string | undefined): boolean {
  const normalizedValue = normalizeToken(value ?? "");
  if (!normalizedValue) {
    return false;
  }
  const normalizedBaseModel = normalizeToken(DEFAULT_Q_BASE_MODEL);
  const normalizedBaseWithoutTag = normalizedBaseModel.split(":")[0] ?? normalizedBaseModel;
  return (
    normalizedValue === normalizeToken(DEFAULT_Q_MODEL_TOKEN) ||
    normalizedValue === normalizeToken(DEFAULT_Q_DISPLAY_NAME) ||
    normalizedValue === normalizedBaseModel ||
    normalizedValue === normalizedBaseWithoutTag
  );
}

export function resolveQFoundationSpecification(): QModelFoundationSpecification {
  const modelName = DEFAULT_Q_MODEL_TOKEN;
  const displayName = DEFAULT_Q_DISPLAY_NAME;
  const configuredTerms = buildQSearchTerms();

  return {
    modelName,
    displayName,
    baseModel: DEFAULT_Q_BASE_MODEL,
    lineageSource: DEFAULT_Q_LINEAGE_SOURCE,
    terms: dedupeTerms([DEFAULT_Q_BASE_MODEL, DEFAULT_Q_LINEAGE_SOURCE, ...configuredTerms])
  };
}

export function expandQModelSearchText(modelReference: string, baseSearchText: string): string {
  if (!isQReference(modelReference)) {
    return baseSearchText;
  }

  return `${baseSearchText} ${buildQSearchTerms().join(" ")}`.trim();
}

export function matchQModelCandidate<T extends OllamaModelCandidate>(
  models: T[],
  explicitModel: string,
  buildSearchText: (model: T) => string
): T | null {
  if (!isQReference(explicitModel)) {
    return null;
  }

  const searchTerms = buildQSearchTerms();
  const scored = models
    .map((model) => {
      const search = buildSearchText(model);
      let score = 0;

      for (const term of searchTerms) {
        const normalizedTerm = normalizeToken(term);
        if (normalizedTerm.length > 0 && search.includes(normalizedTerm)) {
          score += 1;
        }
      }

      return {
        model,
        score
      };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.model.name ?? left.model.model ?? "").localeCompare(right.model.name ?? right.model.model ?? "")
    );

  return scored[0]?.model ?? null;
}
