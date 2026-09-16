const VERSION_STORAGE_KEY = "babitk:app-version";
const RELOAD_GUARD_KEY = "babitk:version-reload";

function versionUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}app-version.json?t=${Date.now()}`;
}

function isLocalHost(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

async function readDeployVersion(): Promise<string | null> {
  const response = await fetch(versionUrl(), { cache: "no-store" });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("v" in payload)) return null;
  const value = (payload as { v: unknown }).v;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Reload once when GitHub Pages has a newer deploy than this tab. */
export function watchDeployVersion(): void {
  if (typeof window === "undefined" || isLocalHost()) return;

  async function check(): Promise<void> {
    try {
      const next = await readDeployVersion();
      if (!next) return;
      const previous = localStorage.getItem(VERSION_STORAGE_KEY);
      if (previous && previous !== next && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
        localStorage.setItem(VERSION_STORAGE_KEY, next);
        const url = new URL(window.location.href);
        url.searchParams.set("_r", String(Date.now()));
        window.location.replace(url.toString());
        return;
      }
      localStorage.setItem(VERSION_STORAGE_KEY, next);
    } catch {
      // Ignore network / JSON errors — the app can still run.
    }
  }

  void check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void check();
    }
  });
}
