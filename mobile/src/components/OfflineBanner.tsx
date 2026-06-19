import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface OfflineBannerProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
}

export function OfflineBanner({ isOnline, isSyncing, pendingCount }: OfflineBannerProps) {
  if (isOnline && !isSyncing && pendingCount === 0) return null;

  return (
    <View style={[styles.banner, !isOnline && styles.offline]}>
      {isSyncing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : null}
      <Text style={styles.text}>
        {!isOnline
          ? "אופליין — פעולות יסתנכרנו כשהרשת תחזור"
          : pendingCount > 0
            ? `מסנכרן ${pendingCount} פעולות...`
            : "מסנכרן..."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  offline: { backgroundColor: "#b45309" },
  text: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
