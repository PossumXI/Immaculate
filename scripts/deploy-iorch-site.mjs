import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { githubAssetUrl, readJawsReleaseConfig } from "./jaws-release-config.mjs";

const EXPECTED_SITE_ID = "4a9b7d84-9d87-4e10-9951-fb121f9626bd";
const EXPECTED_SITE_NAME = "immaculate-iorch-20260415022035";
const EXPECTED_DOMAIN = "iorch.net";
const NETLIFY_WORKSPACE_FILTER = "@immaculate/dashboard";
const BAD_PUBLIC_COPY_TERMS = [
  /\bthis is the true\b/i,
  /\bsynthesized\/offline\b/i,
  /\blegacy mirror\b/i,
  /\bfootnote\b/i,
  /\bchain[- ]of[- ]thought\b/i,
];

const args = new Set(process.argv.slice(2));
const prod = args.has("--prod");
const check = args.has("--check") || !prod;

if (prod && args.has("--check")) {
  throw new Error("Use either --check or --prod, not both.");
}

const repoRoot = process.cwd();
const jawsRelease = readJawsReleaseConfig(repoRoot);
const JAWS_RELEASE_TAG = jawsRelease.tag;
const JAWS_RELEASE_VERSION = jawsRelease.version;
const JAWS_PREVIOUS_PATCH_VERSION = jawsRelease.previousPatchVersion;
const JAWS_DOWNLOADS = Object.fromEntries(
  jawsRelease.downloads.map((download) => [download.path, download.file])
);
const outDir = resolve(repoRoot, "apps", "dashboard", "out");
const functionsDir = resolve(repoRoot, "netlify", "functions");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: options.shell ?? (process.platform === "win32"),
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, CI: "true", ...(options.env ?? {}) },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${commandArgs.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function readNetlifyAuthToken() {
  const directToken = process.env.NETLIFY_AUTH_TOKEN?.trim();
  if (directToken) {
    return directToken;
  }

  const candidatePaths = [
    resolve(repoRoot, ".netlify-cli-config", "config.json"),
    resolve(repoRoot, "apps", "dashboard", ".netlify-cli-config", "config.json"),
    process.env.APPDATA ? resolve(process.env.APPDATA, "netlify", "Config", "config.json") : null,
    process.env.APPDATA ? resolve(process.env.APPDATA, "Netlify", "Config", "config.json") : null,
  ].filter((value) => typeof value === "string");

  for (const configPath of candidatePaths) {
    if (!existsSync(configPath)) {
      continue;
    }

    const config = readJson(configPath);
    const firstUser = config.users ? Object.values(config.users)[0] : null;
    const token = firstUser?.auth?.token?.trim();
    if (token) {
      return token;
    }
  }

  throw new Error(
    "No Netlify auth token found. Set NETLIFY_AUTH_TOKEN or log in with the Netlify CLI before deploying iorch.net."
  );
}

async function netlifyApi(token, path) {
  let lastStatus = 0;
  let lastStatusText = "Unknown";
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "immaculate-iorch-deployer/1.0",
        Accept: "application/json"
      }
    });
    if (response.ok) {
      return response.json();
    }
    lastStatus = response.status;
    lastStatusText = response.statusText;
    if (response.status !== 429 || attempt === 5) {
      break;
    }
    await new Promise((resolveRetry) => setTimeout(resolveRetry, 2000 * (attempt + 1)));
  }
  throw new Error(`Netlify API ${path} failed: ${lastStatus} ${lastStatusText}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertCorrectWorkspace() {
  const packagePath = resolve(repoRoot, "package.json");
  const netlifyPath = resolve(repoRoot, "netlify.toml");
  if (!existsSync(packagePath) || !existsSync(netlifyPath)) {
    throw new Error("Run this command from the Immaculate repository root where package.json and netlify.toml both exist.");
  }

  const packageJson = readJson(packagePath);
  if (packageJson.name !== "immaculate") {
    throw new Error(`Wrong package: expected immaculate, got ${packageJson.name ?? "unknown"}.`);
  }
}

async function assertExpectedSite(token) {
  const site = await netlifyApi(token, `/sites/${EXPECTED_SITE_ID}`);
  if (site.name !== EXPECTED_SITE_NAME) {
    throw new Error(`Wrong Netlify site name: expected ${EXPECTED_SITE_NAME}, got ${site.name ?? "unknown"}.`);
  }
  if (site.custom_domain !== EXPECTED_DOMAIN) {
    throw new Error(`Wrong Netlify custom domain: expected ${EXPECTED_DOMAIN}, got ${site.custom_domain ?? "none"}.`);
  }

  return site;
}

async function assertDeployIncludesJawsFunction(token, deployId) {
  if (!deployId) {
    throw new Error("Netlify deploy output did not include a deploy id; cannot verify function bundle.");
  }

  const deploy = await netlifyApi(token, `/sites/${EXPECTED_SITE_ID}/deploys/${deployId}`);
  const functionNames = Array.isArray(deploy.available_functions)
    ? deploy.available_functions.map((fn) => fn?.n).filter(Boolean)
    : [];
  if (!functionNames.includes("jaws")) {
    throw new Error(
      `Netlify deploy ${deployId} does not include the jaws function; refusing to treat this as a valid iorch release deploy.`
    );
  }
  return functionNames;
}

function parseDeployOutput(output) {
  const trimmed = output.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const deployUrl = trimmed.match(/https:\/\/[^\s]+--immaculate-iorch-20260415022035\.netlify\.app/i)?.[0];
    if (deployUrl) {
      return { deploy_url: deployUrl, deploy_ssl_url: deployUrl };
    }
    throw new Error(`Could not parse Netlify deploy output:\n${trimmed}`);
  }
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: "text/html,text/plain" } });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${body.slice(0, 400)}`);
  }
  return body;
}

async function fetchRedirect(url) {
  return fetch(url, {
    redirect: "manual",
    headers: { Accept: "text/html,text/plain,application/json" }
  });
}

async function checkJawsDownloads(baseUrl) {
  const statuses = {};
  for (const [path, fileName] of Object.entries(JAWS_DOWNLOADS)) {
    const response = await fetchRedirect(`${baseUrl}${path}`);
    const location = response.headers.get("location") ?? "";
    statuses[path] = response.status;
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error(`${baseUrl}${path} returned ${response.status}; expected a redirect.`);
    }
    const expectedLocation = githubAssetUrl(jawsRelease, fileName);
    if (location !== expectedLocation) {
      throw new Error(`${baseUrl}${path} points to ${location || "no location"}; expected ${expectedLocation}.`);
    }
  }
  return statuses;
}

async function checkJawsUpdaterApi(baseUrl) {
  const previousPath = `/api/jaws/windows/x86_64/${JAWS_PREVIOUS_PATCH_VERSION}`;
  const currentPath = `/api/jaws/windows/x86_64/${JAWS_RELEASE_VERSION}`;
  const previousResponse = await fetch(`${baseUrl}${previousPath}`, {
    headers: { Accept: "application/json" }
  });
  const previousBody = await previousResponse.text();
  if (previousResponse.status !== 200) {
    throw new Error(`${baseUrl}${previousPath} returned ${previousResponse.status}; expected a 200 update payload.`);
  }
  let previousJson;
  try {
    previousJson = JSON.parse(previousBody);
  } catch {
    throw new Error(`${baseUrl}${previousPath} returned invalid JSON: ${previousBody.slice(0, 400)}`);
  }
  if (
    previousJson.version !== JAWS_RELEASE_VERSION ||
    typeof previousJson.url !== "string" ||
    !previousJson.url.includes(`/${JAWS_RELEASE_TAG}/`) ||
    typeof previousJson.signature !== "string" ||
    previousJson.signature.length === 0
  ) {
    throw new Error(`${baseUrl}${previousPath} returned an invalid JAWS update payload.`);
  }

  const currentResponse = await fetch(`${baseUrl}${currentPath}`, {
    headers: { Accept: "application/json" }
  });
  if (currentResponse.status !== 204) {
    throw new Error(`${baseUrl}${currentPath} returned ${currentResponse.status}; expected 204 for current installs.`);
  }

  return {
    [previousPath]: previousResponse.status,
    [currentPath]: currentResponse.status
  };
}

async function smoke(baseUrl) {
  const pages = ["/", "/downloads/jaws", "/legal", "/terms", "/robots.txt", "/sitemap.xml"];
  const statuses = {};
  for (const path of pages) {
    const text = await fetchText(`${baseUrl}${path}`);
    statuses[path] = 200;
    if (path.endsWith(".txt") || path.endsWith(".xml")) {
      continue;
    }
    for (const pattern of BAD_PUBLIC_COPY_TERMS) {
      if (pattern.test(text)) {
        throw new Error(`${path} smoke found blocked public wording: ${pattern}`);
      }
    }
  }
  const jawsDownloads = await checkJawsDownloads(baseUrl);
  const jawsUpdaterApi = await checkJawsUpdaterApi(baseUrl);
  Object.assign(statuses, jawsDownloads);
  Object.assign(statuses, jawsUpdaterApi);
  return statuses;
}

async function main() {
  assertCorrectWorkspace();
  const token = readNetlifyAuthToken();
  const site = await assertExpectedSite(token);

  run("npm", ["run", "build", "-w", "@immaculate/core"]);
  run("npm", ["run", "build", "-w", "@immaculate/dashboard"]);

  if (!existsSync(outDir)) {
    throw new Error(`Dashboard export directory is missing: ${outDir}.`);
  }
  if (!existsSync(functionsDir)) {
    throw new Error(`Netlify functions directory is missing: ${functionsDir}.`);
  }

  const deployArgs = [
    "deploy",
    "--json",
    "--no-build",
    "--site",
    EXPECTED_SITE_ID,
    "--filter",
    NETLIFY_WORKSPACE_FILTER,
    "--dir",
    outDir,
    "--functions",
    functionsDir,
    "--skip-functions-cache",
    "--message",
    prod ? "IORCH guarded production deploy" : "IORCH guarded draft deploy check",
  ];
  if (prod) {
    deployArgs.splice(1, 0, "--prod");
  }

  const deploy = parseDeployOutput(run("netlify", deployArgs, { capture: true, env: { NETLIFY_AUTH_TOKEN: token } }));
  const deployedUrl = deploy.deploy_ssl_url ?? deploy.deploy_url ?? deploy.ssl_url ?? deploy.url;
  const deployId = deploy.deploy_id ?? deploy.id ?? null;
  if (!deployedUrl) {
    throw new Error(`Netlify deploy output did not include a deploy URL:\n${JSON.stringify(deploy, null, 2)}`);
  }

  const deployedFunctions = await assertDeployIncludesJawsFunction(token, deployId);
  const draftSmoke = await smoke(deployedUrl);
  const productionSmoke = prod ? await smoke(`https://${EXPECTED_DOMAIN}`) : null;

  console.log(JSON.stringify({
    status: "ok",
    mode: check ? "check" : "prod",
    siteId: site.id,
    siteName: site.name,
    customDomain: site.custom_domain,
    deployId,
    deployedFunctions,
    jawsRelease: {
      version: JAWS_RELEASE_VERSION,
      tag: JAWS_RELEASE_TAG,
      previousPatchVersion: JAWS_PREVIOUS_PATCH_VERSION,
    },
    deployedUrl,
    draftSmoke,
    productionSmoke,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
