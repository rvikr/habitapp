"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LogoLockup } from "./logo";

/**
 * Fixed marketing nav: transparent over the hero, dark glass once scrolled.
 * Links and right-side actions come from the page so pinned labels/hrefs stay
 * in page source (landing content test).
 */
export default function MarketingNav({
  links = [],
  actions,
}: {
  links?: { label: string; href: string }[];
  actions?: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        scrolled ? "glass border-outline-variant/70" : "border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <LogoLockup />
        {links.length > 0 && (
          <div className="hidden items-center gap-7 md:flex">
            {links.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="nav-link text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-background"
              >
                {label}
              </a>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">{actions}</div>
      </div>
    </nav>
  );
}
