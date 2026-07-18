"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fieldInputRaised } from "@/components/ui/field";

const labelClass = "block text-[13px] font-bold text-on-surface-variant";

type Mode = "signin" | "signup" | "forgot";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const supabase = createClient();
  const nextPath = safeNextPath(searchParams.get("next"));

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Reset link sent — check your email.");
        setCooldown(60);
      }
    } else if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push(nextPath);
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email for a confirmation link!");
      }
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  const heading =
    mode === "signin"
      ? { title: "Welcome back.", sub: "Let's continue growing." }
      : mode === "signup"
      ? { title: "Create account.", sub: "Start your journey today." }
      : { title: "Reset password.", sub: "We'll email you a link to set a new one." };

  const submitLabel = loading
    ? "Please wait…"
    : mode === "signin"
    ? "Log In"
    : mode === "signup"
    ? "Create Account"
    : cooldown > 0
    ? `Resend in ${cooldown}s`
    : "Send reset link";

  return (
    <div className="w-full font-sans">
      {/* Heading */}
      <div className="mb-8">
        <h1 className="mb-1.5 font-display text-3xl font-extrabold tracking-tight text-on-background">
          {heading.title}
        </h1>
        <p className="text-[15px] text-on-surface-variant">{heading.sub}</p>
      </div>

      {/* Error / success */}
      {error && (
        <div className="mb-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-[13px] font-semibold text-error">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-5 rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-[13px] font-semibold text-secondary">
          {message}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleEmailAuth} className="flex flex-col gap-5">
        <div>
          <label className={`${labelClass} mb-2`} htmlFor="email">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={fieldInputRaised}
          />
        </div>

        {mode !== "forgot" && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={labelClass} htmlFor="password">
                Password
              </label>
              {mode === "signin" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-[13px] font-bold text-primary transition-colors hover:text-primary-container"
                >
                  Forgot password?
                </button>
              )}
            </div>
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
        )}

        <button
          type="submit"
          disabled={loading || (mode === "forgot" && cooldown > 0)}
          className="w-full rounded-xl bg-primary py-3.5 font-display text-[15px] font-bold text-white shadow-cta transition hover:bg-[#D95C18] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </form>

      {mode === "forgot" ? (
        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Remembered it?{" "}
          <button
            onClick={() => switchMode("signin")}
            className="text-sm font-bold text-primary transition-colors hover:text-primary-container"
          >
            Back to sign in
          </button>
        </p>
      ) : (
        <>
          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-outline-variant" />
            <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.1em] text-outline">
              Or continue with
            </span>
            <div className="h-px flex-1 bg-outline-variant" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-high px-4 py-3 text-sm font-bold text-on-background transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          {/* Toggle mode */}
          <p className="mt-6 text-center text-sm text-on-surface-variant">
            {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              className="text-sm font-bold text-primary transition-colors hover:text-primary-container"
            >
              {mode === "signin" ? "Sign up for free" : "Sign in"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function safeNextPath(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return "/dashboard";
  }
  return value;
}
