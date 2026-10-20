import type { MindtaskerItem } from "../types";
import { isoDateToDdMmYyyy } from "./date-display.ts";
import { taskCalendarDayKey } from "./task-calendar.ts";

const SOURCE_LABELS: Record<string, string> = {
  whatsapp_text: "וואטסאפ",
  whatsapp_voice: "קול",
  typed_text: "הקלדה",
  notebook_ocr: "תמונה",
  image: "תמונה",
  document: "מסמך",
  app_voice: "קול",
};

export type SystemActivityKind =
  | "created"
  | "updated"
  | "completed"
  | "archived"
  | "deleted";

export const ACTIVITY_KIND_LABELS: Record<SystemActivityKind, string> = {
  created: "נוצר",
  updated: "עודכן",
  completed: "הושלם",
  archived: "הועבר לארכיון",
  deleted: "נמחק",
};

export type SystemActivityEvent = {
  id: string;
  itemId: string;
  kind: SystemActivityKind;
  kindLabel: string;
  at: string;
  title: string;
  actor: string;
  sourceLabel: string;
  locationLabel: string;
  tags: string[];
  dueDate: string | null;
  detail: string | null;
  canOpen: boolean;
};

export type ActivityDateFilter = {
  from: string;
  to: string;
};

const NEAR_MS = 2500;
const UPDATE_MIN_MS = 60_000;
const ACTIVITY_TZ = "Asia/Jerusalem";

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function near(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= NEAR_MS;
}

function sourceLabelForItem(item: MindtaskerItem): string {
  const materialType = item.source_materials?.source_type;
  const metaSource = metaString(item.metadata, "source");
  const key = materialType ?? metaSource ?? "";
  return SOURCE_LABELS[key] ?? (key.includes("whatsapp") ? "וואטסאפ" : "הקלדה");
}

function locationLabelForEvent(item: MindtaskerItem, kind: SystemActivityKind): string {
  if (kind === "deleted" || item.deleted_at) return "נמחק";
  if (kind === "completed" || item.status === "completed") return "הושלם";
  if (kind === "archived" || item.status === "snoozed_archive") return "ארכיון";
  if (item.status === "inbox") return "המחברת";
  if (item.is_actionable) return "משימות לביצוע";
  return "הערות";
}

function createdDetail(item: MindtaskerItem): string | null {
  const parts: string[] = [];
  const chatId =
    metaString(item.metadata, "chat_id") ?? metaString(item.metadata, "chatId") ?? "";
  if (chatId.toLowerCase().endsWith("@g.us")) {
    parts.push("קבוצת וואטסאפ");
  } else if (chatId.toLowerCase().endsWith("@c.us")) {
    parts.push("וואטסאפ אישי");
  }
  if (item.metadata?.catchup === true) {
    parts.push("נמשך מהיסטוריית וואטסאפ");
  }
  const tags = (item.tags ?? []).filter(Boolean);
  if (tags.length > 0) {
    parts.push(`תגיות: ${tags.join(", ")}`);
  }
  if (item.due_date) {
    const day = taskCalendarDayKey(item.due_date) ?? item.due_date.slice(0, 10);
    const due = isoDateToDdMmYyyy(day);
    if (due) parts.push(`יעד: ${due}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function resolveActivityActor(
  item: MindtaskerItem,
  ownerName: string,
  kind: SystemActivityKind,
): string {
  const owner = ownerName.trim() || "בעל החשבון";
  if (kind !== "created") return owner;

  const chatId =
    metaString(item.metadata, "chat_id") ?? metaString(item.metadata, "chatId") ?? "";
  const sender =
    metaString(item.metadata, "senderName") ??
    metaString(item.metadata, "sender_name") ??
    metaString(item.metadata, "chatName");
  const source =
    metaString(item.metadata, "source") ?? item.source_materials?.source_type ?? "";

  if (chatId.toLowerCase().endsWith("@g.us")) {
    return sender || "קבוצת וואטסאפ";
  }
  if (source.includes("whatsapp") || chatId.toLowerCase().endsWith("@c.us")) {
    return sender || owner;
  }
  return owner;
}

function makeEvent(
  item: MindtaskerItem,
  kind: SystemActivityKind,
  at: string,
  ownerName: string,
): SystemActivityEvent {
  const title = item.title?.trim() || item.content?.trim().slice(0, 80) || "פריט ללא כותרת";
  return {
    id: `${item.id}:${kind}:${at}`,
    itemId: item.id,
    kind,
    kindLabel: ACTIVITY_KIND_LABELS[kind],
    at,
    title,
    actor: resolveActivityActor(item, ownerName, kind),
    sourceLabel: sourceLabelForItem(item),
    locationLabel: locationLabelForEvent(item, kind),
    tags: item.tags ?? [],
    dueDate: item.due_date,
    detail: kind === "created" ? createdDetail(item) : null,
    canOpen: !item.deleted_at,
  };
}

export function buildActivityEvents(
  items: MindtaskerItem[],
  ownerName: string,
): SystemActivityEvent[] {
  const events: SystemActivityEvent[] = [];

  for (const item of items) {
    if (item.created_at) {
      events.push(makeEvent(item, "created", item.created_at, ownerName));
    }
    if (item.completed_at) {
      events.push(makeEvent(item, "completed", item.completed_at, ownerName));
    }
    if (item.status === "snoozed_archive" && item.updated_at) {
      if (!near(item.updated_at, item.created_at) && !near(item.updated_at, item.deleted_at)) {
        events.push(makeEvent(item, "archived", item.updated_at, ownerName));
      }
    }
    if (item.deleted_at) {
      events.push(makeEvent(item, "deleted", item.deleted_at, ownerName));
    }
    if (item.updated_at) {
      const createdMs = Date.parse(item.created_at ?? "");
      const updatedMs = Date.parse(item.updated_at);
      const significant =
        Number.isFinite(createdMs) &&
        Number.isFinite(updatedMs) &&
        updatedMs - createdMs >= UPDATE_MIN_MS;
      const duplicate =
        near(item.updated_at, item.completed_at) ||
        near(item.updated_at, item.deleted_at) ||
        (item.status === "snoozed_archive" && !item.deleted_at);
      if (significant && !duplicate) {
        events.push(makeEvent(item, "updated", item.updated_at, ownerName));
      }
    }
  }

  events.sort((a, b) => {
    const byTime = b.at.localeCompare(a.at);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id, "he");
  });
  return events;
}

export function filterActivityEvents(
  events: SystemActivityEvent[],
  filter: ActivityDateFilter,
): SystemActivityEvent[] {
  const from = filter.from.trim();
  const to = filter.to.trim();
  if (!from && !to) return events;
  return events.filter((event) => {
    const day = taskCalendarDayKey(event.at);
    if (!day) return false;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

export function formatActivityWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = taskCalendarDayKey(date, ACTIVITY_TZ);
  const dateLabel = day ? isoDateToDdMmYyyy(day) : "";
  const time = new Intl.DateTimeFormat("he-IL", {
    timeZone: ACTIVITY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${dateLabel} ${time}`.trim();
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function excelCell(value: string): string {
  return `<Cell><Data ss:Type="String">${xmlText(value)}</Data></Cell>`;
}

export const ACTIVITY_EXCEL_HEADERS = [
  "תאריך ושעה",
  "פעולה",
  "כותרת",
  "מי יצר / ביצע",
  "מקור",
  "מיקום",
  "תגיות",
  "תאריך יעד",
  "פרטים",
] as const;

export function activityEventsToSpreadsheetXml(events: SystemActivityEvent[]): string {
  const headerRow = `<Row>${ACTIVITY_EXCEL_HEADERS.map((header) => excelCell(header)).join("")}</Row>`;
  const body = events
    .map((event) => {
      const due = event.dueDate
        ? isoDateToDdMmYyyy(taskCalendarDayKey(event.dueDate) ?? event.dueDate.slice(0, 10))
        : "";
      const cells = [
        formatActivityWhen(event.at),
        event.kindLabel,
        event.title,
        event.actor,
        event.sourceLabel,
        event.locationLabel,
        event.tags.join(", "),
        due,
        event.detail ?? "",
      ];
      return `<Row>${cells.map((cell) => excelCell(cell)).join("")}</Row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="פעילות">
    <Table>${headerRow}${body}</Table>
  </Worksheet>
</Workbook>
`;
}

export function activityExcelFileName(filter: ActivityDateFilter, now = new Date()): string {
  const stamp = taskCalendarDayKey(now, ACTIVITY_TZ) ?? now.toISOString().slice(0, 10);
  const from = filter.from.trim();
  const to = filter.to.trim();
  if (from && to) return `פעילות-BabiTk-${from}-${to}.xls`;
  if (from) return `פעילות-BabiTk-מ-${from}.xls`;
  if (to) return `פעילות-BabiTk-עד-${to}.xls`;
  return `פעילות-BabiTk-${stamp}.xls`;
}

export function downloadActivityExcel(
  events: SystemActivityEvent[],
  filter: ActivityDateFilter,
): void {
  if (typeof document === "undefined") return;
  const xml = activityEventsToSpreadsheetXml(events);
  const blob = new Blob(["\uFEFF", xml], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = activityExcelFileName(filter);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

