// HONEYCOMB, as drawn and as the AI ball sees it. Every cookie is a thin disc
// of amber candy (LOOK.PAINT) over the void, the sim's cells laid over the
// whole grid as the renderer's paint layer: the pressed outline glowing gold
// as wide as the line is now, a dark groove round it, the stretch a cookie's
// ball has traced glowing green, the start mark white; cracked candy darkens
// through its hold and, gone, is a black hole with crumbs falling from it.
// Your own cookie is drawn on the prediction's clock with its own strokes
// (its FX ring), so candy gives under your ball as it does in the sim. The
// cells are read straight from the sim (src/mg/honey.mjs's layout): 0 no
// candy, 1 whole, else the tick it drops counted from play's start.
//
// The brain sees what a player sees: the outline, the cracks, its own ball.
// It follows the outline ahead of it at its own cruising speed, under the
// line's limit for most, slowing for corners and stopping at a turn back;
// now and then it drifts off the line or rushes, more often the less skilled.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/honey.mjs'; // HC_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const CS = MC.HC_CS, G = MC.HC_G, GG = MC.HC_GG, GP = MC.HC_GP;
const HH = 0.15; // the candy's half thickness, m
const CANDY = [0.88, 0.6, 0.2];
export const SHAPES = ['CIRCLE', 'TRIANGLE', 'STAR', 'UMBRELLA'];
const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- the stage

// This round's layout on the view's bank, or null before one is laid.
export function stage(view) {
  const dv = view.dv, o = view.bank || 0;
  const u = (k) => dv.getUint32(L.PG_H + k + o, true), f = (k) => dv.getFloat32(L.PG_H + k + o, true);
  const nc = u(MC.HC_NC), cols = u(MC.HC_COLS), rows = u(MC.HC_ROWS), K = u(MC.HC_K);
  if (!(nc > 0 && nc <= L.NPLAYER && cols > 0 && rows > 0 && K > 2 && K <= MC.HC_KMAX)) return null;
  return { nc, cols, rows, K, shape: u(MC.HC_SHAPE) & 3, rot: u(MC.HC_ROT), fin: u(MC.HC_FIN), gx0: f(MC.HC_GX0), gz0: f(MC.HC_GZ0) };
}
// Checkpoint k's offset from a cookie's centre, [x, z].
export const point = (view, k) => [view.dv.getFloat32(L.PG_S + MC.HC_PTS + 8 * k, true), view.dv.getFloat32(L.PG_S + MC.HC_PTS + 8 * k + 4, true)];
// Cell k's distance from the outline (the same on every cookie).
export const distOf = (view, k) => view.dv.getFloat32(L.PG_S + MC.HC_DIST + 4 * k, true);
// Cell k of cookie c: 0 no candy, 1 whole, else the tick it drops from play's start.
export const cellOf = (view, c, k) => view.dv.getUint16(L.PG_BIG + MC.HC_CELLS + 2 * (c * GG + k), true);
// The global cell index holding v, as $hc_g.
export const gIndex = (v, v0) => Math.floor((v - v0) / CS + 0.5);
// The cookie and its cell holding global cell (gx, gz), as $hc_cookie: [c, k] or null.
export function cookieAt(S, gx, gz) {
  if (gx < 0 || gz < 0) return null;
  const i = gx % GP, j = gz % GP, cx = Math.floor(gx / GP), cz = Math.floor(gz / GP);
  if (i >= G || j >= G || cx >= S.cols) return null;
  const c = cz * S.cols + cx;
  return c < S.nc ? [c, j * G + i] : null;
}
export const cookieOfPos = (S, x, z) => cookieAt(S, gIndex(x, S.gx0), gIndex(z, S.gz0));
// Cookie c's centre, [x, z].
export const centreOf = (S, c) => [S.gx0 + ((c % S.cols) * GP + MC.HC_GH) * CS, S.gz0 + (Math.floor(c / S.cols) * GP + MC.HC_GH) * CS];
// The line's half width and a crack's hold, rel ticks into play, as $hc_w and $hc_hold.
export const lineW = (rel) => MC.HC_W0 + (MC.HC_W1 - MC.HC_W0) * Math.min(Math.max(rel, 0), MC.HC_THIN) / MC.HC_THIN;
export const holdOf = (rel) => MC.HC_HOLD0 - Math.floor(((MC.HC_HOLD0 - MC.HC_HOLD1) * Math.min(Math.max(rel, 0), MC.HC_BRITTLE)) / MC.HC_BRITTLE);
// Does a cell holding v hold rel ticks into play (fractional)?
export const holds = (v, rel) => v === 1 || (v > 1 && rel < v);
const progressOf = (m, K) => (m & MC.HC_M_HOME ? K : Math.min(m & 255, K));

// The prediction's own strokes, from its FX ring (rebuilt every run, as
// $hc_mine reads it): global cell -> the tick it drops from play's start.
function ownCracks(pview, S, start) {
  const out = new Map();
  const n = pview.fxCount();
  for (let i = Math.max(0, n - L.FX_MAX); i < n; i++) {
    const f = pview.fx(i);
    if (f.kind !== MC.HC_FX_STROKE) continue;
    const rel = (f.tick - start) | 0, w = lineW(rel), drop = rel + holdOf(rel);
    const ux = gIndex(f.pos[0], S.gx0), uz = gIndex(f.pos[2], S.gz0);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const gx = ux + di, gz = uz + dj, at = cookieAt(S, gx, gz);
      if (!at) continue;
      const key = gz * 65536 + gx;
      if (out.has(key)) continue;
      if (!(f.shot & 1) && distOf(pview, at[1]) <= w) continue;
      const dx = S.gx0 + gx * CS - f.pos[0], dz = S.gz0 + gz * CS - f.pos[2];
      if ((di === 0 && dj === 0) || dx * dx + dz * dz <= f.size * f.size) out.set(key, drop);
    }
  }
  return out;
}

// Every ball's progress by its cookie (the one under it: a ball out fell
// straight down through its own), and every ball's standing as the end will
// place it: home by its order, then by checkpoints traced, still in ahead of
// fallen.
export function standings(view, S) {
  const list = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + view.bank + p * L.PSIZE;
    const fl = view.u8[a + L.P_FL];
    if (!(fl & L.PF_LIVE)) continue;
    const m = view.dv.getUint32(a + L.PG_M, true);
    const home = !!(m & MC.HC_M_HOME);
    const fell = !home && !!(fl & (L.PF_DEAD | L.PF_FALL));
    const traced = progressOf(m, S.K);
    const x = view.dv.getFloat32(a + L.P_PX, true), z = view.dv.getFloat32(a + L.P_PZ, true);
    const at = cookieOfPos(S, x, z);
    list.push({ slot: p, home, fell, traced, cookie: at ? at[0] : -1, order: home ? m & 0xffff : 0, key: home ? MC.HC_SFIN - ((m & 0xffff) - 1) : 2 * (m & 255) + (fell ? 0 : 1) });
  }
  list.sort((a, b) => b.key - a.key || a.slot - b.slot);
  for (let i = 0; i < list.length; i++) list[i].rank = i && list[i].key === list[i - 1].key ? list[i - 1].rank : i + 1;
  return list;
}

// ---- the paint layer

const P_LINE = 1, P_TRACED = 2, P_START = 3, P_GROOVE = 4, P_CRACK = 5, P_GONE = 12; // P_CRACK .. P_CRACK + 6 as a crack gives
const layer = { cells: new Uint8Array(1), n: 1, origin: [0, 0], size: 1, palette: new Float32Array(1024), version: 0 };
{
  const P = layer.palette;
  P.set([1, 0.78, 0.25, 1.7], 4 * P_LINE);
  P.set([0.45, 1, 0.45, 1.9], 4 * P_TRACED);
  P.set([1, 1, 0.95, 2.2], 4 * P_START);
  P.set([0.42, 0.24, 0.08, 1], 4 * P_GROOVE);
  for (let i = 0; i < 7; i++) { const k = i / 6; P.set([0.8 - 0.55 * k, 0.55 - 0.42 * k, 0.2 - 0.15 * k, 1], 4 * (P_CRACK + i)); }
  P.set([0.01, 0.012, 0.03, 1], 4 * P_GONE);
}
// The line cells' nearest checkpoint (the lower of equals: the umbrella's
// handle lights on the way down), -1 off the line's widest; once a round.
let near = { key: '', idx: new Int16Array(GG) };
function nearest(view, S) {
  const key = `${S.shape}:${S.rot}:${S.K}`;
  if (near.key === key) return near.idx;
  near.key = key;
  const pts = Array.from({ length: S.K }, (_, k) => point(view, k));
  for (let k = 0; k < GG; k++) {
    near.idx[k] = -1;
    if (distOf(view, k) > MC.HC_W0) continue;
    const x = ((k % G) - MC.HC_GH) * CS, z = (Math.floor(k / G) - MC.HC_GH) * CS;
    let best = Infinity;
    for (let i = 0; i < S.K; i++) { const d = (pts[i][0] - x) ** 2 + (pts[i][1] - z) ** 2; if (d < best - 1e-6) { best = d; near.idx[k] = i; } }
  }
  return near.idx;
}

// The layer for this frame: rel the confirmed clock's ticks into play, own
// [cookie, prel, cracks] the prediction's for your own; crumbs [x, z, age s]
// for candy dropping lately within reach of cam.
function paintLayer(view, S, rel, own, prog, cam, crumbs) {
  const n = Math.max(S.cols, S.rows) * GP;
  if (layer.n !== n) { layer.cells = new Uint8Array(n * n); layer.n = n; layer.version++; }
  layer.origin[0] = S.gx0 - CS / 2; layer.origin[1] = S.gz0 - CS / 2; layer.size = n * CS;
  const idx = nearest(view, S);
  const [s0x, s0z] = point(view, 0);
  const cells = layer.cells;
  let changed = 0;
  for (let c = 0; c < S.nc; c++) {
    const bx = (c % S.cols) * GP, bz = Math.floor(c / S.cols) * GP;
    const mine = own && own[0] === c;
    const t = mine ? own[1] : rel, w = lineW(t), pr = prog[c];
    const [ccx, ccz] = centreOf(S, c);
    const near = cam && Math.hypot(ccx - cam[0], ccz - cam[2]) < 70;
    for (let k = 0; k < GG; k++) {
      const i = k % G, j = (k - i) / G;
      let v = cellOf(view, c, k);
      if (mine && v === 1) { const d = own[2].get((bz + j) * 65536 + bx + i); if (d !== undefined) v = d; }
      let p = 0;
      if (v === 1) {
        const d = distOf(view, k);
        const ox = (i - MC.HC_GH) * CS, oz = (j - MC.HC_GH) * CS;
        if ((ox - s0x) ** 2 + (oz - s0z) ** 2 < 0.36) p = P_START;
        else if (d <= w) p = idx[k] >= 0 && idx[k] <= pr ? P_TRACED : P_LINE;
        else if (d <= w + 0.3) p = P_GROOVE;
      } else if (v > 1) {
        if (t < v) p = P_CRACK + Math.round(6 * clamp(1 - (v - t) / MC.HC_HOLD0, 0, 1));
        else {
          p = P_GONE;
          const age = (t - v) * TICK;
          if (near && age < 1 && crumbs.length < 240) crumbs.push([ccx + (i - MC.HC_GH) * CS, ccz + (j - MC.HC_GH) * CS, age, c * GG + k]);
        }
      }
      const o = (bz + j) * n + bx + i;
      if (cells[o] !== p) { cells[o] = p; changed++; }
    }
  }
  if (changed) layer.version++;
  return layer;
}

// ---- the brain

// The outline, in world space round cookie c: [x, z] per checkpoint.
function pathOf(view, S, c, mem) {
  if (mem.path && mem.pathC === c && mem.pathK === S.K) return mem.path;
  const [cx, cz] = centreOf(S, c);
  mem.path = Array.from({ length: S.K }, (_, k) => { const [x, z] = point(view, k); return [cx + x, cz + z]; });
  mem.pathC = c; mem.pathK = S.K;
  return mem.path;
}
// The turn, radians, at checkpoint k (between the pieces either side of it).
function turnAt(P, k) {
  const K = P.length, a = P[(k - 1 + K) % K], b = P[k], c = P[(k + 1) % K];
  const h0 = Math.atan2(b[1] - a[1], b[0] - a[0]), h1 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  return Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
}

// The word: the outline ahead of where it reckons it is, a point some way
// along it to head for, at a speed for the sharpest turn coming up, the keys
// toward the velocity that wants (none, a brake, when it's going too fast).
// It keeps its own count of the checkpoints passed, as $hc_push counts them,
// ahead of the confirmed world's.
function think(view, me, bot, t) {
  const S = stage(view);
  const g = view.party();
  if (!S || !me.live || me.out || g.state !== L.H_PLAY || me.m & MC.HC_M_HOME) return null;
  const mem = bot?.mem || {};
  const rand = () => (bot ? bot.rand() : 0.5);
  const skill = bot?.skill ?? 0.6;
  const [x, z] = bot?.pos ?? [me.pos[0], me.pos[2]];
  const [vx, vz] = bot?.vel ?? [me.vel[0], me.vel[2]];
  const at = cookieOfPos(S, me.pos[0], me.pos[2]) || cookieOfPos(S, x, z);
  if (!at) return null;
  const c = mem.c ?? at[0];
  mem.c = c;
  const P = pathOf(view, S, c, mem);
  const K = S.K;
  // its own count: the confirmed one, and on from there as push counts
  let m = Math.max(me.m & 255, mem.m ?? 0);
  if (mem.round !== g.round) { mem.round = g.round; m = me.m & 255; }
  for (let a = MC.HC_AHEAD; a >= 1; a--) {
    const q = m + a;
    if (q > K) continue;
    const p = P[q % K];
    if ((p[0] - x) ** 2 + (p[1] - z) ** 2 <= MC.HC_REACH ** 2) { m = q; break; }
  }
  mem.m = m;
  if (m >= K) return { yaw: Math.atan2(vz, vx), move: 0 };
  // a moment's doubt: hands off (a brake), wherever it is
  if (mem.stray?.freeze && t < mem.stray.until) return { yaw: Math.atan2(vz, vx), move: 0 };
  // its sense of speed, kept for the round: most cruise under the line's limit, a few over it
  if (mem.cruise === undefined) mem.cruise = clamp(0.95 + 0.7 * skill + (rand() - 0.5) * 0.5 + (rand() < 0.2 * (1.2 - skill) ? 0.7 : 0), 0.8, 3);
  // a stray now and then: a drift to one side, or a rush
  if (!mem.stray || t >= mem.stray.until) {
    mem.stray = { until: t + 40 + Math.floor(rand() * 120), side: 0, rush: 1, freeze: false };
    const r = rand();
    if (r < 0.2 * (1.3 - skill)) mem.stray.side = (rand() < 0.5 ? -1 : 1) * (0.7 + rand() * 1.1);
    else if (r < 0.3 * (1.3 - skill)) mem.stray.rush = 1.4 + rand() * 0.5;
    else if (r < 0.36 * (1.3 - skill)) { mem.stray.freeze = true; mem.stray.until = t + 15 + Math.floor(rand() * 60); }
  }
  const sp = Math.hypot(vx, vz);
  // where it is on the piece from checkpoint m to the next, and a point LA on along the outline
  const a0 = P[m % K], a1 = P[(m + 1) % K];
  let ex = a1[0] - a0[0], ez = a1[1] - a0[1];
  const el = Math.hypot(ex, ez) || 1;
  ex /= el; ez /= el;
  const along = clamp((x - a0[0]) * ex + (z - a0[1]) * ez, 0, el);
  const off = Math.hypot(a0[0] + ex * along - x, a0[1] + ez * along - z);
  const LA = 0.45 + 0.3 * sp;
  let left = LA + along, k = m, T = a0;
  for (let i = 0; i < 12; i++) {
    const p = P[k % K], q = P[(k + 1) % K], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (left <= d || i === 11) { const f = d > 0 ? Math.min(1, left / d) : 0; T = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; break; }
    left -= d;
    k++;
  }
  // the sharpest turn within reach of a stop from here
  let turn = 0, dist = el - along;
  for (let i = 1; i < 8 && dist < 0.4 + 0.5 * sp; i++) {
    turn = Math.max(turn, turnAt(P, (m + i) % K));
    const p = P[(m + i) % K], q = P[(m + i + 1) % K];
    dist += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  let vd = mem.cruise * mem.stray.rush * clamp(1.15 - turn / 2.2, 0.12, 1);
  if (mem.stray.side) {
    // aside from the line, square to it
    T = [T[0] - ez * mem.stray.side, T[1] + ex * mem.stray.side];
  }
  // off the line: back to it, and never slow on candy that cracks (the less it holds, the faster)
  const rel = g.t + (t - view.tick);
  if (off > 0.5) { const f = Math.min(1, (off - 0.3) / 1.2); T = [T[0] + (a0[0] + ex * along - T[0]) * f * 0.6, T[1] + (a0[1] + ez * along - T[1]) * f * 0.6]; vd = Math.max(vd, 0.8 + 40 / holdOf(rel)); }
  // a hole ahead: aside to candy that holds
  const ok = (px, pz) => { const q = cookieOfPos(S, px, pz); return q && q[0] === c && holds(cellOf(view, q[0], q[1]), rel + 20); };
  if (!ok(T[0], T[1])) {
    for (const s of [0.6, -0.6, 1.1, -1.1]) if (ok(T[0] - ez * s, T[1] + ex * s)) { T = [T[0] - ez * s, T[1] + ex * s]; break; }
  }
  const dx = T[0] - x, dz = T[1] - z, d = Math.hypot(dx, dz) || 1;
  const wx = (dx / d) * vd - vx, wz = (dz / d) * vd - vz;
  if (sp > vd + 0.15 && (vx * dx + vz * dz) / (sp * d) > 0.5 && off < 0.5) return { yaw: Math.atan2(vz, vx), move: 0 };
  if (Math.hypot(wx, wz) < 0.15) return { yaw: Math.atan2(vz, vx), move: sp < vd ? 1 : 0 };
  return { yaw: Math.atan2(wz, wx), move: 1 };
}

export default {
  id: L.MG_HONEY, key: 'honey', name: 'HONEYCOMB',
  hint: 'ROLL ALONG THE LINE FROM THE MARK  OFF IT THE CANDY CRACKS',
  rules: 'FIRST ALL THE WAY ROUND WINS  THE REST BY HOW FAR THEY TRACED',
  env: 'night',
  ownScore: true,
  outForGood: true,

  draw(view, ctx, out) {
    const S = stage(view);
    if (!S) return;
    const g = view.party();
    const sc = out.scene;
    const play = g.state === L.H_PLAY || g.state === L.H_OVER;
    let rel = play ? g.t + (ctx.dt ?? 0) / TICK : 0;
    if (g.state === L.H_OVER) rel = Math.min(rel, (g.until - L.P_OVER - g.start) | 0);
    // your own cookie on the prediction's clock, with its own strokes
    let own = null;
    const pme = ctx.pme, me = ctx.me;
    const ball = pme && !pme.out ? pme : me;
    if (ball?.live && ctx.slot >= 0) {
      const at = cookieOfPos(S, ball.pos[0], ball.pos[2]);
      if (at) {
        const prel = play && ctx.ptick !== undefined ? ctx.ptick - g.start : rel;
        own = [at[0], prel, pme && ctx.pview && g.state === L.H_PLAY ? ownCracks(ctx.pview, S, g.start) : new Map()];
      }
    }
    // each cookie's traced stretch, from the ball on it
    const prog = new Int16Array(S.nc).fill(-1);
    for (const e of standings(view, S)) if (e.cookie >= 0) prog[e.cookie] = Math.max(prog[e.cookie], e.traced);
    if (own && ctx.pme && !(ctx.pme.m & MC.HC_M_HOME)) prog[own[0]] = Math.max(prog[own[0]], ctx.pme.m & 255);
    const crumbs = [];
    out.paint = paintLayer(view, S, rel, own, prog, ctx.cam, crumbs);
    const [s0x, s0z] = point(view, 0), [s1x, s1z] = point(view, 2);
    for (let c = 0; c < S.nc; c++) {
      const [cx, cz] = centreOf(S, c);
      sc.cyl(cx, PLAT_Y - HH, cz, MC.HC_R + CS / 2, HH, CANDY[0], CANDY[1], CANDY[2], LOOK.PAINT, 0, 0, 1, c);
      out.decals?.push({ pos: [cx + s0x, PLAT_Y + 0.02, cz + s0z], radius: 0.7, width: 0.12, color: [1, 1, 0.9, 0.8], kind: DECAL.RING });
    }
    // your way on: the start's arrow, and the next few checkpoints glowing
    if (own) {
      const [cx, cz] = centreOf(S, own[0]);
      out.beams?.push({ a: [cx + s0x, PLAT_Y + 0.08, cz + s0z], b: [cx + s1x, PLAT_Y + 0.08, cz + s1z], width: 0.12, color: [1, 1, 0.9, 0.6] });
      const m = (ctx.pme ?? ctx.me)?.m ?? 0;
      if (!(m & MC.HC_M_HOME) && play) {
        for (let i = 1; i <= 4; i++) {
          const k = ((m & 255) + i) % S.K, [px, pz] = point(view, k);
          out.glow.push({ pos: [cx + px, PLAT_Y + 0.25, cz + pz], size: 0.32 - 0.05 * i, color: [0.6, 1, 0.6, 0.9 - 0.15 * i], kind: SPRITE.ORB });
        }
      }
    }
    // candy dropping away
    for (const [x, z, age, seed] of crumbs) {
      const s = seed * 0.618 % 1;
      out.solid.push({ pos: [x + (s - 0.5) * 0.3 * age, PLAT_Y - HH - 4.9 * age * age, z + (s * 7 % 1 - 0.5) * 0.3 * age], size: 0.12 + 0.08 * s, color: [0.75, 0.48, 0.15, 1], kind: SPRITE.CRUMB, minpx: 1, seed });
    }
  },

  frame(view) {
    const S = stage(view), g = view.party();
    if (!S) return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size, shape: 'square' };
    const ex = ((S.cols - 1) * GP + G) * CS, ez = ((S.rows - 1) * GP + G) * CS;
    return { centre: [S.gx0 - CS / 2 + ex / 2, PLAT_Y, S.gz0 - CS / 2 + ez / 2], radius: g.size, shape: 'square' };
  },

  // a new round faces you along the outline from the start mark
  facing(view) {
    const S = stage(view);
    if (!S) return null;
    const [ax, az] = point(view, 0), [bx, bz] = point(view, 1);
    return Math.atan2(bz - az, bx - ax);
  },

  fx(f, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const mine = f.owner === ctx.slot;
    if (f.kind === MC.HC_FX_CRACK) {
      if (mine || d < 20) ctx.sound?.crackle?.(mine ? 1.2 : Math.min(1, 6 / (d + 6)));
      if (mine) ctx.banner?.(f.size > MC.HC_F0 + MC.HC_FK * MC.HC_VLINE ? 'TOO FAST!' : 'IT CRACKS!', C.RED, 700);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + f.tick;
        ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 0.6, f.pos[1] + 0.1, f.pos[2] + Math.sin(a) * 0.6], size: 0.4, color: [1, 0.75, 0.35, 0.7], kind: SPRITE.SPARK, life: 250 });
      }
    } else if (f.kind === MC.HC_FX_HOME) {
      const place = f.shot;
      if (mine) { ctx.banner?.(`TRACED IT ${ordinal(place)}!`, place === 1 ? C.YELLOW : C.GREEN, 3000); ctx.sound?.holed?.(); }
      else if (place === 1) { ctx.banner?.(`${ctx.name?.(f.owner) ?? `P${f.owner + 1}`} TRACED IT FIRST`, C.YELLOW, 2500); ctx.sound?.count?.(0); }
      else ctx.feed?.(`${ctx.name?.(f.owner) ?? `P${f.owner + 1}`} TRACED IT ${ordinal(place)}`, C.WHITE);
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785 + f.owner;
        ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 1.6, f.pos[1] + 1.5 + (i & 1), f.pos[2] + Math.sin(a) * 1.6], size: 0.9, color: [[1, 0.85, 0.2], [0.45, 1, 0.45], [1, 1, 0.9]][i % 3].concat(1), kind: SPRITE.SPARK, life: 800 });
      }
    }
  },

  // the feed's line for a fall: how much of it was traced
  sink(f, name, view) {
    const S = view && stage(view);
    const m = view?.partier(f.owner).m ?? 0;
    return S ? `${name(f.owner)} FELL THROUGH AT ${Math.round((100 * (m & 255)) / S.K)}%` : `${name(f.owner)} FELL THROUGH`;
  },

  // Where you stand (rows 0 and 1, which ownScore leaves to it): how much
  // you've traced and your place as the end would give it, or home; the
  // shape, your speed against the line's limit; how many are home.
  hud(view, ctx) {
    const S = stage(view), g = view.party();
    if (!S || g.state !== L.H_PLAY) return;
    const list = standings(view, S);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const mine = me?.live ? list.find((e) => e.slot === me.slot) : null;
    if (mine) {
      if (mine.home) {
        ctx.put(1, 0, `TRACED IT ${ordinal(mine.order)} OF ${list.length}`, C.GREEN);
        ctx.put(1, 1, mine.order === 1 ? 'YOU WERE FIRST' : 'WATCH THE REST', C.GREY);
      } else {
        const pc = Math.round((100 * mine.traced) / S.K);
        ctx.put(1, 0, mine.fell ? `FELL THROUGH AT ${pc}%` : `TRACED ${pc}%`, mine.fell ? C.RED : C.WHITE);
        ctx.put(1, 1, `${ordinal(mine.rank)} OF ${list.length}`, mine.rank === 1 ? C.YELLOW : C.GREY);
        if (!mine.fell) {
          const sp = Math.hypot(me.vel[0], me.vel[2]);
          ctx.right(3, `SPEED ${sp.toFixed(1)}  THE LINE CRACKS OVER ${MC.HC_VLINE}`, sp > MC.HC_VLINE ? C.RED : sp > MC.HC_VLINE - 0.6 ? C.ORANGE : C.GREEN);
        }
      }
    } else if (list[0]) ctx.put(1, 0, list[0].home ? `P${list[0].slot + 1} WON IT` : `LEADER P${list[0].slot + 1}`, C.WHITE);
    ctx.right(2, `THE ${SHAPES[S.shape]}`, C.YELLOW);
    const home = list.filter((e) => e.home).length;
    if (home) ctx.right(4, `${home} OF ${list.length} HOME`, C.CYAN);
  },

  brain: {
    // at (x, z) on tick t: off its cookie or over a hole, a fall; cracking candy, a risk; candy off the line, a little
    danger(view, x, z, tick) {
      const S = stage(view);
      if (!S) return 0;
      const at = cookieOfPos(S, x, z);
      if (!at) return 1;
      const v = cellOf(view, at[0], at[1]);
      const g = view.party(), rel = g.t + (tick - view.tick);
      if (!holds(v, rel)) return 1;
      if (v > 1) return 0.7;
      return distOf(view, at[1]) > lineW(rel) ? 0.3 : 0;
    },
    goal() { return null; },
    hop() { return false; },
    think,
  },
};
