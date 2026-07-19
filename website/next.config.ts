import path from "path";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // Blog posts are .mdx files under content/blog, rendered via app/blog.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
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
    // The /app PWA is auth-gated — keep it out of search/AI indexes. The shell
    // also carries a robots meta tag, but that only ships with the next Cloud
    // Run deploy; these headers cover the proxied responses immediately.
    const appNoindex = [{ key: "X-Robots-Tag", value: "noindex" }];
    return [
      {
        source: "/auth/open-app",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      { source: "/app", headers: appNoindex },
      { source: "/app/:path*", headers: appNoindex },
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

const withMDX = createMDX({});

export default withMDX(nextConfig);
