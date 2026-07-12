import Link from "next/link";
import type { Metadata } from "next";
import { LegalSection, LegalShell } from "@/components/ui/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Lagan collects, uses, shares, and protects personal data.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  "1. Data we collect",
  "2. Health data commitments",
  "3. How we use data",
  "4. AI processing",
  "5. Cookies and local storage",
  "6. Sharing and public features",
  "7. Third-party services",
  "8. Data retention and deletion",
  "9. Your choices and rights",
  "10. International transfers",
  "11. Children",
  "12. Security",
  "13. Changes to this policy",
  "14. Contact",
];

function Service({ name, purpose }: { name: string; purpose: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/60 bg-surface-container px-4 py-3">
      <p className="font-semibold text-on-surface">{name}</p>
      <p className="text-on-surface-variant">{purpose}</p>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="Last updated: 12 July 2026"
      toc={SECTIONS}
      intro={
        <p>
          Lagan (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides a habit
          tracking app and website. This policy explains what personal data we collect, why
          we use it, when we share it, and the choices you have.
        </p>
      }
    >
      <LegalSection title="1. Data we collect">
        <p>
          <strong className="text-on-surface">Account data.</strong> When you create an
          account, we collect your email address, authentication identifiers, and any profile
          details you choose to add, such as display name and avatar settings.
        </p>
        <p>
          <strong className="text-on-surface">Habit and progress data.</strong> We store the
          habits you create, goals, reminder settings, completion logs, streaks, XP, badges,
          sleep entries, and related progress statistics.
        </p>
        <p>
          <strong className="text-on-surface">Health and sensor data.</strong> If you grant
          permission, Lagan reads step-count and sleep data from Android Health Connect, sleep
          data from Apple HealthKit, and step data from your device pedometer or motion sensor.
          You can also enter sleep and habit data manually.
        </p>
        <p>
          <strong className="text-on-surface">AI feature inputs.</strong> When you use AI
          Coach, AI routine refinement, AI smart reminders, validation, or weekly reports, we
          process relevant habit names, progress, completion history, reminder context,
          onboarding answers, and similar app data needed to generate the response.
        </p>
        <p>
          <strong className="text-on-surface">Subscription data.</strong> If you subscribe to
          Lagan Pro, we receive subscription status, entitlement, product ID, billing period,
          platform, and store identifiers from RevenueCat. We do not receive or store your
          payment card details.
        </p>
        <p>
          <strong className="text-on-surface">Device, diagnostics, and support data.</strong>
          We may process app version, platform, operating system, device model, crash reports,
          error logs, product analytics events, feedback messages, support requests, and
          approximate technical identifiers needed to operate and secure the service.
        </p>
      </LegalSection>

      <LegalSection title="2. Health data commitments">
        <p>
          Lagan uses Health Connect, HealthKit, pedometer, and motion data only to provide the
          health and fitness features you choose, such as step habits, sleep tracking, sleep
          scores, habit progress, and reminders.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>We request only the health data types needed for the feature you enable.</li>
          <li>You can deny or revoke health permissions in your device settings.</li>
          <li>Manual habit and sleep logging remains available if you do not grant access.</li>
          <li>
            We do not sell health data, use it for advertising, transfer it to data brokers,
            use it for creditworthiness, or use it for unrelated secondary purposes.
          </li>
          <li>
            Health data may be stored in your Lagan account when needed to sync your progress
            across devices and display it inside the app.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How we use data">
        <p>We use personal data to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide habit tracking, streaks, XP, badges, leaderboards, sleep tracking, and data export.</li>
          <li>Generate AI coaching, routine suggestions, smart reminders, and progress reports.</li>
          <li>Send reminders and push notifications you configure or allow.</li>
          <li>Verify Lagan Pro trials, subscriptions, restore purchases, and entitlements.</li>
          <li>Respond to support, feedback, security, and account deletion requests.</li>
          <li>Measure product reliability and improve features using limited analytics and crash data.</li>
          <li>Prevent abuse, protect accounts, comply with law, and enforce our Terms.</li>
        </ul>
        <p>We do not sell your personal data.</p>
      </LegalSection>

      <LegalSection title="4. AI processing">
        <p>
          Lagan uses Google Gemini through server-side Supabase Edge Functions for AI-powered
          habit coaching, routine refinement, smart reminders, habit validation, and weekly
          reports. These features require you to attest that you are 18 or older. We store the
          attestation time and disclosure version, but do not store your birth date.
        </p>
        <p>
          We send only the data reasonably needed for the specific AI feature through our paid
          Gemini service. We do not send passwords, payment card data, or raw store payment
          details to the AI model. AI telemetry contains structured outcomes and performance
          data, not prompts, responses, habit names, or health samples.
        </p>
        <p>
          AI outputs may be inaccurate or incomplete. Lagan validates and limits many AI
          responses before showing them, but AI features are not medical, legal, financial, or
          professional advice.
        </p>
        <p>
          You can revoke AI access at any time from Settings, then Privacy &amp; Data. Revocation
          immediately stops new Gemini processing for your account and returns affected features
          to deterministic fallbacks.
        </p>
      </LegalSection>

      <LegalSection title="5. Cookies and local storage">
        <p>
          On the website, we use Supabase authentication cookies to keep you signed in and a
          timezone cookie named{" "}
          <code className="rounded bg-surface-container-highest px-1.5 py-0.5 text-xs text-tertiary">
            lagan_tz
          </code>{" "}
          to show dates in your local timezone. In the mobile app, we use local storage and
          secure storage for session state, opt-out preferences, tracking preferences, and
          similar app settings.
        </p>
      </LegalSection>

      <LegalSection title="6. Sharing and public features">
        <p>
          We share data with service providers only to operate Lagan, process subscriptions,
          deliver notifications, provide AI features, monitor reliability, support users, and
          comply with legal obligations.
        </p>
        <p>
          If you opt in to the leaderboard by setting a display name, your display name, avatar,
          rank, XP, level, streak, and aggregate habit stats may be visible to other users in
          leaderboard and sharing features. You can opt out by removing your display name from
          the leaderboard.
        </p>
      </LegalSection>

      <LegalSection title="7. Third-party services">
        <div className="space-y-2">
          <Service
            name="Supabase"
            purpose="Authentication, database storage, serverless functions, and website auth cookies."
          />
          <Service
            name="RevenueCat"
            purpose="Subscription management, purchase restoration, and App Store / Google Play entitlement verification."
          />
          <Service
            name="Google Gemini"
            purpose="AI coaching, routine refinement, smart reminders, habit validation, and progress reports."
          />
          <Service
            name="PostHog"
            purpose="Product analytics events. We do not intentionally send habit names, notes, email addresses, or health samples in analytics events. You can opt out in Settings."
          />
          <Service
            name="Sentry"
            purpose="Crash reporting and error monitoring. You can opt out of crash reporting in Settings."
          />
          <Service
            name="Google Cloud / Firebase Cloud Messaging"
            purpose="Android push notification delivery and related cloud infrastructure."
          />
          <Service name="Apple APNs" purpose="iOS push notification delivery." />
          <Service
            name="Apple App Store and Google Play"
            purpose="In-app purchase billing, subscription renewals, refunds, and store account management."
          />
          <Service
            name="Google Sign-In"
            purpose="Optional account sign-in using your Google identity."
          />
        </div>
      </LegalSection>

      <LegalSection title="8. Data retention and deletion">
        <p>
          We keep account and app data while your account is active or as needed to provide the
          service. When your account deletion request completes, we delete your authentication
          account, profile, habits, completions, sleep entries, and feedback linked to your
          account.
        </p>
        <p>
          We may retain limited operational records, security logs, subscription records,
          completed deletion audit records, and legal or tax records where necessary for
          security, abuse prevention, compliance, dispute handling, or store-policy audit
          obligations. These retained records are not used to restore your deleted account.
        </p>
      </LegalSection>

      <LegalSection title="9. Your choices and rights">
        <p>Depending on your location, you may have rights to access, correct, export, object to, or delete personal data. You can:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-on-surface">Export your data</strong> in the mobile app
            from Settings, then Privacy &amp; Data, then View my data export.
          </li>
          <li>
            <strong className="text-on-surface">Delete your account</strong> from Settings,
            then Privacy &amp; Data, then Request account deletion, or visit our{" "}
            <Link href="/account-deletion" className="text-primary font-semibold hover:underline">
              account deletion page
            </Link>.
          </li>
          <li>
            <strong className="text-on-surface">Opt out of analytics and crash reporting</strong>{" "}
            from Settings, then Privacy &amp; Data.
          </li>
          <li>
            <strong className="text-on-surface">Control health permissions</strong> in Android
            Health Connect, Apple Health, or your device settings.
          </li>
          <li>
            <strong className="text-on-surface">Control notifications</strong> in Lagan
            reminder settings and your device notification settings.
          </li>
          <li>
            <strong className="text-on-surface">Control AI processing</strong> by confirming
            or revoking AI access from Settings, then Privacy &amp; Data.
          </li>
          <li>
            <strong className="text-on-surface">Contact us</strong> at{" "}
            <a href="mailto:privacy@lagan.health" className="text-primary font-semibold hover:underline">
              privacy@lagan.health
            </a>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="10. International transfers">
        <p>
          Lagan and its service providers may process data in countries other than where you
          live. Where required, we rely on appropriate legal safeguards and service-provider
          terms for these transfers.
        </p>
      </LegalSection>

      <LegalSection title="11. Children">
        <p>
          Lagan is not directed to children under 13 or the minimum digital-consent age in your
          jurisdiction. We do not knowingly collect personal data from children. If you believe a
          child has provided data to Lagan, contact us and we will take appropriate steps to
          delete it.
        </p>
      </LegalSection>

      <LegalSection title="12. Security">
        <p>
          We use technical and organizational safeguards designed to protect personal data,
          including encrypted transport, access controls, row-level database protections, and
          monitoring. No system is completely secure, so you should use a strong password and
          protect access to your email and device.
        </p>
      </LegalSection>

      <LegalSection title="13. Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we will update the
          &quot;Last updated&quot; date. For material changes, we may also provide notice by
          email, in-app message, website notice, or another appropriate method.
        </p>
      </LegalSection>

      <LegalSection title="14. Contact">
        <p>
          For privacy questions or requests, email{" "}
          <a href="mailto:privacy@lagan.health" className="text-primary font-semibold hover:underline">
            privacy@lagan.health
          </a>{" "}
          or contact support at{" "}
          <a href="mailto:support@lagan.health" className="text-primary font-semibold hover:underline">
            support@lagan.health
          </a>.
        </p>
        <p className="font-medium text-on-surface">Lagan Health</p>
      </LegalSection>
    </LegalShell>
  );
}
