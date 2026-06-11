import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isMissingRefreshTokenError } from "./lib/supabase/auth-error";

function isSupabaseAuthCookie(name: string): boolean {
  return (
    name.startsWith("sb-") &&
    (name.includes("auth-token") || name.includes("code-verifier"))
  );
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse): void {
  request.cookies.getAll().forEach(({ name }) => {
    if (!isSupabaseAuthCookie(name)) return;
    request.cookies.delete(name);
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  });
}

export async function middleware(request: NextRequest) {
  const { pathname: requestPath } = request.nextUrl;

  // ---- /app (the Expo PWA, proxied to Cloud Run) ----------------------------
  if (requestPath === "/app" || requestPath.startsWith("/app/")) {
    // Trailing-slash app URLs (/app/, /app/login/) must resolve WITHOUT a
    // redirect: the iOS PWA launches at start_url /app/ and its service worker
    // may not serve redirected navigation responses. Rewrite straight to the
    // Cloud Run origin with the slash stripped (nginx serves the SPA shell).
    const cloudRunUrl = process.env.CLOUD_RUN_APP_URL ?? "";
    if (cloudRunUrl && requestPath.endsWith("/")) {
      const stripped = requestPath.replace(/\/+$/, "");
      const targetPath = stripped === "/app" ? "/" : stripped.slice("/app".length);
      return NextResponse.rewrite(new URL(targetPath + request.nextUrl.search, cloudRunUrl));
    }
    // Slashless app paths are handled by the rewrites in next.config.ts. The
    // app manages its own Supabase auth in localStorage — the cookie-based
    // session work below is irrelevant to it and would add a network round
    // trip to every app navigation.
    return NextResponse.next();
  }

  // ---- marketing site --------------------------------------------------------
  // skipTrailingSlashRedirect disables Next's automatic 308 (needed above), so
  // replicate it here for marketing URLs to keep one canonical URL per page.
  if (requestPath.length > 1 && requestPath.endsWith("/")) {
    const url = request.nextUrl.clone();
    url.pathname = requestPath.replace(/\/+$/, "");
    return NextResponse.redirect(url, 308);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  let user: User | null = null;
  let shouldClearAuthCookies = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      shouldClearAuthCookies = isMissingRefreshTokenError(error);
    } else {
      user = data.user;
    }
  } catch (error) {
    shouldClearAuthCookies = isMissingRefreshTokenError(error);
  }

  if (shouldClearAuthCookies) {
    clearSupabaseAuthCookies(request, supabaseResponse);
  }

  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") || pathname.startsWith("/achievements");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    if (shouldClearAuthCookies) clearSupabaseAuthCookies(request, response);
    return response;
  }

  // Redirect logged-in users away from /login
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
