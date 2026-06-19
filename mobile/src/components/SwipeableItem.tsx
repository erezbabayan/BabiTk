import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Swipeable, TouchableOpacity } from "react-native-gesture-handler";
import type { MindtaskerItem } from "../lib/supabase";
import type { UserTag } from "../lib/tags";
import { colorForTag } from "../lib/tags";
import { ItemActionBar, type BoardTab, type ListView } from "./ItemActionBar";
import { SourceIndicator } from "./SourceIndicator";
import { getItemAnalysis, formatAnalysisTime, urgencyColor, showTimeMention } from "../lib/item-analysis";

const ACTION_WIDTH = 120;

export interface SwipeSideAction {
  label: string;
  icon?: string;
  onTrigger: () => void;
  backgroundColor?: string;
}

interface SwipeableItemProps {
  item: MindtaskerItem;
  userTags?: UserTag[];
  tab: BoardTab;
  listView: ListView;
  leftAction?: SwipeSideAction;
  rightAction?: SwipeSideAction;
  onLongPressCheck?: () => void;
  onViewSource?: () => void;
  onEdit: () => void;
  onToggleType: () => void;
  onApprove: () => void;
  onComplete: () => void;
  onSnooze: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

function cardContent(item: MindtaskerItem): string | null {
  const title = item.title.trim();
  const content = item.content.trim();
  if (!content || content === title) return null;
  return content;
}

function formatDueShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActionStrip({ action, align }: { action: SwipeSideAction; align: "left" | "right" }) {
  return (
    <View
      style={[
        styles.actionStrip,
        align === "left" ? styles.actionStripLeft : styles.actionStripRight,
        { backgroundColor: action.backgroundColor ?? "#e0e7ff" },
      ]}
    >
      <Text style={styles.hintText} numberOfLines={2}>
        {action.label}
      </Text>
    </View>
  );
}

export function SwipeableItem({
  item,
  userTags = [],
  tab,
  listView,
  leftAction,
  rightAction,
  onLongPressCheck,
  onViewSource,
  onEdit,
  onToggleType,
  onApprove,
  onComplete,
  onSnooze,
  onArchive,
  onRestore,
  onDelete,
}: SwipeableItemProps) {
  const swipeRef = useRef<Swipeable>(null);
  const isNote = !item.is_actionable;
  const analysis = getItemAnalysis(item.metadata);
  const extraContent = cardContent(item);
  const visibleTags = item.tags?.length > 2 ? item.tags.slice(0, 2) : item.tags ?? [];
  const hiddenTagCount =
    (item.tags?.length ?? 0) > visibleTags.length ? (item.tags?.length ?? 0) - visibleTags.length : 0;

  function handleOpen(direction: "left" | "right") {
    if (direction === "left" && leftAction) {
      leftAction.onTrigger();
    }
    if (direction === "right" && rightAction) {
      rightAction.onTrigger();
    }
    swipeRef.current?.close();
  }

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={ACTION_WIDTH * 0.45}
      rightThreshold={ACTION_WIDTH * 0.45}
      renderLeftActions={
        leftAction ? () => <ActionStrip action={leftAction} align="left" /> : undefined
      }
      renderRightActions={
        rightAction ? () => <ActionStrip action={rightAction} align="right" /> : undefined
      }
      onSwipeableOpen={handleOpen}
    >
      <View style={[styles.card, isNote ? styles.noteCard : styles.taskCard]}>
        <TouchableOpacity
          activeOpacity={1}
          onLongPress={!isNote ? onLongPressCheck : undefined}
          delayLongPress={400}
          style={styles.cardInner}
        >
          <View style={styles.titleRow}>
            {isNote ? <Text style={styles.pinIcon}>📌</Text> : null}
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {onViewSource ? (
              <SourceIndicator item={item} onPress={onViewSource} iconOnly />
            ) : null}
          </View>

          {extraContent ? (
            <Text style={styles.content} numberOfLines={1}>
              {extraContent}
            </Text>
          ) : null}

          {analysis ? (
            <View style={styles.analysisBox}>
              <View style={styles.analysisTopRow}>
                <Text style={[styles.urgencyBadge, { color: urgencyColor(analysis.urgency) }]}>
                  {analysis.urgency}
                </Text>
                {formatAnalysisTime(analysis.notify_at) ? (
                  <Text style={styles.notifyText}>
                    🔔 {formatAnalysisTime(analysis.notify_at)}
                  </Text>
                ) : null}
              </View>
              {showTimeMention(analysis) ? (
                <Text style={styles.analysisMeta} numberOfLines={1}>
                  ⏱ {analysis.time_mention}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <Text
              style={[styles.typeBadge, isNote ? styles.typeBadgeNote : styles.typeBadgeTask]}
            >
              {isNote ? "הערה" : "משימה"}
            </Text>
            {!isNote && item.due_date ? (
              <Text style={styles.meta}>📅 {formatDueShort(item.due_date)}</Text>
            ) : null}
            {visibleTags.map((tag) => {
                const bg = colorForTag(tag, userTags);
                return (
                  <Text
                    key={tag}
                    style={[styles.tag, { backgroundColor: `${bg}33`, color: bg }]}
                  >
                    #{tag}
                  </Text>
                );
              })}
              {hiddenTagCount > 0 ? (
                <Text style={styles.moreTags}>+{hiddenTagCount}</Text>
              ) : null}
          </View>

          <ItemActionBar
            item={item}
            tab={tab}
            listView={listView}
            onEdit={onEdit}
            onToggleType={onToggleType}
            onComplete={onComplete}
            onSnooze={onSnooze}
          />
        </TouchableOpacity>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  actionStrip: {
    width: ACTION_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 8,
  },
  actionStripLeft: { alignItems: "flex-start" },
  actionStripRight: { alignItems: "flex-end" },
  hintText: { fontWeight: "700", color: "#1e293b", fontSize: 12, textAlign: "center" },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  cardInner: { paddingHorizontal: 8, paddingVertical: 6 },
  taskCard: { backgroundColor: "#f0f9ff", borderColor: "#bfdbfe" },
  noteCard: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
  },
  pinIcon: { fontSize: 10 },
  title: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "right",
  },
  content: { marginTop: 1, fontSize: 10, color: "#64748b", textAlign: "right" },
  analysisBox: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.65)",
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  analysisTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  urgencyBadge: { fontSize: 9, fontWeight: "700" },
  notifyText: { fontSize: 9, color: "#6d28d9", fontWeight: "600" },
  analysisMeta: { fontSize: 9, color: "#64748b", textAlign: "right" },
  metaRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 3, marginTop: 3 },
  typeBadge: {
    fontSize: 9,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: "700",
  },
  typeBadgeTask: { backgroundColor: "#e0f2fe", color: "#0369a1" },
  typeBadgeNote: { backgroundColor: "#fef3c7", color: "#b45309" },
  meta: {
    fontSize: 9,
    color: "#2563eb",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
  },
  tag: { fontSize: 9, paddingHorizontal: 3, paddingVertical: 0, borderRadius: 6 },
  moreTags: { fontSize: 9, color: "#94a3b8" },
});
