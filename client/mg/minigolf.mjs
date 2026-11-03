// MINI GOLF, as drawn and as the AI ball sees it. The holes side by side,
// each a green on a plinth over the lawn, its walls in wood, the slopes laid
// as tilted strips (a ramp to a raised green, a hump, a dip, a bowl round the
// cup), the tee's mat, the cup and its flag, bumper posts in red; the
// windmill's house and its blades, the sliding gate in hazard stripes, the
// spinning bar, all on the prediction's clock as your own ball meets them.
// Your ball at rest shows its aim, a line of dots growing with the charge.
//
// The AI putts as a golfer would line one up: it reads the course from the
// sim's records, finds the way round the walls to the cup (a distance field
// over the hole, through the doors), aims at the farthest point of that way
// it can see, and tries putts round that line and its power on a mirror of
// the sim's roll (the walls, the posts, the slope, the obstacle on the tick
// it would meet it), a few a think; then the best, and for a hole with an
// obstacle the best moment to let go; then it holds Space as long as that
// power takes and lets go on the tick.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/minigolf.mjs'; // PT_*: the minigame's own constants
import { PLAT_Y, B_RAD } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const TURN = 16384;
const BASE = 0.8; // the plinths' foot under the floor, m
const GREEN = [0.2, 0.6, 0.26];
const GREEN2 = [0.17, 0.53, 0.22];
const LAWN = [0.3, 0.52, 0.22];
const RAIL = [0.62, 0.42, 0.24];
const PLINTH = [0.72, 0.68, 0.6];
const POST = [0.9, 0.16, 0.14];
const STEEL = [0.66, 0.68, 0.72];
const HOUSE = [0.86, 0.82, 0.74];
const ROOF = [0.62, 0.18, 0.14];
const SAIL = [0.95, 0.93, 0.86];
const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;

// ---- what the sim keeps, read

// A ball's PG_M, as the sim packs it.
export function golfer(m) {
  return {
    hole: m & 7, strokes: (m >>> MC.PT_M_STROKE) & 7, total: (m >>> MC.PT_M_TOTAL) & 63, charge: (m >>> MC.PT_M_CH) & 255,
    charging: !!(m & MC.PT_M_CHG), armed: !!(m & MC.PT_M_ARMED), pause: (m >>> MC.PT_M_PAUSE) & 127, begun: !!(m & MC.PT_M_BEGUN),
  };
}

const cache = { key: '', course: null };
// The course on the view's bank (null before a round of it is laid out): its
// holes, each in world metres as $pt_setup lays them, kept while the round is
// the same.
export function course(view, fresh = false) {
  const dv = view.dv, o = view.bank || 0;
  const nh = dv.getUint32(L.PG_H + MC.PT_NH + o, true);
  if (dv.getUint32(L.PG_GAME, true) !== L.MG_MINIGOLF || nh < MC.PT_NHMIN || nh > MC.PT_NHMAX) return null;
  const key = `${dv.getUint32(L.HDR_SEED + o, true)}:${dv.getUint32(L.HDR_HOLE + o, true)}:${nh}:${dv.getFloat32(L.PG_H + MC.PT_X0 + o, true)}`;
  if (!fresh && cache.key === key) return cache.course;
  const holes = [];
  for (let h = 0; h < nh; h++) {
    const a = L.PG_S + h * MC.PT_HSIZE, f = (k) => dv.getFloat32(a + k, true), u = (k) => dv.getUint32(a + k, true);
    const list = (n, at, fn) => Array.from({ length: Math.min(u(n), 64) }, (_, i) => fn(at + 16 * i));
    const hole = {
      h, tpl: u(MC.PT_H_TPL), mir: f(MC.PT_H_MIR), x: f(MC.PT_H_X), z: f(MC.PT_H_Z), len: f(MC.PT_H_LEN), hw: f(MC.PT_H_HW),
      tee: [f(MC.PT_H_TEEX), f(MC.PT_H_TEEZ)], cup: [f(MC.PT_H_CUPX), f(MC.PT_H_CUPZ)], par: u(MC.PT_H_PAR),
      segs: list(MC.PT_H_NSEG, MC.PT_H_SEG, (b) => [f(b), f(b + 4), f(b + 8), f(b + 12)]),
      posts: list(MC.PT_H_NPOST, MC.PT_H_POST, (b) => [f(b), f(b + 4), f(b + 8), f(b + 12)]),
      feats: list(MC.PT_H_NFT, MC.PT_H_FT, (b) => ({ kind: u(b), z0: f(b + 4), z1: f(b + 8), h: f(b + 12) })),
      greens: list(MC.PT_H_NGRN, MC.PT_H_GRN, (b) => [f(b), f(b + 4), f(b + 8), f(b + 12)]),
      mover: { kind: u(MC.PT_H_MK), x: f(MC.PT_H_MX), z: f(MC.PT_H_MZ), w: dv.getInt32(a + MC.PT_H_MW, true), ph: dv.getInt32(a + MC.PT_H_MP, true),
        a: f(MC.PT_H_MA), b: f(MC.PT_H_MB), c: dv.getInt32(a + MC.PT_H_MC, true) },
    };
    // each wall's box grown by a ball's reach, for the mirror's quick look
    hole.boxes = hole.segs.map(([ax, az, bx, bz]) => [Math.min(ax, bx) - MC.PT_RW, Math.min(az, bz) - MC.PT_RW, Math.max(ax, bx) + MC.PT_RW, Math.max(az, bz) + MC.PT_RW]);
    holes.push(hole);
  }
  const c = { nh, x0: dv.getFloat32(L.PG_H + MC.PT_X0 + o, true), z0: dv.getFloat32(L.PG_H + MC.PT_Z0 + o, true), pars: dv.getUint32(L.PG_H + MC.PT_PARS + o, true), holes, key };
  cache.key = key;
  cache.course = c;
  return c;
}

// The green's height over the floor at z on a hole, and its slope along z ($pt_surf, in doubles).
export function surf(H, z) {
  let h = 0, g = 0;
  for (const f of H.feats) {
    const w = f.z1 - f.z0, u = (z - f.z0) / w;
    if (f.kind === MC.PT_F_RAMP) {
      if (u >= 1) h += f.h;
      else if (u > 0) { h += f.h * u; g += f.h / w; }
    } else if (f.kind === MC.PT_F_HUMP && u > 0 && u < 1) {
      h += f.h * 0.5 * (1 - Math.cos(2 * Math.PI * u));
      g += (f.h * Math.PI / w) * Math.sin(2 * Math.PI * u);
    }
  }
  return [h, g];
}

// The hole a ball is on, from its x ($pt_hole_at).
export function holeAt(c, x) {
  return Math.max(0, Math.min(c.nh - 1, Math.floor((x - c.x0 + MC.PT_PITCH / 2) / MC.PT_PITCH)));
}

// The moving obstacle on (fractional) tick t into play: the windmill's turn
// (1/16384 turns, 0 a blade straight down) and whether its door is shut; the
// gate's gap's middle (x) and speed; the bar's turn.
export function moverAt(M, t) {
  if (M.kind === MC.PT_MK_WINDMILL) {
    const phi = t * M.w + M.ph;
    const ti = Math.floor(t);
    return { phi, shut: ((((ti * M.w + M.ph + M.c) | 0) & 4095) >>> 0) < 2 * M.c };
  }
  if (M.kind === MC.PT_MK_GATE) {
    const tau = (((t + M.ph) % M.w) + M.w) % M.w;
    let g = (4 * tau) / M.w, gv = (M.a * 500) / M.w;
    if (2 * tau < M.w) g -= 1; else { g = 3 - g; gv = -gv; }
    return { g: M.x + g * M.a * mirOf(M), gv: gv * mirOf(M) };
  }
  if (M.kind === MC.PT_MK_SPINNER) return { phi: t * M.w + M.ph };
  return {};
}
const mirOf = (M) => M.mir ?? 1;

// ---- the roll, mirrored (for the AI: close to the sim's, not its bits)

// The ball against a line grown by rad ($pt_hit): s { x, z, vx, vz }.
function hitLine(s, ax, az, bx, bz, rad, e, ux = 0, uz = 0, w = 0, cx = 0, cz = 0) {
  const ex = bx - ax, ez = bz - az;
  let t = ((s.x - ax) * ex + (s.z - az) * ez) / (ex * ex + ez * ez);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + ex * t, qz = az + ez * t, dx = s.x - qx, dz = s.z - qz, d2 = dx * dx + dz * dz;
  if (d2 >= rad * rad || d2 === 0) return false;
  const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
  const rx = ux - w * (qz - cz), rz = uz + w * (qx - cx);
  let vn = (s.vx - rx) * nx + (s.vz - rz) * nz;
  if (vn < 0) { vn *= 1 + e; s.vx -= vn * nx; s.vz -= vn * nz; }
  s.x = qx + nx * rad; s.z = qz + nz * rad;
  return true;
}

// The obstacle on tick t into play against the ball ($pt_movers).
function hitMover(H, s, t) {
  const M = H.mover;
  if (!M.kind) return;
  if (M.kind === MC.PT_MK_WINDMILL) {
    if (((((t * M.w + M.ph + M.c) | 0) & 4095) >>> 0) < 2 * M.c) hitLine(s, M.x - M.a, M.z, M.x + M.a, M.z, MC.PT_RW, MC.PT_ME);
    return;
  }
  if (M.kind === MC.PT_MK_GATE) {
    const { g, gv } = moverAt({ ...M, mir: H.mir }, t);
    hitLine(s, M.x - (M.a + M.b) - 1, M.z, g - M.b, M.z, MC.PT_RW, MC.PT_ME, gv);
    hitLine(s, g + M.b, M.z, M.x + M.a + M.b + 1, M.z, MC.PT_RW, MC.PT_ME, gv);
    return;
  }
  const a = ((t * M.w + M.ph) / TURN) * 2 * Math.PI, cs = Math.cos(a), sn = Math.sin(a);
  hitLine(s, M.x - M.a * cs, M.z - M.a * sn, M.x + M.a * cs, M.z + M.a * sn, MC.PT_RW, MC.PT_ME, 0, 0, M.w * MC.PT_RADT, M.x, M.z);
}

// One tick of a rolling ball on hole H, t ticks into play ($b_move's step, then $pt_push's): 'sunk', 'rest' or null.
export function rollTick(H, s, t) {
  s.x += s.vx * TICK;
  s.z += s.vz * TICK;
  const [, g] = surf(H, s.z);
  s.vz -= MC.PT_SLOPEG_DT * g;
  const sp2 = s.vx * s.vx + s.vz * s.vz;
  if (sp2 <= MC.PT_FRIC_DT * MC.PT_FRIC_DT && Math.abs(g) <= MC.PT_GSTILL) { s.vx = 0; s.vz = 0; } else if (sp2 > 0) {
    const sp = Math.sqrt(sp2), k = Math.max(sp - MC.PT_FRIC_DT, 0) / sp;
    s.vx *= k; s.vz *= k;
  }
  hitMover(H, s, t);
  for (const [px, pz, rad, kick] of H.posts) {
    const dx = s.x - px, dz = s.z - pz, d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad || d2 === 0) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
    let vn = s.vx * nx + s.vz * nz;
    if (vn < 0) { vn = vn * (1 + MC.PT_PE) - kick; s.vx -= vn * nx; s.vz -= vn * nz; }
    s.x = px + nx * rad; s.z = pz + nz * rad;
  }
  const segs = H.segs, boxes = H.boxes;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < segs.length; i++) {
      const b = boxes[i];
      if (s.x < b[0] || s.x > b[2] || s.z < b[1] || s.z > b[3]) continue;
      const q = segs[i];
      hitLine(s, q[0], q[1], q[2], q[3], MC.PT_RW, MC.PT_E);
    }
  }
  const dx = s.x - H.cup[0], dz = s.z - H.cup[1];
  if (dx * dx + dz * dz < MC.PT_CUPR * MC.PT_CUPR && s.vx * s.vx + s.vz * s.vz < MC.PT_SINKV * MC.PT_SINKV) return 'sunk';
  return s.vx === 0 && s.vz === 0 ? 'rest' : null;
}

// A putt from (x, z) at (vx, vz), let go t0 ticks into play: where it ends,
// whether it dropped, how long it rolled.
export function simPutt(H, x, z, vx, vz, t0, max = MC.PT_ROLLMAX) {
  const s = { x, z, vx, vz };
  for (let k = 1; k <= max; k++) {
    const r = rollTick(H, s, t0 + k);
    if (r === 'sunk') return { sunk: true, x: s.x, z: s.z, ticks: k };
    if (r === 'rest') return { sunk: false, x: s.x, z: s.z, ticks: k };
  }
  return { sunk: false, x: s.x, z: s.z, ticks: max };
}

// ---- the way to the cup, for the AI: a distance field over the hole

const CS = 0.5; // m a cell
// The hole's field: every cell's way to the cup round the walls and posts
// (none through a gate's or the windmill's door shut: the doors count as
// open), in m; cells a ball's centre can't be in are blocked.
export function field(H) {
  if (H.field) return H.field;
  const ni = 2 * Math.ceil((H.hw + 1) / CS) + 1, half = (ni - 1) / 2;
  const x0 = H.x - half * CS, z0 = H.z - 1;
  const nj = Math.ceil((H.len + 2) / CS) + 1;
  const n = ni * nj, dist = new Float64Array(n).fill(Infinity), blocked = new Uint8Array(n);
  const reach = MC.PT_RW - 0.1;
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
    const x = x0 + i * CS, z = z0 + j * CS;
    let b = 0;
    for (const [ax, az, bx, bz] of H.segs) {
      const ex = bx - ax, ez = bz - az;
      let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - ax - ex * t, dz = z - az - ez * t;
      if (dx * dx + dz * dz < reach * reach) { b = 1; break; }
    }
    if (!b) for (const [px, pz, rad] of H.posts) if ((x - px) ** 2 + (z - pz) ** 2 < (rad - 0.1) ** 2) { b = 1; break; }
    blocked[j * ni + i] = b;
  }
  const at = (x, z) => [Math.round((x - x0) / CS), Math.round((z - z0) / CS)];
  const [ci, cj] = at(H.cup[0], H.cup[1]);
  for (let j = Math.max(0, cj - 3); j <= Math.min(nj - 1, cj + 3); j++) for (let i = Math.max(0, ci - 3); i <= Math.min(ni - 1, ci + 3); i++) {
    const d = Math.hypot(x0 + i * CS - H.cup[0], z0 + j * CS - H.cup[1]);
    if (!blocked[j * ni + i] && d < MC.PT_CUPR) dist[j * ni + i] = d;
  }
  const D = CS * Math.SQRT2;
  for (let pass = 0, changed = true; changed && pass < 60; pass++) {
    changed = false;
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const k = j * ni + i;
      if (blocked[k]) continue;
      let d = dist[k];
      if (i > 0 && dist[k - 1] + CS < d) d = dist[k - 1] + CS;
      if (j > 0) {
        if (dist[k - ni] + CS < d) d = dist[k - ni] + CS;
        if (i > 0 && dist[k - ni - 1] + D < d) d = dist[k - ni - 1] + D;
        if (i < ni - 1 && dist[k - ni + 1] + D < d) d = dist[k - ni + 1] + D;
      }
      if (d < dist[k]) { dist[k] = d; changed = true; }
    }
    for (let j = nj - 1; j >= 0; j--) for (let i = ni - 1; i >= 0; i--) {
      const k = j * ni + i;
      if (blocked[k]) continue;
      let d = dist[k];
      if (i < ni - 1 && dist[k + 1] + CS < d) d = dist[k + 1] + CS;
      if (j < nj - 1) {
        if (dist[k + ni] + CS < d) d = dist[k + ni] + CS;
        if (i < ni - 1 && dist[k + ni + 1] + D < d) d = dist[k + ni + 1] + D;
        if (i > 0 && dist[k + ni - 1] + D < d) d = dist[k + ni - 1] + D;
      }
      if (d < dist[k]) { dist[k] = d; changed = true; }
    }
  }
  H.field = { ni, nj, x0, z0, dist, blocked, at };
  return H.field;
}

// The way to the cup from (x, z), m (the nearest open cell's, and the step to it).
export function wayFrom(H, x, z) {
  const F = field(H);
  const [i0, j0] = F.at(x, z);
  let best = Infinity;
  for (let r = 0; r <= 4 && best === Infinity; r++) {
    for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (i < 0 || j < 0 || i >= F.ni || j >= F.nj) continue;
      const k = j * F.ni + i;
      if (F.blocked[k] || F.dist[k] === Infinity) continue;
      const d = F.dist[k] + Math.hypot(F.x0 + i * CS - x, F.z0 + j * CS - z);
      if (d < best) best = d;
    }
  }
  return best === Infinity ? 999 : best;
}

// Is the straight line from a to b clear of the walls and posts for a ball's centre?
function clear(F, ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CS / 2));
  for (let k = 1; k <= n; k++) {
    const [i, j] = F.at(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    if (i < 0 || j < 0 || i >= F.ni || j >= F.nj || F.blocked[j * F.ni + i]) return false;
  }
  return true;
}

// The farthest point on the way to the cup that (x, z) sees: [x, z, it's the cup].
export function sightOf(H, x, z) {
  const F = field(H);
  if (clear(F, x, z, H.cup[0], H.cup[1])) return [H.cup[0], H.cup[1], true];
  // down the field to the cup, cell by cell
  let [i, j] = F.at(x, z);
  i = Math.max(0, Math.min(F.ni - 1, i)); j = Math.max(0, Math.min(F.nj - 1, j));
  const path = [];
  for (let guard = 0; guard < 600; guard++) {
    const k = j * F.ni + i;
    if (F.dist[k] < MC.PT_CUPR) break;
    let bi = i, bj = j, bd = F.blocked[k] ? Infinity : F.dist[k];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= F.ni || jj >= F.nj) continue;
      const kk = jj * F.ni + ii;
      if (!F.blocked[kk] && F.dist[kk] < bd) { bd = F.dist[kk]; bi = ii; bj = jj; }
    }
    if (bi === i && bj === j) break;
    i = bi; j = bj;
    path.push([F.x0 + i * CS, F.z0 + j * CS]);
  }
  for (let k = path.length - 1; k >= 0; k -= 2) if (clear(F, x, z, path[k][0], path[k][1])) return [path[k][0], path[k][1], false];
  return path.length ? [path[Math.min(3, path.length - 1)][0], path[Math.min(3, path.length - 1)][1], false] : [H.cup[0], H.cup[1], true];
}

// ---- the standings, as $p_end will place them

export function standings(view) {
  const out = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const b = view.partier(p);
    if (!b.live) continue;
    out.push({ slot: p, score: b.score, home: b.out, g: golfer(b.m) });
  }
  for (const e of out) e.rank = 1 + out.filter((o) => o.score > e.score).length;
  return out;
}

// What a hole's strokes are called against its par.
export function callOf(s, par) {
  if (s === 1) return 'HOLE IN ONE';
  if (s > MC.PT_CAP) return 'PICKED UP';
  const d = s - par;
  return d <= -3 ? 'ALBATROSS' : d === -2 ? 'EAGLE' : d === -1 ? 'BIRDIE' : d === 0 ? 'PAR' : d === 1 ? 'BOGEY' : d === 2 ? 'DOUBLE BOGEY' : `+${d}`;
}

// ---- drawing

// The pieces of the green from za to zb as straight runs [z0, z1, h0, h1]:
// flat between the slopes, eight to a hump, one to a ramp.
function pieces(H, za, zb) {
  const cuts = new Set([za, zb]);
  for (const f of H.feats) {
    const n = f.kind === MC.PT_F_HUMP ? 8 : 1;
    for (let k = 0; k <= n; k++) { const z = f.z0 + ((f.z1 - f.z0) * k) / n; if (z > za && z < zb) cuts.add(z); }
  }
  const zs = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k + 1 < zs.length; k++) out.push([zs[k], zs[k + 1], surf(H, zs[k])[0], surf(H, zs[k + 1])[0]]);
  return out;
}

function drawHole(sc, H, t, out) {
  // the greens on their plinths
  for (const [x0, z0, x1, z1] of H.greens) {
    const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2;
    for (const [za, zb, ha, hb] of pieces(H, z0, z1)) {
      const lo = Math.min(ha, hb), zm = (za + zb) / 2;
      sc.box(cx, PLAT_Y - BASE + (lo + BASE) / 2 - 0.02, zm, hx + 0.3, (lo + BASE) / 2, (zb - za) / 2 + 0.02, 0, ...PLINTH, LOOK.MATTE);
      const roll = Math.atan2(hb - ha, zb - za), hy = 0.12;
      const len = Math.hypot(zb - za, hb - ha) / 2 + 0.02;
      sc.box(cx, PLAT_Y + (ha + hb) / 2 - hy * Math.cos(roll), zm + hy * Math.sin(roll), hx, hy, len, 0,
        ...((Math.floor(zm / 4) & 1) ? GREEN : GREEN2), LOOK.RUBBER, 0, 0, 1, undefined, roll);
    }
  }
  // the walls, tall enough over the highest green along them
  for (const [ax, az, bx, bz] of H.segs) {
    let top = -Infinity;
    for (let k = 0; k <= 6; k++) top = Math.max(top, surf(H, az + ((bz - az) * k) / 6)[0]);
    const len = Math.hypot(bx - ax, bz - az), y0 = PLAT_Y - 0.3, y1 = PLAT_Y + top + 0.95;
    sc.box((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, len / 2 + MC.PT_WT, (y1 - y0) / 2, MC.PT_WT, Math.atan2(bz - az, bx - ax), ...RAIL, LOOK.WOOD);
  }
  // the tee's mat, the cup, its flag
  sc.box(H.tee[0], PLAT_Y + 0.005, H.tee[1] - 1.6, 3.4, 0.006, 2.4, 0, 0.1, 0.3, 0.14, LOOK.RUBBER);
  const cy = PLAT_Y + surf(H, H.cup[1])[0];
  out.decals.push({ pos: [H.cup[0], cy + 0.03, H.cup[1]], radius: MC.PT_CUPR, width: MC.PT_CUPR, color: [0.02, 0.02, 0.03, 1], kind: DECAL.DISC });
  out.decals.push({ pos: [H.cup[0], cy + 0.035, H.cup[1]], radius: MC.PT_CUPR + 0.12, width: 0.14, color: [0.95, 0.95, 0.95, 1], kind: DECAL.RING });
  sc.cyl(H.cup[0], cy + 1.8, H.cup[1], 0.06, 1.8, 0.95, 0.95, 0.95, LOOK.METAL);
  const wave = 0.15 * Math.sin(t * 0.03 + H.h);
  sc.box(H.cup[0] + 0.55, cy + 3.25, H.cup[1], 0.5, 0.32, 0.025, wave, 0.95, 0.2, 0.15, LOOK.PLASTIC);
  // the posts
  for (const [px, pz, rad, kick] of H.posts) {
    const r = rad - B_RAD, y = PLAT_Y + surf(H, pz)[0];
    sc.cyl(px, y + 0.55, pz, r, 0.55, ...(kick ? POST : STEEL), kick ? LOOK.PLASTIC : LOOK.METAL);
    if (kick) sc.cyl(px, y + 1.13, pz, r * 0.75, 0.04, 1, 1, 1, LOOK.PLASTIC);
  }
  // the moving obstacle
  const M = H.mover;
  if (M.kind === MC.PT_MK_WINDMILL) {
    const { phi, shut } = moverAt(M, t);
    const hd = M.a, side = (H.hw - hd) / 2;
    for (const s of [-1, 1]) sc.box(M.x + s * (hd + side), PLAT_Y + 2.2, M.z + 1.5, side + MC.PT_WT, 2.5, 1.5 + MC.PT_WT, 0, ...HOUSE, LOOK.MATTE);
    sc.box(M.x, PLAT_Y + 4.15, M.z + 1.5, hd + 0.05, 0.55, 1.5 + MC.PT_WT, 0, ...HOUSE, LOOK.MATTE);
    // a gabled roof: two slabs leaning on each other
    const rw = H.hw * 0.62, ra = 0.4;
    for (const s of [-1, 1]) sc.box(M.x + s * rw * Math.cos(ra), PLAT_Y + 6.6 - rw * Math.sin(ra), M.z + 1.5, 1.95, 0.16, rw, Math.PI / 2, ...ROOF, LOOK.PLASTIC, 0, 0, 1, 90 + s, -s * ra);
    const hub = [M.x, PLAT_Y + 5.3, M.z - 0.15];
    sc.cyl(hub[0], hub[1], hub[2], 0.45, 0.3, ...STEEL, LOOK.METAL, 0, 0, 1, undefined, Math.PI / 2, 0);
    for (let k = 0; k < 4; k++) {
      const th = ((phi + 4096 * k) / TURN) * 2 * Math.PI + Math.PI;
      const dx = -Math.sin(th), dy = Math.cos(th), r = 2.75;
      sc.box(hub[0] + dx * r, hub[1] + dy * r, hub[2], 0.08, 2.4, 0.6, Math.PI / 2, ...SAIL, LOOK.WOOD, 0, 0, 1, 77 + k, th);
    }
    // the door: lit red while shut
    if (shut) out.decals.push({ pos: [M.x, PLAT_Y + 0.04, M.z - 0.8], radius: 0.9, width: 0.9, color: [1, 0.2, 0.15, 0.55], kind: DECAL.DISC });
  } else if (M.kind === MC.PT_MK_GATE) {
    const { g } = moverAt({ ...M, mir: H.mir }, t);
    const l0 = M.x - (M.a + M.b), r1 = M.x + M.a + M.b;
    const parts = [[l0, g - M.b], [g + M.b, r1]];
    for (const [a, b] of parts) if (b - a > 0.05) sc.box((a + b) / 2, PLAT_Y + 0.7, M.z, (b - a) / 2, 0.7, MC.PT_WT, 0, 1, 0.75, 0.1, LOOK.HAZARD, 0.5, 0, 1, 51);
    sc.box(M.x, PLAT_Y + 1.6, M.z, M.a + M.b + 0.5, 0.1, 0.12, 0, ...STEEL, LOOK.METAL);
  } else if (M.kind === MC.PT_MK_SPINNER) {
    const { phi } = moverAt(M, t);
    const a = (phi / TURN) * 2 * Math.PI;
    sc.box(M.x, PLAT_Y + 1, M.z, M.a + MC.PT_WT, 0.42, MC.PT_WT, a, 1, 0.75, 0.1, LOOK.HAZARD, 0.5, 0, 1, 61);
    sc.cyl(M.x, PLAT_Y + 0.9, M.z, 0.72, 0.9, ...STEEL, LOOK.METAL);
  }
}

// Your aim: a line of dots from your ball the way you look, longer with the charge.
function drawAim(view, ctx, out, c) {
  const me = ctx.pme ?? ctx.me;
  if (!me || !me.live || me.out) return;
  const gm = golfer(me.m);
  if (gm.pause || gm.hole >= c.nh || me.vel[0] !== 0 || me.vel[2] !== 0) return;
  const H = c.holes[gm.hole];
  const a = ((me.input & 0x3fff) / TURN) * 2 * Math.PI, ux = Math.cos(a), uz = Math.sin(a);
  const frac = gm.charging ? Math.min(1, gm.charge / MC.PT_CH) : 0;
  const step = 0.9 + 2.2 * frac;
  for (let k = 1; k <= 7; k++) {
    const x = me.pos[0] + ux * (B_RAD + step * k), z = me.pos[2] + uz * (B_RAD + step * k);
    const y = PLAT_Y + surf(H, z)[0] + 0.04;
    out.decals.push({ pos: [x, y, z], radius: 0.2 - k * 0.012, width: 0.2, color: gm.charging ? [1, 1 - frac * 0.8, 0.2, 0.9] : [1, 1, 1, 0.75], kind: DECAL.DISC });
  }
}

// ---- the AI's putt

// A putt's charge for d m on the flat: v^2 = 2 a d.
const chargeFor = (d) => Math.sqrt(2 * (MC.PT_FRIC_DT / TICK) * Math.max(d, 0.3)) / MC.PT_VK;

// A plan's candidates: around the line to what it sees, at powers round what
// reaches it, and round the line straight at the cup.
function candidates(H, x, z) {
  const [tx, tz, cup] = sightOf(H, x, z);
  const d = Math.hypot(tx - x, tz - z);
  const a0 = Math.atan2(tz - z, tx - x), ac = Math.atan2(H.cup[1] - z, H.cup[0] - x);
  const n0 = chargeFor(cup ? d + 1.2 : d + 1.5);
  const out = [];
  const powers = [1, 0.9, 1.12, 0.8, 1.25, 1.45];
  for (const k of powers) out.push({ a: a0, n: n0 * k });
  for (const da of [2, -2, 5, -5, 10, -10, 18, -18, 30, -30]) for (const k of [1, 1.2, 0.85]) out.push({ a: a0 + (da * Math.PI) / 180, n: n0 * k });
  if (!cup) {
    const nc = chargeFor(Math.hypot(H.cup[0] - x, H.cup[1] - z) + 1.2);
    for (const da of [0, 6, -6, 14, -14, 24, -24, 36, -36]) out.push({ a: ac + (da * Math.PI) / 180, n: nc });
  }
  return out;
}

const PER_THINK = 10; // putts tried a think
const TIMES = 12; // later moments tried, 8 ticks apart, for a hole with an obstacle
const quant = (n) => Math.max(8, Math.min(MC.PT_CH, Math.round(n / 4) * 4));
// How good a putt is: holed best (sooner better), else the way left from where it stops.
const judge = (H, r) => (r.sunk ? r.ticks * 1e-4 : 2 + wayFrom(H, r.x, r.z));

// The plan, worked a few putts a think: { phase, list, k, best, ... } in bot.mem.
function work(H, P, x, z, budget) {
  while (budget-- > 0) {
    if (P.phase === 'lines') {
      if (P.k >= P.list.length) {
        // finer round the best: half a degree and a degree either way, a step of charge either way
        const b = P.best;
        P.list = [];
        for (const da of [0.5, -0.5, 1.2, -1.2]) P.list.push({ a: b.a + (da * Math.PI) / 180, n: b.n });
        for (const dn of [4, -4, 8, -8]) P.list.push({ a: b.a, n: b.n + dn });
        P.k = 0;
        P.phase = 'fine';
        continue;
      }
    } else if (P.phase === 'fine' && P.k >= P.list.length) {
      if (!H.mover.kind) { P.phase = 'done'; return; }
      // an obstacle: the best few at later moments too
      const top = P.tried.sort((a, b) => a.score - b.score).slice(0, 3);
      P.list = [];
      for (let j = 1; j <= TIMES; j++) for (const c of top) P.list.push({ a: c.a, n: c.n, wait: 8 * j });
      P.k = 0;
      P.phase = 'times';
      continue;
    } else if (P.phase === 'times' && P.k >= P.list.length) { P.phase = 'done'; return; }
    if (P.phase === 'done') return;
    const c = P.list[P.k++];
    c.n = quant(c.n);
    c.wait = c.wait || 0;
    const v = c.n * MC.PT_VK;
    const r = simPutt(H, x, z, Math.cos(c.a) * v, Math.sin(c.a) * v, P.t0 + c.n + c.wait);
    c.score = judge(H, r) + c.wait * 0.004;
    c.sunk = r.sunk;
    P.tried.push(c);
    if (!P.best || c.score < P.best.score) P.best = c;
  }
}

function think(view, me, bot, t) {
  const c = course(view);
  const yaw = bot.mem.yaw ?? (bot.yaw / TURN) * 2 * Math.PI;
  const idle = { yaw, move: 0, hop: 0 };
  if (!c) return idle;
  const gm = golfer(me.m);
  if (gm.pause || gm.hole >= c.nh) { bot.mem.plan = null; return idle; }
  const H = c.holes[gm.hole];
  const key = gm.hole * 8 + gm.strokes;
  const P = bot.mem.plan;
  // a putt let go: wait for it to show (a round trip), then for the ball to stop
  if (P && P.key === key && P.phase === 'sent') {
    if (t < P.release + (bot.lag || 0) + 60) return idle;
    bot.mem.plan = null; // it never went: line up again
    return idle;
  }
  // a new stroke, or moved since it lined up (onto the tee from the lawn, shoved by the gate): line up again
  if (P && (P.key !== key || P.x !== me.pos[0] || P.z !== me.pos[2])) bot.mem.plan = null;
  const atRest = me.vel[0] === 0 && me.vel[2] === 0 && me.ground;
  const onIt = Math.abs(me.pos[0] - H.x) <= MC.PT_PITCH / 2 && me.pos[2] >= H.z - 2 && me.pos[2] <= H.z + H.len + 2;
  if (!atRest || !onIt) { bot.mem.plan = null; return idle; }
  if (!bot.mem.plan) {
    // a moment to look before lining up (longer for a weaker golfer, and as long as the thinking takes), then
    // the candidates from where it lies; it starts charging on a tick its words change on
    const list = candidates(H, me.pos[0], me.pos[2]);
    const sims = list.length + 8 + (H.mover.kind ? 3 * TIMES : 0);
    let ready = t + Math.max(16 + Math.floor(bot.rand() * (24 + 40 * (1 - bot.skill))), 4 * Math.ceil(sims / PER_THINK) + 8);
    ready += (4 - ((ready + bot.slot) % 4)) % 4;
    bot.mem.plan = { key, phase: 'lines', list, k: 0, tried: [], best: null, t0: ready - view.party().start, release: -1, x: me.pos[0], z: me.pos[2] };
  }
  const p = bot.mem.plan;
  if (p.phase !== 'done' && p.phase !== 'go') {
    work(H, p, p.x, p.z, PER_THINK);
    if (p.phase !== 'done') return { yaw: p.best ? p.best.a : yaw, move: 0, hop: 0 };
    // the pick, with a weaker golfer's hand in it; let go on a tick its words change on
    const b = p.best;
    const shake = (1 - bot.skill);
    const gauss = () => (bot.rand() + bot.rand() + bot.rand() - 1.5) * 1.15;
    p.aim = b.a + gauss() * shake * 0.035;
    p.n = quant(b.n * (1 + gauss() * shake * 0.08));
    let release = Math.max(t + 4, p.t0 + view.party().start + p.n + (b.wait || 0));
    release += (4 - ((release + bot.slot) % 4)) % 4;
    p.release = release;
    p.phase = 'go';
    bot.mem.yaw = p.aim;
  }
  if (t < p.release - p.n) return { yaw: p.aim, move: 0, hop: 0 };
  if (t < p.release) return { yaw: p.aim, move: 0, hop: 1 };
  p.phase = 'sent';
  return { yaw: p.aim, move: 0, hop: 0 };
}

export default {
  id: L.MG_MINIGOLF, key: 'minigolf', name: 'MINI GOLF',
  hint: 'AIM WITH THE MOUSE  HOLD SPACE TO CHARGE  LET GO TO PUTT',
  rules: 'FEWEST STROKES WINS  6 AND YOU ARE PICKED UP  BALLS PASS THROUGH',
  env: 'day',
  ownScore: true,
  outForGood: true,

  draw(view, ctx, out) {
    const c = course(view);
    if (!c) return;
    const sc = out.scene;
    const t = (ctx.ptick ?? ctx.tick + (ctx.dt ?? 0) / TICK) - view.party().start;
    const play = view.party().state >= L.H_PLAY ? t : 0;
    // the lawn under it all, and the terrace behind the first hole where the crowd waits
    const rows = Math.max(1, Math.ceil(Math.min(256, view.party().n0 || 1) / MC.PT_LCOLS));
    const back = MC.PT_LBACK + rows * MC.PT_LSTEP + 2;
    const w = c.nh * MC.PT_PITCH / 2 + 12, z0 = c.z0 - back - 4, z1 = c.z0 + 2 * MC.PT_ZH + 14;
    sc.box((c.x0 + c.holes[c.nh - 1].x) / 2, PLAT_Y - BASE - 0.5, (z0 + z1) / 2, w, 0.5, (z1 - z0) / 2, 0, ...LAWN, LOOK.CHECKER, 4, 0.85);
    const tw = (MC.PT_LCOLS * MC.PT_LSTEP) / 2 + 1;
    sc.box(c.holes[0].x, PLAT_Y - 0.25, c.z0 - back / 2 - 0.5, tw, 0.25, back / 2, 0, ...PLINTH, LOOK.CHECKER, 2.2, 0.7);
    for (const H of c.holes) drawHole(sc, H, play, out);
    drawAim(view, ctx, out, c);
    this.pme = ctx.pme ?? null;
  },

  frame(view) {
    const c = course(view), g = view.party();
    if (!c) return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size || 30, shape: 'square' };
    return { centre: [(c.x0 + c.holes[c.nh - 1].x) / 2, PLAT_Y, c.z0 + MC.PT_ZH], radius: Math.max(MC.PT_ZH + 2, (c.nh * MC.PT_PITCH) / 2), shape: 'square' };
  },

  // a new round faces you down the holes
  facing() { return Math.PI / 2; },

  fx(f, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const mine = f.owner === ctx.slot;
    const who = ctx.name?.(f.owner) ?? `P${f.owner + 1}`;
    if (f.kind === MC.PT_FX_PUTT) {
      if (mine) ctx.sound?.shot?.(true); else if (d < 14) ctx.sound?.tick?.();
    } else if (f.kind === MC.PT_FX_SINK || f.kind === MC.PT_FX_PICK) {
      const c = ctx.view ? course(ctx.view) : null;
      const par = c?.holes[f.size | 0]?.par ?? 3;
      const call = callOf(f.shot, par);
      if (f.kind === MC.PT_FX_SINK) {
        if (mine || d < 30) ctx.sound?.sink?.(mine ? 0 : d);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.047 + f.owner;
          ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 1.2, f.pos[1] + 0.6 + (i & 1) * 0.5, f.pos[2] + Math.sin(a) * 1.2], size: 0.5, color: [1, 0.9, 0.3, 0.9], kind: SPRITE.SPARK, life: 600 });
        }
      }
      if (mine) {
        ctx.banner?.(f.kind === MC.PT_FX_PICK ? `PICKED UP  ${f.shot}` : call === 'HOLE IN ONE' ? 'HOLE IN ONE!' : `${call}  ${f.shot}`, f.shot < par ? C.YELLOW : f.shot === par ? C.GREEN : C.WHITE, 2200);
        if (f.kind === MC.PT_FX_SINK && f.shot <= par) ctx.sound?.holed?.();
      } else if (f.kind === MC.PT_FX_SINK && f.shot === 1) ctx.feed?.(`${who} HOLE IN ONE ON ${(f.size | 0) + 1}`, C.YELLOW);
    } else if (f.kind === MC.PT_FX_HOME) {
      if (mine) ctx.banner?.(`HOME IN ${f.shot}`, C.GREEN, 3000);
      else if (d < 40) ctx.feed?.(`${who} HOME IN ${f.shot}`, C.WHITE);
    }
  },

  // Where you stand (rows 0 and 1, which ownScore leaves to it): the hole,
  // its par and your strokes on it; your total against par and your place
  // as the end would give it; at rest, the putt's meter or how to charge it.
  hud(view, ctx) {
    const c = course(view), g = view.party();
    if (!c || g.state !== L.H_PLAY) return;
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me?.live) return;
    const list = standings(view);
    const mine = list.find((e) => e.slot === me.slot);
    const own = this.pme && this.pme.slot === me.slot ? this.pme : me;
    const gm = golfer(own.m);
    const done = Math.min(gm.hole, c.nh);
    const parDone = c.holes.slice(0, done).reduce((s, H) => s + H.par, 0);
    const vs = gm.total - parDone;
    const vsText = done ? ` (${vs > 0 ? '+' : vs < 0 ? '-' : 'E'}${vs ? Math.abs(vs) : ''})` : '';
    const home = list.filter((e) => e.home).length;
    if (me.out || gm.hole >= c.nh) {
      ctx.put(1, 0, `HOME IN ${gm.total}${vsText}  PAR ${c.pars}`, C.GREEN);
    } else {
      const H = c.holes[gm.hole];
      ctx.put(1, 0, `HOLE ${gm.hole + 1} OF ${c.nh}  PAR ${H.par}  STROKE ${gm.pause ? gm.strokes : gm.strokes + 1}`, C.WHITE);
    }
    if (mine) ctx.put(1, 1, `TOTAL ${gm.total}${vsText}  ${ordinal(mine.rank)} OF ${list.length}${home ? `  ${home} HOME` : ''}`, mine.rank === 1 ? C.YELLOW : C.GREY);
    if (me.out || gm.pause || gm.hole >= c.nh) return;
    const rest = own.vel[0] === 0 && own.vel[2] === 0;
    if (!rest) return;
    if (gm.charging) {
      const frac = Math.min(1, gm.charge / MC.PT_CH), cells = 20, on = Math.round(frac * cells);
      ctx.right(3, `POWER ${'#'.repeat(on)}${'-'.repeat(cells - on)}`, frac > 0.85 ? C.RED : frac > 0.5 ? C.YELLOW : C.GREEN);
      ctx.right(4, gm.armed ? 'CLICK TO PUTT' : 'LET GO TO PUTT', C.GREY);
    } else {
      ctx.right(3, 'HOLD SPACE TO CHARGE', C.GREY);
      ctx.right(4, 'OR CLICK  THEN CLICK AGAIN', C.GREY);
    }
  },

  brain: {
    // never asked (think steers outright): nothing on a green is deadly
    danger() { return 0; },
    goal(view, me) {
      const c = course(view);
      if (!c) return null;
      const gm = golfer(me.m);
      return gm.hole < c.nh ? c.holes[gm.hole].cup : null;
    },
    hop() { return false; },
    think,
  },
};
