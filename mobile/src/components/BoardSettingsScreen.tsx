import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeModal } from "./SafeModal";
import { NotebookReminderSection } from "./NotebookReminderSection";

import {
  BOARD_SETTINGS_LABELS,
  DEFAULT_INBOX_ARCHIVE_HOURS,
  INBOX_ARCHIVE_HOURS_OPTIONS,
  type InboxArchiveHours,
} from "../lib/board-settings";
import { getBoardSettings, saveBoardSettings } from "../lib/board-settings-api";

type BoardSection = "menu" | "inbox" | "today" | "notes";

interface BoardSettingsScreenProps {
  visible: boolean;
  userId?: string;
  userEmail?: string | null;
  onClose: () => void;
}

function formatSaveError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "שמירה נכשלה";
  if (
    /not authenticated/i.test(message) ||
    /unauthenticated/i.test(message) ||
    /unauthorized/i.test(message)
  ) {
    return "יש להתחבר מחדש כדי לשמור";
  }
  return message.replace(/^.*Uncaught Error:\s*/i, "").slice(0, 180);
}

function BoardSettingsShell({
  visible,
  onClose,
  title,
  section,
  setSection,
  loading,
  body,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  section: BoardSection;
  setSection: (section: BoardSection) => void;
  loading: boolean;
  body: React.ReactNode;
}) {
  if (!visible) return null;

  return (
    <SafeModal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            {section !== "menu" ? (
              <Pressable onPress={() => setSection("menu")} hitSlop={12}>
                <Text style={styles.backLink}>חזור</Text>
              </Pressable>
            ) : null}
          </View>

          {loading ? (
            <ActivityIndicator color="#4f46e5" style={styles.loader} />
          ) : (
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {body}
            </ScrollView>
          )}

          <Pressable style={styles.close} onPress={onClose} hitSlop={12}>
            <Text style={styles.closeText}>סגור</Text>
          </Pressable>
        </View>
      </View>
    </SafeModal>
  );
}

function sectionTitle(section: BoardSection): string {
  if (section === "menu") return "הגדרות בורדים";
  if (section === "inbox") return BOARD_SETTINGS_LABELS.inbox;
  if (section === "today") return BOARD_SETTINGS_LABELS.today;
  return BOARD_SETTINGS_LABELS.notes;
}

function BoardSettingsLocalScreen({
  visible,
  onClose,
}: BoardSettingsScreenProps) {
  const [section, setSection] = useState<BoardSection>("menu");
  const [hours, setHours] = useState<InboxArchiveHours>(DEFAULT_INBOX_ARCHIVE_HOURS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSection("menu");
      setError(null);
      setSavedHint(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getBoardSettings()
      .then((settings) => {
        if (!cancelled) setHours(settings.inbox_archive_hours);
      })
      .catch((err) => {
        if (!cancelled) setError(formatSaveError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleSelectHours = useCallback(async (nextHours: InboxArchiveHours) => {
    setSaving(true);
    setError(null);
    setSavedHint(false);
    const previous = hours;
    setHours(nextHours);
    try {
      await saveBoardSettings({ inbox_archive_hours: nextHours });
      setSavedHint(true);
    } catch (err) {
      setHours(previous);
      setError(formatSaveError(err));
    } finally {
      setSaving(false);
    }
  }, [hours]);

  const body =
    section === "menu" ? (
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
    ) : section === "inbox" ? (
      <>
        <Text style={styles.help}>
          פריטים שלא נוגעים בהם במחברת יעברו אוטומטית לארכיון לאחר פרק הזמן שתבחר.
        </Text>
        <Text style={styles.fieldLabel}>מעבר לארכיון אוטומטי</Text>
        {INBOX_ARCHIVE_HOURS_OPTIONS.map((option) => {
          const selected = hours === option.hours;
          return (
            <Pressable
              key={option.hours}
              style={[styles.option, selected && styles.optionActive]}
              disabled={saving}
              onPress={() => void handleSelectHours(option.hours)}
            >
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saving ? <Text style={styles.saving}>שומר...</Text> : null}
        {savedHint && !error ? <Text style={styles.saved}>נשמר בהצלחה</Text> : null}
        <NotebookReminderSection />
      </>
    ) : (
      <Text style={styles.empty}>אין הגדרות נוספות לבורד זה כרגע.</Text>
    );

  return (
    <BoardSettingsShell
      visible={visible}
      onClose={onClose}
      title={sectionTitle(section)}
      section={section}
      setSection={setSection}
      loading={loading}
      body={body}
    />
  );
}

export function BoardSettingsScreen(props: BoardSettingsScreenProps) {
  if (!props.visible) return null;

  return <BoardSettingsLocalScreen {...props} />;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    maxHeight: "88%",
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
  body: { maxHeight: 460 },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowText: { fontSize: 15, textAlign: "right", color: "#334155" },
  help: { fontSize: 13, color: "#64748b", textAlign: "right", marginBottom: 12 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 8,
  },
  option: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  optionActive: {
    borderColor: "#4f46e5",
    backgroundColor: "#eef2ff",
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#cbd5e1",
  },
  radioSelected: {
    borderColor: "#4f46e5",
    backgroundColor: "#4f46e5",
  },
  optionText: { flex: 1, fontSize: 15, textAlign: "right", color: "#334155" },
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
  saved: { color: "#047857", textAlign: "right", marginTop: 8, fontSize: 12 },
  close: { marginTop: 16, alignItems: "center" },
  closeText: { color: "#64748b", fontSize: 15 },
});
