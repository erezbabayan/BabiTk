import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  TIME_PRESETS,
  dateTimeToParts,
  formatTimeLabel,
  partsToDateTime,
  type DueDateParts,
} from "../lib/due-date-fields";
import { ClockTimePicker } from "./ClockTimePicker";

interface DueDateFieldsProps {
  value: DueDateParts;
  onChange: (value: DueDateParts) => void;
}

function formatDateLabel(date: string): string {
  if (!date) return "בחר תאריך מהיומן";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "בחר תאריך מהיומן";
  return parsed.toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isPresetActive(value: DueDateParts, preset: (typeof TIME_PRESETS)[number]): boolean {
  return value.hour === preset.hour && value.minute === preset.minute;
}

export function DueDateFields({ value, onChange }: DueDateFieldsProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const hasDate = value.date.length > 0;

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "dismissed" || !selected) return;
    onChange(dateTimeToParts(selected, value));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>תאריך יעד</Text>
        {hasDate ? (
          <Pressable onPress={() => onChange({ date: "", hour: "09", minute: "00" })}>
            <Text style={styles.clearText}>נקה</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.subLabel}>תאריך</Text>
      <Pressable
        style={[styles.fieldBtn, hasDate && styles.fieldBtnFilled]}
        onPress={() => setShowDatePicker(true)}
        accessibilityRole="button"
        accessibilityLabel="בחר תאריך מהיומן"
      >
        <Text style={[styles.fieldBtnText, !hasDate && styles.fieldBtnPlaceholder]}>
          {formatDateLabel(value.date)}
        </Text>
        <Text style={styles.fieldBtnIcon}>📅</Text>
      </Pressable>

      {showDatePicker ? (
        <DateTimePicker
          value={partsToDateTime(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "calendar"}
          onChange={handleDateChange}
          minimumDate={new Date()}
          locale="he-IL"
        />
      ) : null}

      <View style={[styles.timeBox, !hasDate && styles.fieldBtnDisabled]}>
        <View style={styles.timeHeaderRow}>
          <Text style={[styles.subLabel, styles.timeLabel]}>שעה ודקות</Text>
          <Text style={[styles.timePreview, !hasDate && styles.fieldBtnPlaceholder]}>
            {hasDate ? formatTimeLabel(value) : "בחר תאריך קודם"}
          </Text>
        </View>

        <ClockTimePicker
          hour={value.hour.padStart(2, "0")}
          minute={value.minute.padStart(2, "0")}
          onChange={(hour, minute) => onChange({ ...value, hour, minute })}
          disabled={!hasDate}
        />
      </View>

      <Text style={[styles.subLabel, styles.presetsLabel]}>זמנים נפוצים</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetsRow}
        style={styles.presetsScroll}
      >
        {TIME_PRESETS.map((preset) => {
          const active = hasDate && isPresetActive(value, preset);
          return (
            <Pressable
              key={preset.label}
              disabled={!hasDate}
              onPress={() => onChange({ ...value, hour: preset.hour, minute: preset.minute })}
              style={[
                styles.presetChip,
                active && styles.presetChipActive,
                !hasDate && styles.presetChipDisabled,
              ]}
            >
              <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                {preset.label} · {preset.hour}:{preset.minute}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export { combineDueDate, splitDueDate, type DueDateParts } from "../lib/due-date-fields";

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    color: "#475569",
  },
  clearText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  subLabel: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "right",
  },
  fieldBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#fff",
  },
  fieldBtnFilled: {
    borderColor: "#93c5fd",
    backgroundColor: "#f8fafc",
  },
  fieldBtnDisabled: { opacity: 0.45 },
  fieldBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "right",
  },
  fieldBtnPlaceholder: {
    fontWeight: "500",
    color: "#94a3b8",
  },
  fieldBtnIcon: { fontSize: 16, marginLeft: 8 },
  timeLabel: { marginTop: 2 },
  timeBox: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: "#f8fafc",
  },
  timeHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timePreview: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1d4ed8",
    writingDirection: "ltr",
  },
  presetsLabel: { marginTop: 4 },
  presetsScroll: { marginHorizontal: -2 },
  presetsRow: {
    flexDirection: "row-reverse",
    gap: 8,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  presetChipActive: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  presetChipDisabled: { opacity: 0.4 },
  presetChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  presetChipTextActive: { color: "#1d4ed8" },
});
