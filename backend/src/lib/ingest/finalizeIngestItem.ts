import type { ParsedItem } from "../../types/ai.js";

import { enforceEntityRules } from "../../services/entity-rules.service.js";

import { DEFAULT_TAG_NAMES } from "./defaultTags.js";



const EMPTY_ANALYSIS: ParsedItem["analysis"] = {

  goal: "חסר",

  data_points: "חסר",

  task: "חסר",

  urgency: "חסר",

  time_mention: "חסר",

};



export interface FinalizeIngestItemInput {

  title: string;

  content: string;

  isActionable: boolean;

  dueDate: string | null;

  tags: string[];

  metadata?: Record<string, unknown>;

}



export interface FinalizeIngestOptions {

  sourceText?: string;

  allowedTags?: string[];

  timezone?: string;

  referenceDate?: Date;

}



function readAnalysis(metadata?: Record<string, unknown>): ParsedItem["analysis"] {

  const raw = metadata?.analysis;

  if (!raw || typeof raw !== "object") return { ...EMPTY_ANALYSIS };

  const a = raw as Record<string, unknown>;

  return {

    goal: typeof a.goal === "string" ? a.goal : "חסר",

    data_points: typeof a.data_points === "string" ? a.data_points : "חסר",

    task: typeof a.task === "string" ? a.task : "חסר",

    urgency:

      a.urgency === "גבוהה" ||

      a.urgency === "בינונית" ||

      a.urgency === "נמוכה" ||

      a.urgency === "חסר"

        ? a.urgency

        : "חסר",

    time_mention: typeof a.time_mention === "string" ? a.time_mention : "חסר",

  };

}



/** Last-chance normalization before persisting — title/content/tags/due date. */

export function finalizeIngestItem(

  item: FinalizeIngestItemInput,

  options?: FinalizeIngestOptions,

): FinalizeIngestItemInput {

  const pool = options?.allowedTags?.length ? options.allowedTags : DEFAULT_TAG_NAMES;

  const analysis = readAnalysis(item.metadata);



  const ruled = enforceEntityRules(

    {

      title: item.title,

      content: item.content,

      is_actionable: item.isActionable,

      due_date: item.dueDate,

      tags: item.tags,

      analysis,

    },

    {

      sourceText: options?.sourceText,

      allowedTags: pool,

      timezone: options?.timezone,

      referenceDate: options?.referenceDate,

    },

  );



  return {

    title: ruled.title,

    content: ruled.content,

    isActionable: ruled.is_actionable,

    dueDate: ruled.is_actionable ? ruled.due_date : null,

    tags: ruled.tags,

    metadata: {

      ...(item.metadata ?? {}),

      analysis: ruled.analysis,

      parsed_item: {

        title: ruled.title,

        content: ruled.content,

        is_actionable: ruled.is_actionable,

        due_date: ruled.due_date,

        tags: ruled.tags,

        analysis: ruled.analysis,

      },

    },

  };

}



export function finalizedToParsedItem(

  original: ParsedItem,

  finalized: FinalizeIngestItemInput,

): ParsedItem {

  const analysis =

    (finalized.metadata?.analysis as ParsedItem["analysis"] | undefined) ?? original.analysis;

  return {

    title: finalized.title,

    content: finalized.content,

    is_actionable: finalized.isActionable,

    due_date: finalized.dueDate,

    tags: finalized.tags,

    analysis,

  };

}

