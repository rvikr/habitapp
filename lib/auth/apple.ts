export type AppleAuthErrorLike = {
  code?: unknown;
};

export function isAppleAuthCancellationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as AppleAuthErrorLike).code === "ERR_REQUEST_CANCELED";
}

export function appleFullNameMetadata(
  fullName:
    | {
        givenName?: string | null;
        middleName?: string | null;
        familyName?: string | null;
      }
    | null
    | undefined,
): Record<string, string> | null {
  if (!fullName) return null;
  const parts = [fullName.givenName, fullName.middleName, fullName.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) return null;

  const metadata: Record<string, string> = { full_name: parts.join(" ") };
  if (fullName.givenName?.trim()) metadata.given_name = fullName.givenName.trim();
  if (fullName.familyName?.trim()) metadata.family_name = fullName.familyName.trim();
  return metadata;
}
