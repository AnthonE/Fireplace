#!/usr/bin/env node
// The shop's pictures (client/shop.mjs, docs/coin.md): each priced look or dress piece close,
// drawn by Party's own renderer on its demo stage (client/party-render-demo.mjs
// `item`, headless Chrome on SwiftShader with ?present=0), 512 px, one JPEG to
// an item, and the collection's picture, all of them in a row. They are what a
// wallet shows for the NFT, so Elo Pros' items kit takes them as they are
// (deploy/solana-items art/fireplace-<key>.jpg, art/fireplace-collection.jpg).
//   node tools/shop-shots.mjs [--out coin/art/items] [--only bee,halo]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { serve } from './serve.mjs';
import { SHOP } from '../client/shop.mjs';
import { FIRE_MARK, INK, GOLD, page, words } from './coin.mjs';
import { isMain } from './main.mjs';

export const SIZE = 512;
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// the collection's picture: the title, and every look in a row under it, the last row in the middle
export function collectionHtml(dir) {
  const gap = 12, per = 7, cell = Math.floor((1024 - 48 - (per - 1) * gap) / per);
  const rows = Array.from({ length: Math.ceil(SHOP.length / per) }, (_, k) => SHOP.slice(k * per, (k + 1) * per));
  const grid = rows.map((row) => `<div style="display:flex;gap:${gap}px;justify-content:center">${row.map((x) => `<img src="${join(dir, `${x.key}.jpg`)}" width="${cell}" height="${cell}" style="border-radius:14px;display:block">`).join('')}</div>`).join(`<div style="height:${gap}px"></div>`);
  return page(1024, 1024, `<div style="position:absolute;inset:0;background:${INK}"></div>
<div style="position:absolute;left:0;right:0;top:44px;display:flex;flex-direction:column;align-items:center;gap:22px">${FIRE_MARK(4)}<div>${words('FIREPLACE ITEMS', 9, GOLD)}</div></div>
<div style="position:absolute;left:0;right:0;top:250px">${grid}</div>`);
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const out = resolve(opt('out', 'coin/art/items'));
  const only = opt('only', '') ? opt('only', '').split(',') : SHOP.map((x) => x.key);
  mkdirSync(out, { recursive: true });
  const require = createRequire(import.meta.url);
  const { chromium } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
  const { server, port } = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined),
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
  });
  let failed = false;
  try {
    const tab = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
    tab.on('pageerror', (e) => { failed = true; process.stderr.write(`[chrome] ${e.message}\n`); });
    await tab.goto(`http://127.0.0.1:${port}/client/party-render-demo.html?present=0&res=${SIZE}x${SIZE}`);
    await tab.waitForFunction(() => window.__demo?.ready || window.__demo?.error, null, { timeout: 120000 });
    const err = await tab.evaluate(() => window.__demo.error);
    if (err) throw new Error(err);
    for (const x of SHOP.filter((i) => only.includes(i.key))) {
      // the stage's frame as a PNG, read back as a JPEG at the same size
      const jpg = await tab.evaluate(async (name) => {
        const r = await window.__demo.shot(name);
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${r.png}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext('2d').drawImage(bmp, 0, 0);
        const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
        const u8 = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
        return btoa(bin);
      }, `item~${x.kind}:${x.key}`);
      writeFileSync(join(out, `${x.key}.jpg`), Buffer.from(jpg, 'base64'));
      console.log(`${join(out, `${x.key}.jpg`)}  ${x.name}`);
    }
    if (only.length === SHOP.length) {
      writeFileSync(join(out, 'collection.html'), collectionHtml(out));
      await tab.setViewportSize({ width: 1024, height: 1024 });
      await tab.goto(`file://${join(out, 'collection.html')}`);
      await tab.screenshot({ path: join(out, 'collection.jpg'), type: 'jpeg', quality: 92 });
      console.log(join(out, 'collection.jpg'));
    }
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
