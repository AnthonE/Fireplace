#!/usr/bin/env node
// The phone gate: each game's page in headless Chrome as a phone has it (a
// coarse pointer, touch, sideways), a local room each, played with fingers
// through CDP's touch events, two at once where a thumb would. Passes when, on
// every page, the touch controls are up with the game's buttons and nothing
// keyboard-only, and the confirmed world shows: a thumb on the stick holds
// forward in the player's word and moves them, and nothing once it lifts; a
// drag on the right turns them the way it went, as far as the settings say
// (twice as far at twice the look speed), and with the stick held too; the big
// button does its job (a shot; party's hop) and a drag on it turns the view as
// it goes; the phone turned upright puts up the card asking for it sideways
// and draws the game again at the upright size, and turned back draws it
// sideways again; and no page error. Fireplace sits down with a tap and plays
// whatever is on with the same thumbs. Then the phone leaves the page and comes
// back: a local room is held still while the page is out of view (its tick
// moves on by the time it was in view, not the time it was away), and in a
// relay's room (party's, net/relay.ts) a page whose workers stop for 4 s, as a
// phone stops a page it has put away, is let go by the relay and joins again
// by itself, playing with the same thumbs. And a phone too slow for its
// canvas (each frame made to take 45 ms) draws the game at 0.8 of the size and
// then 0.64, and plays on. Screenshots: traces/touch-*.png (the game under
// its controls); the report: traces/touch.json.
//   node net/run-touch.mjs [--device "Galaxy S24 landscape"] [--only party,arena,flight,golf,fireplace,away,slow] [--no-build]
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serve } from '../tools/serve.mjs';
import { partySeed } from '../tools/genparty.mjs';
import { relay as startRelay, readJson } from './gate.mjs';
import * as L from '../src/layout.mjs';
import { unpackArena } from '../src/arena-view.mjs';
import { unpackInput } from './wire.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const DEVICE = opt('device', 'Galaxy S24 landscape');
const ONLY = opt('only', 'party,arena,flight,golf,fireplace,away,slow').split(',');
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

if (!argv.includes('--no-build')) execFileSync(process.execPath, ['tools/asm.mjs'], { stdio: 'inherit' });
if (ONLY.includes('away')) execFileSync('sh', ['tools/cert.sh'], { stdio: 'inherit' });
mkdirSync('traces', { recursive: true });
const require = createRequire(import.meta.url);
const { chromium, devices } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
const phone = devices[DEVICE];
if (!phone?.hasTouch) throw new Error(`no touch device called ${DEVICE}`);
const { server, port } = await serve();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

// The pages: each one's test hooks and the button its thumb rests on. A
// game's word: the arena's (Dogfight's too) or golf's (party's too).
const ARENA_WORD = (w) => { const a = unpackArena(w); return { yaw: a.yaw, move: a.move, jump: a.jump, shot: a.shot }; };
const GOLF_WORD = (w) => { const g = unpackInput(w); return { yaw: g.yaw, move: g.move, jump: g.jump, shot: g.shot }; };
const PAGES = {
  party: { file: 'party.html', hooks: '__qa', word: GOLF_WORD, big: 'HOP', query: { mg: '9' } }, // COIN RUSH: an open disc
  arena: { file: 'arena.html', hooks: '__qa', word: ARENA_WORD, big: 'FIRE', query: { mode: '0' } },
  flight: { file: 'flight.html', hooks: '__qf', word: ARENA_WORD, big: 'FIRE', query: { mode: '0' } },
  golf: { file: 'golf.html', hooks: '__qa', word: GOLF_WORD, big: 'FIRE' },
  fireplace: { file: 'fireplace.html', hooks: '__qa', big: null },
};
// words a phone's player can't press, which no button or line on a touch page may ask for
const KEYBOARD = /\b(WASD|CLICK|SPACE|TAB)\b|\b[A-Z]: |\bPRESS [A-Z]\b/;

const report = { device: DEVICE, pages: {}, errors: [], failures: [] };
const fail = (page, what) => { report.failures.push(`${page}: ${what}`); process.stderr.write(`FAIL ${page}: ${what}\n`); };
// the shortest way round from yaw a to b, in 1/16384 turns
const turned = (a, b) => ((((b - a) % 16384) + 24576) % 16384) - 8192;

// Fingers on the glass, through CDP: press(id, x, y), drag(id, dx, dy) in steps, lift(id).
function fingers(cdp) {
  const down = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [...down].map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 6, radiusY: 6, force: 1 })),
  });
  return {
    async press(id, x, y) { down.set(id, { x, y }); await send('touchStart'); await sleep(30); },
    async drag(id, dx, dy, steps = 12, ms = 16) {
      const p = down.get(id);
      for (let k = 1; k <= steps; k++) { down.set(id, { x: p.x + dx * k / steps, y: p.y + dy * k / steps }); await send('touchMove'); await sleep(ms); }
    },
    async lift(id) { down.delete(id); await send(down.size ? 'touchMove' : 'touchEnd'); await sleep(30); },
    async tap(x, y) { await this.press(99, x, y); await sleep(60); await this.lift(99); },
  };
}

async function run(name) {
  const P = PAGES[name];
  const ctx = await browser.newContext({ ...phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const f = fingers(cdp);
  const out = { checks: {} };
  report.pages[name] = out;
  const ok = (what, pass, detail = '') => { out.checks[what] = pass ? true : detail || false; if (!pass) fail(name, `${what}${detail ? ` (${detail})` : ''}`); };
  const q = new URLSearchParams({ local: '1', present: '0', bots: '2', ...(P.query || {}) });
  await page.goto(`http://127.0.0.1:${port}/client/${P.file}?${q}`);
  const hooks = P.hooks;
  const state = () => page.evaluate((k) => { const g = window[k]; return g?.error ? { error: g.error } : g?.state ? g.state() : null; }, hooks).catch(() => null);
  const until = async (test, ms, what) => {
    const t0 = Date.now();
    for (;;) {
      const s = await state();
      if (s?.error) throw new Error(`${name}: ${s.error}`);
      if (s && test(s)) return s;
      if (Date.now() - t0 > ms) throw new Error(`${name}: ${what} not within ${ms / 1000} s`);
      await sleep(150);
    }
  };
  const { width: W, height: H } = page.viewportSize();
  const shot = async (file) => {
    const png = await page.evaluate((k) => window[k]?.capture?.(), hooks).catch(() => null);
    if (png) await page.evaluate((png) => {
      const img = Object.assign(document.createElement('img'), { id: 'gate-shot', src: `data:image/png;base64,${png}` });
      Object.assign(img.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', objectFit: 'contain', zIndex: 1, pointerEvents: 'none' });
      document.getElementById('gate-shot')?.remove();
      document.body.appendChild(img);
    }, png);
    await sleep(200);
    await page.screenshot({ path: `traces/touch-${file}.png` });
    await page.evaluate(() => document.getElementById('gate-shot')?.remove());
  };

  try {
    // (Fireplace's room opens as you sit down)
    await until((s) => s.clState === 2 || name === 'fireplace', 60000, 'the room');
    let word = P.word;
    if (name === 'fireplace') {
      // the couch: SIT DOWN AND PLAY (the wardrobe's, up on a phone's couch), and the TV zooms into whatever is on
      await sleep(1500);
      const play = await page.evaluate(() => { const b = document.querySelector('#wardrobe .wd-play'); const r = b && !b.closest('[hidden]') ? b.getBoundingClientRect() : null; return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      ok('sit down and play', !!play);
      await f.tap(play?.x ?? W / 2, play?.y ?? H * 0.15);
      const s = await until((s) => s.scene === 'in' && s.zoom >= 0.999 && s.me, 60000, 'sitting down');
      out.game = s.gameName;
      word = s.game === L.G_ARENA || s.game === L.G_FLIGHT ? ARENA_WORD : GOLF_WORD;
      P.big = { [L.G_ARENA]: 'FIRE', [L.G_FLIGHT]: 'FIRE', [L.G_GOLF]: 'FIRE', [L.G_PARTY]: 'HOP' }[s.game];
    }
    // play on: past a party round's or a match's count in
    const inPlay = (s) => s.me?.live && !s.me?.dead && !s.me?.out && (s.round ?? s.match ?? s.hole ?? { state: s.state }).state === L.H_PLAY;
    await until(inPlay, 60000, 'play');
    await sleep(800);
    const me = async () => { const s = await state(); return { s, w: word(s.me.input >>> 0), pos: s.me.pos, shots: s.me.shots }; };
    const buttons = await page.evaluate(() => [...document.querySelectorAll('.tc-b')].filter((b) => !b.hidden).map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2, big: b.classList.contains('big') };
    }));
    out.buttons = buttons.map((b) => b.label);
    ok('controls up', buttons.length >= 3, out.buttons.join(' '));
    const big = buttons.find((b) => b.big);
    ok('the thumb\'s button', big?.label === P.big, `${big?.label} for ${P.big}`);
    ok('no keys named on a button', !buttons.some((b) => KEYBOARD.test(b.label)), out.buttons.join(' '));

    // the stick: a thumb on the left pushed up holds forward, and moves the player; lifted, nothing
    const before = await me();
    const sx = W * 0.2, sy = H * 0.68;
    await f.press(1, sx, sy);
    await f.drag(1, 0, -50);
    await sleep(1200);
    const held = await me();
    await f.lift(1);
    await sleep(500);
    const after = await me();
    const moved = Math.hypot(held.pos[0] - before.pos[0], held.pos[2] - before.pos[2]);
    ok('stick forward', (held.w.move & 1) === 1 && (held.w.move & 2) === 0, `keys ${held.w.move}`);
    ok('stick moves', moved > 0.3, `${moved.toFixed(2)} m`);
    ok('stick lifted', after.w.move === 0, `keys ${after.w.move}`);
    out.moved = Number(moved.toFixed(2));

    // a drag on the right turns the way it goes; the stick and the drag at once do both
    const look = async (dx, both = false) => {
      const a = await me();
      if (both) { await f.press(1, sx, sy); await f.drag(1, -40, 0, 4); }
      await f.press(2, W * 0.62, H * 0.4);
      await f.drag(2, dx, 0);
      await sleep(400);
      const mid = await me();
      await f.lift(2);
      if (both) await f.lift(1);
      await sleep(500);
      const b = await me();
      return { turn: turned(a.w.yaw, b.w.yaw), keys: mid.w.move };
    };
    const right = await look(120);
    ok('drag turns right', right.turn > 100, `${right.turn}`);
    const left = await look(-120);
    ok('drag turns left', left.turn < -100, `${left.turn}`);
    const both = await look(120, true);
    ok('stick and drag together', (both.keys & 4) === 4 && both.turn > 100, `keys ${both.keys}, turn ${both.turn}`);
    out.turn = right.turn;

    // the big button: its job, and a drag on it turns too
    if (big) {
      const a = await me();
      await f.press(3, big.x, big.y);
      await sleep(250);
      const mid = await me();
      await f.drag(3, -90, 0);
      await sleep(300);
      await f.lift(3);
      await sleep(600);
      const b = await me();
      if (P.big === 'HOP') ok('hop', mid.w.jump === 1, `jump ${mid.w.jump}`);
      else ok('fire', b.w.shot !== a.w.shot || b.shots !== a.shots, `shot ${a.w.shot}->${b.w.shot}, shots ${a.shots}->${b.shots}`);
      ok('aim on the button', turned(a.w.yaw, b.w.yaw) < -60, `${turned(a.w.yaw, b.w.yaw)}`);
    }

    // the settings: twice the look speed turns twice as far
    const gear = buttons.find((b) => b.label === '⚙');
    ok('settings button', !!gear);
    if (gear) {
      await f.tap(gear.x, gear.y);
      await sleep(300);
      const open = await page.evaluate(() => {
        const panel = document.querySelector('.tc-set');
        const r = panel?.querySelector('input[type=range]');
        if (!r) return false;
        r.value = '2';
        r.dispatchEvent(new Event('input'));
        return true;
      });
      ok('settings panel', open);
      const done = await page.evaluate(() => { const b = [...document.querySelectorAll('.tc-set button')].find((b) => b.textContent === 'DONE'); const r = b?.getBoundingClientRect(); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (done) await f.tap(done.x, done.y);
      await sleep(300);
      ok('settings closed', !(await page.evaluate(() => !!document.querySelector('.tc-set'))));
      const fast = await look(120);
      const ratio = fast.turn / right.turn;
      ok('look speed', ratio > 1.6 && ratio < 2.4, ratio.toFixed(2));
      out.speedRatio = Number(ratio.toFixed(2));
      await page.evaluate(() => localStorage.removeItem('fireplace.touch'));
    }
    await shot(`${name}`);

    // the first touch on the game took the whole screen (Android's Chrome has it; a phone's emulation does too),
    // which a viewport can't be resized out of: out of it again, by the settings panel's button
    ok('whole screen on the first touch', await page.evaluate(() => !!document.fullscreenElement));
    await page.evaluate(() => document.exitFullscreen?.()).catch(() => {});
    await sleep(1500);

    // upright: the card, and the game drawn again upright; sideways again: drawn sideways
    const size = () => page.evaluate(() => { const c = [...document.querySelectorAll('canvas')].find((c) => c.offsetWidth > 0); return c ? [c.width, c.height] : null; });
    const wide = await size();
    await page.setViewportSize({ width: H, height: W });
    await sleep(2500);
    const card = await page.evaluate(() => !document.getElementById('turn-card')?.hidden);
    const tall = await size();
    ok('upright card', card);
    ok('drawn upright', tall && tall[1] > tall[0], JSON.stringify(tall));
    await shot(`${name}-upright`);
    await page.setViewportSize({ width: W, height: H });
    await sleep(2500);
    const back = await size();
    ok('card gone sideways', await page.evaluate(() => !!document.getElementById('turn-card')?.hidden));
    ok('drawn sideways again', back && back[0] === wide[0] && back[1] === wide[1], `${JSON.stringify(wide)} -> ${JSON.stringify(back)}`);
    const again = await look(120);
    ok('controls after the turn', again.turn > 100, `${again.turn}`);
    // nothing on the HUD asks for a key, as the page draws it now
    out.state = { clState: (await state())?.clState };
  } catch (e) {
    fail(name, String(e.message || e));
    await shot(`${name}-failed`).catch(() => {});
  }
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  report.errors.push(...errors.map((e) => `${name}: ${e}`));
  await ctx.close();
}

// The phone puts the page away and brings it back. A local room (party's) is held still meanwhile: its tick moves
// on by the time the page was in view. Then a relay's room: the page's workers stopped 4 s (what a phone does to a
// page it put away; the page itself is never hidden here, so it is the workers that go quiet) and the relay lets
// the slot go; the page joins again by itself, a new session, and plays on with the same thumbs.
async function away() {
  const out = { checks: {} };
  report.pages.away = out;
  const ok = (what, pass, detail = '') => { out.checks[what] = pass ? true : detail || false; if (!pass) fail('away', `${what}${detail ? ` (${detail})` : ''}`); };
  const open = async (q) => {
    const ctx = await browser.newContext({ ...phone });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/client/party.html?${new URLSearchParams({ present: '0', ...q })}`);
    const state = () => page.evaluate(() => { const s = window.__qa?.state?.(); return s && { slot: s.slot, clState: s.clState, tick: s.round?.tick, join: s.welcome?.joinTick, error: s.error, input: s.me?.input }; }).catch(() => null);
    const until = async (test, ms, what) => {
      const t0 = Date.now();
      for (let s; ; await sleep(200)) { s = await state(); if (s && test(s)) return s; if (Date.now() - t0 > ms) throw new Error(`${what} not within ${ms / 1000} s`); }
    };
    return { ctx, page, errors, state, until };
  };
  // the page out of view and back, as the browser tells it (headless pages are never hidden of themselves)
  const hide = (page, hidden) => page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  try {
    const local = await open({ local: '1', bots: '2', mg: '9' });
    await local.until((s) => s.clState === 2 && s.tick > 0, 60000, 'the local room');
    const a = await local.state(), ta = Date.now();
    await hide(local.page, true);
    await sleep(3000);
    await hide(local.page, false);
    await sleep(1000);
    const b = await local.state(), tb = Date.now();
    const ran = (b.tick - a.tick) / 125, inView = (tb - ta) / 1000 - 3;
    ok('local room held while away', Math.abs(ran - inView) < 0.6, `${ran.toFixed(2)} s of play in ${inView.toFixed(2)} s in view`);
    ok('local room plays on', b.clState === 2);
    out.localRan = Number(ran.toFixed(2));
    ok('no page errors (local)', local.errors.length === 0, local.errors.slice(0, 2).join(' | '));
    await local.ctx.close();

    const rport = 4700 + Math.floor(Math.random() * 200);
    const summary = 'traces/touch.relay.json';
    const relay = startRelay(summary, ['--port', String(rport), '--native-port', String(rport + 1), '--seed', String(partySeed(7, 9)), '--wasm', 'build/party/game.wasm', '--duration', '120']);
    await sleep(1500);
    const hash = execFileSync('cat', ['certs/hash.txt']).toString().trim();
    const online = await open({ url: `https://127.0.0.1:${rport}/`, hash });
    try {
      const first = await online.until((s) => s.clState === 2 && s.slot >= 0, 60000, 'the relay\'s room');
      const workers = online.page.workers().filter((w) => /\/(net|sim)\.mjs/.test(w.url()));
      ok('the page\'s workers', workers.length === 2, workers.map((w) => w.url()).join(' '));
      await Promise.all(workers.map((w) => w.evaluate(() => { const t = Date.now(); while (Date.now() - t < 4000); })));
      const back = await online.until((s) => s.join !== first.join && s.clState === 2 && s.slot >= 0, 30000, 'joining again');
      ok('joined again', back.join !== first.join && !back.error, `join tick ${first.join} -> ${back.join}${back.error ? `, ${back.error}` : ''}`);
      // the thumbs still drive it: the stick held forward reaches the confirmed world
      const cdp = await online.ctx.newCDPSession(online.page);
      const f = fingers(cdp);
      const { width: W, height: H } = online.page.viewportSize();
      await f.press(1, W * 0.2, H * 0.68);
      await f.drag(1, 0, -50);
      await sleep(1200);
      const held = await online.state();
      await f.lift(1);
      ok('stick after joining again', (GOLF_WORD(held.input >>> 0).move & 1) === 1, `keys ${GOLF_WORD(held.input >>> 0).move}`);
      ok('no page errors (online)', online.errors.length === 0, online.errors.slice(0, 2).join(' | '));
    } finally {
      await online.ctx.close();
      await relay.stop();
    }
    const r = readJson(summary);
    ok('the relay let the quiet page go and took it back', r?.sessions === 2 && r?.leaves?.silent === 1, JSON.stringify({ sessions: r?.sessions, leaves: r?.leaves }));
  } catch (e) {
    fail('away', String(e.message || e));
  }
}

// A phone too slow for the canvas it was given: each frame made to take 45 ms (22 a second), and the game is
// drawn at 0.8 of the size within a few seconds, then 0.64, no smaller, and plays on (client/mobile.mjs frame).
async function slow() {
  const out = { checks: {} };
  report.pages.slow = out;
  const ok = (what, pass, detail = '') => { out.checks[what] = pass ? true : detail || false; if (!pass) fail('slow', `${what}${detail ? ` (${detail})` : ''}`); };
  const ctx = await browser.newContext({ ...phone });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${port}/client/party.html?local=1&present=0&bots=2&fullscreen=0`);
    for (let t0 = Date.now(); !(await page.evaluate(() => window.__qa?.state?.()?.clState === 2).catch(() => false));) {
      if (Date.now() - t0 > 60000) throw new Error('the room not within 60 s');
      await sleep(250);
    }
    const size = () => page.evaluate(() => { const c = document.getElementById('screen'); return [c.width, c.height]; });
    const a = await size();
    await page.evaluate(() => { const busy = () => { const t = performance.now(); while (performance.now() - t < 45); requestAnimationFrame(busy); }; requestAnimationFrame(busy); });
    await sleep(16000);
    const b = await size();
    const k = b[0] / a[0];
    ok('drawn smaller', Math.abs(k - 0.64) < 0.02, `${a.join('x')} -> ${b.join('x')}`);
    ok('plays on', await page.evaluate(() => window.__qa.state().clState === 2));
    out.sizes = [a, b];
  } catch (e) {
    fail('slow', String(e.message || e));
  }
  ok('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

const t0 = Date.now();
try {
  for (const name of ONLY) {
    process.stdout.write(`${name}... `);
    const n = report.failures.length;
    if (name === 'away') await away(); else if (name === 'slow') await slow(); else await run(name);
    console.log(report.failures.length === n ? 'ok' : 'FAILED');
  }
} finally {
  await browser.close();
  server.close();
}
report.seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync('traces/touch.json', JSON.stringify(report, null, 1) + '\n');
for (const [name, p] of Object.entries(report.pages)) console.log(`${name.padEnd(10)} ${Object.entries(p.checks).map(([k, v]) => `${v === true ? '+' : '-'}${k}`).join('  ')}`);
console.log(report.failures.length ? `touch gate FAILED: ${report.failures.length}` : `touch gate passed on ${DEVICE} in ${report.seconds} s`);
process.exit(report.failures.length ? 1 : 0);
