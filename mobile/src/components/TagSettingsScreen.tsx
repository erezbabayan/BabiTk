import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTagSettingsDraft } from "../hooks/useTagSettingsDraft";
import { DEFAULT_USER_TAGS, MAX_USER_TAGS, TAG_PALETTE } from "../lib/tags";

interface TagSettingsScreenProps {
  visible: boolean;
  onClose: () => void;
}

export function TagSettingsScreen({ visible, onClose }: TagSettingsScreenProps) {
  const {
    draft,
    updateTag,
    removeTag,
    flushSave,
    resetToDefaults,
    filledCount,
    saving,
    loading,
    ready,
    error,
    synced,
  } = useTagSettingsDraft(visible);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>תגיות מותאמות</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>סגור</Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle}>
          הגדר עד {MAX_USER_TAGS} תגיות וצבעים. שינויים נשמרים אוטומטית ומסתנכרנים עם הבורדים.
        </Text>
        <Text style={styles.meta}>
          {filledCount}/{MAX_USER_TAGS} תגיות מוגדרות
          {saving ? " · שומר..." : synced ? " · מסונכרן" : " · ממתין לשמירה..."}
        </Text>

        {!ready && loading ? (
          <ActivityIndicator style={styles.loader} color="#4f46e5" />
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {draft.map((tag, index) => {
              const empty = !tag.name.trim();
              return (
                <View
                  key={index}
                  style={[styles.row, empty && styles.rowEmpty]}
                >
                  <Text style={styles.slot}>{index + 1}</Text>
                  <View style={[styles.colorSwatch, { backgroundColor: tag.color }]} />
                  <TextInput
                    style={styles.input}
                    value={tag.name}
                    onChangeText={(value) => updateTag(index, { name: value })}
                    onBlur={() => void flushSave()}
                    placeholder={`תגית ${index + 1}`}
                    placeholderTextColor="#94a3b8"
                    textAlign="right"
                  />
                  <Pressable
                    style={[styles.removeBtn, (empty || filledCount <= 1) && styles.disabled]}
                    onPress={() => removeTag(index)}
                    disabled={empty || filledCount <= 1}
                  >
                    <Text style={styles.removeText}>מחק</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.palette}>
          {TAG_PALETTE.map((color) => (
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

        <View style={styles.actions}>
          <Pressable
            style={[styles.primaryBtn, saving && styles.disabled]}
            onPress={() => void flushSave()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>שמור עכשיו</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.secondaryBtn, saving && styles.disabled]}
            onPress={() => {
              Alert.alert(
                "איפוס תגיות",
                `לאפס ל-${DEFAULT_USER_TAGS.length} תגיות ברירת מחדל?\n(${DEFAULT_USER_TAGS.map((t) => t.name).join(", ")})\n\nהרשימה תתעדכן בכל הבורדים.`,
                [
                  { text: "ביטול", style: "cancel" },
                  { text: "איפוס", style: "destructive", onPress: () => void resetToDefaults() },
                ],
              );
            }}
            disabled={saving}
          >
            <Text style={styles.secondaryBtnText}>איפוס לברירת מחדל</Text>
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
  subtitle: { color: "#64748b", fontSize: 13, textAlign: "right", marginBottom: 4 },
  meta: { color: "#94a3b8", fontSize: 12, textAlign: "right", marginBottom: 12 },
  loader: { marginTop: 24 },
  list: { flex: 1 },
  listContent: { gap: 8, paddingBottom: 12 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  rowEmpty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
  },
  slot: { width: 18, textAlign: "center", fontSize: 10, color: "#94a3b8" },
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
