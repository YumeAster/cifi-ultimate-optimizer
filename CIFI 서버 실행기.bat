@echo off
setlocal EnableExtensions DisableDelayedExpansion

cd /d "%~dp0"

set "PORT=5173"
set "LOCAL_URL=http://localhost:%PORT%/cifi-ultimate-optimizer/"

if not exist "node_modules\.bin\vite.cmd" (
  echo.
  echo [ERROR] Project Vite was not found.
  echo Run npm install in this folder once, then start this launcher again.
  echo.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 goto :already_running

if /I "%~1"=="--check" goto :ready_to_start
goto :start_server

:already_running
if /I "%~1"=="--check" exit /b 2
echo.
echo [INFO] Port %PORT% is already in use.
echo The existing process is left untouched. Opening the expected local URL instead:
echo %LOCAL_URL%
start "" "%LOCAL_URL%"
echo.
pause
exit /b 0

:ready_to_start
echo READY: %LOCAL_URL%
exit /b 0

:start_server
echo.
echo Starting CIFI Optimizer local server in a new window...
echo URL: %LOCAL_URL%
echo.

start "CIFI Optimizer Server" /D "%CD%" cmd /d /k call "node_modules\.bin\vite.cmd" --config "vite.pages.config.ts" --host 127.0.0.1 --port %PORT% --strictPort

for /L %%I in (1,1,20) do (
  netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
  if not errorlevel 1 goto :server_ready
  timeout /t 1 /nobreak >nul
)

echo.
echo [ERROR] Port %PORT% did not open within 20 seconds.
echo Check the new CIFI Optimizer Server window for the error details.
pause
exit /b 1

:server_ready
echo.
echo Server is ready. Opening the default browser...
start "" "%LOCAL_URL%"
echo.
echo To stop the server, press Ctrl+C in the CIFI Optimizer Server window.
pause
exit /b 0
