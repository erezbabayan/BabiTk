import { defaultTaskListName } from "./taskListNames";

export type TaskListStatus = "active" | "archived";

export type TaskListRow = {
  id: string;
  user_id: string;
  name: string;
  filter_tags: string[] | null;
  reminder_at: string | null;
  status: TaskListStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TaskListRecordShape = {
  _id: string;
  _creationTime: number;
  userId: string;
  name: string;
  filterTags: string[];
  reminderAt: string | null;
  status: TaskListStatus;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  items: [];
};

export type TaskListDraft = {
  name: string;
  filterTags: string[];
  sortOrder: number;
};

export function normalizeListFilterTags(filterTags: string[]): string[] {
  return [
    ...new Set(
      filterTags
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter((tag) => tag.length > 0),
    ),
  ];
}

export function nextTaskListSortOrder(
  existing: Array<{ sortOrder: number }>,
): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((list) => list.sortOrder)) + 1;
}

/** One curated list per selected tag — same behavior as the old Convex mutation. */
export function plansForNewListsFromTags(args: {
  filterTags: string[];
  name?: string;
  nextSortOrder: number;
  nowMs?: number;
}): TaskListDraft[] {
  const tags = normalizeListFilterTags(args.filterTags);
  if (tags.length === 0) {
    throw new Error("יש לבחור לפחות תגית אחת");
  }

  const now = args.nowMs ?? Date.now();
  return tags.map((tag, index) => ({
    name:
      tags.length === 1 && args.name?.trim()
        ? args.name.trim()
        : defaultTaskListName([tag], now),
    filterTags: [tag],
    sortOrder: args.nextSortOrder + index,
  }));
}

export function newTaskListId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `list-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function toTaskListRecordShape(list: {
  _id: string;
  _creationTime: number;
  userId: string;
  name: string;
  filterTags?: string[];
  reminderAt?: string | null;
  status: TaskListStatus;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}): TaskListRecordShape {
  return {
    _id: list._id,
    _creationTime: list._creationTime,
    userId: list.userId,
    name: list.name,
    filterTags: list.filterTags ?? [],
    reminderAt: list.reminderAt ?? null,
    status: list.status,
    sortOrder: list.sortOrder,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
    deletedAt: list.deletedAt,
    items: [],
  };
}

export function taskListRowToRecord(row: TaskListRow): TaskListRecordShape {
  const createdAt = new Date(row.created_at).getTime();
  const updatedAt = new Date(row.updated_at).getTime();
  return {
    _id: row.id,
    _creationTime: Number.isFinite(createdAt) ? createdAt : 0,
    userId: row.user_id,
    name: row.name,
    filterTags: row.filter_tags ?? [],
    reminderAt: row.reminder_at ?? null,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).getTime() : null,
    items: [],
  };
}

export function taskListRecordToRow(list: TaskListRecordShape): TaskListRow {
  return {
    id: list._id,
    user_id: list.userId,
    name: list.name,
    filter_tags: list.filterTags,
    reminder_at: list.reminderAt,
    status: list.status,
    sort_order: list.sortOrder,
    created_at: new Date(list.createdAt).toISOString(),
    updated_at: new Date(list.updatedAt).toISOString(),
    deleted_at: list.deletedAt ? new Date(list.deletedAt).toISOString() : null,
  };
}

export function sortTaskListRecords<T extends { sortOrder: number; createdAt: number }>(
  lists: T[],
): T[] {
  return [...lists].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.createdAt - a.createdAt;
  });
}

export function isMissingTaskListsTableError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("task_lists") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find") ||
        message.includes("not find the table")))
  );
}

export function validateListName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("שם הרשימה לא יכול להיות ריק");
  return trimmed;
}

export function validateReminderAt(reminderAt: string | null): string | null {
  if (reminderAt === null) return null;
  const parsed = new Date(reminderAt);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("תאריך תזכורת לא תקין");
  }
  return reminderAt;
}
