// The back half of a converter, with no Node in it: a scene (convex solids
// in metres with colours, a ground, spawns and pads) made into an arena map,
// whatever it came from. tools/rbx-map.mjs hands it a Roblox place,
// tools/vox-map.mjs a MagicaVoxel model. What it does with them:
//   - blocks square to the axes are their boxes, exactly;
//   - anything else is cut into columns 0.5 m across (`cell`), each column's
//     solid spans rounded to 0.25 m (`rise`), and runs of equal columns
//     joined into boxes, so a ramp becomes stairs a fighter walks up (the
//     arena's STEP is 0.5 m) and a turned wall a row of posts;
//   - big flat blocks with nothing under them (a baseplate, a floor on the
//     ground) are the ground instead of boxes, and so is the terrain;
//   - where there is no ground, a pit and a void under it (map.json "void");
//   - the boxes are made to fit the budget, as little changed as will do
//     (fit, below), the report saying how;
//   - spawns, teams and their flags, weapon pads, and the boxes grouped into
//     structures the build's queries skip whole.
import { SURFACES, SURFACE_RGB } from './map-compile.mjs';
import * as L from '../src/layout.mjs';

export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const tidy = (v) => Math.round(v * 1000) / 1000;
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
export function solid(kind, cf, half) {
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

// ---- a scene into a map

// A scene is what a front (a Roblox place, a voxel model) hands over, in
// metres with y up:
//   objs: { pos, neg (solids), colour [r, g, b], look, key, model (a name for
//     structures), surface (its surface if it is the ground), spawn (a spawn
//     stands on it: never fused or dropped) };
//   terrain: null, or { boxes (each column's top, for the extent), at(x, z):
//     [top, surface] or undefined };
//   spawns: { obj, team (any key, or null), rgb (the team's colour) };
//   pads: { weapon, at [x, y, z] };
//   count: the front's counts, which this adds ground, square and cut to;
//   notes: lines for the report, first;
//   report(count): { head, tail }, the front's own lines round the boxes'
//     and spawns';
//   words: { unit ("0.28 m a stud"), void ("Roblox's void"), spawns ("spawn
//     locations"), unnamed (a structure no model names), from (map.json's
//     "from") };
//   name, and empty(): the error when there is nothing to stand on.
// Options: cell, rise, groundArea, budget (OPTIONS in tools/rbx-map.mjs).
export function sceneToMap(scene, o) {
  const { objs, terrain, spawns: spawnParts, count, words } = scene;
  const notes = scene.notes.slice();

  // ---- the ground: big flat blocks with nothing under them, and the terrain
  const isFlat = (ob) => ob.pos.length === 1 && !ob.neg.length && ob.pos[0].upright && !ob.spawn && ob.pos[0].area >= o.groundArea;
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

  // ---- where the play is: what isn't ground, the terrain and the spawns,
  // and the ground round them (a 2048-stud baseplate is not the arena)
  const ext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const grow = (b, into = ext) => { for (let k = 0; k < 3; k++) { into[k] = Math.min(into[k], b[k]); into[k + 3] = Math.max(into[k + 3], b[k + 3]); } };
  for (const ob of objs) if (!ground.has(ob)) for (const sd of ob.pos) grow(sd.box);
  for (const b of terrain?.boxes ?? []) grow(b);
  const gext = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const g of ground) grow(g.pos[0].box, gext);
  if (!(ext[0] < ext[3])) ext.splice(0, 6, ...gext); // only ground: all of it
  else if (gext[0] < gext[3]) {
    const pad = 24;
    for (const k of [0, 2]) ext[k] = Math.min(ext[k], Math.max(gext[k], ext[k] - pad));
    for (const k of [3, 5]) ext[k] = Math.max(ext[k], Math.min(gext[k], ext[k] + pad));
  }
  if (!(ext[0] < ext[3])) throw new Error(scene.empty());

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
    notes.push(`the place is ${Math.round(ext[3] - ext[0])} x ${Math.round(ext[5] - ext[2])} m at ${words.unit}, wider than the map's ${MAXW} m: kept the ${MAXW} m round ${sp.length ? 'its spawns' : 'its middle'} (a smaller --scale keeps all of it)`);
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
    const tc = terrain?.at(x, z);
    if (tc) [h, sf] = tc;
    // a plate is the ground at every sample it reaches within half a sample,
    // so its edge is flat out to where it ends and the drop starts past it
    const r = SP / 2;
    for (const g of ground) {
      const b = g.pos[0].box;
      if (!(x >= b[0] - r && x <= b[3] + r && z >= b[2] - r && z <= b[5] + r && b[4] > h)) continue;
      const v = g.pos[0].square ? [b[1], b[4]] : span(g.pos[0].planes, x, z, r);
      if (v && v[1] > h) { h = v[1]; sf = g.surface; }
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
    const keep = !!ob.spawn; // what a spawn stands on is never fused or dropped
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
  // where the place has no ground is a void: a pit, and below 3 m under the lowest ground a fighter dies by falling
  const voidY = pits ? tidy(pitAt + 3 + oy) : null;
  if (pits) notes.push(`${Math.max(1, Math.round((100 * pits) / Math.max(1, inner)))}% of the map's area has no ground: ${words.void}, a pit where a fighter dies 3 m under the lowest ground ("void" ${voidY} m)`);

  const X = (v) => tidy(v + ox), Y = (v) => tidy(v + oy), Z = (v) => tidy(v + oz);
  const placed = boxes.map((x) => ({ ...x, w: [X(x.b[0]), Y(x.b[1]), Z(x.b[2]), X(x.b[3]), Y(x.b[4]), Z(x.b[5])] }));

  // ---- bounds: the place, inside the image by a sample
  const bounds = [
    Math.max((ix0 + 1) * SP, Math.floor(ext[0] + ox)), Math.min((ix0 + W - 2) * SP, Math.ceil(ext[3] + ox)),
    Math.max((iz0 + 1) * SP, Math.floor(ext[2] + oz)), Math.min((iz0 + H - 2) * SP, Math.ceil(ext[5] + oz)),
  ];
  const inside = (x, z) => x >= bounds[0] && x <= bounds[1] && z >= bounds[2] && z <= bounds[3];
  const clampIn = (x, z) => [Math.min(bounds[1], Math.max(bounds[0], x)), Math.min(bounds[3], Math.max(bounds[2], z))];

  // ---- spawns: each spawn's top; the two commonest teams are red's and blue's
  let spawns = [], flags;
  const teams = new Map(), rgbOf = new Map();
  for (const { obj, team, rgb } of spawnParts) {
    const b = obj.pos[0].box;
    const x = tidy((b[0] + b[3]) / 2 + ox), z = tidy((b[2] + b[5]) / 2 + oz);
    if (!inside(x, z)) continue;
    const sp = [x, z, tidy(b[4] + oy + 0.5)];
    spawns.push(sp);
    if (team != null) { if (!teams.has(team)) teams.set(team, []); teams.get(team).push(sp); rgbOf.set(team, rgb); }
  }
  const sides = [...teams.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 2);
  // the redder of the two is red's
  const redness = (t) => { const [r, , b] = rgbOf.get(t); return r - b; };
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
    notes.push(`${spawnParts.length} ${words.spawns}; kept ${L.NSPAWN}, spread through the list`);
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
  if (added) notes.push(`${spawnParts.length ? 'its spawns are all on one side, so' : `no ${words.spawns}, so`} ${added} spawns added at the ${spawnParts.length ? 'empty end' : 'two ends'}, on whatever is highest there`);

  // ---- structures: the boxes split in halves along the longer side, again
  // and again, into at most NGROUP groups of about equal count, each a
  // structure (the build's groups, which a query skips whole), named for the
  // model most of its boxes came from
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
    const top = [...names.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] || words.unnamed;
    used.set(top, (used.get(top) || 0) + 1);
    return {
      name: used.get(top) > 1 ? `${top} ${used.get(top)}` : top,
      boxes: list.map((x) => [...x.w, x.look === 'plain' ? hex(x.colour) : `${x.look}${hex(x.colour)}`]),
    };
  });

  const spec = {
    name: scene.name,
    from: words.from,
    bounds,
    terrain: { origin: [ix0 * SP, iz0 * SP], height: 'height.png', scale: 0.00390625, base: 0, surface: 'surface.png' },
    prefabs: {},
    structures,
    spawns,
  };
  if (flags) spec.flags = flags;
  const pads = [];
  for (const { weapon, at: [x, y, z] } of scene.pads) {
    if (pads.length >= L.NPAD) break;
    if (inside(x + ox, z + oz)) pads.push({ weapon, at: [tidy(x + ox), tidy(z + oz), tidy(y + oy + 1)] });
  }
  if (pads.length) { spec.pads = pads; notes.push(`${pads.length} weapons lying in the map are weapon pads: ${pads.map((p) => p.weapon).join(', ')}`); }
  if (voidY !== null) spec.void = voidY;
  const surface = new Uint8Array(W * H * 3);
  for (let k = 0; k < W * H; k++) surface.set(SURFACE_RGB[SURFACES[surf[k]]], 3 * k);

  const { head, tail } = scene.report(count);
  const report = [
    ...head,
    `${raw} boxes, ${merged + kept.length} after joining the ones that line up${boxes.length !== merged + kept.length ? `, ${boxes.length} in the map` : ''}, in ${structures.length} structures`,
    `${spawns.length} spawns; ${spawnParts.length} ${words.spawns} in the place`,
    ...tail,
    ...notes,
  ];
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
  // a grid to find the boxes round a point: a box is in every cell it
  // reaches, or, past BIG cells, in a list every box is checked against
  const B = 2, BIG = 512;
  const cell = new Map(), big = [];
  const keyOf = (x, y, z) => (x * 4099 + y) * 4099 + z;
  const span = (b) => b.map((v) => Math.floor(v / B));
  boxes.forEach((x, k) => {
    const [a, c, e, d, f, g] = span(x.b);
    if ((d - a + 1) * (f - c + 1) * (g - e + 1) > BIG) { big.push(k); return; }
    for (let i = a; i <= d; i++) for (let h = c; h <= f; h++) for (let j = e; j <= g; j++) { const q = keyOf(i, h, j); if (!cell.has(q)) cell.set(q, []); cell.get(q).push(k); }
  });
  const vol = (b) => (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]);
  const gone = new Uint8Array(boxes.length);
  boxes.forEach((x, k) => {
    const [a, c, e] = span(x.b), b = x.b;
    for (const list of [cell.get(keyOf(a, c, e)) || [], big]) for (const m of list) {
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
    const span = (x) => x.b.map((v) => Math.floor(v / C));
    const key = (i, h, j) => (i * 4099 + h) * 4099 + j;
    list.forEach((x, k) => {
      const [i0, h0, j0, i1, h1, j1] = span(x);
      for (let i = i0; i <= i1; i++) for (let h = h0; h <= h1; h++) for (let j = j0; j <= j1; j++) {
        const q = key(i, h, j);
        let c = cells.get(q);
        if (!c) cells.set(q, (c = []));
        c.push(k);
      }
    });
    // each box against the later boxes sharing a cell with it, each pair once (a stamp a box)
    const pairs = [], stamp = new Int32Array(n).fill(-1);
    for (let u = 0; u < n; u++) {
      const a = list[u], A = a.b, [i0, h0, j0, i1, h1, j1] = span(a);
      for (let i = i0; i <= i1; i++) for (let h = h0; h <= h1; h++) for (let j = j0; j <= j1; j++) for (const v of cells.get(key(i, h, j))) {
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
