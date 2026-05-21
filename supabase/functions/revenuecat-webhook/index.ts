// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVENUECAT_WEBHOOK_AUTH_TOKEN = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_TOKEN");
const PRO_ENTITLEMENT_ID = "pro";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function millisToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function activeForEvent(type: string, expiresAt: string | null): boolean {
  if (type === "EXPIRATION" || type === "CANCELLATION") return false;
  return !expiresAt || Date.parse(expiresAt) > Date.now();
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_SERVICE_ROLE_KEY || !REVENUECAT_WEBHOOK_AUTH_TOKEN) {
    return json({ error: "Webhook is not configured" }, 503);
  }
  if (req.headers.get("Authorization") !== REVENUECAT_WEBHOOK_AUTH_TOKEN) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const event = body?.event ?? {};
  const userId = typeof event.app_user_id === "string" ? event.app_user_id : null;
  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : "UNKNOWN";
  const entitlementIds = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids
    : [event.entitlement_id].filter(Boolean);

  if (!userId || !eventId || !entitlementIds.includes(PRO_ENTITLEMENT_ID)) {
    return json({ ok: true, ignored: true });
  }

  const expiresAt = millisToIso(event.expiration_at_ms);
  const active = activeForEvent(eventType, expiresAt);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await admin.from("profiles").upsert({
    user_id: userId,
    revenuecat_app_user_id: userId,
    revenuecat_entitlement_id: PRO_ENTITLEMENT_ID,
    revenuecat_product_id: typeof event.product_id === "string" ? event.product_id : null,
    revenuecat_store: typeof event.store === "string" ? event.store : null,
    revenuecat_period_type: typeof event.period_type === "string" ? event.period_type : null,
    revenuecat_latest_event_id: eventId,
    revenuecat_entitlement_active: active,
    revenuecat_status: active ? "active" : eventType === "CANCELLATION" ? "cancelled" : "expired",
    pro_expires_at: expiresAt,
    subscription_synced_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
