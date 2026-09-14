import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACTIONS_ENABLED = Deno.env.get("WIDGET_BACKGROUND_ACTIONS_ENABLED") === "true";

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

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((value) => (binary += String.fromCharCode(value)));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const action = body.action;
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  const platform = body.platform === "ios" || body.platform === "android" ? body.platform : null;
  if (!platform || deviceId.length < 16 || deviceId.length > 128) {
    return json({ error: "Invalid device" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "revoke") {
    const { error } = await admin
      .from("widget_devices")
      .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .eq("platform", platform);
    return error ? json({ error: "Could not revoke widget session" }, 500) : json({ ok: true });
  }
  if (action !== "register") return json({ error: "Invalid action" }, 400);
  if (!ACTIONS_ENABLED) return json({ ok: true, actionsEnabled: false });

  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("widget_devices").upsert(
    {
      user_id: user.id,
      device_id: deviceId,
      platform,
      token_hash: tokenHash,
      expires_at: expiresAt,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,device_id,platform" },
  );
  if (error) return json({ error: "Could not create widget session" }, 500);

  return json({
    ok: true,
    actionsEnabled: true,
    token,
    expiresAt,
    actionUrl: `${SUPABASE_URL}/functions/v1/widget-action`,
  });
});
