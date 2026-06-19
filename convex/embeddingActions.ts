"use node";

import OpenAI from "openai";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { isOpenAiUsable } from "./lib/ingest/parseInput";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

function buildNoteEmbeddingText(title: string, content: string, tags: string[]): string {
  const tagLine = tags.length > 0 ? `תגיות: ${tags.join(", ")}` : "";
  return [title, content, tagLine].filter(Boolean).join("\n");
}

async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) throw new Error("OpenAI returned empty embedding");
  return embedding;
}

export const syncNotebook = internalAction({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, { notebookId }) => {
    if (!isOpenAiUsable()) {
      return { ok: false, reason: "openai_not_configured" };
    }

    const notebook = await ctx.runQuery(internal.embeddings.getNotebookForEmbedding, {
      notebookId,
    });
    if (!notebook) {
      return { ok: false, reason: "notebook_not_found" };
    }

    const text = buildNoteEmbeddingText(
      notebook.title,
      notebook.correctedText ?? notebook.content,
      notebook.tags,
    );

    try {
      const embedding = await createEmbedding(text);
      await ctx.runMutation(internal.embeddings.applyNotebookEmbedding, {
        notebookId,
        embedding,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "embedding_failed",
      };
    }
  },
});
