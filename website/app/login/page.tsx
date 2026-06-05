import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

const C = {
  bg: "#0B0B0E",
  surface: "#16161C",
  border: "#2C2C36",
  text: "#FFFFFF",
  textMute: "#B5B8C0",
  primary: "#F26B1F",
  accent: "#FFC56B",
  success: "#3EBB7F",
} as const;

const SG = 'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif';
const MR = 'var(--font-manrope), Manrope, system-ui, sans-serif';

function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="3" fill="#F26B1F" />
      <rect x="20" y="4" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.75" />
      <rect x="4" y="20" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.5" />
      <rect x="20" y="20" width="12" height="12" rx="3" fill="#F26B1F" opacity="0.8" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: C.bg,
        fontFamily: MR,
      }}
    >
      {/* ── Left Panel ─────────────────────────────────── */}
      <div
        style={{
          width: "50%",
          minHeight: "100vh",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "clamp(40px, 5vw, 80px)",
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(ellipse at 0% 0%, rgba(242,107,31,0.12) 0%, #0B0B0E 55%), #0B0B0E",
        }}
        className="hidden lg:flex"
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            pointerEvents: "none",
          }}
        />
        {/* Orange glow orb */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(242,107,31,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            textDecoration: "none",
            position: "relative",
            zIndex: 1,
          }}
        >
          <LogoMark />
          <span
            style={{
              fontFamily: SG,
              fontWeight: 700,
              fontSize: 20,
              color: C.text,
              letterSpacing: "-0.02em",
            }}
          >
            Lagan
          </span>
        </Link>

        {/* Middle content */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
          <p
            style={{
              fontFamily: SG,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.primary,
              marginBottom: 16,
            }}
          >
            Habit Tracker
          </p>
          <h2
            style={{
              fontFamily: SG,
              fontWeight: 800,
              fontSize: "clamp(32px, 3.5vw, 44px)",
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: C.text,
              marginBottom: 16,
            }}
          >
            Your habits,
            <br />
            <span style={{ color: C.primary }}>gently held.</span>
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: C.textMute,
              marginBottom: 40,
            }}
          >
            Build better routines with calm, intentional design. Track streaks,
            earn chill time, and grow consistently.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              "Build habits with gentle consistency",
              "Track streaks and earn chill time",
              "AI Coach that understands your life",
            ].map((feat) => (
              <div
                key={feat}
                style={{ display: "flex", alignItems: "center", gap: 12 }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "rgba(62,187,127,0.15)",
                    border: "1px solid rgba(62,187,127,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 14,
                      color: C.success,
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    check
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.textMute,
                  }}
                >
                  {feat}
                </span>
              </div>
            ))}
          </div>
        </div>

        <p
          style={{
            fontSize: 13,
            color: "rgba(181,184,192,0.4)",
            fontStyle: "italic",
            position: "relative",
            zIndex: 1,
          }}
        >
          &ldquo;True dedication doesn&apos;t need to be loud; it just needs to
          be consistent.&rdquo;
        </p>
      </div>

      {/* ── Right Panel (form) ──────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(24px, 4vw, 64px) clamp(20px, 4vw, 48px)",
          minHeight: "100vh",
          borderLeft: `1px solid ${C.border}`,
        }}
        className="lg:border-l-[1px]"
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* Mobile logo */}
          <Link
            href="/"
            style={{
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              marginBottom: 40,
            }}
            className="flex lg:hidden"
          >
            <LogoMark />
            <span
              style={{
                fontFamily: SG,
                fontWeight: 700,
                fontSize: 18,
                color: C.text,
                letterSpacing: "-0.02em",
              }}
            >
              Lagan
            </span>
          </Link>

          <Suspense
            fallback={
              <p style={{ fontSize: 14, color: C.textMute }}>
                Loading sign in…
              </p>
            }
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
