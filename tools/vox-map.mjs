// A MagicaVoxel model made into an arena map, with no Node in it:
// tools/vox.mjs runs it on a file and writes maps/<name>/, the map editor on
// a file dropped into the page (docs/vox.md). The voxels are cubes `scale`
// metres a side (0.5, the arena's STEP: a voxel is a step a fighter walks
// up), z up in MagicaVoxel and y up here.
//   - The floor is the ground: each column's lowest run of solid, as deep
//     as at least half the columns' runs are (the rest of a taller run, a
//     wall standing on the floor, is boxes), where it stands on the model's
//     bottom or meets a neighbour's ground (a landscape's slopes), when it
//     covers groundArea m^2; its top voxel's colour the nearest surface (a
//     metal material, metal).
//   - The rest is boxes: runs of one colour grown along x, then y, then z,
//     each the biggest it can be from where it starts; then
//     tools/scene-map.mjs fits them to the budget, as little changed as will
//     do, and puts a void wherever there is no ground.
//   - An object named for a spawn ("spawn", "red spawn", "blue spawn") is a
//     spawn on its top, its team's in its name; one named for a weapon
//     ("sword", "rocket launcher", tools/rbx-brief.mjs's weaponOf) is a pad
//     with that gun, its voxels left out.
//   - A colour's material: metal is the metal look, emit the lit one (light),
//     the rest plain.
import { eachVoxel } from './vox-file.mjs';
import { hex, sceneToMap } from './scene-map.mjs';
import { weaponOf } from './rbx-brief.mjs';
import { SURFACES, SURFACE_RGB } from './map-compile.mjs';
import * as L from '../src/layout.mjs';

export const OPTIONS = {
  scale: 0.5, // metres a voxel
  cell: 0.5, rise: 0.25, // (columns: every voxel box is square, so unused)
  groundArea: 150, // the floor must cover this (m^2) to be the ground
  budget: L.NBOX,
  name: '',
};

const MAX_CELLS = 64 * 1024 * 1024; // the model's bounds, in voxels

function nearestSurface(rgb) {
  let best = 1, bd = Infinity;
  SURFACES.forEach((n, k) => { const c = SURFACE_RGB[n], d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2; if (d < bd) { bd = d; best = k; } });
  return best;
}

export function voxToMap(vox, opts = {}) {
  const o = { ...OPTIONS, ...opts };
  const s = o.scale;
  const notes = vox.notes.slice();
  const count = { voxels: 0, models: vox.instances.length, columns: 0, floor: 0, depth: 0, boxes: 0, square: 0, cut: 0, spawns: 0, pads: 0 };
  const rgbOf = (c) => [vox.palette[4 * c], vox.palette[4 * c + 1], vox.palette[4 * c + 2]];
  const lookOf = (c) => { const t = vox.materials.get(c)?.type; return t === 'metal' ? 'metal' : t === 'emit' ? 'light' : 'plain'; };

  // what each object is: a spawn, a pad or voxels
  const role = vox.instances.map((ins) => {
    const n = ins.name.toLowerCase();
    if (/spawn/.test(n)) return { spawn: true, team: /red/.test(n) ? 'red' : /blue/.test(n) ? 'blue' : null };
    const w = ins.name && weaponOf(ins.name);
    return w ? { weapon: w } : {};
  });
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const own = vox.instances.map(() => null); // a spawn's or pad's bounds
  eachVoxel(vox, (x, y, z, c, k) => {
    if (!c) return;
    const p = [x, y, z];
    if (role[k].spawn || role[k].weapon) {
      const b = (own[k] ||= [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
      for (let a = 0; a < 3; a++) { b[a] = Math.min(b[a], p[a]); b[a + 3] = Math.max(b[a + 3], p[a] + 1); }
      if (role[k].spawn) role[k].colour ??= c;
      return;
    }
    count.voxels++;
    for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
  });

  // the voxels in a grid over their bounds, by colour (0 none), and which object each is from
  const [nx, ny, nz] = count.voxels ? [0, 1, 2].map((a) => hi[a] - lo[a] + 1) : [0, 0, 0];
  if (nx * ny * nz > MAX_CELLS) throw new Error(`the model is ${nx} x ${ny} x ${nz} voxels, more than the ${MAX_CELLS / 1048576}M this converts at once: hide what isn't the map, or save it in parts`);
  const grid = new Uint8Array(nx * ny * nz), from = new Uint16Array(grid.length);
  const at = (x, y, z) => (z * ny + y) * nx + x;
  if (count.voxels) eachVoxel(vox, (x, y, z, c, k) => { if (c && !role[k].spawn && !role[k].weapon) { const i = at(x - lo[0], y - lo[1], z - lo[2]); grid[i] = c; from[i] = k; } });

  // ---- the ground: each column's lowest run of solid, as deep as at least
  // half the columns' are where it stands on the model's bottom or meets a
  // neighbour's ground (a landscape's slopes; a bridge's deck over nothing
  // stays boxes when it is not reached)
  const base = new Int32Array(nx * ny).fill(-1), run = new Uint16Array(nx * ny);
  const lengths = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let z = 0;
    while (z < nz && !grid[at(x, y, z)]) z++;
    if (z === nz) continue;
    let r = 0;
    while (z + r < nz && grid[at(x, y, z + r)]) r++;
    base[y * nx + x] = z; run[y * nx + x] = r;
    lengths.push(r);
  }
  lengths.sort((p, q) => p - q);
  const depth = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
  const top = new Int32Array(nx * ny).fill(-1), topSurf = new Uint8Array(nx * ny);
  const queue = [];
  const take = (k) => { top[k] = base[k] + Math.min(run[k], depth); queue.push(k); };
  for (let k = 0; k < nx * ny; k++) if (base[k] === 0) take(k);
  while (queue.length) {
    const k = queue.pop(), x = k % nx, y = Math.floor(k / nx);
    for (const [u, v] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (u < 0 || v < 0 || u >= nx || v >= ny) continue;
      const n = v * nx + u;
      // its ground and this one's touch: neither starts above the other's top
      if (top[n] < 0 && base[n] >= 0 && base[n] <= top[k] && base[k] <= base[n] + Math.min(run[n], depth)) take(n);
    }
  }
  let columns = 0;
  for (let k = 0; k < nx * ny; k++) if (top[k] >= 0) columns++;
  const ground = columns && columns * s * s >= o.groundArea;
  if (ground) {
    for (let k = 0; k < nx * ny; k++) {
      if (top[k] < 0) continue;
      const x = k % nx, y = Math.floor(k / nx), c = grid[at(x, y, top[k] - 1)];
      topSurf[k] = lookOf(c) === 'metal' ? 3 : nearestSurface(rgbOf(c));
      for (let z = base[k]; z < top[k]; z++) grid[at(x, y, z)] = 0;
      count.floor += top[k] - base[k];
    }
    count.columns = columns;
    count.depth = depth;
  } else top.fill(-1);
  // the ground at a point: the highest floor column within half a sample of
  // it, so the floor is flat out to its edge (as a Roblox baseplate is)
  const reach = L.SPACING / 2;
  const terrain = ground ? {
    boxes: [[lo[0] * s, lo[2] * s, -(lo[1] + ny) * s, (lo[0] + nx) * s, (lo[2] + nz) * s, -lo[1] * s]],
    at: (x, z) => {
      let best = -1, sf = 1;
      const x0 = Math.max(0, Math.floor((x - reach) / s) - lo[0]), x1 = Math.min(nx - 1, Math.ceil((x + reach) / s) - 1 - lo[0]);
      const y0 = Math.max(0, Math.floor(-(z + reach) / s) - lo[1]), y1 = Math.min(ny - 1, Math.ceil(-(z - reach) / s) - 1 - lo[1]);
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) { const k = y * nx + xx; if (top[k] > best) { best = top[k]; sf = topSurf[k]; } }
      return best >= 0 ? [(lo[2] + best) * s, sf] : undefined;
    },
  } : null;

  // ---- the boxes: runs of one colour grown along x, then y, then z
  const objs = [];
  const names = vox.instances.map((ins, k) => ins.name || (vox.instances.length > 1 ? `model ${k + 1}` : ''));
  const solidOf = (b) => ({ box: b, square: true, upright: true, area: (b[3] - b[0]) * (b[5] - b[2]), planes: null });
  const objOf = (b, c, extra = {}) => {
    const colour = rgbOf(c), look = lookOf(c);
    return { pos: [solidOf(b)], neg: [], colour, look, key: `${look}${hex(colour)}`, surface: look === 'metal' ? 3 : nearestSurface(colour), model: '', ...extra };
  };
  // vox cells [x0, x1) x [y0, y1) x [z0, z1) to metres, y up
  const metres = (x0, y0, z0, x1, y1, z1) => [x0 * s, z0 * s, -y1 * s, x1 * s, z1 * s, -y0 * s];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const c = grid[at(x, y, z)];
    if (!c) continue;
    let w = 1, d = 1, h = 1;
    while (x + w < nx && grid[at(x + w, y, z)] === c) w++;
    rows: while (y + d < ny) { for (let u = 0; u < w; u++) if (grid[at(x + u, y + d, z)] !== c) break rows; d++; }
    layers: while (z + h < nz) { for (let v = 0; v < d; v++) for (let u = 0; u < w; u++) if (grid[at(x + u, y + v, z + h)] !== c) break layers; h++; }
    const k = from[at(x, y, z)];
    for (let q = 0; q < h; q++) for (let v = 0; v < d; v++) grid.fill(0, at(x, y + v, z + q), at(x, y + v, z + q) + w);
    objs.push(objOf(metres(lo[0] + x, lo[1] + y, lo[2] + z, lo[0] + x + w, lo[1] + y + d, lo[2] + z + h), c, { model: names[k] }));
  }
  count.boxes = objs.length;

  // ---- spawns and pads, from the objects named for them
  const spawns = [], pads = [];
  role.forEach((r, k) => {
    const b = own[k];
    if (!b) return;
    if (r.spawn) {
      const obj = objOf(metres(b[0], b[1], b[2], b[3], b[4], b[5]), r.colour, { spawn: true, model: names[k] });
      objs.push(obj);
      spawns.push({ obj, team: r.team, rgb: r.team === 'red' ? [255, 0, 0] : r.team === 'blue' ? [0, 0, 255] : null });
      count.spawns++;
    } else {
      const m = metres(b[0], b[1], b[2], b[3], b[4], b[5]);
      pads.push({ weapon: r.weapon, at: [(m[0] + m[3]) / 2, m[1], (m[2] + m[5]) / 2] });
      count.pads++;
    }
  });

  const report = (c) => ({
    head: [
      `${c.voxels} voxels in ${c.models} model${c.models === 1 ? '' : 's'}, ${s} m a voxel: ${c.columns ? `the ground ${c.columns} columns (${c.floor} voxels, at most ${c.depth} deep), the rest ${c.boxes} boxes of one colour` : `no ground wide enough; ${c.boxes} boxes of one colour`}`,
      ...(c.spawns || c.pads ? [`${c.spawns} objects named spawn, ${c.pads} named for weapons (pads)`] : []),
    ],
    tail: vox.defaultPalette ? ['the file has no palette of its own: MagicaVoxel\'s default'] : [],
  });
  return sceneToMap({
    objs, terrain, spawns, pads, count, notes, report,
    empty: () => 'nothing to stand on: the model has no voxels outside its spawns and pads',
    name: o.name || 'Voxel Map',
    words: { unit: `${s} m a voxel`, void: 'open air', spawns: 'objects named spawn', unnamed: 'voxels', from: `a MagicaVoxel model, ${s} m a voxel (tools/vox.mjs)` },
  }, o);
}
