import "react-native-gesture-handler";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
} from "@expo-google-fonts/rubik";
import { SecularOne_400Regular } from "@expo-google-fonts/secular-one";
import { Solitreo_400Regular } from "@expo-google-fonts/solitreo";
import { useFonts } from "expo-font";
import { SnoozeSheet } from "./src/components/ActionSheets";
import { ColumnSearchBar } from "./src/components/ColumnSearchBar";
import { ItemEditModal } from "./src/components/ItemEditModal";
import { QuickCaptureBar } from "./src/components/QuickCaptureBar";
import { SettingsScreen } from "./src/components/SettingsScreen";
import { LoginScreen } from "./src/components/LoginScreen";
import { BoardBrushMark, MindTaskerLogo, type BoardMarkTone } from "./src/components/MindTaskerLogo";
import { TagFilterBar } from "./src/components/TagFilterBar";
import { PriorityFilterBar } from "./src/components/PriorityFilterBar";
import { TagWheelPicker } from "./src/components/TagWheelPicker";
import { TaskListsModal, type TaskListsModalMode } from "./src/components/TaskListsModal";
import { ListBoardIcon } from "./src/components/ListBoardIcon";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { SourceModal } from "./src/components/SourceModal";
import { SwipeableItem } from "./src/components/SwipeableItem";
import { BoardDateSortButton } from "./src/components/BoardDateSortButton";
import { BoardViewToggle } from "./src/components/BoardViewToggle";
import { buildMobileSwipeActions } from "./src/lib/item-swipe-actions";
import {
  readBoardItemView,
  toggleBoardItemView,
  writeBoardItemView,
  type BoardItemView,
} from "./src/lib/board-item-view";
import { UndoToast } from "./src/components/UndoToast";
import { PaywallModal } from "./src/components/PaywallModal";
import { useUsage } from "./src/hooks/useUsage";
import { useUserTags } from "./src/hooks/useUserTags";
import { registerPaywallHandler } from "./src/lib/api";
import { useBoardSearch } from "./src/hooks/useBoardSearch";
import { useAuth } from "./src/hooks/useAuth";
import { isDemoMode, isSupabaseConfigured } from "./src/lib/supabase";
import { BOARD_TAB_LABELS, listViewTitle, emptyListMessage, searchPlaceholder } from "./src/lib/item-actions";
import { boardToolbarBtn, boardToolbarText } from "./src/lib/board-toolbar";
import { applyBoardItemFilters } from "./src/lib/filter-items";
import { isPriorityItem } from "./src/lib/item-priority";
import { mergeSearchResults } from "./src/lib/unified-search";
import { boardTasksForListSync } from "./src/lib/task-list-items";
import { useBoardFilterTags } from "./src/hooks/useBoardFilterTags";
import { useTagCascadeSync } from "./src/hooks/useTagCascadeSync";
import { applyBoardDateSort, type BoardDateSortDirection } from "./src/lib/board-date-sort";
import { isSyncEnabled } from "./src/lib/sync-client";
import { resyncAllItemsToConvex } from "./src/lib/convex-mirror";
import { useDemoHybridSync } from "./src/lib/data-backend";
import { useBoardItems } from "./src/hooks/useBoardItems";
import { useTaskLists } from "./src/hooks/useTaskLists";
import { BOARD_TAB_FONT, BOARD_TITLE_FONT } from "./src/lib/board-font";
import { ConvexAppProvider } from "./src/providers/ConvexAppProvider";
import { ConvexAuthGate } from "./src/providers/ConvexAuthGate";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { UserTagsProvider } from "./src/providers/UserTagsProvider";
import { shouldUseConvexAuthLogin } from "./src/lib/auth-mode";
import type { MindtaskerItem } from "./src/lib/supabase";
import { MAX_ITEM_TAGS, alignItemTagsWithDefinitions } from "./src/lib/tags";

type Tab = "inbox" | "today" | "notes";
type ListView = "active" | "archive" | "completed";

function MainApp({
  onSignOut,
  userId,
  userEmail,
}: {
  onSignOut: () => void;
  userId: string;
  userEmail?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("inbox");
  const [listView, setListView] = useState<ListView>("active");
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [boardItemView, setBoardItemView] = useState<BoardItemView>("list");
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [paywallCode, setPaywallCode] = useState<"audio_quota" | "ai_parse_quota" | null>(null);
  const { summary, refresh: refreshUsage } = useUsage(true);
  const { tags: userTags, addTag } = useUserTags();
  const board = useBoardItems(userId, userEmail ?? undefined);
  const demoHybrid = useDemoHybridSync();
  const taskLists = useTaskLists(board.convexUserId);
  useTagCascadeSync(board.convexUserId);

  const [snoozeItem, setSnoozeItem] = useState<MindtaskerItem | null>(null);
  const [sourceItem, setSourceItem] = useState<MindtaskerItem | null>(null);
  const [editItem, setEditItem] = useState<MindtaskerItem | null>(null);
  const [showTaskLists, setShowTaskLists] = useState(false);
  const [taskListsMode, setTaskListsMode] = useState<TaskListsModalMode>("create");
  const [tagPickerItem, setTagPickerItem] = useState<MindtaskerItem | null>(null);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [deletedItem, setDeletedItem] = useState<MindtaskerItem | null>(null);
  const inboxSearch = useBoardSearch("inbox");
  const todaySearch = useBoardSearch("today");
  const notesSearch = useBoardSearch("notes");
  const boardSearch =
    tab === "inbox" ? inboxSearch : tab === "today" ? todaySearch : notesSearch;
  const clearInboxSearch = inboxSearch.clear;
  const clearTodaySearch = todaySearch.clear;
  const clearNotesSearch = notesSearch.clear;
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [dateSortByTab, setDateSortByTab] = useState<Record<Tab, BoardDateSortDirection>>({
    inbox: null,
    today: null,
    notes: null,
  });
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterTags = useBoardFilterTags();

  useEffect(() => {
    let cancelled = false;
    void readBoardItemView().then((view) => {
      if (!cancelled) setBoardItemView(view);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleBoardView = useCallback(() => {
    setBoardItemView((current) => {
      const next = toggleBoardItemView(current);
      void writeBoardItemView(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (selectedTag && !filterTags.includes(selectedTag)) {
      setSelectedTag(null);
    }
  }, [selectedTag, filterTags]);

  const boardTasksForLists = useMemo(
    () =>
      boardTasksForListSync({
        todayTasks: board.todayTasks,
        completedTasks: board.completedTasks,
      }),
    [board.todayTasks, board.completedTasks],
  );

  const rawItems = useMemo(() => {
    if (listView === "archive") {
      return tab === "notes" ? board.notesArchive : board.inboxArchive;
    }
    if (listView === "completed") {
      return board.completedTasks;
    }
    if (tab === "inbox") {
      return board.inbox;
    }
    if (tab === "today") {
      return board.todayTasks;
    }
    return board.notes;
  }, [tab, listView, board]);

  const displayItems = useMemo(() => {
    const merged = mergeSearchResults(rawItems, boardSearch.activeQuery, boardSearch.semanticHits);
    const filtered = applyBoardItemFilters(merged, selectedTag, priorityOnly);
    return applyBoardDateSort(filtered, dateSortByTab[tab]);
  }, [rawItems, boardSearch.activeQuery, boardSearch.semanticHits, selectedTag, priorityOnly, dateSortByTab, tab]);

  const boardTone = tab === "inbox" ? "slate" : tab === "today" ? "blue" : "orange";

  useEffect(() => {
    if (!demoHybrid) return;
    void resyncAllItemsToConvex(true);
  }, [demoHybrid]);

  useEffect(() => {
    clearInboxSearch();
    clearTodaySearch();
    clearNotesSearch();
    setListView("active");
  }, [tab, clearInboxSearch, clearTodaySearch, clearNotesSearch]);

  const clearUndoTimer = useCallback(() => {
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }, []);

  const scheduleUndoClear = useCallback(() => {
    clearUndoTimer();
    undoTimer.current = setTimeout(() => setDeletedItem(null), 5000);
  }, [clearUndoTimer]);

  const handleDelete = useCallback(
    async (item: MindtaskerItem) => {
      await board.deleteItem(item);
      setDeletedItem(item);
      scheduleUndoClear();
    },
    [board, scheduleUndoClear],
  );

  const handleUndo = useCallback(async () => {
    if (!deletedItem) return;
    clearUndoTimer();
    await board.restoreDeletedItem(deletedItem);
    setDeletedItem(null);
  }, [deletedItem, board, clearUndoTimer]);

  const persistTagDraft = useCallback(
    async (item: MindtaskerItem) => {
      const aligned = alignItemTagsWithDefinitions(tagDraft, userTags);
      await board.updateTags(item, aligned);
    },
    [tagDraft, userTags, board],
  );

  const openTagPicker = useCallback(
    (item: MindtaskerItem) => {
      if (tagPickerItem?.id === item.id) {
        void persistTagDraft(item).then(() => setTagPickerItem(null));
        return;
      }
      if (tagPickerItem) {
        void persistTagDraft(tagPickerItem);
      }
      setTagPickerItem(item);
      setTagDraft(alignItemTagsWithDefinitions(item.tags ?? [], userTags));
    },
    [tagPickerItem, persistTagDraft, userTags],
  );

  const handleToggleTag = useCallback((tagName: string) => {
    setTagDraft((current) => {
      if (current.includes(tagName)) {
        return current.filter((t) => t !== tagName);
      }
      if (current.length >= MAX_ITEM_TAGS) return current;
      return [...current, tagName];
    });
  }, []);

  const handleCloseTagPicker = useCallback(() => {
    if (tagPickerItem) {
      void persistTagDraft(tagPickerItem).then(() => setTagPickerItem(null));
      return;
    }
    setTagPickerItem(null);
  }, [tagPickerItem, persistTagDraft]);

  const handleCreateTag = useCallback(
    (name: string, color: string) => addTag(name, color),
    [addTag],
  );

  const columnTitle = listViewTitle(tab, listView);
  const boardMarkTone: BoardMarkTone =
    tab === "inbox" ? "slate" : tab === "today" ? "blue" : "orange";

  const archiveCount = tab === "notes" ? board.notesArchive.length : board.inboxArchive.length;

  const activeTaskListsCount = useMemo(
    () => taskLists.lists.filter((list) => list.status === "active").length,
    [taskLists.lists],
  );

  const completedCount = board.completedTasks.length;

  const renderAltViewControls = () => {
    const textStyle = boardToolbarText(
      tab === "inbox" ? "slate" : tab === "today" ? "blue" : "orange",
    );

    if (listView !== "active") {
      return (
        <TouchableOpacity
          style={boardToolbarBtn}
          onPress={() => setListView("active")}
        >
          <Text style={textStyle}>חזור</Text>
        </TouchableOpacity>
      );
    }

    if (tab === "today") {
      return (
        <View style={styles.tabHeaderActionsRow}>
          <TouchableOpacity
            style={boardToolbarBtn}
            onPress={() => setListView("archive")}
          >
            <Text style={textStyle}>ארכיון ({archiveCount})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={boardToolbarBtn}
            onPress={() => setListView("completed")}
          >
            <Text style={textStyle}>בוצעו ({completedCount})</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={boardToolbarBtn}
        onPress={() => setListView("archive")}
      >
        <Text style={textStyle}>ארכיון ({archiveCount})</Text>
      </TouchableOpacity>
    );
  };

  const clearSearch = useCallback(() => {
    boardSearch.clear();
  }, [boardSearch]);

  useEffect(() => () => clearUndoTimer(), [clearUndoTimer]);

  useEffect(() => {
    registerPaywallHandler((code) => {
      setPaywallCode(code);
      setPaywallVisible(true);
      void refreshUsage();
    });
    return () => registerPaywallHandler(null);
  }, [refreshUsage]);

  useEffect(() => {
    function handleBillingUrl(url: string | null) {
      if (!url) return;
      if (url.includes("billing=success")) {
        setBillingNotice("המנוי הופעל בהצלחה!");
        void refreshUsage();
      } else if (url.includes("billing=cancel")) {
        setBillingNotice("התשלום בוטל.");
        void refreshUsage();
      }
    }

    void Linking.getInitialURL().then(handleBillingUrl);
    const sub = Linking.addEventListener("url", (event) => handleBillingUrl(event.url));
    return () => sub.remove();
  }, [refreshUsage]);

  const goHome = useCallback(() => {
    setSettingsVisible(false);
    setPaywallVisible(false);
    setTab("inbox");
    setListView("active");
    setShowTaskLists(false);
    setTaskListsMode("create");
    setSelectedTag(null);
    clearInboxSearch();
    clearTodaySearch();
    clearNotesSearch();
    setSnoozeItem(null);
    setSourceItem(null);
    setEditItem(null);
    setTagPickerItem(null);
    setTagDraft([]);
    setDeletedItem(null);
  }, [clearInboxSearch, clearTodaySearch, clearNotesSearch]);

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={goHome}
          accessibilityRole="button"
          accessibilityLabel="חזרה למסך הראשי"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MindTaskerLogo size="small" />
        </TouchableOpacity>
        <View style={styles.topBarActions}>
          {summary && !summary.isPremium ? (
            <TouchableOpacity
              onPress={() => {
                setPaywallCode(null);
                setPaywallVisible(true);
              }}
            >
              <Text style={styles.usage}>
                AI {summary.aiParses.used}/{summary.aiParses.allocated}
              </Text>
            </TouchableOpacity>
          ) : summary?.isPremium ? (
            <TouchableOpacity
              onPress={() => {
                setPaywallCode(null);
                setPaywallVisible(true);
              }}
            >
              <Text style={styles.premium}>Premium</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onSignOut}>
            <Text style={styles.topBarLink}>התנתק</Text>
          </TouchableOpacity>
          <BoardViewToggle view={boardItemView} onToggle={handleToggleBoardView} />
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Text style={styles.topBarLink}>הגדרות</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.captureBar}>
        {isSyncEnabled() && !board.isSyncing && !board.syncError ? (
          <View style={styles.syncHintWrap}>
            <Text style={styles.syncHint}>מחובר לסנכרון מקומי עם המחשב</Text>
          </View>
        ) : board.syncError ? (
          <View style={styles.syncHintWrap}>
            <Text style={styles.syncErrorHint}>{board.syncError}</Text>
          </View>
        ) : null}

        <QuickCaptureBar
          userId={userId}
          onAddItem={(item) => board.addCapturedItem(item)}
          onAfterCapture={() => void board.refresh()}
        />

        <OfflineBanner
          isOnline={board.isOnline}
          isSyncing={board.isSyncing}
          pendingCount={board.pendingCount}
        />

        {billingNotice ? (
          <Text style={styles.billingNotice}>{billingNotice}</Text>
        ) : null}
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, styles.tabInbox, tab === "inbox" && styles.tabInboxActive]}
          onPress={() => setTab("inbox")}
        >
          <Text
            style={[styles.tabTextInbox, tab === "inbox" && styles.tabTextInboxActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {BOARD_TAB_LABELS.inbox}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, styles.tabToday, tab === "today" && styles.tabTodayActive]}
          onPress={() => setTab("today")}
        >
          <Text
            style={[styles.tabTextToday, tab === "today" && styles.tabTextTodayActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {BOARD_TAB_LABELS.today}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, styles.tabNotes, tab === "notes" && styles.tabNotesActive]}
          onPress={() => setTab("notes")}
        >
          <Text
            style={[styles.tabTextNotes, tab === "notes" && styles.tabTextNotesActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {BOARD_TAB_LABELS.notes}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabHeaderWrap}>
        <View style={styles.tabHeaderTitleRow}>
          <View style={styles.boardTitleBlock}>
            <Text
              style={styles.columnTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
            >
              {columnTitle}
            </Text>
            <BoardBrushMark tone={boardMarkTone} />
          </View>
          {tab === "today" && listView === "active" && taskLists.enabled ? (
            <View style={styles.tabHeaderListActions}>
              <TouchableOpacity
                style={boardToolbarBtn}
                onPress={() => {
                  setTaskListsMode("existing");
                  setShowTaskLists(true);
                }}
              >
                <Text style={boardToolbarText("blue")}>
                  רשימות קיימות ({activeTaskListsCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.listBoardBtn}
                onPress={() => {
                  setTaskListsMode("create");
                  setShowTaskLists(true);
                }}
                accessibilityLabel="הרשימה"
                accessibilityRole="button"
              >
                <ListBoardIcon size={16} color="#2563eb" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={styles.tabHeaderToolbar}>
          <ColumnSearchBar
            inline
            value={boardSearch.input}
            onChange={boardSearch.setInput}
            activeQuery={boardSearch.activeQuery}
            onSearch={() => void boardSearch.search()}
            onClear={clearSearch}
            placeholder={searchPlaceholder(tab, listView)}
            tone={tab === "inbox" ? "slate" : tab === "today" ? "blue" : "orange"}
            loading={boardSearch.loading}
          />
          <BoardDateSortButton
            direction={dateSortByTab[tab]}
            onDirectionChange={(direction) =>
              setDateSortByTab((current) => ({ ...current, [tab]: direction }))
            }
            tone={boardTone}
          />
          <View style={styles.tabHeaderActions}>{renderAltViewControls()}</View>
        </View>
      </View>

      <View
        style={[
          styles.boardFilters,
          tab === "inbox" && styles.boardChromeSlate,
          tab === "today" && styles.boardChromeBlue,
          tab === "notes" && styles.boardChromeOrange,
        ]}
      >
        <View style={styles.boardFilterRow}>
          <PriorityFilterBar active={priorityOnly} onToggle={setPriorityOnly} />
          <TagFilterBar
            tags={filterTags}
            selected={selectedTag}
            onSelect={setSelectedTag}
            userTags={userTags}
          />
        </View>
        {boardSearch.error ? (
          <Text style={styles.searchError}>{boardSearch.error}</Text>
        ) : null}
      </View>

      <View
        style={[
          styles.boardItemsZone,
          tab === "inbox" && styles.boardItemsZoneSlate,
          tab === "today" && styles.boardItemsZoneBlue,
          tab === "notes" && styles.boardItemsZoneOrange,
        ]}
      >
      <FlatList
        key={boardItemView}
        style={styles.boardList}
        data={displayItems}
        keyExtractor={(item) => item.id}
        numColumns={boardItemView === "squares" ? 2 : 1}
        columnWrapperStyle={
          boardItemView === "squares" ? styles.squaresRow : undefined
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={board.isSyncing}
            onRefresh={() => void board.refresh()}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {boardSearch.activeQuery.trim() || selectedTag || priorityOnly
              ? "אין תוצאות לסינון"
              : emptyListMessage(tab, listView)}
          </Text>
        }
        renderItem={({ item }) => {
          const swipe = buildMobileSwipeActions(tab, listView, item, board, () => void handleDelete(item));
          return (
            <View style={boardItemView === "squares" ? styles.squaresCell : undefined}>
              <SwipeableItem
                item={item}
                userTags={userTags}
                tab={tab}
                listView={listView}
                leftAction={swipe.leftAction}
                rightAction={swipe.rightAction}
                onEdit={() => setEditItem(item)}
                onToggleType={() => void board.toggleActionable(item)}
                onApprove={() => void board.approveItem(item)}
                onSnooze={() => setSnoozeItem(item)}
                onArchive={() => void board.archiveItem(item)}
                onRestore={() =>
                  void (listView === "completed"
                    ? board.restoreCompletedTask(item)
                    : board.restoreArchiveItem(item))
                }
                onDelete={() => void handleDelete(item)}
                onViewSource={() =>
                  setSourceItem((prev) => (prev?.id === item.id ? null : item))
                }
                onTagPress={() => openTagPicker(item)}
                tagPickerOpen={tagPickerItem?.id === item.id}
                onTogglePriority={() =>
                  void board.togglePriority(item, !isPriorityItem(item))
                }
              />
            </View>
          );
        }}
      />
      </View>

      <UndoToast item={deletedItem} onUndo={() => void handleUndo()} />

      <SnoozeSheet
        item={snoozeItem}
        visible={Boolean(snoozeItem) && !showTaskLists}
        onSelect={(item, iso) => void board.snoozeTask(item, iso)}
        onClear={(item) => void board.clearReminder(item)}
        onClose={() => setSnoozeItem(null)}
      />

      <ItemEditModal
        item={editItem}
        visible={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        onSave={(item, input) => board.editItem(item, input)}
      />

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

      <SourceModal
        item={sourceItem}
        visible={Boolean(sourceItem)}
        onClose={() => setSourceItem(null)}
      />

      <PaywallModal
        visible={paywallVisible}
        code={paywallCode}
        summary={summary}
        onClose={() => setPaywallVisible(false)}
        onUpgraded={(returnUrl) => {
          if (returnUrl?.includes("billing=cancel")) {
            setBillingNotice("התשלום בוטל.");
          } else {
            setBillingNotice("המנוי הופעל בהצלחה!");
          }
          void refreshUsage();
        }}
      />

      <SettingsScreen
        visible={settingsVisible}
        userId={userId}
        summary={summary}
        onOpenPaywall={() => {
          setPaywallCode(null);
          setPaywallVisible(true);
        }}
        onClose={() => setSettingsVisible(false)}
        onDataChanged={() => void board.refresh()}
      />

      {taskLists.enabled ? (
        <TaskListsModal
          visible={showTaskLists}
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
          board={board}
          onEditItem={(item) => {
            setShowTaskLists(false);
            setEditItem(item);
          }}
          onSnoozeItem={setSnoozeItem}
          onTagPress={openTagPicker}
          onSetListReminder={(listId, due) => void taskLists.setListReminder(listId, due)}
          onClearListReminder={(listId) => void taskLists.clearListReminder(listId)}
          tagPickerOpenId={tagPickerItem?.id ?? null}
          snoozeItem={snoozeItem}
          onSnoozeSelect={(item, iso) => board.snoozeTask(item, iso)}
          onSnoozeClear={(item) => board.clearReminder(item)}
          onSnoozeClose={() => setSnoozeItem(null)}
          tagPickerItem={tagPickerItem}
          tagDraft={tagDraft}
          onToggleTag={handleToggleTag}
          onCreateTag={handleCreateTag}
          onCloseTagPicker={handleCloseTagPicker}
        />
      ) : null}
    </View>
  );
}

function LoginGate({
  onSignIn,
  onSignUp,
  onMicrosoftSignIn,
  onDemoEnter,
}: {
  onSignIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  onSignUp?: (
    email: string,
    password: string,
    details: { firstName: string; lastName: string; phone: string },
  ) => Promise<void>;
  onMicrosoftSignIn?: () => Promise<void>;
  onDemoEnter?: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LoginScreen
        onSignIn={onSignIn}
        onSignUp={onSignUp}
        onMicrosoftSignIn={onMicrosoftSignIn}
        onDemoEnter={onDemoEnter}
        allowSignup={isSupabaseConfigured}
        showLocalDemoHint={!isSupabaseConfigured && isDemoMode}
      />
    </View>
  );
}

function AppRoot() {
  if (shouldUseConvexAuthLogin()) {
    return <ConvexAuthGate MainApp={MainApp} />;
  }

  return <LegacyAuthAppRoot />;
}

function LegacyAuthAppRoot() {
  const {
    session,
    loading: authLoading,
    signIn,
    signUp,
    signInWithMicrosoft,
    signInDemoQuick,
    signOut,
  } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    SecularOne_400Regular,
    Solitreo_400Regular,
  });

  if ((!fontsLoaded && !fontError) || authLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <GestureHandlerRootView style={styles.root}>
          <LoginGate
            onSignIn={signIn}
            onSignUp={signUp}
            onMicrosoftSignIn={
              isSupabaseConfigured ? () => signInWithMicrosoft() : undefined
            }
            onDemoEnter={() => signInDemoQuick()}
          />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <GestureHandlerRootView style={styles.root}>
        <MainApp
          onSignOut={() => void signOut()}
          userId={session.user.id}
          userEmail={session.user.email}
        />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ConvexAppProvider>
        <UserTagsProvider>
          <AppRoot />
        </UserTagsProvider>
      </ConvexAppProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  topBar: {
    flexShrink: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    direction: "ltr",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    direction: "ltr",
  },
  usage: { fontSize: 12, fontWeight: "600", color: "#b45309" },
  premium: { fontSize: 12, fontWeight: "700", color: "#047857" },
  topBarLink: { color: "#64748b", fontSize: 14 },
  captureBar: {
    flexShrink: 0,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  syncHintWrap: { width: "100%", maxWidth: 420, marginBottom: 8 },
  syncHint: {
    textAlign: "center",
    color: "#047857",
    backgroundColor: "#ecfdf5",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  syncErrorHint: {
    textAlign: "center",
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row-reverse",
    flexShrink: 0,
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderTopWidth: 3,
  },
  tabInbox: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderTopColor: "#e2e8f0",
  },
  tabInboxActive: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#cbd5e1",
    borderTopWidth: 3,
    borderTopColor: "#cbd5e1",
    shadowColor: "#94a3b8",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabToday: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderTopColor: "#3b82f6",
  },
  tabTodayActive: {
    backgroundColor: "#dbeafe",
    borderWidth: 2,
    borderColor: "#3b82f6",
    borderTopWidth: 3,
    borderTopColor: "#2563eb",
    shadowColor: "#3b82f6",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabNotes: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderTopColor: "#f97316",
  },
  tabNotesActive: {
    backgroundColor: "#ffedd5",
    borderWidth: 2,
    borderColor: "#f97316",
    borderTopWidth: 3,
    borderTopColor: "#ea580c",
    shadowColor: "#f97316",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabTextInbox: {
    fontFamily: BOARD_TAB_FONT,
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    width: "100%",
  },
  tabTextInboxActive: { fontFamily: BOARD_TITLE_FONT, color: "#0f172a", fontSize: 14 },
  tabTextToday: {
    fontFamily: BOARD_TAB_FONT,
    color: "#3b82f6",
    fontSize: 13,
    textAlign: "center",
    width: "100%",
  },
  tabTextTodayActive: { fontFamily: BOARD_TITLE_FONT, color: "#1d4ed8", fontSize: 14 },
  tabTextNotes: {
    fontFamily: BOARD_TAB_FONT,
    color: "#ea580c",
    fontSize: 13,
    textAlign: "center",
    width: "100%",
  },
  tabTextNotesActive: { fontFamily: BOARD_TITLE_FONT, color: "#c2410c", fontSize: 14 },
  tabHeaderWrap: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
  },
  boardTitleBlock: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "92%",
    paddingHorizontal: 0,
  },
  tabHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginBottom: 6,
  },
  tabHeaderListActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  tabHeaderToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    rowGap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  listBoardBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#000",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  tabHeaderActions: {
    flexShrink: 0,
  },
  tabHeaderActionsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  boardFilters: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  boardFilterRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 8,
  },
  boardChromeSlate: {
    borderBottomColor: "rgba(203, 213, 225, 0.9)",
    backgroundColor: "rgba(248, 250, 252, 0.7)",
  },
  boardChromeBlue: {
    borderBottomColor: "rgba(147, 197, 253, 0.85)",
    backgroundColor: "rgba(239, 246, 255, 0.55)",
  },
  boardChromeOrange: {
    borderBottomColor: "rgba(253, 186, 116, 0.85)",
    backgroundColor: "rgba(255, 247, 237, 0.55)",
  },
  boardItemsZone: {
    flex: 1,
    paddingTop: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(226, 232, 240, 0.75)",
    backgroundColor: "rgba(255, 254, 251, 0.98)",
  },
  boardItemsZoneSlate: {
    borderTopColor: "rgba(203, 213, 225, 0.85)",
    borderColor: "rgba(203, 213, 225, 0.85)",
  },
  boardItemsZoneBlue: {
    borderTopColor: "rgba(147, 197, 253, 0.85)",
    borderColor: "rgba(147, 197, 253, 0.85)",
  },
  boardItemsZoneOrange: {
    borderTopColor: "rgba(253, 186, 116, 0.85)",
    borderColor: "rgba(253, 186, 116, 0.85)",
  },
  boardList: { flex: 1 },
  squaresRow: {
    gap: 6,
    paddingHorizontal: 0,
  },
  squaresCell: {
    flex: 1,
    minWidth: 0,
  },
  columnTitle: {
    fontFamily: BOARD_TITLE_FONT,
    fontSize: 22,
    fontWeight: "400",
    textAlign: "right",
    flexShrink: 1,
    letterSpacing: 0,
    color: "#0f172a",
    paddingHorizontal: 0,
  },
  billingNotice: {
    textAlign: "center",
    color: "#047857",
    backgroundColor: "#ecfdf5",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 13,
  },
  list: { paddingBottom: 80, paddingHorizontal: 0, gap: 0, width: "100%" },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40, paddingHorizontal: 16, lineHeight: 20 },
  searchError: { color: "#dc2626", fontSize: 12, marginBottom: 8, textAlign: "right" },
});
