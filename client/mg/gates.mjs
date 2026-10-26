// GATE CRASH, as drawn and as the AI ball sees it. The course is read
// straight from the sim (src/mg/gates.mjs's layout: walls, sections, gates'
// clocks and posts in PG_S) and built once into a list of solids: the floor
// in bands, a checkered start pad and pen, rails down both sides, every
// wall's posts and the housing over its gates, the bumper posts, the start
// gate and the finish arch. Each frame the gates go in where they stand on
// the prediction's clock (hazard stripes, their light, a flash for the
// 0.8 s before they slam, dust and a thud as they land), and the belts'
// stripes run back toward the start. The gates' clocks are worked again here
// in f32 as the sim works them: the brain reads them to time its runs,
// nothing is fed back.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/gates.mjs'; // GC_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, COLS } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const SLAB = 0.6; // the course's slab, half its depth
const SEA = -12; // where the pillars stand
const BAND = 8; // m of floor a tone
const HOUSE = MC.GC_FRAME; // m: a wall's posts and the housing the gates rise into
const f32 = Math.fround;

// ---- the course, read once a layout

const wa = (w) => L.PG_S + MC.GC_WALLS + w * MC.GC_WSIZE;
const sa = (k) => L.PG_S + MC.GC_SECS + k * MC.GC_SSIZE;
const ga = (i) => L.PG_S + MC.GC_GATES + i * MC.GC_GSIZE;
const pa = (j) => L.PG_S + MC.GC_POSTS + j * MC.GC_PSIZE;

let memo = null;
// This round's course as the confirmed world has it, or null: the header's lines, the walls (each with its
// gates' clocks), the sections between them (belts, posts), the posts.
export function course(view) {
  if (memo && view._gcTick === view.tick && view._gcMemo === memo) return memo;
  const dv = view.dv;
  const u = (a) => dv.getUint32(a, true), f = (a) => dv.getFloat32(a, true);
  const nw = u(L.PG_H + MC.GC_NW), ng = u(L.PG_H + MC.GC_NG), np = u(L.PG_H + MC.GC_NPOST);
  if (u(L.PG_GAME) !== L.MG_GATES || !nw || nw > MC.GC_NWMAX || ng < MC.GC_NGMIN || ng > MC.GC_NGMAX || np > MC.GC_NPMAX) return null;
  const key = `${nw} ${ng} ${np} ${f(L.PG_H + MC.GC_W)} ${f(L.PG_H + MC.GC_X0)} ${f(L.PG_H + MC.GC_FIN)} ${f(wa(0))} ${u(ga(0))} ${u(L.HDR_SEED)} ${u(L.HDR_HOLE)}`;
  view._gcTick = view.tick;
  if (memo?.key === key) { view._gcMemo = memo; return memo; }
  const cx = f(L.PG_CX), w = f(L.PG_H + MC.GC_W), s = f(L.PG_H + MC.GC_S);
  const walls = [];
  for (let k = 0; k < nw; k++) {
    const gates = [];
    for (let j = 0; j < ng; j++) {
      const a = ga(k * ng + j);
      gates.push({ i: k * ng + j, j, per: u(a + MC.GC_G_PER), ph: u(a + MC.GC_G_PH), z0: f32(f32(f32(j) * s) + f32(cx - w)) + MC.GC_PT, last: -1, hit: -1e9 });
    }
    for (const G of gates) { G.z1 = G.z0 + s - 2 * MC.GC_PT; G.zc = (G.z0 + G.z1) / 2; }
    walls.push({ k, x: f(wa(k) + MC.GC_W_X), depth: f(wa(k) + MC.GC_W_DEPTH), gates });
  }
  const posts = [];
  for (let j = 0; j < np; j++) posts.push({ j, x: f(pa(j)), z: f(pa(j) + 4), hit: -1e9 });
  const x0 = f(L.PG_H + MC.GC_X0), fin = f(L.PG_H + MC.GC_FIN);
  const secs = [];
  for (let k = 0; k <= nw; k++) {
    const a = sa(k), fl = u(a + MC.GC_S_FL);
    secs.push({ k, fl, lo: k ? walls[k - 1].x : x0, hi: k < nw ? walls[k].x : fin, bx0: f(a + MC.GC_S_BX0), bx1: f(a + MC.GC_S_BX1),
      posts: posts.slice(u(a + MC.GC_S_P0), u(a + MC.GC_S_P0) + u(a + MC.GC_S_PN)) });
  }
  memo = { key, nw, ng, cx, w, s, zl: cx - w, xa: f(L.PG_H + MC.GC_XA), x0, fin, xb: f(L.PG_H + MC.GC_XB), walls, secs, posts, geom: null, flashes: [] };
  view._gcMemo = memo;
  return memo;
}

// The section holding x: past every wall behind it.
export function sectionAt(c, x) {
  let k = 0;
  while (k < c.nw && c.walls[k].x <= x) k++;
  return c.secs[k];
}

// The next wall a ball at x of radius r has still to get through (its back face ahead of the ball's back), or null.
export const nextWall = (c, x, r = 1) => c.walls.find((W) => W.x + MC.GC_T + r > x) ?? null;

// The slot holding z, 0 .. ng - 1.
export const slotAt = (c, z) => Math.max(0, Math.min(c.ng - 1, Math.floor(f32(f32(z - c.zl) / c.s))));

// ---- the clock (t: ticks into play), in f32 as the sim works it

const O_D = f32(MC.GC_O1 - MC.GC_O0), O0 = f32(MC.GC_O0), INV_FALL = f32(1 / MC.GC_FALL), RISE_K = f32(MC.GC_OPEN_H / MC.GC_RISE);
// $gc_open: ticks up of a period per ticks long starting on tick c0, its wall depth down the course.
export function openTicks(per, depth, c0) {
  const r = Math.min(Math.max(f32(f32(c0) / MC.GC_RAMP), 0), 1);
  const k = f32(f32(depth + r) * 0.5);
  const n = Math.max(0, Math.trunc(f32(per * f32(f32(k * O_D) + O0))));
  return n > MC.GC_WARN + 10 ? n : MC.GC_WARN + 10;
}
// $gc_gate: gate G of wall W on tick t into play: { st: GC_UP ... GC_RISING, b: its bottom over the floor, o, open }.
export function gate(W, G, t) {
  t = Math.floor(t);
  const o = (t + G.ph) % G.per;
  const open = openTicks(G.per, W.depth, t - o);
  if (o < open) return { st: o >= open - MC.GC_WARN ? MC.GC_WARNING : MC.GC_UP, b: MC.GC_OPEN_H, o, open };
  if (o < open + MC.GC_FALL) { const s = f32(f32(o - open + 1) * INV_FALL); return { st: MC.GC_FALLING, b: f32(f32(MC.GC_OPEN_H) * f32(1 - f32(s * s))), o, open }; }
  if (o < G.per - MC.GC_RISE) return { st: MC.GC_DOWN, b: 0, o, open };
  return { st: MC.GC_RISING, b: f32(f32(o - G.per + MC.GC_RISE + 1) * RISE_K), o, open };
}
// Its bottom on a fractional tick, eased between the ticks either side (for drawing).
export function bottomAt(W, G, t) {
  const t0 = Math.floor(t), a = gate(W, G, t0).b, b = gate(W, G, t0 + 1).b;
  return a + (b - a) * (t - t0);
}
// Ticks until gate G next starts to fall (0 if it is falling or down), and until it's next passable again (0 if it is).
export function untilFall(W, G, t) { const g = gate(W, G, t); return g.o < g.open ? g.open - g.o : 0; }

// The windows when a ball whose top is h over the floor gets under gate G, from tick t on: [from, to) ticks into
// play, in order, the next few periods' (each from the tick its bottom rises past h to the tick it falls past it).
export function windows(W, G, t, h = 2.15, n = 3) {
  t = Math.floor(t);
  const o = (t + G.ph) % G.per;
  const fallOk = Math.floor(MC.GC_FALL * Math.sqrt(Math.max(0, 1 - h / MC.GC_OPEN_H)));
  const riseOk = MC.GC_RISE + 1 - Math.ceil(MC.GC_RISE * h / MC.GC_OPEN_H);
  const out = [];
  for (let m = 0; m < n; m++) {
    const c0 = t - o + m * G.per;
    const b = c0 + openTicks(G.per, W.depth, c0) + fallOk;
    if (b > t) out.push([c0 - riseOk, b]);
  }
  return out;
}

// Ticks into play to draw at (fractional): the prediction's clock, frozen through the result.
function playTime(view, ctx) {
  const g = view.party();
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return 0;
  let t = ctx?.ptick !== undefined ? ctx.ptick - g.start : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}

// ---- the solids that never move, built once a course

const TONES = [[[0.36, 0.62, 0.92], [0.3, 0.55, 0.85]], [[0.95, 0.62, 0.25], [0.88, 0.55, 0.2]], [[0.45, 0.78, 0.45], [0.38, 0.7, 0.4]], [[0.8, 0.45, 0.85], [0.72, 0.38, 0.78]]];

function build(c) {
  const out = []; // [shape, x, y, z, hx, hy, hz, yaw, r, g, b, look, a, b2, alpha, roll]
  const box = (x, y, z, hx, hy, hz, rgb, look = LOOK.PLASTIC, a = 0, b = 0, alpha = 1) => out.push([0, x, y, z, hx, hy, hz, 0, ...rgb, look, a, b, alpha, 0]);
  const cyl = (x, y, z, r, hh, rgb, look = LOOK.MATTE, a = 0, b = 0, alpha = 1) => out.push([1, x, y, z, r, hh, r, 0, ...rgb, look, a, b, alpha, 0]);
  const { cx, w, xa, x0, fin, xb } = c;
  // the start pad and the pen, checkered; the course between in bands, a section's tones each
  box((xa + x0) / 2, PLAT_Y - SLAB, cx, (x0 - xa) / 2, SLAB, w, [0.92, 0.92, 0.94], LOOK.CHECKER, 2, 0.35);
  box((fin + xb) / 2, PLAT_Y - SLAB, cx, (xb - fin) / 2, SLAB, w, [0.95, 0.85, 0.3], LOOK.CHECKER, 2, 0.35);
  for (const S of c.secs) {
    const tones = TONES[S.k % TONES.length];
    const n = Math.max(1, Math.round((S.hi - S.lo) / BAND));
    for (let i = 0; i < n; i++) {
      const a = S.lo + ((S.hi - S.lo) * i) / n, b = S.lo + ((S.hi - S.lo) * (i + 1)) / n;
      box((a + b) / 2, PLAT_Y - SLAB, cx, (b - a) / 2 + 0.01, SLAB, w, tones[i & 1], LOOK.PLASTIC);
    }
    // a belt: dark rubber flush with the floor, hazard ends
    if (S.fl & MC.GC_S_BELT) {
      box((S.bx0 + S.bx1) / 2, PLAT_Y - 0.06, cx, (S.bx1 - S.bx0) / 2, 0.07, w - 0.05, [0.12, 0.12, 0.14], LOOK.RUBBER);
      for (const x of [S.bx0, S.bx1]) box(x, PLAT_Y + 0.005, cx, 0.2, 0.02, w - 0.05, [1, 0.8, 0.1], LOOK.HAZARD, 0.5);
    }
    // its bumper posts: red and white drums, a glowing cap
    for (const P of S.posts) {
      cyl(P.x, PLAT_Y + 0.7, P.z, MC.GC_BR, 0.7, [0.92, 0.18, 0.15], LOOK.PLASTIC);
      cyl(P.x, PLAT_Y + 0.7, P.z, MC.GC_BR + 0.03, 0.18, [0.98, 0.98, 0.98], LOOK.PLASTIC);
    }
  }
  // the rails down both sides, the pad's back wall, the pen's end
  for (const s of [1, -1]) box((xa + xb) / 2, PLAT_Y + MC.GC_RAIL / 2, cx + s * (w + 0.15), (xb - xa) / 2 + 0.3, MC.GC_RAIL / 2, 0.15, [0.96, 0.96, 0.98], LOOK.GLOW, 0.25, 0, 0.5);
  for (const s of [1, -1]) box((xa + xb) / 2, PLAT_Y + MC.GC_RAIL + 0.08, cx + s * (w + 0.15), (xb - xa) / 2 + 0.3, 0.08, 0.2, [0.85, 0.2, 0.2], LOOK.PLASTIC);
  box(xa - 0.15, PLAT_Y + MC.GC_RAIL / 2, cx, 0.15, MC.GC_RAIL / 2, w + 0.3, [0.96, 0.96, 0.98], LOOK.GLOW, 0.25, 0, 0.5);
  box(xb + 0.15, PLAT_Y + MC.GC_RAIL / 2, cx, 0.15, MC.GC_RAIL / 2, w + 0.3, [0.75, 0.88, 1], LOOK.GLOW, 0.25, 0, 0.5);
  // pillars down to the sea
  const legs = Math.max(2, Math.round((xb - xa) / 24));
  for (let i = 0; i < legs; i++) for (const s of [1, -1]) {
    const x = xa + ((i + 0.5) * (xb - xa)) / legs;
    cyl(x, (PLAT_Y - 2 * SLAB + SEA) / 2, cx + s * w * 0.6, 1.4, (PLAT_Y - 2 * SLAB - SEA) / 2, [0.86, 0.85, 0.82], LOOK.MATTE);
  }
  // each wall: its posts from the floor to the housing's top, the housing over the gates, a number plate
  for (const W of c.walls) {
    for (let j = 0; j <= c.ng; j++) {
      const z = c.zl + j * c.s;
      box(W.x, PLAT_Y + HOUSE / 2, z, MC.GC_T + 0.08, HOUSE / 2, MC.GC_PT, [0.42, 0.44, 0.5], LOOK.METAL);
    }
    box(W.x, PLAT_Y + (MC.GC_OPEN_H + 0.12 + HOUSE) / 2, c.cx, MC.GC_T + 0.14, (HOUSE - MC.GC_OPEN_H - 0.12) / 2, c.w, [0.3, 0.32, 0.38], LOOK.METAL);
    box(W.x - MC.GC_T - 0.16, PLAT_Y + HOUSE - 0.55, c.cx, 0.02, 0.35, c.w - 0.2, [1, 0.8, 0.1], LOOK.HAZARD, 0.6);
  }
  // the start gate's frame, the finish arch over the line and the line
  for (const s of [1, -1]) cyl(x0, PLAT_Y + 3.7, cx + s * (w + 0.7), 0.45, 3.7, [0.2, 0.75, 0.3], LOOK.PLASTIC);
  box(x0, PLAT_Y + 7.4, cx, 0.3, 0.3, w + 1.1, [0.2, 0.75, 0.3], LOOK.GLOW, 0.6, 0.5);
  for (const s of [1, -1]) cyl(fin, PLAT_Y + 3.8, cx + s * (w + 0.9), 0.55, 3.8, [0.95, 0.95, 0.95], LOOK.PLASTIC);
  box(fin, PLAT_Y + 7.8, cx, 0.5, 0.8, w + 1.4, [0.15, 0.15, 0.15], LOOK.CHECKER, 0.8);
  box(fin, PLAT_Y + 0.02, cx, 0.3, 0.03, w, [0.1, 0.1, 0.1], LOOK.CHECKER, 0.3);
  return out;
}

// ---- the race: who is where

// Every ball in, its place in the race: home first by score, then by how far down the course, ties by slot.
export function standings(view) {
  if (view._gc?.tick === view.tick) return view._gc.list;
  const c = course(view);
  const list = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + p * L.PSIZE;
    if (!(view.u8[a + L.P_FL] & L.PF_LIVE)) continue;
    const score = view.dv.getUint16(a + L.PG_SCORE, true);
    const x = view.dv.getFloat32(a + L.P_PX, true);
    list.push({ slot: p, score, home: score >= MC.GC_WIN, dist: c ? Math.max(0, x - c.x0) : 0 });
  }
  list.sort((a, b) => (b.home - a.home) || (b.score - a.score) || a.slot - b.slot);
  list.forEach((e, i) => { e.rank = i > 0 && list[i - 1].score === e.score ? list[i - 1].rank : i + 1; });
  view._gc = { tick: view.tick, list };
  return list;
}
export const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;

// ---- the AI ball

// A number in [0, 1) for slot p and k, the same on every machine that asks.
const luck = (p, k) => (((Math.imul(p + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0) % 10007) / 10007;
const HOLD = 2.2; // m short of a wall's face it waits at
// Seconds a ball rolling on at v0, keys held (bumper's push against its drag), takes to cover s metres.
const VMAX = Number(L.BPHYS.B_ACC_DT) / (1 - Number(L.BPHYS.B_DRAG)), K = -Math.log(Number(L.BPHYS.B_DRAG)) / TICK;
export function eta(s, v0) {
  if (s <= 0) return 0;
  v0 = Math.max(0, Math.min(VMAX, v0));
  const x = (t) => VMAX * t - (VMAX - v0) * (1 - Math.exp(-K * t)) / K;
  let lo = 0, hi = s / Math.max(0.5, v0) + 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (x(m) < s) lo = m; else hi = m; }
  return hi;
}
// Its speed after s metres from v0, keys held.
const vAfter = (s, v0) => { const t = eta(s, v0); return VMAX - (VMAX - Math.max(0, v0)) * Math.exp(-K * t); };

// How many balls wait in front of each wall's slots (within 9 m of its face), counted once a tick.
function queues(view, c) {
  if (view._gcQ?.tick === view.tick) return view._gcQ.n;
  const n = new Uint16Array(c.nw * 16);
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + view.bank + p * L.PSIZE;
    if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const x = view.dv.getFloat32(a + L.P_PX, true);
    const W = nextWall(c, x);
    if (W && W.x - x < 9) n[W.k * 16 + slotAt(c, view.dv.getFloat32(a + L.P_PZ, true))]++;
  }
  view._gcQ = { tick: view.tick, n };
  return n;
}

// What it means to do, worked out once a think (kept in bot.mem): the next wall, the gate in it it means to
// take (the one it can be through soonest, its windows read from the clock, with the queue in front of each
// and a little luck of its own to spread the crowd, kept unless another is well ahead), when it can go, and
// the point it makes for.
function plan(view, me, bot) {
  const c = course(view);
  if (!c || !me || !me.live || me.out) return null;
  const mem = bot?.mem || {};
  const when = bot?.at ?? view.tick;
  if (mem.plan && mem.planAt === when) return mem.plan;
  const x = bot?.pos?.[0] ?? me.pos[0], z = bot?.pos?.[1] ?? me.pos[2];
  const vx = bot?.vel?.[0] ?? me.vel[0];
  const r = me.radius ?? 1;
  const g = view.party();
  const tp = when - g.start;
  const W = nextWall(c, x, r);
  let out;
  if (!W) out = { wall: null, goal: [c.fin + 12, Math.max(c.zl + 2, Math.min(c.zl + 2 * c.w - 2, z))] };
  else {
    const s = W.x - MC.GC_T - r - x;
    const q = queues(view, c);
    const slot = me.slot ?? 0;
    let best = null, keep = null;
    for (const G of W.gates) {
      const lat = Math.abs(G.zc - z);
      const d = Math.hypot(Math.max(0, s), lat);
      const tArr = tp + eta(d, Math.max(0, vx)) / TICK;
      const v = Math.max(4, vAfter(Math.max(0, s), Math.max(0, vx)));
      const cross = (2 * MC.GC_T + 2 * r + 0.4) / v / TICK + 10;
      let go = Infinity;
      for (const [a, b] of windows(W, G, tp, 2 * r + 0.15, 3)) {
        const from = Math.max(a, tArr);
        if (from + cross <= b) { go = from; break; }
      }
      const cost = go + 14 * Math.max(0, q[W.k * 16 + G.j] - (slotAt(c, z) === G.j ? 1 : 0)) + 30 * luck(slot, W.k * 16 + G.j) + 2 * lat / TICK / 8;
      const e = { G, go, cost, ready: go <= tArr + 4 };
      if (!best || cost < best.cost) best = e;
      if (mem.wall === W.k && mem.gate === G.j) keep = e;
    }
    if (keep && keep.go < Infinity && keep.cost < best.cost + 50) best = keep;
    mem.wall = W.k;
    mem.gate = best.G.j;
    out = { wall: W, G: best.G, go: best.go, ready: best.ready, s, goal: [best.ready ? W.x + MC.GC_T + r + 3 : W.x - MC.GC_T - r - HOLD, best.G.zc] };
  }
  mem.plan = out;
  mem.planAt = when;
  return out;
}
const goal = (view, me, bot) => plan(view, me, bot)?.goal ?? null;

// The word it wants outright, or null for the planner (its goal toward the gate it means to take, round the
// posts): within 6 m of a wall's face, lined up on its gate's slot, it holds back HOLD m short until the
// gate will be up from its getting there to its getting through, then goes flat out; under a gate, on
// through; past the last wall, for the line.
function think(view, me, bot) {
  const p = plan(view, me, bot);
  if (!p) return null;
  const x = bot?.pos?.[0] ?? me.pos[0], z = bot?.pos?.[1] ?? me.pos[2];
  const vx = bot?.vel?.[0] ?? me.vel[0];
  const c = course(view);
  if (!p.wall) return x > c.fin + 3 ? { yaw: 0, move: 0 } : { yaw: Math.atan2(p.goal[1] - z, 8), move: 1 };
  const s = p.s, ez = p.G.zc - z;
  if (s > 6) return null;
  // under it, or at its face: on through
  if (s < 0.3) return { yaw: Math.atan2(ez * 1.5, 3), move: 1 };
  // go when the gate will be up as it gets there
  if (p.ready && Math.abs(ez) < 0.6 + s * 0.3) return { yaw: Math.atan2(ez, s + 1), move: 1 };
  const hold = s - HOLD;
  if (hold > 0.5) {
    const vt = Math.sqrt(2 * 7 * hold);
    if (vx > vt + 0.5) return { yaw: 0, move: 2 };
    if (vx < vt - 0.5) return { yaw: Math.atan2(ez, hold + 1), move: 1 };
    return { yaw: Math.atan2(ez, 2), move: Math.abs(ez) > 0.5 ? 1 : 0 };
  }
  if (hold < -0.5) return { yaw: Math.PI - Math.atan2(ez, 2), move: 1 };
  if (vx > 0.6) return { yaw: 0, move: 2 };
  if (Math.abs(ez) > 0.4) return { yaw: Math.sign(ez) * Math.PI / 2, move: 1 };
  return { yaw: 0, move: 0 };
}

// How deadly (x, z) is on tick `tick`: a gate that's under a ball's top there (a slam or a wall), a post, the rails.
function danger(view, x, z, tick, me) {
  const c = course(view);
  if (!c) return 0;
  const r = me?.radius ?? 1;
  if (Math.abs(z - c.cx) > c.w - r - 0.1) return 0.3;
  const tp = tick - view.party().start;
  for (const W of c.walls) {
    if (Math.abs(x - W.x) >= MC.GC_T + r + 0.1) continue;
    const u = f32(z - c.zl) / c.s, j = Math.floor(u);
    const edge = Math.min(u - j, j + 1 - u) * c.s;
    if (edge < MC.GC_PT + r - 0.2) return 0.8;
    const G = W.gates[Math.max(0, Math.min(c.ng - 1, j))];
    return gate(W, G, tp).b < 2 * r + 0.3 ? 1 : 0;
  }
  const S = sectionAt(c, x);
  for (const P of S.posts) if (Math.hypot(x - P.x, z - P.z) < r + MC.GC_BR + 0.4) return 0.6;
  return 0;
}

// The light over a gate: green up, amber flashing as it warns, red falling and down, amber rising.
const LIGHT = { [MC.GC_UP]: [0.25, 1, 0.35], [MC.GC_WARNING]: [1, 0.7, 0.1], [MC.GC_FALLING]: [1, 0.15, 0.1], [MC.GC_DOWN]: [1, 0.15, 0.1], [MC.GC_RISING]: [1, 0.6, 0.15] };

export default {
  id: L.MG_GATES, key: 'gates', name: 'GATE CRASH',
  hint: 'TIME YOUR RUN  A FLASHING GATE IS ABOUT TO SLAM DOWN',
  rules: 'FIRST OVER THE LINE WINS  THE REST HAVE 30 S',
  env: 'day',

  draw(view, ctx, out) {
    const c = course(view);
    if (!c) return;
    if (!c.geom) c.geom = build(c);
    const sc = out.scene;
    for (const s of c.geom) sc.put(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10], s[11], s[12], s[13], s[14], undefined, s[15]);
    const g = view.party();
    const playing = g.state === L.H_PLAY;
    const tp = playTime(view, ctx);
    const now = ctx?.now ?? 0, secs = now / 1000;
    const cam = ctx?.cam ?? [c.xa, 60, c.cx];
    const blink = Math.floor(now / 90) & 1;
    let thuds = 0;
    // the gates, as they stand
    for (const W of c.walls) {
      const near = Math.abs(W.x - cam[0]) < 160;
      for (const G of W.gates) {
        const st = gate(W, G, tp);
        const b = st.st === MC.GC_FALLING || st.st === MC.GC_RISING ? bottomAt(W, G, tp) : st.b;
        const hz = (G.z1 - G.z0) / 2;
        const warn = st.st === MC.GC_WARNING;
        const col = warn && blink ? [1, 0.2, 0.12] : [1, 0.82, 0.1];
        const lit = Math.max(0, 1 - (now - G.hit) / 350);
        sc.box(W.x, PLAT_Y + b + MC.GC_OPEN_H / 2, G.zc, MC.GC_T, MC.GC_OPEN_H / 2, hz, 0, col[0], col[1] + 0.3 * lit, col[2] + 0.5 * lit, LOOK.HAZARD, 0.5, 0, 1, W.k * 16 + G.j);
        // its bottom edge, glowing as it warns and as it falls
        if (warn || st.st === MC.GC_FALLING) sc.box(W.x, PLAT_Y + b + 0.06, G.zc, MC.GC_T + 0.03, 0.07, hz, 0, 1, 0.3, 0.15, LOOK.GLOW, warn ? (blink ? 2.4 : 0.4) : 2.6, 0.6, 1, W.k * 16 + G.j + 8);
        // its light on the housing
        if (near) {
          const lc = LIGHT[st.st];
          sc.sphere(W.x - MC.GC_T - 0.2, PLAT_Y + HOUSE - 1.3, G.zc, 0.26, lc[0], lc[1], lc[2], LOOK.GLOW, warn ? (blink ? 2.5 : 0.3) : 1.6);
        }
        // landing: a thud, and dust either side
        if (playing && G.last >= 0 && st.st === MC.GC_DOWN && G.last === MC.GC_FALLING) {
          c.flashes.push({ x: W.x, z: G.zc, hz, at: now });
          const d = Math.hypot(W.x - cam[0], G.zc - cam[2]);
          if (d < 45 && thuds++ < 2) ctx?.sound?.land?.(Math.min(24, 300 / (d + 8)));
        }
        G.last = st.st;
      }
    }
    // dust where gates landed, fading over 0.4 s
    c.flashes = c.flashes.filter((F) => now - F.at < 400);
    for (const F of c.flashes) {
      const k = (now - F.at) / 400;
      for (const s of [1, -1]) out.glow.push({ pos: [F.x + s * (MC.GC_T + 0.5 + k), PLAT_Y + 0.3, F.z], size: 1.2 + 1.6 * k, color: [0.95, 0.9, 0.8, 0.7 * (1 - k)], kind: SPRITE.FLASH, minpx: 2 });
    }
    // the belts' stripes, running back toward the start
    for (const S of c.secs) {
      if (!(S.fl & MC.GC_S_BELT) || Math.abs((S.bx0 + S.bx1) / 2 - cam[0]) > 140) continue;
      const len = S.bx1 - S.bx0, gap = 2.5, off = (secs * MC.GC_BELT) % gap;
      for (let u = gap - off; u < len; u += gap) sc.box(S.bx1 - u, PLAT_Y + 0.012, c.cx, 0.14, 0.012, c.w - 0.1, 0, 0.9, 0.9, 0.95, LOOK.GLOW, 0.5, 0, 0.8);
    }
    // a post that just bounced a ball lights up
    for (const P of c.posts) {
      const lit = Math.max(0, 1 - (now - P.hit) / 300);
      sc.cyl(P.x, PLAT_Y + 1.45, P.z, MC.GC_BR * 0.7, 0.06, 1, 0.9, 0.4, LOOK.GLOW, 0.5 + 2.5 * lit, 0.5);
    }
    // a star over the leader still racing: the one to catch
    if (playing) {
      const lead = standings(view).find((e) => !e.home);
      const b = lead && view.bumper(lead.slot);
      if (b && !b.out) {
        const dt = ctx?.dt || 0;
        out.glow.push({ pos: [b.pos[0] + b.vel[0] * dt, b.pos[1] + 2 * b.radius + 2.5 + 0.15 * Math.sin(secs * 4), b.pos[2] + b.vel[2] * dt], size: 0.75, color: [1, 0.85, 0.2, 0.95], kind: SPRITE.SPARK, minpx: 3 });
      }
    }
    // the start gate: down through the countdown, up and away at GO
    const up = g.state === L.H_COUNT || g.state === L.H_IDLE ? 0 : Math.min(1, tp / 60);
    if (up < 1) sc.box(c.x0, PLAT_Y + 0.9 + up * 5, c.cx, 0.15, 0.9, c.w, 0, 0.2, 0.75, 0.3, LOOK.GLOW, 0.4, 0.6, 0.85 * (1 - up));
  },

  // the whole course, from above
  frame(view) {
    const c = course(view);
    const g = view.party();
    if (!c) return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size, shape: 'square' };
    return { centre: [(c.xa + c.xb) / 2, PLAT_Y, c.cx], radius: Math.max(c.xb - c.xa, 2 * c.w) / 2, shape: 'square' };
  },

  // a new round faces you down the course
  facing() { return 0; },

  fx(f, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const mine = f.owner === ctx.slot;
    const c = course(ctx.view);
    if (f.kind === MC.GC_FX_HOME) {
      const place = Math.round(f.size);
      if (mine) { ctx.banner?.(`HOME ${ordinal(place)}!`, place === 1 ? C.YELLOW : C.GREEN, 3000); ctx.sound?.holed?.(); }
      else ctx.feed?.(`${ctx.name?.(f.owner) ?? `P${f.owner + 1}`} HOME ${ordinal(place)}`, place === 1 ? C.YELLOW : C.WHITE);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + f.owner;
        ctx.glow?.({ pos: [f.pos[0] + Math.cos(a) * 1.5, f.pos[1] + 2 + (i & 1), f.pos[2] + Math.sin(a) * 1.5], size: 0.9, color: [[1, 0.85, 0.2], [0.3, 0.9, 1], [1, 0.35, 0.5]][i % 3].concat(1), kind: SPRITE.SPARK, life: 700 });
      }
    } else if (f.kind === MC.GC_FX_LATE) {
      const who = mine ? 'YOU WIN THE RACE' : `${ctx.name?.(f.owner) ?? `P${f.owner + 1}`} IS HOME`;
      ctx.banner?.(`${who}  ${Math.round(f.size)} S TO FINISH`, C.YELLOW, 3000);
      ctx.sound?.count?.(0);
    } else if (f.kind === MC.GC_FX_KNOCK) {
      ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 1.5, f.pos[2]], size: 2.6, color: [1, 0.8, 0.3, 0.95], kind: SPRITE.FLASH, life: 300, grow: true });
      ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 1, f.pos[2]], size: 2, color: [1, 0.5, 0.2, 0.8], kind: SPRITE.RING, life: 400, grow: true });
      if (mine || d < 30) ctx.sound?.blast?.(mine ? 0 : d, 3);
      const G = c?.walls[Math.floor(f.shot / c.ng)]?.gates[f.shot % c.ng];
      if (G) G.hit = ctx.now ?? 0;
      if (mine) ctx.banner?.('CRASHED!', C.ORANGE, 900);
    } else if (f.kind === MC.GC_FX_BONK) {
      if (f.shot >= 4096) {
        const P = c?.posts[f.shot - 4096];
        if (P) P.hit = ctx.now ?? 0;
        ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 1, f.pos[2]], size: 1.4, color: [1, 0.9, 0.4, 0.9], kind: SPRITE.FLASH, life: 220, grow: true });
      }
      if (mine || d < 25) ctx.sound?.boing?.(Math.min(24, f.size), mine ? 0 : d);
    }
  },

  // Where you are in the race and how far to go, over the frontend's score
  // lines (a scoring round's SCORE and LEADER, which here would read GC_WIN
  // plus ticks); the gate in your slot of the next wall and when it moves;
  // what's in the next section; the course as a line with you and the leader.
  hud(view, ctx) {
    const c = course(view);
    const g = view.party();
    if (!c || g.state !== L.H_PLAY) return;
    const list = standings(view);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const mine = me?.live ? list.find((e) => e.slot === me.slot) : null;
    const total = c.fin - c.x0;
    const blank = ' '.repeat(26);
    ctx.put(1, 0, blank, C.WHITE);
    ctx.put(1, 1, blank, C.WHITE);
    const lead = list[0];
    if (mine) {
      ctx.put(1, 0, mine.home ? `HOME ${ordinal(mine.rank)} OF ${list.length}` : `${ordinal(mine.rank)} OF ${list.length}`, mine.home ? C.GREEN : mine.rank === 1 ? C.YELLOW : C.WHITE);
      if (!mine.home) {
        ctx.put(1, 1, `${Math.max(0, Math.ceil(total - mine.dist))} M TO GO`, C.GREY);
        const x = me.pos[0], z = me.pos[2];
        const W = nextWall(c, x, me.radius ?? 1);
        if (W) {
          const G = W.gates[slotAt(c, z)];
          const st = gate(W, G, g.t);
          const left = (k) => `${(k * TICK).toFixed(1)} S`;
          const msg = st.st === MC.GC_UP ? [`GATE OPEN ${left(st.open - st.o)}`, C.GREEN]
            : st.st === MC.GC_WARNING ? ['GATE SLAMMING', blinkC(ctx.now)]
              : st.st === MC.GC_RISING ? ['GATE RISING', C.ORANGE]
                : [`GATE UP IN ${left(G.per - MC.GC_RISE - st.o + Math.ceil(MC.GC_RISE * 0.65))}`, C.RED];
          ctx.right(2, `WALL ${W.k + 1} OF ${c.nw}  ${msg[0]}`, msg[1]);
          // what's past it
          const N = c.secs[W.k + 1];
          if (N.fl) ctx.right(3, `${[N.fl & MC.GC_S_BELT ? 'A BELT' : '', N.fl & MC.GC_S_POSTS ? 'BUMPERS' : ''].filter(Boolean).join(' AND ')} PAST IT`, C.ORANGE);
        } else ctx.right(2, 'THE LINE: GO GO GO', C.GREEN);
      } else ctx.put(1, 1, lead && lead.slot !== me.slot && lead.rank === 1 ? `P${lead.slot + 1} WON IT` : 'WAIT FOR THE REST', C.GREY);
    } else if (lead) ctx.put(1, 0, `LEADER P${lead.slot + 1}`, C.WHITE);
    // the course as a line: its walls, the leader, you
    const n = 36, x = COLS - 2 - n;
    const cell = (dist) => Math.max(0, Math.min(n - 1, Math.floor((dist / total) * n)));
    ctx.put(x - 1, 5, '[', C.GREY);
    ctx.put(x, 5, '-'.repeat(n), C.GREY);
    for (const W of c.walls) ctx.put(x + cell(W.x - c.x0), 5, 'I', C.ORANGE);
    ctx.put(x + n, 5, ']', C.WHITE);
    if (lead && !lead.home) ctx.put(x + cell(lead.dist), 5, '*', C.YELLOW);
    if (mine && !mine.home) ctx.put(x + cell(mine.dist), 5, '>', C.GREEN);
    const home = list.filter((e) => e.home).length;
    if (home) ctx.right(6, `${home} OF ${list.length} HOME`, C.CYAN);
  },

  brain: { danger, goal, think, hop: () => false },
};

const blinkC = (now) => ((Math.floor((now ?? 0) / 120) & 1) ? C.RED : C.ORANGE);
