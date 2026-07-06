"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogoLockup } from "@/components/ui/logo";

const NAV = [
  { href: "/dashboard",    icon: "calendar_today", label: "Today"        },
  { href: "/achievements", icon: "military_tech",  label: "Achievements" },
  { href: "/leaderboard",  icon: "leaderboard",    label: "Leaderboard"  },
  { href: "/settings",     icon: "settings",       label: "Settings"     },
];

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  return (
    <span
      className={`material-symbols-outlined text-xl ${
        active ? "[font-variation-settings:'FILL'_1]" : "[font-variation-settings:'FILL'_0]"
      }`}
    >
      {icon}
    </span>
  );
}

export default function Sidebar({
  displayName,
  email,
  isAdmin = false,
}: {
  displayName: string;
  email: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = displayName?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-outline-variant bg-surface/95 px-4 backdrop-blur-xl lg:hidden">
        <LogoLockup />
        <button
          onClick={signOut}
          className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-error"
          aria-label="Sign out"
        >
          <span className="material-symbols-outlined text-xl">logout</span>
        </button>
      </header>

      {/* ── Mobile bottom nav ──────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-0 border-t border-outline-variant bg-surface/95 px-2 py-1.5 backdrop-blur-xl lg:hidden">
        {NAV.map(({ href, icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold transition-colors ${
                active ? "bg-primary/10 text-primary" : "text-on-surface-variant"
              }`}
            >
              <NavIcon icon={icon} active={active} />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside className="fixed left-0 top-0 hidden min-h-screen w-60 flex-col border-r border-outline-variant bg-surface lg:flex">
        {/* Logo */}
        <div className="px-5 pb-4 pt-6">
          <LogoLockup />
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {NAV.map(({ href, icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-primary/10 font-bold text-primary"
                    : "font-semibold text-on-surface-variant hover:bg-primary/5 hover:text-on-background"
                }`}
              >
                <NavIcon icon={icon} active={active} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Admin link */}
        {isAdmin && (
          <div className="px-3 py-2">
            <div className="mb-2 h-px bg-outline-variant" />
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-on-background"
            >
              <span className="material-symbols-outlined text-xl [font-variation-settings:'FILL'_1]">
                admin_panel_settings
              </span>
              Admin Panel
            </Link>
          </div>
        )}

        {/* Profile + sign out */}
        <div className="border-t border-outline-variant p-4">
          <div className="mb-1 flex items-center gap-3 rounded-xl p-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 text-sm font-bold text-primary">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-on-background">{displayName}</p>
              {email && <p className="truncate text-[11px] text-outline">{email}</p>}
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:text-error"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
