import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { FlagToggle } from "./FlagToggle";
import { NotificationForm } from "./NotificationForm";

export const metadata: Metadata = { title: "System" };
export const dynamic = "force-dynamic";

interface FeatureFlag {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  updated_at: string;
}

interface GlobalNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  active: boolean;
  created_at: string;
}

const FLAG_ICONS: Record<string, string> = {
  maintenance_mode:   "construction",
  leaderboard:        "leaderboard",
  achievements:       "military_tech",
  social_feed:        "people",
  ai_suggestions:     "auto_awesome",
  push_notifications: "notifications",
};

export default async function SystemPage() {
  let flags: FeatureFlag[] = [];
  let notifications: GlobalNotification[] = [];
  let error = "";

  try {
    const admin = createAdminClient();
    const [flagResult, notifResult] = await Promise.all([
      admin.from("feature_flags").select("*").order("key"),
      admin.from("global_notifications").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    flags         = (flagResult.data ?? []) as FeatureFlag[];
    notifications = (notifResult.data ?? []) as GlobalNotification[];
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const maintenanceFlag = flags.find((f) => f.key === "maintenance_mode");
  const otherFlags = flags.filter((f) => f.key !== "maintenance_mode");

  return (
    <div className="app-stagger p-4 sm:p-6 lg:p-8 space-y-8 max-w-4xl">
      <div>
        <h1 className="font-extrabold text-on-background text-2xl" style={{ letterSpacing: "-0.01em" }}>
          System Control
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Kill switches and system-wide toggles. Changes take effect immediately.
        </p>
      </div>

      {error && (
        <div className="bg-error-container/40 border border-error/30 rounded-2xl p-4 text-sm text-error font-mono">{error}</div>
      )}

      {/* Maintenance mode — prominent */}
      {maintenanceFlag && (
        <div className={`rounded-2xl p-6 border-2 ${maintenanceFlag.enabled ? "bg-error-container/40 border-error/30" : "bg-surface border-outline-variant shadow-sm"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${maintenanceFlag.enabled ? "bg-error-container/60" : "bg-surface-container-high"}`}>
                <span
                  className={`material-symbols-outlined text-2xl ${maintenanceFlag.enabled ? "text-error" : "text-on-surface-variant"}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  construction
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-on-background">Maintenance Mode</h2>
                  {maintenanceFlag.enabled && (
                    <span className="text-xs font-extrabold bg-error text-white px-2 py-0.5 rounded-full animate-pulse">
                      LIVE
                    </span>
                  )}
                </div>
                <p className="text-sm text-on-surface-variant mt-0.5">
                  {maintenanceFlag.description ?? 'Show a "Coming Back Soon" screen to all users.'}
                </p>
                {maintenanceFlag.enabled && (
                  <p className="text-sm font-bold text-error mt-2">
                    ⚠ Users are currently being shown the maintenance screen.
                  </p>
                )}
              </div>
            </div>
            <FlagToggle flagKey="maintenance_mode" enabled={maintenanceFlag.enabled} />
          </div>
        </div>
      )}

      {/* Feature flags */}
      <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/60 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-on-background">Feature Flags</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Toggle features without a code deploy.</p>
          </div>
          <span className="text-xs text-on-surface-variant">{otherFlags.filter((f) => f.enabled).length}/{otherFlags.length} active</span>
        </div>

        <div className="divide-y divide-outline-variant/60">
          {otherFlags.map((flag) => (
            <div key={flag.key} className="flex items-center gap-4 px-6 py-4">
              <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0">
                <span
                  className="material-symbols-outlined text-[18px] text-on-surface-variant"
                  style={flag.enabled ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {FLAG_ICONS[flag.key] ?? "toggle_on"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-on-surface text-sm">{flag.name}</p>
                {flag.description && (
                  <p className="text-xs text-on-surface-variant truncate mt-0.5">{flag.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-xs font-bold ${flag.enabled ? "text-secondary" : "text-on-surface-variant"}`}>
                  {flag.enabled ? "ON" : "OFF"}
                </span>
                <FlagToggle flagKey={flag.key} enabled={flag.enabled} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Global notification sender */}
      <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/60">
          <h2 className="font-bold text-on-background">Global Notifications</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Broadcast an in-app banner to all users. Shown on next app load.
          </p>
        </div>
        <div className="p-6">
          <NotificationForm />
        </div>
      </div>

      {/* Active notifications */}
      {notifications.filter((n) => n.active).length > 0 && (
        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/60">
            <h2 className="font-bold text-on-background">Active Banners</h2>
          </div>
          <div className="divide-y divide-outline-variant/60">
            {notifications.filter((n) => n.active).map((n) => (
              <div key={n.id} className="flex items-center gap-4 px-6 py-4">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  n.type === "warning" ? "bg-tertiary" : n.type === "success" ? "bg-secondary" : "bg-habit-water"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-on-surface">{n.title}</p>
                  <p className="text-xs text-on-surface-variant truncate">{n.body}</p>
                </div>
                <p className="text-xs text-on-surface-variant flex-shrink-0">
                  {new Date(n.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
