# Cricket 07 Browser — How to load & play

This covers **which files to load and how to load them** to play the game. (For the plan behind the
performance/settings/multiplayer work, see `cricket07_dev.md`.)

The repo ships **no game files** — you bring your own copy of EA Cricket 07.

---

## What you need

- **Your game folder**: `cricket07/` containing `Cricket07.exe` and the `Data/` folder.
  On this machine it's at:
  `/Users/tusharmac/imp/Projects/Personal/open-source/cricket07`
- A current **Chrome, Edge, or Safari** (WebGPU is required).

### Build prerequisites (one-time, on the machine that builds)

- macOS on Apple Silicon.
- Python 3 with `capstone` and `pefile` — `pip3 install capstone pefile`.
- **JDK 21** and **Ghidra 12** (used to list the functions in your exe).
- **Emscripten** (`emcc`) for the browser build.
- (SDL2 and `wgpu-native` are only needed for the optional native Mac app, not the browser build.)

---

## Build (one-time)

```sh
cd /Users/tusharmac/imp/Projects/Personal/open-source/cricket07-browser
GAME=/Users/tusharmac/imp/Projects/Personal/open-source/cricket07

# 1. Make the function list from YOUR exe (a few minutes of Ghidra analysis)
GHIDRA=~/ghidra_12.1.4_PUBLIC ghidra/export.sh "$GAME/Cricket07.exe" work/functions.json

# 2. A profile naming the exe
cp host/profile.h work/profile.h
#    edit work/profile.h:
#      PROFILE_EXE        "Cricket07.exe"
#      PROFILE_GUEST_EXE  "Cricket07.exe"
#      PROFILE_TITLE      "Cricket 07"

# 3. Translate the exe to C and build (produces out_all/ and the native app)
PROFILE=work/profile.h ./build.sh "$GAME/Cricket07.exe" work/functions.json

# 4. Build the browser version (produces build_web/www/recomp.js)
PROFILE=work/profile.h ./build_web.sh
```

> Step 3 is the heavy one — it compiles tens of thousands of translated functions and will run your
> CPU hot for a while. It's a one-time cost.

---

## Play (every time) — the easy way

**Double-click `play_mac.command`** (macOS) or **`play_windows.bat`** (Windows) in the repo folder. It starts the game
server (and, if Node is present, the LAN room server so you can host), then opens your browser. Keep that
window open while you play; close it to stop. First run on macOS: if Gatekeeper blocks it, right-click →
**Open** once.

That's it — skip to step 2 below. (Manual way, if you prefer: `python3 web/serve.py` then open the URL.)

```sh
cd /Users/tusharmac/imp/Projects/Personal/open-source/cricket07-browser
python3 web/serve.py          # prints: http://localhost:8007/
```

1. Open **http://localhost:8007/** in Chrome / Edge / Safari.
2. When asked, **pick your `cricket07` game folder** (the one with `Cricket07.exe` + `Data/`).
   The browser copies it into private storage (OPFS) **once** — after that, launches start instantly.
3. Play.

**Controls:** a game controller, or the keyboard — arrow keys move, **S** selects, mouse moves the
cursor. **Alt + Enter** (⌥ + Enter) toggles fullscreen. Add `?mute` to the URL to silence audio.

---

## Multiplayer on the same WiFi (LAN)

Lowest latency, fully local — no Cloudflare, no internet, no certificates. Each player serves the game on
their **own** machine (so the page is a secure `localhost` origin); only a tiny **room server** is shared
across the LAN, and the game inputs go **peer-to-peer** directly between the two machines (the room server
is just the meeting point). Inputs never leave the WiFi.

1. **Every player** runs their own game and loads their own copy of the files:
   ```sh
   python3 web/serve.py        # http://localhost:8007/ — load your own game folder
   ```
   Both players must run the **same build** (same `build_web/www/`) and the same game files, or the lobby
   refuses to start. Simplest: the host copies the whole built repo to the other player.

2. **One player (the host)** runs the standalone LAN room server (plain Node, no Cloudflare):
   ```sh
   node /Users/tusharmac/imp/Projects/Personal/rea/.cache/cricket07-build/lanserver/server.js
   ```
   It prints the exact URL to share, including the host's LAN IP. Find it manually with
   `ipconfig getifaddr en0` (e.g. `192.168.1.16`). Override the port with `PORT=9000 node server.js`.

3. **Everyone** opens (note: `http://`, not `ws://` — the page fetches a ticket over HTTP, then upgrades
   the socket itself):
   ```
   http://localhost:8007/?netplay=http://<HOST_LAN_IP>:8787
   ```
   Then one player clicks **Play Multiplayer → Create room** (gets a code), the other enters the code and
   **Join**. The host clicks **Start match**. The **server location dropdown is ignored** on the LAN server.

4. For lowest latency, leave input delay on **Auto** (on a LAN it picks the 2-frame floor). The netplay
   status line should say **direct** — inputs are going peer-to-peer, not through the room.

> **Test it on one Mac first:** open the URL in **two browser tabs** — tab 1 creates a room, tab 2 joins
> with the code (the build keeps separate saves per player slot, so two tabs can play each other).
>
> The LAN server lives in the disposable `.cache/cricket07-build/lanserver/` (with its one dependency,
> `ws`). Copy that folder into the repo if you want it version-controlled. Players in **different
> locations** (not the same WiFi) need the cloud room server instead (deploy `server/` to Cloudflare and
> use its `https://…` URL in `?netplay=`).

---

## Settings (performance / heat)

Hover the bottom-right of the stage and click the **gear icon** (next to fullscreen) to choose a preset:

- **Cool** — lowest heat (720p). Best for long sessions on a fanless Air.
- **Balanced** — recommended (1080p); looks as crisp as this game gets, runs much cooler than default.
- **Sharp** — native/Retina resolution; warmest.

Or open **Advanced** to tune resolution, frame cap, GPU power, and the pump interval individually.
Settings are remembered in your browser. Changing **GPU power** needs a page reload; the rest apply
immediately.

Tip: add `?fps` to the URL to see the frame rate in the browser console.
