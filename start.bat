@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%scripts\tandara-dev.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo.
  echo Tandara launcher exited with code %RESULT%.
  pause
)
exit /b %RESULT%