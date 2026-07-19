// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVENUECAT_WEBHOOK_AUTH_TOKEN = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_TOKEN");
const REVENUECAT_SECRET_API_KEY = Deno.env.get("REVENUECAT_SECRET_API_KEY");
const PRO_ENTITLEMENT_ID = "Pro";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function activeFromExpiration(expiresAt: string | null): boolean {
  return !expiresAt || Date.parse(expiresAt) > Date.now();
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SUPABASE_SERVICE_ROLE_KEY || !REVENUECAT_WEBHOOK_AUTH_TOKEN || !REVENUECAT_SECRET_API_KEY) {
    return json({ error: "Webhook is not configured" }, 503);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!timingSafeEqual(authHeader, REVENUECAT_WEBHOOK_AUTH_TOKEN)) {
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
  const entitlementIds = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids
    : [event.entitlement_id].filter(Boolean);

  if (!userId || !eventId || !entitlementIds.includes(PRO_ENTITLEMENT_ID)) {
    return json({ ok: true, ignored: true });
  }

  // The webhook body is only a trigger. Entitlement state is re-fetched from
  // RevenueCat's API so a forged body can never grant access it doesn't have.
  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("RevenueCat subscriber verification failed", {
      status: response.status,
      error,
    });
    return json({ error: "Could not verify subscriber" }, 502);
  }

  const subscriberBody = await response.json();
  const subscriber = subscriberBody?.subscriber ?? {};
  const entitlement = subscriber?.entitlements?.[PRO_ENTITLEMENT_ID] ?? null;
  const productId = typeof entitlement?.product_identifier === "string"
    ? entitlement.product_identifier
    : null;
  const subscription = productId ? subscriber?.subscriptions?.[productId] : null;
  const expiresAt = parseDate(entitlement?.expires_date ?? subscription?.expires_date);
  const active = Boolean(entitlement) && activeFromExpiration(expiresAt);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await admin.from("profiles").upsert({
    user_id: userId,
    revenuecat_app_user_id: userId,
    revenuecat_entitlement_id: entitlement ? PRO_ENTITLEMENT_ID : null,
    revenuecat_product_id: productId,
    revenuecat_store: typeof subscription?.store === "string" ? subscription.store : null,
    revenuecat_period_type: typeof subscription?.period_type === "string" ? subscription.period_type : null,
    revenuecat_latest_event_id: eventId,
    revenuecat_entitlement_active: active,
    revenuecat_status: active ? "active" : "expired",
    pro_expires_at: expiresAt,
    subscription_synced_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, active });
});
