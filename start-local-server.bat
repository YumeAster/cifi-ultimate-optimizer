@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if not exist "node_modules\.bin\vite.cmd" (
  echo.
  echo [ERROR] Vite is not installed in this project.
  echo Run "npm install" once in this folder, then try again.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting CIFI Optimizer for this PC only...
echo Open: http://127.0.0.1:5173/cifi-ultimate-optimizer/
echo Press Ctrl+C to stop the server.
echo.

call "node_modules\.bin\vite.cmd" --config vite.pages.config.ts --host 127.0.0.1 --port 5173 --strictPort
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Server stopped with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
