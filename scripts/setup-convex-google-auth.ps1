# MindTasker - Convex Auth + Google OAuth (one-shot setup)
#
# Usage:
#   .\scripts\setup-convex-google-auth.ps1
#   .\scripts\setup-convex-google-auth.ps1 -GoogleClientId "xxx.apps.googleusercontent.com" -GoogleClientSecret "GOCSPX-..."

param(
  [string]$GoogleClientId = $env:GOOGLE_CLIENT_ID,
  [string]$GoogleClientSecret = $env:GOOGLE_CLIENT_SECRET,
  [string]$SiteUrl = "https://babitk-app.azurewebsites.net"
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

$convexSite = Read-EnvValue "$root\.env.local" "CONVEX_SITE_URL"
if (-not $convexSite) {
  $convexUrl = Read-EnvValue "$root\.env.local" "CONVEX_URL"
  if ($convexUrl -match "^https://(.+)\.convex\.cloud$") {
    $convexSite = "https://$($Matches[1]).convex.site"
  }
}

if (-not $convexSite) {
  throw "Missing CONVEX_SITE_URL in .env.local — run npx convex dev first"
}

$callbackUrl = "$convexSite/api/auth/callback/google"

Write-Host ""
Write-Host "=== BabiTk / MindTasker — Google login (Convex Auth) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Google Cloud Console — create OAuth Web client with:" -ForegroundColor Yellow
Write-Host "  Authorized JavaScript origins: $SiteUrl"
Write-Host "  Authorized redirect URIs:       $callbackUrl"
Write-Host ""
Write-Host "Opening Google Cloud credentials..."
Start-Process "https://console.cloud.google.com/apis/credentials"
Start-Sleep -Seconds 1
Start-Process "https://console.cloud.google.com/auth/clients/create?project=_"

if (Test-Path "$root\.supabase-local.env") {
  if (-not $GoogleClientId) {
    $GoogleClientId = Read-EnvValue "$root\.supabase-local.env" "GOOGLE_CLIENT_ID"
  }
  if (-not $GoogleClientSecret) {
    $GoogleClientSecret = Read-EnvValue "$root\.supabase-local.env" "GOOGLE_CLIENT_SECRET"
  }
}

if (-not $GoogleClientId -or $GoogleClientId -match "your-client") {
  $GoogleClientId = Read-Host "Paste Google Client ID"
}
if (-not $GoogleClientSecret -or $GoogleClientSecret -match "GOCSPX-\.\.\.") {
  $GoogleClientSecret = Read-Host "Paste Google Client Secret" -AsSecureString
  $GoogleClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($GoogleClientSecret)
  )
}

Push-Location $root
try {
  Write-Host "Setting Convex environment variables..." -ForegroundColor Green
  npx convex env set SITE_URL $SiteUrl
  npx convex env set AUTH_GOOGLE_ID $GoogleClientId
  npx convex env set AUTH_GOOGLE_SECRET $GoogleClientSecret
  Write-Host ""
  Write-Host "Done. Restart the dev server and try Google sign-in." -ForegroundColor Green
  Write-Host ""
}
finally {
  Pop-Location
}
