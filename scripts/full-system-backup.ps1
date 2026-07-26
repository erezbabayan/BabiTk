# BabiTk full system backup — code snapshot + optional DB backup via backend.
param(
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$dest = if ($OutputRoot) {
  Join-Path $OutputRoot "BabiTk-backup-$stamp"
} else {
  Join-Path $repoRoot "backups\BabiTk-backup-$stamp"
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "BabiTk backup -> $dest"

# 1) Git bundle (full history)
if (Get-Command git -ErrorAction SilentlyContinue) {
  Push-Location $repoRoot
  try {
    git bundle create (Join-Path $dest "BabiTk.gitbundle") --all
    git rev-parse HEAD | Out-File (Join-Path $dest "git-head.txt") -Encoding utf8
    git status --short | Out-File (Join-Path $dest "git-status.txt") -Encoding utf8
    Write-Host "  git bundle OK"
  } finally {
    Pop-Location
  }
}

# 2) Source archive via staging copy (excludes nested heavy dirs)
$staging = Join-Path $dest "_staging"
$archivePath = Join-Path $dest "BabiTk-source.zip"
$excludeDirs = @(
  "node_modules",
  "dist",
  ".git",
  "backups",
  ".expo",
  ".expo-check-bundle",
  "coverage",
  ".turbo",
  ".next",
  "convex-export-tmp"
)
$excludeFiles = @(
  "*.zip",
  "*.gitbundle",
  "*.log",
  "*.hbc"
)

function ShouldSkip([string]$fullPath, [string]$name) {
  foreach ($d in $excludeDirs) {
    if ($name -ieq $d) { return $true }
    if ($fullPath -match "[\\/]$([regex]::Escape($d))([\\/]|$)") { return $true }
  }
  foreach ($pat in $excludeFiles) {
    if ($name -like $pat) { return $true }
  }
  return $false
}

Write-Host "  staging source files..."
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$roboExcludeDirs = ($excludeDirs | ForEach-Object { "/XD"; $_ })
$roboExcludeFiles = ($excludeFiles | ForEach-Object { "/XF"; $_ })
& robocopy $repoRoot $staging /E /NFL /NDL /NJH /NJS /NC /NS /NP `
  /XD @($excludeDirs) `
  /XF @($excludeFiles) | Out-Null
$roboCode = $LASTEXITCODE
if ($roboCode -ge 8) {
  throw "robocopy failed with exit code $roboCode"
}

Write-Host "  compressing source zip..."
if (Test-Path $archivePath) { Remove-Item $archivePath -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $archivePath -CompressionLevel Optimal -Force
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
$zipMb = [math]::Round((Get-Item $archivePath).Length / 1MB, 1)
Write-Host "  source zip OK ($zipMb MB)"

# 3) Env manifest (names only — no secrets)
$envManifest = Join-Path $dest "env-keys.txt"
@(
  ".env",
  ".env.local",
  "web/.env",
  "mobile/.env",
  "backend/.env"
) | ForEach-Object {
  $path = Join-Path $repoRoot $_
  if (Test-Path $path) {
    Get-Content $path | ForEach-Object {
      if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $matches[1] }
    }
  }
} | Sort-Object -Unique | Out-File $envManifest -Encoding utf8
Write-Host "  env key manifest OK"

# 4) Backend DB/storage backup when configured
$backendEnv = Join-Path $repoRoot "backend\.env"
$backendLog = Join-Path $dest "backend-backup.log"
if (Test-Path $backendEnv) {
  Push-Location (Join-Path $repoRoot "backend")
  try {
    # Native npm warnings on stderr must not abort the backup under Stop.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    npm run backup *> $backendLog
    $backendExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    if ($backendExit -ne 0) {
      Write-Host "  backend backup failed (exit $backendExit - see log)"
    } else {
      Write-Host "  backend backup OK"
    }
  } catch {
    "Backend backup skipped: $_" | Out-File $backendLog -Encoding utf8
    Write-Host "  backend backup skipped (see log)"
  } finally {
    Pop-Location
  }
} else {
  "No backend/.env - skipped DB backup" | Out-File $backendLog -Encoding utf8
  Write-Host "  backend backup skipped (no backend/.env)"
}

# 5) Convex cloud data export (when CLI is logged in)
$convexDir = Join-Path $dest "convex-export"
New-Item -ItemType Directory -Force -Path $convexDir | Out-Null
$convexLog = Join-Path $dest "convex-export.log"
Push-Location $repoRoot
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  npx convex export --path $convexDir *> $convexLog
  $convexExit = $LASTEXITCODE
  $ErrorActionPreference = $prevEap
  if ($convexExit -ne 0) {
    Write-Host "  convex export failed (see log)"
  } else {
    Write-Host "  convex export OK"
  }
} catch {
  "Convex export skipped: $_" | Out-File $convexLog -Encoding utf8
  Write-Host "  convex export skipped (see log)"
} finally {
  Pop-Location
}

# 6) Manifest
$manifest = @(
  "stamp=$stamp"
  "repo=$repoRoot"
  "dest=$dest"
  "gitHead=$((Get-Content (Join-Path $dest 'git-head.txt') -ErrorAction SilentlyContinue))"
  "sourceZipMb=$zipMb"
)
$manifest | Out-File (Join-Path $dest "MANIFEST.txt") -Encoding utf8

Write-Host "Backup complete: $dest"
Get-ChildItem $dest | Format-Table Name, @{N = "MB"; E = { if ($_.PSIsContainer) { "DIR" } else { [math]::Round($_.Length / 1MB, 2) } } } -AutoSize
