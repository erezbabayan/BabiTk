// Pure widget model: snapshot shape, board switching and deep links.
// No React Native imports so it runs under `node --test` and inside the
// headless widget task alike.

export type WidgetBoard = "inbox" | "today" | "notes";

/** App order. The widget draws it right-to-left (inbox is the rightmost chip). */
export const WIDGET_BOARDS: readonly WidgetBoard[] = ["inbox", "today", "notes"];

export const WIDGET_BOARD_LABELS: Record<WidgetBoard, string> = {
  inbox: "המחברת",
  today: "משימות לביצוע",
  notes: "הערות",
};

/** Same accents as the app columns (board-accent.ts). */
export const WIDGET_BOARD_COLORS: Record<WidgetBoard, `#${string}`> = {
  inbox: "#94a3b8",
  today: "#3B82F6",
  notes: "#F97316",
};

export const WIDGET_NAME = "BabiTkBoards";
export const WIDGET_SNAPSHOT_VERSION = 1;
/** Items kept per board in the snapshot (large size shows a scrolling list). */
export const WIDGET_MAX_ITEMS = 25;
export const WIDGET_MEDIUM_ITEMS = 3;
/** After this the widget says "open the app to refresh". It never refreshes tokens itself. */
export const WIDGET_STALE_MS = 6 * 60 * 60 * 1000;
/** Widgets shorter than this (dp) use the medium layout. */
export const WIDGET_LARGE_MIN_HEIGHT_DP = 260;

export interface WidgetItem {
  id: string;
  title: string;
  /** Short secondary line: due date for tasks, body preview for notes. */
  subtitle: string | null;
  isTask: boolean;
}

export interface WidgetBoardSnapshot {
  count: number;
  items: WidgetItem[];
}

export interface WidgetSnapshot {
  version: number;
  signedIn: boolean;
  updatedAt: number;
  boards: Record<WidgetBoard, WidgetBoardSnapshot>;
}

/** Minimal MindtaskerItem-compatible shape the snapshot needs. */
export interface WidgetSourceItem {
  id: string;
  title?: string | null;
  content?: string | null;
  is_actionable?: boolean;
  due_date?: string | null;
}

const TITLE_MAX_CHARS = 80;
const SUBTITLE_MAX_CHARS = 60;

function firstLine(text: string | null | undefined): string {
  if (!text) return "";
  const line = text
    .split(/\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? "";
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function formatWidgetDue(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month} · ${hh}:${mm}`;
}

export function toWidgetItem(item: WidgetSourceItem): WidgetItem {
  const title = firstLine(item.title) || firstLine(item.content) || "ללא שם";
  const body = firstLine(item.content);
  const isTask = Boolean(item.is_actionable);
  const due = isTask ? formatWidgetDue(item.due_date) : null;
  const preview = body && body !== title ? clip(body, SUBTITLE_MAX_CHARS) : null;
  return {
    id: item.id,
    title: clip(title, TITLE_MAX_CHARS),
    subtitle: due ?? preview,
    isTask,
  };
}

function boardSnapshot(items: readonly WidgetSourceItem[]): WidgetBoardSnapshot {
  return {
    count: items.length,
    items: items.slice(0, WIDGET_MAX_ITEMS).map(toWidgetItem),
  };
}

export function buildWidgetSnapshot(
  boards: Record<WidgetBoard, readonly WidgetSourceItem[]>,
  now: number = Date.now(),
): WidgetSnapshot {
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    signedIn: true,
    updatedAt: now,
    boards: {
      inbox: boardSnapshot(boards.inbox),
      today: boardSnapshot(boards.today),
      notes: boardSnapshot(boards.notes),
    },
  };
}

export function signedOutSnapshot(now: number = Date.now()): WidgetSnapshot {
  const empty = { count: 0, items: [] };
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    signedIn: false,
    updatedAt: now,
    boards: { inbox: empty, today: empty, notes: empty },
  };
}

export function parseWidgetSnapshot(raw: string | null | undefined): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WidgetSnapshot>;
    if (value?.version !== WIDGET_SNAPSHOT_VERSION || !value.boards) return null;
    for (const board of WIDGET_BOARDS) {
      const b = value.boards[board];
      if (!b || !Array.isArray(b.items) || typeof b.count !== "number") return null;
    }
    return value as WidgetSnapshot;
  } catch {
    return null;
  }
}

export function snapshotsEqualIgnoringTime(a: WidgetSnapshot | null, b: WidgetSnapshot): boolean {
  if (!a) return false;
  return (
    a.signedIn === b.signedIn && JSON.stringify(a.boards) === JSON.stringify(b.boards)
  );
}

export function parseWidgetBoard(value: unknown): WidgetBoard | null {
  return typeof value === "string" && (WIDGET_BOARDS as readonly string[]).includes(value)
    ? (value as WidgetBoard)
    : null;
}

/**
 * Board switching with wrap-around. `1` = next in app order (inbox → today → notes → inbox),
 * which in the right-to-left widget is the left arrow ‹.
 */
export function nextWidgetBoard(current: WidgetBoard, direction: 1 | -1): WidgetBoard {
  const index = WIDGET_BOARDS.indexOf(current);
  const size = WIDGET_BOARDS.length;
  return WIDGET_BOARDS[(index + direction + size) % size];
}

export function isWidgetSnapshotStale(snapshot: WidgetSnapshot, now: number = Date.now()): boolean {
  return now - snapshot.updatedAt > WIDGET_STALE_MS;
}

export type WidgetSize = "medium" | "large";

export function widgetSizeForHeight(heightDp: number): WidgetSize {
  return heightDp >= WIDGET_LARGE_MIN_HEIGHT_DP ? "large" : "medium";
}

export function visibleWidgetItems(
  board: WidgetBoardSnapshot,
  size: WidgetSize,
): { items: WidgetItem[]; moreCount: number } {
  const limit = size === "medium" ? WIDGET_MEDIUM_ITEMS : WIDGET_MAX_ITEMS;
  const items = board.items.slice(0, limit);
  return { items, moreCount: Math.max(0, board.count - items.length) };
}

export function formatWidgetUpdated(updatedAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60000));
  if (minutes < 1) return "עודכן עכשיו";
  if (minutes < 60) return `עודכן לפני ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "עודכן לפני שעה" : `עודכן לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "עודכן אתמול" : `עודכן לפני ${days} ימים`;
}

// ---- Deep links (handled in App.tsx) ----

const LINK_SCHEME = "mindtasker://";
const ITEM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function widgetItemUri(id: string): string {
  return `${LINK_SCHEME}item/${encodeURIComponent(id)}`;
}

export function widgetBoardUri(board: WidgetBoard): string {
  return `${LINK_SCHEME}board/${board}`;
}

export function widgetAddUri(board: WidgetBoard): string {
  return `${LINK_SCHEME}add/${board}`;
}

export type WidgetLink =
  | { kind: "item"; id: string }
  | { kind: "board"; board: WidgetBoard }
  | { kind: "add"; board: WidgetBoard };

export function parseWidgetLink(url: string | null | undefined): WidgetLink | null {
  if (!url || !url.startsWith(LINK_SCHEME)) return null;
  const path = url.slice(LINK_SCHEME.length).split(/[?#]/)[0].replace(/\/+$/, "");
  const [host, value, ...rest] = path.split("/");
  if (!value || rest.length) return null;
  if (host === "item") {
    let id: string;
    try {
      id = decodeURIComponent(value);
    } catch {
      return null;
    }
    return ITEM_ID_RE.test(id) ? { kind: "item", id } : null;
  }
  const board = parseWidgetBoard(value);
  if (!board) return null;
  if (host === "board") return { kind: "board", board };
  if (host === "add") return { kind: "add", board };
  return null;
}
