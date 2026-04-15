type OllamaAliasCandidate = {
  name?: string;
  model?: string;
};

export type OllamaAliasSpecification = {
  alias: string;
  displayName: string;
  baseModel: string;
  terms: string[];
};

const DEFAULT_Q_ALIAS = "q";
const DEFAULT_Q_BASE_MODEL =
  process.env.IMMACULATE_OLLAMA_Q_BASE_MODEL ??
  process.env.IMMACULATE_OLLAMA_Q_MODEL ??
  DEFAULT_Q_ALIAS.toUpperCase();

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeTerms(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseAliasTerms(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function defaultQTerms(baseModel: string): string[] {
  const normalizedBase = normalizeToken(baseModel);
  const baseWithoutTag = normalizedBase.split(":")[0] ?? normalizedBase;

  return dedupeTerms([
    normalizedBase,
    baseWithoutTag,
    baseWithoutTag.replace(/[^a-z0-9]+/g, ""),
    DEFAULT_Q_ALIAS,
    DEFAULT_Q_ALIAS.toUpperCase(),
    "immaculate q",
    "q lane"
  ]);
}

function loadConfiguredAliasHints(): Map<string, string[]> {
  const hints = new Map<string, string[]>();
  const raw = process.env.IMMACULATE_OLLAMA_MODEL_ALIASES?.trim();

  if (!raw) {
    return hints;
  }

  for (const entry of raw.split(";")) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const alias = normalizeToken(entry.slice(0, separatorIndex));
    const terms = parseAliasTerms(entry.slice(separatorIndex + 1));
    if (alias.length === 0 || terms.length === 0) {
      continue;
    }

    hints.set(alias, dedupeTerms(terms));
  }

  return hints;
}

function buildAliasHintMap(): Map<string, string[]> {
  const hints = loadConfiguredAliasHints();
  if (!hints.has(DEFAULT_Q_ALIAS)) {
    hints.set(DEFAULT_Q_ALIAS, defaultQTerms(DEFAULT_Q_BASE_MODEL));
  }

  return hints;
}

export function resolveQAliasSpecification(): OllamaAliasSpecification {
  const alias = normalizeToken(process.env.IMMACULATE_OLLAMA_Q_ALIAS ?? DEFAULT_Q_ALIAS) || DEFAULT_Q_ALIAS;
  const displayName = alias.toUpperCase();
  const hints = buildAliasHintMap();
  const configuredTerms = hints.get(alias) ?? defaultQTerms(DEFAULT_Q_BASE_MODEL);

  return {
    alias,
    displayName,
    baseModel: DEFAULT_Q_BASE_MODEL,
    terms: dedupeTerms([DEFAULT_Q_BASE_MODEL, ...configuredTerms])
  };
}

export function expandOllamaAliasSearchText(modelReference: string, baseSearchText: string): string {
  const normalizedReference = normalizeToken(modelReference);
  const hints = buildAliasHintMap();
  const aliasTerms = hints.get(normalizedReference);
  if (!aliasTerms) {
    return baseSearchText;
  }

  return `${baseSearchText} ${aliasTerms.join(" ")}`.trim();
}

export function matchAliasedOllamaModel<T extends OllamaAliasCandidate>(
  models: T[],
  explicitModel: string,
  buildSearchText: (model: T) => string
): T | null {
  const normalizedExplicitModel = normalizeToken(explicitModel);
  const hints = buildAliasHintMap();
  const aliasTerms = hints.get(normalizedExplicitModel);
  if (!aliasTerms) {
    return null;
  }

  const scored = models
    .map((model) => {
      const search = buildSearchText(model);
      let score = 0;

      for (const term of aliasTerms) {
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

export function buildQAliasModelfile(specification = resolveQAliasSpecification()): string {
  return [
    `# Local Immaculate identity for ${specification.displayName}`,
    "# This keeps the current Q lineage bound to the stable local Q model name.",
    `FROM ${specification.baseModel}`,
    ""
  ].join("\n");
}
