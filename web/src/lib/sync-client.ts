import { isDemoMode } from "./supabase";

const SYNC_TOKEN =
  import.meta.env.VITE_SYNC_TOKEN?.trim() || "mindtasker-local-sync";

export function isSyncEnabled(): boolean {
  return (
    isDemoMode &&
    (import.meta.env.VITE_SYNC_ENABLED ?? "true").toLowerCase() !== "false"
  );
}

function syncBase(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (configured) return `${configured.replace(/\/$/, "")}/api/sync`;
  return "/api/sync";
}

async function syncFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${syncBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SYNC_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const message = body.message ?? `Sync error ${res.status}`;
    throw new Error(message === "Failed to fetch" ? "לא ניתן להתחבר לשרת הסנכרון" : message);
  }

  return res.json() as Promise<T>;
}

export interface SyncSnapshot<T> {
  version: number;
  items: T[];
}

type SyncItemsResponse<T> =
  | SyncSnapshot<T>
  | { changed: false; version: number }
  | { changed: true; version: number; items: T[] };

export async function fetchSyncItems<T>(): Promise<SyncSnapshot<T>> {
  return syncFetch<SyncSnapshot<T>>("/items");
}

export async function fetchSyncItemsIfChanged<T>(
  knownVersion: number | null,
): Promise<{ changed: false; version: number } | { changed: true; snapshot: SyncSnapshot<T> }> {
  const path =
    knownVersion !== null ? `/items?sinceVersion=${knownVersion}` : "/items";
  const data = await syncFetch<SyncItemsResponse<T>>(path);

  if ("changed" in data) {
    if (!data.changed) {
      return { changed: false, version: data.version };
    }
    return {
      changed: true,
      snapshot: { version: data.version, items: data.items },
    };
  }

  if (knownVersion !== null && data.version === knownVersion) {
    return { changed: false, version: data.version };
  }

  return { changed: true, snapshot: data };
}

export async function createSyncItem<T>(item: T): Promise<{ item: T; version: number }> {
  return syncFetch<{ item: T; version: number }>("/items", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export async function patchSyncItem<T>(
  id: string,
  patch: Record<string, unknown>,
): Promise<{ item: T; version: number }> {
  return syncFetch<{ item: T; version: number }>(`/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteSyncItem(id: string): Promise<{ version: number }> {
  return syncFetch<{ ok: true; version: number }>(`/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchSyncTrash<T>(): Promise<T[]> {
  const data = await syncFetch<{ items: T[] }>("/trash");
  return data.items;
}

export async function hardDeleteSyncItem(id: string): Promise<void> {
  await syncFetch(`/items/${encodeURIComponent(id)}/permanent`, { method: "DELETE" });
}

export async function ingestTextSync(params: {
  text: string;
  sourceType?: "whatsapp_text" | "whatsapp_voice" | "notebook_ocr" | "typed_text" | "image" | "document";
  timezone?: string;
  locale?: string;
}): Promise<void> {
  await syncFetch("/ingest/text", {
    method: "POST",
    body: JSON.stringify({
      text: params.text,
      sourceType: params.sourceType ?? "whatsapp_text",
      timezone: params.timezone,
      locale: params.locale ?? "he-IL",
    }),
  });
}
