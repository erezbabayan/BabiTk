/**
 * Keyword → tag inference for ingest pipelines.
 * Only tags present in the user's allowed list are applied.
 *
 * Special case: עבודה vs לימודים — "להגיש עבודה" in school context
 * must NOT become the job tag #עבודה.
 */
import { DEFAULT_TAG_NAMES } from "./defaultTags";

export type TagInferenceRule = {
  tag: string;
  patterns: RegExp[];
};

/** Explicit studies / school / university cues. */
export const STUDIES_CONTEXT_PATTERNS: RegExp[] = [
  /לימוד/u,
  /אוניברסיט/u,
  /מכלל/u,
  /בית[\s\-]?ספר/u,
  /קולג['׳]?/u,
  /סטודנט/u,
  /תלמיד/u,
  /מרצה/u,
  /מורה(?:\s|$|[,.])/u,
  /קורס/u,
  /סמסטר/u,
  /מבחן/u,
  /בחינ/u,
  /תרגיל/u,
  /שיעור(?:י)?\s*בית/u,
  /סמינר/u,
  /תואר/u,
  /פקולט/u,
  /\bstud(?:y|ies|ent)s?\b/i,
  /\buniversity\b/i,
  /\bcollege\b/i,
  /\bhomework\b/i,
  /\bexam\b/i,
  /\bassignment\b/i,
  /\bschool\b/i,
];

/** "עבודה" as a school assignment / paper — not a job. */
export const ACADEMIC_ASSIGNMENT_PATTERNS: RegExp[] = [
  /להגיש\s+(?:את\s+)?(?:ה)?עבוד/u,
  /הגש(?:ת|ה)\s+(?:של\s+)?(?:ה)?עבוד/u,
  /עבוד(?:ה|ת)\s*(?:בית|סמינר(?:יונית)?|גמר|מחקר)/u,
  /עבוד(?:ה|ת)\s+(?:ב|על\s+(?:ה)?)?(?:קורס|סמסטר|לימוד)/u,
  /(?:לכתוב|להכין|לסיים|לערוך)\s+(?:את\s+)?(?:ה)?עבוד(?:ה|ת)\s*(?:בית|סמינר|גמר|מחקר|לקורס)?/u,
];

/** Strong professional-job cues (not school assignment). */
export const JOB_WORK_PATTERNS: RegExp[] = [
  /ישיב(?:ה|ת)\s*(?:של\s*)?(?:ה)?עבוד/u,
  /פגיש(?:ה|ת)\s*(?:של\s*)?(?:ה)?עבוד/u,
  /משרד/u,
  /לקוח/u,
  /בוס/u,
  /עמית/u,
  /משכור/u,
  /מהעבוד/u,
  /לעבודה(?:\s|$|[,.])/u,
  /בעבודה(?:\s|$|[,.])/u,
  /\bwork\b/i,
  /\bclient\b/i,
  /\bmeeting\b/i,
  /\boffice\b/i,
];

export const TAG_INFERENCE_RULES: TagInferenceRule[] = [
  {
    tag: "סטארטאפ",
    patterns: [
      /סטארט\s*-?\s*א?פ/u,
      /\bstartups?\b/i,
      /\bstart\s*-?\s*up\b/i,
      /יזמות/u,
      /founder/u,
      /mvp/u,
    ],
  },
  {
    tag: "בית",
    patterns: [/בית/u, /דירה/u, /שכנ/u, /משכ/u, /\bhome\b/i, /תיקון בבית/u],
  },
  {
    tag: "לימודים",
    patterns: STUDIES_CONTEXT_PATTERNS,
  },
  {
    tag: "עבודה",
    patterns: [
      ...JOB_WORK_PATTERNS,
      /פרויקט/u,
      /פגיש(?:ה|ת)/u,
      // bare "עבודה" / "לעבוד" — may be overridden by studies disambiguation
      /עבוד/u,
    ],
  },
  {
    tag: "קודים",
    patterns: [
      /קוד/u,
      /סיסמ/u,
      /password/u,
      /pin/u,
      /otp/u,
      /\bapi\b/i,
      /\btoken\b/i,
    ],
  },
  {
    tag: "רעיונות",
    patterns: [/רעיון/u, /רעיונות/u, /brainstorm/u, /קונס(?:פ|ept)/iu, /תוכן/u],
  },
  {
    tag: "פיננסי",
    patterns: [
      /כסף/u,
      /תשלו?ם/u,
      /לשלם/u,
      /חשבו?ן/u,
      /חשבונית/u,
      /בנק/u,
      /משכור/u,
      /invoice/u,
      /\bpay(?:ment)?\b/i,
      /מיסים?/u,
      /הוצא(?:ה|ות)/u,
      /הכנס(?:ה|ות)/u,
      /תקציב/u,
      /פיננס/u,
    ],
  },
  {
    tag: "משפחה",
    patterns: [
      /משפח/u,
      /ילדים?/u,
      /(?:^|[\s,])(?:ה)?בן(?:\s|$|[,.])/u,
      /(?:^|[\s,])(?:ה)?בת(?:\s|$|[,.])/u,
      /(?:^|[\s,])(?:ה)?אמא?(?:\s|$|[,.])/u,
      /(?:^|[\s,])(?:ה)?אבא?(?:\s|$|[,.])/u,
      /family/u,
    ],
  },
  {
    tag: "קניות",
    patterns: [/לקנות/u, /קני/u, /סופ(?:ר|ermarket)/iu, /market/u, /shop/u],
  },
  {
    tag: "בריאות",
    patterns: [/רופ/u, /תרופ/u, /בריא/u, /health/u, /doctor/u, /clinic/u],
  },
];

function normalizeAllowedTags(allowedTags: string[] | undefined): string[] {
  return (allowedTags ?? []).map((tag) => tag.trim()).filter(Boolean);
}

function mapToAllowedTag(tag: string, allowedTags: string[]): string | null {
  const exact = allowedTags.find((allowed) => allowed === tag);
  if (exact) return exact;

  const lower = tag.toLowerCase();
  const caseInsensitive = allowedTags.find(
    (allowed) => allowed.toLowerCase() === lower,
  );
  if (caseInsensitive) return caseInsensitive;

  const partial = allowedTags.find(
    (allowed) =>
      allowed.includes(tag) ||
      tag.includes(allowed) ||
      allowed.toLowerCase().includes(lower) ||
      lower.includes(allowed.toLowerCase()),
  );
  return partial ?? null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveTagPool(allowedTags: string[] | undefined): string[] {
  const allowed = normalizeAllowedTags(allowedTags);
  return allowed.length > 0 ? allowed : DEFAULT_TAG_NAMES;
}

function anyPatternMatches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function hasStudiesContext(text: string): boolean {
  return anyPatternMatches(STUDIES_CONTEXT_PATTERNS, text);
}

export function hasAcademicAssignment(text: string): boolean {
  return anyPatternMatches(ACADEMIC_ASSIGNMENT_PATTERNS, text);
}

export function hasStrongJobSignal(text: string): boolean {
  return anyPatternMatches(JOB_WORK_PATTERNS, text);
}

/**
 * Prefer #לימודים over #עבודה when the text is about school assignments.
 * Keep #עבודה when there is a clear professional-job signal without studies framing.
 */
export function resolveWorkVsStudiesTags(
  tags: string[],
  text: string,
  allowedTags: string[],
): string[] {
  const studiesTag = mapToAllowedTag("לימודים", allowedTags);
  const workTag = mapToAllowedTag("עבודה", allowedTags);
  if (!studiesTag && !workTag) return tags;

  const studiesCue = hasStudiesContext(text) || hasAcademicAssignment(text);
  const strongJob = hasStrongJobSignal(text);
  const academicOnly = hasAcademicAssignment(text) && !strongJob;

  let next = [...tags];

  if (studiesCue && studiesTag && !next.includes(studiesTag)) {
    next.push(studiesTag);
  }

  if (workTag && next.includes(workTag)) {
    // School homework / "להגיש עבודה בלימודים" → drop job tag
    if (academicOnly || (studiesCue && !strongJob) || (hasStudiesContext(text) && hasAcademicAssignment(text))) {
      next = next.filter((tag) => tag !== workTag);
    }
  }

  // Academic assignment with no studies tag available but לימודים cue — already handled
  // If only academic assignment and studies tag exists, ensure work is gone
  if (academicOnly && studiesTag && workTag) {
    next = next.filter((tag) => tag !== workTag);
    if (!next.includes(studiesTag)) next.push(studiesTag);
  }

  return next;
}

/** True when the tag name (or a prefixed Hebrew form) appears in the text. */
function tagNameAppearsInText(tagName: string, text: string): boolean {
  const name = tagName.trim().replace(/^#/, "");
  if (name.length < 2) return false;

  // Don't treat school-assignment "עבודה" as the job tag name.
  if (name === "עבודה") {
    if (hasAcademicAssignment(text) && !hasStrongJobSignal(text)) {
      return false;
    }
    if (hasStudiesContext(text) && hasAcademicAssignment(text)) {
      return false;
    }
  }

  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (name.length >= 3 && normalizedText.includes(name)) {
    const idx = normalizedText.indexOf(name);
    const before = idx > 0 ? normalizedText[idx - 1]! : " ";
    const after =
      idx + name.length < normalizedText.length
        ? normalizedText[idx + name.length]!
        : " ";
    const boundary = /[\s,.:;!?()[\]"'\-—]/;
    const okBefore = boundary.test(before) || /[ובלכמשהה]/.test(before);
    const okAfter = boundary.test(after) || /[\u0590-\u05FF'\-]/.test(after);
    if (okBefore && okAfter) return true;
  }

  const escaped = escapeRegex(name);
  const padded = ` ${normalizedText} `;

  const hebrewMention = new RegExp(
    `(?:^|[\\s,.:;!?()\\[\\]"'\\-—])(?:[ובלכמשה]|ה)?${escaped}(?:[\\u0590-\\u05FF'\\-]{0,4})?(?:$|[\\s,.:;!?()\\[\\]"'\\-—])`,
    "iu",
  );
  if (hebrewMention.test(padded)) return true;

  return new RegExp(`\\b${escaped}\\b`, "i").test(normalizedText);
}

/** Match tags whose name is mentioned directly in the user's text. */
function inferTagsFromTagNames(text: string, allowedTags: string[]): string[] {
  const matched: string[] = [];
  const sorted = [...allowedTags].sort((a, b) => b.length - a.length);

  for (const tag of sorted) {
    if (tagNameAppearsInText(tag, text)) {
      matched.push(tag);
    }
  }

  return matched;
}

/** Scan text and return matching tags from the user's allowed list. */
export function inferTagsFromText(
  text: string,
  allowedTags?: string[],
): string[] {
  const allowed = resolveTagPool(allowedTags);
  if (!text.trim()) return [];

  const haystack = text.trim();
  const matched: string[] = [...inferTagsFromTagNames(haystack, allowed)];

  for (const rule of TAG_INFERENCE_RULES) {
    let mapped = mapToAllowedTag(rule.tag, allowed);
    if (!mapped && rule.tag === "סטארטאפ") {
      mapped = mapToAllowedTag("עבודה", allowed);
    }
    if (!mapped) continue;
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      matched.push(mapped);
    }
  }

  return resolveWorkVsStudiesTags([...new Set(matched)], haystack, allowed);
}

/** Merge parser tags with keyword-inferred tags (max 3, allowed only). */
export function mergeInferredTags(
  existingTags: string[],
  text: string,
  allowedTags?: string[],
): string[] {
  const pool = resolveTagPool(allowedTags);
  const inferred = inferTagsFromText(text, pool);
  const grounded = new Set(inferred);

  const genericTags = new Set(["כללי", "מידע", "general"]);

  // Prefer text-grounded tags first (literal name + keyword rules).
  // Keep parser/AI tags only when the source text also supports them —
  // otherwise weak model guesses (e.g. פיננסי for "סגירת פרויקט") stick forever.
  const supportedExisting = existingTags
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter((tag) => tag && !genericTags.has(tag))
    .map((tag) => mapToAllowedTag(tag, pool))
    .filter((tag): tag is string => Boolean(tag))
    .filter(
      (tag) => grounded.has(tag) || tagNameAppearsInText(tag, text),
    );

  const merged: string[] = [];
  for (const tag of inferred) {
    if (!merged.includes(tag)) merged.push(tag);
  }
  for (const tag of supportedExisting) {
    if (!merged.includes(tag)) merged.push(tag);
  }

  return resolveWorkVsStudiesTags(merged, text, pool).slice(0, 3);
}
