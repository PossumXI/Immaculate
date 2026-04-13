import { resolveQAliasSpecification } from "./ollama-alias.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function getQModelAlias(): string {
  return resolveQAliasSpecification().displayName;
}

export function getQModelTarget(): string {
  return resolveQAliasSpecification().baseModel;
}

export function isQAlias(value: string | undefined): boolean {
  const specification = resolveQAliasSpecification();
  return (
    normalize(value ?? "") === normalize(specification.alias) ||
    normalize(value ?? "") === normalize(specification.displayName)
  );
}

export function isQTargetModel(value: string | undefined): boolean {
  return normalize(value ?? "") === normalize(resolveQAliasSpecification().baseModel);
}

export function resolveQModel(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return value;
  }
  return isQAlias(value) ? resolveQAliasSpecification().baseModel : value.trim();
}

export function displayModelName(value: string | undefined): string {
  if (!value?.trim()) {
    return resolveQAliasSpecification().displayName;
  }
  return isQTargetModel(resolveQModel(value))
    ? resolveQAliasSpecification().displayName
    : value.trim();
}

export function truthfulModelLabel(value: string | undefined): string {
  const actual = resolveQModel(value) ?? resolveQAliasSpecification().baseModel;
  return isQTargetModel(actual) ? `${resolveQAliasSpecification().displayName} (${actual})` : actual;
}

export function vendorForModel(value: string | undefined): string {
  const normalized = normalize(resolveQModel(value) ?? "");
  if (normalized.includes("gemma")) {
    return "Google DeepMind";
  }
  if (normalized.includes("qwen")) {
    return "Alibaba Cloud";
  }
  if (normalized.includes("mistral")) {
    return "Mistral AI";
  }
  if (normalized.includes("llama")) {
    return "Meta";
  }
  if (normalized.includes("deepseek")) {
    return "DeepSeek";
  }
  if (normalized.includes("temporal")) {
    return "Temporal Technologies";
  }
  return "Unknown";
}
