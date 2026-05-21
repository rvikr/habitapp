"use client";

import { useState, useTransition } from "react";
import { grantPro, revokePro, resetPasswordForUser, verifyUserEmail, hardDeleteUser } from "./actions";

export interface AdminUser {
  id: string;
  email: string | undefined;
  display_name: string | undefined;
  is_pro: boolean;
  pro_trial_ends_at: string | null;
  revenuecat_entitlement_active: boolean;
  revenuecat_status: string | null;
  revenuecat_product_id: string | null;
  pro_expires_at: string | null;
  created_at: string;
  last_sign_in_at: string | undefined | null;
  email_confirmed_at: string | undefined | null;
  platform: string | undefined | null;
}

export function UserRow({ user }: { user: AdminUser }) {
  const [isPending, startTransition] = useTransition();
  const [isPro, setIsPro] = useState(user.is_pro);
  const [deletePhase, setDeletePhase] = useState<"idle" | "confirm">("idle");
  const [msg, setMsg] = useState("");
  const [isDeleted, setIsDeleted] = useState(false);

  if (isDeleted) return null;

  function togglePro() {
    const next = !isPro;
    setIsPro(next);
    startTransition(async () => {
      const res = await (next ? grantPro(user.id) : revokePro(user.id));
      if (!res.ok) { setIsPro(!next); setMsg(res.error ?? "Failed"); }
    });
  }

  function sendReset() {
    if (!user.email) return;
    startTransition(async () => {
      const res = await resetPasswordForUser(user.email!);
      setMsg(res.ok ? "Reset link sent to their email." : (res.error ?? "Failed"));
    });
  }

  function confirmVerify() {
    startTransition(async () => {
      const res = await verifyUserEmail(user.id);
      setMsg(res.ok ? "Email marked as verified." : (res.error ?? "Failed"));
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await hardDeleteUser(user.id, user.email ?? "");
      if (res.ok) setIsDeleted(true);
      else setMsg(res.error ?? "Delete failed");
      setDeletePhase("idle");
    });
  }

  const joined = new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const lastSeen = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Never";
  const now = Date.now();
  const trialActive = user.pro_trial_ends_at ? Date.parse(user.pro_trial_ends_at) > now : false;
  const subscriptionActive =
    user.revenuecat_entitlement_active &&
    (!user.pro_expires_at || Date.parse(user.pro_expires_at) > now);
  const accessLabel = isPro || subscriptionActive ? "PRO" : trialActive ? "TRIAL" : "FREE";
  const accessDate = user.pro_expires_at ?? user.pro_trial_ends_at;
  const accessDateLabel = accessDate
    ? new Date(accessDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className="grid min-w-[920px] items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
        style={{ gridTemplateColumns: "36px 1fr 120px 90px 120px 1fr auto" }}>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
          {((user.display_name || user.email) ?? "?")[0]?.toUpperCase()}
        </div>

        {/* Identity */}
        <div className="min-w-0">
          <p className="font-bold text-sm text-slate-800 truncate">
            {user.display_name || <span className="text-slate-400 font-normal italic">No name</span>}
          </p>
          <p className="text-xs text-slate-400 truncate">{user.email ?? "—"}</p>
        </div>

        {/* Joined */}
        <div>
          <p className="text-xs text-slate-600 font-medium">{joined}</p>
          <p className="text-xs text-slate-400">Last: {lastSeen}</p>
        </div>

        {/* Platform */}
        <p className="text-xs text-slate-400 capitalize">{user.platform ?? "—"}</p>

        {/* Badges */}
        <div className="flex flex-col gap-1">
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full w-fit ${
            accessLabel === "PRO"
              ? "bg-secondary/10 text-secondary"
              : accessLabel === "TRIAL"
                ? "bg-primary/10 text-primary"
                : "bg-slate-100 text-slate-400"
          }`}>{accessLabel}</span>
          {accessDateLabel && (
            <span className="text-[10px] font-semibold text-slate-400">Until {accessDateLabel}</span>
          )}
          {user.revenuecat_status && (
            <span className="text-[10px] font-semibold text-slate-400 truncate max-w-[110px]">
              {user.revenuecat_status}{user.revenuecat_product_id ? ` · ${user.revenuecat_product_id}` : ""}
            </span>
          )}
          {!user.email_confirmed_at && (
            <span className="text-[10px] font-extrabold bg-red-100 text-red-500 px-2 py-0.5 rounded-full w-fit">UNVERIFIED</span>
          )}
        </div>

        {/* Pro toggle */}
        <button
          onClick={togglePro}
          disabled={isPending}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
            isPro
              ? "bg-slate-100 text-slate-500 hover:bg-slate-200"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {isPro ? "Revoke Pro" : "Grant Pro"}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={sendReset}
            disabled={isPending || !user.email}
            title="Send password reset email"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">lock_reset</span>
          </button>

          {!user.email_confirmed_at && (
            <button
              onClick={confirmVerify}
              disabled={isPending}
              title="Mark email as verified"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-green-50 hover:text-green-600 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">mark_email_read</span>
            </button>
          )}

          {deletePhase === "idle" ? (
            <button
              onClick={() => setDeletePhase("confirm")}
              title="Hard delete (GDPR)"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                {isPending ? "…" : "Delete"}
              </button>
              <button
                onClick={() => setDeletePhase("idle")}
                className="text-[11px] font-bold px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div className="px-5 pb-3">
          <p className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">{msg}</p>
        </div>
      )}
    </div>
  );
}
