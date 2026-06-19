import type { ParseInputOptions, ParseInputResponse } from "./types";
import { enforceEntityRules } from "./entityRules";
import {
  extractTimeMention,
  hasTemporalHint,
  stripTemporalPhrases,
} from "./hebrewDates";

const NOTE_ONLY =
  /^(?:קוד|סיסמה|pin|מס(?:פר)?(?:\s|:|$)|הערה(?:\s|:|$)|רעיון(?:\s|$))/iu;
const HEBREW_INFINITIVE = /(?:^|\s)(?:ל|לה)[\u0590-\u05FF'-]{2,}/u;
const ENGLISH_TASK = /\b(?:buy|call|send|pay|prepare|need to|remember to)\b/i;
const HEBREW_TASK_EVENT =
  /(?:^|\s)(?:שיחה|שיחת|פגישה|פגישת|מפגש|אירוע|תזכורת)(?:\s|$)|(?:^|\s)(?:לדבר|לפגוש|לקבוע|לתאם|להתקשר)(?:\s|$)/u;

function splitInputSegments(text: string): string[] {
  const segments = text
    .split(
      /\n+|(?:\s*;\s*)|(?:,\s*(?=(?:ו?גם\s+)?(?:ל[\u0590-\u05FF]|תזכיר|קוד|הקוד|הסיסמה|והסיסמה)))|(?:\s+ו(?=תזכיר|גם\s+ל))/u,
    )
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 2);

  return segments.length > 0 ? segments : [text.trim()];
}

function classifyActionable(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return false;

  if (/^(?:רעיון|הערה)(?:\s|$)/iu.test(trimmed)) {
    return false;
  }

  if (NOTE_ONLY.test(trimmed) && !HEBREW_INFINITIVE.test(trimmed)) {
    return false;
  }

  if (HEBREW_INFINITIVE.test(trimmed) || ENGLISH_TASK.test(trimmed) || HEBREW_TASK_EVENT.test(trimmed)) {
    return true;
  }

  return hasTemporalHint(trimmed);
}

function buildAnalysis(
  segment: string,
  isActionable: boolean,
  title: string,
): {
  goal: string;
  data_points: string;
  task: string;
  urgency: "חסר";
  time_mention: string;
} {
  const timeMention = extractTimeMention(segment) ?? "חסר";

  if (!isActionable) {
    return {
      goal: "שמירת מידע לעיון",
      data_points: segment.slice(0, 160) || "חסר",
      task: "חסר",
      urgency: "חסר",
      time_mention: "חסר",
    };
  }

  const taskTitle = stripTemporalPhrases(title) || title;
  return {
    goal: "תזכורת לביצוע פעולה",
    data_points: taskTitle || "חסר",
    task: taskTitle || "חסר",
    urgency: "חסר",
    time_mention: timeMention,
  };
}

function cleanSegmentLead(text: string): string {
  return text
    .replace(/^(?:וגם|תזכיר לי|תזכירי לי)\s+/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rule-based parser used when OpenAI is unavailable (demo / dev placeholder key).
 */
export function parseInputLocally(options: ParseInputOptions): ParseInputResponse {
  const timezone = options.timezone ?? "Asia/Jerusalem";
  const referenceDate = options.referenceDate ?? new Date();
  const sourceText = options.text.trim();
  const segments = splitInputSegments(sourceText);

  const items = segments.map((segment) => {
    const normalizedSegment = cleanSegmentLead(segment);
    const isActionable = classifyActionable(normalizedSegment);
    const title = isActionable
      ? stripTemporalPhrases(normalizedSegment) || normalizedSegment
      : normalizedSegment.slice(0, 80);

    const raw = {
      title,
      content: isActionable ? "" : normalizedSegment,
      is_actionable: isActionable,
      due_date: null,
      tags: isActionable ? ["כללי"] : ["מידע"],
      analysis: buildAnalysis(normalizedSegment, isActionable, title),
    };

    return enforceEntityRules(raw, {
      allowedTags: options.allowedTags,
      timezone,
      referenceDate,
      sourceText: normalizedSegment,
    });
  });

  return { items };
}
