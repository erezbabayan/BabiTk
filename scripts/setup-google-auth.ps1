# BabiTk - enable Google login in Supabase + verify redirect URLs
#
# Prerequisites:
#   - Supabase project (run setup-supabase.ps1 first)
#   - Google OAuth Web client (console.cloud.google.com)
#
# Credentials (first match wins):
#   - Environment variables
#   - .supabase-local.env in repo root
#   - backend/.env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
#
# Usage:
#   .\scripts\setup-google-auth.ps1
#   .\scripts\setup-google-auth.ps1 -ProjectRef "abcdefghijklmnop"

param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$GoogleClientId = $env:GOOGLE_CLIENT_ID,
  [string]$GoogleClientSecret = $env:GOOGLE_CLIENT_SECRET,
  [string]$SupabaseAccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$SiteUrl = "http://localhost:5173"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Read-EnvValue($path, $name) {
  if (-not (Test-Path $path)) { return $null }
  foreach ($line in Get-Content $path) {
    if ($line -match "^$name=(.+)$") { return $Matches[1].Trim() }
  }
  return $null
}

function Load-DotEnvFile($path) {
  if (-not (Test-Path $path)) { return }
  foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $i = $trimmed.IndexOf("=")
    if ($i -lt 1) { continue }
    $name = $trimmed.Substring(0, $i).Trim()
    $val = $trimmed.Substring($i + 1).Trim()
    if (-not [Environment]::GetEnvironmentVariable($name)) {
      [Environment]::SetEnvironmentVariable($name, $val)
    }
  }
}

Load-DotEnvFile (Join-Path $root ".supabase-local.env")

if (-not $SupabaseAccessToken) {
  $SupabaseAccessToken = $env:SUPABASE_ACCESS_TOKEN
}
if (-not $GoogleClientId) {
  $GoogleClientId = $env:GOOGLE_CLIENT_ID
  if (-not $GoogleClientId) {
    $GoogleClientId = Read-EnvValue "$root\backend\.env" "GOOGLE_CLIENT_ID"
  }
}
if (-not $GoogleClientSecret) {
  $GoogleClientSecret = $env:GOOGLE_CLIENT_SECRET
  if (-not $GoogleClientSecret) {
    $GoogleClientSecret = Read-EnvValue "$root\backend\.env" "GOOGLE_CLIENT_SECRET"
  }
}
if (-not $ProjectRef) {
  $url = Read-EnvValue "$root\web\.env" "VITE_SUPABASE_URL"
  if (-not $url) { $url = Read-EnvValue "$root\backend\.env" "SUPABASE_URL" }
  if ($url -match "https://([^.]+)\.supabase\.co") {
    $ProjectRef = $Matches[1]
  }
}

if ($ProjectRef -match "\[project-ref\]|your-project") {
  $ProjectRef = $null
}

function Show-ManualSteps($ref) {
  $callbackUrl = "https://$ref.supabase.co/auth/v1/callback"
  Write-Host ""
  Write-Host "=== Manual steps (if API setup is skipped) ===" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Google Cloud Console -> Credentials -> OAuth client (Web):"
  Write-Host "  Authorized redirect URI: $callbackUrl"
  Write-Host ""
  Write-Host "Supabase Dashboard:"
  Write-Host "  https://supabase.com/dashboard/project/$ref/auth/providers"
  Write-Host "  Enable Google + paste Client ID and Secret"
  Write-Host ""
  Write-Host "Authentication -> URL Configuration:"
  Write-Host "  Site URL: $SiteUrl"
  Write-Host "  Redirect URLs: $SiteUrl/**, BabiTk://**"
  Write-Host ""
}

if (-not $ProjectRef) {
  Write-Host "Missing Supabase project ref." -ForegroundColor Red
  Write-Host "Run: .\scripts\setup-supabase.ps1"
  throw "Missing SUPABASE_PROJECT_REF"
}

$callbackUrl = "https://$ProjectRef.supabase.co/auth/v1/callback"
$redirectAllowList = "$SiteUrl/**,BabiTk://**"

Write-Host ""
Write-Host "=== BabiTk Google login setup ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRef"
Write-Host "Callback: $callbackUrl"
Write-Host ""

$placeholderGoogle = (-not $GoogleClientId) -or $GoogleClientId -match "your-client|placeholder"
$placeholderSecret = (-not $GoogleClientSecret) -or $GoogleClientSecret -match "GOCSPX-\.\.\.|placeholder"

if ($placeholderGoogle -or $placeholderSecret) {
  Write-Host "Google OAuth credentials not configured." -ForegroundColor Yellow
  Write-Host "Add to .supabase-local.env (copy from .supabase-local.env.example):"
  Write-Host "  GOOGLE_CLIENT_ID=....apps.googleusercontent.com"
  Write-Host "  GOOGLE_CLIENT_SECRET=GOCSPX-..."
  Show-ManualSteps $ProjectRef
  exit 1
}

if (-not $SupabaseAccessToken) {
  Write-Host "SUPABASE_ACCESS_TOKEN not set - cannot auto-configure Supabase." -ForegroundColor Yellow
  Write-Host "Get a token: https://supabase.com/dashboard/account/tokens"
  Write-Host "Add to .supabase-local.env or run:"
  Write-Host '  $env:SUPABASE_ACCESS_TOKEN="sbp_..."'
  Show-ManualSteps $ProjectRef
  exit 1
}

$headers = @{
  Authorization = "Bearer $SupabaseAccessToken"
  "Content-Type" = "application/json"
}

$body = @{
  external_google_enabled = $true
  external_google_client_id = $GoogleClientId
  external_google_secret = $GoogleClientSecret
  site_url = $SiteUrl
  uri_allow_list = $redirectAllowList
} | ConvertTo-Json

Write-Host "Configuring Supabase Auth (Google provider + redirect URLs) ..."
try {
  $null = Invoke-RestMethod `
    -Method Patch `
    -Uri "https://api.supabase.com/v1/projects/$ProjectRef/config/auth" `
    -Headers $headers `
    -Body $body
  Write-Host "Supabase Google provider enabled." -ForegroundColor Green
}
catch {
  $detail = $_.ErrorDetails.Message
  if (-not $detail) { $detail = $_.Exception.Message }
  Write-Host "Supabase API error: $detail" -ForegroundColor Red
  Show-ManualSteps $ProjectRef
  throw
}

function Update-EnvFile($path, $updates) {
  if (-not (Test-Path $path)) {
    if (Test-Path "$path.example") { Copy-Item "$path.example" $path }
  }
  $content = if (Test-Path $path) { Get-Content $path -Raw } else { "" }
  foreach ($key in $updates.Keys) {
    $val = $updates[$key]
    if ($content -match "(?m)^$key=.*$") {
      $content = $content -replace "(?m)^$key=.*$", "$key=$val"
    } else {
      $content += "`n$key=$val"
    }
  }
  Set-Content -Path $path -Value $content.TrimEnd() -NoNewline
  Add-Content -Path $path -Value ""
}

$supabaseUrl = "https://$ProjectRef.supabase.co"
$anon = Read-EnvValue "$root\web\.env" "VITE_SUPABASE_ANON_KEY"
if (-not $anon) { $anon = Read-EnvValue "$root\backend\.env" "SUPABASE_ANON_KEY" }

if ($anon -and -not $anon.StartsWith("your-") -and -not $anon.StartsWith("eyJ...")) {
  Update-EnvFile "$root\web\.env" @{
    "VITE_DEMO_MODE" = "false"
    "VITE_SUPABASE_URL" = $supabaseUrl
    "VITE_SUPABASE_ANON_KEY" = $anon
  }
  Update-EnvFile "$root\mobile\.env" @{
    "EXPO_PUBLIC_DEMO_MODE" = "false"
    "EXPO_PUBLIC_SUPABASE_URL" = $supabaseUrl
    "EXPO_PUBLIC_SUPABASE_ANON_KEY" = $anon
  }
  Write-Host "Updated web/.env and mobile/.env (demo mode off)." -ForegroundColor Green
}

Write-Host ""
Write-Host "Verify in Google Cloud Console that this redirect URI exists:" -ForegroundColor Yellow
Write-Host "  $callbackUrl"
Write-Host ""
Write-Host "Then run: .\scripts\run-dev.ps1"
Write-Host "Open $SiteUrl and use Sign in with Google"
Write-Host ""
