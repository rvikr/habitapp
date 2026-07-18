"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeAdminNextPath } from "@/lib/auth-route-policy";
import { fieldInputRaised } from "@/components/ui/field";

const labelClass = "block text-[13px] font-bold text-on-surface-variant";

const CALLBACK_ERRORS: Record<string, string> = {
  auth_callback_failed: "Could not complete admin sign in. Try again.",
  not_authorized: "This account is not authorized to access Lagan Admin.",
};

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    CALLBACK_ERRORS[searchParams.get("error") ?? ""] ?? "",
  );

  const nextPath = safeAdminNextPath(searchParams.get("next"));
  const supabase = createClient();

  async function handleEmailAuth(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  async function handleGoogle() {
    setLoading(true);
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  return (
    <div className="w-full font-sans">
      <div className="mb-8">
        <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-tight text-on-background">
          Admin sign in
        </h1>
        <p className="text-[15px] text-on-surface-variant">
          Sign in with an authorized administrator account.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-[13px] font-semibold text-error">
          {error}
        </div>
      )}

      <form onSubmit={handleEmailAuth} className="flex flex-col gap-5">
        <div>
          <label className={`${labelClass} mb-2`} htmlFor="email">
            Email address
          </label>
          <input
            type="email"
            id="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldInputRaised}
          />
        </div>

        <div>
          <label className={`${labelClass} mb-2`} htmlFor="password">
            Password
          </label>
          <input
            type="password"
            id="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldInputRaised}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary py-3.5 font-display text-[15px] font-bold text-white shadow-cta transition hover:bg-[#D95C18] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-outline-variant" />
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-outline">Or</span>
        <div className="h-px flex-1 bg-outline-variant" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-high px-4 py-3 text-sm font-bold text-on-background transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Continue with Google
      </button>
    </div>
  );
}
