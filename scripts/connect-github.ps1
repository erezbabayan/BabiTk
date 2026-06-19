# Connect MindTasker to your private GitHub account.
# Prerequisite: run `gh auth login` and complete browser sign-in.

$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Git\bin;C:\Program Files\GitHub CLI;" + $env:Path
Set-Location (Split-Path $PSScriptRoot -Parent)

gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Run: gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key"
  exit 1
}

$user = gh api user --jq '.login'
$email = gh api user/emails --jq '[.[] | select(.primary==true)][0].email' 2>$null
if (-not $email) { $email = "$user@users.noreply.github.com" }

git config user.name $user
git config user.email $email

if (-not (Test-Path .git)) { git init; git branch -M main }
if (-not (git rev-parse HEAD 2>$null)) {
  git add .
  git commit -m "Initial commit: MindTasker monorepo with CI workflow"
}

$existing = gh repo view "$user/MindTasker" 2>$null
if ($LASTEXITCODE -ne 0) {
  gh repo create MindTasker --private --source=. --remote=origin --push
} else {
  if (-not (git remote get-url origin 2>$null)) {
    git remote add origin "https://github.com/$user/MindTasker.git"
  }
  git push -u origin main
}

Write-Host ""
Write-Host "Done: https://github.com/$user/MindTasker (private)"
gh repo view --web 2>$null
