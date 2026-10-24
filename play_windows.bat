@echo off
REM Cricket 07 - double-click launcher (Windows).
REM Starts the game's local web server and opens your browser. If Node is installed it also starts the
REM LAN room server, so this PC can HOST a same-WiFi match. Close this window to stop everything.
REM
REM   To JOIN a friend's game: double-click this, pick your game folder once, then paste the invite link
REM     your friend sends you into the browser.
REM   To HOST: double-click this, then Play Multiplayer -> Create room -> Copy invite link -> send it.

cd /d "%~dp0"

where python >nul 2>nul && (set "PY=python") || (where py >nul 2>nul && (set "PY=py") || (
  echo Cricket 07 needs Python 3. Install it from python.org ^(tick "Add to PATH"^), then run Play again.
  pause
  exit /b 1
))

set "NETPLAY="
where node >nul 2>nul && (
  REM find this PC's LAN IPv4
  for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    if not defined IP set "IP=%%a"
  )
  set "IP=%IP: =%"
  start "Cricket07 room" /min cmd /c node lanserver\server.js
  set "NETPLAY=?netplay=http://%IP%:8787"
)

start "Cricket07 web" /min cmd /c %PY% web\serve.py
timeout /t 2 >nul
start "" "http://localhost:8007/%NETPLAY%"

echo ============================================================
echo   Cricket 07 is running. Keep this window open while you play.
if defined NETPLAY (
  echo   You can HOST on this Wi-Fi. Friends on the same Wi-Fi join with:
  echo       http://localhost:8007/?netplay=http://%IP%:8787
  echo   ^(or just send them the "Copy invite link" from the lobby^).
) else (
  echo   ^(No Node found, so this PC can only JOIN, not host.^)
)
echo   Close this window to stop.
echo ============================================================
pause
