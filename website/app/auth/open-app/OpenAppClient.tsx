"use client";

import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/button";
import type { AppEmailOtpType } from "@/lib/auth-app-handoff";

export default function OpenAppClient({
  deepLink,
  fallbackUrl,
  type,
}: {
  deepLink: string;
  fallbackUrl: string;
  type: AppEmailOtpType;
}) {
  useEffect(() => {
    window.location.href = deepLink;
  }, [deepLink]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-on-background">
      <section className="w-full max-w-md rounded-3xl border border-outline-variant bg-surface-container-low p-7 text-center shadow-2xl sm:p-9">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Continue in Lagan</h1>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">
          {type === "recovery"
            ? "Open Lagan to choose your new password."
            : "Open Lagan to finish confirming your email."}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <a href={deepLink} className={buttonClasses("primary", "lg", "w-full")}>
            Open the Lagan app
          </a>
          <a href={fallbackUrl} className={buttonClasses("outline", "lg", "w-full")}>
            Continue in your browser
          </a>
        </div>
        <p className="mt-5 text-xs leading-5 text-outline">
          If the app is not installed or does not open, continue in your browser.
        </p>
      </section>
    </main>
  );
}
