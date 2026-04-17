import { spawn } from "node:child_process";

const [, , scriptPath, ...args] = process.argv;

if (!scriptPath) {
  console.error("usage: node scripts/run-python.mjs <script.py> [args...]");
  process.exit(1);
}

const pythonBin = process.env.PYTHON_BIN || process.env.PYTHON || "python";
const child = spawn(pythonBin, [scriptPath, ...args], {
  stdio: "inherit",
  shell: false
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`failed to start ${pythonBin}: ${error.message}`);
  process.exit(1);
});
