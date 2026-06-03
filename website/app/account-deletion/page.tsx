import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account deletion",
  description: "Request deletion of your Lagan account and app data.",
};

const deletionEmail = process.env.NEXT_PUBLIC_ACCOUNT_DELETION_CONTACT_EMAIL;

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
  const mailTo = deletionEmail
    ? `mailto:${deletionEmail}?subject=${encodeURIComponent("Delete my Lagan account")}&body=${encodeURIComponent("Please delete the Lagan account associated with this email address.")}`
    : null;

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
          {deleted && (
            <div className="rounded-2xl border border-secondary/30 bg-secondary-container/40 px-5 py-4 text-sm font-medium text-on-secondary-container">
              Your deletion request completed. Your account session has been signed out.
            </div>
          )}

          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              Account and data deletion
            </p>
            <h1 className="text-4xl font-extrabold leading-tight text-on-background sm:text-5xl">
              Delete your Lagan account
            </h1>
            <p className="text-lg leading-8 text-on-surface-variant">
              You can permanently delete your account and app data from the web or from the mobile app. Deletion removes your profile, habits, completions, sleep entries, feedback linked to your account, and authentication account.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/login?next=/settings"
              className="rounded-2xl bg-primary px-5 py-4 font-bold text-white shadow-[0_8px_24px_rgba(69,30,187,0.24)] transition-opacity hover:opacity-90"
            >
              Sign in to delete account
            </Link>
            {mailTo && (
              <a
                href={mailTo}
                className="rounded-2xl border border-outline-variant bg-white px-5 py-4 font-bold text-primary transition-colors hover:bg-primary-fixed/40"
              >
                Email deletion support
              </a>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: "login",
                title: "1. Sign in",
                body: "Use the same email address as your Lagan account. The web settings page includes the deletion form.",
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
              <div key={item.title} className="rounded-2xl border border-outline-variant/60 bg-white p-5 shadow-card">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-fixed text-primary">
                  <Icon name={item.icon} />
                </div>
                <h2 className="font-extrabold text-on-background">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-on-surface-variant">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-outline-variant bg-white p-6">
            <h2 className="text-xl font-extrabold text-on-background">Mobile app option</h2>
            <p className="mt-3 text-sm leading-7 text-on-surface-variant">
              In the Android app, open Settings, then Privacy & Data, then Request account deletion. You will be asked to confirm your password before the account is removed.
            </p>
          </div>

          <div className="rounded-2xl border border-outline-variant bg-white p-6">
            <h2 className="text-xl font-extrabold text-on-background">Retention note</h2>
            <p className="mt-3 text-sm leading-7 text-on-surface-variant">
              Some operational records may be retained where required for security, abuse prevention, legal compliance, or store-policy audit trails. These records are not used to restore your deleted account.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
