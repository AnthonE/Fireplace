#!/usr/bin/env node
// How maps/skyways/ was drawn: flight's map (src/flight.wat), its ground
// painted into height.png and surface.png and its structures, spawns and the
// team modes' objectives written to map.json, as tools/canyon.mjs drew Box
// Canyon's. The files it writes are the map; this is only the brush.
//   node tools/skyways.mjs [maps/skyways]
//
// A valley 640 m square, hills climbing at its edge for walls. A river canyon
// winds down it from north to south, 24 m deep, spanned by three stone
// arches; mesas and rock spires stand either side of it, a ridge with a notch
// cut through it runs across the north-east, four ring gates hang in the open
// air, two radio towers stand off the canyon. Each team has a hangar and a
// control tower on a flat pad at its end, red west, blue east; the spawns
// mirror each other across the middle. Ring Race goes through the rings and
// the outer arches in a loop (raceGates).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.mjs';
import { compileMap, SURFACES, formatSpec } from './map.mjs';
import { isMain } from './main.mjs';

export const BOUNDS = [192, 832, 192, 832];
export const ORIGIN = [172, 172]; // world x, z of the first pixel; 2 m a pixel
export const SIZE = [340, 340]; // the bounds and 20 m round them
const C = 512; // the middle
const FLOOR = 30; // the valley
const PAD = 31; // a base's pad
const DEPTH = 24; // the canyon, below the floor
const BASES = [{ name: 'red base', x: 262, turn: 0, team: 'red' }, { name: 'blue base', x: 762, turn: 180, team: 'blue' }];
// [x, z, radius, height over the floor]
const MESAS = [[340, 320, 38, 30], [352, 700, 42, 24], [684, 324, 40, 26], [672, 704, 36, 34], [420, 512, 26, 18]];
const SPIRES = [[402, 402, 6, 40], [450, 640, 7, 44], [300, 560, 5, 30], [612, 392, 6, 42], [574, 640, 7, 38], [724, 470, 5, 30], [380, 248, 6, 36], [644, 776, 6, 36]];
const RIDGE = { a: [600, 210], b: [812, 430], w: 14, h: 26, notch: 0.5, nw: 14 };
const TOWERS = [[606, 516], [362, 604]];
// [x, z, the ring's centre over the ground, faces x (1) or z (0)]
const RINGS = [[300, 420, 34, 1], [724, 604, 34, 1], [512, 248, 40, 0], [512, 776, 40, 0]];
const ARCHES = [300, 512, 724]; // z of each, across the canyon

const tidy = (v) => (typeof v === 'number' ? +v.toFixed(3) : v);
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const hash = (x, z) => { let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ 0x5bd1e995) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
function noise(x, z, p) {
  const gx = Math.floor(x / p), gz = Math.floor(z / p), fx = smooth(0, 1, x / p - gx), fz = smooth(0, 1, z / p - gz);
  const a = hash(gx, gz), b = hash(gx + 1, gz), c = hash(gx, gz + 1), d = hash(gx + 1, gz + 1);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

// The canyon's middle line: its x at z.
export const canyonX = (z) => C + 70 * Math.sin((z - 200) / 95) + 25 * Math.sin((z - 200) / 41);

// The ground at (x, z) in metres, and what it is (before steep ground turns to rock).
export function ground(x, z) {
  let h = FLOOR + (noise(x, z, 60) - 0.5) * 6 + (noise(x + 91, z, 17) - 0.5) * 1.6;
  let s = 'grass';
  // the edge: hills climbing from 50 m inside the bounds, rounded at the corners
  const dx = Math.max(0, Math.abs(x - C) - 270), dz = Math.max(0, Math.abs(z - C) - 270);
  const out = Math.hypot(dx, dz);
  if (out > 0) { h += 48 * smooth(0, 90, out) + 8 * (noise(x, z, 13) - 0.5) * smooth(0, 30, out); if (out > 45) s = 'rock'; }
  // mesas: flat tops on steep sides
  for (const [mx, mz, r, ht] of MESAS) {
    const d = Math.hypot(x - mx, z - mz) + (noise(x, z, 11) - 0.5) * 6;
    const t = 1 - smooth(r - 7, r, d);
    if (t > 0) h = Math.max(h, FLOOR + ht * t + (noise(x, z, 5) - 0.5) * t);
  }
  // spires
  for (const [sx, sz, r, ht] of SPIRES) {
    const d = Math.hypot(x - sx, z - sz);
    const t = 1 - smooth(r * 0.5, r * 1.6, d);
    if (t > 0) { h = Math.max(h, FLOOR + ht * Math.pow(t, 0.7)); if (t > 0.2) s = 'rock'; }
  }
  // the ridge, a notch through it halfway
  {
    const [ax, az] = RIDGE.a, [bx, bz] = RIDGE.b;
    const lx = bx - ax, lz = bz - az, l2 = lx * lx + lz * lz;
    const u = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
    const d = Math.hypot(x - ax - u * lx, z - az - u * lz);
    const along = Math.sqrt(l2) * Math.abs(u - RIDGE.notch);
    const t = (1 - smooth(RIDGE.w * 0.4, RIDGE.w, d)) * smooth(RIDGE.nw * 0.5, RIDGE.nw, along) * smooth(0, 0.08, u) * smooth(1, 0.92, u);
    if (t > 0) { h = Math.max(h, FLOOR + RIDGE.h * t + (noise(x, z, 6) - 0.5) * 2 * t); if (t > 0.5) s = 'rock'; }
  }
  // the bases: a flat pad round each
  for (const b of BASES) {
    const d = Math.hypot(x - b.x, z - C);
    const w = 1 - smooth(34, 46, d);
    h += (PAD - h) * w;
    if (Math.abs(x - b.x) <= 15 && Math.abs(z - C) <= 16) s = 'metal';
  }
  // the canyon: sheer walls 7 to 18 m out from its middle, a sandy bed
  const cd = Math.abs(x - canyonX(z));
  const cut = 1 - smooth(7, 18, cd + (noise(x, z, 9) - 0.5) * 3);
  if (cut > 0) { h -= DEPTH * cut * (1 - smooth(0, 60, out)); if (cd < 9) s = 'sand'; }
  return { h, s };
}

// A team's hangar, about its pad's floor at its middle, open to +x: walls and
// a roof a ship can fly into, and a control tower beside it.
function basePrefab() {
  const B = [];
  B.push([-14, 0, -15, -12, 12, 15, 'metal']); // back
  B.push([-12, 0, -15, 14, 12, -13, 'metal'], [-12, 0, 13, 14, 12, 15, 'metal']); // sides
  B.push([-14, 12, -15, 14, 13.5, 15, 'metal'], [-14, 13.5, -4, 14, 14.5, 4, 'dark']); // the roof, its stripe in the team's colour
  B.push([-4, 0, 22, 4, 28, 30, 'metal'], [-5, 28, 21, 5, 31, 31, 'dark'], [-1, 31, 25, 1, 36, 27, 'light']); // the control tower
  return B.map((b) => b.map(tidy));
}

// Ring Race's course (src/flight.wat $f_race), clockwise round the map: the
// west ring, the north ring, the arch at z 300, the east ring, the south
// ring, the arch at z 724. A ring's gate is its opening's centre, 8 m round
// (the opening is 12 m across); an arch's the middle of the gap under its
// lintel, 11 m round.
function raceGates() {
  const ring = (x, z) => { const [, , up] = RINGS.find((r) => r[0] === x && r[1] === z); return [x, ground(x, z).h + up, z, 8]; };
  const arch = (z) => [canyonX(z), FLOOR + 11, z, 11];
  return [ring(300, 420), ring(512, 248), arch(300), ring(724, 604), ring(512, 776), arch(724)].map((g) => g.map(tidy));
}

export function skyways() {
  const g = (x, z) => ground(x, z).h;
  const at = (b) => [b.x, PAD, C];
  const structures = BASES.map((b) => ({ name: b.name, prefab: 'base', at: at(b), turn: b.turn, tint: { dark: b.team } }));
  // the arches: a pillar on each rim, a lintel across, 20 m over the valley
  for (const z of ARCHES) {
    const cx = canyonX(z);
    const top = FLOOR + 22;
    const foot = (x) => Math.min(g(x - 3, z - 3), g(x + 3, z + 3), g(x - 3, z + 3), g(x + 3, z - 3)) - 2;
    structures.push({ name: `arch at ${z}`, boxes: [
      [cx - 28, foot(cx - 25), z - 3, cx - 22, top, z + 3, 'rock'],
      [cx + 22, foot(cx + 25), z - 3, cx + 28, top, z + 3, 'rock'],
      [cx - 28, top, z - 3.5, cx + 28, top + 4, z + 3.5, 'rock'],
    ].map((b) => b.map(tidy)) });
  }
  // the ring gates: four bars round a 12 m opening
  for (const [x, z, up, fx] of RINGS) {
    const y = g(x, z) + up;
    const bars = [[-1, 6, -8, 1, 8, 8], [-1, -8, -8, 1, -6, 8], [-1, -6, -8, 1, 6, -6], [-1, -6, 6, 1, 6, 8]];
    structures.push({ name: `ring at ${x}, ${z}`, boxes: bars.map(([a, b, c, d, e, f]) => (fx
      ? [x + a, y + b, z + c, x + d, y + e, z + f, 'light']
      : [x + c, y + b, z + a, x + f, y + e, z + d, 'light']).map(tidy)) });
  }
  // the radio towers: a mast, a light on top
  for (const [x, z] of TOWERS) {
    const y = g(x, z) - 1;
    structures.push({ name: `tower at ${x}, ${z}`, boxes: [[x - 3, y, z - 3, x + 3, y + 50, z + 3, 'metal'], [x - 4, y + 50, z - 4, x + 4, y + 52, z + 4, 'dark'], [x - 1, y + 52, z - 1, x + 1, y + 57, z + 1, 'light']].map((b) => b.map(tidy)) });
  }
  // spawns: red's half, open air 25 m over the ground clear of everything, mirrored for blue
  const spec = { name: 'Skyways', by: 'AnthonE', about: "Dogfight's sky over open ground, with a ring race through its gates.", bounds: BOUNDS };
  const red = [[300, 512], [300, 470], [300, 554], [330, 440], [330, 584], [260, 470], [250, 584], [380, 470],
    [380, 560], [230, 300], [230, 724], [300, 260], [300, 764], [440, 230], [430, 760], [460, 440]];
  const spawns = [];
  for (const [x, z] of red) spawns.push([x, z], [2 * C - x, z]);
  return {
    ...spec,
    ceiling: 0, // set below, from the ground
    terrain: { origin: ORIGIN, height: 'height.png', scale: 1 / 256, base: 0, surface: 'surface.png' },
    prefabs: { base: basePrefab() },
    structures,
    spawns,
    flags: BASES.map((b) => ({ team: b.team, at: [b.x, C] })),
    ball: { at: [C, C] },
    hills: [{ at: [C, C], radius: 10 }, { at: [400, 512], radius: 10 }, { at: [624, 512], radius: 10 }],
    race: raceGates(),
  };
}

export function paint() {
  const [W, H] = SIZE;
  const hgt = new Float64Array(W * H), sur = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const { h, s } = ground(ORIGIN[0] + 2 * i, ORIGIN[1] + 2 * j);
    hgt[j * W + i] = h; sur.push(s);
  }
  const pal = { grass: [77, 128, 51], rock: [122, 110, 92], sand: [184, 158, 107], metal: [128, 143, 158] };
  if (!SURFACES.every((n) => pal[n])) throw new Error('a surface without a colour');
  const h16 = new Uint16Array(W * H), rgb = new Uint8Array(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    // steep ground is rock: a rise of more than a metre a metre to a neighbour
    const n = (a, b) => hgt[Math.min(H - 1, Math.max(0, j + b)) * W + Math.min(W - 1, Math.max(0, i + a))];
    const slope = Math.max(Math.abs(n(1, 0) - n(-1, 0)), Math.abs(n(0, 1) - n(0, -1))) / 4;
    let s = sur[k];
    if (slope > 1 && s === 'grass') s = 'rock';
    // to an eighth of a metre: a ship can't tell, and the wasm carries the image a third the size gzipped
    h16[k] = Math.max(0, Math.min(65535, Math.round(hgt[k] * 8) * 32));
    rgb.set(pal[s], 3 * k);
  }
  return { hgt: h16, rgb };
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] || 'maps/skyways';
  mkdirSync(dir, { recursive: true });
  const { hgt, rgb } = paint();
  writeFileSync(join(dir, 'height.png'), encodePng({ width: SIZE[0], height: SIZE[1], channels: 1, depth: 16, data: hgt }));
  writeFileSync(join(dir, 'surface.png'), encodePng({ width: SIZE[0], height: SIZE[1], channels: 3, depth: 8, data: rgb }));
  const spec = skyways();
  // the ceiling: 70 m over the highest ground inside the bounds
  let top = 0;
  for (let j = 0; j < SIZE[1]; j++) for (let i = 0; i < SIZE[0]; i++) {
    const x = ORIGIN[0] + 2 * i, z = ORIGIN[1] + 2 * j;
    if (x >= BOUNDS[0] && x <= BOUNDS[1] && z >= BOUNDS[2] && z <= BOUNDS[3]) top = Math.max(top, hgt[j * SIZE[0] + i] / 256);
  }
  spec.ceiling = Math.ceil(top) + 70;
  writeFileSync(join(dir, 'map.json'), formatSpec(spec));
  const m = compileMap(dir);
  console.log(`${m.name}: ${m.boxes.length} boxes in ${m.groups.length} structures, ${m.spawns.length} spawns, ceiling ${m.ceiling} m (highest ground ${top.toFixed(1)}), ${m.bytes.length} B`);
}
