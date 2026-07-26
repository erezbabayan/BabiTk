import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colorForTag, formatTagLabel, type UserTag } from "../lib/tags";
import { TagChip } from "./TagChip";
import { NotebookIcon } from "./NotebookIcons";

interface TagFilterBarProps {
  tags: string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
  userTags?: UserTag[];
}

export function TagFilterBar({
  tags,
  selected,
  onSelect,
  userTags = [],
}: TagFilterBarProps) {
  const [open, setOpen] = useState(false);

  if (tags.length === 0) return null;

  function handleTagPress(tag: string) {
    onSelect(selected === tag ? null : tag);
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.toggleLeft}>
          <NotebookIcon name="filter" size={13} tone="orange" />
          <Text style={styles.toggleText}>
            סינון תגיות
            {selected ? <Text style={styles.toggleActive}> · {formatTagLabel(selected)}</Text> : null}
          </Text>
        </View>
        <NotebookIcon name={open ? "chevronUp" : "chevronDown"} size={13} tone="muted" />
      </Pressable>

      {open ? (
        <View style={styles.dropdown}>
          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator
            style={styles.listScroll}
            contentContainerStyle={styles.list}
          >
            <Pressable
              style={[styles.chip, selected === null && styles.chipAllActive]}
              onPress={() => onSelect(null)}
            >
              <Text style={[styles.chipText, selected === null && styles.chipTextActive]}>
                הכל
              </Text>
            </Pressable>
            {tags.map((tag) => (
              <TagChip
                key={tag}
                name={tag}
                color={colorForTag(tag, userTags)}
                size="sm"
                selected={selected === tag}
                onPress={() => handleTagPress(tag)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
    position: "relative",
    zIndex: 1,
  },
  toggle: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 6,
  },
  toggleLeft: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    textAlign: "right",
  },
  toggleActive: {
    fontWeight: "500",
    color: "#64748b",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    zIndex: 120,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  listScroll: {
    maxHeight: 220,
  },
  list: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-start",
    paddingBottom: 2,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipAllActive: {
    backgroundColor: "#475569",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  chipTextActive: {
    color: "#fff",
  },
});
