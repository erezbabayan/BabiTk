import type { Id } from "../../../convex/_generated/dataModel";
import type { MindtaskerItem } from "../lib/supabase";

type SourceMaterial = NonNullable<MindtaskerItem["source_materials"]>;

type UnifiedItem = {
  _id: string;
  kind: "task" | "notebook";
  userId: Id<"users">;
  title: string;
  content: string;
  isActionable: boolean;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  calendarEventId: string | null;
  tags: string[];
  metadata: unknown;
  sourceType: string | null;
  sourceStorageUrl: string | null;
  sourceStorageId: Id<"_storage"> | null;
  sourceRawText: string | null;
  sortOrder: number;
  lastInteractedAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function toSourceMaterial(doc: UnifiedItem): SourceMaterial | null {
  if (!doc.sourceType && !doc.sourceStorageUrl && !doc.sourceRawText) {
    return null;
  }

  return {
    id: doc.sourceStorageId ?? doc._id,
    source_type: (doc.sourceType ?? "whatsapp_text") as SourceMaterial["source_type"],
    storage_url: doc.sourceStorageUrl,
    raw_text: doc.sourceRawText,
    metadata: (doc.metadata as Record<string, unknown> | null) ?? null,
  };
}

export function convexItemToMindtasker(doc: UnifiedItem): MindtaskerItem {
  return {
    id: doc._id,
    source_material_id: doc.sourceStorageId ?? null,
    source_materials: toSourceMaterial(doc),
    title: doc.title,
    content: doc.content,
    is_actionable: doc.isActionable,
    status: doc.status as MindtaskerItem["status"],
    due_date: doc.dueDate,
    completed_at: doc.completedAt,
    tags: doc.tags,
    metadata: (doc.metadata as MindtaskerItem["metadata"]) ?? null,
    sort_order: doc.sortOrder,
    last_interacted_at: iso(doc.lastInteractedAt),
    created_at: iso(doc.createdAt),
    deleted_at: doc.deletedAt ? iso(doc.deletedAt) : null,
  };
}

const PATCH_KEY_MAP: Record<string, string> = {
  is_actionable: "isActionable",
  due_date: "dueDate",
  completed_at: "completedAt",
  calendar_event_id: "calendarEventId",
  sort_order: "sortOrder",
  last_interacted_at: "lastInteractedAt",
  deleted_at: "deletedAt",
};

function parseTimestamp(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function mindtaskerPatchToConvex(
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    const mapped = PATCH_KEY_MAP[key] ?? key;
    // Schema: completedAt is ISO string; deletedAt/lastInteractedAt are epoch ms.
    if (mapped === "deletedAt" || mapped === "lastInteractedAt") {
      result[mapped] = parseTimestamp(value);
      continue;
    }
    if (mapped === "completedAt") {
      if (value === undefined) continue;
      if (value === null) {
        result[mapped] = null;
        continue;
      }
      if (typeof value === "string") {
        result[mapped] = value;
        continue;
      }
      if (typeof value === "number") {
        result[mapped] = new Date(value).toISOString();
        continue;
      }
      result[mapped] = null;
      continue;
    }
    result[mapped] = value;
  }

  return result;
}

export function asConvexItemId(id: string): string {
  return id;
}
