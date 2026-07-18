import type { Metadata } from "next";
import ResetPasswordForm from "./ResetPasswordForm";
import { LogoLockup } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-6 font-sans sm:px-12">
      <div className="w-full max-w-[420px]">
        <LogoLockup className="mb-10" />
        <ResetPasswordForm />
      </div>
    </div>
  );
}
