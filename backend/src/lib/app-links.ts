import { env } from "../config/env.js";

export interface MindTaskerAppLinks {
  web: string;
  android: string;
}

export function getMindTaskerAppLinks(): MindTaskerAppLinks {
  return {
    web: env.webAppUrl,
    android: env.androidAppUrl,
  };
}

export function buildBackupNotificationMessage(options: {
  status: "success" | "partial" | "failed";
  trigger: "scheduled" | "manual";
  archivePath?: string | null;
  errorMessage?: string | null;
}): string {
  const links = getMindTaskerAppLinks();
  const statusLabel =
    options.status === "success"
      ? "הושלם בהצלחה"
      : options.status === "partial"
        ? "הושלם חלקית"
        : "נכשל";

  const triggerLabel = options.trigger === "scheduled" ? "מתוזמן" : "ידני";
  const lines = [
    `גיבוי MindTasker ${statusLabel} (${triggerLabel}).`,
    "",
    `מחשב: ${links.web}`,
    `אנדרואיד: ${links.android}`,
  ];

  if (options.archivePath) {
    lines.push("", `קובץ גיבוי: ${options.archivePath}`);
  }

  if (options.errorMessage) {
    lines.push("", `שגיאה: ${options.errorMessage}`);
  }

  return lines.join("\n");
}
