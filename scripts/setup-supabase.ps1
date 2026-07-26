# BabiTk — create (optional) + link + migrations + .env sync
# Usage (existing project):
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#   $env:SUPABASE_PROJECT_REF = "abcdefghijklmnop"
#   $env:SUPABASE_DB_PASSWORD = "your-db-password"
#   .\scripts\setup-supabase.ps1
#
# Usage (create new project):
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
#   $env:SUPABASE_DB_PASSWORD = "StrongPassword123!"
#   $env:SUPABASE_CREATE = "1"
#   # optional: $env:SUPABASE_ORG_ID = "..." ; $env:SUPABASE_REGION = "eu-central-1"
#   .\scripts\setup-supabase.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Require-Env($name) {
  $val = [Environment]::GetEnvironmentVariable($name)
  if (-not $val) {
    throw "Missing env var: $name. Get a token at https://supabase.com/dashboard/account/tokens"
  }
  return $val
}

function Get-Env($name, $default = $null) {
  $val = [Environment]::GetEnvironmentVariable($name)
  if ($val) { return $val }
  return $default
}

$token = Require-Env "SUPABASE_ACCESS_TOKEN"
$env:SUPABASE_ACCESS_TOKEN = $token
$dbPassword = Require-Env "SUPABASE_DB_PASSWORD"
$projectRef = Get-Env "SUPABASE_PROJECT_REF"

if (-not $projectRef -and (Get-Env "SUPABASE_CREATE") -eq "1") {
  $orgId = Get-Env "SUPABASE_ORG_ID"
  if (-not $orgId) {
    Write-Host "Fetching organizations ..."
    $orgsJson = npx supabase orgs list -o json 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Failed to list orgs: $orgsJson" }
    $orgs = $orgsJson | ConvertFrom-Json
    if ($orgs.Count -eq 0) { throw "No Supabase organizations found on this account" }
    $orgId = $orgs[0].id
    Write-Host "Using org: $($orgs[0].name) ($orgId)"
  }

  $region = Get-Env "SUPABASE_REGION" "eu-central-1"
  $projectName = Get-Env "SUPABASE_PROJECT_NAME" "BabiTk"
  Write-Host "Creating project '$projectName' in $region (this may take 1-2 min) ..."
  $createJson = npx supabase projects create $projectName --org-id $orgId --db-password $dbPassword --region $region -o json 2>&1
  if ($LASTEXITCODE -ne 0) { throw "supabase projects create failed: $createJson" }
  $created = $createJson | ConvertFrom-Json
  $projectRef = $created.id
  if (-not $projectRef) { throw "Could not read project id from create output" }
  Write-Host "Created project ref: $projectRef"
  Start-Sleep -Seconds 15
}

if (-not $projectRef) {
  throw "Missing SUPABASE_PROJECT_REF. Set it, or set SUPABASE_CREATE=1 to create a new project."
}

Write-Host "Linking project $projectRef ..."
Push-Location $root
try {
  npx supabase link --project-ref $projectRef --password $dbPassword
  if ($LASTEXITCODE -ne 0) { throw "supabase link failed" }

  Write-Host "Pushing migrations ..."
  npx supabase db push
  if ($LASTEXITCODE -ne 0) { throw "supabase db push failed" }

  Write-Host "Fetching API keys ..."
  $keysJson = npx supabase projects api-keys --project-ref $projectRef -o json 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Failed to fetch API keys: $keysJson" }
  $keys = $keysJson | ConvertFrom-Json
  $anon = ($keys | Where-Object { $_.name -eq "anon" }).api_key
  $service = ($keys | Where-Object { $_.name -eq "service_role" }).api_key
  if (-not $anon -or -not $service) { throw "Could not parse anon/service_role keys" }

  $supabaseUrl = "https://$projectRef.supabase.co"

  function Update-EnvFile($path, $updates) {
    if (-not (Test-Path $path)) {
      Copy-Item ($path + ".example") $path -ErrorAction SilentlyContinue
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

  Update-EnvFile "$root\backend\.env" @{
    "SUPABASE_URL" = $supabaseUrl
    "SUPABASE_ANON_KEY" = $anon
    "SUPABASE_SERVICE_ROLE_KEY" = $service
  }

  Update-EnvFile "$root\web\.env" @{
    "VITE_DEMO_MODE" = "false"
    "VITE_SUPABASE_URL" = $supabaseUrl
    "VITE_SUPABASE_ANON_KEY" = $anon
  }

  $mobileEnv = "$root\mobile\.env"
  if (-not (Test-Path $mobileEnv)) { Copy-Item "$root\mobile\.env.example" $mobileEnv }
  Update-EnvFile $mobileEnv @{
    "EXPO_PUBLIC_DEMO_MODE" = "false"
    "EXPO_PUBLIC_SUPABASE_URL" = $supabaseUrl
    "EXPO_PUBLIC_SUPABASE_ANON_KEY" = $anon
    "EXPO_PUBLIC_API_URL" = "http://localhost:3001"
  }

  Write-Host ""
  Write-Host "Done! Supabase linked, migrations applied, .env files updated."
  Write-Host "Run: node scripts/verify-stack.mjs"

  if ($env:GOOGLE_CLIENT_ID -and $env:GOOGLE_CLIENT_SECRET) {
    Write-Host ""
    Write-Host "Configuring Google login ..."
    & "$root\scripts\setup-google-auth.ps1"
  } else {
    Write-Host ""
    Write-Host "Next: configure Google login with .\scripts\configure-auth.ps1"
  }
}
finally {
  Pop-Location
}
