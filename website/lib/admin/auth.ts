import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isAdminEmail } from "@/lib/admin/access";

export async function requireAdmin(): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const email = user?.email?.toLowerCase() ?? "";

  if (!user || !isAdminEmail(email)) {
    return { ok: false, error: "Forbidden" };
  }

  return { ok: true, email: user.email ?? email };
}
