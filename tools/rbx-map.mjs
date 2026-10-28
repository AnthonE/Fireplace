// A Roblox place made into an arena map, with no Node in it: tools/roblox.mjs
// runs it on a file and writes maps/<name>/, the map editor on a file dropped
// into the page (docs/roblox.md). What comes over is what a fighter can stand
// on and hide behind: the Workspace's solid parts, the smooth terrain, the
// spawn locations and their teams. The place's scripts, sounds, meshes'
// shapes and everything outside the Workspace stay behind, and the report
// says what did.
//
// A map's boxes stand square to the axes and there are at most NBOX of them,
// so each part is taken as a solid (a block, a wedge, a cylinder, a ball, a
// union's own parts less its negated ones) and:
//   - blocks square to the axes are their boxes, exactly;
//   - anything else is cut into columns 0.5 m across (`cell`), each column's
//     solid spans rounded to 0.25 m (`rise`), and runs of equal columns
//     joined into boxes, so a ramp becomes stairs a fighter walks up (the
//     arena's STEP is 0.5 m) and a turned wall a row of posts;
//   - big flat blocks with nothing under them (a baseplate, a floor on the
//     ground) are the ground instead of boxes, and so is the terrain: the
//     top of its solid voxels (water drained), its material the surface;
//   - where there is no ground, a pit and a void under it (map.json "void").
// Then the boxes are made to fit the budget, as little changed as will do
// (fit, below), the report saying how.
//
// A stud is 0.28 m (Roblox's own figure; `scale`). The arena's fighter is
// 1.8 m and jumps 1.2 m; a Roblox character is about 5 studs (1.4 m) and
// jumps 7.2 (2 m), so a ledge built to be jumped to may need a step.
import { ancestor, path, readRoblox } from './rbx-file.mjs';
import { SURFACES, SURFACE_RGB } from './map-compile.mjs';
import * as L from '../src/layout.mjs';

export const OPTIONS = {
  scale: 0.28, // metres a stud
  cell: 0.5, // a column's width, m, for parts not square to the axes
  rise: 0.25, // a column's spans rounded to this, m
  groundArea: 150, // a flat block this big (m^2) with nothing under it is ground
  anchored: false, // only anchored parts (an unanchored one is kept by default: a classic place's bricks are held by joints, not anchors)
  budget: L.NBOX, // boxes the map may have
  from: '', // an instance's path (ServerStorage.Maps.Castle) to take as the place, for a game that keeps its maps in storage
  name: '',
};

const VEHICLE = new Set(['VehicleSeat', 'SkateboardPlatform']);
const PARTS = new Set(['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'SpawnLocation', 'Seat', 'VehicleSeat', 'SkateboardPlatform',
  'MeshPart', 'UnionOperation', 'IntersectOperation', 'PartOperation', 'FlagStand', 'Platform']);
const SCRIPTS = new Set(['Script', 'LocalScript', 'ModuleScript']);

// Roblox's Enum.Material by number, to the box looks: metal's panels, rock's
// grain, neon's glow (light), the rest a plain colour
const METAL = new Set([1040, 1056, 1072, 1088]);
const ROCKY = new Set([512, 528, 784, 788, 800, 804, 816, 820, 832, 836, 848, 864, 880, 896, 912, 1280, 1284, 1296, 1328, 1344, 1360, 1376, 1392, 1536, 1552]);
const look = (m) => (m === 288 ? 'light' : METAL.has(m) ? 'metal' : ROCKY.has(m) ? 'rock' : 'plain');
// and to the ground's surfaces: a natural material its own, anything else the nearest colour
const GRASSY = new Set([1280, 1284, 1344, 1360]), SANDY = new Set([1296, 912]), STONY = new Set([784, 788, 800, 804, 816, 820, 832, 836, 848, 864, 880, 896, 1376, 1392]);
function surfaceOf(m, rgb) {
  if (GRASSY.has(m)) return 0;
  if (SANDY.has(m)) return 2;
  if (METAL.has(m)) return 3;
  if (STONY.has(m)) return 1;
  let best = 1, bd = Infinity;
  SURFACES.forEach((n, k) => { const c = SURFACE_RGB[n], d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2; if (d < bd) { bd = d; best = k; } });
  return best;
}
// terrain's own materials (SmoothGrid's numbering) to the surfaces
const TERRAIN_SURFACE = [1, 1, 0, 1, 1, 1, 2, 1, 1, 1, 1, 2, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1];

// BrickColor, the palette a part's colour was before Color3 (a place from
// before 2016 has only this): number to 0xrrggbb, from rbx-dom's
// rbx_types/src/brick_color.rs (MIT)
const BRICK = {
  1:0xf2f3f3, 2:0xa1a5a2, 3:0xf9e999, 5:0xd7c59a, 6:0xc2dab8, 9:0xe8bac8, 11:0x80bbdb, 12:0xcb8442, 18:0xcc8e69,
  21:0xc4281c, 22:0xc470a0, 23:0x0d69ac, 24:0xf5cd30, 25:0x624732, 26:0x1b2a35, 27:0x6d6e6c, 28:0x287f47, 29:0xa1c48c,
  36:0xf3cf9b, 37:0x4b974b, 38:0xa05f35, 39:0xc1cade, 40:0xececec, 41:0xcd544b, 42:0xc1dff0, 43:0x7bb6e8, 44:0xf7f18d,
  45:0xb4d2e4, 47:0xd9856c, 48:0x84b68d, 49:0xf8f184, 50:0xece8de, 100:0xeec4b6, 101:0xda867a, 102:0x6e99ca,
  103:0xc7c1b7, 104:0x6b327c, 105:0xe29b40, 106:0xda8541, 107:0x008f9c, 108:0x685c43, 110:0x435493, 111:0xbfb7b1,
  112:0x6874ac, 113:0xe5adc8, 115:0xc7d23c, 116:0x55a5af, 118:0xb7d7d5, 119:0xa4bd47, 120:0xd9e4a7, 121:0xe7ac58,
  123:0xd36f4c, 124:0x923978, 125:0xeab892, 126:0xa5a5cb, 127:0xdcbc81, 128:0xae7a59, 131:0x9ca3a8, 133:0xd5733d,
  134:0xd8dd56, 135:0x74869d, 136:0x877c90, 137:0xe09864, 138:0x958a73, 140:0x203a56, 141:0x27462d, 143:0xcfe2f7,
  145:0x7988a1, 146:0x958ea3, 147:0x938767, 148:0x575857, 149:0x161d32, 150:0xabadac, 151:0x789082, 153:0x957977,
  154:0x7b2e2f, 157:0xfff67b, 158:0xe1a4c2, 168:0x756c62, 176:0x97695b, 178:0xb48455, 179:0x898788, 180:0xd7a94b,
  190:0xf9d62e, 191:0xe8ab2d, 192:0x694028, 193:0xcf6024, 194:0xa3a2a5, 195:0x4667a4, 196:0x23478b, 198:0x8e4285,
  199:0x635f62, 200:0x828a5d, 208:0xe5e4df, 209:0xb08e44, 210:0x709578, 211:0x79b5b5, 212:0x9fc3e9, 213:0x6c81b7,
  216:0x904c2a, 217:0x7c5c46, 218:0x96709f, 219:0x6b629b, 220:0xa7a9ce, 221:0xcd6298, 222:0xe4adc8, 223:0xdc9095,
  224:0xf0d5a0, 225:0xebb87f, 226:0xfdea8d, 232:0x7dbbdd, 268:0x342b75, 301:0x506d54, 302:0x5b5d69, 303:0x0010b0,
  304:0x2c651d, 305:0x527cae, 306:0x335882, 307:0x102adc, 308:0x3d1585, 309:0x348e40, 310:0x5b9a4c, 311:0x9fa1ac,
  312:0x592259, 313:0x1f801d, 314:0x9fadc0, 315:0x0989cf, 316:0x7b007b, 317:0x7c9c6b, 318:0x8aab85, 319:0xb9c4b1,
  320:0xcacbd1, 321:0xa75e9b, 322:0x7b2f7b, 323:0x94be81, 324:0xa8bd99, 325:0xdfdfde, 327:0x970000, 328:0xb1e5a6,
  329:0x98c2db, 330:0xff98dc, 331:0xff5959, 332:0x750000, 333:0xefb838, 334:0xf8d96d, 335:0xe7e7ec, 336:0xc7d4e4,
  337:0xff9494, 338:0xbe6862, 339:0x562424, 340:0xf1e7c7, 341:0xfef3bb, 342:0xe0b2d0, 343:0xd490bd, 344:0x965555,
  345:0x8f4c2a, 346:0xd3be96, 347:0xe2dcbc, 348:0xedeaea, 349:0xe9dada, 350:0x883e3e, 351:0xbc9b5d, 352:0xc7ac78,
  353:0xcabfa3, 354:0xbbb3b2, 355:0x6c584b, 356:0xa0844f, 357:0x958988, 358:0xaba89e, 359:0xaf9483, 360:0x966766,
  361:0x564236, 362:0x7e683f, 363:0x69665c, 364:0x5a4c42, 365:0x6a3909, 1001:0xf8f8f8, 1002:0xcdcdcd, 1003:0x111111,
  1004:0xff0000, 1005:0xffb000, 1006:0xb480ff, 1007:0xa34b4b, 1008:0xc1be42, 1009:0xffff00, 1010:0x0000ff,
  1011:0x002060, 1012:0x2154b9, 1013:0x04afec, 1014:0xaa5500, 1015:0xaa00aa, 1016:0xff66cc, 1017:0xffaf00,
  1018:0x12eed4, 1019:0x00ffff, 1020:0x00ff00, 1021:0x3a7d15, 1022:0x7f8e64, 1023:0x8c5b9f, 1024:0xafddff,
  1025:0xffc9c9, 1026:0xb1a7ff, 1027:0x9ff3e9, 1028:0xccffcc, 1029:0xffffcc, 1030:0xffcc99, 1031:0x6225d1,
  1032:0xff00bf
};
const brickRGB = (n) => { const v = BRICK[n] ?? BRICK[194]; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
// A part's colour: Color3uint8 (since 2016), else Color3, else its BrickColor
const colourOf = (p) => p.Color3uint8 || (p.Color ? p.Color.map((v) => v * 255) : brickRGB(p.BrickColor));

const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const tidy = (v) => Math.round(v * 1000) / 1000;
const near = (a, b, e = 1e-4) => Math.abs(a - b) < e;

// ---- solids: convex shapes as planes n . x <= d, in metres

// A shape's planes about its own centre, half-size h.
function localPlanes(kind, [hx, hy, hz]) {
  const box = [[1, 0, 0, hx], [-1, 0, 0, hx], [0, 1, 0, hy], [0, -1, 0, hy], [0, 0, 1, hz], [0, 0, -1, hz]];
  if (kind === 'wedge') return [...box, [0, hz, -hy, 0]]; // the slope faces front (-z) and up: full height at the back
  if (kind === 'corner') return [...box, [-hy, hx, 0, 0], [0, hz, hy, 0]]; // up to a peak at +x, -z
  if (kind === 'cylinder') { // along x; an octagon across
    const r = Math.min(hy, hz), c = Math.SQRT1_2;
    return [[1, 0, 0, hx], [-1, 0, 0, hx], ...[[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0, c, c], [0, c, -c], [0, -c, c], [0, -c, -c]].map(([a, b, d]) => [a, b, d, r])];
  }
  if (kind === 'ball') {
    const r = Math.min(hx, hy, hz), k = 1 / Math.sqrt(3);
    const out = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((n) => [...n, r]);
    for (const a of [-k, k]) for (const b of [-k, k]) for (const c of [-k, k]) out.push([a, b, c, r]);
    return out;
  }
  return box;
}

// A solid: its planes in the world, its bounds, whether it is a block square
// to the axes, and whether it is a block turned only about the vertical (its
// top flat), with its footprint's area.
function solid(kind, cf, half) {
  const R = cf.r, P = cf.p;
  const planes = localPlanes(kind, half).map(([a, b, c, d]) => {
    const n = [R[0] * a + R[1] * b + R[2] * c, R[3] * a + R[4] * b + R[5] * c, R[6] * a + R[7] * b + R[8] * c];
    return [n[0], n[1], n[2], d + n[0] * P[0] + n[1] * P[1] + n[2] * P[2]];
  });
  const e = [0, 1, 2].map((i) => Math.abs(R[3 * i]) * half[0] + Math.abs(R[3 * i + 1]) * half[1] + Math.abs(R[3 * i + 2]) * half[2]);
  const square = kind === 'block' && R.every((v) => near(v, 0) || near(Math.abs(v), 1));
  const upright = kind === 'block' && near(Math.abs(R[4]), 1);
  return { planes, box: [P[0] - e[0], P[1] - e[1], P[2] - e[2], P[0] + e[0], P[1] + e[1], P[2] + e[2]], square, upright, area: 4 * half[0] * half[2] };
}

// The span [lo, hi] of a vertical line at (x, z) inside the planes, or null.
// `grow` widens each plane by the reach of a cell's square (c / 2), so a
// column is inside where any of its cell is.
function span(planes, x, z, grow) {
  let lo = -Infinity, hi = Infinity;
  for (const [nx, ny, nz, d] of planes) {
    const r = d + grow * (Math.abs(nx) + Math.abs(nz)) - nx * x - nz * z;
    if (Math.abs(ny) < 1e-9) { if (r < -1e-9) return null; }
    else if (ny > 0) hi = Math.min(hi, r / ny);
    else lo = Math.max(lo, r / ny);
    if (lo >= hi) return null;
  }
  return [lo, hi];
}

// Spans a column: the union of `pos`, less `neg`.
function column(pos, neg, x, z, c) {
  let out = [];
  for (const s of pos) { const v = span(s.planes, x, z, c / 2); if (v) out.push(v); }
  if (!out.length) return out;
  out.sort((a, b) => a[0] - b[0]);
  const merged = [out[0].slice()];
  for (const [a, b] of out.slice(1)) { const m = merged[merged.length - 1]; if (a <= m[1]) m[1] = Math.max(m[1], b); else merged.push([a, b]); }
  out = merged;
  for (const s of neg) {
    const v = span(s.planes, x, z, -c / 2);
    if (!v) continue;
    out = out.flatMap(([a, b]) => (v[1] <= a || v[0] >= b ? [[a, b]] : [[a, v[0]], [v[1], b]].filter(([p, q]) => q - p > 1e-6)));
  }
  return out;
}

// Columns to boxes: each column's spans rounded to `rise`, then rectangles of
// equal columns grown greedily, x first.
function rasterize(obj, c, rise) {
  const lo = obj.pos.reduce((m, s) => [Math.min(m[0], s.box[0]), Math.min(m[1], s.box[2])], [Infinity, Infinity]);
  const hi = obj.pos.reduce((m, s) => [Math.max(m[0], s.box[3]), Math.max(m[1], s.box[5])], [-Infinity, -Infinity]);
  // a huge part gets wider columns, at most 40 000 of them
  while (((hi[0] - lo[0]) / c) * ((hi[1] - lo[1]) / c) > 40000) c *= 2;
  const x0 = Math.floor(lo[0] / c) * c, z0 = Math.floor(lo[1] / c) * c;
  const nx = Math.max(1, Math.ceil((hi[0] - x0) / c)), nz = Math.max(1, Math.ceil((hi[1] - z0) / c));
  const keys = new Array(nx * nz), spans = new Map();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const s = column(obj.pos, obj.neg, x0 + (i + 0.5) * c, z0 + (j + 0.5) * c, c).map(([a, b]) => {
      let p = Math.round(a / rise) * rise, q = Math.round(b / rise) * rise;
      if (q <= p) q = p + rise;
      return [p, q];
    });
    const k = s.map((v) => v.join(',')).join(';');
    keys[j * nx + i] = k;
    if (k) spans.set(k, s);
  }
  const out = [], done = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = keys[j * nx + i];
    if (done[j * nx + i] || !k) continue;
    let w = 1;
    while (i + w < nx && !done[j * nx + i + w] && keys[j * nx + i + w] === k) w++;
    let h = 1;
    grow: while (j + h < nz) {
      for (let u = 0; u < w; u++) if (done[(j + h) * nx + i + u] || keys[(j + h) * nx + i + u] !== k) break grow;
      h++;
    }
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) done[(j + v) * nx + i + u] = 1;
    for (const [p, q] of spans.get(k)) out.push([x0 + i * c, p, z0 + j * c, x0 + (i + w) * c, q, z0 + (j + h) * c]);
  }
  return out;
}

// ---- the place's parts

const cfMul = (a, b) => {
  const R = a.r, S = b.r, r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[3 * i + j] = R[3 * i] * S[j] + R[3 * i + 1] * S[3 + j] + R[3 * i + 2] * S[6 + j];
  const p = [0, 1, 2].map((i) => a.p[i] + R[3 * i] * b.p[0] + R[3 * i + 1] * b.p[1] + R[3 * i + 2] * b.p[2]);
  return { p, r };
};
const scaled = (cf, s) => ({ p: cf.p.map((v) => v * s), r: cf.r });

function kindOf(inst) {
  const sh = inst.props.shape ?? inst.props.Shape;
  if (inst.class === 'WedgePart') return 'wedge';
  if (inst.class === 'CornerWedgePart') return 'corner';
  if (inst.class === 'Part' || inst.class === 'SpawnLocation' || inst.class === 'Seat') {
    return sh === 0 ? 'ball' : sh === 2 ? 'cylinder' : sh === 3 ? 'wedge' : sh === 4 ? 'corner' : 'block';
  }
  return 'block';
}

// A part as solids in metres: { pos, neg, approx } (approx: its shape isn't in
// the file, so it is its bounds: a mesh, or a union saved without its parts).
function partSolids(inst, s, zstd, at = null) {
  const cf = at || inst.props.CFrame || { p: [0, 0, 0], r: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  const size = inst.props.size || inst.props.Size || [1, 1, 1];
  const isUnion = /Operation$/.test(inst.class);
  if (isUnion && inst.props.ChildData?.length) {
    try {
      const kids = readRoblox(inst.props.ChildData, { zstd });
      const init = inst.props.InitialSize || size;
      const k = size.map((v, i) => (init[i] ? v / init[i] : 1));
      const pos = [], neg = [];
      for (const ch of kids.roots) {
        if (!PARTS.has(ch.class) && ch.class !== 'NegateOperation') continue;
        const ccf = ch.props.CFrame || { p: [0, 0, 0], r: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
        const cs = (ch.props.size || [1, 1, 1]).map((v, j) => v * (Math.abs(ccf.r[j]) * k[0] + Math.abs(ccf.r[3 + j]) * k[1] + Math.abs(ccf.r[6 + j]) * k[2]));
        const local = { p: ccf.p.map((v, j) => v * k[j]), r: ccf.r };
        const sub = partSolids({ ...ch, props: { ...ch.props, size: cs } }, s, zstd, cfMul(cf, local));
        if (ch.class === 'NegateOperation') neg.push(...sub.pos);
        else { pos.push(...sub.pos); neg.push(...sub.neg); }
      }
      if (pos.length) return { pos, neg, approx: false };
    } catch { /* a ChildData we can't read: its bounds below */ }
  }
  const kind = isUnion || inst.class === 'MeshPart' ? 'block' : kindOf(inst);
  const half = size.map((v) => (v * s) / 2);
  const one = solid(kind, scaled(cf, s), half);
  return { pos: [one], neg: [], approx: isUnion || inst.class === 'MeshPart' };
}

// ---- terrain

// SmoothGrid's voxels as columns: for each 4-stud column (x, z) the top of
// its solid ground (water and air are not ground) and the material there.
export function terrainColumns(grid) {
  const cols = new Map(); // x * 65536 + z (offset) -> [top studs, material]
  if (!grid || grid.length < 3) return cols;
  if (grid[0] !== 1 || grid[1] !== 5) throw new Error(`a SmoothGrid of an unknown kind (${grid[0]}, ${grid[1]})`);
  let i = 2;
  const cur = [0, 0, 0];
  while (i + 12 <= grid.length) {
    for (let a = 0; a < 3; a++) {
      const v = (grid[i + a] << 24) | (grid[i + 3 + a] << 16) | (grid[i + 6 + a] << 8) | grid[i + 9 + a];
      cur[a] += v;
    }
    i += 12;
    const [cx, cy, cz] = cur;
    let n = 0;
    while (n < 32768) {
      if (i >= grid.length) throw new Error('a SmoothGrid that ends inside a chunk');
      const flag = grid[i++];
      const mat = flag & 63;
      let occ = mat ? 1 : 0, count = 1;
      if (flag & 64) occ = grid[i++] / 255;
      if (flag & 128) { const c = grid[i++]; if (c === 0) i++; else count = c + 1; }
      if (mat > 1 && occ > 0) {
        for (let k = 0; k < count; k++) {
          const v = n + k, x = v & 31, z = (v >> 5) & 31, y = v >> 10;
          const wx = cx * 32 + x, wz = cz * 32 + z;
          const top = (cy * 32 + y) * 4 + occ * 4;
          const key = (wx + 32768) * 65536 + (wz + 32768);
          const was = cols.get(key);
          if (!was || top > was[0]) cols.set(key, [top, mat]);
        }
      }
      n += count;
    }
  }
  return cols;
}

// ---- the conversion

export function robloxToMap(doc, opts = {}) {
  const o = { ...OPTIONS, ...opts };
  const s = o.scale;
  const notes = [];
  const count = { parts: 0, kept: 0, square: 0, cut: 0, approx: 0, ground: 0, loose: 0, passable: 0, invisible: 0, characters: 0, vehicles: 0, outside: 0, scripts: 0 };
  const ws = doc.instances.find((x) => x.class === 'Workspace');
  let top = ws ? [ws] : doc.roots;
  if (o.from) {
    const at = doc.instances.find((x) => path(x) === o.from) || doc.instances.find((x) => path(x).endsWith('.' + o.from));
    if (!at) throw new Error(`no ${o.from} in the place`);
    top = [at];
  }
  const under = (x) => { for (let p = x; p; p = p.parent) if (top.includes(p)) return true; return false; };
  count.scripts = doc.instances.filter((x) => SCRIPTS.has(x.class)).length;
  const isCharacter = (x) => { for (let p = x.parent; p; p = p.parent) if (p.class === 'Model' && p.children.some((k) => k.class === 'Humanoid')) return true; return false; };
  // an unanchored part in a model with a seat to drive is a vehicle, which moves
  const isVehicle = (x) => { for (let p = x.parent; p && p !== ws; p = p.parent) if (p.class === 'Model' && p.children.some((k) => VEHICLE.has(k.class))) return true; return VEHICLE.has(x.class); };

  // the parts that are the place's solid ground and walls
  const objs = [], spawnParts = [];
  for (const inst of doc.instances) {
    if (!PARTS.has(inst.class)) continue;
    count.parts++;
    if (!under(inst)) { count.outside++; continue; }
    if (ancestor(inst, 'Camera') || ancestor(inst, 'Tool') || ancestor(inst, 'Accessory') || isCharacter(inst)) { count.characters++; continue; }
    const p = inst.props;
    if (p.CanCollide === false) { count.passable++; continue; }
    if ((p.Transparency ?? 0) >= 0.95) { count.invisible++; continue; }
    if (p.Anchored === false && o.anchored) { count.loose++; continue; }
    if (p.Anchored === false && isVehicle(inst)) { count.vehicles++; continue; }
    const { pos, neg, approx } = partSolids(inst, s, o.zstd);
    if (!pos.length) continue;
    count.kept++;
    if (approx) count.approx++;
    const colour = colourOf(p);
    const lk = look(p.Material ?? 256);
    const model = ancestor(inst.parent, 'Model');
    const obj = { inst, pos, neg, colour, look: lk, material: p.Material ?? 256, key: `${lk}${hex(colour)}`, model: model ? model.name : '' };
    objs.push(obj);
    if (inst.class === 'SpawnLocation' && p.Enabled !== false) spawnParts.push({ obj, team: p.Neutral === false ? p.TeamColor : null });
  }

  // terrain columns, in metres
  const terrain = doc.instances.find((x) => x.class === 'Terrain' && under(x));
  let cols = new Map();
  try { cols = terrainColumns(terrain?.props.SmoothGrid); } catch (e) { notes.push(`the terrain could not be read (${e.message}); left out`); }

  // ---- the ground: big flat blocks with nothing under them, and the terrain
  const isFlat = (ob) => ob.pos.length === 1 && !ob.neg.length && ob.pos[0].upright && ob.inst.class !== 'SpawnLocation' && ob.pos[0].area >= o.groundArea;
  const ground = new Set();
  for (const f of objs.filter(isFlat)) {
    const b = f.pos[0].box, e = 0.05;
    const below = objs.some((ob) => ob !== f && ob.pos.some((sd) => {
      const c = sd.box;
      if (c[3] <= b[0] + e || c[0] >= b[3] - e || c[5] <= b[2] + e || c[2] >= b[5] - e) return false;
      if (c[1] >= b[4] - e) return false; // above its top: standing on it
      return !(isFlat(ob) && c[4] <= b[4] + e); // another floor under it is fine (stacked plates)
    }));
    if (!below) ground.add(f);
  }
  count.ground = ground.size;

  // ---- where the play is: the parts that aren't ground, the terrain and the
  // spawns, and the ground round them (a 2048-stud baseplate is not the arena)
  const ext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const grow = (b, into = ext) => { for (let k = 0; k < 3; k++) { into[k] = Math.min(into[k], b[k]); into[k + 3] = Math.max(into[k + 3], b[k + 3]); } };
  for (const ob of objs) if (!ground.has(ob)) for (const sd of ob.pos) grow(sd.box);
  for (const [key, [h]] of cols) {
    const wx = Math.floor(key / 65536) - 32768, wz = (key % 65536) - 32768;
    grow([wx * 4 * s, h * s - 0.01, wz * 4 * s, (wx + 1) * 4 * s, h * s, (wz + 1) * 4 * s]);
  }
  const gext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const g of ground) grow(g.pos[0].box, gext);
  if (!(ext[0] < ext[3])) ext.splice(0, 6, ...gext); // only ground: all of it
  else if (gext[0] < gext[3]) {
    const pad = 24;
    for (const k of [0, 2]) ext[k] = Math.min(ext[k], Math.max(gext[k], ext[k] - pad));
    for (const k of [3, 5]) ext[k] = Math.max(ext[k], Math.min(gext[k], ext[k] + pad));
  }
  if (!(ext[0] < ext[3])) {
    const scripts = top.reduce((n, t) => { let k = 0; const walk = (x) => { if (SCRIPTS.has(x.class)) k++; x.children.forEach(walk); }; walk(t); return n + k; }, 0);
    throw new Error(`nothing to stand on: ${o.from || 'the Workspace'} has no solid parts and no terrain${scripts ? ` (its ${scripts} scripts may build the level when the game runs; --from takes a model from storage)` : ''}`);
  }

  // the world is 1024 m; a place wider than the map can hold is cut to the
  // square round its spawns (or its middle)
  const MAXW = 1000;
  let cut = null;
  if (ext[3] - ext[0] > MAXW || ext[5] - ext[2] > MAXW) {
    const sp = spawnParts.map(({ obj }) => obj.pos[0].box);
    const cx = sp.length ? sp.reduce((a, b) => a + (b[0] + b[3]) / 2, 0) / sp.length : (ext[0] + ext[3]) / 2;
    const cz = sp.length ? sp.reduce((a, b) => a + (b[2] + b[5]) / 2, 0) / sp.length : (ext[2] + ext[5]) / 2;
    const hw = MAXW / 2;
    cut = [Math.max(ext[0], Math.min(cx - hw, ext[3] - MAXW)), Math.max(ext[2], Math.min(cz - hw, ext[5] - MAXW))];
    cut = [cut[0], cut[1], cut[0] + Math.min(MAXW, ext[3] - ext[0]), cut[1] + Math.min(MAXW, ext[5] - ext[2])];
    notes.push(`the place is ${Math.round(ext[3] - ext[0])} x ${Math.round(ext[5] - ext[2])} m at ${s} m a stud, wider than the map's ${MAXW} m: kept the ${MAXW} m round ${sp.length ? 'its spawns' : 'its middle'} (a smaller --scale keeps all of it)`);
    ext[0] = cut[0]; ext[2] = cut[1]; ext[3] = cut[2]; ext[5] = cut[3];
  }
  const inCut = (b) => !cut || (b[3] > cut[0] && b[0] < cut[2] && b[5] > cut[1] && b[2] < cut[3]);

  // the image: the place's ground plus a margin, 2 m a sample
  const SP = L.SPACING, margin = 8;
  const W = Math.min(L.GRID - 4, Math.ceil((ext[3] - ext[0] + 2 * margin) / SP) + 1);
  const H = Math.min(L.GRID - 4, Math.ceil((ext[5] - ext[2] + 2 * margin) / SP) + 1);
  // where the place's (0, 0) goes in the world: its middle in the world's
  // middle, on whole samples so the columns' grid stays whole
  const ox = Math.round((L.WORLD / 2 - (ext[0] + ext[3]) / 2) / SP) * SP;
  const oz = Math.round((L.WORLD / 2 - (ext[2] + ext[5]) / 2) / SP) * SP;
  const ix0 = Math.floor((ext[0] - margin + ox) / SP), iz0 = Math.floor((ext[2] - margin + oz) / SP);
  const heights = new Float64Array(W * H).fill(NaN), surf = new Uint8Array(W * H).fill(1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = (ix0 + i) * SP - ox, z = (iz0 + j) * SP - oz; // the place's metres
    let h = -Infinity, sf = 1;
    const tc = cols.get((Math.floor(x / s / 4) + 32768) * 65536 + (Math.floor(z / s / 4) + 32768));
    if (tc) { h = tc[0] * s; sf = TERRAIN_SURFACE[tc[1]] ?? 1; }
    // a plate is the ground at every sample it reaches within half a sample,
    // so its edge is flat out to where it ends and the drop starts past it
    const r = SP / 2;
    for (const g of ground) {
      const b = g.pos[0].box;
      if (!(x >= b[0] - r && x <= b[3] + r && z >= b[2] - r && z <= b[5] + r && b[4] > h)) continue;
      const v = g.pos[0].square ? [b[1], b[4]] : span(g.pos[0].planes, x, z, r);
      if (v && v[1] > h) { h = v[1]; sf = surfaceOf(g.material, g.colour); }
    }
    if (h > -Infinity) { heights[j * W + i] = h; surf[j * W + i] = sf; }
  }

  // ---- the boxes
  let boxes = [];
  for (const ob of objs) {
    if (ground.has(ob)) continue;
    if (!ob.pos.some((sd) => inCut(sd.box))) continue;
    let list;
    if ([...ob.pos, ...ob.neg].every((sd) => sd.square)) {
      // blocks square to the axes (a union of them too, less its negated ones): boxes, exactly
      list = ob.pos.map((sd) => sd.box.slice());
      for (const n of ob.neg) list = list.flatMap((b) => subtract(b, n.box));
      count.square++;
    } else {
      // a part that would cost many boxes gets wider columns and taller steps
      let c = o.cell, r = o.rise;
      list = rasterize(ob, c, r);
      while (list.length > 48 && c < 8) { c *= 2; r = Math.min(0.5, r * 2); list = rasterize(ob, c, r); }
      count.cut++;
    }
    const keep = ob.inst.class === 'SpawnLocation'; // what a spawn stands on is never fused or dropped
    for (const b of list) if (inCut(b) && b[3] - b[0] > 1e-3 && b[4] - b[1] > 1e-3 && b[5] - b[2] > 1e-3) boxes.push({ b: b.map(tidy), key: ob.key, colour: ob.colour, look: ob.look, model: ob.model, keep });
  }
  const raw = boxes.length;
  const kept = boxes.filter((x) => x.keep);
  const fitted = fit(boxes.filter((x) => !x.keep), o.budget - kept.length);
  boxes = fitted.boxes;
  const merged = fitted.joined;
  if (fitted.level) notes.push(`${merged} boxes after joining the ones that line up; to fit the map's ${o.budget}, bricks that touch were fused when they lined up within ${fitted.level.snap * 100} cm and filled ${Math.round(fitted.level.fill * 100)}% of the box they make${fitted.level.colour ? `, their colours within ${fitted.level.colour} of each other a channel` : ''}: ${boxes.length}`);
  if (boxes.length > o.budget - kept.length) {
    const face = (b) => { const [dx, dy, dz] = [b[3] - b[0], b[4] - b[1], b[5] - b[2]]; return Math.max(dx * dy, dy * dz, dx * dz); };
    boxes.sort((a, b) => face(b.b) - face(a.b));
    const gone = boxes.splice(o.budget - kept.length);
    notes.push(`${gone.length} of the smallest boxes left out to fit the map's ${o.budget} (the largest left out: ${Math.max(...gone.map((g) => face(g.b))).toFixed(2)} m^2 a face)`);
  }
  boxes = boxes.concat(kept);

  // ---- heights: the lowest ground or box 2 m over 0; where the place has no ground, a pit 6 m under its lowest
  let low = Infinity, high = -Infinity;
  for (const h of heights) if (h === h) { low = Math.min(low, h); high = Math.max(high, h); }
  for (const x of boxes) { low = Math.min(low, x.b[1]); high = Math.max(high, x.b[4]); }
  const pitAt = low - 6;
  const oy = Math.round((2 - pitAt) * 4) / 4;
  let pits = 0, inner = 0;
  const h16 = new Uint16Array(W * H);
  for (let k = 0; k < W * H; k++) {
    let h = heights[k];
    // counted where fighters go, not in the margin round it
    const x = (ix0 + (k % W)) * SP - ox, z = (iz0 + Math.floor(k / W)) * SP - oz;
    const play = x > ext[0] && x < ext[3] && z > ext[2] && z < ext[5];
    if (play) inner++;
    if (h !== h) { h = pitAt; surf[k] = 1; if (play) pits++; }
    h16[k] = Math.max(0, Math.min(65535, Math.round((h + oy) * 256)));
  }
  if (high + oy > 255) notes.push(`the place stands ${Math.round(high - pitAt)} m tall; the ground holds 255 m, so ground above that is flattened at 255 m`);
  // where the place has no ground is Roblox's void: a pit, and below 3 m under the lowest ground a fighter dies by falling
  const voidY = pits ? tidy(pitAt + 3 + oy) : null;
  if (pits) notes.push(`${Math.max(1, Math.round((100 * pits) / Math.max(1, inner)))}% of the map's area has no ground: Roblox's void, a pit where a fighter dies 3 m under the lowest ground ("void" ${voidY} m)`);

  const X = (v) => tidy(v + ox), Y = (v) => tidy(v + oy), Z = (v) => tidy(v + oz);
  const placed = boxes.map((x) => ({ ...x, w: [X(x.b[0]), Y(x.b[1]), Z(x.b[2]), X(x.b[3]), Y(x.b[4]), Z(x.b[5])] }));

  // ---- bounds: the place, inside the image by a sample
  const bounds = [
    Math.max((ix0 + 1) * SP, Math.floor(ext[0] + ox)), Math.min((ix0 + W - 2) * SP, Math.ceil(ext[3] + ox)),
    Math.max((iz0 + 1) * SP, Math.floor(ext[2] + oz)), Math.min((iz0 + H - 2) * SP, Math.ceil(ext[5] + oz)),
  ];
  const inside = (x, z) => x >= bounds[0] && x <= bounds[1] && z >= bounds[2] && z <= bounds[3];
  const clampIn = (x, z) => [Math.min(bounds[1], Math.max(bounds[0], x)), Math.min(bounds[3], Math.max(bounds[2], z))];

  // ---- spawns: each SpawnLocation's top; the two commonest teams are red's and blue's
  let spawns = [], flags;
  const teams = new Map();
  for (const { obj, team } of spawnParts) {
    const b = obj.pos[0].box;
    const x = tidy((b[0] + b[3]) / 2 + ox), z = tidy((b[2] + b[5]) / 2 + oz);
    if (!inside(x, z)) continue;
    const sp = [x, z, tidy(b[4] + oy + 0.5)];
    spawns.push(sp);
    if (team != null) { if (!teams.has(team)) teams.set(team, []); teams.get(team).push(sp); }
  }
  const sides = [...teams.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 2);
  // the redder of the two is red's
  const redness = (n) => { const [r, , b] = brickRGB(n); return r - b; };
  if (sides.length === 2 && redness(sides[1][0]) > redness(sides[0][0])) sides.reverse();
  if (sides.length === 2) {
    flags = sides.map(([, list], k) => {
      const mx = list.reduce((a, p) => a + p[0], 0) / list.length, mz = list.reduce((a, p) => a + p[1], 0) / list.length;
      return { team: ['red', 'blue'][k], at: [tidy(mx), tidy(mz), Math.max(...list.map((p) => p[2]))] };
    });
    notes.push('the two commonest teams\' spawns are red\'s and blue\'s; their flags stand among them');
  }
  if (spawns.length > L.NSPAWN) {
    const step = spawns.length / L.NSPAWN;
    spawns = Array.from({ length: L.NSPAWN }, (_, k) => spawns[Math.floor(k * step)]);
    notes.push(`${spawnParts.length} spawn locations; kept ${L.NSPAWN}, spread through the list`);
  }
  // each half needs a spawn: add some at the ends of the bounds' longer side, on whatever is highest there
  const flagAt = flags ? flags.map((f) => f.at) : defaultEnds(bounds);
  const halfOf = (x, z) => { const d = flagAt.map(([fx, fz]) => (x - fx) ** 2 + (z - fz) ** 2); return d[0] < d[1] ? 0 : d[0] > d[1] ? 1 : 2; };
  let added = 0;
  for (const k of [0, 1]) {
    if (spawns.some((p) => halfOf(p[0], p[1]) === k)) continue;
    const [fx, fz] = flagAt[k];
    for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
      if (spawns.length >= L.NSPAWN) break;
      const [x, z] = clampIn(fx + dx, fz + dz);
      if (halfOf(x, z) === k) { spawns.push([tidy(x), tidy(z), 999]); added++; }
    }
  }
  if (added) notes.push(`${spawnParts.length ? 'its spawns are all on one side, so' : 'no spawn locations, so'} ${added} spawns added at the ${spawnParts.length ? 'empty end' : 'two ends'}, on whatever is highest there`);

  // ---- structures: the boxes split in halves along the longer side, again
  // and again, into at most NGROUP groups of about equal count, each a
  // structure (the build's groups, which a query skips whole), named for the
  // Roblox model most of its boxes came from
  const leaves = [];
  const split = (list, n) => {
    if (n <= 1 || list.length <= 1) { leaves.push(list); return; }
    const lo = [0, 2].map((a) => Math.min(...list.map((x) => x.w[a]))), hi = [3, 5].map((a) => Math.max(...list.map((x) => x.w[a])));
    const a = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 2;
    const sorted = [...list].sort((p, q) => p.w[a] + p.w[a + 3] - q.w[a] - q.w[a + 3]);
    const h = Math.floor(n / 2), at = Math.round((sorted.length * h) / n);
    split(sorted.slice(0, at), h);
    split(sorted.slice(at), n - h);
  };
  split(placed, Math.min(L.NGROUP, Math.max(1, Math.ceil(placed.length / 8))));
  const used = new Map();
  const structures = leaves.filter((l) => l.length).map((list) => {
    const names = new Map();
    for (const x of list) if (x.model) names.set(x.model, (names.get(x.model) || 0) + 1);
    const top = [...names.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] || 'parts';
    used.set(top, (used.get(top) || 0) + 1);
    return {
      name: used.get(top) > 1 ? `${top} ${used.get(top)}` : top,
      boxes: list.map((x) => [...x.w, x.look === 'plain' ? hex(x.colour) : `${x.look}${hex(x.colour)}`]),
    };
  });

  const name = o.name || doc.meta?.name || 'Roblox Place';
  const spec = {
    name,
    from: `a Roblox place, ${s} m a stud (tools/roblox.mjs)`,
    bounds,
    terrain: { origin: [ix0 * SP, iz0 * SP], height: 'height.png', scale: 0.00390625, base: 0, surface: 'surface.png' },
    prefabs: {},
    structures,
    spawns,
  };
  if (flags) spec.flags = flags;
  if (voidY !== null) spec.void = voidY;
  const surface = new Uint8Array(W * H * 3);
  for (let k = 0; k < W * H; k++) surface.set(SURFACE_RGB[SURFACES[surf[k]]], 3 * k);

  const report = [
    `${count.parts} parts in the place: ${count.kept} made into the map (${count.ground} of them the ground, ${count.square} boxes as they are, ${count.cut} cut into columns)`,
  ];
  const why = [[count.outside, 'outside the Workspace (kept in storage, placed by scripts)'], [count.characters, 'in characters, tools or the camera'],
    [count.passable, 'that nothing collides with (CanCollide off)'], [count.invisible, 'invisible (walls and triggers)'],
    [count.vehicles, 'in vehicles'], [count.loose, 'unanchored (--anchored leaves them out)']].filter(([n]) => n);
  if (why.length) report.push('left out: ' + why.map(([n, w]) => `${n} ${w}`).join('; '));
  if (count.approx) report.push(`${count.approx} meshes and unions whose shape isn't in the file stand as their bounds`);
  if (cols.size) report.push(`terrain: ${cols.size} columns of 4 studs, its top as the ground (water drained, caves and overhangs filled)`);
  report.push(`${raw} boxes, ${merged} after joining the ones that line up${boxes.length !== merged ? `, ${boxes.length} in the map` : ''}, in ${structures.length} structures`);
  report.push(`${spawns.length} spawns; ${spawnParts.length} spawn locations in the place`);
  if (count.outside > count.kept) {
    // a game that builds its map from storage: say where the parts are
    const models = new Map();
    for (const x of doc.instances) {
      if (!PARTS.has(x.class) || under(x)) continue;
      for (let p = x.parent; p; p = p.parent) if ((p.class === 'Model' || p.class === 'Folder') && p.parent && !p.parent.parent?.parent) { models.set(p, (models.get(p) || 0) + 1); break; }
    }
    const big = [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (big.length) report.push(`most of its parts are outside ${o.from || 'the Workspace'}; the biggest models: ${big.map(([m, n]) => `${path(m)} (${n})`).join(', ')}. --from <path> makes one of them the map`);
  }
  if (count.scripts) report.push(`${count.scripts} scripts not brought over: the arena's own modes are the game`);
  report.push(...notes);
  return {
    spec,
    images: { height: { width: W, height: H, channels: 1, depth: 16, data: h16 }, surface: { width: W, height: H, channels: 3, depth: 8, data: surface } },
    report,
    count,
  };
}

function defaultEnds(bounds) {
  const [bw, bd] = [bounds[1] - bounds[0], bounds[3] - bounds[2]];
  const m = [(bounds[0] + bounds[1]) / 2, (bounds[2] + bounds[3]) / 2];
  return bw >= bd ? [[bounds[0] + bw / 8, m[1]], [bounds[1] - bw / 8, m[1]]] : [[m[0], bounds[2] + bd / 8], [m[0], bounds[3] - bd / 8]];
}

// ---- fewer boxes

// The boxes made to fit `budget`, as little changed as will do: first the
// boxes inside others go and the ones of one colour that line up exactly are
// joined; then, a step at a time, coordinates are snapped a little coarser,
// colours allowed a little apart, and boxes that touch fused into the box
// round both when they fill most of it (two bricks a wall's courses are
// staggered from), "fill" counting only what of each box is solid, so fusing
// again and again never fills a room from its walls. Boxes with a gap
// between them never fuse, so a doorway stays a doorway. { boxes, joined
// (after the exact step), level (the step that fit, or null) }.
const LEVELS = [
  { snap: 0.01, colour: 0, fill: 1 },
  { snap: 0.05, colour: 0, fill: 0.97 },
  { snap: 0.05, colour: 24, fill: 0.95 },
  { snap: 0.1, colour: 48, fill: 0.92 },
  { snap: 0.1, colour: 96, fill: 0.88 },
  { snap: 0.25, colour: 160, fill: 0.85 },
  { snap: 0.25, colour: 256, fill: 0.78 },
  { snap: 0.5, colour: 256, fill: 0.7 },
  { snap: 0.5, colour: 256, fill: 0.6 },
];
export function fit(boxes, budget) {
  let list = boxes.map((x) => ({ ...x, b: x.b.slice(), colour: x.colour.slice(), w: volume(x.b) }));
  let joined = 0, level = null;
  for (const [k, lv] of LEVELS.entries()) {
    list = snap(list, lv.snap);
    list = merge(contained(list), lv.colour);
    if (k === 0) joined = list.length;
    if (list.length <= budget) break;
    if (lv.fill < 1) list = fuse(list, lv, budget);
    level = lv;
    if (list.length <= budget) break;
  }
  return { boxes: list, joined, level: list.length <= budget || level ? level : null };
}

const volume = (b) => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
function snap(list, q) {
  return list.map((x) => {
    const b = x.b.map((v) => Math.round(v / q) * q);
    for (const a of [0, 1, 2]) if (b[a + 3] <= b[a]) b[a + 3] = b[a] + q;
    return { ...x, b: b.map(tidy), w: Math.min(x.w, volume(b)) };
  });
}
// A box's colour key at a colour tolerance: its look, its colour cut into steps that wide.
const colourKey = (x, c) => (c ? `${x.look}|${x.colour.map((v) => Math.floor(v / c)).join(',')}` : `${x.look}${hex(x.colour)}`);
const blend = (a, b) => { const t = a.w + b.w || 1; return a.colour.map((v, i) => (v * a.w + b.colour[i] * b.w) / t); };

// Box a less box n: the up-to-six boxes of a outside n.
function subtract(a, n) {
  if (n[0] >= a[3] || n[3] <= a[0] || n[1] >= a[4] || n[4] <= a[1] || n[2] >= a[5] || n[5] <= a[2]) return [a];
  const out = [];
  let r = a.slice();
  for (const k of [0, 1, 2]) {
    if (n[k] > r[k]) { const b = r.slice(); b[k + 3] = n[k]; out.push(b); r[k] = n[k]; }
    if (n[k + 3] < r[k + 3]) { const b = r.slice(); b[k] = n[k + 3]; out.push(b); r[k + 3] = n[k + 3]; }
  }
  return out;
}

// Boxes wholly inside another box go (any colour: it can't be seen).
function contained(boxes) {
  const B = 8; // a coarse grid to find neighbours
  const cell = new Map();
  const keyOf = (x, z) => `${x},${z}`;
  const span = (b) => [Math.floor(b[0] / B), Math.floor(b[2] / B), Math.floor(b[3] / B), Math.floor(b[5] / B)];
  boxes.forEach((x, k) => {
    const [a, c, d, e] = span(x.b);
    for (let i = a; i <= d; i++) for (let j = c; j <= e; j++) { const q = keyOf(i, j); if (!cell.has(q)) cell.set(q, []); cell.get(q).push(k); }
  });
  const vol = (b) => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
  const gone = new Uint8Array(boxes.length);
  boxes.forEach((x, k) => {
    const [a, c] = span(x.b), b = x.b;
    for (const m of cell.get(keyOf(a, c)) || []) {
      if (m === k || gone[m]) continue;
      const o = boxes[m].b;
      if (o[0] <= b[0] && o[1] <= b[1] && o[2] <= b[2] && o[3] >= b[3] && o[4] >= b[4] && o[5] >= b[5] && (vol(o) > vol(b) || m < k)) { gone[k] = 1; break; }
    }
  });
  return boxes.filter((_, k) => !gone[k]);
}

// Boxes of one colour key that match on two axes and meet (or overlap) on
// the third are one box; again until none join.
function merge(boxes, colour = 0) {
  let list = boxes.map((x) => ({ ...x, b: x.b.slice() }));
  for (let changed = true, rounds = 0; changed && rounds < 12; rounds++) {
    changed = false;
    for (const a of [0, 1, 2]) {
      const [p, q] = [0, 1, 2].filter((v) => v !== a);
      const groups = new Map();
      for (const x of list) {
        const k = `${colourKey(x, colour)}|${x.b[p]}|${x.b[p + 3]}|${x.b[q]}|${x.b[q + 3]}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(x);
      }
      const out = [];
      for (const g of groups.values()) {
        g.sort((u, v) => u.b[a] - v.b[a]);
        let cur = g[0];
        for (const x of g.slice(1)) {
          if (x.b[a] <= cur.b[a + 3] + 1e-6) {
            if (x.b[a + 3] > cur.b[a + 3]) cur.b[a + 3] = x.b[a + 3];
            cur.colour = blend(cur, x);
            cur.w = Math.min(volume(cur.b), cur.w + x.w); // solid, as fused boxes are less than their box
            changed = true;
          }
          else { out.push(cur); cur = x; }
        }
        out.push(cur);
      }
      list = out;
    }
  }
  return list;
}

// Boxes that touch (no gap on any axis), share a look and are within the
// level's colour of each other become the box round both, when the two fill
// at least `fill` of it; the best pairs first, until `budget` or none are left.
function fuse(list, { colour, fill }, budget) {
  const C = 4;
  for (let round = 0; round < 80 && list.length > budget; round++) {
    const n = list.length, cells = new Map();
    const span = (x) => [Math.floor(x.b[0] / C), Math.floor(x.b[2] / C), Math.floor(x.b[3] / C), Math.floor(x.b[5] / C)];
    list.forEach((x, k) => {
      const [i0, j0, i1, j1] = span(x);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const q = i * 100003 + j;
        let c = cells.get(q);
        if (!c) cells.set(q, (c = []));
        c.push(k);
      }
    });
    // each box against the later boxes sharing a cell with it, each pair once (a stamp a box)
    const pairs = [], stamp = new Int32Array(n).fill(-1);
    for (let u = 0; u < n; u++) {
      const a = list[u], A = a.b, [i0, j0, i1, j1] = span(a);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const v of cells.get(i * 100003 + j)) {
        if (v <= u || stamp[v] === u) continue;
        stamp[v] = u;
        const b = list[v], B = b.b;
        if (a.look !== b.look) continue;
        if (A[0] > B[3] + 1e-6 || B[0] > A[3] + 1e-6 || A[1] > B[4] + 1e-6 || B[1] > A[4] + 1e-6 || A[2] > B[5] + 1e-6 || B[2] > A[5] + 1e-6) continue;
        if (colour < 256 && (Math.abs(a.colour[0] - b.colour[0]) > colour || Math.abs(a.colour[1] - b.colour[1]) > colour || Math.abs(a.colour[2] - b.colour[2]) > colour)) continue;
        const ux = Math.max(A[3], B[3]) - Math.min(A[0], B[0]), uy = Math.max(A[4], B[4]) - Math.min(A[1], B[1]), uz = Math.max(A[5], B[5]) - Math.min(A[2], B[2]);
        const ov = Math.max(0, Math.min(A[3], B[3]) - Math.max(A[0], B[0])) * Math.max(0, Math.min(A[4], B[4]) - Math.max(A[1], B[1])) * Math.max(0, Math.min(A[5], B[5]) - Math.max(A[2], B[2]));
        // how much of the box round both is solid: each box's own solid (a.w, less than its box once
        // fused), so fusing again and again can't fill a room from its walls
        const f = (a.w + b.w - Math.min(ov, a.w, b.w)) / (ux * uy * uz);
        if (f >= fill) pairs.push([f, u, v]);
      }
    }
    if (!pairs.length) {
      // none left to fuse: join what lines up now, and fuse on if that made any
      const joined = merge(contained(list), colour);
      if (joined.length === list.length) break;
      list = joined;
      continue;
    }
    pairs.sort((p, q) => q[0] - p[0] || p[1] - q[1] || p[2] - q[2]);
    const used = new Uint8Array(n), out = [];
    let left = n - budget;
    for (const [, i, j] of pairs) {
      if (left <= 0) break;
      if (used[i] || used[j]) continue;
      used[i] = used[j] = 1;
      const a = list[i], b = list[j];
      const u2 = [0, 1, 2].map((ax) => Math.min(a.b[ax], b.b[ax])).concat([3, 4, 5].map((ax) => Math.max(a.b[ax], b.b[ax])));
      const ov = [0, 1, 2].reduce((p, ax) => p * Math.max(0, Math.min(a.b[ax + 3], b.b[ax + 3]) - Math.max(a.b[ax], b.b[ax])), 1);
      out.push({ ...a, b: u2.map(tidy), colour: blend(a, b), w: a.w + b.w - Math.min(ov, a.w, b.w), model: a.w >= b.w ? a.model : b.model });
      left--;
    }
    list = out.concat(list.filter((_, k) => !used[k]));
    if (round % 2) list = merge(contained(list), colour); // the exact joins two rounds of fusing opened up
  }
  return merge(contained(list), colour);
}
