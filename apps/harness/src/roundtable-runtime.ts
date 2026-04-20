import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  type MultiAgentConversation,
  type ExecutionSchedule
} from "@immaculate/core";
import { prewarmOllamaModel } from "./ollama.js";
import { resolveQLocalOllamaUrl } from "./q-local-model.js";
import { getQFoundationModelName, getQModelTarget } from "./q-model.js";
import {
  buildRoundtableActionPlan,
  cleanupRoundtableActionWorktree,
  materializeRoundtableActionWorktree,
  probeRoundtableActionWorkspace
} from "./roundtable.js";
import { resolveReleaseMetadata, type ReleaseMetadata } from "./release-metadata.js";

type HttpCheck = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  wallLatencyMs: number;
};

type ScenarioDefinition = {
  id: string;
  label: string;
  seedObjective: string;
  mediationObjective: string;
};

type RoundtableRuntimeScenarioResult = {
  id: string;
  label: string;
  status: "completed" | "failed";
  seedAccepted: boolean;
  mediationAccepted: boolean;
  seedLatencyMs: number;
  mediationLatencyMs: number;
  totalLatencyMs: number;
  readyActionCount: number;
  materializedActionCount: number;
  probedActionCount: number;
  authorityBoundActionCount: number;
  isolatedBranchCount: number;
  repoCoverageCount: number;
  recordedActionCount: number;
  recordedRepoCount: number;
  workspaceScopedTurnCount: number;
  scheduleRoundtableActionCount: number;
  scheduleRoundtableRepoCount: number;
  sessionScopePreserved: boolean;
  trackedFileCountP50: number;
  sampleFiles: string[];
  guardVerdict?: string;
  routeSuggestion?: string;
  roundtableSummary?: string;
  failureClass?: string;
};

type RoundtableRuntimeSurface = {
  generatedAt: string;
  release: ReleaseMetadata;
  benchmark: {
    harnessUrl: string;
    scenarioCount: number;
    failedAssertions: number;
    repoCoverageP50: number;
    materializedActionsP50: number;
    probedActionsP50: number;
    authorityBoundActionsP50: number;
    workspaceScopedTurnsP50: number;
    recordedActionsP50: number;
    trackedFilesP50: number;
    runnerPathP95Ms: number;
    seedLatencyP95Ms: number;
    mediationLatencyP95Ms: number;
    hardware: string;
  };
  scenarios: Array<{
    id: string;
    label: string;
    status: string;
    routeSuggestion?: string;
    guardVerdict?: string;
    repoCoverageCount: number;
    materializedActionCount: number;
    probedActionCount: number;
    authorityBoundActionCount: number;
    recordedActionCount: number;
    workspaceScopedTurnCount: number;
    scheduleRoundtableActionCount: number;
    scheduleRoundtableRepoCount: number;
    sessionScopePreserved: boolean;
    trackedFileCountP50: number;
    sampleFiles: string[];
    roundtableSummary?: string;
  }>;
  assertions: Array<{
    id: string;
    status: "pass" | "fail";
    target: string;
    actual: string;
    detail: string;
  }>;
  output: {
    jsonPath: string;
    markdownPath: string;
  };
};

const DEFAULT_OLLAMA_URL = resolveQLocalOllamaUrl();
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_ROOT = path.resolve(MODULE_ROOT, "..");
const REPO_ROOT = path.resolve(HARNESS_ROOT, "../..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const CONSENT_PREFIX = "session:roundtable-runtime";

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: "immaculate-openjaws",
    label: "Immaculate and OpenJaws governed repair",
    seedObjective:
      "Seed a governed repair context that keeps Q primary while OpenJaws contributes terminal-task hardening and Immaculate preserves a truthful audit trail.",
    mediationObjective:
      "Create a governed roundtable plan across Immaculate, OpenJaws, and Arobi Network so agent lanes stay isolated by repo and branch while the final route stays reviewable."
  },
  {
    id: "asgard-audit-ledger",
    label: "Asgard audit and ledger continuity",
    seedObjective:
      "Seed a governed defense-and-healthcare audit context where Arobi Network must preserve the ledger trail, Asgard stays evidence-backed, and Immaculate keeps Q on the primary route.",
    mediationObjective:
      "Mediated planning should isolate Immaculate, OpenJaws, and Asgard work while preserving a review-ready route for the ledger-backed operator network."
  },
  {
    id: "mixed-pressure-roundtable",
    label: "Mixed-pressure roundtable",
    seedObjective:
      "Seed a mixed-pressure coordination context where Q must stay the reasoning brain, Immaculate must orchestrate without drift, and repo-scoped action lanes must remain isolated.",
    mediationObjective:
      "Under mixed pressure, keep the governed route stable and turn the roundtable into isolated repo-scoped execution lanes instead of free-form conversation."
  }
];

function percentile(values: number[], percentileTarget: number): number {
  if (values.length === 0) {
    return 0;
  }
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.max(0, Math.ceil((percentileTarget / 100) * ordered.length) - 1)
  );
  return Number(ordered[index]?.toFixed(2) ?? 0);
}

function median(values: number[]): number {
  return percentile(values, 50);
}

async function allocateTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate a loopback TCP port for roundtable runtime benchmark."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function checkHttp(url: string, init?: RequestInit): Promise<HttpCheck> {
  const started = performance.now();
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key] = value;
  }
  return {
    status: response.status,
    body,
    headers,
    wallLatencyMs: Number((performance.now() - started).toFixed(2))
  };
}

async function waitForHarness(harnessUrl: string): Promise<HttpCheck> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const health = await checkHttp(`${harnessUrl}/api/health`);
      if (
        health.status === 200 &&
        typeof health.body === "object" &&
        health.body !== null &&
        (health.body as { status?: string }).status === "ok"
      ) {
        return health;
      }
      lastError = new Error(`Harness health returned ${health.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError instanceof Error ? lastError : new Error("Harness did not become healthy in time.");
}

function resolveHarnessCommand(): { command: string; args: string[] } {
  const compiledServerPath = path.join(HARNESS_ROOT, "dist", "server.js");
  if (existsSync(compiledServerPath)) {
    return {
      command: process.execPath,
      args: [compiledServerPath]
    };
  }
  const tsxBinary = path.join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx"
  );
  return {
    command: tsxBinary,
    args: [path.join(HARNESS_ROOT, "src", "server.ts")]
  };
}

function startHarnessProcess(options: {
  repoRoot: string;
  runtimeDir: string;
  keysPath: string;
  port: number;
}): ChildProcess {
  const harness = resolveHarnessCommand();
  return spawn(harness.command, harness.args, {
    cwd: options.repoRoot,
    env: {
      ...process.env,
      IMMACULATE_RUNTIME_DIR: options.runtimeDir,
      IMMACULATE_Q_API_ENABLED: "true",
      IMMACULATE_Q_API_KEYS_PATH: options.keysPath,
      IMMACULATE_HARNESS_HOST: "127.0.0.1",
      IMMACULATE_HARNESS_PORT: String(options.port)
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function stopHarnessProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return;
  }
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    delay(3_000).then(() => false)
  ]);
  if (!exited && child.exitCode === null && !child.killed) {
    child.kill("SIGKILL");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      delay(2_000)
    ]);
  }
}

function buildHeaders(
  consentScope: string,
  purpose = "cognitive-execution,actuation-dispatch,cognitive-trace-read",
  authorization?: string
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-immaculate-consent-scope": consentScope,
    "x-immaculate-purpose": purpose,
    ...(authorization ? { Authorization: authorization } : {})
  };
}

function pickLatestConversation(
  body: unknown,
  sessionId: string
): MultiAgentConversation | undefined {
  const conversations = (body as { conversations?: MultiAgentConversation[] })?.conversations;
  if (!Array.isArray(conversations)) {
    return undefined;
  }
  return conversations
    .filter((entry) => entry.sessionId === sessionId)
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))[0];
}

function pickLatestSchedule(
  body: unknown,
  sessionScope: string
): ExecutionSchedule | undefined {
  const schedules = (body as { schedules?: ExecutionSchedule[] })?.schedules;
  if (!Array.isArray(schedules)) {
    return undefined;
  }
  return schedules
    .filter((entry) => entry.sessionScope === sessionScope)
    .sort((left, right) => Date.parse(right.selectedAt) - Date.parse(left.selectedAt))[0];
}

async function runScenario(options: {
  harnessUrl: string;
  scenario: ScenarioDefinition;
}): Promise<RoundtableRuntimeScenarioResult> {
  const sessionId = `roundtable-runtime-${options.scenario.id}`;
  const consentScope = `${CONSENT_PREFIX}-${options.scenario.id}`;
  const plan = buildRoundtableActionPlan({
    objective: options.scenario.mediationObjective,
    consentScope,
    schedule: {
      id: `roundtable-runtime-${options.scenario.id}`,
      mode: "guarded-swarm",
      executionTopology: "parallel-then-guard",
      parallelWidth: 3,
      parallelFormationMode: "hybrid-quorum",
      parallelFormationSummary: "vertical=2 / horizontal=2 / quorum=2 / backpressure=degrade",
      layerRoles: ["mid", "reasoner", "guard"]
    }
  });
  const readyActions = plan.actions.filter((action) => action.status === "ready");
  const materialized = readyActions.map((action) => materializeRoundtableActionWorktree(action));
  const probes = readyActions.map((action, index) =>
    probeRoundtableActionWorkspace(action, materialized[index]?.worktreePath)
  );
  const started = performance.now();

  try {
    const seed = await checkHttp(`${options.harnessUrl}/api/intelligence/run`, {
      method: "POST",
      headers: buildHeaders(consentScope, "cognitive-execution"),
      body: JSON.stringify({
        sessionId,
        objective: options.scenario.seedObjective,
        requestedExecutionDecision: "allow_local"
      })
    });
    const mediation = await checkHttp(`${options.harnessUrl}/api/orchestration/mediate`, {
      method: "POST",
      headers: buildHeaders(consentScope, "actuation-dispatch,cognitive-execution"),
      body: JSON.stringify({
        sessionId,
        objective: options.scenario.mediationObjective,
        requestedExecutionDecision: "allow_local",
        dispatchOnApproval: false,
        forceCognition: true
      })
    });
    const conversations = await checkHttp(`${options.harnessUrl}/api/intelligence/conversations`, {
      headers: buildHeaders("system:benchmark", "cognitive-trace-read")
    });
    const schedules = await checkHttp(`${options.harnessUrl}/api/intelligence/schedules`, {
      headers: buildHeaders("system:benchmark", "cognitive-trace-read")
    });
    const conversation = pickLatestConversation(conversations.body, sessionId);
    const schedule = pickLatestSchedule(schedules.body, consentScope);
    const workspaceScopedTurnCount = Array.isArray(conversation?.turns)
      ? conversation.turns.filter((turn) => turn.workspaceScope?.repoLabel).length
      : 0;
    const recordedActionCount = Array.isArray(conversation?.roundtableActions)
      ? conversation.roundtableActions.length
      : 0;
    const recordedRepoCount = new Set(
      (conversation?.roundtableActions ?? []).map((action) => action.repoId).filter(Boolean)
    ).size;
    return {
      id: options.scenario.id,
      label: options.scenario.label,
      status:
        seed.status === 200 &&
        mediation.status === 200 &&
        Boolean((seed.body as { accepted?: boolean })?.accepted) &&
        Boolean((mediation.body as { accepted?: boolean })?.accepted) &&
        workspaceScopedTurnCount > 0 &&
        recordedActionCount >= readyActions.length &&
        (schedule?.roundtableActionCount ?? 0) >= readyActions.length
          ? "completed"
          : "failed",
      seedAccepted: Boolean((seed.body as { accepted?: boolean })?.accepted),
      mediationAccepted: Boolean((mediation.body as { accepted?: boolean })?.accepted),
      seedLatencyMs: seed.wallLatencyMs,
      mediationLatencyMs: mediation.wallLatencyMs,
      totalLatencyMs: Number((performance.now() - started).toFixed(2)),
      readyActionCount: readyActions.length,
      materializedActionCount: materialized.length,
      probedActionCount: probes.filter((entry) => entry.probeSucceeded).length,
      authorityBoundActionCount: probes.filter((entry) => entry.authorityBranchPreserved).length,
      isolatedBranchCount: materialized.filter((entry) => entry.branch.startsWith("agents/")).length,
      repoCoverageCount: plan.repoCount,
      recordedActionCount,
      recordedRepoCount,
      workspaceScopedTurnCount,
      scheduleRoundtableActionCount: schedule?.roundtableActionCount ?? 0,
      scheduleRoundtableRepoCount: schedule?.roundtableRepoCount ?? 0,
      sessionScopePreserved:
        conversation?.sessionScope === consentScope && schedule?.sessionScope === consentScope,
      trackedFileCountP50: median(probes.map((entry) => entry.trackedFileCount)),
      sampleFiles: [...new Set(probes.flatMap((entry) => entry.sampleFiles))].slice(0, 6),
      guardVerdict: conversation?.guardVerdict,
      routeSuggestion:
        (mediation.body as { execution?: { routeSuggestion?: string } })?.execution?.routeSuggestion ??
        conversation?.finalRouteSuggestion,
      roundtableSummary: conversation?.roundtableSummary ?? schedule?.roundtableSummary,
      failureClass:
        seed.status === 200 && mediation.status === 200
          ? undefined
          : `seed:${seed.status}/mediate:${mediation.status}`
    };
  } finally {
    for (const action of readyActions.slice().reverse()) {
      cleanupRoundtableActionWorktree(action);
    }
  }
}

function summarizeHardware(): string {
  const cpus = os.cpus();
  const cpuCount = typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length;
  return `${os.hostname()} / ${os.platform()}-${os.arch()} / ${cpus[0]?.model?.trim() || "unknown-cpu"} / ${Math.max(1, cpuCount)} cores / Q foundation ${getQFoundationModelName()}`;
}

function renderMarkdown(report: RoundtableRuntimeSurface): string {
  return [
    "# Roundtable Runtime",
    "",
    "This page is generated from a live harness pass. It proves the roundtable planner is not just text: Immaculate seeds a bounded Q source, mediates a governed route, records repo-scoped roundtable actions, and binds those actions to isolated agent worktrees across Immaculate, OpenJaws, and Asgard.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Release: \`${report.release.buildId}\``,
    `- Repo commit: \`${report.release.gitShortSha}\``,
    `- Q training bundle: \`${report.release.q.trainingLock?.bundleId ?? "none generated yet"}\``,
    "",
    "## Benchmark",
    "",
    `- Harness URL: \`${report.benchmark.harnessUrl}\``,
    `- Scenario count: \`${report.benchmark.scenarioCount}\``,
    `- Failed assertions: \`${report.benchmark.failedAssertions}\``,
    `- Repo coverage P50: \`${report.benchmark.repoCoverageP50}\``,
    `- Materialized actions P50: \`${report.benchmark.materializedActionsP50}\``,
    `- Probed actions P50: \`${report.benchmark.probedActionsP50}\``,
    `- Branch-authority matches P50: \`${report.benchmark.authorityBoundActionsP50}\``,
    `- Recorded roundtable actions P50: \`${report.benchmark.recordedActionsP50}\``,
    `- Workspace-scoped turns P50: \`${report.benchmark.workspaceScopedTurnsP50}\``,
    `- Tracked files P50: \`${report.benchmark.trackedFilesP50}\``,
    `- Seed latency P95: \`${report.benchmark.seedLatencyP95Ms}\` ms`,
    `- Mediation latency P95: \`${report.benchmark.mediationLatencyP95Ms}\` ms`,
    `- Runner path latency P95: \`${report.benchmark.runnerPathP95Ms}\` ms`,
    `- Hardware: ${report.benchmark.hardware}`,
    "",
    "## Scenarios",
    "",
    ...report.scenarios.map((scenario) =>
      [
        `### ${scenario.label}`,
        "",
        `- Status: \`${scenario.status}\``,
        `- Route suggestion: \`${scenario.routeSuggestion ?? "unknown"}\``,
        `- Guard verdict: \`${scenario.guardVerdict ?? "unknown"}\``,
        `- Repo coverage: \`${scenario.repoCoverageCount}\``,
        `- Materialized actions: \`${scenario.materializedActionCount}\``,
        `- Probed actions: \`${scenario.probedActionCount}\``,
        `- Branch-authority matches: \`${scenario.authorityBoundActionCount}\``,
        `- Recorded roundtable actions: \`${scenario.recordedActionCount}\``,
        `- Workspace-scoped turns: \`${scenario.workspaceScopedTurnCount}\``,
        `- Tracked files P50: \`${scenario.trackedFileCountP50}\``,
        `- Schedule roundtable counts: actions \`${scenario.scheduleRoundtableActionCount}\` / repos \`${scenario.scheduleRoundtableRepoCount}\``,
        `- Session scope preserved: \`${scenario.sessionScopePreserved}\``,
        `- Sample files: ${scenario.sampleFiles.length > 0 ? scenario.sampleFiles.map((entry) => `\`${entry}\``).join(", ") : "n/a"}`,
        `- Summary: ${scenario.roundtableSummary ?? "n/a"}`,
        ""
      ].join("\n")
    ),
    "",
    "## Assertions",
    "",
    ...report.assertions.map(
      (assertion) =>
        `- ${assertion.id}: \`${assertion.status}\` | target \`${assertion.target}\` | actual \`${assertion.actual}\``
    )
  ].join("\n");
}

async function main(): Promise<void> {
  const benchmarkRuntimeDir = path.join(REPO_ROOT, ".runtime", "roundtable-runtime");
  const harnessRuntimeDir = path.join(benchmarkRuntimeDir, "harness");
  const keysPath = path.join(harnessRuntimeDir, "q-api-keys.json");
  const port = await allocateTcpPort();
  const harnessUrl = `http://127.0.0.1:${port}`;
  await mkdir(harnessRuntimeDir, { recursive: true });
  await mkdir(WIKI_ROOT, { recursive: true });
  await prewarmOllamaModel({
    endpoint: DEFAULT_OLLAMA_URL,
    model: getQModelTarget()
  });

  const child = startHarnessProcess({
    repoRoot: REPO_ROOT,
    runtimeDir: harnessRuntimeDir,
    keysPath,
    port
  });

  try {
    await waitForHarness(harnessUrl);
    const scenarioResults: RoundtableRuntimeScenarioResult[] = [];
    for (const scenario of SCENARIOS) {
      scenarioResults.push(
        await runScenario({
          harnessUrl,
          scenario
        })
      );
    }

    const assertions = [
      {
        id: "roundtable-runtime-scenarios-green",
        status: scenarioResults.every((entry) => entry.status === "completed") ? "pass" : "fail",
        target: "all scenarios completed",
        actual: `${scenarioResults.filter((entry) => entry.status === "completed").length}/${scenarioResults.length}`,
        detail: "Every scenario should seed cognition, mediate successfully, and record repo-scoped roundtable actions."
      },
      {
        id: "roundtable-runtime-worktrees-materialized",
        status: scenarioResults.every(
          (entry) => entry.materializedActionCount >= entry.readyActionCount && entry.isolatedBranchCount >= entry.readyActionCount
        )
          ? "pass"
          : "fail",
        target: "all ready actions materialized on agent branches",
        actual: scenarioResults
          .map((entry) => `${entry.id}:${entry.materializedActionCount}/${entry.readyActionCount}`)
          .join(", "),
        detail: "Every ready roundtable action should materialize a dedicated worktree on an agent branch."
      },
      {
        id: "roundtable-runtime-branch-authority-bound",
        status: scenarioResults.every(
          (entry) => entry.probedActionCount >= entry.readyActionCount && entry.authorityBoundActionCount >= entry.readyActionCount
        )
          ? "pass"
          : "fail",
        target: "all ready actions probed and bound to their agent branch authority",
        actual: scenarioResults
          .map((entry) => `${entry.id}:probes=${entry.probedActionCount}/${entry.readyActionCount},authority=${entry.authorityBoundActionCount}/${entry.readyActionCount}`)
          .join(" | "),
        detail: "Every ready action should touch its repo lane and preserve the allowed agent-only push branch instead of drifting to an uncontrolled branch."
      },
      {
        id: "roundtable-runtime-audit-captured",
        status: scenarioResults.every(
          (entry) =>
            entry.recordedActionCount >= entry.readyActionCount &&
            entry.workspaceScopedTurnCount > 0 &&
            entry.sessionScopePreserved
        )
          ? "pass"
          : "fail",
        target: "roundtable actions and scoped turns recorded",
        actual: scenarioResults
          .map(
            (entry) =>
              `${entry.id}:actions=${entry.recordedActionCount},turns=${entry.workspaceScopedTurnCount},scope=${entry.sessionScopePreserved}`
          )
          .join(" | "),
        detail: "The live conversation and schedule should carry the same repo-scoped action plan and session scope the planner created."
      }
    ] satisfies RoundtableRuntimeSurface["assertions"];

    const report: RoundtableRuntimeSurface = {
      generatedAt: new Date().toISOString(),
      release: await resolveReleaseMetadata(),
      benchmark: {
        harnessUrl,
        scenarioCount: scenarioResults.length,
        failedAssertions: assertions.filter((entry) => entry.status === "fail").length,
        repoCoverageP50: median(scenarioResults.map((entry) => entry.repoCoverageCount)),
        materializedActionsP50: median(scenarioResults.map((entry) => entry.materializedActionCount)),
        probedActionsP50: median(scenarioResults.map((entry) => entry.probedActionCount)),
        authorityBoundActionsP50: median(scenarioResults.map((entry) => entry.authorityBoundActionCount)),
        workspaceScopedTurnsP50: median(scenarioResults.map((entry) => entry.workspaceScopedTurnCount)),
        recordedActionsP50: median(scenarioResults.map((entry) => entry.recordedActionCount)),
        trackedFilesP50: median(scenarioResults.map((entry) => entry.trackedFileCountP50)),
        runnerPathP95Ms: percentile(scenarioResults.map((entry) => entry.totalLatencyMs), 95),
        seedLatencyP95Ms: percentile(scenarioResults.map((entry) => entry.seedLatencyMs), 95),
        mediationLatencyP95Ms: percentile(scenarioResults.map((entry) => entry.mediationLatencyMs), 95),
        hardware: summarizeHardware()
      },
      scenarios: scenarioResults.map((entry) => ({
        id: entry.id,
        label: entry.label,
        status: entry.status,
        routeSuggestion: entry.routeSuggestion,
        guardVerdict: entry.guardVerdict,
        repoCoverageCount: entry.repoCoverageCount,
        materializedActionCount: entry.materializedActionCount,
        probedActionCount: entry.probedActionCount,
        authorityBoundActionCount: entry.authorityBoundActionCount,
        recordedActionCount: entry.recordedActionCount,
        workspaceScopedTurnCount: entry.workspaceScopedTurnCount,
        scheduleRoundtableActionCount: entry.scheduleRoundtableActionCount,
        scheduleRoundtableRepoCount: entry.scheduleRoundtableRepoCount,
        sessionScopePreserved: entry.sessionScopePreserved,
        trackedFileCountP50: entry.trackedFileCountP50,
        sampleFiles: entry.sampleFiles,
        roundtableSummary: entry.roundtableSummary
      })),
      assertions,
      output: {
        jsonPath: "docs/wiki/Roundtable-Runtime.json",
        markdownPath: "docs/wiki/Roundtable-Runtime.md"
      }
    };

    if (report.benchmark.failedAssertions > 0) {
      await writeFile(
        path.join(benchmarkRuntimeDir, "last-failed-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8"
      );
      throw new Error(
        `Roundtable runtime benchmark failed ${report.benchmark.failedAssertions} assertion(s). Refusing to restamp public surfaces.`
      );
    }

    await writeFile(
      path.join(REPO_ROOT, report.output.jsonPath),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      path.join(REPO_ROOT, report.output.markdownPath),
      `${renderMarkdown(report)}\n`,
      "utf8"
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await stopHarnessProcess(child);
  }
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Roundtable runtime benchmark failed.");
  process.exitCode = 1;
});
