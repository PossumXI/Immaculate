import path from "node:path";

export function resolveStartupTracePath(options: {
  runtimeDir?: string;
  cwd?: string;
  fileName?: string;
} = {}): string {
  const runtimeDir = options.runtimeDir?.trim();
  const runtimeRoot =
    runtimeDir && runtimeDir.length > 0
      ? runtimeDir
      : path.join(options.cwd ?? process.cwd(), ".runtime");

  return path.join(runtimeRoot, options.fileName ?? "startup-trace.ndjson");
}
