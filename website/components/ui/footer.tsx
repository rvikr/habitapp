import Link from "next/link";
import { LogoLockup } from "./logo";

export default function Footer() {
  return (
    <footer className="landing-footer border-t border-outline-variant/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="space-y-2">
          <LogoLockup />
          <p className="text-sm text-on-surface-variant">
            Build better habits with AI coaching, streaks, and gentle reminders.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-on-surface-variant">
          <Link href="/privacy" className="transition-colors hover:text-on-background">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-on-background">
            Terms
          </Link>
          <Link href="/account-deletion" className="transition-colors hover:text-on-background">
            Account deletion
          </Link>
        </nav>
      </div>
      <div className="border-t border-outline-variant/40">
        <p className="mx-auto max-w-6xl px-5 py-4 text-xs text-outline sm:px-8">
          © {new Date().getFullYear()} Lagan. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
