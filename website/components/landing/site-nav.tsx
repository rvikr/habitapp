"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const C = {
  bg: "#0B0B0E",
  border: "#2C2C36",
  textMute: "#B5B8C0",
  primary: "#F26B1F",
  text: "#FFFFFF",
} as const;

function hexA(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 36 36" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="3" fill="#F26B1F" />
      <rect x="20" y="4" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.75" />
      <rect x="4" y="20" width="12" height="12" rx="3" fill="#FFC56B" opacity="0.5" />
      <rect x="20" y="20" width="12" height="12" rx="3" fill="#F26B1F" opacity="0.8" />
    </svg>
  );
}

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 68,
        padding: "0 clamp(20px, 5vw, 80px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: scrolled ? hexA(C.bg, 0.88) : "transparent",
        backdropFilter: scrolled ? "blur(20px) saturate(1.4)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px) saturate(1.4)" : "none",
        borderBottom: scrolled
          ? `1px solid ${hexA(C.border, 0.7)}`
          : "1px solid transparent",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
        }}
      >
        <LogoMark />
        <span
          style={{
            fontFamily:
              'var(--font-space-grotesk), "Space Grotesk", system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 18,
            color: C.text,
            letterSpacing: "-0.02em",
          }}
        >
          Lagan
        </span>
      </Link>

      <div
        style={{
          alignItems: "center",
          gap: 28,
        }}
        className="hidden md:flex"
      >
        {(
          [
            ["AI features", "#features"],
            ["How it works", "#how-it-works"],
            ["Momentum", "#leaderboard"],
          ] as [string, string][]
        ).map(([label, href]) => (
          <a
            key={label}
            href={href}
            className="nav-link"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.textMute,
              textDecoration: "none",
              letterSpacing: "-0.01em",
              transition: "color 0.15s",
            }}
          >
            {label}
          </a>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          href="/login"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.textMute,
            textDecoration: "none",
          }}
        >
          Sign in
        </Link>
        <button
          className="btn-press"
          style={{
            background: C.primary,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "9px 20px",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
            boxShadow: `0 4px 16px ${hexA(C.primary, 0.35)}`,
          }}
        >
          Download
        </button>
      </div>
    </nav>
  );
}
