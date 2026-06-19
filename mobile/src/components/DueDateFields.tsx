import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  clampStep,
  combineDueDate,
  splitDueDate,
  type DueDateParts,
} from "../lib/due-date-fields";

interface DueDateFieldsProps {
  value: DueDateParts;
  onChange: (value: DueDateParts) => void;
}

function TimeStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const display = String(value).padStart(2, "0");

  return (
    <View style={styles.stepperBlock}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          style={[styles.stepBtn, disabled && styles.stepBtnDisabled]}
          onPress={() => onChange(clampStep(value, min, max, step, -1))}
          disabled={disabled}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{display}</Text>
        <Pressable
          style={[styles.stepBtn, disabled && styles.stepBtnDisabled]}
          onPress={() => onChange(clampStep(value, min, max, step, 1))}
          disabled={disabled}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function DueDateFields({ value, onChange }: DueDateFieldsProps) {
  const hasDate = value.date.length > 0;
  const hour = Number.parseInt(value.hour, 10) || 0;
  const minute = Number.parseInt(value.minute, 10) || 0;

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
      <TextInput
        style={styles.input}
        value={value.date}
        onChangeText={(date) => onChange({ ...value, date })}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#94a3b8"
        textAlign="left"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={[styles.subLabel, styles.timeLabel]}>שעה</Text>
      <View style={styles.timeRow}>
        <TimeStepper
          label="דקות"
          value={minute}
          min={0}
          max={59}
          step={5}
          disabled={!hasDate}
          onChange={(next) => onChange({ ...value, minute: String(next).padStart(2, "0") })}
        />
        <Text style={styles.colon}>:</Text>
        <TimeStepper
          label="שעה"
          value={hour}
          min={0}
          max={23}
          step={1}
          disabled={!hasDate}
          onChange={(next) => onChange({ ...value, hour: String(next).padStart(2, "0") })}
        />
      </View>
    </View>
  );
}

export { combineDueDate, splitDueDate, type DueDateParts };

const styles = StyleSheet.create({
  wrap: { gap: 4 },
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
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  timeLabel: { marginTop: 4 },
  timeRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 12,
  },
  stepperBlock: { alignItems: "center", gap: 4 },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: { fontSize: 18, fontWeight: "600", color: "#334155", lineHeight: 20 },
  stepValue: {
    minWidth: 36,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    fontVariant: ["tabular-nums"],
  },
  colon: {
    fontSize: 20,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 10,
  },
});
