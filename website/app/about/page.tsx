import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const SITE_URL = "https://lagan.health";

export const metadata: Metadata = {
  title: "About Lagan Health",
  description:
    "About Lagan Health, the team behind Lagan AI Habit Tracker at lagan.health for AI habit coaching, daily routines, streaks, and progress tracking.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Lagan Health",
    description:
      "Learn about Lagan AI Habit Tracker, the AI habit coach and daily routines app at lagan.health.",
    url: "/about",
    images: ["/og-image.png"],
  },
};

function Icon({ name }: { name: string }) {
  return (
    <span
      className="material-symbols-outlined text-[20px]"
      style={{ fontVariationSettings: "'FILL' 1" }}
    >
      {name}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-outline-variant/50 pt-8">
      <h2 className="text-2xl font-extrabold tracking-tight text-on-background">
        {title}
      </h2>
      <div className="space-y-4 text-base leading-8 text-on-surface-variant">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About Lagan Health",
    url: `${SITE_URL}/about`,
    mainEntity: {
      "@type": ["MobileApplication", "SoftwareApplication"],
      name: "Lagan AI Habit Tracker",
      alternateName: ["Lagan", "Lagan Health", "lagan.health"],
      applicationCategory: "LifestyleApplication",
      applicationSubCategory: "Habit tracker",
      operatingSystem: "Web, iOS, Android",
      url: SITE_URL,
      sameAs: [],
      description:
        "Lagan AI Habit Tracker is an AI habit coach for daily routines, habit tracking, streaks, reminders, XP, and progress insights.",
    },
  };

  return (
    <main className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="border-b border-outline-variant/40 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-on-background">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <Icon name="auto_awesome" />
            </span>
            Lagan Health
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/app" className="text-sm font-bold text-primary">
              Open app
            </Link>
            <Link href="/" className="text-sm font-bold text-on-surface-variant hover:text-on-background">
              Home
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="max-w-3xl space-y-10">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              About Lagan Health
            </p>
            <h1 className="text-4xl font-extrabold leading-tight text-on-background sm:text-5xl">
              Lagan AI Habit Tracker for daily routines
            </h1>
            <p className="text-lg leading-8 text-on-surface-variant">
              Lagan Health builds Lagan AI Habit Tracker at lagan.health, a habit
              tracking app for people who want a calmer way to plan, log, and improve
              their daily routines.
            </p>
          </div>

          <Section title="What Lagan does">
            <p>
              Lagan combines daily habit tracking, streaks, XP, badges, reminders, and
              progress insights with an AI habit coach. The goal is to make the next
              right action clear without turning self-improvement into another noisy
              dashboard.
            </p>
            <p>
              The product is available from lagan.health as a web app for desktop,
              iPhone, and Android users while public app-store listings are prepared.
            </p>
          </Section>

          <Section title="Why the name matters">
            <p>
              People may search for Lagan, Lagan Health, Lagan AI Habit Tracker, or
              lagan.health. This page gives search engines and users a clear source of
              truth for the brand, the app, and the habit-tracking product category.
            </p>
          </Section>

          <Section title="Who Lagan is for">
            <p>
              Lagan is for people building small, repeatable routines: reading,
              walking, sleep habits, hydration, meditation, fitness, study, and other
              personal goals. It is a habit tracker and AI habit coach, not medical
              advice or a clinical treatment product.
            </p>
          </Section>
        </div>
      </section>
    </main>
  );
}
