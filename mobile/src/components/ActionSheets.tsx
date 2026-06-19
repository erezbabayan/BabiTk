import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { snoozePresets } from "../hooks/useInboxItems";
import type { MindtaskerItem } from "../lib/supabase";
import { colorForTag, readableTextColor, type UserTag } from "../lib/tags";

interface SnoozeSheetProps {
  item: MindtaskerItem | null;
  visible: boolean;
  onSelect: (item: MindtaskerItem, iso: string) => void;
  onClose: () => void;
}

export function SnoozeSheet({ item, visible, onSelect, onClose }: SnoozeSheetProps) {
  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>נודניק — {item.title}</Text>
          {snoozePresets().map((opt) => (
            <Pressable
              key={opt.label}
              style={styles.option}
              onPress={() => {
                onSelect(item, opt.iso);
                onClose();
              }}
            >
              <Text style={styles.optionText}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>ביטול</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

interface TagsSheetProps {
  item: MindtaskerItem | null;
  visible: boolean;
  userTags: UserTag[];
  onToggleTag: (item: MindtaskerItem, tag: string) => void;
  onClose: () => void;
}

export function TagsSheet({
  item,
  visible,
  userTags,
  onToggleTag,
  onClose,
}: TagsSheetProps) {
  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>תגיות — {item.title}</Text>
          <View style={styles.tagRow}>
            {userTags.map((tagDef) => {
              const active = item.tags.includes(tagDef.name);
              const textColor = active
                ? readableTextColor(tagDef.color)
                : colorForTag(tagDef.name, userTags);
              return (
                <Pressable
                  key={tagDef.id}
                  style={[
                    styles.tag,
                    active
                      ? { backgroundColor: tagDef.color, borderColor: tagDef.color }
                      : {
                          backgroundColor: `${tagDef.color}22`,
                          borderColor: `${tagDef.color}66`,
                        },
                  ]}
                  onPress={() => onToggleTag(item, tagDef.name)}
                >
                  <Text style={[styles.tagText, { color: textColor }]}>
                    #{tagDef.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>סגור</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 12, color: "#0f172a" },
  option: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  optionText: { fontSize: 15, color: "#334155", textAlign: "right" },
  tagRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  tag: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: { fontSize: 13, fontWeight: "600" },
  cancel: { marginTop: 16, alignItems: "center" },
  cancelText: { color: "#64748b", fontSize: 15 },
});
