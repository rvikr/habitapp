import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Footer from "@/components/ui/footer";
import MarketingNav from "@/components/ui/marketing-nav";
import { Eyebrow } from "@/components/ui/section";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd, ORGANIZATION_ID } from "@/lib/seo";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, PLAY_STORE_URL, SITE_URL, WEB_APP_URL } from "@/lib/site";

const DESCRIPTION =
  "Lagan is an AI habit tracker for the web and Android, built around one idea: consistency comes from small, realistic steps — and an AI coach that notices your patterns.";

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Lagan",
    description: DESCRIPTION,
    url: "/about",
    images: ["/og-image.png"],
  },
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card surface="low" className="p-6 sm:p-8">
      <h2 className="font-display text-xl font-bold tracking-tight text-on-background sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-base leading-7 text-on-surface-variant">{children}</div>
    </Card>
  );
}

export default function AboutPage() {
  const aboutJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "About Lagan",
    url: `${SITE_URL}/about`,
    description: DESCRIPTION,
    mainEntity: { "@id": ORGANIZATION_ID },
  };

  return (
    <main className="min-h-screen bg-background text-on-surface">
      <JsonLd data={aboutJsonLd} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />

      <MarketingNav
        actions={
          <Button href={WEB_APP_URL} external variant="primary" size="md">
            Open app
          </Button>
        }
      />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-[110px] sm:px-8">
        <header className="max-w-3xl space-y-4">
          <Eyebrow>About</Eyebrow>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-on-background sm:text-5xl">
            About Lagan
          </h1>
          <p className="text-base leading-8 text-on-surface-variant">
            Lagan is an AI habit tracker available on the web at lagan.health and on Android via
            Google Play, with a native iOS app coming soon. It helps people build daily routines
            with habit tracking, schedule-aware streaks, XP, and an AI coach that suggests the next
            small improvement.
          </p>
        </header>

        <div className="mt-12 max-w-3xl space-y-6">
          <Block title="Why we built Lagan">
            <p>
              Most habit apps make starting easy and continuing hard. A checklist tells you what you
              didn&apos;t do; it rarely tells you what to do next. Lagan exists to close that gap —
              to make consistency feel achievable by keeping habits small, schedules honest, and
              feedback calm.
            </p>
            <p>
              That philosophy shows up in the details: streaks only count the days a habit is
              actually scheduled, missing a day never erases your history, and reminders are
              designed as gentle nudges rather than noise.
            </p>
          </Block>

          <Block title="How the AI coaching works">
            <p>
              Lagan&apos;s coach reads your real completion patterns — which habits stick, when you
              tend to follow through, where a routine keeps slipping — and turns them into specific,
              realistic suggestions: a better time for a habit, a smaller version to restart with
              after a miss, or the next habit worth adding.
            </p>
            <p>
              The AI works from your tracking data, and suggestions are always yours to accept or
              ignore. What data is processed and how is documented in the{" "}
              <Link href="/privacy" className="font-semibold text-on-background underline-offset-4 hover:underline">
                privacy policy
              </Link>
              .
            </p>
          </Block>

          <Block title="Where Lagan runs">
            <p>
              The full web app is free to use in any modern browser — desktop or iPhone — at
              lagan.health/app. The Android app is on Google Play, and a native iOS app is in
              development. Your habits sync across devices with one account.
            </p>
          </Block>

          <Block title="Your data">
            <p>
              Your habit data belongs to you. Lagan stores it securely to power syncing and
              coaching, never sells it, and lets you{" "}
              <Link href="/account-deletion" className="font-semibold text-on-background underline-offset-4 hover:underline">
                delete your account and data
              </Link>{" "}
              at any time.
            </p>
          </Block>

          <Block title="Get in touch">
            <p>
              Questions or feedback? Email{" "}
              <a href="mailto:hello@lagan.health" className="font-semibold text-on-background underline-offset-4 hover:underline">
                hello@lagan.health
              </a>{" "}
              or find us on Instagram at{" "}
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-on-background underline-offset-4 hover:underline"
              >
                {INSTAGRAM_HANDLE}
              </a>
              . Common questions are answered on the{" "}
              <Link href="/faq" className="font-semibold text-on-background underline-offset-4 hover:underline">
                FAQ page
              </Link>
              .
            </p>
          </Block>

          <Card surface="low" className="px-5 py-10 text-center sm:px-8">
            <Eyebrow className="text-tertiary">Start today</Eyebrow>
            <h2 className="mx-auto mt-3 max-w-2xl font-display text-2xl font-bold tracking-tight text-on-background sm:text-3xl">
              Build your first habit with Lagan
            </h2>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button href={WEB_APP_URL} external>
                Use the web app
              </Button>
              <Button href={PLAY_STORE_URL} external variant="outline">
                Get it on Google Play
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Footer />
    </main>
  );
}
