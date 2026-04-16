const fallbackSiteUrl = "https://iorch.net";

export const siteName = "Immaculate";
export const siteDescription =
  "Controlled intelligence for defense and healthcare. Clear orchestration. Trusted action.";
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
