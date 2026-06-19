# Start MindTasker backend + web (idempotent)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Test-Port($port) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Port 3001)) {
  Write-Host "Starting backend on :3001 ..."
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm run dev" -WindowStyle Minimized
  Start-Sleep -Seconds 3
} else {
  Write-Host "Backend already running on :3001"
}

if (-not (Test-Port 5173)) {
  Write-Host "Starting web on :5173 ..."
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; npm run dev" -WindowStyle Minimized
  Start-Sleep -Seconds 3
} else {
  Write-Host "Web already running on :5173"
}

Write-Host ""
Write-Host "MindTasker is up:"
Write-Host "  Web:     http://localhost:5173"
Write-Host "  Backend: http://localhost:3001/health"
Write-Host ""
Write-Host "Supabase not linked yet? Run:"
Write-Host '  $env:SUPABASE_ACCESS_TOKEN="sbp_..."; $env:SUPABASE_DB_PASSWORD="..."; $env:SUPABASE_CREATE="1"; .\scripts\setup-supabase.ps1'
