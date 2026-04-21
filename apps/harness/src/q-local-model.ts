export type QLocalModelSpecification = {
  modelName: string;
  displayName: string;
  lineageSource: string;
};

const DEFAULT_Q_MODEL_NAME =
  process.env.IMMACULATE_OLLAMA_Q_MODEL ??
  process.env.IMMACULATE_OLLAMA_Q_BASE_MODEL ??
  process.env.IMMACULATE_OLLAMA_Q_NAME ??
  "q";

const DEFAULT_Q_LINEAGE_SOURCE =
  process.env.IMMACULATE_OLLAMA_Q_LINEAGE_SOURCE ??
  process.env.IMMACULATE_OLLAMA_Q_SOURCE_MODEL ??
  "gemma4:e2b";
const DEFAULT_Q_OLLAMA_URL =
  process.env.IMMACULATE_Q_OLLAMA_URL ??
  process.env.IMMACULATE_OLLAMA_URL ??
  "http://127.0.0.1:11434";

function normalizeModelName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "q";
  }
  return trimmed.includes(":") ? trimmed : `${trimmed}:latest`;
}

export function resolveQLocalModelSpecification(): QLocalModelSpecification {
  return {
    modelName: normalizeModelName(DEFAULT_Q_MODEL_NAME),
    displayName: "Q",
    lineageSource: DEFAULT_Q_LINEAGE_SOURCE.trim() || "gemma4:e2b"
  };
}

export function resolveQLocalOllamaUrl(): string {
  const trimmed = DEFAULT_Q_OLLAMA_URL.trim();
  return trimmed.length > 0 ? trimmed : "http://127.0.0.1:11434";
}

export function buildQLocalModelfile(
  specification = resolveQLocalModelSpecification()
): string {
  return [
    `# Local ${specification.displayName} lineage for Immaculate`,
    "# Q remains the only public model identity; this file only pins the local Gemma 4 runtime.",
    `FROM ${specification.lineageSource}`,
    ""
  ].join("\n");
}
