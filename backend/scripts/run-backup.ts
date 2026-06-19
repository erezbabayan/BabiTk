import { getActiveBackgroundJobs } from "../src/lib/background-jobs.js";
import { runFullBackupWhenIdle } from "../src/services/backup.service.js";

const active = getActiveBackgroundJobs();
if (active.length > 0) {
  console.log(`Waiting for background jobs to finish: ${active.join(", ")}`);
}

const result = await runFullBackupWhenIdle("manual");

console.log(
  JSON.stringify(
    {
      status: result.status,
      archivePath: result.archivePath,
      runId: result.runId,
      errorMessage: result.errorMessage,
      components: result.manifest.components,
    },
    null,
    2,
  ),
);

if (result.status === "failed") {
  process.exitCode = 1;
}
