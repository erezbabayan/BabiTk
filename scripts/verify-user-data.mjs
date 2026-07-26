#!/usr/bin/env node
/**
 * Verify restored user data and account flags on Convex.
 */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexBin = join(root, "node_modules", "convex", "bin", "main.js");
const email = process.argv[2] ?? "erezbabayan@gmail.com";

function runInline(query) {
  const result = spawnSync(
    process.execPath,
    [convexBin, "run", "--inline-query", query],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

const userQuery = `
const user = await ctx.db.query("users").withIndex("email", q => q.eq("email", ${JSON.stringify(email)})).unique();
if (!user) return { error: "user not found" };
const tasks = await ctx.db.query("tasks").withIndex("by_user", q => q.eq("userId", user._id)).collect();
const notebooks = await ctx.db.query("notebooks").withIndex("by_user", q => q.eq("userId", user._id)).collect();
const taskLists = await ctx.db.query("taskLists").withIndex("by_user", q => q.eq("userId", user._id)).collect();
return {
  email: user.email,
  tier: user.tier ?? "free",
  role: user.role ?? "user",
  legacyId: user.legacyId ?? null,
  phone: user.phone ?? null,
  tasks: tasks.length,
  notebooks: notebooks.length,
  taskLists: taskLists.length,
};
`;

console.log(runInline(userQuery));
