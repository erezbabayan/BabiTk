import type { Id } from "../../../convex/_generated/dataModel";
import {
  isMissingTaskListsTableError,
  newTaskListId,
  nextTaskListSortOrder,
  normalizeListFilterTags,
  plansForNewListsFromTags,
  sortTaskListRecords,
  taskListRecordToRow,
  taskListRowToRecord,
  toTaskListRecordShape,
  validateListName,
  validateReminderAt,
  type TaskListRecordShape,
  type TaskListRow,
  type TaskListStatus,
} from "../../../convex/lib/taskListOps";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";
import type { TaskListRecord } from "./task-list-items";

const LOCAL_KEY_PREFIX = "mindtasker:task-lists:";

let forceLocalStore = false;

function localKey(userId: string): string {
  return `${LOCAL_KEY_PREFIX}${userId}`;
}

function asTaskListRecord(list: TaskListRecordShape): TaskListRecord {
  return {
    ...list,
    _id: list._id as Id<"taskLists">,
    userId: list.userId as Id<"users">,
  };
}

function readLocalLists(userId: string): TaskListRecordShape[] {
  try {
    const raw = localStorage.getItem(localKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TaskListRow[];
    return sortTaskListRecords(
      parsed
        .filter((row) => !row.deleted_at)
        .map((row) => taskListRowToRecord(row)),
    );
  } catch {
    return [];
  }
}

function writeLocalLists(userId: string, lists: TaskListRecordShape[]): void {
  localStorage.setItem(
    localKey(userId),
    JSON.stringify(lists.map(taskListRecordToRow)),
  );
}

function shouldUseLocalStore(): boolean {
  return forceLocalStore || isDemoMode || !isSupabaseConfigured;
}

function rememberMissingTable(): void {
  forceLocalStore = true;
  console.warn("task_lists table is missing — using local lists until the migration is applied");
}

function asError(error: unknown): { code?: string; message?: string } {
  if (error && typeof error === "object") {
    const record = error as { code?: string; message?: string };
    return { code: record.code, message: record.message };
  }
  return { message: String(error) };
}

async function withTableFallback<T>(
  cloud: () => Promise<T>,
  local: () => T | Promise<T>,
): Promise<T> {
  if (shouldUseLocalStore()) return await local();
  try {
    return await cloud();
  } catch (error) {
    if (!isMissingTaskListsTableError(asError(error))) throw error;
    rememberMissingTable();
    return await local();
  }
}

export async function listTaskLists(userId: string): Promise<TaskListRecord[]> {
  const lists = await withTableFallback(
    async () => {
      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from("task_lists")
        .select(
          "id, user_id, name, filter_tags, reminder_at, status, sort_order, created_at, updated_at, deleted_at",
        )
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return sortTaskListRecords((data ?? []).map((row) => taskListRowToRecord(row as TaskListRow)));
    },
    () => readLocalLists(userId),
  );
  return lists.map(asTaskListRecord);
}

export async function createTaskListsFromTags(
  userId: string,
  filterTags: string[],
  name?: string,
): Promise<TaskListRecord[]> {
  const existing = await listTaskLists(userId);
  const now = Date.now();
  const drafts = plansForNewListsFromTags({
    filterTags,
    name,
    nextSortOrder: nextTaskListSortOrder(existing),
    nowMs: now,
  });

  const created: TaskListRecordShape[] = drafts.map((draft) => ({
    _id: newTaskListId(),
    _creationTime: now,
    userId,
    name: draft.name,
    filterTags: draft.filterTags,
    reminderAt: null,
    status: "active",
    sortOrder: draft.sortOrder,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    items: [],
  }));

  await withTableFallback(
    async () => {
      const supabase = requireSupabase();
      const { error } = await supabase.from("task_lists").insert(
        created.map((list) => ({
          id: list._id,
          user_id: userId,
          name: list.name,
          filter_tags: list.filterTags,
          reminder_at: null,
          status: "active",
          sort_order: list.sortOrder,
        })),
      );
      if (error) throw error;
    },
    () => {
      writeLocalLists(userId, [...existing.map(toTaskListRecordShape), ...created]);
    },
  );

  return created.map(asTaskListRecord);
}

type ListPatch = {
  name?: string;
  filterTags?: string[];
  reminderAt?: string | null;
  status?: TaskListStatus;
};

async function patchTaskList(
  userId: string,
  listId: string,
  patch: ListPatch,
): Promise<void> {
  const updates: ListPatch = {};
  if (patch.name !== undefined) updates.name = validateListName(patch.name);
  if (patch.filterTags !== undefined) {
    const tags = normalizeListFilterTags(patch.filterTags);
    if (tags.length === 0) throw new Error("יש לבחור לפחות תגית אחת");
    updates.filterTags = tags;
  }
  if (patch.reminderAt !== undefined) {
    updates.reminderAt = validateReminderAt(patch.reminderAt);
  }
  if (patch.status !== undefined) updates.status = patch.status;

  await withTableFallback(
    async () => {
      const supabase = requireSupabase();
      const row: Record<string, unknown> = {};
      if (updates.name !== undefined) row.name = updates.name;
      if (updates.filterTags !== undefined) row.filter_tags = updates.filterTags;
      if (updates.reminderAt !== undefined) row.reminder_at = updates.reminderAt;
      if (updates.status !== undefined) row.status = updates.status;
      const { error } = await supabase
        .from("task_lists")
        .update(row)
        .eq("id", listId)
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (error) throw error;
    },
    () => {
      const lists = readLocalLists(userId);
      const next = lists.map((list) => {
        if (list._id !== listId) return list;
        return {
          ...list,
          ...updates,
          updatedAt: Date.now(),
        };
      });
      writeLocalLists(userId, next);
    },
  );
}

export async function renameTaskList(
  userId: string,
  listId: string,
  name: string,
): Promise<void> {
  await patchTaskList(userId, listId, { name });
}

export async function refreshTaskListTags(
  userId: string,
  listId: string,
  filterTags: string[],
): Promise<void> {
  await patchTaskList(userId, listId, { filterTags });
}

export async function archiveTaskList(userId: string, listId: string): Promise<void> {
  await patchTaskList(userId, listId, { status: "archived" });
}

export async function restoreTaskList(userId: string, listId: string): Promise<void> {
  await patchTaskList(userId, listId, { status: "active" });
}

export async function deleteTaskList(userId: string, listId: string): Promise<void> {
  const now = new Date().toISOString();
  await withTableFallback(
    async () => {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("task_lists")
        .update({ deleted_at: now })
        .eq("id", listId)
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (error) throw error;
    },
    () => {
      writeLocalLists(
        userId,
        readLocalLists(userId).filter((list) => list._id !== listId),
      );
    },
  );
}

export async function setTaskListReminder(
  userId: string,
  listId: string,
  reminderAt: string | null,
): Promise<void> {
  await patchTaskList(userId, listId, { reminderAt });
}

export function subscribeTaskLists(
  userId: string,
  onChange: () => void,
): () => void {
  if (shouldUseLocalStore()) return () => undefined;
  const supabase = requireSupabase();
  const channel = supabase
    .channel(`task-lists:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "task_lists" },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
