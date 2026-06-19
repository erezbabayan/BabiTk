# Install project Git hooks (run once per clone).
$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Git\bin;" + $env:Path
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

git config core.hooksPath .githooks
Write-Host "Git hooks installed (core.hooksPath=.githooks)"
Write-Host "Pre-commit: blocks .env secrets + reminds to push to GitHub."
