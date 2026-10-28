// The map editor: a map for the arena or Dogfight, drawn from above in the
// browser. It reads and writes what the build reads, a map directory
// (map.json, height.png, surface.png; tools/map.mjs has the format), and runs
// the build's own compiler (tools/map-compile.mjs) on every change, so what
// it calls fine is what `npm run build` takes. The sim never sees the page:
// a map reaches a game by being built in, `node net/play.mjs --arena --map
// <folder>` to play it with bots.
//
// The ground is held as the compiler holds it, a u16 a sample in 1/256 m
// (16-bit height.png, scale 1/256, base 0), with a surface index beside it.
// Work in progress is kept in this browser (localStorage) between visits.
import * as L from '../src/layout.mjs';
import {
  compileSpec, place, placePoint, half, SURFACES, SURFACE_RGB, MATERIALS, WEAPONS, GROUND,
  formatSpec, defaultFlags, defaultBall, defaultHills,
} from '../tools/map-compile.mjs';
import { decode, encode } from '../tools/png-codec.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('view'), ctx = canvas.getContext('2d');
const side = $('side'), foot = $('foot');
const SP = L.SPACING;
const NGATE = L.FLIGHT_CONSTS.NGATE;
const DRAFT = 'fireplace-map-editor';
// the arena renderer's colours (client/arena-render.mjs MATERIAL), 0..255
const MAT_RGB = [[143, 153, 163], [120, 107, 92], [61, 69, 79], [158, 43, 36], [43, 69, 163], [191, 242, 255]];
const TEAM = ['#e0574a', '#4f7fe6', '#9aa0b0'];

const tidy = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inflate = async (z) => new Uint8Array(await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
const deflate = async (raw) => new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

// ---- the map being edited
const st = {
  spec: null, W: 0, H: 0, ox: 0, oz: 0, hgt: null, srf: null, rev: 0,
  folder: 'my-map', dir: null, // a FileSystemDirectoryHandle once saved to or opened from one
  sel: null, tool: 'select', xray: false, dirty: false,
  result: null, error: null,
};
// Each state of the ground gets a number of its own, so undo can tell one
// from another and copy the ground only when it changed.
let revs = 0;
const view = { cx: 512, cz: 512, zoom: 1 }; // world point at the canvas's centre, CSS px a metre

// Take a map: its spec and decoded images, the ground converted to 1/256 m as
// tools/map-compile.mjs converts it, the surface to indices by nearest colour.
function adopt(spec, images, folder, dir = null) {
  const t = spec.terrain || {};
  const img = images.height;
  if (!img) throw new Error('no height image');
  const W = img.width, H = img.height;
  const scale = t.scale ?? (img.depth === 16 ? 1 / 256 : 0.25), base = t.base ?? 0;
  const hgt = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) hgt[i] = clamp(Math.round((base + img.data[i * img.channels] * scale) * 256), 0, 65535);
  const srf = new Uint8Array(W * H);
  const s = images.surface;
  if (s) {
    const pal = palette(t);
    for (let i = 0; i < W * H; i++) {
      const c = s.channels >= 3 ? [0, 1, 2].map((k) => s.data[i * s.channels + k]) : [0, 0, 0].map(() => s.data[i * s.channels]);
      let best = 0, bd = Infinity;
      pal.forEach((p, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } });
      srf[i] = best;
    }
  }
  // from here on the images are what this page writes
  spec.terrain = Object.assign(t, { height: 'height.png', scale: 0.00390625, base: 0, surface: 'surface.png' });
  Object.assign(st, { spec, W, H, ox: t.origin[0], oz: t.origin[1], hgt, srf, folder, dir, sel: null, rev: ++revs });
  undo.length = 0; redo.length = 0;
  paintTerrain();
  fit();
  changed();
  st.dirty = false;
  renderSide();
}

const palette = (t) => SURFACES.map((n) => (t.surfaces && t.surfaces[n]) || SURFACE_RGB[n]);

function surfaceRGB() {
  const pal = palette(st.spec.terrain), rgb = new Uint8Array(st.W * st.H * 3);
  for (let i = 0; i < st.W * st.H; i++) rgb.set(pal[st.srf[i]], 3 * i);
  return rgb;
}

const images = () => ({
  height: { width: st.W, height: st.H, channels: 1, depth: 16, data: st.hgt },
  surface: { width: st.W, height: st.H, channels: 3, depth: 8, data: surfaceRGB() },
});

// ---- the ground: metres at a world point (bilinear, clamped to the images)
function ground(x, z) {
  const fx = clamp((x - st.ox) / SP, 0, st.W - 1), fz = clamp((z - st.oz) / SP, 0, st.H - 1);
  const i = Math.min(Math.floor(fx), st.W - 2), j = Math.min(Math.floor(fz), st.H - 2);
  const u = fx - i, v = fz - j, h = (a, b) => st.hgt[(j + b) * st.W + i + a] / 256;
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
}
function surfaceAt(x, z) {
  const i = Math.round((x - st.ox) / SP), j = Math.round((z - st.oz) / SP);
  return i >= 0 && j >= 0 && i < st.W && j < st.H ? SURFACES[st.srf[j * st.W + i]] : 'mountain';
}
// Where feet at (x, z) stand: the ground, or the highest box top under the
// body no higher than `top` (the sim's $stand; a spawn's or pad's top).
function stand(x, z, top = GROUND) {
  let floor = ground(x, z);
  for (const { box: b } of allBoxes()) if (x - 0.5 < b[3] && x + 0.5 > b[0] && z - 0.5 < b[5] && z + 0.5 > b[2] && b[4] <= top) floor = Math.max(floor, b[4]);
  return floor;
}

// ---- structures: every box in world space, with where it came from
function structBoxes(s, si) {
  const list = s.prefab ? st.spec.prefabs?.[s.prefab] || [] : s.boxes || [];
  const at = s.at || [0, 0, 0], turn = s.turn || 0;
  return list.map((b, bi) => {
    let box;
    try { box = place(b, at, turn); } catch { box = b.slice(0, 6); }
    const name = (s.tint && s.tint[b[6]]) || b[6] || 'metal';
    return { box, mat: Math.max(0, MATERIALS.indexOf(name)), s: si, b: bi };
  });
}
const allBoxes = () => (st.spec.structures || []).flatMap(structBoxes);

// A quarter turn and back, as tools/map-compile.mjs place() turns.
const quarter = (turn) => ((Math.round((turn || 0) / 90) % 4) + 4) % 4;
const rot = ([x, z], q) => [[x, z], [-z, x], [-x, -z], [z, -x]][q];

// Set box b of structure s to a world rectangle (x0, z0, x1, z1), keeping its heights.
function setBoxWorld(s, b, [x0, z0, x1, z1]) {
  const at = s.at || [0, 0, 0], q = (4 - quarter(s.turn)) % 4;
  const a = rot([x0 - at[0], z0 - at[2]], q), c = rot([x1 - at[0], z1 - at[2]], q);
  b[0] = tidy(Math.min(a[0], c[0])); b[2] = tidy(Math.min(a[1], c[1]));
  b[3] = tidy(Math.max(a[0], c[0])); b[5] = tidy(Math.max(a[1], c[1]));
}
const boxList = (s) => (s.prefab ? st.spec.prefabs[s.prefab] : s.boxes);

// Move structure s by (dx, dz) in the world: its "at" if it has one or is a
// prefab, else its boxes and teleporters themselves.
function moveStruct(s, dx, dz) {
  if (s.prefab || s.at || s.turn) {
    const at = s.at || [0, 0, 0];
    s.at = [tidy(at[0] + dx), at[1], tidy(at[2] + dz)];
  } else {
    for (const b of s.boxes) { b[0] = tidy(b[0] + dx); b[3] = tidy(b[3] + dx); b[2] = tidy(b[2] + dz); b[5] = tidy(b[5] + dz); }
    for (const tp of s.teleporters || []) for (const p of [tp.from, tp.to]) { p[0] = tidy(p[0] + dx); p[2] = tidy(p[2] + dz); }
  }
}

// ---- the objectives: what the map says, or the compiler's defaults
const bounds = () => st.spec.bounds;
function flagsNow() {
  if (!st.spec.flags) return defaultFlags(bounds());
  return ['red', 'blue'].map((team) => { const f = st.spec.flags.find((g) => g.team === team); return f ? [f.at[0], f.at[1], f.at[2] ?? GROUND] : [0, 0, GROUND]; });
}
const ballNow = () => (st.spec.ball ? [st.spec.ball.at[0], st.spec.ball.at[1], st.spec.ball.at[2] ?? GROUND] : defaultBall(bounds()));
const hillsNow = () => (st.spec.hills ? st.spec.hills.map((h) => [h.at[0], h.at[1], h.at[2] ?? GROUND, h.radius]) : defaultHills(bounds(), flagsNow()));
// a default, once moved, is written out (with the rest of its kind)
const pt = (p) => (p[2] === GROUND ? [tidy(p[0]), tidy(p[1])] : [tidy(p[0]), tidy(p[1]), p[2]]);
function ensureFlags() { if (!st.spec.flags) st.spec.flags = defaultFlags(bounds()).map((f, k) => ({ team: ['red', 'blue'][k], at: pt(f) })); }
function ensureBall() { if (!st.spec.ball) st.spec.ball = { at: pt(defaultBall(bounds())) }; }
function ensureHills() { if (!st.spec.hills) st.spec.hills = defaultHills(bounds(), flagsNow()).map((h) => ({ at: pt(h), radius: tidy(h[3]) })); }

// ---- selections: what kind, which one, where it is and how it moves
function posOf(sel) {
  const sp = st.spec;
  switch (sel.kind) {
    case 'spawn': return sp.spawns[sel.i];
    case 'pad': return sp.pads[sel.i].at;
    case 'tele': { const p = sp.teleporters[sel.i][sel.end]; return [p[0], p[2]]; }
    case 'flag': return flagsNow()[sel.k];
    case 'ball': return ballNow();
    case 'hill': return hillsNow()[sel.i];
    case 'gate': { const g = sp.race[sel.i]; return [g[0], g[2]]; }
    case 'box': { const s = sp.structures[sel.s]; return s.at ? [s.at[0], s.at[2]] : [0, 0]; }
  }
  return [0, 0];
}
function moveTo(sel, x, z) {
  const sp = st.spec;
  x = tidy(x); z = tidy(z);
  const set2 = (a) => { a[0] = x; a[1] = z; };
  switch (sel.kind) {
    case 'spawn': set2(sp.spawns[sel.i]); break;
    case 'pad': set2(sp.pads[sel.i].at); break;
    case 'tele': {
      const p = sp.teleporters[sel.i][sel.end];
      p[0] = x; p[2] = z; p[1] = tidy(stand(x, z, p[1] + 2) + (sel.end === 'to' ? 0.1 : 0));
      break;
    }
    case 'flag': ensureFlags(); set2(sp.flags.find((f) => f.team === ['red', 'blue'][sel.k]).at); break;
    case 'ball': ensureBall(); set2(sp.ball.at); break;
    case 'hill': ensureHills(); set2(sp.hills[sel.i].at); break;
    case 'gate': { const g = sp.race[sel.i]; g[0] = x; g[2] = z; break; }
  }
}

// Every point on the map that can be picked, as drawn: { sel, x, z }.
function points() {
  const sp = st.spec, out = [];
  (sp.spawns || []).forEach((s, i) => out.push({ sel: { kind: 'spawn', i }, x: s[0], z: s[1] }));
  (sp.pads || []).forEach((p, i) => out.push({ sel: { kind: 'pad', i }, x: p.at[0], z: p.at[1] }));
  (sp.teleporters || []).forEach((t, i) => { out.push({ sel: { kind: 'tele', i, end: 'from' }, x: t.from[0], z: t.from[2] }); out.push({ sel: { kind: 'tele', i, end: 'to' }, x: t.to[0], z: t.to[2] }); });
  flagsNow().forEach((f, k) => out.push({ sel: { kind: 'flag', k }, x: f[0], z: f[1] }));
  const b = ballNow(); out.push({ sel: { kind: 'ball' }, x: b[0], z: b[1] });
  hillsNow().forEach((h, i) => out.push({ sel: { kind: 'hill', i }, x: h[0], z: h[1] }));
  (sp.race || []).forEach((g, i) => out.push({ sel: { kind: 'gate', i }, x: g[0], z: g[2] }));
  return out;
}
const same = (a, b) => a && b && a.kind === b.kind && a.i === b.i && a.k === b.k && a.end === b.end && a.s === b.s && a.b === b.b;

// ---- undo: the spec as text, the ground only when it changed
const undo = [], redo = [];
let pending = false; // a run of edits (a drag, typing in one field) is one step
function snapshot() {
  const last = undo[undo.length - 1];
  const keep = last && last.rev === st.rev;
  return { spec: JSON.stringify(st.spec), rev: st.rev, hgt: keep ? last.hgt : st.hgt.slice(), srf: keep ? last.srf : st.srf.slice(), sel: st.sel };
}
function step() {
  if (pending) return;
  undo.push(snapshot());
  if (undo.length > 60) undo.shift();
  redo.length = 0;
  pending = true;
}
const endStep = () => { pending = false; };
function restore(from, to) {
  const s = from.pop();
  if (!s) return;
  to.push(snapshot());
  st.spec = JSON.parse(s.spec);
  const terrain = s.rev !== st.rev;
  st.hgt.set(s.hgt); st.srf.set(s.srf); st.rev = s.rev;
  st.sel = null;
  if (terrain) paintTerrain();
  changed();
  renderSide();
}

// ---- after any edit: check it, keep a draft, draw
let checkTimer = 0, draftTimer = 0;
function changed() {
  clearTimeout(checkTimer); checkTimer = setTimeout(check, 120);
  clearTimeout(draftTimer); draftTimer = setTimeout(keepDraft, 1000);
  st.dirty = true;
  draw();
}
function check() {
  try { st.result = compileSpec(st.spec, images(), 'map.json'); st.error = null; }
  catch (e) { st.result = null; st.error = String(e.message || e).replace(/^map\.json: /, ''); }
  renderCheck();
}

// ---- the draft, kept in this browser
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function keepDraft() {
  try {
    localStorage.setItem(DRAFT, JSON.stringify({ spec: st.spec, folder: st.folder, W: st.W, H: st.H, hgt: b64(new Uint8Array(st.hgt.buffer)), srf: b64(st.srf) }));
  } catch { /* private window or full: the page works without it */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (!d) return false;
    const hgt = new Uint16Array(unb64(d.hgt).buffer), srf = unb64(d.srf);
    const surf = new Uint8Array(d.W * d.H * 3), pal = palette(d.spec.terrain);
    for (let i = 0; i < srf.length; i++) surf.set(pal[srf[i]], 3 * i);
    adopt(d.spec, { height: { width: d.W, height: d.H, channels: 1, depth: 16, data: hgt }, surface: { width: d.W, height: d.H, channels: 3, depth: 8, data: surf } }, d.folder);
    return true;
  } catch { return false; }
}

// ---- opening and saving
async function openBuiltIn(name) {
  const base = `../maps/${name}/`;
  const spec = await (await fetch(base + 'map.json')).json();
  const t = spec.terrain || {};
  const png = async (f) => decode(await (await fetch(base + f)).arrayBuffer(), inflate);
  const imgs = { height: await png(t.height || 'height.png') };
  if (t.surface) imgs.surface = await png(t.surface);
  adopt(spec, imgs, name === 'canyon' || name === 'skyways' ? `my-${name}` : name);
  say(`opened ${spec.name || name}; saving writes a new folder, so the original stays as it is`);
}

async function openFolder() {
  if (!window.showDirectoryPicker) {
    // without the File System Access API: pick the three files
    const inp = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: '.json,.png' });
    inp.onchange = async () => {
      const by = Object.fromEntries([...inp.files].map((f) => [f.name, f]));
      const spec = JSON.parse(await (by['map.json'] || fail('pick map.json with its images')).text());
      const t = spec.terrain || {};
      const png = async (n) => decode(await (by[n] || fail(`pick ${n} too`)).arrayBuffer(), inflate);
      const imgs = { height: await png(t.height || 'height.png') };
      if (t.surface) imgs.surface = await png(t.surface);
      adopt(spec, imgs, slug(spec.name || 'my-map'));
      say(`opened ${spec.name || 'the map'}`);
    };
    inp.click();
    return;
  }
  const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
  const read = async (n) => (await (await dir.getFileHandle(n)).getFile());
  const spec = JSON.parse(await (await read('map.json')).text());
  const t = spec.terrain || {};
  const png = async (n) => decode(await (await read(n)).arrayBuffer(), inflate);
  const imgs = { height: await png(t.height || 'height.png') };
  if (t.surface) imgs.surface = await png(t.surface);
  adopt(spec, imgs, dir.name, dir);
  say(`opened ${dir.name}/`);
}
const fail = (s) => { throw new Error(s); };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-map';

async function files() {
  return {
    'map.json': new TextEncoder().encode(formatSpec(st.spec)),
    'height.png': await encode({ width: st.W, height: st.H, channels: 1, depth: 16, data: st.hgt }, deflate),
    'surface.png': await encode({ width: st.W, height: st.H, channels: 3, depth: 8, data: surfaceRGB() }, deflate),
  };
}

async function save() {
  try {
    if (!window.showDirectoryPicker) return download();
    if (!st.dir) {
      say(`pick a folder for the map: a new one named ${st.folder} in Fireplace's maps/ makes it playable`);
      st.dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      st.folder = st.dir.name;
    }
    if ((await st.dir.requestPermission?.({ mode: 'readwrite' })) === 'denied') throw new Error('no permission to write there');
    for (const [name, bytes] of Object.entries(await files())) {
      const w = await (await st.dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(bytes);
      await w.close();
    }
    st.dirty = false;
    say(`saved ${st.folder}/: map.json, height.png, surface.png${st.error ? ' (the build will refuse it until the check passes)' : ''}`);
    renderSide();
  } catch (e) {
    if (e.name !== 'AbortError') say(`not saved: ${e.message || e}`);
  }
}
// Sending a map in: the three files downloaded, and GitHub's upload page for
// maps/<folder>/ opened in the repo the map goes to, where dropping them and
// proposing the change makes the pull request (GitHub forks the repo first for
// someone who can't write to it); CI then plays the map (tools/map-check.mjs).
// The repo is client/kit.json's (node tools/kit.mjs init writes a copy's own),
// or the one a GitHub Pages site serves.
const pagesRepo = () => {
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname), name = location.pathname.split('/')[1];
  return m && name ? `${m[1]}/${name}` : '';
};
const mapRepo = fetch(new URL('./kit.json', import.meta.url), { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : {})).then((k) => k.repo || pagesRepo()).catch(() => pagesRepo());
export const uploadUrl = (repo, folder) => `https://github.com/${repo}/upload/main/maps/${encodeURIComponent(folder)}`;

async function sendIn() {
  const repo = await mapRepo;
  if (!repo) { say('this page doesn\'t know which repo its maps go to: set "repo" in client/kit.json'); return; }
  if (st.error) { say(`not yet: the check refuses it (${st.error})`); return; }
  // opened first, while the click still counts as the person's, so it isn't blocked as a pop-up
  window.open(uploadUrl(repo, st.folder), '_blank', 'noopener');
  await download();
  say(`downloaded map.json, height.png and surface.png: drop them on the GitHub page that opened (${repo}, maps/${st.folder}/) and propose the change`);
}

async function download() {
  for (const [name, bytes] of Object.entries(await files())) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes])), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  say(`downloaded map.json, height.png and surface.png: put them in Fireplace's maps/${st.folder}/`);
}

// A new map: flat grass, square, in the middle of the world, a spawn at each end.
function newMap(size) {
  const n = size / SP, o = 512 - size / 2, inset = 16;
  const b = [o + inset, o + size - inset, o + inset, o + size - inset];
  const hgt = new Uint16Array(n * n).fill(20 * 256);
  const surf = new Uint8Array(n * n * 3);
  for (let i = 0; i < n * n; i++) surf.set(SURFACE_RGB.grass, 3 * i);
  const ends = [b[0] + 24, b[1] - 24];
  const spec = {
    name: 'My Map',
    bounds: b,
    terrain: { origin: [o, o], height: 'height.png', scale: 0.00390625, base: 0, surface: 'surface.png' },
    prefabs: {},
    structures: [],
    spawns: ends.flatMap((x) => [[x, 504], [x, 520]]),
  };
  adopt(spec, { height: { width: n, height: n, channels: 1, depth: 16, data: hgt }, surface: { width: n, height: n, channels: 3, depth: 8, data: surf } }, 'my-map');
  say(`a new ${size} m map: raise some ground, add boxes, spawns and pads`);
}

// ---- drawing
const terr = document.createElement('canvas'), tctx = terr.getContext('2d');
// The ground from above: its surface's colour, lit from the north-west, a
// line every 5 m of height.
function paintTerrain() {
  const { W, H, hgt, srf } = st;
  terr.width = W; terr.height = H;
  const im = tctx.createImageData(W, H), d = im.data, pal = palette(st.spec.terrain);
  const h = (i, j) => hgt[clamp(j, 0, H - 1) * W + clamp(i, 0, W - 1)] / 256;
  const lx = -0.55, ly = 0.75, lz = -0.37;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, here = h(i, j);
    const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * SP), dz = (h(i, j + 1) - h(i, j - 1)) / (2 * SP);
    const len = Math.hypot(dx, 1, dz);
    let shade = 0.45 + 0.75 * Math.max(0, (-dx * lx + ly - dz * lz) / len);
    if (Math.floor(here / 5) !== Math.floor(h(i + 1, j) / 5) || Math.floor(here / 5) !== Math.floor(h(i, j + 1) / 5)) shade *= 0.78;
    const c = pal[srf[k]];
    d[4 * k] = Math.min(255, c[0] * shade); d[4 * k + 1] = Math.min(255, c[1] * shade); d[4 * k + 2] = Math.min(255, c[2] * shade); d[4 * k + 3] = 255;
  }
  tctx.putImageData(im, 0, 0);
}

let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; frame(); });
}
const S = (x, z) => [(x - view.cx) * view.zoom + canvas.clientWidth / 2, (z - view.cz) * view.zoom + canvas.clientHeight / 2];
const Wd = (sx, sy) => [(sx - canvas.clientWidth / 2) / view.zoom + view.cx, (sy - canvas.clientHeight / 2) / view.zoom + view.cz];

function frame() {
  const dpr = devicePixelRatio || 1, cw = canvas.clientWidth, ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#161922'; ctx.fillRect(0, 0, cw, ch);
  if (!st.spec) return;
  const z = view.zoom;
  // the world, the images on it, the area outside the bounds dimmed
  const [wx, wy] = S(0, 0); ctx.strokeStyle = '#262c3b'; ctx.strokeRect(wx, wy, L.WORLD * z, L.WORLD * z);
  ctx.imageSmoothingEnabled = z < 2;
  const [ix, iy] = S(st.ox - SP / 2, st.oz - SP / 2);
  ctx.drawImage(terr, ix, iy, st.W * SP * z, st.H * SP * z);
  const b = bounds(), [bx0, bz0] = S(b[0], b[2]), [bx1, bz1] = S(b[1], b[3]);
  ctx.fillStyle = 'rgba(8, 10, 16, 0.55)';
  ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.rect(bx0, bz0, bx1 - bx0, bz1 - bz0); ctx.fill('evenodd');
  ctx.setLineDash([6, 4]); ctx.strokeStyle = '#ffcf5a88'; ctx.strokeRect(bx0, bz0, bx1 - bx0, bz1 - bz0); ctx.setLineDash([]);
  // boxes, low tops first, so a roof covers what is under it (x-ray: outlines only)
  const boxes = allBoxes().sort((a, c) => a.box[4] - c.box[4]);
  for (const x of boxes) {
    const [x0, y0] = S(x.box[0], x.box[2]), [x1, y1] = S(x.box[3], x.box[5]);
    const c = MAT_RGB[x.mat];
    if (!st.xray) { ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.92)`; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    ctx.strokeStyle = st.xray ? `rgb(${c.map((v) => Math.min(255, v + 60)).join(',')})` : 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  }
  // the selected structure, and its box with handles
  if (st.sel?.kind === 'box') {
    const mine = boxes.filter((x) => x.s === st.sel.s);
    ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    for (const x of mine) { const [x0, y0] = S(x.box[0], x.box[2]), [x1, y1] = S(x.box[3], x.box[5]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    ctx.setLineDash([]);
    const one = mine.find((x) => x.b === st.sel.b);
    if (one) {
      const [x0, y0] = S(one.box[0], one.box[2]), [x1, y1] = S(one.box[3], one.box[5]);
      ctx.lineWidth = 2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = '#ffcf5a';
      for (const [hx, hy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) ctx.fillRect(hx - 4, hy - 4, 8, 8);
    }
  }
  // names of structures, when there is room
  if (z > 1.2) {
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = '#e8ebf5'; ctx.textAlign = 'center';
    (st.spec.structures || []).forEach((s, si) => {
      const mine = boxes.filter((x) => x.s === si);
      if (!mine.length) return;
      const cx = (Math.min(...mine.map((x) => x.box[0])) + Math.max(...mine.map((x) => x.box[3]))) / 2;
      const top = Math.min(...mine.map((x) => x.box[2]));
      const [sx, sy] = S(cx, top); ctx.fillText(s.name || `structure ${si}`, sx, sy - 4);
    });
  }
  // teleporters built into structures (moved with them)
  (st.spec.structures || []).forEach((s) => (s.teleporters || []).forEach((tp) => drawTele(placePoint(tp.from, s.at, s.turn), placePoint(tp.to, s.at, s.turn), false)));
  // the race: its gates in order, round again
  const race = st.spec.race || [];
  if (race.length) {
    ctx.strokeStyle = '#ff9f43aa'; ctx.lineWidth = 1.5; ctx.setLineDash([8, 6]);
    ctx.beginPath(); race.forEach((g, i) => { const [x, y] = S(g[0], g[2]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    race.forEach((g, i) => {
      const [x, y] = S(g[0], g[2]);
      ring(x, y, g[3] * z, '#ff9f43', same(st.sel, { kind: 'gate', i }));
      label(x, y, String(i + 1), '#ff9f43');
    });
  }
  // the hills, the skull, the flags
  const defaults = { hills: !st.spec.hills, ball: !st.spec.ball, flags: !st.spec.flags };
  hillsNow().forEach((h, i) => {
    const [x, y] = S(h[0], h[1]);
    if (defaults.hills) ctx.setLineDash([3, 4]);
    ring(x, y, h[3] * z, '#c6e05a', same(st.sel, { kind: 'hill', i }));
    ctx.setLineDash([]);
    label(x, y + 14, `hill ${i + 1}`, '#c6e05a');
  });
  const ball = ballNow(), [bx, by] = S(ball[0], ball[1]);
  dot(bx, by, 6, '#f2f2f2', same(st.sel, { kind: 'ball' }), defaults.ball);
  label(bx, by + 15, 'skull', '#f2f2f2');
  const flags = flagsNow();
  flags.forEach((f, k) => {
    const [x, y] = S(f[0], f[1]);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 12); ctx.stroke();
    ctx.fillStyle = TEAM[k]; ctx.globalAlpha = defaults.flags ? 0.6 : 1; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 12, y - 8); ctx.lineTo(x, y - 4); ctx.fill(); ctx.globalAlpha = 1;
    if (same(st.sel, { kind: 'flag', k })) { ctx.strokeStyle = '#ffcf5a'; ctx.strokeRect(x - 6, y - 15, 22, 25); }
  });
  // teleporters, pads, spawns
  (st.spec.teleporters || []).forEach((tp, i) => drawTele(tp.from, tp.to, true, i));
  ctx.font = 'bold 9px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  (st.spec.pads || []).forEach((p, i) => {
    const [x, y] = S(p.at[0], p.at[1]);
    ctx.fillStyle = '#c9a640'; ctx.fillRect(x - 9, y - 7, 18, 14);
    ctx.fillStyle = '#1a1406'; ctx.fillText(p.weapon.slice(0, 3), x, y + 0.5);
    if (same(st.sel, { kind: 'pad', i })) { ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 2; ctx.strokeRect(x - 11, y - 9, 22, 18); }
  });
  ctx.textBaseline = 'alphabetic';
  (st.spec.spawns || []).forEach((s, i) => {
    const [x, y] = S(s[0], s[1]);
    dot(x, y, 5, TEAM[half(s[0], s[1], flags)], same(st.sel, { kind: 'spawn', i }), false);
  });
  // what the tool is doing
  if (drag?.rect) {
    const [x0, y0] = S(drag.rect[0], drag.rect[1]), [x1, y1] = S(drag.rect[2], drag.rect[3]);
    ctx.strokeStyle = '#ffcf5a'; ctx.setLineDash([4, 3]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
  }
  if (drag?.line) {
    const [x0, y0] = S(drag.line[0], drag.line[1]), [x1, y1] = S(drag.line[2], drag.line[3]);
    ctx.strokeStyle = '#5ae0e0'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  if (BRUSH[st.tool] && hover) {
    const [x, y] = S(hover[0], hover[1]);
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, radius() * z, 0, 7); ctx.stroke();
  }
}
function ring(x, y, r, color, on) {
  ctx.strokeStyle = on ? '#ffcf5a' : color; ctx.lineWidth = on ? 2.5 : 1.5;
  ctx.beginPath(); ctx.arc(x, y, Math.max(r, 4), 0, 7); ctx.stroke();
  ctx.fillStyle = color; ctx.fillRect(x - 2, y - 2, 4, 4);
}
function dot(x, y, r, color, on, faint) {
  ctx.globalAlpha = faint ? 0.6 : 1;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = on ? '#ffcf5a' : '#0b0d14'; ctx.lineWidth = on ? 2.5 : 1.5; ctx.stroke();
  ctx.globalAlpha = 1;
}
function label(x, y, s, color) {
  if (view.zoom < 0.9) return;
  ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function drawTele(from, to, mine, i) {
  const [x0, y0] = S(from[0], from[2]), [x1, y1] = S(to[0], to[2]);
  ctx.strokeStyle = mine ? '#5ae0e0' : '#5ae0e088'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
  const onA = mine && same(st.sel, { kind: 'tele', i, end: 'from' }), onB = mine && same(st.sel, { kind: 'tele', i, end: 'to' });
  ring(x0, y0, 7, '#5ae0e0', onA);
  ctx.fillStyle = onB ? '#ffcf5a' : '#5ae0e0';
  ctx.beginPath(); ctx.moveTo(x1, y1 - 6); ctx.lineTo(x1 + 6, y1); ctx.lineTo(x1, y1 + 6); ctx.lineTo(x1 - 6, y1); ctx.fill();
}

function fit() {
  const b = bounds(), cw = canvas.clientWidth || 800, ch = canvas.clientHeight || 600;
  view.cx = (b[0] + b[1]) / 2; view.cz = (b[2] + b[3]) / 2;
  view.zoom = Math.min(cw / (b[1] - b[0] + 40), ch / (b[3] - b[2] + 40));
  draw();
}

// ---- tools
const TOOLS = [
  ['select', 'V', 'pick and drag anything; drag a box to move its structure, a corner to size it; Alt-drag moves one box'],
  ['raise', 'R', 'raise the ground (Shift lowers)'],
  ['lower', 'L', 'lower the ground'],
  ['flatten', 'F', 'pull the ground to the height where the stroke began'],
  ['smooth', 'M', 'smooth the ground'],
  ['paint', 'P', 'paint what the ground is'],
  ['box', 'B', 'drag out a box: a wall, a floor, a roof (its heights in the panel)'],
  ['spawn', 'S', 'click to add a spawn point'],
  ['pad', 'W', 'click to add a weapon pad'],
  ['teleporter', 'T', 'drag from the pad to where it sends you'],
  ['hill', 'H', 'click to add a hill for King of the Hill'],
  ['gate', 'G', 'click to add a race gate (Dogfight\'s Ring Race), in order'],
];
const BRUSH = { raise: 1, lower: 1, flatten: 1, smooth: 1, paint: 1 };
const radius = () => Number($('radius').value);
const strength = () => Number($('strength').value) / 100;
const snapTo = (v) => { const s = Number($('snap').value); return tidy(Math.round(v / s) * s); };

function setTool(t) {
  st.tool = t;
  for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === t);
  $('brush').hidden = !BRUSH[t];
  $('surface').hidden = t !== 'paint';
  $('placing').hidden = t !== 'box' && t !== 'pad';
  $('material').hidden = t !== 'box';
  $('weapon').hidden = t !== 'pad';
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  draw();
}

// The brush, once a frame while held: metres a second at the centre, falling
// off to nothing at the rim.
function brush(x, z, dt, shift) {
  const r = radius(), k = strength(), { W, H, hgt, srf } = st;
  const i0 = Math.max(0, Math.floor((x - r - st.ox) / SP)), i1 = Math.min(W - 1, Math.ceil((x + r - st.ox) / SP));
  const j0 = Math.max(0, Math.floor((z - r - st.oz) / SP)), j1 = Math.min(H - 1, Math.ceil((z + r - st.oz) / SP));
  const tool = st.tool === 'raise' && shift ? 'lower' : st.tool;
  const src = tool === 'smooth' ? hgt.slice() : null;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(st.ox + i * SP - x, st.oz + j * SP - z) / r;
    if (d >= 1) continue;
    const w = 0.5 + 0.5 * Math.cos(Math.PI * d), n = j * W + i;
    if (tool === 'paint') { srf[n] = Number($('surface').value); continue; }
    let h = hgt[n] / 256;
    if (tool === 'raise') h += w * k * 12 * dt;
    else if (tool === 'lower') h -= w * k * 12 * dt;
    else if (tool === 'flatten') h += (drag.level - h) * Math.min(1, w * k * 8 * dt);
    else if (tool === 'smooth') {
      let sum = 0, c = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < W && jj < H) { sum += src[jj * W + ii]; c++; } }
      h += (sum / c / 256 - h) * Math.min(1, w * k * 10 * dt);
    }
    hgt[n] = clamp(Math.round(h * 256), 0, 65535);
  }
  st.rev = ++revs;
  paintTerrain();
}

// What is under a screen point: a point (spawn, pad, ...) within reach, else
// the boxes there, top first (clicking again in the same spot goes down one).
function pickPoint(sx, sy) {
  let best = null, bd = 10;
  for (const p of points()) { const [x, y] = S(p.x, p.z), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = p.sel; } }
  return best;
}
function pickBox(sx, sy) {
  const [x, z] = Wd(sx, sy);
  const under = allBoxes().filter((b) => x >= b.box[0] && x <= b.box[3] && z >= b.box[2] && z <= b.box[5]).sort((a, c) => c.box[4] - a.box[4]);
  if (!under.length) return null;
  const k = under.findIndex((b) => same(st.sel, { kind: 'box', s: b.s, b: b.b }));
  const b = k >= 0 && lastClick && Math.hypot(lastClick[0] - sx, lastClick[1] - sy) < 3 ? under[(k + 1) % under.length] : under[0];
  return { kind: 'box', s: b.s, b: b.b };
}
// a corner handle of the selected box
function grabCorner(sx, sy) {
  if (st.sel?.kind === 'box') {
    const one = allBoxes().find((x) => x.s === st.sel.s && x.b === st.sel.b);
    if (one) {
      for (const [cx, cz] of [[0, 2], [3, 2], [0, 5], [3, 5]]) {
        const [x, y] = S(one.box[cx], one.box[cz]);
        if (Math.abs(x - sx) < 7 && Math.abs(y - sy) < 7) return { corner: [cx, cz], box: one.box.slice() };
      }
    }
  }
  return null;
}
// an edge of the bounds
function grabEdge(sx, sy) {
  const b = bounds(), [x0, y0] = S(b[0], b[2]), [x1, y1] = S(b[1], b[3]);
  const inZ = sy > y0 - 6 && sy < y1 + 6, inX = sx > x0 - 6 && sx < x1 + 6;
  if (inZ && Math.abs(sx - x0) < 5) return { edge: 0 };
  if (inZ && Math.abs(sx - x1) < 5) return { edge: 1 };
  if (inX && Math.abs(sy - y0) < 5) return { edge: 2 };
  if (inX && Math.abs(sy - y1) < 5) return { edge: 3 };
  return null;
}

let drag = null, hover = null, lastClick = null, space = false;
const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!st.spec) return;
  canvas.setPointerCapture(e.pointerId);
  const [sx, sy] = local(e), [x, z] = Wd(sx, sy);
  if (e.button === 1 || e.button === 2 || space) { drag = { pan: [sx, sy, view.cx, view.cz] }; return; }
  if (e.button !== 0) return;
  const t = st.tool;
  if (t === 'select') {
    // the edit's undo step is taken when it first moves, so a click is not one
    const h = grabCorner(sx, sy) || (!pickPoint(sx, sy) && grabEdge(sx, sy));
    if (h) { drag = { ...h, start: [x, z], fresh: true }; return; }
    const sel = pickPoint(sx, sy) || pickBox(sx, sy);
    lastClick = [sx, sy];
    st.sel = sel;
    renderSide();
    draw();
    if (!sel) { drag = { pan: [sx, sy, view.cx, view.cz] }; return; }
    if (sel.kind === 'box') {
      const s = st.spec.structures[sel.s];
      drag = { box: sel, start: [x, z], moved: [0, 0], one: e.altKey ? boxList(s)[sel.b].slice() : null, fresh: true };
    } else {
      const p = posOf(sel);
      drag = { point: sel, start: [x, z], from: [p[0], p[1]], fresh: true };
    }
    return;
  }
  if (BRUSH[t]) {
    step();
    drag = { brush: true, at: [x, z], level: ground(x, z), shift: e.shiftKey, t: performance.now() };
    brush(x, z, 1 / 60, e.shiftKey);
    requestAnimationFrame(brushLoop);
    return;
  }
  if (t === 'box') { drag = { rect: [snapTo(x), snapTo(z), snapTo(x), snapTo(z)] }; return; }
  if (t === 'teleporter') { drag = { line: [snapTo(x), snapTo(z), snapTo(x), snapTo(z)] }; return; }
  step();
  add(t, snapTo(x), snapTo(z));
  endStep();
});
function brushLoop(now) {
  if (!drag?.brush) return;
  const dt = Math.min(0.1, (now - drag.t) / 1000);
  drag.t = now;
  brush(drag.at[0], drag.at[1], dt, drag.shift);
  draw();
  requestAnimationFrame(brushLoop);
}
canvas.addEventListener('pointermove', (e) => {
  if (!st.spec) return;
  const [sx, sy] = local(e), [x, z] = Wd(sx, sy);
  hover = [x, z];
  status(x, z);
  if (!drag) { if (BRUSH[st.tool]) draw(); return; }
  if (drag.pan) {
    const [px, py, cx, cz] = drag.pan;
    view.cx = cx - (sx - px) / view.zoom; view.cz = cz - (sy - py) / view.zoom;
  } else if (drag.brush) {
    drag.at = [x, z];
  } else if (drag.rect || drag.line) {
    const r = drag.rect || drag.line;
    r[2] = snapTo(x); r[3] = snapTo(z);
  } else if (drag.fresh && Math.hypot(x - drag.start[0], z - drag.start[1]) * view.zoom < 3) {
    return; // not a drag yet
  } else if (drag.fresh) {
    drag.fresh = false;
    step();
  }
  if (drag.pan || drag.brush || drag.rect || drag.line) {
    // done above
  } else if (drag.point) {
    moveTo(drag.point, snapTo(drag.from[0] + x - drag.start[0]), snapTo(drag.from[1] + z - drag.start[1]));
    changed();
  } else if (drag.box) {
    const s = st.spec.structures[drag.box.s];
    const dx = snapTo(x - drag.start[0]), dz = snapTo(z - drag.start[1]);
    if (drag.one) {
      const b = boxList(s)[drag.box.b], w = place(drag.one, s.at || [0, 0, 0], s.turn || 0);
      setBoxWorld(s, b, [w[0] + dx, w[2] + dz, w[3] + dx, w[5] + dz]);
    } else {
      moveStruct(s, dx - drag.moved[0], dz - drag.moved[1]);
      drag.moved = [dx, dz];
    }
    changed();
  } else if (drag.corner) {
    const s = st.spec.structures[st.sel.s], b = boxList(s)[st.sel.b], w = drag.box.slice();
    w[drag.corner[0]] = snapTo(x); w[drag.corner[1]] = snapTo(z);
    if (w[0] !== w[3] && w[2] !== w[5]) setBoxWorld(s, b, [w[0], w[2], w[3], w[5]]);
    changed();
  } else if (drag.edge !== undefined) {
    st.spec.bounds[drag.edge] = snapTo(drag.edge < 2 ? x : z);
    changed();
  }
  draw();
});
const release = () => {
  if (!drag) return;
  if (drag.rect) {
    const [a, b, c, d] = drag.rect;
    if (Math.abs(c - a) >= 0.5 && Math.abs(d - b) >= 0.5) { step(); addBox(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)); }
  } else if (drag.line) {
    const [a, b, c, d] = drag.line;
    if (Math.hypot(c - a, d - b) >= 2) { step(); addTeleporter(a, b, c, d); }
  } else if (drag.brush) {
    changed();
  }
  const wasEdit = !drag.pan;
  drag = null;
  endStep();
  if (wasEdit) renderSide();
  draw();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [sx, sy] = local(e), [x, z] = Wd(sx, sy);
  view.zoom = clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), 0.2, 40);
  const [x2, z2] = Wd(sx, sy);
  view.cx += x - x2; view.cz += z - z2;
  draw();
}, { passive: false });
new ResizeObserver(() => draw()).observe(canvas);

function status(x, z) {
  if (performance.now() - saidAt < 4000) return;
  const hint = TOOLS.find((t) => t[0] === st.tool)?.[2] || '';
  foot.textContent = `x ${x.toFixed(1)}  z ${z.toFixed(1)}  ground ${ground(x, z).toFixed(2)} m, ${surfaceAt(x, z)}  ·  ${hint}`;
}
let saidAt = -1e9;
function say(s) { foot.textContent = s; saidAt = performance.now(); }

// ---- adding things
function add(kind, x, z) {
  const sp = st.spec;
  if (kind === 'spawn') { (sp.spawns ||= []).push([x, z]); st.sel = { kind: 'spawn', i: sp.spawns.length - 1 }; }
  if (kind === 'pad') { (sp.pads ||= []).push({ weapon: $('weapon').value, at: [x, z] }); st.sel = { kind: 'pad', i: sp.pads.length - 1 }; }
  if (kind === 'hill') { ensureHills(); sp.hills.push({ at: [x, z], radius: 6 }); st.sel = { kind: 'hill', i: sp.hills.length - 1 }; }
  if (kind === 'gate') { (sp.race ||= []).push([x, tidy(ground(x, z) + 25), z, 12]); st.sel = { kind: 'gate', i: sp.race.length - 1 }; }
  changed();
  renderSide();
}
// A new box standing on the ground, 3 m tall, in the selected hand-built
// structure if there is one, else a structure of its own.
function addBox(x0, z0, x1, z1) {
  const sp = st.spec;
  let lo = Infinity;
  for (let x = x0; x <= x1 + 1e-6; x += Math.max(0.5, (x1 - x0) / 8)) for (let z = z0; z <= z1 + 1e-6; z += Math.max(0.5, (z1 - z0) / 8)) lo = Math.min(lo, ground(x, z));
  const y0 = tidy(Math.floor((lo - 0.2) * 10) / 10), mat = $('material').value;
  const cur = st.sel?.kind === 'box' ? sp.structures[st.sel.s] : null;
  sp.structures ||= [];
  let si;
  if (cur && !cur.prefab && !cur.turn) {
    si = st.sel.s;
  } else {
    sp.structures.push({ name: `structure ${sp.structures.length + 1}`, boxes: [] });
    si = sp.structures.length - 1;
  }
  const s = sp.structures[si], at = s.at || [0, 0, 0];
  s.boxes.push([tidy(x0 - at[0]), tidy(y0 - at[1]), tidy(z0 - at[2]), tidy(x1 - at[0]), tidy(y0 + 3 - at[1]), tidy(z1 - at[2]), mat]);
  st.sel = { kind: 'box', s: si, b: s.boxes.length - 1 };
  changed();
  renderSide();
}
function addTeleporter(x0, z0, x1, z1) {
  (st.spec.teleporters ||= []).push({ from: [x0, tidy(stand(x0, z0, 1e9)), z0], to: [x1, tidy(stand(x1, z1, 1e9) + 0.1), z1], radius: 1.2 });
  st.sel = { kind: 'tele', i: st.spec.teleporters.length - 1, end: 'from' };
  changed();
  renderSide();
}

function remove() {
  const sel = st.sel, sp = st.spec;
  if (!sel || sel.kind === 'flag' || sel.kind === 'ball') return; // they stay: move them
  step();
  switch (sel.kind) {
    case 'spawn': sp.spawns.splice(sel.i, 1); break;
    case 'pad': sp.pads.splice(sel.i, 1); break;
    case 'tele': sp.teleporters.splice(sel.i, 1); break;
    case 'hill': ensureHills(); if (sp.hills.length > 1) sp.hills.splice(sel.i, 1); break;
    case 'gate': sp.race.splice(sel.i, 1); if (!sp.race.length) delete sp.race; break;
    case 'box': {
      const s = sp.structures[sel.s];
      if (s.prefab) sp.structures.splice(sel.s, 1);
      else { s.boxes.splice(sel.b, 1); if (!s.boxes.length) sp.structures.splice(sel.s, 1); }
      break;
    }
  }
  endStep();
  st.sel = null;
  changed();
  renderSide();
}
function duplicate() {
  const sel = st.sel, sp = st.spec;
  if (!sel) return;
  step();
  const off = 4;
  if (sel.kind === 'spawn') { const s = sp.spawns[sel.i]; sp.spawns.push([tidy(s[0] + off), s[1], ...s.slice(2)]); st.sel = { kind: 'spawn', i: sp.spawns.length - 1 }; }
  else if (sel.kind === 'pad') { const p = sp.pads[sel.i]; sp.pads.push({ ...p, at: [tidy(p.at[0] + off), ...p.at.slice(1)] }); st.sel = { kind: 'pad', i: sp.pads.length - 1 }; }
  else if (sel.kind === 'hill') { ensureHills(); const h = sp.hills[sel.i]; sp.hills.push({ ...h, at: [tidy(h.at[0] + off), ...h.at.slice(1)] }); st.sel = { kind: 'hill', i: sp.hills.length - 1 }; }
  else if (sel.kind === 'gate') { const g = sp.race[sel.i]; sp.race.splice(sel.i + 1, 0, [tidy(g[0] + 3 * off), g[1], g[2], g[3]]); st.sel = { kind: 'gate', i: sel.i + 1 }; }
  else if (sel.kind === 'box') {
    const s = JSON.parse(JSON.stringify(sp.structures[sel.s]));
    s.name = `${s.name || 'structure'} copy`;
    moveStruct(s, 4 * off, 0);
    sp.structures.push(s);
    st.sel = { kind: 'box', s: sp.structures.length - 1, b: sel.b };
  }
  endStep();
  changed();
  renderSide();
}

// ---- the panel
function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids) e.append(k);
  return e;
}
const h3 = (s) => el('h3', { textContent: s });
const hint = (s) => el('p', { className: 'hint', textContent: s });
// a number field: typing in it is one undo step; blank gives `blank` if allowed
function num(label, get, set, { blank, stepBy = 0.1 } = {}) {
  const v = get();
  const inp = el('input', { type: 'number', step: stepBy, value: v === undefined || v === null ? '' : v });
  if (blank !== undefined) inp.placeholder = blank;
  inp.oninput = () => {
    if (inp.value === '' && blank === undefined) return;
    const n = inp.value === '' ? undefined : Number(inp.value);
    if (n !== undefined && !Number.isFinite(n)) return;
    step(); set(n); changed();
  };
  inp.onchange = () => { endStep(); renderSide(); };
  return el('span', {}, el('label', { textContent: label + ' ' }), inp);
}
function pick1(options, value, set) {
  const s = el('select');
  for (const o of options) s.append(el('option', { value: o, textContent: o, selected: o === value }));
  s.onchange = () => { step(); set(s.value); endStep(); changed(); renderSide(); };
  return s;
}
const row = (...kids) => el('div', { className: 'row' }, ...kids);
const btn = (s, f, title = '') => el('button', { textContent: s, onclick: f, title });

let checkBox = null;
function renderSide() {
  if (!st.spec) return;
  const sp = st.spec;
  side.replaceChildren();
  // the map
  side.append(h3('The map'));
  const name = el('input', { type: 'text', value: sp.name || '' });
  name.oninput = () => { step(); sp.name = name.value; changed(); };
  name.onchange = endStep;
  side.append(row(el('label', { textContent: 'name' }), name));
  // the credit when it's merged (tools/elo.mjs makes it a mod in elo.json)
  const text = (k, label, size) => {
    const i = el('input', { type: 'text', value: sp[k] || '', maxLength: size });
    i.oninput = () => { step(); if (i.value.trim()) sp[k] = i.value.trim(); else delete sp[k]; changed(); };
    i.onchange = endStep;
    return row(el('label', { textContent: label }), i);
  };
  side.append(text('by', 'by', 39), hint('Your GitHub login: the credit on the store when the map is merged.'));
  side.append(text('about', 'about', 200));
  const folder = el('input', { type: 'text', value: st.folder });
  folder.onchange = () => { st.folder = slug(folder.value); folder.value = st.folder; if (st.dir && st.dir.name !== st.folder) st.dir = null; renderSide(); };
  side.append(row(el('label', { textContent: 'folder' }), folder));
  side.append(hint(`ground: ${st.W} x ${st.H} samples, ${st.W * SP} x ${st.H * SP} m from ${st.ox}, ${st.oz}. Beyond it the game raises mountains.`));
  const b = sp.bounds;
  side.append(hint('Where fighters can go (drag its edges too):'));
  side.append(row(...['x0', 'x1', 'z0', 'z1'].map((n, k) => num(n, () => b[k], (v) => { b[k] = v; }, { stepBy: 1 }))));
  side.append(row(num('ceiling', () => sp.ceiling, (v) => { if (v === undefined) delete sp.ceiling; else sp.ceiling = v; }, { blank: `auto${st.result ? ` (${st.result.ceiling})` : ''}`, stepBy: 1 })));
  side.append(row(el('label', { textContent: 'x-ray' }), Object.assign(el('input', { type: 'checkbox', checked: st.xray, title: 'X' }), { onchange: (e) => { st.xray = e.target.checked; draw(); } })));

  // the selection
  const sel = st.sel;
  if (sel) side.append(...selectionPanel(sel));
  else side.append(h3('Nothing picked'), hint('Pick something with the select tool (V), or add with the tools above. Drag with the right button (or Space) to pan; the wheel zooms; 0 fits the map.'));

  // the check
  side.append(h3('Check'));
  checkBox = el('div');
  side.append(checkBox);
  renderCheck();

  // playing it
  const f = st.folder, race = (sp.race || []).length;
  side.append(h3('Play it'));
  side.append(hint(`Save into Fireplace's maps/${f}/ (or download the files and put them there), then from the repo:`));
  side.append(el('p', {}, el('code', { textContent: `node net/play.mjs --arena --map ${f}` })));
  if (race) side.append(el('p', {}, el('code', { textContent: `node net/play.mjs --flight --mode ${L.FLIGHT_CONSTS.M_RACE} --map ${f}` })), hint('flies its Ring Race.'));
  side.append(hint('Open the URL it prints: that is your map with bots on it. --bots N for more, --mode k for one mode (5 Capture the Flag, 6 Oddball, 7 King of the Hill).'));
  side.append(h3('Send it in'));
  side.append(hint('To have it played for everyone: send it in downloads the three files and opens GitHub\'s upload page for this folder. Drop them there and propose the change; that is the pull request, and CI plays the map with AI fighters. CONTRIBUTING.md, "A map", has the rest.'));
  side.append(row(btn('send it in', sendIn, 'download the files and open GitHub\'s upload page'), btn('download the files', download)));
}

function selectionPanel(sel) {
  const sp = st.spec, out = [];
  const del = (s = 'delete') => btn(s, remove, 'Delete');
  const topRow = (arr, k) => row(
    num('top', () => (arr[k] === undefined || arr[k] === GROUND ? undefined : arr[k]), (v) => { if (v === undefined) arr.length = k; else arr[k] = v; }, { blank: 'the ground' }),
    btn('on the box here', () => { step(); arr[k] = tidy(stand(arr[0], arr[1], 1e9) + 0.05); endStep(); changed(); renderSide(); }, 'stand on the highest box under it'),
  );
  const stands = (p) => hint(`stands at ${stand(p[0], p[1], p[2] ?? GROUND).toFixed(2)} m (the ground there: ${ground(p[0], p[1]).toFixed(2)} m)`);
  const xz = (arr) => row(num('x', () => arr[0], (v) => { arr[0] = v; }), num('z', () => arr[1], (v) => { arr[1] = v; }));
  switch (sel.kind) {
    case 'spawn': {
      const s = sp.spawns[sel.i];
      out.push(h3(`Spawn ${sel.i + 1} of ${sp.spawns.length}`), xz(s), topRow(s, 2), stands(s));
      out.push(hint(`On ${['red', 'blue', 'neither'][half(s[0], s[1], flagsNow())]}'s half: the nearer flag decides. Each team needs one.`), row(del(), btn('duplicate', duplicate, 'Ctrl+D')));
      break;
    }
    case 'pad': {
      const p = sp.pads[sel.i];
      out.push(h3(`Weapon pad ${sel.i + 1}`), row(el('label', { textContent: 'weapon' }), pick1(Object.keys(WEAPONS), p.weapon, (v) => { p.weapon = v; })), xz(p.at), topRow(p.at, 2), stands(p.at), row(del(), btn('duplicate', duplicate)));
      break;
    }
    case 'tele': {
      const t = sp.teleporters[sel.i];
      const xyz = (a, n) => row(el('label', { textContent: n }), ...['x', 'y', 'z'].map((c, k) => num(c, () => a[k], (v) => { a[k] = v; })));
      out.push(h3(`Teleporter ${sel.i + 1}`), xyz(t.from, 'from'), xyz(t.to, 'to'), row(num('radius', () => t.radius ?? 1.2, (v) => { t.radius = v; })));
      out.push(hint('One way: step on the pad, come out at the other end. y is where the feet are.'), row(del()));
      break;
    }
    case 'flag': {
      const team = ['red', 'blue'][sel.k];
      const f = sp.flags?.find((g) => g.team === team);
      out.push(h3(`${team}'s flag`));
      if (f) out.push(xz(f.at), topRow(f.at, 2), stands(f.at));
      else out.push(hint('Where the compiler puts it by default (an eighth in from each end). Drag it to place it yourself.'));
      out.push(hint('Capture the Flag plays for it; it also decides which half each spawn is on.'));
      break;
    }
    case 'ball': {
      out.push(h3('The skull'));
      if (sp.ball) out.push(xz(sp.ball.at), topRow(sp.ball.at, 2), stands(sp.ball.at));
      else out.push(hint('Mid-field by default. Drag it to place it yourself.'));
      out.push(hint('Where Oddball\'s skull starts.'));
      break;
    }
    case 'hill': {
      const h = sp.hills?.[sel.i];
      out.push(h3(`Hill ${sel.i + 1}`));
      if (h) out.push(xz(h.at), topRow(h.at, 2), row(num('radius', () => h.radius, (v) => { h.radius = v; }, { stepBy: 0.5 })), stands(h.at), row(del(), btn('duplicate', duplicate)));
      else out.push(hint('One of the default hills (the middle, and halfway to each flag). Drag one, or add one, to set them all yourself.'));
      out.push(hint(`King of the Hill moves between them. Up to ${L.NHILL}.`));
      break;
    }
    case 'gate': {
      const g = sp.race[sel.i];
      out.push(h3(`Race gate ${sel.i + 1} of ${sp.race.length}`), row(...['x', 'y', 'z'].map((c, k) => num(c, () => g[k], (v) => { g[k] = v; }))), row(num('radius', () => g[3], (v) => { g[3] = v; }, { stepBy: 0.5 })));
      out.push(hint(`ground here ${ground(g[0], g[2]).toFixed(1)} m${sp.ceiling || st.result ? `, ceiling ${sp.ceiling ?? st.result.ceiling} m` : ''}. Ships fly through them in order, round again.`));
      const swap = (d) => () => { const j = sel.i + d; if (j < 0 || j >= sp.race.length) return; step(); [sp.race[sel.i], sp.race[j]] = [sp.race[j], sp.race[sel.i]]; st.sel = { kind: 'gate', i: j }; endStep(); changed(); renderSide(); };
      out.push(row(btn('earlier', swap(-1)), btn('later', swap(1)), del(), btn('add after', duplicate)));
      break;
    }
    case 'box': {
      const s = sp.structures[sel.s], list = boxList(s), b = list[sel.b];
      const at = s.at || [0, 0, 0];
      out.push(h3(`${s.name || `structure ${sel.s + 1}`}`));
      const nm = el('input', { type: 'text', value: s.name || '' });
      nm.oninput = () => { step(); s.name = nm.value; changed(); };
      nm.onchange = endStep;
      out.push(row(el('label', { textContent: 'name' }), nm));
      if (s.prefab) out.push(hint(`built from the prefab "${s.prefab}" (${list.length} boxes): editing one of its boxes changes every structure built from it.`));
      if (s.prefab || s.at || s.turn) {
        out.push(row(el('label', { textContent: 'at' }), ...['x', 'y', 'z'].map((c, k) => num(c, () => at[k], (v) => { s.at = [...at]; s.at[k] = v; }))));
        out.push(row(el('label', { textContent: 'turn' }), pick1(['0', '90', '180', '270'], String(s.turn || 0), (v) => { s.turn = Number(v); })));
      }
      for (const [from, to] of Object.entries(s.tint || {})) out.push(row(el('label', { textContent: `${from} as` }), pick1(MATERIALS, to, (v) => { s.tint[from] = v; })));
      if (b) {
        const w = place(b, at, s.turn || 0);
        out.push(h3(`Box ${sel.b + 1} of ${list.length}`));
        const setW = (k) => (v) => { const r = place(b, at, s.turn || 0); r[k] = v; if (r[0] < r[3] && r[2] < r[5]) setBoxWorld(s, b, [r[0], r[2], r[3], r[5]]); };
        out.push(row(num('x0', () => tidy(w[0]), setW(0)), num('x1', () => tidy(w[3]), setW(3))));
        out.push(row(num('z0', () => tidy(w[2]), setW(2)), num('z1', () => tidy(w[5]), setW(5))));
        out.push(row(num('bottom', () => tidy(b[1] + at[1]), (v) => { b[1] = tidy(v - at[1]); }), num('top', () => tidy(b[4] + at[1]), (v) => { b[4] = tidy(v - at[1]); })));
        out.push(row(el('label', { textContent: 'material' }), pick1(MATERIALS, b[6] || 'metal', (v) => { b[6] = v; })));
        let lo = Infinity;
        for (let x = w[0]; x <= w[3]; x += Math.max(0.5, (w[3] - w[0]) / 6)) for (let z = w[2]; z <= w[5]; z += Math.max(0.5, (w[5] - w[2]) / 6)) lo = Math.min(lo, ground(x, z));
        out.push(hint(`the ground under it from ${lo.toFixed(2)} m. A fighter walks up a step of ${L.STEP} m; anything higher it jumps or goes round.`));
        out.push(row(btn('sit on the ground', () => { step(); const hgt = b[4] - b[1]; b[1] = tidy(Math.floor((lo - 0.2) * 10) / 10 - at[1]); b[4] = tidy(b[1] + hgt); endStep(); changed(); renderSide(); }), del(s.prefab ? 'delete structure' : 'delete box')));
      }
      out.push(row(btn('duplicate structure', duplicate, 'Ctrl+D'), ...(s.prefab ? [] : [btn('delete structure', () => { step(); sp.structures.splice(sel.s, 1); st.sel = null; endStep(); changed(); renderSide(); })])));
      out.push(hint('Drag to move the whole structure; Alt-drag one box; drag a corner to size it. Click again in the same spot to pick the box under.'));
      break;
    }
  }
  return out;
}

function renderCheck() {
  if (!checkBox || !st.spec) return;
  checkBox.replaceChildren();
  if (st.error) {
    checkBox.append(el('p', { className: 'bad', textContent: st.error }), hint('The build refuses the map until this is fixed.'));
    return;
  }
  const m = st.result;
  if (!m) return;
  const lim = (n, max, what) => `${n} ${what} (of ${max})`;
  checkBox.append(
    el('p', { className: 'ok', textContent: 'The build takes it.' }),
    hint([
      lim(m.boxes.length, L.NBOX, 'boxes') + ' in ' + lim(m.groups.length, L.NGROUP, 'structures'),
      `${lim(m.spawns.length, L.NSPAWN, 'spawns')}: red's half ${m.sides[0]}, blue's ${m.sides[1]}`,
      lim(m.pads.length, L.NPAD, 'weapon pads'),
      lim(m.teleporters.length, L.NTELE, 'teleporters'),
      lim(m.hills.length, L.NHILL, 'hills'),
      m.race.length ? lim(m.race.length, NGATE, 'race gates') : 'no race (Dogfight\'s Ring Race needs 2 gates or more)',
      `ships fly up to ${m.ceiling} m; ${m.bytes.length.toLocaleString()} B in the wasm`,
    ].join(' · ')),
  );
}

// ---- the header
function buildHeader() {
  for (const [t, key, what] of TOOLS) {
    const b = el('button', { textContent: t, title: `${what} (${key})`, onclick: () => setTool(t) });
    b.dataset.tool = t;
    $('tools').append(b);
  }
  SURFACES.forEach((s, k) => $('surface').append(el('option', { value: k, textContent: s })));
  MATERIALS.forEach((m) => $('material').append(el('option', { value: m, textContent: m })));
  Object.keys(WEAPONS).forEach((w) => $('weapon').append(el('option', { value: w, textContent: w })));
  $('open').onchange = async (e) => {
    const v = e.target.value;
    e.target.value = '';
    if (!v || (st.dirty && !confirm('Leave this map? Its changes are not saved.'))) return;
    try {
      if (v === 'new') { const m = prompt('How big, in metres? (a square, 128 to 768)', '384'); if (m) newMap(clamp(Math.round(Number(m) / 8) * 8 || 384, 128, 768)); }
      else if (v === 'folder') await openFolder();
      else if (v) await openBuiltIn(v);
    } catch (err) { if (err.name !== 'AbortError') say(`could not open it: ${err.message || err}`); }
  };
  $('save').onclick = save;
  $('undo').onclick = () => restore(undo, redo);
  $('redo').onclick = () => restore(redo, undo);
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' || e.target instanceof HTMLSelectElement) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? restore(redo, undo) : restore(undo, redo); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); restore(redo, undo); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === ' ') { space = true; canvas.style.cursor = 'grab'; e.preventDefault(); return; }
  if (k === 'delete' || k === 'backspace') { remove(); return; }
  if (k === 'escape') { st.sel = null; setTool('select'); renderSide(); return; }
  if (k === '0' || k === 'home') { fit(); return; }
  if (k === 'x') { st.xray = !st.xray; renderSide(); draw(); return; }
  const t = TOOLS.find((x) => x[1].toLowerCase() === k);
  if (t) setTool(t[0]);
});
addEventListener('keyup', (e) => { if (e.key === ' ') { space = false; setTool(st.tool); } });
addEventListener('beforeunload', keepDraft);

buildHeader();
setTool('select');
const q = new URLSearchParams(location.search);
(async () => {
  try {
    if (q.get('map')) await openBuiltIn(q.get('map'));
    else if (loadDraft()) say('your draft from last time; open… to start another');
    else await openBuiltIn('canyon');
  } catch (e) {
    say(`could not load a map: ${e.message || e}`);
  }
})();
