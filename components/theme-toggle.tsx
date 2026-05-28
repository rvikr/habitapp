import { TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTheme } from "./theme-provider";

export default function ThemeToggle() {
  const { colorScheme, toggle } = useTheme();
  return (
    <TouchableOpacity
      onPress={toggle}
      className="p-sm"
      accessibilityRole="button"
      accessibilityLabel={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <MaterialCommunityIcons
        name={colorScheme === "dark" ? "weather-sunny" : "weather-night"}
        size={22}
        color="#F26B1F"
      />
    </TouchableOpacity>
  );
}
