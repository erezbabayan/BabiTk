import { AppState } from "react-native";

import { itemsInColumn, sortColumnItems } from "../lib/item-columns";
import { collectPagedRows } from "../lib/supabase-paginate";
import { isDemoMode, isSupabaseConfigured, normalizeMindtaskerRows, supabase } from "../lib/supabase";
import { shouldBackgroundRefresh } from "./widget-model";
import { readWidgetSnapshot } from "./widget-storage";
import { syncWidgetBoards } from "./widget-sync";

const WIDGET_SELECT = "id, title, content, is_actionable, status, due_date, sort_order, created_at, deleted_at";
const FETCH_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("widget_refresh_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function fetchBoards(): Promise<boolean> {
  // Uses the app's stored session. getSession() refreshes an expired access token
  // with the same client and storage the app uses (no new login, no sign-out here).
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return false; // Not signed in (or session unavailable): keep the last snapshot.

  const rows = await collectPagedRows((from, to) =>
    supabase
      .from("mindtasker_items")
      .select(WIDGET_SELECT)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("status", ["inbox", "pending"])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  const items = normalizeMindtaskerRows(rows);
  await syncWidgetBoards({
    inbox: sortColumnItems(itemsInColumn(items, "inbox")),
    today: sortColumnItems(itemsInColumn(items, "today")),
    notes: sortColumnItems(itemsInColumn(items, "notes")),
  });
  return true;
}

let inFlight: Promise<boolean> | null = null;
let resumeListener = false;

/**
 * supabase-js runs a 30s token ticker whenever its client exists. When only the
 * widget woke the JS runtime (app not on screen), stop it so a cached process does
 * not keep ticking; restart it as soon as the app comes to the foreground.
 */
function parkAutoRefreshWhileHidden(): void {
  try {
    if (AppState.currentState === "active") return;
    void supabase.auth.stopAutoRefresh();
    if (!resumeListener) {
      resumeListener = true;
      AppState.addEventListener("change", (state) => {
        if (state === "active") void supabase.auth.startAutoRefresh();
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Called from the headless widget task on the periodic WIDGET_UPDATE (~30 min).
 * Best-effort: throttled, time-boxed, never throws; on any failure the widget
 * keeps showing the last snapshot.
 */
export async function refreshWidgetInBackground(now: number = Date.now()): Promise<boolean> {
  if (!isSupabaseConfigured || isDemoMode) return false;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const previous = await readWidgetSnapshot();
      if (!shouldBackgroundRefresh(previous, now)) return false;
      return await withTimeout(fetchBoards(), FETCH_TIMEOUT_MS);
    } catch {
      return false;
    } finally {
      parkAutoRefreshWhileHidden();
      inFlight = null;
    }
  })();
  return inFlight;
}
