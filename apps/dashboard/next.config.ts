import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const dashboardRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(dashboardRoot, "../..");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests"
].join("; ");

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@immaculate/core"],
  poweredByHeader: false,
  images: {
    unoptimized: true
  },
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;
