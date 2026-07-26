@echo off
cd /d "%~dp0.."
echo === Restoring Babitk Convex after Pro upgrade ===
call npx convex run health:ping
if errorlevel 1 (
  echo Convex still down - upgrade Pro first: https://dashboard.convex.dev/t/erezbabayan/settings/billing
  exit /b 1
)
echo Pushing functions...
call npx convex dev --once
echo Importing snapshot...
call npx convex import --replace backups\convex-export-attempt.zip
echo DONE - open http://127.0.0.1:8080/
pause
