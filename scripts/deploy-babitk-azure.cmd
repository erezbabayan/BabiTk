@echo off
REM Prefer the PowerShell pipeline (build + Unix-path zip + Always On + deploy).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-babitk-azure.ps1"
if errorlevel 1 exit /b 1
