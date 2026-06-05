// Edge function: web-push-reminders
//
// Intended to run on a schedule (every 15 minutes via pg_cron + pg_net, or
// Supabase scheduled functions). Finds habit reminders that are due in the
// current 15-minute window for each subscriber's local timezone, sends one
// Web Push notification per subscription (batching all due habits), and logs
// each send to web_push_sends for deduplication. Prunes subscriptions that
// respond with 404 or 410 (expired/unsubscribed).
//
// Required secrets (set with `supabase secrets set`):
//   VAPID_PRIVATE_KEY   — base64url-encoded P-256 private key
//   VAPID_PUBLIC_KEY    — base64url-encoded P-256 public key
//   VAPID_SUBJECT       — mailto: or https: audience (e.g. mailto:push@lagan.health)
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore — esm.sh provides a Deno-compatible build of web-push
import webPush from "https://esm.sh/web-push@3.6.7?bundle";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:push@lagan.health";
const WINDOW_MINUTES = 15;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Subscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
};

type Habit = {
  id: string;
  name: string;
  reminder_times: string[] | null;
  reminder_days: number[] | null;
};

function localDateString(date: Date, timezone: string): string {
  // Returns YYYY-MM-DD in the given timezone.
  return date
    .toLocaleDateString("en-CA", { timeZone: timezone })
    .slice(0, 10);
}

function localMinuteOfDay(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const m = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  return h * 60 + m;
}

function localDayOfWeek(date: Date, timezone: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
      .formatToParts(date)
      // Convert abbreviated day name to 0-6 (Sun-Sat).
      .find((p) => p.type === "weekday")!
      .value.replace(/^Sun$/, "0")
      .replace(/^Mon$/, "1")
      .replace(/^Tue$/, "2")
      .replace(/^Wed$/, "3")
      .replace(/^Thu$/, "4")
      .replace(/^Fri$/, "5")
      .replace(/^Sat$/, "6"),
    10,
  );
}

Deno.serve(async (_req) => {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500 });
  }

  const now = new Date();
  let sent = 0;
  let pruned = 0;

  const { data: subscriptions, error: subError } = await supabase
    .from("web_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, timezone");

  if (subError) {
    return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
  }
  if (!subscriptions?.length) {
    return new Response(JSON.stringify({ sent: 0, pruned: 0 }), { status: 200 });
  }

  for (const sub of subscriptions as Subscription[]) {
    const localMinute = localMinuteOfDay(now, sub.timezone);
    const localDay = localDayOfWeek(now, sub.timezone);
    const localDate = localDateString(now, sub.timezone);

    const { data: habits } = await supabase
      .from("habits")
      .select("id, name, reminder_times, reminder_days")
      .eq("user_id", sub.user_id)
      .is("archived_at", null)
      .eq("reminders_enabled", true);

    if (!habits?.length) continue;

    // Find habits whose reminder time falls in the current window.
    const dueEntries: { habitId: string; habitName: string; time: string }[] = [];

    for (const habit of habits as Habit[]) {
      const times = habit.reminder_times ?? [];
      const days = habit.reminder_days ?? [0, 1, 2, 3, 4, 5, 6];
      if (!days.includes(localDay)) continue;

      for (const time of times) {
        if (!/^\d{2}:\d{2}$/.test(time)) continue;
        const [h, m] = time.split(":").map(Number);
        const reminderMinute = h * 60 + m;
        if (Math.abs(reminderMinute - localMinute) >= WINDOW_MINUTES) continue;

        // Dedupe: skip if already sent this window.
        const { count } = await supabase
          .from("web_push_sends")
          .select("id", { count: "exact", head: true })
          .eq("subscription_id", sub.id)
          .eq("habit_id", habit.id)
          .eq("reminder_time", time)
          .eq("local_date", localDate);

        if ((count ?? 0) === 0) {
          dueEntries.push({ habitId: habit.id, habitName: habit.name, time });
        }
      }
    }

    if (!dueEntries.length) continue;

    const names = dueEntries.map((e) => e.habitName);
    const title =
      names.length === 1 ? `Time for: ${names[0]}` : `${names.length} habits to check in`;
    const body =
      names.length === 1
        ? "Tap to log your progress"
        : names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "");

    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    try {
      await webPush.sendNotification(pushSub, JSON.stringify({ title, body }));

      // Log each send (unique constraint prevents double-firing on overlapping runs).
      for (const entry of dueEntries) {
        await supabase.from("web_push_sends").upsert(
          {
            subscription_id: sub.id,
            habit_id: entry.habitId,
            reminder_time: entry.time,
            local_date: localDate,
          },
          { onConflict: "subscription_id,habit_id,reminder_time,local_date", ignoreDuplicates: true },
        );
      }

      await supabase
        .from("web_push_subscriptions")
        .update({ last_seen_at: now.toISOString() })
        .eq("id", sub.id);

      sent++;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("web_push_subscriptions").delete().eq("id", sub.id);
        pruned++;
      }
      // Other errors (network, 5xx from push service): log and continue.
      console.error(`push failed for sub ${sub.id}:`, err);
    }
  }

  return new Response(JSON.stringify({ sent, pruned }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
