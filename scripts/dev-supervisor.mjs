#!/usr/bin/env node
/**
 * Keeps BabiTk dev servers running with automatic restart on crash.
 * Usage:
 *   node scripts/dev-supervisor.mjs           # backend + web
 *   node scripts/dev-supervisor.mjs --expo    # + Expo mobile
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const withExpo = process.argv.includes("--expo");
const isWin = process.platform === "win32";

function detectLanIp() {
  if (process.env.REACT_NATIVE_PACKAGER_HOSTNAME?.trim()) {
    return process.env.REACT_NATIVE_PACKAGER_HOSTNAME.trim();
  }

  if (isWin) {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.254*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress)",
      ],
      { encoding: "utf8" },
    );
    const ip = result.stdout?.trim();
    if (ip) return ip;
  }

  return "127.0.0.1";
}

const lanIp = detectLanIp();

/** @type {Array<{ name: string; cwd: string; command: string; args: string[]; port?: number; healthUrl?: string; startDelayMs: number }>} */
const services = [
  {
    name: "convex",
    cwd: root,
    command: "npx",
    args: ["convex", "dev"],
    startDelayMs: 0,
  },
  {
    name: "backend",
    cwd: path.join(root, "backend"),
    command: "npm",
    args: ["run", "dev"],
    port: 3001,
    healthUrl: "http://127.0.0.1:3001/health",
    startDelayMs: 0,
  },
  {
    name: "web",
    cwd: path.join(root, "web"),
    command: "npm",
    args: ["run", "dev"],
    port: 5173,
    healthUrl: "http://127.0.0.1:5173/",
    startDelayMs: 2500,
  },
];

if (withExpo) {
  services.push({
    name: "expo",
    cwd: path.join(root, "mobile"),
    command: "npx",
    args: ["expo", "start", "--host", "lan", "--port", "8081"],
    port: 8081,
    healthUrl: `http://${lanIp}:8081/`,
    startDelayMs: 5000,
    lanHost: lanIp,
  });
}

let shuttingDown = false;

/** @type {Map<string, { child: import('node:child_process').ChildProcess | null; restarts: number; timer?: NodeJS.Timeout; startedAt: number; healthFailures: number }>} */
const running = new Map();

function log(service, message) {
  const stamp = new Date().toLocaleTimeString("he-IL", { hour12: false });
  console.log(`[${stamp}] [supervisor:${service}] ${message}`);
}

function freePort(port) {
  if (!port) return;
  if (isWin) {
    const result = spawnSync("powershell", [
      "-NoProfile",
      "-Command",
      `$p = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Output \"freed $port pid $p\" }`,
    ], { encoding: "utf8" });
    const output = result.stdout?.trim();
    if (output) log("port", output);
    return;
  }

  const result = spawnSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" });
  const pids = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
      log("port", `freed ${port} pid ${pid}`);
    } catch {
      // ignore
    }
  }
}

async function checkHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

function scheduleStart(service, delayMs = 0) {
  const state = running.get(service.name);
  if (!state || shuttingDown) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => startService(service), delayMs);
}

function startService(service) {
  const state = running.get(service.name);
  if (!state || shuttingDown) return;

  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = undefined;
  }

  if (service.port) freePort(service.port);

  log(service.name, `starting (restart #${state.restarts})`);
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      ...(service.lanHost
        ? {
            REACT_NATIVE_PACKAGER_HOSTNAME: service.lanHost,
            EXPO_DEVTOOLS_LISTEN_ADDRESS: "0.0.0.0",
          }
        : {}),
    },
    stdio: "inherit",
    shell: isWin,
  });

  state.child = child;
  state.startedAt = Date.now();
  state.healthFailures = 0;

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    state.child = null;
    state.restarts += 1;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(state.restarts - 1, 5));
    log(
      service.name,
      `exited (code=${code ?? "null"}, signal=${signal ?? "null"}) — restarting in ${Math.round(delay / 1000)}s`,
    );
    scheduleStart(service, delay);
  });
}

async function healthWatch() {
  if (shuttingDown) return;

  for (const service of services) {
    // Only backend benefits from HTTP health checks; dev bundlers restart themselves.
    if (service.name !== "backend" || !service.healthUrl) continue;
    const state = running.get(service.name);
    if (!state?.child?.pid) continue;

    const uptimeMs = Date.now() - state.startedAt;
    if (uptimeMs < 45_000) continue;

    const healthy = await checkHealth(service.healthUrl);
    if (healthy) {
      state.healthFailures = 0;
      continue;
    }

    state.healthFailures += 1;
    if (state.healthFailures < 3) {
      log(service.name, `health check failed (${state.healthFailures}/3)`);
      continue;
    }

    log(service.name, "unhealthy for 3 checks — restarting");
    state.healthFailures = 0;
    try {
      if (isWin && state.child?.pid) {
        spawnSync("taskkill", ["/PID", String(state.child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        state.child.kill("SIGTERM");
      }
    } catch {
      // process exit handler will restart
    }
  }

  setTimeout(() => void healthWatch(), 30_000);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[supervisor] shutting down...");
  for (const state of running.values()) {
    if (state.timer) clearTimeout(state.timer);
    try {
      state.child?.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(0), 1500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("BabiTk dev supervisor");
console.log(`  Root: ${root}`);
console.log(`  Services: ${services.map((s) => s.name).join(", ")}`);
console.log("  Auto-restart on crash. Press Ctrl+C to stop.\n");

for (const service of services) {
  running.set(service.name, {
    child: null,
    restarts: 0,
    startedAt: 0,
    healthFailures: 0,
  });
  scheduleStart(service, service.startDelayMs);
}

setTimeout(() => void healthWatch(), 60_000);

// Health-based restarts are disabled for Vite/Expo — they caused false positives
// during HMR and busy transforms. Only process exit triggers restart.
