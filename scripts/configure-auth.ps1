# MindTasker — one-shot auth setup: Supabase + Google login
# Usage:
#   1. Copy .supabase-local.env.example -> .supabase-local.env and fill credentials
#   2. .\scripts\configure-auth.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $root ".supabase-local.env"

if (-not (Test-Path $secrets)) {
  Write-Host ""
  Write-Host "Create .supabase-local.env first:" -ForegroundColor Yellow
  Write-Host "  Copy-Item .supabase-local.env.example .supabase-local.env"
  Write-Host "  # fill SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET"
  Write-Host ""
  exit 1
}

Write-Host "Loading .supabase-local.env ..."
Get-Content $secrets | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $name = $line.Substring(0, $i).Trim()
  $val = $line.Substring($i + 1).Trim()
  [Environment]::SetEnvironmentVariable($name, $val)
}

if (-not $env:SUPABASE_ACCESS_TOKEN -or -not $env:SUPABASE_DB_PASSWORD) {
  throw "Missing SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD in .supabase-local.env"
}

Write-Host "`n==> Supabase project + migrations" -ForegroundColor Cyan
& "$root\scripts\setup-supabase.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n==> Google login provider" -ForegroundColor Cyan
& "$root\scripts\setup-google-auth.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n==> Environment check" -ForegroundColor Cyan
$env:VERIFY_SKIP_SUPABASE_LINK = "1"
node "$root\scripts\verify-stack.mjs"

Write-Host ""
Write-Host "Auth setup complete. Start the app:" -ForegroundColor Green
Write-Host "  .\scripts\run-dev.ps1"
Write-Host "  http://localhost:5173"
Write-Host ""
