@echo off
cd /d "%~dp0.."
title ATLAS - INICIAR LABORATORIO DONATELLO
where node >nul 2>&1
if errorlevel 1 (
  echo Falta Node.js 22. No se ejecutaron cambios.
  pause
  exit /b 1
)
node "laboratorio\lab.mjs" start
echo.
pause
