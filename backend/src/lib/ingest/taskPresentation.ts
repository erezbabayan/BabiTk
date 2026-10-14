import type { ParsedItem } from "../../types/ai.js";
import { stripTemporalPhrases } from "../../services/hebrew-date-resolver.service.js";

/**
 * Topic-title pipeline (journalism lead / 5W1H, extractive)
 * ---------------------------------------------------------
 * A board title is a half-sentence of *what is actually in the capture*:
 * who / what / where — never a generic label like "תיאום פגישה" when the
 * transcript names the contractor and the road.
 *
 * Keep in sync with convex/lib/ingest/taskPresentation.ts
 */

const FILLER_PREFIX =
  /^(?:תכניס|תכניסי|תוסיף|תוסיפי|תוסיפו|תרשום|תרשמי|רשום|רשמי|שימי|שים)(?:\s+לי)?[,:]?(?:\s+(?:משימה|משימות|הערה|הערות|תזכורת|פריט))?[,:]?[,\s]*|^(?:תזכיר לי|תזכירי לי|תזכורת(?:\s+ל)?|שים לב|שימי לב|אמ+|אה+|שומע|שומעת|כאילו|בעצם|צריך(?:\s+ל)?|בבקשה)[,\s]*/iu;

/** Half-sentence: long enough for who/what/where, short enough for a board row. */
const MAX_TITLE_WORDS = 12;
const MAX_TITLE_CHARS = 80;

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

const ALSO_CAPTURE_TAIL =
  /\s+וא?\s+גם\s+.+$/iu;

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

function flattenProse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitClauses(text: string): string[] {
  return text
    .split(/[,;]+/)
    .map((part) => part.replace(/^[\s.]+|[\s.]+$/g, "").trim())
    .filter((part) => part.length >= 2);
}

/** Bare genre labels — not a title without the concrete object. */
const GENERIC_LEAD_EXACT =
  /^(?:תיאום(?:\s+(?:פגישה|שיחה|ישיבה|ראיון))?|לתאם(?:\s+(?:פגישה|שיחה|ישיבה|ראיון))?|קביעת(?:\s+(?:פגישה|שיחה|ישיבה|ראיון))?|לקבוע(?:\s+(?:פגישה|שיחה|ישיבה|ראיון))?|פגישה|שיחה|ישיבה|סנכרון|ועידה|ראיון|תזכורת|משימה|הערה|סיכום|לסכם|לברר|לבדוק|לעדכן|לעקוב|לסגור)$/u;

function isGenericLead(clause: string): boolean {
  const cleaned = flattenProse(clause).replace(/[,.:;]+$/g, "");
  if (!cleaned) return true;
  if (/\s+(?:עם|על|לגבי|בנוגע\s+ל|בנושא)\s+/u.test(cleaned)) return false;
  if (GENERIC_LEAD_EXACT.test(cleaned)) return true;
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (
    words.length <= 2 &&
    /^(?:תיאום|לתאם|קביעת|לקבוע|סיכום|תזכורת|משימה)/u.test(cleaned)
  ) {
    return true;
  }
  return false;
}

function isSecondaryNoise(clause: string): boolean {
  const cleaned = flattenProse(clause);
  return /^צריך\s+ל/u.test(cleaned) || /^(?:וגם|גם)\s+/u.test(cleaned);
}

function joinLeadClause(head: string, next: string): string {
  if (
    /^(?:ל|ב|מ|כ|ש|ו|את|על|עם|לגבי|בנוגע)\s/u.test(next) ||
    /^ל[\u0590-\u05FF]/u.test(next)
  ) {
    return `${head} ${next}`;
  }
  if (isGenericLead(head) && !/^ל[\u0590-\u05FF]/u.test(head)) {
    return `${head} ל${next}`;
  }
  return `${head} ${next}`;
}

/**
 * Lead extraction: generic first comma-clause borrows the following
 * specifics ("תיאום פגישה, החזרת הקבלן…" → one half-sentence).
 */
function leadClauses(text: string): string {
  const clauses = splitClauses(text);
  if (clauses.length === 0) return flattenProse(text);
  let lead = clauses[0] ?? flattenProse(text);
  for (let i = 1; i < clauses.length; i += 1) {
    const next = clauses[i];
    if (!next || isSecondaryNoise(next)) break;
    if (!isGenericLead(lead)) break;
    lead = joinLeadClause(lead, next);
    if (lead.split(/\s+/).filter(Boolean).length >= MAX_TITLE_WORDS) break;
  }
  return flattenProse(lead);
}

function clampTitle(title: string): string {
  let clause = flattenProse(title).replace(/[,.:;]+$/g, "");
  const words = clause.split(/\s+/).filter(Boolean);
  if (words.length > MAX_TITLE_WORDS) {
    clause = words.slice(0, MAX_TITLE_WORDS).join(" ");
  }
  if (clause.length > MAX_TITLE_CHARS) {
    const cut = clause.slice(0, MAX_TITLE_CHARS);
    const lastSpace = cut.lastIndexOf(" ");
    clause = (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return clause.replace(/[,.:;]+$/g, "").trim();
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
  let clause = cleanFiller(flattenProse(narrative));
  clause = leadClauses(clause);
  clause = clause.replace(PLANNING_TAIL, "").trim();
  clause = clause.replace(ALSO_CAPTURE_TAIL, "").trim();
  clause = stripTemporalPhrases(clause);
  clause = clause.replace(MONTH_CONTEXT, "").trim();
  clause = clause.replace(WITH_PERSON, "").trim();
  clause = stripVerbCompanion(clause);
  return flattenProse(clause);
}

function tryMeetingTopic(text: string): string | null {
  const re = new RegExp(
    `^(${MEETING_KIND})(?:\\s+עם\\s+${HEB}+(?:\\s+${HEB}+){0,2})?`,
    "u",
  );
  const match = text.match(re);
  if (!match?.[0]) return null;
  const rest = text.slice(match[0].length).trim();
  if (rest && !isGenericLead(rest)) {
    return clampTitle(text);
  }
  if (match[0].includes("עם")) {
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

const GENERIC_ACTION_KEEP_TAIL =
  /^(?:לברר|לבדוק|לעדכן|לתאם|לקבוע|לסכם|לעקוב|לסגור|לטפל)(?=\s|$)/u;

function tryActionObjectTopic(text: string): string | null {
  if (GENERIC_ACTION_KEEP_TAIL.test(text)) return null;
  const match = text.match(
    new RegExp(`^(ל${HEB}+(?:\\s+${HEB}+){1,2})(?=\\s|$|,|;)`, "u"),
  );
  if (!match?.[1]) return null;
  if (match[1].split(/\s+/).length < 2) return null;
  const rest = text.slice(match[1].length).trim();
  if (/^(?:ל|את|על|בנוגע|לגבי)(?:\s|$)/u.test(rest) || /^ל[\u0590-\u05FF]/u.test(rest)) {
    return null;
  }
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

/** Flatten ASR/newlines then compose a half-sentence title. */
export function composeInboundTitle(narrative: string): string {
  const flat = flattenProse(narrative);
  if (!flat) return "";
  return summarizeTopicTitle(flat) || flat.slice(0, MAX_TITLE_CHARS);
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
