# BabiTk — one-shot local bootstrap (no Supabase token required)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Step "Installing dependencies"
Push-Location $root
try {
  foreach ($pkg in @("backend", "web", "mobile")) {
    Push-Location (Join-Path $root $pkg)
    if (-not (Test-Path node_modules)) { npm ci 2>$null; if ($LASTEXITCODE -ne 0) { npm install } }
    Pop-Location
  }

  if (-not (Test-Path "$root\mobile\.env")) {
    Copy-Item "$root\mobile\.env.example" "$root\mobile\.env"
    Write-Host "Created mobile/.env from example"
  }

  Step "Backend tests"
  Push-Location "$root\backend"
  npm test
  if ($LASTEXITCODE -ne 0) { throw "Backend tests failed" }
  Pop-Location

  Step "Stack verification"
  $env:VERIFY_SKIP_SUPABASE_LINK = "1"
  node "$root\scripts\verify-stack.mjs"
  if ($LASTEXITCODE -ne 0) { throw "verify-stack failed" }

  Step "Environment check (informational)"
  node "$root\scripts\check-env.mjs"
  # non-zero expected without real Supabase

  Step "Starting dev servers"
  & "$root\scripts\run-dev.ps1"

  Write-Host ""
  Write-Host "BabiTk ready (demo mode):" -ForegroundColor Green
  Write-Host "  Web:     http://localhost:5173"
  Write-Host "  Backend: http://localhost:3001/health"
  Write-Host ""
  Write-Host "For Supabase cloud setup:" -ForegroundColor Yellow
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN="sbp_..."; $env:SUPABASE_DB_PASSWORD="..."; $env:SUPABASE_CREATE="1"'
  Write-Host "  .\scripts\setup-supabase.ps1"
}
finally {
  Pop-Location
}
