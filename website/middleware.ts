import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildLoginRedirectPath,
  isAuthAwarePath,
  isLoginPath,
  isProtectedPath,
} from "./lib/auth-route-policy";
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
  const { pathname, search } = request.nextUrl;

  if (!isAuthAwarePath(pathname)) {
    return NextResponse.next();
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

  let hasVerifiedClaims = false;
  let shouldClearAuthCookies = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      shouldClearAuthCookies = isMissingRefreshTokenError(error);
    } else {
      hasVerifiedClaims = Boolean(data?.claims?.sub);
    }
  } catch (error) {
    shouldClearAuthCookies = isMissingRefreshTokenError(error);
  }

  if (shouldClearAuthCookies) {
    clearSupabaseAuthCookies(request, supabaseResponse);
  }

  if (!hasVerifiedClaims && isProtectedPath(pathname)) {
    const url = new URL(buildLoginRedirectPath(pathname, search), request.url);
    const response = NextResponse.redirect(url);
    if (shouldClearAuthCookies) clearSupabaseAuthCookies(request, response);
    return response;
  }

  // Redirect logged-in users away from /login
  if (hasVerifiedClaims && isLoginPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    url.hash = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/achievements/:path*",
    "/leaderboard/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/login",
  ],
};
