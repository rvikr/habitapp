import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async rewrites() {
    // CLOUD_RUN_APP_URL: the full Cloud Run service URL (no trailing slash).
    // e.g. https://lagan-abcdefg-el.a.run.app
    // The rewrite strips the /app prefix so nginx sees root-relative paths.
    const cloudRunUrl = process.env.CLOUD_RUN_APP_URL ?? "";
    if (!cloudRunUrl) return [];
    return [
      { source: "/app", destination: `${cloudRunUrl}/` },
      { source: "/app/:path*", destination: `${cloudRunUrl}/:path*` },
    ];
  },
};

export default nextConfig;
