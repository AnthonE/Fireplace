#!/usr/bin/env node
// The arena's and Dogfight's renderers on a local room (client/local.mjs: no
// relay, AI players), in Playwright's Chromium on SwiftShader WebGPU with
// ?present=0, each view read back with its page's shot() into
// traces/<game>-look-<view>.png. A view is a page and a query: a camera held
// over the map (?cam=), a spectator's, or a bot's own eyes; the room's seed
// is fixed so the match is the same one. board/board.json's arena and
// Dogfight views are these. --scenes shoots the arena renderer's own demo
// page instead (client/arena-render-demo.mjs: fighters held still up close,
// the downed, what the eye holds as hands~<gun>, ~scope its scope, no sim) into
// traces/arena-demo-<scene>.png. Frame times mean nothing on a
// software GPU. --map shoots the arena's views on another map of maps/
// (packed into build/maps/ as net/play.mjs packs one, laid at run time),
// into traces/arena-look-<view>-<map>.png: `behind`, `close` and `far` there are
// the third-person camera's (client/chase.mjs), a bot at the controls.
//   node tools/arena-shot.mjs [--views track,rim,ships] [--scenes figures,teams,effects,downed,hands~sniper [--env dusk]] [--map crossroads] [--res 960x600] [--wait 5: seconds of play first] [--tag name]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import { serve } from './serve.mjs';

// The room every view is shot in.
const SEED = 3163387923;
// name: [the file's game, the page, its query, the hook the page leaves on window]
const VIEWS = {
  track: ['arena', 'arena.html', 'local=1&env=day&cam=440,24,500,20,-6', '__qa'],
  rim: ['arena', 'arena.html', 'local=1&env=day&cam=440,70,470,25,-20', '__qa'],
  yard: ['arena', 'arena.html', 'local=1&env=day&cam=600,26,560,200,-8', '__qa'],
  base: ['arena', 'arena.html', 'local=1&env=day&cam=540,23,480,35,-4', '__qa'],
  sky: ['arena', 'arena.html', 'local=1&env=day&cam=440,24,500,42,24', '__qa'],
  dusk: ['arena', 'arena.html', 'local=1&env=dusk&cam=600,26,560,200,-8', '__qa'],
  night: ['arena', 'arena.html', 'local=1&env=night&cam=440,24,500,20,-6', '__qa'],
  watch: ['arena', 'arena.html', 'local=1&env=day&watch=1', '__qa'],
  eyes: ['arena', 'arena.html', 'local=1&env=day&bot=1', '__qa'],
  behind: ['arena', 'arena.html', 'local=1&env=day&bot=1&view=3', '__qa'],
  close: ['arena', 'arena.html', 'local=1&env=day&bot=1&view=3&dist=2.5', '__qa'],
  far: ['arena', 'arena.html', 'local=1&env=day&bot=1&view=3&dist=12', '__qa'],
  ships: ['flight', 'flight.html', 'local=1&env=day&bot=1', '__qf'],
  'ships-dusk': ['flight', 'flight.html', 'local=1&env=dusk&bot=1', '__qf'],
};
// A view's page, as the board's page.src has it.
const srcOf = (name, res = '960x600') => `${VIEWS[name][1]}?${VIEWS[name][2]}&seed=${SEED}&present=0&res=${res}`;

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const res = opt('res', '960x600');
const [W, H] = res.split('x').map(Number);
const wait = Number(opt('wait', 5));
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// --map: its packed file for the pages' ?map= (the map tools read the disk, so they load only when asked)
let mapName = '', mapQuery = '';
if (opt('map', '')) {
  const { compileMap, mapDir } = await import('./map.mjs');
  const { packMap } = await import('./map-compile.mjs');
  mapName = basename(mapDir(opt('map')));
  mkdirSync('build/maps', { recursive: true });
  writeFileSync(`build/maps/${mapName}.qgmap`, packMap(compileMap(mapDir(opt('map')))));
  mapQuery = `&map=../build/maps/${mapName}.qgmap`;
}

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
const { server, port } = await serve();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined),
  args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
let failed = false;
try {
  mkdirSync('traces', { recursive: true });
  if (opt('scenes', '')) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => { failed = true; process.stderr.write(`[chrome demo] ${e.message}\n`); });
    await page.goto(`http://127.0.0.1:${port}/client/arena-render-demo.html?present=0&res=${res}${opt('env', '') ? `&env=${opt('env')}` : ''}`);
    await page.waitForFunction(() => window.__demo, null, { timeout: 180000 });
    const err = await page.evaluate(() => window.__demo.error);
    if (err) throw new Error(err);
    for (const name of opt('scenes', '').split(',')) {
      const f = `traces/arena-demo-${name}${opt('tag', '') ? `-${opt('tag')}` : ''}.png`;
      writeFileSync(f, Buffer.from(await page.evaluate((n) => window.__demo.shot(n), name), 'base64'));
      console.log(f);
    }
    await page.close();
  }
  for (const name of opt('scenes', '') && !opt('views', '') ? [] : opt('views', 'track,rim,yard,base,sky,ships').split(',')) {
    const [game, , , hook] = VIEWS[name] || [];
    if (!game) throw new Error(`no view ${name}: ${Object.keys(VIEWS).join(', ')}`);
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => { failed = true; process.stderr.write(`[chrome ${name}] ${e.message}\n`); });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/client/${srcOf(name, res)}${game === 'arena' ? mapQuery : ''}`);
    await page.waitForFunction((h) => window[h], hook, { timeout: 180000 });
    const err = await page.evaluate((h) => window[h].error, hook);
    if (err) throw new Error(err);
    const png = await page.evaluate(([h, after]) => window[h].shot('', after), [hook, wait]);
    const f = `traces/${game}-look-${name}${game === 'arena' && mapName ? `-${mapName}` : ''}${opt('tag', '') ? `-${opt('tag')}` : ''}.png`;
    writeFileSync(f, Buffer.from(png, 'base64'));
    console.log(`${f}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
