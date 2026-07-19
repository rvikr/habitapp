import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // The PWA's start_url is /app/ (trailing slash). Next's built-in
  // trailing-slash normalization would answer it with a 308, and a redirected
  // navigation response breaks the installed iOS PWA ("response served by
  // service worker has redirections"). Middleware re-implements the redirect
  // for marketing pages and rewrites (not redirects) /app/ paths instead.
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    return [
      {
        source: "/auth/open-app",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  async rewrites() {
    // Apple requires the AASA file at this exact dotted path with an
    // application/json content type; the app router can't own dot-directories,
    // so a route handler serves it (see app/api/apple-app-site-association).
    const wellKnown = [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
      {
        source: "/.well-known/apple-app-site-association",
        destination: "/api/apple-app-site-association",
      },
    ];
    // CLOUD_RUN_APP_URL: the full Cloud Run service URL (no trailing slash).
    // e.g. https://lagan-abcdefg-el.a.run.app
    // The rewrite strips the /app prefix so nginx sees root-relative paths.
    const cloudRunUrl = process.env.CLOUD_RUN_APP_URL ?? "";
    if (!cloudRunUrl) return wellKnown;
    return [
      ...wellKnown,
      { source: "/app", destination: `${cloudRunUrl}/` },
      { source: "/app/:path*", destination: `${cloudRunUrl}/:path*` },
    ];
  },
};

export default nextConfig;
