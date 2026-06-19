import { StyleSheet, View } from "react-native";

/** Three-column accent stripe — matches web login card (Inbox / Today / Notes). */
export function BrandStripe() {
  return (
    <View style={styles.stripe} accessibilityElementsHidden>
      <View style={[styles.segment, styles.inbox]} />
      <View style={[styles.segment, styles.today]} />
      <View style={[styles.segment, styles.notes]} />
    </View>
  );
}

const styles = StyleSheet.create({
  stripe: { flexDirection: "row", height: 6 },
  segment: { flex: 1 },
  inbox: { backgroundColor: "#94a3b8" },
  today: { backgroundColor: "#3b82f6" },
  notes: { backgroundColor: "#f97316" },
});
