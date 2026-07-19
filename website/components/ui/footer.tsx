import Link from "next/link";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/site";
import { LogoLockup } from "./logo";

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1.15" fill="currentColor" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="landing-footer border-t border-outline-variant/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="space-y-3">
          <LogoLockup />
          <p className="text-sm text-on-surface-variant">
            Build better habits with AI coaching, streaks, and gentle reminders.
          </p>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Lagan on Instagram, ${INSTAGRAM_HANDLE}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-on-surface-variant transition-colors hover:text-on-background"
          >
            <InstagramIcon />
            {INSTAGRAM_HANDLE}
          </a>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-on-surface-variant">
          <Link href="/faq" className="transition-colors hover:text-on-background">
            FAQ
          </Link>
          <Link href="/about" className="transition-colors hover:text-on-background">
            About
          </Link>
          <Link href="/blog" className="transition-colors hover:text-on-background">
            Blog
          </Link>
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
