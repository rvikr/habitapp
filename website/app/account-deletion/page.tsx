import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LegalSection, LegalShell } from "@/components/ui/legal-page";
import { WEB_APP_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Account deletion",
  description: "Request deletion of your Lagan account and app data.",
  alternates: { canonical: "/account-deletion" },
};

const configuredDeletionEmail = process.env.NEXT_PUBLIC_ACCOUNT_DELETION_CONTACT_EMAIL?.trim();
const deletionEmail =
  configuredDeletionEmail &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredDeletionEmail) &&
  !/@[^@]*\.example$/i.test(configuredDeletionEmail)
    ? configuredDeletionEmail
    : "privacy@lagan.health";

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

export default function AccountDeletionPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  return <AccountDeletionContent searchParams={searchParams} />;
}

async function AccountDeletionContent({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const deleted = params?.status === "deleted";
  const mailTo = `mailto:${deletionEmail}?subject=${encodeURIComponent("Delete my Lagan account")}&body=${encodeURIComponent("Please delete the Lagan account associated with this email address.")}`;

  return (
    <LegalShell
      eyebrow="Account and data deletion"
      title="Delete your Lagan account"
      banner={
        deleted ? (
          <div className="mb-8 rounded-2xl border border-secondary/30 bg-secondary-container/40 px-5 py-4 text-sm font-medium text-on-secondary-container">
            Your deletion request completed. Your account session has been signed out.
          </div>
        ) : undefined
      }
      intro={
        <p>
          You can permanently delete your account and app data in Lagan or request deletion by
          email. Deletion removes your profile, habits, completions, sleep entries, feedback
          linked to your account, and authentication account.
        </p>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Button href={WEB_APP_URL} external className="w-full">
          Open Lagan to delete account
        </Button>
        <Button href={mailTo} external variant="outline" className="w-full">
          Email deletion support
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {[
          {
            icon: "login",
            title: "1. Open Lagan",
            body: "Open the Lagan app or browser app and sign in with the account you want to delete.",
          },
          {
            icon: "password",
            title: "2. Confirm password",
            body: "Enter your password again before deletion. This prevents accidental or unauthorized deletion.",
          },
          {
            icon: "delete_forever",
            title: "3. Delete permanently",
            body: "When the request succeeds, your app data is removed and your account is signed out.",
          },
        ].map((item) => (
          <Card key={item.title} surface="low" className="rounded-2xl p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <Icon name={item.icon} />
            </div>
            <h2 className="font-display font-bold text-on-background">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">{item.body}</p>
          </Card>
        ))}
      </div>

      <LegalSection title="In-app option">
        <p>
          Open Settings, then Privacy &amp; Data, then Request account deletion. You will be asked
          to confirm your password before the account is removed.
        </p>
      </LegalSection>

      <LegalSection title="Retention note">
        <p>
          Some operational records may be retained where required for security, abuse
          prevention, legal compliance, or store-policy audit trails. These records are not used
          to restore your deleted account.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
