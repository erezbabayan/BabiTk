import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Id } from "../../../convex/_generated/dataModel";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { deleteListConfirmMessage } from "../lib/confirm-copy";
import { defaultTaskListName, formatListReminderAt, formatTaskListDate, isListReminderActive } from "../../../convex/lib/taskListNames";
import type { TaskListRecord } from "../hooks/useTaskLists";
import { unifiedFilterTags } from "../lib/filter-items";
import { taskListItemToMindtaskerItem, formatListStatusSummary, filterTodayBoardTasksByListTags, resolveListDisplayItems } from "../lib/task-list-items";
import { isTaskListStruck } from "../lib/item-display";
import { undoTaskListItem } from "../lib/task-list-actions";
import { openTaskListInWhatsApp } from "../lib/task-list-share";
import { colorForTag, formatTagLabel, readableTextColor, type UserTag } from "../lib/tags";
import { TASK_LIST_TITLE_CLASS } from "../lib/item-typography";
import { ItemCard } from "./ItemCard";
import { ListReminderPicker } from "./ListReminderPicker";
import { ReminderPicker } from "./ReminderPicker";
import { SwipeableItemCard } from "./SwipeableItemCard";
import { TagWheelPicker } from "./TagWheelPicker";
import { boardSwipeActions, taskListSwipeActions } from "../lib/item-swipe-actions";
import type { ItemEditInput } from "./ItemEditModal";
import type { MindtaskerItem } from "../types";
import type { ReminderRecurrence } from "../lib/resolve-item-reminder";

export type TaskListsModalMode = "create" | "existing" | "archive";

interface TaskListsModalProps {
  mode: TaskListsModalMode;
  boardTasks: MindtaskerItem[];
  lists: TaskListRecord[];
  userTags: UserTag[];
  availableTags?: string[];
  loading?: boolean;
  onClose: () => void;
  onCreate: (filterTags: string[], name: string, boardTasks: MindtaskerItem[]) => Promise<void>;
  onRename: (listId: Id<"taskLists">, name: string) => Promise<void>;
  onRefreshTags: (listId: Id<"taskLists">, filterTags: string[]) => Promise<void>;
  onArchive: (listId: Id<"taskLists">) => Promise<void>;
  onRestore: (listId: Id<"taskLists">) => Promise<void>;
  onDelete: (listId: Id<"taskLists">) => Promise<void>;
  onRefreshListItems?: (listId: Id<"taskLists">) => Promise<void>;
  onEditItem: (item: MindtaskerItem, patch: ItemEditInput) => void | Promise<void>;
  onCompleteItem: (item: MindtaskerItem) => void | Promise<void>;
  onUndoListItem: (item: MindtaskerItem) => void | Promise<void>;
  onSnoozeItem: (item: MindtaskerItem) => void;
  onArchiveItem: (item: MindtaskerItem) => void | Promise<void>;
  onDeleteItem: (item: MindtaskerItem) => void | Promise<void>;
  onToggleType: (item: MindtaskerItem) => void | Promise<void>;
  onTagPress?: (item: MindtaskerItem) => void;
  onSetListReminder: (
    listId: Id<"taskLists">,
    due: string,
    listName?: string,
  ) => void | Promise<void>;
  onClearListReminder: (listId: Id<"taskLists">) => void | Promise<void>;
  tagPickerOpenId?: string | null;
  snoozeItem?: MindtaskerItem | null;
  onSnoozeSelect?: (
    item: MindtaskerItem,
    due: string,
    recurrence?: ReminderRecurrence | null,
  ) => void;
  onSnoozeClear?: (item: MindtaskerItem) => void;
  onSnoozeClose?: () => void;
  tagPickerItem?: MindtaskerItem | null;
  tagDraft?: string[];
  onToggleTag?: (tagName: string) => void;
  onCreateTag?: (name: string, color: string) => Promise<void>;
  onCloseTagPicker?: () => void;
}

function TagMultiSelect({
  tags,
  selected,
  onToggle,
  userTags,
}: {
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  userTags: UserTag[];
}) {
  if ((tags ?? []).length === 0) {
    return <p className="text-xs text-slate-500">אין תגיות מוגדרות</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {(tags ?? []).map((tag) => {
        const active = selected.includes(tag);
        const color = colorForTag(tag, userTags);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className="rounded-full px-2.5 py-1 text-xs transition-opacity hover:opacity-90"
            style={
              active
                ? { backgroundColor: color, color: readableTextColor(color) }
                : {
                    backgroundColor: `${color}22`,
                    color,
                    border: `1px solid ${color}55`,
                  }
            }
          >
            {formatTagLabel(tag)}
          </button>
        );
      })}
    </div>
  );
}

function SavedListRow({
  list,
  boardTasks,
  userTags,
  onRename,
  onRefreshTags,
  onArchive,
  onRestore,
  onDelete,
  onRefreshListItems,
  onEditItem,
  onCompleteItem,
  onUndoListItem,
  onSnoozeItem,
  onArchiveItem,
  onDeleteItem,
  onToggleType,
  onTagPress,
  onOpenListReminder,
  tagPickerOpenId,
  availableTags,
}: {
  list: TaskListRecord;
  boardTasks: MindtaskerItem[];
  userTags: UserTag[];
  onRename: (listId: Id<"taskLists">, name: string) => Promise<void>;
  onRefreshTags: (listId: Id<"taskLists">, filterTags: string[]) => Promise<void>;
  onArchive: (listId: Id<"taskLists">) => Promise<void>;
  onRestore: (listId: Id<"taskLists">) => Promise<void>;
  onDelete: (listId: Id<"taskLists">) => Promise<void>;
  onRefreshListItems?: (listId: Id<"taskLists">) => Promise<void>;
  onEditItem: (item: MindtaskerItem, patch: ItemEditInput) => void | Promise<void>;
  onCompleteItem: (item: MindtaskerItem) => void | Promise<void>;
  onUndoListItem: (item: MindtaskerItem) => void | Promise<void>;
  onSnoozeItem: (item: MindtaskerItem) => void;
  onArchiveItem: (item: MindtaskerItem) => void | Promise<void>;
  onDeleteItem: (item: MindtaskerItem) => void | Promise<void>;
  onToggleType: (item: MindtaskerItem) => void | Promise<void>;
  onTagPress?: (item: MindtaskerItem) => void;
  onOpenListReminder: () => void;
  tagPickerOpenId?: string | null;
  availableTags: string[];
}) {
  const listReminderActive = isListReminderActive(list.reminderAt);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const [editTags, setEditTags] = useState<string[]>(list.filterTags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { requestConfirm, confirmDialog } = useConfirmDialog();
  const refreshAttempted = useRef(false);

  const listItems = useMemo(
    () => resolveListDisplayItems(list, boardTasks),
    [list, boardTasks],
  );

  useEffect(() => {
    if (
      !expanded ||
      (list.items?.length ?? 0) > 0 ||
      listItems.length === 0 ||
      !onRefreshListItems ||
      refreshAttempted.current
    ) {
      return;
    }
    refreshAttempted.current = true;
    void onRefreshListItems(list._id);
  }, [expanded, list, listItems.length, onRefreshListItems]);

  async function handleSaveEdit() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = editName.trim();
      if (!trimmed) {
        setError("שם הרשימה לא יכול להיות ריק");
        return;
      }
      if (trimmed !== list.name) {
        await onRename(list._id, trimmed);
      }
      const tagsChanged =
        editTags.length !== (list.filterTags ?? []).length ||
        editTags.some((tag) => !(list.filterTags ?? []).includes(tag));
      if (tagsChanged) {
        await onRefreshTags(list._id, editTags);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveToggle() {
    setBusy(true);
    setError(null);
    try {
      if (list.status === "archived") {
        await onRestore(list._id);
      } else {
        await onArchive(list._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "פעולה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const ok = await requestConfirm({
      title: "מחיקת רשימה",
      message: deleteListConfirmMessage(list.name),
      confirmLabel: "מחק",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(list._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  function handleShareWhatsApp() {
    openTaskListInWhatsApp({
      name: list.name,
      filterTags: list.filterTags ?? [],
      reminderAt: list.reminderAt,
      items: listItems.map((item) => ({ title: item.title, status: item.status })),
    });
  }

  const listSwipe = taskListSwipeActions(
    list.status === "archived",
    () => void handleArchiveToggle(),
    () => void handleDelete(),
  );

  return (
    <>
      {confirmDialog}
      <article
        className={`rounded-lg border bg-white overflow-hidden ${
          list.status === "archived" ? "border-slate-200 opacity-75" : "border-blue-100"
        }`}
      >
      <SwipeableItemCard
        leftAction={listSwipe.left}
        rightAction={listSwipe.right}
        disabled={editing || busy}
      >
      <div className="flex items-start gap-2 bg-white p-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
          aria-expanded={expanded}
          aria-label={expanded ? "סגור רשימה" : "פתח רשימה"}
        >
          <span
            className={`inline-block text-xl font-bold leading-none transition-transform duration-300 ease-out ${
              expanded ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ◀
          </span>
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                disabled={busy}
              />
              <TagMultiSelect
                tags={availableTags}
                selected={editTags}
                userTags={userTags}
                onToggle={(tag) =>
                  setEditTags((prev) =>
                    prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
                  )
                }
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  disabled={busy}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  שמור
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditName(list.name);
                    setEditTags(list.filterTags ?? []);
                    setError(null);
                  }}
                  disabled={busy}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className={TASK_LIST_TITLE_CLASS}>
                  {list.name} ({listItems.length})
                </h3>
                {list.status === "archived" ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                    בארכיון
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatTaskListDate(list.createdAt)} · {formatListStatusSummary(list, boardTasks)} ·{" "}
                {(list.filterTags ?? []).map((t) => formatTagLabel(t)).join(" ")}
              </p>
              {listReminderActive && list.reminderAt ? (
                <p className="mt-0.5 text-xs font-medium text-red-600">
                  ⏰ תזכורת: {formatListReminderAt(list.reminderAt)}
                </p>
              ) : null}
            </>
          )}
          {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
        </div>
        {!editing ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={busy}
              title="שלח לוואטסאפ"
              aria-label="שלח לוואטסאפ"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-green-200 bg-green-50 text-sm text-green-700 hover:bg-green-100 disabled:opacity-50"
            >
              💬
            </button>
            <button
              type="button"
              onClick={onOpenListReminder}
              disabled={busy}
              title="תזכורת לרשימה"
              aria-label="תזכורת לרשימה"
              className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm disabled:opacity-50 ${
                listReminderActive
                  ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              ⏰
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              title="עריכה"
              aria-label="עריכה"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              ✏️
            </button>
          </div>
        ) : null}
      </div>
      </SwipeableItemCard>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={`space-y-1 border-t border-slate-100 px-2 py-1.5 transition-opacity duration-300 ease-in-out ${
              expanded ? "opacity-100" : "opacity-0"
            }`}
          >
          {listItems.length === 0 ? (
            <p className="text-xs text-slate-400">אין משימות ברשימה זו</p>
          ) : (
            listItems.map((item) => {
              const struck = isTaskListStruck(item);
              const swipe = boardSwipeActions(
                () => void onArchiveItem(item),
                () => void onDeleteItem(item),
                "tasks",
              );
              return (
                <SwipeableItemCard
                  key={item.id}
                  compact
                  leftAction={swipe.left}
                  rightAction={swipe.right}
                >
                  <ItemCard
                    item={item}
                    dense
                    boardAccent="today"
                    userTags={userTags}
                    taskListDone={struck}
                    onEdit={(patch) => onEditItem(item, patch)}
                    onToggleType={() => onToggleType(item)}
                    onComplete={struck ? undefined : () => onCompleteItem(item)}
                    onTaskListUndo={struck ? () => onUndoListItem(item) : undefined}
                    onSnooze={() => onSnoozeItem(item)}
                    onTagPress={onTagPress ? () => onTagPress(item) : undefined}
                    tagPickerOpen={tagPickerOpenId === item.id}
                  />
                </SwipeableItemCard>
              );
            })
          )}
          </div>
        </div>
      </div>
    </article>
    </>
  );
}

export function TaskListsModal({
  mode,
  boardTasks = [],
  lists = [],
  userTags = [],
  availableTags: availableTagsProp,
  loading = false,
  onClose,
  onCreate,
  onRename,
  onRefreshTags,
  onArchive,
  onRestore,
  onDelete,
  onRefreshListItems,
  onEditItem,
  onCompleteItem,
  onUndoListItem,
  onSnoozeItem,
  onArchiveItem,
  onDeleteItem,
  onToggleType,
  onTagPress,
  onSetListReminder,
  onClearListReminder,
  tagPickerOpenId,
  snoozeItem,
  onSnoozeSelect,
  onSnoozeClear,
  onSnoozeClose,
  tagPickerItem,
  tagDraft = [],
  onToggleTag,
  onCreateTag,
  onCloseTagPicker,
}: TaskListsModalProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [listName, setListName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TaskListsModalMode>(mode);
  const [listReminderTarget, setListReminderTarget] = useState<TaskListRecord | null>(null);

  const availableTags = useMemo(
    () => availableTagsProp ?? unifiedFilterTags(userTags),
    [availableTagsProp, userTags],
  );

  const activeLists = lists.filter((list) => list.status === "active");
  const archivedLists = lists.filter((list) => list.status === "archived");
  const displayLists = view === "archive" ? archivedLists : activeLists;
  const matchingTaskCount = useMemo(
    () => filterTodayBoardTasksByListTags(boardTasks, selectedTags).length,
    [boardTasks, selectedTags],
  );

  useEffect(() => {
    setView(mode);
  }, [mode]);

  useEffect(() => {
    if (!nameTouched && selectedTags.length > 0) {
      setListName(defaultTaskListName(selectedTags));
    }
    if (selectedTags.length === 0) {
      setListName("");
      setNameTouched(false);
    }
  }, [selectedTags, nameTouched]);

  useEffect(() => {
    if (mode === "create") {
      setSelectedTags([]);
      setListName("");
      setNameTouched(false);
      setError(null);
    }
  }, [mode]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !creating) onClose();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [creating, onClose]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleCreate() {
    if (selectedTags.length === 0) {
      setError("יש לבחור לפחות תגית אחת");
      return;
    }
    const trimmedName =
      selectedTags.length === 1
        ? listName.trim() || defaultTaskListName(selectedTags)
        : "";
    setCreating(true);
    setError(null);
    try {
      await onCreate(selectedTags, trimmedName, boardTasks);
      setSelectedTags([]);
      setListName("");
      setNameTouched(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת רשימה נכשלה");
    } finally {
      setCreating(false);
    }
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className={`flex w-full max-w-lg flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl ${
            view === "create" ? "h-auto max-w-md" : "h-[min(88vh,640px)] max-w-lg"
          }`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-lists-title"
        >
        <div className="border-b border-blue-100 bg-blue-50/60 px-4 py-3">
          <h2 id="task-lists-title" className="text-center text-base font-bold text-blue-900">
            {view === "create"
              ? "BabiTk"
              : view === "archive"
                ? "ארכיון רשימות"
                : "רשימות קיימות"}
          </h2>
          <p className="mt-1 text-center text-xs text-blue-700/80">
            {view === "create"
              ? "בחר תגיות — תיווצר רשימה נפרדת לכל תגית. אחר כך לחץ הפוך לרשימה"
              : view === "archive"
                ? "רשימות שארכבת — ניתן לשחזר, לערוך או למחוק"
                : "כל הרשימות הפעילות — השינויים מסונכרנים עם הבורד"}
          </p>
        </div>

        <div
          className={`overflow-y-auto px-4 py-3 ${view === "create" ? "" : "min-h-0 flex-1"}`}
        >
          {view === "create" ? (
            <section className="rounded-lg border border-blue-100 bg-blue-50/30 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">בחר תגיות</h3>
              <TagMultiSelect
                tags={availableTags}
                selected={selectedTags}
                onToggle={toggleTag}
                userTags={userTags}
              />
              {selectedTags.length === 1 ? (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    שם הרשימה
                  </label>
                  <input
                    type="text"
                    value={listName}
                    onChange={(e) => {
                      setNameTouched(true);
                      setListName(e.target.value);
                    }}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
                    dir="rtl"
                  />
                  <p className="mt-1.5 text-xs text-slate-500">
                    {matchingTaskCount === 0
                      ? "אין כרגע משימות לביצוע עם התגית — הרשימה תיווצר ריקה ותתעדכן מהבורד"
                      : `${matchingTaskCount} משימות לביצוע ייכנסו לרשימה`}
                  </p>
                </div>
              ) : null}
              {selectedTags.length > 1 ? (
                <p className="mt-2 text-xs text-slate-500">
                  ייווצרו {selectedTags.length} רשימות נפרדות (רשימה אחת לכל תגית)
                  {matchingTaskCount > 0
                    ? ` · ${matchingTaskCount} משימות לביצוע יחולקו לפי תגיות`
                    : " · אין כרגע משימות לביצוע מתאימות"}
                </p>
              ) : null}
              {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || selectedTags.length === 0 || loading}
                className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "יוצר..." : "הפוך לרשימה"}
              </button>
            </section>
          ) : null}

          {view === "existing" || view === "archive" ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">
              {view === "archive"
                ? `ארכיון (${archivedLists.length})`
                : `הרשימות שלי (${activeLists.length})`}
            </h3>
            {loading ? (
              <p className="py-6 text-center text-sm text-slate-500">טוען רשימות...</p>
            ) : displayLists.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                {view === "archive" ? "אין רשימות בארכיון" : "עדיין לא נוצרו רשימות"}
              </p>
            ) : (
              <div className="space-y-2">
                {displayLists.map((list) => (
                  <SavedListRow
                    key={list._id}
                    list={list}
                    boardTasks={boardTasks}
                    userTags={userTags}
                    availableTags={availableTags}
                    onRename={onRename}
                    onRefreshTags={onRefreshTags}
                    onArchive={onArchive}
                    onDelete={onDelete}
                    onRestore={onRestore}
                    onRefreshListItems={onRefreshListItems}
                    onEditItem={onEditItem}
                    onCompleteItem={onCompleteItem}
                    onUndoListItem={onUndoListItem}
                    onSnoozeItem={onSnoozeItem}
                    onArchiveItem={onArchiveItem}
                    onDeleteItem={onDeleteItem}
                    onToggleType={onToggleType}
                    onTagPress={onTagPress}
                    onOpenListReminder={() => setListReminderTarget(list)}
                    tagPickerOpenId={tagPickerOpenId}
                  />
                ))}
              </div>
            )}
          </section>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-2.5">
          {view === "existing" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView("archive")}
                className="shrink-0 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                ארכיון ({archivedLists.length})
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                סגור
              </button>
            </div>
          ) : view === "archive" ? (
            <button
              type="button"
              onClick={() => setView("existing")}
              className="w-full rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              חזור
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              סגור
            </button>
          )}
        </div>
      </div>
    </div>

      {listReminderTarget ? (
        <ListReminderPicker
          listName={listReminderTarget.name}
          reminderAt={listReminderTarget.reminderAt ?? null}
          onSelect={(due) =>
            void onSetListReminder(
              listReminderTarget._id,
              due,
              listReminderTarget.name,
            )
          }
          onClear={() => void onClearListReminder(listReminderTarget._id)}
          onClose={() => setListReminderTarget(null)}
        />
      ) : null}

      {snoozeItem && onSnoozeSelect && onSnoozeClear && onSnoozeClose ? (
        <ReminderPicker
          item={snoozeItem}
          onSelect={onSnoozeSelect}
          onClear={onSnoozeClear}
          onClose={onSnoozeClose}
        />
      ) : null}

      {tagPickerItem && onToggleTag && onCreateTag && onCloseTagPicker ? (
        <TagWheelPicker
          visible
          itemTitle={tagPickerItem.title}
          selectedTags={tagDraft}
          userTags={userTags}
          onToggleTag={onToggleTag}
          onCreateTag={onCreateTag}
          onClose={onCloseTagPicker}
        />
      ) : null}
    </>,
    document.body,
  );
}
