// Home-screen widget UI (react-native-android-widget primitives, not RN views).
// The app root is LTR with Hebrew laid out right-to-left by hand, so rows here
// are authored in visual order: the rightmost element comes last.
import { FlexWidget, ListWidget, TextWidget } from "react-native-android-widget";
import {
  formatWidgetUpdated,
  isWidgetSnapshotStale,
  visibleWidgetItems,
  widgetAddUri,
  widgetBoardUri,
  widgetItemUri,
  WIDGET_BOARD_COLORS,
  WIDGET_BOARD_LABELS,
  WIDGET_BOARDS,
  type WidgetBoard,
  type WidgetItem,
  type WidgetSize,
  type WidgetSnapshot,
} from "./widget-model";

const INK = "#0f172a" as const;
const MUTED = "#64748b" as const;
const SURFACE = "#ffffff" as const;
const CHIP_IDLE = "#f1f5f9" as const;
const BRAND = "#4f46e5" as const;

const CHIP_LABELS: Record<WidgetBoard, string> = {
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

function IconButton({ label, action, data }: { label: string; action: string; data?: Record<string, unknown> }) {
  return (
    <FlexWidget
      clickAction={action}
      clickActionData={data}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: CHIP_IDLE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TextWidget text={label} style={{ fontSize: 16, color: INK, fontWeight: "700" }} />
    </FlexWidget>
  );
}

function Header({ board, count }: { board: WidgetBoard; count: number }) {
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center" }}>
      <IconButton label="⟳" action={WIDGET_ACTIONS.refresh} />
      <FlexWidget style={{ width: 6 }} />
      <IconButton label="+" action="OPEN_URI" data={{ uri: widgetAddUri(board) }} />
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: widgetBoardUri(board) }}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}
      >
        <TextWidget
          text={`${WIDGET_BOARD_LABELS[board]} · ${count}`}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 15, fontWeight: "700", color: INK, textAlign: "right" }}
        />
        <FlexWidget
          style={{ width: 4, height: 18, marginLeft: 6, borderRadius: 2, backgroundColor: WIDGET_BOARD_COLORS[board] }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

function Chips({ snapshot, board }: { snapshot: WidgetSnapshot; board: WidgetBoard }) {
  // Visual order right-to-left = app order, so draw reversed.
  const visual = [...WIDGET_BOARDS].reverse();
  return (
    <FlexWidget style={{ flexDirection: "row", width: "match_parent", alignItems: "center", marginTop: 8 }}>
      {/* ‹ on the left moves forward in RTL reading order. */}
      <IconButton label="‹" action={WIDGET_ACTIONS.next} />
      {visual.map((b) => {
        const active = b === board;
        return (
          <FlexWidget
            key={b}
            clickAction={WIDGET_ACTIONS.select}
            clickActionData={{ board: b }}
            style={{
              flex: 1,
              height: 30,
              marginLeft: 4,
              marginRight: 4,
              borderRadius: 15,
              backgroundColor: active ? WIDGET_BOARD_COLORS[b] : CHIP_IDLE,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TextWidget
              text={`${CHIP_LABELS[b]} ${snapshot.boards[b].count}`}
              maxLines={1}
              style={{ fontSize: 12, fontWeight: "700", color: active ? SURFACE : INK }}
            />
          </FlexWidget>
        );
      })}
      <IconButton label="›" action={WIDGET_ACTIONS.prev} />
    </FlexWidget>
  );
}

function ItemRow({ item, board, compact }: { item: WidgetItem; board: WidgetBoard; compact: boolean }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetItemUri(item.id) }}
      style={{
        width: "match_parent",
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f8fafc",
        borderRadius: 10,
        paddingVertical: compact ? 4 : 8,
        paddingHorizontal: 10,
        marginTop: compact ? 4 : 6,
      }}
    >
      <FlexWidget style={{ flex: 1, flexDirection: "column", alignItems: "flex-end" }}>
        <TextWidget
          text={item.title}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 14, color: INK, textAlign: "right", fontWeight: "500" }}
        />
        {!compact && item.subtitle ? (
          <TextWidget
            text={item.subtitle}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 12, color: MUTED, textAlign: "right" }}
          />
        ) : null}
      </FlexWidget>
      <FlexWidget
        style={{
          width: 3,
          height: compact ? 18 : 30,
          marginLeft: 8,
          borderRadius: 2,
          backgroundColor: item.isTask ? WIDGET_BOARD_COLORS.today : WIDGET_BOARD_COLORS[board === "today" ? "today" : "notes"],
        }}
      />
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
            backgroundColor: b === board ? WIDGET_BOARD_COLORS[b] : "#cbd5e1",
          }}
        />
      ))}
    </FlexWidget>
  );
}

function Message({ title, body, uri }: { title: string; body: string; uri?: string }) {
  return (
    <FlexWidget
      clickAction={uri ? "OPEN_URI" : "OPEN_APP"}
      clickActionData={uri ? { uri } : undefined}
      style={{ flex: 1, width: "match_parent", alignItems: "center", justifyContent: "center", padding: 8 }}
    >
      <TextWidget text={title} style={{ fontSize: 15, fontWeight: "700", color: INK, textAlign: "center" }} />
      <TextWidget text={body} maxLines={2} style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 4 }} />
    </FlexWidget>
  );
}

export function BabiTkWidget({ snapshot, board, size, now = Date.now() }: Props) {
  const shell = {
    height: "match_parent" as const,
    width: "match_parent" as const,
    backgroundColor: SURFACE,
    borderRadius: 22,
    padding: 12,
    flexDirection: "column" as const,
  };

  if (!snapshot || !snapshot.signedIn) {
    return (
      <FlexWidget style={shell}>
        <Message title="BabiTk" body="התחבר באפליקציה כדי לראות כאן את הבורדים" />
      </FlexWidget>
    );
  }

  const current = snapshot.boards[board];
  const { items, moreCount } = visibleWidgetItems(current, size);
  const stale = isWidgetSnapshotStale(snapshot, now);
  const compact = size === "medium";
  const footerText = stale
    ? "פתח את האפליקציה לרענון"
    : moreCount > 0 && compact
      ? `עוד ${moreCount} באפליקציה`
      : formatWidgetUpdated(snapshot.updatedAt, now);

  const rows = items.map((item) => (
    <ItemRow key={item.id} item={item} board={board} compact={compact} />
  ));

  return (
    <FlexWidget style={shell}>
      <Header board={board} count={current.count} />
      <Chips snapshot={snapshot} board={board} />
      {items.length === 0 ? (
        <Message
          title="אין פריטים"
          body={`${WIDGET_BOARD_LABELS[board]} ריקה כרגע. לחץ + כדי להוסיף`}
          uri={widgetAddUri(board)}
        />
      ) : compact ? (
        <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "column", overflow: "hidden" }}>{rows}</FlexWidget>
      ) : (
        <ListWidget style={{ height: "match_parent", width: "match_parent", marginTop: 2 }}>{rows}</ListWidget>
      )}
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: widgetBoardUri(board) }}
        style={{ flexDirection: "row", width: "match_parent", alignItems: "center", marginTop: 6 }}
      >
        <TextWidget
          text={footerText}
          maxLines={1}
          style={{ fontSize: 11, color: stale ? BRAND : MUTED, fontWeight: stale ? "700" : "normal" }}
        />
        <FlexWidget style={{ flex: 1 }} />
        <Dots board={board} />
      </FlexWidget>
    </FlexWidget>
  );
}
