import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { ReminderAlertItem } from "../hooks/useReminderAlerts";

interface ReminderAlertModalProps {
  alert: ReminderAlertItem | null;
  onDismiss: () => void;
  onAcknowledge: () => void;
  onOpen?: () => void;
}

export function ReminderAlertModal({
  alert,
  onDismiss,
  onAcknowledge,
  onOpen,
}: ReminderAlertModalProps) {
  return (
    <Modal
      visible={Boolean(alert)}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>תזכורת</Text>
            <Text style={styles.bell}>🔔</Text>
          </View>
          <Text style={styles.title}>{alert?.title}</Text>
          <Text style={styles.body}>{alert?.body}</Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.primary}
              onPress={() => {
                onAcknowledge();
                onOpen?.();
              }}
            >
              <Text style={styles.primaryText}>פתח</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={onAcknowledge}>
              <Text style={styles.secondaryText}>סמן כנקרא</Text>
            </Pressable>
            <Pressable style={styles.later} onPress={onDismiss}>
              <Text style={styles.laterText}>מאוחר יותר</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  eyebrow: {
    color: "#b45309",
    fontSize: 12,
    fontWeight: "700",
  },
  bell: { fontSize: 22 },
  title: {
    textAlign: "right",
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  body: {
    textAlign: "right",
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
  },
  actions: {
    marginTop: 18,
    gap: 8,
  },
  primary: {
    backgroundColor: "#d97706",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondary: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryText: { color: "#334155", fontWeight: "600", fontSize: 14 },
  later: { paddingVertical: 8, alignItems: "center" },
  laterText: { color: "#94a3b8", fontSize: 14 },
});
