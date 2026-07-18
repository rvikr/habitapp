import { Suspense } from "react";
import type { Metadata } from "next";
import LoginForm from "./LoginForm";
import { LogoLockup } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const FEATURES = [
  "Manage users and access",
  "Review system health and feedback",
  "Control content and product settings",
];

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-background font-sans">
      {/* ── Left Panel ─────────────────────────────────── */}
      <div className="relative hidden min-h-screen w-1/2 flex-col justify-between overflow-hidden p-10 lg:flex xl:p-20">
        <div className="bg-grid-faint pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          className="bg-ember-glow pointer-events-none absolute -left-20 -top-32 h-[400px] w-[400px] rounded-full"
          aria-hidden="true"
        />

        <LogoLockup size={32} className="relative z-[1]" />

        {/* Middle content */}
        <div className="relative z-[1] max-w-[420px]">
          <p className="mb-4 font-display text-[13px] font-bold uppercase tracking-[0.12em] text-primary">
            Administration
          </p>
          <h2 className="mb-4 font-display text-[clamp(32px,3.5vw,44px)] font-extrabold leading-[1.1] tracking-tight text-on-background">
            Lagan Admin,
            <br />
            <span className="text-primary">one control center.</span>
          </h2>
          <p className="mb-10 text-base leading-relaxed text-on-surface-variant">
            Secure access to Lagan operations, user support, analytics, and content controls.
          </p>

          <div className="flex flex-col gap-4">
            {FEATURES.map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-secondary/30 bg-secondary/15">
                  <span className="material-symbols-outlined text-sm text-secondary [font-variation-settings:'FILL'_1]">
                    check
                  </span>
                </div>
                <span className="text-sm font-semibold text-on-surface-variant">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-[1] text-[13px] italic text-on-surface-variant/40">
          &ldquo;True dedication doesn&apos;t need to be loud; it just needs to
          be consistent.&rdquo;
        </p>
      </div>

      {/* ── Right Panel (form) ──────────────────────────── */}
      <div className="flex min-h-screen flex-1 items-center justify-center border-outline-variant px-5 py-6 sm:px-12 lg:border-l">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <LogoLockup className="mb-10 lg:hidden" />

          <Suspense
            fallback={<p className="text-sm text-on-surface-variant">Loading sign in…</p>}
          >
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
