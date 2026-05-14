import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const WIKI_ROOT = path.join(REPO_ROOT, "docs", "wiki");
const JSON_OUTPUT = path.join(WIKI_ROOT, "Full-Stack-Audit-Inventory.json");
const MARKDOWN_OUTPUT = path.join(WIKI_ROOT, "Full-Stack-Audit-Inventory.md");

const TARGET_DIRS = [
  "apps/dashboard/app",
  "apps/tui/src",
  "apps/harness/src",
  "packages/core/src",
  ".github/workflows",
  "training/q"
];

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".runtime",
  "dist",
  "node_modules",
  "out"
]);

function toRepoPath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

async function walk(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

async function collectTargetFiles() {
  const batches = await Promise.all(TARGET_DIRS.map((dir) => walk(repoPath(dir))));
  return batches.flat().sort((left, right) => toRepoPath(left).localeCompare(toRepoPath(right)));
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function normalizeRouteSegment(segment) {
  if (segment.startsWith("(") && segment.endsWith(")")) {
    return null;
  }
  if (segment.startsWith("[...") && segment.endsWith("]")) {
    return `*${segment.slice(4, -1)}`;
  }
  if (segment.startsWith("[") && segment.endsWith("]")) {
    return `:${segment.slice(1, -1)}`;
  }
  return segment;
}

function nextRouteFromFile(filePath) {
  const relative = toRepoPath(filePath);
  if (!relative.startsWith("apps/dashboard/app/")) {
    return null;
  }
  if (!relative.endsWith("/page.tsx") && !relative.endsWith("/route.ts")) {
    return null;
  }

  const routeKind = relative.endsWith("/page.tsx") ? "page" : "api-route";
  const subpath = relative
    .replace(/^apps\/dashboard\/app\//, "")
    .replace(/^page\.tsx$/, "")
    .replace(/^route\.ts$/, "")
    .replace(/\/page\.tsx$/, "")
    .replace(/\/route\.ts$/, "");
  const segments = subpath
    .split("/")
    .map(normalizeRouteSegment)
    .filter(Boolean);
  const routePath = segments.length === 0 ? "/" : `/${segments.join("/")}`;
  return {
    path: routePath,
    kind: routeKind,
    file: relative
  };
}

function extractRouteMethods(content) {
  return uniqueSorted(
    Array.from(content.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g))
      .map((match) => match[1])
  );
}

function extractFrontendInventory(files, contents) {
  const nextRoutes = [];
  const components = [];

  for (const filePath of files) {
    const relative = toRepoPath(filePath);
    const content = contents.get(filePath) ?? "";
    const route = nextRouteFromFile(filePath);
    if (route) {
      const methods = route.kind === "api-route" ? extractRouteMethods(content) : ["GET"];
      nextRoutes.push({
        ...route,
        methods,
        readiness: readinessForFrontendRoute(route, methods)
      });
    }

    if (relative.startsWith("apps/dashboard/app/ui/") && relative.endsWith(".tsx")) {
      const names = uniqueSorted(
        Array.from(
          content.matchAll(
            /\b(?:export\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\b/g
          )
        ).map((match) => match[1])
      );
      components.push({
        file: relative,
        componentNames: names,
        readiness: readinessForComponent(relative, names)
      });
    }
  }

  const tuiFile = files.find((filePath) => toRepoPath(filePath) === "apps/tui/src/index.tsx");
  const tuiContent = tuiFile ? contents.get(tuiFile) ?? "" : "";
  const tuiFeatures = uniqueSorted(
    Array.from(tuiContent.matchAll(/\basync\s+function\s+([A-Za-z0-9_]+)\b/g)).map(
      (match) => match[1]
    )
  );

  return {
    routes: nextRoutes.sort((left, right) => left.path.localeCompare(right.path)),
    components,
    tui: tuiFile
      ? {
          file: toRepoPath(tuiFile),
          features: tuiFeatures,
          readiness: {
            rating: "Yellow",
            reasons: [
              "Interactive operator TUI is implemented against the harness, but there are no TUI tests in this repo.",
              "The TUI connects directly to the harness and depends on local operator credentials."
            ]
          }
        }
      : null
  };
}

function readinessForFrontendRoute(route, methods = []) {
  if (route.kind === "api-route") {
    if (route.path === "/api/operator/harness/*path") {
      if (methods.includes("DELETE")) {
        return {
          rating: "Green",
          reasons: [
            "Server-side dashboard proxy is authenticated and same-origin.",
            "It forwards GET, POST, and the explicit governed DELETE allowlist for harness removal routes."
          ]
        };
      }
      return {
        rating: "Yellow",
        reasons: [
          "Server-side dashboard proxy is authenticated and same-origin.",
          "It currently exposes GET and POST only, while the harness has DELETE endpoints that cannot pass through this proxy."
        ]
      };
    }
    return {
      rating: "Yellow",
      reasons: [
        "Route has explicit handler methods.",
        "No dashboard API route tests were found in this repo."
      ]
    };
  }

  if (route.path === "/operator") {
    return {
      rating: "Yellow",
      reasons: [
        "Operator dashboard is gated by a signed server-side session.",
        "It is a trusted-private console and lacks browser integration tests."
      ]
    };
  }

  return {
    rating: "Yellow",
    reasons: [
      "Page is implemented and statically discoverable.",
      "No page-level build snapshot or browser flow tests were found."
    ]
  };
}

function readinessForComponent(relative, names) {
  if (relative.endsWith("dashboard-client.tsx")) {
    return {
      rating: "Yellow",
      reasons: [
        "Connects to the governed harness API and websocket ticket flow.",
        "Large single component carries many operator workflows without component tests."
      ]
    };
  }
  if (relative.endsWith("landing-page.tsx")) {
    return {
      rating: "Yellow",
      reasons: [
        "Public page is implemented with product copy and proof cards.",
        "Marketing surface still needs cross-site copy alignment with qline.site and aura-genesis.org."
      ]
    };
  }
  return {
    rating: names.length > 0 ? "Yellow" : "Red",
    reasons:
      names.length > 0
        ? ["Component is exported or locally declared; no component tests were found."]
        : ["No top-level component name was detected."]
  };
}

function extractBackendEndpoints(files, contents) {
  const endpoints = [];
  const endpointPattern = /app\.(get|post|put|delete|patch)\(\s*(["'`])([^"'`]+)\2/g;
  for (const filePath of files) {
    const relative = toRepoPath(filePath);
    if (
      relative !== "apps/harness/src/server.ts" &&
      relative !== "apps/harness/src/q-gateway.ts"
    ) {
      continue;
    }
    const content = contents.get(filePath) ?? "";
    for (const match of content.matchAll(endpointPattern)) {
      endpoints.push({
        method: match[1].toUpperCase(),
        route: match[3],
        file: relative,
        line: lineNumberAt(content, match.index ?? 0),
        surface: relative.endsWith("q-gateway.ts") ? "q-gateway" : "harness",
        readiness: readinessForEndpoint(match[1].toUpperCase(), match[3], relative)
      });
    }
  }
  return endpoints.sort((left, right) =>
    `${left.surface}:${left.route}:${left.method}`.localeCompare(
      `${right.surface}:${right.route}:${right.method}`
    )
  );
}

function readinessForEndpoint(method, route, file) {
  if (file.endsWith("q-gateway.ts")) {
    return route === "/health"
      ? { rating: "Green", reasons: ["Health endpoint is narrow and read-only."] }
      : {
          rating: "Yellow",
          reasons: [
            "Gateway has API key authentication, rate limits, and bounded model selection.",
            "Runtime availability still depends on local Q/Ollama readiness and current benchmark restamps."
          ]
        };
  }

  if (route.startsWith("/stream/actuation")) {
    return {
      rating: "Yellow",
      reasons: [
        "Actuation device stream has governance checks and adapter validation.",
        "It is not reachable through the dashboard websocket ticket route yet."
      ]
    };
  }

  if (method === "DELETE") {
    return {
      rating: "Yellow",
      reasons: [
        "Delete route is governed server-side.",
        "Dashboard access must stay constrained to the explicit governed DELETE allowlist."
      ]
    };
  }

  if (route === "/api/health") {
    return { rating: "Green", reasons: ["Read-only health endpoint."] };
  }

  return {
    rating: "Yellow",
    reasons: [
      "Endpoint is implemented in the harness.",
      "Production readiness depends on caller coverage, governance headers, and integration tests."
    ]
  };
}

function sanitizeCallPath(value) {
  const withoutTemplateVars = value.replace(/\$\{[^}]+\}/g, ":param");
  const apiIndex = withoutTemplateVars.indexOf("/api/");
  const streamIndex = withoutTemplateVars.indexOf("/stream");
  const startIndex =
    apiIndex >= 0 && streamIndex >= 0
      ? Math.min(apiIndex, streamIndex)
      : apiIndex >= 0
        ? apiIndex
        : streamIndex;
  if (startIndex < 0) {
    return null;
  }
  return withoutTemplateVars
    .slice(startIndex)
    .replace(/[)`;,\s]+$/g, "")
    .replace(/\?.*$/g, "")
    .replace(/\/+$/g, "") || "/";
}

function extractUiCalls(files, contents) {
  const calls = [];
  const targetPrefixes = [
    "apps/dashboard/app/ui/",
    "apps/dashboard/app/api/",
    "apps/dashboard/app/lib/",
    "apps/tui/src/"
  ];
  const literalPattern = /(["'`])([^"'`]*(?:\/api\/|\/stream)[^"'`]*)\1/g;

  for (const filePath of files) {
    const relative = toRepoPath(filePath);
    if (!targetPrefixes.some((prefix) => relative.startsWith(prefix))) {
      continue;
    }
    const content = contents.get(filePath) ?? "";
    for (const match of content.matchAll(literalPattern)) {
      const index = match.index ?? 0;
      const context = content.slice(Math.max(0, index - 240), Math.min(content.length, index + 240));
      if (
        !/fetch|harnessFetch|governedHarnessFetch|WebSocket|openGovernedHarnessSocket|buildHarness|withOperatorWsUrl/.test(
          context
        )
      ) {
        continue;
      }
      const route = sanitizeCallPath(match[2]);
      if (!route) {
        continue;
      }
      calls.push({
        route,
        file: relative,
        line: lineNumberAt(content, index),
        caller:
          relative.startsWith("apps/tui/")
            ? "tui"
            : relative.startsWith("apps/dashboard/app/api/")
              ? "dashboard-api"
              : "dashboard-ui"
      });
    }
  }

  const seen = new Set();
  return calls.filter((call) => {
    const key = `${call.caller}:${call.route}:${call.file}:${call.line}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function endpointMatchesCall(endpointRoute, callRoute) {
  const endpoint = endpointRoute.replace(/\/+$/g, "") || "/";
  const call = callRoute.replace(/\/+$/g, "") || "/";
  if (endpoint === call) {
    return true;
  }
  const endpointParts = endpoint.split("/").filter(Boolean);
  const callParts = call.split("/").filter(Boolean);
  if (endpointParts.length !== callParts.length) {
    return false;
  }
  return endpointParts.every((part, index) => {
    if (part.startsWith(":") || part.startsWith("*")) {
      return true;
    }
    if (callParts[index].startsWith(":")) {
      return true;
    }
    return part === callParts[index];
  });
}

function buildEndpointMappings(endpoints, calls) {
  return endpoints.map((endpoint) => {
    const callers = calls.filter((call) => endpointMatchesCall(endpoint.route, call.route));
    return {
      ...endpoint,
      callers,
      uiCallerCount: callers.length,
      orphanedFromOperatorUi: callers.length === 0
    };
  });
}

function extractExports(files, contents) {
  const exportPattern =
    /^export\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/gm;
  return files
    .filter((filePath) => {
      const relative = toRepoPath(filePath);
      return (
        (relative.startsWith("apps/harness/src/") ||
          relative.startsWith("packages/core/src/")) &&
        /\.(ts|tsx)$/.test(relative)
      );
    })
    .map((filePath) => {
      const relative = toRepoPath(filePath);
      const content = contents.get(filePath) ?? "";
      const exportedSymbols = uniqueSorted(
        Array.from(content.matchAll(exportPattern)).map((match) => match[1])
      );
      return {
        file: relative,
        category: classifyServiceFile(relative),
        exportedSymbols,
        exportedSymbolCount: exportedSymbols.length
      };
    })
    .filter((entry) => entry.exportedSymbolCount > 0)
    .sort((left, right) => left.file.localeCompare(right.file));
}

function classifyServiceFile(relative) {
  if (relative.endsWith(".test.ts")) {
    return "test";
  }
  if (/cli|receipt|report|surface|gate|benchmark|training|wandb|bridgebench|roundtable|release/i.test(relative)) {
    return "cli-report-benchmark";
  }
  if (/persistence|registry|workers|governance|federation|actuation|routing|orchestration|conversation|q-|ollama|nwb|bids/i.test(relative)) {
    return "service";
  }
  if (relative.startsWith("packages/core/")) {
    return "core-contract";
  }
  return "utility";
}

function extractFileInteractions(files, contents) {
  const fsPattern =
    /\b(readFile|writeFile|appendFile|mkdir|readdir|rename|open|unlink|rm|stat|access)\b|node:fs\/promises|node:fs\b/g;
  return files
    .filter((filePath) => {
      const relative = toRepoPath(filePath);
      return relative.startsWith("apps/harness/src/") || relative.startsWith("packages/core/src/");
    })
    .flatMap((filePath) => {
      const relative = toRepoPath(filePath);
      const content = contents.get(filePath) ?? "";
      const interactions = [];
      for (const match of content.matchAll(fsPattern)) {
        interactions.push({
          file: relative,
          line: lineNumberAt(content, match.index ?? 0),
          operation: match[1] ?? match[0],
          category: classifyPersistenceUse(relative)
        });
      }
      return interactions;
    });
}

function classifyPersistenceUse(relative) {
  if (/persistence|decision-trace|node-registry|workers|actuation|federation-peers|q-api-auth|training-data/i.test(relative)) {
    return "runtime-state";
  }
  if (/benchmark|receipt|report|surface|gate|live-|github-checks|wandb/i.test(relative)) {
    return "evidence-output";
  }
  if (/nwb|bids/i.test(relative)) {
    return "dataset-ingest";
  }
  return "file-utility";
}

function extractTests(files, contents) {
  return files
    .filter((filePath) => toRepoPath(filePath).endsWith(".test.ts"))
    .map((filePath) => {
      const content = contents.get(filePath) ?? "";
      return {
        file: toRepoPath(filePath),
        testCount: Array.from(content.matchAll(/\btest\(/g)).length
      };
    });
}

function extractScripts(rootPackage) {
  return Object.entries(rootPackage.scripts ?? {})
    .map(([name, command]) => ({ name, command }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readJson(relativePath) {
  return JSON.parse(await readText(repoPath(relativePath)));
}

function buildIssues(report) {
  const dashboardTests = report.tests.filter((testFile) =>
    testFile.file.startsWith("apps/dashboard/")
  );
  const tuiTests = report.tests.filter((testFile) => testFile.file.startsWith("apps/tui/"));
  const orphanedEndpoints = report.backend.endpointMappings.filter(
    (endpoint) => endpoint.orphanedFromOperatorUi
  );
  const deleteEndpoints = report.backend.endpointMappings.filter(
    (endpoint) => endpoint.method === "DELETE"
  );
  const harnessProxyRoute = report.frontend.routes.find(
    (route) => route.path === "/api/operator/harness/*path"
  );
  const proxySupportsDelete = Boolean(harnessProxyRoute?.methods.includes("DELETE"));
  const deleteEndpointsWithoutProxy = proxySupportsDelete ? [] : deleteEndpoints;
  const actuationSocket = report.backend.endpointMappings.find(
    (endpoint) => endpoint.route === "/stream/actuation/device"
  );
  const qDateGap = !report.backend.serviceExports.some((entry) =>
    entry.exportedSymbols.some((symbol) => /date|time/i.test(symbol))
  );

  const issues = [
    {
      rating: "Red",
      title: "No cross-repo product inventory existed before this generated audit surface.",
      evidence:
        "Routes, endpoints, UI calls, exports, tests, and file-backed stores were discoverable only by manual search.",
      fix:
        "Keep `npm run audit:inventory` in the release checklist and update this report before broad product claims."
    },
    {
      rating: deleteEndpointsWithoutProxy.length > 0 ? "Yellow" : "Green",
      title:
        deleteEndpointsWithoutProxy.length > 0
          ? "Dashboard proxy does not cover every harness method."
          : "Dashboard proxy covers governed harness DELETE routes.",
      evidence:
        deleteEndpointsWithoutProxy.length > 0
          ? `Harness DELETE routes without dashboard proxy coverage: ${deleteEndpointsWithoutProxy
              .map((endpoint) => endpoint.route)
              .join(", ")}.`
          : proxySupportsDelete
            ? "Dashboard proxy exports governed DELETE support for the explicit harness removal-route allowlist."
            : "No DELETE routes detected.",
      fix:
        proxySupportsDelete
          ? "Keep DELETE route expansion behind explicit allowlist tests."
          : "Add governed DELETE support to the dashboard proxy only for explicitly allowed operator routes, with tests."
    },
    {
      rating: actuationSocket ? "Yellow" : "Green",
      title: "Actuation websocket is implemented but not part of the dashboard ticket route allowlist.",
      evidence: actuationSocket
        ? "`/stream/actuation/device` exists in the harness; dashboard socket tickets support only `/stream` and `/stream/neuro/live`."
        : "No actuation websocket route detected.",
      fix:
        "Add a dedicated dashboard ticket type for actuation device links or keep it intentionally external and document that boundary."
    },
    {
      rating: dashboardTests.length === 0 || tuiTests.length === 0 ? "Red" : "Yellow",
      title: "Frontend and TUI flows have no direct automated tests.",
      evidence: `Dashboard tests: ${dashboardTests.length}; TUI tests: ${tuiTests.length}. Harness tests: ${report.tests
        .filter((testFile) => testFile.file.startsWith("apps/harness/"))
        .reduce((sum, testFile) => sum + testFile.testCount, 0)}.`,
      fix:
        "Add dashboard route-handler tests for auth/proxy behavior and TUI command tests for governed request headers."
    },
    {
      rating: qDateGap ? "Yellow" : "Green",
      title: qDateGap
        ? "Q current-date awareness is not a first-class exported runtime context."
        : "Q current-date awareness is now a first-class exported runtime context.",
      evidence: qDateGap
        ? "Q identity and gateway prompts include identity facts, but the audit did not find an exported date/time context helper."
        : "A date/time context export was detected.",
      fix:
        qDateGap
          ? "Inject current date and knowledge cutoff boundaries into Q gateway, Q API, and Discord-agent runtime prompts."
          : "Keep the runtime context injected anywhere Q or Discord agents answer questions about current facts."
    },
    {
      rating: orphanedEndpoints.length > 0 ? "Yellow" : "Green",
      title: "Several backend endpoints are not called by the dashboard or TUI.",
      evidence:
        orphanedEndpoints.length > 0
          ? `${orphanedEndpoints.length} endpoint(s) have no operator UI caller in this scan. Some are valid CLI/worker/public-gateway surfaces; the rest need route ownership decisions.`
          : "Every endpoint has an operator UI caller.",
      fix:
        "Mark each no-UI endpoint as public gateway, CLI-only, worker-only, or product gap, then add tests or remove it."
    }
  ];

  return issues;
}

function buildPlan(issues) {
  return [
    {
      priority: 1,
      target: "Q and Discord command runtime",
      action:
        "Add a shared runtime context block with current date, knowledge cutoff, project roles, and governed tool policy; inject it into Q gateway, Immaculate Q API, and Discord-agent prompts."
    },
    {
      priority: 2,
      target: "Dashboard proxy and websocket route coverage",
      action:
        "Add tests first, then extend the proxy/ticket allowlists only for governed operator flows that need same-origin browser access."
    },
    {
      priority: 3,
      target: "Backend endpoint ownership",
      action:
        `Classify ${issues.find((issue) => issue.title.includes("not called"))?.rating === "Yellow" ? "all no-UI endpoints" : "new endpoints"} as UI, CLI, worker, public gateway, or retired. Remove or document dead code.`
    },
    {
      priority: 4,
      target: "Public marketing surfaces",
      action:
        "Keep iorch.net, qline.site, and aura-genesis.org copy short, customer-facing, and evidence-backed without internal footnote language."
    },
    {
      priority: 5,
      target: "Benchmarks and CI",
      action:
        "Restamp Terminal-Bench, BridgeBench, W&B export, release surface, and GitHub checks from the same commit before publishing readiness claims."
    }
  ];
}

function readinessSummary(report) {
  const allRatings = [
    ...report.frontend.routes.map((route) => route.readiness.rating),
    ...report.frontend.components.map((component) => component.readiness.rating),
    ...(report.frontend.tui ? [report.frontend.tui.readiness.rating] : []),
    ...report.backend.endpointMappings.map((endpoint) => endpoint.readiness.rating),
    ...report.issues.map((issue) => issue.rating)
  ];
  return {
    Green: allRatings.filter((rating) => rating === "Green").length,
    Yellow: allRatings.filter((rating) => rating === "Yellow").length,
    Red: allRatings.filter((rating) => rating === "Red").length
  };
}

function markdownTable(headers, rows) {
  const escapeCell = (value) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, "<br>");
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`)
  ].join("\n");
}

function renderMarkdown(report) {
  const summary = readinessSummary(report);
  const orphaned = report.backend.endpointMappings.filter((endpoint) => endpoint.orphanedFromOperatorUi);
  const serviceRows = report.backend.serviceExports.map((entry) => [
    entry.file,
    entry.category,
    entry.exportedSymbolCount,
    entry.exportedSymbols.join(", ")
  ]);
  const fileInteractionRows = report.backend.fileInteractions.map((entry) => [
    entry.file,
    entry.line,
    entry.operation,
    entry.category
  ]);

  return [
    "# Full Stack Audit Inventory",
    "",
    "Generated from repo source. This is the operator handoff surface for route, endpoint, component, service, file-backed state, and readiness drift.",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Commit: \`${report.git.commit}\``,
    `- Branch: \`${report.git.branch}\``,
    `- Frontend routes: \`${report.frontend.routes.length}\``,
    `- Frontend components: \`${report.frontend.components.length}\``,
    `- Harness/gateway endpoints: \`${report.backend.endpointMappings.length}\``,
    `- Exported backend/core files: \`${report.backend.serviceExports.length}\``,
    `- File interaction records: \`${report.backend.fileInteractions.length}\``,
    `- Tests: \`${report.tests.reduce((sum, testFile) => sum + testFile.testCount, 0)}\` assertions across \`${report.tests.length}\` files`,
    `- Readiness: Green \`${summary.Green}\`, Yellow \`${summary.Yellow}\`, Red \`${summary.Red}\``,
    "",
    "## Frontend Routes",
    "",
    markdownTable(
      ["Route", "Kind", "Methods", "File", "Readiness", "Notes"],
      report.frontend.routes.map((route) => [
        route.path,
        route.kind,
        route.methods.join(", "),
        route.file,
        route.readiness.rating,
        route.readiness.reasons.join(" ")
      ])
    ),
    "",
    "## Frontend Components And Features",
    "",
    markdownTable(
      ["File", "Components/features", "Readiness", "Notes"],
      report.frontend.components.map((component) => [
        component.file,
        component.componentNames.join(", "),
        component.readiness.rating,
        component.readiness.reasons.join(" ")
      ])
    ),
    "",
    "## TUI Surface",
    "",
    report.frontend.tui
      ? markdownTable(
          ["File", "Feature functions", "Readiness", "Notes"],
          [[
            report.frontend.tui.file,
            report.frontend.tui.features.join(", "),
            report.frontend.tui.readiness.rating,
            report.frontend.tui.readiness.reasons.join(" ")
          ]]
        )
      : "_No TUI file found._",
    "",
    "## Backend Endpoints And UI Mapping",
    "",
    markdownTable(
      ["Method", "Route", "Surface", "File:line", "UI callers", "Readiness", "Notes"],
      report.backend.endpointMappings.map((endpoint) => [
        endpoint.method,
        endpoint.route,
        endpoint.surface,
        `${endpoint.file}:${endpoint.line}`,
        endpoint.callers.length > 0
          ? endpoint.callers.map((caller) => `${caller.caller} ${caller.route} (${caller.file}:${caller.line})`).join("<br>")
          : "No dashboard/TUI caller detected",
        endpoint.readiness.rating,
        endpoint.readiness.reasons.join(" ")
      ])
    ),
    "",
    "## Orphaned Or Non-UI Backend Endpoints",
    "",
    orphaned.length > 0
      ? markdownTable(
          ["Method", "Route", "Surface", "File:line", "Disposition needed"],
          orphaned.map((endpoint) => [
            endpoint.method,
            endpoint.route,
            endpoint.surface,
            `${endpoint.file}:${endpoint.line}`,
            "Classify as CLI-only, worker-only, public gateway, or product gap."
          ])
        )
      : "_No orphaned backend endpoints were detected._",
    "",
    "## Backend Services, Utilities, And Core Contracts",
    "",
    markdownTable(["File", "Category", "Exports", "Exported symbols"], serviceRows),
    "",
    "## Database And File-Backed State Interactions",
    "",
    "No SQL database client was detected in this repo slice. Persistence is file-backed through runtime ledgers, JSON, JSONL, benchmark reports, training outputs, and evidence receipts.",
    "",
    markdownTable(["File", "Line", "Operation", "Category"], fileInteractionRows),
    "",
    "## Tests",
    "",
    report.tests.length > 0
      ? markdownTable(
          ["File", "Test count"],
          report.tests.map((testFile) => [testFile.file, testFile.testCount])
        )
      : "_No tests were detected._",
    "",
    "## Issue Detection",
    "",
    markdownTable(
      ["Readiness", "Issue", "Evidence", "Surgical fix"],
      report.issues.map((issue) => [
        issue.rating,
        issue.title,
        issue.evidence,
        issue.fix
      ])
    ),
    "",
    "## Surgical Fix Plan",
    "",
    markdownTable(
      ["Priority", "Target", "Action"],
      report.plan.map((item) => [item.priority, item.target, item.action])
    ),
    "",
    "## Production Readiness Definition",
    "",
    "- Green means implemented, tested, error-handled, secure enough for its stated boundary, and performant for current expected load.",
    "- Yellow means mostly implemented but missing tests, complete UI coverage, deployment proof, or an explicit ownership boundary.",
    "- Red means broken, untested in a critical path, incomplete, or dangerous if exposed broadly."
  ].join("\n");
}

function gitMetadata() {
  const fallback = { commit: "unknown", branch: "unknown" };
  try {
    return {
      commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: REPO_ROOT,
        encoding: "utf8"
      }).trim(),
      branch: execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: REPO_ROOT,
        encoding: "utf8"
      }).trim()
    };
  } catch {
    return fallback;
  }
}

async function main() {
  const files = await collectTargetFiles();
  const contents = new Map(
    await Promise.all(files.map(async (filePath) => [filePath, await readText(filePath)]))
  );
  const rootPackage = await readJson("package.json");

  const frontend = extractFrontendInventory(files, contents);
  const endpoints = extractBackendEndpoints(files, contents);
  const uiCalls = extractUiCalls(files, contents);
  const endpointMappings = buildEndpointMappings(endpoints, uiCalls);
  const serviceExports = extractExports(files, contents);
  const fileInteractions = extractFileInteractions(files, contents);
  const tests = extractTests(files, contents);

  const report = {
    generatedAt: new Date().toISOString(),
    git: await gitMetadata(),
    scripts: extractScripts(rootPackage),
    frontend,
    backend: {
      endpointMappings,
      uiCalls,
      serviceExports,
      fileInteractions
    },
    tests
  };

  report.issues = buildIssues(report);
  report.plan = buildPlan(report.issues);

  await mkdir(WIKI_ROOT, { recursive: true });
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_OUTPUT, `${renderMarkdown(report)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    generatedAt: report.generatedAt,
    markdown: toRepoPath(MARKDOWN_OUTPUT),
    json: toRepoPath(JSON_OUTPUT),
    routes: report.frontend.routes.length,
    endpoints: report.backend.endpointMappings.length,
    orphanedEndpoints: report.backend.endpointMappings.filter((endpoint) => endpoint.orphanedFromOperatorUi).length,
    issues: report.issues.length
  }, null, 2)}\n`);
}

await main();
