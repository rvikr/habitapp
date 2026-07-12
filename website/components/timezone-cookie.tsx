"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TimezoneCookie() {
  const router = useRouter();

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    const supabase = createClient();
    void supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      const syncKey = `lagan_profile_timezone_v1:${userId}`;
      if (window.localStorage.getItem(syncKey) === timeZone) return;
      const { error } = await supabase.rpc("set_profile_time_zone", { p_time_zone: timeZone });
      if (!error) window.localStorage.setItem(syncKey, timeZone);
    });
    const encoded = encodeURIComponent(timeZone);
    const current = document.cookie
      .split("; ")
      .find((row) => row.startsWith("lagan_tz="))
      ?.split("=")[1];
    if (current === encoded) return;

    document.cookie = `lagan_tz=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  return null;
}
