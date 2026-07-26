import { useRef, useState } from "react";
import {
  type GestureResponderEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

interface ClockTimePickerProps {
  hour: string; // "00".."23"
  minute: string; // "00".."59"
  onChange: (hour: string, minute: string) => void;
  disabled?: boolean;
}

type DialMode = "hour" | "minute";

const DIAL_SIZE = 272;
const CENTER = DIAL_SIZE / 2;
const OUTER_R = 108;
const INNER_R = 70;
const RING_SPLIT_R = (OUTER_R + INNER_R) / 2;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function slotAngle(index: number): number {
  return ((index * 30 - 90) * Math.PI) / 180;
}

function slotPos(index: number, radius: number): { x: number; y: number } {
  const a = slotAngle(index);
  return { x: CENTER + radius * Math.cos(a), y: CENTER + radius * Math.sin(a) };
}

/** Outer ring: 12,1..11 · inner ring: 00,13..23 (Material 24h layout). */
function hourForSlot(index: number, inner: boolean): number {
  if (inner) return index === 0 ? 0 : index + 12;
  return index === 0 ? 12 : index;
}

function slotForHour(hour: number): { index: number; inner: boolean } {
  if (hour === 0) return { index: 0, inner: true };
  if (hour === 12) return { index: 0, inner: false };
  if (hour > 12) return { index: hour - 12, inner: true };
  return { index: hour, inner: false };
}

function MiniClockFace({ hour, minute, size }: { hour: number; minute: number; size: number }) {
  const c = size / 2;
  const hourAngle = (((hour % 12) + minute / 60) * 30 - 90) * (Math.PI / 180);
  const minAngle = (minute * 6 - 90) * (Math.PI / 180);
  const hourLen = size * 0.26;
  const minLen = size * 0.36;
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={c - 1.5} fill="#eff6ff" stroke="#93c5fd" strokeWidth={1.5} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = slotAngle(i);
        const r1 = c - 4.5;
        const r2 = c - 7.5;
        return (
          <Line
            key={i}
            x1={c + r1 * Math.cos(a)}
            y1={c + r1 * Math.sin(a)}
            x2={c + r2 * Math.cos(a)}
            y2={c + r2 * Math.sin(a)}
            stroke="#93c5fd"
            strokeWidth={1.2}
          />
        );
      })}
      <Line
        x1={c}
        y1={c}
        x2={c + hourLen * Math.cos(hourAngle)}
        y2={c + hourLen * Math.sin(hourAngle)}
        stroke="#1d4ed8"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <Line
        x1={c}
        y1={c}
        x2={c + minLen * Math.cos(minAngle)}
        y2={c + minLen * Math.sin(minAngle)}
        stroke="#3b82f6"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={c} cy={c} r={2.2} fill="#1d4ed8" />
    </Svg>
  );
}

export function ClockTimePicker({ hour, minute, onChange, disabled = false }: ClockTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialMode>("hour");
  const draggingRef = useRef(false);

  const hourNum = toInt(hour);
  const minuteNum = toInt(minute);

  function openDialog() {
    if (disabled) return;
    setMode("hour");
    setOpen(true);
  }

  function selectFromPoint(x: number, y: number) {
    const dx = x - CENTER;
    const dy = y - CENTER;
    const dist = Math.hypot(dx, dy);
    if (dist < 18) return;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    const index = Math.round(deg / 30) % 12;
    if (mode === "hour") {
      const inner = dist < RING_SPLIT_R;
      onChange(pad(hourForSlot(index, inner)), pad(minuteNum));
    } else {
      onChange(pad(hourNum), pad((index * 5) % 60));
    }
  }

  function handleTouchStart(e: GestureResponderEvent) {
    draggingRef.current = true;
    selectFromPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
  }

  function handleTouchMove(e: GestureResponderEvent) {
    if (!draggingRef.current) return;
    selectFromPoint(e.nativeEvent.locationX, e.nativeEvent.locationY);
  }

  function handleTouchEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (mode === "hour") setMode("minute");
  }

  const hand =
    mode === "hour"
      ? (() => {
          const { index, inner } = slotForHour(hourNum);
          return slotPos(index, inner ? INNER_R : OUTER_R);
        })()
      : slotPos(Math.round(minuteNum / 5) % 12, OUTER_R);

  const minuteIsSnapped = minuteNum % 5 === 0;

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={openDialog}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        accessibilityRole="button"
        accessibilityLabel="פתח שעון לבחירת שעה"
      >
        <MiniClockFace hour={hourNum} minute={minuteNum} size={40} />
        <Text style={styles.triggerTime}>
          {pad(hourNum)}:{pad(minuteNum)}
        </Text>
        <Text style={styles.triggerHint}>לחץ לבחירה</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dialog} onPress={() => undefined}>
            <Text style={styles.dialogTitle}>{mode === "hour" ? "בחר שעה" : "בחר דקות"}</Text>

            <View style={styles.timeHeader}>
              <Pressable
                onPress={() => setMode("hour")}
                style={[styles.timeSegment, mode === "hour" && styles.timeSegmentActive]}
              >
                <Text
                  style={[styles.timeSegmentText, mode === "hour" && styles.timeSegmentTextActive]}
                >
                  {pad(hourNum)}
                </Text>
              </Pressable>
              <Text style={styles.timeColon}>:</Text>
              <Pressable
                onPress={() => setMode("minute")}
                style={[styles.timeSegment, mode === "minute" && styles.timeSegmentActive]}
              >
                <Text
                  style={[
                    styles.timeSegmentText,
                    mode === "minute" && styles.timeSegmentTextActive,
                  ]}
                >
                  {pad(minuteNum)}
                </Text>
              </Pressable>
            </View>

            <View
              style={styles.dial}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleTouchStart}
              onResponderMove={handleTouchMove}
              onResponderRelease={handleTouchEnd}
              onResponderTerminate={handleTouchEnd}
            >
              <Svg width={DIAL_SIZE} height={DIAL_SIZE} style={StyleSheet.absoluteFill}>
                <Circle cx={CENTER} cy={CENTER} r={4} fill="#2563eb" />
                <Line
                  x1={CENTER}
                  y1={CENTER}
                  x2={hand.x}
                  y2={hand.y}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                />
                <Circle
                  cx={hand.x}
                  cy={hand.y}
                  r={18}
                  fill="#2563eb"
                  fillOpacity={mode === "minute" && !minuteIsSnapped ? 0.35 : 1}
                />
              </Svg>

              {Array.from({ length: 12 }, (_, i) => {
                const outerPos = slotPos(i, OUTER_R);
                if (mode === "minute") {
                  const m = (i * 5) % 60;
                  const selected = minuteIsSnapped && Math.round(minuteNum / 5) % 12 === i;
                  return (
                    <View
                      key={`m-${i}`}
                      pointerEvents="none"
                      style={[
                        styles.slot,
                        { left: outerPos.x - 18, top: outerPos.y - 18 },
                      ]}
                    >
                      <Text style={[styles.slotText, selected && styles.slotTextSelected]}>
                        {pad(m)}
                      </Text>
                    </View>
                  );
                }
                const innerPos = slotPos(i, INNER_R);
                const outerHour = hourForSlot(i, false);
                const innerHour = hourForSlot(i, true);
                return (
                  <View key={`h-${i}`} pointerEvents="none">
                    <View style={[styles.slot, { left: outerPos.x - 18, top: outerPos.y - 18 }]}>
                      <Text
                        style={[styles.slotText, hourNum === outerHour && styles.slotTextSelected]}
                      >
                        {outerHour}
                      </Text>
                    </View>
                    <View style={[styles.slot, { left: innerPos.x - 18, top: innerPos.y - 18 }]}>
                      <Text
                        style={[
                          styles.slotTextInner,
                          hourNum === innerHour && styles.slotTextSelected,
                        ]}
                      >
                        {pad(innerHour)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.footer}>
              <Pressable
                onPress={() => setMode(mode === "hour" ? "minute" : "hour")}
                style={styles.footerLink}
              >
                <Text style={styles.footerLinkText}>
                  {mode === "hour" ? "לדקות ←" : "→ לשעות"}
                </Text>
              </Pressable>
              <Pressable onPress={() => setOpen(false)} style={styles.confirmBtn}>
                <Text style={styles.confirmBtnText}>אישור</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  triggerDisabled: { opacity: 0.45 },
  triggerTime: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    fontVariant: ["tabular-nums"],
    writingDirection: "ltr",
  },
  triggerHint: { fontSize: 10, color: "#94a3b8" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    backgroundColor: "#fff",
    padding: 16,
  },
  dialogTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    marginBottom: 4,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 12,
  },
  timeSegment: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#f1f5f9",
  },
  timeSegmentActive: { backgroundColor: "#2563eb" },
  timeSegmentText: {
    fontSize: 30,
    fontWeight: "800",
    color: "#475569",
    fontVariant: ["tabular-nums"],
  },
  timeSegmentTextActive: { color: "#fff" },
  timeColon: { fontSize: 30, fontWeight: "800", color: "#94a3b8" },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    backgroundColor: "#f1f5f9",
    alignSelf: "center",
  },
  slot: {
    position: "absolute",
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  slotText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    fontVariant: ["tabular-nums"],
  },
  slotTextInner: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    fontVariant: ["tabular-nums"],
  },
  slotTextSelected: { color: "#fff" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  footerLink: { paddingHorizontal: 10, paddingVertical: 6 },
  footerLinkText: { fontSize: 12, fontWeight: "700", color: "#2563eb" },
  confirmBtn: {
    borderRadius: 10,
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  confirmBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
