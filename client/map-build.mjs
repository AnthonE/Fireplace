// The map editor's building half, with no page in it (test/map-build.test.mjs
// runs it in Node): the 3D view's camera as the arena's renderer projects
// it, the ray through the pointer against the map's boxes and the ground,
// the plane and the lines a drag slides along, the grid, a box's part read
// and written as map.json holds it, the check of an obby's course, and the
// starter course. Editing and drawing only: the sim reads none of it.
import * as L from '../src/layout.mjs';
import { moverAt } from '../src/arena-view.mjs';
import { place, placePoint, PART_KINDS, MAP_MODES } from '../tools/map-compile.mjs';

export const tidy = (v) => Math.round(v * 1000) / 1000 || 0; // (never -0)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- the camera: the renderer's (client/arena-render.mjs lens(), project()):
// a focal length in px, and the pitch a vertical shear, so the horizon is a
// row of the screen and a ray's forward part is always 1.
const FOCAL = 0.62; // of the width, up to a 16:10 screen (client/lowpoly.mjs focalFor)
// The eye of a camera `dist` metres from `target`, looking at it along `yaw`
// (0 towards +x) and `pitch` (down is negative), on a W x H screen, as
// client/map-view.mjs places it.
export function orbitEye({ target, yaw, pitch, dist }, W, H) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const focal = Math.min(W, H * 1.6) * FOCAL;
  return {
    cam: [target[0] - cy * cp * dist, target[1] - sp * dist, target[2] - sy * cp * dist],
    yaw, pitch, cy, sy, focal, horizon: H / 2 + Math.tan(clamp(pitch, -1.35, 1.35)) * focal, W, H,
  };
}
// Where world point q lands on the eye's screen: [x, y, metres ahead of it]
export function screenOf(e, q) {
  const rx = q[0] - e.cam[0], ry = q[1] - e.cam[1], rz = q[2] - e.cam[2];
  const zf = rx * e.cy + rz * e.sy, k = e.focal / Math.max(zf, 0.01);
  return [e.W / 2 + (-rx * e.sy + rz * e.cy) * k, e.horizon - ry * k, zf];
}
// The ray through screen point (px, py): { o, d }, d a metre ahead a unit of t
export function rayAt(e, px, py) {
  const a = (px - e.W / 2) / e.focal, b = (e.horizon - py) / e.focal;
  return { o: e.cam.slice(), d: [e.cy - e.sy * a, b, e.sy + e.cy * a] };
}
// A polygon of world points cut to what is `near` metres or more ahead of the
// eye, and projected: screen points, none for one wholly behind.
export function polygonOf(e, pts, near = 0.1) {
  const ahead = (q) => (q[0] - e.cam[0]) * e.cy + (q[2] - e.cam[2]) * e.sy - near;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], da = ahead(a), db = ahead(b);
    if (da >= 0) out.push(screenOf(e, a));
    if ((da < 0) !== (db < 0)) { const t = da / (da - db); out.push(screenOf(e, [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t))); }
  }
  return out;
}
// A line of world points cut the same way: [[x, y], [x, y]], or null behind the eye
export function segmentOf(e, a, b, near = 0.1) {
  const p = polygonOf(e, [a, b], near);
  return p.length >= 2 ? [p[0], p[1]] : null;
}

// ---- the ray against things
// Where the ray enters box b ([x0, y0, z0, x1, y1, z1]): { t, axis, sign },
// the face it comes in by (its normal: `sign` along `axis`); null for a miss,
// or from inside the box.
export function rayBox(o, d, b) {
  let t0 = 0, t1 = Infinity, axis = -1, sign = 0;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < b[a] || o[a] > b[a + 3]) return null; continue; }
    let n = (b[a] - o[a]) / d[a], f = (b[a + 3] - o[a]) / d[a], s = -1;
    if (n > f) { const x = n; n = f; f = x; s = 1; }
    if (n > t0) { t0 = n; axis = a; sign = s; }
    if (f < t1) t1 = f;
    if (t0 > t1) return null;
  }
  return axis < 0 ? null : { t: t0, axis, sign };
}
// The nearest of `boxes` the ray meets: { i, t, axis, sign, at }, or null
export function pickRay(o, d, boxes) {
  let best = null;
  boxes.forEach((b, i) => { const h = rayBox(o, d, b); if (h && (!best || h.t < best.t)) best = { i, ...h }; });
  if (best) best.at = [0, 1, 2].map((k) => o[k] + d[k] * best.t);
  return best;
}
// Where the ray meets the plane `axis` = v ahead of its start, or null
export function rayPlane(o, d, axis, v) {
  if (Math.abs(d[axis]) < 1e-9) return null;
  const t = (v - o[axis]) / d[axis];
  return t > 0 ? [0, 1, 2].map((k) => o[k] + d[k] * t) : null;
}
// Where the ray first goes under the ground (height(x, z), metres) within
// `far` metres: marched in steps that grow with the distance, then halved in.
export function rayGround(o, d, height, far = 1500) {
  const under = (t) => o[1] + d[1] * t - height(o[0] + d[0] * t, o[2] + d[2] * t);
  if (under(0) < 0) return null;
  let a = 0;
  for (let t = 0.5; t < far; t += Math.max(0.5, t * 0.02)) {
    if (under(t) >= 0) { a = t; continue; }
    let b = t;
    for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (under(m) >= 0) a = m; else b = m; }
    return [o[0] + d[0] * b, height(o[0] + d[0] * b, o[2] + d[2] * b), o[2] + d[2] * b];
  }
  return null;
}
// The coordinate along `axis` of the point on the line through p that way
// which is nearest the ray: what a handle dragged along an axis follows.
// Null when the ray runs along the axis.
export function alongAxis(o, d, p, axis) {
  const w = [o[0] - p[0], o[1] - p[1], o[2] - p[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], de = d[axis], wd = w[0] * d[0] + w[1] * d[1] + w[2] * d[2], we = w[axis];
  const den = de * de - dd;
  if (Math.abs(den) < 1e-6 * dd) return null;
  return p[axis] + (wd * de - we * dd) / den;
}

// ---- the grid
// v on a grid of `grid` metres (0 or less: off, a millimetre)
export const snap = (v, grid) => (grid > 0 ? tidy(Math.round(v / grid) * grid) : tidy(v));
// World box w moved by (dx, dy, dz), its size kept: along each way it moves,
// its low corner lands on the grid; a way it doesn't move it stays as it is
export function movedBox(w, d, grid) {
  const out = w.slice(0, 6);
  for (let a = 0; a < 3; a++) {
    if (!d[a]) continue;
    const lo = snap(w[a] + d[a], grid);
    out[a] = lo; out[a + 3] = tidy(lo + (w[a + 3] - w[a]));
  }
  return out;
}
// World box w with the face (axis, sign) put at v, on the grid, never nearer
// its other face than `min`
export function facedBox(w, axis, sign, v, grid, min = grid > 0 ? grid : 0.05) {
  const out = w.slice(0, 6);
  if (sign > 0) out[axis + 3] = Math.max(snap(v, grid), tidy(w[axis] + min));
  else out[axis] = Math.min(snap(v, grid), tidy(w[axis + 3] - min));
  return out;
}
// A new box of `size` put against what the pointer is on: `hit` is { at,
// axis, sign } (a box's face, or the ground: axis 1, sign 1, ground true).
// It stands out from that face, centred on the point the other two ways; on
// the ground its foot goes down to the grid under it, so it never floats.
export function dropBox(hit, size, grid) {
  const out = [0, 0, 0, 0, 0, 0];
  for (let a = 0; a < 3; a++) {
    let lo;
    if (a !== hit.axis) lo = snap(hit.at[a] - size[a] / 2, grid);
    else if (hit.ground) { const g = grid > 0 ? grid : 0.1; lo = tidy(Math.floor(hit.at[a] / g + 1e-6) * g); }
    else lo = tidy(hit.sign > 0 ? hit.at[a] : hit.at[a] - size[a]);
    out[a] = lo; out[a + 3] = tidy(lo + size[a]);
  }
  return out;
}

// ---- a structure's boxes in the world, and back
const quarter = (turn) => ((Math.round((turn || 0) / 90) % 4) + 4) % 4;
const rot = ([x, z], q) => [[x, z], [-z, x], [-x, -z], [z, -x]][q];
// Box b of structure s where the world has it (tools/map-compile.mjs place())
export function worldBox(s, b) {
  try { return place(b, s.at || [0, 0, 0], s.turn || 0); } catch { return b.slice(0, 6); }
}
// Set box b of structure s to world box w, through the structure's turn and place
export function setWorldBox(s, b, w) {
  const at = s.at || [0, 0, 0], q = (4 - quarter(s.turn)) % 4;
  const a = rot([w[0] - at[0], w[2] - at[2]], q), c = rot([w[3] - at[0], w[5] - at[2]], q);
  b[0] = tidy(Math.min(a[0], c[0])); b[2] = tidy(Math.min(a[1], c[1]));
  b[3] = tidy(Math.max(a[0], c[0])); b[5] = tidy(Math.max(a[1], c[1]));
  b[1] = tidy(w[1] - at[1]); b[4] = tidy(w[4] - at[1]);
}
// A structure's "move" as the compiler packs it (ticks at 125 Hz, `by`
// turned with the structure), for moverAt; null for one that stands still
// or whose numbers aren't ones yet
export function moveOf(s) {
  const m = s.move;
  if (!m || !Array.isArray(m.by) || m.by.length !== 3 || m.by.some((v) => typeof v !== 'number')) return null;
  const ticks = (v) => Math.round(v * L.TICK_HZ);
  const travel = ticks(m.seconds ?? 4);
  if (!(travel >= 1)) return null;
  let by;
  try { by = placePoint(m.by, [0, 0, 0], s.turn || 0).map(Math.fround); } catch { return null; }
  return { by, travel, wait: Math.max(0, ticks(m.wait ?? 1) || 0), phase: Math.max(0, ticks(m.phase ?? 0) || 0), ease: !!m.ease };
}
// How far structure s has moved from where it is built at tick t: [dx, dy, dz]
export function movedAt(s, t) {
  const m = moveOf(s);
  return m ? moverAt(m, t) : [0, 0, 0];
}
export const shifted = (w, o) => [w[0] + o[0], w[1] + o[1], w[2] + o[2], w[3] + o[0], w[4] + o[1], w[5] + o[2]];

// ---- parts: a box's eighth element (tools/map-compile.mjs partOf)
export const PART_NAMES = Object.keys(PART_KINDS);
// How a part of each kind looks unless its box has a colour of its own
// (tools/obby.mjs: lava glows red-orange, a checkpoint green, ...)
export const PART_LOOKS = {
  kill: 'light#ff4a1c', bounce: 'light#ffd23f', ice: '#bfe8ff', conveyor: 'dark#39424e',
  ladder: 'metal#d08c3a', checkpoint: 'light#4ade80', finish: 'light#ffffff',
};
// The colour the editor marks each kind with, in both views
export const PART_MARK = { kill: '#ff5a2c', bounce: '#ffd23f', ice: '#9fdcff', conveyor: '#c9a2ff', ladder: '#e09a48', checkpoint: '#4ade80', finish: '#ffffff' };
export const PART_WHAT = {
  kill: 'Touching it anywhere kills.',
  bounce: 'Standing on it throws you up at its speed.',
  ice: 'Standing on it, your speed across changes only that share of what it would: slow away, slow to stop.',
  conveyor: 'Standing on it carries you along its arrow.',
  ladder: 'Beside it, forward climbs and back comes down; the jump key lets go.',
  checkpoint: 'Obby: reaching it is your stage, and where you come back after a death.',
  finish: 'Obby: the end of the course.',
};
// A kind's own numbers as first chosen (the compiler's defaults, and a belt
// of half a walk)
const FIRST = { bounce: { speed: 14 }, ice: { grip: 0.06 }, conveyor: { velocity: [3, 0] }, ladder: { speed: 4.5 } };
const FIELDS = { bounce: ['speed'], ice: ['grip'], conveyor: ['velocity'], ladder: ['speed'], checkpoint: ['stage'] };

// A box's part as an object: { kind, ghost, and the kind's numbers as
// written }, or null for a plain box
export function readPart(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return { kind: v, ghost: false };
  if (typeof v !== 'object' || Array.isArray(v)) return { kind: String(v), ghost: false };
  return { ...v, kind: String(v.kind), ghost: !!v.ghost };
}
// and back, as map.json holds it: the kind alone as a word, else an object
// with only what that kind reads
export function writePart(p) {
  if (!p || !p.kind) return undefined;
  const o = { kind: p.kind };
  for (const f of FIELDS[p.kind] || []) if (p[f] !== undefined) o[f] = p[f];
  if (p.ghost) o.ghost = true;
  return Object.keys(o).length === 1 ? p.kind : o;
}
// Every box with a part, in the world: { s, b, box, part, moving }
export function partsOf(spec) {
  const out = [];
  (spec.structures || []).forEach((s, si) => {
    const list = s.prefab ? spec.prefabs?.[s.prefab] || [] : s.boxes || [];
    list.forEach((b, bi) => { const part = readPart(b[7]); if (part) out.push({ s: si, b: bi, box: worldBox(s, b), part, moving: !!s.move }); });
  });
  return out;
}
// The next free stage: the lowest number from 1 no checkpoint has
export function nextStage(spec) {
  const used = new Set(partsOf(spec).filter((p) => p.part.kind === 'checkpoint').map((p) => p.part.stage));
  let k = 1;
  while (used.has(k)) k++;
  return k;
}
// A box's material once its part is `kind` (none: undefined). A colour set by
// hand stays; the editor's own (a new box's metal or plain, or another
// kind's look) follows the kind.
const OURS = new Set(['metal', 'plain', ...Object.values(PART_LOOKS)]);
export function lookFor(material, kind) {
  const m = material ?? 'metal';
  if (!OURS.has(m)) return m;
  return kind ? PART_LOOKS[kind] : m === 'plain' ? 'plain' : 'metal';
}
// Make box b (a map.json box) a part of `kind`, or a plain box again
// (kind ''): the kind's numbers as first chosen unless it keeps its kind, a
// checkpoint the next free stage, the look following unless it has its own.
export function setKind(spec, b, kind) {
  const was = readPart(b[7]);
  if (!kind) { b[6] = lookFor(b[6], undefined); b.length = 7; return; }
  const p = was && was.kind === kind ? was : { kind, ghost: !!was?.ghost, ...(FIRST[kind] ? JSON.parse(JSON.stringify(FIRST[kind])) : {}) };
  if (kind === 'checkpoint' && p.stage === undefined) p.stage = nextStage(spec);
  b[6] = lookFor(b[6], kind);
  b[7] = writePart(p);
}
// Change one thing about box b's part (a number, ghost)
export function setPartField(b, field, value) {
  const p = readPart(b[7]);
  if (!p) return;
  if (value === undefined) delete p[field]; else p[field] = value;
  b[7] = writePart(p);
}
// A belt's velocity [vx, vz] as a direction (degrees: 0 east, +x; 90 south,
// +z) and a speed, and back
export const beltOf = (v) => ({ speed: tidy(Math.hypot(v[0], v[1])), angle: tidy(((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360) });
export const beltVelocity = (angle, speed) => [tidy(Math.cos((angle * Math.PI) / 180) * speed), tidy(Math.sin((angle * Math.PI) / 180) * speed)];
// A belt's velocity in the world: turned with its structure (as the compiler turns it), and back
export const beltWorld = (v, turn = 0) => { const q = rot(v, quarter(turn)); return [q[0], q[1]]; };
export const beltLocal = (v, turn = 0) => { const q = rot(v, (4 - quarter(turn)) % 4); return [q[0], q[1]]; };

// ---- the map's rules
// A Roblox character at 0.28 m a stud: its Humanoid's walk, jump and gravity, and its size
export const ROBLOX_MOVEMENT = { walk: 4.48, jump: 2.016, gravity: 54.936 };
export const ROBLOX_BODY = { width: 0.56, height: 1.4 };
export const ARENA_BODY = { width: 1, height: 1.8 };
// Whether the build asks a spawn on each half: not of a map that plays one
// mode every match, that mode without sides (the compiler's rule)
export function needsSides(spec) {
  const m = spec.mode !== undefined && spec.mode in MAP_MODES ? MAP_MODES[spec.mode] + 1 : 0;
  return !(m && !((L.TEAMED >> (m - 1)) & 1));
}

// ---- the course: an obby's stages in order, and what is wrong with them.
// `ground(x, z)` is the ground's height (the editor's). Lines are { level:
// 'ok' | 'warn' | 'bad', text, sel } (sel: what to show, as the editor picks
// it: { kind: 'box', s, b } or { kind: 'spawn', i }); null
// for a map with no course in it (no checkpoint, no finish, not an obby).
export function courseOf(spec, { ground = () => -Infinity } = {}) {
  const parts = partsOf(spec);
  const checks = parts.filter((p) => p.part.kind === 'checkpoint'), finishes = parts.filter((p) => p.part.kind === 'finish');
  const obby = spec.mode === 'obby';
  if (!obby && !checks.length && !finishes.length) return null;
  const lines = [], say = (level, text, p) => lines.push({ level, text, ...(p ? { sel: p.kind ? p : { kind: 'box', s: p.s, b: p.b } } : {}) });
  const at = (p) => `${tidy((p.box[0] + p.box[3]) / 2)}, ${tidy((p.box[2] + p.box[5]) / 2)}, ${tidy(p.box[4])} m up`;
  const body = spec.body && spec.body.width > 0 && spec.body.height > 0 ? spec.body : ARENA_BODY;
  // every solid box where it is built, and whether it kills
  const solid = [], kills = [];
  (spec.structures || []).forEach((s) => {
    const list = s.prefab ? spec.prefabs?.[s.prefab] || [] : s.boxes || [];
    for (const b of list) {
      const part = readPart(b[7]), box = worldBox(s, b);
      if (!part || !part.ghost) solid.push({ box, kill: part?.kind === 'kill' });
      if (part?.kind === 'kill') kills.push(box);
    }
  });
  // what is wrong with standing at (x, z) on the highest box no higher than
  // `top`, else the ground (the sim's $stand), with `from` the foot of what was meant to hold you
  const standing = (x, z, top, from) => {
    const r = body.width / 2, over = (b) => x - r < b[3] && x + r > b[0] && z - r < b[5] && z + r > b[2];
    let y = ground(x, z), on = null;
    for (const q of solid) if (over(q.box) && q.box[4] <= top && q.box[4] > y) { y = q.box[4]; on = q; }
    const why = [];
    if (on?.kill) why.push('it stands you on a part that kills');
    else if (kills.some((b) => over(b) && y + body.height > b[1] - 0.03 && y < b[4] + 0.03)) why.push('a part that kills touches whoever stands there');
    if (solid.some((q) => q !== on && over(q.box) && q.box[1] < y + body.height && q.box[4] > y + 0.01)) why.push(`a box leaves no room for a body ${body.height} m tall`);
    if (from !== undefined && y < from - 0.5) why.push(`nothing under it to stand on: you would come back ${tidy(from - y)} m below it`);
    if (typeof spec.void === 'number' && y < spec.void) why.push(`it is under the void (${spec.void} m)`);
    return why;
  };
  // where a fighter comes back on checkpoint p (the sim's $oy_spawn): its middle, on its top or what is under it
  const back = (p) => standing((p.box[0] + p.box[3]) / 2, (p.box[2] + p.box[5]) / 2, p.box[4] + 0.01, p.box[1]);
  // the start: a spawn that kills whoever starts on it (a start platform moved from under it) ends nobody's run
  const spawns = spec.spawns || [], dead = spawns.map((p, k) => ({ k, why: standing(p[0], p[1], p[2] ?? -1000) })).filter((p) => p.why.length);
  say(spawns.length ? 'ok' : 'bad', spawns.length ? `the start: ${spawns.length} spawn${spawns.length === 1 ? '' : 's'}, where everyone begins` : 'no start: add a spawn where the course begins');
  for (const p of dead) say('bad', `spawn ${p.k + 1} at ${spawns[p.k][0]}, ${spawns[p.k][1]} is no place to start: ${p.why.join('; ')}`, { kind: 'spawn', i: p.k });
  const last = checks.reduce((n, p) => (Number.isInteger(p.part.stage) ? Math.max(n, p.part.stage) : n), 0);
  for (let k = 1; k <= last; k++) {
    const mine = checks.filter((p) => p.part.stage === k);
    if (!mine.length) { say('warn', `stage ${k} is missing: the stages run 1 to ${last} and no checkpoint is ${k}`); continue; }
    const why = back(mine[0]);
    say(why.length ? 'bad' : 'ok', `stage ${k}: ${mine[0].part.ghost ? 'a zone' : 'a checkpoint'} at ${at(mine[0])}${why.length ? `. Nobody could stand on it: ${why.join('; ')}` : ''}`, mine[0]);
    if (mine.length > 1) say('warn', `${mine.length} checkpoints are stage ${k}: a death comes back on the first`, mine[1]);
  }
  for (const p of checks) if (!Number.isInteger(p.part.stage) || p.part.stage < 1) say('bad', `a checkpoint at ${at(p)} has no stage`, p);
  if (!checks.length) say('ok', 'no checkpoints: a death is back at the start');
  if (finishes.length) say('ok', `the finish at ${at(finishes[0])}${finishes.length > 1 ? `, and ${finishes.length - 1} more: any of them ends a run` : ''}`, finishes[0]);
  else say(obby ? 'bad' : 'warn', obby ? 'no finish: the mode obby needs one (a box whose part is finish)' : 'no finish: the course has no end');
  if (!obby) say('warn', 'the map\'s mode is not obby: checkpoints and the finish do nothing in the others (what kills, throws, slides, carries and climbs works in all)');
  return { lines, stages: last, finishes: finishes.length };
}
// What the map's parts are, by kind: { kill: 3, ... }
export function partCounts(spec) {
  const n = {};
  for (const p of partsOf(spec)) n[p.part.kind] = (n[p.part.kind] || 0) + 1;
  return n;
}

// ---- the starter course: a small obby that compiles and plays, so nobody
// starts from an empty void. A start, four stages each ended by a
// checkpoint (stepping stones, bars that kill across a walkway, a strip of
// ice, a bounce pad up to a ledge), a ladder up a tower to the finish, and
// lava under all of it. Its numbers are Sky Steps' (tools/obby.mjs), which
// the AI fighters run: a walk of 6 m/s, a 2 m jump under 55 m/s^2.
// Returns { spec, ground: { size: [W, H] samples, level (m), surface } }.
export function starterObby() {
  const Z = 512, Y = 26;
  const LAVA = PART_LOOKS.kill, CHECK = PART_LOOKS.checkpoint, STONE = '#8d99ae', DECK = '#5c677d';
  const pad = (x0, x1, y, half = 2) => [x0, y - 0.5, Z - half, x1, y, Z + half];
  const check = (x0, x1, y, stage) => [...pad(x0, x1, y), CHECK, { kind: 'checkpoint', stage }];
  const boxes = [
    // the start
    [...pad(474, 484, Y, 4), DECK],
    // 1: stepping stones, 2.4 m apart
    [...pad(486.4, 488.4, Y, 1.2), STONE], [...pad(490.8, 492.8, Y, 1.2), STONE], [...pad(495.2, 497.2, Y, 1.2), STONE],
    check(499.6, 503.6, Y, 1),
    // 2: a walkway with bars that kill across it, to jump
    [...pad(503.6, 516, Y), DECK],
    [507, Y, Z - 2, 507.4, Y + 0.4, Z + 2, LAVA, 'kill'], [511.5, Y, Z - 2, 511.9, Y + 0.4, Z + 2, LAVA, 'kill'],
    check(516, 520, Y, 2),
    // 3: ice, a strip half as wide
    [...pad(520, 532, Y, 1.25), PART_LOOKS.ice, { kind: 'ice', grip: 0.08 }],
    check(532, 536, Y, 3),
    // 4: a bounce pad, and the ledge it throws you onto 3.5 m up
    [...pad(536, 539, Y), PART_LOOKS.bounce, { kind: 'bounce', speed: 22 }],
    [539, Y - 0.5, Z - 3, 547, Y + 3.5, Z + 3, STONE],
    [541, Y + 3.5, Z - 2, 544, Y + 3.6, Z + 2, CHECK, { kind: 'checkpoint', stage: 4 }],
    // a ladder up the tower, 6 m, and the finish on top
    [547, Y + 3.5, Z - 1, 547.5, Y + 9.5, Z + 1, PART_LOOKS.ladder, { kind: 'ladder', speed: 4.5 }],
    [547.5, Y - 0.5, Z - 3, 554, Y + 9.5, Z + 3, STONE],
    [549.5, Y + 9.5, Z - 2, 552.5, Y + 9.6, Z + 2, PART_LOOKS.finish, 'finish'],
  ];
  const spec = {
    name: 'My Obby',
    about: 'An obstacle course over lava.',
    bounds: [470, 558, 500, 524],
    terrain: { origin: [464, 488], height: 'height.png', scale: 0.00390625, base: 0, surface: 'surface.png' },
    mode: 'obby',
    movement: { walk: 6, jump: 2, gravity: 55 },
    void: 12,
    structures: [
      // under it all: touch it and you are back at your checkpoint
      { name: 'lava', boxes: [[470, 19.5, 500, 558, 20, 524, LAVA, 'kill']] },
      { name: 'course', boxes },
    ],
    spawns: [[476, 510, Y + 1], [476, 514, Y + 1], [479, 509.5, Y + 1], [479, 514.5, Y + 1], [482, 511, Y + 1], [482, 513, Y + 1]],
  };
  return { spec, ground: { size: [48, 24], level: 10, surface: 'rock' } };
}
