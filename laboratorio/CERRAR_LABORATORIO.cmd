@echo off
cd /d "%~dp0.."
title ATLAS - CERRAR LABORATORIO DONATELLO
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js no encontrado; comprueba que no haya un laboratorio activo.
  pause
  exit /b 1
)
if /I "%ATLAS_LAB_CI_SELF_CHECK%"=="1" (
  node "laboratorio\lab.mjs" selfcheck
  exit /b %errorlevel%
)
node "laboratorio\lab.mjs" stop
echo.
pause
