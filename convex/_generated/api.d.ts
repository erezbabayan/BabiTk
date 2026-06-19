/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as embeddingActions from "../embeddingActions.js";
import type * as embeddings from "../embeddings.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as inboundPipeline from "../inboundPipeline.js";
import type * as ingest from "../ingest.js";
import type * as items from "../items.js";
import type * as lib_greenApiParser from "../lib/greenApiParser.js";
import type * as lib_greenApiSend from "../lib/greenApiSend.js";
import type * as lib_ingest_entityRules from "../lib/ingest/entityRules.js";
import type * as lib_ingest_hebrewDates from "../lib/ingest/hebrewDates.js";
import type * as lib_ingest_itemAnalysis from "../lib/ingest/itemAnalysis.js";
import type * as lib_ingest_localParse from "../lib/ingest/localParse.js";
import type * as lib_ingest_notebookOcr from "../lib/ingest/notebookOcr.js";
import type * as lib_ingest_parseInput from "../lib/ingest/parseInput.js";
import type * as lib_ingest_parsePrompt from "../lib/ingest/parsePrompt.js";
import type * as lib_ingest_timezone from "../lib/ingest/timezone.js";
import type * as lib_ingest_types from "../lib/ingest/types.js";
import type * as lib_mediaStorage from "../lib/mediaStorage.js";
import type * as lib_messages from "../lib/messages.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_replyToSender from "../lib/replyToSender.js";
import type * as notebooks from "../notebooks.js";
import type * as openaiPipeline from "../openaiPipeline.js";
import type * as search from "../search.js";
import type * as searchActions from "../searchActions.js";
import type * as seed from "../seed.js";
import type * as tasks from "../tasks.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as visionPipeline from "../visionPipeline.js";
import type * as voicePipeline from "../voicePipeline.js";
import type * as webhookInfo from "../webhookInfo.js";
import type * as whatsappSend from "../whatsappSend.js";
import type * as whatsappWebhook from "../whatsappWebhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  embeddingActions: typeof embeddingActions;
  embeddings: typeof embeddings;
  health: typeof health;
  http: typeof http;
  inboundPipeline: typeof inboundPipeline;
  ingest: typeof ingest;
  items: typeof items;
  "lib/greenApiParser": typeof lib_greenApiParser;
  "lib/greenApiSend": typeof lib_greenApiSend;
  "lib/ingest/entityRules": typeof lib_ingest_entityRules;
  "lib/ingest/hebrewDates": typeof lib_ingest_hebrewDates;
  "lib/ingest/itemAnalysis": typeof lib_ingest_itemAnalysis;
  "lib/ingest/localParse": typeof lib_ingest_localParse;
  "lib/ingest/notebookOcr": typeof lib_ingest_notebookOcr;
  "lib/ingest/parseInput": typeof lib_ingest_parseInput;
  "lib/ingest/parsePrompt": typeof lib_ingest_parsePrompt;
  "lib/ingest/timezone": typeof lib_ingest_timezone;
  "lib/ingest/types": typeof lib_ingest_types;
  "lib/mediaStorage": typeof lib_mediaStorage;
  "lib/messages": typeof lib_messages;
  "lib/phone": typeof lib_phone;
  "lib/replyToSender": typeof lib_replyToSender;
  notebooks: typeof notebooks;
  openaiPipeline: typeof openaiPipeline;
  search: typeof search;
  searchActions: typeof searchActions;
  seed: typeof seed;
  tasks: typeof tasks;
  users: typeof users;
  validators: typeof validators;
  visionPipeline: typeof visionPipeline;
  voicePipeline: typeof voicePipeline;
  webhookInfo: typeof webhookInfo;
  whatsappSend: typeof whatsappSend;
  whatsappWebhook: typeof whatsappWebhook;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
