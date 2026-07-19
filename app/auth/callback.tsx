import { useEffect, useState, useRef } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { exchangeAuthCode, supabase } from "@/lib/supabase/client";
import {
  AUTH_CALLBACK_PATH,
  isAppEmailOtpType,
  parseAuthCallbackUrl,
} from "@/lib/auth/auth-redirect";
import { pickAuthCallbackUrl } from "@/lib/auth/auth-callback-select";
import { authCallbackUrlFromParams } from "@/lib/auth/auth-callback-params";
import { authCallbackErrorMessage } from "@/lib/auth/auth-callback-error";
import { clearDataCache } from "@/lib/data/cache";
import {
  AUTH_CALLBACK_AUTHENTICATED_BODY,
  AUTH_CALLBACK_CONFIRMED_TITLE,
  AUTH_CALLBACK_SIGN_IN_BODY,
  consumePendingSignupWelcome,
} from "@/lib/auth/auth-welcome";
import { useLanguage } from "@/components/language-provider";
import { identifyAnalytics, trackActivationEvent } from "@/lib/services/analytics";
import { resolveActivationAnalyticsContext } from "@/lib/services/activation-analytics-context";
import {
  categorizeSignupFailure,
  unassignedActivationAnalyticsContext,
} from "@/lib/activation/analytics";

type Status = "loading" | "success" | "error";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const callbackParams = useLocalSearchParams();
  const routeCallbackUrl = authCallbackUrlFromParams(`/${AUTH_CALLBACK_PATH}`, callbackParams);
  const currentUrl = Linking.useURL();
  const handledUrlRef = useRef<string | null>(null);
  const signupCallbackRef = useRef(false);
  // Tracks real unmount only. On web, `Linking.useURL()` starts null then resolves
  // to the page URL, re-running the effect below. A per-run `cancelled` flag would
  // be flipped by that re-run's cleanup and suppress the state updates from the run
  // that actually exchanged the code — leaving the screen stuck on the spinner. This
  // ref is cleared solely by the dedicated unmount effect, so the productive run can
  // always finish.
  const mountedRef = useRef(true);
  const recoveryRoutedRef = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [shouldWelcome, setShouldWelcome] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  function goToResetPassword() {
    if (recoveryRoutedRef.current) return;
    recoveryRoutedRef.current = true;
    router.replace("/reset-password" as never);
  }

  async function trackSignupConfirmation(userId: string | null) {
    if (userId) identifyAnalytics(userId);
    const context = await resolveActivationAnalyticsContext(userId ?? "", "pre_value", Platform.OS);
    trackActivationEvent("signup_confirmed", context, { authenticated: Boolean(userId) });
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Backstop: if the SDK surfaces a recovery session (e.g. via any flow that
  // emits PASSWORD_RECOVERY), route to the set-new-password screen even if the
  // callback URL never carried `type=recovery`. The primary signal is still the
  // `type` param handled in finishAuth; this ref-guards against double navigation.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && mountedRef.current) goToResetPassword();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function finishAuth() {
      // An App Link that opens the app at /auth/confirm can leave useURL() on a
      // tokenless in-app URL while the token still lives in getInitialURL(); pick
      // the candidate that actually carries a credential rather than the first
      // non-null one. See pickAuthCallbackUrl.
      const url = pickAuthCallbackUrl(
        [currentUrl, await Linking.getInitialURL(), browserLocationUrl(), routeCallbackUrl],
        parseAuthCallbackUrl,
      );
      if (!url) throw new Error("Missing authentication callback URL.");
      if (handledUrlRef.current === url) return;
      handledUrlRef.current = url;

      const parsed = parseAuthCallbackUrl(url);
      signupCallbackRef.current = parsed.type === "signup";
      if (parsed.error) {
        throw new Error(parsed.errorDescription ?? parsed.error);
      }

      if (parsed.code) {
        const { error: exchangeError } = await exchangeAuthCode(parsed.code);
        if (exchangeError) throw exchangeError;
        clearDataCache();
        scrubConsumedTokenFromBrowserUrl();
      } else if (parsed.tokenHash && isAppEmailOtpType(parsed.type)) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          type: parsed.type,
          token_hash: parsed.tokenHash,
        });
        if (verifyError) throw verifyError;
        clearDataCache();
        scrubConsumedTokenFromBrowserUrl();
      } else {
        throw new Error("Missing authentication code or token.");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const hasSession = Boolean(session);
      const welcome = session?.user.email
        ? await consumePendingSignupWelcome(session.user.email).catch(() => false)
        : false;

      if (!mountedRef.current) return;
      setShouldWelcome(welcome);
      setHasSession(hasSession);

      if (parsed.type === "recovery") {
        if (!recoveryRoutedRef.current) {
          recoveryRoutedRef.current = true;
          router.replace("/reset-password" as never);
        }
        return;
      }

      // The "Congratulations, your email is confirmed!" success screen is only
      // meaningful for a genuine email-signup confirmation. OAuth (e.g. Google) and
      // returning-user logins establish a session with no pending-signup match and no
      // `type=signup`, so they must skip the success screen and land straight on home —
      // otherwise an existing user re-authenticating sees a bogus "email confirmed".
      const isEmailConfirmation = welcome || parsed.type === "signup";
      if (isEmailConfirmation) {
        void trackSignupConfirmation(session?.user.id ?? null).catch(() => {});
      }
      if (hasSession && !isEmailConfirmation) {
        requestAnimationFrame(() => {
          if (mountedRef.current) router.replace(homeDestination(welcome) as never);
        });
        return;
      }
      setStatus("success");
    }

    finishAuth().catch((e) => {
      if (signupCallbackRef.current) {
        trackActivationEvent("signup_failed", unassignedActivationAnalyticsContext(Platform.OS), {
          method: "email",
          failure_category: categorizeSignupFailure(e),
          failure_stage: "confirmation",
        });
      }
      if (mountedRef.current) {
        setError(authCallbackErrorMessage(e));
        setStatus("error");
      }
    });
  }, [currentUrl, routeCallbackUrl, router]);

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background items-center justify-center px-margin-mobile">
      {status === "error" ? (
        <>
          <Text className="text-headline-md text-on-background dark:text-d-on-background font-bold text-center mb-sm">
            {t("Link could not be opened")}
          </Text>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center">
            {error ? t(error) : null}
          </Text>
          <View className="w-full mt-lg">
            <TouchableOpacity
              className="bg-primary rounded-full py-md items-center"
              accessibilityRole="button"
              onPress={() => router.replace("/login" as never)}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                {t("Back to sign in")}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : status === "success" ? (
        <>
          <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-lg">
            <Ionicons name="checkmark" size={40} color="#ffffff" />
          </View>
          <Text className="text-headline-md text-on-background dark:text-d-on-background font-bold text-center mb-sm">
            {t(AUTH_CALLBACK_CONFIRMED_TITLE)}
          </Text>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center">
            {t(hasSession ? AUTH_CALLBACK_AUTHENTICATED_BODY : AUTH_CALLBACK_SIGN_IN_BODY)}
          </Text>
          <View className="w-full gap-sm mt-lg">
            {hasSession ? (
              <TouchableOpacity
                className="bg-primary rounded-full py-md items-center"
                accessibilityRole="button"
                onPress={() => router.replace(homeDestination(shouldWelcome) as never)}
              >
                <Text className="text-on-primary text-label-lg font-semibold">
                  {t("Continue to app")}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                className="bg-primary rounded-full py-md items-center"
                accessibilityRole="button"
                onPress={() => router.replace("/login" as never)}
              >
                <Text className="text-on-primary text-label-lg font-semibold">{t("Sign in")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mt-md">
            {t("Finishing sign in...")}
          </Text>
        </>
      )}
    </SafeAreaView>
  );
}

function browserLocationUrl(): string | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  return window.location.href || null;
}

// The code/token is single-use, but remove it promptly so browser history,
// copied URLs, and later client-side telemetry cannot retain the credential —
// and so a tab restore or reload of this screen doesn't re-run the consumed
// exchange and show an error over an already-established session.
function scrubConsumedTokenFromBrowserUrl() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const consumed = ["code", "token_hash"].filter((key) => url.searchParams.has(key));
  if (consumed.length === 0) return;
  for (const key of consumed) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function homeDestination(shouldWelcome: boolean) {
  return shouldWelcome ? { pathname: "/", params: { newUser: "1" } } : "/";
}
