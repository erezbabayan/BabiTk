import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

/** Dispatch due item/list reminders to in-app, push, and WhatsApp when connected. */
crons.interval(
  "dispatch due reminders",
  { minutes: 1 },
  internal.reminders.dispatchDue,
  {},
);

/**
 * Repeat-nag open items past their reminder time (first at +24h, then every
 * 48h). Hourly is enough — slot dedupe makes each window fire exactly once.
 */
crons.interval(
  "overdue reminder nags",
  { hours: 1 },
  internal.reminders.dispatchOverdueNags,
  {},
);

/** Daily WhatsApp digest of reminders scheduled for today (per-user hour). */
crons.interval(
  "whatsapp daily reminder digest",
  { minutes: 5 },
  internal.reminders.dispatchDailyDigests,
  {},
);

/**
 * Catch WhatsApp voice/photo/text the webhook may have missed.
 * Poll getChatHistory for the capture group often — yellowCard may drop
 * some webhooks, but history/receive stay available (no capture pause).
 */
crons.interval(
  "whatsapp capture backfill",
  { minutes: 1 },
  internal.whatsappCaptureBackfill.backfillRecentOutgoingCapture,
  { minutes: 48 * 60, scheduleFollowUps: true },
);

export default crons;
