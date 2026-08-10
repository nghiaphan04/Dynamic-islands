@echo off
cd /d "%~dp0"
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run dist > dist-build.log 2>&1
echo exit code: %errorlevel% >> dist-build.log
