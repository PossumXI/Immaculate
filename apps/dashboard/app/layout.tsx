import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { siteDescription, siteName, siteUrl } from "./site";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"]
});

export const viewport: Viewport = {
  themeColor: "#071019",
  colorScheme: "dark"
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: `${siteName} | Intelligent Orchestration`,
    template: `%s | ${siteName}`
  },
  description: siteDescription,
  applicationName: siteName,
  manifest: "/manifest.webmanifest",
  category: "technology",
  keywords: [
    "Immaculate",
    "Q",
    "intelligent orchestration",
    "defense systems",
    "healthcare systems",
    "operator-governed AI",
    "mission systems",
    "evidence-driven AI",
    "BridgeBench",
    "TerminalBench",
    "RewardKit",
    "Q benchmark",
    "Harbor benchmark"
  ],
  authors: [{ name: "Arobi Technology Alliance" }],
  creator: "Arobi Technology Alliance",
  publisher: "Arobi Technology Alliance",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: `${siteName} | Intelligent Orchestration`,
    description: siteDescription,
    url: "/",
    siteName,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/assets/immaculate-og-card.svg",
        width: 1200,
        height: 630,
        alt: "Immaculate intelligent orchestration for defense and healthcare."
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | Intelligent Orchestration`,
    description: siteDescription,
    images: ["/assets/immaculate-og-card.svg"],
    creator: "@aura_genesis"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg" }]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${monoFont.variable}`}>{children}</body>
    </html>
  );
}
