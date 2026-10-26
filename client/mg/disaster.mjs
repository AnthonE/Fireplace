// DISASTER ISLAND, as drawn and as the AI ball sees it. The island is square
// turf, sand along its beach and greener up its terraced hills, standing on
// a column of rock in the sea; turf the rim is about to take darkens and
// shakes, then drops away. The houses are stone with a slate roof, a door
// and lit windows, a wooden crate against one wall; the rocks are grey
// boulders. Each disaster is read from the sim's own schedule (PG_BIG) and
// drawn at the frame's tick on the prediction's clock, so you meet it where
// your ball does: a flood is a sheet of water rising over the turf; a meteor
// a fireball falling onto its red ring; a tornado a whirling grey funnel with
// a ring of dust round it as far as it pulls; an earthquake shakes the turf
// and its fissures glow along their lines before they gape; a tsunami's waves
// roll in from the horizon, the lee behind each house and rock marked green;
// a bolt's spot flickers white before it cracks down out of a dark sky.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/disaster.mjs'; // ND_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const f = Math.fround;
const S = MC.ND_S;
const TICK = 0.008;
const RB = 1; // a ball's radius
const BASE = 1.2; // m of turf drawn under the lowest cell's top
const DRAWN = 0.49; // a cell's drawn half side over its side: a hairline seam
const WARN = 375; // ticks before the rim takes a cell that it darkens (and shakes, the last 60)
const FALL = 1.5; // s a cell is drawn falling
const TURN = 16384;
export const NAMES = ['FLOOD', 'METEOR SHOWER', 'TORNADO', 'EARTHQUAKE', 'TSUNAMI', 'LIGHTNING'];
const TIPS = [
  'GET TO HIGH GROUND  THE HILLTOP OR A ROOF',
  'KEEP OFF THE RED RINGS',
  'KEEP AWAY FROM THE FUNNEL',
  'HOP THE GLOWING CRACKS  KEEP OFF THE EDGE',
  'HIDE IN THE GREEN LEE OF A HOUSE OR ROCK',
  'KEEP OFF THE FLICKERING SPOTS  ROOFS DRAW IT',
];
const KIND_C = [C.CYAN, C.ORANGE, C.GREY, C.ORANGE, C.CYAN, C.YELLOW];
const SAND = [0.86, 0.78, 0.56];
const GRASS = [[0.36, 0.62, 0.26], [0.33, 0.58, 0.24]];
const HIGH = [0.5, 0.72, 0.3];
const DOOM = [0.3, 0.24, 0.18];
const CLIFF = [0.46, 0.4, 0.34];
const WALLS = [[0.86, 0.82, 0.74], [0.8, 0.72, 0.62], [0.74, 0.78, 0.82], [0.88, 0.76, 0.6]];
const ROOF = [[0.55, 0.22, 0.18], [0.3, 0.34, 0.42], [0.42, 0.3, 0.22], [0.25, 0.42, 0.3]];
const STONE = [0.55, 0.55, 0.56];
const WATER = [0.16, 0.44, 0.66];

const DROP0 = L.PG_BIG + MC.ND_DROP;
const HGT0 = L.PG_BIG + MC.ND_HGT;

// ---- what the sim says: the cells, the houses and rocks, the disasters, the strikes

// A cell's index ($nd_cell), -1 off the grid.
export const cellOf = (q, r) => (q < -MC.ND_N || q >= MC.ND_N || r < -MC.ND_N || r >= MC.ND_N ? -1 : (r + MC.ND_N) * MC.ND_W + q + MC.ND_N);
// The cell under (x, z), worked in f32 as $nd_at works it.
export const cellAt = (x, z, cx) => cellOf(Math.floor(f(f(f(x) - f(cx)) / f(S))), Math.floor(f(f(f(z) - f(cx)) / f(S))));
// The tick into play the rim takes cell c (0 none, ND_NEVER never), and its top (y).
export const dropOf = (view, c) => (c < 0 ? 0 : view.dv.getUint16(DROP0 + 2 * c + (view.bank || 0), true));
export const topOf = (view, c) => PLAT_Y + view.u8[HGT0 + c + (view.bank || 0)] * MC.ND_STEP;
// Does cell c hold tp ticks into play?
export const holds = (view, c, tp) => c >= 0 && tp < dropOf(view, c);

// The round's stage on the view's bank, read once a round (again when asked
// `again`): the radius and its last line, the cells, the houses and rocks, the
// disasters with their own numbers, the strikes and their buckets. Setup lays
// it all from the seed, the round and the crowd, so those and the counts say
// when the countdown has laid it out again.
let memo = null;
export function stage(view, again = false) {
  const dv = view.dv, o = view.bank || 0;
  const H = L.PG_H + o, B = L.PG_BIG + o;
  const rad = dv.getFloat32(H + MC.ND_RAD, true), cx = dv.getFloat32(L.PG_CX + o, true);
  const seed = dv.getUint32(L.HDR_SEED + o, true), hole = dv.getUint32(L.HDR_HOLE + o, true);
  const nd = Math.min(dv.getUint32(H + MC.ND_ND, true), MC.ND_NDMAX), ne = Math.min(dv.getUint32(H + MC.ND_NE, true), MC.ND_NEMAX);
  const nob = Math.min(dv.getUint32(H + MC.ND_NOB, true), MC.ND_NOBMAX);
  const m = memo;
  if (!again && m && m.rad === rad && m.cx === cx && m.seed === seed && m.hole === hole && m.nd === nd && m.ne === ne && m.nob === nob) return m;
  const s = { rad, cx, seed, hole, nd, ne, nob, rmin: dv.getFloat32(H + MC.ND_RMIN, true), cells: [], obs: [], dis: [], high: [], maxH: 0,
    et: new Int32Array(ne), ex: new Float64Array(ne), ez: new Float64Array(ne), ey: new Float64Array(ne), er: new Float64Array(ne), ek: new Uint8Array(ne),
    ej: new Uint8Array(ne), eo: new Uint8Array(ne), lo: new Uint16Array(MC.ND_NB), hi: new Uint16Array(MC.ND_NB) };
  if (rad > 0) {
    for (let r = -MC.ND_N; r < MC.ND_N; r++) for (let q = -MC.ND_N; q < MC.ND_N; q++) {
      const c = cellOf(q, r);
      const drop = dv.getUint16(B + MC.ND_DROP + 2 * c, true);
      if (!drop) continue;
      const h = view.u8[B + MC.ND_HGT + c];
      const x = cx + (q + 0.5) * S, z = cx + (r + 0.5) * S;
      const T = { c, q, r, x, z, h, top: PLAT_Y + h * MC.ND_STEP, drop, rho: Math.hypot(x - cx, z - cx), wob: ((q * 7 + r * 13) & 15) / 16 };
      s.cells.push(T);
      s.maxH = Math.max(s.maxH, h);
    }
    s.high = s.cells.filter((T) => T.h === s.maxH && T.drop === MC.ND_NEVER);
    if (!s.high.length) s.high = s.cells.filter((T) => T.h === s.maxH);
  }
  for (let k = 0; k < nob; k++) {
    const a = B + MC.ND_OBS + k * MC.ND_OBSZ;
    const x = dv.getFloat32(a, true), z = dv.getFloat32(a + 4, true), hx = dv.getFloat32(a + 8, true), hz = dv.getFloat32(a + 12, true);
    const c = cellAt(x, z, cx);
    s.obs.push({ k, x, z, hx, hz, round: hz === 0, top: dv.getFloat32(a + 16, true), drop: dv.getUint32(a + 20, true), kind: dv.getUint32(a + 24, true),
      base: c >= 0 ? PLAT_Y + view.u8[B + MC.ND_HGT + c] * MC.ND_STEP : PLAT_Y });
  }
  for (let j = 0; j < nd; j++) {
    const a = B + MC.ND_DIS + j * MC.ND_DSZ;
    const u = (k) => dv.getUint32(a + k, true), i = (k) => dv.getInt32(a + k, true), F = (k) => dv.getFloat32(a + k, true);
    const D = { j, kind: u(0), call: u(4), t0: u(8), t1: u(12), lv: Math.min(u(16), MC.ND_LVMAX), rad: F(20) };
    if (D.kind === MC.ND_FLOOD) D.depth = F(24);
    if (D.kind === MC.ND_METEOR || D.kind === MC.ND_LIGHTNING) { D.e0 = u(24); D.e1 = u(28); }
    if (D.kind === MC.ND_TORNADO) Object.assign(D, { ox: F(24), oz: F(28), a1: F(32), a2: F(36), p1: i(40), w1: i(44), p2: i(48), w2: i(52), rp: F(56), pull: F(60) });
    if (D.kind === MC.ND_QUAKE) {
      Object.assign(D, { per: u(24), push: F(28), w: F(36), fis: [] });
      for (let k = 0; k < Math.min(u(32), MC.ND_NFMAX); k++) {
        const b = 40 + k * MC.ND_FSZ;
        D.fis.push({ k, x: F(b), z: F(b + 4), lx: F(b + 8), lz: F(b + 12), hl: F(b + 16), open: u(b + 20) });
      }
    }
    if (D.kind === MC.ND_TSUNAMI) Object.assign(D, { dx: F(24), dz: F(28), c: F(32), h: F(36), nw: u(40), gap: u(44), a0: F(48), a1: F(52) });
    s.dis.push(D);
  }
  for (let e = 0; e < ne; e++) {
    const a = B + MC.ND_EVS + e * MC.ND_ESZ;
    s.et[e] = dv.getUint32(a, true); s.ex[e] = dv.getFloat32(a + 4, true); s.ez[e] = dv.getFloat32(a + 8, true);
    s.ey[e] = dv.getFloat32(a + 12, true); s.er[e] = dv.getFloat32(a + 16, true); s.ek[e] = dv.getUint32(a + 20, true);
    s.ej[e] = dv.getUint32(a + 24, true); s.eo[e] = dv.getUint32(a + 28, true);
  }
  for (let b = 0; b < MC.ND_NB; b++) { s.lo[b] = dv.getUint16(B + MC.ND_LO + 2 * b, true); s.hi[b] = dv.getUint16(B + MC.ND_HI + 2 * b, true); }
  memo = s;
  return s;
}

// The disaster on at tp ticks into play (its hit to its end), or null; and
// the one called by then and not yet over (its call to its end), or null.
export const nowAt = (s, tp) => s.dis.find((D) => tp >= D.t0 && tp < D.t1) || null;
export const calledAt = (s, tp) => s.dis.find((D) => tp >= D.call && tp < D.t1) || null;
// The calm's next disaster at tp: the first not yet called, or null.
export const nextAt = (s, tp) => s.dis.find((D) => tp < D.call) || null;
// The rim's line at tp: the radius, in toward its last line by the calm gone by (less the jitter).
export function rimAt(s, tp) {
  let all = 0, before = 0;
  for (let j = 0; j + 1 < s.dis.length; j++) {
    const g = s.dis[j + 1].t0 - s.dis[j].t1;
    all += g;
    before += Math.max(0, Math.min(g, tp - s.dis[j].t1));
  }
  if (!all) return s.rad;
  return s.rad - (s.rad - s.rmin) * Math.min(1, before / (all * MC.ND_EK));
}
// A flood's water on tp ($nd_water): its top, y.
export function waterAt(D, tp) {
  let k = 1;
  if (tp - D.t0 < MC.ND_FRISE) k = (tp - D.t0) / MC.ND_FRISE;
  if (D.t1 - tp < MC.ND_FRISE) k = Math.min(k, (D.t1 - tp) / MC.ND_FRISE);
  return PLAT_Y - 0.5 + (D.depth + 0.5) * Math.max(0, k);
}
// A tornado's funnel on tp ($nd_funnel, its angles as the sim's integers): [x, z, how hard 0..1].
const sc = (u) => [Math.sin((u / TURN) * 2 * Math.PI), Math.cos((u / TURN) * 2 * Math.PI)];
export function funnelAt(D, tp) {
  const el = Math.round(tp) - D.t0, fr = tp - Math.round(tp);
  const [s1, c1] = sc(D.p1 + ((Math.imul(D.w1, el) >> 4) + D.w1 * fr / 16));
  const [s2, c2] = sc(D.p2 + ((Math.imul(D.w2, el) >> 4) + D.w2 * fr / 16));
  const k = Math.max(0, Math.min(1, Math.min((tp - D.t0) / MC.ND_TRAMP, (D.t1 - tp) / MC.ND_TRAMP)));
  return [D.ox + D.a1 * c1 + D.a2 * c2, D.oz + D.a1 * s1 + D.a2 * s2, k];
}
// A quake's fissure f's half width on tp (0 shut, as $nd_fissure has it), and is (x, z) on its line within its half width plus g?
export const fissureW = (D, F, tp) => (tp < F.open || tp >= D.t1 ? 0 : D.w * Math.min(1, (tp - F.open + 1) / MC.ND_QOPEN));
export function onFissure(F, x, z, w) {
  const dx = x - F.x, dz = z - F.z;
  return Math.abs(dx * F.lx + dz * F.lz) <= F.hl && Math.abs(dz * F.lx - dx * F.lz) < w;
}
// A tsunami's wave fronts on tp, metres along its way from the centre (each [front, k]), the waves out then.
export function frontsAt(D, tp) {
  const out = [];
  for (let k = 0; k < D.nw; k++) {
    const el = tp - D.t0 - k * D.gap;
    const front = D.a0 + el * D.c * TICK;
    if (front - MC.ND_WD < D.a1 + 30) out.push([front, k]);
  }
  return out;
}
// (x, z) along and across a tsunami's way, from the centre.
export const alongAcross = (s, D, x, z) => [(x - s.cx) * D.dx + (z - s.cx) * D.dz, (z - s.cx) * D.dx - (x - s.cx) * D.dz];
// Is (x, z) in the lee of a house, crate or rock standing at tp ($nd_lee)?
export function inLee(s, D, tp, x, z) {
  const [al, ac] = alongAcross(s, D, x, z);
  for (const O of s.obs) {
    if (tp >= O.drop) continue;
    const { ea, eb, oa, ob } = leeOf(s, D, O);
    if (al >= oa - ea && al <= oa + ea + MC.ND_WLEE && Math.abs(ac - ob) < eb - MC.ND_WIN) return true;
  }
  return false;
}
function leeOf(s, D, O) {
  const ea = O.round ? O.hx : O.hx * Math.abs(D.dx) + O.hz * Math.abs(D.dz);
  const eb = O.round ? O.hx : O.hx * Math.abs(D.dz) + O.hz * Math.abs(D.dx);
  const [oa, ob] = alongAcross(s, D, O.x, O.z);
  return { ea, eb, oa, ob };
}
// Is (x, z) on house or rock O's footprint, grown by g?
export const onOb = (O, x, z, g = 0) => (O.round ? Math.hypot(x - O.x, z - O.z) <= O.hx + g : Math.abs(x - O.x) <= O.hx + g && Math.abs(z - O.z) <= O.hz + g);
// What stands highest at (x, z) on tp: [top (y, or -1000 the sea), the house or rock there or null].
export function surfaceAt(view, s, x, z, tp) {
  const c = cellAt(x, z, s.cx);
  let top = holds(view, c, tp) ? topOf(view, c) : -1000, on = null;
  for (const O of s.obs) if (tp < O.drop && O.top > top && onOb(O, x, z)) { top = O.top; on = O; }
  return [top, on];
}
// The strikes that may land from ta to tb into play: [e0, e1).
export function span(s, ta, tb) {
  const b0 = Math.max(0, Math.min(MC.ND_NB - 1, Math.floor(ta / MC.ND_BUCKET))), b1 = Math.max(0, Math.min(MC.ND_NB - 1, Math.floor(tb / MC.ND_BUCKET)));
  return [s.lo[b0], s.hi[b1]];
}
export const isBolt = (s, e) => (s.ek[e] & 3) === MC.ND_EV_BOLT;
const warnOf = (s, e) => (isBolt(s, e) ? MC.ND_LWARN : MC.ND_MWARN);
// The tick (HDR_TICK's count, fractional) to draw at, and ticks into play then; frozen where the round ended.
function clock(view, ctx) {
  const g = view.party();
  let now = ctx?.ptick ?? (g.tick + (ctx?.dt || 0) / TICK);
  if (g.state === L.H_OVER) now = Math.min(now, (g.until - L.P_OVER) | 0);
  const tp = g.state === L.H_PLAY || g.state === L.H_OVER ? Math.max(0, ((now - g.start) | 0) + (now % 1)) : -1;
  return { g, now, tp };
}

// ---- drawing

const shade = (rgb, to, k) => [rgb[0] + (to[0] - rgb[0]) * k, rgb[1] + (to[1] - rgb[1]) * k, rgb[2] + (to[2] - rgb[2]) * k];
let sky = 'day'; // the backdrop: a storm's darker
let lastRumble = -1e9;

function cellColour(s, T) {
  if (T.h === 0 && T.rho > s.rad - MC.ND_HS) return SAND;
  const g = GRASS[(T.q + T.r) & 1];
  return T.h ? shade(g, HIGH, T.h / MC.ND_HK) : g;
}

// A house, a crate or a rock, at its place (dy: sunk by, alpha: fading out as it falls).
function obstacle(sc, out, O, dy = 0, tilt = 0, alpha = 1) {
  const y0 = O.base - BASE, h = O.top - y0;
  if (O.kind === MC.ND_HOUSE) {
    const w = WALLS[O.k & 3], rf = ROOF[(O.k >> 1) & 3];
    sc.box(O.x, y0 + h / 2 - 0.15 - dy, O.z, O.hx, h / 2 - 0.15, O.hz, tilt, ...w, LOOK.MATTE, 0, 0, alpha, O.k * 97 & 4095);
    sc.box(O.x, O.top - 0.15 - dy, O.z, O.hx + 0.25, 0.15, O.hz + 0.25, tilt, ...rf, LOOK.MATTE, 0, 0, alpha, O.k * 31 & 4095);
    // a door on the side away from the crate, a lit window either side of it
    const ax = O.hx >= O.hz, sx = ax ? 0 : 1, sz = ax ? 1 : 0;
    const fx = O.x + sx * (O.hx + 0.02), fz = O.z + sz * (O.hz + 0.02);
    sc.box(fx, O.base + 0.85 - dy, fz, sx ? 0.05 : 0.5, 0.85, sz ? 0.05 : 0.5, 0, 0.32, 0.22, 0.14, LOOK.WOOD, 0, 0, alpha);
    for (const side of [-1, 1]) {
      const off = side * Math.min(1.4, (ax ? O.hx : O.hz) - 0.5);
      sc.box(fx + sz * off, O.base + 1.4 - dy, fz + sx * off, sx ? 0.05 : 0.3, 0.3, sz ? 0.05 : 0.3, 0, 1, 0.85, 0.5, LOOK.GLOW, 0.5, 0.2, alpha);
    }
  } else if (O.kind === MC.ND_CRATE) {
    sc.box(O.x, y0 + h / 2 - dy, O.z, O.hx, h / 2, O.hz, tilt, 0.62, 0.45, 0.26, LOOK.WOOD, 0, 0, alpha, O.k * 13 & 4095);
  } else {
    sc.hex(O.x, y0 + h / 2 - 0.2 - dy, O.z, O.hx * 1.03, h / 2 - 0.2, O.k * 0.7 + tilt, ...STONE, LOOK.MATTE, 0, 0, alpha, O.k * 7 & 4095);
    sc.cyl(O.x, O.top - 0.2 - dy, O.z, O.hx * 0.92, 0.2, ...shade(STONE, [0.7, 0.7, 0.7], 0.2), LOOK.MATTE, 0, 0, alpha, O.k * 5 & 4095);
  }
}

// A flood's water: a sheet over the island to its top, falling off the rim.
function flood(sc, out, s, D, tp, rim) {
  const top = waterAt(D, tp);
  if (top <= PLAT_Y - 0.45) return;
  const lo = PLAT_Y - BASE - 0.3;
  sc.cyl(s.cx, (top + lo) / 2, s.cx, rim + 0.8, (top - lo) / 2, ...WATER, LOOK.PLASTIC, 0, 0, 0.55);
  out.decals?.push({ pos: [s.cx, top + 0.02, s.cx], radius: rim + 0.8, width: 1, color: [0.9, 0.97, 1, 0.5], kind: DECAL.RING });
  // the water going over the edge, all round
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI + tp * 0.0005;
    const x = s.cx + Math.cos(a) * (rim + 1.1), z = s.cx + Math.sin(a) * (rim + 1.1);
    sc.box(x, top - 6, z, 0.12, 6, (Math.PI * (rim + 1.1)) / n, a, 0.75, 0.88, 0.95, LOOK.PLASTIC, 0, 0, 0.3, i);
  }
}

// A tornado's funnel at its place: stacked whirling rings, wider up high, debris round its foot.
function tornado(sc, out, s, D, tp, now) {
  const [x, z, k0] = funnelAt(D, Math.max(tp, D.t0));
  let k = k0;
  if (tp < D.t0) k = Math.max(0, 1 - (D.t0 - tp) / MC.ND_WARN); // forming as it's called
  if (k <= 0.01) return;
  const spin = now * 0.004;
  const touch = tp >= D.t0 ? 1 : 0.35; // as it's called it hangs from the cloud
  const H = 30, n = 16;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    if (u < 1 - touch) continue;
    const y = PLAT_Y + u * H;
    const r = (MC.ND_TCORE * 0.7 + u * u * 9) * k;
    const wob = Math.sin(spin * 1.3 + i * 0.6) * (0.4 + u * 2.2);
    sc.cyl(x + wob, y, z + Math.cos(spin + i * 0.5) * (0.3 + u * 1.5), r, H / n / 2 + 0.2, 0.5, 0.5, 0.52, LOOK.MATTE, 0, 0, 0.32 + 0.25 * (1 - u), i * 37);
  }
  sc.sphere(x, PLAT_Y + H + 4, z, 16 * k, 0.3, 0.31, 0.34, LOOK.MATTE, 0, 0, 0.75);
  if (tp < D.t0) return;
  const c = cellAt(x, z, s.cx);
  out.decals?.push({ pos: [x, (c >= 0 ? PLAT_Y + s.cells.find((T) => T.c === c)?.h * MC.ND_STEP || PLAT_Y : PLAT_Y) + 0.08, z], radius: D.rp * k, width: 0.5, color: [0.75, 0.68, 0.55, 0.3], kind: DECAL.ZONE });
  for (let i = 0; i < 14; i++) {
    const a = spin * (2.5 - (i % 3) * 0.5) + i * 2.4, r = 1.5 + (i % 5) * 1.3, y = PLAT_Y + 0.5 + ((i * 7) % 9) * 0.9 + Math.sin(spin + i) * 0.6;
    sc.box(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.25, 0.08, 0.35, a * 2, 0.45, 0.36, 0.26, LOOK.WOOD, 0, 0, k, i);
  }
  for (let i = 0; i < 6; i++) {
    const a = spin * 3 + i;
    out.glow.push({ pos: [x + Math.cos(a) * 2.5, PLAT_Y + 0.6, z + Math.sin(a) * 2.5], size: 3.5, color: [0.7, 0.62, 0.5, 0.35 * k], kind: SPRITE.FLASH, minpx: 2 });
  }
  out.casters?.push([x, PLAT_Y + 4, z, -4 * k]);
}

// A quake's fissures: a glowing crack along each line as its time comes, then a gaping dark one.
function fissures(sc, out, view, s, D, tp, now) {
  for (const F of D.fis) {
    if (tp < F.open - MC.ND_QWARN || tp >= D.t1) continue;
    const w = fissureW(D, F, tp);
    const u = Math.max(0, Math.min(1, (tp - (F.open - MC.ND_QWARN)) / MC.ND_QWARN));
    const n = Math.ceil((2 * F.hl) / 1.25);
    const yaw = Math.atan2(F.lz, F.lx);
    for (let i = 0; i < n; i++) {
      const t = -F.hl + (i + 0.5) * (2 * F.hl / n);
      const x = F.x + F.lx * t, z = F.z + F.lz * t;
      const c = cellAt(x, z, s.cx);
      if (!holds(view, c, tp | 0)) continue;
      const top = topOf(view, c);
      if (w > 0) {
        sc.box(x, top - 0.6, z, F.hl / n + 0.05, 0.62, w, yaw, 0.08, 0.05, 0.04, LOOK.MATTE, 0, 0, 1, i);
        sc.box(x, top - 1.2, z, F.hl / n + 0.05, 0.05, w * 0.6, yaw, 1, 0.35, 0.08, LOOK.GLOW, 1.2, 0.3, 1, i);
      } else {
        const pulse = 0.6 + 0.4 * Math.sin(now * 0.02 * (1 + 3 * u));
        sc.box(x, top + 0.03, z, F.hl / n + 0.05, 0.03, 0.08 + 0.25 * u, yaw, 1, 0.45, 0.1, LOOK.GLOW, (0.5 + u) * pulse, 0.3, 0.5 + 0.5 * u, i);
      }
    }
  }
}

// A tsunami: its waves rolling in from the horizon (each a wall of water ND_WD deep with foam on top), the lee marked.
function tsunami(sc, out, s, D, tp, rim) {
  const yaw = Math.atan2(D.dz, D.dx);
  const len = rim + 30;
  for (let k = 0; k < D.nw; k++) {
    const front = D.a0 + (tp - D.t0 - k * D.gap) * D.c * TICK;
    if (front < D.a0 - 90 || front - MC.ND_WD > D.a1 + 20) continue;
    const mid = front - MC.ND_WD / 2;
    const x = s.cx + D.dx * mid, z = s.cx + D.dz * mid;
    const lo = PLAT_Y - 4;
    sc.box(x, (PLAT_Y + D.h + lo) / 2, z, MC.ND_WD / 2, (PLAT_Y + D.h - lo) / 2, len, yaw, 0.2, 0.5, 0.62, LOOK.PLASTIC, 0, 0, 0.6, k);
    sc.box(s.cx + D.dx * (front - 0.6), PLAT_Y + D.h + 0.15, s.cx + D.dz * (front - 0.6), 0.8, 0.25, len, yaw, 0.95, 0.98, 1, LOOK.MATTE, 0, 0, 0.85, k + 9);
    sc.box(s.cx + D.dx * (front - MC.ND_WD - 1.5), PLAT_Y + 0.2, s.cx + D.dz * (front - MC.ND_WD - 1.5), 1.5, 0.25, len, yaw, 0.6, 0.8, 0.9, LOOK.PLASTIC, 0, 0, 0.35, k + 17);
  }
  // the lee: behind every house and rock still standing, green
  for (const O of s.obs) {
    if (tp >= O.drop) continue;
    const { ea, eb, oa, ob } = leeOf(s, D, O);
    if (eb - MC.ND_WIN <= 0) continue;
    const al = oa + ea + MC.ND_WLEE / 2;
    const x = s.cx + D.dx * al - D.dz * ob, z = s.cx + D.dz * al + D.dx * ob;
    sc.box(x, O.base + 0.03, z, MC.ND_WLEE / 2, 0.02, eb - MC.ND_WIN, yaw, 0.3, 1, 0.45, LOOK.GLOW, 0.5, 0.6, 0.35);
  }
}

// The meteors and bolts coming down near tp: rings and flickers ahead, the fall, the blast and the bolt.
function strikes(sc, out, s, tp, now) {
  const [e0, e1] = span(s, tp - 60, tp + MC.ND_MWARN + 2);
  for (let e = e0; e < e1; e++) {
    const t = s.et[e], wn = warnOf(s, e), x = s.ex[e], y = s.ey[e], z = s.ez[e], r = s.er[e];
    if (tp < t - wn || tp > t + 60) continue;
    const u = Math.max(0, Math.min(1, (tp - (t - wn)) / wn));
    if (isBolt(s, e)) {
      if (tp < t) {
        const fl = Math.sin(now * 0.05 + e) > 0.3 - u ? 1 : 0.35;
        out.decals?.push({ pos: [x, y + 0.07, z], radius: r, width: 0.25, color: [0.85, 0.92, 1, (0.4 + 0.5 * u) * fl], kind: DECAL.RING });
        out.decals?.push({ pos: [x, y + 0.06, z], radius: r, width: r, color: [0.6, 0.75, 1, 0.12 + 0.2 * u * fl], kind: DECAL.DISC });
      } else if (tp < t + 18) {
        const k = 1 - (tp - t) / 18;
        let ax = x, az = z, ay = y + 70;
        for (let i = 1; i <= 5; i++) {
          const by = y + 70 * (1 - i / 5);
          const bx = i === 5 ? x : x + Math.sin(e * 3.1 + i * 1.9) * 2.2, bz = i === 5 ? z : z + Math.cos(e * 2.3 + i * 2.7) * 2.2;
          out.beams?.push({ a: [ax, ay, az], b: [bx, by, bz], width: 0.35 * k + 0.1, color: [0.85, 0.92, 1, 0.9 * k] });
          ax = bx; ay = by; az = bz;
        }
        out.glow.push({ pos: [x, y + 0.5, z], size: 5 * k + 1, color: [0.85, 0.92, 1, 0.9 * k], kind: SPRITE.FLASH, minpx: 3 });
      }
      continue;
    }
    if (tp < t) {
      out.decals?.push({ pos: [x, y + 0.07, z], radius: r, width: 0.3, color: [1, 0.25, 0.08, 0.5 + 0.45 * u], kind: DECAL.TARGET });
      out.decals?.push({ pos: [x, y + 0.08, z], radius: Math.max(0.5, r * (1 + 2 * (1 - u))), width: 0.25, color: [1, 0.7, 0.4, 0.3 + 0.5 * u], kind: DECAL.RING });
      // the fireball, down a slant out of the sky
      const k = 1 - u, hx = Math.cos(e * 1.7), hz = Math.sin(e * 1.7);
      const fx = x + hx * 50 * k, fy = y + 90 * k + 0.5, fz = z + hz * 50 * k;
      sc.sphere(fx, fy, fz, 0.8 + r * 0.15, 1, 0.55, 0.15, LOOK.GLOW, 1.5, 0.4);
      for (let i = 1; i < 5; i++) out.glow.push({ pos: [fx + hx * i * 2.2, fy + i * 4, fz + hz * i * 2.2], size: 2.2 - i * 0.3, color: [1, 0.6 - i * 0.08, 0.2, 0.7 - i * 0.12], kind: SPRITE.FLASH, minpx: 2 });
      out.casters?.push([fx, fy, fz, -(0.8 + r * 0.15)]);
    } else {
      const a = (tp - t) / 60;
      out.decals?.push({ pos: [x, y + 0.05, z], radius: r * 0.8, width: r * 0.8, color: [0.08, 0.05, 0.03, 0.6 * (1 - a)], kind: DECAL.DISC });
      if (a < 0.4) out.glow.push({ pos: [x, y + 1, z], size: r * 2.5 * (0.5 + a), color: [1, 0.6, 0.25, 0.8 * (1 - a / 0.4)], kind: SPRITE.FLASH, minpx: 3 });
    }
  }
}

// ---- the AI ball

const slotOf = (me) => (typeof me === 'number' ? me : me?.slot ?? -1);
// the house, crate or rock each AI ball is climbing (its goal() sets it), not a wall in its way
const CLIMB = [];
// What every brain looking at one world tick shares: the stage, the tick into play, the disaster called and its ticks.
let seenTick = -1, seenBank = -1, seenView = null, seen = null;
function world(view) {
  if (view === seenView && view.tick === seenTick && view.bank === seenBank && seen) return seen;
  const g = view.party();
  const s = stage(view);
  const tp = g.t;
  seen = { g, s, tp, D: g.state === L.H_PLAY ? calledAt(s, tp) : null, rim: rimAt(s, tp + 125) };
  seenTick = view.tick; seenBank = view.bank; seenView = view;
  return seen;
}
// How bad being at (x, z) is on tick `tick`, as ball slot sees it from the view's tick.
function danger(view, x, z, tick, slot, me) {
  const w = world(view);
  const { g, s } = w;
  if (g.state !== L.H_PLAY || !(s.rad > 0)) return 0;
  const tp = (tick - g.start) | 0, now = w.tp;
  const c = cellAt(x, z, s.cx);
  const drop = dropOf(view, c);
  if (tp >= drop) {
    // off the turf: on a house or rock still, or the sea
    for (const O of s.obs) if (tp < O.drop && onOb(O, x, z, -0.2)) return 0.3;
    return 1;
  }
  let d = drop - tp < 80 ? 0.8 : drop - tp < 250 ? 0.3 : 0;
  // walls in the way (a house or rock over the ball's bottom), but the one it's climbing
  const y = me?.pos ? me.pos[1] : topOf(view, c), up = slot >= 0 ? CLIMB[slot] : null;
  for (const O of s.obs) {
    if (tp < O.drop && O.top > y + 0.4 && O !== up?.[0] && O !== up?.[1] && onOb(O, x, z, 0.6)) { d = Math.max(d, 0.35); break; }
  }
  const rho = Math.hypot(x - s.cx, z - s.cx);
  if (rho > w.rim - 2) d = Math.max(d, 0.25);
  const D = w.D;
  if (!D) return d;
  switch (D.kind) {
    case MC.ND_FLOOD: {
      if (tp < D.t0) break;
      const deep = waterAt(D, tp) - surfaceAt(view, s, x, z, tp)[0];
      if (deep > 0) d = Math.max(d, Math.min(0.7, 0.15 + deep * 0.25), rho > w.rim - 6 ? 0.5 : 0);
      break;
    }
    case MC.ND_METEOR: case MC.ND_LIGHTNING: {
      const [e0, e1] = span(s, tp - 25, tp + 25);
      for (let e = e0; e < e1; e++) {
        if (s.et[e] - warnOf(s, e) > now) continue; // not showing yet
        const dt = Math.abs(s.et[e] - tp);
        if (dt > 25) continue;
        const dd = Math.hypot(x - s.ex[e], z - s.ez[e]);
        if (dd < s.er[e] + 0.8) d = Math.max(d, dt < 12 ? 0.95 : 0.6);
        else if (dd < s.er[e] + 2) d = Math.max(d, 0.3);
      }
      if (D.kind === MC.ND_LIGHTNING) for (const O of s.obs) if (tp < O.drop && onOb(O, x, z)) { d = Math.max(d, 0.3); break; }
      break;
    }
    case MC.ND_TORNADO: {
      // where it will be, worked from what it's been doing: a player sees it move
      const [fx, fz] = funnelAt(D, Math.max(D.t0, Math.min(tp, now + 125)));
      const dd = Math.hypot(x - fx, z - fz);
      if (dd < MC.ND_TCORE + 2.5) d = Math.max(d, 0.95);
      else if (dd < D.rp) d = Math.max(d, 0.6 * (1 - dd / D.rp) + 0.2);
      break;
    }
    case MC.ND_QUAKE: {
      for (const F of D.fis) {
        if (now < F.open - MC.ND_QWARN) continue;
        if (onFissure(F, x, z, D.w + 0.9)) d = Math.max(d, tp >= F.open ? 0.95 : 0.7);
      }
      if (tp >= D.t0 && rho > w.rim - 4) d = Math.max(d, 0.4);
      break;
    }
    case MC.ND_TSUNAMI: {
      if (inLee(s, D, tp, x, z)) break;
      const [al] = alongAcross(s, D, x, z);
      // how much island lies downstream
      const room = Math.sqrt(Math.max(0, w.rim * w.rim - rho * rho + al * al)) - al;
      if (room < 12) d = Math.max(d, 0.6 * (1 - room / 12) + 0.15);
      break;
    }
    default:
  }
  return d;
}
// A refuge from a flood, for ball b at (x0, z0): the nearest turf standing
// out of it (the cells it may take kept per flood in the stage), else the
// nearest crate or rock whose top does, else a house (by its crate, when
// below the crate's top).
function refuge(view, s, D, b, x0, z0, slot) {
  const need = PLAT_Y + D.depth - MC.ND_FSUB + 0.15;
  s.dry ??= [];
  const dry = s.dry[D.j] ??= s.cells.filter((T) => T.top >= need && T.drop > D.t1);
  let best = null, bd = Infinity;
  for (const T of dry) {
    const dd = Math.hypot(T.x - x0, T.z - z0) + ((T.c * 7 + slot * 13) % 11) * 0.3;
    if (dd < bd) { bd = dd; best = { x: T.x, z: T.z, O: null }; }
  }
  if (best) return best;
  for (const O of s.obs) {
    if (O.top < need || O.drop <= D.t1) continue;
    const dd = Math.hypot(O.x - x0, O.z - z0) + (O.kind === MC.ND_HOUSE ? 12 : 0);
    if (dd < bd) { bd = dd; best = { x: O.x, z: O.z, O }; }
  }
  if (best?.O?.kind === MC.ND_HOUSE) {
    // up by its crate
    const cr = s.obs[best.O.k + 1];
    if (cr && cr.kind === MC.ND_CRATE) return { x: cr.x, z: cr.z, O: cr, then: best.O };
  }
  return best;
}
// How far (x, z) is from house or rock O's footprint (0 on it).
const edge = (O, x, z) => (O.round ? Math.max(0, Math.hypot(x - O.x, z - O.z) - O.hx) : Math.hypot(Math.max(0, Math.abs(x - O.x) - O.hx), Math.max(0, Math.abs(z - O.z) - O.hz)));
// Climbing out of a flood onto O (and from it, a crate, onto the house it
// leans on): straight at it, and a hop timed off its edge so the ball clears
// the side going up and comes down on top; too close and slow, back off for a
// run-up first. On top, keep to its middle.
function climb(view, me, bot) {
  const mem = bot.mem, O = mem.climb;
  const w = world(view), D = w.D;
  if (!D || D.kind !== MC.ND_FLOOD || w.tp >= O.drop) { mem.climb = null; mem.back = 0; return null; }
  if (!me.live || me.out || me.falling) return null;
  const x0 = bot.pos[0], z0 = bot.pos[1], vx = bot.vel[0], vz = bot.vel[1];
  let T = O;
  if (O.then && me.pos[1] >= O.top - 0.05) T = O.then;
  const dx = T.x - x0, dz = T.z - z0, dd = Math.hypot(dx, dz) || 1;
  const yaw = Math.atan2(dz, dx);
  if (me.pos[1] >= T.top - 0.05) return { yaw, move: dd > 0.6 ? 1 : 0 };
  if (!me.ground) return { yaw, move: 1 };
  const E = edge(T, x0, z0), to = (vx * dx + vz * dz) / dd, sp = Math.hypot(vx, vz);
  // backing off: from a crate, toward its far side; on the ground, straight away
  const away = T === O ? Math.atan2(-dz, -dx) : Math.atan2(O.z - T.z, O.x - T.x);
  if (mem.back) {
    if (E > (T === O ? 2.8 : 1.9)) mem.back = 0;
    else return { yaw: away, move: 1 };
  }
  if (E < 1.2 && to < 2.3) { mem.back = 1; return { yaw: away, move: 1 }; }
  return { yaw, move: sp > 4.5 ? 0 : 1, hop: to > 2.3 && E > 0.5 && E < 1.05 + 0.2 * to };
}
// Somewhere at least `inset` in from the rim, near (x, z).
function inside(s, x, z, rim, inset) {
  const dx = x - s.cx, dz = z - s.cx, r = Math.hypot(dx, dz), lim = Math.max(0, rim - inset);
  return r <= lim ? [x, z] : [s.cx + dx / r * lim, s.cx + dz / r * lim];
}

export default {
  id: L.MG_DISASTER, key: 'disaster', name: 'DISASTER ISLAND',
  hint: 'SURVIVE THE DISASTERS  EACH ONE IS CALLED 3 S BEFORE IT HITS',
  rules: 'LAST ONE ON WINS  THE ISLAND CRUMBLES BETWEEN DISASTERS',
  get env() { return sky; },

  draw(view, ctx, out) {
    const s = stage(view);
    if (!(s.rad > 0)) return;
    const { now, tp } = clock(view, ctx);
    const sc = out.scene;
    const T0 = tp < 0 ? 0 : tp;
    const D = tp >= 0 ? calledAt(s, T0) : null;
    sky = D && (D.kind === MC.ND_LIGHTNING || D.kind === MC.ND_TORNADO) ? 'sunset' : 'day';
    // the column the island stands on, down into the sea
    sc.cyl(s.cx, PLAT_Y - BASE - 20, s.cx, s.rmin * 0.75, 20, ...CLIFF, LOOK.MATTE);
    sc.cyl(s.cx, PLAT_Y - BASE - 1.5, s.cx, s.rmin * 0.98, 1.5, ...shade(CLIFF, [0.6, 0.55, 0.45], 0.3), LOOK.MATTE);
    // a quake's shake: the turf jumps with each shove
    let qx = 0, qz = 0;
    if (D && D.kind === MC.ND_QUAKE && tp >= D.t0 + MC.ND_Q0) {
      const el = tp - D.t0 - MC.ND_Q0, o = el % D.per;
      const amp = o < MC.ND_QLEN ? 0.12 * (1 - o / MC.ND_QLEN) : 0.02;
      qx = amp * Math.sin(now * 1.9); qz = amp * Math.sin(now * 2.3 + 1);
    }
    for (const T of s.cells) {
      const rgb = cellColour(s, T);
      const y0 = PLAT_Y - BASE, hh = (T.top - y0) / 2;
      if (tp < 0) { sc.box(T.x, y0 + hh, T.z, S * DRAWN, hh, S * DRAWN, 0, ...rgb, LOOK.MATTE, 0, 0, 1, T.c & 4095); continue; }
      const left = T.drop - tp;
      if (left <= 0) {
        const a = -left * TICK;
        if (a < FALL) sc.box(T.x, y0 + hh - 15 * a * a, T.z, S * DRAWN, hh, S * DRAWN, a * (T.wob - 0.5) * 3, ...shade(rgb, DOOM, 0.8), LOOK.MATTE, 0, 0, 1 - a / FALL);
        continue;
      }
      let c = rgb, dx = qx, dz = qz, dy = 0;
      if (left < WARN) {
        const k = 1 - left / WARN;
        c = shade(rgb, DOOM, 0.75 * k);
        dy = -0.12 * k;
        const sh = left < 60 ? 0.07 * (1 - left / 60) : 0;
        dx += sh * Math.sin(now * 2.3 + T.q * 5.1 + T.r * 2.7);
        dz += sh * Math.sin(now * 2.9 + T.q * 3.3 - T.r * 4.1);
      }
      sc.box(T.x + dx, y0 + hh + dy, T.z + dz, S * DRAWN, hh, S * DRAWN, 0, ...c, LOOK.MATTE, 0, 0, 1, T.c & 4095);
    }
    for (const O of s.obs) {
      if (tp >= 0 && tp >= O.drop) {
        const a = (tp - O.drop) * TICK;
        if (a < FALL) obstacle(sc, out, O, 15 * a * a, a * 0.4, 1 - a / FALL);
        continue;
      }
      obstacle(sc, out, O);
    }
    if (tp < 0) return;
    const rim = rimAt(s, tp);
    if (D) {
      if (D.kind === MC.ND_FLOOD && tp >= D.t0) flood(sc, out, s, D, tp, rim);
      if (D.kind === MC.ND_TORNADO) tornado(sc, out, s, D, tp, now);
      if (D.kind === MC.ND_QUAKE) fissures(sc, out, view, s, D, tp, now);
      if (D.kind === MC.ND_TSUNAMI) tsunami(sc, out, s, D, tp, rim);
    }
    strikes(sc, out, s, tp, now);
  },

  // the island as it stands
  frame(view) {
    const s = stage(view);
    const g = view.party();
    const tp = g.state === L.H_PLAY ? g.t : g.state === L.H_OVER ? Math.max(0, ((g.until - L.P_OVER) - g.start) | 0) : 0;
    const r = s.rad > 0 ? rimAt(s, tp) : g.size;
    return { centre: [s.cx || g.cx, PLAT_Y, s.cx || g.cx], radius: r + S * 0.7, shape: 'disc' };
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    if (fx.kind === MC.ND_FX_CALL) {
      const kind = fx.shot & 0xff, phase = fx.shot >> 8;
      if (phase === 0) { ctx.banner?.(`${NAMES[kind]} COMING!`, KIND_C[kind] ?? C.ORANGE, 2600); ctx.sound?.count?.(1); }
      else if (phase === 1) { ctx.banner?.(`${NAMES[kind]}!`, C.RED, 1500); ctx.sound?.count?.(0); }
      else { ctx.feed?.(`SURVIVED THE ${NAMES[kind]}`, C.GREEN); ctx.sound?.holed?.(); }
    } else if (fx.kind === MC.ND_FX_STRIKE) {
      const bolt = fx.size < MC.ND_MR0 - 0.1;
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.5, fx.pos[2]], size: fx.size * 2.2, color: bolt ? [0.85, 0.92, 1, 0.9] : [1, 0.6, 0.25, 0.9], kind: SPRITE.FLASH, life: 500, grow: true });
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.2, fx.pos[2]], size: fx.size * 1.6, color: [1, 0.85, 0.6, 0.6], kind: SPRITE.RING, life: 400, grow: true });
      if (d < 160) { ctx.sound?.blast?.(d + 3, bolt ? 3 : 5); if (bolt) ctx.sound?.crackle?.(2); }
    } else if (fx.kind === MC.ND_FX_HIT) {
      ctx.glow?.({ pos: fx.pos, size: 1.4 + fx.size * 0.06, color: [1, 0.85, 0.5, 0.9], kind: SPRITE.SPARK, life: 320 });
      if (fx.owner === ctx.slot) {
        const say = ['', 'METEOR!', 'STRUCK!', 'CAUGHT IN THE TORNADO!', 'SWEPT UP!', 'DROWNED'][fx.shot] || '';
        if (say) ctx.banner?.(say, C.RED, 1000);
        ctx.sound?.boing?.(Math.min(30, fx.size * 1.5), 0);
      }
    } else if (fx.kind === MC.ND_FX_QUAKE) {
      if (fx.shot >= 0x100) ctx.sound?.crackle?.(3);
      else if (!(ctx.now - lastRumble < 300)) { lastRumble = ctx.now; ctx.sound?.land?.(Math.min(30, fx.size)); ctx.sound?.blast?.(20, 5); }
    }
  },

  // a ball out to a disaster: what took it (its PG_M's last hit, or the disaster on)
  sink(f, name, view) {
    if (f.shot !== 255) return null;
    const s = stage(view);
    const tp = (f.tick - view.party().start) | 0;
    const m = view.dv.getUint32(L.PLAYERS + f.owner * L.PSIZE + L.PG_M, true);
    const kind = (m >>> 12) & 15, at = m >>> 16;
    const who = name(f.owner);
    if (kind && tp - at < 400) return `${who} ${['', 'HIT BY A METEOR', 'STRUCK BY LIGHTNING', 'FLUNG BY THE TORNADO', 'SWEPT AWAY', 'DROWNED'][kind]}`;
    const D = s.dis.find((E) => tp >= E.t0 && tp < E.t1 + 150);
    if (!D) return null;
    if (D.kind === MC.ND_QUAKE && D.fis.some((F) => onFissure(F, f.pos[0], f.pos[2], D.w + 1))) return `${who} FELL INTO A FISSURE`;
    return `${who} ${['WASHED OFF', 'BLOWN OFF', 'BLOWN OFF', 'SHAKEN OFF', 'SWEPT OFF', 'FELL'][D.kind]}`;
  },

  // the disaster on (or coming), its tip, and what's at you
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const s = stage(view);
    if (!(s.rad > 0)) return;
    const tp = g.t;
    const D = calledAt(s, tp);
    if (D && tp < D.t0) {
      ctx.right(3, `${NAMES[D.kind]} IN ${Math.ceil((D.t0 - tp) * TICK)}S`, KIND_C[D.kind] ?? C.ORANGE);
      ctx.right(4, TIPS[D.kind], C.WHITE);
    } else if (D) {
      ctx.right(3, `DISASTER ${D.j + 1}: ${NAMES[D.kind]}  ${Math.ceil((D.t1 - tp) * TICK)}S`, KIND_C[D.kind] ?? C.ORANGE);
      ctx.right(4, TIPS[D.kind], C.GREY);
    } else {
      const nx = nextAt(s, tp);
      ctx.right(3, nx ? `CALM  SOMETHING COMES IN ${Math.ceil((nx.t0 - tp) * TICK)}S` : 'HOLD ON', C.GREY);
      if (s.dis.length && tp > s.dis[0].t1) ctx.right(4, 'THE ISLAND IS CRUMBLING  GET IN', C.ORANGE);
    }
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out || me.falling || !D || tp < D.call) return;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    const x = me.pos[0], z = me.pos[2];
    const breath = me.m & 0xfff;
    if (D.kind === MC.ND_FLOOD && breath > 0) {
      const left = Math.max(0, 1 - breath / MC.ND_BREATH), n = 12, k = Math.round(left * n);
      ctx.centre(row, `BREATH ${'#'.repeat(k)}${'-'.repeat(n - k)}`, left < 0.4 ? C.RED : C.CYAN);
    } else if (D.kind === MC.ND_METEOR || D.kind === MC.ND_LIGHTNING) {
      const [e0, e1] = span(s, tp, tp + MC.ND_MWARN);
      let soon = Infinity;
      for (let e = e0; e < e1; e++) if (s.et[e] >= tp && s.et[e] - warnOf(s, e) <= tp && Math.hypot(x - s.ex[e], z - s.ez[e]) < s.er[e] + RB) soon = Math.min(soon, (s.et[e] - tp) * TICK);
      if (soon < 9) ctx.centre(row, `${D.kind === MC.ND_LIGHTNING ? 'LIGHTNING' : 'METEOR'} ON YOU  MOVE!  ${soon.toFixed(1)}`, soon < 0.6 ? C.RED : C.ORANGE);
    } else if (D.kind === MC.ND_TORNADO && tp >= D.t0) {
      const [fx, fz] = funnelAt(D, tp), dd = Math.hypot(x - fx, z - fz);
      if (dd < D.rp) ctx.centre(row, `THE FUNNEL IS PULLING YOU  ${dd.toFixed(0)} M`, dd < D.rp / 2 ? C.RED : C.ORANGE);
    } else if (D.kind === MC.ND_TSUNAMI) {
      const [al] = alongAcross(s, D, x, z);
      let eta = Infinity;
      for (const [front] of frontsAt(D, tp)) if (front < al) eta = Math.min(eta, (al - front) / D.c);
      if (inLee(s, D, tp, x, z) || me.pos[1] >= PLAT_Y + D.h - MC.ND_WFREE) ctx.centre(row, 'SHELTERED', C.GREEN);
      else if (eta < 4) ctx.centre(row, `WAVE IN ${eta.toFixed(1)}  HIDE!`, eta < 1.5 ? C.RED : C.ORANGE);
    } else if (D.kind === MC.ND_QUAKE) {
      if (D.fis.some((F) => tp >= F.open - MC.ND_QWARN && onFissure(F, x, z, D.w + 1))) ctx.centre(row, 'A CRACK IS OPENING UNDER YOU  MOVE!', C.RED);
    }
  },

  brain: {
    danger(view, x, z, tick, me) { return danger(view, x, z, tick, slotOf(me), typeof me === 'object' ? me : null); },

    // Where to be for the disaster called: a refuge out of the flood, the lee
    // of a house from the tsunami, the far side from the funnel, off the
    // cracks, off the roofs in lightning; in a calm, in from the rim. Kept in
    // bot.mem a moment.
    goal(view, me, bot) {
      const w = world(view);
      const { g, s } = w;
      const slot = slotOf(me);
      if (g.state !== L.H_PLAY || slot < 0 || !(s.rad > 0)) return null;
      const b = typeof me === 'number' ? view.partier(me) : me;
      const x0 = bot?.pos?.[0] ?? b.pos[0], z0 = bot?.pos?.[1] ?? b.pos[2];
      const mem = bot?.mem || {};
      const tp = w.tp, D = w.D, rim = w.rim;
      const home = () => {
        // a spot of its own, the crowd spread as it started over the island as it stands
        const n = Math.max(1, g.n0), k = slot % n;
        const a = k * 2.39996, r = Math.max(0, rim - 4) * 0.8 * Math.sqrt((k + 0.5) / n);
        return [s.cx + Math.cos(a) * r, s.cx + Math.sin(a) * r];
      };
      mem.climb = null;
      CLIMB[slot] = null;
      if (!D) return home();
      switch (D.kind) {
        case MC.ND_FLOOD: {
          const R = refuge(view, s, D, b, x0, z0, slot);
          if (!R) return home();
          if (R.O) { mem.climb = R.then ? Object.assign(Object.create(R.O), { then: R.then }) : R.O; CLIMB[slot] = [R.O, R.then]; }
          return [R.x, R.z];
        }
        case MC.ND_TORNADO: {
          const [fx, fz] = funnelAt(D, Math.max(D.t0, tp + 60));
          const dx = s.cx - fx, dz = s.cx - fz, dd = Math.hypot(dx, dz) || 1;
          return inside(s, s.cx + (dx / dd) * rim * 0.45, s.cx + (dz / dd) * rim * 0.45, rim, 6);
        }
        case MC.ND_TSUNAMI: {
          // the lee nearest it, if it gets there before the next wave; else upstream
          const [al0] = alongAcross(s, D, x0, z0);
          let next = Infinity;
          for (const [front] of frontsAt(D, tp)) if (front < al0) next = Math.min(next, (al0 - front) / D.c);
          let best = null, bd = Infinity;
          for (const O of s.obs) {
            if (tp >= O.drop) continue;
            const { ea, eb, oa, ob } = leeOf(s, D, O);
            if (eb - MC.ND_WIN < 0.4) continue;
            const al = oa + ea + 1.6;
            const x = s.cx + D.dx * al - D.dz * ob, z = s.cx + D.dz * al + D.dx * ob;
            if (Math.hypot(x - s.cx, z - s.cx) > rim - 3) continue;
            const dd = Math.hypot(x - x0, z - z0) + (O.kind === MC.ND_CRATE ? 3 : 0);
            if (dd < bd && dd / 6 < next + 0.5) { bd = dd; best = [x, z]; }
          }
          if (best) return best;
          return inside(s, s.cx - D.dx * rim * 0.5, s.cx - D.dz * rim * 0.5, rim, 4);
        }
        case MC.ND_LIGHTNING: {
          const [top, on] = surfaceAt(view, s, x0, z0, tp);
          if (on) return inside(s, on.x + (x0 - on.x) * 3 + 0.01, on.z + (z0 - on.z) * 3, rim, 4);
          return home();
        }
        case MC.ND_QUAKE: {
          const near = (x, z) => D.fis.some((F) => tp >= F.open - MC.ND_QWARN && onFissure(F, x, z, D.w + 2.5));
          if (mem.q && !near(mem.q[0], mem.q[1]) && Math.hypot(mem.q[0] - s.cx, mem.q[1] - s.cx) < rim - 7) return mem.q;
          let best = home();
          for (let k = 0; k < 16 && near(best[0], best[1]); k++) {
            const a = k * 2.39996 + slot, r = rim * 0.55 * Math.sqrt((k + 0.5) / 16);
            best = [s.cx + Math.cos(a) * r, s.cx + Math.sin(a) * r];
          }
          mem.q = best;
          return best;
        }
        default:
          return home();
      }
    },

    // a flood's refuge to climb onto: the word outright
    think(view, me, bot) {
      if (!bot?.mem?.climb || typeof me !== 'object') return null;
      return climb(view, me, bot);
    },

    // over a crack in its way
    hop(view, me, bot) {
      const b = typeof me === 'number' ? view.partier(me) : me;
      if (!b || !b.ground || b.out || b.falling) return false;
      const w = world(view);
      const { g } = w;
      if (g.state !== L.H_PLAY) return false;
      const x0 = bot?.pos?.[0] ?? b.pos[0], z0 = bot?.pos?.[1] ?? b.pos[2];
      const vx = bot?.vel?.[0] ?? b.vel[0], vz = bot?.vel?.[1] ?? b.vel[2];
      const sp = Math.hypot(vx, vz);
      const D = w.D;
      if (D && D.kind === MC.ND_QUAKE && sp > 2) {
        const ux = vx / sp, uz = vz / sp;
        for (const F of D.fis) {
          if (w.tp < F.open - 40) continue;
          if (onFissure(F, x0, z0, D.w + 0.2)) continue;
          if (onFissure(F, x0 + ux * (D.w + 1.4), z0 + uz * (D.w + 1.4), D.w + 0.3)) return true;
        }
      }
      return false;
    },
  },
};
