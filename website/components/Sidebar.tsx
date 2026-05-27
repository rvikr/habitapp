"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
} as const;

const SG = 'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif';
const MR = 'var(--font-manrope), Manrope, system-ui, sans-serif';

function hexA(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="3" fill="#F26B1F" />
      <rect x="20" y="4" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.75" />
      <rect x="4" y="20" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.5" />
      <rect x="20" y="20" width="12" height="12" rx="3" fill="#F26B1F" opacity="0.8" />
    </svg>
  );
}

const NAV = [
  { href: "/dashboard",    icon: "calendar_today", label: "Today"        },
  { href: "/achievements", icon: "military_tech",  label: "Achievements" },
  { href: "/leaderboard",  icon: "leaderboard",    label: "Leaderboard"  },
  { href: "/settings",     icon: "settings",       label: "Settings"     },
];

export default function Sidebar({
  displayName,
  email,
  isAdmin = false,
}: {
  displayName: string;
  email: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = displayName?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          background: hexA(C.surface, 0.95),
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: `1px solid ${C.border}`,
          fontFamily: MR,
        }}
        className="lg:hidden"
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <LogoMark />
          <span style={{ fontFamily: SG, fontWeight: 700, fontSize: 16, color: C.text, letterSpacing: "-0.02em" }}>
            Lagan
          </span>
        </Link>
        <button
          onClick={signOut}
          style={{
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.textMute,
          }}
          aria-label="Sign out"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
        </button>
      </header>

      {/* ── Mobile bottom nav ──────────────────────────── */}
      <nav
        style={{
          position: "fixed",
          inset: "auto 0 0 0",
          zIndex: 40,
          display: "grid",
          gridTemplateColumns: `repeat(${NAV.length}, 1fr)`,
          borderTop: `1px solid ${C.border}`,
          background: hexA(C.surface, 0.95),
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "6px 8px",
          fontFamily: MR,
        }}
        className="lg:hidden"
      >
        {NAV.map(({ href, icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "6px 4px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 700,
                textDecoration: "none",
                color: active ? C.primary : C.textMute,
                background: active ? hexA(C.primary, 0.1) : "transparent",
                transition: "color 0.15s",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 20,
                  fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                }}
              >
                {icon}
              </span>
              <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          minHeight: "100vh",
          width: 240,
          display: "flex",
          flexDirection: "column",
          background: C.surface,
          borderRight: `1px solid ${C.border}`,
          fontFamily: MR,
        }}
        className="hidden lg:flex"
      >
        {/* Logo */}
        <div style={{ padding: "24px 20px 16px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <LogoMark />
            <span style={{ fontFamily: SG, fontWeight: 700, fontSize: 17, color: C.text, letterSpacing: "-0.02em" }}>
              Lagan
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ href, icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: active ? 700 : 600,
                  textDecoration: "none",
                  color: active ? C.primary : C.textMute,
                  background: active ? hexA(C.primary, 0.1) : "transparent",
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.background = hexA(C.primary, 0.05);
                    (e.currentTarget as HTMLAnchorElement).style.color = C.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                    (e.currentTarget as HTMLAnchorElement).style.color = C.textMute;
                  }
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 20,
                    fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
                  }}
                >
                  {icon}
                </span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Admin link */}
        {isAdmin && (
          <div style={{ padding: "8px 12px" }}>
            <div style={{ height: 1, background: C.border, marginBottom: 8 }} />
            <Link
              href="/admin"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                color: C.textMute,
                transition: "color 0.15s",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>
                admin_panel_settings
              </span>
              Admin Panel
            </Link>
          </div>
        )}

        {/* Profile + sign out */}
        <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 8px", borderRadius: 12, marginBottom: 4 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: hexA(C.primary, 0.15),
                border: `1px solid ${hexA(C.primary, 0.3)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                color: C.primary,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {displayName}
              </p>
              {email && (
                <p style={{ fontSize: 11, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {email}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={signOut}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 16px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              color: C.textMute,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: MR,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#FF5A5A"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.textMute; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
