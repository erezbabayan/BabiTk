import type { ParseInputOptions, ParseInputResponse } from "./types";
import { enforceEntityRules, enforceIngestionRules } from "./entityRules";
import { splitInputSegments } from "./inputSegmentation";
import {
  trySplitTopicActions,
  topicActionsToSegments,
} from "./topicTaskSplit";
import {
  deriveShortTaskTitle,
  deriveTaskContent,
} from "./taskPresentation";
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
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Flat form for classification / short titles only — never use for stored content. */
function flattenForTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Rule-based parser used when OpenAI is unavailable (demo / dev placeholder key).
 */
export function parseInputLocally(options: ParseInputOptions): ParseInputResponse {
  const timezone = options.timezone ?? "Asia/Jerusalem";
  const referenceDate = options.referenceDate ?? new Date();
  const sourceText = options.text.trim();
  const topicSplit = trySplitTopicActions(sourceText, options.allowedTags);
  const segments = topicSplit
    ? topicActionsToSegments(topicSplit)
    : splitInputSegments(sourceText, options.allowedTags);

  const items = segments.map((segment) => {
    const normalizedSegment = cleanSegmentLead(segment);
    const flatForClassify = flattenForTitle(normalizedSegment);
    const isActionable = classifyActionable(flatForClassify);
    const shortTitle = isActionable
      ? deriveShortTaskTitle(flatForClassify) ||
        stripTemporalPhrases(flatForClassify) ||
        flatForClassify.slice(0, 80)
      : flatForClassify.slice(0, 80);

    const bodySource =
      segments.length === 1 ? cleanSegmentLead(sourceText) : normalizedSegment;

    const raw = {
      title: shortTitle,
      content: isActionable
        ? deriveTaskContent(flatForClassify, shortTitle, "", bodySource)
        : bodySource,
      is_actionable: isActionable,
      due_date: null,
      tags: topicSplit?.sharedTags ?? [],
      analysis: buildAnalysis(flatForClassify, isActionable, shortTitle),
    };

    return enforceEntityRules(raw, {
      allowedTags: options.allowedTags,
      timezone,
      referenceDate,
      sourceText: bodySource,
      lessons: options.lessons,
    });
  });

  return enforceIngestionRules(
    { items },
    {
      allowedTags: options.allowedTags,
      timezone,
      referenceDate,
      sourceText,
      lessons: options.lessons,
    },
  );
}
