import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { githubAssetUrl, readJawsReleaseConfig } from "./jaws-release-config.mjs";

const EXPECTED_SITE_ID = "4a9b7d84-9d87-4e10-9951-fb121f9626bd";
const EXPECTED_SITE_NAME = "immaculate-iorch-20260415022035";
const EXPECTED_DOMAIN = "iorch.net";
const EXPECTED_PRIMARY_DOMAIN = "www.iorch.net";
const EXPECTED_PUBLIC_ORIGIN = `https://${EXPECTED_PRIMARY_DOMAIN}`;
const NETLIFY_WORKSPACE_FILTER = "@immaculate/dashboard";
const DEPLOY_LOCK_DIR = join(tmpdir(), `netlify-${EXPECTED_SITE_ID}.deploy.lock`);
const DEPLOY_LOCK_POLL_MS = 2000;
const DEPLOY_LOCK_TIMEOUT_MS = Number.parseInt(
  process.env.NETLIFY_DEPLOY_LOCK_TIMEOUT_MS ?? `${20 * 60 * 1000}`,
  10
);
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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function readDeployLockOwner() {
  try {
    return JSON.parse(readFileSync(join(DEPLOY_LOCK_DIR, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

function describeDeployLock(owner) {
  if (!owner) {
    return "unknown owner";
  }

  return `pid=${owner.pid ?? "unknown"} mode=${owner.mode ?? "unknown"} startedAt=${owner.startedAt ?? "unknown"} cwd=${owner.cwd ?? "unknown"}`;
}

async function acquireDeployLock(mode) {
  const timeoutMs =
    Number.isFinite(DEPLOY_LOCK_TIMEOUT_MS) && DEPLOY_LOCK_TIMEOUT_MS > 0
      ? DEPLOY_LOCK_TIMEOUT_MS
      : 20 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      mkdirSync(DEPLOY_LOCK_DIR, { recursive: false });
      const owner = {
        pid: process.pid,
        mode,
        siteId: EXPECTED_SITE_ID,
        siteName: EXPECTED_SITE_NAME,
        domain: EXPECTED_DOMAIN,
        cwd: process.cwd(),
        startedAt: new Date().toISOString(),
      };
      writeFileSync(join(DEPLOY_LOCK_DIR, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`);

      return () => {
        const currentOwner = readDeployLockOwner();
        if (currentOwner?.pid === process.pid) {
          rmSync(DEPLOY_LOCK_DIR, { recursive: true, force: true });
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      const owner = readDeployLockOwner();
      if (!processExists(Number(owner?.pid))) {
        rmSync(DEPLOY_LOCK_DIR, { recursive: true, force: true });
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for ${EXPECTED_DOMAIN} deploy lock after ${Math.round(timeoutMs / 1000)}s; active ${describeDeployLock(owner)}.`
        );
      }

      console.warn(`Waiting for ${EXPECTED_DOMAIN} deploy lock held by ${describeDeployLock(owner)}.`);
      await sleep(DEPLOY_LOCK_POLL_MS);
    }
  }
}

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

function readNetlifyAuthCredential() {
  const directToken = process.env.NETLIFY_AUTH_TOKEN?.trim();
  if (directToken) {
    return {
      token: directToken,
      deployEnv: { NETLIFY_AUTH_TOKEN: directToken }
    };
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
      return {
        token,
        deployEnv: {}
      };
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

function normalizeDomain(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getSiteDomains(site) {
  return new Set(
    [
      site.custom_domain,
      site.url?.replace(/^https?:\/\//i, ""),
      ...(Array.isArray(site.domain_aliases) ? site.domain_aliases : [])
    ]
      .map(normalizeDomain)
      .filter(Boolean)
  );
}

function assertCorrectWorkspace() {
  const normalizedRoot = repoRoot.replaceAll("\\", "/");
  if (
    /\/OpenJaws\/sites\/iorch-jaws-release$/i.test(normalizedRoot) ||
    normalizedRoot.includes("/OpenJaws/sites/iorch-jaws-release/")
  ) {
    throw new Error(
      "Refusing to deploy legacy iorch.net static mirror from OpenJaws. Redeploy iorch.net only from the Immaculate dashboard deploy lane."
    );
  }

  const packagePath = resolve(repoRoot, "package.json");
  const netlifyPath = resolve(repoRoot, "netlify.toml");
  if (!existsSync(packagePath) || !existsSync(netlifyPath)) {
    throw new Error("Run this command from the Immaculate repository root where package.json and netlify.toml both exist.");
  }

  const packageJson = readJson(packagePath);
  if (packageJson.name !== "immaculate") {
    throw new Error(`Wrong package: expected immaculate, got ${packageJson.name ?? "unknown"}.`);
  }

  const netlifyToml = readFileSync(netlifyPath, "utf8");
  if (!netlifyToml.includes('command = "npm run build -w @immaculate/core && npm run build -w @immaculate/dashboard"')) {
    throw new Error("Wrong iorch.net deploy lane: expected the Immaculate dashboard build command in netlify.toml.");
  }
}

async function assertExpectedSite(token) {
  const site = await netlifyApi(token, `/sites/${EXPECTED_SITE_ID}`);
  if (site.name !== EXPECTED_SITE_NAME) {
    throw new Error(`Wrong Netlify site name: expected ${EXPECTED_SITE_NAME}, got ${site.name ?? "unknown"}.`);
  }
  const domains = getSiteDomains(site);
  if (!domains.has(EXPECTED_DOMAIN) || !domains.has(EXPECTED_PRIMARY_DOMAIN)) {
    throw new Error(
      `Wrong Netlify domain: expected ${EXPECTED_PRIMARY_DOMAIN} primary with ${EXPECTED_DOMAIN} alias, got primary=${site.custom_domain ?? "none"} aliases=${
        Array.isArray(site.domain_aliases) && site.domain_aliases.length > 0
          ? site.domain_aliases.join(", ")
          : "none"
      }.`
    );
  }

  return site;
}

function ensureNetlifyProjectLink(deployEnv) {
  run(
    "netlify",
    ["link", "--id", EXPECTED_SITE_ID, "--filter", NETLIFY_WORKSPACE_FILTER],
    { capture: true, env: deployEnv }
  );
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

async function fetchText(url, options = {}) {
  const maxAttempts = options.maxAttempts ?? 8;
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,text/plain",
        "User-Agent": "immaculate-iorch-deployer/1.0"
      }
    });
    const body = await response.text();
    if (response.ok) {
      return body;
    }

    lastStatus = response.status;
    lastBody = body;
    if (![404, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) {
      break;
    }

    const delayMs = Math.min(10_000, 1_000 * 2 ** (attempt - 1));
    console.warn(
      `${url} returned ${response.status}; retrying smoke probe in ${Math.round(delayMs / 1000)}s (${attempt}/${maxAttempts}).`
    );
    await sleep(delayMs);
  }

  throw new Error(`${url} returned ${lastStatus}: ${lastBody.slice(0, 400)}`);
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
  const releaseDeployLock = await acquireDeployLock(prod ? "prod" : "check");
  try {
    await deployIorch();
  } finally {
    releaseDeployLock();
  }
}

async function deployIorch() {
  assertCorrectWorkspace();
  const netlifyAuth = readNetlifyAuthCredential();
  const token = netlifyAuth.token;
  const site = await assertExpectedSite(token);
  ensureNetlifyProjectLink(netlifyAuth.deployEnv);

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

  const deploy = parseDeployOutput(run("netlify", deployArgs, { capture: true, env: netlifyAuth.deployEnv }));
  const deployedUrl = deploy.deploy_ssl_url ?? deploy.deploy_url ?? deploy.ssl_url ?? deploy.url;
  const deployId = deploy.deploy_id ?? deploy.id ?? null;
  if (!deployedUrl) {
    throw new Error(`Netlify deploy output did not include a deploy URL:\n${JSON.stringify(deploy, null, 2)}`);
  }

  const deployedFunctions = await assertDeployIncludesJawsFunction(token, deployId);
  const draftSmoke = await smoke(deployedUrl);
  const productionSmoke = prod ? await smoke(EXPECTED_PUBLIC_ORIGIN) : null;

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
