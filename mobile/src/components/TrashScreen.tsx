import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import {
  permanentDeleteConfirmMessage,
  permanentDeleteManyConfirmMessage,
} from "../lib/confirm-copy";
import { useConvexBackend } from "../lib/data-backend";

interface TrashScreenProps {
  visible: boolean;
  onClose: () => void;
  userId?: string;
}

type TrashRow = {
  id: string;
  title: string;
  content: string;
  deleted_at: string;
};

export function TrashScreen({ visible, onClose, userId }: TrashScreenProps) {
  const convexBackend = useConvexBackend();
  const convexUserId = userId as Id<"users"> | undefined;
  const nowMs = useMemo(() => Date.now(), [visible]);
  const convexItems = useQuery(
    api.items.listTrash,
    visible && convexBackend && convexUserId
      ? { userId: convexUserId, nowMs }
      : "skip",
  );
  const restoreMutation = useMutation(api.items.restoreFromTrash);
  const purgeMutation = useMutation(api.items.permanentlyDeleteFromTrash);

  const [legacyItems, setLegacyItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { requestConfirm, confirmDialog } = useConfirmDialog();

  const refreshLegacy = useCallback(async () => {
    if (!visible || convexBackend) return;
    setLoading(true);
    setError(null);
    try {
      setItemsSafe(await listTrashItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
      setItemsSafe([]);
    } finally {
      setLoading(false);
    }
  }, [visible, convexBackend]);

  function setItemsSafe(next: TrashItem[]) {
    setLegacyItems(next);
  }

  useEffect(() => {
    void refreshLegacy();
  }, [refreshLegacy]);

  useEffect(() => {
    if (!visible) setSelected(new Set());
  }, [visible]);

  const items: TrashRow[] = useMemo(() => {
    if (convexBackend) {
      return (convexItems ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        deleted_at: new Date(row.deletedAt).toISOString(),
      }));
    }
    return legacyItems.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      deleted_at: row.deleted_at,
    }));
  }, [convexBackend, convexItems, legacyItems]);

  const selectedCount = selected.size;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const showLoading = convexBackend
    ? visible && convexItems === undefined
    : loading;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(items.map((item) => item.id)));
  }

  async function restoreIds(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (convexBackend && convexUserId) {
        await restoreMutation({ userId: convexUserId, itemIds: ids });
      } else {
        for (const id of ids) {
          await restoreTrashItem(id);
        }
        await refreshLegacy();
      }
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "שחזור נכשל");
    } finally {
      setBusy(false);
    }
  }

  async function purgeIds(ids: string[], message: string) {
    if (ids.length === 0) return;
    const ok = await requestConfirm({
      title: "מחיקה לצמיתות",
      message,
      confirmLabel: "מחק לצמיתות",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      if (convexBackend && convexUserId) {
        await purgeMutation({ userId: convexUserId, itemIds: ids });
      } else {
        for (const id of ids) {
          await permanentlyDeleteTrashItem(id);
        }
        await refreshLegacy();
      }
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>סל מחזור</Text>
            <Text style={styles.subtitle}>
              פריטים שנמחקו נשמרים כאן למשך {TRASH_RETENTION_DAYS} יום, ואז נמחקים
              לצמיתות.
            </Text>

            {showLoading ? (
              <ActivityIndicator color="#4f46e5" style={styles.loader} />
            ) : (
              <ScrollView style={styles.list}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {items.length === 0 ? (
                  <Text style={styles.empty}>סל המחזור ריק.</Text>
                ) : (
                  <>
                    <View style={styles.bulkBar}>
                      <Pressable
                        style={[styles.bulkBtn, styles.selectBtn, busy && styles.btnDisabled]}
                        disabled={busy}
                        onPress={toggleAll}
                      >
                        <Text style={styles.selectText}>
                          {allSelected ? "בטל בחירה" : "בחר הכל"}
                        </Text>
                      </Pressable>
                      {selectedCount > 0 ? (
                        <View style={styles.bulkActions}>
                          <Pressable
                            style={[styles.restoreBtn, busy && styles.btnDisabled]}
                            disabled={busy}
                            onPress={() => void restoreIds([...selected])}
                          >
                            <Text style={styles.restoreText}>שחזר ({selectedCount})</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.deleteBtn, busy && styles.btnDisabled]}
                            disabled={busy}
                            onPress={() =>
                              void purgeIds(
                                [...selected],
                                permanentDeleteManyConfirmMessage(selectedCount),
                              )
                            }
                          >
                            <Text style={styles.deleteText}>
                              מחק ({selectedCount})
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>

                    {items.map((item) => {
                      const daysLeft = daysUntilTrashExpiry(item.deleted_at);
                      const isSelected = selected.has(item.id);
                      return (
                        <View key={item.id} style={styles.item}>
                          <Pressable
                            style={styles.rowSelect}
                            onPress={() => toggleOne(item.id)}
                            disabled={busy}
                          >
                            <View
                              style={[
                                styles.checkbox,
                                isSelected && styles.checkboxOn,
                              ]}
                            >
                              {isSelected ? (
                                <Text style={styles.checkboxMark}>✓</Text>
                              ) : null}
                            </View>
                            <View style={styles.itemBody}>
                              <Text style={styles.itemTitle}>{item.title}</Text>
                              {item.content ? (
                                <Text style={styles.itemContent} numberOfLines={2}>
                                  {item.content}
                                </Text>
                              ) : null}
                              <Text style={styles.itemMeta}>
                                נמחק {formatDeletedAt(item.deleted_at)}
                                {daysLeft > 0
                                  ? ` · נמחק לצמיתות בעוד ${daysLeft} ימים`
                                  : ""}
                              </Text>
                            </View>
                          </Pressable>
                          <View style={styles.actions}>
                            <Pressable
                              style={[styles.restoreBtn, busy && styles.btnDisabled]}
                              disabled={busy}
                              onPress={() => void restoreIds([item.id])}
                            >
                              <Text style={styles.restoreText}>שחזר</Text>
                            </Pressable>
                            <Pressable
                              style={[styles.deleteBtn, busy && styles.btnDisabled]}
                              disabled={busy}
                              onPress={() =>
                                void purgeIds(
                                  [item.id],
                                  permanentDeleteConfirmMessage(item.title),
                                )
                              }
                            >
                              <Text style={styles.deleteText}>מחק לצמיתות</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </>
                )}
              </ScrollView>
            )}

            <Pressable style={styles.close} onPress={onClose}>
              <Text style={styles.closeText}>סגור</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {confirmDialog}
    </>
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
  list: { maxHeight: 420 },
  empty: {
    textAlign: "right",
    color: "#64748b",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
  },
  error: { color: "#dc2626", textAlign: "right", marginBottom: 8, fontSize: 13 },
  bulkBar: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  bulkActions: { flexDirection: "row-reverse", gap: 8 },
  bulkBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectBtn: { backgroundColor: "#f1f5f9" },
  selectText: { color: "#334155", fontWeight: "600", fontSize: 13 },
  item: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 12,
  },
  rowSelect: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxOn: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },
  checkboxMark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  itemBody: { flex: 1 },
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
