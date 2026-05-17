import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { getItem, setItem } from "@/lib/platform/storage";

type Props = {
  storageKey: string;
  label: string;
  defaultValue?: boolean;
  onChange?: (value: boolean) => void;
};

export default function PersistentToggle({
  storageKey,
  label,
  defaultValue = false,
  onChange,
}: Props) {
  const [checked, setChecked] = useState(defaultValue);

  useEffect(() => {
    getItem(storageKey).then((val: string | null) => {
      if (val !== null) setChecked(val === "true");
    });
  }, [storageKey]);

  function handleToggle() {
    const next = !checked;
    setChecked(next);
    setItem(storageKey, String(next));
    onChange?.(next);
  }

  return (
    <TouchableOpacity
      className="flex-row items-center justify-between py-sm"
      onPress={handleToggle}
    >
      <Text className="text-body-md text-on-surface dark:text-d-on-surface flex-1">{label}</Text>
      <View
        className="w-11 h-6 rounded-full justify-center"
        style={{ backgroundColor: checked ? "#F26B1F" : "#E6E0D5", paddingHorizontal: 2 }}
      >
        <View
          className="w-5 h-5 rounded-full bg-white"
          style={{
            transform: [{ translateX: checked ? 20 : 0 }],
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 2,
            elevation: 2,
          }}
        />
      </View>
    </TouchableOpacity>
  );
}
