// The map editor: a map for the arena or Dogfight, drawn from above and
// built in 3D in the browser. It reads and writes what the build reads, a map directory
// (map.json, height.png, surface.png; tools/map.mjs has the format), and runs
// the build's own compiler (tools/map-compile.mjs) on every change, so what
// it calls fine is what `npm run build` takes. The sim never sees the page:
// play it packs the map (packMap) and opens the arena's page on it, a local
// room with AI fighters, which lays it in its sim (map_load); `node
// net/play.mjs --arena --map <folder>` plays a saved one online with bots.
//
// The ground is held as the compiler holds it, a u16 a sample in 1/256 m
// (16-bit height.png, scale 1/256, base 0), with a surface index beside it.
// Work in progress is kept in this browser (localStorage) between visits.
//
// The 3D view is the arena's renderer on the map (client/map-view.mjs), and
// a place to build: a box is picked by the ray through the pointer, dragged
// across the ground, raised, sized by its faces, copied, and given a part
// (what kills, throws, slides, carries, climbs, an obby's checkpoints and
// finish). Its maths, the parts' reading and writing, the course's check
// and the starter obby are client/map-build.mjs, which has no page in it.
import * as L from '../src/layout.mjs';
import {
  compileSpec, place, placePoint, half, SURFACES, SURFACE_RGB, MATERIALS, WEAPONS, GROUND,
  formatSpec, defaultFlags, defaultBall, defaultHills, materialWord, materialOf, packMap, MAP_MODES,
} from '../tools/map-compile.mjs';
import { decode, encode } from '../tools/png-codec.mjs';
import { readRoblox } from '../tools/rbx-file.mjs';
import { robloxToMap } from '../tools/rbx-map.mjs';
import { robloxBrief } from '../tools/rbx-brief.mjs';
import { readVox } from '../tools/vox-file.mjs';
import { voxToMap } from '../tools/vox-map.mjs';
import { zip } from '../tools/zip.mjs';
import { createMapView } from './map-view.mjs';
import {
  orbitEye, screenOf, rayAt, polygonOf, segmentOf, pickRay, rayPlane, rayGround, alongAxis, snap, movedBox, facedBox, dropBox,
  worldBox, setWorldBox, moveOf, movedAt, shifted, readPart, setKind, setPartField, nextStage, beltOf, beltVelocity, beltWorld, beltLocal,
  PART_NAMES, PART_MARK, PART_WHAT, ROBLOX_MOVEMENT, ROBLOX_BODY, ARENA_BODY, needsSides, courseOf, partCounts, starterObby,
} from './map-build.mjs';

const $ = (id) => document.getElementById(id);
const canvas = $('view'), ctx = canvas.getContext('2d');
const side = $('side'), foot = $('foot');
const SP = L.SPACING;
const NGATE = L.FLIGHT_CONSTS.NGATE;
const DRAFT = 'fireplace-map-editor';
// the arena renderer's colours (client/arena-render.mjs MATERIAL), 0..255
const MAT_RGB = [[143, 153, 163], [120, 107, 92], [61, 69, 79], [158, 43, 36], [43, 69, 163], [191, 242, 255], [163, 163, 166]];
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
  size: [4, 1, 4], // the last box touched: what a new one dropped in 3D is sized like
  dup: null, // the last copy made and where its original was: Ctrl+D again repeats the step
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
  Object.assign(st, { spec, W, H, ox: t.origin[0], oz: t.origin[1], hgt, srf, folder, dir, sel: null, dup: null, rev: ++revs, report: null, brief: null });
  asked++;
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
  for (const { box: b, part } of allBoxes()) if (!part?.ghost && x - 0.5 < b[3] && x + 0.5 > b[0] && z - 0.5 < b[5] && z + 0.5 > b[2] && b[4] <= top) floor = Math.max(floor, b[4]);
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
    const m = materialOf(Math.max(0, materialWord(name)));
    return { box, mat: m.look, rgb: m.rgb || MAT_RGB[m.look] || MAT_RGB[0], s: si, b: bi, part: readPart(b[7]) };
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

// Move structure s by (dx, dz), and dy up, in the world: its "at" if it has
// one or is a prefab, else its boxes and teleporters themselves.
function moveStruct(s, dx, dz, dy = 0) {
  if (s.prefab || s.at || s.turn) {
    const at = s.at || [0, 0, 0];
    s.at = [tidy(at[0] + dx), tidy(at[1] + dy), tidy(at[2] + dz)];
  } else {
    for (const b of s.boxes) { b[0] = tidy(b[0] + dx); b[3] = tidy(b[3] + dx); b[2] = tidy(b[2] + dz); b[5] = tidy(b[5] + dz); b[1] = tidy(b[1] + dy); b[4] = tidy(b[4] + dy); }
    for (const tp of s.teleporters || []) for (const p of [tp.from, tp.to]) { p[0] = tidy(p[0] + dx); p[2] = tidy(p[2] + dz); p[1] = tidy(p[1] + dy); }
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

// The flags, the skull and the hills are the team modes': a map that plays one
// mode every match, that mode without sides (an obby), shows only those it wrote.
const sided = () => needsSides(st.spec);
const shown = (k) => sided() || !!st.spec[k];
// Every point on the map that can be picked, as drawn: { sel, x, z }.
function points() {
  const sp = st.spec, out = [];
  (sp.spawns || []).forEach((s, i) => out.push({ sel: { kind: 'spawn', i }, x: s[0], z: s[1] }));
  (sp.pads || []).forEach((p, i) => out.push({ sel: { kind: 'pad', i }, x: p.at[0], z: p.at[1] }));
  (sp.teleporters || []).forEach((t, i) => { out.push({ sel: { kind: 'tele', i, end: 'from' }, x: t.from[0], z: t.from[2] }); out.push({ sel: { kind: 'tele', i, end: 'to' }, x: t.to[0], z: t.to[2] }); });
  if (shown('flags')) flagsNow().forEach((f, k) => out.push({ sel: { kind: 'flag', k }, x: f[0], z: f[1] }));
  const b = ballNow(); if (shown('ball')) out.push({ sel: { kind: 'ball' }, x: b[0], z: b[1] });
  if (shown('hills')) hillsNow().forEach((h, i) => out.push({ sel: { kind: 'hill', i }, x: h[0], z: h[1] }));
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
  // the pick as it was then, if it names a box that is there
  const was = s.sel;
  st.sel = was?.kind === 'box' && boxList(st.spec.structures?.[was.s] || {})?.[was.b] ? was : null;
  st.dup = null;
  if (terrain) paintTerrain();
  changed();
  renderSide();
}

// ---- after any edit: check it, keep a draft, draw
// (while something is dragged the check runs every frame, so the 3D view
// follows the hand; else a moment after the last change)
let checkTimer = 0, draftTimer = 0, checkQueued = false, unchecked = false;
function changed() {
  clearTimeout(checkTimer);
  unchecked = true;
  if (!drag && !drag3?.edit) checkTimer = setTimeout(check, 120);
  else if (!checkQueued) { checkQueued = true; requestAnimationFrame(() => { checkQueued = false; check(); }); }
  clearTimeout(draftTimer); draftTimer = setTimeout(keepDraft, 1000);
  st.dirty = true;
  draw();
}
function check() {
  unchecked = false;
  try { st.result = compileSpec(st.spec, images(), 'map.json'); st.error = null; }
  catch (e) { st.result = null; st.error = String(e.message || e).replace(/^map\.json: /, ''); }
  if (st.result) map3 = true;
  renderCheck();
  draw3();
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
// (a map fetched is dropped if another was asked for or taken meanwhile: the
// page's own first map, still on its way, must not land on one just opened)
let asked = 0;
async function openBuiltIn(name) {
  const base = `../maps/${name}/`, mine = ++asked;
  const spec = await (await fetch(base + 'map.json')).json();
  const t = spec.terrain || {};
  const png = async (f) => decode(await (await fetch(base + f)).arrayBuffer(), inflate);
  const imgs = { height: await png(t.height || 'height.png') };
  if (t.surface) imgs.surface = await png(t.surface);
  if (mine !== asked) return;
  adopt(spec, imgs, ['canyon', 'skyways', 'crossroads', 'obby', 'lifts'].includes(name) ? `my-${name}` : name);
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
// A Roblox place (or model) as a new map, made in the page by
// tools/rbx-map.mjs as tools/roblox.mjs makes it; what it left out or
// changed stays in the check panel. A file with zstd chunks needs the
// command line (Node has zstd; a page doesn't).
async function openRoblox(file) {
  say(`making a map of ${file.name}: a big place takes a few seconds`);
  await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
  const doc = readRoblox(new Uint8Array(await file.arrayBuffer()));
  const name = file.name.replace(/\.rbx[lm]x?$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const out = robloxToMap(doc, { name });
  adopt(out.spec, out.images, slug(name));
  st.report = out.report;
  st.reportFrom = 'From the Roblox place:';
  st.brief = { name: slug(name), ...robloxBrief(doc, { map: out, name }) };
  st.dirty = true;
  renderSide();
  say(`made ${name} from a Roblox place: ${out.report[0]}`);
}
// A MagicaVoxel model as a new map, made by tools/vox-map.mjs as
// tools/vox.mjs makes it.
async function openVox(file) {
  say(`making a map of ${file.name}`);
  await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
  const name = file.name.replace(/\.vox$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const out = voxToMap(readVox(new Uint8Array(await file.arrayBuffer())), { name });
  adopt(out.spec, out.images, slug(name));
  st.report = out.report;
  st.reportFrom = 'From the voxel model:';
  st.dirty = true;
  renderSide();
  say(`made ${name} from a voxel model: ${out.report[0]}`);
}
// a file made into a map by what it is
const IMPORTS = [[/\.rbx[lm]x?$/i, openRoblox], [/\.vox$/i, openVox]];
function openFile(f) {
  const go = IMPORTS.find(([re]) => re.test(f.name))?.[1];
  return go ? go(f).catch((e) => say(`could not make a map of it: ${e.message || e}`)) : say(`${f.name}: not a file the editor makes maps of (.rbxl, .rbxlx, .rbxm, .rbxmx, .vox)`);
}
function pick(accept) {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept });
  inp.onchange = () => inp.files[0] && openFile(inp.files[0]);
  inp.click();
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

// A new obby: the starter course (client/map-build.mjs starterObby), which
// compiles and plays as it is, over flat rock.
function newObby() {
  const { spec, ground: g } = starterObby(), [W, H] = g.size;
  const surf = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) surf.set(SURFACE_RGB[g.surface], 3 * i);
  adopt(spec, { height: { width: W, height: H, channels: 1, depth: 16, data: new Uint16Array(W * H).fill(g.level * 256) }, surface: { width: W, height: H, channels: 3, depth: 8, data: surf } }, 'my-obby');
  say('a new obby: a start, four stages, a ladder to the finish, lava under it. Play it, then make it yours: pick a block in 3D and drag it, Ctrl+D for another');
}

// ---- drawing
const terr = document.createElement('canvas'), tctx = terr.getContext('2d');
// The ground from above: its surface's colour, lit from the north-west, a
// line every 5 m of height.
function paintTerrain() {
  ground3 = true;
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
  draw3();
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
    if (x.part?.ghost) continue; // no box: drawn with the parts, over everything
    const [x0, y0] = S(x.box[0], x.box[2]), [x1, y1] = S(x.box[3], x.box[5]);
    const c = x.rgb;
    if (!st.xray) { ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.92)`; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    ctx.strokeStyle = st.xray ? `rgb(${c.map((v) => Math.min(255, v + 60)).join(',')})` : 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  }
  // the parts, as what they are: an outline in the kind's colour, its name
  // when there is room, a belt's arrow; a ghost (a part with no box) a
  // dashed, see-through volume
  const named = [], first = (x) => (x.part.kind === 'checkpoint' || x.part.kind === 'finish' ? 0 : 1);
  for (const x of boxes.filter((q) => q.part).sort((a, c) => first(a) - first(c))) {
    const [x0, y0] = S(x.box[0], x.box[2]), [x1, y1] = S(x.box[3], x.box[5]), w = x1 - x0, h = y1 - y0;
    const mark = PART_MARK[x.part.kind] || '#ff00ff';
    if (x.part.ghost) { ctx.fillStyle = mark + '38'; ctx.fillRect(x0, y0, w, h); ctx.setLineDash([5, 3]); }
    ctx.strokeStyle = mark; ctx.lineWidth = 2; ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2); ctx.setLineDash([]);
    const text = partLabel(x.part);
    ctx.font = 'bold 9px ui-monospace, monospace';
    const tw = ctx.measureText(text).width + 6;
    // its name in its middle, or over a box too low for it; a floor much
    // bigger than its name (lava under a course) has it in its corner, clear of what stands on it
    const big = w > 6 * tw && h > 90;
    const cx = big ? Math.max(x0, 0) + tw / 2 + 5 : (x0 + x1) / 2, cy = big ? Math.max(y0, 0) + 11 : h >= 13 ? (y0 + y1) / 2 : y0 - 7;
    if (x.part.kind === 'conveyor' && Array.isArray(x.part.velocity)) {
      // its arrow, the way it carries: beside its name where the box has the room, else under it
      const v = beltWorld(x.part.velocity, st.spec.structures[x.s].turn), n = Math.hypot(v[0], v[1]);
      if (n > 0) {
        const ux = v[0] / n, uy = v[1] / n, across = Math.abs(uy) * w + Math.abs(ux) * h, off = across >= 34 ? 11 : 0;
        let px = -uy, py = ux;
        if (py < 0 || (py === 0 && px < 0)) { px = -px; py = -py; }
        arrow2((x0 + x1) / 2 + px * off, (y0 + y1) / 2 + py * off, ux, uy, Math.max(10, Math.min(60, (Math.abs(ux) * w + Math.abs(uy) * h) * 0.7)), mark);
      }
    }
    if (w * 3 >= tw && h >= 4 && z >= 1.5 && free(named, cx, cy, tw, 12)) {
      ctx.fillStyle = mark; ctx.fillRect(cx - tw / 2, cy - 6, tw, 12);
      ctx.fillStyle = '#10131c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, cy + 0.5); ctx.textBaseline = 'alphabetic';
    }
  }
  // the selected structure, and its box with handles
  if (st.sel?.kind === 'box') {
    // (dashed round everything a drag would move: the box alone, or its whole structure)
    const mine = boxes.filter((x) => x.s === st.sel.s), moves = wholeFor(null, st.sel.s);
    ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    for (const x of moves ? mine : []) { const [x0, y0] = S(x.box[0], x.box[2]), [x1, y1] = S(x.box[3], x.box[5]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); }
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
  if (shown('hills')) hillsNow().forEach((h, i) => {
    const [x, y] = S(h[0], h[1]);
    if (defaults.hills) ctx.setLineDash([3, 4]);
    ring(x, y, h[3] * z, '#c6e05a', same(st.sel, { kind: 'hill', i }));
    ctx.setLineDash([]);
    label(x, y + 14, `hill ${i + 1}`, '#c6e05a');
  });
  const ball = ballNow(), [bx, by] = S(ball[0], ball[1]);
  if (shown('ball')) {
    dot(bx, by, 6, '#f2f2f2', same(st.sel, { kind: 'ball' }), defaults.ball);
    label(bx, by + 15, 'skull', '#f2f2f2');
  }
  const flags = flagsNow();
  if (shown('flags')) flags.forEach((f, k) => {
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
    dot(x, y, 5, TEAM[sided() ? half(s[0], s[1], flags) : 2], same(st.sel, { kind: 'spawn', i }), false);
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
// Whether a label w by h about (x, y) clears those already in `placed`, to which it is then added
function free(placed, x, y, w, h) {
  if (placed.some((r) => Math.abs(r[0] - x) < (r[2] + w) / 2 + 2 && Math.abs(r[1] - y) < (r[3] + h) / 2 + 1)) return false;
  placed.push([x, y, w, h]);
  return true;
}
// What a part is, in a word or two, for its mark in both views
function partLabel(p) {
  const g = p.ghost ? ' zone' : '';
  switch (p.kind) {
    case 'bounce': return `bounce ${p.speed ?? 14}${g}`;
    case 'ice': return `ice${g}`;
    case 'conveyor': return `belt ${Array.isArray(p.velocity) ? beltOf(p.velocity).speed : '?'} m/s${g}`;
    case 'checkpoint': return `stage ${p.stage ?? '?'}${g}`;
    default: return p.kind + g;
  }
}
// An arrow through (x, y) along the unit (dx, dy), `len` px long
function arrow2(x, y, dx, dy, len, color, c = ctx) {
  const ax = x - dx * len / 2, ay = y - dy * len / 2, bx = x + dx * len / 2, by = y + dy * len / 2, hd = Math.min(8, len / 2.5);
  c.strokeStyle = color; c.lineWidth = 2; c.beginPath();
  c.moveTo(ax, ay); c.lineTo(bx, by);
  c.moveTo(bx - (dx + dy * 0.6) * hd, by - (dy - dx * 0.6) * hd); c.lineTo(bx, by); c.lineTo(bx - (dx - dy * 0.6) * hd, by - (dy + dx * 0.6) * hd);
  c.stroke();
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

// ---- the 3D view (client/map-view.mjs): the arena's own renderer on the map
// being edited, from a camera orbiting a point over the 2D view's middle, so
// panning either moves both. Over it lies a 2D canvas of the editor's own
// (the pick's outline and handles, the parts' marks, ghosts, a belt's arrow),
// drawn through the same camera (map-build.mjs orbitEye).
//
// The gestures, chosen so building and looking don't fight: a press on what
// is already picked edits it, any other press looks around.
//   click                pick the box (or spawn, pad, flag...) under the pointer
//   drag the picked box  move it across the ground, on the grid; Shift: up and
//                        down; Alt: its whole structure; Ctrl: a copy of it
//   drag a dot           a face of the picked box: size it
//   drag the arrow       over the picked box: raise and lower it
//   drag a picked point  put it on what is under the pointer
//   drag anything else   turn the camera (the middle button always turns)
//   right-drag           pan (Shift-drag off the pick too); the wheel zooms
//   double-click, C      fly to the box
// With the box tool a click drops a box where the pointer is, on the ground
// or against the face under it, sized like the last; spawn, pad and hill
// click one down the same way.
const HELP3 = 'click picks; drag the picked box to move it (Shift up and down, Alt its structure, Ctrl a copy), its dots to size it, its arrow to raise it; drag elsewhere turns, right-drag pans, the wheel zooms, C flies to it';
const canvas3 = $('view3d'), over = $('over3d'), octx = over.getContext('2d');
const cam3 = { yaw: -Math.PI / 2, pitch: -0.55, dist: 140, y: null }; // y: the height it looks at (null: the ground there)
const present3 = new URLSearchParams(location.search).get('present') !== '0';
let view3 = null, view3Failed = false, ground3 = true, map3 = true, draw3Queued = false, drawing3 = false, again3 = false;
// the camera of the frame on screen and the tick its movers stand at, for picking and the overlay
let eye3 = null, frames3 = 0;
const MODE = 'fireplace-map-editor-view';
function setMode(m) {
  st.mode = m;
  $('wrap').className = m === 'split' ? m : `m${m}`;
  for (const b of $('modes').children) b.classList.toggle('on', b.dataset.mode === m);
  try { localStorage.setItem(MODE, m); } catch { /* the page works without it */ }
  if (m !== '2d' && !view3 && !view3Failed) {
    createMapView(canvas3, { present: present3 }).then((v) => { view3 = v; ground3 = map3 = true; draw3(); }).catch((e) => {
      view3Failed = true;
      say(`no 3D view: ${e.message || e}`);
      setMode('2d');
    });
  }
  draw();
}
// Where a point stands in the world, as the 3D view marks it: [x, y, z]
function pos3(sel) {
  const sp = st.spec;
  const on = (p, up) => [p[0], stand(p[0], p[1], p[2] ?? GROUND) + up, p[1]];
  switch (sel.kind) {
    case 'spawn': return on(sp.spawns[sel.i], 0.1);
    case 'pad': return on(sp.pads[sel.i].at, 0.7);
    case 'flag': return on(flagsNow()[sel.k], 1.2);
    case 'ball': return on(ballNow(), 0.6);
    case 'hill': return on(hillsNow()[sel.i], 0.2);
    case 'tele': { const p = sp.teleporters[sel.i][sel.end]; return [p[0], p[1] + (sel.end === 'from' ? 1.1 : 0.15), p[2]]; }
    case 'gate': return sp.race[sel.i].slice(0, 3);
  }
  return [0, 0, 0];
}
// what can be placed, as sprites and zones the renderer draws: spawns a disc
// in their side's colour, pads, flags and the skull standing, hills as the
// game paints them, teleporters and race gates glowing, the pick bright
function marks3() {
  const sp = st.spec, solid = [], glow = [], zone = [];
  const flags = flagsNow(), teams = sided();
  const side = [[0.9, 0.3, 0.25], [0.3, 0.5, 0.95], [0.85, 0.85, 0.85]];
  for (const s of sp.spawns || []) glow.push({ pos: [s[0], stand(s[0], s[1], s[2] ?? GROUND) + 0.1, s[1]], size: 0.6, color: [...side[teams ? half(s[0], s[1], flags) : 2], 0.9], kind: 3, minpx: 2 });
  for (const p of sp.pads || []) solid.push({ pos: [p.at[0], stand(p.at[0], p.at[1], p.at[2] ?? GROUND) + 0.7, p.at[1]], size: 0.55, aspect: 0.8, color: [0.9, 0.6, 0.2, 1], kind: 4, minpx: 2 });
  if (shown('flags')) flags.forEach((f, k) => solid.push({ pos: [f[0], stand(f[0], f[1], f[2]) + 1.2, f[1]], size: 0.8, aspect: 0.5, color: [...side[k], 1], kind: 4, minpx: 3 }));
  const b = ballNow();
  if (shown('ball')) solid.push({ pos: [b[0], stand(b[0], b[1], b[2]) + 0.6, b[1]], size: 0.4, color: [0.95, 0.95, 0.9, 1], kind: 4, minpx: 2 });
  if (shown('hills')) for (const h of hillsNow().slice(0, 8)) zone.push({ x: h[0], z: h[1], r: h[3], y: stand(h[0], h[1], h[2]), h: 3, color: [0.9, 0.85, 0.3], pulse: 0 });
  for (const t of sp.teleporters || []) {
    glow.push({ pos: [t.from[0], t.from[1] + 1.1, t.from[2]], size: (t.radius ?? 1.2) * 1.3, color: [0.35, 0.85, 1, 0.7], kind: 6, minpx: 1 });
    glow.push({ pos: [t.to[0], t.to[1] + 0.15, t.to[2]], size: 0.8, color: [0.5, 0.9, 1, 0.35], kind: 3, minpx: 1 });
  }
  for (const g of sp.race || []) glow.push({ pos: [g[0], g[1], g[2]], size: g[3], color: [1, 0.8, 0.3, 0.6], kind: 6, minpx: 2 });
  if (st.sel && st.sel.kind !== 'box') {
    const p = pos3(st.sel);
    glow.push({ pos: [p[0], p[1] + 0.9, p[2]], size: 1.4, color: [1, 0.85, 0.35, 0.9], kind: 3, minpx: 4 });
  }
  return { solid, glow, zone: zone.length ? zone : null };
}
const target3 = () => [view.cx, cam3.y ?? ground(view.cx, view.cz), view.cz];
const now3 = () => performance.now() * L.TICK_HZ / 1000;
function draw3() {
  if (!view3 || st.mode === '2d' || draw3Queued || !st.spec) return;
  draw3Queued = true;
  requestAnimationFrame(async () => {
    draw3Queued = false;
    // one frame at a time (the first makes the renderer, which takes a while): a change meanwhile draws again after
    if (drawing3) { again3 = true; return; }
    drawing3 = true;
    try {
      if (ground3) { view3.ground(st); ground3 = false; }
      if (map3 && st.result) { view3.map(st.result); map3 = false; }
      view3.marks(marks3());
      // the movers where the wall clock has them; held still while something
      // is dragged, and while a box of one is picked, that one where it is built
      const orbit = { target: target3(), yaw: cam3.yaw, pitch: cam3.pitch, dist: cam3.dist };
      const tick = drag3?.edit && eye3 ? eye3.tick : pickedHome() ?? now3();
      await view3.draw({ ...orbit, tick });
      eye3 = Object.assign(orbitEye(orbit, canvas3.clientWidth, canvas3.clientHeight), { tick });
      frames3++;
      overlay();
    } finally { drawing3 = false; }
    if (again3) { again3 = false; draw3(); }
  });
}
// The tick at which the picked box's structure, if it moves, is where it is
// built (the start of its path), so it can be worked on; else undefined
function pickedHome() {
  const m = st.sel?.kind === 'box' ? moveOf(st.spec.structures[st.sel.s] || {}) : null;
  if (!m) return undefined;
  const cycle = 2 * (m.travel + m.wait);
  return (cycle - (m.phase % cycle)) % cycle;
}
// what moves is shown moving (where the page presents its frames: a capture of each is too slow)
if (present3) setInterval(() => { if (!document.hidden && st.spec && st.mode !== '2d' && !drag3?.edit && pickedHome() === undefined && (st.spec.structures || []).some((s) => s.move)) draw3(); }, 40);

// Every box where the frame on screen has it (a mover's where its tick put
// it): the editor's box with `at`, its box as drawn, and `off`, how far that is from where it is built.
function boxes3() {
  const t = eye3?.tick ?? 0, offs = new Map();
  return allBoxes().map((x) => {
    if (!offs.has(x.s)) offs.set(x.s, movedAt(st.spec.structures[x.s], t));
    const off = offs.get(x.s);
    return { ...x, off, at: off[0] || off[1] || off[2] ? shifted(x.box, off) : x.box };
  });
}
const picked3 = () => (st.sel?.kind === 'box' ? boxes3().find((x) => x.s === st.sel.s && x.b === st.sel.b) : null);
const sizeOf = (w) => [tidy(w[3] - w[0]), tidy(w[4] - w[1]), tidy(w[5] - w[2])];
const grid = () => Number($('snap').value) || 0;
// a drag takes the picked box's whole structure when that is asked for (Alt for one drag the other way), and a prefab's always
const wholeFor = (e, si) => !!st.spec.structures[si]?.prefab || $('whole').checked !== !!e?.altKey;
const local3 = (e) => { const r = canvas3.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

// What the ray through a screen point meets first: a box's face ({ box, at,
// axis, sign }) or the ground ({ at, ground }). `solid`: only what something
// can stand on or against (no ghosts).
function under3(px, py, solid = false) {
  const { o, d } = rayAt(eye3, px, py), all = boxes3().filter((x) => !solid || !x.part?.ghost);
  const hit = pickRay(o, d, all.map((x) => x.at));
  const g = rayGround(o, d, ground);
  if (hit && (!g || hit.t <= (g[0] - o[0]) * eye3.cy + (g[2] - o[2]) * eye3.sy)) return { ...hit, box: all[hit.i] };
  return g ? { at: g, axis: 1, sign: 1, ground: true } : null;
}
// The point (spawn, pad, flag...) drawn within reach of a screen point
function pickPoint3(px, py) {
  let best = null, bd = 12;
  for (const p of points()) {
    const q = screenOf(eye3, pos3(p.sel)), d = Math.hypot(q[0] - px, q[1] - py);
    if (q[2] > 0.3 && d < bd) { bd = d; best = p.sel; }
  }
  return best;
}
// The picked box's handles on the screen: a dot standing off the middle of
// each face (drag it: that face moves), and an arrow over the top one (drag
// it: the box goes up and down). They stand off the box so a press on the box
// itself is always a move; a face seen head on, whose dot would sit on it and
// follow no drag, has none: turn the camera for it.
const OFF3 = 18; // px
function handles3() {
  const one = picked3();
  if (!one || !eye3) return [];
  const w = one.at, c = [(w[0] + w[3]) / 2, (w[1] + w[4]) / 2, (w[2] + w[5]) / 2], out = [];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const p = c.slice();
    p[axis] = sign > 0 ? w[axis + 3] : w[axis];
    const q = screenOf(eye3, p), n = p.slice();
    n[axis] += sign;
    const r = screenOf(eye3, n), dx = r[0] - q[0], dy = r[1] - q[1], len = Math.hypot(dx, dy);
    // (a metre there is focal / depth px across the view)
    if (q[2] < 0.3 || r[2] < 0.3 || len < 0.3 * eye3.focal / q[2]) continue;
    out.push({ axis, sign, p, x: q[0] + dx / len * OFF3, y: q[1] + dy / len * OFF3, from: [q[0], q[1]] });
  }
  const top = screenOf(eye3, [c[0], w[4], c[2]]);
  if (top[2] > 0.3) out.push({ lift: true, p: [c[0], w[4], c[2]], x: top[0], y: top[1] - OFF3 - 26 });
  return out;
}
function grabHandle(px, py) {
  let best = null, bd = 10;
  for (const h of handles3()) { const d = Math.hypot(h.x - px, h.y - py); if (d < bd) { bd = d; best = h; } }
  return best;
}

// ---- the overlay: what the editor adds to the renderer's picture
function overlay() {
  const dpr = Math.min(devicePixelRatio || 1, 2), cw = canvas3.clientWidth, ch = canvas3.clientHeight;
  if (over.width !== Math.round(cw * dpr) || over.height !== Math.round(ch * dpr)) { over.width = Math.round(cw * dpr); over.height = Math.round(ch * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, cw, ch);
  if (!eye3 || !st.spec || st.mode === '2d') return;
  const e = eye3, c = octx;
  const corner = (w, k) => [w[k & 1 ? 3 : 0], w[k & 2 ? 4 : 1], w[k & 4 ? 5 : 2]];
  const edges = (w, color, width, dash = []) => {
    c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath();
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      const s = segmentOf(e, corner(w, a), corner(w, b));
      if (s) { c.moveTo(s[0][0], s[0][1]); c.lineTo(s[1][0], s[1][1]); }
    }
    c.stroke(); c.setLineDash([]);
  };
  const faces = (w, fill) => {
    c.fillStyle = fill;
    for (const f of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
      const p = polygonOf(e, f.map((k) => corner(w, k)));
      if (p.length < 3) continue;
      c.beginPath(); p.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); c.fill();
    }
  };
  const named = [];
  const badge = (x, y, text, mark, must = false) => {
    c.font = 'bold 10px ui-monospace, monospace';
    const tw = c.measureText(text).width + 8;
    if (!free(named, x, y, tw, 14) && !must) return;
    c.fillStyle = mark; c.fillRect(x - tw / 2, y - 7, tw, 14);
    c.fillStyle = '#10131c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y + 0.5); c.textBaseline = 'alphabetic';
  };
  const all = boxes3();
  // the parts, as what they are: outlined in the kind's colour and named
  // (the nearest first, where names would run into each other); a ghost,
  // which the renderer has no box for, a see-through volume
  const ahead = (x) => (x.at[0] + x.at[3] - 2 * e.cam[0]) * e.cy + (x.at[2] + x.at[5] - 2 * e.cam[2]) * e.sy;
  for (const x of all.filter((q) => q.part).sort((a, b) => ahead(a) - ahead(b))) {
    const w = x.at, mark = PART_MARK[x.part.kind] || '#ff00ff';
    if (x.part.ghost) { faces(w, mark + '2e'); edges(w, mark, 1.5, [5, 4]); } else edges(w, mark + 'c8', 1.25);
    const mid = [(w[0] + w[3]) / 2, w[4], (w[2] + w[5]) / 2], q = screenOf(e, mid);
    if (x.part.kind === 'conveyor' && Array.isArray(x.part.velocity)) {
      // its arrow, lying on its top
      const v = beltWorld(x.part.velocity, st.spec.structures[x.s].turn), n = Math.hypot(v[0], v[1]);
      if (n > 0) {
        const len = Math.max(0.6, 0.7 * (Math.abs(v[0]) * (w[3] - w[0]) + Math.abs(v[1]) * (w[5] - w[2])) / n), ux = v[0] / n, uz = v[1] / n, hd = Math.min(0.6, len / 3);
        const at = (f, sideways) => [mid[0] + ux * f + -uz * sideways, mid[1] + 0.03, mid[2] + uz * f + ux * sideways];
        c.strokeStyle = mark; c.lineWidth = 2.5; c.beginPath();
        for (const [a, b] of [[at(-len / 2, 0), at(len / 2, 0)], [at(len / 2 - hd, hd * 0.6), at(len / 2, 0)], [at(len / 2 - hd, -hd * 0.6), at(len / 2, 0)]]) {
          const s = segmentOf(e, a, b);
          if (s) { c.moveTo(s[0][0], s[0][1]); c.lineTo(s[1][0], s[1][1]); }
        }
        c.stroke();
      }
    }
    // its name, while it is big enough on the screen to be read as its own
    if (q[2] > 0.3 && e.focal * Math.max(w[3] - w[0], w[4] - w[1], w[5] - w[2]) / q[2] > 16) badge(q[0], q[1] - 10, partLabel(x.part), mark);
  }
  // a box about to be dropped (the box tool)
  if (hover3?.drop) edges(hover3.drop, '#ffcf5a', 1.5, [4, 3]);
  // the pick: the box itself, its handles and its size, and dashed round the
  // rest of its structure when a drag would take that too
  const one = picked3();
  if (one) {
    if (wholeFor(null, one.s)) for (const x of all) if (x.s === one.s && x.b !== one.b) edges(x.at, '#ffcf5aaa', 1, [3, 4]);
    edges(one.at, '#ffcf5a', 2);
    for (const h of handles3()) {
      if (h.lift) {
        for (const pass of [0, 1]) {
          c.strokeStyle = pass ? '#ffcf5a' : '#10131c'; c.lineWidth = pass ? 2 : 4.5; c.beginPath();
          c.moveTo(h.x, h.y - 9); c.lineTo(h.x, h.y + 9);
          c.moveTo(h.x - 5, h.y - 4); c.lineTo(h.x, h.y - 10); c.lineTo(h.x + 5, h.y - 4);
          c.moveTo(h.x - 5, h.y + 4); c.lineTo(h.x, h.y + 10); c.lineTo(h.x + 5, h.y + 4);
          c.stroke();
        }
      } else {
        c.strokeStyle = '#ffcf5a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(h.from[0], h.from[1]); c.lineTo(h.x, h.y); c.stroke();
        c.beginPath(); c.arc(h.x, h.y, 5, 0, 7);
        c.fillStyle = '#ffcf5a'; c.fill();
        c.strokeStyle = '#10131c'; c.stroke();
      }
    }
    const w = one.at, q = screenOf(e, [(w[0] + w[3]) / 2, w[1], (w[2] + w[5]) / 2]);
    if (q[2] > 0.3) badge(q[0], q[1] + 16, sizeOf(w).join(' × ') + ' m', '#ffcf5a', true);
  }
}

// ---- the pointer in the 3D view
let drag3 = null, hover3 = null, hover3Queued = false, lastView = '2d';
canvas3.addEventListener('contextmenu', (e) => e.preventDefault());
canvas3.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // the middle button turns the camera, not the page's scroll
canvas3.addEventListener('pointerdown', (e) => {
  if (!st.spec) return;
  canvas3.setPointerCapture(e.pointerId);
  const [px, py] = local3(e);
  const base = { x: e.clientX, y: e.clientY, px, py, moved: false };
  if (e.button === 2 || space) { drag3 = { ...base, pan: true }; return; }
  if (e.button === 1 || !eye3) { drag3 = { ...base, turn: true }; return; }
  if (e.button !== 0) return;
  if (st.tool === 'select') {
    const one = picked3();
    if (one) {
      const h = grabHandle(px, py);
      if (h) { drag3 = { ...base, edit: h.lift ? 'lift' : 'face', h, one, w0: one.box.slice(), grab: h.p }; return; }
      const u = under3(px, py);
      if (u?.box && u.box.s === one.s && (u.box.b === one.b || wholeFor(e, one.s))) {
        drag3 = { ...base, edit: e.shiftKey ? 'lift' : 'move', one, w0: one.box.slice(), grab: u.at, whole: wholeFor(e, one.s), copy: e.ctrlKey || e.metaKey, done: [0, 0, 0] };
        return;
      }
    }
    const p = pickPoint3(px, py);
    if (p && same(p, st.sel) && p.kind !== 'gate') { drag3 = { ...base, edit: 'point', point: p }; return; }
  }
  drag3 = { ...base, [e.shiftKey ? 'pan' : 'turn']: true, click: true };
});
canvas3.addEventListener('pointermove', (e) => {
  if (!st.spec) return;
  lastView = '3d';
  const [px, py] = local3(e);
  if (!drag3) { hoverAt3(px, py); return; }
  if (!drag3.moved) {
    // not a drag yet: a click must stay one
    if (Math.hypot(px - drag3.px, py - drag3.py) < 4) return;
    drag3.moved = true;
    if (drag3.edit) beginEdit3();
  }
  const dx = e.clientX - drag3.x, dy = e.clientY - drag3.y;
  drag3.x = e.clientX; drag3.y = e.clientY;
  if (drag3.pan) {
    // the ground under the cursor follows it: across the screen is the camera's right, up it its forward
    const k = cam3.dist / (canvas3.clientWidth * 0.62);
    const c = Math.cos(cam3.yaw), s = Math.sin(cam3.yaw);
    const f = 1 / Math.max(0.3, -Math.sin(cam3.pitch)); // the ground foreshortened along the view
    view.cx += (s * dx + c * dy * f) * k;
    view.cz += (-c * dx + s * dy * f) * k;
  } else if (drag3.turn) {
    cam3.yaw += dx * 0.008;
    cam3.pitch = clamp(cam3.pitch + dy * 0.005, -1.3, -0.03);
  } else edit3(px, py);
  draw();
});
// The edit a drag makes begins when it first moves: one undo step, and with Ctrl a copy to carry off
function beginEdit3() {
  const k = drag3;
  step();
  if (!k.copy || k.edit !== 'move') return;
  const sp = st.spec, s = sp.structures[k.one.s];
  if (k.whole) {
    const c = JSON.parse(JSON.stringify(s));
    c.name = `${s.name || 'structure'} copy`;
    sp.structures.push(c);
    st.sel = { kind: 'box', s: sp.structures.length - 1, b: k.one.b };
  } else {
    const list = boxList(s), c = copyOf(list[k.one.b]);
    list.push(c);
    st.sel = { kind: 'box', s: k.one.s, b: list.length - 1 };
    st.dup = { ...st.sel, from: k.w0.slice() };
  }
  k.one = { ...k.one, s: st.sel.s, b: st.sel.b };
}
// A box copied: itself again, a checkpoint the next free stage
function copyOf(b) {
  const c = JSON.parse(JSON.stringify(b));
  if (readPart(c[7])?.kind === 'checkpoint') setPartField(c, 'stage', nextStage(st.spec));
  return c;
}
function edit3(px, py) {
  const k = drag3, { o, d } = rayAt(eye3, px, py), g = grid();
  if (k.edit === 'point') {
    const u = under3(px, py, true);
    if (u) putPoint3(k.point, u);
    changed();
    return;
  }
  const s = st.spec.structures[k.one.s], b = boxList(s)[k.one.b];
  if (k.edit === 'face') {
    // the handle is where the frame drew it, the box where it is built
    const v = alongAxis(o, d, k.grab, k.h.axis);
    if (v === null) return;
    const w = facedBox(k.w0, k.h.axis, k.h.sign, v - k.one.off[k.h.axis], g);
    setWorldBox(s, b, w);
    st.size = sizeOf(w);
  } else {
    let by;
    if (k.edit === 'move') {
      const p = rayPlane(o, d, 1, k.grab[1]);
      if (!p || Math.hypot(p[0] - o[0], p[2] - o[2]) > 2000) return;
      by = [p[0] - k.grab[0], 0, p[2] - k.grab[2]];
    } else {
      const y = alongAxis(o, d, k.grab, 1);
      if (y === null) return;
      by = [0, y - k.grab[1], 0];
    }
    const w = movedBox(k.w0, by, g);
    if (k.whole) {
      const m = [w[0] - k.w0[0], w[1] - k.w0[1], w[2] - k.w0[2]];
      moveStruct(s, m[0] - k.done[0], m[2] - k.done[2], m[1] - k.done[1]);
      k.done = m;
    } else setWorldBox(s, b, w);
  }
  changed();
}
// Put a point on what the pointer is over: a box's top, or the ground
function putPoint3(sel, u) {
  moveTo(sel, snapTo(u.at[0]), snapTo(u.at[2]));
  const sp = st.spec, top = !u.ground && u.axis === 1 && u.sign > 0;
  const arr = { spawn: () => sp.spawns[sel.i], pad: () => sp.pads[sel.i].at, flag: () => sp.flags.find((f) => f.team === ['red', 'blue'][sel.k]).at, ball: () => sp.ball.at, hill: () => sp.hills[sel.i].at }[sel.kind]?.();
  if (arr) { if (top) arr[2] = tidy(u.at[1] + 0.05); else if (u.ground) arr.length = 2; }
  if (sel.kind === 'tele' && (top || u.ground)) sp.teleporters[sel.i][sel.end][1] = tidy(u.at[1] + (sel.end === 'to' ? 0.1 : 0));
}
const end3 = (e) => {
  const k = drag3;
  if (!k) return;
  drag3 = null;
  if (k.edit && k.moved) { endStep(); changed(); renderSide(); }
  // (a press on the pick that never moved is a click too: another box of a structure that moves whole is picked by it)
  else if ((k.click || k.edit === 'move') && !k.moved && e.type === 'pointerup') click3(k.px, k.py);
  draw();
};
canvas3.addEventListener('pointerup', end3);
canvas3.addEventListener('pointercancel', end3);
// A click: with the select tool it picks; with the box tool it drops a box;
// spawn, pad and hill put one down on what is there
function click3(px, py) {
  const t = st.tool;
  if (t === 'select') {
    const p = pickPoint3(px, py), u = p ? null : under3(px, py);
    st.sel = p || (u?.box ? { kind: 'box', s: u.box.s, b: u.box.b } : null);
    if (u?.box) st.size = sizeOf(u.box.box);
    renderSide();
    return;
  }
  const u = under3(px, py, true);
  if (!u) return;
  if (t === 'box') { dropAt(u); return; }
  if (t === 'spawn' || t === 'pad' || t === 'hill') {
    step();
    add(t, snapTo(u.at[0]), snapTo(u.at[2]));
    putPoint3(st.sel, u);
    endStep(); changed(); renderSide();
    return;
  }
  say(`the ${t} tool works in the 2D view`);
}
// A new box against what the pointer is on, sized like the last: in the
// picked structure if it is built by hand, else the structure of the box it
// lands on (one that stands still), else one of its own.
function dropAt(u) {
  const sp = st.spec;
  sp.structures ||= [];
  const ok = (si) => sp.structures[si] && !sp.structures[si].prefab;
  let si = st.sel?.kind === 'box' && ok(st.sel.s) ? st.sel.s : u.box && ok(u.box.s) && !sp.structures[u.box.s].move ? u.box.s : -1;
  step();
  if (si < 0) { sp.structures.push({ name: `structure ${sp.structures.length + 1}`, boxes: [] }); si = sp.structures.length - 1; }
  const s = sp.structures[si], off = movedAt(s, eye3.tick), b = [0, 0, 0, 0, 0, 0, $('material').value];
  setWorldBox(s, b, shifted(dropBox(u, st.size, grid()), off.map((v) => -v)));
  s.boxes.push(b);
  st.sel = { kind: 'box', s: si, b: s.boxes.length - 1 };
  hover3 = null;
  endStep(); changed(); renderSide();
}
// The pointer over the view with nothing held: the cursor says what a press
// would do, the foot where it is, and the box tool shows where a box would land
function hoverAt3(px, py) {
  if (hover3Queued || !eye3) return;
  hover3Queued = true;
  requestAnimationFrame(() => {
    hover3Queued = false;
    if (drag3 || !eye3 || !st.spec) return;
    const t = st.tool, u = under3(px, py, t !== 'select');
    const was = hover3;
    hover3 = t === 'box' && u ? { drop: dropBox(u, st.size, grid()) } : null;
    let cursor = t === 'select' ? 'default' : 'crosshair';
    if (t === 'select') {
      const one = picked3(), h = one && grabHandle(px, py);
      if (h) cursor = h.lift || h.axis === 1 ? 'ns-resize' : 'ew-resize';
      else if (one && u?.box && u.box.s === one.s && (u.box.b === one.b || wholeFor(null, one.s))) cursor = 'move';
      else if (u?.box || pickPoint3(px, py)) cursor = 'pointer';
    }
    canvas3.style.cursor = cursor;
    if (u && performance.now() - saidAt >= 4000) {
      const what = u.box ? `${st.spec.structures[u.box.s].name || `structure ${u.box.s + 1}`}${u.box.part ? `, ${partLabel(u.box.part)}` : ''}` : `the ground, ${surfaceAt(u.at[0], u.at[2])}`;
      foot.textContent = `x ${u.at[0].toFixed(1)}  y ${u.at[1].toFixed(2)}  z ${u.at[2].toFixed(1)}  ${what}  ·  ${t === 'select' ? HELP3 : t === 'box' ? 'click drops a box here, sized like the last; drag turns the camera' : TOOLS.find((x) => x[0] === t)?.[2] || ''}`;
    }
    if (hover3 || was) overlay();
  });
}
canvas3.addEventListener('pointerleave', () => { if (hover3) { hover3 = null; overlay(); } });
canvas3.addEventListener('dblclick', (e) => {
  if (!eye3 || st.tool !== 'select') return;
  const [px, py] = local3(e), u = under3(px, py);
  if (u?.box) { st.sel = { kind: 'box', s: u.box.s, b: u.box.b }; renderSide(); flyTo(u.box.at); }
});
canvas3.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam3.dist = clamp(cam3.dist * Math.exp(e.deltaY * 0.0012), 2, 1200);
  draw3();
}, { passive: false });
new ResizeObserver(() => draw()).observe($('wrap'));

// The camera flown to a box (a world box): both views' middle to its, the 3D
// one near enough to work on it
let flying = 0;
function flyTo(w) {
  const from = [view.cx, cam3.y ?? ground(view.cx, view.cz), view.cz, cam3.dist];
  const to = [(w[0] + w[3]) / 2, (w[1] + w[4]) / 2, (w[2] + w[5]) / 2, clamp(Math.max(w[3] - w[0], w[4] - w[1], w[5] - w[2]) * 2.2 + 9, 6, 600)];
  const t0 = performance.now(), me = ++flying;
  const go = () => {
    if (me !== flying) return;
    const f = Math.min(1, (performance.now() - t0) / 300), k = f * f * (3 - 2 * f);
    const at = from.map((v, i) => v + (to[i] - v) * k);
    view.cx = at[0]; cam3.y = at[1]; view.cz = at[2]; cam3.dist = at[3];
    draw();
    if (f < 1) requestAnimationFrame(go);
  };
  go();
}
// to whatever is picked (C, or the panel's button)
function flyToPick() {
  const sel = st.sel;
  if (!sel) return;
  if (sel.kind === 'box') { const one = picked3() || allBoxes().find((x) => x.s === sel.s && x.b === sel.b); if (one) flyTo(one.at || one.box); return; }
  const p = pos3(sel);
  flyTo([p[0] - 1, p[1] - 0.5, p[2] - 1, p[0] + 1, p[1] + 1.5, p[2] + 1]);
}

function fit() {
  const b = bounds(), cw = canvas.clientWidth || 800, ch = canvas.clientHeight || 600;
  view.cx = (b[0] + b[1]) / 2; view.cz = (b[2] + b[3]) / 2;
  view.zoom = Math.min(cw / (b[1] - b[0] + 40), ch / (b[3] - b[2] + 40));
  cam3.dist = clamp(Math.max(b[1] - b[0], b[3] - b[2]) * 0.9, 20, 1200);
  // the 3D view looks at the middle of what is built, a course in the sky included, never under the ground
  const ys = allBoxes().flatMap((x) => [x.box[1], x.box[4]]);
  flying++;
  cam3.y = ys.length ? Math.max(ground(view.cx, view.cz), (Math.min(...ys) + Math.max(...ys)) / 2) : null;
  draw();
}

// ---- tools
const TOOLS = [
  ['select', 'V', 'pick and drag anything; drag a box to move it, a corner to size it; Alt-drag moves its whole structure'],
  ['raise', 'R', 'raise the ground (Shift lowers)'],
  ['lower', 'L', 'lower the ground'],
  ['flatten', 'F', 'pull the ground to the height where the stroke began'],
  ['smooth', 'M', 'smooth the ground'],
  ['paint', 'P', 'paint what the ground is'],
  ['box', 'B', 'drag out a box: a wall, a floor, a roof (its heights in the panel); in 3D click to drop one where the pointer is, sized like the last'],
  ['spawn', 'S', 'click to add a spawn point (in 3D: on what is under the pointer)'],
  ['pad', 'W', 'click to add a weapon pad'],
  ['teleporter', 'T', 'drag from the pad to where it sends you'],
  ['hill', 'H', 'click to add a hill for King of the Hill'],
  ['gate', 'G', 'click to add a race gate (Dogfight\'s Ring Race), in order'],
];
const BRUSH = { raise: 1, lower: 1, flatten: 1, smooth: 1, paint: 1 };
const radius = () => Number($('radius').value);
const strength = () => Number($('strength').value) / 100;
const snapTo = (v) => snap(v, grid());

function setTool(t) {
  st.tool = t;
  for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === t);
  $('brush').hidden = !BRUSH[t];
  $('surface').hidden = t !== 'paint';
  $('placing').hidden = t !== 'box' && t !== 'pad';
  $('material').hidden = t !== 'box';
  $('weapon').hidden = t !== 'pad';
  canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
  canvas3.style.cursor = canvas.style.cursor;
  hover3 = null;
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
      // the box, or with Alt (or "whole structure") everything built with it; a prefab's always moves whole
      const s = st.spec.structures[sel.s];
      st.size = sizeOf(worldBox(s, boxList(s)[sel.b]));
      drag = { box: sel, start: [x, z], moved: [0, 0], one: wholeFor(e, sel.s) ? null : boxList(s)[sel.b].slice(), fresh: true };
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
  lastView = '2d';
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
    if (w[0] !== w[3] && w[2] !== w[5]) { setBoxWorld(s, b, [w[0], w[2], w[3], w[5]]); st.size = sizeOf(worldBox(s, b)); }
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
  if (wasEdit) { clearTimeout(checkTimer); unchecked = true; checkTimer = setTimeout(check, 120); renderSide(); }
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
  st.size = [tidy(x1 - x0), 3, tidy(z1 - z0)];
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
  st.dup = null;
  changed();
  renderSide();
}
// (whole: a box's whole structure, or the box alone; left out, as "whole structure" says)
function duplicate(whole) {
  const sel = st.sel, sp = st.spec;
  if (!sel) return;
  if (typeof whole !== 'boolean') whole = undefined;
  step();
  const off = 4;
  if (sel.kind === 'spawn') { const s = sp.spawns[sel.i]; sp.spawns.push([tidy(s[0] + off), s[1], ...s.slice(2)]); st.sel = { kind: 'spawn', i: sp.spawns.length - 1 }; }
  else if (sel.kind === 'pad') { const p = sp.pads[sel.i]; sp.pads.push({ ...p, at: [tidy(p.at[0] + off), ...p.at.slice(1)] }); st.sel = { kind: 'pad', i: sp.pads.length - 1 }; }
  else if (sel.kind === 'hill') { ensureHills(); const h = sp.hills[sel.i]; sp.hills.push({ ...h, at: [tidy(h.at[0] + off), ...h.at.slice(1)] }); st.sel = { kind: 'hill', i: sp.hills.length - 1 }; }
  else if (sel.kind === 'gate') { const g = sp.race[sel.i]; sp.race.splice(sel.i + 1, 0, [tidy(g[0] + 3 * off), g[1], g[2], g[3]]); st.sel = { kind: 'gate', i: sel.i + 1 }; }
  else if (sel.kind === 'box' && (whole ?? wholeFor(null, sel.s))) {
    const s = JSON.parse(JSON.stringify(sp.structures[sel.s]));
    s.name = `${s.name || 'structure'} copy`;
    moveStruct(s, 4 * off, 0);
    sp.structures.push(s);
    st.sel = { kind: 'box', s: sp.structures.length - 1, b: sel.b };
  } else if (sel.kind === 'box') {
    // one box, beside itself; or, when it is the last copy and has been put
    // somewhere, as far on again: a row of blocks is Ctrl+D, drag, Ctrl+D, Ctrl+D...
    const s = sp.structures[sel.s], list = boxList(s), w = worldBox(s, list[sel.b]);
    const d = st.dup && st.dup.s === sel.s && st.dup.b === sel.b ? [0, 1, 2].map((a) => tidy(w[a] - st.dup.from[a])) : [0, 0, 0];
    const by = d.some((v) => v) ? d : [tidy(w[3] - w[0]), 0, 0];
    const c = copyOf(list[sel.b]);
    setWorldBox(s, c, shifted(w, by));
    list.push(c);
    st.sel = { kind: 'box', s: sel.s, b: list.length - 1 };
    st.dup = { ...st.sel, from: w };
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
  side.append(el('ol', { className: 'steps' },
    el('li', {}, el('b', { textContent: 'Shape it' }), ': the tools above raise and paint the ground and place boxes, spawns, pads and hills; in the 3D view pick a box, drag it, size it, and say what it does.'),
    el('li', {}, el('b', { textContent: 'Play it' }), ' here with AI fighters, as often as you like.'),
    el('li', {}, el('b', { textContent: 'Send it in' }), ' to have it played by everyone.')));
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
  side.append(hint('Where fighters can go: its edges, in metres (or drag them on the map).'));
  side.append(row(...['west', 'east', 'north', 'south'].map((n, k) => num(n, () => b[k], (v) => { b[k] = v; }, { stepBy: 1 }))));
  side.append(row(num('ceiling', () => sp.ceiling, (v) => { if (v === undefined) delete sp.ceiling; else sp.ceiling = v; }, { blank: `auto${st.result ? ` (${st.result.ceiling})` : ''}`, stepBy: 1 })));
  side.append(row(el('label', { textContent: 'x-ray' }), Object.assign(el('input', { type: 'checkbox', checked: st.xray, title: 'X' }), { onchange: (e) => { st.xray = e.target.checked; draw(); } })));
  side.append(...rulesPanel());

  // the selection
  const sel = st.sel;
  if (sel) side.append(...selectionPanel(sel));
  else side.append(h3('Nothing picked'), hint('Pick something with the select tool (V), or add with the tools above. Drag with the right button (or Space) to pan; the wheel zooms; 0 fits the map.'),
    hint(`In the 3D view: ${HELP3}. With the box tool (B) a click drops a box where the pointer is, on the ground or against the face under it, sized like the last. Delete removes the pick, Ctrl+D copies it (again: as far on again), the arrow keys and Page Up and Down nudge it a grid step.`));

  // the check
  side.append(h3('Ready to play?'));
  checkBox = el('div');
  side.append(checkBox);
  renderCheck();

  // playing it
  const f = st.folder, race = (sp.race || []).length;
  side.append(h3('Play it'));
  side.append(row(btn('play it here', () => playHere('arena'), 'the arena on this map, you and AI fighters, in a new tab'),
    ...(race ? [btn('fly it', () => playHere('flight'), 'Dogfight\'s Ring Race on this map')] : [])));
  side.append(hint('Online with friends and bots: save it into Fireplace\'s maps/' + f + '/ (or download the files and put them there), then from the repo:'));
  side.append(el('p', {}, el('code', { textContent: `node net/play.mjs --arena --map ${f}` })));
  if (race) side.append(el('p', {}, el('code', { textContent: `node net/play.mjs --flight --mode ${L.FLIGHT_CONSTS.M_RACE} --map ${f}` })), hint('flies its Ring Race.'));
  side.append(hint('Open the URL it prints: that is your map with bots on it. --bots N for more, --mode k for one mode (5 Capture the Flag, 6 Oddball, 7 King of the Hill).'));
  side.append(h3('Send it in'));
  side.append(hint('To have it played for everyone: send it in downloads the three files and opens GitHub\'s upload page for this folder. Drop them there and propose the change; that is the pull request, and CI plays the map with AI fighters. CONTRIBUTING.md, "A map", has the rest.'));
  side.append(row(btn('send it in', sendIn, 'download the files and open GitHub\'s upload page'), btn('download the files', download)));
}

// The map as it is now, packed (packMap) and handed to the arena's page (or
// Dogfight's) in a new tab: a local room with AI players, which lays the map
// in its sim before the first tick (?map=, client/host.mjs). The blob lives as
// long as this page does.
function playHere(game) {
  if (!st.result) { say(`not yet: ${st.error || 'the map is still being checked'}`); return; }
  const url = URL.createObjectURL(new Blob([packMap(st.result)]));
  // (a page that draws without presenting, a gate's, opens one that does the same)
  const q = new URLSearchParams({ local: '1', map: url, ...(game === 'flight' ? { mode: String(L.FLIGHT_CONSTS.M_RACE) } : {}), ...(present3 ? {} : { present: '0' }) });
  open(`./${game}.html?${q}`, '_blank');
  say(`opened ${st.spec.name || 'the map'} in ${game === 'flight' ? 'Dogfight' : 'the arena'}, in a new tab`);
}

const modeName = (k) => { const n = L.MODES[MAP_MODES[k]].name.toLowerCase(); return n === k ? k : `${k}: ${n}`; };
// How the map plays: the mode every match plays, how its fighters move and
// how big they are, and where a fall kills (map.json "mode", "movement",
// "body", "void"), each the arena's own until set.
function rulesPanel() {
  const sp = st.spec, out = [h3('How it plays')];
  const edit = (f) => { step(); f(); endStep(); changed(); renderSide(); };
  const modes = el('select');
  modes.append(el('option', { value: '', textContent: 'the rotation', selected: sp.mode === undefined }));
  for (const k of Object.keys(MAP_MODES)) modes.append(el('option', { value: k, textContent: modeName(k), selected: sp.mode === k }));
  if (sp.mode !== undefined && !(sp.mode in MAP_MODES)) modes.append(el('option', { value: sp.mode, textContent: `${sp.mode}?`, selected: true }));
  modes.onchange = () => edit(() => { if (modes.value) sp.mode = modes.value; else delete sp.mode; });
  out.push(row(el('label', { textContent: 'mode' }), modes));
  out.push(hint(sp.mode === 'obby' ? 'Obby: an obstacle course. Nobody is armed; a checkpoint is your stage and where you come back, the finish ends your run. It needs a finish, and a spawn at the start only.'
    : sp.mode in MAP_MODES ? `Every match here is ${L.MODES[MAP_MODES[sp.mode]].name.toLowerCase()}: ${L.MODES[MAP_MODES[sp.mode]].rules.toLowerCase()}.${sided() ? '' : ' It has no sides, so the spawns needn\'t be on each half.'}`
      : 'The arena\'s modes in turn, a match each. Pick one to have every match here play it: obby makes the map an obstacle course.'));
  // movement
  const mv = sp.movement;
  out.push(row(el('label', { textContent: 'movement' }), pick1(['the arena\'s', 'its own'], mv ? 'its own' : 'the arena\'s', (v) => { if (v === 'its own') sp.movement = { ...ROBLOX_MOVEMENT }; else delete sp.movement; }),
    btn('Roblox character', () => edit(() => { sp.movement = { ...ROBLOX_MOVEMENT }; }), 'a Humanoid at 0.28 m a stud: walk 4.48 m/s, jump 2.016 m, gravity 54.936 m/s²')));
  if (mv) {
    out.push(row(num('walk', () => mv.walk, (v) => { mv.walk = v; }), num('jump', () => mv.jump, (v) => { mv.jump = v; }), num('gravity', () => mv.gravity, (v) => { mv.gravity = v; }, { stepBy: 1 })));
    const air = mv.walk > 0 && mv.jump > 0 && mv.gravity > 0 ? mv.walk * 2 * Math.sqrt((2 * mv.jump) / mv.gravity) : 0;
    out.push(hint(`Walks ${mv.walk} m/s and stops when the keys do, jumps ${mv.jump} m high under ${mv.gravity} m/s², steering in the air: a running jump clears ${air.toFixed(1)} m on the level.`));
  } else out.push(hint('The arena\'s own: a run of 10 m/s with momentum, a 1.2 m jump under 20 m/s², air strafing.'));
  // body
  const bd = sp.body;
  out.push(row(el('label', { textContent: 'body' }), pick1(['the arena\'s', 'its own'], bd ? 'its own' : 'the arena\'s', (v) => { if (v === 'its own') sp.body = { ...ARENA_BODY }; else delete sp.body; }),
    btn('Roblox character', () => edit(() => { sp.body = { ...ROBLOX_BODY }; }), '2 studs across and 5 tall at 0.28 m a stud: 0.56 m by 1.4 m')));
  if (bd) {
    out.push(row(num('width', () => bd.width, (v) => { bd.width = v; }), num('height', () => bd.height, (v) => { bd.height = v; }),
      num('eye', () => bd.eye, (v) => { if (v === undefined) delete bd.eye; else bd.eye = v; }, { blank: tidy((bd.height || 0) - 0.2) })));
    out.push(hint(`A fighter ${bd.width} m across and ${bd.height} m tall: it passes a gap and a ceiling that size. ${2 * L.BODY_R[0]} to ${2 * L.BODY_R[1]} m wide, ${L.BODY_TOP[0]} to ${L.BODY_TOP[1]} m tall.`));
  } else out.push(hint(`The arena's own: ${ARENA_BODY.width} m across, ${ARENA_BODY.height} m tall.`));
  // the void
  out.push(row(num('void', () => sp.void, (v) => { if (v === undefined) delete sp.void; else sp.void = v; }, { blank: 'none', stepBy: 1 })));
  out.push(hint(sp.void === undefined ? 'A height in metres: a fighter below it dies by falling. None: the ground catches everyone.' : `A fighter below ${sp.void} m dies by falling.`));
  return out;
}

// What the picked box does (its eighth element, a part): nothing, or a kind
// with that kind's own numbers, and whether it is a ghost (no box: a zone)
function partPanel(s, b) {
  const sp = st.spec, p = readPart(b[7]), out = [h3('What it does')];
  const edit = (f) => { step(); f(); endStep(); changed(); renderSide(); };
  const kinds = el('select');
  kinds.append(el('option', { value: '', textContent: 'nothing: a plain box', selected: !p }));
  for (const k of PART_NAMES) kinds.append(el('option', { value: k, textContent: k, selected: p?.kind === k }));
  if (p && !PART_NAMES.includes(p.kind)) kinds.append(el('option', { value: p.kind, textContent: `${p.kind}?`, selected: true }));
  kinds.onchange = () => edit(() => setKind(sp, b, kinds.value));
  out.push(row(el('label', { textContent: 'part' }), kinds));
  if (!p) { out.push(hint('A part acts on the fighter touching it, in every mode: kill, bounce, ice, conveyor, ladder; and an obby\'s checkpoint and finish.')); return out; }
  const field = (label, k, opts) => num(label, () => p[k], (v) => setPartField(b, k, v), opts);
  if (p.kind === 'bounce') out.push(row(field('speed', 'speed', { blank: 14, stepBy: 1 })), hint(`m/s up, 1 to 60: ${p.speed ?? 14} throws a fighter ${(((p.speed ?? 14) ** 2) / (2 * (sp.movement?.gravity || 20))).toFixed(1)} m high here.`));
  if (p.kind === 'ice') out.push(row(field('grip', 'grip', { blank: 0.06, stepBy: 0.01 })), hint('0 to 1: 1 is a floor, 0 never lets you turn or stop.'));
  if (p.kind === 'ladder') out.push(row(field('speed', 'speed', { blank: 4.5, stepBy: 0.5 })), hint('m/s up and down, 0.5 to 25.'));
  if (p.kind === 'conveyor') {
    // a direction and a speed, in the world: the map holds a velocity in the structure's own frame
    const v = beltWorld(Array.isArray(p.velocity) ? p.velocity : [0, 0], s.turn), { angle, speed } = beltOf(v);
    const set = (a, sp1) => setPartField(b, 'velocity', beltLocal(beltVelocity(a, sp1), s.turn));
    const dirs = el('span', { className: 'dirs' }, ...[['←', 180, 'west'], ['↑', 270, 'north'], ['↓', 90, 'south'], ['→', 0, 'east']].map(([t, a, name]) => {
      const bt = btn(t, () => edit(() => set(a, speed || 3)), `carries ${name}`);
      bt.classList.toggle('on', speed > 0 && Math.abs(angle - a) < 0.5);
      return bt;
    }));
    out.push(row(el('label', { textContent: 'carries' }), dirs, num('degrees', () => angle, (a) => set(a, speed), { stepBy: 15 })));
    out.push(row(num('speed', () => speed, (v1) => set(angle, v1), { stepBy: 0.5 })), hint('m/s, up to 25 each way; 0 degrees is east (+x), 90 south (+z). The arrow drawn on the box is the way it carries.'));
  }
  if (p.kind === 'checkpoint') {
    const next = nextStage(sp);
    out.push(row(field('stage', 'stage', { stepBy: 1 }), ...(p.stage === undefined || next < p.stage ? [btn(`next free: ${next}`, () => edit(() => setPartField(b, 'stage', next)))] : [])));
  }
  const ghost = el('input', { type: 'checkbox', checked: !!p.ghost });
  ghost.onchange = () => edit(() => setPartField(b, 'ghost', ghost.checked || undefined));
  out.push(row(el('label', { textContent: 'ghost' }), ghost, el('span', { className: 'hint', textContent: 'no box: a zone nothing stops on' })));
  out.push(hint(`${PART_WHAT[p.kind] || 'Not a kind the game has.'}${p.kind === 'checkpoint' || p.kind === 'finish' ? (sp.mode === 'obby' ? '' : ' The map\'s mode is not obby, so it does nothing yet: set the mode under "How it plays".') : ''}`));
  return out;
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
      out.push(hint(sided() ? `On ${['red', 'blue', 'neither'][half(s[0], s[1], flagsNow())]}'s half: the nearer flag decides. Each team needs one.` : 'This map\'s mode has no sides: a spawn is where everyone starts.'), row(del(), btn('duplicate', duplicate, 'Ctrl+D')));
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
      // a mover (map.json "move"): back and forth along `by` from where it is built
      if (s.move) {
        const m = s.move;
        out.push(h3('Moves'));
        out.push(row(...['x', 'y', 'z'].map((c, k) => num(`by ${c}`, () => m.by[k], (v) => { m.by[k] = v; }))));
        out.push(row(num('seconds', () => m.seconds ?? 4, (v) => { m.seconds = v; }), num('wait', () => m.wait ?? 1, (v) => { m.wait = v; }), num('phase', () => m.phase ?? 0, (v) => { m.phase = v; })));
        out.push(row(el('label', { textContent: 'speed' }), pick1(['even', 'eased'], m.ease ? 'eased' : 'even', (v) => { m.ease = v === 'eased'; }),
          btn('stand still', () => { step(); delete s.move; endStep(); changed(); renderSide(); })));
        out.push(hint(`It moves that far (turned with the structure) in that many seconds, waits, comes back and waits again; phase starts it that many seconds later. A fighter on it rides it, and one in its way is pushed. At most ${L.MV_STEP_MAX * L.TICK_HZ} m/s. While it is picked the 3D view holds it where it is built.`));
      } else out.push(row(btn('make it move', () => { step(); s.move = { by: [0, 4, 0], seconds: 3, wait: 1 }; endStep(); changed(); renderSide(); }, 'a lift: up 4 m and back')));
      if (b) {
        const w = place(b, at, s.turn || 0);
        out.push(h3(`Box ${sel.b + 1} of ${list.length}`));
        const setW = (k) => (v) => { const r = place(b, at, s.turn || 0); r[k] = v; if (r[0] < r[3] && r[2] < r[5]) setBoxWorld(s, b, [r[0], r[2], r[3], r[5]]); };
        out.push(row(num('x0', () => tidy(w[0]), setW(0)), num('x1', () => tidy(w[3]), setW(3))));
        out.push(row(num('z0', () => tidy(w[2]), setW(2)), num('z1', () => tidy(w[5]), setW(5))));
        out.push(row(num('bottom', () => tidy(b[1] + at[1]), (v) => { b[1] = tidy(v - at[1]); }), num('top', () => tidy(b[4] + at[1]), (v) => { b[4] = tidy(v - at[1]); })));
        // a material, and a colour of the box's own over its look ('rock#7a6e5c'), as tools/roblox.mjs writes
        const cur = String(b[6] || 'metal'), at6 = cur.indexOf('#');
        const lookName = at6 < 0 ? cur : at6 ? cur.slice(0, at6) : 'plain', own = at6 < 0 ? '' : cur.slice(at6);
        const withLook = (lk, c) => (c ? (lk === 'plain' ? c : lk + c) : lk);
        const colour = el('input', { type: 'color', value: own || '#' + MAT_RGB[Math.max(0, MATERIALS.indexOf(lookName))].map((v) => v.toString(16).padStart(2, '0')).join(''), title: 'its own colour' });
        colour.oninput = () => { step(); b[6] = withLook(lookName, colour.value); changed(); };
        colour.onchange = endStep;
        out.push(row(el('label', { textContent: 'material' }), pick1(MATERIALS, lookName, (v) => { b[6] = withLook(v, own); }), colour,
          ...(own ? [btn('no colour', () => { step(); b[6] = lookName; endStep(); changed(); renderSide(); })] : [])));
        let lo = Infinity;
        for (let x = w[0]; x <= w[3]; x += Math.max(0.5, (w[3] - w[0]) / 6)) for (let z = w[2]; z <= w[5]; z += Math.max(0.5, (w[5] - w[2]) / 6)) lo = Math.min(lo, ground(x, z));
        out.push(hint(`the ground under it from ${lo.toFixed(2)} m. A fighter walks up a step of ${L.STEP} m; anything higher it jumps or goes round.`));
        out.push(row(btn('sit on the ground', () => { step(); const hgt = b[4] - b[1]; b[1] = tidy(Math.floor((lo - 0.2) * 10) / 10 - at[1]); b[4] = tidy(b[1] + hgt); endStep(); changed(); renderSide(); }),
          btn('look at it', flyToPick, 'fly the camera to it (C)'),
          ...(s.prefab ? [] : [btn('duplicate box', () => duplicate(false), 'another beside it; again, as far on again (Ctrl+D)')]), del(s.prefab ? 'delete structure' : 'delete box')));
        out.push(...partPanel(s, b));
      }
      out.push(row(btn('duplicate structure', () => duplicate(true)), ...(s.prefab ? [] : [btn('delete structure', () => { step(); sp.structures.splice(sel.s, 1); st.sel = null; endStep(); changed(); renderSide(); })])));
      out.push(hint(`Drag ${s.prefab ? 'to move the structure' : 'to move the box, Alt-drag its whole structure ("whole structure" above swaps the two)'}; in 2D drag a corner to size it, and click again in the same spot to pick the box under; in 3D drag a face's dot to size it and the arrow over it to raise it (or Shift-drag the box), Ctrl-drag to carry off a copy.`));
      break;
    }
  }
  return out;
}

// The course, for a map that is one (an obby, or anything with a checkpoint
// or a finish): its start, its stages in order and its finish, with what is
// missing or wrong said where it is. A line about a box flies to it.
function courseList() {
  const c = courseOf(st.spec, { ground });
  if (!c) return [];
  return [el('p', { className: 'hint', textContent: 'The course:' }), el('ul', { className: 'course' }, ...c.lines.map((l) => {
    const li = el('li', { textContent: l.text, className: `${l.level === 'ok' ? '' : l.level}${l.sel ? ' go' : ''}` });
    if (l.sel) li.onclick = () => { st.sel = l.sel; renderSide(); flyToPick(); };
    return li;
  }))];
}

function renderCheck() {
  // the header's pill and buttons say the same as this section, in a word
  const pill = $('ready');
  pill.className = `pill${st.error ? ' bad' : st.result ? ' ok' : ''}`;
  pill.textContent = st.error ? '✗ won\'t build yet' : st.result ? '✓ playable' : 'checking…';
  $('play-top').disabled = !st.result || !!st.error;
  $('play-top').title = st.error ? `not yet: ${st.error}` : 'the arena on this map, you and AI fighters, in a new tab';
  if (!checkBox || !st.spec) return;
  checkBox.replaceChildren();
  if (st.error) {
    checkBox.append(el('p', { className: 'bad', textContent: st.error }), hint('The game can\'t build the map until this is fixed. Everything else keeps working: fix it, and this turns green.'), ...courseList());
    return;
  }
  const m = st.result;
  if (!m) return;
  const lim = (n, max, what) => `${n} ${what} (of ${max})`;
  checkBox.append(
    el('p', { className: 'ok', textContent: 'Yes: the game builds it.' }),
    el('ul', { className: 'facts' }, ...[
      lim(m.boxes.length, L.NBOX, 'boxes') + ' in ' + lim(m.groups.length, L.NGROUP, 'structures'),
      `${lim(m.spawns.length, L.NSPAWN, 'spawns')}: ${sided() ? `red's half ${m.sides[0]}, blue's ${m.sides[1]}` : 'this mode has no sides, so they needn\'t be on each half'}`,
      ...(m.parts.length ? [`${lim(m.parts.length, L.NPART, 'parts')}: ${Object.entries(partCounts(st.spec)).map(([k, n]) => `${n} ${k}`).join(', ')}`] : []),
      lim(m.pads.length, L.NPAD, 'weapon pads'),
      lim(m.teleporters.length, L.NTELE, 'teleporters'),
      lim(m.hills.length, L.NHILL, 'hills'),
      m.race.length ? lim(m.race.length, NGATE, 'race gates') : 'no race (Dogfight\'s Ring Race needs 2 gates or more)',
      `ships fly up to ${m.ceiling} m; ${m.bytes.length.toLocaleString()} B in the wasm`,
      ...(m.void !== null ? [`a fighter below ${m.void} m dies by falling`] : []),
    ].map((t) => el('li', { textContent: t }))),
    ...courseList(),
    ...(st.report ? [el('p', { className: 'hint', textContent: st.reportFrom }), el('ul', {}, ...st.report.map((r) => el('li', { className: 'hint', textContent: r })))] : []),
    ...(st.brief ? [
      el('p', { className: 'hint', textContent: `Its game is ${st.brief.summary.scripts} scripts (${st.brief.summary.lines.toLocaleString('en')} lines). The port brief is them as files and port.md, what they do and lean on: hand it to an agent to write the rules here.` }),
      el('div', { className: 'row' }, btn('download the port brief', () => {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([zip(Object.fromEntries(Object.entries(st.brief.files).map(([f, t]) => [`${st.brief.name}-port/${f}`, t])))])), download: `${st.brief.name}-port.zip` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      })),
    ] : []),
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
      if (v === 'new-obby') newObby();
      else if (v === 'new') { const m = prompt('How big, in metres? (a square, 128 to 768)', '384'); if (m) newMap(clamp(Math.round(Number(m) / 8) * 8 || 384, 128, 768)); }
      else if (v === 'folder') await openFolder();
      else if (v === 'roblox') pick('.rbxl,.rbxlx,.rbxm,.rbxmx');
      else if (v === 'vox') pick('.vox');
      else if (v) await openBuiltIn(v);
    } catch (err) { if (err.name !== 'AbortError') say(`could not open it: ${err.message || err}`); }
  };
  $('save').onclick = save;
  $('play-top').onclick = () => playHere('arena');
  $('send-top').onclick = sendIn;
  $('ready').onclick = () => checkBox && checkBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  for (const b of $('modes').children) b.onclick = () => setMode(b.dataset.mode);
  $('snap').onchange = () => { hover3 = null; draw(); };
  $('whole').onchange = () => draw();
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
  if (k === 'c') { flyToPick(); return; }
  if (/^(arrow|page)/.test(k) && st.sel?.kind === 'box') { e.preventDefault(); nudge(k, e.shiftKey); return; }
  if (k === '0' || k === 'home') { fit(); return; }
  if (k === 'x') { st.xray = !st.xray; renderSide(); draw(); return; }
  const t = TOOLS.find((x) => x[1].toLowerCase() === k);
  if (t) setTool(t[0]);
});
// The picked box a grid step along: the arrows as the view the pointer was
// last in sees them (in 3D, the axes nearest the camera's), Page Up and Down
// its height; Shift four steps.
function nudge(key, big) {
  const d = (grid() || 0.1) * (big ? 4 : 1), sel = st.sel, s = st.spec.structures[sel.s];
  let fwd = [0, -1], right = [1, 0];
  if (st.mode === '3d' || (st.mode === 'split' && lastView === '3d')) {
    const c = Math.cos(cam3.yaw), z = Math.sin(cam3.yaw);
    fwd = Math.abs(c) >= Math.abs(z) ? [Math.sign(c), 0] : [0, Math.sign(z)];
    right = [-fwd[1], fwd[0]];
  }
  const by = { arrowup: [fwd[0], 0, fwd[1]], arrowdown: [-fwd[0], 0, -fwd[1]], arrowright: [right[0], 0, right[1]], arrowleft: [-right[0], 0, -right[1]], pageup: [0, 1, 0], pagedown: [0, -1, 0] }[key];
  if (!by) return;
  step();
  if (wholeFor(null, sel.s)) moveStruct(s, by[0] * d, by[2] * d, by[1] * d);
  else { const b = boxList(s)[sel.b]; setWorldBox(s, b, shifted(worldBox(s, b), by.map((v) => v * d))); }
  endStep(); changed(); renderSide();
}
addEventListener('keyup', (e) => { if (e.key === ' ') { space = false; setTool(st.tool); } });
addEventListener('beforeunload', keepDraft);
// a Roblox place or a voxel model dropped on the page
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  const f = [...(e.dataTransfer?.files || [])].find((x) => IMPORTS.some(([re]) => re.test(x.name)));
  if (!f) return;
  e.preventDefault();
  if (st.dirty && !confirm('Leave this map? Its changes are not saved.')) return;
  openFile(f);
});

// For the gates and whoever drives the page (as window.__studio is the
// studio's): the map, whether a change is still to be checked or drawn, and
// where a world point is on the page through the 3D view's camera.
window.__ed = {
  st,
  frames: () => frames3,
  busy: () => unchecked || drawing3 || draw3Queued || again3,
  boxes: () => boxes3().map((x) => ({ s: x.s, b: x.b, box: x.at, part: x.part })),
  at3: (q) => { if (!eye3) return null; const r = canvas3.getBoundingClientRect(), p = screenOf(eye3, q); return [r.left + p[0], r.top + p[1], p[2]]; },
  under3: (x, y) => { const r = canvas3.getBoundingClientRect(), u = eye3 && under3(x - r.left, y - r.top); return u ? { at: u.at, ground: !!u.ground, ...(u.box ? { s: u.box.s, b: u.box.b } : {}) } : null; },
  handles: () => { const r = canvas3.getBoundingClientRect(); return handles3().map((h) => ({ ...h, x: r.left + h.x, y: r.top + h.y })); },
  pick: (sel) => { st.sel = sel; renderSide(); draw(); },
  cam: () => ({ x: view.cx, z: view.cz, ...cam3 }),
  look: (o) => { flying++; Object.assign(cam3, o.cam || {}); if (o.at) { view.cx = o.at[0]; cam3.y = o.at[1]; view.cz = o.at[2]; } draw(); },
  files,
};

buildHeader();
setTool('select');
{
  let m = null;
  try { m = localStorage.getItem(MODE); } catch { /* none kept */ }
  setMode(m || (navigator.gpu && innerWidth > 1100 ? 'split' : '2d'));
}
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
