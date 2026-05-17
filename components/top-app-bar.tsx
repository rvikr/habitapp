import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

type Props = {
  title: string;
  showBack?: boolean;
  trailing?: React.ReactNode;
};

export default function TopAppBar({ title, showBack, trailing }: Props) {
  const router = useRouter();
  return (
    <View className="flex-row items-center px-margin-mobile py-sm bg-background dark:bg-d-background">
      {showBack && (
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
      )}
      <Text className="flex-1 text-headline-md text-on-background dark:text-d-on-background">
        {title}
      </Text>
      {trailing}
    </View>
  );
}
