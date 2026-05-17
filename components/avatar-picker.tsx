import { View, Text, FlatList, TouchableOpacity, Image } from "react-native";
import { avatarUrl, AVATAR_STYLES, AVATAR_SEED_PRESETS, type AvatarStyle } from "@/lib/avatar";

type Props = {
  style: AvatarStyle;
  seed: string;
  onStyleChange: (s: AvatarStyle) => void;
  onSeedChange: (s: string) => void;
};

export default function AvatarPicker({ style, seed, onStyleChange, onSeedChange }: Props) {
  const previewUrl = avatarUrl(style, seed);

  return (
    <View className="px-margin-mobile">
      {/* Preview */}
      <View className="items-center py-lg">
        <Image
          source={{ uri: previewUrl }}
          className="w-28 h-28 rounded-full bg-primary-fixed"
        />
      </View>

      {/* Style picker */}
      <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">STYLE</Text>
      <View className="flex-row flex-wrap gap-sm mb-lg">
        {AVATAR_STYLES.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => onStyleChange(s.id)}
            className={`px-md py-xs rounded-full ${style === s.id ? "bg-primary" : "bg-surface-container dark:bg-d-surface-container"}`}
          >
            <Text className={`text-label-lg ${style === s.id ? "text-on-primary" : "text-on-surface dark:text-d-on-surface"}`}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Seed picker */}
      <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">AVATAR</Text>
      <FlatList
        data={AVATAR_SEED_PRESETS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => onSeedChange(item)}
            className="mr-sm items-center gap-xs"
          >
            <Image
              source={{ uri: avatarUrl(style, item) }}
              className="w-14 h-14 rounded-full"
              style={{ borderWidth: 2, borderColor: seed === item ? "#F26B1F" : "transparent" }}
            />
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">{item}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
