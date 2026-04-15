import { resolveQAliasSpecification } from "./ollama-alias.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function canonicalModelReference(value: string | undefined): string {
  const normalized = normalize(value ?? "");
  return normalized.endsWith(":latest") ? normalized.slice(0, -"latest".length - 1) : normalized;
}

export function getQModelAlias(): string {
  return resolveQAliasSpecification().displayName;
}

export function getQModelTarget(): string {
  return resolveQAliasSpecification().baseModel;
}

export function isQAlias(value: string | undefined): boolean {
  const specification = resolveQAliasSpecification();
  const candidate = canonicalModelReference(value);
  return (
    candidate === canonicalModelReference(specification.alias) ||
    candidate === canonicalModelReference(specification.displayName)
  );
}

export function isQTargetModel(value: string | undefined): boolean {
  return canonicalModelReference(value) === canonicalModelReference(resolveQAliasSpecification().baseModel);
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

export function matchesModelReference(left: string | undefined, right: string | undefined): boolean {
  return canonicalModelReference(resolveQModel(left) ?? left) === canonicalModelReference(resolveQModel(right) ?? right);
}

export function truthfulModelLabel(value: string | undefined): string {
  const actual = resolveQModel(value) ?? resolveQAliasSpecification().baseModel;
  return isQTargetModel(actual) ? resolveQAliasSpecification().displayName : actual;
}

export function vendorForModel(value: string | undefined): string {
  const actual = resolveQModel(value) ?? "";
  if (isQTargetModel(actual) || isQAlias(value)) {
    return "Immaculate";
  }
  const normalized = normalize(actual);
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
  return "External";
}
