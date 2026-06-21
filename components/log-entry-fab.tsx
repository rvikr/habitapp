import { TouchableOpacity, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

type Props = { onPress: () => void; accessibilityLabel?: string };

export default function LogEntryFab({ onPress, accessibilityLabel = "Log progress" }: Props) {
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <MaterialCommunityIcons name="plus" size={28} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F26B1F",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 8px rgba(242, 107, 31, 0.35)",
  },
});
