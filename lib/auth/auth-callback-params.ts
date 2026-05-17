type RouteParamValue = string | string[] | null | undefined;

const AUTH_PARAM_KEYS = new Set([
  "access_token",
  "code",
  "error",
  "error_description",
  "refresh_token",
  "state",
  "type",
]);

export function authCallbackUrlFromParams(
  basePath: string,
  params: Record<string, RouteParamValue>,
): string | null {
  const query = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(params)) {
    if (!AUTH_PARAM_KEYS.has(key)) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value == null || value === "") continue;
    query.set(key, value);
  }

  const queryString = query.toString();
  if (!queryString) return null;
  return `${basePath}?${queryString}`;
}
