import "../global.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from "@expo-google-fonts/manrope";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { LanguageProvider, useLanguage } from "@/components/language-provider";
import { TrackingPreferencesProvider } from "@/components/tracking-preferences-provider";
import { CelebrationProvider } from "@/components/celebration";
import { ActivationProvider } from "@/components/activation-provider";
import ErrorBoundary from "@/components/error-boundary";
import NotificationScheduler from "@/components/notification-scheduler";
import {
  supabase,
  isSupabaseConfigured,
  getCurrentSession,
  consumeSignOutWasUserInitiated,
} from "@/lib/supabase/client";
import { initSentry, setUser as setSentryUser } from "@/lib/services/sentry";
import { identifyAnalytics, initAnalytics, resetAnalytics, track } from "@/lib/services/analytics";
import { sanitizeAnalyticsPath } from "@/lib/activation/analytics";
import { registerAppServiceWorker } from "@/lib/platform/sw-register";
import { logOutRevenueCat, syncRevenueCatSubscription } from "@/lib/subscription/revenuecat";
import { clearHomeWidgetSnapshot } from "@/lib/widgets/home-widget";

SplashScreen.preventAutoHideAsync().catch(() => {});

function ScreenTracker() {
  const pathname = usePathname();
  useEffect(() => {
    track("screen_viewed", { screen: sanitizeAnalyticsPath(pathname) });
  }, [pathname]);
  return null;
}

function AuthGuard({ onReady }: { onReady: () => void }) {
  const segments = useSegments();
  const router = useRouter();
  // Keep a ref so the evaluate closure always reads the latest segments
  // even though the effect runs only once.
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    let mounted = true;

    function evaluate(session: { user?: { id: string } } | null, expired = false) {
      const segs = segmentsRef.current;
      const publicRoute = ["login", "auth", "reset-password", "account-deletion"].includes(
        String(segs[0] ?? ""),
      );
      if (!session && !publicRoute) {
        if (expired) {
          router.replace({ pathname: "/login", params: { reason: "expired" } } as never);
        } else {
          router.replace("/login");
        }
      } else if (session && segs[0] === "login") {
        router.replace("/");
      }
      setSentryUser(session?.user ? { id: session.user.id } : null);
      if (session?.user?.id) {
        identifyAnalytics(session.user.id);
        void syncRevenueCatSubscription(session.user.id);
      } else {
        resetAnalytics();
        void logOutRevenueCat();
        void clearHomeWidgetSnapshot();
      }
    }

    (async () => {
      const session = await getCurrentSession();
      if (!mounted) return;
      // If getCurrentSession returned null after detecting a stale refresh token,
      // a SIGNED_OUT will follow via onAuthStateChange and surface the notice.
      evaluate(session);
      onReady();
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const forced = event === "SIGNED_OUT" && !consumeSignOutWasUserInitiated();
      evaluate(session, forced);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [onReady, router]);

  return null;
}

function ConfigurationError() {
  const { t } = useLanguage();
  return (
    <View className="flex-1 bg-background dark:bg-d-background items-center justify-center px-margin-mobile">
      <View className="w-16 h-16 rounded-full bg-error-container items-center justify-center mb-lg">
        <Text className="text-headline-lg text-on-error-container">!</Text>
      </View>
      <Text className="text-headline-md text-on-background dark:text-d-on-background font-bold mb-sm text-center">
        {t("Configuration error")}
      </Text>
      <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center">
        {t(
          "Supabase is not configured. Set\nEXPO_PUBLIC_SUPABASE_URL and\nEXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
        )}
      </Text>
    </View>
  );
}

function RootLayoutContent() {
  const { colorScheme } = useTheme();
  const [isAuthReady, setIsAuthReady] = useState(false);
  const supabaseConfigured = isSupabaseConfigured();
  const handleAuthReady = useCallback(() => setIsAuthReady(true), []);

  useEffect(() => {
    if (!supabaseConfigured) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    if (isAuthReady) {
      // Defer one frame so router.replace lands before the splash drops.
      requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch(() => {});
      });
    }
  }, [supabaseConfigured, isAuthReady]);

  if (!supabaseConfigured) {
    return (
      <>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <ConfigurationError />
      </>
    );
  }

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="account-deletion" options={{ headerShown: false }} />
      <Stack.Screen name="pro" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="habits/new" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="habits/wizard" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="widget/check-in" options={{ headerShown: false }} />
      <Stack.Screen
        name="habits/[id]/index"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="habits/[id]/edit"
        options={{ headerShown: false, presentation: "card" }}
      />
    </Stack>
  );

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <ScreenTracker />
      <AuthGuard onReady={handleAuthReady} />
      <NotificationScheduler />
      {Platform.OS === "web" ? <WebFrame>{stack}</WebFrame> : stack}
    </>
  );
}

// Web-only: constrain the app to a phone-shaped column on desktop browsers.
// On mobile widths it fills the viewport; on tablet+ it caps at 480px and centres.
function WebFrame({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 480,
        marginLeft: "auto",
        marginRight: "auto",
        alignSelf: "center",
      }}
    >
      {children}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    initSentry();
    initAnalytics();
    // Web PWA: register early so offline caching and SW updates after a
    // deploy don't depend on the push-notification opt-in path.
    void registerAppServiceWorker();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <TrackingPreferencesProvider>
              <CelebrationProvider>
                <ActivationProvider>
                  <RootLayoutContent />
                </ActivationProvider>
              </CelebrationProvider>
            </TrackingPreferencesProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
