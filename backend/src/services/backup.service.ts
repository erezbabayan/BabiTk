import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import {
  beginBackgroundJob,
  waitForBackgroundJobsIdle,
} from "../lib/background-jobs.js";
import type {
  BackupComponentResult,
  BackupManifest,
  BackupRunResult,
  BackupRunStatus,
  BackupTrigger,
} from "../types/backup.js";

function timestampForFilename(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: env.backupTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "_")
    .replace(/:/g, "-");
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function getPathSizeBytes(targetPath: string): Promise<number> {
  const info = await stat(targetPath);
  if (info.isFile()) {
    return info.size;
  }

  let total = 0;
  const entries = await readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      total += await getPathSizeBytes(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
}

async function runPgDump(databaseUrl: string, outputFile: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pg_dump",
      [
        databaseUrl,
        "--no-owner",
        "--no-acl",
        "--format=plain",
        `--file=${outputFile}`,
      ],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      reject(error);
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `pg_dump exited with code ${code}`));
    });
  });
}

async function backupDatabase(workDir: string): Promise<BackupComponentResult> {
  if (!env.databaseUrl) {
    return {
      status: "skipped",
      error: "DATABASE_URL is not configured",
    };
  }

  const outputFile = path.join(workDir, "database.sql");

  try {
    await runPgDump(env.databaseUrl, outputFile);
    const sizeBytes = await getPathSizeBytes(outputFile);
    return {
      status: "ok",
      file: "database.sql",
      sizeBytes,
    };
  } catch (error) {
    return {
      status: "failed",
      error:
        error instanceof Error ? error.message : "Database backup failed",
    };
  }
}

async function listStorageObjects(
  supabase: SupabaseClient,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const objects: string[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(`Storage list failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        const nested = await listStorageObjects(supabase, bucket, itemPath);
        objects.push(...nested);
      } else {
        objects.push(itemPath);
      }
    }

    if (data.length < limit) {
      break;
    }

    offset += limit;
  }

  return objects;
}

function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !url.includes("[project-ref]")
    );
  } catch {
    return false;
  }
}

function hasSupabaseAdminConfig(): boolean {
  return Boolean(
    env.supabaseUrl &&
      env.supabaseServiceRoleKey &&
      isValidSupabaseUrl(env.supabaseUrl),
  );
}
async function backupStorage(workDir: string): Promise<BackupComponentResult> {
  if (!hasSupabaseAdminConfig()) {
    return {
      status: "skipped",
      error: "Supabase credentials are not configured",
    };
  }

  const storageDir = path.join(workDir, "storage");
  await ensureDir(storageDir);

  const supabase = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const objects = await listStorageObjects(
      supabase,
      env.backupStorageBucket,
    );

    let downloaded = 0;
    for (const objectPath of objects) {
      const { data, error } = await supabase.storage
        .from(env.backupStorageBucket)
        .download(objectPath);

      if (error || !data) {
        throw new Error(
          `Failed to download ${objectPath}: ${error?.message ?? "empty file"}`,
        );
      }

      const destination = path.join(storageDir, objectPath);
      await ensureDir(path.dirname(destination));
      const buffer = Buffer.from(await data.arrayBuffer());
      await writeFile(destination, buffer);
      downloaded += 1;
    }

    const sizeBytes = await getPathSizeBytes(storageDir);
    return {
      status: "ok",
      file: "storage/",
      fileCount: downloaded,
      sizeBytes,
    };
  } catch (error) {
    return {
      status: "failed",
      error:
        error instanceof Error ? error.message : "Storage backup failed",
    };
  }
}

async function createArchive(
  workDir: string,
  archivePath: string,
): Promise<void> {
  await ensureDir(path.dirname(archivePath));

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(archivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(workDir, false);
    void archive.finalize();
  });
}

function resolveRunStatus(manifest: BackupManifest): BackupRunStatus {
  const { database, storage, migrations, syncStore } = manifest.components;
  const results = [database.status, storage.status, migrations.status, syncStore.status];

  if (results.every((status) => status === "ok" || status === "skipped")) {
    if (results.includes("ok")) {
      return "success";
    }
    return "failed";
  }

  if (results.includes("ok")) {
    return "partial";
  }

  return "failed";
}

async function backupLocalSyncStore(workDir: string): Promise<BackupComponentResult> {
  const syncFile = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../data/sync-items.json",
  );

  try {
    await stat(syncFile);
    const target = path.join(workDir, "sync-items.json");
    await copyFile(syncFile, target);
    const sizeBytes = await getPathSizeBytes(target);
    return {
      status: "ok",
      file: "sync-items.json",
      sizeBytes,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        status: "skipped",
        error: "Local sync store file not found",
      };
    }
    return {
      status: "failed",
      error:
        error instanceof Error ? error.message : "Local sync store backup failed",
    };
  }
}

async function backupMigrations(workDir: string): Promise<BackupComponentResult> {
  const migrationsDir = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../supabase/migrations",
  );
  const targetDir = path.join(workDir, "migrations");

  try {
    await ensureDir(targetDir);
    const files = await readdir(migrationsDir);
    let copied = 0;
    for (const file of files) {
      if (!file.endsWith(".sql")) continue;
      await copyFile(path.join(migrationsDir, file), path.join(targetDir, file));
      copied += 1;
    }
    const sizeBytes = await getPathSizeBytes(targetDir);
    return {
      status: copied > 0 ? "ok" : "skipped",
      file: "migrations/",
      fileCount: copied,
      sizeBytes,
    };
  } catch (error) {
    return {
      status: "failed",
      error:
        error instanceof Error ? error.message : "Migrations backup failed",
    };
  }
}

async function insertBackupRun(
  trigger: BackupTrigger,
  status: BackupRunStatus,
  manifest: BackupManifest,
  archivePath: string | null,
  errorMessage: string | null,
): Promise<string | null> {
  if (!hasSupabaseAdminConfig()) {
    return null;
  }

  const supabase = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("backup_runs")
    .insert({
      trigger_type: trigger,
      status,
      archive_path: archivePath,
      manifest,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return null;
  }

  return data.id;
}

async function pruneOldBackups(): Promise<void> {
  const backupRoot = env.backupDir;
  await ensureDir(backupRoot);

  const entries = await readdir(backupRoot, { withFileTypes: true });
  const archives = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".zip"))
      .map(async (entry) => {
        const fullPath = path.join(backupRoot, entry.name);
        const info = await stat(fullPath);
        return { fullPath, mtimeMs: info.mtimeMs };
      }),
  );

  archives.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = archives.slice(env.backupRetentionCount);
  await Promise.all(toDelete.map((entry) => rm(entry.fullPath, { force: true })));
}

export async function runFullBackup(
  trigger: BackupTrigger,
): Promise<BackupRunResult> {
  const release = beginBackgroundJob("full-backup");
  try {
    return await runFullBackupInternal(trigger);
  } finally {
    release();
  }
}

export async function runFullBackupWhenIdle(
  trigger: BackupTrigger,
): Promise<BackupRunResult> {
  await waitForBackgroundJobsIdle();
  return runFullBackup(trigger);
}

async function runFullBackupInternal(
  trigger: BackupTrigger,
): Promise<BackupRunResult> {
  const startedAt = new Date();
  const stamp = timestampForFilename(startedAt);
  const workDir = path.join(env.backupDir, `.work-${stamp}`);
  const archivePath = path.join(env.backupDir, `mindtasker-full-${stamp}.zip`);

  const manifest: BackupManifest = {
    version: 1,
    createdAt: startedAt.toISOString(),
    trigger,
    timezone: env.backupTimezone,
    components: {
      database: { status: "skipped" },
      storage: { status: "skipped" },
      migrations: { status: "skipped" },
      syncStore: { status: "skipped" },
    },
  };

  let errorMessage: string | null = null;

  try {
    await ensureDir(env.backupDir);
    await ensureDir(workDir);

    manifest.components.database = await backupDatabase(workDir);
    manifest.components.storage = await backupStorage(workDir);
    manifest.components.migrations = await backupMigrations(workDir);
    manifest.components.syncStore = await backupLocalSyncStore(workDir);

    await writeFile(
      path.join(workDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    await createArchive(workDir, archivePath);
    await pruneOldBackups();
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unexpected backup failure";
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  const status = errorMessage ? "failed" : resolveRunStatus(manifest);
  const runId = await insertBackupRun(
    trigger,
    status,
    manifest,
    errorMessage ? null : archivePath,
    errorMessage,
  );

  const result: BackupRunResult = {
    runId,
    status,
    archivePath: errorMessage ? null : archivePath,
    manifest,
    errorMessage,
  };

  try {
    const { notifyBackupCompleted } = await import("./backup-notification.service.js");
    await notifyBackupCompleted(result);
  } catch {
    // Backup result is still returned even if notification fails.
  }

  return result;
}
