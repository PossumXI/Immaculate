import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const EXPECTED_SITE_ID = "4a9b7d84-9d87-4e10-9951-fb121f9626bd";
const EXPECTED_SITE_NAME = "immaculate-iorch-20260415022035";
const EXPECTED_DOMAIN = "iorch.net";
const NETLIFY_WORKSPACE_FILTER = "@immaculate/dashboard";
const JAWS_RELEASE_TAG = "jaws-v0.1.6";
const JAWS_DOWNLOADS = {
  "/downloads/jaws/windows": "JAWS_0.1.6_x64-setup.exe",
  "/downloads/jaws/windows-msi": "JAWS_0.1.6_x64_en-US.msi",
  "/downloads/jaws/macos": "JAWS_0.1.6_x64.dmg",
  "/downloads/jaws/linux-deb": "JAWS_0.1.6_amd64.deb",
  "/downloads/jaws/linux-rpm": "JAWS-0.1.6-1.x86_64.rpm",
  "/downloads/jaws/latest.json": "latest.json"
};
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
const outDir = resolve(repoRoot, "apps", "dashboard", "out");

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: options.shell ?? (process.platform === "win32"),
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
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

function resolveWindowsNetlifyCli() {
  const result = spawnSync("where.exe", ["netlify"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`Unable to find Netlify CLI on PATH: ${(result.stderr || result.stdout || "where.exe failed").trim()}`);
  }

  for (const candidate of result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    const cliPath = resolve(dirname(candidate), "node_modules", "netlify-cli", "bin", "run.js");
    if (existsSync(cliPath)) {
      return cliPath;
    }
  }

  throw new Error("Unable to resolve the Netlify CLI Node entrypoint from PATH.");
}

function runNetlify(commandArgs, options = {}) {
  if (process.platform !== "win32") {
    return run("netlify", commandArgs, { ...options, shell: false });
  }

  return run(process.execPath, [resolveWindowsNetlifyCli(), ...commandArgs], {
    ...options,
    shell: false,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertCorrectWorkspace() {
  const packagePath = resolve(repoRoot, "package.json");
  const netlifyPath = resolve(repoRoot, "netlify.toml");
  if (!existsSync(packagePath) || !existsSync(netlifyPath)) {
    throw new Error("Run this command from C:\\Users\\Knight\\Desktop\\Immaculate\\Immaculate-public-publish.");
  }

  const packageJson = readJson(packagePath);
  if (packageJson.name !== "immaculate") {
    throw new Error(`Wrong package: expected immaculate, got ${packageJson.name ?? "unknown"}.`);
  }
}

function assertExpectedSite() {
  const output = runNetlify(
    ["api", "getSite", "--data", JSON.stringify({ site_id: EXPECTED_SITE_ID })],
    { capture: true }
  );
  const site = JSON.parse(output);

  if (site.id !== EXPECTED_SITE_ID && site.site_id !== EXPECTED_SITE_ID) {
    throw new Error(`Netlify site ${EXPECTED_SITE_ID} was not found for this account.`);
  }
  if (site.name !== EXPECTED_SITE_NAME) {
    throw new Error(`Wrong Netlify site name: expected ${EXPECTED_SITE_NAME}, got ${site.name ?? "unknown"}.`);
  }
  if (site.custom_domain !== EXPECTED_DOMAIN) {
    throw new Error(`Wrong Netlify custom domain: expected ${EXPECTED_DOMAIN}, got ${site.custom_domain ?? "none"}.`);
  }

  return site;
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
    if (!location.includes(`/${JAWS_RELEASE_TAG}/`) || !location.endsWith(`/${fileName}`)) {
      throw new Error(`${baseUrl}${path} points to ${location || "no location"}; expected ${JAWS_RELEASE_TAG}/${fileName}.`);
    }
  }
  return statuses;
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
  Object.assign(statuses, jawsDownloads);
  return statuses;
}

async function main() {
  assertCorrectWorkspace();
  const site = assertExpectedSite();

  run("npm", ["run", "build", "-w", "@immaculate/core"]);
  run("npm", ["run", "build", "-w", "@immaculate/dashboard"]);

  if (!existsSync(outDir)) {
    throw new Error(`Dashboard export directory is missing: ${outDir}.`);
  }

  const deployArgs = [
    "deploy",
    "--json",
    "--no-build",
    "--filter",
    NETLIFY_WORKSPACE_FILTER,
    "--site",
    EXPECTED_SITE_ID,
    "--dir",
    outDir,
    "--message",
    prod ? "IORCH guarded production deploy" : "IORCH guarded draft deploy check",
  ];
  if (prod) {
    deployArgs.splice(1, 0, "--prod");
  }

  const deploy = parseDeployOutput(runNetlify(deployArgs, { capture: true }));
  const deployedUrl = deploy.deploy_ssl_url ?? deploy.deploy_url ?? deploy.ssl_url ?? deploy.url;
  if (!deployedUrl) {
    throw new Error(`Netlify deploy output did not include a deploy URL:\n${JSON.stringify(deploy, null, 2)}`);
  }

  const draftSmoke = await smoke(deployedUrl);
  const productionSmoke = prod ? await smoke(`https://${EXPECTED_DOMAIN}`) : null;

  console.log(JSON.stringify({
    status: "ok",
    mode: check ? "check" : "prod",
    siteId: site.id,
    siteName: site.name,
    customDomain: site.custom_domain,
    deployId: deploy.deploy_id ?? deploy.id ?? null,
    deployedUrl,
    draftSmoke,
    productionSmoke,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
