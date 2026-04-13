import { resolveQAliasSpecification } from "./ollama-alias.js";

export type StartupBannerOptions = {
  host: string;
  port: number;
  tickIntervalMs: number;
  ollamaUrl: string;
  configuredModel?: string | undefined;
};

const RESET = "\u001b[0m";
const OCEAN_BLUE = "\u001b[38;5;39m";
const OCEAN_BLUE_DIM = "\u001b[38;5;117m";
const YELLOW = "\u001b[38;5;226m";
const YELLOW_DIM = "\u001b[38;5;228m";

function bannerMode(): "auto" | "always" | "off" {
  const raw = (process.env.IMMACULATE_STARTUP_BANNER ?? "auto").trim().toLowerCase();
  if (raw === "always" || raw === "off") {
    return raw;
  }

  return "auto";
}

function shouldRenderBanner(): boolean {
  const mode = bannerMode();
  if (mode === "off") {
    return false;
  }
  if (mode === "always") {
    return true;
  }

  return Boolean(process.stdout.isTTY) && process.env.CI !== "true" && process.env.NODE_ENV !== "test";
}

function applyColor(text: string, color: string): string {
  if (process.env.NO_COLOR) {
    return text;
  }

  return `${color}${text}${RESET}`;
}

function renderTitleLines(): string[] {
  return [
    `${applyColor("██╗███╗   ███╗███╗   ███╗", OCEAN_BLUE)} ${applyColor(" █████╗  ██████╗██╗   ██╗██╗      █████╗ ████████╗███████╗", YELLOW)}`,
    `${applyColor("██║████╗ ████║████╗ ████║", OCEAN_BLUE)} ${applyColor("██╔══██╗██╔════╝██║   ██║██║     ██╔══██╗╚══██╔══╝██╔════╝", YELLOW)}`,
    `${applyColor("██║██╔████╔██║██╔████╔██║", OCEAN_BLUE)} ${applyColor("███████║██║     ██║   ██║██║     ███████║   ██║   █████╗  ", YELLOW)}`,
    `${applyColor("██║██║╚██╔╝██║██║╚██╔╝██║", OCEAN_BLUE)} ${applyColor("██╔══██║██║     ██║   ██║██║     ██╔══██║   ██║   ██╔══╝  ", YELLOW)}`,
    `${applyColor("██║██║ ╚═╝ ██║██║ ╚═╝ ██║", OCEAN_BLUE)} ${applyColor("██║  ██║╚██████╗╚██████╔╝███████╗██║  ██║   ██║   ███████╗", YELLOW)}`,
    `${applyColor("╚═╝╚═╝     ╚═╝╚═╝     ╚═╝", OCEAN_BLUE)} ${applyColor("╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝", YELLOW)}`
  ];
}

function renderInfoLines(options: StartupBannerOptions): string[] {
  const qAlias = resolveQAliasSpecification();
  const modelLabel = options.configuredModel?.trim() || qAlias.displayName;

  return [
    `${applyColor("ocean-blue control plane", OCEAN_BLUE_DIM)} ${applyColor("|", YELLOW_DIM)} ${applyColor("yellow cognition alias", YELLOW_DIM)}`,
    `${applyColor("endpoint", OCEAN_BLUE_DIM)} ${options.host}:${options.port} ${applyColor("| ticks", OCEAN_BLUE_DIM)} ${options.tickIntervalMs}ms`,
    `${applyColor("ollama", OCEAN_BLUE_DIM)} ${options.ollamaUrl} ${applyColor("| model", OCEAN_BLUE_DIM)} ${modelLabel}`,
    `${applyColor("Q alias", YELLOW_DIM)} ${qAlias.alias} -> ${qAlias.baseModel} ${applyColor("| banner", OCEAN_BLUE_DIM)} ${bannerMode()}`
  ];
}

export function emitHarnessStartupBanner(options: StartupBannerOptions): boolean {
  if (!shouldRenderBanner()) {
    return false;
  }

  const lines = [...renderTitleLines(), "", ...renderInfoLines(options), ""];
  process.stdout.write(`${lines.join("\n")}\n`);
  return true;
}
