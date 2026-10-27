#!/usr/bin/env node
// Rooms on demand for copies of this kit: a page on a copy's GitHub Pages
// site asks for a room, and gets one running that copy's own wasm. The pool
// fetches the game's wasm from the site at the path tools/site.mjs publishes
// it (build/<game>/game.wasm), checks it as the relay does (net/sim-check.mjs),
// pins it by sha256 for the room's life (a file named by its hash, the only
// place fetched bytes are written), and joins the caller to a room on that
// wasm: one with a seat free if there is one, else a new relay started the
// way net/rooms.mjs starts them. The wasm runs only in the relay's referee.
//
// HTTP, under public_base's path (/kit/), CORS for allow_origins:
//   POST rooms {site, game?, sha256?, room?}  (or GET rooms?site=...)
//     site: the copy's page, https://owner.github.io/repo/; game: fireplace
//     (default), party, arena, flight, bumper or golf; sha256: the page's own wasm's,
//     so a page with a stale or newer build is told rather than refused by the
//     relay; room: an invite's room, joined if it is open, has a seat and runs
//     the same wasm. -> {room, url, hash, hash_url, game, game_sha256, players,
//     max_players}, with a why when it is not the room asked for; or a status
//     >= 400 and {why}.
//   GET rooms/<room>   that room's {room, url, hash, hash_url, game,
//                      game_sha256, players, max_players}, or 404 {why}
//   GET cert-hash[?room=<room>]   the relays' certificate hash (that room's), text
//   GET ./             {rooms, max_rooms, players}
// Every refusal says why: a site off fetch_from, a wasm too big, one that
// imports more than its memory or lacks an export the referee calls, the
// caps (max_rooms in all, per_site_rooms for one copy), a fetch that failed,
// and a wasm whose rooms ended refuse_after times (exit 2 or 3) within
// refuse_s, refused by its sha256 until refuse_s after the last.
// A room with nobody in it and no seat held for idle_s is stopped, as is an
// empty room on a renewed certificate (tools/cert.sh).
//   node net/kit-rooms.mjs kit-rooms.json   (net/kit-rooms.example.json)
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startRoom, certAge } from './rooms.mjs';
import { simRefusal } from './sim-check.mjs';
import { isMain } from '../tools/main.mjs';

// where each game's wasm is on a site (tools/site.mjs copies build/ as it is)
export const GAMES = {
  fireplace: 'build/fireplace/game.wasm', party: 'build/party/game.wasm', arena: 'build/arena/game.wasm',
  flight: 'build/flight/game.wasm', bumper: 'build/bumper/game.wasm', golf: 'build/game.wasm',
};

const DEFAULTS = {
  listen: '127.0.0.1:61280', public_base: 'https://game.elopros.com/kit/',
  host: 'game.elopros.com', bind: '0.0.0.0', ports: [61300, 61315], native_offset: 0,
  max_rooms: 8, per_site_rooms: 2, max_players: 8, idle_s: 120, hold_s: 20,
  max_wasm_bytes: 2 * 1024 * 1024, fetch_timeout_s: 10,
  fetch_from: ['https://*.github.io'], allow_origins: ['https://*.github.io'],
  refuse_after: 3, refuse_s: 3600, per_ip_per_min: 30,
  status_dir: 'traces/kit-rooms', wasm_dir: join(tmpdir(), 'kit-rooms-wasm'), relay_args: [],
};
const STEP_MS = 2000;
const SITE_TTL_MS = 30000; // a site's wasm is fetched again after this
const MAX_BODY = 4096;
const MAX_FETCHES = 4; // at once
const START_MS = 20000; // a relay not up by then has failed to start

class Refusal extends Error {
  constructor(status, why) { super(why); this.status = status; }
}
const readJson = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const certHash = () => { try { return readFileSync('certs/hash.txt', 'utf8').trim(); } catch { return ''; } };
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Does url's origin match pattern, scheme://host[:port]? A host's leading *.
// stands for one or more labels: https://*.github.io is every Pages site.
export function originMatch(pattern, url) {
  const m = /^(https?):\/\/(\*\.)?([a-z0-9.-]+)(?::(\d+))?$/i.exec(pattern);
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!m || u.protocol !== `${m[1].toLowerCase()}:` || (m[4] || '') !== u.port) return false;
  const host = u.hostname.toLowerCase(), base = m[3].toLowerCase();
  return m[2] ? host.endsWith(`.${base}`) : host === base;
}

// A copy's page as the pool keys it, origin and path, ending in /; or a Refusal.
export function siteOf(s, fetchFrom) {
  let u;
  try { u = new URL(String(s)); } catch { throw new Refusal(400, 'site: give the page\'s address, https://owner.github.io/repo/'); }
  if (u.username || u.password || u.search || u.hash) throw new Refusal(400, 'site: the page\'s address, with no query or #');
  let path = u.pathname.replace(/index\.html$/, '');
  if (!path.endsWith('/')) path += '/';
  if (path.length > 200 || !/^\/([A-Za-z0-9._~-]+\/)*$/.test(path) || /\/\.\.?\//.test(path)) throw new Refusal(400, `site: ${path} is not a page's path`);
  if (!fetchFrom.some((p) => originMatch(p, u.href))) throw new Refusal(403, `${u.origin} is not a host this pool fetches games from (${fetchFrom.join(', ')})`);
  return u.origin + path;
}

// The bytes at url, no redirects, at most max of them, within timeoutS.
export async function fetchWasm(url, max, timeoutS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutS * 1000);
  try {
    let res;
    try { res = await fetch(url, { redirect: 'manual', signal: ac.signal, headers: { accept: 'application/wasm' } }); } catch (e) {
      throw new Refusal(502, `${url}: ${ac.signal.aborted ? `no answer in ${timeoutS} s` : e.cause?.code || e.message}`);
    }
    if (res.status >= 300 && res.status < 400) throw new Refusal(502, `${url} redirects (HTTP ${res.status}); the pool follows none`);
    if (!res.ok) throw new Refusal(502, `${url}: HTTP ${res.status}`);
    const tooBig = () => new Refusal(413, `${url} is more than ${max} bytes, this pool's most`);
    if (Number(res.headers.get('content-length')) > max) { ac.abort(); throw tooBig(); }
    const parts = [];
    let n = 0;
    try {
      for await (const part of res.body) {
        n += part.length;
        if (n > max) { ac.abort(); throw tooBig(); }
        parts.push(part);
      }
    } catch (e) {
      if (e instanceof Refusal) throw e;
      throw new Refusal(502, `${url}: ${ac.signal.aborted ? `not all there in ${timeoutS} s` : e.message}`);
    }
    return Buffer.concat(parts);
  } finally { clearTimeout(timer); }
}

export function startKitRooms(config, { log = (m) => console.error(`[kit-rooms] ${m}`) } = {}) {
  const c = { ...DEFAULTS, ...config };
  const base = new URL(c.public_base);
  const prefix = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const threadsAt = c.relay_args.indexOf('--referee-threads');
  const threads = threadsAt >= 0 ? Number(c.relay_args[threadsAt + 1]) : 2;
  mkdirSync(c.status_dir, { recursive: true });
  mkdirSync(c.wasm_dir, { recursive: true });

  const rooms = new Map(); // id -> { id, port, sha, game, site, r, hash, holds, lastPlayers, players, emptySince, hadPlayers }
  const sites = new Map(); // site|game -> { sha, bytes, at }: the newest fetch, kept SITE_TTL_MS
  const fetching = new Map(); // site|game -> the fetch in flight
  const checked = new Map(); // sha -> why the referee won't run it, or null
  const fails = new Map(); // sha -> { at: [times of rooms that ended 2 or 3], why }
  const starting = new Map(); // sha|game -> the start in flight
  const badPorts = new Map(); // port -> until when it is skipped (a room died starting on it)
  const asks = new Map(); // ip -> { n, since }
  let fetches = 0;

  const live = () => [...rooms.values()].filter((m) => !m.r.stopping);
  const seated = (m) => m.players + m.holds.length;
  const answer = (m, extra = {}) => ({
    room: m.id, url: `https://${c.host}:${m.port}/`, hash: m.hash, hash_url: `${base.origin}${prefix}cert-hash?room=${m.id}`,
    game: m.game, game_sha256: m.sha, players: m.players, max_players: c.max_players, ...extra,
  });
  const refusedFor = (sha) => {
    const f = fails.get(sha);
    if (!f) return null;
    const recent = f.at.filter((t) => Date.now() - t < c.refuse_s * 1000);
    if (recent.length < c.refuse_after) return null;
    const until = new Date(recent[recent.length - 1] + c.refuse_s * 1000).toISOString();
    return `this game.wasm's rooms ended ${recent.length} times in ${c.refuse_s} s (${f.why}); refused until ${until}`;
  };

  // the site's wasm for game, fetched (or as fetched in the last SITE_TTL_MS, unless fresh), with its sha256
  async function siteWasm(site, game, fresh = false) {
    const key = `${site}|${game}`;
    const was = sites.get(key);
    if (was && !fresh && Date.now() - was.at < SITE_TTL_MS) return was;
    if (fetching.has(key)) return fetching.get(key);
    if (fetches >= MAX_FETCHES) throw new Refusal(503, 'the pool is fetching other games: try again in a moment');
    fetches++;
    const p = fetchWasm(new URL(GAMES[game], site).href, c.max_wasm_bytes, c.fetch_timeout_s).then((bytes) => {
      const got = { sha: sha256(bytes), bytes, at: Date.now() };
      sites.set(key, got);
      if (sites.size > 64) sites.delete(sites.keys().next().value);
      return got;
    }).finally(() => { fetches--; fetching.delete(key); });
    fetching.set(key, p);
    return p;
  }

  async function check(sha, bytes) {
    if (!checked.has(sha)) {
      checked.set(sha, await simRefusal(bytes, threads));
      if (checked.size > 1024) checked.delete(checked.keys().next().value);
    }
    const why = checked.get(sha);
    if (why) throw new Refusal(422, `game.wasm ${why}`);
  }

  // the fullest open room on sha with a seat free, or null
  const roomFor = (sha, game) => live().filter((m) => m.sha === sha && m.game === game && m.ready && seated(m) < c.max_players)
    .sort((a, b) => seated(b) - seated(a))[0] || null;
  const hold = (m) => { m.holds.push(Date.now()); m.emptySince = null; return m; };

  function freePort() {
    const used = new Set([...rooms.values()].map((m) => m.port));
    for (let port = c.ports[0]; port <= c.ports[1]; port++) if (!used.has(port) && !(badPorts.get(port) > Date.now())) return port;
    return null;
  }

  async function start(site, game, sha, bytes) {
    const roomCount = (n) => `${n} room${n === 1 ? '' : 's'}`;
    const n = live().length;
    if (n >= c.max_rooms) throw new Refusal(503, `the pool is full: ${roomCount(n)} open, its most; try again in a while`);
    const mine = live().filter((m) => m.site === site).length;
    if (mine >= c.per_site_rooms) throw new Refusal(503, `${site} has ${roomCount(mine)} open, the most one copy may`);
    const port = freePort();
    if (port === null) throw new Refusal(503, 'the pool has no port free: try again in a while');
    const wasm = resolve(c.wasm_dir, `${sha}.wasm`);
    if (!existsSync(wasm)) writeFileSync(wasm, bytes);
    let id;
    do id = randomBytes(5).toString('hex'); while (rooms.has(id));
    const m = { id, port, sha, game, site, hash: certHash(), holds: [], lastPlayers: 0, players: 0, emptySince: Date.now(), hadPlayers: false, ready: false, ended: null };
    m.r = startRoom({ wasm, game, bind: c.bind, native_offset: c.native_offset, max_players: c.max_players, status_dir: c.status_dir, relay_args: c.relay_args }, port, (code, why) => {
      rooms.delete(id);
      m.ended = why || `the relay ended (exit ${code})`;
      if (!live().some((o) => o.sha === sha)) rmSync(wasm, { force: true });
      if (code === 2 || code === 3) {
        const f = fails.get(sha) || { at: [], why };
        f.at = [...f.at.filter((t) => Date.now() - t < c.refuse_s * 1000), Date.now()];
        f.why = why;
        fails.set(sha, f);
        log(`room ${id} (${site}, ${sha.slice(0, 12)}) ended: ${why}`);
      } else if (why) {
        badPorts.set(port, Date.now() + 60000);
        log(`room ${id} ended: ${why}`);
      } else if (m.r.stopping && m.hadPlayers) fails.delete(sha); // a room that lived and closed idle clears the wasm's record
    });
    rooms.set(id, m);
    log(`room ${id} on ${port} for ${site} (${game}, ${sha.slice(0, 12)})`);
    // answer once the relay is up: a page connects at once, and does not retry
    const until = Date.now() + START_MS;
    while (!m.r.exited && !existsSync(`${c.status_dir}/${port}.json`) && Date.now() < until) await sleep(100);
    if (m.r.exited) throw new Refusal(m.ended?.includes('exit 2') ? 422 : 503, `the room did not start: ${m.ended}`);
    if (!existsSync(`${c.status_dir}/${port}.json`)) { stop(m); throw new Refusal(503, `the room did not start in ${START_MS / 1000} s`); }
    m.ready = true;
    return m;
  }

  function stop(m) {
    if (m.r.stopping) return;
    m.r.stopping = true;
    m.r.p.kill('SIGTERM');
  }

  // POST rooms: a room for this site's game, the invite's if it can be
  async function join(q) {
    const game = q.game ? String(q.game) : 'fireplace';
    if (!GAMES[game]) throw new Refusal(400, `game: one of ${Object.keys(GAMES).join(', ')}`);
    const site = siteOf(q.site, c.fetch_from);
    const want = q.sha256 ? String(q.sha256).toLowerCase() : '';
    if (want && !/^[0-9a-f]{64}$/.test(want)) throw new Refusal(400, 'sha256: the page\'s game.wasm sha-256, in hex');
    let why;
    if (q.room) {
      const m = rooms.get(String(q.room));
      if (!m || m.r.stopping) why = `room ${q.room} has closed; this is another`;
      else if (m.game !== game || (want && m.sha !== want)) why = `room ${q.room} plays another build of the game; this is another room`;
      else if (seated(m) >= c.max_players) why = `room ${q.room} is full; this is another`;
      else if (!m.ready) why = `room ${q.room} is still starting; this is another`;
      else if (want || (await siteWasm(site, game)).sha === m.sha) return answer(hold(m));
      else why = `room ${q.room} plays another build of the game; this is another room`;
    }
    const extra = why ? { why } : {};
    // a page that says which wasm it has joins a room on it without a fetch
    if (want) {
      const refused = refusedFor(want);
      if (refused) throw new Refusal(503, refused);
      const m = roomFor(want, game);
      if (m) return answer(hold(m), extra);
    }
    let got = await siteWasm(site, game);
    if (want && got.sha !== want) got = await siteWasm(site, game, true);
    if (want && got.sha !== want) throw new Refusal(409, `this page's game.wasm is not the one ${site} serves now (${got.sha.slice(0, 12)}): reload the page`);
    const refused = refusedFor(got.sha);
    if (refused) throw new Refusal(503, refused);
    await check(got.sha, got.bytes);
    // one start at a time for a wasm: who asks meanwhile waits for it, then takes a seat in it
    const key = `${got.sha}|${game}`;
    for (;;) {
      const m = roomFor(got.sha, game);
      if (m) return answer(hold(m), extra);
      if (starting.has(key)) { await starting.get(key).catch(() => {}); continue; }
      const p = start(site, game, got.sha, got.bytes).finally(() => starting.delete(key));
      starting.set(key, p);
      return answer(hold(await p), extra);
    }
  }

  // every STEP_MS: each room's players from its status, seats held let go, empty rooms stopped
  function step() {
    const now = Date.now();
    const cert = certAge();
    for (const m of live()) {
      if (!m.ready) continue;
      const st = readJson(`${c.status_dir}/${m.port}.json`);
      if (!st) continue;
      m.players = st.players;
      if (m.players > 0) m.hadPlayers = true;
      // a seat held is taken once a player comes in, and let go after hold_s
      for (let k = m.lastPlayers; k < m.players && m.holds.length; k++) m.holds.shift();
      m.lastPlayers = m.players;
      m.holds = m.holds.filter((t) => now - t < c.hold_s * 1000);
      if (seated(m) > 0) { m.emptySince = null; continue; }
      m.emptySince ??= now;
      if (m.r.cert < cert) { log(`room ${m.id}: new certificate, stopping while empty`); stop(m); } else if (now - m.emptySince > c.idle_s * 1000) { log(`room ${m.id}: empty for ${c.idle_s} s, stopping`); stop(m); }
    }
    for (const [ip, a] of asks) if (now - a.since > 60000) asks.delete(ip);
    for (const [key, got] of sites) if (now - got.at > SITE_TTL_MS) sites.delete(key);
  }
  const timer = setInterval(step, STEP_MS);

  // ── HTTP ──
  const cors = (req) => {
    const o = req.headers.origin;
    return o && c.allow_origins.some((p) => originMatch(p, o)) ? { 'Access-Control-Allow-Origin': o, Vary: 'Origin' } : { Vary: 'Origin' };
  };
  const send = (req, res, status, body) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { ...cors(req), 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json', 'Cache-Control': 'no-store' }).end(text);
  };
  const bodyOf = (req) => new Promise((ok, no) => {
    let n = 0;
    const parts = [];
    req.on('data', (d) => { n += d.length; if (n > MAX_BODY) { no(new Refusal(413, 'the ask is too long')); req.destroy(); } else parts.push(d); });
    req.on('end', () => { try { ok(n ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { no(new Refusal(400, 'the ask is not JSON')); } });
    req.on('error', no);
  });
  const ipOf = (req) => {
    const a = req.socket.remoteAddress || '';
    // behind nginx (on this host), its X-Real-IP
    return /^(::ffff:)?127\.|^::1$/.test(a) && req.headers['x-real-ip'] ? String(req.headers['x-real-ip']) : a;
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (!u.pathname.startsWith(prefix)) return send(req, res, 404, { why: 'not here' });
    const path = u.pathname.slice(prefix.length);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors(req), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '600' }).end();
      return;
    }
    try {
      if (path === 'rooms' && (req.method === 'POST' || req.method === 'GET')) {
        const ip = ipOf(req);
        const a = asks.get(ip) || { n: 0, since: Date.now() };
        asks.set(ip, a);
        if (++a.n > c.per_ip_per_min) throw new Refusal(429, `more than ${c.per_ip_per_min} asks a minute from one address: try again in a minute`);
        const q = req.method === 'POST' ? await bodyOf(req) : Object.fromEntries(u.searchParams);
        return send(req, res, 200, await join(q));
      }
      if (req.method !== 'GET') throw new Refusal(405, 'GET or POST');
      if (path === '') return send(req, res, 200, { rooms: live().length, max_rooms: c.max_rooms, players: live().reduce((n, m) => n + m.players, 0) });
      if (path === 'cert-hash') {
        const id = u.searchParams.get('room');
        const m = id ? rooms.get(id) : null;
        if (id && !m) throw new Refusal(404, `no room ${id}: it has closed, or never was`);
        return send(req, res, 200, m ? m.hash : certHash());
      }
      const at = /^rooms\/([0-9a-f]{1,32})$/.exec(path);
      if (at) {
        const m = rooms.get(at[1]);
        if (!m || m.r.stopping || !m.ready) throw new Refusal(404, `no room ${at[1]}: it has closed, or never was`);
        return send(req, res, 200, answer(m));
      }
      throw new Refusal(404, 'not here');
    } catch (e) {
      if (!(e instanceof Refusal)) log(`error: ${e?.stack || e}`);
      else if (e.status !== 404) log(`refused (${e.status}): ${e.message}`);
      return send(req, res, e instanceof Refusal ? e.status : 500, { why: e instanceof Refusal ? e.message : 'the pool broke answering that' });
    }
  });
  const [lhost, lport] = c.listen.split(':');
  const listening = new Promise((ok) => server.listen(Number(lport), lhost, ok));

  return {
    rooms, server, listening, step,
    url: () => `http://${lhost}:${server.address().port}${prefix}`,
    async close() {
      clearInterval(timer);
      server.close();
      const left = [...rooms.values()];
      for (const m of left) stop(m);
      await Promise.all(left.map((m) => (m.r.exited ? null : new Promise((ok) => { m.r.p.once('exit', ok); setTimeout(ok, 5000); }))));
    },
  };
}

if (isMain(import.meta.url)) {
  const path = process.argv[2];
  if (!path) { console.error('usage: node net/kit-rooms.mjs kit-rooms.json'); process.exit(1); }
  const pool = startKitRooms(JSON.parse(readFileSync(path, 'utf8')));
  pool.listening.then(() => console.error(`[kit-rooms] on ${pool.url()}`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await pool.close(); process.exit(0); });
}
