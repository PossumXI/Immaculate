import { resolveQAliasSpecification } from "./ollama-alias.js";

export type StartupBannerOptions = {
  host: string;
  port: number;
  tickIntervalMs: number;
  ollamaUrl: string;
  configuredModel?: string | undefined;
};

const RESET = "\u001b[0m";
const TITLE_ROWS = [
  "██╗███╗   ███╗███╗   ███╗ █████╗  ██████╗██╗   ██╗██╗      █████╗ ████████╗███████╗",
  "██║████╗ ████║████╗ ████║██╔══██╗██╔════╝██║   ██║██║     ██╔══██╗╚══██╔══╝██╔════╝",
  "██║██╔████╔██║██╔████╔██║███████║██║     ██║   ██║██║     ███████║   ██║   █████╗  ",
  "██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║     ██║   ██║██║     ██╔══██║   ██║   ██╔══╝  ",
  "██║██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║╚██████╗╚██████╔╝███████╗██║  ██║   ██║   ███████╗",
  "╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝"
] as const;

const TITLE_GRADIENT = [
  "\u001b[38;2;181;126;220m",
  "\u001b[38;2;216;180;248m",
  "\u001b[38;2;255;255;255m",
  "\u001b[38;2;122;79;191m",
  "\u001b[38;2;0;119;190m",
  "\u001b[38;2;10;26;47m"
] as const;

const INFO_PRIMARY = "\u001b[38;2;0;119;190m";
const INFO_ACCENT = "\u001b[38;2;181;126;220m";
const INFO_DIM = "\u001b[38;2;122;79;191m";

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
  return TITLE_ROWS.map((row, index) => applyColor(row, TITLE_GRADIENT[index] ?? TITLE_GRADIENT[TITLE_GRADIENT.length - 1]));
}

function renderInfoLines(options: StartupBannerOptions): string[] {
  const qAlias = resolveQAliasSpecification();
  const modelLabel = options.configuredModel?.trim() || qAlias.displayName;

  return [
    `${applyColor("lavender-to-ocean truecolor banner", INFO_ACCENT)} ${applyColor("|", INFO_DIM)} ${applyColor("Q cognition alias", INFO_DIM)}`,
    `${applyColor("endpoint", INFO_PRIMARY)} ${options.host}:${options.port} ${applyColor("| ticks", INFO_PRIMARY)} ${options.tickIntervalMs}ms`,
    `${applyColor("ollama", INFO_PRIMARY)} ${options.ollamaUrl} ${applyColor("| model", INFO_PRIMARY)} ${modelLabel}`,
    `${applyColor("Q lane", INFO_ACCENT)} ${qAlias.alias} ${applyColor("| banner", INFO_PRIMARY)} ${bannerMode()}`
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
