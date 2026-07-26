#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "mobile");
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

function freePort(port) {
  if (!isWin) return;
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$p = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { $p | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }`,
    ],
    { stdio: "ignore" },
  );
}

const lanIp = detectLanIp();
const port = 8081;
freePort(port);
console.log(`Expo LAN host: ${lanIp}`);
console.log(`Connect with Expo Go: exp://${lanIp}:${port}`);

const child = spawn(
  "npx",
  ["expo", "start", "--host", "lan", "--port", String(port), "--clear"],
  {
    cwd: mobileDir,
    env: {
      ...process.env,
      REACT_NATIVE_PACKAGER_HOSTNAME: lanIp,
      EXPO_DEVTOOLS_LISTEN_ADDRESS: "0.0.0.0",
    },
    stdio: "inherit",
    shell: isWin,
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
