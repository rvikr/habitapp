"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fieldInputRaised } from "@/components/ui/field";

const labelClass = "block text-[13px] font-bold text-on-surface-variant";

// Mirrors validatePassword in the app's lib/auth/password.ts.
function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  return null;
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    // The recovery link establishes a session via the /auth/callback exchange.
    // Landing here without one means the link was invalid/expired or opened out
    // of flow — the session alone is what authorizes updateUser({ password }).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasSession(Boolean(data.session));
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setHasSession(Boolean(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const problem = validatePassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  if (checking) {
    return <p className="text-sm text-on-surface-variant">Checking your reset link…</p>;
  }

  if (!hasSession) {
    return (
      <div className="w-full font-sans">
        <div className="mb-6">
          <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-tight text-on-background">
            Link expired.
          </h1>
          <p className="text-[15px] text-on-surface-variant">
            This password reset link is invalid or has expired. Request a fresh one from the sign-in page.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block rounded-xl bg-primary px-5 py-3 font-display text-[15px] font-bold text-white shadow-cta transition hover:bg-[#D95C18]"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full font-sans">
      <div className="mb-8">
        <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-tight text-on-background">
          Set a new password.
        </h1>
        <p className="text-[15px] text-on-surface-variant">
          Choose a strong password you&apos;ll remember.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-[13px] font-semibold text-error">
          {error}
        </div>
      )}
      {done && (
        <div className="mb-5 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-[13px] font-semibold text-secondary">
          Password updated — redirecting…
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className={`${labelClass} mb-2`} htmlFor="password">
            New password
          </label>
          <input
            type="password"
            id="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={fieldInputRaised}
          />
        </div>
        <div>
          <label className={`${labelClass} mb-2`} htmlFor="confirm">
            Confirm password
          </label>
          <input
            type="password"
            id="confirm"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            className={fieldInputRaised}
          />
        </div>
        <button
          type="submit"
          disabled={loading || done}
          className="w-full rounded-xl bg-primary py-3.5 font-display text-[15px] font-bold text-white shadow-cta transition hover:bg-[#D95C18] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
