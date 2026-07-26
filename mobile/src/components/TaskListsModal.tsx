import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { ScrollView, GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";

import type { Id } from "../../../convex/_generated/dataModel";
import { defaultTaskListName, formatListReminderAt, formatTaskListDate, isListReminderActive } from "../../../convex/lib/taskListNames";
import type { TaskListRecord } from "../hooks/useTaskLists";
import { unifiedFilterTags } from "../lib/filter-items";
import { formatListStatusSummary, filterTodayBoardTasksByListTags, resolveListDisplayItems } from "../lib/task-list-items";
import { isTaskListStruck, TASK_LIST_TITLE_FONT_SIZE } from "../lib/item-display";
import { undoTaskListItem } from "../lib/task-list-actions";
import { openTaskListInWhatsApp } from "../lib/task-list-share";
import type { ReminderRecurrence } from "../lib/resolve-item-reminder";
import type { MindtaskerItem } from "../lib/supabase";
import { colorForTag, formatTagLabel, readableTextColor, type UserTag } from "../lib/tags";
import { buildMobileSwipeActions, buildTaskListSwipeActions, type SwipeSideAction } from "../lib/item-swipe-actions";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { deleteItemConfirmMessage, deleteListConfirmMessage } from "../lib/confirm-copy";
import { SwipeActionSlot } from "./SwipeActionStrip";
import { NotebookIcon } from "./NotebookIcons";
import type { useBoardItems } from "../hooks/useBoardItems";
import { SwipeableItem } from "./SwipeableItem";
import { ListReminderSheet, SnoozeSheet } from "./ActionSheets";
import { TagWheelPicker } from "./TagWheelPicker";

const SHEET_MAX_HEIGHT = Dimensions.get("window").height * 0.88;
const LIST_SWIPE_ACTION_WIDTH = 88;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function renderListSwipeSlot(action: SwipeSideAction) {
  return <SwipeActionSlot action={action} width={LIST_SWIPE_ACTION_WIDTH} />;
}

function toggleListExpand(setExpanded: (value: boolean | ((prev: boolean) => boolean)) => void) {
  LayoutAnimation.configureNext(LayoutAnimation.create(280, "easeInEaseOut", "opacity"));
  setExpanded((value) => !value);
}

type BoardApi = Pick<
  ReturnType<typeof useBoardItems>,
  | "approveItem"
  | "completeTask"
  | "archiveItem"
  | "deleteItem"
  | "toggleActionable"
  | "editItem"
  | "restoreArchiveItem"
  | "restoreCompletedTask"
  | "restoreDeletedItem"
>;

export type TaskListsModalMode = "create" | "existing" | "archive";

interface TaskListsModalProps {
  visible: boolean;
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
  board: BoardApi;
  onEditItem: (item: MindtaskerItem) => void;
  onSnoozeItem: (item: MindtaskerItem) => void;
  onTagPress?: (item: MindtaskerItem) => void;
  onSetListReminder: (listId: Id<"taskLists">, due: string) => void | Promise<void>;
  onClearListReminder: (listId: Id<"taskLists">) => void | Promise<void>;
  tagPickerOpenId?: string | null;
  snoozeItem?: MindtaskerItem | null;
  onSnoozeSelect?: (
    item: MindtaskerItem,
    iso: string,
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
    return <Text style={styles.hint}>אין תגיות מוגדרות</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
      {(tags ?? []).map((tag) => {
        const active = selected.includes(tag);
        const color = colorForTag(tag, userTags);
        return (
          <Pressable
            key={tag}
            style={[
              styles.tagChip,
              active
                ? { backgroundColor: color }
                : { backgroundColor: `${color}22`, borderColor: `${color}66`, borderWidth: 1 },
            ]}
            onPress={() => onToggle(tag)}
          >
            <Text style={[styles.tagChipText, { color: active ? readableTextColor(color) : color }]}>
              {formatTagLabel(tag)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SavedListRow({
  list,
  boardTasks,
  userTags,
  availableTags,
  board,
  onRename,
  onRefreshTags,
  onArchive,
  onRestore,
  onDelete,
  onRefreshListItems,
  onEditItem,
  onSnoozeItem,
  onTagPress,
  onOpenListReminder,
  tagPickerOpenId,
}: {
  list: TaskListRecord;
  boardTasks: MindtaskerItem[];
  userTags: UserTag[];
  availableTags: string[];
  board: BoardApi;
  onRename: (listId: Id<"taskLists">, name: string) => Promise<void>;
  onRefreshTags: (listId: Id<"taskLists">, filterTags: string[]) => Promise<void>;
  onArchive: (listId: Id<"taskLists">) => Promise<void>;
  onRestore: (listId: Id<"taskLists">) => Promise<void>;
  onDelete: (listId: Id<"taskLists">) => Promise<void>;
  onRefreshListItems?: (listId: Id<"taskLists">) => Promise<void>;
  onEditItem: (item: MindtaskerItem) => void;
  onSnoozeItem: (item: MindtaskerItem) => void;
  onTagPress?: (item: MindtaskerItem) => void;
  onOpenListReminder: () => void;
  tagPickerOpenId?: string | null;
}) {
  const listReminderActive = isListReminderActive(list.reminderAt);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const { requestConfirm, confirmDialog } = useConfirmDialog();
  const [editName, setEditName] = useState(list.name);
  const [editTags, setEditTags] = useState<string[]>(list.filterTags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshAttempted = useRef(false);
  const swipeRef = useRef<Swipeable>(null);

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

  async function handleDeletePress() {
    const ok = await requestConfirm({
      title: "מחיקת רשימה",
      message: deleteListConfirmMessage(list.name),
      confirmLabel: "מחק",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onDelete(list._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(item: MindtaskerItem) {
    const ok = await requestConfirm({
      title: "מחיקה",
      message: deleteItemConfirmMessage(item.title),
      confirmLabel: "מחק",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (!ok) return;
    await board.deleteItem(item);
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

  function handleShareWhatsApp() {
    void openTaskListInWhatsApp({
      name: list.name,
      filterTags: list.filterTags ?? [],
      reminderAt: list.reminderAt,
      items: listItems.map((item) => ({ title: item.title, status: item.status })),
    });
  }

  const listSwipe = buildTaskListSwipeActions(
    list.status === "archived",
    () => void handleArchiveToggle(),
    handleDeletePress,
  );

  function handleListSwipeOpen(direction: "left" | "right") {
    const action =
      direction === "left" ? listSwipe.leftAction : listSwipe.rightAction;
    swipeRef.current?.close();
    // Defer so the swipe closes before confirm / mutation
    requestAnimationFrame(() => {
      action.onTrigger();
    });
  }

  return (
    <View style={[styles.listCard, list.status === "archived" && styles.listCardArchived]}>
      {confirmDialog}
      <Swipeable
        ref={swipeRef}
        friction={2}
        overshootLeft={false}
        overshootRight={false}
        enableTrackpadTwoFingerGesture
        enabled={!editing && !busy}
        activeOffsetX={[-8, 8]}
        failOffsetY={[-14, 14]}
        leftThreshold={LIST_SWIPE_ACTION_WIDTH * 0.35}
        rightThreshold={LIST_SWIPE_ACTION_WIDTH * 0.35}
        renderLeftActions={() => renderListSwipeSlot(listSwipe.leftAction)}
        renderRightActions={() => renderListSwipeSlot(listSwipe.rightAction)}
        onSwipeableOpen={handleListSwipeOpen}
        containerStyle={styles.listSwipeContainer}
      >
      <View style={styles.listCardHeader}>
        <Pressable
          onPress={() => toggleListExpand(setExpanded)}
          hitSlop={6}
          style={styles.expandBtn}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? "סגור רשימה" : "פתח רשימה"}
        >
          <Text style={[styles.expandIcon, expanded && styles.expandIconOpen]}>◀</Text>
        </Pressable>
        <View style={styles.listCardBody}>
          {editing ? (
            <View style={styles.editBlock}>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                style={styles.nameInput}
                editable={!busy}
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
              <View style={styles.editActions}>
                <Pressable
                  style={[styles.btnPrimary, busy && styles.btnDisabled]}
                  onPress={() => void handleSaveEdit()}
                  disabled={busy}
                >
                  <Text style={styles.btnPrimaryText}>שמור</Text>
                </Pressable>
                <Pressable
                  style={styles.btnGhost}
                  onPress={() => {
                    setEditing(false);
                    setEditName(list.name);
                    setEditTags(list.filterTags ?? []);
                    setError(null);
                  }}
                  disabled={busy}
                >
                  <Text style={styles.btnGhostText}>ביטול</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.listTitleRow}>
                <Text style={styles.listTitle}>
                  {list.name} ({listItems.length})
                </Text>
                {list.status === "archived" ? (
                  <Text style={styles.archivedBadge}>בארכיון</Text>
                ) : null}
              </View>
              <Text style={styles.listMeta}>
                {formatTaskListDate(list.createdAt)} · {formatListStatusSummary(list, boardTasks)} ·{" "}
                {(list.filterTags ?? []).map((t) => formatTagLabel(t)).join(" ")}
              </Text>
              {listReminderActive && list.reminderAt ? (
                <View style={styles.listReminderMetaRow}>
                  <NotebookIcon name="bell" size={12} tone="danger" />
                  <Text style={styles.listReminderMeta}>
                    תזכורת: {formatListReminderAt(list.reminderAt)}
                  </Text>
                </View>
              ) : null}
            </>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
        {!editing ? (
          <View style={styles.listActions}>
            <Pressable
              style={styles.actionBtnWhatsApp}
              onPress={handleShareWhatsApp}
              disabled={busy}
              accessibilityLabel="שלח לוואטסאפ"
            >
              <NotebookIcon name="whatsapp" size={15} tone="success" />
            </Pressable>
            <Pressable
              style={[styles.actionBtnIcon, listReminderActive && styles.actionBtnReminder]}
              onPress={onOpenListReminder}
              disabled={busy}
              accessibilityLabel="תזכורת לרשימה"
            >
              <NotebookIcon
                name="bell"
                size={15}
                tone={listReminderActive ? "danger" : "slate"}
              />
            </Pressable>
            <Pressable
              style={styles.actionBtnIcon}
              onPress={() => setEditing(true)}
              disabled={busy}
              accessibilityLabel="עריכה"
            >
              <NotebookIcon name="edit" size={15} tone="slate" />
            </Pressable>
          </View>
        ) : null}
      </View>
      </Swipeable>
      {expanded ? (
        <View style={styles.listItems}>
          {listItems.length === 0 ? (
            <Text style={styles.hint}>אין משימות ברשימה זו</Text>
          ) : (
            listItems.map((item) => {
              const struck = isTaskListStruck(item);
              const swipe = buildMobileSwipeActions("today", "active", item, board, () =>
                void handleDeleteItem(item),
              );
              return (
                <SwipeableItem
                  key={item.id}
                  item={item}
                  dense
                  userTags={userTags}
                  tab="today"
                  listView="active"
                  leftAction={swipe.leftAction}
                  rightAction={swipe.rightAction}
                  onEdit={() => onEditItem(item)}
                  onToggleType={() => void board.toggleActionable(item)}
                  onApprove={() => {}}
                  onComplete={() => void board.completeTask(item)}
                  onSnooze={() => onSnoozeItem(item)}
                  onArchive={() => void board.archiveItem(item)}
                  onRestore={() => void board.restoreArchiveItem(item)}
                  onDelete={() => void handleDeleteItem(item)}
                  showCompleteAction={!struck}
                  showUndoAction={struck}
                  onUndo={() =>
                    undoTaskListItem(item, {
                      restoreDeletedItem: (entry) => void board.restoreDeletedItem(entry),
                      restoreArchiveItem: (entry) => void board.restoreArchiveItem(entry),
                      restoreCompletedTask: (entry) => void board.restoreCompletedTask(entry),
                    })
                  }
                  onTagPress={onTagPress ? () => onTagPress(item) : undefined}
                  tagPickerOpen={tagPickerOpenId === item.id}
                />
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

export function TaskListsModal({
  visible,
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
  board,
  onEditItem,
  onSnoozeItem,
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
    if (visible) {
      setView(mode);
    }
  }, [visible, mode]);

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
    if (!visible) {
      setSelectedTags([]);
      setListName("");
      setNameTouched(false);
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && mode === "create") {
      setSelectedTags([]);
      setListName("");
      setNameTouched(false);
      setError(null);
    }
  }, [visible, mode]);

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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="סגור" />
        <View
          style={[
            styles.sheet,
            view === "create"
              ? styles.sheetCompact
              : { maxHeight: SHEET_MAX_HEIGHT, height: SHEET_MAX_HEIGHT },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {view === "create"
                ? "BabiTk"
                : view === "archive"
                  ? "ארכיון רשימות"
                  : "רשימות קיימות"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {view === "create"
                ? "בחר תגיות — תיווצר רשימה נפרדת לכל תגית. אחר כך לחץ הפוך לרשימה"
                : view === "archive"
                  ? "רשימות שארכבת — ניתן לשחזר, לערוך או למחוק"
                  : "כל הרשימות הפעילות — השינויים מסונכרנים עם הבורד"}
            </Text>
          </View>

          <ScrollView
            style={view === "create" ? styles.bodyCompact : styles.body}
            contentContainerStyle={styles.bodyContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {view === "create" ? (
              <View style={styles.createSection}>
                <Text style={styles.sectionTitle}>בחר תגיות</Text>
                <TagMultiSelect
                  tags={availableTags}
                  selected={selectedTags}
                  onToggle={toggleTag}
                  userTags={userTags}
                />
                {selectedTags.length === 1 ? (
                  <View>
                    <Text style={styles.nameLabel}>שם הרשימה</Text>
                    <TextInput
                      value={listName}
                      onChangeText={(value) => {
                        setNameTouched(true);
                        setListName(value);
                      }}
                      style={styles.nameInput}
                      textAlign="right"
                    />
                    <Text style={styles.matchHint}>
                      {matchingTaskCount === 0
                        ? "אין כרגע משימות לביצוע עם התגית — הרשימה תיווצר ריקה ותתעדכן מהבורד"
                        : `${matchingTaskCount} משימות לביצוע ייכנסו לרשימה`}
                    </Text>
                  </View>
                ) : null}
                {selectedTags.length > 1 ? (
                  <Text style={styles.matchHint}>
                    {`ייווצרו ${selectedTags.length} רשימות נפרדות (רשימה אחת לכל תגית)`}
                    {matchingTaskCount > 0
                      ? ` · ${matchingTaskCount} משימות לביצוע יחולקו לפי תגיות`
                      : " · אין כרגע משימות לביצוע מתאימות"}
                  </Text>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <Pressable
                  style={[
                    styles.createBtn,
                    (creating || selectedTags.length === 0) && styles.btnDisabled,
                  ]}
                  onPress={() => void handleCreate()}
                  disabled={creating || selectedTags.length === 0 || loading}
                >
                  {creating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.createBtnText}>הפוך לרשימה</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {view === "existing" || view === "archive" ? (
              <>
                <Text style={styles.sectionTitle}>
                  {view === "archive"
                    ? `ארכיון (${archivedLists.length})`
                    : `הרשימות שלי (${activeLists.length})`}
                </Text>
                {loading ? (
                  <ActivityIndicator style={styles.loader} color="#2563eb" />
                ) : displayLists.length === 0 ? (
                  <Text style={styles.empty}>
                    {view === "archive" ? "אין רשימות בארכיון" : "עדיין לא נוצרו רשימות"}
                  </Text>
                ) : (
                  displayLists.map((list) => (
                    <SavedListRow
                      key={list._id}
                      list={list}
                      boardTasks={boardTasks}
                      userTags={userTags}
                      availableTags={availableTags}
                      board={board}
                      onRename={onRename}
                      onRefreshTags={onRefreshTags}
                      onArchive={onArchive}
                      onRestore={onRestore}
                      onDelete={onDelete}
                      onRefreshListItems={onRefreshListItems}
                      onEditItem={onEditItem}
                      onSnoozeItem={onSnoozeItem}
                      onTagPress={onTagPress}
                      onOpenListReminder={() => setListReminderTarget(list)}
                      tagPickerOpenId={tagPickerOpenId}
                    />
                  ))
                )}
              </>
            ) : null}
          </ScrollView>

          {view === "existing" ? (
            <View style={styles.footerRow}>
              <Pressable style={styles.archiveNavBtn} onPress={() => setView("archive")}>
                <Text style={styles.archiveNavBtnText}>ארכיון ({archivedLists.length})</Text>
              </Pressable>
              <Pressable style={styles.closeBtnFlex} onPress={onClose}>
                <Text style={styles.closeBtnText}>סגור</Text>
              </Pressable>
            </View>
          ) : view === "archive" ? (
            <Pressable style={styles.closeBtn} onPress={() => setView("existing")}>
              <Text style={styles.closeBtnText}>חזור</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>סגור</Text>
            </Pressable>
          )}
        </View>
      </View>

      {listReminderTarget ? (
        <ListReminderSheet
          visible
          listName={listReminderTarget.name}
          reminderAt={listReminderTarget.reminderAt ?? null}
          onSelect={(due) => void onSetListReminder(listReminderTarget._id, due)}
          onClear={() => void onClearListReminder(listReminderTarget._id)}
          onClose={() => setListReminderTarget(null)}
        />
      ) : null}

      {snoozeItem && onSnoozeSelect && onSnoozeClear && onSnoozeClose ? (
        <SnoozeSheet
          item={snoozeItem}
          visible
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
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  sheetCompact: {
    maxHeight: SHEET_MAX_HEIGHT,
  },
  header: {
    backgroundColor: "#eff6ff",
    borderBottomWidth: 1,
    borderBottomColor: "#dbeafe",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: "#1e3a8a",
  },
  headerSubtitle: {
    marginTop: 4,
    textAlign: "center",
    fontSize: 12,
    color: "#1d4ed8",
    lineHeight: 18,
  },
  body: {
    flex: 1,
  },
  bodyCompact: {
    flexGrow: 0,
    flexShrink: 0,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12,
  },
  nameLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    textAlign: "right",
    marginBottom: 4,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    textAlign: "right",
    backgroundColor: "#fff",
  },
  matchHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
    textAlign: "right",
  },
  createSection: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f8fbff",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "right",
  },
  archivedSectionTitle: {
    color: "#64748b",
    marginTop: 8,
  },
  footerRow: {
    flexDirection: "row-reverse",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  archiveNavBtn: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  archiveNavBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },
  closeBtnFlex: {
    flex: 1,
    borderTopWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tagRow: {
    flexDirection: "row-reverse",
    gap: 6,
    paddingVertical: 2,
  },
  tagChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  createBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  empty: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 16,
  },
  loader: { marginVertical: 16 },
  hint: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "right",
  },
  listCard: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 10,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  listSwipeContainer: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  listCardArchived: {
    borderColor: "#e2e8f0",
    opacity: 0.85,
  },
  listCardHeader: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  expandIcon: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  expandIconOpen: {
    transform: [{ rotate: "90deg" }],
  },
  listCardBody: {
    flex: 1,
    minWidth: 0,
  },
  listTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  listTitle: {
    fontSize: TASK_LIST_TITLE_FONT_SIZE,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "right",
  },
  archivedBadge: {
    fontSize: 10,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  listMeta: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748b",
    textAlign: "right",
  },
  listReminderMeta: {
    marginTop: 2,
    fontSize: 11,
    color: "#dc2626",
    fontWeight: "600",
    textAlign: "right",
  },
  listReminderMetaRow: {
    marginTop: 2,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    justifyContent: "flex-start",
  },
  listActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  actionBtnIcon: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnIconText: {
    fontSize: 14,
    lineHeight: 16,
  },
  actionBtnWhatsApp: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnWhatsAppText: {
    fontSize: 14,
    lineHeight: 16,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionBtnText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
  },
  actionBtnReminder: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  actionBtnReminderText: {
    color: "#dc2626",
  },
  actionBtnDanger: {
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionBtnDangerText: {
    fontSize: 11,
    color: "#dc2626",
    fontWeight: "600",
  },
  editBlock: { gap: 8 },
  editActions: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnGhostText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  btnDisabled: { opacity: 0.5 },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    textAlign: "right",
  },
  listItems: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 4,
    paddingBottom: 4,
    gap: 4,
  },
  closeBtn: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtnText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
});
