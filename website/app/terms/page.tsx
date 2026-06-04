import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms and conditions for using the Lagan habit-tracking app and website.",
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
    <div className="rounded-2xl border border-outline-variant bg-white p-6 space-y-3">
      <h2 className="text-xl font-extrabold text-on-background">{title}</h2>
      <div className="text-sm leading-7 text-on-surface-variant space-y-3">{children}</div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <nav className="border-b border-outline-variant/40 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-on-background">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <Icon name="auto_awesome" />
            </span>
            Lagan
          </Link>
          <Link href="/login" className="text-sm font-bold text-primary">
            Sign in
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="max-w-3xl space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              Legal
            </p>
            <h1 className="text-4xl font-extrabold leading-tight text-on-background sm:text-5xl">
              Terms &amp; Conditions
            </h1>
            <p className="text-lg leading-8 text-on-surface-variant">
              Last updated: 4 June 2026
            </p>
            <p className="text-base leading-8 text-on-surface-variant">
              These Terms govern your use of Lagan. By creating an account, accessing the website,
              or using the mobile app, you agree to these Terms.
            </p>
          </div>

          <Section title="1. Acceptance of terms">
            <p>
              These Terms &amp; Conditions (&quot;Terms&quot;) govern your use of the Lagan mobile
              application, website, account services, AI features, subscriptions, and related
              services (collectively, the &quot;Service&quot;) operated by Lagan Health
              (&quot;Lagan&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
            </p>
            <p>
              If you do not agree to these Terms, do not use the Service. Mandatory consumer rights
              that apply where you live are not limited by these Terms.
            </p>
          </Section>

          <Section title="2. Eligibility and account security">
            <p>
              You must be at least 13 years old, or the minimum digital-consent age in your country,
              to use Lagan. If you are under the age of majority where you live, you may use Lagan
              only with permission from a parent or legal guardian.
            </p>
            <p>
              You are responsible for keeping your account credentials secure and for activity under
              your account. Tell us promptly at{" "}
              <a href="mailto:support@lagan.health" className="text-primary font-semibold hover:underline">
                support@lagan.health
              </a>{" "}
              if you suspect unauthorized access.
            </p>
          </Section>

          <Section title="3. The Service">
            <p>
              Lagan is a habit-tracking and productivity service. Features may include habit
              logging, streaks, XP, badges, leaderboards, sleep and step tracking, reminders, AI
              coaching, AI routine refinement, AI smart reminders, and progress reports.
            </p>
            <p>
              We may add, change, suspend, or discontinue features from time to time. Some features
              require an account, supported device, internet connection, store availability,
              third-party service availability, or Lagan Pro access.
            </p>
          </Section>

          <Section title="4. Health and wellness disclaimer">
            <p>
              Lagan is a productivity and habit-tracking tool. It is not a medical device,
              healthcare provider, emergency service, diagnosis tool, or treatment service. Nothing
              in Lagan is medical, mental-health, nutritional, legal, financial, or professional
              advice.
            </p>
            <p>
              Sleep data, step counts, scores, streaks, reminders, and other metrics may be
              incomplete or inaccurate because they can depend on device sensors, Health Connect,
              Apple HealthKit, wearables, third-party apps, or manual entries. Do not ignore
              professional advice or delay seeking it because of information shown in Lagan.
            </p>
          </Section>

          <Section title="5. AI features">
            <p>
              AI Coach, AI routine refinement, AI smart reminders, validation, and progress reports
              are generated using automated systems. AI outputs can be inaccurate, incomplete,
              delayed, or unsuitable for your circumstances.
            </p>
            <p>
              You are responsible for deciding whether to follow an AI suggestion. Do not rely on AI
              outputs for medical, emergency, legal, financial, or other professional decisions.
            </p>
          </Section>

          <Section title="6. Subscriptions and Lagan Pro">
            <p>
              <strong className="text-on-surface">Free plan.</strong> Lagan offers core habit
              tracking features for free. Free feature availability may change over time.
            </p>
            <p>
              <strong className="text-on-surface">Pro plan.</strong> Lagan Pro is a premium
              subscription that may include AI Coach, AI routine refinement, expanded AI smart
              reminders, progress reports, and future premium features.
            </p>
            <p>
              <strong className="text-on-surface">Free trial.</strong> A new Lagan account may
              receive a free Pro trial. If no paid subscription is started before the trial ends,
              Pro access ends and the account returns to the free plan.
            </p>
            <p>
              <strong className="text-on-surface">Billing.</strong> Paid subscriptions are sold as
              auto-renewable monthly or annual subscriptions through the Apple App Store or Google
              Play Store. The store shows the price, currency, billing period, taxes, and purchase
              terms before you confirm payment.
            </p>
            <p>
              <strong className="text-on-surface">Auto-renewal.</strong> Subscriptions renew
              automatically unless you cancel through the applicable store before the renewal
              deadline. Store rules may require notice or consent before some price changes.
            </p>
            <p>
              <strong className="text-on-surface">Cancellation.</strong> You must manage or cancel
              subscriptions through the store account used to purchase them:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>iOS: App Store, then your profile, then Subscriptions, then Lagan.</li>
              <li>Android: Google Play Store, then Payments &amp; subscriptions, then Subscriptions, then Lagan.</li>
            </ul>
            <p>
              Deleting your Lagan account or uninstalling the app does not automatically cancel an
              active App Store or Google Play subscription. Cancelling stops future renewals, and
              Pro access normally continues until the end of the current paid period.
            </p>
            <p>
              <strong className="text-on-surface">Refunds.</strong> Apple and Google process
              payments and refund requests under their own policies. Lagan does not receive your
              card details and does not issue direct refunds for store purchases unless required by
              law.
            </p>
            <p>
              <strong className="text-on-surface">Family sharing.</strong> Lagan Pro does not
              currently support Apple Family Sharing or Google Play Family Library.
            </p>
          </Section>

          <Section title="7. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for unlawful, harmful, abusive, deceptive, or fraudulent purposes.</li>
              <li>Attempt to access another user&apos;s account, data, or non-public systems.</li>
              <li>Interfere with, disrupt, overload, scrape, crawl, or reverse-engineer the Service.</li>
              <li>Upload or transmit malware, malicious code, or content that violates another person&apos;s rights.</li>
              <li>Harass, impersonate, threaten, or harm other users.</li>
              <li>Use the Service to create medical, emergency, or safety-critical decisions.</li>
              <li>Bypass paywalls, usage limits, AI quotas, security controls, or store purchase systems.</li>
            </ul>
          </Section>

          <Section title="8. Your content and leaderboard profile">
            <p>
              You keep ownership of habit names, notes, feedback, display names, and other content
              you submit. You grant Lagan a limited, worldwide, non-exclusive license to host,
              process, display, and use that content only as needed to provide, secure, support, and
              improve the Service.
            </p>
            <p>
              If you join the leaderboard by setting a display name, your display name, avatar,
              rank, XP, level, streak, and aggregate habit stats may be visible to other users in
              leaderboard and sharing features. You can remove yourself from the leaderboard by
              removing your display name.
            </p>
            <p>
              You are responsible for the content you submit. We may remove content or suspend
              accounts that violate these Terms or applicable law.
            </p>
          </Section>

          <Section title="9. Feedback">
            <p>
              If you send ideas, bug reports, ratings, or other feedback, you allow us to use that
              feedback without restriction or compensation to improve Lagan, while our use of any
              personal data in the feedback remains subject to our Privacy Policy.
            </p>
          </Section>

          <Section title="10. Privacy">
            <p>
              Our{" "}
              <Link href="/privacy" className="text-primary font-semibold hover:underline">
                Privacy Policy
              </Link>{" "}
              explains how we collect, use, share, and protect personal data, including health data,
              AI feature inputs, analytics, crash reporting, subscriptions, and account deletion.
            </p>
          </Section>

          <Section title="11. Third-party services and stores">
            <p>
              Lagan relies on third-party services including Supabase, RevenueCat, Google Gemini,
              PostHog, Sentry, Google Cloud, Apple services, Google Play, and Apple App Store. Your
              use of those services may also be subject to their own terms and policies.
            </p>
            <p>
              Apple and Google are not responsible for providing support for Lagan except as
              required by their store rules. App availability, billing, refunds, subscription
              management, and device permissions may depend on store and operating-system policies.
            </p>
          </Section>

          <Section title="12. Intellectual property">
            <p>
              Lagan and its app, website, software, design, branding, logos, content, and related
              intellectual property are owned by or licensed to Lagan. We grant you a limited,
              revocable, non-transferable, non-exclusive license to use the Service for personal,
              lawful purposes in accordance with these Terms and applicable store rules.
            </p>
          </Section>

          <Section title="13. Account deletion and termination">
            <p>
              You may stop using Lagan at any time and request account deletion from Settings, then
              Privacy &amp; Data, or through our{" "}
              <Link href="/account-deletion" className="text-primary font-semibold hover:underline">
                account deletion page
              </Link>.
            </p>
            <p>
              We may suspend or terminate access if you violate these Terms, create risk for the
              Service or other users, fail to pay for paid features, or if we are required to do so
              by law or store policy. Termination does not cancel an active store subscription; you
              must cancel it through the applicable store.
            </p>
          </Section>

          <Section title="14. Changes to these Terms">
            <p>
              We may update these Terms from time to time. We will update the &quot;Last
              updated&quot; date, and for material changes we may notify you by email, in-app
              message, website notice, or another appropriate method. Your continued use after the
              effective date means you accept the updated Terms.
            </p>
          </Section>

          <Section title="15. Disclaimers">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED &quot;AS IS&quot; AND
              &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
              WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
              NON-INFRINGEMENT, ACCURACY, AVAILABILITY, OR RELIABILITY.
            </p>
            <p>
              We do not guarantee that Lagan will be uninterrupted, error-free, secure, available on
              every device, compatible with every wearable or data source, or that AI outputs,
              health data, subscription data, or reminders will always be accurate or available.
            </p>
          </Section>

          <Section title="16. Limitation of liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, LAGAN WILL NOT BE LIABLE FOR INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOSS OF
              DATA, PROFITS, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING FROM OR RELATED TO YOUR USE
              OF THE SERVICE.
            </p>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM RELATED TO
              THE SERVICE WILL NOT EXCEED THE GREATER OF THE AMOUNT YOU PAID TO LAGAN FOR THE
              SERVICE IN THE 12 MONTHS BEFORE THE CLAIM OR USD 50.
            </p>
          </Section>

          <Section title="17. Governing law and disputes">
            <p>
              These Terms are governed by the laws that apply to Lagan Health in its principal
              place of business, excluding conflict-of-law rules, unless mandatory consumer laws
              where you live require otherwise. Where permitted by law, disputes must be brought in
              the courts with jurisdiction over Lagan Health&apos;s principal place of business.
            </p>
          </Section>

          <Section title="18. Contact us">
            <p>
              Questions about these Terms can be sent to{" "}
              <a href="mailto:support@lagan.health" className="text-primary font-semibold hover:underline">
                support@lagan.health
              </a>.
            </p>
          </Section>
        </div>
      </section>
    </main>
  );
}
