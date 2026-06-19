import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colorForTag, readableTextColor, type UserTag } from "../lib/tags";

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

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleText}>
          🏷️ סינון תגיות
          {selected ? <Text style={styles.toggleActive}> · #{selected}</Text> : null}
        </Text>
        <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          <Pressable
            style={[styles.chip, selected === null && styles.chipAllActive]}
            onPress={() => onSelect(null)}
          >
            <Text style={[styles.chipText, selected === null && styles.chipTextActive]}>
              הכל
            </Text>
          </Pressable>
          {tags.map((tag) => {
            const color = colorForTag(tag, userTags, "#ea580c");
            const active = selected === tag;
            return (
              <Pressable
                key={tag}
                style={[
                  styles.chip,
                  active
                    ? { backgroundColor: color }
                    : { backgroundColor: `${color}22`, borderColor: `${color}66`, borderWidth: 1 },
                ]}
                onPress={() => onSelect(tag)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? readableTextColor(color) : color },
                  ]}
                >
                  #{tag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
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
  chevron: {
    fontSize: 10,
    color: "#94a3b8",
  },
  row: {
    flexDirection: "row-reverse",
    gap: 4,
    paddingTop: 6,
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
