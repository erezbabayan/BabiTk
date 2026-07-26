# MindTasker — auto setup: Supabase if credentials exist, else local bootstrap
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $root ".supabase-local.env"

if (Test-Path $secrets) {
  Write-Host "Loading $secrets ..."
  Get-Content $secrets | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $name = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim()
    [Environment]::SetEnvironmentVariable($name, $val)
  }

  if ($env:SUPABASE_ACCESS_TOKEN -and $env:SUPABASE_DB_PASSWORD) {
    Write-Host "Running Supabase setup ..."
    & "$root\scripts\setup-supabase.ps1"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    if ($env:GOOGLE_CLIENT_ID -and $env:GOOGLE_CLIENT_SECRET) {
      Write-Host "Running Google login setup ..."
      & "$root\scripts\setup-google-auth.ps1"
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    $env:VERIFY_SKIP_SUPABASE_LINK = "1"
    node "$root\scripts\verify-stack.mjs"
    & "$root\scripts\run-dev.ps1"
    exit 0
  }
}

Write-Host "No .supabase-local.env — running local bootstrap (demo mode)"
& "$root\scripts\bootstrap.ps1"
