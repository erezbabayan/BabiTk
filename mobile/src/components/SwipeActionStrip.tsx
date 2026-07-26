import { StyleSheet, Text, View } from "react-native";

import type { SwipeSideAction } from "../lib/item-swipe-actions";
import { swipeActionStyle } from "../lib/swipe-action-style";
import { NotebookSwipeIcon } from "./NotebookIcons";

interface SwipeActionStripProps {
  action: SwipeSideAction;
  compact?: boolean;
}

export function SwipeActionStrip({
  action,
  compact = false,
  flush = false,
}: SwipeActionStripProps & { flush?: boolean }) {
  const palette = swipeActionStyle(action.tone);

  return (
    <View
      style={[
        styles.strip,
        compact ? styles.stripCompact : null,
        flush ? styles.stripFlush : null,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: flush ? "transparent" : palette.borderColor,
        },
      ]}
      accessibilityLabel={action.label}
    >
      <NotebookSwipeIcon name={action.iconName} size={compact ? 14 : 22} color={palette.iconColor} />
      <Text
        style={[
          styles.label,
          compact ? styles.labelCompact : null,
          { color: palette.textColor },
        ]}
        numberOfLines={1}
      >
        {action.label}
      </Text>
    </View>
  );
}

export function SwipeActionSlot({
  action,
  width,
  compact,
}: {
  action: SwipeSideAction;
  width: number;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.slot,
        compact ? styles.slotCompact : null,
        compact ? styles.slotFlush : null,
        { width },
      ]}
    >
      <SwipeActionStrip action={action} compact={compact} flush={compact} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: "100%",
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  slotCompact: {
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  slotFlush: {
    overflow: "hidden",
  },
  strip: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  stripCompact: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 1,
  },
  stripFlush: {
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  label: {
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 14,
  },
  labelCompact: {
    fontSize: 8,
    lineHeight: 9,
  },
});
