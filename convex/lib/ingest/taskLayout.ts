import { stripTemporalPhrases } from "./hebrewDates.ts";
import { summarizeTopicTitle } from "./taskPresentation.ts";
import type { ParsedItem } from "./types.ts";

export type LayoutChecklistEntry = {
  id: string;
  text: string;
  done: boolean;
};

export type ReminderRecurrence = "daily" | "weekly" | "monthly" | "weekdays";

const CAPTURE_VERB =
  String.raw`(?:תכניס|תכניסי|תוסיף|תוסיפי|תוסיפו|תרשום|תרשמי|רשום|רשמי|שימי|שים)(?:\s+לי)?`;
const CAPTURE_TASK_KIND = String.raw`(?:משימה|משימות|תזכורת|פריט)`;

const PLACE_CUE =
  /(?:ברשויות|ברשות|בערים|בישובים|ביישובים|במקומות|לפי\s+מקומות)\s+/iu;

const RECURRENCE_STRIP =
  /(?:משימה\s+)?קבוע[ה]?|כל\s+שבוע|שבועי(?:ת)?|מדי\s+שבוע|כל\s+יום(?:\s+(?:ה)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))?|יומי(?:ת)?|מדי\s+יום|כל\s+חודש|חודשי(?:ת)?|מדי\s+חודש|ימי\s+חול|בימי\s+חול/giu;

const WEEKDAY_TOKEN = /ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת/u;

const PLACE_ALIASES: Record<string, string> = {
  "שלמה ציון": "שלום ציון",
  "באזור התעשייה": "אזור התעשייה",
  "באזור תעשייה": "אזור התעשייה",
  "אזור תעשייה": "אזור התעשייה",
};

const KNOWN_PLACES = [
  "בית אריה",
  "עמנואל",
  "שלום ציון",
  "שלמה ציון",
  "אריאל",
  "אזור התעשייה",
  "ירושלים",
  "תל אביב",
  "חיפה",
  "רמת גן",
  "פתח תקווה",
  "ראשון לציון",
  "נתניה",
  "אשדוד",
  "באר שבע",
  "הרצליה",
  "כפר סבא",
  "רעננה",
  "מודיעין",
  "רחובות",
  "חולון",
  "בת ים",
  "בית שמש",
  "ראש העין",
  "הוד השרון",
  "גבעתיים",
  "בני ברק",
  "אשקלון",
  "עפולה",
  "נצרת",
  "כרמיאל",
  "נהריה",
  "עכו",
  "חדרה",
  "נס ציונה",
  "לוד",
  "רמלה",
  "דימונה",
  "אילת",
  "טבריה",
  "קריית גת",
  "שדרות",
  "מודיעין עילית",
  "ביתר עילית",
  "מעלה אדומים",
  "גבעת שמואל",
  "יהוד",
  "אור יהודה",
  "קריית אונו",
  "שוהם",
  "מבשרת ציון",
];

const SKIP_PLACE_TOKEN =
  /^(?:גם|כן|ו|של|את|עם|על|ה|ב|ל|מ|כל|קבועה|קבוע|משימה|הערה|סטטוס|נהלים|שיווק|שיווקים|חדשים|בעבודה|בבית|בבוקר|בערב|היום|מחר)$/u;

/**
 * Strip spoken capture commands so they never become the title.
 * Leaves «הערה» in place so notes still classify as notes.
 */
export function stripCaptureLead(text: string): string {
  return text
    .replace(new RegExp(`^${CAPTURE_VERB}[,:]?\\s+${CAPTURE_TASK_KIND}[,:]?\\s*`, "iu"), "")
    .replace(new RegExp(`^${CAPTURE_VERB}[,:]?\\s*`, "iu"), "")
    .replace(/^משימה\s+(?:קבועה\s+)?/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractReminderRecurrence(text: string): ReminderRecurrence | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (/(?:ימי\s+חול|כל\s+יום\s+עבודה|בימי\s+חול)/u.test(normalized)) {
    return "weekdays";
  }
  if (/(?:כל\s+חודש|חודשי(?:ת)?|מדי\s+חודש)/u.test(normalized)) {
    return "monthly";
  }
  if (/(?:כל\s+שבוע|שבועי(?:ת)?|מדי\s+שבוע)/u.test(normalized)) {
    return "weekly";
  }
  if (/בימי\s+/u.test(normalized) && WEEKDAY_TOKEN.test(normalized)) {
    return "weekly";
  }
  if (/(?:משימה\s+)?קבוע[ה]?/u.test(normalized) && WEEKDAY_TOKEN.test(normalized)) {
    return "weekly";
  }
  if (/כל\s+יום(?:\s+ה)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/u.test(normalized)) {
    return "weekly";
  }
  if (/(?:כל\s+יום|יומי(?:ת)?|מדי\s+יום)/u.test(normalized)) {
    return "daily";
  }
  return null;
}

export function extractPlaceRows(text: string): string[] {
  const normalized = normalizePlaceAliases(text.replace(/\s+/g, " ").trim());
  const cued = extractCuedPlaceList(normalized);
  if (cued.length >= 2) return finalizePlaceRows(cued);
  const known = findKnownPlacesInOrder(normalized);
  const commaCount = (normalized.match(/,/g) ?? []).length;
  if (known.length >= 3 && commaCount >= 2) return finalizePlaceRows(known);
  return [];
}

function applyLayoutToActionable(
  item: ParsedItem,
  sourceText: string,
): ParsedItem {
  const source = sourceText.trim() || `${item.title} ${item.content}`.trim();
  const recurrence = extractReminderRecurrence(source);
  const places = extractPlaceRows(source);

  let title = stripCaptureLead(item.title);
  if (recurrence) {
    title = stripRecurrencePhrases(title);
    title = stripTemporalPhrases(title) || title;
  }
  if (!title.trim()) {
    title =
      summarizeTopicTitle(stripLayoutNoise(source, places)) ||
      stripCaptureLead(stripTemporalPhrases(source)) ||
      item.title;
  }

  if (places.length < 2) {
    return {
      ...item,
      title: title || item.title,
      reminder_recurrence: recurrence,
      checklist: undefined,
    };
  }

  const essence = normalizeEssence(stripLayoutNoise(source, places));
  const layoutTitle =
    summarizeTopicTitle(essence) || essence || title || item.title;
  const general = extractGeneralContent(essence, layoutTitle);

  return {
    ...item,
    title: layoutTitle,
    content: general,
    reminder_recurrence: recurrence,
    checklist: toChecklist(places),
  };
}

/** Reshape a parsed task into schedule / title / general content / rows. */
export function applyTaskLayoutToItem(
  item: ParsedItem,
  sourceText?: string,
): ParsedItem {
  if (!item.is_actionable) {
    return {
      ...item,
      title: stripCaptureLead(item.title) || item.title,
      reminder_recurrence: undefined,
      checklist: undefined,
    };
  }
  return applyLayoutToActionable(item, sourceText ?? "");
}

function extractCuedPlaceList(text: string): string[] {
  const match = text.match(
    new RegExp(`${PLACE_CUE.source}(.+)$`, PLACE_CUE.flags),
  );
  if (!match?.[1]) return [];
  let blob = match[1].trim();
  blob = blob.split(/(?:,?\s+)(?:צריך\s+)?(?:ל|לה)[\u0590-\u05FF]{2,}/u)[0] ?? blob;
  return splitPlaceList(blob);
}

function splitPlaceList(raw: string): string[] {
  return raw
    .split(/\s*,\s*|\s+וגם\s+|\s+ו/u)
    .map(cleanPlaceToken)
    .filter(Boolean);
}

function cleanPlaceToken(token: string): string {
  let value = token
    .replace(/^[\sו]+/u, "")
    .replace(/גם\s+כן/gu, " ")
    .replace(/\bגם\b/gu, " ")
    .replace(/\bבעבודה\b/gu, " ")
    .replace(/\bבבית\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^ב(?=אזור\b)/u.test(value)) {
    value = value.replace(/^ב/u, "").trim();
  }
  value = PLACE_ALIASES[value] ?? value;
  if (!value || SKIP_PLACE_TOKEN.test(value)) return "";
  if (value.length < 2) return "";
  return value;
}

function findKnownPlacesInOrder(text: string): string[] {
  const found: { index: number; name: string }[] = [];
  for (const place of KNOWN_PLACES) {
    const canonical = PLACE_ALIASES[place] ?? place;
    const index = text.indexOf(place);
    if (index < 0) continue;
    if (found.some((row) => row.name === canonical)) continue;
    found.push({ index, name: canonical });
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((row) => row.name);
}

function finalizePlaceRows(places: string[]): string[] {
  const rows: string[] = [];
  for (const place of places) {
    if (place === "אזור התעשייה" && rows.length > 0) {
      const previous = rows[rows.length - 1]!;
      if (!previous.includes("אזור תעשייה")) {
        rows[rows.length - 1] = `${previous} — אזור תעשייה`;
        continue;
      }
    }
    if (!rows.includes(place)) rows.push(place);
  }
  return rows;
}

function toChecklist(places: string[]): LayoutChecklistEntry[] {
  return places.map((text, index) => ({
    id: `chk-${index + 1}`,
    text,
    done: false,
  }));
}

function stripRecurrencePhrases(text: string): string {
  return text.replace(RECURRENCE_STRIP, " ").replace(/\s+/g, " ").trim();
}

function stripLayoutNoise(source: string, places: string[]): string {
  let text = stripCaptureLead(source);
  text = stripRecurrencePhrases(text);
  text = stripTemporalPhrases(text);
  text = text.replace(PLACE_CUE, " ");
  const sortedPlaces = [...places].sort((a, b) => b.length - a.length);
  for (const place of sortedPlaces) {
    const variants = new Set<string>([
      place,
      place.replace(" — אזור תעשייה", ""),
    ]);
    if (place.includes("אזור תעשייה")) {
      variants.add("אזור התעשייה");
      variants.add("באזור התעשייה");
      variants.add("אזור תעשייה");
    }
    for (const [from, to] of Object.entries(PLACE_ALIASES)) {
      if (place === to || place.includes(to) || variants.has(to)) {
        variants.add(from);
      }
    }
    const ordered = [...variants].sort((a, b) => b.length - a.length);
    for (const variant of ordered) {
      if (!variant.trim()) continue;
      text = text.replace(new RegExp(escapeRegExp(variant), "gu"), " ");
    }
  }
  text = text.replace(/גם\s+כן/gu, " ").replace(/\bבעבודה\b/gu, " ");
  text = text.replace(/(?:^|\s)ו(?=\s|$)/gu, " ");
  text = text.replace(/(?:^|\s)[בלמשהו](?=\s|$)/gu, " ");
  return normalizeEssence(text.replace(/[|,;]+/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeEssence(text: string): string {
  return text
    .replace(/שיווקים/gu, "שיווק")
    .replace(/נהלים\s+חדשים/gu, "נהלים")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGeneralContent(essence: string, title: string): string {
  let rest = essence;
  for (const word of title.trim().split(/\s+/).filter(Boolean)) {
    rest = rest.replace(new RegExp(`(?:^|\\s)${escapeRegExp(word)}(?=\\s|$)`, "u"), " ");
  }
  rest = rest.replace(/\s+/g, " ").trim().replace(/^[,.:;]+/, "").replace(/[,.:;]+$/, "").trim();
  if (rest.length < 8) return "";
  if (rest === title) return "";
  if (/^(?:וגם|גם|ו|של|על|את|עם)$/u.test(rest)) return "";
  return rest;
}

function normalizePlaceAliases(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(PLACE_ALIASES)) {
    out = out.replace(new RegExp(escapeRegExp(from), "gu"), to);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
