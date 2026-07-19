import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Footer from "@/components/ui/footer";
import MarketingNav from "@/components/ui/marketing-nav";
import { Eyebrow } from "@/components/ui/section";
import { JsonLd } from "@/components/seo/json-ld";
import { ALL_FAQS } from "@/lib/faqs";
import { breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo";
import { PLAY_STORE_URL, WEB_APP_URL } from "@/lib/site";

const DESCRIPTION =
  "Answers to common questions about Lagan — the AI habit tracker for web and Android. Platforms, pricing, streaks, AI coaching, reminders, and privacy.";

export const metadata: Metadata = {
  title: "FAQ",
  description: DESCRIPTION,
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Lagan FAQ",
    description: DESCRIPTION,
    url: "/faq",
    images: ["/og-image.png"],
  },
};

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-background text-on-surface">
      <JsonLd data={faqPageJsonLd(ALL_FAQS)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "FAQ", path: "/faq" },
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
          <Eyebrow>FAQ</Eyebrow>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-on-background sm:text-5xl">
            Frequently asked questions
          </h1>
          <p className="text-base leading-8 text-on-surface-variant">
            Everything about how Lagan works — platforms, pricing, streaks, AI coaching, and your
            data. Can&apos;t find an answer? Email{" "}
            <a href="mailto:support@lagan.health" className="font-semibold text-on-background underline-offset-4 hover:underline">
              support@lagan.health
            </a>
            .
          </p>
        </header>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {ALL_FAQS.map((faq) => (
            <Card key={faq.question} className="p-6">
              <h2 className="font-display text-lg font-bold tracking-tight text-on-background">
                {faq.question}
              </h2>
              <p className="mt-2 text-sm leading-6 text-on-surface-variant">{faq.answer}</p>
            </Card>
          ))}
        </div>

        <Card surface="low" className="mt-12 px-5 py-10 text-center sm:px-8">
          <Eyebrow className="text-tertiary">Try it yourself</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-2xl font-bold tracking-tight text-on-background sm:text-3xl">
            The fastest answer is five minutes in the app
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

      <Footer />
    </main>
  );
}
