import type { Session } from "@supabase/supabase-js";

export type AuthCallbackPayload =
  | { kind: "oauth-code"; code: string; type: string | null }
  | { kind: "email-otp"; tokenHash: string; type: "signup" | "recovery" }
  | {
      kind: "provider-error";
      error: string;
      errorDescription: string | null;
      type: string | null;
    };

export type AuthCallbackOutcome =
  | {
      status: "success";
      payload: Exclude<AuthCallbackPayload, { kind: "provider-error" }>;
      session: Session | null;
      duplicateSuppressed: boolean;
    }
  | {
      status: "error";
      payload: AuthCallbackPayload;
      error: unknown;
      duplicateSuppressed: boolean;
    };

export type ParsedAuthCallbackCandidate = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  error: string | null;
  errorDescription: string | null;
};

type AuthCallbackDependencies = {
  exchangeCode(code: string): Promise<{ error: unknown }>;
  verifyOtp(input: {
    token_hash: string;
    type: "signup" | "recovery";
  }): Promise<{ error: unknown }>;
  getSession(): Promise<{ data: { session: Session | null } }>;
};

export function selectAuthCallbackPayload(
  urls: readonly (string | null | undefined)[],
  parse: (url: string) => ParsedAuthCallbackCandidate,
): AuthCallbackPayload | null {
  const candidates = urls.filter((url): url is string => typeof url === "string" && url.length > 0);
  let providerError: AuthCallbackPayload | null = null;

  for (const url of candidates) {
    const parsed = parse(url);
    if (parsed.code) {
      return { kind: "oauth-code", code: parsed.code, type: parsed.type };
    }
    if (parsed.tokenHash && (parsed.type === "signup" || parsed.type === "recovery")) {
      return { kind: "email-otp", tokenHash: parsed.tokenHash, type: parsed.type };
    }
    if (!providerError && parsed.error) {
      providerError = {
        kind: "provider-error",
        error: parsed.error,
        errorDescription: parsed.errorDescription,
        type: parsed.type,
      };
    }
  }

  return providerError;
}

export function createAuthCallbackCoordinator(dependencies: AuthCallbackDependencies) {
  const completions = new Map<string, Promise<AuthCallbackOutcome>>();

  return async function completeAuthCallback(
    payload: AuthCallbackPayload,
  ): Promise<AuthCallbackOutcome> {
    if (payload.kind === "provider-error") {
      return {
        status: "error",
        payload,
        error: new Error(payload.errorDescription ?? payload.error),
        duplicateSuppressed: false,
      };
    }

    const key =
      payload.kind === "oauth-code"
        ? `code:${payload.code}`
        : `otp:${payload.type}:${payload.tokenHash}`;
    const existing = completions.get(key);
    if (existing) {
      const outcome = await existing;
      return { ...outcome, duplicateSuppressed: true };
    }

    const completion = finish(payload);
    completions.set(key, completion);
    return completion;
  };

  async function finish(
    payload: Exclude<AuthCallbackPayload, { kind: "provider-error" }>,
  ): Promise<AuthCallbackOutcome> {
    try {
      const result =
        payload.kind === "oauth-code"
          ? await dependencies.exchangeCode(payload.code)
          : await dependencies.verifyOtp({ token_hash: payload.tokenHash, type: payload.type });
      if (result.error) {
        return {
          status: "error",
          payload,
          error: result.error,
          duplicateSuppressed: false,
        };
      }

      const { data } = await dependencies.getSession();
      return {
        status: "success",
        payload,
        session: data.session,
        duplicateSuppressed: false,
      };
    } catch (error) {
      return { status: "error", payload, error, duplicateSuppressed: false };
    }
  }
}
