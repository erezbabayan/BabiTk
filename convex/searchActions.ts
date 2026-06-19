"use node";

import OpenAI from "openai";
import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { isOpenAiUsable } from "./lib/ingest/parseInput";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

function buildNoteEmbeddingText(title: string, content: string, tags: string[]): string {
  const tagLine = tags.length > 0 ? `תגיות: ${tags.join(", ")}` : "";
  return [title, content, tagLine].filter(Boolean).join("\n");
}

/** Create a query embedding for semantic notebook search (client/server). */
export const embedSearchQuery = internalAction({
  args: { query: v.string() },
  handler: async (_ctx, { query }) => {
    if (!isOpenAiUsable()) {
      return { ok: false as const, reason: "openai_not_configured" };
    }

    const text = query.trim();
    if (!text) {
      return { ok: false as const, reason: "empty_query" };
    }

    const apiKey = process.env.OPENAI_API_KEY!;
    const client = new OpenAI({ apiKey });
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      return { ok: false as const, reason: "empty_embedding" };
    }

    return { ok: true as const, embedding };
  },
});

export { buildNoteEmbeddingText, EMBEDDING_DIMENSIONS };
