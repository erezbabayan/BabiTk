import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  daysUntilTrashExpiry,
  formatDeletedAt,
  TRASH_RETENTION_DAYS,
  type TrashItem,
} from "../lib/trash";
import {
  listTrashItems,
  permanentlyDeleteTrashItem,
  restoreTrashItem,
} from "../lib/trash-api";

interface TrashScreenProps {
  visible: boolean;
  onClose: () => void;
}

export function TrashScreen({ visible, onClose }: TrashScreenProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listTrashItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRestore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreTrashItem(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שחזור נכשל");
    } finally {
      setBusyId(null);
    }
  }

  function handlePermanentDelete(id: string, title: string) {
    Alert.alert("מחיקה לצמיתות", `למחוק את "${title}" לצמיתות?`, [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusyId(id);
            setError(null);
            try {
              await permanentlyDeleteTrashItem(id);
              await refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "מחיקה נכשלה");
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>סל מחזור</Text>
          <Text style={styles.subtitle}>
            פריטים שנמחקו נשמרים כאן למשך {TRASH_RETENTION_DAYS} יום, ואז נמחקים לצמיתות.
          </Text>

          {loading ? (
            <ActivityIndicator color="#4f46e5" style={styles.loader} />
          ) : (
            <ScrollView style={styles.list}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {items.length === 0 ? (
                <Text style={styles.empty}>סל המחזור ריק.</Text>
              ) : (
                items.map((item) => {
                  const busy = busyId === item.id;
                  const daysLeft = daysUntilTrashExpiry(item.deleted_at);
                  return (
                    <View key={item.id} style={styles.item}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.content ? (
                        <Text style={styles.itemContent} numberOfLines={2}>
                          {item.content}
                        </Text>
                      ) : null}
                      <Text style={styles.itemMeta}>
                        נמחק {formatDeletedAt(item.deleted_at)}
                        {daysLeft > 0 ? ` · נמחק לצמיתות בעוד ${daysLeft} ימים` : ""}
                      </Text>
                      <View style={styles.actions}>
                        <Pressable
                          style={[styles.restoreBtn, busy && styles.btnDisabled]}
                          disabled={busy}
                          onPress={() => void handleRestore(item.id)}
                        >
                          <Text style={styles.restoreText}>שחזר</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.deleteBtn, busy && styles.btnDisabled]}
                          disabled={busy}
                          onPress={() => handlePermanentDelete(item.id, item.title)}
                        >
                          <Text style={styles.deleteText}>מחק לצמיתות</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>סגור</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    padding: 20,
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "85%",
  },
  title: { fontSize: 18, fontWeight: "800", textAlign: "right", marginBottom: 8 },
  subtitle: { fontSize: 13, color: "#64748b", textAlign: "right", marginBottom: 12 },
  loader: { marginVertical: 24 },
  list: { maxHeight: 360 },
  empty: {
    textAlign: "right",
    color: "#64748b",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
  },
  error: { color: "#dc2626", textAlign: "right", marginBottom: 8, fontSize: 13 },
  item: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 12,
  },
  itemTitle: { fontSize: 15, fontWeight: "600", textAlign: "right", color: "#0f172a" },
  itemContent: { fontSize: 13, color: "#64748b", textAlign: "right", marginTop: 2 },
  itemMeta: { fontSize: 11, color: "#94a3b8", textAlign: "right", marginTop: 4 },
  actions: { flexDirection: "row-reverse", gap: 8, marginTop: 10 },
  restoreBtn: {
    backgroundColor: "#dcfce7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  restoreText: { color: "#047857", fontWeight: "600", fontSize: 13 },
  deleteBtn: {
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteText: { color: "#b91c1c", fontWeight: "600", fontSize: 13 },
  btnDisabled: { opacity: 0.5 },
  close: { marginTop: 16, alignItems: "center" },
  closeText: { color: "#64748b", fontSize: 15 },
});
