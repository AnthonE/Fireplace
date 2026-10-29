#!/usr/bin/env node
// The kit's room pool (net/kit-rooms.mjs) for a copy on GitHub Pages: the
// static site (tools/site.mjs) from a plain server with no COOP or COEP
// header, as Pages serves it, its kit.json naming no relay, only the pool
// (here, on this machine, fetching from this server alone). Passes when
//   · the page, with no relay, plays a local room with AI players, asking no
//     pool, and offers play online with friends; pressed, it gets a room from
//     the pool running the site's own wasm, reloads into it (its address the
//     invite) and plays it online (coi.js isolating it); refused, it says why
//     and stays; ?pool=0 offers nothing;
//   · a second page opened from the first's invite link lands in that room;
//   · the pages and bots at the room's native door (net/bot-host.mjs) agree
//     with the referee (the relay's status) and with each other (gate.mjs grader);
//   · an invite whose pool is out of reach, or whose pool's room is (UDP
//     blocked, say), plays a local room and says why;
//   · the room closes once it has sat empty for idle_s, and an invite to it
//     then gets another room, saying so;
//   · the arena's page on a map the site publishes (?map=crossroads) goes
//     online the same way: a room on the site's wasm and that map, pinned by
//     both hashes; its invite keeps the map and lands a second page in the
//     same room, the two stepping the same world as the referee;
//   · the pool refuses, each with its why: a site off its fetch_from, a wasm
//     over max_wasm_bytes, one importing more than its memory, one lacking an
//     export the referee calls, a redirect, a page whose wasm is not the
//     site's, an unknown game; a map for a game that takes none, one named
//     as a path, one the site doesn't serve, one map_load refuses, a page
//     whose map is not the site's; a wasm whose rooms end (exit 3, a sim that
//     never returns) refuse_after times, by its sha256; and its caps, one
//     copy's rooms and the pool's.
//   node net/run-kit-rooms.mjs [--seconds 60]
import net from 'node:net';
import dgram from 'node:dgram';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';
import * as W from './wire.mjs';
import { setup, botHost, grader, readJson, sleep, opt } from './gate.mjs';
import { startKitRooms } from './kit-rooms.mjs';
import { buildSite } from '../tools/site.mjs';

const seconds = Number(opt('seconds', 60));
const POOL_PORT = 4710, PORTS = [4711, 4716], NATIVE = 100;
const failed = [];
const report = { seconds, checks: [], errors: [] };
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : 'FAIL  '}${name}${!ok && detail ? ` — ${detail}` : ''}`);
  report.checks.push({ name, ok: !!ok, ...(ok ? {} : { detail }) });
  if (!ok) failed.push(name);
};
const until = async (what, ms, every = 250) => { const end = Date.now() + ms; while (Date.now() < end) { if (await what()) return true; await sleep(every); } return false; };

setup('kit-rooms');
const dir = resolve('traces/kit-rooms-gate');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const { out } = buildSite(join(dir, 'site'));

// ── the wasm the pool must refuse ───────────────────────────────────────────
const wabt = await (createRequire(import.meta.url)('wabt'))();
const wasmOf = (wat) => Buffer.from(wabt.parseWat('t.wat', wat, { threads: true }).toBinary({}).buffer);
const MEM = '(import "env" "mem" (memory 64 64 shared))';
const SIM = (step) => `(module ${MEM} (func (export "init") (param i32)) (func (export "step") ${step}) (func (export "snapshot") (param i32)) (func (export "regrid")))`;
const BAD = {
  sneaky: wasmOf(`(module ${MEM} (import "env" "fetch" (func (param i32))) (func (export "init") (param i32)) (func (export "step")) (func (export "snapshot") (param i32)) (func (export "regrid")))`),
  partial: wasmOf(`(module ${MEM} (func (export "init") (param i32)) (func (export "step")))`),
  stuck: wasmOf(SIM('(loop (br 0))')),
  big: Buffer.alloc(1536 * 1024, 1),
};

// ── a static host like Pages: the files and their types, no isolation headers ──
// /good/ is the site; /<bad>/build/fireplace/game.wasm the wasm above; /moved/ redirects;
// /p1/ /p2/ /p3/ are the site again, for the caps; /m1/ for the map's room; /warped/ with a map no sim lays
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const fetched = [];
const pages = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const [, top, rest = ''] = /^\/([^/]+)\/?(.*)$/.exec(path) || [];
  if (rest.endsWith('game.wasm')) fetched.push(path);
  if (BAD[top] && rest === 'build/fireplace/game.wasm') { res.writeHead(200, { 'Content-Type': 'application/wasm' }).end(BAD[top]); return; }
  if (top === 'moved') { res.writeHead(302, { Location: `/good/${rest}` }).end(); return; }
  if (top === 'warped' && rest === 'build/maps/crossroads.qgmap') { res.writeHead(200).end(Buffer.alloc(200, 0xff)); return; }
  if (!['good', 'p1', 'p2', 'p3', 'm1', 'warped'].includes(top)) { res.writeHead(404).end(); return; }
  const file = normalize(join(out, rest.endsWith('/') || !rest ? join(rest, 'index.html') : rest));
  if (!file.startsWith(out)) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
});
await new Promise((ok) => pages.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${pages.address().port}`;
const site = (name) => `${origin}/${name}/`;
const poolUrl = `http://127.0.0.1:${POOL_PORT}/kit/`;
// the copy's kit.json: no relay, only the pool
const kitJson = join(out, 'client', 'kit.json');
writeFileSync(kitJson, JSON.stringify({ ...JSON.parse(readFileSync(kitJson, 'utf8')), relay: { url: '', hash: '', hash_url: '', pool: poolUrl } }, null, 2));

const statusDir = join(dir, 'status');
const pool = startKitRooms({
  listen: `127.0.0.1:${POOL_PORT}`, public_base: poolUrl, host: '127.0.0.1', bind: '127.0.0.1', ports: PORTS, native_offset: NATIVE,
  max_rooms: 2, per_site_rooms: 1, max_players: 8, idle_s: 6, hold_s: 15, max_wasm_bytes: 1024 * 1024, fetch_timeout_s: 5,
  fetch_from: [origin], allow_origins: [origin], refuse_after: 2, refuse_s: 600, per_ip_per_min: 1000,
  status_dir: statusDir, wasm_dir: join(dir, 'wasm'), relay_args: ['--referee-threads', '1', '--referee-lag', '4'],
}, { log: (m) => process.stderr.write(`[kit-rooms] ${m}\n`) });
await pool.listening;
process.on('exit', () => { for (const m of pool.rooms.values()) try { m.r.p.kill('SIGKILL'); } catch { /* gone */ } });
const ask = async (body, { method = 'POST', path = 'rooms' } = {}) => {
  const res = await fetch(`${poolUrl}${path}`, method === 'POST'
    ? { method, headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) } : { headers: { origin } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* text */ }
  return { status: res.status, cors: res.headers.get('access-control-allow-origin'), json, text };
};
const statusOf = (port) => readJson(join(statusDir, `${port}.json`));
const portOf = (url) => Number(new URL(url).port);

// a player at a relay's native door, sending empty words: what keeps a room's sim stepping (net/run-rooms.mjs)
async function occupy(nativePort, bytes) {
  const tcp = net.connect({ host: '127.0.0.1', port: nativePort, noDelay: true });
  await new Promise((ok, no) => { tcp.once('connect', ok); tcp.once('error', no); });
  const sr = W.bufferedReader(Readable.toWeb(tcp).getReader());
  tcp.write(W.encodeHello({ maxDatagram: 1400, wasmPrefix: await W.wasmPrefix(bytes) }));
  const w = W.decodeWelcome(await sr.read(32));
  const udp = dgram.createSocket('udp4');
  const t0 = performance.now();
  let seq = 0;
  const words = setInterval(() => {
    const now = Math.floor(w.serverTick + (performance.now() - t0) / W.TICK_MS) + 8;
    const from = Math.max(w.joinTick, now - 16);
    const m = W.encodeInput({ seq: seq++, firstTick: from, ackTick: 0, ackBits: 0n, words: new Array(now - from).fill(0) });
    const d = new Uint8Array(4 + m.length); new DataView(d.buffer).setUint32(0, w.token, true); d.set(m, 4);
    udp.send(d, nativePort, '127.0.0.1');
  }, 16);
  return () => { clearInterval(words); udp.close(); tcp.destroy(); };
}

// ── Chrome on the copy's page ───────────────────────────────────────────────
const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined),
  args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
// what a page is expected to say: the 404 of certs/hash.txt, which a copy has none of; and the pool or room it can't reach
const EXPECTED = { c: /ERR_CONNECTION_REFUSED/, e: /ERR_CONNECTION_REFUSED/, d: /Failed to establish a connection to https:\/\/127\.0\.0\.1:\d+\/: net::ERR_QUIC/ };
const watch = (page, label) => {
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text()) && !EXPECTED[label]?.test(m.text())) { report.errors.push(`${label}: ${m.text()}`); process.stderr.write(`[${label}] ${m.text()}\n`); } });
  page.on('pageerror', (e) => { report.errors.push(`${label}: ${e.message}`); process.stderr.write(`[${label}] ${e.message}\n`); });
};
const GAME = '&bot=1&present=0&res=320x200&music=0';
async function open(url, label) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const page = await ctx.newPage();
  watch(page, label);
  await page.goto(url);
  return page;
}
const stateOf = (page) => page.evaluate(() => (window.__qa?.state ? { ...window.__qa.state(), hashes: window.__qa.hashes.slice(), isolated: crossOriginIsolated, line: document.querySelector('#line span')?.textContent, online: !document.getElementById('online')?.hidden, lineShown: !document.getElementById('line')?.hidden } : null)).catch(() => null);
const playing = (s) => !!s && s.clState === 2 && s.slot >= 0;

const sha = createHash('sha256').update(readFileSync(join(out, 'build/fireplace/game.wasm'))).digest('hex');
let roomId = null, roomPort = 0;
try {
  // ── a page with no relay plays a local room, and offers to go online ──
  const lone = await open(`${site('good')}?x=1${GAME}`, 'lone');
  let sl = null;
  await until(async () => playing(sl = await stateOf(lone)) && sl.hashes.length > 0, 60000, 500);
  check('a page with no relay plays a local room with AI players, asking no pool', playing(sl) && sl.pool.local && !sl.pool.id && pool.rooms.size === 0 && sl.isolated, JSON.stringify(sl && { clState: sl.clState, pool: sl.pool, error: sl.error }));
  check('its line says so and offers play online with friends', sl?.line === 'playing here with AI players' && sl.online, JSON.stringify(sl && { line: sl.line, online: sl.online }));
  await lone.context().close();
  // a player on the couch presses it: a pool room, the page reloaded into it; sitting down plays it online
  const COUCH = '&present=0&res=320x200&music=0';
  const a = await open(`${site('good')}?x=1${COUCH}`, 'a');
  await a.waitForSelector('#online', { state: 'visible', timeout: 30000 });
  // where the button sends the page (the site's index then opens Fireplace's page, the query kept)
  const navs = [];
  a.on('request', (r) => { if (r.isNavigationRequest() && r.frame() === a.mainFrame()) navs.push(r.url()); });
  await Promise.all([a.waitForURL(/fireplace\.html\?room=/, { timeout: 30000 }), a.click('#online')]);
  const went = navs[0] || '';
  await a.waitForFunction(() => window.__qa?.state, null, { timeout: 30000 });
  await a.click('#stage');
  let sa = null;
  await until(async () => playing(sa = await stateOf(a)) && sa.pool?.id, 60000, 500);
  roomId = sa?.pool?.id;
  check('play online with friends lands the page in a pool room, its address the invite', playing(sa) && !!roomId && !sa.pool.local && sa.isolated
    && went.startsWith(`${site('good')}?room=${roomId}&`), JSON.stringify({ went, ...(sa && { clState: sa.clState, slot: sa.slot, pool: sa.pool, error: sa.error }) }));
  const info = roomId ? await ask(null, { method: 'GET', path: `rooms/${roomId}` }) : {};
  roomPort = info.json?.url ? portOf(info.json.url) : 0;
  check('the room runs the site\'s own wasm, pinned by its sha256', info.status === 200 && info.json.game_sha256 === sha && info.json.game === 'fireplace', JSON.stringify(info.json));
  check('the room\'s hash_url serves its certificate hash, with CORS', await (async () => {
    if (!info.json?.hash_url) return false;
    const r = await fetch(info.json.hash_url, { headers: { origin } });
    return r.status === 200 && (await r.text()) === info.json.hash && r.headers.get('access-control-allow-origin') === origin;
  })(), JSON.stringify(info.json));
  check('the room\'s line says which room it is', !!roomId && sa.line?.includes(roomId), sa?.line);
  const invite = sa?.pool?.invite || '';
  check('the invite is the site\'s front door with the room', invite === `${site('good')}?room=${roomId}`, invite);
  const b = await open(`${invite}${GAME}`, 'b');
  let sb = null;
  await until(async () => playing(sb = await stateOf(b)) && sb.pool?.id, 60000, 500);
  check('a page opened from the invite lands in the same room', playing(sb) && sb.pool.id === roomId && !sb.pool.why, JSON.stringify(sb && { clState: sb.clState, slot: sb.slot, pool: sb.pool }));
  check('the two pages hold different slots', playing(sa) && playing(sb) && sa.slot !== sb.slot, `${sa?.slot} ${sb?.slot}`);

  // bots at the room's native door, beside the two pages
  const bots = roomPort ? botHost(join(dir, 'bots.json'), ['--fireplace', '--relay', `127.0.0.1:${roomPort + NATIVE}`, '--bots', '2', '--seconds', String(seconds - 10)]) : null;
  check('the room counts both pages and both bots', await until(() => statusOf(roomPort)?.players === 4, 20000), JSON.stringify(statusOf(roomPort)));
  // the pool unreachable: the local room, and a line saying why
  const DEAD = encodeURIComponent(`http://127.0.0.1:${POOL_PORT - 1}/kit/`);
  const c = await open(`${site('good')}?room=${roomId}&pool=${DEAD}${GAME}`, 'c');
  let sc = null;
  await until(async () => playing(sc = await stateOf(c)) && sc.hashes.length > 0, 60000, 500);
  check('an invite whose pool is out of reach plays a local room and says why', playing(sc) && sc.pool.local && /out of reach/.test(sc.pool.why) && sc.line?.includes('out of reach'), JSON.stringify(sc && { clState: sc.clState, pool: sc.pool, line: sc.line }));
  await c.context().close();
  // a pool whose room can't be reached (UDP blocked, say): the local room once the session fails
  const deadPool = createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return; }
    req.resume();
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify({ room: 'dead', url: `https://127.0.0.1:${POOL_PORT - 1}/`, hash: info.json?.hash }));
  });
  await new Promise((ok) => deadPool.listen(0, '127.0.0.1', ok));
  const d = await open(`${site('good')}?room=dead&pool=${encodeURIComponent(`http://127.0.0.1:${deadPool.address().port}/kit/`)}${GAME}`, 'd');
  let sd = null;
  await until(async () => playing(sd = await stateOf(d)) && sd.hashes.length > 0, 90000, 500);
  check('a page given a room it can\'t reach plays a local room and says why', playing(sd) && sd.pool.local && !sd.pool.id && /didn't let this page in/.test(sd.pool.why) && !sd.error, JSON.stringify(sd && { clState: sd.clState, pool: sd.pool, error: sd.error }));
  await d.context().close();
  deadPool.close();
  // the button with the pool out of reach: its why in the line, the page where it was
  const e = await open(`${site('good')}?pool=${DEAD}${COUCH}`, 'e');
  await e.waitForSelector('#online', { state: 'visible', timeout: 30000 });
  const at = e.url();
  await e.click('#online');
  let se = null;
  await until(async () => /out of reach/.test((se = await stateOf(e))?.line || ''), 30000, 500);
  check('play online with friends refused: the why in the line, the page stays local', /^playing here with AI players: the room pool is out of reach/.test(se?.line || '') && se.online && e.url() === at, JSON.stringify(se && { line: se.line, online: se.online, url: e.url() }));
  await e.context().close();
  // ?pool=0: no offer
  const f = await open(`${site('good')}?pool=0${COUCH}`, 'f');
  await f.waitForFunction(() => window.__qa?.state, null, { timeout: 30000 });
  await sleep(1000);
  const sf = await stateOf(f);
  check('?pool=0 offers nothing', !!sf && !sf.online && !sf.lineShown, JSON.stringify(sf && { line: sf.line, online: sf.online, shown: sf.lineShown }));
  await f.context().close();
  const t0 = Date.now();
  while (Date.now() - t0 < (seconds - 15) * 1000) {
    await sleep(2000);
    const st = statusOf(roomPort);
    process.stderr.write(`\r${((Date.now() - t0) / 1000).toFixed(0)} s  room ${roomId}: ${st?.players} players, tick ${st?.tick}, hashes ${st?.hashes_checked} checked, ${st?.hashes_differed} differed   `);
  }
  process.stderr.write('\n');
  await bots?.done;
  const st = statusOf(roomPort);
  report.room = st;
  check('the referee checked every player\'s hashes and none differed', st?.hashes_checked >= 4 * 8 && st.hashes_differed === 0 && st.referee_errors === 0, JSON.stringify(st));
  [sa, sb] = [await stateOf(a), await stateOf(b)];
  const grade = grader((sa?.hashes || []).map(([t, h]) => [t, h]));
  const gb = grade(sb?.hashes), gbots = grade(readJson(join(dir, 'bots.json'))?.world?.hashes);
  report.grade = { b: gb, bots: gbots, a: sa?.hashes.length };
  check('the second page and the bots step the same world as the first', gb.compared >= 8 && gb.wrong === 0 && gbots.compared >= 8 && gbots.wrong === 0, JSON.stringify(report.grade));
  check('both pages kept up', playing(sa) && playing(sb) && !sa.error && !sb.error, JSON.stringify([sa?.error, sb?.error]));
  await a.context().close();
  await b.context().close();

  // ── the room closes once empty; an invite to it gets another room ──
  check('the empty room closes after idle_s', await until(() => !pool.rooms.has(roomId) && !statusOf(roomPort), 40000), JSON.stringify(statusOf(roomPort)));
  const gone = await ask(null, { method: 'GET', path: `rooms/${roomId}` });
  check('a closed room\'s status is a 404 with its why', gone.status === 404 && /closed/.test(gone.json?.why), JSON.stringify(gone));
  const again = await ask({ site: site('good'), sha256: sha, room: roomId });
  check('an invite to a closed room gets another, saying so', again.status === 200 && again.json.room !== roomId && /has closed/.test(again.json.why) && again.cors === origin, JSON.stringify(again.json));
  check('that room closes too, nobody having come', await until(() => pool.rooms.size === 0, 40000), String(pool.rooms.size));

  // ── refusals ──
  const refuse = async (name, body, status, why) => {
    fetched.length = 0;
    const r = await ask(body);
    check(`refused: ${name}`, r.status === status && why.test(r.json?.why || '') && r.cors === origin, `${r.status} ${r.text}`);
    return r;
  };
  await refuse('a site off fetch_from, unfetched', { site: 'https://someone.example.com/game/' }, 403, /not a host this pool fetches games from/);
  check('  and nothing was fetched for it', fetched.length === 0, fetched.join(' '));
  await refuse('the same server by another name', { site: `http://localhost:${pages.address().port}/good/` }, 403, /not a host/);
  await refuse('a wasm over max_wasm_bytes', { site: site('big') }, 413, /more than 1048576 bytes/);
  await refuse('a wasm importing more than its memory', { site: site('sneaky') }, 422, /env\.fetch/);
  await refuse('a wasm lacking an export the referee calls', { site: site('partial') }, 422, /does not export snapshot, regrid/);
  await refuse('a redirect', { site: site('moved') }, 502, /redirects/);
  await refuse('a page whose wasm is not the site\'s', { site: site('good'), sha256: '0'.repeat(64) }, 409, /reload/);
  await refuse('an unknown game', { site: site('good'), game: 'chess' }, 400, /game: one of/);
  check('no room was started for any of them', pool.rooms.size === 0, String(pool.rooms.size));

  // a sim that never returns: each room ends (exit 3) once a player is in; after refuse_after, its sha256 is refused
  for (let k = 0; k < 2; k++) {
    const r = await ask({ site: site('stuck') });
    const port = r.json?.url ? portOf(r.json.url) : 0;
    const leave = port ? await occupy(port + NATIVE, BAD.stuck) : () => {};
    const ended = await until(() => !pool.rooms.has(r.json?.room), 20000);
    leave();
    check(`a stuck sim's room ${k + 1} ends with its referee behind`, r.status === 200 && ended, `${r.status} ${r.text}`);
  }
  await refuse('a wasm whose rooms ended twice, by sha256', { site: site('stuck') }, 503, /ended 2 times .*fell behind \(exit 3\).*refused until/);
  const stuckSha = createHash('sha256').update(BAD.stuck).digest('hex');
  await refuse('  and by its sha256 alone, from any site', { site: site('good'), sha256: stuckSha }, 503, /refused until/);

  // ── a map the site publishes: the arena's page takes it online, on that map ──
  const mapSha = createHash('sha256').update(readFileSync(join(out, 'build/maps/crossroads.qgmap'))).digest('hex');
  const ARENA = '&bot=1&present=0&res=320x200&music=0';
  const ma = await open(`${site('m1')}client/arena.html?map=crossroads${ARENA}`, 'ma');
  await ma.waitForSelector('#online', { state: 'visible', timeout: 60000 });
  await Promise.all([ma.waitForURL(/arena\.html\?room=/, { timeout: 30000 }), ma.click('#online')]);
  let sm = null;
  await until(async () => playing(sm = await stateOf(ma)) && sm.pool?.id && sm.hashes.length > 0, 60000, 500);
  const mroom = sm?.pool?.id;
  const minfo = mroom ? await ask(null, { method: 'GET', path: `rooms/${mroom}` }) : {};
  check('the arena\'s page on a site map goes online: a room on the site\'s wasm and that map', playing(sm) && !sm.pool.local
    && minfo.json?.game === 'arena' && minfo.json.map === 'crossroads' && minfo.json.map_sha256 === mapSha && /^online room /.test(sm.line || ''), JSON.stringify({ pool: sm?.pool, line: sm?.line, room: minfo.json }));
  const minvite = sm?.pool?.invite || '';
  check('its invite keeps the map', minvite === `${site('m1')}client/arena.html?room=${mroom}&map=crossroads`, minvite);
  const mb = await open(`${minvite}${ARENA}`, 'mb');
  let smb = null;
  await until(async () => playing(smb = await stateOf(mb)) && smb.pool?.id && smb.hashes.length > 4, 60000, 500);
  check('a page opened from it lands in the same room', playing(smb) && smb.pool.id === mroom && !smb.pool.why && smb.slot !== sm.slot, JSON.stringify(smb && { slot: smb.slot, pool: smb.pool }));
  await sleep(8000);
  [sm, smb] = [await stateOf(ma), await stateOf(mb)];
  const mgrade = grader((sm?.hashes || []).map(([t, h]) => [t, h]))(smb?.hashes);
  const mst = minfo.json?.url ? statusOf(portOf(minfo.json.url)) : null;
  check('the two step the same world, and the referee on the map agrees', mgrade.compared >= 4 && mgrade.wrong === 0 && mst?.hashes_checked > 0 && mst.hashes_differed === 0 && mst.referee_errors === 0,
    JSON.stringify({ grade: mgrade, status: mst }));
  await ma.context().close();
  await mb.context().close();
  await refuse('a map for a game that takes none', { site: site('m1'), game: 'fireplace', map: 'crossroads' }, 400, /only arena and flight take a map/);
  await refuse('a map named as a path', { site: site('m1'), game: 'arena', map: '../x' }, 400, /a map's name as the site publishes it/);
  await refuse('a map the site doesn\'t publish', { site: site('m1'), game: 'arena', map: 'nowhere' }, 502, /nowhere\.qgmap: HTTP 404/);
  await refuse('a map map_load refuses', { site: site('warped'), game: 'arena', map: 'crossroads' }, 422, /map crossroads: the map was refused/);
  await refuse('a page whose map is not the site\'s', { site: site('m1'), game: 'arena', map: 'crossroads', map_sha256: '0'.repeat(64) }, 409, /map crossroads is not the one/);
  check('the map\'s room closes once empty', await until(() => pool.rooms.size === 0, 40000), String(pool.rooms.size));

  // the caps: one copy's rooms (per_site_rooms 1), then the pool's (max_rooms 2)
  const golf = await ask({ site: site('p1'), game: 'golf' });
  check('a copy gets a room', golf.status === 200 && golf.json.game === 'golf', golf.text);
  await refuse('a copy with per_site_rooms open', { site: site('p1'), game: 'arena' }, 503, /has 1 room open, the most one copy may/);
  const bumper = await ask({ site: site('p2'), game: 'bumper' });
  check('another copy gets one', bumper.status === 200 && bumper.json.game === 'bumper', bumper.text);
  await refuse('a pool with max_rooms open', { site: site('p3'), game: 'party' }, 503, /the pool is full: 2 rooms open/);
  const share = await ask({ site: site('p3'), game: 'golf' });
  check('a copy with the same wasm as an open room joins it, over no cap', share.status === 200 && share.json.room === golf.json.room, share.text);
  check('the pool says what it holds', (await ask(null, { method: 'GET', path: '' })).json?.rooms === 2);
} catch (e) {
  report.errors.push(String(e?.stack || e));
  check('the gate ran to its end', false, String(e?.stack || e));
} finally {
  await browser.close();
  await pool.close();
  pages.close();
}
check('no errors on the pages', report.errors.length === 0, report.errors.join(' | '));
check('a closed pool leaves no status behind', !existsSync(statusDir) || readdirSync(statusDir).filter((f) => f.endsWith('.json')).length === 0);

report.pass = failed.length === 0;
writeFileSync('traces/kit-rooms.json', JSON.stringify(report, null, 2) + '\n');
console.log(failed.length ? `\nKIT-ROOMS gate: FAIL (${failed.length})` : '\nKIT-ROOMS gate: PASS');
process.exit(failed.length ? 1 : 0);
