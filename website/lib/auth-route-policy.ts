const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/achievements",
  "/leaderboard",
  "/settings",
  "/admin",
] as const;

function isPathOrChild(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((basePath) =>
    isPathOrChild(pathname, basePath)
  );
}

export function isLoginPath(pathname: string): boolean {
  return isPathOrChild(pathname, "/login");
}

export function isAuthAwarePath(pathname: string): boolean {
  return isProtectedPath(pathname) || isLoginPath(pathname);
}

export function buildLoginRedirectPath(pathname: string, search: string): string {
  const params = new URLSearchParams({ next: `${pathname}${search}` });
  return `/login?${params.toString()}`;
}
