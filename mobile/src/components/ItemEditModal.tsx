import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { MindtaskerItem } from "../lib/supabase";
import type { ItemEditInput } from "../hooks/useBoardItems";
import { getItemAnalysis, urgencyColor, formatAnalysisTime, showTimeMention } from "../lib/item-analysis";
import { DueDateFields, combineDueDate, splitDueDate, type DueDateParts } from "./DueDateFields";
import { effectiveTaskDueDate, getReminderFlags } from "../lib/resolve-item-reminder";
import { useUserTags } from "../hooks/useUserTags";
import {
  MAX_ITEM_TAGS,
  alignItemTagsWithDefinitions,
  formatTagLabel,
  readableTextColor,
} from "../lib/tags";

interface ItemEditModalProps {
  item: MindtaskerItem | null;
  visible: boolean;
  onClose: () => void;
  onSave: (item: MindtaskerItem, input: ItemEditInput) => void | Promise<void>;
}

export function ItemEditModal({ item, visible, onClose, onSave }: ItemEditModalProps) {
  const { tags: userTags } = useUserTags();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dueParts, setDueParts] = useState<DueDateParts>({ date: "", hour: "09", minute: "00" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item || !visible) return;
    setTitle(item.title);
    setContent(item.content ?? "");
    setSelectedTags(alignItemTagsWithDefinitions(item.tags ?? [], userTags));
    setDueParts(
      !getReminderFlags(item.metadata).disabled
        ? splitDueDate(effectiveTaskDueDate(item))
        : splitDueDate(null),
    );
    setError(null);
    // Reset form only when opening / switching items — not when tag definitions refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: omit userTags
  }, [item?.id, visible]);

  useEffect(() => {
    if (!item || !visible) return;
    setSelectedTags((prev) => alignItemTagsWithDefinitions(prev, userTags));
  }, [userTags, item, visible]);

  function resetAndClose() {
    setTitle("");
    setContent("");
    setSelectedTags([]);
    setDueParts({ date: "", hour: "09", minute: "00" });
    setError(null);
    onClose();
  }

  if (!item) return null;

  const analysis = getItemAnalysis(item.metadata);

  async function handleSave() {
    if (!item) return;
    const current = item;
    const trimmed = title.trim();
    if (!trimmed) {
      setError("כותרת חובה");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(current, {
        title: trimmed,
        content: content.trim(),
        tags: alignItemTagsWithDefinitions(selectedTags, userTags),
        due_date: combineDueDate(dueParts),
      });
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdropTap} onPress={resetAndClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.heading}>עריכת {item.is_actionable ? "משימה" : "הערה"}</Text>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>כותרת</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="כותרת"
              textAlign="right"
              autoFocus
            />
            <Text style={styles.label}>תוכן</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={content}
              onChangeText={setContent}
              placeholder="הוסף פרטים, הערות או תיאור..."
              multiline
              textAlign="right"
              textAlignVertical="top"
            />
            <Text style={styles.label}>תגיות</Text>
            {userTags.length === 0 ? (
              <Text style={styles.tagEmptyHint}>הגדר תגיות במסך ההגדרות</Text>
            ) : null}
            <View style={styles.tagRow}>
              {userTags.map((tag) => {
                const active = selectedTags.includes(tag.name);
                return (
                  <Pressable
                    key={tag.id}
                    onPress={() => {
                      setSelectedTags((current) => {
                        if (current.includes(tag.name)) {
                          return current.filter((name) => name !== tag.name);
                        }
                        if (current.length >= MAX_ITEM_TAGS) return current;
                        return [...current, tag.name];
                      });
                    }}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: active ? tag.color : "#f1f5f9",
                        borderColor: active ? tag.color : "#e2e8f0",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tagChipText,
                        { color: active ? readableTextColor(tag.color) : "#64748b" },
                      ]}
                    >
                      {formatTagLabel(tag.name)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.tagHint}>
              {selectedTags.length}/{MAX_ITEM_TAGS} תגיות על הפריט
            </Text>
            <DueDateFields value={dueParts} onChange={setDueParts} />
            {analysis ? (
              <View style={styles.analysisBox}>
                <View style={styles.analysisHeader}>
                  <Text style={styles.analysisTitle}>ניתוח קליטה</Text>
                  <Text style={[styles.urgencyBadge, { color: urgencyColor(analysis.urgency) }]}>
                    {analysis.urgency}
                  </Text>
                </View>
                <Text style={styles.analysisRow}>
                  <Text style={styles.analysisLabel}>מטרה: </Text>
                  {analysis.goal}
                </Text>
                <Text style={styles.analysisRow}>
                  <Text style={styles.analysisLabel}>מקור: </Text>
                  {analysis.source}
                </Text>
                <Text style={styles.analysisRow}>
                  <Text style={styles.analysisLabel}>משימה: </Text>
                  {analysis.task}
                </Text>
                {showTimeMention(analysis) ? (
                  <Text style={styles.analysisRow}>
                    <Text style={styles.analysisLabel}>איזכור זמן: </Text>
                    {analysis.time_mention}
                  </Text>
                ) : null}
                {formatAnalysisTime(analysis.target_at) ? (
                  <Text style={styles.analysisRow}>
                    <Text style={styles.analysisLabel}>מועד יעד: </Text>
                    {formatAnalysisTime(analysis.target_at)}
                  </Text>
                ) : null}
                {formatAnalysisTime(analysis.notify_at) ? (
                  <Text style={styles.analysisRow}>
                    <Text style={styles.analysisLabel}>התראה: </Text>
                    {formatAnalysisTime(analysis.notify_at)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={resetAndClose}>
              <Text style={styles.cancelText}>ביטול</Text>
            </Pressable>
            <Pressable style={styles.save} onPress={() => void handleSave()} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>שמור</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
    maxHeight: "72%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    marginBottom: 12,
  },
  formScroll: { flexGrow: 0 },
  formContent: { gap: 6, paddingBottom: 8 },
  heading: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    color: "#0f172a",
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    color: "#475569",
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  multiline: { minHeight: 80, maxHeight: 160 },
  tagRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tagHint: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "right",
  },
  tagEmptyHint: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "right",
    marginBottom: 6,
  },
  analysisBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 12,
    gap: 6,
  },
  analysisHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  analysisTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "right",
  },
  urgencyBadge: {
    fontSize: 12,
    fontWeight: "700",
  },
  analysisRow: {
    fontSize: 14,
    color: "#1e293b",
    textAlign: "right",
    lineHeight: 20,
  },
  analysisLabel: {
    fontWeight: "600",
    color: "#64748b",
  },
  error: { color: "#dc2626", textAlign: "right", fontSize: 14, marginTop: 4 },
  actions: { flexDirection: "row-reverse", gap: 8, marginTop: 8 },
  cancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelText: { color: "#475569", fontWeight: "600", fontSize: 13 },
  save: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
