# Cricket 07 Browser — Dev Plan (performance, settings panel, LAN multiplayer)

This is the implementation plan for our fork of Dhaiwat's `cricket07-browser` (a static recompilation
of EA Cricket 07 that runs in the browser on WebGPU). It covers three goals we agreed on:

1. Reduce heat on a **fanless MacBook Air M3** while staying smooth and keeping the game's natural
   visual quality.
2. Expose the performance knobs as an **in-browser settings panel** (presets + advanced), per-user.
3. Run **multiplayer over the local network (LAN)** so people on the same WiFi join with least latency.

> Scope note: this doc is the plan. The code edits below are to be applied as a follow-up step.

---

## 1. Goal & constraints

- Target: smooth **60 fps**, visuals at the game's natural ceiling (it's a 2006 DirectX 8 title), and
  minimal heat on a fanless Air M3 (it throttles instead of using a fan, so the real goal is
  *warm-but-not-throttling*).
- **Honest floor:** the game runs as recompiled x86 → C → WebAssembly, and its vertex shaders run on
  the CPU (`host/vshader.c`). That keeps one core busy no matter the graphics settings. Our edits
  remove the *surcharge* (fullscreen Retina pixels, 120 Hz, high-power GPU, busy polling) — they do
  **not** remove that baseline. Expect much cooler, not cold.
- The WebGPU renderer reproduces the original DX8 look; it does not make the game look *better* than
  2006. "Best graphics this game can give" ≈ the original's visuals at a sensible resolution.

---

## 2. Performance edits (the knobs)

All four live in `web/loader.js`. Each becomes a value read from a prefs object (see §3) rather than a
hardcode.

| # | What | Where (approx.) | Current | Change | Apply |
|---|------|-----------------|---------|--------|-------|
| 1 | **Internal resolution cap** | `sizeCanvas()` ~L240–244 | renders at window size × `dpr` (capped 2) | add a `MAXH` height cap; keep aspect ratio; CSS still upscales to fill | **Live** (reuse `_rc_set_canvas_size`, as the ResizeObserver at ~L304 does) |
| 2 | **60 fps cap in solo** | frame loop ~L316 (`if (!session \|\| t >= due - 4)`) | solo follows the display (e.g. 120 Hz) | make solo also respect the 60 Hz `due` gate | **Live** |
| 3 | **GPU power preference** | adapter request ~L336 (`powerPreference:'high-performance'`) | always high-performance | allow `'low-power'` | **Reload** (WebGPU adapter chosen once at boot) |
| 4 | **Pump interval** | `setInterval(..., 1)` ~L323 | 1 ms busy pump | allow a larger interval (e.g. 8 ms) | **Live** (clear + reset the interval) |

**#1 is the biggest heat lever**, especially at fullscreen on a Retina panel (uncapped it renders
~6M pixels/frame through one large WGSL fragment shader). For this game's low-res 2006 art, capping at
1080p costs almost no real sharpness.

### Example of #1 (`sizeCanvas`)

```js
function sizeCanvas() {
  const canvas = $('canvas');
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const MAXH = prefs.maxH;                 // 0 / Infinity = uncapped ("Sharp")
  let w = Math.max(640, Math.round(r.width * dpr));
  let h = Math.max(480, Math.round(r.height * dpr));
  if (MAXH && h > MAXH) { w = Math.round(w * MAXH / h); h = MAXH; }
  canvas.width = w; canvas.height = h;
}
```

---

## 3. In-browser settings panel

**UI.** A gear button next to the existing fullscreen button (`web/index.html` ~L177) opens a small
panel, styled to match the existing overlays/keyboard hint.

**Presets** (one click):

| Preset | MAXH | 60 fps cap | GPU power | Pump (ms) |
|--------|------|-----------|-----------|-----------|
| **Cool** | 720 | on | low-power | 8 |
| **Balanced** (default) | 1080 | on | low-power | 8 |
| **Sharp** | uncapped (native/Retina) | on | high-performance | 1 |

Plus an **Advanced** expander exposing each value raw (resolution slider, fps-cap toggle, GPU-power
dropdown, pump slider).

**Persistence.** A `prefs` object in `localStorage` under key `rc_prefs`, read at boot. URL params
still override (consistent with existing `?mute` / `?fps` / `?delay`), so a config can be shared via
link. Each LAN player keeps their own settings on their own machine.

**Apply model.**
- Resolution (#1), fps cap (#2), pump (#4): apply **live** on change.
- GPU power (#3): save + show a small "reload to apply" note.

**Single source of truth.** `sizeCanvas()`, the frame loop, the pump `setInterval`, and the boot
adapter request all read from `prefs` instead of hardcoded values. This panel *replaces* the four
one-off edits in §2.

---

## 4. LAN multiplayer (least latency, TLS-free path)

Reuses what's already in the repo:
- Lockstep netcode — `host/netplay.c`, `host/sched.c` (both run the same sim; only inputs travel; a
  memory hash every few frames catches desync).
- Room server — `server/` (Cloudflare Worker + one Durable Object per room), runnable locally with
  `wrangler dev` (Miniflare emulates the Durable Object).
- Dual transport — `web/netplay.js` (WebSocket relay **plus** a direct WebRTC data channel).

### Why a TLS-free LAN setup works

The game needs a **secure context** (for the SharedArrayBuffer threads) and COOP/COEP headers.
`http://localhost` is already a secure context, and an `http://localhost` page is allowed to open a
`ws://<lan-ip>` socket (no mixed-content block, because the page itself is not HTTPS). So **each player
serves the game on their own localhost**, and only the **room server** is shared across the LAN. No
certificates required.

### Recommended setup

1. **Host builds once** (export → `build.sh` → `build_web.sh`) and shares the built repo (`web/` +
   `build_web/www/`) with each player. Each player still loads their **own** game files.
2. **Each player** runs `python3 web/serve.py` → `http://localhost:8007`, and loads their own
   `cricket07` folder into OPFS (once).
3. **Host** runs a room server reachable on the LAN. Instead of Cloudflare's `wrangler dev`, we use a
   tiny standalone Node server (no Cloudflare, no secret, no internet) that speaks the same protocol and
   returns **empty ICE servers** so WebRTC uses direct local-network candidates:
   `node .cache/cricket07-build/lanserver/server.js` (binds `0.0.0.0:8787`, prints the share URL).
4. Everyone opens `http://localhost:8007/?netplay=http://<HOST_LAN_IP>:8787` (HTTP — the page fetches a
   ticket then upgrades the socket to `ws://` itself; `ws://` as the param would break the ticket fetch)
   and creates/joins a room code.
5. **Least latency:** on the same subnet WebRTC gathers host ICE candidates directly, so inputs go
   peer-to-peer with no STUN/TURN needed. Set input delay to **1–2 frames** (or "Auto", which picks the
   lowest the link allows).

`web/serve.py` binds `127.0.0.1` today; this path does **not** need that changed, because each player
uses their own localhost.

### Secondary option (documented, not first choice): one HTTPS host

If you want a single machine to serve the page to other devices (instead of each running localhost),
those devices hit a non-localhost origin, which is **not** a secure context over plain HTTP — so you'd
need:
- the page served over **HTTPS** with a locally trusted cert (e.g. `mkcert`), and
- the room server over **`wss://`** (an HTTPS page cannot open an insecure `ws://`).

A reverse proxy like Caddy can terminate TLS for both. This is the fiddly path; the each-plays-on-
localhost setup above avoids it entirely.

---

## 5. Expectations (honest)

- **Smooth 60 fps:** yes.
- **Best graphics this game can give:** yes at **1080p** — the 2006 art barely benefits above that, so
  the resolution cap costs almost nothing visually.
- **No heat on a fanless Air M3:** *much* cooler with these settings, but **warm, not cold** — the
  recompilation + CPU-vertex-shader baseline remains. The dial if it still runs warm: lower `MAXH`
  (1080 → 900 → 720) and/or enable macOS Low Power Mode.
- **Not yet measured.** Verify FPS with `?fps` after building; tune `MAXH` to comfort.

---

## 6. Optional appendix — native Mac app

`build.sh` also produces a native launcher `build/recomp`, which skips the WebAssembly layer and runs
cooler/faster than the browser build. It additionally needs `wgpu-native` in `third_party/wgpu`, SDL2,
and (like the browser build) JDK 21 + Ghidra 12 for the function list. Run with
`build/recomp /path/to/cricket07`. Deprioritized since we chose the browser route, but it's the
coolest-running option if the browser build still runs warmer than you like.

---

## Files to modify (implementation step)

- `web/loader.js` — prefs object + `localStorage` load/save; `sizeCanvas()` (`MAXH`), frame loop
  (fps cap), pump `setInterval`, boot adapter `powerPreference` all read from `prefs`; wire the panel.
- `web/index.html` — gear button + settings panel markup/styles.
- `web/serve.py` — unchanged for the recommended LAN path (optional `--host`/TLS flags only for the
  HTTPS option).
- `server/` — unchanged; run via `wrangler dev` for LAN.

## Verification

- `?fps` in the URL to read actual frame rate; confirm a steady 60 and watch for throttling over a long
  session.
- Toggle presets and confirm resolution/fps/pump change live and GPU-power prompts a reload.
- Two machines on the same WiFi: host runs the standalone LAN server (`node
  .cache/cricket07-build/lanserver/server.js`), both open with `?netplay=http://<ip>:8787`, join a room,
  confirm the netplay status shows a **direct** connection (console: `host -> host`), not relay.
