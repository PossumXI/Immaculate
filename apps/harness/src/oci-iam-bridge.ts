import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type {
  OllamaChatCompletionResult,
  OllamaChatMessage,
  OllamaFailureClass
} from "./ollama.js";
import type { QInferenceProfile } from "./q-inference-profile.js";

type OciBridgeResponse = {
  ok?: boolean;
  text?: string;
  error?: string;
  error_type?: string;
  model?: string;
  response?: unknown;
};

type ResponsesInputItem = {
  role: OllamaChatMessage["role"];
  content: Array<{
    type: "input_text";
    text: string;
  }>;
};

const MAX_BRIDGE_OUTPUT_BYTES = 1024 * 1024;

function truncate(value: string, maxLength = 280): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3)}...`;
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function formatFailurePreview(
  failureClass: OllamaFailureClass,
  errorMessage?: string,
  response?: string
): string {
  if (failureClass === "empty_response") {
    return "No response returned by the OCI IAM bridge.";
  }
  if (failureClass === "invalid_json") {
    return "OCI IAM bridge returned invalid JSON.";
  }
  return truncate(response?.trim() || errorMessage?.trim() || "OCI IAM bridge execution failed.");
}

function buildResponsesInput(messages: OllamaChatMessage[]): ResponsesInputItem[] {
  return messages.map((message) => ({
    role: message.role,
    content: [
      {
        type: "input_text",
        text: message.content
      }
    ]
  }));
}

function parseBridgePayload(output: string): OciBridgeResponse | undefined {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }
  const candidates = [
    trimmed,
    ...trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("{") && line.endsWith("}"))
      .reverse()
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as OciBridgeResponse;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Try the next candidate line.
    }
  }
  return undefined;
}

function failureClassForBridgeError(
  timedOut: boolean,
  exitCode: number | null,
  payload: OciBridgeResponse | undefined
): OllamaFailureClass {
  if (timedOut) {
    return "transport_timeout";
  }
  if (exitCode === 0 && !payload) {
    return "invalid_json";
  }
  return "http_error";
}

async function withTempDir<T>(callback: (tempDir: string) => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "immaculate-oci-q-"));
  try {
    return await callback(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function requireBridgeProfile(profile: QInferenceProfile) {
  if (profile.provider !== "oci-iam-bridge" || !profile.ociBridge) {
    throw new Error("Q inference profile is not configured for the OCI IAM bridge.");
  }
  return profile.ociBridge;
}

export async function runOciIamBridgeResponsesCompletion(options: {
  profile: QInferenceProfile;
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  format?: "json";
}): Promise<OllamaChatCompletionResult> {
  const bridge = requireBridgeProfile(options.profile);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const timeoutMs = boundedInteger(options.timeoutMs, 120_000, 1_000, 600_000);

  try {
    return await withTempDir(async (tempDir) => {
      const inputPath = path.join(tempDir, "input.json");
      await writeFile(inputPath, `${JSON.stringify(buildResponsesInput(options.messages))}\n`, "utf8");
      const args = [
        ...bridge.pythonPrefixArgs,
        bridge.scriptPath,
        "--base-url",
        options.profile.runtimeUrl,
        "--model",
        bridge.model,
        "--input-file",
        inputPath,
        "--config-file",
        bridge.configFile,
        "--profile",
        bridge.profile,
        "--project-id",
        bridge.projectId,
        "--compartment-id",
        bridge.compartmentId,
        "--max-output-tokens",
        String(boundedInteger(options.maxTokens, 120, 1, 8_192))
      ];
      if (typeof options.temperature === "number") {
        args.push("--temperature", String(boundedNumber(options.temperature, 0.2, 0, 2)));
      }

      const completion = await new Promise<{
        exitCode: number | null;
        stdout: string;
        stderr: string;
        timedOut: boolean;
      }>((resolve, reject) => {
        const child = spawn(bridge.pythonCommand, args, {
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true
        });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs);
        const capture = (target: Buffer[], chunk: Buffer) => {
          const currentSize = target.reduce((sum, entry) => sum + entry.length, 0);
          if (currentSize < MAX_BRIDGE_OUTPUT_BYTES) {
            target.push(chunk);
          }
        };
        child.stdout?.on("data", (chunk: Buffer) => capture(stdout, chunk));
        child.stderr?.on("data", (chunk: Buffer) => capture(stderr, chunk));
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (exitCode) => {
          clearTimeout(timer);
          resolve({
            exitCode,
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
            timedOut
          });
        });
      });

      const payload =
        parseBridgePayload(completion.stdout) ?? parseBridgePayload(completion.stderr);
      const completedAt = new Date().toISOString();
      const text = payload?.ok === true && typeof payload.text === "string" ? payload.text.trim() : "";
      const failureClass: OllamaFailureClass | undefined =
        payload?.ok === true
          ? text.length > 0
            ? undefined
            : "empty_response"
          : failureClassForBridgeError(completion.timedOut, completion.exitCode, payload);
      const errorMessage =
        failureClass && failureClass !== "empty_response"
          ? payload?.error ?? completion.stderr.trim() ?? completion.stdout.trim()
          : undefined;

      return {
        response: text,
        model: bridge.model,
        startedAt,
        completedAt,
        latencyMs: Math.max(1, Number((performance.now() - started).toFixed(2))),
        done: !failureClass,
        thinkingDetected: false,
        responsePreview: truncate(
          failureClass ? formatFailurePreview(failureClass, errorMessage, text) : text
        ),
        failureClass,
        errorMessage
      };
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorMessage =
      error instanceof Error ? error.message : "Unable to run the OCI IAM bridge.";
    return {
      response: "",
      model: options.model,
      startedAt,
      completedAt,
      latencyMs: Math.max(1, Number((performance.now() - started).toFixed(2))),
      done: false,
      thinkingDetected: false,
      responsePreview: formatFailurePreview("http_error", errorMessage),
      failureClass: "http_error",
      errorMessage
    };
  }
}
