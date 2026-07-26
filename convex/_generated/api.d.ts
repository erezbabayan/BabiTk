/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as adminRestore from "../adminRestore.js";
import type * as adminUsers from "../adminUsers.js";
import type * as auth from "../auth.js";
import type * as authMaintenance from "../authMaintenance.js";
import type * as boardSettings from "../boardSettings.js";
import type * as captureActions from "../captureActions.js";
import type * as crons from "../crons.js";
import type * as embeddingActions from "../embeddingActions.js";
import type * as embeddings from "../embeddings.js";
import type * as files from "../files.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as inboundPipeline from "../inboundPipeline.js";
import type * as ingest from "../ingest.js";
import type * as ingestLessons from "../ingestLessons.js";
import type * as items from "../items.js";
import type * as lib_adminAuth from "../lib/adminAuth.js";
import type * as lib_auditLog from "../lib/auditLog.js";
import type * as lib_callMeBot from "../lib/callMeBot.js";
import type * as lib_convexIds from "../lib/convexIds.js";
import type * as lib_greenApiDownload from "../lib/greenApiDownload.js";
import type * as lib_greenApiParser from "../lib/greenApiParser.js";
import type * as lib_greenApiSend from "../lib/greenApiSend.js";
import type * as lib_hebrewAsr from "../lib/hebrewAsr.js";
import type * as lib_imageVision from "../lib/imageVision.js";
import type * as lib_ingest_defaultTags from "../lib/ingest/defaultTags.js";
import type * as lib_ingest_englishKeyboardHebrew from "../lib/ingest/englishKeyboardHebrew.js";
import type * as lib_ingest_entityRules from "../lib/ingest/entityRules.js";
import type * as lib_ingest_finalizeIngestItem from "../lib/ingest/finalizeIngestItem.js";
import type * as lib_ingest_hebrewAsrSpelling from "../lib/ingest/hebrewAsrSpelling.js";
import type * as lib_ingest_hebrewDates from "../lib/ingest/hebrewDates.js";
import type * as lib_ingest_hebrewTimeWords from "../lib/ingest/hebrewTimeWords.js";
import type * as lib_ingest_ingestLearning from "../lib/ingest/ingestLearning.js";
import type * as lib_ingest_inputSegmentation from "../lib/ingest/inputSegmentation.js";
import type * as lib_ingest_itemAnalysis from "../lib/ingest/itemAnalysis.js";
import type * as lib_ingest_localParse from "../lib/ingest/localParse.js";
import type * as lib_ingest_notebookOcr from "../lib/ingest/notebookOcr.js";
import type * as lib_ingest_parseInput from "../lib/ingest/parseInput.js";
import type * as lib_ingest_parsePrompt from "../lib/ingest/parsePrompt.js";
import type * as lib_ingest_tagInference from "../lib/ingest/tagInference.js";
import type * as lib_ingest_taskPresentation from "../lib/ingest/taskPresentation.js";
import type * as lib_ingest_textStructure from "../lib/ingest/textStructure.js";
import type * as lib_ingest_timezone from "../lib/ingest/timezone.js";
import type * as lib_ingest_topicTaskSplit from "../lib/ingest/topicTaskSplit.js";
import type * as lib_ingest_types from "../lib/ingest/types.js";
import type * as lib_legacyUserId from "../lib/legacyUserId.js";
import type * as lib_mediaStorage from "../lib/mediaStorage.js";
import type * as lib_messages from "../lib/messages.js";
import type * as lib_notifyAt from "../lib/notifyAt.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_replyToSender from "../lib/replyToSender.js";
import type * as lib_requireAuth from "../lib/requireAuth.js";
import type * as lib_resolveItemReminder from "../lib/resolveItemReminder.js";
import type * as lib_taskListCopy from "../lib/taskListCopy.js";
import type * as lib_taskListNames from "../lib/taskListNames.js";
import type * as lib_taskListShare from "../lib/taskListShare.js";
import type * as lib_userDisplayName from "../lib/userDisplayName.js";
import type * as lib_whatsappCaptureGroup from "../lib/whatsappCaptureGroup.js";
import type * as lib_whatsappIngestReceipt from "../lib/whatsappIngestReceipt.js";
import type * as lib_whatsappOutbound from "../lib/whatsappOutbound.js";
import type * as notebooks from "../notebooks.js";
import type * as notifications from "../notifications.js";
import type * as openaiPipeline from "../openaiPipeline.js";
import type * as pushTokens from "../pushTokens.js";
import type * as reminders from "../reminders.js";
import type * as search from "../search.js";
import type * as searchActions from "../searchActions.js";
import type * as seed from "../seed.js";
import type * as tags from "../tags.js";
import type * as taskLists from "../taskLists.js";
import type * as tasks from "../tasks.js";
import type * as userTagDefinitions from "../userTagDefinitions.js";
import type * as users from "../users.js";
import type * as validators from "../validators.js";
import type * as visionPipeline from "../visionPipeline.js";
import type * as voicePipeline from "../voicePipeline.js";
import type * as webhookInfo from "../webhookInfo.js";
import type * as whatsappCaptureBackfill from "../whatsappCaptureBackfill.js";
import type * as whatsappCaptureGroupActions from "../whatsappCaptureGroupActions.js";
import type * as whatsappConfig from "../whatsappConfig.js";
import type * as whatsappOps from "../whatsappOps.js";
import type * as whatsappRingFix from "../whatsappRingFix.js";
import type * as whatsappSend from "../whatsappSend.js";
import type * as whatsappTest from "../whatsappTest.js";
import type * as whatsappWebhook from "../whatsappWebhook.js";
import type * as whatsappWebhookSetup from "../whatsappWebhookSetup.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  adminRestore: typeof adminRestore;
  adminUsers: typeof adminUsers;
  auth: typeof auth;
  authMaintenance: typeof authMaintenance;
  boardSettings: typeof boardSettings;
  captureActions: typeof captureActions;
  crons: typeof crons;
  embeddingActions: typeof embeddingActions;
  embeddings: typeof embeddings;
  files: typeof files;
  health: typeof health;
  http: typeof http;
  inboundPipeline: typeof inboundPipeline;
  ingest: typeof ingest;
  ingestLessons: typeof ingestLessons;
  items: typeof items;
  "lib/adminAuth": typeof lib_adminAuth;
  "lib/auditLog": typeof lib_auditLog;
  "lib/callMeBot": typeof lib_callMeBot;
  "lib/convexIds": typeof lib_convexIds;
  "lib/greenApiDownload": typeof lib_greenApiDownload;
  "lib/greenApiParser": typeof lib_greenApiParser;
  "lib/greenApiSend": typeof lib_greenApiSend;
  "lib/hebrewAsr": typeof lib_hebrewAsr;
  "lib/imageVision": typeof lib_imageVision;
  "lib/ingest/defaultTags": typeof lib_ingest_defaultTags;
  "lib/ingest/englishKeyboardHebrew": typeof lib_ingest_englishKeyboardHebrew;
  "lib/ingest/entityRules": typeof lib_ingest_entityRules;
  "lib/ingest/finalizeIngestItem": typeof lib_ingest_finalizeIngestItem;
  "lib/ingest/hebrewAsrSpelling": typeof lib_ingest_hebrewAsrSpelling;
  "lib/ingest/hebrewDates": typeof lib_ingest_hebrewDates;
  "lib/ingest/hebrewTimeWords": typeof lib_ingest_hebrewTimeWords;
  "lib/ingest/ingestLearning": typeof lib_ingest_ingestLearning;
  "lib/ingest/inputSegmentation": typeof lib_ingest_inputSegmentation;
  "lib/ingest/itemAnalysis": typeof lib_ingest_itemAnalysis;
  "lib/ingest/localParse": typeof lib_ingest_localParse;
  "lib/ingest/notebookOcr": typeof lib_ingest_notebookOcr;
  "lib/ingest/parseInput": typeof lib_ingest_parseInput;
  "lib/ingest/parsePrompt": typeof lib_ingest_parsePrompt;
  "lib/ingest/tagInference": typeof lib_ingest_tagInference;
  "lib/ingest/taskPresentation": typeof lib_ingest_taskPresentation;
  "lib/ingest/textStructure": typeof lib_ingest_textStructure;
  "lib/ingest/timezone": typeof lib_ingest_timezone;
  "lib/ingest/topicTaskSplit": typeof lib_ingest_topicTaskSplit;
  "lib/ingest/types": typeof lib_ingest_types;
  "lib/legacyUserId": typeof lib_legacyUserId;
  "lib/mediaStorage": typeof lib_mediaStorage;
  "lib/messages": typeof lib_messages;
  "lib/notifyAt": typeof lib_notifyAt;
  "lib/phone": typeof lib_phone;
  "lib/replyToSender": typeof lib_replyToSender;
  "lib/requireAuth": typeof lib_requireAuth;
  "lib/resolveItemReminder": typeof lib_resolveItemReminder;
  "lib/taskListCopy": typeof lib_taskListCopy;
  "lib/taskListNames": typeof lib_taskListNames;
  "lib/taskListShare": typeof lib_taskListShare;
  "lib/userDisplayName": typeof lib_userDisplayName;
  "lib/whatsappCaptureGroup": typeof lib_whatsappCaptureGroup;
  "lib/whatsappIngestReceipt": typeof lib_whatsappIngestReceipt;
  "lib/whatsappOutbound": typeof lib_whatsappOutbound;
  notebooks: typeof notebooks;
  notifications: typeof notifications;
  openaiPipeline: typeof openaiPipeline;
  pushTokens: typeof pushTokens;
  reminders: typeof reminders;
  search: typeof search;
  searchActions: typeof searchActions;
  seed: typeof seed;
  tags: typeof tags;
  taskLists: typeof taskLists;
  tasks: typeof tasks;
  userTagDefinitions: typeof userTagDefinitions;
  users: typeof users;
  validators: typeof validators;
  visionPipeline: typeof visionPipeline;
  voicePipeline: typeof voicePipeline;
  webhookInfo: typeof webhookInfo;
  whatsappCaptureBackfill: typeof whatsappCaptureBackfill;
  whatsappCaptureGroupActions: typeof whatsappCaptureGroupActions;
  whatsappConfig: typeof whatsappConfig;
  whatsappOps: typeof whatsappOps;
  whatsappRingFix: typeof whatsappRingFix;
  whatsappSend: typeof whatsappSend;
  whatsappTest: typeof whatsappTest;
  whatsappWebhook: typeof whatsappWebhook;
  whatsappWebhookSetup: typeof whatsappWebhookSetup;
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
