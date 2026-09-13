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
echo Starting CIFI Optimizer for devices on this local network...
echo Use one of the IPv4 addresses below from another device on the same Wi-Fi/LAN:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { '  http://{0}:5173/cifi-ultimate-optimizer/' -f $_.IPAddress }"
echo.
echo If Windows asks about a firewall rule, allow it only on Private networks.
echo This does not open the server to the public Internet or configure your router.
echo Press Ctrl+C to stop the server.
echo.

call "node_modules\.bin\vite.cmd" --config vite.pages.config.ts --host 0.0.0.0 --port 5173 --strictPort
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Server stopped with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
