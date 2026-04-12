import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const venvPath = path.join(repoRoot, ".tools", "wandb-venv");
const venvBin = process.platform === "win32" ? "Scripts" : "bin";
const pythonName = process.platform === "win32" ? "python.exe" : "python3";
const pythonExe = path.join(venvPath, venvBin, pythonName);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(venvPath)) {
  run(process.platform === "win32" ? "python" : "python3", ["-m", "venv", venvPath]);
}

run(pythonExe, ["-m", "pip", "install", "--upgrade", "pip"]);
run(pythonExe, ["-m", "pip", "install", "wandb"]);

console.log(`W&B bootstrap complete at ${venvPath}`);
console.log(`Python: ${pythonExe}`);
