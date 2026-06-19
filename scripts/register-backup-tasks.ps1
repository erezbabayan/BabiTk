param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$BackendPath = Join-Path $ProjectRoot "backend"
$TaskNamePrefix = "MindTasker-FullBackup"
$Times = @("10:00", "20:00")

function Register-MindTaskerBackupTask {
  param(
    [string]$Name,
    [string]$Time
  )

  $action = New-ScheduledTaskAction `
    -Execute "npm" `
    -Argument "run backup" `
    -WorkingDirectory $BackendPath

  $trigger = New-ScheduledTaskTrigger -Daily -At $Time

  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

  Register-ScheduledTask `
    -TaskName $Name `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "MindTasker full system backup (database + storage) at $Time" `
    -Force | Out-Null

  Write-Host "Registered scheduled task: $Name at $Time daily"
}

foreach ($time in $Times) {
  $suffix = $time.Replace(":", "")
  Register-MindTaskerBackupTask -Name "$TaskNamePrefix-$suffix" -Time $time
}

Write-Host ""
Write-Host "Backup tasks registered. Ensure backend/.env has DATABASE_URL and Supabase credentials."
Write-Host "Manual run: cd backend; npm run backup"
