import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startBackupScheduler } from "./jobs/backup.scheduler.js";
import { startMindtaskerScheduler } from "./jobs/mindtasker.scheduler.js";

const app = await buildApp();

startBackupScheduler(app.log);
startMindtaskerScheduler(app.log);

try {
  await app.listen({ port: env.port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
