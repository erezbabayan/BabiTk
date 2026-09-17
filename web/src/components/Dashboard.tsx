import { useEffect, useMemo, useRef, useState, useCallback, type DragEvent } from "react";
import { ArchivePanel } from "./ArchivePanel";
import { CompletedPanel } from "./CompletedPanel";
import { ColumnSearch } from "./ColumnSearch";
import { ColumnBoardHeader } from "./ColumnBoardHeader";
import { ColumnDropZone } from "./ColumnDropZone";
import { DraggableItemList, type DropSlot } from "./DraggableItemList";
import { MouseDragScroll, scrollAllBoardColumnsToTop } from "./MouseDragScroll";
import { ItemCard, ITEM_DRAG_MIME } from "./ItemCard";
import { SwipeableItemCard } from "./SwipeableItemCard";
import { TagFilter } from "./TagFilter";
import { PriorityFilter } from "./PriorityFilter";
import { DateScopeFilter } from "./DateScopeFilter";
import { TagWheelPicker } from "./TagWheelPicker";
import { TaskListsModal, type TaskListsModalMode } from "./TaskListsModal";
import { ListBoardIcon } from "./ListBoardIcon";
import { ReminderPicker } from "./ReminderPicker";
import { ReminderAlertModal } from "./ReminderAlertModal";
import { BoardBulkBar } from "./BoardBulkBar";
import { NotebookBoardSection } from "./NotebookBoardSection";
import { useItems } from "../hooks/useItems";
import { useDueDateReminderAlerts } from "../hooks/useDueDateReminderAlerts";
import { useBoardSelection } from "../hooks/useBoardSelection";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTaskLists } from "../hooks/useTaskLists";
import { useUserTags } from "../hooks/useUserTags";
import {
  deleteItemConfirmMessage,
  deleteManyItemsConfirmMessage,
} from "../lib/confirm-copy";
import {
  applyBoardItemFilters,
  boardFiltersActive,
  type BoardDateFilter,
} from "../lib/filter-items";
import { isPriorityItem } from "../lib/item-priority";
import { mergeSearchResults } from "../lib/unified-search";
import { undoTaskListItem } from "../lib/task-list-actions";
import { useBoardSearch } from "../hooks/useBoardSearch";
import { useBoardFilterTags } from "../hooks/useBoardFilterTags";
import { useTagCascadeSync } from "../hooks/useTagCascadeSync";
import { boardTasksForListSync } from "../lib/task-list-items";
import { boardSwipeActions, inboxSendToBoardLabel, inboxSwipeActions } from "../lib/item-swipe-actions";
import { applyBoardDateSort, type BoardDateSortDirection } from "../lib/board-date-sort";
import {
  itemsForBulkAction,
  type BoardBulkAction,
  type BoardSelectScope,
} from "../lib/board-bulk-actions";
import { boardToolbarButtonClass, type BoardToolbarTone } from "../lib/board-toolbar";
import { listViewTitle, searchPlaceholder, type BoardTab } from "../lib/board-labels";
import { BoardDateSortButton } from "./BoardDateSortButton";
import { BoardMobileTabs } from "./BoardMobileTabs";
import { MAX_ITEM_TAGS, alignItemTagsWithDefinitions } from "../lib/tags";
import { getItemColumn, type DashboardColumn } from "../lib/item-columns";
import { resolveInboxDragTransfer } from "../lib/item-board-actions";
import { useIsDesktopBoard } from "../hooks/useMediaQuery";
import { useBoardItemViewOptional } from "../providers/BoardItemViewProvider";
import { itemIdFromOpenEvent, OPEN_ITEM_EVENT } from "../lib/user-notifications";
import { planMyDayFocus, planMyDayOrder } from "../lib/plan-my-day";
import { ItemEditModal } from "./ItemEditModal";
import type { ChecklistEntry } from "../lib/checklist";
import type { MindtaskerItem } from "../types";
interface DashboardProps {
  userId: string;
  refreshTick?: number;
  /** Increment to reset board views (logo / home). */
  homeResetTick?: number;
}

export function Dashboard({ userId, refreshTick = 0, homeResetTick = 0 }: DashboardProps) {
  const { view: boardItemView } = useBoardItemViewOptional();
  const swipeSquares = boardItemView === "squares";
  const isDesktop = useIsDesktopBoard();
  const [showArchive, setShowArchive] = useState(false);
  const [showTasksArchive, setShowTasksArchive] = useState(false);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [showNotesArchive, setShowNotesArchive] = useState(false);
  const [showTaskLists, setShowTaskLists] = useState(false);
  const {
    loading,
    convexUserId,
    inbox,
    todayTasks,
    completedTasks,
    notes,
    inboxArchive,
    notesArchive,
    toggleActionable,
    approveInboxItem,
    snoozeTask,
    clearReminder,
    markReminderFired,
    restoreArchiveItem,
    archiveItem,
    completeTask,
    deleteItem,
    restoreDeletedItem,
    restoreCompletedTask,
    editItem,
    updateTags,
    togglePriority,
    toggleChecklist,
    placeItem,
    refresh,
  } = useItems(userId, undefined, {
    inboxArchive: showArchive || showTasksArchive || showTaskLists,
    notesArchive: showNotesArchive,
    completed: showCompletedTasks || showTaskLists,
  });
  const { tags: userTags, addTag } = useUserTags();
  const taskLists = useTaskLists(userId);
  useTagCascadeSync(convexUserId);
  const { requestConfirm, confirmDialog } = useConfirmDialog();
  const {
    ids: selectedIds,
    scope: selectScope,
    busy: selectBusy,
    setBusy: setSelectBusy,
    isSelecting,
    enter: enterSelect,
    exit: exitSelect,
    toggle: toggleSelect,
    selectAll,
    clear: clearSelect,
    isSelected,
  } = useBoardSelection();

  const reminderItems = useMemo(
    () => [...inbox, ...todayTasks, ...notes],
    [inbox, todayTasks, notes],
  );
  const dueReminders = useDueDateReminderAlerts(
    reminderItems,
    true,
    (item, fireAt) => markReminderFired(item as MindtaskerItem, fireAt),
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") exitSelect();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitSelect]);

  useEffect(() => {
    if (refreshTick > 0) void refresh();
  }, [refreshTick, refresh]);

  const [taskListsMode, setTaskListsMode] = useState<TaskListsModalMode>("create");
  const [mobileTab, setMobileTab] = useState<BoardTab>("inbox");
  const [boardTag, setBoardTag] = useState<string | null>(null);
  const [boardPriorityOnly, setBoardPriorityOnly] = useState(false);
  const [boardDateFilter, setBoardDateFilter] = useState<BoardDateFilter>("all");
  const inboxSearch = useBoardSearch("inbox");
  const todaySearch = useBoardSearch("today");
  const notesSearch = useBoardSearch("notes");
  const [inboxDateSort, setInboxDateSort] = useState<BoardDateSortDirection>(null);
  const [todayDateSort, setTodayDateSort] = useState<BoardDateSortDirection>(null);
  const [notesDateSort, setNotesDateSort] = useState<BoardDateSortDirection>(null);
  const [snoozeItem, setSnoozeItem] = useState<MindtaskerItem | null>(null);
  const [undoComplete, setUndoComplete] = useState<MindtaskerItem | null>(null);
  const [focusEditItem, setFocusEditItem] = useState<MindtaskerItem | null>(null);
  const [planMyDay, setPlanMyDay] = useState(false);

  useEffect(() => {
    if (!undoComplete) return;
    const timer = window.setTimeout(() => setUndoComplete(null), 8000);
    return () => window.clearTimeout(timer);
  }, [undoComplete]);

  useEffect(() => {
    function onOpenItem(event: Event) {
      const itemId = itemIdFromOpenEvent(event);
      if (!itemId) return;
      const found = boardItemsByIdRef.current.get(itemId);
      if (!found) return;
      const column = getItemColumn(found);
      if (column) setMobileTab(column);
      setFocusEditItem(found);
    }
    window.addEventListener(OPEN_ITEM_EVENT, onOpenItem);
    return () => window.removeEventListener(OPEN_ITEM_EVENT, onOpenItem);
  }, []);

  const completeWithUndo = useCallback(
    async (item: MindtaskerItem) => {
      await completeTask(item);
      setUndoComplete(item);
    },
    [completeTask],
  );
  const [tagPickerItem, setTagPickerItem] = useState<MindtaskerItem | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DashboardColumn | null>(null);
  const [dropSlot, setDropSlot] = useState<DropSlot | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dropHandledRef = useRef(false);
  const dragStartXRef = useRef(0);
  const lastDragXRef = useRef(0);
  const boardItemsByIdRef = useRef(new Map<string, MindtaskerItem>());

  const filteredInbox = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(inbox, inboxSearch.activeQuery, inboxSearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardDateFilter,
        ),
        inboxDateSort,
      ),
    [inbox, inboxSearch.activeQuery, inboxSearch.semanticHits, boardTag, boardPriorityOnly, boardDateFilter, inboxDateSort],
  );
  const filteredInboxArchive = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(inboxArchive, inboxSearch.activeQuery, inboxSearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardDateFilter,
        ),
        inboxDateSort,
      ),
    [inboxArchive, inboxSearch.activeQuery, inboxSearch.semanticHits, boardTag, boardPriorityOnly, boardDateFilter, inboxDateSort],
  );
  const filteredTodayTasks = useMemo(
    () => {
      const filtered = applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(todayTasks, todaySearch.activeQuery, todaySearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardDateFilter,
        ),
        todayDateSort,
      );
      if (!planMyDay) return filtered;
      return planMyDayOrder(planMyDayFocus(filtered));
    },
    [
      todayTasks,
      todaySearch.activeQuery,
      todaySearch.semanticHits,
      boardTag,
      boardPriorityOnly,
      boardDateFilter,
      todayDateSort,
      planMyDay,
    ],
  );
  const filteredTasksArchive = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(inboxArchive, todaySearch.activeQuery, todaySearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardDateFilter,
        ),
        todayDateSort,
      ),
    [
      inboxArchive,
      todaySearch.activeQuery,
      todaySearch.semanticHits,
      boardTag,
      boardPriorityOnly,
      boardDateFilter,
      todayDateSort,
    ],
  );
  const filteredCompletedTasks = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(completedTasks, todaySearch.activeQuery, todaySearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardDateFilter,
        ),
        todayDateSort,
      ),
    [
      completedTasks,
      todaySearch.activeQuery,
      todaySearch.semanticHits,
      boardTag,
      boardPriorityOnly,
      boardDateFilter,
      todayDateSort,
    ],
  );
  const filteredNotes = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(notes, notesSearch.activeQuery, notesSearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardDateFilter,
        ),
        notesDateSort,
      ),
    [notes, notesSearch.activeQuery, notesSearch.semanticHits, boardTag, boardPriorityOnly, boardDateFilter, notesDateSort],
  );
  const filteredNotesArchive = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(notesArchive, notesSearch.activeQuery, notesSearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardDateFilter,
        ),
        notesDateSort,
      ),
    [notesArchive, notesSearch.activeQuery, notesSearch.semanticHits, boardTag, boardPriorityOnly, boardDateFilter, notesDateSort],
  );

  const filterTags = useBoardFilterTags();

  function renderBoardFilters() {
    return (
      <div className="board-notebook-chrome flex flex-wrap items-center gap-2">
        <DateScopeFilter value={boardDateFilter} onChange={setBoardDateFilter} />
        <PriorityFilter active={boardPriorityOnly} onToggle={setBoardPriorityOnly} />
        <div className="min-w-0 flex-1">
          <TagFilter
            tags={filterTags}
            selected={boardTag}
            onSelect={setBoardTag}
            userTags={userTags}
          />
        </div>
      </div>
    );
  }

  function boardListFiltered(query: string) {
    return boardFiltersActive({
      query,
      tag: boardTag,
      priorityOnly: boardPriorityOnly,
      dateFilter: boardDateFilter,
    });
  }

  useEffect(() => {
    if (boardTag && !filterTags.includes(boardTag)) {
      setBoardTag(null);
    }
  }, [boardTag, filterTags]);

  const activeTaskListsCount = useMemo(
    () => taskLists.lists.filter((list) => list.status === "active").length,
    [taskLists.lists],
  );

  const boardTasksForLists = useMemo(
    () =>
      boardTasksForListSync({
        todayTasks,
        completedTasks,
        archivedTasks: inboxArchive,
      }),
    [todayTasks, completedTasks, inboxArchive],
  );

  const inboxById = useMemo(
    () => new Map(filteredInbox.map((item) => [item.id, item])),
    [filteredInbox],
  );
  const todayById = useMemo(
    () => new Map(filteredTodayTasks.map((item) => [item.id, item])),
    [filteredTodayTasks],
  );
  const notesById = useMemo(
    () => new Map(filteredNotes.map((item) => [item.id, item])),
    [filteredNotes],
  );
  boardItemsByIdRef.current = new Map(
    [...inbox, ...todayTasks, ...notes, ...completedTasks, ...inboxArchive, ...notesArchive].map(
      (item) => [item.id, item],
    ),
  );

  useEffect(() => {
    if (!draggingId) return;
    function trackDragX(event: globalThis.DragEvent) {
      lastDragXRef.current = event.clientX;
    }
    window.addEventListener("dragover", trackDragX);
    return () => window.removeEventListener("dragover", trackDragX);
  }, [draggingId]);

  function logItemActionError(label: string, error: unknown) {
    console.error(label, error);
  }

  const inboxReorderDisabled = Boolean(
    inboxSearch.activeQuery.trim() || boardTag || boardPriorityOnly || boardDateFilter !== "all" || inboxDateSort,
  );
  const todayReorderDisabled = Boolean(
    todaySearch.activeQuery.trim() ||
      boardTag ||
      boardPriorityOnly ||
      boardDateFilter !== "all" ||
      todayDateSort ||
      planMyDay,
  );
  const notesReorderDisabled = Boolean(
    notesSearch.activeQuery.trim() || boardTag || boardPriorityOnly || boardDateFilter !== "all" || notesDateSort,
  );

  function clearDragState() {
    setDraggingId(null);
    setDropTarget(null);
    setDropSlot(null);
  }

  const resetHomeView = useCallback(() => {
    setShowArchive(false);
    setShowTasksArchive(false);
    setShowCompletedTasks(false);
    setShowNotesArchive(false);
    setShowTaskLists(false);
    setTaskListsMode("create");
    setMobileTab("inbox");
    setBoardTag(null);
    setBoardPriorityOnly(false);
    setBoardDateFilter("all");
    setPlanMyDay(false);
    setInboxDateSort(null);
    setTodayDateSort(null);
    setNotesDateSort(null);
    inboxSearch.clear();
    todaySearch.clear();
    notesSearch.clear();
    setSnoozeItem(null);
    setTagPickerItem(null);
    setTagDraft([]);
    exitSelect();
    clearDragState();
    scrollAllBoardColumnsToTop();
  }, [inboxSearch.clear, todaySearch.clear, notesSearch.clear, exitSelect]);

  useEffect(() => {
    if (homeResetTick < 1) return;
    resetHomeView();
  }, [homeResetTick, resetHomeView]);

  function bindDrag(item: MindtaskerItem) {
    if (!isDesktop || selectScope) {
      return {
        draggable: false as const,
        isDragging: false,
        onDragStart: undefined,
        onDragEnd: undefined,
      };
    }
    return {
      draggable: true as const,
      isDragging: draggingId === item.id,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(ITEM_DRAG_MIME, item.id);
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        const card = e.currentTarget.closest("article[data-item-drag-root]");
        const dragImage = card instanceof HTMLElement ? card : e.currentTarget;
        if (dragImage instanceof HTMLElement) {
          e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, 20);
        }
        dropHandledRef.current = false;
        draggingIdRef.current = item.id;
        dragStartXRef.current = e.clientX;
        lastDragXRef.current = e.clientX;
        setDraggingId(item.id);
      },
      onDragEnd: (e: DragEvent) => {
        e.stopPropagation();
        const id = draggingIdRef.current;
        const dropped = dropHandledRef.current;
        const startX = dragStartXRef.current;
        const endX = lastDragXRef.current || e.clientX;
        const dragged = id ? boardItemsByIdRef.current.get(id) : undefined;
        draggingIdRef.current = null;
        dropHandledRef.current = false;
        clearDragState();
        if (dropped || !dragged) return;
        const decision = resolveInboxDragTransfer({
          sourceColumn: getItemColumn(dragged),
          dropColumn: null,
          startX,
          endX,
        });
        if (decision === "approve") {
          void approveInboxItem(dragged).catch((error) => {
            logItemActionError("approveInboxItem failed", error);
          });
        }
      },
    };
  }

  function handlePlaceDrop(column: DashboardColumn, beforeId: string | null) {
    const id = draggingIdRef.current ?? draggingId;
    const dragged = id ? boardItemsByIdRef.current.get(id) : undefined;
    dropHandledRef.current = true;
    draggingIdRef.current = null;
    const decision = dragged
      ? resolveInboxDragTransfer({
          sourceColumn: getItemColumn(dragged),
          dropColumn: column,
          startX: dragStartXRef.current,
          endX: lastDragXRef.current,
        })
      : "none";
    clearDragState();
    if (!id || !dragged) return;
    if (decision === "approve") {
      void approveInboxItem(dragged).catch((error) => {
        logItemActionError("approveInboxItem failed", error);
      });
      return;
    }
    void placeItem(id, column, beforeId);
  }

  function handleColumnDrop(target: DashboardColumn) {
    const beforeId = dropSlot?.column === target ? dropSlot.beforeId : null;
    handlePlaceDrop(target, beforeId);
  }

  async function persistTagDraft(item: MindtaskerItem) {
    const aligned = alignItemTagsWithDefinitions(tagDraft, userTags);
    await updateTags(item, aligned);
  }

  function openTagPicker(item: MindtaskerItem) {
    if (tagPickerItem?.id === item.id) {
      void persistTagDraft(item).then(() => setTagPickerItem(null));
      return;
    }
    if (tagPickerItem) {
      void persistTagDraft(tagPickerItem).catch(() => {});
    }
    setTagPickerItem(item);
    setTagDraft(alignItemTagsWithDefinitions(item.tags ?? [], userTags));
  }

  function handleToggleTag(tagName: string) {
    setTagDraft((current) => {
      if (current.includes(tagName)) {
        return current.filter((t) => t !== tagName);
      }
      if (current.length >= MAX_ITEM_TAGS) return current;
      return [...current, tagName];
    });
  }

  function handleCloseTagPicker() {
    if (tagPickerItem) {
      void persistTagDraft(tagPickerItem).then(() => setTagPickerItem(null));
      return;
    }
    setTagPickerItem(null);
  }

  async function handleCreateTag(name: string, color: string) {
    await addTag(name, color);
  }

  function bindItemChrome(item: MindtaskerItem) {
    const open = tagPickerItem?.id === item.id;
    return {
      onTagPress: () => openTagPicker(item),
      tagPickerOpen: open,
      tagsOverride: open ? tagDraft : undefined,
      onTogglePriority: () => void togglePriority(item, !isPriorityItem(item)),
      onToggleChecklist: (checklist: ChecklistEntry[]) => {
        void toggleChecklist(item, checklist);
      },
    };
  }

  function bindSelect(scope: BoardSelectScope, item: MindtaskerItem) {
    const selecting = isSelecting(scope);
    return {
      selecting,
      selected: selecting && isSelected(item.id),
      onToggleSelect: selecting ? () => toggleSelect(item.id) : undefined,
    };
  }

  function selectToggleButton(scope: BoardSelectScope, tone: BoardToolbarTone) {
    const selecting = isSelecting(scope);
    return (
      <button
        type="button"
        aria-pressed={selecting}
        onClick={() => (selecting ? exitSelect() : enterSelect(scope))}
        className={boardToolbarButtonClass(tone)}
      >
        {selecting ? "סיום" : "בחר"}
      </button>
    );
  }

  async function handleBulkAction(
    list: MindtaskerItem[],
    action: BoardBulkAction,
  ) {
    const selected = list.filter((item) => selectedIds.has(item.id));
    const targets = itemsForBulkAction(selected, action);
    if (targets.length === 0) return;
    if (action === "delete") {
      const ok = await requestConfirm({
        title: "מחיקה",
        message: deleteManyItemsConfirmMessage(targets.length),
        confirmLabel: "מחק",
        cancelLabel: "ביטול",
        variant: "danger",
      });
      if (!ok) return;
    }
    setSelectBusy(true);
    try {
      for (const item of targets) {
        try {
          switch (action) {
            case "complete":
              await completeWithUndo(item);
              break;
            case "archive":
              await archiveItem(item);
              break;
            case "restore":
              if (item.status === "completed") await restoreCompletedTask(item);
              else await restoreArchiveItem(item);
              break;
            case "delete":
              await deleteItem(item);
              break;
            case "convertToNote":
            case "convertToTask":
              await toggleActionable(item);
              break;
            case "sendToBoard":
              await approveInboxItem(item);
              break;
          }
        } catch (error) {
          logItemActionError(`bulk ${action} failed`, error);
        }
      }
      clearSelect();
    } finally {
      setSelectBusy(false);
    }
  }

  function renderBulkBar(
    scope: BoardSelectScope,
    list: MindtaskerItem[],
    tone: BoardToolbarTone,
  ) {
    if (!isSelecting(scope)) return null;
    return (
      <BoardBulkBar
        items={list.filter((item) => selectedIds.has(item.id))}
        total={list.length}
        busy={selectBusy}
        tone={tone}
        onSelectAll={() => selectAll(list.map((item) => item.id))}
        onClear={clearSelect}
        onExit={exitSelect}
        onAction={(action) => void handleBulkAction(list, action)}
      />
    );
  }

  function renderInboxItem(itemId: string) {
    const item = inboxById.get(itemId);
    if (!item) return null;
    const selecting = isSelecting("inbox-active");
    const swipe = inboxSwipeActions(
      item,
      () => {
        void approveInboxItem(item).catch((error) => {
          logItemActionError("approveInboxItem failed", error);
        });
      },
      () => confirmDelete(item),
    );
    return (
      <SwipeableItemCard
        leftAction={swipe.left}
        rightAction={swipe.right}
        squares={swipeSquares}
        disabled={selecting}
      >
        <ItemCard
          item={item}
          boardAccent="inbox"
          userTags={userTags}
          {...bindDrag(item)}
          {...bindItemChrome(item)}
          {...bindSelect("inbox-active", item)}
          onEdit={(patch) => editItem(item, patch)}
          onToggleType={() => {
            void toggleActionable(item).catch((error) => {
              logItemActionError("toggleActionable failed", error);
            });
          }}
          onSendToBoard={() => {
            void approveInboxItem(item).catch((error) => {
              logItemActionError("approveInboxItem failed", error);
            });
          }}
          sendToBoardLabel={inboxSendToBoardLabel(item)}
        />
      </SwipeableItemCard>
    );
  }

  function renderTodayItem(itemId: string) {
    const item = todayById.get(itemId);
    if (!item) return null;
    const selecting = isSelecting("today-active");
    const swipe = boardSwipeActions(
      () => void archiveItem(item),
      () => confirmDelete(item),
      "tasks",
    );
    return (
      <SwipeableItemCard
        leftAction={swipe.left}
        rightAction={swipe.right}
        squares={swipeSquares}
        disabled={selecting}
      >
        <ItemCard
          item={item}
          boardAccent="today"
          userTags={userTags}
          {...bindDrag(item)}
          {...bindItemChrome(item)}
          {...bindSelect("today-active", item)}
          onEdit={(patch) => editItem(item, patch)}
          onToggleType={() => {
            void toggleActionable(item).catch((error) => {
              logItemActionError("toggleActionable failed", error);
            });
          }}
          onSnooze={() => setSnoozeItem(item)}
          onComplete={item.is_actionable ? () => void completeWithUndo(item) : undefined}
        />
      </SwipeableItemCard>
    );
  }

  function renderNoteItem(itemId: string) {
    const item = notesById.get(itemId);
    if (!item) return null;
    const selecting = isSelecting("notes-active");
    const swipe = boardSwipeActions(
      () => void archiveItem(item),
      () => confirmDelete(item),
      "notes",
    );
    return (
      <SwipeableItemCard
        leftAction={swipe.left}
        rightAction={swipe.right}
        squares={swipeSquares}
        disabled={selecting}
      >
        <ItemCard
          item={item}
          boardAccent="notes"
          compact
          userTags={userTags}
          {...bindDrag(item)}
          {...bindItemChrome(item)}
          {...bindSelect("notes-active", item)}
          onEdit={(patch) => editItem(item, patch)}
          onToggleType={() => {
            void toggleActionable(item).catch((error) => {
              logItemActionError("toggleActionable failed", error);
            });
          }}
          onSnooze={() => setSnoozeItem(item)}
          onComplete={item.is_actionable ? () => void completeWithUndo(item) : undefined}
        />
      </SwipeableItemCard>
    );
  }

  async function confirmDelete(item: MindtaskerItem) {
    const ok = await requestConfirm({
      title: "מחיקה",
      message: deleteItemConfirmMessage(item.title),
      confirmLabel: "מחק",
      cancelLabel: "ביטול",
      variant: "danger",
    });
    if (ok) void deleteItem(item);
  }

  const dragging = draggingId !== null;
  const todayListView: "active" | "archive" | "completed" = showTasksArchive
    ? "archive"
    : showCompletedTasks
      ? "completed"
      : "active";
  const todayItemCount =
    todayListView === "archive"
      ? inboxArchive.length
      : todayListView === "completed"
        ? completedTasks.length
        : todayTasks.length;
  const inboxItemCount = showArchive ? inboxArchive.length : inbox.length;
  const notesItemCount = showNotesArchive ? notesArchive.length : notes.length;

  return (
    <>
      {confirmDialog}
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        {!isDesktop ? (
          <BoardMobileTabs
            active={mobileTab}
            onChange={setMobileTab}
            counts={{
              inbox: inbox.length,
              today: todayTasks.length,
              notes: notes.length,
            }}
          />
        ) : null}
        <div
          className={
            isDesktop
              ? "grid min-h-0 w-full flex-1 grid-cols-3 grid-rows-1 gap-3 overflow-hidden p-3"
              : "grid min-h-0 w-full flex-1 grid-cols-1 grid-rows-1 gap-2 overflow-hidden p-1 sm:p-2"
          }
          data-board-layout={isDesktop ? "desktop-triple" : "mobile-single"}
        >
        <NotebookBoardSection
          tone="slate"
          active={isDesktop || mobileTab === "inbox"}
          tabTitle={listViewTitle(
            "inbox",
            showArchive ? "archive" : "active",
            inboxItemCount,
          )}
        >
          {showArchive ? (
            <>
              <ColumnBoardHeader
                title={listViewTitle("inbox", "archive", inboxItemCount)}
                titleClassName=""
                markTone="slate"
                notebookLayout
                dateSort={
                  <BoardDateSortButton
                    direction={inboxDateSort}
                    onDirectionChange={setInboxDateSort}
                    tone="slate"
                  />
                }
                search={
                  <ColumnSearch
                    inline
                    value={inboxSearch.input}
                    onChange={inboxSearch.setInput}
                    activeQuery={inboxSearch.activeQuery}
                    onSearch={() => void inboxSearch.search()}
                    onClear={inboxSearch.clear}
                    placeholder={searchPlaceholder("inbox", "archive")}
                    tone="slate"
                    loading={inboxSearch.loading}
                  />
                }
                toolbarExtra={selectToggleButton("inbox-archive", "slate")}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      exitSelect();
                      setShowArchive(false);
                    }}
                    className={boardToolbarButtonClass("slate")}
                  >
                    חזור
                  </button>
                }
              />
              {renderBoardFilters()}
              {renderBulkBar("inbox-archive", filteredInboxArchive, "slate")}
              <ColumnDropZone
                column="inbox"
                active={false}
                dragging={false}
                onActivate={setDropTarget}
                onDeactivate={() => setDropTarget(null)}
                onDrop={handleColumnDrop}
                className="flex min-h-0 flex-1 flex-col"
              >
                <MouseDragScroll>
                  <ArchivePanel
                    variant="inbox"
                    items={filteredInboxArchive}
                    onRestore={(item) => void restoreArchiveItem(item)}
                    onDelete={confirmDelete}
                    onEdit={(item, patch) => editItem(item, patch)}
                    onTagPress={openTagPicker}
                    onTogglePriority={(item) =>
                      void togglePriority(item, !isPriorityItem(item))
                    }
                    tagPickerOpenId={tagPickerItem?.id ?? null}
                    tagsOverrideForItem={(item) =>
                      tagPickerItem?.id === item.id ? tagDraft : undefined
                    }
                    userTags={userTags}
                    selecting={isSelecting("inbox-archive")}
                    selectedIds={selectedIds}
                    onToggleSelect={(item) => toggleSelect(item.id)}
                  />
                </MouseDragScroll>
              </ColumnDropZone>
            </>
          ) : (
            <>
              <ColumnBoardHeader
                title={listViewTitle("inbox", "active", inboxItemCount)}
                titleClassName=""
                markTone="slate"
                notebookLayout
                dateSort={
                  <BoardDateSortButton
                    direction={inboxDateSort}
                    onDirectionChange={setInboxDateSort}
                    tone="slate"
                  />
                }
                search={
                  <ColumnSearch
                    inline
                    value={inboxSearch.input}
                    onChange={inboxSearch.setInput}
                    activeQuery={inboxSearch.activeQuery}
                    onSearch={() => void inboxSearch.search()}
                    onClear={inboxSearch.clear}
                    placeholder={searchPlaceholder("inbox", "active")}
                    tone="slate"
                    loading={inboxSearch.loading}
                  />
                }
                toolbarExtra={selectToggleButton("inbox-active", "slate")}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setShowArchive(true);
                      setShowNotesArchive(false);
                      exitSelect();
                    }}
                    className={boardToolbarButtonClass("slate")}
                  >
                    {`ארכיון (${inboxArchive.length})`}
                  </button>
                }
              />
              {renderBoardFilters()}
              {renderBulkBar("inbox-active", filteredInbox, "slate")}
              <ColumnDropZone
                column="inbox"
                active={dropTarget === "inbox" && dragging}
                dragging={dragging}
                onActivate={setDropTarget}
                onDeactivate={() => setDropTarget(null)}
                onDrop={handleColumnDrop}
                className="flex min-h-0 flex-1 flex-col"
              >
                <MouseDragScroll>
                  <DraggableItemList
                    column="inbox"
                    items={filteredInbox}
                    draggingId={draggingId}
                    dropSlot={dropSlot}
                    disabled={inboxReorderDisabled || Boolean(selectScope)}
                    emptyMessage={
                      <p className="text-sm text-slate-400">
                        {boardListFiltered(inboxSearch.activeQuery)
                          ? "אין תוצאות לסינון"
                          : dragging
                            ? "שחרר כאן להעברה למחברת"
                            : "המחברת ריקה 🎉"}
                      </p>
                    }
                    onDragStart={() => {}}
                    onDragEnd={clearDragState}
                    onDropSlotChange={setDropSlot}
                    onDrop={(slot) => handlePlaceDrop(slot.column, slot.beforeId)}
                    renderItem={renderInboxItem}
                  />
                </MouseDragScroll>
              </ColumnDropZone>
            </>
          )}
        </NotebookBoardSection>

        <NotebookBoardSection
          tone="blue"
          active={isDesktop || mobileTab === "today"}
          tabTitle={listViewTitle("today", todayListView, todayItemCount)}
        >
          <>
            <ColumnBoardHeader
              title={listViewTitle("today", todayListView, todayItemCount)}
              titleClassName=""
              markTone="blue"
              notebookLayout
              titleTrailing={
                todayListView === "active" && taskLists.enabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTaskListsMode(activeTaskListsCount > 0 ? "existing" : "create");
                      setShowTaskLists(true);
                    }}
                    className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-blue-300/90 bg-white px-2 text-[11px] font-semibold leading-none text-blue-700 shadow-sm hover:bg-blue-50"
                    title="הרשימה"
                    aria-label="הרשימה"
                  >
                    <ListBoardIcon className="h-3.5 w-3.5" />
                    הרשימה
                  </button>
                ) : null
              }
              dateSort={
                <BoardDateSortButton
                  direction={todayDateSort}
                  onDirectionChange={setTodayDateSort}
                  tone="blue"
                />
              }
              search={
                <ColumnSearch
                  inline
                  value={todaySearch.input}
                  onChange={todaySearch.setInput}
                  activeQuery={todaySearch.activeQuery}
                  onSearch={() => void todaySearch.search()}
                  onClear={todaySearch.clear}
                  placeholder={searchPlaceholder("today", todayListView)}
                  tone="blue"
                  loading={todaySearch.loading}
                />
              }
              toolbarExtra={
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {todayListView === "active" ? (
                    <button
                      type="button"
                      onClick={() => setPlanMyDay((value) => !value)}
                      className={`${boardToolbarButtonClass("blue")} ${
                        planMyDay ? "border-blue-400 bg-blue-50 font-semibold" : ""
                      }`}
                      aria-pressed={planMyDay}
                      title="סדר את משימות היום: עבר, היום, ואז עדיפות"
                    >
                      תכנן לי את היום
                    </button>
                  ) : null}
                  {todayListView === "active" && completedTasks.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowCompletedTasks(true);
                        setShowTasksArchive(false);
                        exitSelect();
                      }}
                      className={boardToolbarButtonClass("blue")}
                    >
                      הושלמו ({completedTasks.length})
                    </button>
                  ) : null}
                  {selectToggleButton(
                    todayListView === "archive"
                      ? "today-archive"
                      : todayListView === "completed"
                        ? "today-completed"
                        : "today-active",
                    "blue",
                  )}
                </div>
              }
              action={
                showCompletedTasks ? (
                  <button
                    type="button"
                    onClick={() => {
                      exitSelect();
                      setShowCompletedTasks(false);
                    }}
                    className={boardToolbarButtonClass("blue")}
                  >
                    חזור
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (showTasksArchive) {
                        setShowTasksArchive(false);
                        exitSelect();
                      } else {
                        setShowTasksArchive(true);
                        setShowArchive(false);
                        setShowNotesArchive(false);
                        setShowCompletedTasks(false);
                        exitSelect();
                      }
                    }}
                    className={boardToolbarButtonClass("blue")}
                  >
                    {showTasksArchive ? "חזור" : `ארכיון (${inboxArchive.length})`}
                  </button>
                )
              }
            />
            {renderBoardFilters()}
            {renderBulkBar(
              todayListView === "archive"
                ? "today-archive"
                : todayListView === "completed"
                  ? "today-completed"
                  : "today-active",
              todayListView === "archive"
                ? filteredTasksArchive
                : todayListView === "completed"
                  ? filteredCompletedTasks
                  : filteredTodayTasks,
              "blue",
            )}
            <ColumnDropZone
              column="today"
              active={dropTarget === "today" && dragging && todayListView === "active"}
              dragging={dragging && todayListView === "active"}
              onActivate={setDropTarget}
              onDeactivate={() => setDropTarget(null)}
              onDrop={handleColumnDrop}
              className="flex min-h-0 flex-1 flex-col"
            >
              {showTasksArchive ? (
                <MouseDragScroll>
                  <ArchivePanel
                    items={filteredTasksArchive}
                    variant="inbox"
                    onRestore={(item) => void restoreArchiveItem(item)}
                    onDelete={confirmDelete}
                    onEdit={(item, patch) => editItem(item, patch)}
                    onTagPress={openTagPicker}
                    onTogglePriority={(item) =>
                      void togglePriority(item, !isPriorityItem(item))
                    }
                    tagPickerOpenId={tagPickerItem?.id ?? null}
                    tagsOverrideForItem={(item) =>
                      tagPickerItem?.id === item.id ? tagDraft : undefined
                    }
                    userTags={userTags}
                    selecting={isSelecting("today-archive")}
                    selectedIds={selectedIds}
                    onToggleSelect={(item) => toggleSelect(item.id)}
                  />
                </MouseDragScroll>
              ) : showCompletedTasks ? (
                <MouseDragScroll>
                  <CompletedPanel
                    items={filteredCompletedTasks}
                    onRestore={(item) => void restoreCompletedTask(item)}
                    onDelete={confirmDelete}
                    onEdit={(item, patch) => editItem(item, patch)}
                    selecting={isSelecting("today-completed")}
                    selectedIds={selectedIds}
                    onToggleSelect={(item) => toggleSelect(item.id)}
                  />
                </MouseDragScroll>
              ) : (
                <MouseDragScroll>
                  <DraggableItemList
                    column="today"
                    items={filteredTodayTasks}
                    draggingId={draggingId}
                    dropSlot={dropSlot}
                    disabled={todayReorderDisabled || Boolean(selectScope)}
                    emptyMessage={
                      <p className="text-sm text-blue-400/80">
                        {boardListFiltered(todaySearch.activeQuery)
                          ? "אין תוצאות לסינון"
                          : dragging
                            ? "שחרר כאן להעברת משימה"
                            : "אין משימות לביצוע"}
                      </p>
                    }
                    onDragStart={() => {}}
                    onDragEnd={clearDragState}
                    onDropSlotChange={setDropSlot}
                    onDrop={(slot) => handlePlaceDrop(slot.column, slot.beforeId)}
                    renderItem={renderTodayItem}
                  />
                </MouseDragScroll>
              )}
            </ColumnDropZone>
          </>
        </NotebookBoardSection>

        <NotebookBoardSection
          tone="orange"
          active={isDesktop || mobileTab === "notes"}
          tabTitle={listViewTitle(
            "notes",
            showNotesArchive ? "archive" : "active",
            notesItemCount,
          )}
        >
          {showNotesArchive ? (
            <>
              <ColumnBoardHeader
                title={listViewTitle("notes", "archive", notesItemCount)}
                titleClassName=""
                markTone="orange"
                notebookLayout
                dateSort={
                  <BoardDateSortButton
                    direction={notesDateSort}
                    onDirectionChange={setNotesDateSort}
                    tone="orange"
                  />
                }
                search={
                  <ColumnSearch
                    inline
                    value={notesSearch.input}
                    onChange={notesSearch.setInput}
                    activeQuery={notesSearch.activeQuery}
                    onSearch={() => void notesSearch.search()}
                    onClear={notesSearch.clear}
                    placeholder={searchPlaceholder("notes", "archive")}
                    tone="orange"
                    loading={notesSearch.loading}
                  />
                }
                toolbarExtra={selectToggleButton("notes-archive", "orange")}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      exitSelect();
                      setShowNotesArchive(false);
                    }}
                    className={boardToolbarButtonClass("orange")}
                  >
                    חזור
                  </button>
                }
              />
              {renderBoardFilters()}
              {renderBulkBar("notes-archive", filteredNotesArchive, "orange")}
              <ColumnDropZone
                column="notes"
                active={false}
                dragging={false}
                onActivate={setDropTarget}
                onDeactivate={() => setDropTarget(null)}
                onDrop={handleColumnDrop}
                className="flex min-h-0 flex-1 flex-col"
              >
                <MouseDragScroll>
                  <ArchivePanel
                    variant="notes"
                    items={filteredNotesArchive}
                    onRestore={(item) => void restoreArchiveItem(item)}
                    onDelete={confirmDelete}
                    onEdit={(item, patch) => editItem(item, patch)}
                    onTagPress={openTagPicker}
                    onTogglePriority={(item) =>
                      void togglePriority(item, !isPriorityItem(item))
                    }
                    tagPickerOpenId={tagPickerItem?.id ?? null}
                    tagsOverrideForItem={(item) =>
                      tagPickerItem?.id === item.id ? tagDraft : undefined
                    }
                    userTags={userTags}
                    selecting={isSelecting("notes-archive")}
                    selectedIds={selectedIds}
                    onToggleSelect={(item) => toggleSelect(item.id)}
                  />
                </MouseDragScroll>
              </ColumnDropZone>
            </>
          ) : (
            <>
              <ColumnBoardHeader
                title={listViewTitle("notes", "active", notesItemCount)}
                titleClassName=""
                markTone="orange"
                notebookLayout
                dateSort={
                  <BoardDateSortButton
                    direction={notesDateSort}
                    onDirectionChange={setNotesDateSort}
                    tone="orange"
                  />
                }
                search={
                  <ColumnSearch
                    inline
                    value={notesSearch.input}
                    onChange={notesSearch.setInput}
                    activeQuery={notesSearch.activeQuery}
                    onSearch={() => void notesSearch.search()}
                    onClear={notesSearch.clear}
                    placeholder={searchPlaceholder("notes", "active")}
                    tone="orange"
                    loading={notesSearch.loading}
                  />
                }
                toolbarExtra={selectToggleButton("notes-active", "orange")}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotesArchive(true);
                      setShowArchive(false);
                      exitSelect();
                    }}
                    className={boardToolbarButtonClass("orange")}
                  >
                    {`ארכיון (${notesArchive.length})`}
                  </button>
                }
              />
              {renderBoardFilters()}
              {renderBulkBar("notes-active", filteredNotes, "orange")}
              <ColumnDropZone
                column="notes"
                active={dropTarget === "notes" && dragging}
                dragging={dragging}
                onActivate={setDropTarget}
                onDeactivate={() => setDropTarget(null)}
                onDrop={handleColumnDrop}
                className="flex min-h-0 flex-1 flex-col"
              >
                <MouseDragScroll>
                  {dragging && filteredNotes.length === 0 && !boardListFiltered(notesSearch.activeQuery) ? (
                    <p className="mb-2 text-sm text-orange-500">שחרר כאן להעברת הערה</p>
                  ) : null}
                  <DraggableItemList
                    column="notes"
                    items={filteredNotes}
                    draggingId={draggingId}
                    dropSlot={dropSlot}
                    disabled={notesReorderDisabled || Boolean(selectScope)}
                    emptyMessage={
                      <p className="text-sm text-orange-400/80">
                        {boardListFiltered(notesSearch.activeQuery)
                          ? "אין תוצאות לסינון"
                          : "אין הערות שמורות"}
                      </p>
                    }
                    onDragStart={() => {}}
                    onDragEnd={clearDragState}
                    onDropSlotChange={setDropSlot}
                    onDrop={(slot) => handlePlaceDrop(slot.column, slot.beforeId)}
                    renderItem={renderNoteItem}
                  />
                </MouseDragScroll>
              </ColumnDropZone>
            </>
          )}
        </NotebookBoardSection>
        </div>
      </div>

      {snoozeItem && !showTaskLists ? (
        <ReminderPicker
          item={snoozeItem}
          onSelect={(item, due, recurrence) => void snoozeTask(item, due, recurrence)}
          onClear={(item) => void clearReminder(item)}
          onClose={() => setSnoozeItem(null)}
        />
      ) : null}

      <ReminderAlertModal
        alert={dueReminders.alert}
        onDismiss={() => dueReminders.dismiss()}
        onAcknowledge={() => void dueReminders.acknowledge()}
        onOpen={() => {
          const itemId = dueReminders.alert?.itemId;
          if (!itemId) return;
          const found = reminderItems.find((entry) => entry.id === itemId);
          if (found) {
            const column = getItemColumn(found);
            if (column) setMobileTab(column);
            setFocusEditItem(found);
          }
        }}
        onComplete={
          dueReminders.alert?.itemId
            ? () => {
                const current = reminderItems.find(
                  (entry) => entry.id === dueReminders.alert?.itemId,
                );
                if (current?.is_actionable) {
                  void completeWithUndo(current).then(() => dueReminders.acknowledge());
                  return;
                }
                void dueReminders.acknowledge();
              }
            : undefined
        }
      />

      {focusEditItem ? (
        <ItemEditModal
          item={focusEditItem}
          onClose={() => setFocusEditItem(null)}
          onSave={async (patch) => {
            await editItem(focusEditItem, patch);
            setFocusEditItem(null);
          }}
        />
      ) : null}

      {!showTaskLists ? (
        <TagWheelPicker
          visible={Boolean(tagPickerItem)}
          itemTitle={tagPickerItem?.title ?? ""}
          selectedTags={tagDraft}
          userTags={userTags}
          onToggleTag={handleToggleTag}
          onCreateTag={handleCreateTag}
          onClose={handleCloseTagPicker}
        />
      ) : null}

      {showTaskLists && taskLists.enabled ? (
        <TaskListsModal
          mode={taskListsMode}
          boardTasks={boardTasksForLists}
          lists={taskLists.lists}
          userTags={userTags}
          availableTags={filterTags}
          loading={taskLists.loading}
          onClose={() => setShowTaskLists(false)}
          onCreate={async (filterTags, name, boardTasks) => {
            await taskLists.createFromTags(filterTags, name, boardTasks);
          }}
          onRename={taskLists.renameList}
          onRefreshTags={taskLists.refreshListTags}
          onArchive={taskLists.archiveList}
          onRestore={taskLists.restoreList}
          onDelete={taskLists.deleteList}
          onRefreshListItems={async (listId) => {
            const list = taskLists.lists.find((entry) => entry._id === listId);
            await taskLists.refreshListItems(
              listId,
              boardTasksForLists,
              list?.filterTags ?? [],
            );
          }}
          onEditItem={(item, patch) => editItem(item, patch)}
          onCompleteItem={(item) => completeWithUndo(item)}
          onUndoListItem={(item) =>
            undoTaskListItem(item, {
              restoreDeletedItem,
              restoreArchiveItem,
              restoreCompletedTask,
            })
          }
          onSnoozeItem={setSnoozeItem}
          onArchiveItem={(item) => archiveItem(item)}
          onDeleteItem={confirmDelete}
          onToggleType={(item) => toggleActionable(item)}
          onTagPress={openTagPicker}
          onSetListReminder={(listId, due, listName) =>
            void taskLists.setListReminder(listId, due, listName)
          }
          onClearListReminder={(listId) => void taskLists.clearListReminder(listId)}
          tagPickerOpenId={tagPickerItem?.id ?? null}
          snoozeItem={snoozeItem}
          onSnoozeSelect={(item, due, recurrence) => void snoozeTask(item, due, recurrence)}
          onSnoozeClear={(item) => void clearReminder(item)}
          onSnoozeClose={() => setSnoozeItem(null)}
          tagPickerItem={tagPickerItem}
          tagDraft={tagDraft}
          onToggleTag={handleToggleTag}
          onCreateTag={handleCreateTag}
          onCloseTagPicker={handleCloseTagPicker}
        />
      ) : null}

      {undoComplete ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex justify-center px-3">
          <div
            className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg"
            dir="rtl"
          >
            <p className="text-slate-800">
              סומן כבוצע: <strong>{undoComplete.title}</strong>
            </p>
            <button
              type="button"
              className="shrink-0 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
              onClick={() => {
                const item = undoComplete;
                setUndoComplete(null);
                void restoreCompletedTask(item);
              }}
            >
              בטל
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
