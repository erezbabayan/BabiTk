import { v } from "convex/values";

/** Task lifecycle (inbox triage → active → done / archived). */
export const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("pending"),
  v.literal("completed"),
  v.literal("snoozed_archive"),
);

/** Notebook capture lifecycle (extracted text from photos). */
export const notebookStatus = v.union(
  v.literal("inbox"),
  v.literal("pending"),
  v.literal("archived"),
);

export const userTier = v.union(v.literal("free"), v.literal("premium"));

export const sourceType = v.union(
  v.literal("whatsapp_voice"),
  v.literal("whatsapp_text"),
  v.literal("notebook_ocr"),
);

export type TaskStatus =
  | "inbox"
  | "pending"
  | "completed"
  | "snoozed_archive";

export type NotebookStatus = "inbox" | "pending" | "archived";

export type UserTier = "free" | "premium";

export type SourceType = "whatsapp_voice" | "whatsapp_text" | "notebook_ocr";
