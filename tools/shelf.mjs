#!/usr/bin/env node
// The shelf's pictures and lines (client/games.html): every tile of the
// catalogue (client/shelf.mjs) opened as its own link opens it, a local room
// with AI players, in Playwright's Chromium on SwiftShader WebGPU with
// ?present=0 and an AI at the controls, played for --wait seconds, its frame
// read back at twice the picture's size, halved and written as
// client/shelf/<id>.webp: 320 x 200, about 10 KB, and the row of main games
// 640 x 400, about 20 KB, for its wide tiles. Fireplace's is the living room
// from the couch. A frame that is near black or near flat is shot again,
// later in the match, and left out if it stays so: the page draws a tile with
// no picture in a colour of its own, with its name. The numbers only catch a
// blank frame; --sheet puts the pictures on sheets to look over, and a poor
// one (the AI facing a wall, or dead) is shot again with --only and another
// --wait. client/shelf/index.json lists the pictures there are and each
// minigame's own line (its client module's hint), which the page reads in
// place of every client/mg/ module. The maps are packed into build/maps/
// first (tools/site.mjs packMaps), which a dev server's shelf lists too.
// Frame rates mean nothing on a software GPU: a tile takes 12 to 35 s, all 79
// about 12 minutes two at a time.
//   node tools/shelf.mjs [--only mg-thinice,arena-5] [--lines: index.json alone, no pictures] [--missing: only tiles with no picture yet]
//                        [--sheet: the pictures shot (all, with no --only) on traces/shelf-sheet-<n>.png, 20 a sheet] [--look: the sheets alone, nothing shot]
//                        [--wait 6: seconds of play first] [--jobs 2] [--quality 0.8] [--port 0]
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../src/layout.mjs';
import { catalogue, tilesOf, hrefOf } from '../client/shelf.mjs';
import { serve } from './serve.mjs';
import { packMaps } from './site.mjs';
import { isMain } from './main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SHELF = join(ROOT, 'client', 'shelf');
export const SIZE = [320, 200];
// a tile's picture, in pixels: the main games' tiles are drawn wide
export const sizeOf = (t) => (t.kind === 'game' ? SIZE.map((v) => v * 2) : SIZE);

// each minigame's line by key: its client module's hint (client/mg/<key>.mjs)
export async function mgLines() {
  const { MG } = await import('../client/mg/index.mjs');
  return Object.fromEntries(L.MINIGAMES.map((m, k) => [m.key, MG[k]?.hint || '']).filter(([, s]) => s));
}

// client/shelf/index.json: the pictures in the folder, and the lines
export async function writeIndex() {
  mkdirSync(SHELF, { recursive: true });
  const shots = readdirSync(SHELF).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
  writeFileSync(join(SHELF, 'index.json'), JSON.stringify({ shots, lines: await mgLines() }, null, 1) + '\n');
  return shots;
}

// What a tile's page is asked for a picture, past its own link: an AI at the
// controls (Fireplace's stays on the couch, the room in view), the frame at
// twice the picture's size.
const shotQuery = (t) => `${t.id === 'fireplace' ? '' : '&bot=1'}&present=0&res=${sizeOf(t).map((v) => v * 2).join('x')}&music=0`;
const hookOf = (t) => (t.page === 'flight.html' ? '__qf' : '__qa');

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const { rows } = packMaps();
  if (argv.includes('--lines')) { console.log(`client/shelf/index.json: ${(await writeIndex()).length} pictures`); return; }
  const wait = Number(opt('wait', 6)), jobs = Number(opt('jobs', 2)), quality = Number(opt('quality', 0.8));
  const only = opt('only', '') ? opt('only', '').split(',') : null;
  const shelf = catalogue({ maps: rows });
  // one picture a shot id: the first tile filed under it
  const tiles = [...new Map(tilesOf(shelf).map((t) => [t.shot, t]).reverse()).values()].reverse()
    .filter((t) => (only ? only.includes(t.shot) : true) && !(argv.includes('--missing') && existsSync(join(SHELF, `${t.shot}.webp`))));
  mkdirSync(SHELF, { recursive: true });

  const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const require = createRequire(import.meta.url);
  const { chromium } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
  const { server, port } = await serve({ port: Number(opt('port', 0)) });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined),
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  // a page with nothing on it, for the canvas: a PNG halved to a WebP, with its mean luma and spread (0-255)
  const bench = await browser.newPage();
  await bench.goto(`http://127.0.0.1:${port}/client/shelf/`).catch(() => {});
  const shrink = (png, [w, h]) => bench.evaluate(async ([b64, w, h, q]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0, sq = 0;
    for (let i = 0; i < d.length; i += 4) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; sum += y; sq += y * y; }
    const n = d.length / 4, mean = sum / n;
    const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: q })).arrayBuffer());
    let bin = '';
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
    return { webp: btoa(bin), mean, spread: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
  }, [png, w, h, quality]);

  let failed = 0;
  async function shoot(t) {
    const page = await browser.newPage({ viewport: { width: sizeOf(t)[0] * 2, height: sizeOf(t)[1] * 2 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t0 = Date.now();
    try {
      const hook = hookOf(t);
      await page.goto(`http://127.0.0.1:${port}/client/${hrefOf(t)}${shotQuery(t)}`);
      await page.waitForFunction((h) => window[h]?.state || window[h]?.error, hook, { timeout: 180000 });
      const err = await page.evaluate((h) => window[h].error, hook);
      if (err) throw new Error(err);
      // in the room and, where a game counts in, in play (H_PLAY), for `wait` seconds; Fireplace's couch needs neither
      const playing = (h) => {
        const s = window[h].state();
        const round = s.round || s.match || s.hole;
        return s.clState === 2 && (!round || round.state === 2);
      };
      if (t.id !== 'fireplace') await page.waitForFunction(playing, hook, { timeout: 120000 }).catch(() => {});
      let got = null;
      for (let tries = 0; tries < 3; tries++) {
        await page.waitForTimeout((t.id === 'fireplace' ? 3 : wait) * 1000);
        const png = await page.evaluate((h) => window[h].capture(1), hook);
        if (!png) continue;
        got = await shrink(png, sizeOf(t));
        if (got.mean > 14 && got.spread > 12) break;
        got.bad = true;
      }
      if (!got || got.bad) throw new Error(got ? `a dark or flat frame (mean ${got.mean.toFixed(0)}, spread ${got.spread.toFixed(0)})` : 'no frame');
      writeFileSync(join(SHELF, `${t.shot}.webp`), Buffer.from(got.webp, 'base64'));
      console.log(`${t.shot}.webp  ${(statSync(join(SHELF, `${t.shot}.webp`)).size / 1024).toFixed(1)} KB  mean ${got.mean.toFixed(0)} spread ${got.spread.toFixed(0)}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (e) {
      failed++;
      rmSync(join(SHELF, `${t.shot}.webp`), { force: true });
      console.error(`${t.shot}: no picture: ${String(e.message || e).split('\n')[0]}${errors.length ? ` [${errors[0]}]` : ''}`);
    } finally { await page.close(); }
  }
  try {
    const queue = argv.includes('--look') ? [] : tiles.slice();
    await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => { for (let t; (t = queue.shift());) await shoot(t); }));
    const shots = await writeIndex();
    const bytes = shots.reduce((n, id) => n + statSync(join(SHELF, `${id}.webp`)).size, 0);
    console.log(`client/shelf: ${shots.length} pictures, ${(bytes / 1024).toFixed(0)} KB; ${tilesOf(shelf).filter((t) => !shots.includes(t.shot)).length} tiles draw their own`);
    // every picture (with --only, those) on a few sheets, to look them over
    if (argv.includes('--sheet') || argv.includes('--look')) {
      mkdirSync(join(ROOT, 'traces'), { recursive: true });
      const seen = only ? shots.filter((id) => only.includes(id)) : shots;
      for (let k = 0; k * 20 < seen.length; k++) {
        const png = await bench.evaluate(async ([ids, w, h]) => {
          const c = new OffscreenCanvas(5 * w, Math.ceil(ids.length / 5) * (h + 14));
          const g = c.getContext('2d');
          g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
          g.font = '11px monospace'; g.fillStyle = '#fff';
          for (let i = 0; i < ids.length; i++) {
            const x = (i % 5) * w, y = Math.floor(i / 5) * (h + 14);
            g.drawImage(await createImageBitmap(await (await fetch(`./${ids[i]}.webp`, { cache: 'no-store' })).blob()), x, y, w, h);
            g.fillText(ids[i], x + 4, y + h + 11);
          }
          const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
          let bin = '';
          for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
          return btoa(bin);
        }, [seen.slice(k * 20, k * 20 + 20), ...SIZE]);
        writeFileSync(join(ROOT, 'traces', `shelf-sheet-${k}.png`), Buffer.from(png, 'base64'));
        console.log(`traces/shelf-sheet-${k}.png`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
