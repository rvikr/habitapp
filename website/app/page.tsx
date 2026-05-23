import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lagan — Habit Tracker & Streak Builder for iOS, Android & Web",
  description:
    "Free habit tracker app for iOS, Android, and web. Build daily habits, track streaks, earn badges, and stay consistent with a minimalist, distraction-free design.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lagan — Habit Tracker & Streak Builder",
    description:
      "Build daily habits, track streaks, and earn badges with a minimalist habit tracker for iOS, Android, and web.",
    url: "/",
    images: ["/og-image.png"],
  },
  twitter: {
    title: "Lagan — Habit Tracker & Streak Builder",
    description:
      "Build daily habits, track streaks, and earn badges with a minimalist habit tracker for iOS, Android, and web.",
  },
};

// ─── Stats helpers ───────────────────────────────────────────
type PublicStats = { user_count: number; completions_count: number; habits_count: number };

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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k+`;
  return n.toLocaleString();
}

// ─── Reusable Icon ───────────────────────────────────────────
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
      style={
        fill ? { fontVariationSettings: "'FILL' 1" } : undefined
      }
    >
      {name}
    </span>
  );
}

export default async function LandingPage() {
  const stats = await getPublicStats();
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    name: "Lagan",
    alternateName: "Lagan लगन",
    description:
      "Free habit tracker for iOS, Android, and web. Build daily habits, track streaks, earn badges, and stay consistent.",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "iOS, Android, Web",
    url: "https://lagan.health",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    ...(stats.user_count > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: Math.max(stats.user_count, 1).toString(),
      },
    }),
    featureList: [
      "Daily habit tracking",
      "Streak counter",
      "Achievement badges",
      "Progress dashboard",
      "Cross-platform sync (iOS, Android, web)",
      "Minimalist distraction-free design",
    ],
  };
  return (
    <div className="min-h-screen overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      {/* ── Navbar ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 glass border-b border-outline-variant/30 shadow-nav">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-[0_4px_12px_rgba(69,30,187,0.35)]">
              <Icon name="auto_awesome" className="text-white text-[18px]" fill />
            </div>
            <span className="font-extrabold text-xl text-on-background">
              Lagan <span className="text-primary">लगन</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {[
              { href: "#how-it-works", label: "How it Works" },
              { href: "#features", label: "Features" },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="text-on-surface-variant hover:text-primary transition-colors font-medium text-sm"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-primary font-semibold text-sm hover:opacity-70 transition-opacity px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="bg-primary text-white px-5 py-2.5 rounded-full font-semibold text-sm hover:bg-primary-container transition-colors shadow-[0_4px_16px_rgba(93,63,211,0.32)]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section
        className="pt-20 pb-28 overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 65% 40%, rgba(93,63,211,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 15% 85%, rgba(115,243,239,0.07) 0%, transparent 55%)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Copy */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 bg-primary-fixed/70 text-primary px-4 py-2 rounded-full text-sm font-bold border border-primary-fixed-dim/60">
                <Icon name="psychology" className="text-[16px]" fill />
                Cultivate Your Passion
              </div>

              <h1
                className="font-extrabold text-on-background"
                style={{ fontSize: "clamp(36px,5vw,52px)", lineHeight: 1.08, letterSpacing: "-0.025em" }}
              >
                Master your routines
                <br />
                with{" "}
                <span className="gradient-text">Quiet Energy.</span>
              </h1>

              <p className="text-lg text-on-surface-variant leading-relaxed max-w-md">
                Lagan provides a minimalist, focused environment to build habits,
                track progress, and celebrate the small wins that lead to profound
                personal growth.
              </p>

              <div className="flex items-center gap-4 flex-wrap">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 bg-primary text-white px-7 py-3.5 rounded-full font-bold text-base hover:bg-primary-container transition-all shadow-cta hover:shadow-cta-hover active:scale-95 duration-200"
                >
                  <Icon name="arrow_forward" className="text-[18px]" />
                  Get Started Free
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 border-2 border-primary text-primary px-6 py-3 rounded-full font-bold text-base hover:bg-primary/5 transition-colors"
                >
                  View Dashboard
                  <Icon name="arrow_forward" className="text-[18px]" />
                </Link>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex -space-x-2">
                  {["A", "R", "S", "+"].map((l, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold"
                      style={{
                        background: ["#e6deff", "#73f3ef80", "#ffdbce", "#e7e8e9"][i],
                        color: ["#451ebb", "#006a67", "#7b2900", "#484554"][i],
                      }}
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-on-surface-variant">
                  <span className="font-bold text-on-background">
                    Joined by {formatStat(stats.user_count) || "our first"}
                  </span>{" "}
                  focused individuals
                </p>
              </div>
            </div>

            {/* Phone Mockup */}
            <div className="relative flex justify-center items-center min-h-[500px]">
              <div
                className="w-72 rounded-[2.5rem] overflow-hidden bg-background relative z-10"
                style={{
                  border: "2px solid rgba(93,63,211,0.15)",
                  boxShadow: "0 32px 80px rgba(93,63,211,0.18), 0 8px 24px rgba(0,0,0,0.08)",
                }}
              >
                {/* Phone header */}
                <div className="bg-white/95 px-5 py-4 flex items-center justify-between border-b border-outline-variant/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon name="person" className="text-primary text-sm" fill />
                    </div>
                    <span className="font-bold text-sm text-primary">Morning Routine</span>
                  </div>
                  <Icon name="add_circle" className="text-primary text-2xl" fill />
                </div>

                <div className="bg-background px-5 py-5 space-y-4">
                  <div>
                    <h3 className="font-bold text-on-background text-base">Good morning, Rohan!</h3>
                    <p className="text-xs text-on-surface-variant mt-0.5">2 of 5 habits completed.</p>
                  </div>

                  {/* Progress ring card */}
                  <div className="bg-white rounded-2xl p-4 shadow-card">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-secondary uppercase tracking-widest">Daily Goal</p>
                        <p className="text-3xl font-extrabold text-primary mt-1" style={{ letterSpacing: "-0.02em" }}>60%</p>
                      </div>
                      <div className="relative w-[60px] h-[60px]">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                          <circle cx="32" cy="32" r="26" fill="none" stroke="#f1f5f9" strokeWidth="7" />
                          <circle cx="32" cy="32" r="26" fill="none" stroke="#5D3FD3" strokeWidth="7" strokeDasharray="163.4" strokeDashoffset="65.4" strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-50 flex gap-2 flex-wrap">
                      <span className="bg-secondary-container/30 px-2.5 py-1 rounded-xl text-xs font-bold text-on-secondary-container flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>12 Day Streak
                      </span>
                      <span className="bg-tertiary-fixed/40 px-2.5 py-1 rounded-xl text-xs font-bold text-on-tertiary-fixed-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>Early Bird
                      </span>
                    </div>
                  </div>

                  {/* Sample habits */}
                  {[
                    { icon: "water_drop", label: "Drink Water", sub: "2500ml daily", done: true, bg: "bg-secondary-container/30", ic: "text-secondary" },
                    { icon: "menu_book", label: "Read 10 Pages", sub: "Atomic Habits", done: true, bg: "bg-primary-fixed/30", ic: "text-primary" },
                    { icon: "self_improvement", label: "Meditation", sub: "Mindfulness", done: false, bg: "bg-surface-container", ic: "text-on-surface-variant" },
                  ].map(({ icon, label, sub, done, bg, ic }) => (
                    <div key={label} className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                      <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                        <span className={`material-symbols-outlined ${ic} text-[18px]`} style={done ? { fontVariationSettings: "'FILL' 1" } : undefined}>{icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs text-on-background">{label}</p>
                        <p className="text-xs text-on-surface-variant">{sub}</p>
                      </div>
                      {done ? (
                        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-white text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-outline-variant flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating badges */}
              <div className="animate-floatY absolute top-6 -right-2 bg-white rounded-2xl px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)] flex items-center gap-2 z-20">
                <span className="material-symbols-outlined text-on-tertiary-fixed-variant text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>
                <div>
                  <p className="text-xs font-bold text-on-background leading-tight">Early Bird</p>
                  <p className="text-xs text-on-surface-variant">Badge unlocked!</p>
                </div>
              </div>
              <div className="animate-floatY-delay absolute bottom-16 -left-8 bg-white rounded-2xl px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.12)] flex items-center gap-2 z-20">
                <span className="material-symbols-outlined text-secondary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                <div>
                  <p className="text-xs font-bold text-on-background leading-tight">12 Day Streak</p>
                  <p className="text-xs text-on-surface-variant">Keep going!</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Philosophy ─────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 text-center">
          <div className="max-w-3xl mx-auto space-y-5">
            <span className="inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-primary">Our Philosophy</span>
            <h2 className="font-extrabold text-on-background" style={{ fontSize: "clamp(28px,4vw,40px)", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Design your life with intentionality
              <br />
              and <span className="gradient-text">quiet energy.</span>
            </h2>
            <p className="text-lg text-on-surface-variant leading-relaxed">
              We stripped away the noise so you can focus on the signal. Lagan is
              built on the philosophy that{" "}
              <strong className="text-on-background font-semibold">
                true dedication doesn&apos;t need to be loud;
              </strong>{" "}
              it just needs to be consistent.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section id="features" className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="text-center mb-16 space-y-3">
            <span className="inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-primary">Features</span>
            <h2 className="font-extrabold text-on-background" style={{ fontSize: "clamp(26px,3.5vw,36px)", letterSpacing: "-0.02em" }}>
              Everything you need. Nothing you don&apos;t.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: "spa", label: "Minimalist Focus", color: "bg-primary-fixed/50", ic: "text-primary", desc: "Zero clutter. A clean interface designed specifically to reduce cognitive load and keep you engaged with your tasks." },
              { icon: "insights", label: "Gentle Insights", color: "bg-secondary-container/50", ic: "text-secondary", desc: "Track your momentum without judgment. Visual cues help you understand your patterns and gently guide you back on track." },
              { icon: "celebration", label: "Subtle Rewards", color: "bg-tertiary-fixed/50", ic: "text-on-tertiary-fixed-variant", desc: "Experience haptic-like animations and gentle visual bursts that make completing habits deeply satisfying." },
            ].map(({ icon, label, color, ic, desc }) => (
              <div
                key={label}
                className="bg-white rounded-3xl p-8 shadow-card border border-outline-variant/25 space-y-5 hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
              >
                <div className={`w-14 h-14 ${color} rounded-2xl flex items-center justify-center`}>
                  <span className={`material-symbols-outlined ${ic} text-3xl`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-xl text-on-background">{label}</h3>
                  <p className="text-on-surface-variant leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it Works ───────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="text-center mb-16 space-y-3">
            <span className="inline-block text-xs font-extrabold uppercase tracking-[0.18em] text-primary">How It Works</span>
            <h2 className="font-extrabold text-on-background" style={{ fontSize: "clamp(26px,3.5vw,36px)", letterSpacing: "-0.02em" }}>
              Three steps to a better routine.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-16">
            {[
              { n: "1", title: "Choose your habits", body: "Pick from our curated catalog or create your own. Health, focus, creativity — you decide what matters." },
              { n: "2", title: "Check in daily", body: "A single tap to log completion. No friction, no long forms. Just you and your commitment." },
              { n: "3", title: "Watch streaks grow", body: "Earn badges, build streaks, and level up. Celebrate your consistency in a calm, rewarding way." },
            ].map(({ n, title, body }) => (
              <div key={n} className="text-center space-y-5">
                <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-extrabold text-lg mx-auto shadow-[0_8px_20px_rgba(93,63,211,0.35)]">
                  {n}
                </div>
                <h3 className="font-bold text-xl text-on-background">{title}</h3>
                <p className="text-on-surface-variant leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary-container overflow-hidden relative">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative z-10">
          <div className="grid grid-cols-3 gap-8 text-center">
            {([
              [formatStat(stats.user_count), "Focused individuals"],
              [formatStat(stats.completions_count), "Habits completed"],
              [formatStat(stats.habits_count), "Habits tracked"],
            ] as [string, string][]).map(([val, label]) => (
              <div key={label} className="space-y-2">
                <p className="font-extrabold text-white" style={{ fontSize: "clamp(36px,5vw,52px)", letterSpacing: "-0.03em" }}>{val}</p>
                <p className="text-white/75 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="py-32 bg-background">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 text-center space-y-8">
          <h2 className="font-extrabold text-on-background" style={{ fontSize: "clamp(32px,5vw,48px)", letterSpacing: "-0.025em" }}>
            Ready to build your momentum?
          </h2>
          <p className="text-xl text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            Join thousands of users who have found their focus with Lagan. Start
            cultivating your dedication today.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-primary text-white px-9 py-4 rounded-full font-bold text-base hover:bg-primary-container transition-all shadow-cta hover:shadow-cta-hover active:scale-95 duration-200"
            >
              Get Started for Free
              <Icon name="arrow_forward" className="text-[20px]" />
            </Link>
          </div>
          <p className="text-sm text-on-surface-variant">No credit card required · Free forever plan available</p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="bg-inverse-surface text-inverse-on-surface py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid md:grid-cols-3 gap-12 mb-12">
            <div className="md:col-span-1 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Icon name="auto_awesome" className="text-white text-[18px]" fill />
                </div>
                <span className="font-extrabold text-xl text-white">Lagan लगन</span>
              </div>
              <p className="text-white/50 text-sm leading-relaxed">
                &ldquo;True dedication doesn&apos;t need to be loud; it just needs to be consistent.&rdquo;
              </p>
            </div>
            {[
              { title: "Product", links: [{ label: "Features", href: "#features" }, { label: "How it Works", href: "#how-it-works" }, { label: "Dashboard", href: "/dashboard" }, { label: "Achievements", href: "/achievements" }] },
              { title: "Legal", links: [{ label: "Privacy Policy", href: "/privacy" }, { label: "Terms of Service", href: "/terms" }, { label: "Account Deletion", href: "/account-deletion" }] },
            ].map(({ title, links }) => (
              <div key={title} className="space-y-4">
                <h4 className="font-bold text-xs uppercase tracking-[0.15em] text-white/35">{title}</h4>
                <ul className="space-y-2.5 text-sm text-white/55">
                  {links.map(({ label, href }) => (
                    <li key={label}>
                      <Link href={href} className="hover:text-white transition-colors">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-sm text-white/35">© {new Date().getFullYear()} Lagan. All rights reserved.</p>
            <p className="text-sm text-white/35">Made with <span className="text-primary-fixed-dim">♥</span> for focused individuals.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
