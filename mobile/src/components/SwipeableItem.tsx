import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, Vibration, View } from "react-native";
import { Gesture, GestureDetector, Swipeable, TouchableOpacity } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import type { MindtaskerItem } from "../lib/supabase";
import type { UserTag } from "../lib/tags";
import { ItemActionBar, type BoardTab, type ListView } from "./ItemActionBar";
import { ItemTagDots } from "./ItemTagDots";
import { SourceIndicator } from "./SourceIndicator";
import {
  buildItemDisplayFields,
  buildItemScheduleLine,
  isItemContentCollapsed,
  isTaskListStruck,
  itemCardMinHeight,
  ITEM_BODY_FONT_SIZE,
  ITEM_HEADLINE_FONT_SIZE,
} from "../lib/item-display";
import { isPriorityItem } from "../lib/item-priority";
import { PriorityStar } from "./PriorityStar";
import type { SwipeSideAction } from "../lib/item-swipe-actions";
import type { BoardItemView } from "../lib/board-item-view";
import { BOARD_SQUARE_RADIUS_PX } from "../lib/board-item-layout";
import { SwipeActionSlot } from "./SwipeActionStrip";
import {
  boardAccentColor,
  boardAccentSide,
  BOARD_ACCENT_WIDTH_PX,
  resolveBoardAccent,
} from "../lib/board-accent";

const ACTION_WIDTH = 108;
const ACTION_WIDTH_DENSE = 64;
const ACTION_WIDTH_SQUARES = 56;
const DOUBLE_PRESS_MS = 400;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_SLOP = 16;

export type { SwipeSideAction };

interface SwipeableItemProps {
  item: MindtaskerItem;
  userTags?: UserTag[];
  tagsOverride?: string[];
  tab: BoardTab;
  listView: ListView;
  boardItemView?: BoardItemView;
  leftAction?: SwipeSideAction;
  rightAction?: SwipeSideAction;
  onLongPressCheck?: () => void;
  /** Long-press opens move-to-board (active items). */
  onLongPressMove?: () => void;
  onViewSource?: () => void;
  onEdit: () => void;
  onToggleType: () => void;
  onApprove: () => void;
  onComplete?: () => void;
  onSnooze: () => void;
  /** Unused by the card itself — swipe actions own archive/restore/delete. Kept optional for callers. */
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  onTagPress?: () => void;
  tagPickerOpen?: boolean;
  onTogglePriority?: () => void;
  showCompleteAction?: boolean;
  showUndoAction?: boolean;
  onUndo?: () => void;
  /** Tighter card for nested list rows (task lists modal). */
  dense?: boolean;
}

function renderActionSlot(action: SwipeSideAction, width: number, compact = false) {
  return <SwipeActionSlot action={action} width={width} compact={compact} />;
}

export function SwipeableItem({
  item,
  userTags = [],
  tagsOverride,
  tab,
  listView,
  boardItemView = "list",
  leftAction,
  rightAction,
  onLongPressCheck,
  onLongPressMove,
  onViewSource,
  onEdit,
  onToggleType,
  onApprove: _onApprove,
  onComplete = () => {},
  onSnooze,
  onTagPress,
  tagPickerOpen = false,
  onTogglePriority,
  showCompleteAction = false,
  showUndoAction = false,
  onUndo = () => {},
  dense = false,
}: SwipeableItemProps) {
  const swipeRef = useRef<Swipeable>(null);
  const lastPressRef = useRef(0);
  const longPressFiredRef = useRef(false);
  const [itemExpanded, setItemExpanded] = useState(false);

  const display = buildItemDisplayFields(item);
  const visibleTags = tagsOverride ?? display.tags;
  const scheduleLine = buildItemScheduleLine(display);
  const isSquares = !dense && boardItemView === "squares";
  const contentCollapsed = isItemContentCollapsed(display.isItemExpandable, itemExpanded);
  const showFullContent = !contentCollapsed && !isSquares;
  const headlineText = display.body ? display.headline : display.fullHeadline;
  const boardAccent = resolveBoardAccent(item, tab);
  const accentSide = boardAccentSide(boardAccent);
  const accentColor = boardAccentColor(boardAccent);
  const cardMinHeight = isSquares
    ? undefined
    : dense
      ? undefined
      : itemCardMinHeight(display, itemExpanded);
  const doneStrike = isTaskListStruck(item);
  const strikeStyle = doneStrike ? styles.textDone : undefined;
  const priority = isPriorityItem(item);
  const showBody = Boolean(display.body) && !isSquares && (!dense || itemExpanded);

  const swipeWidth = dense
    ? ACTION_WIDTH_DENSE
    : isSquares
      ? ACTION_WIDTH_SQUARES
      : ACTION_WIDTH;
  const swipeCompact = dense || isSquares;
  const longPressHandler =
    onLongPressMove ?? (!display.isNote ? onLongPressCheck : undefined);
  const longPressHandlerRef = useRef(longPressHandler);
  longPressHandlerRef.current = longPressHandler;

  useEffect(() => {
    setItemExpanded(false);
  }, [item.id]);

  const invokeLongPress = useMemo(
    () => () => {
      const handler = longPressHandlerRef.current;
      if (!handler || longPressFiredRef.current) return;
      longPressFiredRef.current = true;
      Vibration.vibrate(12);
      handler();
    },
    [],
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(LONG_PRESS_MS)
        .maxDistance(LONG_PRESS_MOVE_SLOP)
        .enabled(Boolean(longPressHandler))
        .onStart(() => {
          runOnJS(invokeLongPress)();
        }),
    [longPressHandler, invokeLongPress],
  );

  function handleCardPress() {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastPressRef.current < DOUBLE_PRESS_MS) {
      lastPressRef.current = 0;
      onEdit();
      return;
    }
    lastPressRef.current = now;
  }

  function handleOpen(direction: "left" | "right") {
    if (direction === "left" && leftAction) leftAction.onTrigger();
    if (direction === "right" && rightAction) rightAction.onTrigger();
    swipeRef.current?.close();
  }

  const card = (
    <GestureDetector gesture={longPressGesture}>
      <View
        style={[
          styles.card,
          dense ? styles.cardDense : null,
          isSquares ? styles.cardSquares : null,
          cardMinHeight !== undefined ? { minHeight: cardMinHeight } : null,
        ]}
      >
        <View
          style={[
            styles.accentBar,
            accentSide === "right" ? styles.accentBarRight : styles.accentBarLeft,
            { backgroundColor: accentColor, width: BOARD_ACCENT_WIDTH_PX },
          ]}
        />

        <TouchableOpacity
          activeOpacity={1}
          onPress={handleCardPress}
          onPressIn={() => {
            longPressFiredRef.current = false;
          }}
          style={[
            styles.cardInner,
            dense || isSquares ? styles.cardInnerDense : null,
            isSquares ? styles.cardInnerSquares : null,
            accentSide === "right" ? styles.cardInnerAccentRight : styles.cardInnerAccentLeft,
          ]}
        >
          <View>
            <View style={styles.headlineRow}>
              <Text
                style={[styles.headline, dense || isSquares ? styles.headlineDense : null, strikeStyle]}
                numberOfLines={dense || isSquares || !showFullContent ? 2 : undefined}
              >
                {headlineText}
              </Text>
              <View style={styles.headlineActions}>
                {onTogglePriority ? (
                  <TouchableOpacity
                    onPress={onTogglePriority}
                    accessibilityRole="button"
                    accessibilityLabel={priority ? "הסר עדיפות" : "סמן כעדיפות"}
                    accessibilityState={{ selected: priority }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <PriorityStar active={priority} size={dense || isSquares ? 12 : 15} />
                  </TouchableOpacity>
                ) : priority ? (
                  <View accessibilityLabel="עדיפות">
                    <PriorityStar active size={dense || isSquares ? 12 : 15} />
                  </View>
                ) : null}
                {onViewSource ? (
                  <SourceIndicator item={item} onPress={onViewSource} iconOnly />
                ) : null}
              </View>
            </View>

            {showBody || (!dense && !isSquares && display.isItemExpandable) ? (
              <View
                style={[
                  styles.bodyBlock,
                  contentCollapsed ? styles.bodyBlockCollapsed : null,
                ]}
              >
                {showBody ? (
                  <Text
                    style={[styles.bodyPrimary, dense ? styles.bodyDense : null, strikeStyle]}
                    numberOfLines={showFullContent && !dense ? undefined : 2}
                  >
                    {display.body}
                  </Text>
                ) : null}
                {!dense && !isSquares && display.isItemExpandable ? (
                  <TouchableOpacity
                    onPress={() => setItemExpanded((value) => !value)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: itemExpanded }}
                    accessibilityLabel={itemExpanded ? "הסתר" : "הרחב"}
                  >
                    <Text style={styles.expandBtn}>{itemExpanded ? "הסתר" : "הרחב"}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {!dense && visibleTags.length > 0 ? (
              <ItemTagDots
                tags={visibleTags}
                userTags={userTags}
                singleLine={isSquares}
              />
            ) : null}

            {scheduleLine ? (
              <Text
                style={[
                  styles.scheduleInBody,
                  dense || isSquares ? styles.scheduleDense : null,
                ]}
                numberOfLines={1}
              >
                {scheduleLine}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        <View
          style={[
            styles.cardFooter,
            dense || isSquares ? styles.cardFooterDense : null,
            styles.cardFooterActionsOnly,
            isSquares ? styles.cardFooterSquares : null,
            accentSide === "right" ? styles.cardInnerAccentRight : styles.cardInnerAccentLeft,
          ]}
        >
          {dense && !isSquares && visibleTags.length > 0 ? (
            <ItemTagDots tags={visibleTags} userTags={userTags} dense />
          ) : null}
          <View style={styles.footerActionsOnly}>
            <ItemActionBar
              item={item}
              tab={tab}
              listView={listView}
              onEdit={onEdit}
              onToggleType={onToggleType}
              onComplete={onComplete}
              onSnooze={onSnooze}
              showUndoAction={showUndoAction && doneStrike}
              onUndo={onUndo}
              showCompleteAction={showCompleteAction && !doneStrike}
              onTagPress={onTagPress}
              tagPickerOpen={tagPickerOpen}
              dense={dense || isSquares}
            />
          </View>
        </View>
      </View>
    </GestureDetector>
  );

  return (
    <View
      collapsable={false}
      style={[
        styles.swipeClip,
        dense ? styles.swipeClipDense : null,
        isSquares ? styles.swipeClipSquares : null,
      ]}
    >
      <Swipeable
        ref={swipeRef}
        friction={2}
        overshootLeft={false}
        overshootRight={false}
        activeOffsetX={[-20, 20]}
        failOffsetY={[-20, 20]}
        leftThreshold={swipeWidth * 0.45}
        rightThreshold={swipeWidth * 0.45}
        containerStyle={[
          styles.swipeContainer,
          isSquares ? styles.swipeContainerSquares : null,
        ]}
        childrenContainerStyle={isSquares ? styles.swipeChildrenSquares : undefined}
        renderLeftActions={
          leftAction ? () => renderActionSlot(leftAction, swipeWidth, swipeCompact) : undefined
        }
        renderRightActions={
          rightAction ? () => renderActionSlot(rightAction, swipeWidth, swipeCompact) : undefined
        }
        onSwipeableOpen={handleOpen}
      >
        {card}
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeClip: {
    marginBottom: 2,
    overflow: "hidden",
    borderRadius: 12,
  },
  swipeClipDense: {
    marginBottom: 1,
    borderRadius: 8,
  },
  swipeClipSquares: {
    flex: 1,
    width: "100%",
    marginBottom: 0,
    borderRadius: BOARD_SQUARE_RADIUS_PX,
    overflow: "hidden",
  },
  swipeContainer: {
    overflow: "hidden",
  },
  swipeContainerSquares: {
    flex: 1,
    width: "100%",
  },
  swipeChildrenSquares: {
    flex: 1,
    width: "100%",
  },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardDense: {
    borderRadius: 8,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardSquares: {
    flex: 1,
    width: "100%",
    elevation: 0,
    shadowOpacity: 0,
    borderRadius: BOARD_SQUARE_RADIUS_PX,
    marginBottom: 0,
    borderWidth: 0,
  },
  accentBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  accentBarRight: { right: 0 },
  accentBarLeft: { left: 0 },
  cardInner: { paddingHorizontal: 8, paddingVertical: 4 },
  cardInnerDense: { paddingHorizontal: 6, paddingVertical: 2 },
  cardInnerSquares: { flexShrink: 1 },
  cardInnerAccentRight: { paddingRight: 10 },
  cardInnerAccentLeft: { paddingLeft: 10 },
  headlineRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },
  headlineActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  headline: {
    flex: 1,
    fontSize: ITEM_HEADLINE_FONT_SIZE,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "right",
    lineHeight: 17,
  },
  headlineDense: {
    fontSize: 12,
    lineHeight: 14,
  },
  textDone: {
    textDecorationLine: "line-through",
    color: "#94a3b8",
  },
  bodyBlock: { marginTop: 2, gap: 1 },
  bodyBlockCollapsed: {},
  bodyPrimary: {
    fontSize: ITEM_BODY_FONT_SIZE,
    fontWeight: "400",
    color: "#475569",
    textAlign: "right",
    lineHeight: 17,
  },
  bodyDense: {
    fontSize: 11,
    lineHeight: 14,
  },
  bodySecondary: {
    fontSize: ITEM_BODY_FONT_SIZE,
    fontWeight: "400",
    color: "#94a3b8",
    textAlign: "right",
    lineHeight: 17,
  },
  expandBtn: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: "600",
    color: "#94a3b8",
    textAlign: "right",
  },
  scheduleInBody: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 12,
    color: "#94a3b8",
    textAlign: "right",
    maxWidth: "100%",
  },
  scheduleDense: {
    fontSize: 9,
    lineHeight: 11,
    marginTop: 3,
  },
  cardFooter: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f1f5f9",
    width: "100%",
    overflow: "hidden",
  },
  cardFooterDense: {
    paddingHorizontal: 6,
    paddingTop: 2,
    paddingBottom: 2,
    borderTopWidth: 0,
  },
  cardFooterSquares: {
    marginTop: "auto",
    paddingBottom: 2,
  },
  cardFooterActionsOnly: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  footerActionsOnly: {
    width: "100%",
    maxWidth: "100%",
    alignItems: "stretch",
  },
});
