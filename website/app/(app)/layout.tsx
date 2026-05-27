import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import Sidebar from "@/components/Sidebar";
import TimezoneCookie from "@/components/timezone-cookie";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName =
    (profile?.display_name as string | null | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there";

  const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "");

  return (
    <div className="min-h-screen bg-background lg:flex">
      <TimezoneCookie />
      <Sidebar displayName={displayName} email={user.email ?? null} isAdmin={isAdmin} />
      <main className="min-h-screen flex-1 pb-32 lg:ml-60 lg:pb-0">{children}</main>
    </div>
  );
}
