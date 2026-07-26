import type { ParseInputOptions, ParseInputResponse } from "../types/ai.js";
import { enforceEntityRules, enforceIngestionRules } from "./entity-rules.service.js";
import { splitInputSegments } from "../lib/ingest/inputSegmentation.js";
import {
  trySplitTopicActions,
  topicActionsToSegments,
} from "../lib/ingest/topicTaskSplit.js";
import {
  deriveShortTaskTitle,
  deriveTaskContent,
} from "../lib/ingest/taskPresentation.js";
import {
  extractTimeMention,
  hasTemporalHint,
  stripTemporalPhrases,
} from "./hebrew-date-resolver.service.js";

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
    .replace(/\s+/g, " ")
    .trim();
}

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
    const isActionable = classifyActionable(normalizedSegment);
    const shortTitle = isActionable
      ? deriveShortTaskTitle(normalizedSegment) ||
        stripTemporalPhrases(normalizedSegment) ||
        normalizedSegment
      : normalizedSegment.slice(0, 80);

    const raw = {
      title: shortTitle,
      content: isActionable
        ? deriveTaskContent(
            normalizedSegment,
            shortTitle,
            "",
            segments.length === 1 ? sourceText : normalizedSegment,
          )
        : normalizedSegment,
      is_actionable: isActionable,
      due_date: null,
      tags: topicSplit?.sharedTags ?? [],
      analysis: buildAnalysis(normalizedSegment, isActionable, shortTitle),
    };

    return enforceEntityRules(raw, {
      allowedTags: options.allowedTags,
      timezone,
      referenceDate,
      sourceText: segments.length === 1 ? sourceText : normalizedSegment,
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
