import { emitHarnessStartupBanner } from "./startup-banner.js";
import { resolveQAliasSpecification } from "./ollama-alias.js";

process.env.IMMACULATE_STARTUP_BANNER = process.env.IMMACULATE_STARTUP_BANNER ?? "always";

const qAlias = resolveQAliasSpecification();

emitHarnessStartupBanner({
  host: process.env.IMMACULATE_HARNESS_HOST ?? "127.0.0.1",
  port: Number(process.env.IMMACULATE_HARNESS_PORT ?? 8787),
  tickIntervalMs: Number(process.env.IMMACULATE_TICK_INTERVAL_MS ?? 180),
  ollamaUrl: process.env.IMMACULATE_OLLAMA_URL ?? "http://127.0.0.1:11434",
  configuredModel: qAlias.displayName
});
