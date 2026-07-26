# Build the web SPA and deploy to Azure App Service (babitk-app).
# Uses tar for the zip so paths use "/" - PowerShell Compress-Archive embeds "\"
# and Azure Linux/Kudu rsync fails with "Invalid argument".
#
# Hardening notes (Android web outages):
# - Do NOT restart after OneDeploy (it already recycles the container).
# - Keep healthCheckPath=/health permanently — flipping it mid-deploy caused
#   ContainerTimeout crash loops while Node was still warming certificates.
# - Raise WEBSITES_CONTAINER_START_TIME_LIMIT so slow cold starts don't kill the site.

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $Root "web"
$DistDir = Join-Path $WebDir "dist"
$ZipPath = Join-Path $Root ".deploy-babitk-web.zip"
$ResourceGroup = "babitk-rg"
$AppName = "babitk-app"
$ServerJs = Join-Path $WebDir "server.mjs"
$BuildId = (Get-Date -Format "yyyyMMdd-HHmmss")

Write-Host "==> Ensuring production env for Vite bake..."
$EnvProd = Join-Path $WebDir ".env.production"
$EnvDev = Join-Path $WebDir ".env"
if (-not (Test-Path $EnvProd) -and (Test-Path $EnvDev)) {
  Copy-Item $EnvDev $EnvProd -Force
  Write-Host "Created web/.env.production from web/.env"
}
if (-not (Test-Path $EnvProd)) {
  throw "Missing web/.env.production (need VITE_CONVEX_URL for production build)"
}
$viteConvex = (Select-String -Path $EnvProd -Pattern "^VITE_CONVEX_URL=(.+)$" | Select-Object -First 1)
if (-not $viteConvex) {
  throw "web/.env.production missing VITE_CONVEX_URL"
}
Write-Host "VITE_CONVEX_URL=$($viteConvex.Matches.Groups[1].Value.Trim())"
Write-Host "BUILD_ID=$BuildId"

Write-Host "==> Building web..."
Push-Location $WebDir
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit $LASTEXITCODE" }
} finally {
  Pop-Location
}

if (-not (Test-Path (Join-Path $DistDir "index.html"))) {
  throw "web/dist/index.html missing after build"
}
if (-not (Test-Path $ServerJs)) {
  throw "web/server.mjs missing"
}

# Ship the Node static server with the SPA (not pm2 serve --spa).
Copy-Item $ServerJs (Join-Path $DistDir "server.mjs") -Force
Set-Content -Path (Join-Path $DistDir "build-id.txt") -Value $BuildId -NoNewline

Write-Host "==> Packaging zip with Unix paths..."
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
# tar -a creates a zip; -C sets root so entries are index.html / assets/... (not web\dist\...)
& tar -a -cf $ZipPath -C $DistDir .
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit $LASTEXITCODE" }

Write-Host "==> Azure site config (Always On + Node static server)..."
# Note: don't set --linux-fx-version here; the "|" in "NODE|22-lts" gets mangled when
# PowerShell invokes az.cmd. The runtime is already configured and stable.
az webapp config set `
  -g $ResourceGroup -n $AppName `
  --startup-file "node /home/site/wwwroot/server.mjs" `
  --always-on true `
  -o none
if ($LASTEXITCODE -ne 0) { throw "az webapp config set failed" }

# Permanent Azure probe on "/" — always available once Node binds.
# /health remains for our deploy verification and monitoring (JSON).
# Using /health as Azure probe during deploys caused ContainerTimeout
# crash loops while the Linux container warmed certificates.
az webapp config set `
  -g $ResourceGroup -n $AppName `
  --generic-configurations '{\"healthCheckPath\":\"/\"}' `
  -o none

az webapp update -g $ResourceGroup -n $AppName --https-only true -o none

az webapp config appsettings set `
  -g $ResourceGroup -n $AppName `
  --settings `
    SCM_DO_BUILD_DURING_DEPLOYMENT=false `
    WEBSITES_PORT=8080 `
    WEBSITES_CONTAINER_START_TIME_LIMIT=1800 `
    WEBSITE_HTTPLOGGING_RETENTION_DAYS=3 `
    BABITK_BUILD_ID=$BuildId `
  -o none
if ($LASTEXITCODE -ne 0) { throw "az webapp config appsettings set failed" }

Write-Host "==> Deploying zip (OneDeploy recycles container - no extra restart)..."
az webapp deploy `
  -g $ResourceGroup -n $AppName `
  --src-path $ZipPath `
  --type zip `
  --async false
if ($LASTEXITCODE -ne 0) { throw "az webapp deploy failed" }

Write-Host "==> Waiting for site (no forced restart)..."
$ok = $false
$url = "https://$AppName.azurewebsites.net/"
$healthUrl = "https://$AppName.azurewebsites.net/health"
for ($i = 1; $i -le 24; $i++) {
  Start-Sleep -Seconds 8
  try {
    $h = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 25
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25
    try {
      Invoke-WebRequest -Uri "${url}assets/App-STALE-HASH-TEST.js" -UseBasicParsing -TimeoutSec 25 | Out-Null
      $staleStatus = 200
    } catch {
      if ($_.Exception.Response) {
        $staleStatus = [int]$_.Exception.Response.StatusCode
      } else {
        $staleStatus = 0
      }
    }
    try {
      Invoke-WebRequest -Uri "${url}api/usage/summary" -UseBasicParsing -TimeoutSec 15 | Out-Null
      $apiStatus = 200
    } catch {
      if ($_.Exception.Response) {
        $apiStatus = [int]$_.Exception.Response.StatusCode
      } else {
        $apiStatus = 0
      }
    }
    if ($h.StatusCode -eq 200 -and $r.StatusCode -eq 200 -and $staleStatus -eq 404 -and $apiStatus -eq 404) {
      Write-Host "OK health=$($h.StatusCode) home=$($r.StatusCode) stale-asset=404 api=404"
      Write-Host "health-body=$($h.Content)"
      $ok = $true
      break
    }
    Write-Host "try $i : health=$($h.StatusCode) home=$($r.StatusCode) stale=$staleStatus api=$apiStatus"
  } catch {
    Write-Host "try $i : $($_.Exception.Message)"
  }
}

if (-not $ok) { throw "Site did not become healthy after deploy (need /health 200 + asset 404 + /api 404)" }

Write-Host "DONE - $url"
