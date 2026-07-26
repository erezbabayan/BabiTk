import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const email = process.argv[2] ?? "erezbabayan@gmail.com";
const grantPremium = process.argv.includes("--premium");
const grantAdmin = process.argv.includes("--admin");
const convexBin = join(root, "node_modules", "convex", "bin", "main.js");

const result = spawnSync(
  process.execPath,
  [
    convexBin,
    "run",
    "adminRestore:restoreDataToAuthUser",
    JSON.stringify({
      email,
      grantPremium,
      grantAdmin,
    }),
    "--push",
  ],
  { cwd: root, encoding: "utf8" },
);

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);
