const fallbackSiteUrl = "https://iorch.net";

export const siteName = "Immaculate";
export const siteDescription =
  "Immaculate helps teams run AI operators with controls, audit trails, benchmarks, and human approval built in.";
export const arobiUrl = "https://aura-genesis.org";

function normalizeSiteUrl(value: string): URL {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return new URL(value);
  }
  return new URL(`https://${value}`);
}

export const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    fallbackSiteUrl
);
