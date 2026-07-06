import type { ReactNode } from "react";
import { Button } from "./button";
import Footer from "./footer";
import MarketingNav from "./marketing-nav";
import { Eyebrow } from "./section";

export function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One prose section of a legal page — dark card, anchor target for the toc. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      id={slugify(title)}
      className="scroll-mt-28 rounded-2xl border border-outline-variant bg-surface-container-low p-6 space-y-3"
    >
      <h2 className="font-display text-xl font-bold tracking-tight text-on-background">{title}</h2>
      <div className="text-sm leading-7 text-on-surface-variant space-y-3">{children}</div>
    </div>
  );
}

/**
 * Shared frame for legal/account pages: slim glass nav, header block,
 * xl-only sticky section nav, shared footer.
 */
export function LegalShell({
  eyebrow = "Legal",
  title,
  updated,
  intro,
  toc = [],
  banner,
  children,
}: {
  eyebrow?: string;
  title: string;
  updated?: string;
  intro: ReactNode;
  toc?: string[];
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-on-surface">
      <MarketingNav
        actions={
          <Button href="/login" variant="ghost" size="md">
            Sign in
          </Button>
        }
      />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-[110px] sm:px-8">
        {banner}
        <header className="max-w-3xl space-y-4">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-on-background sm:text-5xl">
            {title}
          </h1>
          {updated && <p className="text-sm font-medium text-on-surface-variant/70">{updated}</p>}
          <div className="text-base leading-8 text-on-surface-variant">{intro}</div>
        </header>

        <div className={`mt-10 ${toc.length > 0 ? "gap-12 xl:grid xl:grid-cols-[230px_1fr]" : ""}`}>
          {toc.length > 0 && (
            <aside className="hidden xl:block">
              <nav
                aria-label="On this page"
                className="sticky top-28 space-y-2 border-l border-outline-variant pl-4"
              >
                {toc.map((t) => (
                  <a
                    key={t}
                    href={`#${slugify(t)}`}
                    className="block text-[13px] font-medium leading-5 text-on-surface-variant transition-colors hover:text-on-background"
                  >
                    {t}
                  </a>
                ))}
              </nav>
            </aside>
          )}
          <div className="max-w-3xl space-y-6">{children}</div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
