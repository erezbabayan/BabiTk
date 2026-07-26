import { StyleSheet, View } from "react-native";
import { colorForTag, type UserTag } from "../lib/tags";
import { TagChip } from "./TagChip";

interface ItemTagDotsProps {
  tags: string[];
  userTags?: UserTag[];
  /** Compact colored dots without labels — for dense list rows. */
  dense?: boolean;
  /** One clipped chip row (squares tiles) — keeps label chips without wrapping height. */
  singleLine?: boolean;
}

export function ItemTagDots({
  tags,
  userTags = [],
  dense = false,
  singleLine = false,
}: ItemTagDotsProps) {
  if (tags.length === 0) return null;

  if (dense) {
    return (
      <View style={styles.dotsRow} accessibilityLabel="תגיות">
        {tags.map((tag) => (
          <View
            key={tag}
            accessibilityLabel={tag}
            style={[styles.dot, { backgroundColor: colorForTag(tag, userTags) }]}
          />
        ))}
      </View>
    );
  }

  return (
    <View
      style={[styles.row, singleLine ? styles.rowSingleLine : null]}
      accessibilityLabel="תגיות"
    >
      {tags.map((tag) => (
        <TagChip
          key={tag}
          name={tag}
          color={colorForTag(tag, userTags)}
          size="xs"
          variant="item"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "flex-start",
    alignSelf: "flex-start",
    gap: 3,
    marginTop: 3,
    flexShrink: 0,
  },
  rowSingleLine: {
    flexWrap: "nowrap",
    overflow: "hidden",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  dotsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 0,
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
