import cron, { type ScheduledTask } from "node-cron";
import { beginBackgroundJob } from "../lib/background-jobs.js";
import { env } from "../config/env.js";
import { archiveStaleInboxItems, purgeExpiredDeletedItems, resetMonthlyUsageForAllUsers, sendDailyDigests, sendTaskReminders } from "../services/cron.service.js";
import { purgeExpiredSyncItems } from "../services/sync-store.service.js";
let jobs: ScheduledTask[] = [];

export function startMindtaskerScheduler(logger: {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}): void {
  if (!env.cronEnabled) {
    logger.info({}, "MindTasker cron disabled (CRON_ENABLED=false)");
    return;
  }

  const archiveJob = cron.schedule(
    "0 2 * * *",
    () => {
      void (async () => {
        const release = beginBackgroundJob("inbox-archive");
        try {
          const count = await archiveStaleInboxItems();
          logger.info({ count }, "Inbox auto-archive completed");
        } catch (error) {
          logger.error({ err: error }, "Inbox auto-archive failed");
        } finally {
          release();
        }
      })();    },
    { timezone: env.cronTimezone },
  );

  const digestJob = cron.schedule(
    "0 8 * * *",
    () => {
      void (async () => {
        const release = beginBackgroundJob("daily-digest");
        try {
          const sent = await sendDailyDigests();
          logger.info({ sent }, "Daily digest completed");
        } catch (error) {
          logger.error({ err: error }, "Daily digest failed");
        } finally {
          release();
        }
      })();    },
    { timezone: env.cronTimezone },
  );

  const usageResetJob = cron.schedule(
    "0 0 1 * *",
    () => {
      void (async () => {
        const release = beginBackgroundJob("usage-reset");
        try {
          const count = await resetMonthlyUsageForAllUsers();
          logger.info({ count }, "Monthly usage reset completed");
        } catch (error) {
          logger.error({ err: error }, "Monthly usage reset failed");
        } finally {
          release();
        }
      })();    },
    { timezone: env.cronTimezone },
  );

  const trashPurgeJob = cron.schedule(
    "0 3 * * *",
    () => {
      void (async () => {
        const release = beginBackgroundJob("trash-purge");
        try {
          const dbCount = await purgeExpiredDeletedItems();
          const syncCount = await purgeExpiredSyncItems();
          logger.info({ dbCount, syncCount }, "Trash purge completed");
        } catch (error) {
          logger.error({ err: error }, "Trash purge failed");
        } finally {
          release();
        }
      })();    },
    { timezone: env.cronTimezone },
  );

  const reminderJob = cron.schedule(
    "*/15 * * * *",
    () => {
      void (async () => {
        const release = beginBackgroundJob("task-reminders");
        try {
          const sent = await sendTaskReminders();
          if (sent > 0) {
            logger.info({ sent }, "Task reminders sent");
          }
        } catch (error) {
          logger.error({ err: error }, "Task reminders failed");
        } finally {
          release();
        }
      })();
    },
    { timezone: env.cronTimezone },
  );

  jobs.push(archiveJob, digestJob, usageResetJob, trashPurgeJob, reminderJob);

  logger.info(
    { timezone: env.cronTimezone, archive: "02:00", digest: "08:00", trashPurge: "03:00", reminders: "*/15" },
    "MindTasker cron scheduler started",
  );
}

export function stopMindtaskerScheduler(): void {
  for (const job of jobs) job.stop();
  jobs = [];
}
