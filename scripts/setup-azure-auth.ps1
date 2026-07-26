# BabiTk — connect Microsoft / Azure login (via Supabase)
#
# Prerequisites: Supabase project linked (run setup-supabase.ps1 first)
#
# Usage:
#   .\scripts\setup-azure-auth.ps1
#   .\scripts\setup-azure-auth.ps1 -ProjectRef "abcdefghijklmnop"

param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$UserEmail = "erezbabayan@gmail.com"
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

if (-not $ProjectRef) {
  $url = Read-EnvValue "$root\web\.env" "VITE_SUPABASE_URL"
  if ($url -match "https://([^.]+)\.supabase\.co") {
    $ProjectRef = $Matches[1]
  }
}

if (-not $ProjectRef) {
  throw "Missing SUPABASE_PROJECT_REF. Run setup-supabase.ps1 first or pass -ProjectRef."
}

$callbackUrl = "https://$ProjectRef.supabase.co/auth/v1/callback"
$siteUrl = "http://localhost:5173"

Write-Host ""
Write-Host "=== BabiTk — Microsoft / Azure login setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Account email: $UserEmail"
Write-Host "Supabase project: $ProjectRef"
Write-Host ""
Write-Host "STEP 1 — Azure Portal (portal.azure.com)" -ForegroundColor Yellow
Write-Host "  1. Microsoft Entra ID -> App registrations -> New registration"
Write-Host "  2. Name: BabiTk"
Write-Host "  3. Supported account types: Personal Microsoft + work/school"
Write-Host "  4. Redirect URI (Web):"
Write-Host "     $callbackUrl"
Write-Host "  5. Save Application (client) ID"
Write-Host "  6. Certificates & secrets -> New client secret -> copy the VALUE"
Write-Host ""
Write-Host "STEP 2 — Supabase Dashboard" -ForegroundColor Yellow
Write-Host "  https://supabase.com/dashboard/project/$ProjectRef/auth/providers"
Write-Host "  1. Enable Azure provider"
Write-Host "  2. Paste Client ID + Client Secret from Azure"
Write-Host "  3. Azure Tenant URL: https://login.microsoftonline.com/common"
Write-Host "  4. Authentication -> URL Configuration -> add redirect URLs:"
Write-Host "     - $siteUrl"
Write-Host "     - BabiTk://**"
Write-Host ""
Write-Host "STEP 3 — Local .env (after setup-supabase.ps1)" -ForegroundColor Yellow
Write-Host "  web/.env:     VITE_DEMO_MODE=false"
Write-Host "  mobile/.env:  EXPO_PUBLIC_DEMO_MODE=false"
Write-Host ""
Write-Host "STEP 4 — Run the app" -ForegroundColor Yellow
Write-Host "  .\scripts\run-dev.ps1"
Write-Host "  Open $siteUrl -> click Sign in with Microsoft"
Write-Host "  Sign in with: $UserEmail"
Write-Host ""
Write-Host "WhatsApp phone (+972526448067) stays linked in Convex separately."
Write-Host ""
