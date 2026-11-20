#!/usr/bin/env node
// Fireplace's coin, ready to create on pump.fun (docs/coin.md): its sheet,
// coin/fireplace.json, checked against the create form's rules, and its
// pictures drawn here in code like the rest of the game: three drafts of the
// coin's picture at 1024 px (ink corners, so pump.fun's circle and its
// rounded square both hold), the 1500 x 500 banner and the 1600 x 900 launch
// post, those two over the living room from the couch (client/room.html, as
// tools/theme-shots.mjs shoots it). The pixels are the TV's: its 3x5 font,
// its fire's colours, Grandma's brick.
//   node tools/coin.mjs            check the sheet, then draw every picture into coin/art/
//   node tools/coin.mjs --check    the sheet only (test/coin.test.mjs runs the same check)
//   node tools/coin.mjs --pick b   draft b is the coin's picture (coin/art/fireplace-coin.png)
// The name, ticker, description, picture and links are welded at the create:
// a wrong one is a second coin, so change them here first. coin/ has the shape
// of Elo Pros' launch kit (scry-forge deploy/pumpfun) and copies over it.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT } from '../client/font.mjs';
import { isWallet } from '../client/shop.mjs';
import { isMain } from './main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DIR = join(ROOT, 'coin');
export const SHEET = join(DIR, 'fireplace.json');
export const SIZES = { coin: [1024, 1024], banner: [1500, 500], post: [1600, 900] };

// ---- the sheet

const https = (u) => typeof u === 'string' && /^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/.test(u);
const picture = (p) => typeof p === 'string' && /\.(png|jpe?g|gif|webp)$/i.test(p);

// Every reason the sheet cannot be typed into the create form, in plain words;
// [] when it can. The kit's own check for a game's coin quoted in PROS
// (scry-forge deploy/pumpfun/lib/sheet.mjs, problems(sheet, { kind: 'pair' })),
// mirrored so a mistake shows here first, and two rules of ours on top: the
// ticker fits the daily pot's (meter/daily_pot.py, 2 to 10), and the
// description names no figure, since it can never be corrected.
export function problems(sheet) {
  const out = [], s = sheet || {};
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 32) out.push('name is 1 to 32 characters');
  if (typeof s.symbol !== 'string' || !/^[A-Z0-9]{2,10}$/.test(s.symbol)) out.push('symbol is 2 to 10 capital letters or digits, bare: no $');
  if (typeof s.description !== 'string' || !s.description.trim() || s.description.length > 1000) out.push('description is 1 to 1000 characters');
  else if (/[%$]|\d/.test(s.description)) out.push('description names no figure (a share, a price, a pot): it is welded, and those change');
  if (!picture(s.image)) out.push('image is a path to a png, jpg, gif or webp');
  if (s.banner !== undefined && !picture(s.banner)) out.push('banner, if set, is a path to a png, jpg, gif or webp');
  const links = s.links || {};
  if (typeof links !== 'object' || Array.isArray(links)) out.push('links is an object');
  else for (const k of Object.keys(links)) {
    if (!['website', 'twitter', 'telegram'].includes(k)) out.push(`links takes website, twitter and telegram, not ${k}`);
    else if (!https(links[k])) out.push(`links.${k} is an https:// address`);
  }
  if (s.mayhem_mode !== false) out.push('mayhem_mode must be false: mayhem mode doubles the supply');
  if (!Number.isSafeInteger(s.buy_tokens) || s.buy_tokens <= 0 || s.buy_tokens > 793_100_000) out.push('buy_tokens is a whole number of coins, 1 to 793,100,000 (what the curve sells)');
  if (!isWallet(s.creator)) out.push('creator is the wallet that creates the coin, a Solana address');
  if (!Number.isInteger(s.priority_fee_cap) || s.priority_fee_cap < 0) out.push('priority_fee_cap is a whole number');
  if (s.creator_fee_bps !== undefined && (!Number.isInteger(s.creator_fee_bps) || s.creator_fee_bps < 0 || s.creator_fee_bps > 10_000)) out.push('creator_fee_bps is the coin\'s own creator fee in basis points');
  return out;
}

// ---- the pixels

// the TV's card and title (client/room.mjs), its fire (client/room-render.mjs cardFire), Grandma's room (client/themes/grandma.json)
export const INK = '#10141f', INK_DEEP = '#080a10', GOLD = '#ffcf6a', BONE = '#c9b89a', WHITE = '#ffffff';
const LIME = '#b8ff38', ELO_INK = '#0a0c0a'; // Elo Pros' mark, as on its other coins
const PAL = {
  r: '#d8461a', o: '#ff9a2a', y: '#ffe9a0', w: '#fff6d0', // the fire, out to in
  b: '#5a3416', d: '#3d2112', l: '#8a5a2c', // a log, its shade and its cut end; the mantel is the shade
  B: '#8c3824', C: '#a2452c', D: '#742c1c', k: '#150d0c', h: '#736e66', // brick, three of it, the firebox, the hearth's slab
  p: '#f26b14', q: '#c9530c', c: '#4d591a', // a pumpkin, its rib and its cap
  m: '#fff6e8', s: '#e6d3b6', g: '#e2a04e', t: '#a8642a', e: '#2a1a12', n: '#f2a59a', // a marshmallow: its white, its shade, toasted, burnt, its face, a cheek
};

// A bitmap of palette letters as rectangles, s px to the cell, its top left at (x, y).
function bitmap(rows, x, y, s) {
  let out = '';
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length;) {
      let n = 1;
      while (row[c + n] === row[c]) n++;
      if (PAL[row[c]]) out += `<rect x="${x + c * s}" y="${y + r * s}" width="${n * s}" height="${s}" fill="${PAL[row[c]]}"/>`;
      c += n;
    }
  });
  return `<g shape-rendering="crispEdges">${out}</g>`;
}
const centred = (rows, cx, y, s) => bitmap(rows, Math.round(cx - (rows[0].length * s) / 2), y, s);

// Capitals in the games' 3x5 font, px to the font's pixel, a character 4 apart
// as on the TV's cards: { svg, w }. anchor is start, middle or end of x.
export function pixelText(text, x, y, px, fill, anchor = 'start') {
  const s = String(text).toUpperCase(), w = (s.length * 4 - 1) * px;
  let x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x, d = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0), bits = code >= 32 && code < 96 ? FONT[code - 32] : 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if ((bits >> (14 - (r * 3 + c))) & 1) d += `M${x0 + c * px} ${y + r * px}h${px}v${px}h${-px}z`;
    x0 += 4 * px;
  }
  return { svg: `<path shape-rendering="crispEdges" fill="${fill}" d="${d}"/>`, w };
}

const FLAME = [
  '.......r.......',
  '.......r.......',
  '......rr.......',
  '......rrr......',
  '.....rrrr..r...',
  '.....rrorr.r...',
  '..r.rrroorrr...',
  '..r.rrooorrr...',
  '..rrrrooyorrr..',
  '.rrrrooyyoorr..',
  '.rrroooyyyorrr.',
  '.rrrooyywyoorr.',
  'rrroooywwyyoorr',
  'rrrooyywwwyoorr',
  '.rrooyywwwyyor.',
  '.rrrooywwwyorr.',
  '..rrooyywyyor..',
];
const LOGS = [
  'lbbbbbbbbbbbbbbbl',
  'lbbdbbbbbbbdbbbbl',
  '.dddddddddddddd..',
];
const MALLOW = [
  '...tttttttt...',
  '..tggggggggt..',
  '.tgmmmmmmmmgt.',
  '.gmmmmmmmmmmg.',
  '.mmmmmmmmmmms.',
  '.mmemmmmmemms.',
  '.mmemmmmmemms.',
  '.mnmemmmemnms.',
  '.mmmmeeemmmms.',
  '.mmmmmmmmmmms.',
  '.gmmmmmmmmmsg.',
  '..gssssssssg..',
  '...tttttttt...',
];
const SPARK = [
  '..r..',
  '.rr..',
  '.ror.',
  'rroyr',
  'royyr',
  '.ryr.',
];
const HEARTH = [
  '......c.......c......',
  '.....pppp...pppp.....',
  '.....pqpp...ppqp.....',
  '.....pqpp...ppqp.....',
  'ddddddddddddddddddddd',
  '.ddddddddddddddddddd.',
  '..BBCBBDBBCBBDBBCBB..',
  '..CBBDBBCBBBBCBBDBB..',
  '..BBkkkkkkkkkkkkkBC..',
  '..DBkkkkkkkkkkkkkBB..',
  '..BCkkkkkkkkkkkkkDB..',
  '..BBkkkkkkkkkkkkkBB..',
  '..CBkkkkkkkkkkkkkBC..',
  '..BDkkkkkkkkkkkkkBB..',
  '..BBkkkkkkkkkkkkkCB..',
  '..DBkkkkkkkkkkkkkBD..',
  '..BCkkkkkkkkkkkkkBB..',
  '.hhhhhhhhhhhhhhhhhhh.',
  'hhhhhhhhhhhhhhhhhhhhh',
];

// Elo Pros' tile at (x, y), side s, on an ink plate when it sits on a picture.
function eloMark(x, y, s, plate = 0) {
  const k = s / 64;
  return (plate ? `<rect x="${x - plate + k}" y="${y - plate + k}" width="${62 * k + 2 * plate}" height="${62 * k + 2 * plate}" rx="${14 * k + plate}" fill="${ELO_INK}"/>` : '')
    + `<g transform="translate(${x} ${y}) scale(${k})"><rect x="1" y="1" width="62" height="62" rx="14" fill="${LIME}"/>`
    + `<path fill="${ELO_INK}" d="M14 26 L32 11 L50 26 L50 35 L32 20 L14 35 Z M14 44 L32 29 L50 44 L50 53 L32 38 L14 53 Z"/></g>`;
}
const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>\n`;

// A coin's ground: ink to the corners, a gold rim, and on its face the fire's
// light from (512, gy) in three flat steps, the way the games' paint has three
// tones. No gradient anywhere, so the file is small and the pixels stay hard.
function coin([face, far, mid, near], gy, body) {
  return svg(1024, 1024, `<rect width="1024" height="1024" fill="${INK_DEEP}"/><circle cx="512" cy="512" r="500" fill="${GOLD}"/><circle cx="512" cy="512" r="474" fill="${INK_DEEP}"/>`
    + `<circle cx="512" cy="512" r="454" fill="${face}"/><g clip-path="url(#in)"><circle cx="512" cy="${gy}" r="400" fill="${far}"/><circle cx="512" cy="${gy}" r="290" fill="${mid}"/>`
    + `<circle cx="512" cy="${gy}" r="180" fill="${near}"/>${body}</g>${eloMark(700, 150, 190, 16)}`, '<clipPath id="in"><circle cx="512" cy="512" r="454"/></clipPath>');
}

// The drafts of the coin's picture, for the operator to pick from: the TV's
// fire on its logs, a toasted marshmallow (what a game pays its top three)
// over it, and the fireplace itself with Grandma's pumpkins on the mantel.
export const DRAFTS = {
  'a-fire': () => coin(['#17111a', '#21161a', '#2e1c1a', '#40251a'], 600, centred(FLAME, 512, 150, 34) + centred(LOGS, 512, 150 + 17 * 34, 34)),
  'b-mallow': () => coin(['#131830', '#1a1f3c', '#272742', '#3a2e44'], 800, `<rect x="495" y="700" width="34" height="150" fill="${PAL.b}"/>`
    + centred(MALLOW, 512, 300, 34) + bitmap(SPARK, 296, 764, 22) + bitmap(SPARK, 618, 764, 22) + centred(SPARK, 512, 792, 26)),
  // the fire stands in the firebox (the hearth's rows 8 to 16), its logs on the slab
  'c-hearth': () => coin(['#14131c', '#1c1820', '#281d20', '#382420'], 660, centred(HEARTH, 512, 260, 30) + centred(FLAME.slice(5), 512, 260 + 17 * 30 - 12 * 20, 20) + centred(LOGS.slice(0, 2), 512, 260 + 17 * 30, 20)),
};
const letter = (k) => Object.keys(DRAFTS).find((d) => d[0] === k);

// ---- the banner and the post: the room behind, the words on the right where the TV was

export const FIRE_MARK = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${17 * s} ${20 * s}" width="${17 * s}" height="${20 * s}">${centred(FLAME, 8.5 * s, 0, s)}${bitmap(LOGS, 0, 17 * s, s)}</svg>`;
export const words = (text, px, fill) => {
  const t = pixelText(text, 0, 0, px, fill);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t.w} ${5 * px}" width="${t.w}" height="${5 * px}" style="display:block">${t.svg}</svg>`;
};
// text broken at spaces into lines of at most n characters
function wrap(text, n) {
  const lines = [];
  for (const word of text.split(' ')) {
    if (lines.length && lines.at(-1).length + 1 + word.length <= n) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}
export const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${INK};position:relative}
.col{position:absolute;display:flex;flex-direction:column;align-items:flex-end}
.by{position:absolute;display:flex;align-items:center;gap:14px}
</style></head><body>${body}</body></html>`;
const elo = (s) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${s}" height="${s}">${eloMark(0, 0, 64)}</svg>`;

// pump.fun's banner: the fire on the left, the title on the right.
export function bannerHtml(room) {
  return page(1500, 500, `<div style="position:absolute;inset:0;background:url(${room}) 50% 60%/1500px auto no-repeat"></div>
<div style="position:absolute;inset:0;background:linear-gradient(270deg,rgba(16,20,31,.98) 0%,rgba(16,20,31,.97) 46%,rgba(16,20,31,.25) 62%,rgba(16,20,31,0) 78%)"></div>
<div class="col" style="right:70px;top:112px"><div style="display:flex;align-items:flex-end;gap:26px">${FIRE_MARK(6)}${words('FIREPLACE', 20, GOLD)}</div>
<div style="margin-top:34px">${words('PARTY GAMES BY THE FIRE - IN YOUR BROWSER', 5, WHITE)}</div>
<div style="margin-top:18px">${words('COME AND GO AS YOU LIKE - UP TO 256 IN A ROOM', 4, BONE)}</div></div>
<div class="by" style="right:70px;bottom:40px">${elo(44)}${words('ELO PROS', 6, WHITE)}</div>`);
}

// The launch post, for X and Telegram. No amounts on it: a pot can change, a
// picture in a feed can't. coin is the picked draft's file.
export function postHtml(room, coin, sheet) {
  const sub = wrap(`${sheet.symbol} is paired against PROS on pump.fun. Play in your browser, finish the day's challenges, earn a share of the daily pot.`, 34);
  return page(1600, 900, `<div style="position:absolute;inset:0;background:url(${room}) center/cover no-repeat"></div>
<div style="position:absolute;inset:0;background:linear-gradient(270deg,rgba(16,20,31,.98) 0%,rgba(16,20,31,.97) 44%,rgba(16,20,31,.3) 58%,rgba(16,20,31,0) 74%)"></div>
<div style="position:absolute;inset:0;background:linear-gradient(0deg,rgba(8,10,16,.55) 0%,rgba(8,10,16,0) 22%)"></div>
<img src="${coin}" style="position:absolute;left:60px;top:36px;width:272px;height:272px;clip-path:circle(48.9%)">
<div class="col" style="right:88px;top:104px">${words('THE COIN OF THE PARTY GAME FIREPLACE', 5, BONE)}
<div style="margin-top:30px;display:flex;align-items:flex-end;gap:24px">${FIRE_MARK(5)}${words(sheet.symbol, 17, GOLD)}</div>
<div style="margin-top:44px">${words('LIVE ON SOLANA', 12, WHITE)}</div>
<div style="margin-top:40px;display:flex;flex-direction:column;align-items:flex-end;gap:14px">${sub.map((l) => words(l, 5, '#e8e2d6')).join('')}</div>
<div style="margin-top:44px;padding:18px 24px;border:4px solid ${GOLD}">${words('ELOPROS.COM/GAMES/FIREPLACE', 5, GOLD)}</div></div>
<div class="by" style="right:88px;bottom:44px">${elo(48)}${words('ELO PROS', 7, WHITE)}</div>`);
}

async function main() {
  const argv = process.argv.slice(2);
  const sheet = JSON.parse(readFileSync(SHEET, 'utf8'));
  const bad = problems(sheet);
  for (const b of bad) console.error(`coin/fireplace.json: ${b}`);
  if (bad.length) process.exit(1);
  console.log(`coin/fireplace.json: ${sheet.name}, ${sheet.symbol}: the create form takes it`);
  if (argv.includes('--check')) return;

  const art = join(DIR, 'art'), drafts = join(art, 'fireplace'), tmp = join(ROOT, 'traces', 'coin');
  for (const d of [drafts, tmp]) mkdirSync(d, { recursive: true });
  const picked = join(DIR, sheet.image);
  const pick = argv.includes('--pick') ? letter(argv[argv.indexOf('--pick') + 1]) : existsSync(picked) ? null : 'a-fire';
  if (argv.includes('--pick') && !pick) throw new Error(`--pick takes ${Object.keys(DRAFTS).map((d) => d[0]).join(', ')}`);

  const require = createRequire(import.meta.url);
  const { chromium } = (() => { for (const n of ['playwright', 'playwright-core']) { try { return require(n); } catch { /* next */ } } throw new Error('playwright not found'); })();
  const { serve } = await import('./serve.mjs');
  const { server, port } = await serve();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'],
  });
  try {
    const tab = await browser.newPage({ deviceScaleFactor: 1 });
    for (const [name, draw] of Object.entries(DRAFTS)) {
      await tab.setViewportSize({ width: 1024, height: 1024 });
      await tab.setContent(`<html><body style="margin:0">${draw()}</body></html>`);
      await tab.screenshot({ path: join(drafts, `coin-${name}.png`) });
      console.log(`coin/art/fireplace/coin-${name}.png`);
    }
    if (pick) { copyFileSync(join(drafts, `coin-${pick}.png`), picked); console.log(`coin/${sheet.image}: draft ${pick[0]}`); }

    // the room from the couch, in Grandma's, as the theme shots take it
    const [W, H] = SIZES.post;
    await tab.goto(`http://127.0.0.1:${port}/client/room.html?present=0&live=0&res=${W}x${H}&theme=grandma`);
    await tab.waitForFunction(() => window.__room?.ready || window.__room?.error, null, { timeout: 120000 });
    const err = await tab.evaluate(() => window.__room.error);
    if (err) throw new Error(err);
    writeFileSync(join(tmp, 'room.png'), Buffer.from(await tab.evaluate(() => window.__room.shot('grandma')), 'base64'));
    copyFileSync(picked, join(tmp, 'coin.png'));

    const shoot = async (name, html, out) => {
      const [w, h] = SIZES[name];
      writeFileSync(join(tmp, `${name}.html`), html);
      await tab.setViewportSize({ width: w, height: h });
      await tab.goto(`file://${join(tmp, `${name}.html`)}`);
      await tab.screenshot({ path: join(DIR, out), type: 'jpeg', quality: 90 });
      console.log(`coin/${out}`);
    };
    await shoot('banner', bannerHtml('room.png'), sheet.banner);
    await shoot('post', postHtml('room.png', 'coin.png', sheet), 'art/fireplace-post.jpg');
  } finally {
    await browser.close();
    server.close();
  }
}

if (isMain(import.meta.url)) await main();
