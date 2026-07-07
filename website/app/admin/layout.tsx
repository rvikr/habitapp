import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import AdminSidebar from "@/components/admin/AdminSidebar";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Admin · Lagan" },
  robots: { index: false, follow: false },
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-surface-container-low lg:flex">
      <AdminSidebar email={user.email ?? ""} />
      <main className="min-h-screen flex-1 pb-20 lg:ml-60 lg:pb-0">{children}</main>
    </div>
  );
}
