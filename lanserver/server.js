// Standalone LAN room server for the Cricket 07 browser port.
//
// A drop-in replacement for the Cloudflare Worker in server/worker.js, for playing on the SAME WiFi/LAN:
// no Cloudflare, no wrangler, no secret, no internet. It speaks the exact protocol web/netplay.js expects
//   GET  /_netplay_ticket   -> { ticket, iceServers }   (iceServers EMPTY: WebRTC uses direct LAN candidates)
//   WS   /netplay/<CODE>     -> the room (lobby, WebRTC signaling, lockstep input relay)
//
// On one subnet the two games connect peer-to-peer over the direct WebRTC data channel (local IP -> local
// IP), so inputs never leave the LAN and ping is as low as the network allows. This server is only the
// meeting point: tickets, the lobby, WebRTC signaling, and an input relay used until the direct channel is up.
//
// Run on the HOST machine (reachable by the others):
//   node server.js                 # binds 0.0.0.0:8787 (override: PORT=9000 HOST=0.0.0.0 node server.js)
// Then every player serves the game on their own machine (python3 web/serve.py) and opens
//   http://localhost:8007/?netplay=http://<HOST-LAN-IP>:8787
// The host's LAN IP: `ipconfig getifaddr en0` (Wi-Fi) on macOS.

'use strict';
const http = require('http');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = 4;
const REJOIN_GRACE_MS = 15000;

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', Vary: 'Origin' };
const rooms = new Map();   // CODE -> { code, sockets:Set, started:null|{players,delay}, away:{slot:attach}, timers:{} }

// ------------------------------------------------------------------ HTTP: ticket endpoint
const httpServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...CORS, 'Access-Control-Allow-Methods': 'GET' }); res.end(); return; }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/_netplay_ticket' && req.method === 'GET') {
    // LAN: no HMAC needed, and NO ICE servers -> the browser gathers host (local-network) candidates and
    // connects directly on the subnet. An empty list keeps it purely local with no STUN/TURN round trips.
    const body = JSON.stringify({ ticket: `local.${Math.floor(Date.now() / 1000) + 3600}`, iceServers: [] });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS });
    res.end(body);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS });
  res.end(`Cricket 07 LAN room server. Open the game with ?netplay=http://${url.host}`);
});

// ------------------------------------------------------------------ WebSocket: the rooms
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const m = /^\/netplay\/([A-Za-z0-9]{4,12})$/.exec(url.pathname);
  if (!m) { socket.destroy(); return; }       // ticket intentionally not validated on a trusted LAN
  const code = m[1].toUpperCase();
  wss.handleUpgrade(req, socket, head, (ws) => join(roomFor(code), ws));
});

function roomFor(code) {
  let r = rooms.get(code);
  if (!r) { r = { code, sockets: new Set(), started: null, away: {}, timers: {} }; rooms.set(code, r); }
  return r;
}
const send = (ws, msg) => { try { ws.send(JSON.stringify(msg)); } catch { /* closed */ } };
const peers = (r) => [...r.sockets].filter((ws) => ws._p.slot >= 0);

function lobby(r) {
  const players = peers(r)
    .map((ws) => ({ slot: ws._p.slot, name: ws._p.name, version: ws._p.version, rtt: ws._p.rtt, p2p: ws._p.p2p || {}, via: '' }))
    .sort((a, b) => a.slot - b.slot);
  for (const ws of peers(r)) send(ws, { t: 'lobby', you: ws._p.slot, host: ws._p.slot === 0, players, started: r.started, colo: 'LAN' });
}

function join(r, ws) {
  ws._p = { slot: -1, name: '', version: '', rtt: 0, p2p: {} };
  r.sockets.add(ws);
  ws.on('message', (data) => { let msg; try { msg = JSON.parse(data); } catch { return; } onMessage(r, ws, msg); });
  ws.on('close', () => leave(r, ws));
  ws.on('error', () => leave(r, ws));
}

function onMessage(r, ws, msg) {
  const me = ws._p;
  if (msg.t === 'hello' && me.slot < 0) {
    if (r.started) { send(ws, { t: 'error', msg: 'This game has already started.' }); ws.close(4000, 'started'); return; }
    const used = new Set(peers(r).map((p) => p._p.slot));
    let slot = 0; while (used.has(slot)) slot++;
    if (slot >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'The room is full.' }); ws.close(4001, 'full'); return; }
    me.slot = slot;
    me.name = String(msg.name || `Player ${slot + 1}`).slice(0, 24);
    me.version = String(msg.version || '');
    me.rtt = 0;
    lobby(r);
    return;
  }
  if (msg.t === 'ping') { send(ws, { t: 'pong', ts: msg.ts }); return; }
  if (msg.t === 'rejoin' && me.slot < 0) {   // a player of a running game whose connection dropped
    const slot = Number(msg.slot);
    if (!r.started || !(slot in r.away) || peers(r).some((p) => p._p.slot === slot)) {
      send(ws, { t: 'error', msg: 'Could not rejoin the game.' }); ws.close(4002, 'rejoin'); return;
    }
    Object.assign(me, r.away[slot], { slot });
    delete r.away[slot];
    if (r.timers[slot]) { clearTimeout(r.timers[slot]); delete r.timers[slot]; }
    send(ws, { t: 'rejoined', slot });
    return;
  }
  if (me.slot < 0) return;
  if (msg.t === 'rtt') { me.rtt = Math.max(0, Math.min(5000, Math.round(Number(msg.ms) || 0))); if (!r.started) lobby(r); return; }
  if (msg.t === 'p2p') {
    const p2p = {};
    for (const [k, v] of Object.entries(msg.rtt || {})) p2p[Number(k)] = Math.max(0, Math.min(5000, Math.round(Number(v) || 0)));
    me.p2p = p2p;
    if (!r.started) lobby(r);
    return;
  }
  if (msg.t === 'start' && me.slot === 0 && !r.started) {
    const ps = peers(r);
    if (new Set(ps.map((p) => p._p.version)).size > 1) {
      send(ws, { t: 'error', msg: 'Players have different game builds or files; everyone must reload the page.' }); return;
    }
    const slots = ps.map((p) => p._p.slot).sort((a, b) => a - b);
    if (slots.some((s, i) => s !== i)) { send(ws, { t: 'error', msg: 'Waiting for the player list to settle; try again.' }); return; }
    r.started = { players: ps.length, delay: Math.max(2, Math.min(30, Number(msg.delay) || 6)) };
    for (const p of ps) send(p, { t: 'start', ...r.started, you: p._p.slot });
    return;
  }
  if (msg.t === 'sig') { for (const p of peers(r)) if (p._p.slot === msg.to) send(p, { t: 'sig', from: me.slot, data: msg.data }); return; }
  if (msg.t === 'in') { for (const p of peers(r)) if (p._p.slot !== me.slot) send(p, msg); }   // re-send as text (never a binary frame)
}

// A player who drops in the lobby is gone; in a running game the others are told only after a grace period,
// so a dropped player can rejoin their slot (the others wait in lockstep meanwhile).
function leave(r, ws) {
  if (!r.sockets.has(ws)) return;
  const me = ws._p;
  r.sockets.delete(ws);
  if (me.slot < 0) return;
  const slot = me.slot;
  me.slot = -1;
  if (!r.started) {
    for (const p of peers(r)) send(p, { t: 'left', slot });
    lobby(r);
    if (r.sockets.size === 0) rooms.delete(r.code);
    return;
  }
  r.away[slot] = { name: me.name, version: me.version, rtt: me.rtt, p2p: me.p2p };
  r.timers[slot] = setTimeout(() => {
    delete r.away[slot];
    delete r.timers[slot];
    for (const p of peers(r)) send(p, { t: 'left', slot });
    if (r.sockets.size === 0) rooms.delete(r.code);
  }, REJOIN_GRACE_MS);
}

// ------------------------------------------------------------------ start
httpServer.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Cricket 07 LAN room server listening on ${HOST}:${PORT}`);
  if (ips.length) {
    console.log(`\nShare this with players on the same Wi-Fi — everyone opens:`);
    for (const ip of ips) console.log(`    http://localhost:8007/?netplay=http://${ip}:${PORT}`);
  } else {
    console.log('(no LAN IPv4 found; run `ipconfig getifaddr en0` to get your Wi-Fi address)');
  }
  console.log('\nThen one player creates a room code and the other joins it. Ctrl+C to stop.');
});
