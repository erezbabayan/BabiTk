/** Short two-tone chime for in-app reminder alerts (no asset file required). */
export function playReminderChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    function beep(start: number, frequency: number, duration: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }

    beep(now, 880, 0.18);
    beep(now + 0.22, 1174.7, 0.28);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 800);
  } catch {
    // Autoplay may be blocked until a user gesture; ignore.
  }
}

export async function ensureBrowserNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showBrowserReminderNotification(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      lang: "he",
      dir: "rtl",
      silent: false,
      tag: "mindtasker-reminder",
      // @ts-expect-error renotify is supported in Chromium but missing from TS DOM lib
      renotify: true,
    });
    window.setTimeout(() => notification.close(), 12_000);
  } catch {
    // Ignore Notification API failures.
  }
}
