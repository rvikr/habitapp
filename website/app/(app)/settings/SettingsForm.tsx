"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasRecentSignIn } from "@/lib/identity";

interface Props {
  userId: string;
  displayName: string;
  email: string;
  usesPassword: boolean;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full relative transition-colors duration-200 flex-shrink-0 ${
        checked ? "bg-primary" : "bg-surface-container-highest"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function SettingsForm({ userId, displayName, email, usesPassword }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(displayName);
  const [dailyReminders, setDailyReminders] = useState(true);
  const [streakAlerts, setStreakAlerts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const { error: err } = await supabase
      .from("profiles")
      .upsert({ user_id: userId, display_name: name.trim() }, { onConflict: "user_id" });

    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess("Settings saved.");
      router.refresh();
    }
  }

  async function handlePasswordReset() {
    setPasswordLoading(true);
    setPasswordMsg("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback`,
    });
    setPasswordLoading(false);
    setPasswordMsg(
      err ? err.message : "Password reset link sent — check your email."
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  async function handleDeleteAccount() {
    setDeleteMsg("");
    if (usesPassword && !deletePassword.trim()) {
      setDeleteMsg("Enter your password to confirm account deletion.");
      return;
    }
    if (!window.confirm("Delete your Lagan account permanently? This removes your account and app data and cannot be undone.")) {
      return;
    }

    setDeleting(true);
    if (usesPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: deletePassword.trim(),
      });
      if (signInError) {
        setDeleting(false);
        setDeleteMsg("Password confirmation failed.");
        return;
      }
    } else {
      // OAuth-only account: no password exists, and delete-account requires a
      // recent sign-in. If the session is stale, round-trip through Google and
      // land back here so the user can click delete again.
      const { data } = await supabase.auth.getUser();
      if (!hasRecentSignIn(data.user?.last_sign_in_at)) {
        setDeleteMsg("Redirecting to Google to confirm it's you — then click delete again.");
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${location.origin}/auth/callback?next=/settings` },
        });
        setDeleting(false);
        return;
      }
    }

    const reason = deleteReason.trim() || null;
    const { data, error: deleteError } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("delete-account", {
      body: { reason },
    });
    setDeleting(false);

    if (deleteError || !data?.ok) {
      setDeleteMsg(deleteError?.message ?? data?.error ?? "Could not delete account.");
      return;
    }

    await supabase.auth.signOut();
    router.push("/account-deletion?status=deleted");
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">

      {/* ── Account ─────────────────────────────────────────── */}
      <section className="hover-raise bg-surface rounded-3xl border border-outline-variant overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center gap-3">
          <span
            className="material-symbols-outlined text-primary text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            manage_accounts
          </span>
          <h2 className="font-bold text-on-background text-base">Account</h2>
        </div>

        <div className="p-6 space-y-5">
          {/* Avatar row */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-fixed/80 flex items-center justify-center font-extrabold text-primary text-2xl flex-shrink-0">
              {name.trim()?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="font-bold text-on-background">{name || displayName}</p>
              <p className="text-sm text-on-surface-variant">{email}</p>
            </div>
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-on-background block">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Your name"
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant rounded-xl text-on-background placeholder:text-outline text-sm font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-on-background block">
              Email Address
            </label>
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-container rounded-xl border border-outline-variant/50">
              <span className="material-symbols-outlined text-outline text-[18px]">
                mail
              </span>
              <span className="text-sm text-on-surface-variant">{email}</span>
              <span className="ml-auto text-xs text-outline font-medium">
                Read-only
              </span>
            </div>
          </div>

          {/* Password reset */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-on-background block">
              Password
            </label>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={passwordLoading}
              className="flex items-center gap-2 text-primary text-sm font-bold hover:opacity-70 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">lock_reset</span>
              {passwordLoading ? "Sending…" : "Send password reset email"}
            </button>
            {passwordMsg && (
              <p className="text-xs text-on-surface-variant">{passwordMsg}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Notifications ───────────────────────────────────── */}
      <section className="hover-raise bg-surface rounded-3xl border border-outline-variant overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center gap-3">
          <span
            className="material-symbols-outlined text-primary text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            notifications
          </span>
          <div>
            <h2 className="font-bold text-on-background text-base">
              Notifications
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Gentle nudges to keep your morning routine on track
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {[
            {
              label: "Daily Reminders",
              desc: "Get a nudge at your preferred time each day",
              value: dailyReminders,
              onChange: setDailyReminders,
            },
            {
              label: "Streak Alerts",
              desc: "Notify me when I'm close to breaking my streak",
              value: streakAlerts,
              onChange: setStreakAlerts,
            },
          ].map(({ label, desc, value, onChange }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-on-background text-sm">{label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{desc}</p>
              </div>
              <Toggle checked={value} onChange={onChange} />
            </div>
          ))}
        </div>
      </section>

      {/* ── App Experience ──────────────────────────────────── */}
      <section className="hover-raise bg-surface rounded-3xl border border-outline-variant overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center gap-3">
          <span
            className="material-symbols-outlined text-primary text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            tune
          </span>
          <h2 className="font-bold text-on-background text-base">
            App Experience
          </h2>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-on-surface-variant text-xl">
                language
              </span>
              <div>
                <p className="font-semibold text-on-background text-sm">Language</p>
                <p className="text-xs text-on-surface-variant">
                  Interface language
                </p>
              </div>
            </div>
            <select className="text-sm font-semibold text-on-background bg-surface-container border border-outline-variant rounded-xl px-3 py-2 focus:outline-none focus:border-primary transition-colors">
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Danger zone ─────────────────────────────────────── */}
      <section className="hover-raise bg-surface rounded-3xl border border-outline-variant overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant flex items-center gap-3">
          <span className="material-symbols-outlined text-error text-xl">
            warning
          </span>
          <h2 className="font-bold text-on-background text-base">Account Actions</h2>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-2xl border border-error/20 bg-error-container/30 p-4 space-y-3">
            <div>
              <p className="font-bold text-on-background text-sm">Delete account permanently</p>
              <p className="text-xs text-on-surface-variant mt-1">
                This removes your Lagan account, profile, habits, completions, sleep entries, and feedback. This cannot be undone.
              </p>
            </div>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Optional reason"
              rows={3}
              className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-background placeholder:text-outline text-sm font-medium focus:outline-none focus:border-error focus:ring-2 focus:ring-error/15 transition-all"
            />
            {usesPassword ? (
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full px-4 py-3 bg-surface border border-outline-variant rounded-xl text-on-background placeholder:text-outline text-sm font-medium focus:outline-none focus:border-error focus:ring-2 focus:ring-error/15 transition-all"
              />
            ) : (
              <p className="text-xs text-on-surface-variant">
                You signed in with Google, so there is no password to confirm. We may redirect you
                to Google to confirm it&apos;s you before deleting.
              </p>
            )}
            {deleteMsg && <p className="text-xs text-error font-medium">{deleteMsg}</p>}
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="inline-flex items-center gap-2 text-sm font-bold text-error hover:opacity-70 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
              {deleting ? "Deleting account..." : "Delete my account"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm font-bold text-error hover:opacity-70 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Sign out of all devices
          </button>
        </div>
      </section>

      {/* ── Feedback ────────────────────────────────────────── */}
      {error && (
        <div className="bg-error-container text-on-error-container px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-secondary-container/50 text-on-secondary-container px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          {success}
        </div>
      )}

      {/* ── Save / Discard ──────────────────────────────────── */}
      <div className="flex items-center gap-3 justify-end pb-4">
        <button
          type="button"
          onClick={() => {
            setName(displayName);
            setError("");
            setSuccess("");
          }}
          className="px-6 py-2.5 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors border border-outline-variant"
        >
          Discard
        </button>
        <button
          type="submit"
          disabled={saving || name.trim() === displayName}
          className="px-6 py-2.5 rounded-xl font-bold text-sm bg-primary text-white hover:bg-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_16px_rgba(242,107,31,0.3)]"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
