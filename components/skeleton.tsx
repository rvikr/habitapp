import { View, type StyleProp, type ViewStyle } from "react-native";

type SkeletonProps = {
  className?: string;
  style?: StyleProp<ViewStyle>;
};

export default function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className={`bg-surface-high dark:bg-d-surface-high ${className}`}
      style={[{ opacity: 0.72 }, style]}
    />
  );
}

export function SkeletonText({
  className = "",
  width = "100%",
}: {
  className?: string;
  width?: number | `${number}%`;
}) {
  return <Skeleton className={`h-4 rounded-full ${className}`} style={{ width }} />;
}
