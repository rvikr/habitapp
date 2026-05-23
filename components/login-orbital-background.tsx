import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

export default function LoginOrbitalBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.outer} />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 390 844"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Path
          d="M430 112 C372 154 318 138 290 166 C258 198 362 210 350 242 C336 280 270 252 232 282 C204 304 238 326 294 310 C342 294 390 308 420 330"
          fill="none"
          stroke="#F1F1F1"
          strokeLinecap="round"
          strokeOpacity={0.72}
          strokeWidth={1}
        />
        <Circle cx={356} cy={150} r={4.2} fill="#FFFFFF" fillOpacity={0.9} />
        <Circle cx={316} cy={218} r={12} fill="#FFFFFF" fillOpacity={0.94} />
        <Circle
          cx={316}
          cy={218}
          r={25}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.82}
          strokeWidth={1.2}
        />
        <Circle
          cx={248}
          cy={284}
          r={3.6}
          fill="#1A1A1A"
          stroke="#FFFFFF"
          strokeOpacity={0.78}
          strokeWidth={1.1}
        />
        <Circle
          cx={356}
          cy={278}
          r={3.6}
          fill="#1A1A1A"
          stroke="#FFFFFF"
          strokeOpacity={0.78}
          strokeWidth={1.1}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1A1A1A",
  },
});
