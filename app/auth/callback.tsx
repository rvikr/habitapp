import { useEffect, useState, useRef } from "react";
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";
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
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [shouldWelcome, setShouldWelcome] = useState(false);

  useEffect(() => {
    let cancelled = false;

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
      } else if (parsed.accessToken && parsed.refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (sessionError) throw sessionError;
        clearDataCache();
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const hasSession = Boolean(session);
      const welcome = session?.user.email
        ? await consumePendingSignupWelcome(session.user.email).catch(() => false)
        : false;

      if (cancelled) return;
      setShouldWelcome(welcome);

      if (parsed.type === "recovery") {
        router.replace("/reset-password" as never);
        return;
      }

      // On native, an established session always lands on home — rendering the
      // "success" screen would only flash for a frame (e.g. the Google OAuth deep
      // link re-entering the app). Skip it and keep the neutral spinner until redirect.
      if (Platform.OS !== "web" && hasSession) {
        requestAnimationFrame(() => {
          if (!cancelled) router.replace(homeDestination(welcome) as never);
        });
        return;
      }
      setStatus("success");
    }

    finishAuth().catch((e) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : t("Could not complete authentication."));
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentUrl, routeCallbackUrl, router, t]);

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background items-center justify-center px-margin-mobile">
      {status === "error" ? (
        <>
          <Text className="text-headline-md text-on-background dark:text-d-on-background font-bold text-center mb-sm">
            {t("Link could not be opened")}
          </Text>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center">
            {error}
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
              onPress={() => router.replace(homeDestination(shouldWelcome) as never)}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                {t("Continue to app")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface-container dark:bg-d-surface-container rounded-full py-md items-center"
              onPress={() => router.replace("/login" as never)}
            >
              <Text className="text-primary text-label-lg font-semibold">{t("Sign in")}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color="#F26B1F" />
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
