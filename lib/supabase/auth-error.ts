function authErrorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";

  const record = error as Record<string, unknown>;
  return [
    record.name,
    record.message,
    record.error,
    record.error_description,
    record.code,
    record.status,
  ]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ");
}

export function isMissingRefreshTokenError(error: unknown): boolean {
  const text = authErrorText(error).toLowerCase();
  return (
    text.includes("invalid refresh token") ||
    text.includes("refresh token not found") ||
    text.includes("refresh_token_not_found")
  );
}

export function authErrorMessageKey(error: unknown): string {
  const text = authErrorText(error).toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (text.includes("email not confirmed")) {
    return "Confirm your email before signing in.";
  }
  if (
    text.includes("user already registered") ||
    text.includes("already registered") ||
    text.includes("already exists")
  ) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (
    text.includes("for security purposes") ||
    text.includes("rate limit") ||
    text.includes("too many") ||
    text.includes("after 60 seconds")
  ) {
    return "Too many attempts. Wait a minute, then try again.";
  }
  if (text.includes("signup") && text.includes("disabled")) {
    return "Account creation is temporarily unavailable.";
  }

  return "Could not complete request. Try again.";
}
