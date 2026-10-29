// A Roblox place made into an arena map, with no Node in it: tools/roblox.mjs
// runs it on a file and writes maps/<name>/, the map editor on a file dropped
// into the page (docs/roblox.md). What comes over is what a fighter can stand
// on and hide behind: the Workspace's solid parts, the smooth terrain, the
// spawn locations and their teams. The place's scripts, sounds, meshes'
// shapes and everything outside the Workspace stay behind, and the report
// says what did.
//
// Each part is taken as a solid (a block, a wedge, a cylinder, a ball, a
// union's own parts less its negated ones) and the smooth terrain as the
// top of its solid voxels (water drained), its material the surface; then
// tools/scene-map.mjs makes the map: blocks square to the axes are boxes,
// anything else columns, big flat blocks with nothing under them the
// ground, where there is none a void, the whole fit to the budget.
//
// A stud is 0.28 m (Roblox's own figure; `scale`). The arena's fighter is
// 1.8 m and jumps 1.2 m; a Roblox character is about 5 studs (1.4 m) and
// jumps 7.2 (2 m), so a ledge built to be jumped to may need a step.
import { ancestor, path, readRoblox } from './rbx-file.mjs';
import { weaponOf } from './rbx-brief.mjs';
import { SURFACES, SURFACE_RGB } from './map-compile.mjs';
import { hex, solid, sceneToMap } from './scene-map.mjs';
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
    const spawn = inst.class === 'SpawnLocation';
    const obj = { pos, neg, colour, look: lk, surface: surfaceOf(p.Material ?? 256, colour), key: `${lk}${hex(colour)}`, model: model ? model.name : '', spawn };
    objs.push(obj);
    if (spawn && p.Enabled !== false) {
      const team = p.Neutral === false ? p.TeamColor : null;
      spawnParts.push({ obj, team, rgb: team == null ? null : brickRGB(team) });
    }
  }

  // terrain columns, in metres
  const tr = doc.instances.find((x) => x.class === 'Terrain' && under(x));
  let cols = new Map();
  try { cols = terrainColumns(tr?.props.SmoothGrid); } catch (e) { notes.push(`the terrain could not be read (${e.message}); left out`); }
  const terrain = {
    boxes: [...cols].map(([key, [h]]) => {
      const wx = Math.floor(key / 65536) - 32768, wz = (key % 65536) - 32768;
      return [wx * 4 * s, h * s - 0.01, wz * 4 * s, (wx + 1) * 4 * s, h * s, (wz + 1) * 4 * s];
    }),
    at: (x, z) => {
      const tc = cols.get((Math.floor(x / s / 4) + 32768) * 65536 + (Math.floor(z / s / 4) + 32768));
      return tc && [tc[0] * s, TERRAIN_SURFACE[tc[1]] ?? 1];
    },
  };

  // a weapon lying in the map (a Tool in the Workspace, by its handle) is a pad with the arena's nearest gun
  const pads = [];
  for (const t of doc.instances) {
    if (t.class !== 'Tool' || !under(t)) continue;
    const w = weaponOf(t.name), h = t.children.find((k) => k.name === 'Handle' && k.props.CFrame);
    if (w && h) pads.push({ weapon: w, at: h.props.CFrame.p.map((v) => v * s) });
  }

  const report = (c) => {
    const head = [`${c.parts} parts in the place: ${c.kept} made into the map (${c.ground} of them the ground, ${c.square} boxes as they are, ${c.cut} cut into columns)`];
    const why = [[c.outside, 'outside the Workspace (kept in storage, placed by scripts)'], [c.characters, 'in characters, tools or the camera'],
      [c.passable, 'that nothing collides with (CanCollide off)'], [c.invisible, 'invisible (walls and triggers)'],
      [c.vehicles, 'in vehicles'], [c.loose, 'unanchored (--anchored leaves them out)']].filter(([n]) => n);
    if (why.length) head.push('left out: ' + why.map(([n, w]) => `${n} ${w}`).join('; '));
    if (c.approx) head.push(`${c.approx} meshes and unions whose shape isn't in the file stand as their bounds`);
    if (cols.size) head.push(`terrain: ${cols.size} columns of 4 studs, its top as the ground (water drained, caves and overhangs filled)`);
    const tail = [];
    if (c.outside > c.kept) {
      // a game that builds its map from storage: say where the parts are
      const models = new Map();
      for (const x of doc.instances) {
        if (!PARTS.has(x.class) || under(x)) continue;
        for (let p = x.parent; p; p = p.parent) if ((p.class === 'Model' || p.class === 'Folder') && p.parent && !p.parent.parent?.parent) { models.set(p, (models.get(p) || 0) + 1); break; }
      }
      const big = [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      if (big.length) tail.push(`most of its parts are outside ${o.from || 'the Workspace'}; the biggest models: ${big.map(([m, n]) => `${path(m)} (${n})`).join(', ')}. --from <path> makes one of them the map`);
    }
    if (c.scripts) tail.push(`${c.scripts} scripts not brought over: the arena's own modes are the game`);
    return { head, tail };
  };
  const empty = () => {
    const scripts = top.reduce((n, t) => { let k = 0; const walk = (x) => { if (SCRIPTS.has(x.class)) k++; x.children.forEach(walk); }; walk(t); return n + k; }, 0);
    return `nothing to stand on: ${o.from || 'the Workspace'} has no solid parts and no terrain${scripts ? ` (its ${scripts} scripts may build the level when the game runs; --from takes a model from storage)` : ''}`;
  };

  return sceneToMap({
    objs, terrain, spawns: spawnParts, pads, count, notes, report, empty,
    name: o.name || doc.meta?.name || 'Roblox Place',
    words: { unit: `${s} m a stud`, void: 'Roblox\'s void', spawns: 'spawn locations', unnamed: 'parts', from: `a Roblox place, ${s} m a stud (tools/roblox.mjs)` },
  }, o);
}
