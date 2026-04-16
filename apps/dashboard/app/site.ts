const fallbackSiteUrl = "https://iorch.net";

export const siteName = "Immaculate";
export const siteDescription =
  "Q-only intelligent orchestration for defense and healthcare. April 15 proof: BridgeBench 3 of 4, Harbor 1.000/1.000, 30-minute soak at 1270.54 events per second, bench-v3 training lineage.";
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
