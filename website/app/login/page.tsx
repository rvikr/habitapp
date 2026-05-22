import Link from "next/link";
import { Suspense } from "react";
import { getPublicStats, formatCount } from "@/lib/stats";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

function Icon({
  name,
  className = "",
  fill = false,
}: {
  name: string;
  className?: string;
  fill?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={fill ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}

export default async function LoginPage() {
  const stats = await getPublicStats();

  const statCards = [
    { value: formatCount(stats.userCount), label: "Users" },
    { value: formatCount(stats.habitCount), label: "Habits" },
    { value: formatCount(stats.checkInCount), label: "Check-ins" },
  ];

  return (
    <div className="min-h-screen flex antialiased">
      {/* ── Left Panel (branding) ─────────────────────────── */}
      <div
        className="w-1/2 min-h-screen hidden lg:flex flex-col justify-between p-16 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(145deg, #451ebb 0%, #5d3fd3 45%, #2d7d7a 100%)",
        }}
      >
        {/* Decorative rings */}
        {[
          "w-[480px] h-[480px] -top-32 -left-32 opacity-15",
          "w-72 h-72 top-1/3 -right-20 opacity-10",
          "w-52 h-52 bottom-20 left-10 opacity-12",
        ].map((cls, i) => (
          <div
            key={i}
            className={`absolute rounded-full border border-white/20 ${cls}`}
          />
        ))}

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Icon name="auto_awesome" className="text-white text-xl" fill />
          </div>
          <span className="text-white font-extrabold text-2xl">Lagan लगन</span>
        </Link>

        {/* Headline + features */}
        <div className="relative z-10 space-y-10">
          <div className="space-y-3">
            <h2
              className="font-extrabold text-white"
              style={{ fontSize: "42px", lineHeight: 1.1, letterSpacing: "-0.025em" }}
            >
              Your daily progress,
              <br />
              beautifully tracked.
            </h2>
            <p className="text-white/65 text-base leading-relaxed max-w-sm">
              Join focused individuals building better routines with calm,
              intentional design.
            </p>
          </div>

          <div className="space-y-4">
            {[
              "Build habits with gentle consistency",
              "Track streaks and earn achievements",
              "Distraction-free minimalist design",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3 text-white/90">
                <div className="w-8 h-8 rounded-full bg-white/18 flex items-center justify-center flex-shrink-0">
                  <Icon name="check" className="text-white text-base" fill />
                </div>
                <span className="font-medium">{feat}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-5">
            {statCards.map(({ value, label }) => (
              <div
                key={label}
                className="bg-white/14 backdrop-blur-sm rounded-2xl px-5 py-4 text-center border border-white/10"
              >
                <p className="font-extrabold text-white text-2xl">{value}</p>
                <p className="text-white/60 text-xs mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-white/35 text-sm relative z-10 italic">
          &ldquo;True dedication doesn&apos;t need to be loud; it just needs to
          be consistent.&rdquo;
        </p>
      </div>

      {/* ── Right Panel (form) ───────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 min-h-screen bg-background">
        {/* Mobile logo */}
        <div className="w-full max-w-md space-y-8">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Icon name="auto_awesome" className="text-white text-[18px]" fill />
            </div>
            <span className="font-extrabold text-xl text-on-background">
              Lagan <span className="text-primary">लगन</span>
            </span>
          </Link>
          <Suspense fallback={<div className="text-sm text-on-surface-variant">Loading sign in...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
