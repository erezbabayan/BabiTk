import Svg, { Path } from "react-native-svg";
import { StyleSheet, View } from "react-native";

const LEAF_STROKE: Record<"slate" | "blue" | "orange", string> = {
  slate: "#78716c",
  blue: "#3b82f6",
  orange: "#ea580c",
};

export function SearchLeafDeco({ tone }: { tone: "slate" | "blue" | "orange" }) {
  const stroke = LEAF_STROKE[tone];
  return (
    <View style={styles.frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
        <Path d="M12 19.5V7" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
        <Path
          d="M12 11.5c-2.8-1.2-4.5-3.2-4.8-5.5.8-2.2 3.5-3.2 4.8-1.5 1.3-1.7 4-0.7 4.8 1.5-.3 2.3-2 4.3-4.8 5.5z"
          stroke={stroke}
          strokeWidth={1.35}
          strokeLinejoin="round"
        />
        <Path
          d="M12 15c-2.2-0.8-3.6-2.4-4-4.2M12 15c2.2-0.8 3.6-2.4 4-4.2"
          stroke={stroke}
          strokeWidth={1.25}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(168, 162, 158, 0.75)",
    borderRadius: 3,
    backgroundColor: "rgba(255, 254, 251, 0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
});
