import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startBackupScheduler } from "./jobs/backup.scheduler.js";
import { startMindtaskerScheduler } from "./jobs/mindtasker.scheduler.js";

const app = await buildApp();

startBackupScheduler(app.log);
startMindtaskerScheduler(app.log);

process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  app.log.error({ err: error }, "Uncaught exception");
});

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info({ port: env.port }, "BabiTk backend listening");
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
