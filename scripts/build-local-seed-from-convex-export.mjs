/**
 * Convert a Convex snapshot export into local demo-store MindtaskerItem JSON.
 * Usage: node scripts/build-local-seed-from-convex-export.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const extractDir = path.join(root, "backups", "convex-export-extract");
const outFile = path.join(root, "web", "public", "babitk-local-seed.json");
const REAL_USER = "kn75ybnz2k1vrk14k4mz7cnefn897bss";
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

function iso(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return new Date().toISOString();
  return new Date(Number(ms)).toISOString();
}

function readJsonl(rel) {
  const file = path.join(extractDir, rel);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function mapDoc(doc, kind) {
  if (doc.userId !== REAL_USER) return null;
  if (doc.deletedAt != null) return null;

  const isActionable =
    kind === "task" ? Boolean(doc.isActionable ?? true) : Boolean(doc.isActionable ?? false);

  const status = doc.status ?? "inbox";
  const sourceType = doc.sourceType ?? (kind === "notebook" ? "notebook_ocr" : "quick_capture");

  return {
    id: doc._id,
    user_id: DEMO_USER_ID,
    source_material_id: doc.sourceStorageId ?? null,
    source_materials:
      doc.sourceType || doc.sourceStorageUrl || doc.sourceRawText || doc.rawText
        ? {
            id: doc.sourceStorageId ?? doc._id,
            source_type: sourceType,
            storage_url: doc.sourceStorageUrl ?? doc.storageUrl ?? null,
            raw_text: doc.sourceRawText ?? doc.rawText ?? null,
            metadata: null,
          }
        : null,
    title: doc.title ?? "",
    content: doc.content ?? doc.correctedText ?? "",
    is_actionable: isActionable,
    status,
    due_date: doc.dueDate ?? null,
    completed_at: doc.completedAt ?? null,
    calendar_event_id: doc.calendarEventId ?? null,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    metadata: doc.metadata ?? { local_kind: kind },
    sort_order: Number(doc.sortOrder ?? doc.createdAt ?? Date.now()),
    last_interacted_at: iso(doc.lastInteractedAt ?? doc.updatedAt ?? doc.createdAt),
    created_at: iso(doc.createdAt ?? doc._creationTime),
    updated_at: iso(doc.updatedAt ?? doc.createdAt ?? doc._creationTime),
    deleted_at: null,
  };
}

const tasks = readJsonl("tasks/documents.jsonl")
  .map((d) => mapDoc(d, "task"))
  .filter(Boolean);
const notebooks = readJsonl("notebooks/documents.jsonl")
  .map((d) => mapDoc(d, "notebook"))
  .filter(Boolean);

const items = [...tasks, ...notebooks].sort(
  (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      version: 1,
      seededFrom: "convex-export-attempt",
      userHint: "erezbabayan@gmail.com (local offline copy)",
      count: items.length,
      items,
    },
    null,
    0,
  ),
  "utf8",
);

console.log(`Wrote ${items.length} items (${tasks.length} tasks, ${notebooks.length} notebooks) -> ${outFile}`);
