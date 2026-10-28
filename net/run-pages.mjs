#!/usr/bin/env node
// The GitHub Pages gate: the static site (tools/site.mjs) as Pages serves it,
// from a plain server that sends no COOP or COEP header, opened in headless
// Chrome with no relay anywhere. Passes when coi.js's service worker made the
// page cross-origin isolated, the site's index opened Fireplace, the room is
// local (client/local.mjs) with its AI guests in, the sim kept stepping
// (interval hashes every 128 ticks) through a switch of games, and Party's own
// page played a local room on the minigame it was asked for, and the map
// editor opened Box Canyon from the site and its compiler took it, and the
// studio built party in the page byte for byte as npm run build does, its
// check played the debug build and found the split hashes equal, and its
// build played in party's page. Screenshots go
// to traces/pages-*.png.
//   node net/run-pages.mjs [--seconds 200] [--bots 5] [--mg 0]
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';
import { buildSite } from '../tools/site.mjs';
import * as L from '../src/layout.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const seconds = Number(opt('seconds', 200));
const nbots = Number(opt('bots', 5));
const mg = Number(opt('mg', 0));
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

execFileSync(process.execPath, ['tools/asm.mjs'], { stdio: 'inherit' });
mkdirSync('traces', { recursive: true });
const { out } = buildSite(resolve('traces/pages-site'));

// a static host like Pages: the files and their types, no isolation headers
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = normalize(join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(out)) { res.writeHead(403).end(); return; }
  try {
    const file = path.endsWith('/') ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
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
  await editor.goto(`${base}/client/map-editor.html`);
  await editor.waitForFunction(() => document.querySelector('#foot')?.textContent !== 'loading…', null, { timeout: 30000 });
  await editor.selectOption('#open', 'canyon');
  await editor.waitForFunction(() => /The build takes it/.test(document.querySelector('#side')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
  report.editor = { checked: await editor.evaluate(() => /The build takes it/.test(document.querySelector('#side')?.textContent || '')), foot: await editor.textContent('#foot') };
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
  switchedGames: seconds < 200 || (f?.games.length ?? 0) >= 2,
  partyLocal: !!report.party?.isolated && report.party.hashes > 0,
  partyOnItsMinigame: ps.game === mg,
  editorOpensAMap: !!report.editor?.checked,
  studioBuildsAsNpm: !!report.studio?.same,
  studioChecks: !!report.studio?.checked?.splitEqual && report.studio.checked.scored > 0,
  studioPlays: (report.studio?.played?.hashes ?? 0) > 2,
  noErrors: report.errors.length === 0,
};
report.gate = { ...gate, pass: Object.values(gate).every(Boolean) };
writeFileSync('traces/pages.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ fireplace: report.fireplace, party: report.party, editor: report.editor, studio: report.studio, errors: report.errors, gate: report.gate }, null, 2));
console.log(`PAGES gate: ${report.gate.pass ? 'PASS' : 'FAIL'}`);
process.exit(report.gate.pass ? 0 : 1);
