import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Lagan collects, uses, and protects your personal data.",
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-white p-6 space-y-3">
      <h2 className="text-xl font-extrabold text-on-background">{title}</h2>
      <div className="text-sm leading-7 text-on-surface-variant space-y-3">{children}</div>
    </div>
  );
}

export default function PrivacyPage() {
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
              Privacy Policy
            </h1>
            <p className="text-lg leading-8 text-on-surface-variant">
              Last updated: 28 May 2026
            </p>
            <p className="text-base leading-8 text-on-surface-variant">
              Lagan (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your personal information. This policy explains what data we collect, why we collect it, and your rights over it.
            </p>
          </div>

          <Section title="Data we collect">
            <p><strong className="text-on-surface">Account data.</strong> When you sign up we collect your email address and, optionally, a display name and profile picture.</p>
            <p><strong className="text-on-surface">Habit and health data.</strong> The habits you create, your daily completion logs, streak counts, and any sleep entries you record are stored and associated with your account.</p>
            <p><strong className="text-on-surface">Device and usage data.</strong> We collect anonymised analytics events (screens viewed, features used) and crash reports to improve the product. These are collected only with your consent and can be opted out of in Settings → Privacy & Data.</p>
            <p><strong className="text-on-surface">Health Connect (Android).</strong> If you grant permission, we read step-count and sleep data from Android Health Connect. This data is processed on-device and synced to your account only so you can view it inside Lagan. We do not sell or share it with advertisers.</p>
            <p><strong className="text-on-surface">Apple HealthKit (iOS).</strong> If you grant permission, we read sleep data from Apple HealthKit on iOS. HealthKit data stays on your device and within your Lagan account; we do not share it with third parties, use it for advertising, or derive secondary inferences from it.</p>
            <p><strong className="text-on-surface">Subscription and purchase data.</strong> If you subscribe to Lagan Pro, we receive confirmation of your subscription status, entitlement, product ID, billing period, and store identifier (App Store or Google Play) from RevenueCat, our subscription management provider. We store this information solely to verify and manage your Pro access. We do not receive or store your payment card details — all payment processing is handled by Apple or Google.</p>
          </Section>

          <Section title="How we use your data">
            <p>We use your data to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide and personalise the Lagan service (habit tracking, streaks, leaderboard, AI coach).</li>
              <li>Send you push notifications and reminders you configure in the app.</li>
              <li>Improve product quality via aggregated, anonymised usage analytics and crash reporting.</li>
              <li>Respond to your support requests.</li>
              <li>Comply with legal obligations.</li>
            </ul>
            <p>We do not sell your personal data to third parties.</p>
          </Section>

          <Section title="Third-party services">
            <div className="space-y-2">
              {[
                { name: "Supabase", purpose: "Authentication and database storage. Data is hosted in the EU (Frankfurt)." },
                { name: "RevenueCat", purpose: "Subscription management and in-app purchase verification. RevenueCat processes subscription events from the Apple App Store and Google Play Store on our behalf and provides us with your subscription status and entitlement data." },
                { name: "PostHog", purpose: "Product analytics (anonymised events). You can opt out in Settings → Privacy & Data." },
                { name: "Sentry", purpose: "Crash reporting and error monitoring. Reports may include device info and anonymised stack traces." },
                { name: "Google Cloud (Firebase / GCM)", purpose: "Push notification delivery on Android." },
                { name: "Apple APNs", purpose: "Push notification delivery on iOS." },
              ].map((s) => (
                <div key={s.name} className="rounded-xl bg-background px-4 py-3">
                  <p className="font-semibold text-on-surface">{s.name}</p>
                  <p className="text-on-surface-variant">{s.purpose}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Data retention">
            <p>We retain your account data for as long as your account is active. When you request account deletion, your profile, habits, completions, sleep entries, and authentication record are permanently removed. Some operational logs may be retained for up to 90 days for security and abuse-prevention purposes.</p>
          </Section>

          <Section title="Your rights">
            <p>Depending on your location you may have the right to access, correct, export, or delete your personal data. You can:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-on-surface">Export your data</strong> — Settings → Privacy & Data → View my data export.</li>
              <li><strong className="text-on-surface">Delete your account</strong> — Settings → Privacy & Data → Request account deletion, or visit our <Link href="/account-deletion" className="text-primary font-semibold hover:underline">account deletion page</Link>.</li>
              <li><strong className="text-on-surface">Opt out of analytics</strong> — Settings → Privacy & Data → Analytics opt-out.</li>
              <li><strong className="text-on-surface">Contact us</strong> — email <a href="mailto:privacy@lagan.health" className="text-primary font-semibold hover:underline">privacy@lagan.health</a> for any other request.</li>
            </ul>
          </Section>

          <Section title="Children">
            <p>Lagan is not directed at children under 13 (or the applicable age in your jurisdiction). We do not knowingly collect personal data from children. If you believe a child has provided us data, please contact us and we will delete it.</p>
          </Section>

          <Section title="Changes to this policy">
            <p>We may update this policy from time to time. When we do, we will update the &quot;Last updated&quot; date at the top of this page. Continued use of Lagan after changes take effect constitutes your acceptance of the updated policy.</p>
          </Section>

          <Section title="Contact">
            <p>For privacy questions or requests, email us at <a href="mailto:privacy@lagan.health" className="text-primary font-semibold hover:underline">privacy@lagan.health</a> or write to us at:</p>
            <p className="font-medium text-on-surface">
              Lagan Health<br />
              support@lagan.health
            </p>
          </Section>
        </div>
      </section>
    </main>
  );
}
