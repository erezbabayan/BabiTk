import { createClient } from "npm:@supabase/supabase-js@2";

import { inferTagsFromText } from "./tag-inference.ts";
import { DEFAULT_TAG_NAMES } from "./default-tags.ts";
import { titleFromInboundText } from "./voice-text.ts";

type AdminClient = ReturnType<typeof createClient>;

const NOTE_ONLY =
  /^(?:קוד|סיסמה|pin|מס(?:פר)?(?:\s|:|$)|הערה(?:\s|:|$)|רעיון(?:\s|$))/iu;
const HEBREW_INFINITIVE = /(?:^|\s)(?:ל|לה)[\u0590-\u05FF'-]{2,}/u;
const ENGLISH_TASK = /\b(?:buy|call|send|pay|prepare|need to|remember to)\b/i;
const HEBREW_TASK_EVENT =
  /(?:^|\s)(?:שיחה|שיחת|פגישה|פגישת|מפגש|אירוע|תזכורת)(?:\s|$)|(?:^|\s)(?:לדבר|לפגוש|לקבוע|לתאם|להתקשר)(?:\s|$)/u;
const TEMPORAL_HINT =
  /(?:מחר|היום|מחרתיים|בעוד|בשעה|ביום|יום\s|לשעה|\d{1,2}[./]\d{1,2})/u;

export interface IncomingParsedItem {
  title: string;
  content: string;
  is_actionable: boolean;
  due_date: string | null;
  tags: string[];
}

function classifyActionable(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return false;
  if (/^(?:רעיון|הערה)(?:\s|$)/iu.test(trimmed)) return false;
  if (NOTE_ONLY.test(trimmed) && !HEBREW_INFINITIVE.test(trimmed)) return false;
  if (HEBREW_INFINITIVE.test(trimmed) || ENGLISH_TASK.test(trimmed) || HEBREW_TASK_EVENT.test(trimmed)) {
    return true;
  }
  return TEMPORAL_HINT.test(trimmed);
}

/** Keyword parse + context tags for Edge ingest (Deno). */
export function parseIncomingMessage(
  text: string,
  allowedTags?: string[],
): IncomingParsedItem[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const pool = allowedTags?.length ? allowedTags : DEFAULT_TAG_NAMES;
  const tags = inferTagsFromText(trimmed, pool);
  const isActionable = classifyActionable(trimmed);
  return [
    {
      title: titleFromInboundText(trimmed),
      content: trimmed,
      is_actionable: isActionable,
      due_date: null,
      tags,
    },
  ];
}

export async function loadAllowedTagNames(
  supabase: AdminClient,
  userId: string,
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("user_tags")
      .select("name")
      .eq("user_id", userId);
    const names = (data ?? [])
      .map((row) => (typeof row.name === "string" ? row.name.trim() : ""))
      .filter(Boolean);
    return names.length > 0 ? names : DEFAULT_TAG_NAMES;
  } catch {
    return DEFAULT_TAG_NAMES;
  }
}
