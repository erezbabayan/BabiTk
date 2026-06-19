import type { MindtaskerItem } from "./supabase";

const SEED_ID_PREFIX = "test-seed-";

function nowIso(): string {
  return new Date().toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function baseItem(
  id: string,
  patch: Partial<MindtaskerItem> & Pick<MindtaskerItem, "title" | "content" | "is_actionable" | "status">,
): MindtaskerItem {
  const ts = nowIso();
  return {
    id: `${SEED_ID_PREFIX}${id}`,
    title: patch.title,
    content: patch.content,
    is_actionable: patch.is_actionable,
    status: patch.status,
    due_date: patch.due_date ?? null,
    completed_at: patch.completed_at ?? null,
    deleted_at: patch.deleted_at ?? null,
    tags: patch.tags ?? [],
    sort_order: patch.sort_order ?? Date.now(),
    last_interacted_at: patch.last_interacted_at ?? ts,
    created_at: patch.created_at ?? ts,
    source_material_id: patch.source_material_id ?? null,
    source_materials: patch.source_materials ?? null,
    metadata: patch.metadata ?? {},
  };
}

/** Fixed sample set for manual QA in demo mode. */
export function buildDemoTestItems(): MindtaskerItem[] {
  const srcVoice = {
    id: `${SEED_ID_PREFIX}src-voice`,
    source_type: "whatsapp_voice",
    storage_url: null,
    raw_text: "היי, תזכיר לי להתקשר לרואה חשבון מחר בבוקר",
  };

  return [
    baseItem("inbox-task", {
      title: "להתקשר לרואה חשבון",
      content: "לשאול על דוח שנתי 2025",
      is_actionable: true,
      status: "inbox",
      source_material_id: srcVoice.id,
      source_materials: srcVoice,
      tags: ["כסף"],
      sort_order: 10,
    }),
    baseItem("inbox-note", {
      title: "קוד כניסה לבניין",
      content: "קוד שער: 4821#",
      is_actionable: false,
      status: "inbox",
      tags: ["בניין"],
      sort_order: 20,
    }),
    baseItem("today-due", {
      title: "לשלוח הצעת מחיר ללקוח",
      content: "כולל פירוט שעות פיתוח",
      is_actionable: true,
      status: "pending",
      due_date: hoursFromNow(3),
      tags: ["עבודה"],
      sort_order: 10,
    }),
    baseItem("today-open", {
      title: "לקנות חלב וביצים",
      content: "בדרך מהעבודה הביתה",
      is_actionable: true,
      status: "pending",
      tags: ["בית"],
      sort_order: 20,
    }),
    baseItem("note-idea", {
      title: "רעיון לדשבורד",
      content: "3 עמודות: המחברת, משימות לביצוע, הערות — מסונכרן בין מחשב לטלפון",
      is_actionable: false,
      status: "pending",
      tags: ["רעיונות"],
      sort_order: 10,
    }),
    baseItem("note-meeting", {
      title: "סיכום פגישת צוות",
      content: "הוחלט על סנכרון דו-שבועי ועדכון שמות הבורדים",
      is_actionable: false,
      status: "pending",
      tags: ["עבודה", "צוות"],
      sort_order: 20,
    }),
    baseItem("archive-task", {
      title: "משימה ישנה בארכיון",
      content: "דוגמה לפריט שעבר לארכיון משימות",
      is_actionable: true,
      status: "snoozed_archive",
      last_interacted_at: daysAgo(3),
      tags: ["ארכיון"],
      sort_order: 30,
    }),
    baseItem("archive-note", {
      title: "הערה בארכיון",
      content: "דוגמה להערה שעברה לארכיון",
      is_actionable: false,
      status: "snoozed_archive",
      last_interacted_at: daysAgo(5),
      tags: ["ארכיון"],
      sort_order: 40,
    }),
    baseItem("completed-task", {
      title: "משימה שהושלמה",
      content: "דוגמה לפריט שסומן כבוצע",
      is_actionable: true,
      status: "completed",
      completed_at: daysAgo(1),
      tags: ["בוצע"],
      sort_order: 50,
    }),
  ];
}

export function isDemoSeedItemId(id: string): boolean {
  return id.startsWith(SEED_ID_PREFIX);
}
