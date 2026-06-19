import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BOARD_SETTINGS_LABELS,
  INBOX_ARCHIVE_HOURS_OPTIONS,
  type InboxArchiveHours,
} from "../lib/board-settings";
import { getBoardSettings, saveBoardSettings } from "../lib/board-settings-api";

type BoardSection = "menu" | "inbox" | "today" | "notes";

interface BoardSettingsScreenProps {
  visible: boolean;
  onClose: () => void;
}

export function BoardSettingsScreen({ visible, onClose }: BoardSettingsScreenProps) {
  const [section, setSection] = useState<BoardSection>("menu");
  const [hours, setHours] = useState<InboxArchiveHours>(48);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    try {
      const settings = await getBoardSettings();
      setHours(settings.inbox_archive_hours);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינה נכשלה");
    } finally {
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!visible) setSection("menu");
  }, [visible]);

  async function handleSelectHours(nextHours: InboxArchiveHours) {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveBoardSettings({ inbox_archive_hours: nextHours });
      setHours(saved.inbox_archive_hours);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  const title =
    section === "menu"
      ? "הגדרות בורדים"
      : section === "inbox"
        ? BOARD_SETTINGS_LABELS.inbox
        : section === "today"
          ? BOARD_SETTINGS_LABELS.today
          : BOARD_SETTINGS_LABELS.notes;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            {section !== "menu" ? (
              <Pressable onPress={() => setSection("menu")}>
                <Text style={styles.backLink}>חזור</Text>
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <ActivityIndicator color="#4f46e5" style={styles.loader} />
          ) : (
            <ScrollView style={styles.body}>
              {section === "menu" ? (
                <>
                  <Pressable style={styles.row} onPress={() => setSection("inbox")}>
                    <Text style={styles.rowText}>📓 {BOARD_SETTINGS_LABELS.inbox}</Text>
                  </Pressable>
                  <Pressable style={styles.row} onPress={() => setSection("today")}>
                    <Text style={styles.rowText}>✅ {BOARD_SETTINGS_LABELS.today}</Text>
                  </Pressable>
                  <Pressable style={styles.row} onPress={() => setSection("notes")}>
                    <Text style={styles.rowText}>📝 {BOARD_SETTINGS_LABELS.notes}</Text>
                  </Pressable>
                </>
              ) : null}

              {section === "inbox" ? (
                <>
                  <Text style={styles.help}>
                    פריטים שלא נוגעים בהם במחברת יעברו אוטומטית לארכיון לאחר פרק הזמן שתבחר.
                  </Text>
                  <Text style={styles.fieldLabel}>מעבר לארכיון אוטומטי</Text>
                  {INBOX_ARCHIVE_HOURS_OPTIONS.map((option) => (
                    <Pressable
                      key={option.hours}
                      style={[styles.option, hours === option.hours && styles.optionActive]}
                      disabled={saving}
                      onPress={() => void handleSelectHours(option.hours)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          hours === option.hours && styles.optionTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </>
              ) : null}

              {section === "today" || section === "notes" ? (
                <Text style={styles.empty}>אין הגדרות נוספות לבורד זה כרגע.</Text>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {saving ? <Text style={styles.saving}>שומר...</Text> : null}
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
  headerRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "800", textAlign: "right", flex: 1 },
  backLink: { color: "#4f46e5", fontSize: 14, fontWeight: "600" },
  loader: { marginVertical: 24 },
  body: { maxHeight: 420 },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowText: { fontSize: 15, textAlign: "right", color: "#334155" },
  help: { fontSize: 13, color: "#64748b", textAlign: "right", marginBottom: 12 },
  fieldLabel: { fontSize: 14, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  option: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  optionActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  optionText: { fontSize: 15, textAlign: "right", color: "#334155" },
  optionTextActive: { color: "#4338ca", fontWeight: "700" },
  empty: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "right",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 16,
  },
  error: { color: "#dc2626", textAlign: "right", marginTop: 8, fontSize: 13 },
  saving: { color: "#64748b", textAlign: "right", marginTop: 8, fontSize: 12 },
  close: { marginTop: 16, alignItems: "center" },
  closeText: { color: "#64748b", fontSize: 15 },
});
