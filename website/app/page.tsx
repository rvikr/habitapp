import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import SiteNav from "@/components/landing/site-nav";
import ScrollAnimations from "@/components/landing/scroll-animations";

// ─── Color tokens (Ember dark) ────────────────────────────────────────────────
const C = {
  bg: "#0B0B0E",
  surface: "#16161C",
  surfaceHi: "#1F1F27",
  border: "#2C2C36",
  text: "#FFFFFF",
  textMute: "#B5B8C0",
  textDim: "#7A7E88",
  primary: "#F26B1F",
  accent: "#FFC56B",
  success: "#3EBB7F",
} as const;

function hexA(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const SG = 'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif';
const MR = 'var(--font-manrope), Manrope, system-ui, sans-serif';

// ─── Metadata ─────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "Lagan — Daily devotion. Gently rewarded.",
  description:
    "Build streaks that last. Earn chill time when you show up. Lagan makes daily devotion feel effortless.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lagan — Habit Tracker & Streak Builder",
    description:
      "Build streaks that last. Earn chill time when you show up.",
    url: "/",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lagan — Habit Tracker & Streak Builder",
    description: "Build streaks that last. Earn chill time when you show up.",
    images: ["/og-image.png"],
  },
};

export const revalidate = 3600;
export const dynamic = "force-dynamic";

// ─── Stats ────────────────────────────────────────────────────────────────────
type PublicStats = {
  user_count: number;
  completions_count: number;
  habits_count: number;
};

async function getPublicStats(): Promise<PublicStats> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase.rpc("get_public_stats");
    if (data) return data as PublicStats;
  } catch {}
  return { user_count: 0, completions_count: 0, habits_count: 0 };
}

function formatStat(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k+`;
  return n.toLocaleString();
}

// ─── Shared icons ─────────────────────────────────────────────────────────────
function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="3" fill="#F26B1F" />
      <rect x="20" y="4" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.75" />
      <rect x="4" y="20" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.5" />
      <rect x="20" y="20" width="12" height="12" rx="3" fill="#F26B1F" opacity="0.8" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
    </svg>
  );
}

function CheckIcon({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6L5 9L10 3"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Phone mockup screens ─────────────────────────────────────────────────────
function HabitRow({
  emoji,
  label,
  sub,
  done,
}: {
  emoji: string;
  label: string;
  sub: string;
  done: boolean;
}) {
  return (
    <div
      style={{
        background: C.surfaceHi,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 13px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 7,
      }}
    >
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{label}</div>
        <div style={{ fontSize: 10, color: C.textMute }}>{sub}</div>
      </div>
      {done ? (
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            background: C.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <CheckIcon color="#fff" size={9} />
        </div>
      ) : (
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            border: `2px solid ${C.border}`,
            flexShrink: 0,
          }}
        />
      )}
    </div>
  );
}

function PhoneHome() {
  return (
    <div
      style={{
        width: 300,
        height: 600,
        background: C.bg,
        overflow: "hidden",
        fontFamily: MR,
      }}
    >
      <div
        style={{
          height: 42,
          background: C.surface,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: C.textMute }}>9:41</span>
        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
          <div style={{ width: 3, height: 8, background: C.success, borderRadius: 1 }} />
          <div style={{ width: 3, height: 6, background: C.textMute, borderRadius: 1 }} />
          <div style={{ width: 3, height: 4, background: C.border, borderRadius: 1 }} />
        </div>
      </div>
      <div
        style={{
          padding: "13px 15px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.text,
              fontFamily: SG,
              letterSpacing: "-0.02em",
            }}
          >
            Good morning
          </div>
          <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>
            3 of 5 habits done
          </div>
        </div>
        <div
          style={{
            background: hexA(C.primary, 0.15),
            border: `1px solid ${hexA(C.primary, 0.3)}`,
            borderRadius: 18,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            color: C.primary,
          }}
        >
          🔥 12
        </div>
      </div>
      <div
        style={{
          margin: "0 13px 10px",
          background: C.surface,
          borderRadius: 13,
          padding: "11px 13px",
          border: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 13,
        }}
      >
        <div style={{ position: "relative", width: 46, height: 46, flexShrink: 0 }}>
          <svg width="46" height="46" viewBox="0 0 46 46">
            <circle cx="23" cy="23" r="17" fill="none" stroke={C.border} strokeWidth="5" />
            <circle
              cx="23"
              cy="23"
              r="17"
              fill="none"
              stroke={C.primary}
              strokeWidth="5"
              strokeDasharray="106.8"
              strokeDashoffset="42.7"
              strokeLinecap="round"
              transform="rotate(-90 23 23)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              color: C.primary,
            }}
          >
            60%
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
            Today&apos;s progress
          </div>
          <div style={{ fontSize: 10, color: C.textMute, marginTop: 1 }}>
            Keep going!
          </div>
        </div>
      </div>
      <div style={{ padding: "0 13px" }}>
        <HabitRow emoji="💧" label="Drink Water" sub="2500ml" done={true} />
        <HabitRow emoji="📖" label="Read 10 pages" sub="Atomic Habits" done={true} />
        <HabitRow emoji="🧘" label="Meditation" sub="10 min" done={true} />
        <HabitRow emoji="🏃" label="Evening walk" sub="30 min" done={false} />
        <HabitRow emoji="😴" label="Sleep by 11pm" sub="Bedtime" done={false} />
      </div>
    </div>
  );
}

function PhoneSignin() {
  return (
    <div
      style={{
        width: 300,
        height: 600,
        background: C.bg,
        overflow: "hidden",
        fontFamily: MR,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: hexA(C.primary, 0.15),
            border: `1px solid ${hexA(C.primary, 0.3)}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 10px",
          }}
        >
          <LogoMark size={28} />
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            fontFamily: SG,
            letterSpacing: "-0.02em",
          }}
        >
          Lagan
        </div>
        <div style={{ fontSize: 11, color: C.textMute, marginTop: 4 }}>
          Daily devotion. Gently rewarded.
        </div>
      </div>
      {(["Email address", "Password"] as const).map((label, i) => (
        <div key={label} style={{ width: "100%", marginBottom: 12 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: C.textMute,
              marginBottom: 5,
            }}
          >
            {label}
          </div>
          <div
            style={{
              width: "100%",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "10px 13px",
              fontSize: 12,
              color: C.textDim,
            }}
          >
            {i === 0 ? "you@example.com" : "••••••••"}
          </div>
        </div>
      ))}
      <button
        style={{
          width: "100%",
          background: C.primary,
          color: "#fff",
          border: "none",
          borderRadius: 12,
          padding: "13px",
          fontSize: 14,
          fontWeight: 700,
          marginTop: 8,
          cursor: "pointer",
          fontFamily: "inherit",
          boxShadow: `0 6px 20px ${hexA(C.primary, 0.35)}`,
        }}
      >
        Continue
      </button>
      <div
        style={{
          fontSize: 10,
          color: C.textDim,
          marginTop: 16,
          textAlign: "center",
        }}
      >
        New to Lagan?{" "}
        <span style={{ color: C.primary }}>Create account</span>
      </div>
    </div>
  );
}

function PhoneChill() {
  return (
    <div
      style={{
        width: 300,
        height: 600,
        background: C.bg,
        overflow: "hidden",
        fontFamily: MR,
      }}
    >
      <div
        style={{
          height: 42,
          background: C.surface,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: C.textMute }}>9:41</span>
        <span style={{ fontSize: 11, color: C.textMute }}>← Back</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "24px 22px 0",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.accent,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          CHILL MODE
        </div>
        <div
          style={{
            fontFamily: SG,
            fontSize: 80,
            fontWeight: 700,
            color: C.accent,
            letterSpacing: "-0.04em",
            lineHeight: 1,
            marginBottom: 6,
          }}
        >
          24
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.textMute,
            marginBottom: 28,
            fontWeight: 500,
          }}
        >
          minutes earned
        </div>
        <div style={{ position: "relative", width: 160, height: 88, marginBottom: 22 }}>
          <svg width="160" height="88" viewBox="0 0 160 88">
            <path
              d="M 16 88 A 64 64 0 0 1 144 88"
              fill="none"
              stroke={C.border}
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M 16 88 A 64 64 0 0 1 144 88"
              fill="none"
              stroke={C.accent}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="201"
              strokeDashoffset="70"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 11,
              fontWeight: 700,
              color: C.textMute,
              whiteSpace: "nowrap",
            }}
          >
            3 habits done
          </div>
        </div>
        {["Meditation ✓", "Morning walk ✓", "Journaling ✓"].map((item) => (
          <div
            key={item}
            style={{
              width: "100%",
              background: C.surface,
              borderRadius: 10,
              padding: "9px 13px",
              marginBottom: 7,
              border: `1px solid ${C.border}`,
              fontSize: 11,
              fontWeight: 600,
              color: C.text,
              textAlign: "center",
            }}
          >
            {item}
          </div>
        ))}
        <div
          style={{
            width: "100%",
            background: hexA(C.accent, 0.1),
            border: `1px solid ${hexA(C.accent, 0.3)}`,
            borderRadius: 12,
            padding: 12,
            marginTop: 6,
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            color: C.accent,
          }}
        >
          ▶ Start chill session
        </div>
      </div>
    </div>
  );
}

function PhoneCoach({ light = false }: { light?: boolean }) {
  const bg = light ? "#FAF7F2" : C.bg;
  const surf = light ? "#FFFFFF" : C.surface;
  const bdr = light ? "#E6E0D5" : C.border;
  const txt = light ? "#171311" : C.text;
  const mute = light ? "#5A554D" : C.textMute;

  return (
    <div
      style={{
        width: 300,
        height: 600,
        background: bg,
        overflow: "hidden",
        fontFamily: MR,
      }}
    >
      <div
        style={{
          height: 52,
          background: surf,
          borderBottom: `1px solid ${bdr}`,
          display: "flex",
          alignItems: "center",
          padding: "0 15px",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: hexA(C.primary, 0.15),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
          }}
        >
          ✨
        </div>
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: txt,
              fontFamily: SG,
            }}
          >
            AI Coach
          </div>
          <div style={{ fontSize: 10, color: mute }}>Powered by Lagan</div>
        </div>
      </div>
      <div
        style={{
          padding: "14px 13px",
          display: "flex",
          flexDirection: "column",
          gap: 11,
        }}
      >
        <div style={{ display: "flex", gap: 7, maxWidth: "85%" }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: hexA(C.primary, 0.15),
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
            }}
          >
            ✨
          </div>
          <div
            style={{
              background: surf,
              border: `1px solid ${bdr}`,
              borderRadius: "4px 12px 12px 12px",
              padding: "9px 11px",
              fontSize: 11,
              color: txt,
              lineHeight: 1.5,
            }}
          >
            Great job on your 12-day streak! Your morning habits are really
            solid. How are you feeling about your focus this week?
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{
              background: C.primary,
              borderRadius: "12px 4px 12px 12px",
              padding: "9px 11px",
              fontSize: 11,
              color: "#fff",
              lineHeight: 1.5,
              maxWidth: "80%",
            }}
          >
            Pretty good! I missed the evening walk twice though.
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, maxWidth: "85%" }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: hexA(C.primary, 0.15),
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
            }}
          >
            ✨
          </div>
          <div
            style={{
              background: surf,
              border: `1px solid ${bdr}`,
              borderRadius: "4px 12px 12px 12px",
              padding: "9px 11px",
              fontSize: 11,
              color: txt,
              lineHeight: 1.5,
            }}
          >
            That&apos;s normal. Try pairing the walk with something you already
            do — like right after dinner.
          </div>
        </div>
      </div>
      <div
        style={{
          padding: "0 13px",
          display: "flex",
          flexWrap: "wrap",
          gap: 7,
        }}
      >
        {["How's my streak?", "Suggest a habit", "Weekly review"].map(
          (chip) => (
            <div
              key={chip}
              style={{
                background: hexA(C.primary, 0.1),
                border: `1px solid ${hexA(C.primary, 0.25)}`,
                borderRadius: 16,
                padding: "5px 10px",
                fontSize: 10,
                fontWeight: 600,
                color: C.primary,
              }}
            >
              {chip}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function PhoneFrame({
  children,
  scale = 1,
}: {
  children: React.ReactNode;
  scale?: number;
}) {
  const W = 300,
    H = 600;
  return (
    <div
      style={{
        width: W * scale,
        height: H * scale,
        borderRadius: 36 * scale,
        overflow: "hidden",
        flexShrink: 0,
        border: `2px solid ${C.border}`,
        boxShadow: `0 24px 60px ${hexA("#000000", 0.5)}, 0 0 0 1px ${C.border}`,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: W,
          height: H,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function SiteHero({ userCount }: { userCount: string }) {
  return (
    <section
      className="landing-section"
      style={{
        minHeight: "100vh",
        padding: "100px clamp(20px, 5vw, 80px) 80px",
        display: "flex",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        background: C.bg,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse 65% 70% at 72% 52%, ${hexA(C.primary, 0.11)}, transparent 65%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "25%",
          width: 700,
          height: 700,
          pointerEvents: "none",
          background: `radial-gradient(circle, ${hexA(C.accent, 0.05)}, transparent 65%)`,
        }}
      />

      <div
        className="hero-grid"
        style={{
          maxWidth: 1240,
          width: "100%",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 40,
          alignItems: "center",
        }}
      >
        {/* Copy */}
        <div className="hero-copy" style={{ maxWidth: 540 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 28,
              background: hexA(C.primary, 0.1),
              border: `1px solid ${hexA(C.primary, 0.28)}`,
              borderRadius: 999,
              padding: "5px 14px",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: C.primary,
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.primary,
                letterSpacing: 0.3,
              }}
            >
              NEW · AI Coach is live
            </span>
          </div>

          <h1
            style={{
              fontFamily: SG,
              fontSize: "clamp(46px, 6vw, 86px)",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.0,
              color: C.text,
              margin: "0 0 22px",
            }}
          >
            Habits,
            <br />
            <span style={{ color: C.primary }}>gently</span> held.
          </h1>

          <p
            style={{
              fontFamily: MR,
              fontSize: 18,
              fontWeight: 500,
              color: C.textMute,
              lineHeight: 1.65,
              margin: "0 0 34px",
              maxWidth: 440,
            }}
          >
            Build streaks that last. Earn chill time when you show up. Daily
            devotion made effortless — never a chore.
          </p>

          <div
            className="hero-cta"
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 36,
              flexWrap: "wrap",
            }}
          >
            <a
              href="https://play.google.com/store"
              style={{
                background: C.primary,
                color: "#fff",
                borderRadius: 14,
                padding: "14px 26px",
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 9,
                textDecoration: "none",
                boxShadow: `0 8px 28px ${hexA(C.primary, 0.42)}`,
              }}
            >
              <AndroidIcon />
              Download for Android
            </a>
            <a
              href="#how-it-works"
              style={{
                background: "transparent",
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: "14px 26px",
                fontSize: 16,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              See how it works ↓
            </a>
          </div>

          {/* Social proof */}
          <div className="hero-social" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex" }}>
              {["R", "S", "M", "J", "K"].map((l, i) => (
                <div
                  key={l}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: `hsl(${18 + i * 32}, 60%, 46%)`,
                    border: `2px solid ${C.bg}`,
                    marginLeft: i > 0 ? -8 : 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {l}
                </div>
              ))}
            </div>
            <div>
              <div
                style={{ display: "flex", gap: 1, marginBottom: 2 }}
                aria-label="5 stars"
              >
                {"★★★★★".split("").map((s, i) => (
                  <span key={i} style={{ color: C.accent, fontSize: 11 }}>
                    {s}
                  </span>
                ))}
              </div>
              <span
                style={{ fontSize: 12, fontWeight: 600, color: C.textMute }}
              >
                Loved by {userCount} daily practicers
              </span>
            </div>
          </div>
        </div>

        {/* Phones */}
        <div
          className="hero-phones"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            gap: 22,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -80,
              borderRadius: "50%",
              pointerEvents: "none",
              background: `radial-gradient(circle, ${hexA(C.primary, 0.18)}, transparent 65%)`,
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <PhoneFrame>
              <PhoneHome />
            </PhoneFrame>
          </div>
          <div className="hero-phone-secondary" style={{ position: "relative", zIndex: 1, marginTop: 80 }}>
            <PhoneFrame scale={0.82}>
              <PhoneCoach light />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────────────
function StatsStrip({
  userCount,
  checkinsCount,
}: {
  userCount: string;
  checkinsCount: string;
}) {
  const items = [
    { value: userCount, label: "daily practicers" },
    { value: "4.9★", label: "App Store rating" },
    { value: checkinsCount, label: "habits checked in" },
    { value: "7 day", label: "avg. streak at 30 days" },
  ];
  return (
    <div
      className="landing-section stats-strip"
      style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
        padding: "0 clamp(20px, 5vw, 80px)",
      }}
    >
      <div
        className="stats-grid"
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
      >
        {items.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "28px 24px",
              borderRight:
                i < items.length - 1
                  ? `1px solid ${C.border}`
                  : "none",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontFamily: SG,
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: C.text,
                lineHeight: 1,
              }}
            >
              {s.value}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.textMute }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: "🔗",
    tag: "Streaks",
    title: "Don't break the chain",
    desc: "Visual streak tracking that makes showing up every day feel deeply satisfying. One tap, and it grows.",
  },
  {
    icon: "🎯",
    tag: "Focus",
    title: "One clean today view",
    desc: "All your habits in a focused daily list — just today's work, clearly laid out. No noise, no overwhelm.",
  },
  {
    icon: "😌",
    tag: "Chill mode",
    title: "Earn real chill time",
    desc: "Complete habits, bank guilt-free screen time as a reward. Lagan flips the script on app addiction.",
  },
  {
    icon: "✨",
    tag: "AI Coach",
    title: "A coach that gets you",
    desc: "Reads your streaks, sleep, and check-ins to give you personal nudges that fit your actual life.",
  },
];

function SiteFeatures() {
  return (
    <section
      id="features"
      className="landing-section"
      style={{
        padding: "100px clamp(20px, 5vw, 80px)",
        background: C.bg,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.primary,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Features
          </div>
          <h2
            style={{
              fontFamily: SG,
              fontSize: "clamp(30px, 4vw, 54px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: C.text,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Everything you need.
            <br />
            <span style={{ color: C.textMute }}>Nothing you don&apos;t.</span>
          </h2>
        </div>

        <div
          className="features-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 18,
          }}
        >
          {FEATURES.map((f, i) => {
            const hi = i === 0;
            return (
              <div
                key={f.tag}
                style={{
                  background: hi
                    ? `linear-gradient(155deg, ${hexA(C.primary, 0.14)}, ${C.surface})`
                    : C.surface,
                  border: `1px solid ${hi ? hexA(C.primary, 0.3) : C.border}`,
                  borderRadius: 20,
                  padding: "30px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 13,
                    background: hexA(C.primary, 0.1),
                    border: `1px solid ${hexA(C.primary, 0.18)}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                  }}
                >
                  {f.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: C.primary,
                      letterSpacing: "0.22em",
                      textTransform: "uppercase",
                      marginBottom: 9,
                    }}
                  >
                    {f.tag}
                  </div>
                  <div
                    style={{
                      fontFamily: SG,
                      fontSize: 20,
                      fontWeight: 600,
                      color: C.text,
                      letterSpacing: "-0.02em",
                      lineHeight: 1.2,
                      marginBottom: 10,
                    }}
                  >
                    {f.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textMute,
                      lineHeight: 1.65,
                      fontWeight: 500,
                    }}
                  >
                    {f.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────
const HOW_STEPS = [
  {
    num: "01",
    title: "Add your habits",
    desc: "Name them, set a schedule, add a gentle reminder. Start with 2–3 — quality beats quantity every time.",
    phone: <PhoneSignin />,
  },
  {
    num: "02",
    title: "Show up every day",
    desc: "Open Lagan each morning. Tap to check off what you did. Your streak grows with every single check-in.",
    phone: <PhoneHome />,
  },
  {
    num: "03",
    title: "Earn your chill time",
    desc: "Every habit completed earns guilt-free screen time. You did the work — now enjoy the reward, truly.",
    phone: <PhoneChill />,
  },
];

function SiteHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="landing-section"
      style={{
        padding: "100px clamp(20px, 5vw, 80px)",
        background: C.surface,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse 55% 80% at 50% 50%, ${hexA(C.primary, 0.04)}, transparent 70%)`,
        }}
      />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 66 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.primary,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Simple by design
          </div>
          <h2
            style={{
              fontFamily: SG,
              fontSize: "clamp(30px, 4vw, 52px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: C.text,
              margin: 0,
            }}
          >
            How it works
          </h2>
        </div>

        <div
          className="how-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 48,
            position: "relative",
            zIndex: 1,
            alignItems: "start",
          }}
        >
          {HOW_STEPS.map((step) => (
            <div
              key={step.num}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 28,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: SG,
                    fontSize: 80,
                    fontWeight: 700,
                    letterSpacing: "-0.04em",
                    color: hexA(C.primary, 0.16),
                    lineHeight: 1,
                    marginBottom: 14,
                  }}
                >
                  {step.num}
                </div>
                <div
                  style={{
                    fontFamily: SG,
                    fontSize: 22,
                    fontWeight: 600,
                    color: C.text,
                    letterSpacing: "-0.02em",
                    marginBottom: 10,
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: C.textMute,
                    lineHeight: 1.65,
                    fontWeight: 500,
                    maxWidth: 260,
                    margin: "0 auto",
                  }}
                >
                  {step.desc}
                </div>
              </div>
              <PhoneFrame scale={0.78}>{step.phone}</PhoneFrame>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Chill mode spotlight ─────────────────────────────────────────────────────
function SiteChillSpotlight() {
  return (
    <section
      id="chill-mode"
      className="landing-section"
      style={{
        padding: "100px clamp(20px, 5vw, 80px)",
        background: C.bg,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          className="chill-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -60,
                borderRadius: "50%",
                pointerEvents: "none",
                background: `radial-gradient(circle, ${hexA(C.accent, 0.15)}, transparent 70%)`,
              }}
            />
            <div style={{ position: "relative", zIndex: 1 }}>
              <PhoneFrame>
                <PhoneChill />
              </PhoneFrame>
            </div>
          </div>

          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.accent,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                marginBottom: 20,
              }}
            >
              The reward system
            </div>
            <h2
              style={{
                fontFamily: SG,
                fontSize: "clamp(30px, 3.5vw, 54px)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color: C.text,
                margin: "0 0 20px",
              }}
            >
              You earned it.
              <br />
              <span style={{ color: C.accent }}>Now chill.</span>
            </h2>
            <p
              style={{
                fontFamily: MR,
                fontSize: 16,
                color: C.textMute,
                lineHeight: 1.7,
                fontWeight: 500,
                margin: "0 0 32px",
                maxWidth: 400,
              }}
            >
              Every habit completed banks minutes of screen time. Guilt-free,
              earned, real. Lagan is the only app that rewards you for doing
              the work — not for staying in the app.
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {[
                "Complete a habit → earn 10 minutes of chill time",
                "Hold a 7-day streak → unlock 120 minute bonus",
                "AI Coach tells you when to rest vs. push forward",
              ].map((point, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      flexShrink: 0,
                      marginTop: 1,
                      background: hexA(C.accent, 0.18),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CheckIcon color={C.accent} />
                  </div>
                  <span
                    style={{
                      fontSize: 14,
                      color: C.textMute,
                      fontWeight: 500,
                      lineHeight: 1.55,
                    }}
                  >
                    {point}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    text: "Lagan changed my mornings. 90 days of meditation and I've never felt clearer. The chill time mechanic is genuinely clever.",
    name: "Sarah K.",
    role: "Designer · 90-day streak",
    init: "S",
    hue: 22,
  },
  {
    text: "Finally an app that doesn't feel like another obligation. The AI Coach called out my slump before I even noticed it myself.",
    name: "Marcus T.",
    role: "Engineer · 45-day streak",
    init: "M",
    hue: 220,
  },
  {
    text: "I've tried every habit app. Lagan is the first one that makes me want to open it. The design is just — calm. It's enough.",
    name: "Priya R.",
    role: "Writer · 120-day streak",
    init: "P",
    hue: 145,
  },
];

function SiteTestimonials() {
  return (
    <section
      className="landing-section"
      style={{
        padding: "100px clamp(20px, 5vw, 80px)",
        background: C.surface,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 52 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.primary,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            Community
          </div>
          <h2
            style={{
              fontFamily: SG,
              fontSize: "clamp(28px, 3.5vw, 48px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: C.text,
              margin: 0,
            }}
          >
            Gently held. Deeply built.
          </h2>
        </div>
        <div
          className="testi-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }}
        >
          {TESTIMONIALS.map((q, i) => {
            const color = `hsl(${q.hue}, 58%, 50%)`;
            return (
              <div
                key={i}
                style={{
                  background: C.surfaceHi,
                  border: `1px solid ${C.border}`,
                  borderRadius: 20,
                  padding: "28px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                }}
              >
                <div style={{ display: "flex", gap: 2 }}>
                  {"★★★★★".split("").map((s, j) => (
                    <span key={j} style={{ color, fontSize: 13 }}>
                      {s}
                    </span>
                  ))}
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: C.text,
                    lineHeight: 1.7,
                    fontWeight: 500,
                    margin: 0,
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{q.text}&rdquo;
                </p>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 12 }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      background: color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#fff",
                      fontFamily: SG,
                    }}
                  >
                    {q.init}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.text,
                      }}
                    >
                      {q.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.textMute,
                        fontWeight: 500,
                      }}
                    >
                      {q.role}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function SiteCTA() {
  return (
    <section
      className="landing-section"
      style={{
        padding: "120px clamp(20px, 5vw, 80px)",
        position: "relative",
        overflow: "hidden",
        background: C.bg,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(ellipse 70% 80% at 50% 50%, ${hexA(C.primary, 0.13)}, transparent 70%)`,
        }}
      />
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 28,
          }}
        >
          <LogoMark size={56} />
        </div>
        <h2
          style={{
            fontFamily: SG,
            fontSize: "clamp(36px, 5vw, 68px)",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            color: C.text,
            margin: "0 0 18px",
          }}
        >
          Start your streak
          <br />
          <span style={{ color: C.primary }}>today.</span>
        </h2>
        <p
          style={{
            fontFamily: MR,
            fontSize: 17,
            color: C.textMute,
            lineHeight: 1.65,
            fontWeight: 500,
            margin: "0 auto 40px",
            maxWidth: 360,
          }}
        >
          Free to start. No credit card. Just show up tomorrow.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <a
            href="https://play.google.com/store"
            style={{
              background: C.primary,
              color: "#fff",
              borderRadius: 14,
              padding: "16px 30px",
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 9,
              textDecoration: "none",
              boxShadow: `0 10px 32px ${hexA(C.primary, 0.45)}`,
            }}
          >
            <AndroidIcon />
            Download for Android
          </a>
          <div
            style={{
              background: C.surface,
              color: C.textMute,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "16px 30px",
              fontSize: 16,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            iOS — coming soon
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer
      className="landing-footer"
      style={{
        padding: "36px clamp(20px, 5vw, 80px)",
        background: C.bg,
        borderTop: `1px solid ${C.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark size={22} />
        <span
          style={{
            fontFamily: SG,
            fontWeight: 700,
            fontSize: 16,
            color: C.text,
            letterSpacing: "-0.02em",
          }}
        >
          Lagan
        </span>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {[
          { label: "Privacy", href: "/privacy" },
          { label: "Terms", href: "/terms" },
          { label: "Account deletion", href: "/account-deletion" },
          { label: "Sign in", href: "/login" },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.textMute,
              textDecoration: "none",
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
      <div
        style={{ fontSize: 12, color: C.textDim, fontWeight: 500 }}
      >
        © 2026 Lagan · habits, gently held.
      </div>
    </footer>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default async function LandingPage() {
  const stats = await getPublicStats();
  const userCount =
    stats.user_count > 0 ? formatStat(stats.user_count) : "10k+";
  const checkinsCount =
    stats.completions_count > 0
      ? formatStat(stats.completions_count)
      : "60M+";

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    name: "Lagan",
    description:
      "Free habit tracker for iOS, Android, and web. Build daily habits, track streaks, earn chill time.",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "iOS, Android, Web",
    url: "https://lagan.health",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    ...(stats.user_count > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        ratingCount: Math.max(stats.user_count, 1).toString(),
      },
    }),
  };

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        overflowX: "hidden",
        fontFamily: MR,
        WebkitFontSmoothing: "antialiased" as React.CSSProperties["WebkitFontSmoothing"],
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <ScrollAnimations />
      <SiteNav />
      <SiteHero userCount={userCount} />
      <StatsStrip userCount={userCount} checkinsCount={checkinsCount} />
      <SiteFeatures />
      <SiteHowItWorks />
      <SiteChillSpotlight />
      <SiteTestimonials />
      <SiteCTA />
      <SiteFooter />
    </div>
  );
}
