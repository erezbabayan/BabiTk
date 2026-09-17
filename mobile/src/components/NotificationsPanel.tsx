import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { UserNotification } from "../lib/user-notifications";

interface NotificationsPanelProps {
  visible: boolean;
  rows: UserNotification[] | undefined;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenItem?: (itemId: string | null) => void;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function NotificationsPanel({
  visible,
  rows,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onOpenItem,
}: NotificationsPanelProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>התראות</Text>
            <View style={styles.headerActions}>
              <Pressable onPress={onMarkAllRead}>
                <Text style={styles.action}>סמן הכל כנקרא</Text>
              </Pressable>
              <Pressable onPress={onClose}>
                <Text style={styles.action}>סגור</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.list}>
            {rows === undefined ? (
              <Text style={styles.empty}>טוען…</Text>
            ) : rows.length === 0 ? (
              <Text style={styles.empty}>אין התראות עדיין</Text>
            ) : (
              rows.map((row) => (
                <Pressable
                  key={row.id}
                  style={[styles.row, !row.read && styles.rowUnread]}
                  onPress={() => {
                    if (!row.read) onMarkRead(row.id);
                    onOpenItem?.(row.item_id);
                    onClose();
                  }}
                >
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowBody}>{row.body}</Text>
                  <Text style={styles.rowMeta}>{formatWhen(row.fire_at)}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  headerActions: {
    flexDirection: "row-reverse",
    gap: 14,
  },
  action: {
    color: "#4f46e5",
    fontSize: 14,
    fontWeight: "600",
  },
  list: {
    padding: 12,
    gap: 8,
  },
  empty: {
    textAlign: "center",
    color: "#64748b",
    paddingVertical: 28,
  },
  row: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 12,
  },
  rowUnread: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
  },
  rowTitle: {
    textAlign: "right",
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  rowBody: {
    textAlign: "right",
    color: "#334155",
    fontSize: 13,
    lineHeight: 18,
  },
  rowMeta: {
    textAlign: "left",
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 6,
  },
});
