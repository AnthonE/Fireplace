// The map compiler's core, with no Node in it: tools/map.mjs runs it on a
// directory for the build, and the map editor (client/map-editor.html) on
// what it holds, so the page refuses what the build would. map.json's format
// is in tools/map.mjs.
import * as L from '../src/layout.mjs';

// Ground types, as the sim and the renderer number them, and the colours a
// surface image paints them with unless map.json says otherwise.
export const SURFACES = ['grass', 'rock', 'sand', 'metal'];
export const SURFACE_RGB = { grass: [77, 128, 51], rock: [122, 110, 92], sand: [184, 158, 107], metal: [128, 143, 158] };
// Box materials, as client/arena-render.mjs colours them. A box may instead
// have a colour of its own: '#rrggbb' (plain, lit) or '<material>#rrggbb'
// (that material's look in that colour), as tools/roblox.mjs writes them.
export const MATERIALS = ['metal', 'rock', 'dark', 'red', 'blue', 'light', 'plain'];
// A material's u32 in a box: the low byte the look (MATERIALS), bit 7 set when
// the colour in the three bytes above is the box's own. Drawing only: the sim
// reads a box's corners and nothing else.
export const OWN_COLOUR = 0x80;
export function materialWord(m) {
  const at = typeof m === 'string' ? m.indexOf('#') : -1;
  if (at < 0) return MATERIALS.indexOf(m);
  const look = at ? MATERIALS.indexOf(m.slice(0, at)) : MATERIALS.indexOf('plain');
  const rgb = m.slice(at + 1);
  if (look < 0 || !/^[0-9a-fA-F]{6}$/.test(rgb)) return -1;
  return (look | OWN_COLOUR | (parseInt(rgb, 16) << 8)) >>> 0;
}
// and back: { look, rgb } (rgb [r, g, b] 0..255, or null for the look's own)
export function materialOf(word) {
  return { look: word & 0x7f, rgb: word & OWN_COLOUR ? [(word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255] : null };
}
export const WEAPONS = { ar: L.W_AR, br: L.W_BR, magnum: L.W_MAGNUM, sniper: L.W_SNIPER, shotgun: L.W_SHOTGUN, rocket: L.W_ROCKET, plasma: L.W_PLASMA, needler: L.W_NEEDLER, sword: L.W_SWORD };
export const GROUND = -1000; // a spawn or pad with no top: on the ground

// A box turned by `turn` degrees about the y axis (+x towards +z at 90), then moved to `at`.
export function place(box, at, turn) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const q = ((Math.round(turn / 90) % 4) + 4) % 4;
  if (turn % 90) throw new Error(`turn ${turn}: quarter turns only`);
  const rot = ([x, z]) => [[x, z], [-z, x], [-x, -z], [z, -x]][q];
  const a = rot([x0, z0]), b = rot([x1, z1]);
  return [Math.min(a[0], b[0]) + at[0], y0 + at[1], Math.min(a[1], b[1]) + at[2], Math.max(a[0], b[0]) + at[0], y1 + at[1], Math.max(a[1], b[1]) + at[2]];
}

// Points in a structure (teleporter pads, spawns) turn and move with it.
export function placePoint([x, y, z], at = [0, 0, 0], turn = 0) {
  const b = place([x, y, z, x, y, z], at, turn);
  return [b[0], b[1], b[2]];
}

const round = (v) => Math.fround(v);

// A map from its spec (map.json, parsed) and its images, decoded as
// tools/png-codec.mjs gives them: { height, surface } (surface only if the
// spec names one). `name` prefixes each complaint.
export function compileSpec(spec, images, name = 'map.json') {
  const where = (s) => `${name}: ${s}`;
  const fail = (s) => { throw new Error(where(s)); };
  const t = spec.terrain || fail('no "terrain"');
  // ---- the ground
  const img = images.height || fail(`no height image (${t.height || 'height.png'})`);
  const [ox, oz] = t.origin || fail('terrain.origin: the world x, z of the images\' first pixel');
  if (ox % L.SPACING || oz % L.SPACING) fail(`terrain.origin ${ox}, ${oz}: multiples of ${L.SPACING} m`);
  const gx = ox / L.SPACING, gz = oz / L.SPACING;
  const W = img.width, H = img.height;
  if (gx < 1 || gz < 1 || gx + W > L.GRID - 1 || gz + H > L.GRID - 1) fail(`the images (${W} x ${H} at ${ox}, ${oz}) must lie inside the world, a sample in from its edge`);
  const scale = t.scale ?? (img.depth === 16 ? 1 / 256 : 0.25);
  const base = t.base ?? 0;
  const heights = new Uint16Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const m = base + img.data[i * img.channels] * scale;
    heights[i] = Math.max(0, Math.min(65535, Math.round(m * 256)));
  }
  const surf = new Uint8Array(W * H);
  if (t.surface) {
    const s = images.surface || fail(`no surface image (${t.surface})`);
    if (s.width !== W || s.height !== H) fail(`${t.surface} is ${s.width} x ${s.height}, the height image ${W} x ${H}`);
    const pal = SURFACES.map((n) => (t.surfaces && t.surfaces[n]) || SURFACE_RGB[n]);
    for (let i = 0; i < W * H; i++) {
      const c = s.channels >= 3 ? [0, 1, 2].map((k) => s.data[i * s.channels + k]) : [0, 0, 0].map(() => s.data[i * s.channels]);
      let best = 0, bd = Infinity;
      pal.forEach((p, k) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } });
      surf[i] = best;
    }
  }
  // ---- structures: a group of boxes each
  const prefabs = spec.prefabs || {};
  // a structure's "move": { by: [dx, dy, dz] (turned with the structure),
  // seconds each way, wait at each end (1 s), phase (0 s), ease } as the sim's
  // row reads it (layout.mjs MAP_MOVE): ticks at 125 Hz
  const ticks = (v, what, min) => {
    const n = Math.round(v * L.TICK_HZ);
    if (typeof v !== 'number' || !(n >= min && n <= L.MV_TICKS_MAX)) fail(`${what}: ${min ? 'over 0' : '0 or more'} seconds, at most ${L.MV_TICKS_MAX / L.TICK_HZ}`);
    return n;
  };
  const mover = (m, turn, name) => {
    if (!Array.isArray(m.by) || m.by.length !== 3 || m.by.some((v) => typeof v !== 'number' || !(Math.abs(v) <= 1000))) fail(`${name}: move.by is [dx, dy, dz], each within 1000 m`);
    const by = placePoint(m.by, [0, 0, 0], turn).map(round);
    const travel = ticks(m.seconds ?? 4, `${name}: move.seconds`, 1);
    const wait = ticks(m.wait ?? 1, `${name}: move.wait`, 0), phase = ticks(m.phase ?? 0, `${name}: move.phase`, 0);
    // its fastest tick: the mean, or half again eased
    const step = Math.hypot(...by) / travel * (m.ease ? 1.5 : 1);
    if (step > L.MV_STEP_MAX) fail(`${name}: move goes ${(step * L.TICK_HZ).toFixed(1)} m/s at its fastest, at most ${L.MV_STEP_MAX * L.TICK_HZ} (more seconds, or a shorter move)`);
    return { by, travel, wait, phase, ease: !!m.ease };
  };
  const groups = [], boxes = [], teleporters = [];
  const mat = (name, tint, ctx) => {
    const m = materialWord((tint && tint[name]) || name || 'metal');
    if (m < 0) fail(`${ctx}: no material "${name}" (${MATERIALS.join(', ')}, or a colour: "#rrggbb", "rock#rrggbb")`);
    return m;
  };
  for (const [k, s] of (spec.structures || []).entries()) {
    const name = s.name || `structure ${k}`;
    const list = s.prefab ? (prefabs[s.prefab] || fail(`${name}: no prefab "${s.prefab}"`)) : (s.boxes || fail(`${name}: no boxes`));
    const at = s.at || [0, 0, 0], turn = s.turn || 0;
    const first = boxes.length;
    for (const b of list) {
      if (b.length < 6 || b.slice(0, 6).some((v) => typeof v !== 'number')) fail(`${name}: a box is [x0, y0, z0, x1, y1, z1, material]`);
      if (!(b[0] < b[3] && b[1] < b[4] && b[2] < b[5])) fail(`${name}: box ${JSON.stringify(b)} is empty or inside out`);
      boxes.push({ box: place(b, at, turn).map(round), material: mat(b[6], s.tint, name), group: groups.length });
    }
    if (boxes.length === first) continue;
    const mine = boxes.slice(first);
    const bound = [0, 1, 2].map((a) => Math.min(...mine.map((b) => b.box[a]))).concat([3, 4, 5].map((a) => Math.max(...mine.map((b) => b.box[a]))));
    // a mover's group is bounded over its whole path, so a query that misses
    // the path costs one test, wherever on it the boxes are
    const move = s.move ? mover(s.move, turn, name) : null;
    if (move) for (let a = 0; a < 3; a++) { bound[a] = Math.min(bound[a], round(bound[a] + move.by[a])); bound[a + 3] = Math.max(bound[a + 3], round(bound[a + 3] + move.by[a])); }
    groups.push({ name, bound, first, count: mine.length, ...(move ? { move } : {}) });
    for (const tp of s.teleporters || []) teleporters.push({ from: placePoint(tp.from, at, turn), to: placePoint(tp.to, at, turn), radius: tp.radius ?? 1.2 });
  }
  for (const tp of spec.teleporters || []) teleporters.push({ from: tp.from, to: tp.to, radius: tp.radius ?? 1.2 });
  if (boxes.length > L.NBOX) fail(`${boxes.length} boxes, at most ${L.NBOX}`);
  if (groups.length > L.NGROUP) fail(`${groups.length} structures, at most ${L.NGROUP}`);
  if (teleporters.length > L.NTELE) fail(`${teleporters.length} teleporters, at most ${L.NTELE}`);
  // ---- where fighters go, start and find guns
  const bounds = spec.bounds || fail('no "bounds": [x0, x1, z0, z1], where fighters can go');
  if (!(bounds[0] < bounds[1] && bounds[2] < bounds[3])) fail('bounds: [x0, x1, z0, z1]');
  const inside = (x, z, what) => { if (!(x >= bounds[0] && x <= bounds[1] && z >= bounds[2] && z <= bounds[3])) fail(`${what} at ${x}, ${z} is out of bounds`); };
  const spawns = (spec.spawns || []).map((s, k) => { inside(s[0], s[1], `spawn ${k}`); return { x: s[0], z: s[1], top: s[2] ?? GROUND }; });
  if (!spawns.length || spawns.length > L.NSPAWN) fail(`${spawns.length} spawn points: 1 to ${L.NSPAWN}`);
  const pads = (spec.pads || []).map((p, k) => {
    const w = WEAPONS[p.weapon] || fail(`pad ${k}: no weapon "${p.weapon}" (${Object.keys(WEAPONS).join(', ')})`);
    inside(p.at[0], p.at[1], `pad ${k}`);
    return { x: p.at[0], z: p.at[1], top: p.at[2] ?? GROUND, weapon: w };
  });
  if (pads.length > L.NPAD) fail(`${pads.length} pads, at most ${L.NPAD}`);
  for (const [k, tp] of teleporters.entries()) { inside(tp.from[0], tp.from[2], `teleporter ${k}`); inside(tp.to[0], tp.to[2], `teleporter ${k}'s exit`); }
  // ---- what the team modes play for: the flags' stands, the skull's spot, the hills
  const point = (at, what) => {
    if (!Array.isArray(at) || at.length < 2 || at.slice(0, 3).some((v) => typeof v !== 'number')) fail(`${what}: "at" is [x, z] or [x, z, top]`);
    inside(at[0], at[1], what);
    return [at[0], at[1], at[2] ?? GROUND];
  };
  let flags;
  if (spec.flags) {
    if (!Array.isArray(spec.flags) || spec.flags.length !== 2) fail('flags: exactly two, red\'s and blue\'s');
    flags = ['red', 'blue'].map((team) => point((spec.flags.find((f) => f.team === team) || fail(`flags: no ${team} flag`)).at, `${team}'s flag`));
  } else flags = defaultFlags(bounds);
  const ball = spec.ball ? point(spec.ball.at, 'the ball') : defaultBall(bounds);
  let hills;
  if (spec.hills) {
    if (!Array.isArray(spec.hills) || !spec.hills.length || spec.hills.length > L.NHILL) fail(`${spec.hills.length ?? 0} hills: 1 to ${L.NHILL}`);
    hills = spec.hills.map((h, k) => {
      if (!(h.radius > 0 && h.radius <= 30)) fail(`hill ${k}: a radius over 0, at most 30 m`);
      return [...point(h.at, `hill ${k}`), h.radius];
    });
  } else hills = defaultHills(bounds, flags);
  // how high a ship may fly (src/flight.wat): map.json's "ceiling", or 60 m
  // over the highest ground inside the bounds
  let ceiling = spec.ceiling;
  if (ceiling === undefined) {
    let top = 0;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const wx = ox + x * L.SPACING, wz = oz + z * L.SPACING;
      if (wx >= bounds[0] && wx <= bounds[1] && wz >= bounds[2] && wz <= bounds[3]) top = Math.max(top, heights[z * W + x] / 256);
    }
    ceiling = Math.ceil(top) + 60;
  }
  if (!(ceiling > 0 && ceiling < 400)) fail(`ceiling ${ceiling}: over 0, under 400 m`);
  // where a fighter falling off the world dies (map.json "void", metres; none
  // by default): a Roblox place's sky, as tools/roblox.mjs writes it
  const voidY = spec.void ?? null;
  if (voidY !== null && !(typeof voidY === 'number' && voidY > 0 && voidY < ceiling)) fail(`void ${voidY}: a height over 0 m and under the ceiling`);
  // flight's race: its gates in order, balls a ship flies through
  const race = (spec.race || []).map((g, k) => {
    if (!Array.isArray(g) || g.length !== 4 || g.some((v) => typeof v !== 'number')) fail(`race gate ${k}: [x, y, z, radius]`);
    inside(g[0], g[2], `race gate ${k}`);
    if (!(g[3] > 0 && g[3] <= 40)) fail(`race gate ${k}: a radius over 0, at most 40 m`);
    return g;
  });
  if (race.length === 1 || race.length > L.FLIGHT_CONSTS.NGATE) fail(`${race.length} race gates: none, or 2 to ${L.FLIGHT_CONSTS.NGATE}`);
  const sides = [0, 0];
  for (const s of spawns) { const k = half(s.x, s.z, flags); if (k < 2) sides[k]++; }
  ['red', 'blue'].forEach((team, k) => { if (!sides[k]) fail(`no spawn on ${team}'s half (the spawns nearer its flag at ${flags[k][0]}, ${flags[k][1]} than the other)`); });

  // ---- the bytes: the head as MAP lays it out, the groups, the boxes, the images
  const head = new DataView(new ArrayBuffer(L.MAP_HEAD));
  const rel = (a) => a - L.MAP;
  head.setUint32(rel(L.MAP_NBOX), boxes.length, true);
  head.setUint32(rel(L.MAP_NGROUP), groups.length, true);
  head.setUint32(rel(L.MAP_NTELE), teleporters.length, true);
  head.setUint32(rel(L.MAP_NSPAWN), spawns.length, true);
  head.setUint32(rel(L.MAP_NPAD), pads.length, true);
  bounds.forEach((v, k) => head.setFloat32(rel(L.MAP_BOUNDS) + 4 * k, v, true));
  head.setFloat32(rel(L.MAP_VOID), voidY ?? 0, true);
  spawns.forEach((s, k) => {
    head.setFloat32(rel(L.MAP_SPAWN) + 8 * k, s.x, true);
    head.setFloat32(rel(L.MAP_SPAWN) + 8 * k + 4, s.z, true);
    head.setFloat32(rel(L.MAP_SPAWNY) + 4 * k, s.top, true);
  });
  pads.forEach((p, k) => {
    const a = rel(L.MAP_PADS) + 16 * k;
    head.setFloat32(a, p.x, true); head.setFloat32(a + 4, p.z, true); head.setFloat32(a + 8, p.top, true); head.setUint32(a + 12, p.weapon, true);
  });
  teleporters.forEach((tp, k) => {
    const a = rel(L.MAP_TELE) + L.TELE_SIZE * k;
    [...tp.from, tp.radius, ...tp.to].forEach((v, i) => head.setFloat32(a + 4 * i, v, true));
  });
  const gbytes = new DataView(new ArrayBuffer(groups.length * 32));
  groups.forEach((g, k) => { g.bound.forEach((v, i) => gbytes.setFloat32(32 * k + 4 * i, v, true)); gbytes.setUint32(32 * k + 24, g.first, true); gbytes.setUint32(32 * k + 28, g.count, true); });
  const bbytes = new DataView(new ArrayBuffer(boxes.length * L.BOX_SIZE));
  boxes.forEach((b, k) => { b.box.forEach((v, i) => bbytes.setFloat32(32 * k + 4 * i, v, true)); bbytes.setUint32(32 * k + 24, b.material, true); bbytes.setUint32(32 * k + 28, b.group, true); });
  const hbytes = new Uint8Array(heights.buffer.slice(0));
  if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw new Error('a little-endian host, please');
  // the objectives as MAP_OBJ lays them out
  const obj = new DataView(new ArrayBuffer(L.MAP_OBJ_SIZE));
  const orel = (a) => a - L.MAP_OBJ;
  obj.setUint32(orel(L.MAP_NHILL), hills.length, true);
  flags.forEach((f, k) => f.forEach((v, i) => obj.setFloat32(orel(L.MAP_FLAGS) + 16 * k + 4 * i, v, true)));
  ball.forEach((v, i) => obj.setFloat32(orel(L.MAP_BALL) + 4 * i, v, true));
  hills.forEach((h, k) => h.forEach((v, i) => obj.setFloat32(orel(L.MAP_HILLS) + 16 * k + 4 * i, v, true)));
  const parts = [new Uint8Array(head.buffer), new Uint8Array(gbytes.buffer), new Uint8Array(bbytes.buffer), hbytes, surf, new Uint8Array(obj.buffer)];
  // the race as MAP_RACE lays it out, only for a map that has one (so one without keeps its bytes)
  if (race.length) {
    const rb = new DataView(new ArrayBuffer(16 + 16 * race.length));
    rb.setUint32(0, race.length, true);
    race.forEach((g, k) => g.forEach((v, i) => rb.setFloat32(16 + 16 * k + 4 * i, v, true)));
    parts.push(new Uint8Array(rb.buffer));
  }
  // the movers' rows as MAP_MOVE lays them out, up to the last group that
  // moves, only for a map that has one (the same)
  const nmove = groups.reduce((n, g, k) => (g.move ? k + 1 : n), 0);
  const mb = new DataView(new ArrayBuffer(nmove * L.MOVE_SIZE));
  groups.slice(0, nmove).forEach((g, k) => {
    if (!g.move) return;
    const a = k * L.MOVE_SIZE, m = g.move;
    m.by.forEach((v, i) => mb.setFloat32(a + 4 * i, v, true));
    [m.travel, m.wait, m.phase, L.MV_ON | (m.ease ? L.MV_EASE : 0)].forEach((v, i) => mb.setUint32(a + 12 + 4 * i, v, true));
  });
  if (nmove) parts.push(new Uint8Array(mb.buffer));
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  const offs = [];
  parts.reduce((at, p) => { offs.push(at); bytes.set(p, at); return at + p.length; }, 0);
  return {
    name: spec.name || name,
    bytes,
    // folded into the arena's WAT as @MAPSEG_* and @MAPIMG_*
    consts: {
      MAPSEG_GROUPS: offs[1], MAPSEG_NGROUPB: gbytes.byteLength, MAPSEG_BOXES: offs[2], MAPSEG_NBOXB: bbytes.byteLength,
      MAPSEG_H: offs[3], MAPSEG_S: offs[4], MAPSEG_OBJ: offs[5], MAPIMG_X0: gx, MAPIMG_Z0: gz, MAPIMG_W: W, MAPIMG_H: H, MAP_CEIL: ceiling,
      MAPSEG_RACE: race.length ? offs[6] : bytes.length, MAPSEG_NRACEB: race.length ? 16 + 16 * race.length : 0,
      MAPSEG_MOVE: nmove ? offs[parts.length - 1] : bytes.length, MAPSEG_NMOVEB: mb.byteLength,
    },
    ceiling, void: voidY,
    bounds, groups, boxes, teleporters, spawns, pads, flags, ball, hills, race, sides, heights, surf, origin: [ox, oz], size: [W, H],
  };
}

// The objectives a map leaves out. The flags: an eighth in from each end of
// the longer side, red at the low end; the skull mid-field; the hills the
// middle and halfway from it to each flag. Each is [x, z, top] (hills
// [x, z, top, radius]).
const mid = (bounds) => [(bounds[0] + bounds[1]) / 2, (bounds[2] + bounds[3]) / 2];
export function defaultFlags(bounds) {
  const [bw, bd] = [bounds[1] - bounds[0], bounds[3] - bounds[2]], m = mid(bounds);
  return bw >= bd ? [[bounds[0] + bw / 8, m[1], GROUND], [bounds[1] - bw / 8, m[1], GROUND]] : [[m[0], bounds[2] + bd / 8, GROUND], [m[0], bounds[3] - bd / 8, GROUND]];
}
export const defaultBall = (bounds) => [...mid(bounds), GROUND];
export function defaultHills(bounds, flags) {
  const [bw, bd] = [bounds[1] - bounds[0], bounds[3] - bounds[2]], m = mid(bounds);
  const r = Math.max(3, Math.min(10, Math.min(bw, bd) / 10));
  return [[...m, GROUND, r], ...flags.map((f) => [(m[0] + f[0]) / 2, (m[1] + f[1]) / 2, GROUND, r])];
}

// map.json as the generators write it: JSON at two spaces, with each array
// of plain values (a box, a point) on one line.
export const formatSpec = (spec) => JSON.stringify(spec, null, 2).replace(/\[\s+(-?[\d.]+|"[^"]*"),\s+([^[\]{}]*?)\s+\]/g, (m) => m.replace(/\s+/g, ' ').replace('[ ', '[').replace(' ]', ']')) + '\n';

// Whose half of the map (x, z) is on, as the sim's $a_half reckons it in f32:
// 0 red's if strictly nearer red's flag than blue's, 1 blue's if strictly
// nearer blue's, 2 neither's (as far from both).
export function half(x, z, flags) {
  const f = Math.fround;
  const d2 = ([fx, fz]) => { const dx = f(f(x) - f(fx)), dz = f(f(z) - f(fz)); return f(f(dx * dx) + f(dz * dz)); };
  const r = d2(flags[0]), b = d2(flags[1]);
  return r < b ? 0 : r > b ? 1 : 2;
}

// The segment as WAT text: a passive data segment, copied out by memory.init.
// Only letters and digits go in plain, so nothing in it reads as a macro,
// a constant or a comment to the assembler's later passes.
export function dataSegment(bytes, name = '$map') {
  let s = '';
  for (const b of bytes) s += /[A-Za-z0-9]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '\\' + b.toString(16).padStart(2, '0');
  return `(data ${name} "${s}")`;
}

// A compiled map packed for the arena's and flight's map_load export, which
// takes a map from outside the build: a head of MAPPACK_HEAD bytes (layout.mjs
// MP_*: where each part of `bytes` is, the images' place and size, the
// ceiling), then the bytes as a build's own map segment holds them.
export function packMap(m) {
  const c = m.consts, out = new Uint8Array(L.MAPPACK_HEAD + m.bytes.length), dv = new DataView(out.buffer);
  const u32 = { MP_MAGIC: L.MAPPACK_MAGIC, MP_BYTES: m.bytes.length, MP_GROUPS: c.MAPSEG_GROUPS, MP_NGROUPB: c.MAPSEG_NGROUPB, MP_BOXES: c.MAPSEG_BOXES,
    MP_NBOXB: c.MAPSEG_NBOXB, MP_H: c.MAPSEG_H, MP_S: c.MAPSEG_S, MP_OBJ: c.MAPSEG_OBJ, MP_RACE: c.MAPSEG_RACE, MP_NRACEB: c.MAPSEG_NRACEB,
    MP_X0: c.MAPIMG_X0, MP_Z0: c.MAPIMG_Z0, MP_W: c.MAPIMG_W, MP_HT: c.MAPIMG_H, MP_MOVE: c.MAPSEG_MOVE, MP_NMOVEB: c.MAPSEG_NMOVEB };
  for (const [k, v] of Object.entries(u32)) dv.setUint32(L[k], v, true);
  dv.setFloat32(L.MP_CEIL, m.ceiling, true);
  out.set(m.bytes, L.MAPPACK_HEAD);
  return out;
}
// What map_load's codes mean
export const MAP_LOAD_ERRORS = ['', 'not a packed map (its head)', 'a count past the build\'s limits', 'a part outside its bytes',
  'its images outside the world', 'a group or a box (out of range, inside out, or not a number)', 'its ceiling or void', 'a place that is not a number in reach',
  'a mover (past its groups, its ticks out of range, or its flags)'];
