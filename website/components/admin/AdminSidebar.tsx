"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin",            icon: "dashboard",          label: "Overview"   },
  { href: "/admin/users",      icon: "group",              label: "Users"      },
  { href: "/admin/system",     icon: "settings_suggest",   label: "System"     },
  { href: "/admin/content",    icon: "edit_note",          label: "Content"    },
  { href: "/admin/feedback",   icon: "forum",              label: "Feedback"   },
  { href: "/admin/analytics",  icon: "analytics",          label: "Analytics"  },
  { href: "/admin/audit",      icon: "manage_history",     label: "Audit Log"  },
];

export default function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between bg-slate-900 px-4 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
            <span className="material-symbols-outlined text-[18px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
              admin_panel_settings
            </span>
          </div>
          <span className="font-extrabold text-sm text-white">Lagan Admin</span>
        </Link>
        <Link href="/dashboard" className="text-xs font-bold text-slate-300">
          App
        </Link>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-7 border-t border-slate-800 bg-slate-900 px-1 py-1.5 lg:hidden">
        {NAV.map(({ href, icon, label }) => {
          const exact = href === "/admin";
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-bold ${
                active ? "bg-primary/20 text-primary" : "text-slate-400"
              }`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {icon}
              </span>
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <aside className="fixed left-0 top-0 z-40 hidden min-h-screen w-60 flex-col bg-slate-900 lg:flex">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-[0_4px_12px_rgba(93,63,211,0.4)] flex-shrink-0">
            <span
              className="material-symbols-outlined text-white text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              admin_panel_settings
            </span>
          </div>
          <div>
            <p className="font-extrabold text-white text-sm leading-tight">Lagan Admin</p>
            <p className="text-slate-400 text-xs font-medium">Control Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        {NAV.map(({ href, icon, label }) => {
          const exact = href === "/admin";
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                active
                  ? "bg-primary/20 text-primary"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <span
                className="material-symbols-outlined text-[20px]"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {icon}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-medium transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to App
        </Link>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-primary/25 flex items-center justify-center flex-shrink-0">
            <span className="text-primary text-xs font-extrabold">
              {email[0]?.toUpperCase() ?? "A"}
            </span>
          </div>
          <p className="text-slate-400 text-xs truncate">{email}</p>
        </div>
      </div>
      </aside>
    </>
  );
}
