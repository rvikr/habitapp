import { NextResponse, type NextRequest } from "next/server";
import {
  buildPwaHandoffUrl,
  isAppEmailOtpType,
  resolveAppHandoff,
} from "@/lib/auth-app-handoff";

export function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!tokenHash || !isAppEmailOtpType(type)) {
    return sensitiveRedirect(new URL("/app", origin));
  }

  const handoff = resolveAppHandoff(searchParams.get("redirect_to"), tokenHash, type);
  if (handoff?.kind === "native") {
    const interstitial = new URL("/auth/open-app", origin);
    interstitial.searchParams.set("token_hash", tokenHash);
    interstitial.searchParams.set("type", type);
    interstitial.searchParams.set("redirect_to", handoff.redirectTo);
    return sensitiveRedirect(interstitial);
  }

  // PWA requests go straight back to Expo. Missing or invalid redirect targets
  // include emails created by the previous templates; preserve those tokens by
  // deliberately falling back to the PWA instead of dropping them at /app.
  return sensitiveRedirect(handoff?.url ?? buildPwaHandoffUrl(tokenHash, type));
}

function sensitiveRedirect(target: string | URL) {
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
