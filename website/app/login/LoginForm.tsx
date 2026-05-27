"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const C = {
  bg: "#0B0B0E",
  surface: "#16161C",
  surfaceHi: "#1F1F27",
  border: "#2C2C36",
  text: "#FFFFFF",
  textMute: "#B5B8C0",
  textDim: "#7A7E88",
  primary: "#F26B1F",
  error: "#FF5A5A",
  success: "#3EBB7F",
} as const;

const SG = 'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif';
const MR = 'var(--font-manrope), Manrope, system-ui, sans-serif';

function hexA(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const supabase = createClient();
  const nextPath = safeNextPath(searchParams.get("next"));

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signin") {
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    background: C.surfaceHi,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    color: C.text,
    fontSize: 14,
    fontWeight: 500,
    fontFamily: MR,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  return (
    <div style={{ width: "100%", fontFamily: MR }}>
      {/* Heading */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: SG,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: "-0.02em",
            color: C.text,
            marginBottom: 6,
          }}
        >
          {mode === "signin" ? "Welcome back." : "Create account."}
        </h1>
        <p style={{ fontSize: 15, color: C.textMute }}>
          {mode === "signin"
            ? "Let's continue growing."
            : "Start your journey today."}
        </p>
      </div>

      {/* Error / success */}
      {error && (
        <div
          style={{
            background: hexA(C.error, 0.12),
            border: `1px solid ${hexA(C.error, 0.3)}`,
            color: C.error,
            padding: "12px 16px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}
      {message && (
        <div
          style={{
            background: hexA(C.success, 0.12),
            border: `1px solid ${hexA(C.success, 0.3)}`,
            color: C.success,
            padding: "12px 16px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          {message}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label
            style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.textMute, marginBottom: 8 }}
            htmlFor="email"
          >
            Email Address
          </label>
          <input
            type="email"
            id="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ ...inputStyle }}
            onFocus={(e) => (e.target.style.borderColor = C.primary)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.textMute }} htmlFor="password">
              Password
            </label>
            {mode === "signin" && (
              <button
                type="button"
                style={{ fontSize: 13, fontWeight: 700, color: C.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}
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
            style={{ ...inputStyle }}
            onFocus={(e) => (e.target.style.borderColor = C.primary)}
            onBlur={(e) => (e.target.style.borderColor = C.border)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "14px",
            fontSize: 15,
            fontWeight: 700,
            fontFamily: SG,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            boxShadow: `0 4px 20px ${hexA(C.primary, 0.35)}`,
            transition: "opacity 0.2s",
          }}
        >
          {loading
            ? "Please wait…"
            : mode === "signin"
            ? "Log In"
            : "Create Account"}
        </button>
      </form>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "24px 0" }}>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          Or continue with
        </span>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>

      {/* Google */}
      <button
        onClick={handleGoogle}
        disabled={loading}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          background: C.surfaceHi,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "13px",
          fontSize: 14,
          fontWeight: 700,
          color: C.text,
          fontFamily: MR,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          transition: "border-color 0.15s, background 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = hexA(C.primary, 0.5);
          (e.currentTarget as HTMLButtonElement).style.background = hexA(C.primary, 0.06);
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;
          (e.currentTarget as HTMLButtonElement).style.background = C.surfaceHi;
        }}
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
      <p style={{ textAlign: "center", fontSize: 14, color: C.textMute, marginTop: 24 }}>
        {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setMessage("");
          }}
          style={{ color: C.primary, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: MR, fontSize: 14 }}
        >
          {mode === "signin" ? "Sign up for free" : "Sign in"}
        </button>
      </p>
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
