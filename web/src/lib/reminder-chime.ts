/** Short two-tone chime for in-app reminder alerts (no asset file required). */

let audioCtx: AudioContext | null = null;

function getAudioContextConstructor(): (typeof AudioContext) | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

/** Unlock Web Audio after a user gesture so the chime can play on mobile browsers. */
export function unlockReminderAudio(): void {
  try {
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    // Ignore autoplay-policy failures.
  }
}

export function playReminderChime(): void {
  try {
    unlockReminderAudio();
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return;
    const ctx = audioCtx ?? new AudioCtx();
    audioCtx = ctx;
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
  } catch {
    // Autoplay may be blocked until a user gesture; ignore.
  }
}

export function reminderServiceWorkerUrl(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}reminder-sw.js`;
}

export async function registerReminderServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const base =
      typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.BASE_URL === "string"
        ? import.meta.env.BASE_URL
        : "/";
    return await navigator.serviceWorker.register(reminderServiceWorkerUrl(base));
  } catch {
    return null;
  }
}

export async function ensureBrowserNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  await registerReminderServiceWorker();
  const result = await Notification.requestPermission();
  return result === "granted";
}

function vibrateReminder(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([180, 80, 180]);
    }
  } catch {
    // Ignore vibrate failures (desktop, denied, etc).
  }
}

async function showViaServiceWorker(title: string, body: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration()) ?? (await registerReminderServiceWorker());
    if (!registration) return false;
    await registration.showNotification(title, {
      body,
      lang: "he",
      dir: "rtl",
      tag: "mindtasker-reminder",
      silent: false,
      vibrate: [180, 80, 180],
      renotify: true,
      data: { url: typeof location !== "undefined" ? location.href : "./" },
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}

/**
 * OS notification for due reminders. Android Chrome requires a service worker;
 * desktop can use the page Notification constructor as a fallback.
 */
export function showBrowserReminderNotification(title: string, body: string): void {
  vibrateReminder();
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  void (async () => {
    const shown = await showViaServiceWorker(title, body);
    if (shown) return;
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
  })();
}
