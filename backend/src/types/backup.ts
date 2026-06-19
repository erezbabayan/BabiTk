export type BackupTrigger = "scheduled" | "manual";

export type BackupComponentStatus = "ok" | "skipped" | "failed";

export type BackupRunStatus = "running" | "success" | "partial" | "failed";

export interface BackupComponentResult {
  status: BackupComponentStatus;
  file?: string;
  fileCount?: number;
  sizeBytes?: number;
  error?: string;
}

export interface BackupManifest {
  version: 1;
  createdAt: string;
  trigger: BackupTrigger;
  timezone: string;
  components: {
    database: BackupComponentResult;
    storage: BackupComponentResult;
    migrations: BackupComponentResult;
    syncStore: BackupComponentResult;
  };
}

export interface BackupRunResult {
  runId: string | null;
  status: BackupRunStatus;
  archivePath: string | null;
  manifest: BackupManifest;
  errorMessage: string | null;
}
