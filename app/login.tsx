import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Modal, Linking } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { signIn, signUp, resetPassword } from "@/lib/actions";
import { validatePassword } from "@/lib/password";
import {
  SIGNUP_CONFIRMATION_MESSAGE,
  consumePendingSignupWelcome,
  rememberPendingSignup,
} from "@/lib/auth-welcome";
import LogoChainL from "@/components/logo-chain-l";

type Mode = "signin" | "signup";

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForgot, setShowForgot] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  async function handleSubmit() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError("Email and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "signup") {
      const pwError = validatePassword(password);
      if (pwError) { setError(pwError); return; }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signin") {
        const { error: e } = await signIn(trimmedEmail, password);
        if (e) {
          setError(e.message);
        } else {
          const shouldWelcome = await consumePendingSignupWelcome(trimmedEmail).catch(() => false);
          router.replace(
            shouldWelcome
              ? ({ pathname: "/", params: { newUser: "1" } } as never)
              : ("/" as never),
          );
        }
      } else {
        const { data, error: e } = await signUp(trimmedEmail, password);
        if (e) {
          setError(e.message);
        } else if (!data?.user || data.user.identities?.length === 0) {
          setError("An account with this email already exists. Try signing in instead.");
        } else {
          await rememberPendingSignup(trimmedEmail).catch(() => {});
          setMessage(SIGNUP_CONFIRMATION_MESSAGE);
        }
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-margin-mobile py-xxl">

            {/* Header */}
            <View className="mb-xxl">
              <View className="mb-md">
                <LogoChainL size={44} />
              </View>
              <Text
                className="text-display-sm text-on-background dark:text-d-on-background"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold", letterSpacing: -0.5 }}
              >
                Lagan
              </Text>
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mb-lg">
                A habit tracking app
              </Text>
              <Text
                className="text-headline-lg text-on-background dark:text-d-on-background"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold", letterSpacing: -0.5 }}
              >
                {mode === "signin" ? "Welcome back" : "Create account"}
              </Text>
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mt-xs">
                {mode === "signin"
                  ? "Pick up where you left off."
                  : "Start building better habits today."}
              </Text>
            </View>

            {/* Form */}
            <View className="gap-md">
              <View className="gap-xs">
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant font-semibold">Email</Text>
                <TextInput
                  className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
                  placeholder="you@example.com"
                  placeholderTextColor="#8F8A82"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                />
              </View>

              <View className="gap-xs">
                <View className="flex-row justify-between items-center">
                  <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant font-semibold">Password</Text>
                  {mode === "signin" && (
                    <TouchableOpacity onPress={() => setShowForgot(true)}>
                      <Text className="text-primary text-label-sm font-semibold">Forgot password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View className="flex-row bg-surface-container dark:bg-d-surface-container rounded-xl overflow-hidden items-center">
                  <TextInput
                    className="flex-1 text-on-surface dark:text-d-on-surface px-md py-sm text-body-md"
                    placeholder={mode === "signup" ? "8+ chars, mixed case + number" : "••••••••"}
                    placeholderTextColor="#8F8A82"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textContentType={mode === "signup" ? "newPassword" : "password"}
                  />
                  <TouchableOpacity className="px-md py-sm" onPress={() => setShowPassword(v => !v)}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#8F8A82" />
                  </TouchableOpacity>
                </View>
              </View>

              {mode === "signup" && (
                <View className="gap-xs">
                  <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant font-semibold">Confirm Password</Text>
                  <View className="flex-row bg-surface-container dark:bg-d-surface-container rounded-xl overflow-hidden items-center">
                    <TextInput
                      className="flex-1 text-on-surface dark:text-d-on-surface px-md py-sm text-body-md"
                      placeholder="Re-enter your password"
                      placeholderTextColor="#8F8A82"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      textContentType="newPassword"
                    />
                    <TouchableOpacity className="px-md py-sm" onPress={() => setShowConfirmPassword(v => !v)}>
                      <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#8F8A82" />
                    </TouchableOpacity>
                  </View>
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
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-on-primary text-label-lg font-semibold">
                    {mode === "signin" ? "Sign in" : "Create account"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className="items-center py-sm"
                onPress={() => switchMode(mode === "signin" ? "signup" : "signin")}
              >
                <Text className="text-on-surface-variant dark:text-d-on-surface-variant text-label-lg">
                  {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
                  <Text className="text-primary font-semibold">
                    {mode === "signin" ? "Sign up" : "Sign in"}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View className="mt-xxl items-center gap-sm">
              <View className="flex-row items-center gap-md">
                {process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ? (
                  <TouchableOpacity onPress={() => Linking.openURL(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL!)}>
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">Privacy Policy</Text>
                  </TouchableOpacity>
                ) : null}
                <Text className="text-label-sm text-outline">·</Text>
                <Text className="text-label-sm text-outline">© 2026 Lagan</Text>
              </View>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ForgotPasswordModal visible={showForgot} onDismiss={() => setShowForgot(false)} initialEmail={email} />
    </SafeAreaView>
  );
}

function ForgotPasswordModal({ visible, onDismiss, initialEmail }: { visible: boolean; onDismiss: () => void; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: "error" | "success" } | null>(null);

  async function send() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { setFeedback({ text: "Email is required.", type: "error" }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFeedback({ text: "Enter a valid email address.", type: "error" });
      return;
    }
    setSending(true);
    setFeedback(null);
    try {
      const { error } = await resetPassword(trimmedEmail);
      if (error) setFeedback({ text: error.message, type: "error" });
      else setFeedback({ text: "Reset link sent. Check your email.", type: "success" });
    } catch {
      setFeedback({ text: "Network error. Check your connection and try again.", type: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-t-3xl p-lg gap-sm">
          <Text className="text-headline-md text-on-surface dark:text-d-on-surface font-bold">Reset password</Text>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
            We'll email you a link to set a new password.
          </Text>
          <TextInput
            className="bg-surface-container dark:bg-d-surface-container text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
            placeholder="Email"
            placeholderTextColor="#8F8A82"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {feedback && (
            <Text className={`text-label-sm ${feedback.type === "error" ? "text-error" : "text-secondary"}`}>{feedback.text}</Text>
          )}
          <TouchableOpacity className="bg-primary rounded-full py-sm items-center mt-sm" onPress={send} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text className="text-on-primary text-label-lg font-semibold">Send reset link</Text>}
          </TouchableOpacity>
          <TouchableOpacity className="items-center py-sm" onPress={onDismiss}>
            <Text className="text-on-surface-variant dark:text-d-on-surface-variant">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
