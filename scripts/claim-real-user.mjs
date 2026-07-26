import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexBin = join(root, "node_modules", "convex", "bin", "main.js");
const args = JSON.stringify({
  email: "erezbabayan@gmail.com",
  phone: "+972526448067",
  firstName: "Erez",
  lastName: "Babayan",
});

const result = spawnSync(
  process.execPath,
  [convexBin, "run", "--typecheck=disable", "internal/users:prepareRealUserAccount", args],
  { cwd: root, encoding: "utf8", windowsHide: true },
);

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
