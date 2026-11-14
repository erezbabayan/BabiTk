/**
 * Split a single capture into multiple sibling tasks under the same topic.
 *
 * Examples:
 * - "בלימודים צריך לעשות: להגיש עבודה, לקרוא מאמר, להתכונן למבחן"
 * - "צריך לעשות א, ב, ג, ד"
 * - "לקנות חלב, לשלוח מייל, להתקשר לדני"
 */

export type TopicActionSplit = {
  topic: string | null;
  topicLabel: string | null;
  actions: string[];
  sharedTags: string[];
};

const KNOWN_TOPICS: { name: string; pattern: RegExp }[] = [
  { name: "לימודים", pattern: /לימוד/u },
  { name: "עבודה", pattern: /(?:^|[\s,])(?:ב)?עבוד(?:ה|ת)?(?:\s|$|[,:])/u },
  { name: "בית", pattern: /(?:^|[\s,])(?:ב)?בית(?:\s|$|[,:])/u },
  { name: "סטארטאפ", pattern: /סטארט\s*-?\s*א?פ/u },
  { name: "משפחה", pattern: /משפח/u },
  { name: "פיננסי", pattern: /פיננס|כסף|בנק/u },
  { name: "קניות", pattern: /קניו?ת|לקנות/u },
  { name: "בריאות", pattern: /בריא|רופ/u },
];

const TOPIC_LEAD =
  /^(?:ב)?(לימודים|עבודה|בית|סטארטאפ|משפחה|פיננסי|קניות|בריאות|רעיונות)\s*[:,\-]?\s*/iu;

const LIST_INTRO =
  /^(?:צריך(?:\s+לעשות)?|יש\s+(?:לעשות|לבצע)|לעשות|משימות(?:\s+לעשות)?|תזכורות)\s*[:\-]?\s*/iu;

const HEBREW_LETTER_ITEM =
  /^\s*([א-ת])\s*[\.\)\-:]\s*(.+)$/u;

const INFINITIVE_LEAD = /^(?:ו?גם\s+)?(?:ל|לה)[\u0590-\u05FF'-]{2,}/u;

/** Planning continuation of the *same* task — must not become a sibling item. */
const CONTINUATION_ACTION =
  /^(?:לקדם|לקדש|לטפל|לעבוד|לעבד|להתחיל|לשבת|לדון|לתכנן|לסגור|לסיים|לדחות|להזיז)(?:\s+(?:את|על)\s+זה)?/iu;

function isContinuationAction(text: string): boolean {
  const trimmed = text.trim();
  if (CONTINUATION_ACTION.test(trimmed)) return true;
  if (/^(?:את|על)\s+זה\b/iu.test(trimmed)) return true;
  if (/^צריך\s+ל(?!עשות\b)/iu.test(trimmed)) return true;
  if (/^(?:בתחילת|בסוף|באמצע|עד\s+סוף|עד\s+יום)/iu.test(trimmed) && trimmed.length < 80) {
    return true;
  }
  return false;
}

function cleanAction(text: string): string {
  return text
    .replace(/^(?:ו?גם|ו)\s+/iu, "")
    .replace(/^[א-ת]\s*[\.\)\-:]\s*/u, "")
    .replace(/^\d+\s*[\.\)\-:]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTopicLead(text: string): {
  topic: string | null;
  rest: string;
} {
  const match = text.match(TOPIC_LEAD);
  if (!match?.[1]) return { topic: null, rest: text };
  return {
    topic: match[1],
    rest: text.slice(match[0].length).trim(),
  };
}

function inferSharedTags(
  topic: string | null,
  fullText: string,
  allowedTags?: string[],
): string[] {
  const pool = (allowedTags ?? []).map((t) => t.trim()).filter(Boolean);
  const found = new Set<string>();

  if (topic) {
    const mapped =
      pool.find((t) => t === topic) ??
      pool.find((t) => t.includes(topic) || topic.includes(t));
    if (mapped) found.add(mapped);
    else if (pool.length === 0) found.add(topic);
  }

  for (const known of KNOWN_TOPICS) {
    if (!known.pattern.test(fullText)) continue;
    const mapped =
      pool.find((t) => t === known.name) ??
      (pool.length === 0 ? known.name : null);
    if (mapped) found.add(mapped);
  }

  return [...found].slice(0, 2);
}

function splitByLetterMarkers(body: string): string[] | null {
  const starts: { index: number; letter: string }[] = [];
  const re = /(?:^|[,;\s]+)([א-ת])\s*[\.\)\-:]\s+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const letterIndex = m.index + m[0].indexOf(m[1]!);
    starts.push({ index: letterIndex, letter: m[1]! });
  }

  if (starts.length < 2) return null;

  const parts: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]!.index;
    const to = i + 1 < starts.length ? starts[i + 1]!.index : body.length;
    const chunk = cleanAction(body.slice(from, to).replace(/^[,\s]+/, ""));
    if (chunk.length >= 1) parts.push(chunk);
  }

  return parts.length >= 2 ? parts : null;
}

/** "א, ב, ג, ד" as bare letter checklist */
function splitBareLetters(body: string): string[] | null {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (!/^[א-ת](?:\s*,\s*[א-ת]){1,10}\s*$/u.test(trimmed)) return null;
  return trimmed.split(/\s*,\s*/u).map((letter) => `סעיף ${letter}`);
}

function splitInfinitiveList(body: string): string[] | null {
  const parts = body
    .split(/\s*,\s*|\s+וגם\s+|\s+ואז\s+|\s*;\s+/u)
    .map((part) => cleanAction(part))
    .filter((part) => part.length >= 2);

  if (parts.length < 2) return null;

  // One task + "לקדם את זה" planning → not a multi-task list
  if (parts.some((part) => isContinuationAction(part))) return null;

  const actionCount = parts.filter(
    (part) => INFINITIVE_LEAD.test(part) || HEBREW_LETTER_ITEM.test(part),
  ).length;

  // Require most clauses to look like actions
  if (actionCount < 2) return null;
  if (actionCount < Math.ceil(parts.length * 0.6)) return null;

  return parts;
}

function splitNumberedList(body: string): string[] | null {
  const starts: number[] = [];
  const re = /(?:^|[,;\s]+)(\d+)\s*[\.\)\-:]\s+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    starts.push(m.index + m[0].search(/\d/));
  }
  if (starts.length < 2) return null;

  const parts: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]!;
    const to = i + 1 < starts.length ? starts[i + 1]! : body.length;
    const chunk = cleanAction(body.slice(from, to).replace(/^[,\s]+/, ""));
    if (chunk.length >= 2) parts.push(chunk);
  }
  return parts.length >= 2 ? parts : null;
}

/**
 * If the capture is a topic + enumerated actions, return structured split.
 * Otherwise null (caller falls back to normal segmentation).
 */
export function trySplitTopicActions(
  text: string,
  allowedTags?: string[],
): TopicActionSplit | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const { topic, rest: afterTopic } = extractTopicLead(normalized);
  let body = afterTopic;
  const intro = body.match(LIST_INTRO);
  if (intro) {
    body = body.slice(intro[0].length).trim();
  } else if (!topic) {
    // No topic lead — still allow bare list intros on full text
    const fullIntro = normalized.match(LIST_INTRO);
    if (fullIntro) {
      body = normalized.slice(fullIntro[0].length).trim();
    } else {
      body = normalized;
    }
  }

  const actions =
    splitByLetterMarkers(body) ??
    splitBareLetters(body) ??
    splitNumberedList(body) ??
    splitInfinitiveList(body);

  if (!actions || actions.length < 2) return null;

  // Single-clause narratives with one comma continuation should not split here
  // (handled by continuation merge). Require clear multi-action shape.
  const sharedTags = inferSharedTags(topic, normalized, allowedTags).filter(
    (tag) => !(tag === "עבודה" && /לימוד/u.test(normalized)),
  );

  return {
    topic,
    topicLabel: topic,
    actions,
    sharedTags,
  };
}

/** Convert topic split into segment strings for the local parser. */
export function topicActionsToSegments(split: TopicActionSplit): string[] {
  const prefix = split.topicLabel ? `ב${split.topicLabel} ` : "";
  return split.actions.map((action) => `${prefix}${action}`.trim());
}
