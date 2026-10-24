#!/bin/bash
# Cricket 07 — double-click launcher (macOS).
# Starts the game's local web server and opens your browser. If Node is available it also starts the LAN
# room server, so this machine can HOST a same-WiFi match. Closing this window stops everything.
#
#   To JOIN a friend's game: double-click this, pick your game folder once, then paste the invite link
#     your friend sends you into the browser.
#   To HOST: double-click this, then Play Multiplayer -> Create room -> Copy invite link -> send it.

cd "$(dirname "$0")" || exit 1

PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  MSG="Cricket 07 needs Python 3. Install it from python.org (or 'xcode-select --install'), then double-click Play again."
  osascript -e "display dialog \"$MSG\" buttons {\"OK\"} with title \"Cricket 07\"" >/dev/null 2>&1 || echo "$MSG"
  exit 1
fi

# Node is optional: only needed to HOST (run the room server). Check PATH, Homebrew, and a sibling ./node.
NODE="$(command -v node || true)"
for c in /opt/homebrew/bin/node /usr/local/bin/node "./lanserver/node"; do
  [ -z "$NODE" ] && [ -x "$c" ] && NODE="$c"
done

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)"
PIDS=""
NETPLAY=""
if [ -n "$NODE" ] && [ -f lanserver/server.js ]; then
  "$NODE" lanserver/server.js >/tmp/cricket07-room.log 2>&1 &
  PIDS="$PIDS $!"
  NETPLAY="?netplay=http://$IP:8787"
fi

"$PY" web/serve.py >/tmp/cricket07-web.log 2>&1 &
PIDS="$PIDS $!"
trap 'kill $PIDS 2>/dev/null' EXIT INT TERM
sleep 1

open "http://localhost:8007/$NETPLAY"
echo "============================================================"
echo "  Cricket 07 is running. Keep this window open while you play."
if [ -n "$NETPLAY" ]; then
  echo "  You can HOST on this Wi-Fi. Friends on the same Wi-Fi join with:"
  echo "      http://localhost:8007/?netplay=http://$IP:8787"
  echo "  (or just send them the 'Copy invite link' from the lobby)."
else
  echo "  (No Node found, so this machine can only JOIN, not host.)"
  echo "  To join: pick your game folder, then paste your friend's invite link."
fi
echo "  Close this window to stop."
echo "============================================================"
wait
