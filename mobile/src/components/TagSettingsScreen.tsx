import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { DEFAULT_USER_TAGS, type UserTag } from "../lib/tags";

const PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#06b6d4",
  "#64748b",
];

interface TagSettingsScreenProps {
  visible: boolean;
  tags: UserTag[];
  onSave: (tags: { name: string; color: string }[]) => Promise<void>;
  onClose: () => void;
}

export function TagSettingsScreen({
  visible,
  tags,
  onSave,
  onClose,
}: TagSettingsScreenProps) {
  const [draft, setDraft] = useState(() =>
    (tags.length > 0 ? tags : DEFAULT_USER_TAGS.map((tag, index) => ({
      id: `new-${index}`,
      name: tag.name,
      color: tag.color,
      sort_order: index,
    }))).map((tag) => ({ name: tag.name, color: tag.color })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function updateTag(index: number, patch: Partial<{ name: string; color: string }>) {
    setDraft((current) =>
      current.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)),
    );
  }

  function addTag() {
    if (draft.length >= 20) return;
    setDraft((current) => [
      ...current,
      { name: "", color: PALETTE[current.length % PALETTE.length]! },
    ]);
  }

  function removeTag(index: number) {
    if (draft.length <= 1) return;
    setDraft((current) => current.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    setMessage(null);
    const cleaned = draft
      .map((tag) => ({ name: tag.name.trim(), color: tag.color }))
      .filter((tag) => tag.name.length > 0);

    if (cleaned.length === 0) {
      setError("נדרשת לפחות תגית אחת");
      return;
    }

    const names = cleaned.map((tag) => tag.name);
    if (new Set(names).size !== names.length) {
      setError("יש תגיות עם שמות כפולים");
      return;
    }

    setSaving(true);
    try {
      await onSave(cleaned);
      setMessage("התגיות נשמרו — ה-AI ישתמש בהן לפריטים חדשים");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>הגדרות תגיות</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>סגור</Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          הגדר תגיות וצבעים. המערכת תשייך אותן אוטומטית לפריטים חדשים לפי ניתוח ה-AI.
        </Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {draft.map((tag, index) => (
            <View key={index} style={styles.row}>
              <View style={[styles.colorSwatch, { backgroundColor: tag.color }]} />
              <TextInput
                style={styles.input}
                value={tag.name}
                onChangeText={(value) => updateTag(index, { name: value })}
                placeholder="שם תגית"
                placeholderTextColor="#94a3b8"
                textAlign="right"
              />
              <Pressable
                style={[styles.removeBtn, draft.length <= 1 && styles.disabled]}
                onPress={() => removeTag(index)}
                disabled={draft.length <= 1}
              >
                <Text style={styles.removeText}>מחק</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>

        <View style={styles.palette}>
          {PALETTE.map((color) => (
            <Pressable
              key={color}
              style={[styles.paletteDot, { backgroundColor: color }]}
              onPress={() => {
                const emptyIndex = draft.findIndex((tag) => !tag.name.trim());
                const target = emptyIndex >= 0 ? emptyIndex : draft.length - 1;
                if (target >= 0) updateTag(target, { color });
              }}
            />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            style={[styles.secondaryBtn, draft.length >= 20 && styles.disabled]}
            onPress={addTag}
            disabled={draft.length >= 20}
          >
            <Text style={styles.secondaryBtnText}>+ תגית</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, saving && styles.disabled]}
            onPress={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>שמור תגיות</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingTop: 56, paddingHorizontal: 16 },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  close: { color: "#64748b", fontSize: 15 },
  subtitle: { color: "#64748b", fontSize: 13, textAlign: "right", marginBottom: 12 },
  list: { flex: 1 },
  listContent: { gap: 8, paddingBottom: 12 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  colorSwatch: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: "#cbd5e1" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 15,
  },
  removeBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  removeText: { color: "#64748b", fontSize: 13 },
  palette: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  paletteDot: { width: 24, height: 24, borderRadius: 12 },
  error: { color: "#dc2626", textAlign: "right", marginBottom: 6 },
  success: { color: "#047857", textAlign: "right", marginBottom: 6 },
  actions: { flexDirection: "row-reverse", gap: 8, paddingBottom: 24 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  secondaryBtnText: { color: "#475569", fontWeight: "600" },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
