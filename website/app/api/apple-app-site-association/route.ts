import { NextResponse } from "next/server";

// Served at /.well-known/apple-app-site-association via the rewrite in
// next.config.ts (the app router ignores dot-directories, and Apple requires
// an application/json content type that a static extensionless public file
// would not get). Returns 404 until APPLE_TEAM_ID is configured on the
// website deployment, which keeps Universal Links inert — iOS then falls back
// to opening lagan.health links in the browser, same as before.
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? "";
const IOS_BUNDLE_ID = "health.lagan.app";

export function GET() {
  if (!APPLE_TEAM_ID) return new NextResponse(null, { status: 404 });

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [`${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`],
            components: [{ "/": "/auth/confirm*" }],
          },
        ],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
