import { z } from "zod";
import {
  parsedItemAnalysisSchema,
  type ParsedItemAnalysis,
  type StoredItemAnalysis,
} from "./item-analysis.js";

export const parsedItemSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(""),
  is_actionable: z.boolean(),
  due_date: z.preprocess(
    (val) => (val === "" ? null : val),
    z.string().datetime({ offset: true }).nullable(),
  ),
  tags: z.array(z.string().min(1)).min(1).max(3),
  analysis: parsedItemAnalysisSchema,
});

export type ParsedItem = Omit<z.infer<typeof parsedItemSchema>, "analysis"> & {
  analysis: ParsedItemAnalysis | StoredItemAnalysis;
};

export const parseInputResponseSchema = z.object({
  items: z.array(parsedItemSchema).min(1),
});

export type ParseInputResponse = z.infer<typeof parseInputResponseSchema>;

export interface ParseInputOptions {
  text: string;
  timezone?: string;
  locale?: string;
  referenceDate?: Date;
  allowedTags?: string[];
}
