#!/usr/bin/env node
// The GitHub Pages gate: the static site (tools/site.mjs) as Pages serves it,
// from a plain server that sends no COOP or COEP header, opened in headless
// Chrome with no relay anywhere. Passes when coi.js's service worker made the
// page cross-origin isolated, the site's index opened Fireplace, the room is
// local (client/local.mjs) with its AI guests in, the sim kept stepping
// (interval hashes every 128 ticks) through a switch of games, and Party's own
// page played a local room on the minigame it was asked for, and the map
// editor opened Box Canyon from the site and its compiler took it, then made
// its starter obby, picked a stone of it in the 3D view by clicking it,
// dragged it a grid step or more and had the compiler take that too, and the
// studio built party in the page byte for byte as npm run build does, its
// check played the debug build and found the split hashes equal, and its
// build played in party's page, and the shelf (client/games.html) listed every
// game, minigame, mode and map the lists and maps/ hold, with its pictures,
// its box filtering by name, a pool's room counted on its tile and linked,
// and a tile of each kind (a minigame, an arena mode, a map with a mode of
// its own, a Dogfight mode, golf) opening a page that plays what it says, and
// the pages offering the way back to it. Screenshots go
// to traces/pages-*.png.
//   node net/run-pages.mjs [--seconds 330] [--bots 5] [--mg 0] [--port 0]   (party's three minigames, the first game, take about 220 s)
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';
import { buildSite } from '../tools/site.mjs';
import * as L from '../src/layout.mjs';
import { MODE_NAMES } from '../src/flight-view.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const seconds = Number(opt('seconds', 330));
const nbots = Number(opt('bots', 5));
const mg = Number(opt('mg', 0));
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

execFileSync(process.execPath, ['tools/asm.mjs'], { stdio: 'inherit' });
mkdirSync('traces', { recursive: true });
const { out } = buildSite(resolve('traces/pages-site'));

// a static host like Pages: the files and their types, no isolation headers
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = normalize(join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(out)) { res.writeHead(403).end(); return; }
  try {
    const file = path.endsWith('/') ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(Number(opt('port', 0)), '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const report = { seconds, bots: nbots, mg, screenshots: [], errors: [] };
const watch = (page, label) => {
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { report.errors.push(`${label}: ${m.text()}`); process.stderr.write(`[${label}] ${m.text()}\n`); } });
  page.on('pageerror', (e) => { report.errors.push(`${label}: ${e.message}`); process.stderr.write(`[${label}] ${e.message}\n`); });
};
const shoot = async (page, name) => {
  const png = await page.evaluate(() => window.__qa?.capture?.(2)).catch(() => null);
  if (!png) return;
  const f = `traces/pages-${name}.png`;
  writeFileSync(f, Buffer.from(png, 'base64'));
  report.screenshots.push(f);
};
const t0 = Date.now();
try {
  // Fireplace from the site's front door, a guest at the controls (it sits down by itself)
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const page = await ctx.newPage();
  watch(page, 'fireplace');
  await page.goto(`${base}/?bot=1&present=0&res=320x200&bots=${nbots}`);
  await page.waitForFunction(() => window.crossOriginIsolated && window.__qa?.state, null, { timeout: 30000 });
  report.fireplace = { url: page.url().replace(base, ''), isolated: await page.evaluate(() => window.crossOriginIsolated), controlled: await page.evaluate(() => !!navigator.serviceWorker.controller) };
  let games = new Set(), last = null, shot = 0;
  while (Date.now() - t0 < seconds * 1000) {
    await sleep(1000);
    last = await page.evaluate(() => ({ ...window.__qa.state(), hashes: window.__qa.hashes.length, keys: window.__qa.keys.length }));
    if (last.error) throw new Error(last.error);
    if (last.clState === 2) games.add(last.game);
    process.stderr.write(`\r${((Date.now() - t0) / 1000).toFixed(0)} s  P${last.slot + 1} ${last.gameName} ${last.scene} hashes ${last.hashes}     `);
    if (last.scene === 'in' && Date.now() - shot > 30000) { shot = Date.now(); await shoot(page, `fireplace-${String(Math.round((Date.now() - t0) / 1000)).padStart(3, '0')}s`); }
  }
  process.stderr.write('\n');
  report.fireplace.end = { slot: last.slot, game: last.gameName, games: [...games].map((g) => L.GAMES[g]), scene: last.scene, hashes: last.hashes, keys: last.keys, clState: last.clState, mallows: last.mallows };
  // Party's page, local, on the one minigame asked for
  const party = await ctx.newPage();
  watch(party, 'party');
  await party.goto(`${base}/client/party.html?local=1&mg=${mg}&bot=1&present=0&res=320x200&bots=${nbots}`);
  await party.waitForFunction(() => window.__qa?.state, null, { timeout: 30000 });
  await sleep(15000);
  const ps = await party.evaluate(() => ({ ...window.__qa.state(), hashes: window.__qa.hashes.length }));
  await shoot(party, 'party');
  report.party = { isolated: await party.evaluate(() => window.crossOriginIsolated), hashes: ps.hashes, state: { slot: ps.slot, clState: ps.clState, game: ps.game, name: ps.name } };
  // the map editor from the same site: it opens Box Canyon from maps/ and the build's compiler, in the page, takes it
  const editor = await ctx.newPage();
  watch(editor, 'editor');
  await editor.setViewportSize({ width: 1280, height: 720 }); // wide enough that it opens with its 3D view beside the 2D one
  await editor.goto(`${base}/client/map-editor.html?present=0`);
  await editor.waitForFunction(() => document.querySelector('#foot')?.textContent !== 'loading…', null, { timeout: 30000 });
  // (the page opens Box Canyon by itself too: the one asked for here is in when the map's number has moved on)
  const before = await editor.evaluate(() => window.__ed.st.rev);
  await editor.selectOption('#open', 'canyon');
  // the header's pill turns ok when the map compiles (renderCheck)
  await editor.waitForFunction((r) => window.__ed.st.rev > r && !window.__ed.busy() && document.querySelector('#ready')?.classList.contains('ok'), before, { timeout: 30000 }).catch(() => {});
  report.editor = { checked: await editor.evaluate(() => !!document.querySelector('#ready')?.classList.contains('ok')), foot: await editor.textContent('#foot') };
  // its starter obby, built on in the 3D view: the second stepping stone (the course's box 2) picked by a click on it, then dragged
  await editor.selectOption('#open', 'new-obby');
  await editor.waitForFunction(() => window.__ed.st.spec.name === 'My Obby' && window.__ed.frames() > 0 && !window.__ed.busy(), null, { timeout: 120000 }).catch(() => {});
  const settled = async () => { await sleep(300); await editor.waitForFunction(() => !window.__ed.busy(), null, { timeout: 60000 }).catch(() => {}); };
  await editor.evaluate(() => window.__ed.look({ at: [492, 26, 512], cam: { yaw: -1.1, pitch: -0.6, dist: 34 } }));
  await settled();
  const stone = () => editor.evaluate(() => { const x = window.__ed.boxes().find((q) => q.s === 1 && q.b === 2); return { box: x.box, at: window.__ed.at3([(x.box[0] + x.box[3]) / 2, x.box[4], (x.box[2] + x.box[5]) / 2]) }; });
  const was = await stone();
  await editor.mouse.click(was.at[0], was.at[1]);
  await settled();
  const picked = await editor.evaluate(() => window.__ed.st.sel);
  await editor.mouse.move(was.at[0], was.at[1]);
  await editor.mouse.down();
  for (let i = 1; i <= 5; i++) { await editor.mouse.move(was.at[0] + 10 * i, was.at[1] + 4 * i); await sleep(60); }
  await editor.mouse.up();
  await settled();
  const now = await stone();
  await editor.screenshot({ path: 'traces/pages-editor-obby.png' });
  report.screenshots.push('traces/pages-editor-obby.png');
  report.editor.obby = {
    course: await editor.evaluate(() => [...document.querySelectorAll('ul.course li')].map((l) => `${l.className.trim() || 'ok'}: ${l.textContent}`)),
    picked, from: was.box, to: now.box, error: await editor.evaluate(() => window.__ed.st.error),
    checked: await editor.evaluate(() => !!document.querySelector('#ready')?.classList.contains('ok')),
  };
  // the studio: party assembled in the page, checked, and played from its build
  const studio = await ctx.newPage();
  watch(studio, 'studio');
  await studio.goto(`${base}/client/studio.html?mg=sweep&bots=3&present=0&res=320x200&bot=1`);
  await studio.waitForFunction(() => window.__studio?.st.served.wat, null, { timeout: 30000 });
  await studio.evaluate(() => window.__studio.check());
  report.studio = await studio.evaluate(async () => {
    const hex = async (b) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('');
    const st = window.__studio.st;
    const npm = await (await fetch('../build/party/game.wasm')).arrayBuffer();
    return { built: !!st.built, error: st.buildError || st.checkError, same: !!st.built && (await hex(st.built.bytes)) === (await hex(npm)), ms: st.built?.ms, checked: st.checked };
  });
  await studio.evaluate(() => window.__studio.play());
  const played = await (await studio.waitForSelector('#play iframe')).contentFrame();
  await played.waitForFunction(() => window.__qa?.error || window.__qa?.hashes?.length > 2, null, { timeout: 60000 }).catch(() => {});
  report.studio.played = await played.evaluate(() => (window.__qa?.error ? { error: window.__qa.error } : { hashes: window.__qa?.hashes?.length ?? 0, game: window.__qa?.state?.().game })).catch((e) => ({ error: String(e) }));
  // the way back to the shelf, on the living room and on a game's page
  const backOf = (p) => p.evaluate(() => document.getElementById('shelf-link')?.getAttribute('href') || '').catch(() => '');
  report.back = { fireplace: await backOf(page), party: await backOf(party) };

  // the shelf. What it must list, from the lists themselves and maps/, not from its own catalogue:
  const want = {
    game: [String(JSON.parse(readFileSync(join(out, 'client/kit.json'), 'utf8')).name || 'Fireplace').toUpperCase(), ...L.FP_PLAYS.map((g) => L.GAMES[g])],
    minigame: L.MINIGAMES.map((m) => m.name),
    mode: [...L.MODES.map((m) => m.name), ...L.FLIGHT_MODES.map((k) => MODE_NAMES[k].name)],
    map: readdirSync('maps').filter((m) => existsSync(`maps/${m}/map.json`)).map((m) => JSON.parse(readFileSync(`maps/${m}/map.json`, 'utf8')).name.toUpperCase()),
  };
  // a room pool's list beside the page (net/rooms.mjs), one party room with 3 of 8 in: the tile must count them and link the room
  mkdirSync(join(out, 'rooms'), { recursive: true });
  writeFileSync(join(out, 'rooms/4990.json'), JSON.stringify({ players: 3, max_players: 8 }));
  writeFileSync(join(out, 'rooms/servers.json'), JSON.stringify({ servers: [{ id: 'party-4990', game: 'party', name: 'Room 1', addr: '127.0.0.1:4990', max_players: 8, status_url: `${base}/rooms/4990.json` }] }));
  const shelf = await ctx.newPage();
  watch(shelf, 'shelf');
  await shelf.setViewportSize({ width: 1280, height: 800 });
  await shelf.goto(`${base}/client/games.html`);
  await shelf.waitForFunction(() => window.__shelf?.ready || window.__shelf?.error, null, { timeout: 30000 });
  const tiles = await shelf.evaluate(() => window.__shelf.tiles?.() ?? []);
  const missing = Object.entries(want).flatMap(([kind, names]) => names.filter((n) => !tiles.some((t) => t.kind === kind && t.name === n)).map((n) => `${kind} ${n}`));
  const tile = (id) => tiles.find((t) => t.id === id) || {};
  const snap = async (name) => { const f = `traces/pages-${name}.png`; writeFileSync(f, await shelf.screenshot()); report.screenshots.push(f); };
  await snap('shelf');
  report.shelf = {
    error: await shelf.evaluate(() => window.__shelf.error || null), tiles: tiles.length, missing,
    counts: Object.fromEntries(Object.keys(want).map((k) => [k, tiles.filter((t) => t.kind === k).length])),
    pictures: tiles.filter((t) => t.picture).length,
    // every picture the page names is one the site serves
    picturesServed: await shelf.evaluate(async () => (await Promise.all([...document.images].map((i) => fetch(i.src).then((r) => r.ok && /^image\//.test(r.headers.get('content-type') || ''), () => false)))).every(Boolean)),
    unlined: tiles.filter((t) => !t.line).map((t) => t.id),
    local: tiles.filter((t) => t.id !== 'party' && !/[?&]local=1(&|$)/.test(t.href)).map((t) => t.id),
    live: tile('party').live, liveHref: tile('party').href,
    found: await shelf.evaluate((n) => window.__shelf.filter(n), L.MINIGAMES[mg].name),
    none: await shelf.evaluate(() => window.__shelf.filter('zzzz').length),
  };
  await snap('shelf-found');
  await shelf.evaluate(() => window.__shelf.filter(''));
  // a phone's width: two tiles across, nothing wider than the screen
  await shelf.setViewportSize({ width: 390, height: 844 });
  await sleep(300);
  report.shelf.phone = await shelf.evaluate(() => ({ wide: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth,
    across: new Set([...document.querySelectorAll('#minigames .tile')].slice(0, 6).map((a) => Math.round(a.getBoundingClientRect().left))).size }));
  await snap('shelf-phone');
  await shelf.close();
  // a tile of each kind: its own link, an AI at the controls, must open a page that plays what the tile says
  const RACE = L.FLIGHT_MODES[L.FLIGHT_MODES.length - 1];
  const obby = readdirSync('maps').find((m) => existsSync(`maps/${m}/map.json`) && JSON.parse(readFileSync(`maps/${m}/map.json`, 'utf8')).mode === 'obby');
  // [tile, its page's hook, the minigame or mode its room must be on]
  const plays = [[`mg-${L.MINIGAMES[mg].key}`, '__qa', mg], [`arena-${L.M_CTF}`, '__qa', L.M_CTF], [`map-${obby}`, '__qa', L.M_OBBY], [`flight-${RACE}`, '__qf', RACE], ['golf', '__qa', 0]];
  report.shelf.plays = {};
  for (const [id, hook, k] of plays) {
    const p = await ctx.newPage();
    watch(p, id);
    await p.goto(`${base}/client/${tile(id).href}&bot=1&present=0&res=320x200&music=0&bots=3`);
    // in the room, two intervals hashed, and the game it was asked for on
    const ok = await p.waitForFunction(([h, tid, n]) => {
      const q = window[h];
      if (q?.error) return true;
      if (!q?.state || q.hashes.length < 2) return false;
      const s = q.state();
      return s.clState === 2 && (tid.startsWith('mg-') ? s.game === n : tid === 'golf' ? s.local === true : s.mode?.mode === n);
    }, [hook, id, k], { timeout: 90000 }).then(() => true, () => false);
    const s = await p.evaluate((h) => (window[h]?.error ? { error: window[h].error } : window[h]?.state ? { ...window[h].state(), hashes: window[h].hashes.length } : null), hook).catch(() => null);
    report.shelf.plays[id] = { tile: tile(id).name, href: tile(id).href, ok, hashes: s?.hashes ?? 0, clState: s?.clState, on: s?.game ?? s?.mode?.mode ?? null, error: s?.error || undefined };
    await p.close();
  }
  report.shelf.played = plays.every(([id]) => { const r = report.shelf.plays[id]; return r.ok && !r.error && r.hashes >= 2 && r.clState === 2; });
} catch (e) {
  report.errors.push(String(e?.stack || e));
} finally {
  await browser.close();
  server.close();
}
const f = report.fireplace?.end;
const ps = report.party?.state || {};
const gate = {
  isolated: !!report.fireplace?.isolated && !!report.fireplace?.controlled,
  openedFireplace: !!report.fireplace?.url?.startsWith('/client/fireplace.html'),
  playing: !!f && f.slot === 0 && f.clState === 2 && f.scene !== 'couch',
  stepped: !!f && f.hashes >= Math.floor(((seconds - 15) * 125) / 128) * 0.8,
  switchedGames: seconds < 330 || (f?.games.length ?? 0) >= 2,
  partyLocal: !!report.party?.isolated && report.party.hashes > 0,
  partyOnItsMinigame: ps.game === mg,
  editorOpensAMap: !!report.editor?.checked,
  editorBuildsAnObby: (() => {
    const o = report.editor?.obby;
    return !!o && o.checked && !o.error && o.picked?.kind === 'box' && o.picked.s === 1 && o.picked.b === 2 && (o.to[0] !== o.from[0] || o.to[2] !== o.from[2]) && o.to[1] === o.from[1]
      && o.course.length >= 6 && o.course.every((l) => !/^(bad|warn)/.test(l));
  })(),
  studioBuildsAsNpm: !!report.studio?.same,
  studioChecks: !!report.studio?.checked?.splitEqual && report.studio.checked.scored > 0,
  studioPlays: (report.studio?.played?.hashes ?? 0) > 2,
  shelfListsEverything: !!report.shelf && !report.shelf.error && report.shelf.missing.length === 0
    && report.shelf.counts.minigame === L.MINIGAMES.length && report.shelf.counts.mode === L.MODES.length + L.FLIGHT_MODES.length && report.shelf.unlined.length === 0,
  shelfHasItsPictures: report.shelf?.pictures > 0 && report.shelf.picturesServed,
  shelfFilters: report.shelf?.found.length === 1 && report.shelf.found[0] === `mg-${L.MINIGAMES[mg].key}` && report.shelf.none === 0,
  shelfFitsAPhone: !!report.shelf?.phone && report.shelf.phone.wide <= report.shelf.phone.screen && report.shelf.phone.across === 2,
  shelfTilesAreLocalRooms: report.shelf?.local.length === 0,
  shelfCountsAPoolsRoom: report.shelf?.live?.playing === 3 && report.shelf.liveHref === `party.html?${new URLSearchParams({ url: 'https://127.0.0.1:4990/' })}`,
  shelfTilesPlay: !!report.shelf?.played,
  pagesOfferTheShelf: report.back?.fireplace.endsWith('/client/games.html') && report.back.party.endsWith('/client/games.html'),
  noErrors: report.errors.length === 0,
};
report.gate = { ...gate, pass: Object.values(gate).every(Boolean) };
writeFileSync('traces/pages.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ fireplace: report.fireplace, party: report.party, editor: report.editor, studio: report.studio, back: report.back, shelf: report.shelf, errors: report.errors, gate: report.gate }, null, 2));
console.log(`PAGES gate: ${report.gate.pass ? 'PASS' : 'FAIL'}`);
process.exit(report.gate.pass ? 0 : 1);
