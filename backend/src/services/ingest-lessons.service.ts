import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  deriveLessonsFromCorrection,
  type IngestLesson,
  type IngestLessonKind,
} from "../lib/ingest/ingestLearning.js";
import { cueMatchesText } from "../lib/ingest/ingestLearning.js";
import type { ParseInputResponse } from "../types/ai.js";

export async function listIngestLessons(userId: string): Promise<IngestLesson[]> {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_ingest_lessons")
    .select("kind, cue_text, from_value, to_value, weight")
    .eq("user_id", userId)
    .order("weight", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    kind: row.kind as IngestLessonKind,
    cueText: row.cue_text,
    fromValue: row.from_value ?? undefined,
    toValue: row.to_value,
    weight: row.weight,
  }));
}

async function upsertLesson(
  userId: string,
  lesson: IngestLesson,
  sourceItemId?: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("user_ingest_lessons")
    .select("id, weight")
    .eq("user_id", userId)
    .eq("kind", lesson.kind)
    .eq("cue_text", lesson.cueText)
    .eq("to_value", lesson.toValue)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("user_ingest_lessons")
      .update({
        weight: existing.weight + 1,
        from_value: lesson.fromValue ?? null,
        source_item_id: sourceItemId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("user_ingest_lessons").insert({
    user_id: userId,
    kind: lesson.kind,
    cue_text: lesson.cueText,
    from_value: lesson.fromValue ?? null,
    to_value: lesson.toValue,
    weight: 1,
    source_item_id: sourceItemId ?? null,
  });
}

export async function recordIngestCorrection(params: {
  userId: string;
  sourceText: string;
  beforeTags: string[];
  afterTags: string[];
  sourceItemId?: string;
}): Promise<number> {
  const lessons = deriveLessonsFromCorrection({
    sourceText: params.sourceText,
    beforeTags: params.beforeTags,
    afterTags: params.afterTags,
  });
  for (const lesson of lessons) {
    await upsertLesson(params.userId, lesson, params.sourceItemId);
  }
  return lessons.length;
}

export async function recordMergeOrSplitLesson(params: {
  userId: string;
  sourceText: string;
  kind: "prefer_merge" | "prefer_split";
  sourceItemId?: string;
}): Promise<void> {
  await upsertLesson(
    params.userId,
    {
      kind: params.kind,
      cueText: params.sourceText.slice(0, 80),
      toValue: params.kind,
      weight: 1,
    },
    params.sourceItemId,
  );
}

export function applySplitMergeLessons(
  parsed: ParseInputResponse,
  sourceText: string,
  lessons: IngestLesson[],
): ParseInputResponse {
  const relevant = lessons.filter((lesson) => cueMatchesText(lesson.cueText, sourceText));
  const preferMerge = relevant.some((lesson) => lesson.kind === "prefer_merge");
  if (preferMerge && parsed.items.length > 1) {
    const [first, ...rest] = parsed.items;
    if (!first) return parsed;
    return {
      items: [
        {
          ...first,
          content: [first.content, ...rest.map((item) => item.title)].filter(Boolean).join("\n"),
        },
      ],
    };
  }
  return parsed;
}
