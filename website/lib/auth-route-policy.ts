const PROTECTED_PATH_PREFIXES = ["/admin"] as const;

function isPathOrChild(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((basePath) => isPathOrChild(pathname, basePath));
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

export function safeAdminNextPath(value: string | null): string {
  if (!value || (!isPathOrChild(value.split(/[?#]/, 1)[0], "/admin"))) return "/admin";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "/admin";
  return value;
}
