import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { unlink } from "node:fs/promises";

export function hashValue(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function sha256Hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Json(value: unknown): string {
  return sha256Hash(stableStringify(value));
}

export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    if (candidate.code !== "ENOENT") {
      throw error;
    }
  }
}

export function getAllowedDataRoot(): string {
  return path.resolve(process.env.IMMACULATE_DATA_ROOT ?? os.homedir());
}

export function resolvePathWithinAllowedRoot(inputPath: string): string {
  const allowedRoot = getAllowedDataRoot();
  const resolvedPath = path.resolve(inputPath);
  if (resolvedPath === allowedRoot) {
    return resolvedPath;
  }

  const normalizedRoot = `${allowedRoot}${path.sep}`;
  if (!resolvedPath.startsWith(normalizedRoot)) {
    throw new Error(
      `Path traversal rejected: ${resolvedPath} is outside ${allowedRoot}.`
    );
  }

  return resolvedPath;
}

export function getLocalVenvPythonPath(repoRoot: string): string {
  const venvBin = process.platform === "win32" ? "Scripts" : "bin";
  const pythonName = process.platform === "win32" ? "python.exe" : "python3";
  return path.join(repoRoot, ".tools", "wandb-venv", venvBin, pythonName);
}
