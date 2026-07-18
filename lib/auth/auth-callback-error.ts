export const EXPIRED_AUTH_LINK_MESSAGE =
  "This link has expired or was already used. Request a new email.";

// Returns a translation key rather than exposing raw backend errors in the UI.
export function authCallbackErrorMessage(error: unknown): string {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const code = typeof record?.code === "string" ? record.code : "";
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof record?.message === "string"
          ? record.message
          : "";

  if (code === "otp_expired" || isTokenSpecificInvalidMessage(raw)) {
    return EXPIRED_AUTH_LINK_MESSAGE;
  }
  if (code === "bad_code_verifier" || /code[\s_]?verifier/i.test(raw)) {
    return "Open this link on the same device and browser where you requested it, or go back and request a new email.";
  }
  return raw || "Could not complete authentication.";
}

function isTokenSpecificInvalidMessage(message: string): boolean {
  return (
    /(?:otp|token|link).*(?:expired|already used|invalid)/i.test(message) ||
    /(?:expired|already used|invalid).*(?:otp|token|link)/i.test(message)
  );
}
