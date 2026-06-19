import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env.js";
import { runFullBackupWhenIdle } from "../services/backup.service.js";

let jobs: ScheduledTask[] = [];

export function startBackupScheduler(logger: {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}): void {
  if (!env.backupEnabled) {
    logger.info({}, "Backup scheduler disabled (BACKUP_ENABLED=false)");
    return;
  }

  const schedules = [
    { label: "morning", cron: "0 10 * * *" },
    { label: "evening", cron: "0 20 * * *" },
  ];

  for (const schedule of schedules) {
    const task = cron.schedule(
      schedule.cron,
      () => {
        void (async () => {
          logger.info(
            { schedule: schedule.label, cron: schedule.cron },
            "Starting scheduled full backup",
          );

          try {
            const result = await runFullBackupWhenIdle("scheduled");
            logger.info(
              {
                status: result.status,
                archivePath: result.archivePath,
                runId: result.runId,
              },
              "Scheduled full backup finished",
            );
          } catch (error) {
            logger.error(
              {
                err: error,
                schedule: schedule.label,
              },
              "Scheduled full backup crashed",
            );
          }
        })();
      },
      {
        timezone: env.backupTimezone,
      },
    );

    jobs.push(task);
  }

  logger.info(
    {
      timezone: env.backupTimezone,
      schedules: schedules.map((item) => item.cron),
    },
    "Backup scheduler started (10:00 and 20:00 daily)",
  );
}

export function stopBackupScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
}
