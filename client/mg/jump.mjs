// LONG JUMP, as drawn and as the AI ball sees it. Running-track runways side
// by side on stilts over the water: a start deck, the slope with its boost
// pads lit left and right, the white take-off board with its hop zone
// striped and the edge's red line; out on the water each runway's five sand
// islands, ringed green near to gold far, with a line across the water every
// 5 m (a bold one and a row of buoys every 10: one buoy a ten) and a flag
// where each ball's best landed. A windsock by every board fills the way the
// wind blows, and a ghost of it shows the wind it is turning into.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/jump.mjs'; // LJ_*: the minigame's own constants
import { PLAT_Y, hash32 } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const f = Math.fround;
const N = (k) => f(Number(L.BPHYS[k]));
const HB = PLAT_Y + MC.LJ_BH; // the board's top
const HT = HB + MC.LJ_RISE; // the deck's
const SEA = PLAT_Y - MC.LJ_SEA; // the water's surface
const PITCHA = Math.atan(MC.LJ_RISE / MC.LJ_SLOPE); // the slope's angle
const NSEG = 8, SEG = MC.LJ_SLOPE / NSEG; // the slope is drawn in lengths
const TRACK = [0.72, 0.26, 0.2];
const LINE = [0.95, 0.94, 0.9];
const BOARD = [0.93, 0.92, 0.86];
const SAND = [0.93, 0.82, 0.56];
const WET = [0.62, 0.52, 0.36];
const STEEL = [0.5, 0.53, 0.58];
const WATER = [0.05, 0.36, 0.58];
// the islands' rings, near to far
const RANK = [[0.35, 0.85, 0.4], [0.3, 0.8, 0.9], [0.45, 0.5, 1], [0.95, 0.45, 0.85], [1, 0.8, 0.25]];
const slotColor = (s) => { const h = (s * 0.618034) % 1; return [0, 0.33, 0.67].map((o) => 0.55 + 0.4 * Math.cos(6.2832 * (h + o))); };

// ---- what the sim keeps, read

// The stage on the view's bank (null before a round of it is laid out).
export function stage(view) {
  const dv = view.dv, o = view.bank || 0, h = (k) => dv.getFloat32(L.PG_H + k + o, true);
  const nl = dv.getUint32(L.PG_H + MC.LJ_NL + o, true);
  if (!nl || nl > MC.LJ_NLMAX) return null;
  const isl = Array.from({ length: MC.LJ_NI }, (_, i) => ({ i, d: h(MC.LJ_ISL + 8 * i), r: h(MC.LJ_ISL + 8 * i + 4) }));
  return { nl, xa: h(MC.LJ_XA), xs: h(MC.LJ_XS), xb: h(MC.LJ_XB), xe: h(MC.LJ_XE), zl: h(MC.LJ_ZL), isl, cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Runway l's middle, z, as $lj_zc works it.
export const laneZ = (s, l) => f(f(f(l) * f(MC.LJ_PITCH)) + f(s.zl + f(MC.LJ_PITCH / 2)));
// The runway whose strip holds z and z less its middle, as $lj_lane.
export function laneAt(s, z) {
  let l = Math.trunc(Math.floor(f(f(z - s.zl) / f(MC.LJ_PITCH))));
  if (l >= s.nl) l = s.nl - 1;
  if (l < 0) l = 0;
  return [l, f(z - laneZ(s, l))];
}
// The runway's top at x ($lj_top).
export function topAt(s, x) {
  const d = f(x - s.xs);
  if (d <= 0) return f(HT);
  if (d >= MC.LJ_SLOPE) return f(HB);
  return f(f(d * f(-MC.LJ_RISE / MC.LJ_SLOPE)) + f(HT));
}
// Pad i of runway l: its middle [x, u across] (left then right, the other way round on every other runway).
export const padAt = (s, l, i) => [s.xs + MC.LJ_PAD0 + i * MC.LJ_PADGAP, ((i + l) & 1 ? 1 : -1) * MC.LJ_PADU];
// A hop's lift made d short of the edge ($lj_push).
export const liftAt = (d) => f(f(d * f((MC.LJ_LIFT0 - MC.LJ_LIFT1) / MC.LJ_HOPZ)) + f(MC.LJ_LIFT1));
// The island under a point d past the edge and u off its runway's middle, or -1 ($lj_isle).
export function isleAt(s, d, u) {
  for (const k of s.isl) if (f(f(f(d - k.d) * f(d - k.d)) + f(u * u)) <= f(k.r * k.r)) return k.i;
  return -1;
}
// The wind's level in segment k (-LJ_WMAX to LJ_WMAX), and the wind on tick t into play, m/s^2 ($lj_wind).
export function level(view, k) {
  const dv = view.dv, o = view.bank || 0;
  return hash32(dv.getUint32(L.HDR_SEED + o, true), dv.getUint32(L.HDR_HOLE + o, true), (MC.LJ_KWIND + k) | 0) % (2 * MC.LJ_WMAX + 1) - MC.LJ_WMAX;
}
export function windAt(view, t) {
  if (t < 0) t = 0;
  const k = Math.floor(t / MC.LJ_WSEG), fr = (t % MC.LJ_WSEG) - (MC.LJ_WSEG - MC.LJ_WTURN);
  const a = f(level(view, k) * f(MC.LJ_WSTEP));
  if (fr <= 0) return a;
  const b = f(level(view, k + 1) * f(MC.LJ_WSTEP));
  return f(f(f(b - a) * f(fr * f(1 / MC.LJ_WTURN))) + a);
}
// A ball's PG_M.
export const jumper = (m) => ({ st: m & MC.LJ_M_ST, foul: !!(m & MC.LJ_M_FOUL), n: (m >>> MC.LJ_M_N) & 63, last: ((m >>> MC.LJ_M_LAST) & MC.LJ_CMMAX) / 100 });
// Slot p's record (PG_S, the confirmed world's).
export function slotOf(view, p) {
  const a = L.PG_S + MC.LJ_SLOTS + p * MC.LJ_SSIZE, dv = view.dv;
  return { bx: dv.getFloat32(a + MC.LJ_S_BX, true), bz: dv.getFloat32(a + MC.LJ_S_BZ, true), jumps: dv.getUint16(a + MC.LJ_S_JUMPS, true),
    fouls: dv.getUint16(a + MC.LJ_S_FOULS, true), best: dv.getUint16(a + MC.LJ_S_BEST, true) / 100 };
}

// A ball off the board, in the air on tick t into play (the tick its hop was
// made, or it crossed the edge), d past the edge (under 0: short of it),
// going vx along the runway and vy up, the forward key held (wx 1) or not:
// flown on a tick at a time as $b_move and $lj_push fly it, to the tick its
// bottom is down at the islands' tops. How far past the edge it is then, m,
// and the ticks it took.
export function fly(view, t, d, vx, vy, wx = 1) {
  const AIR = f(N('B_AIR_DT') * wx), DRAG = N('B_AIR_DRAG'), G = f(Number(L.PHYS.GP_DT)), DT = f(TICK);
  let x = f(d), y = f(MC.LJ_BH), n = 0;
  vx = f(vx); vy = f(vy);
  while (n < 600) {
    n++;
    vx = f(AIR + f(vx * DRAG));
    vy = f(vy - G);
    x = f(f(vx * DT) + x);
    y = f(f(vy * DT) + y);
    if (y <= 0) break;
    vx = f(f(windAt(view, t + n) * DT) + vx);
  }
  return [x, n];
}

// ---- the AI ball

const ERR = 2; // m its hop falls early or late of its mark, at no skill

// Its word. Held in the sand or the sea: nothing. In the air: the forward
// key, eased back over its runway's line. On the deck: it goes when the wind
// it would take off into (the one blowing, or the one the sock's ghost
// shows) is no headwind, the better balls waiting up to 3 s for it. Down the
// slope: its line by skill, the best weaving pad to pad, the middling down
// one side through every other pad, the rest straight on. On the board: the
// farthest island it trusts itself to hit (smaller ones the better it is)
// that a hop somewhere in the zone reaches, and the hop where a flight
// worked from its speed and the wind comes down on that island's middle,
// made up to ERR early or late at no skill; with none in reach, no hop if
// rolling off lands on sand, else the hop that comes nearest one.
function think(view, me, bot, tick) {
  const s = stage(view);
  if (!s || !me || !me.live || me.out) return null;
  const g = view.party();
  if (g.state !== L.H_PLAY) return null;
  const mem = bot?.mem || {};
  const skill = bot?.skill ?? 0.6;
  const lag = bot?.lag || 0;
  const j = jumper(me.m);
  if (j.st >= MC.LJ_SAND) { mem.go = mem.plan = null; mem.wait = 0; mem.err = undefined; return { yaw: 0, move: 0 }; }
  // where it is as its word lands: the runway keeps a ball's speed along it
  const x = me.pos[0] + me.vel[0] * TICK * lag, z = bot?.pos?.[1] ?? me.pos[2], vx = me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  const [l, u] = laneAt(s, z);
  const t = ((tick ?? view.tick) - g.start) | 0;
  if (j.st === MC.LJ_FLY) return { yaw: Math.atan2(Math.max(-0.5, Math.min(0.5, -u * 0.3 - vz * 0.3)), 1), move: 1 };
  if (mem.err === undefined) mem.err = bot?.rand ? (bot.rand() - 0.5) * 2 * ERR * (1 - skill) : 0;
  if (x < s.xs - 0.5 && !mem.go) {
    // the wind 4.5 s on, about when it would be in the air
    const w = windAt(view, t + 560);
    mem.wait = (mem.wait || 0) + 1;
    if (w > (skill > 0.7 ? 1 : -1) || skill < 0.5 || mem.wait > 110 * skill) mem.go = true;
    else return { yaw: 0, move: 0 };
  }
  if (x < s.xb) {
    // the line: the pad ahead's inner half, or one side, or where it is
    const i = Math.max(0, Math.ceil((x - s.xs - MC.LJ_PAD0 - MC.LJ_PADL) / MC.LJ_PADGAP));
    let tu = u;
    if (skill >= 0.62) tu = i < MC.LJ_NPAD ? Math.sign(padAt(s, l, i)[1]) * 1.0 : 0;
    else if (skill >= 0.42) tu = (me.slot & 1 ? 1 : -1) * MC.LJ_PADU;
    const a = Math.max(-3, Math.min(3, (tu - u) * 3 - vz * 0.8));
    return { yaw: Math.atan2(a, 1), move: 1 };
  }
  mem.go = null;
  // on the board
  const d = s.xe - x;
  const v = vx;
  const at = (hop) => t + Math.round(Math.max(0, d - hop) / Math.max(5, v) / TICK);
  const land = (hop) => fly(view, at(hop), -hop, v, liftAt(hop))[0];
  if (!mem.plan || mem.plan.n !== j.n) {
    const far = land(0), near = land(MC.LJ_HOPZ), none = fly(view, at(0), 0, v, 0)[0];
    const rmin = 0.8 + 1.2 * (1 - skill);
    let hop = -1, want = null;
    for (let k = MC.LJ_NI - 1; k >= 0 && !want; k--) {
      const isl = s.isl[k];
      if (isl.r >= rmin && far >= isl.d - (0.3 + 0.5 * skill) * isl.r && near <= isl.d) want = isl;
    }
    if (want) {
      // the hop that comes down on its middle: later is longer
      let lo = 0, hi = MC.LJ_HOPZ;
      for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; if (land(mid) > want.d) lo = mid; else hi = mid; }
      hop = Math.max((lo + hi) / 2, v * TICK * 2.2);
    } else if (isleAt(s, none, 0) < 0) {
      // rolling off is a splash: the ends of the zone, whichever is nearer sand
      const off = (p) => Math.min(...s.isl.map((k) => Math.max(0, Math.abs(p - k.d) - k.r)));
      hop = off(far) <= off(near) ? v * TICK * 2.2 : MC.LJ_HOPZ;
    }
    mem.plan = { n: j.n, hop: hop < 0 ? hop : Math.max(v * TICK * 2.2, Math.min(MC.LJ_HOPZ, hop + mem.err)) };
  }
  // its word stands four ticks: the hop on the think nearest its mark
  const hop = mem.plan.hop >= 0 && d <= mem.plan.hop + Math.max(0, vx) * TICK * 2;
  return { yaw: Math.atan2(Math.max(-0.4, Math.min(0.4, -u * 0.3 - vz * 0.3)), 1), move: 1, hop };
}

// ---- drawing

// A box lying on the slope: its middle sx down the slope from its top and u
// off runway zc's middle, up off the surface by lift, hl half long down the
// slope, hw half wide.
function onSlope(sc, s, zc, sx, u, lift, hl, hw, hy, rgb, look, a = 0, b = 0, alpha = 1, seed) {
  const x = s.xs + sx;
  sc.box(x, HT - sx * MC.LJ_RISE / MC.LJ_SLOPE + (lift - hy) * Math.cos(PITCHA), zc + u, hw, hy, hl / Math.cos(PITCHA), Math.PI / 2, ...rgb, look, a, b, alpha, seed, -PITCHA);
}

// A windsock on a pole at (x, z), its hoop at y, filled by wind w (m/s^2,
// over 0 down the runway): four hoops tapering the way it blows, hanging
// when it is still; faint, the wind to come.
function sock(sc, x, y, z, w, alpha = 1, seed = 0) {
  const k = Math.min(1, Math.abs(w) / (MC.LJ_WMAX * MC.LJ_WSTEP)), dir = w < 0 ? -1 : 1;
  const droop = (1 - k) * 1.2;
  for (let i = 0; i < 4; i++) {
    const a = droop * (i + 0.5) / 4;
    const cx = x + dir * (0.35 + i * 0.62) * Math.cos(a), cy = y - (0.35 + i * 0.62) * Math.sin(a) - 0.1 * i * (1 - k);
    sc.cyl(cx, cy, z, 0.42 - i * 0.07, 0.31, ...(i & 1 ? [0.96, 0.96, 0.94] : [1, 0.45, 0.1]), LOOK.PLASTIC, 0, 0, alpha, seed + i, Math.PI / 2 - dir * a, -Math.PI / 2);
  }
}

const dist = (m) => m.toFixed(2);

export default {
  id: L.MG_JUMP, key: 'jump', name: 'LONG JUMP',
  hint: 'TAKE THE PADS  HOP LATE ON THE BOARD  LAND ON SAND  BEST JUMP WINS',
  rules: 'THE SEA IS A FOUL  THE WIND CARRIES YOU OR HOLDS YOU BACK  GO AGAIN',
  env: 'day',

  draw(view, ctx, out) {
    const s = stage(view);
    if (!s) return;
    const g = view.party();
    const sc = out.scene;
    const now = ctx?.now ?? 0;
    const ptick = typeof ctx?.ptick === 'number' ? ctx.ptick : g.tick + (ctx?.dt || 0) / TICK;
    const tp = g.state >= L.H_PLAY ? Math.max(0, ptick - g.start) : 0;
    const W = s.nl * MC.LJ_PITCH, zm = s.zl + W / 2;
    const far = s.isl[MC.LJ_NI - 1].d + s.isl[MC.LJ_NI - 1].r;
    const w = windAt(view, Math.floor(tp));
    const seg = Math.floor(tp / MC.LJ_WSEG);
    const next = level(view, seg + 1) * MC.LJ_WSTEP, turning = tp % MC.LJ_WSEG >= MC.LJ_WSEG - MC.LJ_WTURN - 250;
    // the water under it all
    sc.box((s.xa + s.xe + far) / 2, SEA - 1.6, zm, (s.xe + far - s.xa) / 2 + 160, 1.6, W / 2 + 160, 0, ...WATER, LOOK.PLASTIC, 0, 0, 1, 7);
    for (let l = 0; l < s.nl; l++) {
      const zc = laneZ(s, l);
      // the deck, the slope, the board; their edges lined, a rail either side
      sc.box((s.xa + s.xs) / 2, HT - 0.3, zc, MC.LJ_TOP / 2, 0.3, MC.LJ_HW, 0, ...TRACK, LOOK.RUBBER, 0, 0, 1, l);
      // (the slope in lengths: the renderer culls a solid by its middle)
      for (let k = 0; k < NSEG; k++) onSlope(sc, s, zc, (k + 0.5) * SEG, 0, 0, SEG / 2, MC.LJ_HW, 0.3, TRACK, LOOK.RUBBER, 0, 0, 1, l * 8 + k);
      sc.box((s.xb + s.xe) / 2, HB - 0.3, zc, MC.LJ_BOARD / 2, 0.3, MC.LJ_HW, 0, ...BOARD, LOOK.WOOD, 0, 0, 1, l);
      sc.box(s.xa - 0.2, HT + 0.4, zc, 0.2, 0.7, MC.LJ_HW + 0.2, 0, ...STEEL, LOOK.METAL);
      for (const e of [-1, 1]) {
        const zr = e * (MC.LJ_HW + 0.1);
        sc.box((s.xa + s.xs) / 2, HT + 0.25, zc + zr, MC.LJ_TOP / 2, 0.25, 0.1, 0, ...LINE, LOOK.PLASTIC);
        for (let k = 0; k < NSEG; k++) {
          onSlope(sc, s, zc, (k + 0.5) * SEG, zr, 0.5, SEG / 2, 0.1, 0.25, LINE, LOOK.PLASTIC);
          onSlope(sc, s, zc, (k + 0.5) * SEG, e * (MC.LJ_HW - 0.35), 0.012, SEG / 2, 0.06, 0.006, LINE, LOOK.MATTE);
        }
        sc.box((s.xb + s.xe) / 2, HB + 0.25, zc + zr, MC.LJ_BOARD / 2, 0.25, 0.1, 0, ...LINE, LOOK.PLASTIC);
      }
      // the stilts
      for (const [x, top] of [[s.xa + 1.5, HT - 0.6], [s.xs + MC.LJ_SLOPE / 3, topAt(s, s.xs + MC.LJ_SLOPE / 3) - 0.7], [s.xs + 2 * MC.LJ_SLOPE / 3, topAt(s, s.xs + 2 * MC.LJ_SLOPE / 3) - 0.7], [s.xe - 2.5, HB - 0.6]])
        for (const e of [-1, 1]) sc.cyl(x, (top + SEA - 1) / 2, zc + e * (MC.LJ_HW - 0.8), 0.28, (top - SEA + 1) / 2, ...STEEL, LOOK.METAL);
      // the pads: lit, their chevrons running down the slope
      for (let i = 0; i < MC.LJ_NPAD; i++) {
        const [px, pu] = padAt(s, l, i), sx = px - s.xs;
        onSlope(sc, s, zc, sx, pu, 0.03, MC.LJ_PADL, MC.LJ_PADW, 0.015, [0.15, 0.9, 0.75], LOOK.GLOW, 0.55, 0, 1, l * 8 + i);
        for (let c = 0; c < 3; c++) {
          const run = ((now / 260 + c) % 3) / 3;
          onSlope(sc, s, zc, sx - MC.LJ_PADL + 0.5 + run * (2 * MC.LJ_PADL - 1), pu, 0.05, 0.14, MC.LJ_PADW - 0.25, 0.008, [1, 1, 0.8], LOOK.GLOW, 1.3, 0, 0.9, c);
        }
      }
      // the hop zone: stripes closing up to the edge, and the edge's red line
      for (let i = 0; i < 5; i++) {
        const dz = MC.LJ_HOPZ * (1 - i / 5) ** 1.4;
        sc.box(s.xe - dz, HB + 0.006, zc, 0.07 + 0.02 * i, 0.006, MC.LJ_HW - 0.5, 0, 0.2, 0.25, 0.3, LOOK.MATTE);
      }
      sc.box(s.xe - 0.22, HB + 0.012, zc, 0.22, 0.012, MC.LJ_HW - 0.1, 0, 0.95, 0.15, 0.12, LOOK.GLOW, 0.5 + 0.25 * Math.sin(now / 140));
      // the islands: sand on a wet skirt, ringed by how far out they are
      for (const k of s.isl) {
        const x = s.xe + k.d;
        sc.cyl(x, PLAT_Y - 0.5, zc, k.r, 0.5, ...SAND, LOOK.MATTE, 0, 0, 1, l * 8 + k.i);
        sc.cyl(x, SEA - 0.55, zc, k.r + 0.45, 0.6, ...WET, LOOK.MATTE, 0, 0, 1, l * 8 + k.i);
        out.decals.push({ pos: [x, PLAT_Y + 0.02, zc], radius: k.r, width: 0.22, color: [...RANK[k.i], 0.85], kind: DECAL.RING });
      }
      // a line across the water every 5 m, bold every 10 with a buoy a ten
      for (let m = 5; m <= far + 2; m += 5) {
        const ten = m % 10 === 0;
        sc.box(s.xe + m, SEA + 0.01, zc, ten ? 0.09 : 0.04, 0.01, MC.LJ_PITCH / 2 - (ten ? 0.2 : 1.2), 0, 1, 1, 1, LOOK.GLOW, ten ? 0.8 : 0.4, 0, ten ? 0.9 : 0.6);
        if (ten) for (let b = 0; b < m / 10; b++) sc.sphere(s.xe + m, SEA + 0.12, zc - MC.LJ_PITCH / 2 + 0.5 + b * 0.75, 0.3, 1, 0.5, 0.1, LOOK.PLASTIC, 0, 0, 1, m + b);
      }
      // the windsock by the board, and faint over it the wind it is turning into
      const zs = zc + MC.LJ_HW + 0.7;
      sc.cyl(s.xe - 1.5, HB + 2.4, zs, 0.07, 2.6, ...STEEL, LOOK.METAL);
      sock(sc, s.xe - 1.5, HB + 4.7, zs, w, 1, l * 4);
      if (turning && Math.abs(next - w) > 0.3) sock(sc, s.xe - 1.5, HB + 6.2, zs, next, 0.4, l * 4 + 64);
    }
    // a flag where each ball's best landed
    for (let p = 0; p < L.NPLAYER; p++) {
      if (!(view.u8[L.PLAYERS + p * L.PSIZE + L.P_FL] & L.PF_LIVE)) continue;
      const r = slotOf(view, p);
      if (!(r.best > 0)) continue;
      const col = slotColor(p), mine = p === ctx?.slot;
      const hgt = mine ? 1.5 : 1;
      sc.cyl(r.bx, PLAT_Y + hgt / 2, r.bz, 0.05, hgt / 2, 0.9, 0.9, 0.9, LOOK.METAL, 0, 0, 1, p);
      sc.box(r.bx, PLAT_Y + hgt - 0.18, r.bz + 0.3, 0.03, 0.18, 0.3, 0, ...col, mine ? LOOK.GLOW : LOOK.PLASTIC, mine ? 0.7 : 0, 0, 1, p);
    }
  },

  // every runway, the deck to the last island
  frame(view) {
    const s = stage(view), g = view.party();
    if (!s) return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size, shape: 'square' };
    const x1 = s.xe + s.isl[MC.LJ_NI - 1].d + s.isl[MC.LJ_NI - 1].r;
    return { centre: [(s.xa + x1) / 2, PLAT_Y + MC.LJ_BH, s.zl + s.nl * MC.LJ_PITCH / 2], radius: Math.max(x1 - s.xa, s.nl * MC.LJ_PITCH) / 2 + 2, shape: 'square' };
  },

  // a new round faces you down your runway
  facing() { return 0; },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    const mine = fx.owner === ctx.slot && ctx.slot >= 0;
    if (fx.kind === MC.LJ_FX_OFF) {
      if (fx.shot && (mine || d < 40)) ctx.sound?.boing?.(fx.shot / 8, mine ? 0 : d);
      if (fx.shot && d < 60) ctx.glow?.({ pos: fx.pos, size: 0.6 + fx.shot / 60, color: [1, 1, 0.9, 0.7], kind: SPRITE.FLASH, life: 180 });
    } else if (fx.kind === MC.LJ_FX_LAND) {
      const best = !!(fx.shot & 16), k = fx.shot & 15;
      ctx.glow?.({ pos: fx.pos, size: 2.2, color: [...SAND, 0.8], kind: SPRITE.FLASH, life: 320 });
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.5, fx.pos[2]], size: 1.6, color: [...(RANK[k] || SAND), 0.8], kind: SPRITE.SPARK, life: 420 });
      if (mine || d < 50) ctx.sound?.land?.(mine ? 14 : 8);
      if (mine) {
        ctx.banner?.(`${dist(fx.size)} M${best ? '  YOUR BEST' : ''}`, best ? C.GREEN : C.WHITE, 1300);
        if (best) ctx.sound?.pickup?.();
      }
      if (best && k >= 2) ctx.feed?.(`${name(fx.owner)} JUMPED ${dist(fx.size)} M`, mine ? C.GREEN : k >= 3 ? C.YELLOW : C.WHITE);
    } else if (fx.kind === MC.LJ_FX_SPLASH) {
      ctx.glow?.({ pos: fx.pos, size: 2.4, color: [0.8, 0.93, 1, 0.8], kind: SPRITE.FLASH, life: 300 });
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.6, fx.pos[2]], size: 1.8, color: [0.85, 0.95, 1, 0.7], kind: SPRITE.SPARK, life: 420 });
      if (mine || d < 40) ctx.sound?.sink?.(mine ? 6 : d + 10);
      if (mine) ctx.banner?.(`SPLASH AT ${dist(Math.max(0, fx.size))} M  NO JUMP`, C.GREY, 1100);
    } else if (fx.kind === MC.LJ_FX_WIND) {
      const lv = fx.shot - MC.LJ_WMAX;
      ctx.sound?.tick?.();
      ctx.feed?.(lv > 0 ? `TAILWIND ${lv} COMING` : lv < 0 ? `HEADWIND ${-lv} COMING` : 'THE WIND DROPS', lv > 0 ? C.GREEN : lv < 0 ? C.ORANGE : C.GREY);
    }
  },

  // the wind now and the one coming; your best, your last, your jumps
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const s = stage(view);
    if (!s) return;
    const w = windAt(view, g.t), lv = Math.round(w / MC.LJ_WSTEP);
    const arrows = lv > 0 ? '>'.repeat(lv) : lv < 0 ? '<'.repeat(-lv) : '-';
    ctx.right(2, lv > 0 ? `TAILWIND ${arrows}` : lv < 0 ? `${arrows} HEADWIND` : 'NO WIND -', lv > 0 ? C.GREEN : lv < 0 ? C.ORANGE : C.GREY);
    const left = MC.LJ_WSEG - MC.LJ_WTURN - (g.t % MC.LJ_WSEG), nx = level(view, Math.floor(g.t / MC.LJ_WSEG) + 1);
    ctx.right(3, `${nx > 0 ? `TAIL ${nx}` : nx < 0 ? `HEAD ${-nx}` : 'CALM'} ${left > 0 ? `IN ${Math.ceil(left * TICK)}` : 'NOW'}`, C.GREY);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    const j = jumper(me.m), so = slotOf(view, ctx.slot);
    ctx.right(4, `BEST ${me.score ? `${dist(me.score / 100)} M` : '-'}`, me.score ? C.YELLOW : C.GREY);
    if (j.n || so.jumps) ctx.right(5, j.foul ? `LAST SPLASH ${dist(j.last)}` : `LAST ${dist(j.last)} M`, j.foul ? C.GREY : C.WHITE);
    ctx.right(6, `JUMPS ${so.jumps}  FOULS ${so.fouls}`, C.GREY);
  },

  brain: {
    danger() { return 0; },
    // the board's edge on its runway
    goal(view, me) {
      const s = stage(view);
      if (!s || !me) return null;
      return [s.xe + 4, laneZ(s, laneAt(s, me.pos[2])[0])];
    },
    hop() { return false; },
    think,
  },
};
