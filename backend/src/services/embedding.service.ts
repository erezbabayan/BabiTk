import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

export function buildNoteEmbeddingText(title: string, content: string, tags: string[]): string {
  const tagLine = tags.length > 0 ? `תגיות: ${tags.join(", ")}` : "";
  return [title, content, tagLine].filter(Boolean).join("\n");
}

export async function createEmbedding(text: string): Promise<number[]> {
  const input = text.trim();
  if (!input) {
    throw new Error("Cannot create embedding from empty text");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error("OpenAI returned empty embedding");
  }

  return embedding;
}

export function formatVectorForPostgres(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
