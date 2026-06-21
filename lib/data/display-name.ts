export function dashboardDisplayName({
  profileDisplayName,
  fullName,
  email: _email,
}: {
  profileDisplayName?: string | null;
  fullName?: string | null;
  email?: string | null;
}) {
  const profileName = profileDisplayName?.trim();
  if (profileName) return profileName;

  const metadataName = fullName?.trim();
  if (metadataName) return metadataName;

  return "there";
}
