import { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Share,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getBadgeShareMessage, getRankShareMessage } from "@/lib/utils/share-messages";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import LogoChainL from "@/components/logo-chain-l";

const APP_URL = "https://lagan.health";
const CARD_PITCH =
  "Lagan helps you build better habits with simple tracking, streaks, smart reminders, and AI coaching.";

const TONE_ACCENT: Record<string, string> = {
  yellow: "#E5A84A",
  orange: "#F26B1F",
  purple: "#7C5CC4",
  teal: "#2A8A5A",
  indigo: "#4F72B8",
  red: "#D84949",
};

export type ShareCardData =
  | {
      kind: "badge";
      id: string;
      name: string;
      description: string;
      icon: string;
      tone: string;
    }
  | { kind: "rank"; rank: number };

interface Props {
  data: ShareCardData | null;
  onClose: () => void;
}

function badgeMonogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "✓";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function cardUrl(data: ShareCardData) {
  const base = `${APP_URL}/api/og/card?ratio=portrait&v=2`;
  if (data.kind === "rank") return `${base}&type=rank&rank=${data.rank}`;
  return (
    `${base}&type=badge&id=${encodeURIComponent(data.id)}` +
    `&name=${encodeURIComponent(data.name)}` +
    `&description=${encodeURIComponent(data.description)}` +
    `&icon=${encodeURIComponent(data.icon)}` +
    `&tone=${encodeURIComponent(data.tone)}`
  );
}

function ShareCardPreview({
  data,
  accentColor,
  width,
}: {
  data: ShareCardData;
  accentColor: string;
  width: number;
}) {
  return (
    <View
      style={{
        width,
        height: width * 1.25,
        alignSelf: "center",
        backgroundColor: "#FAF7F2",
        borderRadius: 24,
        padding: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#E6E0D5",
        boxShadow: "0 12px 32px rgba(23, 19, 17, 0.12)",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: 190,
          height: 190,
          borderRadius: 95,
          top: -90,
          right: -65,
          backgroundColor: `${accentColor}22`,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 150,
          height: 150,
          borderRadius: 75,
          bottom: -90,
          left: -70,
          backgroundColor: "#3EBB7F18",
        }}
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <LogoChainL size={34} />
        <Text style={{ color: "#171311", fontSize: 18, fontWeight: "800", letterSpacing: -0.4 }}>
          Lagan
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: "center", paddingVertical: 16 }}>
        {data.kind === "badge" ? (
          <>
            <Text
              style={{
                color: accentColor,
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              Achievement unlocked
            </Text>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${accentColor}18`,
                borderWidth: 1,
                borderColor: `${accentColor}45`,
                marginBottom: 16,
              }}
            >
              <Text style={{ color: accentColor, fontSize: 24, fontWeight: "800" }}>
                {badgeMonogram(data.name)}
              </Text>
            </View>
            <Text
              style={{
                color: "#171311",
                fontSize: 28,
                lineHeight: 33,
                fontWeight: "800",
                letterSpacing: -0.8,
                marginBottom: 9,
              }}
            >
              {data.name}
            </Text>
            <Text style={{ color: "#5A554D", fontSize: 14, lineHeight: 20 }}>
              {data.description}
            </Text>
          </>
        ) : (
          <>
            <Text
              style={{
                color: "#F26B1F",
                fontSize: 11,
                fontWeight: "800",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Global leaderboard
            </Text>
            <Text
              style={{
                color: "#171311",
                fontSize: 64,
                lineHeight: 70,
                fontWeight: "800",
                letterSpacing: -3,
              }}
            >
              #{data.rank}
            </Text>
            <Text style={{ color: "#5A554D", fontSize: 13, marginBottom: 18 }}>All-time rank</Text>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: "#FFE6CF",
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <Text style={{ color: "#C24E0D", fontSize: 16, fontWeight: "800" }}>
                Can you beat me?
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: "#E6E0D5", paddingTop: 14, gap: 8 }}>
        <Text style={{ color: "#5A554D", fontSize: 10.5, lineHeight: 15 }}>{CARD_PITCH}</Text>
        <Text style={{ color: "#F26B1F", fontSize: 11, fontWeight: "800" }}>lagan.health</Text>
      </View>
    </View>
  );
}

export default function ShareCardModal({ data, onClose }: Props) {
  const [sharing, setSharing] = useState(false);
  const window = useWindowDimensions();
  const { colorScheme } = useTheme();
  const { t } = useLanguage();
  const isDark = colorScheme === "dark";
  const sheetBg = isDark ? "#16161C" : "#FFFFFF";
  const mutedText = isDark ? "#B5B8C0" : "#5A554D";
  const secondaryText = isDark ? "#FFFFFF" : "#171311";
  const secondaryBorder = isDark ? "#2C2C36" : "#E6E0D5";
  const accentColor = data?.kind === "badge" ? (TONE_ACCENT[data.tone] ?? "#F26B1F") : "#F26B1F";
  const previewWidth = Math.min(
    340,
    window.width - 40,
    Math.max(200, (window.height * 0.94 - 210) / 1.25),
  );
  const sheetHeight = Math.min(window.height * 0.94, previewWidth * 1.25 + 210);

  const handleShareText = useCallback(async () => {
    if (!data) return;
    const shareUrl = data.kind === "rank" ? `${APP_URL}/leaderboard` : `${APP_URL}/achievements`;
    const message =
      data.kind === "rank"
        ? getRankShareMessage(data.rank)
        : getBadgeShareMessage(data.name, data.description);
    try {
      await Share.share({
        message: `${message.tagline}${data.kind === "badge" ? `\n${message.subtitle}` : ""}\n\n${shareUrl}`,
        ...(Platform.OS === "ios" ? { url: shareUrl } : {}),
      });
    } catch {
      // Dismissed.
    }
  }, [data]);

  const handleShareImage = useCallback(async () => {
    if (!data) return;
    setSharing(true);
    try {
      const downloaded = await File.downloadFileAsync(cardUrl(data), Paths.cache);
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
  }, [data, handleShareText]);

  if (!data) return null;

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View
        style={{
          position: Platform.OS === "web" ? ("fixed" as never) : "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "flex-end",
        }}
      >
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: sheetBg, height: sheetHeight }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  color: mutedText,
                  fontSize: 13,
                  fontWeight: "700",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {t("Your Card")}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t("Close share card")}
              >
                <MaterialCommunityIcons name="close" size={22} color={mutedText} />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 14 }}>
              <ShareCardPreview data={data} accentColor={accentColor} width={previewWidth} />
            </View>

            <TouchableOpacity
              onPress={() => {
                if (!sharing) void handleShareImage();
              }}
              accessibilityRole="button"
              accessibilityLabel={sharing ? t("Preparing...") : t("Share Card")}
              accessibilityState={{ disabled: sharing }}
              style={{
                backgroundColor: "#F26B1F",
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                marginBottom: 8,
                opacity: sharing ? 0.7 : 1,
              }}
            >
              {!sharing && <MaterialCommunityIcons name="share-variant" size={18} color="#fff" />}
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>
                {sharing ? t("Preparing...") : t("Share Card")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShareText}
              accessibilityRole="button"
              accessibilityLabel={t("Share as Text")}
              style={{
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: secondaryBorder,
                marginBottom: 4,
              }}
            >
              <Text style={{ color: secondaryText, fontSize: 14, fontWeight: "700" }}>
                {t("Share as Text")}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
