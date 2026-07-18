import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { isAdminEmail } from "@/lib/admin/access";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Admin · Lagan" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) redirect("/login?next=/admin");
  if (!isAdminEmail(user.email)) {
    redirect("/login?error=not_authorized");
  }

  return (
    <div className="min-h-screen bg-surface-container-low lg:flex">
      <AdminSidebar email={user.email ?? ""} />
      <main className="min-h-screen flex-1 pb-20 lg:ml-60 lg:pb-0">{children}</main>
    </div>
  );
}
