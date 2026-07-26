import { useRef, useState } from "react";

interface ClockTimePickerProps {
  hour: string; // "00".."23"
  minute: string; // "00".."59"
  onChange: (hour: string, minute: string) => void;
  disabled?: boolean;
  compact?: boolean;
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

/** Angle (radians) of slot i out of 12, starting at 12 o'clock. */
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

/** Small analog preview used as the trigger button face. */
function MiniClockFace({ hour, minute, size }: { hour: number; minute: number; size: number }) {
  const c = size / 2;
  const hourAngle = (((hour % 12) + minute / 60) * 30 - 90) * (Math.PI / 180);
  const minAngle = (minute * 6 - 90) * (Math.PI / 180);
  const hourLen = size * 0.26;
  const minLen = size * 0.36;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={c - 1.5} fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = slotAngle(i);
        const r1 = c - 4.5;
        const r2 = c - 7.5;
        return (
          <line
            key={i}
            x1={c + r1 * Math.cos(a)}
            y1={c + r1 * Math.sin(a)}
            x2={c + r2 * Math.cos(a)}
            y2={c + r2 * Math.sin(a)}
            stroke="#93c5fd"
            strokeWidth="1.2"
          />
        );
      })}
      <line
        x1={c}
        y1={c}
        x2={c + hourLen * Math.cos(hourAngle)}
        y2={c + hourLen * Math.sin(hourAngle)}
        stroke="#1d4ed8"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1={c}
        y1={c}
        x2={c + minLen * Math.cos(minAngle)}
        y2={c + minLen * Math.sin(minAngle)}
        stroke="#3b82f6"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx={c} cy={c} r={2.2} fill="#1d4ed8" />
    </svg>
  );
}

export function ClockTimePicker({
  hour,
  minute,
  onChange,
  disabled = false,
  compact = false,
}: ClockTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialMode>("hour");
  const dialRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const hourNum = toInt(hour);
  const minuteNum = toInt(minute);

  function openDialog() {
    if (disabled) return;
    setMode("hour");
    setOpen(true);
  }

  function selectFromPoint(clientX: number, clientY: number) {
    const el = dialRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - rect.left - rect.width / 2;
    const dy = clientY - rect.top - rect.height / 2;
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

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    selectFromPoint(e.clientX, e.clientY);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic/inactive pointers can't be captured; dragging still works via move events.
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    selectFromPoint(e.clientX, e.clientY);
  }

  function handlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (mode === "hour") setMode("minute");
  }

  // Hand target for the enlarged dial.
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
      <button
        type="button"
        disabled={disabled}
        onClick={openDialog}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white transition hover:border-blue-300 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-40 ${
          compact ? "px-2 py-1" : "px-3 py-1.5"
        }`}
        aria-label="פתח שעון לבחירת שעה"
        dir="ltr"
      >
        <MiniClockFace hour={hourNum} minute={minuteNum} size={compact ? 30 : 40} />
        <span
          className={`font-bold tabular-nums text-slate-800 ${compact ? "text-sm" : "text-lg"}`}
        >
          {pad(hourNum)}:{pad(minuteNum)}
        </span>
        <span className={`text-slate-400 ${compact ? "text-[9px]" : "text-[10px]"}`}>
          לחץ לבחירה
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[320px] rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="בחירת שעה"
          >
            <div className="mb-1 text-center text-[11px] font-medium text-slate-500">
              {mode === "hour" ? "בחר שעה" : "בחר דקות"}
            </div>
            <div className="mb-3 flex items-center justify-center gap-1" dir="ltr">
              <button
                type="button"
                onClick={() => setMode("hour")}
                className={`rounded-lg px-3 py-1 text-3xl font-bold tabular-nums transition ${
                  mode === "hour"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {pad(hourNum)}
              </button>
              <span className="text-3xl font-bold text-slate-400">:</span>
              <button
                type="button"
                onClick={() => setMode("minute")}
                className={`rounded-lg px-3 py-1 text-3xl font-bold tabular-nums transition ${
                  mode === "minute"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {pad(minuteNum)}
              </button>
            </div>

            <div className="flex justify-center">
              <div
                ref={dialRef}
                className="relative touch-none select-none rounded-full bg-slate-100"
                style={{ width: DIAL_SIZE, height: DIAL_SIZE }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                dir="ltr"
              >
                <svg
                  width={DIAL_SIZE}
                  height={DIAL_SIZE}
                  className="pointer-events-none absolute inset-0"
                >
                  <circle cx={CENTER} cy={CENTER} r={4} fill="#2563eb" />
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={hand.x}
                    y2={hand.y}
                    stroke="#2563eb"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx={hand.x}
                    cy={hand.y}
                    r={18}
                    fill="#2563eb"
                    fillOpacity={mode === "minute" && !minuteIsSnapped ? 0.35 : 1}
                  />
                </svg>

                {Array.from({ length: 12 }, (_, i) => {
                  const outerPos = slotPos(i, OUTER_R);
                  if (mode === "minute") {
                    const m = (i * 5) % 60;
                    const selected = minuteIsSnapped && Math.round(minuteNum / 5) % 12 === i;
                    return (
                      <div
                        key={`m-${i}`}
                        className={`pointer-events-none absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                          selected ? "text-white" : "text-slate-700"
                        }`}
                        style={{ left: outerPos.x, top: outerPos.y }}
                      >
                        {pad(m)}
                      </div>
                    );
                  }
                  const innerPos = slotPos(i, INNER_R);
                  const outerHour = hourForSlot(i, false);
                  const innerHour = hourForSlot(i, true);
                  return (
                    <div key={`h-${i}`} className="contents">
                      <div
                        className={`pointer-events-none absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                          hourNum === outerHour ? "text-white" : "text-slate-700"
                        }`}
                        style={{ left: outerPos.x, top: outerPos.y }}
                      >
                        {outerHour}
                      </div>
                      <div
                        className={`pointer-events-none absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
                          hourNum === innerHour ? "text-white" : "text-slate-400"
                        }`}
                        style={{ left: innerPos.x, top: innerPos.y }}
                      >
                        {pad(innerHour)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMode(mode === "hour" ? "minute" : "hour")}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
              >
                {mode === "hour" ? "לדקות ←" : "→ לשעות"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-blue-600 px-5 py-1.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
