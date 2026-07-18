import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";

function sanitizeNext(rawNext: string | null, origin: string): string {
  const fallback = "/dashboard";
  if (!rawNext) return fallback;
  try {
    const url = new URL(rawNext, origin);
    if (url.origin !== origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

// Email OTP links (recovery, signup confirmation, email change, magic link) point
// here — on our own domain — instead of the raw <project>.supabase.co verify URL.
// Keeping the link on lagan.health avoids the sender/link domain mismatch that trips
// Gmail's phishing filter. verifyOtp exchanges the token_hash for a session, mirroring
// what the supabase.co/auth/v1/verify endpoint would have done, then we redirect on.
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const type = EMAIL_OTP_TYPES.includes(rawType as EmailOtpType)
    ? (rawType as EmailOtpType)
    : null;

  // A recovery link must always land on the set-new-password page, even if the
  // `next` param is dropped by the mailer — the session alone is not enough, the
  // user still has to choose a new password.
  const next =
    type === "recovery"
      ? "/reset-password"
      : sanitizeNext(searchParams.get("next"), origin);

  if (tokenHash && type) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
