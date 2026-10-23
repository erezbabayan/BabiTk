import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { formatReminderTime, type NotebookReminderPrefs } from "../lib/notebook-reminder-prefs";
import {
  loadNotebookReminderPrefs,
  saveNotebookReminderPrefs,
} from "../lib/notebook-reminder-settings";

/** Daily WhatsApp reminder of items waiting in the notebook (synced with the web). */
export function NotebookReminderSection() {
  const [prefs, setPrefs] = useState<NotebookReminderPrefs | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadNotebookReminderPrefs()
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) setPrefs(loaded);
        else setUnavailable(true);
      })
      .catch(() => {
        if (!cancelled) setError("טעינת הגדרות התזכורת נכשלה");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(patch: Partial<NotebookReminderPrefs>) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setPrefs(await saveNotebookReminderPrefs(patch));
      setSaved(true);
    } catch {
      setPrefs(previous);
      setError("שמירת התזכורת נכשלה — נסה שוב");
    } finally {
      setSaving(false);
    }
  }

  function handleTime(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setShowPicker(false);
    if (event.type === "dismissed" || !selected) return;
    void save({ hour: selected.getHours(), minute: selected.getMinutes() });
  }

  if (unavailable) return null;

  const pickerValue = new Date();
  if (prefs) pickerValue.setHours(prefs.hour, prefs.minute, 0, 0);

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.label}>תזכורת יומית על פריטים במחברת</Text>
          <Text style={styles.help}>פעם ביום בוואטסאפ: כמה פריטים מחכים לטיפול. לא נשלח כשהמחברת ריקה.</Text>
        </View>
        <Switch
          value={prefs?.enabled ?? false}
          disabled={!prefs || saving}
          onValueChange={(enabled) => void save({ enabled })}
          accessibilityLabel="תזכורת יומית על פריטים במחברת"
        />
      </View>
      {prefs ? (
        <Pressable
          style={[styles.timeBtn, (!prefs.enabled || saving) && styles.disabled]}
          disabled={!prefs.enabled || saving}
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel="בחר שעת תזכורת"
        >
          <Text style={styles.timeLabel}>שעת התזכורת</Text>
          <Text style={styles.timeValue}>{formatReminderTime(prefs.hour, prefs.minute)}</Text>
        </Pressable>
      ) : (
        <Text style={styles.help}>טוען...</Text>
      )}
      {showPicker && prefs ? (
        <DateTimePicker value={pickerValue} mode="time" is24Hour onChange={handleTime} locale="he-IL" />
      ) : null}
      {saving ? <Text style={styles.saving}>שומר...</Text> : null}
      {saved && !saving && !error ? <Text style={styles.saved}>נשמר · מסונכרן עם האתר</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  textCol: { flex: 1 },
  label: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#1e293b" },
  help: { fontSize: 12, color: "#64748b", textAlign: "right", marginTop: 2 },
  timeBtn: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  disabled: { opacity: 0.5 },
  timeLabel: { fontSize: 14, color: "#334155" },
  timeValue: { fontSize: 16, fontWeight: "700", color: "#4338ca" },
  saving: { color: "#64748b", textAlign: "right", fontSize: 12 },
  saved: { color: "#047857", textAlign: "right", fontSize: 12 },
  error: { color: "#dc2626", textAlign: "right", fontSize: 13 },
});
