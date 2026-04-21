import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(dashboardRoot, "../..");
const nextCli = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const outRoot = path.join(dashboardRoot, "out");
const stagingRoot = path.join(dashboardRoot, "out.__staging__");
const nextStaticRoot = path.join(dashboardRoot, ".next", "static");
const nextServerAppRoot = path.join(dashboardRoot, ".next", "server", "app");
const publicRoot = path.join(dashboardRoot, "public");

async function findOpenPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate an export port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function startServer(port) {
  const child = spawn(process.execPath, [nextCli, "start", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: dashboardRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return { child, readLogs: () => ({ stdout, stderr }) };
}

async function waitForServer(baseUrl, child, readLogs) {
  const deadline = Date.now() + 60_000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const logs = readLogs();
      throw new Error(
        `Dashboard export server exited before it became ready.\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
      lastError = `unexpected status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const logs = readLogs();
  throw new Error(
    `Timed out waiting for dashboard export server: ${lastError}\nstdout:\n${logs.stdout}\nstderr:\n${logs.stderr}`,
  );
}

async function fetchRoute(baseUrl, routePath) {
  const response = await fetch(`${baseUrl}${routePath}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to export ${routePath}: HTTP ${response.status}`);
  }
  return await response.text();
}

async function writeHtmlVariants(relativeDir, html) {
  const directoryRoot = path.join(stagingRoot, relativeDir);
  await mkdir(directoryRoot, { recursive: true });
  await writeFile(path.join(directoryRoot, "index.html"), html, "utf8");
  if (relativeDir.length > 0) {
    await writeFile(path.join(stagingRoot, `${relativeDir}.html`), html, "utf8");
  }
}

async function writeTextAsset(relativePath, content) {
  const filePath = path.join(stagingRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 10_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  const port = await findOpenPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { child, readLogs } = startServer(port);
  try {
    await waitForServer(baseUrl, child, readLogs);
    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingRoot, { recursive: true });

    await cp(publicRoot, stagingRoot, { recursive: true, force: true });
    await cp(nextStaticRoot, path.join(stagingRoot, "_next", "static"), {
      recursive: true,
      force: true,
    });

    const routes = [
      { routePath: "/", relativeDir: "" },
      { routePath: "/legal", relativeDir: "legal" },
      { routePath: "/terms", relativeDir: "terms" },
    ];
    for (const route of routes) {
      const html = await fetchRoute(baseUrl, route.routePath);
      await writeHtmlVariants(route.relativeDir, html);
    }

    const notFoundHtml = await readFile(path.join(nextServerAppRoot, "_not-found.html"), "utf8");
    await writeHtmlVariants("_not-found", notFoundHtml);
    await writeFile(path.join(stagingRoot, "404.html"), notFoundHtml, "utf8");

    const staticAssets = [
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/icon.svg",
      "/.well-known/security.txt",
    ];
    for (const assetPath of staticAssets) {
      const content = await fetchRoute(baseUrl, assetPath);
      await writeTextAsset(assetPath.replace(/^\//, ""), content);
    }

    await rm(outRoot, { recursive: true, force: true });
    await rename(stagingRoot, outRoot);
  } finally {
    await stopServer(child);
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? `${error.message}\n` : "Static dashboard export failed.\n");
  process.exitCode = 1;
});
