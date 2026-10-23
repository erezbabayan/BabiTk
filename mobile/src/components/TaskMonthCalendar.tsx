import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ItemSourceChip } from "./ItemSourceChip";
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { formatItemTime } from "../lib/item-display";
import { hebrewDayMark, hebrewDayTooltip, hebrewMonthHeading } from "../lib/hebrew-calendar";
import {
  loadHebrewCalendarEnabled,
  setHebrewCalendarEnabled,
  subscribeHebrewCalendar,
} from "../lib/hebrew-calendar-pref";
import { formatReminderRecurrenceLabel } from "../lib/resolve-item-reminder";
import type { MindtaskerItem } from "../lib/supabase";
import {
  CALENDAR_RECURRING_ROW_TONE,
  HEBREW_WEEKDAYS,
  calendarItemRecurrence,
  calendarMonthExpandRange,
  calendarMonthFromYmd,
  calendarSearchHitsFromItems,
  calendarSwipeMonthDelta,
  groupCalendarSearchHitsByDay,
  groupCalendarTasksByDay,
  hebrewMonthTitle,
  isCalendarRecurringItem,
  monthGrid,
  shiftMonth,
  taskCalendarDayKey,
} from "../lib/task-calendar";

interface TaskMonthCalendarProps {
  items: MindtaskerItem[];
  focusYmd?: string | null;
  searchQuery?: string;
  listAllMatches?: boolean;
  onSelectItem?: (item: MindtaskerItem) => void;
  /** Board swipeable card (archive/delete + undo) — same component as the list views. */
  renderItem?: (item: MindtaskerItem) => ReactNode;
}

function ddmmyyyy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function initialMonth(): { year: number; month: number } {
  const now = new Date();
  const ymd = taskCalendarDayKey(now) ?? now.toISOString().slice(0, 10);
  return { year: Number(ymd.slice(0, 4)), month: Number(ymd.slice(5, 7)) };
}

function DayTaskRow({
  item,
  dueIso,
  extraDayCount = 0,
  onPress,
}: {
  item: MindtaskerItem;
  dueIso: string;
  extraDayCount?: number;
  onPress?: () => void;
}) {
  const recurring = isCalendarRecurringItem(item);
  const recurrenceLabel = formatReminderRecurrenceLabel(
    calendarItemRecurrence(item.metadata),
  );
  const meta = [recurrenceLabel, extraDayCount > 0 ? "בכמה תאריכים" : "", formatItemTime(dueIso) ?? ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, recurring && CALENDAR_RECURRING_ROW_TONE]}
      accessibilityRole="button"
    >
      <Text style={styles.rowTitle} numberOfLines={1}>
        {item.title.trim() || "משימה"}
      </Text>
      <ItemSourceChip item={item} />
      <Text style={[styles.rowMeta, recurring && styles.rowMetaRecurring]}>{meta}</Text>
    </TouchableOpacity>
  );
}

/** Month calendar view of the tasks board (port of web TaskMonthCalendar). */
export function TaskMonthCalendar({
  items,
  focusYmd = null,
  searchQuery = "",
  listAllMatches = false,
  onSelectItem,
  renderItem,
}: TaskMonthCalendarProps) {
  const todayYmd = taskCalendarDayKey(new Date()) ?? "";
  const [hebrewOn, setHebrewOn] = useState(false);
  const searching = listAllMatches || searchQuery.trim().length > 0;
  const [{ year, month }, setCursor] = useState(initialMonth);
  const [selectedYmd, setSelectedYmd] = useState(todayYmd);

  useEffect(() => {
    void loadHebrewCalendarEnabled();
    return subscribeHebrewCalendar(setHebrewOn);
  }, []);

  useEffect(() => {
    if (!focusYmd) return;
    const next = calendarMonthFromYmd(focusYmd);
    if (!next) return;
    setCursor(next);
    setSelectedYmd(focusYmd);
  }, [focusYmd]);

  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const hebrewHeading = hebrewOn ? hebrewMonthHeading(year, month) : "";
  const hebrewByDay = useMemo(() => {
    if (!hebrewOn) return null;
    const marks = new Map<string, NonNullable<ReturnType<typeof hebrewDayMark>>>();
    for (const cell of cells) {
      const mark = hebrewDayMark(cell.ymd);
      if (mark) marks.set(cell.ymd, mark);
    }
    return marks;
  }, [cells, hebrewOn]);
  const expandRange = useMemo(() => calendarMonthExpandRange(year, month), [year, month]);
  const byDay = useMemo(() => groupCalendarTasksByDay(items, expandRange), [items, expandRange]);
  const selectedTasks = byDay.get(selectedYmd) ?? [];
  const searchHits = useMemo(
    () => (searching ? calendarSearchHitsFromItems(items, todayYmd || selectedYmd) : []),
    [items, searching, selectedYmd, todayYmd],
  );
  const searchGroups = useMemo(() => groupCalendarSearchHitsByDay(searchHits), [searchHits]);
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthTaskCount = useMemo(() => {
    const ids = new Set<string>();
    for (const [ymd, list] of byDay) {
      if (!ymd.startsWith(monthPrefix)) continue;
      for (const entry of list) ids.add(entry.item.id);
    }
    return ids.size;
  }, [byDay, monthPrefix]);

  const goMonthRef = useRef<(delta: number) => void>(() => {});
  goMonthRef.current = (delta: number) => {
    const next = shiftMonth(year, month, delta);
    const prefix = `${next.year}-${String(next.month).padStart(2, "0")}`;
    const busyDays = [...byDay.keys()].filter((ymd) => ymd.startsWith(prefix)).sort();
    setCursor(next);
    setSelectedYmd((ymd) => (ymd.startsWith(prefix) ? ymd : busyDays[0] ?? `${prefix}-01`));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          const delta = calendarSwipeMonthDelta(g.dx);
          if (delta) goMonthRef.current(delta);
        },
      }),
    [],
  );

  const countLabel = searching
    ? monthTaskCount > 0
      ? `${monthTaskCount} משימות מתאימות בחודש זה`
      : "אין משימות מתאימות בחודש זה"
    : monthTaskCount > 0
      ? `${monthTaskCount} משימות עם תאריך בחודש זה`
      : "אין משימות עם תאריך בחודש זה";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => goMonthRef.current(-1)}
          accessibilityLabel="חודש קודם"
        >
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{hebrewMonthTitle(year, month)}</Text>
            {hebrewHeading ? <Text style={styles.hebrewHeading}>{hebrewHeading}</Text> : null}
            <Pressable
              style={styles.hebrewToggle}
              onPress={() => void setHebrewCalendarEnabled(!hebrewOn)}
              accessibilityState={{ selected: hebrewOn }}
            >
              <Text style={[styles.hebrewToggleText, !hebrewOn && styles.underline]}>
                {hebrewOn ? "עברי" : "הצג עברי"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.countLabel}>{countLabel}</Text>
        </View>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => goMonthRef.current(1)}
          accessibilityLabel="חודש הבא"
        >
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid} {...pan.panHandlers}>
        {HEBREW_WEEKDAYS.map((label) => (
          <View key={label} style={[styles.cell, styles.weekday]}>
            <Text style={styles.weekdayText}>{label}</Text>
          </View>
        ))}
        {cells.map((cell) => {
          const dayTasks = byDay.get(cell.ymd) ?? [];
          const selected = cell.ymd === selectedYmd;
          const today = cell.ymd === todayYmd;
          const hebrew = hebrewByDay?.get(cell.ymd) ?? null;
          return (
            <Pressable
              key={cell.ymd}
              onPress={() => setSelectedYmd(cell.ymd)}
              style={[styles.cell, styles.day, selected && styles.daySelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${cell.day}${dayTasks.length ? `, ${dayTasks.length} משימות` : ""}`}
            >
              <Text
                style={[
                  styles.dayNum,
                  !cell.inMonth && styles.dayOut,
                  today && !selected && styles.dayToday,
                ]}
              >
                {cell.day}
              </Text>
              {hebrew ? (
                <View style={styles.hebrewCell}>
                  <Text style={styles.hebrewCellText} numberOfLines={1}>
                    {hebrew.cellLabel}
                  </Text>
                  {hebrew.marker ? (
                    <View
                      style={[
                        styles.marker,
                        { backgroundColor: hebrew.marker === "holiday" ? "#f59e0b" : "#a5b4fc" },
                      ]}
                    />
                  ) : null}
                </View>
              ) : null}
              {dayTasks.length > 0 ? (
                <View style={styles.dots}>
                  {dayTasks.slice(0, 3).map((entry, index) => (
                    <View
                      key={`${entry.item.id}:${index}`}
                      style={[
                        styles.dot,
                        searching
                          ? styles.dotSearch
                          : entry.recurring
                            ? styles.dotRecurring
                            : styles.dotOnce,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.list}>
        {searching ? (
          searchHits.length === 0 ? (
            <Text style={styles.empty}>אין משימות מתאימות.</Text>
          ) : (
            <>
              <Text style={styles.sectionLabel}>{`כל התוצאות (${searchHits.length})`}</Text>
              {searchGroups.map((group) => (
                <View key={group.ymd} style={styles.group}>
                  <Text style={styles.groupLabel}>
                    {ddmmyyyy(group.ymd)}
                    {hebrewByDay?.get(group.ymd)
                      ? ` ${hebrewDayTooltip(hebrewByDay.get(group.ymd)!)}`
                      : ""}
                  </Text>
                  {group.hits.map((hit) => (
                    renderItem ? (
                      <View key={`${hit.item.id}:${hit.dueIso}`}>{renderItem(hit.item)}</View>
                    ) : (
                    <DayTaskRow
                      key={`${hit.item.id}:${hit.dueIso}`}
                      item={hit.item}
                      dueIso={hit.dueIso}
                      extraDayCount={hit.extraDayCount}
                      onPress={() => onSelectItem?.(hit.item)}
                    />
                    )
                  ))}
                </View>
              ))}
            </>
          )
        ) : (
          <>
            {hebrewByDay?.get(selectedYmd) ? (
              <Text style={styles.hebrewDetail}>
                {ddmmyyyy(selectedYmd)} {hebrewDayTooltip(hebrewByDay.get(selectedYmd)!)}
              </Text>
            ) : null}
            {selectedTasks.length === 0 ? (
              <Text style={styles.empty}>
                אין משימות ביום הזה. הוסיפו תאריך למשימה בלוח כדי שתופיע ביומן.
              </Text>
            ) : (
              selectedTasks.map(({ item, dueIso }) =>
                renderItem ? (
                  <View key={`${item.id}:${dueIso}`}>{renderItem(item)}</View>
                ) : (
                <DayTaskRow
                  key={`${item.id}:${dueIso}`}
                  item={item}
                  dueIso={dueIso}
                  onPress={() => onSelectItem?.(item)}
                />
                ),
              )
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 10, gap: 10, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  navBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#fff",
  },
  navText: { fontSize: 16, color: "#334155" },
  headerCenter: { flex: 1, alignItems: "center" },
  titleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  title: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  hebrewHeading: { fontSize: 12, color: "#64748b" },
  hebrewToggle: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: "#fff",
  },
  hebrewToggleText: { fontSize: 10, color: "#64748b" },
  underline: { textDecorationLine: "underline" },
  countLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  grid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
  },
  cell: { width: `${100 / 7}%`, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e2e8f0" },
  weekday: { backgroundColor: "#f8fafc", paddingVertical: 4, alignItems: "center" },
  weekdayText: { fontSize: 10, fontWeight: "600", color: "#64748b" },
  day: { minHeight: 48, backgroundColor: "#fff", paddingVertical: 4, paddingHorizontal: 2 },
  daySelected: { backgroundColor: "#eff6ff", borderColor: "#60a5fa", borderWidth: 1 },
  dayNum: { fontSize: 12, color: "#1e293b", textAlign: "right", paddingHorizontal: 2 },
  dayOut: { color: "#cbd5e1" },
  dayToday: { fontWeight: "700", color: "#1d4ed8" },
  hebrewCell: { flexDirection: "row-reverse", alignItems: "center", gap: 2, marginTop: 2 },
  hebrewCellText: { fontSize: 9, color: "#94a3b8", flexShrink: 1 },
  marker: { width: 4, height: 4, borderRadius: 2 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 2, marginTop: 3 },
  dot: { borderRadius: 4 },
  dotOnce: { width: 4, height: 4, backgroundColor: "#3b82f6" },
  dotRecurring: { width: 6, height: 6, backgroundColor: "#2dd4bf" },
  dotSearch: { width: 6, height: 6, backgroundColor: "#ef4444" },
  list: { gap: 6 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowTitle: { flex: 1, fontSize: 13, fontWeight: "500", color: "#1e293b", textAlign: "right" },
  rowMeta: { fontSize: 11, color: "#64748b" },
  rowMetaRecurring: { color: "#115e59", fontWeight: "500" },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 16,
    textAlign: "center",
    fontSize: 12,
    color: "#64748b",
  },
  sectionLabel: { fontSize: 11, fontWeight: "600", color: "#475569", textAlign: "right" },
  group: { gap: 4 },
  groupLabel: { fontSize: 11, fontWeight: "500", color: "#b91c1c", textAlign: "right" },
  hebrewDetail: { fontSize: 11, color: "#64748b", textAlign: "right" },
});
