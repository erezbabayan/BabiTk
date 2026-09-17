export type ChecklistEntry = {
  id: string;
  text: string;
  done: boolean;
};

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseChecklist(metadata: unknown): ChecklistEntry[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as Record<string, unknown>).checklist;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const rec = row as Record<string, unknown>;
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      if (!text) return null;
      return {
        id: typeof rec.id === "string" && rec.id ? rec.id : randomId(),
        text,
        done: rec.done === true,
      };
    })
    .filter((row): row is ChecklistEntry => Boolean(row));
}

export function withChecklist(
  metadata: unknown,
  checklist: ChecklistEntry[],
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (checklist.length === 0) {
    delete base.checklist;
    return base;
  }
  base.checklist = checklist;
  return base;
}

export function toggleChecklistEntry(
  checklist: ChecklistEntry[],
  id: string,
): ChecklistEntry[] {
  return checklist.map((entry) =>
    entry.id === id ? { ...entry, done: !entry.done } : entry,
  );
}

export function entriesFromTitles(titles: string[]): ChecklistEntry[] {
  return titles
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ id: randomId(), text, done: false }));
}
