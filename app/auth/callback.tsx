import { useEffect, useState, useRef } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "@/lib/supabase/client";
import { AUTH_CALLBACK_PATH, parseAuthCallbackUrl } from "@/lib/auth/auth-redirect";
import { authCallbackUrlFromParams } from "@/lib/auth/auth-callback-params";
import { clearDataCache } from "@/lib/data/cache";
import {
  AUTH_CALLBACK_CONFIRMED_BODY,
  AUTH_CALLBACK_CONFIRMED_TITLE,
  consumePendingSignupWelcome,
} from "@/lib/auth/auth-welcome";
import { useLanguage } from "@/components/language-provider";

type Status = "loading" | "success" | "error";

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const callbackParams = useLocalSearchParams();
  const routeCallbackUrl = authCallbackUrlFromParams(`/${AUTH_CALLBACK_PATH}`, callbackParams);
  const currentUrl = Linking.useURL();
  const handledUrlRef = useRef<string | null>(null);
  // Tracks real unmount only. On web, `Linking.useURL()` starts null then resolves
  // to the page URL, re-running the effect below. A per-run `cancelled` flag would
  // be flipped by that re-run's cleanup and suppress the state updates from the run
  // that actually exchanged the code — leaving the screen stuck on the spinner. This
  // ref is cleared solely by the dedicated unmount effect, so the productive run can
  // always finish.
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [shouldWelcome, setShouldWelcome] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    async function finishAuth() {
      const url =
        currentUrl ?? (await Linking.getInitialURL()) ?? browserLocationUrl() ?? routeCallbackUrl;
      if (!url) throw new Error("Missing authentication callback URL.");
      if (handledUrlRef.current === url) return;
      handledUrlRef.current = url;

      const parsed = parseAuthCallbackUrl(url);
      if (parsed.error) {
        throw new Error(parsed.errorDescription ?? parsed.error);
      }

      if (parsed.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
        if (exchangeError) throw exchangeError;
        clearDataCache();
      } else {
        throw new Error("Missing authentication code.");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const hasSession = Boolean(session);
      const welcome = session?.user.email
        ? await consumePendingSignupWelcome(session.user.email).catch(() => false)
        : false;

      if (!mountedRef.current) return;
      setShouldWelcome(welcome);

      if (parsed.type === "recovery") {
        router.replace("/reset-password" as never);
        return;
      }

      // The "Congratulations, your email is confirmed!" success screen is only
      // meaningful for a genuine email-signup confirmation. OAuth (e.g. Google) and
      // returning-user logins establish a session with no pending-signup match and no
      // `type=signup`, so they must skip the success screen and land straight on home —
      // otherwise an existing user re-authenticating sees a bogus "email confirmed".
      const isEmailConfirmation = welcome || parsed.type === "signup";
      if (hasSession && !isEmailConfirmation) {
        requestAnimationFrame(() => {
          if (mountedRef.current) router.replace(homeDestination(welcome) as never);
        });
        return;
      }
      setStatus("success");
    }

    finishAuth().catch((e) => {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Could not complete authentication.");
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
            {t(AUTH_CALLBACK_CONFIRMED_BODY)}
          </Text>
          <View className="w-full gap-sm mt-lg">
            <TouchableOpacity
              className="bg-primary rounded-full py-md items-center"
              accessibilityRole="button"
              onPress={() => router.replace(homeDestination(shouldWelcome) as never)}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                {t("Continue to app")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface-container dark:bg-d-surface-container rounded-full py-md items-center"
              accessibilityRole="button"
              onPress={() => router.replace("/login" as never)}
            >
              <Text className="text-primary text-label-lg font-semibold">{t("Sign in")}</Text>
            </TouchableOpacity>
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

function homeDestination(shouldWelcome: boolean) {
  return shouldWelcome ? { pathname: "/", params: { newUser: "1" } } : "/";
}
