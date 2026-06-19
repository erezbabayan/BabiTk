import { env } from "../config/env.js";
import { buildBackupNotificationMessage } from "../lib/app-links.js";
import type { BackupRunResult } from "../types/backup.js";
import { sendWhatsAppText } from "./whatsapp.service.js";

function getNotifyPhones(): string[] {
  if (!env.backupNotifyPhones) {
    return [];
  }

  return env.backupNotifyPhones
    .split(",")
    .map((phone) => phone.trim())
    .filter(Boolean);
}

export async function notifyBackupCompleted(
  result: BackupRunResult,
): Promise<{ sent: number; skipped: boolean }> {
  if (!env.backupNotifyEnabled) {
    return { sent: 0, skipped: true };
  }

  const phones = getNotifyPhones();
  if (phones.length === 0) {
    return { sent: 0, skipped: true };
  }

  const message = buildBackupNotificationMessage({
    status: result.status === "running" ? "failed" : result.status,
    trigger: result.manifest.trigger,
    archivePath: result.archivePath,
    errorMessage: result.errorMessage,
  });

  let sent = 0;
  for (const phone of phones) {
    try {
      await sendWhatsAppText(phone, message);
      sent += 1;
    } catch {
      // Continue notifying other recipients.
    }
  }

  return { sent, skipped: false };
}

export async function sendMindTaskerAppLinksNow(): Promise<{
  message: string;
  sent: number;
  skipped: boolean;
}> {
  const message = buildBackupNotificationMessage({
    status: "success",
    trigger: "manual",
  });

  const phones = getNotifyPhones();
  if (!env.backupNotifyEnabled || phones.length === 0) {
    return { message, sent: 0, skipped: true };
  }

  let sent = 0;
  for (const phone of phones) {
    try {
      await sendWhatsAppText(phone, message);
      sent += 1;
    } catch {
      // Continue notifying other recipients.
    }
  }

  return { message, sent, skipped: false };
}
