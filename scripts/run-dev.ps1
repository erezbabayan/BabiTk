# Start MindTasker backend + web with auto-restart supervisor
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "Starting BabiTk dev supervisor (auto-restart on crash)..."
Write-Host "  Convex:  syncing functions (convex dev)"
Write-Host "  Web:     http://localhost:5173"
Write-Host "  Backend: http://localhost:3001/health"
Write-Host "  Stop with Ctrl+C"
Write-Host ""

Set-Location $root
node "$root\scripts\dev-supervisor.mjs"
