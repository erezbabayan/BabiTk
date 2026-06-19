import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import type { MindtaskerItem } from "../types";
import { DEMO_USER_ID } from "./demo-store";
import { fetchSyncItems } from "./sync-client";
import { isConvexConfigured } from "./convex";

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient | null {
  const url = import.meta.env.VITE_CONVEX_URL?.trim() ?? "";
  if (!isConvexConfigured || !url) return null;
  if (!client) {
    client = new ConvexHttpClient(url);
  }
  return client;
}

export function isConvexMirrorEnabled(): boolean {
  if (import.meta.env.VITE_USE_CONVEX === "false") return false;
  return isConvexConfigured;
}

function toSyncPayload(item: MindtaskerItem) {
  return {
    id: item.id,
    user_id: item.user_id ?? DEMO_USER_ID,
    source_material_id: item.source_material_id ?? null,
    source_materials: item.source_materials
      ? {
          id: item.source_materials.id,
          source_type: item.source_materials.source_type,
          storage_url: item.source_materials.storage_url,
          raw_text: item.source_materials.raw_text,
          metadata: item.source_materials.metadata ?? {},
        }
      : null,
    title: item.title,
    content: item.content ?? "",
    is_actionable: item.is_actionable,
    status: item.status,
    due_date: item.due_date,
    completed_at: item.completed_at,
    tags: item.tags ?? [],
    metadata: item.metadata ?? {},
    sort_order: item.sort_order,
    last_interacted_at: item.last_interacted_at,
    created_at: item.created_at,
    updated_at: item.updated_at,
    deleted_at: item.deleted_at ?? null,
  };
}

export async function mirrorItemToConvex(item: MindtaskerItem): Promise<void> {
  const convex = getClient();
  if (!convex || !isConvexMirrorEnabled()) return;

  try {
    await convex.mutation(api.seed.importSync, {
      legacyUserId: item.user_id ?? DEMO_USER_ID,
      items: [toSyncPayload(item)],
    });
  } catch (error) {
    console.warn("Convex mirror failed", error);
  }
}

export async function resyncAllItemsToConvex(): Promise<void> {
  const convex = getClient();
  if (!convex || !isConvexMirrorEnabled()) return;

  try {
    const snapshot = await fetchSyncItems<MindtaskerItem>();
    if (!snapshot.items.length) return;
    await convex.mutation(api.seed.importSync, {
      legacyUserId: DEMO_USER_ID,
      items: snapshot.items.map((item) => toSyncPayload(item)),
    });
  } catch (error) {
    console.warn("Convex resync failed", error);
  }
}
