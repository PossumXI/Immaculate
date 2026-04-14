import path from "node:path";
import { createPersistence } from "./persistence.js";
import { createQApiKeyRegistry, normalizeQApiRateLimitPolicy } from "./q-api-auth.js";

type QApiKeyCliCommand = "create" | "list" | "revoke";

type QApiKeyCliFlags = {
  command: QApiKeyCliCommand;
  runtimeDir?: string;
  keysPath?: string;
  label?: string;
  keyId?: string;
  requestsPerMinute?: number;
  burst?: number;
  maxConcurrentRequests?: number;
};

function parseInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function parseFlags(argv: string[]): QApiKeyCliFlags {
  const command = (argv[0]?.trim().toLowerCase() || "list") as QApiKeyCliCommand;
  const flags: QApiKeyCliFlags = {
    command: command === "create" || command === "revoke" ? command : "list"
  };

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--runtime-dir") {
      flags.runtimeDir = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--runtime-dir=")) {
      flags.runtimeDir = token.slice("--runtime-dir=".length).trim();
      continue;
    }
    if (token === "--keys-path") {
      flags.keysPath = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--keys-path=")) {
      flags.keysPath = token.slice("--keys-path=".length).trim();
      continue;
    }
    if (token === "--label") {
      flags.label = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--label=")) {
      flags.label = token.slice("--label=".length).trim();
      continue;
    }
    if (token === "--key-id") {
      flags.keyId = argv[index + 1]?.trim();
      index += 1;
      continue;
    }
    if (token.startsWith("--key-id=")) {
      flags.keyId = token.slice("--key-id=".length).trim();
      continue;
    }
    if (token === "--rpm") {
      flags.requestsPerMinute = parseInteger(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith("--rpm=")) {
      flags.requestsPerMinute = parseInteger(token.slice("--rpm=".length));
      continue;
    }
    if (token === "--burst") {
      flags.burst = parseInteger(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith("--burst=")) {
      flags.burst = parseInteger(token.slice("--burst=".length));
      continue;
    }
    if (token === "--max-concurrent") {
      flags.maxConcurrentRequests = parseInteger(argv[index + 1]);
      index += 1;
      continue;
    }
    if (token.startsWith("--max-concurrent=")) {
      flags.maxConcurrentRequests = parseInteger(token.slice("--max-concurrent=".length));
    }
  }

  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const persistence = createPersistence(flags.runtimeDir);
  const runtimeRoot = persistence.getStatus().rootDir;
  const defaultRateLimit = normalizeQApiRateLimitPolicy(
    {
      requestsPerMinute: parseInteger(process.env.IMMACULATE_Q_API_DEFAULT_RPM),
      burst: parseInteger(process.env.IMMACULATE_Q_API_DEFAULT_BURST),
      maxConcurrentRequests: parseInteger(process.env.IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT)
    },
    {
      requestsPerMinute: 60,
      burst: 60,
      maxConcurrentRequests: 2
    }
  );
  const registry = await createQApiKeyRegistry({
    rootDir: runtimeRoot,
    storePath: flags.keysPath ? path.resolve(flags.keysPath) : undefined,
    defaultRateLimit
  });

  if (flags.command === "create") {
    if (!flags.label?.trim()) {
      throw new Error("Use --label to name the Q API key.");
    }
    const created = await registry.createKey({
      label: flags.label.trim(),
      rateLimit: {
        requestsPerMinute: flags.requestsPerMinute,
        burst: flags.burst,
        maxConcurrentRequests: flags.maxConcurrentRequests
      }
    });
    console.log(
      JSON.stringify(
        {
          accepted: true,
          command: "create",
          runtimeRoot,
          keysPath: registry.getStorePath(),
          key: created.key,
          plainTextKey: created.plainTextKey
        },
        null,
        2
      )
    );
    return;
  }

  if (flags.command === "revoke") {
    if (!flags.keyId?.trim()) {
      throw new Error("Use --key-id to revoke a Q API key.");
    }
    const revoked = await registry.revokeKey(flags.keyId.trim());
    console.log(
      JSON.stringify(
        {
          accepted: true,
          command: "revoke",
          runtimeRoot,
          keysPath: registry.getStorePath(),
          key: revoked
        },
        null,
        2
      )
    );
    return;
  }

  const keys = await registry.listKeys();
  console.log(
    JSON.stringify(
      {
        accepted: true,
        command: "list",
        runtimeRoot,
        keysPath: registry.getStorePath(),
        keyCount: keys.length,
        keys
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "Q API key CLI failed.");
  process.exitCode = 1;
});
