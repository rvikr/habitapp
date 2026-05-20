export const PENDING_SIGNUP_EMAIL_KEY = "habbit:pending-signup-email";

export const SIGNUP_CONFIRMATION_MESSAGE =
  "Account created. Check your email to confirm it, then come back here to sign in.";

export const AUTH_CALLBACK_CONFIRMED_TITLE = "Congratulations, your email is confirmed!";
export const AUTH_CALLBACK_CONFIRMED_BODY = "Refresh the app or sign in to start using Lagan.";

export const FIRST_LOGIN_WELCOME_TITLE = "Welcome to Lagan!";
export const FIRST_LOGIN_WELCOME_BODY = "You're all set. Add your first habit to get started.";

export function normalizeAuthEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isPendingSignupForEmail(
  pendingEmail: string | null | undefined,
  signedInEmail: string | null | undefined,
): boolean {
  const pending = normalizeAuthEmail(pendingEmail);
  const signedIn = normalizeAuthEmail(signedInEmail);
  return Boolean(pending && signedIn && pending === signedIn);
}

export function shouldRequireFirstRunOnboarding({
  newUser,
  habitCount,
}: {
  newUser: string | null | undefined;
  habitCount: number;
}): boolean {
  return newUser === "1" && habitCount === 0;
}

export async function rememberPendingSignup(email: string): Promise<void> {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) return;
  const { setItem } = await import("../platform/storage");
  await setItem(PENDING_SIGNUP_EMAIL_KEY, normalized);
}

export async function consumePendingSignupWelcome(email: string): Promise<boolean> {
  const { getItem, removeItem } = await import("../platform/storage");
  const pendingEmail = await getItem(PENDING_SIGNUP_EMAIL_KEY);
  const shouldWelcome = isPendingSignupForEmail(pendingEmail, email);
  if (shouldWelcome) {
    await removeItem(PENDING_SIGNUP_EMAIL_KEY);
  }
  return shouldWelcome;
}
