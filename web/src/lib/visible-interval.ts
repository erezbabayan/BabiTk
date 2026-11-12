/**
 * Run a background job while the tab is visible: once on start, again when the tab
 * becomes visible (at most every `minGapMs`), and every `intervalMs` while visible.
 * Hidden tabs do no work (pg_cron still catches up the WhatsApp group server-side).
 */
export interface VisibilityHost {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface TimerHost {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  now(): number;
}

export const WHATSAPP_CATCHUP_INTERVAL_MS = 5 * 60_000;
export const WHATSAPP_CATCHUP_MIN_GAP_MS = 20_000;

export function startVisibleInterval(
  run: () => void,
  options: {
    intervalMs: number;
    minGapMs: number;
    doc: VisibilityHost;
    timers: TimerHost;
  },
): () => void {
  const { intervalMs, minGapMs, doc, timers } = options;
  let timer: unknown = null;
  let lastRunAt = Number.NEGATIVE_INFINITY;

  const tick = () => {
    if (doc.hidden) return;
    lastRunAt = timers.now();
    run();
  };
  const start = () => {
    if (timer !== null) return;
    timer = timers.setInterval(tick, intervalMs);
  };
  const stop = () => {
    if (timer === null) return;
    timers.clearInterval(timer);
    timer = null;
  };
  const onVisibility = () => {
    if (doc.hidden) {
      stop();
      return;
    }
    if (timers.now() - lastRunAt >= minGapMs) tick();
    start();
  };

  tick();
  if (!doc.hidden) start();
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    stop();
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
