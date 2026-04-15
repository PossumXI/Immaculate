import type { MetadataRoute } from "next";
import { siteDescription, siteName, siteUrl } from "./site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: siteName,
    description: siteDescription,
    start_url: siteUrl.toString(),
    display: "standalone",
    background_color: "#071019",
    theme_color: "#071019",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
