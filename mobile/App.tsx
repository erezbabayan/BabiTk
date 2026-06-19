import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Heebo_700Bold,
  Heebo_800ExtraBold,
} from "@expo-google-fonts/heebo";
import { useFonts } from "expo-font";
import { SnoozeSheet } from "./src/components/ActionSheets";
import { ColumnSearchBar, ColumnSearchAiButton } from "./src/components/ColumnSearchBar";
import { ItemEditModal } from "./src/components/ItemEditModal";
import { QuickCaptureBar } from "./src/components/QuickCaptureBar";
import { SettingsScreen } from "./src/components/SettingsScreen";
import { LoginScreen } from "./src/components/LoginScreen";
import { MindTaskerLogo, BoardBrushMark } from "./src/components/MindTaskerLogo";
import { NotesSemanticResults } from "./src/components/NotesSemanticResults";
import { TagFilterBar } from "./src/components/TagFilterBar";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { SourceModal } from "./src/components/SourceModal";
import { SwipeableItem, type SwipeSideAction } from "./src/components/SwipeableItem";
import { UndoToast } from "./src/components/UndoToast";
import { PaywallModal } from "./src/components/PaywallModal";
import { useUsage } from "./src/hooks/useUsage";
import { useUserTags } from "./src/hooks/useUserTags";
import { registerPaywallHandler, searchItems } from "./src/lib/api";
import { useAuth } from "./src/hooks/useAuth";
import { BOARD_TAB_LABELS, inboxTransferLabel, listViewTitle, emptyListMessage, searchPlaceholder } from "./src/lib/item-actions";
import { collectTags, filterItemsByQuery, filterItemsByTag } from "./src/lib/filter-items";
import { isSyncEnabled } from "./src/lib/sync-client";
import { useBoardItems } from "./src/hooks/useBoardItems";
import { BOARD_TAB_FONT, BOARD_TITLE_FONT } from "./src/lib/board-font";
import { ConvexAppProvider } from "./src/providers/ConvexAppProvider";
import type { MindtaskerItem } from "./src/lib/supabase";

type Tab = "inbox" | "today" | "notes";
type ListView = "active" | "archive" | "completed";

function buildSwipeActions(
  tab: Tab,
  listView: ListView,
  item: MindtaskerItem,
  board: ReturnType<typeof useBoardItems>,
  onDelete: (item: MindtaskerItem) => void,
): { leftAction?: SwipeSideAction; rightAction?: SwipeSideAction } {
  if (listView === "archive") {
    return {
      leftAction: {
        label: "מחק",
        icon: "🗑",
        backgroundColor: "#fee2e2",
        onTrigger: () => void onDelete(item),
      },
      rightAction: {
        label: "שחזר",
        icon: "↩",
        backgroundColor: "#dcfce7",
        onTrigger: () => void board.restoreArchiveItem(item),
      },
    };
  }

  if (listView === "completed") {
    return {
      leftAction: {
        label: "מחק",
        icon: "🗑",
        backgroundColor: "#fee2e2",
        onTrigger: () => void onDelete(item),
      },
      rightAction: {
        label: "שחזר",
        icon: "↩",
        backgroundColor: "#dcfce7",
        onTrigger: () => void board.restoreCompletedTask(item),
      },
    };
  }

  if (tab === "inbox") {
    return {
      leftAction: {
        label: "מחק",
        icon: "🗑",
        backgroundColor: "#fee2e2",
        onTrigger: () => void onDelete(item),
      },
      rightAction: {
        label: "אשר",
        icon: "✓",
        backgroundColor: item.is_actionable ? "#dbeafe" : "#fef9c3",
        onTrigger: () => void board.approveItem(item),
      },
    };
  }

  if (tab === "today" || tab === "notes") {
    return {
      leftAction: {
        label: "מחק",
        icon: "🗑",
        backgroundColor: "#fee2e2",
        onTrigger: () => void onDelete(item),
      },
      rightAction: {
        label: "ארכיון",
        icon: "📦",
        backgroundColor: "#e0e7ff",
        onTrigger: () => void board.archiveItem(item),
      },
    };
  }

  return {
    leftAction: {
      label: "מחק",
      icon: "🗑",
      backgroundColor: "#fee2e2",
      onTrigger: () => void onDelete(item),
    },
  };
}

function MainApp({ onSignOut }: { onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("inbox");
  const [listView, setListView] = useState<ListView>("active");
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [paywallCode, setPaywallCode] = useState<"audio_quota" | "ai_parse_quota" | null>(null);
  const { summary, refresh: refreshUsage } = useUsage(true);
  const { tags: userTags, save: saveUserTags } = useUserTags();
  const { session } = useAuth();
  const board = useBoardItems(session?.user.id);

  const [snoozeItem, setSnoozeItem] = useState<MindtaskerItem | null>(null);
  const [sourceItem, setSourceItem] = useState<MindtaskerItem | null>(null);
  const [editItem, setEditItem] = useState<MindtaskerItem | null>(null);
  const [deletedItem, setDeletedItem] = useState<MindtaskerItem | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [semanticResults, setSemanticResults] = useState<
    { id: string; title: string; content: string; similarity: number }[]
  >([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawItems = useMemo(() => {
    if (listView === "archive") {
      return tab === "notes" ? board.notesArchive : board.inboxArchive;
    }
    if (tab === "inbox") {
      return board.inbox;
    }
    if (tab === "today") {
      return board.todayTasks;
    }
    return board.notes;
  }, [tab, listView, board]);

  const boardTags = useMemo(() => collectTags(rawItems), [rawItems]);

  const displayItems = useMemo(() => {
    const items = filterItemsByQuery(rawItems, searchQuery);
    return filterItemsByTag(items, selectedTag);
  }, [rawItems, searchQuery, selectedTag]);

  useEffect(() => {
    setSearchInput("");
    setSearchQuery("");
    setSelectedTag(null);
    setSemanticResults([]);
    setSemanticError(null);
    setListView("active");
  }, [tab]);

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

  const columnTitle = listViewTitle(tab, listView);

  const altViewTone =
    tab === "inbox" ? styles.altViewSlate : tab === "today" ? styles.altViewBlue : styles.altViewOrange;

  const altViewPillTone =
    tab === "inbox"
      ? styles.altViewPillSlate
      : tab === "today"
        ? styles.altViewPillBlue
        : styles.altViewPillOrange;

  const archiveCount = tab === "notes" ? board.notesArchive.length : board.inboxArchive.length;

  const renderAltViewControls = () => {
    if (listView !== "active") {
      return (
        <TouchableOpacity
          style={[styles.altViewPill, altViewPillTone]}
          onPress={() => setListView("active")}
        >
          <Text style={[styles.altViewBtn, altViewTone]}>חזור</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.altViewPill, altViewPillTone]}
        onPress={() => setListView("archive")}
      >
        <Text style={[styles.altViewBtn, altViewTone]}>ארכיון ({archiveCount})</Text>
      </TouchableOpacity>
    );
  };

  const runSemanticSearch = useCallback(async () => {
    const q = searchInput.trim();
    if (q.length < 2) return;

    setSemanticLoading(true);
    setSemanticError(null);
    try {
      const hits = await searchItems(q, tab);
      setSemanticResults(hits);
    } catch (err) {
      setSemanticError(err instanceof Error ? err.message : "חיפוש נכשל");
      setSemanticResults([]);
    } finally {
      setSemanticLoading(false);
    }
  }, [searchInput, tab]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setSemanticResults([]);
    setSemanticError(null);
  }, []);

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

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <MindTaskerLogo size="small" />
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
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Text style={styles.topBarLink}>הגדרות</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.contentPad}>
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

      <View style={styles.tabHeader}>
        <View style={styles.tabHeaderTitleRow}>
          <Text
            style={[
              styles.columnTitle,
              tab === "inbox" && styles.columnTitleSlate,
              tab === "today" && styles.columnTitleBlue,
              tab === "notes" && styles.columnTitleOrange,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {columnTitle}
          </Text>
          <BoardBrushMark tone={tab === "inbox" ? "white" : tab === "today" ? "blue" : "orange"} />
        </View>
        <View style={styles.tabHeaderControls}>
          <ColumnSearchBar
            inline
            value={searchInput}
            onChange={(value) => {
              setSearchInput(value);
              if (!value.trim()) {
                setSemanticResults([]);
                setSemanticError(null);
              }
            }}
            activeQuery={searchQuery}
            onSearch={() => setSearchQuery(searchInput.trim())}
            onClear={clearSearch}
            placeholder={searchPlaceholder(tab, listView)}
            tone={tab === "inbox" ? "slate" : tab === "today" ? "blue" : "orange"}
          />
          <ColumnSearchAiButton
            label="AI"
            onPress={() => void runSemanticSearch()}
            loading={semanticLoading}
            disabled={searchInput.trim().length < 2}
          />
          <View style={styles.tabHeaderActions}>{renderAltViewControls()}</View>
        </View>
      </View>

      <View style={styles.boardFilters}>
        <TagFilterBar
          tags={boardTags}
          selected={selectedTag}
          onSelect={setSelectedTag}
          userTags={userTags}
        />
        <NotesSemanticResults results={semanticResults} error={semanticError} />
      </View>

      <FlatList
        data={displayItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {searchQuery.trim() || selectedTag
              ? "אין תוצאות לסינון"
              : emptyListMessage(tab, listView)}
          </Text>
        }
        renderItem={({ item }) => {
          const swipe = buildSwipeActions(tab, listView, item, board, handleDelete);
          return (
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
              onComplete={() => void board.completeTask(item)}
              onSnooze={() => setSnoozeItem(item)}
              onArchive={() => void board.archiveItem(item)}
              onRestore={() =>
                void (listView === "completed"
                  ? board.restoreCompletedTask(item)
                  : board.restoreArchiveItem(item))
              }
              onDelete={() => void handleDelete(item)}
              onLongPressCheck={() => {
                if (listView !== "active" || !item.is_actionable || tab !== "today") return;
                void board.completeTask(item);
              }}
              onViewSource={() =>
                setSourceItem((prev) => (prev?.id === item.id ? null : item))
              }
            />
          );
        }}
      />

      <UndoToast item={deletedItem} onUndo={() => void handleUndo()} />

      <SnoozeSheet
        item={snoozeItem}
        visible={Boolean(snoozeItem)}
        onSelect={(item, iso) => void board.snoozeTask(item, iso)}
        onClose={() => setSnoozeItem(null)}
      />

      <ItemEditModal
        item={editItem}
        visible={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        onSave={(item, input) => board.editItem(item, input)}
      />

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
        userId={session?.user.id}
        userTags={userTags}
        summary={summary}
        onSaveTags={saveUserTags}
        onOpenPaywall={() => {
          setPaywallCode(null);
          setPaywallVisible(true);
        }}
        onClose={() => setSettingsVisible(false)}
        onDataChanged={() => void board.refresh()}
      />
    </View>
  );
}

function LoginGate({
  onSignIn,
  onSignUp,
  onDemoEnter,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onDemoEnter: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LoginScreen onSignIn={onSignIn} onSignUp={onSignUp} onDemoEnter={onDemoEnter} />
    </View>
  );
}

function AppRoot() {
  const { loading, session, signIn, signUp, signOut } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Heebo_700Bold,
    Heebo_800ExtraBold,
  });

  if ((!fontsLoaded && !fontError) || loading) {
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
            onDemoEnter={async () => signIn("demo@mindtasker.local", "demo")}
          />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <GestureHandlerRootView style={styles.root}>
        <MainApp onSignOut={() => void signOut()} />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ConvexAppProvider>
      <AppRoot />
    </ConvexAppProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  topBar: {
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
  contentPad: { paddingHorizontal: 16, alignItems: "center" },
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
  tabHeader: {
    paddingHorizontal: 16,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 8,
    paddingTop: 2,
    gap: 6,
  },
  tabHeaderTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    alignSelf: "stretch",
  },
  tabHeaderControls: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  tabHeaderActions: {
    flexShrink: 0,
  },
  boardFilters: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  columnTitle: {
    fontFamily: BOARD_TITLE_FONT,
    fontSize: 22,
    textAlign: "right",
    flexShrink: 1,
    letterSpacing: 0.3,
  },
  columnTitleSlate: { color: "#0f172a" },
  columnTitleBlue: { color: "#1d4ed8" },
  columnTitleOrange: { color: "#c2410c" },
  altViewBtn: {
    fontWeight: "700",
    fontSize: 12,
  },
  altViewRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  altViewPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  altViewPillSlate: {
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  altViewPillBlue: {
    borderColor: "#bfdbfe",
    backgroundColor: "#ffffff",
  },
  altViewPillOrange: {
    borderColor: "#fed7aa",
    backgroundColor: "#ffffff",
  },
  altViewSlate: { color: "#334155" },
  altViewBlue: { color: "#2563eb" },
  altViewOrange: { color: "#ea580c" },
  billingNotice: {
    textAlign: "center",
    color: "#047857",
    backgroundColor: "#ecfdf5",
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    fontSize: 13,
  },
  list: { paddingBottom: 80, paddingHorizontal: 16, gap: 0 },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40, paddingHorizontal: 16, lineHeight: 20 },
});
