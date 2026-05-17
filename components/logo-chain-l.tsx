import Svg, { Rect, Path } from "react-native-svg";

type Props = {
  size?: number;
  primaryColor?: string;
  accentColor?: string;
};

// Chain-L mark: two chain links interlocked, oriented as an L.
// "Don't break the chain" — each link is a habit day, together they form Lagan's L.
export default function LogoChainL({ size = 96, primaryColor = "#F26B1F", accentColor = "#C24E0D" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {/* vertical link */}
      <Rect x="18" y="10" width="32" height="56" rx="16" stroke={primaryColor} strokeWidth="8" />
      {/* horizontal link, interlocked */}
      <Rect x="34" y="42" width="56" height="32" rx="16" stroke={accentColor} strokeWidth="8" />
      {/* over-under weave segment — vertical link crosses over horizontal */}
      <Path d="M42 50 L42 66" stroke={primaryColor} strokeWidth="8" strokeLinecap="round" />
    </Svg>
  );
}
