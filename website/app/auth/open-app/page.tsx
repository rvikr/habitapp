import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  buildPwaHandoffUrl,
  isAppEmailOtpType,
  resolveAppHandoff,
} from "@/lib/auth-app-handoff";
import OpenAppClient from "./OpenAppClient";

export const metadata: Metadata = {
  title: "Open Lagan",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OpenAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = firstParam(params.token_hash);
  const type = firstParam(params.type);

  if (!tokenHash || !isAppEmailOtpType(type)) redirect("/app");

  const fallbackUrl = buildPwaHandoffUrl(tokenHash, type);
  const handoff = resolveAppHandoff(firstParam(params.redirect_to), tokenHash, type);
  if (handoff?.kind !== "native") redirect(fallbackUrl);

  return (
    <OpenAppClient
      deepLink={handoff.deepLink}
      fallbackUrl={fallbackUrl}
      type={type}
    />
  );
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
