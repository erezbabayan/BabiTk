import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArchivePanel } from "./ArchivePanel";
import { ColumnSemanticSearch } from "./ColumnSemanticSearch";
import { ColumnSearch } from "./ColumnSearch";
import { ColumnBoardHeader } from "./ColumnBoardHeader";
import { ColumnDropZone } from "./ColumnDropZone";
import { DraggableItemList, type DropSlot } from "./DraggableItemList";
import { ItemCard, ITEM_DRAG_MIME } from "./ItemCard";
import { SwipeableItemCard } from "./SwipeableItemCard";
import { TagFilter } from "./TagFilter";
import { snoozePresets, useItems } from "../hooks/useItems";
import { useUserTags } from "../hooks/useUserTags";
import { collectTags, filterItemsByQuery, filterItemsByTag } from "../lib/filter-items";
import { boardSwipeActions, inboxSwipeActions } from "../lib/item-swipe-actions";
import { listViewTitle, searchPlaceholder } from "../lib/board-labels";
import type { DashboardColumn } from "../lib/item-columns";
import type { MindtaskerItem } from "../types";
interface DashboardProps {
  userId: string;
  refreshTick?: number;
}

function SnoozeMenu({
  item,
  onSnooze,
  onClose,
}: {
  item: MindtaskerItem;
  onSnooze: (item: MindtaskerItem, due: string) => void;
  onClose: () => void;
}) {
  const presets = snoozePresets();
  const options = [
    { label: "עוד 3 שעות", value: presets.in3Hours },
    { label: "מחר בבוקר", value: presets.tomorrowMorning },
    { label: "שבוע הבא", value: presets.nextWeek },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <p className="mb-3 font-semibold">נודניק — {item.title}</p>
        <div className="space-y-2">
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                onSnooze(item, opt.value);
                onClose();
              }}
              className="w-full border border-slate-200 text-right hover:bg-slate-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-slate-500 hover:bg-slate-50"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

export function Dashboard({ userId, refreshTick = 0 }: DashboardProps) {
  const {
    loading,
    inbox,
    todayTasks,
    notes,
    inboxArchive,
    notesArchive,
    toggleActionable,
    approveInboxItem,
    completeTask,
    snoozeTask,
    restoreArchiveItem,
    archiveItem,
    deleteItem,
    editItem,
    placeItem,
    refresh,
  } = useItems(userId);
  const { tags: userTags } = useUserTags();

  useEffect(() => {
    if (refreshTick > 0) void refresh();
  }, [refreshTick, refresh]);

  const [showArchive, setShowArchive] = useState(false);
  const [showTasksArchive, setShowTasksArchive] = useState(false);
  const [showNotesArchive, setShowNotesArchive] = useState(false);
  const [inboxInput, setInboxInput] = useState("");
  const [inboxQuery, setInboxQuery] = useState("");
  const [inboxTag, setInboxTag] = useState<string | null>(null);
  const [todayInput, setTodayInput] = useState("");
  const [todayQuery, setTodayQuery] = useState("");
  const [todayTag, setTodayTag] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState("");
  const [notesQuery, setNotesQuery] = useState("");
  const [notesTag, setNotesTag] = useState<string | null>(null);
  const [snoozeItem, setSnoozeItem] = useState<MindtaskerItem | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DashboardColumn | null>(null);
  const [dropSlot, setDropSlot] = useState<DropSlot | null>(null);
  const draggingIdRef = useRef<string | null>(null);

  const filteredInbox = useMemo(
    () => filterItemsByTag(filterItemsByQuery(inbox, inboxQuery), inboxTag),
    [inbox, inboxQuery, inboxTag],
  );
  const filteredInboxArchive = useMemo(
    () => filterItemsByTag(filterItemsByQuery(inboxArchive, inboxQuery), inboxTag),
    [inboxArchive, inboxQuery, inboxTag],
  );
  const filteredTodayTasks = useMemo(
    () => filterItemsByTag(filterItemsByQuery(todayTasks, todayQuery), todayTag),
    [todayTasks, todayQuery, todayTag],
  );
  const filteredTasksArchive = useMemo(
    () => filterItemsByTag(filterItemsByQuery(inboxArchive, todayQuery), todayTag),
    [inboxArchive, todayQuery, todayTag],
  );
  const filteredNotes = useMemo(
    () => filterItemsByTag(filterItemsByQuery(notes, notesQuery), notesTag),
    [notes, notesQuery, notesTag],
  );
  const filteredNotesArchive = useMemo(
    () => filterItemsByTag(filterItemsByQuery(notesArchive, notesQuery), notesTag),
    [notesArchive, notesQuery, notesTag],
  );

  const inboxTags = useMemo(
    () => collectTags(showArchive ? inboxArchive : inbox),
    [showArchive, inboxArchive, inbox],
  );
  const todayTags = useMemo(() => {
    const source = showTasksArchive ? inboxArchive : todayTasks;
    return collectTags(source);
  }, [showTasksArchive, inboxArchive, todayTasks]);
  const notesTags = useMemo(
    () => collectTags(showNotesArchive ? notesArchive : notes),
    [showNotesArchive, notesArchive, notes],
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

  const inboxReorderDisabled = Boolean(inboxQuery.trim() || inboxTag);
  const todayReorderDisabled = Boolean(todayQuery.trim() || todayTag);
  const notesReorderDisabled = Boolean(notesQuery.trim() || notesTag);

  function clearDragState() {
    setDraggingId(null);
    setDropTarget(null);
    setDropSlot(null);
  }

  function bindDrag(item: MindtaskerItem) {
    return {
      draggable: true as const,
      isDragging: draggingId === item.id,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.setData(ITEM_DRAG_MIME, item.id);
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        if (e.currentTarget instanceof HTMLElement) {
          e.dataTransfer.setDragImage(
            e.currentTarget,
            e.currentTarget.offsetWidth / 2,
            20,
          );
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

  function renderInboxItem(itemId: string) {
    const item = inboxById.get(itemId);
    if (!item) return null;
    const swipe = inboxSwipeActions(
      () => void approveInboxItem(item),
      () => confirmDelete(item),
    );
    return (
      <SwipeableItemCard leftAction={swipe.left} rightAction={swipe.right}>
        <ItemCard
          item={item}
          userTags={userTags}
          {...bindDrag(item)}
          onEdit={(patch) => void editItem(item, patch)}
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
    );
    return (
      <SwipeableItemCard leftAction={swipe.left} rightAction={swipe.right}>
        <ItemCard
          item={item}
          userTags={userTags}
          {...bindDrag(item)}
          onEdit={(patch) => void editItem(item, patch)}
          onToggleType={() => void toggleActionable(item)}
          onComplete={() => void completeTask(item)}
          onSnooze={() => setSnoozeItem(item)}
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
    );
    return (
      <SwipeableItemCard leftAction={swipe.left} rightAction={swipe.right}>
        <ItemCard
          item={item}
          compact
          userTags={userTags}
          {...bindDrag(item)}
          onEdit={(patch) => void editItem(item, patch)}
          onToggleType={() => void toggleActionable(item)}
        />
      </SwipeableItemCard>
    );
  }

  function confirmDelete(item: MindtaskerItem) {
    if (window.confirm(`למחוק את «${item.title}»?`)) {
      void deleteItem(item);
    }
  }

  if (loading) {
    return <p className="p-8 text-center text-slate-500">טוען...</p>;
  }

  const dragging = draggingId !== null;

  return (
    <>
      <div className="grid min-h-[calc(100vh-44px)] w-full grid-cols-1 gap-2 p-2 lg:grid-cols-3 lg:gap-3 lg:p-3">
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 border-t-[3px] border-t-slate-200 bg-white p-2 ring-1 ring-slate-200/70 lg:min-h-[calc(100vh-56px)]">
          {showArchive ? (
            <ColumnBoardHeader
              title={listViewTitle("inbox", "archive")}
              titleClassName="text-slate-900"
              borderClassName="border-slate-200"
              markTone="white"
              search={
                <ColumnSearch
                  inline
                  value={inboxInput}
                  onChange={setInboxInput}
                  activeQuery={inboxQuery}
                  onSearch={() => setInboxQuery(inboxInput.trim())}
                  onClear={() => {
                    setInboxInput("");
                    setInboxQuery("");
                  }}
                  placeholder={searchPlaceholder("inbox", "archive")}
                  tone="slate"
                />
              }
              action={
                <button
                  type="button"
                  onClick={() => setShowArchive(false)}
                  className="shrink-0 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  חזור
                </button>
              }
            />
          ) : (
            <ColumnSemanticSearch
              scope="inbox"
              input={inboxInput}
              onInputChange={setInboxInput}
              activeQuery={inboxQuery}
              onSearch={() => setInboxQuery(inboxInput.trim())}
              onClear={() => {
                setInboxInput("");
                setInboxQuery("");
              }}
              placeholder={searchPlaceholder("inbox", "active")}
              tone="slate"
            >
              {(searchBar, aiButton, footer) => (
                <ColumnBoardHeader
                  title={listViewTitle("inbox", "active")}
                  titleClassName="text-slate-900"
                  borderClassName="border-slate-200"
                  markTone="white"
                  search={searchBar}
                  aiAction={aiButton}
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setShowArchive(true);
                        setShowNotesArchive(false);
                      }}
                      className="shrink-0 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      {`ארכיון (${inboxArchive.length})`}
                    </button>
                  }
                >
                  {footer}
                </ColumnBoardHeader>
              )}
            </ColumnSemanticSearch>
          )}
          <TagFilter
            tags={inboxTags}
            selected={inboxTag}
            onSelect={setInboxTag}
            userTags={userTags}
          />
          <ColumnDropZone
            column="inbox"
            active={dropTarget === "inbox" && dragging && !showArchive}
            dragging={dragging && !showArchive}
            onActivate={setDropTarget}
            onDeactivate={() => setDropTarget(null)}
            onDrop={handleColumnDrop}
            className="flex min-h-0 flex-1 flex-col"
          >
            {showArchive ? (
              <ArchivePanel
                variant="inbox"
                items={filteredInboxArchive}
                onRestore={(item) => void restoreArchiveItem(item)}
                onDelete={confirmDelete}
                onEdit={(item, patch) => void editItem(item, patch)}
              />
            ) : (
              <DraggableItemList
                column="inbox"
                items={filteredInbox}
                draggingId={draggingId}
                dropSlot={dropSlot}
                disabled={inboxReorderDisabled}
                className="flex-1 overflow-y-auto"
                emptyMessage={
                  <p className="text-sm text-slate-400">
                    {inboxQuery.trim() || inboxTag
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
            )}
          </ColumnDropZone>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border-t-[3px] border-t-blue-500 bg-blue-50/50 p-2 ring-1 ring-blue-200/80 lg:min-h-[calc(100vh-56px)]">
          <ColumnSemanticSearch
            scope="today"
            input={todayInput}
            onInputChange={setTodayInput}
            activeQuery={todayQuery}
            onSearch={() => setTodayQuery(todayInput.trim())}
            onClear={() => {
              setTodayInput("");
              setTodayQuery("");
            }}
            placeholder={searchPlaceholder("today", showTasksArchive ? "archive" : "active")}
            tone="blue"
          >
            {(searchBar, aiButton, footer) => (
              <ColumnBoardHeader
                title={listViewTitle("today", showTasksArchive ? "archive" : "active")}
                titleClassName="text-blue-800"
                borderClassName="border-blue-100"
                markTone="blue"
                search={searchBar}
                aiAction={aiButton}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      if (showTasksArchive) {
                        setShowTasksArchive(false);
                      } else {
                        setShowTasksArchive(true);
                        setShowArchive(false);
                        setShowNotesArchive(false);
                      }
                    }}
                    className="shrink-0 border border-blue-200 bg-white/60 text-blue-700 hover:bg-blue-100/60"
                  >
                    {showTasksArchive ? "חזור" : `ארכיון (${inboxArchive.length})`}
                  </button>
                }
              >
                {footer}
              </ColumnBoardHeader>
            )}
          </ColumnSemanticSearch>
          <TagFilter
            tags={todayTags}
            selected={todayTag}
            onSelect={setTodayTag}
            userTags={userTags}
          />
          <ColumnDropZone
            column="today"
            active={dropTarget === "today" && dragging && !showTasksArchive}
            dragging={dragging && !showTasksArchive}
            onActivate={setDropTarget}
            onDeactivate={() => setDropTarget(null)}
            onDrop={handleColumnDrop}
            className="flex min-h-0 flex-1 flex-col"
          >
            {showTasksArchive ? (
              <ArchivePanel
                items={filteredTasksArchive}
                variant="inbox"
                onRestore={(item) => void restoreArchiveItem(item)}
                onDelete={confirmDelete}
                onEdit={(item, patch) => void editItem(item, patch)}
              />
            ) : (
              <DraggableItemList
                column="today"
                items={filteredTodayTasks}
                draggingId={draggingId}
                dropSlot={dropSlot}
                disabled={todayReorderDisabled}
                className="flex-1 overflow-y-auto"
                emptyMessage={
                  <p className="text-sm text-blue-400/80">
                    {todayQuery.trim() || todayTag
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
            )}
          </ColumnDropZone>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border-t-[3px] border-t-orange-500 bg-orange-50/50 p-2 ring-1 ring-orange-200/80 lg:min-h-[calc(100vh-56px)]">
          {showNotesArchive ? (
            <ColumnBoardHeader
              title={listViewTitle("notes", "archive")}
              titleClassName="text-orange-800"
              borderClassName="border-orange-100"
              markTone="orange"
              search={
                <ColumnSearch
                  inline
                  value={notesInput}
                  onChange={setNotesInput}
                  activeQuery={notesQuery}
                  onSearch={() => setNotesQuery(notesInput.trim())}
                  onClear={() => {
                    setNotesInput("");
                    setNotesQuery("");
                  }}
                  placeholder={searchPlaceholder("notes", "archive")}
                  tone="orange"
                />
              }
              action={
                <button
                  type="button"
                  onClick={() => setShowNotesArchive(false)}
                  className="shrink-0 border border-orange-200 bg-white/60 text-orange-700 hover:bg-orange-100/60"
                >
                  חזור
                </button>
              }
            />
          ) : (
            <ColumnSemanticSearch
              scope="notes"
              input={notesInput}
              onInputChange={setNotesInput}
              activeQuery={notesQuery}
              onSearch={() => setNotesQuery(notesInput.trim())}
              onClear={() => {
                setNotesInput("");
                setNotesQuery("");
              }}
              placeholder={searchPlaceholder("notes", "active")}
              tone="orange"
            >
              {(searchBar, aiButton, footer) => (
                <ColumnBoardHeader
                  title={listViewTitle("notes", "active")}
                  titleClassName="text-orange-800"
                  borderClassName="border-orange-100"
                  markTone="orange"
                  search={searchBar}
                  aiAction={aiButton}
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotesArchive(true);
                        setShowArchive(false);
                      }}
                      className="shrink-0 border border-orange-200 bg-white/60 text-orange-700 hover:bg-orange-100/60"
                    >
                      {`ארכיון (${notesArchive.length})`}
                    </button>
                  }
                >
                  {footer}
                </ColumnBoardHeader>
              )}
            </ColumnSemanticSearch>
          )}
          <TagFilter
            tags={notesTags}
            selected={notesTag}
            onSelect={setNotesTag}
            userTags={userTags}
          />
          <ColumnDropZone
            column="notes"
            active={dropTarget === "notes" && dragging && !showNotesArchive}
            dragging={dragging && !showNotesArchive}
            onActivate={setDropTarget}
            onDeactivate={() => setDropTarget(null)}
            onDrop={handleColumnDrop}
            className="flex min-h-0 flex-1 flex-col"
          >
            {showNotesArchive ? (
              <ArchivePanel
                variant="notes"
                items={filteredNotesArchive}
                onRestore={(item) => void restoreArchiveItem(item)}
                onDelete={confirmDelete}
                onEdit={(item, patch) => void editItem(item, patch)}
              />
            ) : (
              <>
                {dragging && filteredNotes.length === 0 && !notesQuery.trim() && !notesTag ? (
                  <p className="mb-2 text-sm text-orange-500">שחרר כאן להעברת הערה</p>
                ) : null}
                <DraggableItemList
                  column="notes"
                  items={filteredNotes}
                  draggingId={draggingId}
                  dropSlot={dropSlot}
                  disabled={notesReorderDisabled}
                  className="flex-1 overflow-y-auto"
                  emptyMessage={
                    <p className="text-sm text-orange-400/80">
                      {notesQuery.trim() || notesTag ? "אין תוצאות לסינון" : "אין הערות שמורות"}
                    </p>
                  }
                  onDragStart={() => {}}
                  onDragEnd={clearDragState}
                  onDropSlotChange={setDropSlot}
                  onDrop={(slot) => handlePlaceDrop(slot.column, slot.beforeId)}
                  renderItem={renderNoteItem}
                />
              </>
            )}
          </ColumnDropZone>
        </section>
      </div>

      {snoozeItem ? (
        <SnoozeMenu
          item={snoozeItem}
          onSnooze={(item, due) => void snoozeTask(item, due)}
          onClose={() => setSnoozeItem(null)}
        />
      ) : null}
    </>
  );
}
