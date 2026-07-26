# Opens Google Cloud Console in your default browser with the exact URLs
# needed for BabiTk / MindTasker Convex Google login.
# After creating the OAuth client, save credentials to .google-oauth.local.env
# and run: node scripts/apply-google-oauth.mjs

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
if (-not $convexSite) { $convexSite = "https://scintillating-fly-225.convex.site" }

$callback = "$convexSite/api/auth/callback/google"
$origin = "http://localhost:5173"

$instructions = @"
BabiTk — Google login setup
============================

1) Open Google Cloud credentials (browser will open).
2) Click: Create credentials -> OAuth client ID
3) Application type: Web application
4) Name: BabiTk (or MindTasker)
5) Authorized JavaScript origins:
   $origin
6) Authorized redirect URIs:
   $callback
7) Click Create — copy Client ID and Client Secret

8) Create file: .google-oauth.local.env  (in repo root) with:

GOOGLE_CLIENT_ID=YOUR_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

9) Run in terminal:
   node scripts/apply-google-oauth.mjs

Then refresh http://localhost:5173 and click Sign in with Google.
"@

$instructionsPath = Join-Path $root "GOOGLE-OAUTH-SETUP.txt"
Set-Content -Path $instructionsPath -Value $instructions -Encoding UTF8

Write-Host ""
Write-Host $instructions -ForegroundColor Cyan
Write-Host ""
Write-Host "Saved to: $instructionsPath" -ForegroundColor Green
Write-Host "Opening Google Cloud Console in your browser..." -ForegroundColor Yellow

Start-Process "https://console.cloud.google.com/apis/credentials"
Start-Sleep -Seconds 2
Start-Process "https://console.cloud.google.com/auth/clients/create"

# Open instructions file
Start-Process notepad.exe $instructionsPath
