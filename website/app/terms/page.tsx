import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions — Lagan",
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
              Terms & Conditions
            </h1>
            <p className="text-lg leading-8 text-on-surface-variant">
              Last updated: 17 May 2026
            </p>
            <p className="text-base leading-8 text-on-surface-variant">
              Please read these terms carefully before using Lagan. By creating an account or using the app you agree to be bound by them.
            </p>
          </div>

          <Section title="1. Acceptance of terms">
            <p>These Terms & Conditions (&quot;Terms&quot;) govern your use of the Lagan mobile application and website (collectively, the &quot;Service&quot;) operated by Lagan Health (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).</p>
            <p>By accessing or using the Service, you confirm that you are at least 13 years old (or the minimum age required in your country) and that you accept these Terms. If you do not agree, do not use the Service.</p>
          </Section>

          <Section title="2. The Service">
            <p>Lagan is a habit-tracking application that helps you build and maintain daily routines. Features include habit logging, streak tracking, sleep tracking, an AI coaching assistant, a leaderboard, and push-notification reminders.</p>
            <p>We reserve the right to modify, suspend, or discontinue any part of the Service at any time. We will endeavour to give reasonable notice of significant changes.</p>
          </Section>

          <Section title="3. Your account">
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately at <a href="mailto:support@lagan.health" className="text-primary font-semibold hover:underline">support@lagan.health</a> if you suspect unauthorised access.</p>
            <p>You must provide accurate information when creating your account. You may not create an account on behalf of someone else without their consent.</p>
          </Section>

          <Section title="4. Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure.</li>
              <li>Reverse-engineer, decompile, or disassemble the app.</li>
              <li>Use automated scripts or bots to interact with the Service.</li>
              <li>Upload or transmit viruses, malware, or any other harmful code.</li>
              <li>Harass, abuse, or harm other users.</li>
              <li>Impersonate another person or entity.</li>
            </ul>
          </Section>

          <Section title="5. Your content">
            <p>You retain ownership of any content you submit to Lagan (habit names, notes, etc.). By submitting content you grant us a limited, non-exclusive licence to store and display it to you as part of providing the Service.</p>
            <p>You are solely responsible for your content. We may remove content that violates these Terms or applicable law.</p>
          </Section>

          <Section title="6. Health disclaimer">
            <p>Lagan is a productivity and habit-tracking tool, not a medical device or health-care provider. Nothing in the Service constitutes medical advice. Do not use Lagan as a substitute for professional medical or mental-health guidance. Sleep data and step counts displayed in the app are sourced from your device sensors or Android Health Connect and may not be accurate.</p>
          </Section>

          <Section title="7. AI Coach">
            <p>The AI Coach feature uses a large language model to generate motivational and habit-related responses. Its outputs are not guaranteed to be accurate, complete, or suitable for your specific situation. Do not rely on AI Coach responses for medical, legal, financial, or other professional advice.</p>
          </Section>

          <Section title="8. Intellectual property">
            <p>All rights in the Service — including the app, website, design, branding, and content produced by us — are owned by or licensed to Lagan Health. Nothing in these Terms grants you any rights in our intellectual property except the limited right to use the Service as described here.</p>
          </Section>

          <Section title="9. Privacy">
            <p>Our <Link href="/privacy" className="text-primary font-semibold hover:underline">Privacy Policy</Link> explains how we handle your personal data. By using the Service you agree to our data practices as described there.</p>
          </Section>

          <Section title="10. Third-party services">
            <p>The Service relies on third-party providers (Supabase, PostHog, Sentry, Google Cloud, Apple). Your use of the Service is also subject to their respective terms of service. We are not responsible for the actions or policies of these third parties.</p>
          </Section>

          <Section title="11. Disclaimers">
            <p>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.</p>
          </Section>

          <Section title="12. Limitation of liability">
            <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LAGAN HEALTH SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, PROFITS, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
            <p>OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM OR RELATED TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US (IF ANY) IN THE 12 MONTHS PRECEDING THE CLAIM.</p>
          </Section>

          <Section title="13. Termination">
            <p>You may stop using the Service at any time and delete your account via Settings → Privacy & Data or our <Link href="/account-deletion" className="text-primary font-semibold hover:underline">account deletion page</Link>.</p>
            <p>We may suspend or terminate your account if you breach these Terms or if we reasonably believe your use of the Service poses a risk to us, other users, or third parties. Termination does not relieve you of any obligations incurred before termination.</p>
          </Section>

          <Section title="14. Changes to these Terms">
            <p>We may update these Terms from time to time. We will update the &quot;Last updated&quot; date at the top of this page and, for material changes, notify you via email or an in-app message. Continued use of the Service after the effective date of any changes constitutes acceptance of the updated Terms.</p>
          </Section>

          <Section title="15. Governing law">
            <p>These Terms are governed by and construed in accordance with applicable law. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts in the applicable jurisdiction.</p>
          </Section>

          <Section title="16. Contact us">
            <p>If you have questions about these Terms, please contact us at <a href="mailto:support@lagan.health" className="text-primary font-semibold hover:underline">support@lagan.health</a>.</p>
          </Section>
        </div>
      </section>
    </main>
  );
}
