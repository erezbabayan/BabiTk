/**
 * Learning from user corrections after ingest.
 * Pure helpers — DB I/O lives in ingestLessons.ts.
 */

export type IngestLessonKind =
  | "tag_remap"
  | "topic_tag"
  | "prefer_split"
  | "prefer_merge";

export type IngestLesson = {
  kind: IngestLessonKind;
  cueText: string;
  fromValue?: string;
  toValue: string;
  weight: number;
};

const STOP_WORDS = new Set([
  "את",
  "של",
  "על",
  "עם",
  "זה",
  "זו",
  "יש",
  "לא",
  "כי",
  "אם",
  "גם",
  "או",
  "עד",
  "כל",
  "מה",
  "מי",
  "הוא",
  "היא",
  "אני",
  "אנחנו",
  "צריך",
  "לעשות",
  "בתאריך",
  "בשעה",
  "מחר",
  "היום",
]);

/** Build a short cue from capture text for matching later. */
export function buildLessonCue(text: string, maxTokens = 6): string {
  const tokens = text
    .replace(/[^\u0590-\u05FFa-zA-Z0-9\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

  const unique: string[] = [];
  for (const token of tokens) {
    if (!unique.includes(token)) unique.push(token);
    if (unique.length >= maxTokens) break;
  }
  return unique.join(" ").trim() || text.slice(0, 40).trim();
}

export function cueMatchesText(cueText: string, text: string): boolean {
  const cueTokens = cueText.split(/\s+/).filter(Boolean);
  if (cueTokens.length === 0) return false;
  const hay = text.replace(/\s+/g, " ");
  const hits = cueTokens.filter((token) => hay.includes(token)).length;
  const need = Math.min(2, cueTokens.length);
  return hits >= need;
}

function arraysEqualAsSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

export type CorrectionSnapshot = {
  sourceText: string;
  beforeTags: string[];
  afterTags: string[];
  beforeTitle?: string;
  afterTitle?: string;
};

/** Derive lessons from a user edit vs original parse snapshot. */
export function deriveLessonsFromCorrection(
  snapshot: CorrectionSnapshot,
): IngestLesson[] {
  const lessons: IngestLesson[] = [];
  const cue = buildLessonCue(snapshot.sourceText);
  if (!cue) return lessons;

  const before = snapshot.beforeTags.map((t) => t.trim()).filter(Boolean);
  const after = snapshot.afterTags.map((t) => t.trim()).filter(Boolean);

  if (!arraysEqualAsSets(before, after)) {
    const removed = before.filter((t) => !after.includes(t));
    const added = after.filter((t) => !before.includes(t));

    for (const to of added) {
      for (const from of removed.length > 0 ? removed : [""]) {
        lessons.push({
          kind: "tag_remap",
          cueText: cue,
          fromValue: from || undefined,
          toValue: to,
          weight: 1,
        });
      }
      lessons.push({
        kind: "topic_tag",
        cueText: cue,
        toValue: to,
        weight: 1,
      });
    }
  }

  return lessons;
}

/** Apply learned tag remaps / topic tags to inferred tags. */
export function applyLearnedTagLessons(
  tags: string[],
  text: string,
  lessons: IngestLesson[],
  allowedTags?: string[],
): string[] {
  if (!lessons.length) return tags;

  const pool = (allowedTags ?? []).map((t) => t.trim()).filter(Boolean);
  let next = [...tags];

  const relevant = lessons
    .filter((lesson) => cueMatchesText(lesson.cueText, text))
    .sort((a, b) => b.weight - a.weight);

  for (const lesson of relevant) {
    if (lesson.kind !== "tag_remap" && lesson.kind !== "topic_tag") continue;

    const toAllowed =
      pool.length === 0
        ? lesson.toValue
        : pool.find((t) => t === lesson.toValue) ?? null;
    if (!toAllowed) continue;

    if (lesson.kind === "tag_remap" && lesson.fromValue) {
      next = next.filter((t) => t !== lesson.fromValue);
    }
    if (!next.includes(toAllowed)) next.push(toAllowed);
  }

  return [...new Set(next)].slice(0, 3);
}

/** Prompt block for OpenAI with user-learned preferences. */
export function buildLearnedPreferencesPrompt(lessons: IngestLesson[]): string {
  const top = [...lessons]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);
  if (top.length === 0) return "";

  const lines = top.map((lesson) => {
    if (lesson.kind === "tag_remap") {
      return `- כשמופיע משהו כמו "${lesson.cueText}"${
        lesson.fromValue ? ` (לא "${lesson.fromValue}")` : ""
      } → תג "${lesson.toValue}"`;
    }
    if (lesson.kind === "topic_tag") {
      return `- כשמופיע "${lesson.cueText}" → תעדיף תג "${lesson.toValue}"`;
    }
    if (lesson.kind === "prefer_split") {
      return `- כשמופיע "${lesson.cueText}" → פצל למספר משימות נפרדות`;
    }
    return `- כשמופיע "${lesson.cueText}" → שמור כמשימה אחת`;
  });

  return `## העדפות שנלמדו מתיקוני המשתמש (חובה לכבד)
${lines.join("\n")}
`;
}
