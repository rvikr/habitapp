// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const REVENUECAT_SECRET_API_KEY = Deno.env.get("REVENUECAT_SECRET_API_KEY");
const PRO_ENTITLEMENT_ID = "Pro";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  if (!SUPABASE_SERVICE_ROLE_KEY || !REVENUECAT_SECRET_API_KEY) {
    return json({ error: "Subscription sync is not configured" }, 503);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
    {
      headers: {
        Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("RevenueCat subscription fetch failed", { userId: user.id, status: response.status, error });
    return json({ error: "Could not sync subscription" }, 502);
  }

  const body = await response.json();
  const subscriber = body?.subscriber ?? {};
  const entitlement = subscriber?.entitlements?.[PRO_ENTITLEMENT_ID] ?? null;
  const productId = typeof entitlement?.product_identifier === "string"
    ? entitlement.product_identifier
    : null;
  const subscription = productId ? subscriber?.subscriptions?.[productId] : null;
  const expiresAt = parseDate(entitlement?.expires_date ?? subscription?.expires_date);
  const active = Boolean(entitlement) && activeFromExpiration(expiresAt);
  const status = active
    ? (String(subscription?.billing_issues_detected_at ?? "") ? "billing_issue" : "active")
    : "expired";

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await admin.from("profiles").upsert({
    user_id: user.id,
    revenuecat_app_user_id: user.id,
    revenuecat_entitlement_id: entitlement ? PRO_ENTITLEMENT_ID : null,
    revenuecat_product_id: productId,
    revenuecat_store: typeof subscription?.store === "string" ? subscription.store : null,
    revenuecat_period_type: typeof subscription?.period_type === "string" ? subscription.period_type : null,
    revenuecat_entitlement_active: active,
    revenuecat_status: active ? status : "expired",
    pro_expires_at: expiresAt,
    subscription_synced_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return json({ error: error.message }, 500);

  return json({ entitlement: PRO_ENTITLEMENT_ID, active, expiresAt });
});
