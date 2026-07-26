import type { ParsedItem } from "../../types/ai.js";
import { stripTemporalPhrases } from "../../services/hebrew-date-resolver.service.js";

/**
 * Topic-title pipeline
 * --------------------
 * Goal: turn a full capture into a short label of *what the item is about*,
 * not the schedule and not the full sentence.
 *
 * Priority order (first match wins):
 *  1. Meeting  — "שיחה עם המחט"
 *  2. Et-object — "את גמר המונדיאל" → "גמר המונדיאל"
 *  3. Al/Shel  — "על / של …"
 *  4. Action+object infinitive — "להכין כובעים לנופש"
 *  5. Strip leading topic-first verb — לראות/לצפות/…
 *  6. Clamped leftover clause
 */

const FILLER_PREFIX =
  /^(?:תזכיר לי|תזכירי לי|תזכורת(?:\s+ל)?|שים לב|שימי לב|אמ+|אה+|שומע|שומעת|כאילו|בעצם|צריך(?:\s+ל)?|בבקשה)[,\s]*/iu;

const MAX_TITLE_WORDS = 5;
const MAX_TITLE_CHARS = 42;

const HEB = "[\\u0590-\\u05FF'\"-]";

const TOPIC_FIRST_VERB =
  /^(?:לראות|לצפות(?:\s+ב)?|לשמוע|להאזין|לקרוא|לכתוב|לסיים|לגמור|לסיים\s+לראות)(?=\s|$)/u;

const MEETING_KIND = "שיחה|פגישה|ישיבה|סנכרון|ועידה|ראיון";

const WITH_PERSON =
  /\s+ביחד\s+עם\s+[\u0590-\u05FF'"-]+(?:\s+[\u0590-\u05FF'"-]+)?/giu;

// "להכין עם אביה כובעים לנופש" → the companion right after the verb is context;
// the real object follows it. Communication verbs are excluded because there the
// person is the object ("לדבר עם יוסי").
const VERB_COMPANION = new RegExp(
  `^(ל${HEB}+)\\s+עם\\s+${HEB}+(?=\\s+${HEB})`,
  "u",
);

const COMPANION_KEEP_VERB =
  /^(?:לדבר|לשוחח|להתקשר|לפגוש|להיפגש|לתאם|לקבוע|לסנכרן|להתייעץ|לשבת)$/u;

const MONTH_CONTEXT =
  /\s+ב(?:חודש\s+)?(?:ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/giu;

const PLANNING_TAIL =
  /\s*,?\s*צריך\s+ל[\u0590-\u05FF'"-]+.*$/iu;

function cleanFiller(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(FILLER_PREFIX, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

export function pickTaskNarrative(item: ParsedItem, sourceText?: string): string {
  const candidates = [
    sourceText?.trim() ?? "",
    item.content.trim(),
    item.title.trim(),
    item.analysis.task !== "חסר" ? item.analysis.task.trim() : "",
  ].filter((value) => value.length > 0);

  return candidates.reduce(
    (longest, value) => (value.length > longest.length ? value : longest),
    "",
  );
}

function firstClause(text: string): string {
  const head = text.split(/[,;]/)[0]?.trim();
  return head && head.length >= 3 ? head : text.trim();
}

function clampTitle(title: string): string {
  let clause = title.replace(/\s+/g, " ").trim();
  const words = clause.split(/\s+/).filter(Boolean);
  if (words.length > MAX_TITLE_WORDS) {
    clause = words.slice(0, MAX_TITLE_WORDS).join(" ");
  }
  if (clause.length > MAX_TITLE_CHARS) {
    const cut = clause.slice(0, MAX_TITLE_CHARS);
    const lastSpace = cut.lastIndexOf(" ");
    clause = (lastSpace > 18 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return clause;
}

function normalizeTopicSpelling(topic: string): string {
  return topic
    .replace(/(?<![\u0590-\u05FF])המוניאל(?![\u0590-\u05FF])/gu, "המונדיאל")
    .replace(/(?<![\u0590-\u05FF])מוניאל(?![\u0590-\u05FF])/gu, "מונדיאל");
}

function stripVerbCompanion(clause: string): string {
  const match = VERB_COMPANION.exec(clause);
  const verb = match?.[1];
  if (!match || !verb || COMPANION_KEEP_VERB.test(verb)) return clause;
  return clause.replace(match[0], verb);
}

export function prepareTopicSource(narrative: string): string {
  let clause = cleanFiller(narrative);
  clause = firstClause(clause);
  clause = clause.replace(PLANNING_TAIL, "").trim();
  clause = stripTemporalPhrases(clause);
  clause = clause.replace(MONTH_CONTEXT, "").trim();
  clause = clause.replace(WITH_PERSON, "").trim();
  clause = stripVerbCompanion(clause);
  return clause.replace(/\s+/g, " ").trim();
}

function tryMeetingTopic(text: string): string | null {
  const re = new RegExp(
    `^(${MEETING_KIND})(?:\\s+עם\\s+${HEB}+(?:\\s+${HEB}+){0,2})?`,
    "u",
  );
  const match = text.match(re);
  if (!match?.[0]) return null;
  if (match[0].includes("עם") || match[0].length >= 3) {
    return clampTitle(match[0]);
  }
  return null;
}

function tryEtObjectTopic(text: string): string | null {
  const match = text.match(
    new RegExp(
      `(?:^|[\\s,])את\\s+(${HEB}+(?:\\s+${HEB}+){0,3})(?=\\s|$|,|;)`,
      "u",
    ),
  );
  if (!match?.[1]) return null;
  return clampTitle(normalizeTopicSpelling(match[1].trim()));
}

function tryAlShelTopic(text: string): string | null {
  const al = text.match(
    new RegExp(
      `(?:^|[\\s,])(?:על|בנוגע\\s+ל|לגבי)\\s+(${HEB}+(?:\\s+${HEB}+){0,3})(?=\\s|$|,|;)`,
      "u",
    ),
  );
  if (al?.[1]) return clampTitle(normalizeTopicSpelling(al[1].trim()));

  const headed = text.match(
    new RegExp(
      `(${HEB}+)\\s+של\\s+(${HEB}+(?:\\s+${HEB}+)?)(?=\\s|$|,|;)`,
      "u",
    ),
  );
  if (headed?.[1] && headed[2]) {
    return clampTitle(normalizeTopicSpelling(`${headed[1]} של ${headed[2]}`.trim()));
  }
  return null;
}

function tryTopicFirstVerb(text: string): string | null {
  if (!TOPIC_FIRST_VERB.test(text)) return null;
  const et = tryEtObjectTopic(text);
  if (et) return et;
  const alShel = tryAlShelTopic(text);
  if (alShel) return alShel;
  const withoutVerb = text
    .replace(TOPIC_FIRST_VERB, "")
    .replace(/^\s*(?:את|על|ב)\s+/u, "")
    .trim();
  if (withoutVerb.length >= 2) {
    return clampTitle(normalizeTopicSpelling(withoutVerb));
  }
  return null;
}

function tryActionObjectTopic(text: string): string | null {
  // Infinitive + 1–2 object words: "להכין כובעים לנופש", "לקנות חלב"
  const match = text.match(
    new RegExp(`^(ל${HEB}+(?:\\s+${HEB}+){1,2})(?=\\s|$|,|;)`, "u"),
  );
  if (!match?.[1]) return null;
  if (match[1].split(/\s+/).length < 2) return null;
  return clampTitle(match[1].trim());
}

/** Summarize the topic of a capture into a short board title. */
export function summarizeTopicTitle(narrative: string): string {
  const text = prepareTopicSource(narrative);
  if (!text) return "";

  return (
    tryMeetingTopic(text) ??
    tryTopicFirstVerb(text) ??
    tryEtObjectTopic(text) ??
    tryAlShelTopic(text) ??
    tryActionObjectTopic(text) ??
    clampTitle(normalizeTopicSpelling(text))
  );
}

export function deriveShortTaskTitle(narrative: string): string {
  return summarizeTopicTitle(narrative);
}

export function deriveTaskContent(
  narrative: string,
  shortTitle: string,
  existingContent: string,
  sourceText?: string,
): string {
  const short = shortTitle.trim();
  const candidates = [
    sourceText?.trim() ?? "",
    existingContent.trim(),
    narrative.trim(),
  ].filter(Boolean);

  const full = candidates.reduce(
    (longest, value) => (value.length > longest.length ? value : longest),
    "",
  );

  if (!full) return "";
  if (full === short) return "";
  // Only drop content when the capture is literally title + schedule words.
  if (stripTemporalPhrases(cleanFiller(full)) === short) return "";
  return full;
}

function titleStillHasScheduleNoise(title: string): boolean {
  const stripped = stripTemporalPhrases(title.trim());
  return stripped !== title.trim() || stripped.length < title.trim().length * 0.7;
}

export function shouldRefineTaskPresentation(
  title: string,
  content: string,
  narrative: string,
): boolean {
  const trimmedTitle = title.trim();
  const trimmedNarrative = narrative.trim();
  if (!trimmedNarrative) return false;

  const derived = summarizeTopicTitle(trimmedNarrative);
  if (derived && derived !== trimmedTitle) {
    if (derived.length <= trimmedTitle.length) return true;
    if (trimmedNarrative.length > trimmedTitle.length + 8) return true;
  }

  if (!content.trim() && trimmedNarrative.length > 36) return true;
  if (trimmedTitle.length > MAX_TITLE_CHARS) return true;
  if (trimmedNarrative.length > trimmedTitle.length + 12) return true;
  if (trimmedTitle === trimmedNarrative) return true;
  if (/,\s*צריך\s+ל/u.test(trimmedTitle)) return true;
  if (titleStillHasScheduleNoise(trimmedTitle)) return true;
  if (TOPIC_FIRST_VERB.test(trimmedTitle) && trimmedNarrative.length > trimmedTitle.length) {
    return true;
  }
  return false;
}

export function normalizeTaskPresentation(
  item: Pick<ParsedItem, "title" | "content" | "analysis">,
  sourceText?: string,
): { title: string; content: string; analysisTask?: string } {
  const narrative = pickTaskNarrative(
    {
      title: item.title,
      content: item.content,
      is_actionable: true,
      due_date: null,
      tags: [],
      analysis: item.analysis,
    },
    sourceText,
  );

  if (!shouldRefineTaskPresentation(item.title, item.content, narrative)) {
    return { title: item.title.trim(), content: item.content.trim() };
  }

  const shortTitle = summarizeTopicTitle(narrative) || item.title.trim();
  const content = deriveTaskContent(narrative, shortTitle, item.content, sourceText);

  return {
    title: shortTitle,
    content,
    analysisTask: shortTitle,
  };
}
