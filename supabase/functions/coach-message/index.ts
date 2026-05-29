// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAiQuota, recordAiUsageEvent } from "../_shared/ai-guard.ts";
import { enforceProAccess } from "../_shared/pro-access.ts";
import { generateContent } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_COACH_MODEL = Deno.env.get("GEMINI_COACH_MODEL") ?? "gemini-2.5-flash";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CoachRequest = {
  signal?: {
    kind?: string;
    habitName?: string;
    tone?: string;
    suggestedValue?: number | null;
    unit?: string | null;
    progressPct?: number | null;
    fallbackMessage?: string;
  };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function cleanMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 180) return null;
  return trimmed;
}

function outputText(body: any): string | null {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const text = cleanMessage(part?.text);
    if (text) return text;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let body: CoachRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const signal = body.signal;
  const habitName = cleanMessage(signal?.habitName);
  const fallbackMessage = cleanMessage(signal?.fallbackMessage);
  if (!signal || !habitName || !fallbackMessage) return json({ error: "Invalid coach signal" }, 400);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("AI quota guard is not configured for coach-message");
    return json({ message: fallbackMessage, generated: false, reason: "quota_guard_unavailable" }, 503);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const proAccess = await enforceProAccess(admin, user.id, "coach-message");
  if (!proAccess.allowed) {
    console.warn("AI coach-message blocked", { userId: user.id, reason: proAccess.reason });
    return json(
      { message: fallbackMessage, generated: false, reason: "pro_required" },
      proAccess.status,
    );
  }

  const quota = await enforceAiQuota(admin, user.id, "coach-message");
  if (!quota.allowed) {
    console.warn("AI coach-message blocked", { userId: user.id, reason: quota.reason });
    return json(
      { message: fallbackMessage, generated: false, reason: quota.reason },
      quota.status,
    );
  }

  if (!GEMINI_API_KEY) {
    await recordAiUsageEvent(admin, user.id, "coach-message", "fallback", "gemini_key_missing");
    return json({ message: fallbackMessage, generated: false, reason: "gemini_key_missing" }, 503);
  }

  const response = await generateContent(GEMINI_COACH_MODEL, GEMINI_API_KEY, {
    systemInstruction: {
      parts: [
        {
          text:
            "You write short habit-coach notifications. Be supportive, concrete, and non-medical. " +
            "Respect the requested tone. Return one sentence under 160 characters. Do not mention AI.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              kind: signal.kind,
              habitName,
              tone: signal.tone,
              suggestedValue: signal.suggestedValue,
              unit: signal.unit,
              progressPct: signal.progressPct,
              fallbackMessage,
            }),
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 80,
      temperature: 0.7,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini coach-message failed", { status: response.status, error });
    await recordAiUsageEvent(admin, user.id, "coach-message", "failed", "gemini_error", {
      status: response.status,
    });
    return json({ message: fallbackMessage, generated: false }, 200);
  }

  const result = await response.json();
  const message = outputText(result);
  await recordAiUsageEvent(
    admin,
    user.id,
    "coach-message",
    message ? "succeeded" : "fallback",
    message ? undefined : "empty_gemini_output",
  );
  return json({ message: message ?? fallbackMessage, generated: Boolean(message) });
});
