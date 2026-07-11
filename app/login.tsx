import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Linking,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import AntDesign from "@expo/vector-icons/AntDesign";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { signIn, signUp, resetPassword, signInWithGoogle } from "@/lib/data/actions";
import { validatePassword } from "@/lib/auth/password";
import { authErrorMessageKey } from "@/lib/supabase/auth-error";
import {
  SIGNUP_CONFIRMATION_MESSAGE,
  consumePendingSignupWelcome,
  rememberPendingSignup,
} from "@/lib/auth/auth-welcome";
import LogoChainL from "@/components/logo-chain-l";
import LoginOrbitalBackground from "@/components/login-orbital-background";
import { useLanguage } from "@/components/language-provider";

type Mode = "signin" | "signup";

const LOGIN_COLORS = {
  text: "#FFFFFF",
  muted: "#A0A0A8",
  subtle: "#77777D",
  field: "#252528",
  fieldBorder: "#343438",
};

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reason?: string }>();
  const { languageName, t, toggleLanguage } = useLanguage();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const emailInputRef = useRef<TextInput>(null);
  const pendingModeFocusRef = useRef(false);
  const authInFlightRef = useRef(false);
  const authLoading = loading || googleLoading;

  useEffect(() => {
    if (params.reason === "expired") {
      setNotice(t("Session expired — please sign in again."));
      // Clear the param so the notice doesn't reappear on re-renders.
      router.setParams({ reason: undefined } as never);
    }
  }, [params.reason, t, router]);

  useEffect(() => {
    if (!pendingModeFocusRef.current) return;
    pendingModeFocusRef.current = false;
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      emailInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  function switchMode(next: Mode) {
    if (authLoading || authInFlightRef.current) return;
    pendingModeFocusRef.current = true;
    setMode(next);
    setError(null);
    setMessage(null);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function handleGoogleSignIn() {
    if (authLoading || authInFlightRef.current) return;
    authInFlightRef.current = true;
    setGoogleLoading(true);
    setError(null);
    setMessage(null);
    setNotice(null);
    try {
      const { error: e, cancelled } = await signInWithGoogle();
      if (cancelled) return;
      if (e) setError(t(authErrorMessageKey(e)));
    } catch {
      setError(t("Network error. Check your connection and try again."));
    } finally {
      authInFlightRef.current = false;
      setGoogleLoading(false);
    }
  }

  async function handleSubmit() {
    if (authLoading || authInFlightRef.current) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError(t("Email and password are required."));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(t("Enter a valid email address."));
      return;
    }
    if (mode === "signup") {
      const pwError = validatePassword(password);
      if (pwError) {
        setError(t(pwError));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("Passwords do not match."));
        return;
      }
    }
    authInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setMessage(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error: e } = await signIn(trimmedEmail, password);
        if (e) {
          setError(t(authErrorMessageKey(e)));
        } else {
          const shouldWelcome = await consumePendingSignupWelcome(trimmedEmail).catch(() => false);
          router.replace(
            shouldWelcome ? ({ pathname: "/", params: { newUser: "1" } } as never) : ("/" as never),
          );
        }
      } else {
        const { data, error: e } = await signUp(trimmedEmail, password);
        if (e) {
          setError(t(authErrorMessageKey(e)));
        } else if (!data?.user || data.user.identities?.length === 0) {
          setError(t("An account with this email already exists. Try signing in instead."));
        } else {
          await rememberPendingSignup(trimmedEmail).catch(() => {});
          setMessage(t(SIGNUP_CONFIRMATION_MESSAGE));
        }
      }
    } catch {
      setError(t("Network error. Check your connection and try again."));
    } finally {
      authInFlightRef.current = false;
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#1A1A1A" }}>
      <LoginOrbitalBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-margin-mobile py-xxl">
            {/* Header */}
            <View className="mb-xxl">
              <View className="mb-md flex-row items-center justify-between">
                <LogoChainL size={44} />
                <TouchableOpacity
                  className="flex-row items-center gap-xs rounded-full px-sm py-xs"
                  accessibilityRole="button"
                  accessibilityLabel={t("Change language")}
                  onPress={toggleLanguage}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    borderColor: "rgba(255, 255, 255, 0.12)",
                    borderWidth: 1,
                  }}
                >
                  <Ionicons name="language-outline" size={18} color="#F26B1F" />
                  <Text
                    className="text-label-sm font-semibold"
                    style={{ color: LOGIN_COLORS.text }}
                  >
                    {languageName}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text
                className="text-display-sm"
                style={{
                  color: LOGIN_COLORS.text,
                  fontFamily: "SpaceGrotesk_600SemiBold",
                  letterSpacing: -0.5,
                }}
              >
                Lagan
              </Text>
              <Text className="text-body-md mb-lg" style={{ color: LOGIN_COLORS.muted }}>
                {t("AI-enabled habit tracking")}
              </Text>
              <Text
                className="text-headline-lg"
                style={{
                  color: LOGIN_COLORS.text,
                  fontFamily: "SpaceGrotesk_600SemiBold",
                  letterSpacing: -0.5,
                }}
              >
                {mode === "signin" ? t("Welcome back") : t("Create account")}
              </Text>
              <Text className="text-body-md mt-xs" style={{ color: LOGIN_COLORS.muted }}>
                {mode === "signin"
                  ? t("Pick up where you left off.")
                  : t("Start with an AI-assisted routine.")}
              </Text>
            </View>

            {/* Form */}
            <View className="gap-md">
              <View className="gap-xs">
                <Text className="text-label-sm font-semibold" style={{ color: LOGIN_COLORS.muted }}>
                  {t("Email")}
                </Text>
                <TextInput
                  ref={emailInputRef}
                  className="rounded-xl px-md py-sm text-body-md"
                  placeholder="you@example.com"
                  placeholderTextColor={LOGIN_COLORS.subtle}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  style={{
                    backgroundColor: LOGIN_COLORS.field,
                    borderColor: LOGIN_COLORS.fieldBorder,
                    borderWidth: 1,
                    color: LOGIN_COLORS.text,
                  }}
                />
              </View>

              <View className="gap-xs">
                <View className="flex-row justify-between items-center">
                  <Text
                    className="text-label-sm font-semibold"
                    style={{ color: LOGIN_COLORS.muted }}
                  >
                    {t("Password")}
                  </Text>
                  {mode === "signin" && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setShowForgot(true)}
                    >
                      <Text className="text-primary text-label-sm font-semibold">
                        {t("Forgot password?")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View
                  className="flex-row rounded-xl overflow-hidden items-center"
                  style={{
                    backgroundColor: LOGIN_COLORS.field,
                    borderColor: LOGIN_COLORS.fieldBorder,
                    borderWidth: 1,
                  }}
                >
                  <TextInput
                    className="flex-1 px-md py-sm text-body-md"
                    placeholder={
                      mode === "signup" ? t("8+ chars, mixed case + number") : "••••••••"
                    }
                    placeholderTextColor={LOGIN_COLORS.subtle}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textContentType={mode === "signup" ? "newPassword" : "password"}
                    style={{ color: LOGIN_COLORS.text }}
                  />
                  <TouchableOpacity
                    className="px-md py-sm"
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? t("Hide password") : t("Show password")}
                    onPress={() => setShowPassword((v) => !v)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color="#8F8A82"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {mode === "signup" && (
                <View className="gap-xs">
                  <Text
                    className="text-label-sm font-semibold"
                    style={{ color: LOGIN_COLORS.muted }}
                  >
                    {t("Confirm Password")}
                  </Text>
                  <View
                    className="flex-row rounded-xl overflow-hidden items-center"
                    style={{
                      backgroundColor: LOGIN_COLORS.field,
                      borderColor: LOGIN_COLORS.fieldBorder,
                      borderWidth: 1,
                    }}
                  >
                    <TextInput
                      className="flex-1 px-md py-sm text-body-md"
                      placeholder={t("Re-enter your password")}
                      placeholderTextColor={LOGIN_COLORS.subtle}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      textContentType="newPassword"
                      style={{ color: LOGIN_COLORS.text }}
                    />
                    <TouchableOpacity
                      className="px-md py-sm"
                      accessibilityRole="button"
                      accessibilityLabel={
                        showConfirmPassword
                          ? t("Hide confirm password")
                          : t("Show confirm password")
                      }
                      onPress={() => setShowConfirmPassword((v) => !v)}
                    >
                      <Ionicons
                        name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color="#8F8A82"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {notice && !error && (
                <View className="bg-tertiary-container rounded-xl px-md py-sm">
                  <Text className="text-on-tertiary-container text-label-sm">{notice}</Text>
                </View>
              )}
              {error && (
                <View className="bg-error-container rounded-xl px-md py-sm">
                  <Text className="text-on-error-container text-label-sm">{error}</Text>
                </View>
              )}
              {message && (
                <View className="bg-secondary-container rounded-xl px-md py-sm">
                  <Text className="text-on-secondary-container text-label-sm">{message}</Text>
                </View>
              )}

              <TouchableOpacity
                className="bg-primary rounded-full py-md items-center mt-xs"
                accessibilityRole="button"
                accessibilityState={{ disabled: authLoading }}
                disabled={authLoading}
                onPress={handleSubmit}
              >
                <Text className="text-on-primary text-label-lg font-semibold">
                  {loading
                    ? mode === "signin"
                      ? t("Signing in...")
                      : t("Creating account...")
                    : mode === "signin"
                      ? t("Sign in")
                      : t("Create account")}
                </Text>
              </TouchableOpacity>

              <View className="flex-row items-center gap-sm my-xs">
                <View
                  className="flex-1 h-px"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.14)" }}
                />
                <Text className="text-label-sm" style={{ color: LOGIN_COLORS.muted }}>
                  {t("or")}
                </Text>
                <View
                  className="flex-1 h-px"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.14)" }}
                />
              </View>

              <TouchableOpacity
                className="flex-row items-center justify-center gap-sm rounded-full py-md"
                accessibilityRole="button"
                accessibilityLabel={t("Sign in with Google")}
                accessibilityState={{ disabled: authLoading }}
                disabled={authLoading}
                onPress={handleGoogleSignIn}
                style={{ borderColor: "rgba(255, 255, 255, 0.16)", borderWidth: 1 }}
              >
                {!googleLoading && <AntDesign name="google" size={20} color="#4285F4" />}
                <Text className="text-label-lg font-semibold" style={{ color: LOGIN_COLORS.text }}>
                  {googleLoading ? t("Continuing...") : t("Continue with Google")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="items-center py-sm"
                accessibilityRole="button"
                accessibilityState={{ disabled: authLoading }}
                disabled={authLoading}
                onPress={() => switchMode(mode === "signin" ? "signup" : "signin")}
              >
                <Text className="text-label-lg" style={{ color: LOGIN_COLORS.muted }}>
                  {mode === "signin"
                    ? t("Don't have an account? ")
                    : t("Already have an account? ")}
                  <Text className="text-primary font-semibold">
                    {mode === "signin" ? t("Sign up") : t("Sign in")}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View className="mt-xxl items-center gap-sm">
              <View className="flex-row items-center gap-md">
                {process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ? (
                  <TouchableOpacity
                    accessibilityRole="link"
                    onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}
                  >
                    <Text className="text-label-sm" style={{ color: LOGIN_COLORS.muted }}>
                      {t("Privacy Policy")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <Text className="text-label-sm" style={{ color: LOGIN_COLORS.subtle }}>
                  ·
                </Text>
                <Text className="text-label-sm" style={{ color: LOGIN_COLORS.subtle }}>
                  © 2026 Lagan
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ForgotPasswordModal
        visible={showForgot}
        onDismiss={() => setShowForgot(false)}
        initialEmail={email}
      />
    </SafeAreaView>
  );
}

function ForgotPasswordModal({
  visible,
  onDismiss,
  initialEmail,
}: {
  visible: boolean;
  onDismiss: () => void;
  initialEmail: string;
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: "error" | "success" } | null>(
    null,
  );

  useEffect(() => {
    if (visible) {
      setEmail(initialEmail);
      setFeedback(null);
    }
  }, [visible, initialEmail]);

  async function send() {
    if (sending) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setFeedback({ text: t("Email is required."), type: "error" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFeedback({ text: t("Enter a valid email address."), type: "error" });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const { error } = await resetPassword(trimmedEmail);
      if (error) setFeedback({ text: t(authErrorMessageKey(error)), type: "error" });
      else setFeedback({ text: t("Reset link sent. Check your email."), type: "success" });
    } catch {
      setFeedback({
        text: t("Network error. Check your connection and try again."),
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="rounded-t-3xl p-lg gap-sm" style={{ backgroundColor: "#1A1A1A" }}>
          <Text className="text-headline-md font-bold" style={{ color: LOGIN_COLORS.text }}>
            {t("Reset password")}
          </Text>
          <Text className="text-body-md" style={{ color: LOGIN_COLORS.muted }}>
            {t("We'll email you a link to set a new password.")}
          </Text>
          <TextInput
            className="rounded-xl px-md py-sm text-body-md"
            placeholder={t("Email")}
            placeholderTextColor={LOGIN_COLORS.subtle}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={{
              backgroundColor: LOGIN_COLORS.field,
              borderColor: LOGIN_COLORS.fieldBorder,
              borderWidth: 1,
              color: LOGIN_COLORS.text,
            }}
          />
          {feedback && (
            <Text
              className={`text-label-sm ${feedback.type === "error" ? "text-error" : "text-secondary"}`}
            >
              {feedback.text}
            </Text>
          )}
          <TouchableOpacity
            className="bg-primary rounded-full py-sm items-center mt-sm"
            accessibilityRole="button"
            onPress={send}
          >
            <Text className="text-on-primary text-label-lg font-semibold">
              {sending ? t("Sending...") : t("Send reset link")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="items-center py-sm"
            accessibilityRole="button"
            onPress={onDismiss}
          >
            <Text style={{ color: LOGIN_COLORS.muted }}>{t("Cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
