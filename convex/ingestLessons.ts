import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { requireScopedUserId } from "./lib/requireAuth";
import {
  deriveLessonsFromCorrection,
  type IngestLesson,
} from "./lib/ingest/ingestLearning";

const lessonDoc = v.object({
  kind: v.union(
    v.literal("tag_remap"),
    v.literal("topic_tag"),
    v.literal("prefer_split"),
    v.literal("prefer_merge"),
  ),
  cueText: v.string(),
  fromValue: v.optional(v.string()),
  toValue: v.string(),
  weight: v.number(),
});

/**
 * Trusted backend-only list — used by WhatsApp ingest (no user JWT).
 * Do not call from public client paths.
 */
export const listForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(lessonDoc),
  handler: async (ctx, { userId }): Promise<IngestLesson[]> => {
    const rows = await ctx.db
      .query("userIngestLessons")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    rows.sort((a, b) => b.weight - a.weight || b.updatedAt - a.updatedAt);
    return rows.slice(0, 40).map((row) => ({
      kind: row.kind,
      cueText: row.cueText,
      fromValue: row.fromValue,
      toValue: row.toValue,
      weight: row.weight,
    }));
  },
});

export const recordCorrection = internalMutation({
  args: {
    userId: v.id("users"),
    sourceText: v.string(),
    beforeTags: v.array(v.string()),
    afterTags: v.array(v.string()),
    sourceItemId: v.optional(v.string()),
  },
  returns: v.object({ recorded: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireScopedUserId(ctx, args.userId);
    const lessons = deriveLessonsFromCorrection({
      sourceText: args.sourceText,
      beforeTags: args.beforeTags,
      afterTags: args.afterTags,
    });

    if (lessons.length === 0) return { recorded: 0 };

    const now = Date.now();
    let recorded = 0;

    for (const lesson of lessons) {
      const existing = await ctx.db
        .query("userIngestLessons")
        .withIndex("by_user_cue", (q) =>
          q.eq("userId", userId).eq("cueText", lesson.cueText),
        )
        .collect();

      const match = existing.find(
        (row) =>
          row.kind === lesson.kind &&
          row.toValue === lesson.toValue &&
          (row.fromValue ?? "") === (lesson.fromValue ?? ""),
      );

      if (match) {
        await ctx.db.patch(match._id, {
          weight: match.weight + 1,
          updatedAt: now,
          sourceItemId: args.sourceItemId ?? match.sourceItemId,
        });
      } else {
        await ctx.db.insert("userIngestLessons", {
          userId,
          kind: lesson.kind,
          cueText: lesson.cueText,
          fromValue: lesson.fromValue,
          toValue: lesson.toValue,
          weight: 1,
          sourceItemId: args.sourceItemId,
          createdAt: now,
          updatedAt: now,
        });
      }
      recorded += 1;
    }

    return { recorded };
  },
});
