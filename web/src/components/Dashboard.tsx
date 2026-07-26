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
import { TodayFilter } from "./TodayFilter";
import { TagWheelPicker } from "./TagWheelPicker";
import { TaskListsModal, type TaskListsModalMode } from "./TaskListsModal";
import { ListBoardIcon } from "./ListBoardIcon";
import { ReminderPicker } from "./ReminderPicker";
import { NotebookBoardSection } from "./NotebookBoardSection";
import { useItems } from "../hooks/useItems";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useTaskLists } from "../hooks/useTaskLists";
import { useUserTags } from "../hooks/useUserTags";
import { deleteItemConfirmMessage } from "../lib/confirm-copy";
import { applyBoardItemFilters } from "../lib/filter-items";
import { isPriorityItem } from "../lib/item-priority";
import { mergeSearchResults } from "../lib/unified-search";
import { undoTaskListItem } from "../lib/task-list-actions";
import { useBoardSearch } from "../hooks/useBoardSearch";
import { useBoardFilterTags } from "../hooks/useBoardFilterTags";
import { useTagCascadeSync } from "../hooks/useTagCascadeSync";
import { boardTasksForListSync } from "../lib/task-list-items";
import { boardSwipeActions, inboxSwipeActions } from "../lib/item-swipe-actions";
import { applyBoardDateSort, type BoardDateSortDirection } from "../lib/board-date-sort";
import { boardToolbarButtonClass, boardToolbarIconButtonClass } from "../lib/board-toolbar";
import { listViewTitle, searchPlaceholder, type BoardTab } from "../lib/board-labels";
import { BoardDateSortButton } from "./BoardDateSortButton";
import { BoardMobileTabs } from "./BoardMobileTabs";
import { MAX_ITEM_TAGS, alignItemTagsWithDefinitions } from "../lib/tags";
import type { DashboardColumn } from "../lib/item-columns";
import { useIsDesktopBoard } from "../hooks/useMediaQuery";
import { useBoardItemViewOptional } from "../providers/BoardItemViewProvider";
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
    restoreArchiveItem,
    archiveItem,
    completeTask,
    deleteItem,
    restoreDeletedItem,
    restoreCompletedTask,
    editItem,
    updateTags,
    togglePriority,
    placeItem,
    refresh,
  } = useItems(userId, undefined, {
    inboxArchive: showArchive || showTasksArchive || showTaskLists,
    notesArchive: showNotesArchive,
    completed: showCompletedTasks || showTaskLists,
  });
  const { tags: userTags, addTag } = useUserTags();
  const taskLists = useTaskLists(convexUserId);
  useTagCascadeSync(convexUserId);
  const { requestConfirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    if (refreshTick > 0) void refresh();
  }, [refreshTick, refresh]);

  const [taskListsMode, setTaskListsMode] = useState<TaskListsModalMode>("create");
  const [mobileTab, setMobileTab] = useState<BoardTab>("inbox");
  const [boardTag, setBoardTag] = useState<string | null>(null);
  const [boardPriorityOnly, setBoardPriorityOnly] = useState(false);
  const [boardTodayOnly, setBoardTodayOnly] = useState(false);
  const inboxSearch = useBoardSearch("inbox");
  const todaySearch = useBoardSearch("today");
  const notesSearch = useBoardSearch("notes");
  const [inboxDateSort, setInboxDateSort] = useState<BoardDateSortDirection>("desc");
  const [todayDateSort, setTodayDateSort] = useState<BoardDateSortDirection>("asc");
  const [notesDateSort, setNotesDateSort] = useState<BoardDateSortDirection>("desc");
  const [snoozeItem, setSnoozeItem] = useState<MindtaskerItem | null>(null);
  const [tagPickerItem, setTagPickerItem] = useState<MindtaskerItem | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DashboardColumn | null>(null);
  const [dropSlot, setDropSlot] = useState<DropSlot | null>(null);
  const draggingIdRef = useRef<string | null>(null);

  const filteredInbox = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(inbox, inboxSearch.activeQuery, inboxSearch.semanticHits),
          boardTag,
          boardPriorityOnly,
        ),
        inboxDateSort,
      ),
    [inbox, inboxSearch.activeQuery, inboxSearch.semanticHits, boardTag, boardPriorityOnly, inboxDateSort],
  );
  const filteredInboxArchive = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(inboxArchive, inboxSearch.activeQuery, inboxSearch.semanticHits),
          boardTag,
          boardPriorityOnly,
        ),
        inboxDateSort,
      ),
    [inboxArchive, inboxSearch.activeQuery, inboxSearch.semanticHits, boardTag, boardPriorityOnly, inboxDateSort],
  );
  const filteredTodayTasks = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(todayTasks, todaySearch.activeQuery, todaySearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardTodayOnly,
        ),
        todayDateSort,
      ),
    [
      todayTasks,
      todaySearch.activeQuery,
      todaySearch.semanticHits,
      boardTag,
      boardPriorityOnly,
      boardTodayOnly,
      todayDateSort,
    ],
  );
  const filteredTasksArchive = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(inboxArchive, todaySearch.activeQuery, todaySearch.semanticHits),
          boardTag,
          boardPriorityOnly,
          boardTodayOnly,
        ),
        todayDateSort,
      ),
    [
      inboxArchive,
      todaySearch.activeQuery,
      todaySearch.semanticHits,
      boardTag,
      boardPriorityOnly,
      boardTodayOnly,
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
        ),
        notesDateSort,
      ),
    [notes, notesSearch.activeQuery, notesSearch.semanticHits, boardTag, boardPriorityOnly, notesDateSort],
  );
  const filteredNotesArchive = useMemo(
    () =>
      applyBoardDateSort(
        applyBoardItemFilters(
          mergeSearchResults(notesArchive, notesSearch.activeQuery, notesSearch.semanticHits),
          boardTag,
          boardPriorityOnly,
        ),
        notesDateSort,
      ),
    [notesArchive, notesSearch.activeQuery, notesSearch.semanticHits, boardTag, boardPriorityOnly, notesDateSort],
  );

  const filterTags = useBoardFilterTags();

  function renderBoardFilters(options?: { showToday?: boolean }) {
    return (
      <div className="board-notebook-chrome flex gap-2">
        {options?.showToday ? (
          <TodayFilter active={boardTodayOnly} onToggle={setBoardTodayOnly} />
        ) : null}
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

  const inboxReorderDisabled = Boolean(
    inboxSearch.activeQuery.trim() || boardTag || boardPriorityOnly || inboxDateSort,
  );
  const todayReorderDisabled = Boolean(
    todaySearch.activeQuery.trim() || boardTag || boardPriorityOnly || todayDateSort,
  );
  const notesReorderDisabled = Boolean(
    notesSearch.activeQuery.trim() || boardTag || boardPriorityOnly || notesDateSort,
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
    setBoardTodayOnly(false);
    setInboxDateSort(null);
    setTodayDateSort(null);
    setNotesDateSort(null);
    inboxSearch.clear();
    todaySearch.clear();
    notesSearch.clear();
    setSnoozeItem(null);
    setTagPickerItem(null);
    setTagDraft([]);
    clearDragState();
    scrollAllBoardColumnsToTop();
  }, [inboxSearch.clear, todaySearch.clear, notesSearch.clear]);

  useEffect(() => {
    if (homeResetTick < 1) return;
    resetHomeView();
  }, [homeResetTick, resetHomeView]);

  function bindDrag(item: MindtaskerItem) {
    if (!isDesktop) {
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
        draggingIdRef.current = item.id;
        setDraggingId(item.id);
      },
      onDragEnd: () => {
        clearDragState();
        window.setTimeout(() => {
          draggingIdRef.current = null;
        }, 0);
      },
    };
  }

  function handlePlaceDrop(column: DashboardColumn, beforeId: string | null) {
    const id = draggingIdRef.current ?? draggingId;
    draggingIdRef.current = null;
    clearDragState();
    if (!id) return;
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
    };
  }

  function renderInboxItem(itemId: string) {
    const item = inboxById.get(itemId);
    if (!item) return null;
    const swipe = inboxSwipeActions(
      item,
      () => void approveInboxItem(item),
      () => confirmDelete(item),
    );
    return (
      <SwipeableItemCard leftAction={swipe.left} rightAction={swipe.right} squares={swipeSquares}>
        <ItemCard
          item={item}
          boardAccent="inbox"
          userTags={userTags}
          {...bindDrag(item)}
          {...bindItemChrome(item)}
          onEdit={(patch) => editItem(item, patch)}
          onToggleType={() => void toggleActionable(item)}
        />
      </SwipeableItemCard>
    );
  }

  function renderTodayItem(itemId: string) {
    const item = todayById.get(itemId);
    if (!item) return null;
    const swipe = boardSwipeActions(
      () => void archiveItem(item),
      () => confirmDelete(item),
      "tasks",
    );
    return (
      <SwipeableItemCard leftAction={swipe.left} rightAction={swipe.right} squares={swipeSquares}>
        <ItemCard
          item={item}
          boardAccent="today"
          userTags={userTags}
          {...bindDrag(item)}
          {...bindItemChrome(item)}
          onEdit={(patch) => editItem(item, patch)}
          onToggleType={() => void toggleActionable(item)}
          onSnooze={() => setSnoozeItem(item)}
          onComplete={item.is_actionable ? () => void completeTask(item) : undefined}
        />
      </SwipeableItemCard>
    );
  }

  function renderNoteItem(itemId: string) {
    const item = notesById.get(itemId);
    if (!item) return null;
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
      >
        <ItemCard
          item={item}
          boardAccent="notes"
          compact
          userTags={userTags}
          {...bindDrag(item)}
          {...bindItemChrome(item)}
          onEdit={(patch) => editItem(item, patch)}
          onToggleType={() => void toggleActionable(item)}
          onSnooze={() => setSnoozeItem(item)}
          onComplete={item.is_actionable ? () => void completeTask(item) : undefined}
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
                action={
                  <button
                    type="button"
                    onClick={() => setShowArchive(false)}
                    className={boardToolbarButtonClass("slate")}
                  >
                    חזור
                  </button>
                }
              />
              {renderBoardFilters()}
              {inboxSearch.error ? (
                <p className="mb-1 text-[11px] text-red-600">{inboxSearch.error}</p>
              ) : null}
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
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setShowArchive(true);
                      setShowNotesArchive(false);
                    }}
                    className={boardToolbarButtonClass("slate")}
                  >
                    {`ארכיון (${inboxArchive.length})`}
                  </button>
                }
              />
              {renderBoardFilters()}
              {inboxSearch.error ? (
                <p className="mb-1 text-[11px] text-red-600">{inboxSearch.error}</p>
              ) : null}
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
                    disabled={inboxReorderDisabled}
                    emptyMessage={
                      <p className="text-sm text-slate-400">
                        {inboxSearch.activeQuery.trim() || boardTag
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
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTaskListsMode("existing");
                        setShowTaskLists(true);
                      }}
                      className={boardToolbarButtonClass("blue")}
                    >
                      רשימות קיימות ({activeTaskListsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskListsMode("create");
                        setShowTaskLists(true);
                      }}
                      className={`${boardToolbarIconButtonClass("blue")} hover:bg-blue-100/70`}
                      title="הרשימה"
                      aria-label="הרשימה"
                    >
                      <ListBoardIcon className="h-4 w-4" />
                    </button>
                  </div>
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
                todayListView === "active" && completedTasks.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowCompletedTasks(true);
                      setShowTasksArchive(false);
                    }}
                    className={boardToolbarButtonClass("blue")}
                  >
                    הושלמו ({completedTasks.length})
                  </button>
                ) : null
              }
              action={
                showCompletedTasks ? (
                  <button
                    type="button"
                    onClick={() => setShowCompletedTasks(false)}
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
                      } else {
                        setShowTasksArchive(true);
                        setShowArchive(false);
                        setShowNotesArchive(false);
                        setShowCompletedTasks(false);
                      }
                    }}
                    className={boardToolbarButtonClass("blue")}
                  >
                    {showTasksArchive ? "חזור" : `ארכיון (${inboxArchive.length})`}
                  </button>
                )
              }
            />
            {renderBoardFilters({ showToday: true })}
            {todaySearch.error ? (
              <p className="mb-1 text-[11px] text-red-600">{todaySearch.error}</p>
            ) : null}
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
                  />
                </MouseDragScroll>
              ) : showCompletedTasks ? (
                <MouseDragScroll>
                  <CompletedPanel
                    items={completedTasks}
                    onRestore={(item) => void restoreCompletedTask(item)}
                    onDelete={confirmDelete}
                    onEdit={(item, patch) => editItem(item, patch)}
                  />
                </MouseDragScroll>
              ) : (
                <MouseDragScroll>
                  <DraggableItemList
                    column="today"
                    items={filteredTodayTasks}
                    draggingId={draggingId}
                    dropSlot={dropSlot}
                    disabled={todayReorderDisabled}
                    emptyMessage={
                      <p className="text-sm text-blue-400/80">
                        {todaySearch.activeQuery.trim() || boardTag || boardPriorityOnly || boardTodayOnly
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
                action={
                  <button
                    type="button"
                    onClick={() => setShowNotesArchive(false)}
                    className={boardToolbarButtonClass("orange")}
                  >
                    חזור
                  </button>
                }
              />
              {renderBoardFilters()}
              {notesSearch.error ? (
                <p className="mb-1 text-[11px] text-red-600">{notesSearch.error}</p>
              ) : null}
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
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotesArchive(true);
                      setShowArchive(false);
                    }}
                    className={boardToolbarButtonClass("orange")}
                  >
                    {`ארכיון (${notesArchive.length})`}
                  </button>
                }
              />
              {renderBoardFilters()}
              {notesSearch.error ? (
                <p className="mb-1 text-[11px] text-red-600">{notesSearch.error}</p>
              ) : null}
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
                  {dragging && filteredNotes.length === 0 && !notesSearch.activeQuery.trim() && !boardTag ? (
                    <p className="mb-2 text-sm text-orange-500">שחרר כאן להעברת הערה</p>
                  ) : null}
                  <DraggableItemList
                    column="notes"
                    items={filteredNotes}
                    draggingId={draggingId}
                    dropSlot={dropSlot}
                    disabled={notesReorderDisabled}
                    emptyMessage={
                      <p className="text-sm text-orange-400/80">
                        {notesSearch.activeQuery.trim() || boardTag
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
          onCompleteItem={(item) => completeTask(item)}
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
    </>
  );
}
