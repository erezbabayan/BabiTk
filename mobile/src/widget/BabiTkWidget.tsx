// Home-screen widget UI (react-native-android-widget primitives, not RN views).
// The app root is LTR with Hebrew laid out right-to-left by hand, so rows here
// are authored in visual order: the rightmost element comes last.
import { FlexWidget, ListWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import {
  formatDueBadge,
  formatWidgetUpdated,
  isWidgetSnapshotStale,
  visibleWidgetItems,
  widgetAddUri,
  widgetBoardUri,
  widgetItemUri,
  WIDGET_BOARD_LABELS,
  WIDGET_BOARDS,
  type WidgetBoard,
  type WidgetItem,
  type WidgetSize,
  type WidgetSnapshot,
} from "./widget-model";
import { WIDGET_LOGO_GREY_SVG, WIDGET_LOGO_SVG } from "./widget-logo";

const INK = "#0f172a" as const;
const BRAND_INK = "#1E293B" as const;
const MUTED = "#64748b" as const;
const SURFACE = "#ffffff" as const;
const TRACK = "#f1f5f9" as const;
const LINE = "#e9eef5" as const;
const TASK_BLUE = "#3B82F6" as const;
const NOTE_ORANGE = "#F97316" as const;
const BRAND = "#4f46e5" as const;

/** Android 12+ widget corner radius and matching inner padding. */
const WIDGET_RADIUS = 24;
const WIDGET_PADDING = 14;

/** Segment dot / counter colors. The notebook uses a darker slate so white digits stay readable. */
const SEGMENT_COLORS: Record<WidgetBoard, `#${string}`> = {
  inbox: "#64748b",
  today: TASK_BLUE,
  notes: NOTE_ORANGE,
};

const SEGMENT_LABELS: Record<WidgetBoard, string> = {
  inbox: "מחברת",
  today: "משימות",
  notes: "הערות",
};

export const WIDGET_ACTIONS = {
  next: "BOARD_NEXT",
  prev: "BOARD_PREV",
  select: "BOARD_SELECT",
  refresh: "REFRESH",
} as const;

interface Props {
  snapshot: WidgetSnapshot | null;
  board: WidgetBoard;
  size: WidgetSize;
  now?: number;
}

function BrandHeader({ board }: { board: WidgetBoard }) {
  const button = {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center" }}>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: widgetAddUri(board) }}
        accessibilityLabel="הוסף"
        style={{ ...button, backgroundColor: TASK_BLUE }}
      >
        <TextWidget text="+" style={{ fontSize: 18, color: SURFACE, fontWeight: "700" }} />
      </FlexWidget>
      <FlexWidget style={{ width: 6 }} />
      <FlexWidget
        clickAction={WIDGET_ACTIONS.refresh}
        accessibilityLabel="רענון"
        style={{ ...button, borderWidth: 1, borderColor: LINE }}
      >
        <TextWidget text="⟳" style={{ fontSize: 15, color: MUTED, fontWeight: "700" }} />
      </FlexWidget>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: widgetBoardUri(board) }}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}
      >
        <TextWidget text="BabiTk" style={{ fontSize: 17, fontWeight: "700", color: BRAND_INK }} />
        <FlexWidget style={{ width: 6 }} />
        <SvgWidget svg={WIDGET_LOGO_SVG} style={{ width: 24, height: 27 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function Arrow({ label, action }: { label: string; action: string }) {
  return (
    <FlexWidget
      clickAction={action}
      style={{ width: 20, height: 34, alignItems: "center", justifyContent: "center" }}
    >
      <TextWidget text={label} style={{ fontSize: 18, color: MUTED }} />
    </FlexWidget>
  );
}

function BoardSwitcher({ snapshot, board }: { snapshot: WidgetSnapshot; board: WidgetBoard }) {
  // Visual order right-to-left = app order, so draw reversed.
  const visual = [...WIDGET_BOARDS].reverse();
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center", marginTop: 10 }}>
      {/* ‹ on the left moves forward in RTL reading order. */}
      <Arrow label="‹" action={WIDGET_ACTIONS.next} />
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: "row",
          backgroundColor: TRACK,
          borderRadius: 12,
          padding: 3,
        }}
      >
        {visual.map((b, i) => {
          const active = b === board;
          const color = SEGMENT_COLORS[b];
          return (
            <FlexWidget
              key={b}
              clickAction={WIDGET_ACTIONS.select}
              clickActionData={{ board: b }}
              accessibilityLabel={`${WIDGET_BOARD_LABELS[b]} ${snapshot.boards[b].count}`}
              style={{
                flex: 1,
                height: 28,
                marginLeft: i === 0 ? 0 : 3,
                borderRadius: 9,
                backgroundColor: active ? SURFACE : TRACK,
                borderWidth: 1,
                borderColor: active ? LINE : TRACK,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FlexWidget
                style={{
                  borderRadius: 8,
                  paddingHorizontal: 5,
                  backgroundColor: active ? color : TRACK,
                }}
              >
                <TextWidget
                  text={String(snapshot.boards[b].count)}
                  style={{ fontSize: 10, fontWeight: "700", color: active ? SURFACE : MUTED }}
                />
              </FlexWidget>
              <FlexWidget style={{ width: 4 }} />
              <TextWidget
                text={SEGMENT_LABELS[b]}
                maxLines={1}
                style={{ fontSize: 12, fontWeight: active ? "700" : "500", color: active ? INK : MUTED }}
              />
              <FlexWidget style={{ width: 5 }} />
              <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
            </FlexWidget>
          );
        })}
      </FlexWidget>
      <Arrow label="›" action={WIDGET_ACTIONS.prev} />
    </FlexWidget>
  );
}

function KindMark({ isTask }: { isTask: boolean }) {
  return isTask ? (
    <FlexWidget style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: TASK_BLUE }} />
  ) : (
    <FlexWidget style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: NOTE_ORANGE }} />
  );
}

function ItemRow({
  item,
  compact,
  first,
  now,
}: {
  item: WidgetItem;
  compact: boolean;
  first: boolean;
  now: number;
}) {
  const badge = item.isTask ? formatDueBadge(item.dueAt, now) : null;
  const secondary = badge ? null : item.isTask && item.dueAt != null ? null : item.subtitle;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetItemUri(item.id) }}
      style={{
        width: "match_parent",
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: compact ? 6 : 8,
        paddingHorizontal: 2,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: LINE,
      }}
    >
      {badge ? (
        <FlexWidget
          style={{
            borderRadius: 6,
            paddingHorizontal: 6,
            paddingVertical: 1,
            marginRight: 8,
            backgroundColor: badge.overdue ? "#fef2f2" : "#eff6ff",
          }}
        >
          <TextWidget
            text={badge.text}
            maxLines={1}
            style={{ fontSize: 11, fontWeight: "700", color: badge.overdue ? "#b91c1c" : "#1d4ed8" }}
          />
        </FlexWidget>
      ) : null}
      <FlexWidget style={{ flex: 1, flexDirection: "column", alignItems: "flex-end" }}>
        <TextWidget
          text={item.title}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 14, color: INK, textAlign: "right", fontWeight: "600" }}
        />
        {!compact && secondary ? (
          <TextWidget
            text={secondary}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, color: MUTED, textAlign: "right" }}
          />
        ) : null}
      </FlexWidget>
      <FlexWidget style={{ width: 10 }} />
      <KindMark isTask={item.isTask} />
    </FlexWidget>
  );
}

function Dots({ board }: { board: WidgetBoard }) {
  const visual = [...WIDGET_BOARDS].reverse();
  return (
    <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
      {visual.map((b) => (
        <FlexWidget
          key={b}
          style={{
            width: b === board ? 14 : 6,
            height: 6,
            borderRadius: 3,
            marginLeft: 3,
            backgroundColor: b === board ? SEGMENT_COLORS[b] : "#cbd5e1",
          }}
        />
      ))}
    </FlexWidget>
  );
}

function EmptyState({
  title,
  body,
  addBoard,
}: {
  title: string;
  body: string;
  addBoard?: WidgetBoard;
}) {
  return (
    <FlexWidget
      clickAction={addBoard ? "OPEN_URI" : "OPEN_APP"}
      clickActionData={addBoard ? { uri: widgetAddUri(addBoard) } : undefined}
      style={{ flex: 1, width: "match_parent", alignItems: "center", justifyContent: "center", padding: 6 }}
    >
      <SvgWidget svg={WIDGET_LOGO_GREY_SVG} style={{ width: 30, height: 34 }} />
      <TextWidget
        text={title}
        style={{ fontSize: 14, fontWeight: "700", color: INK, textAlign: "center", marginTop: 6 }}
      />
      <TextWidget text={body} maxLines={2} style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 2 }} />
      {addBoard ? (
        <FlexWidget
          style={{
            marginTop: 8,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 5,
            backgroundColor: TASK_BLUE,
          }}
        >
          <TextWidget text="+ הוסף" style={{ fontSize: 12, fontWeight: "700", color: SURFACE }} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

export function BabiTkWidget({ snapshot, board, size, now = Date.now() }: Props) {
  const shell = {
    height: "match_parent" as const,
    width: "match_parent" as const,
    backgroundColor: SURFACE,
    borderRadius: WIDGET_RADIUS,
    padding: WIDGET_PADDING,
    flexDirection: "column" as const,
  };

  if (!snapshot || !snapshot.signedIn) {
    return (
      <FlexWidget style={shell}>
        <BrandHeader board={board} />
        <EmptyState title="BabiTk" body="התחבר באפליקציה כדי לראות כאן את הבורדים" />
      </FlexWidget>
    );
  }

  const current = snapshot.boards[board];
  const { items, moreCount } = visibleWidgetItems(current, size);
  const stale = isWidgetSnapshotStale(snapshot, now);
  const compact = size === "medium";
  const updated = formatWidgetUpdated(snapshot.updatedAt, now);
  const footerText = stale
    ? "פתח את BabiTk לרענון"
    : moreCount > 0 && compact
      ? `עוד ${moreCount} באפליקציה · ${updated}`
      : updated;

  const rows = items.map((item, index) => (
    <ItemRow key={item.id} item={item} compact={compact} first={index === 0} now={now} />
  ));

  return (
    <FlexWidget style={shell}>
      <BrandHeader board={board} />
      <BoardSwitcher snapshot={snapshot} board={board} />
      {items.length === 0 ? (
        <EmptyState
          title="אין פריטים"
          body={`${WIDGET_BOARD_LABELS[board]} ריקה כרגע`}
          addBoard={board}
        />
      ) : compact ? (
        <FlexWidget
          style={{ flex: 1, width: "match_parent", flexDirection: "column", overflow: "hidden", marginTop: 4 }}
        >
          {rows}
        </FlexWidget>
      ) : (
        <ListWidget style={{ height: "match_parent", width: "match_parent", marginTop: 4 }}>{rows}</ListWidget>
      )}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: widgetBoardUri(board) }}
        style={{
          flexDirection: "row",
          width: "match_parent",
          alignItems: "center",
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: LINE,
        }}
      >
        {stale ? (
          <FlexWidget style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#eef2ff" }}>
            <TextWidget text={footerText} maxLines={1} style={{ fontSize: 11, color: BRAND, fontWeight: "700" }} />
          </FlexWidget>
        ) : (
          <TextWidget text={footerText} maxLines={1} style={{ fontSize: 11, color: MUTED }} />
        )}
        <FlexWidget style={{ flex: 1 }} />
        <Dots board={board} />
      </FlexWidget>
    </FlexWidget>
  );
}
