import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Footer from "@/components/ui/footer";
import LaunchPromoModal from "@/components/ui/launch-promo-modal";
import MarketingNav from "@/components/ui/marketing-nav";
import PhoneMockup from "@/components/ui/phone-mockup";
import { Pill } from "@/components/ui/pill";
import ScrollAnimations from "@/components/ui/scroll-animations";
import { Eyebrow, Section, SectionHeading } from "@/components/ui/section";
import { PLAY_STORE_URL, SITE_URL, WEB_APP_URL } from "@/lib/site";

const DESCRIPTION =
  "Lagan is an AI habit tracker. Build daily routines, track streaks, and get AI coaching — free in the web app, with the Android app on Google Play.";

export const metadata: Metadata = {
  title: { absolute: "Lagan — AI Habit Tracker & Coach for Android and Web" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lagan — AI Habit Tracker & Coach",
    description: DESCRIPTION,
    url: "/",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lagan — AI Habit Tracker & Coach",
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

const features = [
  {
    title: "AI habit suggestions",
    description: "Get practical habit ideas based on the routines you want to build.",
    icon: SparkIcon,
    accent: "text-tertiary",
    chip: "bg-tertiary/10 border-tertiary/25",
  },
  {
    title: "Daily habit tracking",
    description: "Check off habits quickly and see what still needs attention today.",
    icon: CheckIcon,
    accent: "text-secondary",
    chip: "bg-secondary/10 border-secondary/25",
  },
  {
    title: "Progress insights",
    description: "Understand streaks, completion patterns, and where consistency is growing.",
    icon: ChartIcon,
    accent: "text-habit-water",
    chip: "bg-habit-water/10 border-habit-water/25",
  },
  {
    title: "Simple reminders",
    description: "Set calm nudges that help you remember without adding noise.",
    icon: BellIcon,
    accent: "text-habit-meditate",
    chip: "bg-habit-meditate/10 border-habit-meditate/25",
  },
  {
    title: "Motivation to stay consistent",
    description: "Use small wins, streaks, and AI guidance to keep going after busy days.",
    icon: FlameIcon,
    accent: "text-primary",
    chip: "bg-primary/10 border-primary/25",
  },
];

const steps = [
  {
    step: "01",
    title: "Open Lagan",
    description:
      "Start free in the web app — no install needed — or download the Android app on Google Play.",
  },
  {
    step: "02",
    title: "Add your habits",
    description: "Choose habits to track or use AI suggestions to shape a simple routine.",
  },
  {
    step: "03",
    title: "Track progress and improve with AI",
    description: "Log each day, review your progress, and use AI guidance to adjust.",
  },
];

const faqs = [
  {
    question: "What is Lagan?",
    answer:
      "Lagan is an AI-powered habit tracker. You build daily routines on a simple timeline, check habits off as you go, and an AI coach reads your patterns to suggest the next small improvement.",
  },
  {
    question: "Is Lagan free?",
    answer:
      "Yes. Lagan is free to use in the web app and the Android app. Advanced AI features are part of Lagan Pro, with 50% off the yearly plan during our launch.",
  },
  {
    question: "Which platforms does Lagan support?",
    answer:
      "Lagan works in any modern browser — on desktop and iPhone — at lagan.health/app. The Android app is available on Google Play, and a native iOS app is coming soon.",
  },
  {
    question: "Is Lagan on Google Play?",
    answer:
      "Yes — download the Lagan Android app from Google Play. You can also use the full web app for free in any modern browser.",
  },
  {
    question: "How does the AI coaching in Lagan work?",
    answer:
      "Lagan's AI looks at your habits, streaks, and completion patterns, then suggests realistic next steps — when to schedule a habit, what to try after a missed day, and which routine to build next.",
  },
];

function GooglePlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 3.5v17l9-8.5-9-8.5Z" fill="#34A853" />
      <path d="m13.5 12 2.8-2.65L6.1 3.75 13.5 12Z" fill="#4285F4" />
      <path d="m13.5 12-7.4 8.25 10.2-5.6L13.5 12Z" fill="#FBBC04" />
      <path d="m16.3 9.35 2.75 1.5c.9.5.9 1.8 0 2.3l-2.75 1.5L13.5 12l2.8-2.65Z" fill="#EA4335" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3 1.8 5.1L19 10l-5.2 1.9L12 17l-1.8-5.1L5 10l5.2-1.9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 9.2 17 19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19V5M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m8 15 3.2-3.2 2.5 2.5L18.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 10.4V9a6 6 0 0 0-12 0v1.4c0 2.2-.8 3.5-1.6 4.5-.5.7 0 1.6.9 1.6h13.4c.9 0 1.4-.9.9-1.6-.8-1-1.6-2.3-1.6-4.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21c3.6 0 6.5-2.6 6.5-6.1 0-2.9-1.6-4.8-4-7.2-.7 2.1-1.7 3.2-3 3.9.4-3-1-5.5-3.5-7.6.2 3.6-2.5 5.6-2.5 9.7C5.5 18 8.4 21 12 21Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 12h15M12 4c2 2.1 3 4.7 3 8s-1 5.9-3 8M12 4c-2 2.1-3 4.7-3 8s1 5.9 3 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ── Feature story visuals (pure divs/SVG, sized for the story rows) ── */

function SuggestionVisual() {
  const suggestions = [
    { label: "Evening stretch · 10 min", accent: "border-habit-meditate/40 text-habit-meditate" },
    { label: "Read before bed · 10 pages", accent: "border-habit-read/40 text-habit-read" },
    { label: "Morning walk · 20 min", accent: "border-habit-walk/40 text-habit-walk" },
  ];
  return (
    <Card surface="low" className="p-5">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-tertiary">
        Suggested for you
      </p>
      <div className="mt-4 space-y-2.5">
        {suggestions.map((s) => (
          <div
            key={s.label}
            className={`flex items-center justify-between rounded-xl border bg-surface px-4 py-3 ${s.accent}`}
          >
            <span className="text-sm font-semibold text-on-surface">{s.label}</span>
            <span className="text-xs font-bold">+ Add</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-medium text-on-surface-variant">
        Based on your goal: “wind down without my phone”
      </p>
    </Card>
  );
}

function TrackingVisual() {
  const rows = [
    { label: "Drink water", meta: "6 of 8 glasses", done: true, accent: "text-habit-water" },
    { label: "Read 10 pages", meta: "Done at 08:32", done: true, accent: "text-habit-read" },
    { label: "Meditate", meta: "Later today · 21:00", done: false, accent: "text-habit-meditate" },
  ];
  return (
    <Card surface="low" className="p-5">
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface px-4 py-3"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-current bg-surface-container-low ${row.accent}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                {row.done ? <path d="M20 6 9 17l-5-5" /> : <circle cx="12" cy="12" r="8" />}
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-bold ${row.done ? "text-on-surface" : "text-on-surface-variant"}`}>
                {row.label}
              </span>
              <span className="block text-xs font-medium text-on-surface-variant/70">{row.meta}</span>
            </span>
            {row.done && (
              <span className="text-xs font-bold text-secondary">Done</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function InsightsVisual() {
  const bars = [
    { day: "M", pct: 60 },
    { day: "T", pct: 80 },
    { day: "W", pct: 45 },
    { day: "T", pct: 90 },
    { day: "F", pct: 70 },
    { day: "S", pct: 100 },
    { day: "S", pct: 75, today: true },
  ];
  return (
    <Card surface="low" className="p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-tertiary">
          This week
        </p>
        <p className="font-display text-2xl font-bold text-on-background">74%</p>
      </div>
      <div className="mt-5 flex items-end gap-2.5">
        {bars.map((bar, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-24 w-full items-end rounded-md bg-surface-container">
              <div
                className={`w-full rounded-md ${bar.today ? "bg-primary" : "bg-secondary/70"}`}
                style={{ height: `${bar.pct}%` }}
              />
            </div>
            <span className={`text-[10px] font-bold ${bar.today ? "text-primary" : "text-on-surface-variant/70"}`}>
              {bar.day}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-medium text-on-surface-variant">
        12-day streak · strongest before lunch
      </p>
    </Card>
  );
}

export default function LandingPage() {
  const appJsonLd = {
    "@context": "https://schema.org",
    "@type": ["MobileApplication", "SoftwareApplication"],
    name: "Lagan",
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Android, Web",
    description: DESCRIPTION,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: SITE_URL,
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  const storyVisuals = [SuggestionVisual, TrackingVisual, InsightsVisual];

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-on-surface">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <ScrollAnimations />
      <LaunchPromoModal />

      <MarketingNav
        links={[
          { label: "Features", href: "#features" },
          { label: "How it works", href: "#how-it-works" },
          { label: "FAQ", href: "#faq" },
        ]}
        actions={
          <>
            <Button href="/login" variant="ghost" size="md">
              Sign in
            </Button>
            <Button
              href={WEB_APP_URL}
              external
              variant="primary"
              size="md"
              className="hidden sm:inline-flex"
            >
              <GlobeIcon />
              Open the app
            </Button>
          </>
        }
      />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative pt-[100px] sm:pt-[120px]">
        <div className="bg-grid-faint pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="bg-ember-glow glow-drift pointer-events-none absolute -top-40 left-[10%] h-[480px] w-[480px] rounded-full" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-24">
          <div>
            <div className="hero-rise" style={{ animationDelay: "0.05s" }}>
              <Pill>AI-powered habit tracking</Pill>
            </div>
            <h1
              aria-label="Lagan — build better habits with AI"
              className="hero-rise mt-6 max-w-3xl font-display text-5xl font-bold leading-[1.02] tracking-tight text-on-background sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "0.15s" }}
            >
              <span aria-hidden="true">
                Lagan — build better habits <span className="text-shimmer">with AI</span>
              </span>
            </h1>
            <p
              className="hero-rise mt-6 max-w-xl text-lg leading-8 text-on-surface-variant"
              style={{ animationDelay: "0.25s" }}
            >
              Lagan is an AI habit tracker that turns your day into a simple timeline of
              habits — with a coach that notices your patterns and makes the next step clear.
            </p>
            <div
              className="hero-rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
              style={{ animationDelay: "0.35s" }}
            >
              <Button href={PLAY_STORE_URL} external className="w-full sm:w-auto">
                <GooglePlayIcon />
                Use Android
              </Button>
              <Button
                href={WEB_APP_URL}
                external
                variant="outline"
                className="w-full sm:w-auto"
              >
                <GlobeIcon />
                Use the web app
              </Button>
              <span className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant px-5 py-3 text-base font-bold text-on-surface-variant sm:w-auto">
                <PhoneIcon />
                iOS — coming soon
              </span>
            </div>
            <p
              className="hero-rise mt-4 text-sm font-medium text-on-surface-variant/70"
              style={{ animationDelay: "0.45s" }}
            >
              Download the Android app on Google Play, or start free in the web app on iPhone and
              desktop. A native iOS app is coming soon.
            </p>
          </div>

          <div className="hero-rise lg:justify-self-end" style={{ animationDelay: "0.3s" }}>
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* ── Feature stories ──────────────────────────────── */}
      <Section id="features" className="landing-section">
        <div className="reveal-up max-w-2xl">
          <Eyebrow>Why Lagan</Eyebrow>
          <SectionHeading className="mt-3">The core tools to keep showing up</SectionHeading>
        </div>

        <div className="mt-14 space-y-16 sm:space-y-20">
          {features.slice(0, 3).map((feature, i) => {
            const Icon = feature.icon;
            const Visual = storyVisuals[i];
            const reversed = i % 2 === 1;
            return (
              <div
                key={feature.title}
                className="stagger grid items-center gap-8 md:grid-cols-2 md:gap-14"
              >
                <div className={reversed ? "md:order-2" : ""}>
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${feature.chip} ${feature.accent}`}>
                    <Icon />
                  </span>
                  <h3 className="mt-5 font-display text-2xl font-bold tracking-tight text-on-background sm:text-3xl">
                    {feature.title}
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-7 text-on-surface-variant">
                    {feature.description}
                  </p>
                </div>
                <div className={reversed ? "md:order-1" : ""}>
                  <Visual />
                </div>
              </div>
            );
          })}
        </div>

        <div className="stagger mt-16 grid gap-4 sm:grid-cols-2">
          {features.slice(3).map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} hover className="p-6">
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${feature.chip} ${feature.accent}`}>
                  <Icon />
                </span>
                <h3 className="mt-4 font-display text-xl font-bold tracking-tight text-on-background">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">{feature.description}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* ── How it works ─────────────────────────────────── */}
      <Section id="how-it-works" className="landing-section">
        <div className="grid gap-10 md:grid-cols-[0.72fr_1fr] md:items-start">
          <div className="reveal-up md:sticky md:top-28">
            <Eyebrow>How it works</Eyebrow>
            <SectionHeading className="mt-3">Start small, then improve with AI</SectionHeading>
          </div>

          <div className="stagger relative">
            <span
              className="pointer-events-none absolute bottom-6 left-[27px] top-6 w-0.5 bg-outline-variant sm:left-[31px]"
              aria-hidden="true"
            />
            {steps.map((item) => (
              <article key={item.step} className="relative flex gap-6 pb-10 last:pb-0 sm:gap-8">
                <span className="font-display relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-outline-variant bg-surface text-lg font-bold text-primary sm:h-16 sm:w-16 sm:text-xl">
                  {item.step}
                </span>
                <span className="pt-1.5 sm:pt-3">
                  <h3 className="font-display text-xl font-bold tracking-tight text-on-background">
                    {item.title}
                  </h3>
                  <p className="mt-2 max-w-lg text-base leading-7 text-on-surface-variant">
                    {item.description}
                  </p>
                </span>
              </article>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <Section id="faq" className="landing-section">
        <div className="reveal-up max-w-2xl">
          <Eyebrow>FAQ</Eyebrow>
          <SectionHeading className="mt-3">Common questions about Lagan</SectionHeading>
        </div>
        <div className="stagger mt-12 grid gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <Card key={faq.question} className="p-6">
              <h3 className="font-display text-lg font-bold tracking-tight text-on-background">
                {faq.question}
              </h3>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{faq.answer}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <Section className="landing-section pt-0 sm:pt-0">
        <Card surface="low" className="relative overflow-hidden px-5 py-12 text-center sm:px-8 md:py-16">
          <div className="bg-ember-glow glow-pulse pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full" aria-hidden="true" />
          <div className="relative">
            <Eyebrow className="text-tertiary">Start today</Eyebrow>
            <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight text-on-background sm:text-5xl">
              Make consistency easier with Lagan
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-on-surface-variant">
              Track daily habits, see progress clearly, and let AI guide your next small improvement.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href={PLAY_STORE_URL} external>
                <GooglePlayIcon />
                Use Android
              </Button>
              <Button href={WEB_APP_URL} external variant="outline">
                <GlobeIcon />
                Use the web app
              </Button>
              <span className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-outline-variant px-5 py-3 text-base font-bold text-on-surface-variant">
                <PhoneIcon />
                iOS — coming soon
              </span>
            </div>
          </div>
        </Card>
      </Section>

      <Footer />
    </main>
  );
}
