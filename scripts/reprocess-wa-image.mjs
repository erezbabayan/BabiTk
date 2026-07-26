/**
 * Re-ingest a recent WhatsApp image via Convex backfill / direct schedule.
 * Usage: node scripts/reprocess-wa-image.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = {
  email: "erezbabayan@gmail.com",
  minutes: 720,
};
const path = "scripts/.reprocess-wa-args.json";
writeFileSync(path, JSON.stringify(args));
console.log(
  execSync(`npx convex run whatsappCaptureBackfill:backfillRecentOutgoingCapture ${path}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }),
);
