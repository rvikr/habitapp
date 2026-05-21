import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserRow, type AdminUser } from "./UserRow";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

async function getUsers(q: string): Promise<{ users: AdminUser[]; error?: string }> {
  try {
    const admin = createAdminClient();

    // Fetch all auth users + all profiles in parallel
    const [authResult, profileResult] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin
        .from("profiles")
        .select(
          "user_id, display_name, is_pro, platform, pro_trial_ends_at, revenuecat_entitlement_active, revenuecat_status, revenuecat_product_id, pro_expires_at",
        ),
    ]);

    if (authResult.error) return { users: [], error: authResult.error.message };

    const profileMap = new Map(
      (profileResult.data ?? []).map((p) => [
        p.user_id as string,
        p as {
          user_id: string;
          display_name: string | null;
          is_pro: boolean;
          platform: string | null;
          pro_trial_ends_at: string | null;
          revenuecat_entitlement_active: boolean;
          revenuecat_status: string | null;
          revenuecat_product_id: string | null;
          pro_expires_at: string | null;
        },
      ])
    );

    const term = q.trim().toLowerCase();
    const filtered = (authResult.data.users ?? [])
      .filter((u) => {
        if (!term) return true;
        const profile = profileMap.get(u.id);
        return (
          u.email?.toLowerCase().includes(term) ||
          profile?.display_name?.toLowerCase().includes(term)
        );
      })
      .slice(0, 100);

    return {
      users: filtered.map((u) => {
        const p = profileMap.get(u.id);
        return {
          id:                  u.id,
          email:               u.email,
          display_name:        p?.display_name ?? undefined,
          is_pro:              p?.is_pro ?? false,
          pro_trial_ends_at:   p?.pro_trial_ends_at ?? null,
          revenuecat_entitlement_active: p?.revenuecat_entitlement_active ?? false,
          revenuecat_status:   p?.revenuecat_status ?? null,
          revenuecat_product_id: p?.revenuecat_product_id ?? null,
          pro_expires_at:      p?.pro_expires_at ?? null,
          created_at:          u.created_at,
          last_sign_in_at:     u.last_sign_in_at ?? null,
          email_confirmed_at:  u.email_confirmed_at ?? null,
          platform:            p?.platform ?? u.user_metadata?.platform ?? null,
        };
      }),
    };
  } catch (e) {
    return { users: [], error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { users, error } = await getUsers(q);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="font-extrabold text-slate-900 text-2xl" style={{ letterSpacing: "-0.01em" }}>
          User Management
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Search, inspect, and manage all registered users.
        </p>
      </div>

      {/* Search */}
      <form className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 max-w-md">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
            search
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by email or display name…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
        >
          Search
        </button>
        {q && (
          <a
            href="/admin/users"
            className="px-4 py-2.5 border border-slate-200 text-slate-500 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-500 text-xl flex-shrink-0">error</span>
          <div>
            <p className="font-bold text-red-700 text-sm">Could not load users</p>
            <p className="text-red-600 text-xs mt-0.5 font-mono">{error}</p>
          </div>
        </div>
      )}

      {/* User table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm border border-slate-200">
        {/* Column headers */}
        <div
          className="grid min-w-[920px] gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200"
          style={{ gridTemplateColumns: "36px 1fr 120px 90px 120px 1fr auto" }}
        >
          {["", "User", "Joined", "Platform", "Status", "Pro", "Actions"].map((h) => (
            <span key={h} className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>

        {users.length === 0 ? (
          <div className="py-16 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-200" style={{ fontVariationSettings: "'FILL' 1" }}>
              group
            </span>
            <p className="text-slate-400 text-sm mt-3">
              {q ? `No users matching "${q}"` : "No users found"}
            </p>
          </div>
        ) : (
          users.map((user) => <UserRow key={user.id} user={user} />)
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        {users.length > 0 && `Showing ${users.length} user${users.length !== 1 ? "s" : ""}${q ? ` matching "${q}"` : ""}`}
      </p>
    </div>
  );
}
