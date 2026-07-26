import type { Id } from "../../../convex/_generated/dataModel";
import { filterConvexDocumentIds } from "../../../convex/lib/convexIds";
import type { MindtaskerItem } from "../types";

export type TaskListItemRecord = {
  _id: Id<"taskListItems">;
  _creationTime: number;
  userId: Id<"users">;
  listId: Id<"taskLists">;
  sourceTaskId: Id<"tasks">;
  title: string;
  content: string;
  status: MindtaskerItem["status"];
  dueDate: string | null;
  completedAt: string | null;
  tags: string[];
  metadata?: unknown;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type TaskListRecord = {
  _id: Id<"taskLists">;
  _creationTime: number;
  userId: Id<"users">;
  name: string;
  filterTags: string[];
  reminderAt?: string | null;
  taskIds?: Id<"tasks">[];
  status: "active" | "archived";
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  items: TaskListItemRecord[];
};

const LIST_VISIBLE_STATUSES = new Set<MindtaskerItem["status"]>([
  "pending",
  "completed",
]);

function normalizeListTag(tag: string): string {
  return tag.trim().replace(/^#/, "");
}

/** Guard legacy/partial list payloads from crashing the UI. */
export function normalizeTaskListRecord(list: TaskListRecord): TaskListRecord {
  return {
    ...list,
    filterTags: list.filterTags ?? [],
    items: list.items ?? [],
    reminderAt: list.reminderAt ?? null,
  };
}

/** Live board state for list display — today + completed.
 * Archived tasks are included only so list rows can resolve live status and hide them.
 */
export function boardTasksForListSync(items: {
  todayTasks: MindtaskerItem[];
  completedTasks?: MindtaskerItem[];
  archivedTasks?: MindtaskerItem[];
}): MindtaskerItem[] {
  const seen = new Set<string>();
  const merged: MindtaskerItem[] = [];
  for (const item of [
    ...items.todayTasks,
    ...(items.completedTasks ?? []),
    ...(items.archivedTasks ?? []),
  ]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function itemMatchesListTags(item: MindtaskerItem, filterTags: string[]): boolean {
  const tagSet = new Set(filterTags.map(normalizeListTag).filter(Boolean));
  if (tagSet.size === 0) return false;
  return (item.tags ?? []).some((tag) => tagSet.has(normalizeListTag(tag)));
}

function isTodayBoardListTask(item: MindtaskerItem): boolean {
  if (item.deleted_at) return false;
  if (!item.is_actionable) return false;
  return item.status === "pending";
}

function isVisibleListTask(item: MindtaskerItem): boolean {
  if (item.deleted_at) return false;
  if (!item.is_actionable) return false;
  if (item.status === "snoozed_archive") return false;
  return LIST_VISIBLE_STATUSES.has(item.status);
}

/** Board tasks that belong in a list (today column + matching tags). */
export function filterBoardTasksByListTags(
  tasks: MindtaskerItem[],
  filterTags: string[],
): MindtaskerItem[] {
  return tasks.filter(
    (item) => isVisibleListTask(item) && itemMatchesListTags(item, filterTags),
  );
}

/** Active today-board tasks for list creation / refresh — excludes archive & completed. */
export function filterTodayBoardTasksByListTags(
  tasks: MindtaskerItem[],
  filterTags: string[],
): MindtaskerItem[] {
  return tasks.filter(
    (item) => isTodayBoardListTask(item) && itemMatchesListTags(item, filterTags),
  );
}

/** Convex task ids from the live today board — skips legacy UUID / demo ids. */
export function resolveBoardSourceTaskIds(
  boardTasks: MindtaskerItem[],
  filterTags: string[],
): Id<"tasks">[] {
  return filterConvexDocumentIds(
    filterTodayBoardTasksByListTags(boardTasks, filterTags).map((item) => item.id),
  ) as Id<"tasks">[];
}

function mergeListItemWithBoard(
  listItem: MindtaskerItem,
  boardById: Map<string, MindtaskerItem>,
  filterTags: string[],
): MindtaskerItem | null {
  const live = boardById.get(listItem.id);
  const item = live ?? listItem;
  // Prefer live board status — hide archived / deleted even if the list snapshot is stale.
  if (item.deleted_at) return null;
  if (item.status === "snoozed_archive") return null;
  if (!isVisibleListTask(item)) return null;
  if (filterTags.length > 0 && !itemMatchesListTags(item, filterTags)) return null;
  return item;
}

/** List rows — prefer live board state over stored snapshots (bidirectional sync). */
export function resolveListDisplayItems(
  list: TaskListRecord,
  boardTasks: MindtaskerItem[],
): MindtaskerItem[] {
  const filterTags = list.filterTags ?? [];
  const boardById = new Map(boardTasks.map((item) => [item.id, item]));
  const stored = (list.items ?? [])
    .map(taskListItemToMindtaskerItem)
    .map((item) => mergeListItemWithBoard(item, boardById, filterTags))
    .filter((item): item is MindtaskerItem => item !== null);

  if (stored.length > 0) return stored;
  return filterBoardTasksByListTags(boardTasks, filterTags);
}

export function taskListStatusSummary(list: TaskListRecord, boardTasks?: MindtaskerItem[]) {
  const items = boardTasks
    ? resolveListDisplayItems(list, boardTasks)
    : (list.items ?? []).map(taskListItemToMindtaskerItem);
  const total = items.length;
  const completed = items.filter((item) => item.status === "completed").length;
  const pending = items.filter((item) => item.status === "pending").length;
  const archived = items.filter((item) => item.status === "snoozed_archive").length;
  return { total, completed, pending, archived };
}

export function formatListStatusSummary(list: TaskListRecord, boardTasks?: MindtaskerItem[]): string {
  const { total, completed, pending, archived } = taskListStatusSummary(list, boardTasks);
  if (total === 0) return "0 משימות";
  const parts = [`${total} משימות`];
  if (pending > 0) parts.push(`${pending} לביצוע`);
  if (completed > 0) parts.push(`${completed} הושלמו`);
  if (archived > 0) parts.push(`${archived} בארכיון`);
  return parts.join(" · ");
}

export function taskListItemToMindtaskerItem(item: TaskListItemRecord): MindtaskerItem {
  return {
    id: item.sourceTaskId,
    user_id: item.userId,
    source_material_id: null,
    title: item.title,
    content: item.content,
    is_actionable: true,
    status: item.status,
    due_date: item.dueDate,
    completed_at: item.completedAt,
    tags: item.tags,
    metadata: (item.metadata as Record<string, unknown> | undefined) ?? null,
    sort_order: item.sortOrder,
    last_interacted_at: new Date(item.updatedAt).toISOString(),
    created_at: new Date(item.createdAt).toISOString(),
    updated_at: new Date(item.updatedAt).toISOString(),
    deleted_at: item.deletedAt ? new Date(item.deletedAt).toISOString() : null,
  };
}
