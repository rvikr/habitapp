import { useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getBadgeShareMessage, getRankShareMessage } from "@/lib/utils/share-messages";
import { useTheme } from "@/components/theme-provider";

const APP_URL = "https://lagan.health";

const TONE_ACCENT: Record<string, string> = {
  yellow: "#f59e0b",
  orange: "#ea580c",
  purple: "#7c3aed",
  teal: "#0d9488",
  indigo: "#4338ca",
  red: "#dc2626",
};

export type ShareCardData =
  | { kind: "badge"; id: string; name: string; description: string; tone: string }
  | { kind: "rank"; rank: number; streak: number; topPct: number | null };

interface Props {
  data: ShareCardData | null;
  onClose: () => void;
}

export default function ShareCardModal({ data, onClose }: Props) {
  const [sharing, setSharing] = useState(false);
  const { colorScheme } = useTheme();
  const isDark = colorScheme === "dark";
  // The card preview stays dark in both themes — it mirrors the shared image.
  // Only the sheet chrome around it follows the active theme.
  const sheetBg = isDark ? "#111" : "#FFFFFF";
  const mutedText = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const secondaryText = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.6)";
  const secondaryBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  const getMessage = useCallback(() => {
    if (!data) return { tagline: "", subtitle: "", cardPath: "" };
    if (data.kind === "badge") {
      const msg = getBadgeShareMessage(data.id, data.name);
      const cardPath = `/api/og/card?type=badge&id=${data.id}&name=${encodeURIComponent(data.name)}&tone=${data.tone}`;
      return { ...msg, cardPath };
    } else {
      const msg = getRankShareMessage({
        rank: data.rank,
        streak: data.streak,
        topPct: data.topPct,
      });
      const cardPath = `/api/og/card?type=rank&rank=${data.rank}&streak=${data.streak}&pct=${data.topPct ?? 50}`;
      return { ...msg, cardPath };
    }
  }, [data]);

  const accentColor =
    data?.kind === "badge"
      ? (TONE_ACCENT[data.tone] ?? "#4338ca")
      : data?.kind === "rank"
        ? data.topPct != null && data.topPct <= 1
          ? "#7c3aed"
          : data.topPct != null && data.topPct <= 5
            ? "#d97706"
            : data.topPct != null && data.topPct <= 10
              ? "#0d9488"
              : "#4338ca"
        : "#4338ca";

  const { tagline, subtitle, cardPath } = getMessage();

  const handleShareText = useCallback(async () => {
    const shareUrl = data?.kind === "rank" ? `${APP_URL}/leaderboard` : `${APP_URL}/achievements`;
    try {
      await Share.share({
        message: `${tagline}\n\n${shareUrl}`,
        ...(Platform.OS === "ios" ? { url: shareUrl } : {}),
      });
    } catch {
      // dismissed
    }
  }, [data, tagline]);

  const handleShareImage = useCallback(async () => {
    setSharing(true);
    try {
      const url = `${APP_URL}${cardPath}`;
      const downloaded = await File.downloadFileAsync(url, Paths.cache);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: "image/png",
          dialogTitle: "Share your Lagan card",
          UTI: "public.png",
        });
      } else {
        await handleShareText();
      }
    } catch {
      await handleShareText();
    } finally {
      setSharing(false);
    }
  }, [cardPath, handleShareText]);

  if (!data) return null;

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" }}>
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: sheetBg }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  color: mutedText,
                  fontSize: 13,
                  fontWeight: "600",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                Your Card
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <MaterialCommunityIcons name="close" size={22} color={mutedText} />
              </TouchableOpacity>
            </View>

            {/* Card preview */}
            <View
              style={{
                backgroundColor: "#0D0D0D",
                borderRadius: 16,
                padding: 36,
                marginBottom: 20,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
              }}
            >
              {/* Accent bar */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  backgroundColor: accentColor,
                }}
              />

              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 26,
                  fontWeight: "700",
                  lineHeight: 32,
                  letterSpacing: -0.5,
                  marginBottom: 12,
                  marginTop: 8,
                }}
              >
                {tagline}
              </Text>

              <Text
                style={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 14,
                  fontWeight: "400",
                  marginBottom: 24,
                }}
              >
                {subtitle}
              </Text>

              <Text
                style={{
                  color: "rgba(255,255,255,0.2)",
                  fontSize: 11,
                  alignSelf: "flex-end",
                }}
              >
                lagan.health
              </Text>
            </View>

            {/* Action buttons */}
            <TouchableOpacity
              onPress={handleShareImage}
              disabled={sharing}
              style={{
                backgroundColor: accentColor,
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                marginBottom: 10,
                opacity: sharing ? 0.7 : 1,
              }}
            >
              {sharing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <MaterialCommunityIcons name="share-variant" size={18} color="#fff" />
              )}
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                {sharing ? "Preparing…" : "Share Card"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShareText}
              style={{
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: secondaryBorder,
                marginBottom: 4,
              }}
            >
              <Text style={{ color: secondaryText, fontSize: 14, fontWeight: "600" }}>
                Share as Text
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
