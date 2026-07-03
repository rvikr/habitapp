import type { Metadata } from "next";
import Link from "next/link";

const SITE_URL = "https://lagan.health";
const WEB_APP_URL = "/app";
const BRAND_DESCRIPTION =
  "Lagan Health is the home of Lagan AI Habit Tracker at lagan.health. Track daily habits, build routines, and get AI-powered guidance on web, iOS, and Android.";

export const metadata: Metadata = {
  title: "Lagan Health - Lagan AI Habit Tracker",
  description: BRAND_DESCRIPTION,
  alternates: { canonical: "/" },
  keywords: [
    "Lagan",
    "Lagan Health",
    "Lagan AI Habit Tracker",
    "lagan.health",
    "AI habit tracker",
    "AI habit coach",
    "daily routines",
    "habit tracking app",
  ],
  openGraph: {
    title: "Lagan Health - Lagan AI Habit Tracker",
    description: BRAND_DESCRIPTION,
    url: "/",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lagan Health - Lagan AI Habit Tracker",
    description: BRAND_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

const features = [
  {
    title: "AI habit suggestions",
    description: "Get practical habit ideas based on the routines you want to build.",
    icon: SparkIcon,
    accent: "bg-[#DDF7EC] text-[#0F7A52]",
  },
  {
    title: "Daily habit tracking",
    description: "Check off habits quickly and see what still needs attention today.",
    icon: CheckIcon,
    accent: "bg-[#E8F1FF] text-[#1D5FBF]",
  },
  {
    title: "Progress insights",
    description: "Understand streaks, completion patterns, and where consistency is growing.",
    icon: ChartIcon,
    accent: "bg-[#F5EAFE] text-[#7646A8]",
  },
  {
    title: "Simple reminders",
    description: "Set calm nudges that help you remember without adding noise.",
    icon: BellIcon,
    accent: "bg-[#FFF2D7] text-[#B56B00]",
  },
  {
    title: "Motivation to stay consistent",
    description: "Use small wins, streaks, and AI guidance to keep going after busy days.",
    icon: FlameIcon,
    accent: "bg-[#FFE6D8] text-[#C24A13]",
  },
];

const steps = [
  {
    step: "01",
    title: "Open Lagan Health",
    description: "Start from lagan.health and open the Lagan web app in less than a minute.",
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

function LogoMark() {
  return (
    <span className="grid h-9 w-9 grid-cols-2 gap-1 rounded-lg bg-[#16161C] p-1 shadow-sm" aria-hidden="true">
      <span className="rounded-[3px] bg-[#F26B1F]" />
      <span className="rounded-[3px] bg-[#37B889]" />
      <span className="rounded-[3px] bg-[#5CA8FF]" />
      <span className="rounded-[3px] bg-[#FFC56B]" />
    </span>
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

function AppButton({ className = "" }: { className?: string }) {
  return (
    <Link
      href={WEB_APP_URL}
      className={`inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#F26B1F] px-5 py-3 text-base font-bold text-white shadow-[0_12px_28px_rgba(242,107,31,0.28)] transition hover:bg-[#D95C18] focus:outline-none focus:ring-4 focus:ring-[#F26B1F]/25 ${className}`}
    >
      <GlobeIcon />
      Open Lagan web app
    </Link>
  );
}

function WebAppButton({
  children,
  icon,
  className = "",
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={WEB_APP_URL}
      className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#D8E0D8] bg-white px-4 py-3 text-sm font-bold text-[#17201B] shadow-[0_8px_22px_rgba(28,40,34,0.06)] transition hover:border-[#BFCFC4] hover:bg-[#FBFCFA] focus:outline-none focus:ring-4 focus:ring-[#1D5FBF]/15 ${className}`}
    >
      {icon}
      {children}
    </Link>
  );
}

function PhoneMockup() {
  const habits = [
    { label: "Morning walk", meta: "20 min", done: true },
    { label: "Read", meta: "10 pages", done: true },
    { label: "Drink water", meta: "2.5 L", done: true },
    { label: "Meditation", meta: "8 min", done: false },
  ];

  return (
    <div className="mx-auto w-full max-w-[290px] rounded-[34px] border border-[#D8E0D8] bg-[#111318] p-3 shadow-[0_24px_60px_rgba(31,42,35,0.22)] lg:max-w-[300px]">
      <div className="overflow-hidden rounded-[25px] bg-[#F8FAF7]">
        <div className="flex h-10 items-center justify-between bg-white px-5 text-[11px] font-bold text-[#17201B]">
          <span>9:41</span>
          <span className="h-2 w-12 rounded-full bg-[#17201B]" />
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F7A52]">Today</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-[#17201B]">3 of 4 habits done</h2>
          </div>

          <div className="rounded-lg border border-[#DDE8DE] bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#17201B]">Daily progress</p>
                <p className="mt-1 text-xs text-[#617064]">Keep your streak moving</p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-full bg-[#E8F7F1] text-sm font-bold text-[#0F7A52]">
                75%
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {habits.map((habit) => (
              <div key={habit.label} className="flex items-center gap-3 rounded-lg border border-[#E2EAE2] bg-white p-3">
                <span className={`grid h-7 w-7 place-items-center rounded-full ${habit.done ? "bg-[#0F7A52]" : "bg-[#EDF2ED]"} text-white`}>
                  {habit.done ? <CheckIcon /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#17201B]">{habit.label}</span>
                  <span className="block text-xs text-[#617064]">{habit.meta}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-[#EAF3FF] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1D5FBF]">AI guide</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#17201B]">
              You are strongest before lunch. Move meditation earlier tomorrow.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["MobileApplication", "SoftwareApplication"],
    name: "Lagan AI Habit Tracker",
    alternateName: ["Lagan", "Lagan Health", "lagan.health"],
    applicationCategory: "LifestyleApplication",
    applicationSubCategory: "Habit tracker",
    operatingSystem: "Web, iOS, Android",
    description: BRAND_DESCRIPTION,
    url: SITE_URL,
    sameAs: [],
    publisher: {
      "@type": "Organization",
      name: "Lagan Health",
      url: SITE_URL,
    },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-[#F7F5F0] text-[#17201B]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3 text-[#17201B] no-underline" aria-label="Lagan home">
          <LogoMark />
          <span className="text-lg font-extrabold tracking-tight">Lagan</span>
        </Link>
        <div className="hidden items-center gap-3 sm:flex">
          <Link href="/about" className="text-sm font-bold text-[#536158] transition hover:text-[#17201B]">
            About
          </Link>
          <WebAppButton icon={<GlobeIcon />} className="min-h-12">
            Continue on website
          </WebAppButton>
          <AppButton />
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-7 px-5 pb-8 pt-4 sm:px-8 md:grid-cols-[1fr_0.82fr] md:gap-12 md:pb-7 md:pt-6">
        <div>
          <p className="inline-flex rounded-full border border-[#CFE0D7] bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#0F7A52]">
            Lagan AI Habit Tracker
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-extrabold leading-[0.98] tracking-tight text-[#17201B] sm:text-6xl lg:text-7xl">
            Build better habits with Lagan Health
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[#536158]">
            Lagan AI Habit Tracker at lagan.health helps you track habits, stay consistent, and get AI-powered guidance that makes your next step clear.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <AppButton className="w-full sm:w-auto" />
            <WebAppButton icon={<PhoneIcon />} className="w-full sm:w-auto">
              Use on iOS
            </WebAppButton>
            <WebAppButton icon={<GlobeIcon />} className="w-full sm:w-auto">
              Continue on website
            </WebAppButton>
          </div>
          <p className="mt-3 text-center text-sm font-medium text-[#66736B] sm:text-left">
            Start at lagan.health today. iPhone, Android, and desktop users can continue in the web app while public store listings are prepared.
          </p>
        </div>

        <div className="relative max-h-[130px] overflow-hidden md:max-h-none md:justify-self-end">
          <PhoneMockup />
        </div>
      </section>

      <section className="border-y border-[#E1DED5] bg-white/72 px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#1D5FBF]">Why Lagan</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#17201B] sm:text-4xl">
              The Lagan Health tools to keep showing up
            </h2>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="rounded-lg border border-[#E2E5DC] bg-white p-5 shadow-[0_8px_26px_rgba(28,40,34,0.06)]">
                  <span className={`grid h-11 w-11 place-items-center rounded-lg ${feature.accent}`}>
                    <Icon />
                  </span>
                  <h3 className="mt-4 text-lg font-extrabold tracking-tight text-[#17201B]">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5D6A62]">{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 md:grid-cols-[0.72fr_1fr] md:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#0F7A52]">How it works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[#17201B] sm:text-4xl">
                Start small, then improve with AI
              </h2>
            </div>

            <div className="grid gap-4">
              {steps.map((item) => (
                <article key={item.step} className="grid gap-4 rounded-lg border border-[#E0DED6] bg-white p-5 shadow-[0_8px_26px_rgba(28,40,34,0.05)] sm:grid-cols-[72px_1fr] sm:items-start">
                  <span className="text-3xl font-extrabold tracking-tight text-[#B5C8BC]">{item.step}</span>
                  <span>
                    <h3 className="text-xl font-extrabold tracking-tight text-[#17201B]">{item.title}</h3>
                    <p className="mt-2 text-base leading-7 text-[#5D6A62]">{item.description}</p>
                  </span>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-12 sm:px-8 md:pb-20">
        <div className="mx-auto max-w-6xl rounded-lg bg-[#17201B] px-5 py-10 text-center text-white sm:px-8 md:py-14">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#9FE6C4]">Download today</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            Make consistency easier with Lagan
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#DCE8DF]">
            Track daily habits, see progress clearly, and let AI guide your next small improvement.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <AppButton />
            <WebAppButton icon={<PhoneIcon />} className="border-white/15 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 focus:ring-white/20">
              Use on iOS
            </WebAppButton>
            <WebAppButton icon={<GlobeIcon />} className="border-white/15 bg-white/10 text-white hover:border-white/30 hover:bg-white/15 focus:ring-white/20">
              Continue on website
            </WebAppButton>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E1DED5] px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-[#66736B] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <LogoMark />
            <span className="font-bold text-[#17201B]">Lagan</span>
          </div>
          <nav className="flex flex-wrap gap-5" aria-label="Footer">
            <Link className="hover:text-[#17201B]" href="/about">
              About
            </Link>
            <Link className="hover:text-[#17201B]" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-[#17201B]" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-[#17201B]" href="/account-deletion">
              Account deletion
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
