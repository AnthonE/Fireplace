// STOMPIN GROUND, as drawn and as the AI ball sees it. The disc is square
// flagstones of grey slate in a checker, a darker core the rim never takes,
// standing on a column in the sea; flagstones the rim is about to take darken
// and shake, then drop away. The stompers are great brown boulders on two
// stubby legs with big flat feet, glaring out of two hot eyes under a brow:
// a charge drops out of the sky onto the rim where its path starts (a thud,
// dust, the floor round it shaking), stamps off along the glowing ribbon of
// its arc (bright where it gets within the second, dimmer within the next
// 1.5 s), feet swinging, dust at every footfall, and runs off the far rim
// into the sea. A leap bursts out of the sea far off, arcs high and slams
// down on its target ring, the shockwave a ring of flung-up rubble running
// out along the floor at ball height; it stands a moment, then leaps away.
// Every stomper is read from the sim's own schedule (src/mg/stomp.mjs's
// layout, in PG_BIG) and worked to the frame's tick on the prediction's
// clock, so a stomper is drawn where your ball meets it.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/stomp.mjs'; // SG_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const f = Math.fround;
const S = MC.SG_S;
const TICK = 0.008;
const RB = 1; // a ball's radius
const HH = 0.4; // a flagstone's half height, m
const DRAWN = 0.47; // a flagstone's drawn half side over the sim's side: a seam between them
const WARN = 375; // ticks before the rim takes a flagstone that it darkens (and shakes, the last 60)
const FALL = 1.5; // s a flagstone is drawn falling
const DROP = 55; // ticks a charge is drawn dropping onto its start
const DROPH = 34; // m over the floor it drops from
const SEA = 200; // ticks past its end a charge is drawn running off and falling into the sea
const LEAVE = 90; // ticks a leap is drawn leaping away after it stands
const QUAKE = 45; // ticks the floor shakes round a landing
const QUAKER = 9; // m round it the floor shakes
const HOT1 = 1, HOT2 = 2.5; // s: a path is bright where its stomper gets within HOT1, dimmer within HOT2
const SEG = 1.4; // m a piece of a drawn path or shockwave
const TURN = 2 * Math.PI / 16777216; // radians a 2^-24 turn
const SLATE = [[0.7, 0.73, 0.78], [0.6, 0.63, 0.69]];
const CORE = [[0.5, 0.55, 0.62], [0.43, 0.48, 0.56]];
const DOOM = [0.26, 0.22, 0.2];
const ROCK = [[0.52, 0.42, 0.33], [0.58, 0.47, 0.36], [0.46, 0.39, 0.33], [0.55, 0.44, 0.38]];
const FOOT = [0.3, 0.27, 0.25];
const PATH = [1, 0.22, 0.04];
const RUBBLE = [0.62, 0.52, 0.4];

const TILE0 = L.PG_BIG + MC.SG_TILES;
const REC0 = L.PG_BIG + MC.SG_RECS;

// ---- what the sim says: the rim, the flagstones, the stompers

// The rim on tick tp into play ($sg_rim, in doubles: for drawing and steering).
export function rimAt(r0, tp) {
  const k = tp - MC.SG_CRUMBLE;
  if (k <= 0) return r0;
  if (k >= MC.SG_SHRINK) return MC.SG_RMIN;
  return r0 - (r0 - MC.SG_RMIN) * (k / MC.SG_SHRINK);
}
// A cell's byte offset in the flagstones ($sg_cell), -1 off the grid.
export const cellOf = (q, r) => (q < -MC.SG_N || q >= MC.SG_N || r < -MC.SG_N || r >= MC.SG_N ? -1 : ((r + MC.SG_N) * MC.SG_W + q + MC.SG_N) * 2);
// The cell under (x, z), worked in f32 as $sg_ground works it.
export const cellAt = (x, z, cx) => cellOf(Math.floor(f(f(f(x) - f(cx)) / f(S))), Math.floor(f(f(f(z) - f(cx)) / f(S))));
// The tick into play the rim takes the flagstone at cell a (0 none, SG_NEVER never).
export const dropOf = (view, a) => (a < 0 ? 0 : view.dv.getUint16(TILE0 + a + (view.bank || 0), true));
// Does the flagstone at cell a hold tp ticks into play? As $sg_ground has it.
export const holds = (view, a, tp) => a >= 0 && tp < dropOf(view, a);

// The round's stage on the view's bank: its radius, centre, flagstones and
// the schedule's stompers (flat arrays by record), read once a round (and
// again when asked `again`). Setup lays it all from the seed, the round and
// the radius, so those and the header's count say when the countdown has
// laid it out again (for a crowd of another size).
let memo = null;
export function stage(view, again = false) {
  const dv = view.dv, o = view.bank || 0;
  const r0 = dv.getFloat32(L.PG_H + MC.SG_RAD + o, true), cx = dv.getFloat32(L.PG_CX + o, true);
  const seed = dv.getUint32(L.HDR_SEED + o, true), hole = dv.getUint32(L.HDR_HOLE + o, true);
  const ns = Math.min(dv.getUint32(L.PG_H + MC.SG_NS + o, true), MC.SG_NMAX);
  const m = memo;
  if (!again && m && m.r0 === r0 && m.cx === cx && m.seed === seed && m.hole === hole && m.ns === ns) return m;
  const s = {
    r0, cx, seed, hole, ns, tiles: [],
    tf: new Int32Array(ns), te: new Int32Array(ns), ox: new Float64Array(ns), oz: new Float64Array(ns), ra: new Float64Array(ns), rs: new Float64Array(ns),
    a0: new Int32Array(ns), w: new Int32Array(ns), v: new Float64Array(ns), lx: new Float64Array(ns), lz: new Float64Array(ns), n: new Uint8Array(ns),
    fl: new Uint8Array(ns), vol: new Uint16Array(ns), rw: new Float64Array(ns), lo: new Uint16Array(MC.SG_NB), hi: new Uint16Array(MC.SG_NB),
  };
  if (r0 > 0) {
    for (let r = -MC.SG_N; r < MC.SG_N; r++) for (let q = -MC.SG_N; q < MC.SG_N; q++) {
      const a = cellOf(q, r);
      const drop = dv.getUint16(TILE0 + a + o, true);
      if (!drop) continue;
      const x = cx + (q + 0.5) * S, z = cx + (r + 0.5) * S;
      const rho = Math.hypot(x - cx, z - cx);
      const rgb = (rho <= MC.SG_RMIN ? CORE : SLATE)[(q + r) & 1];
      s.tiles.push({ q, r, a, x, z, rho, drop, wob: ((q * 7 + r * 13) & 15) / 16, rgb });
    }
  }
  for (let k = 0; k < ns; k++) {
    const a = REC0 + k * MC.SG_REC + o;
    s.tf[k] = dv.getUint32(a, true); s.te[k] = dv.getUint32(a + 4, true);
    s.ox[k] = dv.getFloat32(a + 8, true); s.oz[k] = dv.getFloat32(a + 12, true);
    s.ra[k] = dv.getFloat32(a + 16, true); s.rs[k] = dv.getFloat32(a + 20, true);
    s.a0[k] = dv.getInt32(a + 24, true); s.w[k] = dv.getInt32(a + 28, true); s.v[k] = dv.getFloat32(a + 32, true);
    s.lx[k] = dv.getFloat32(a + 36, true); s.lz[k] = dv.getFloat32(a + 40, true);
    s.n[k] = dv.getUint32(a + 44, true); s.fl[k] = view.u8[a + 48]; s.vol[k] = dv.getUint16(a + 50, true); s.rw[k] = dv.getFloat32(a + 52, true);
  }
  for (let b = 0; b < MC.SG_NB; b++) { s.lo[b] = dv.getUint16(L.PG_BIG + MC.SG_LO + 2 * b + o, true); s.hi[b] = dv.getUint16(L.PG_BIG + MC.SG_HI + 2 * b + o, true); }
  memo = s;
  return s;
}
export const isLeap = (s, k) => (s.fl[k] & 1) === 1;
// The stompers whose records may matter from tick ta to tb into play: [k0, k1).
export function span(s, ta, tb) {
  const b0 = Math.max(0, Math.min(MC.SG_NB - 1, Math.floor(ta / MC.SG_BUCKET))), b1 = Math.max(0, Math.min(MC.SG_NB - 1, Math.floor(tb / MC.SG_BUCKET)));
  return [s.lo[b0], s.hi[b1]];
}
// Charge k on tick tp into play (fractional: drawn between ticks), as $sg_at
// has it: into out { x, z, hx, hz (its heading), th (its angle round its
// arc's centre, radians) }. Past its end it keeps on round its arc.
const AT = { x: 0, z: 0, hx: 1, hz: 0, th: 0 };
export function chargeAt(s, k, tp, out = AT) {
  const th = (s.a0[k] + s.w[k] * (tp - s.tf[k])) * TURN;
  const c = Math.cos(th), sn = Math.sin(th), sg = s.w[k] > 0 ? 1 : -1;
  out.x = s.ox[k] + s.ra[k] * c; out.z = s.oz[k] + s.ra[k] * sn;
  out.hx = -sg * sn; out.hz = sg * c; out.th = th;
  return out;
}
// How far a leap's shockwave front has run el ticks after it lands (m from its centre), or -1 once past its reach.
export function frontAt(s, k, el) {
  const r1 = s.rs[k] + MC.SG_VW * TICK * el;
  return el < 1 || r1 > s.rw[k] ? -1 : r1;
}
// The tick (HDR_TICK's count, fractional) to draw at, and ticks into play then; frozen where the round ended.
function clock(view, ctx) {
  const g = view.party();
  let now = ctx?.ptick ?? (g.tick + (ctx?.dt || 0) / TICK);
  if (g.state === L.H_OVER) now = Math.min(now, (g.until - L.P_OVER) | 0);
  const tp = g.state === L.H_PLAY || g.state === L.H_OVER ? Math.max(0, ((now - g.start) | 0) + (now % 1)) : -1;
  return { g, now, tp };
}
// The wave on now (or next) on tick tp into play: { vol, n, start (its first stomper's tick), gap (to the next), leaps } or null.
export function waveAt(s, tp) {
  let k = -1;
  for (let j = 0; j < s.ns; j++) if (s.fl[j] & 2) { if (s.tf[j] + MC.SG_STAG * (s.n[j] - 1) >= tp) { k = j; break; } }
  if (k < 0) return null;
  let next = -1, leaps = 0;
  for (let j = k; j < k + s.n[k] && j < s.ns; j++) if (isLeap(s, j)) leaps++;
  for (let j = k + 1; j < s.ns; j++) if (s.fl[j] & 2) { next = j; break; }
  return { vol: s.vol[k], n: s.n[k], start: s.tf[k], gap: next >= 0 ? s.tf[next] - s.tf[k] : 0, leaps };
}
// Where on its arc, ahead of it, a charge passes (x, z), as the AI ball and
// the HUD reckon it: { off (m from its arc's line), eta (s till its body
// gets there, from tick tp), pass (s till it's gone by) } or null if its arc
// never comes within reach or it's gone past.
const ETA = { off: 0, eta: 0, pass: 0 };
export function chargeEta(s, k, x, z, tp, reach, out = ETA) {
  const dx = x - s.ox[k], dz = z - s.oz[k];
  const off = Math.abs(Math.hypot(dx, dz) - s.ra[k]);
  if (off >= reach || tp >= s.te[k]) return null;
  const sg = s.w[k] > 0 ? 1 : -1;
  const t0 = Math.max(tp, s.tf[k]); // from where it is now, or sets off
  const th = (s.a0[k] + s.w[k] * (t0 - s.tf[k])) * TURN;
  const left = Math.abs(s.w[k] * (s.te[k] - t0)) * TURN; // radians round still to go
  const half = Math.sqrt(Math.max(0, reach * reach - off * off)) / s.ra[k]; // the angle round which its body covers the point
  let a = (Math.atan2(dz, dx) - th) * sg; // radians round, its way, to the point
  a -= 2 * Math.PI * Math.floor(a / (2 * Math.PI));
  if (a > 2 * Math.PI - half) a -= 2 * Math.PI;
  if (a - half > left || a + half < 0) return null; // its arc ends first, or it's gone by
  const wrad = Math.abs(s.w[k]) * TURN / TICK; // radians a second
  const pre = (t0 - tp) * TICK;
  out.off = off; out.eta = pre + Math.max(0, a - half) / wrad; out.pass = pre + (a + half) / wrad;
  return out;
}

// ---- drawing

const shade = (rgb, to, k) => [rgb[0] + (to[0] - rgb[0]) * k, rgb[1] + (to[1] - rgb[1]) * k, rgb[2] + (to[2] - rgb[2]) * k];
let lastStep = -1e9, lastThud = -1e9; // ms: the last footfall and landing heard
const PHASE = new Float64Array(MC.SG_NMAX); // each charge's gait phase at the last frame, for its footfalls

// A stomper's body at (x, y, z), its feet on the floor at fy, facing (hx, hz):
// a boulder on two stubby legs, a brow, two hot eyes. phase turns its gait
// (radians: a step each half turn), squash flattens it as it lands.
function stomper(sc, out, k, x, y, z, rs, hx, hz, phase, squash = 0, fy = PLAT_Y, alpha = 1) {
  const sx = -hz, sz = hx; // its right
  const rgb = ROCK[k & 3];
  const bob = Math.abs(Math.sin(phase)) * 0.07 * rs;
  const by = y + rs * (1.25 - 0.25 * squash) + bob;
  const yaw = Math.atan2(hz, hx);
  for (const side of [-1, 1]) {
    const sw = Math.sin(phase + (side > 0 ? 0 : Math.PI));
    const lift = Math.max(0, Math.cos(phase + (side > 0 ? 0 : Math.PI))) * 0.32 * rs;
    const fx = x + sx * side * rs * 0.5 + hx * sw * 0.42 * rs, fz = z + sz * side * rs * 0.5 + hz * sw * 0.42 * rs;
    const top = by - rs * 0.4, foot = fy + lift;
    const lx = (x + sx * side * rs * 0.5 + fx) / 2, lz = (z + sz * side * rs * 0.5 + fz) / 2;
    sc.cyl(lx, (top + foot) / 2, lz, rs * 0.24, Math.max(0.05, (top - foot) / 2), ...shade(rgb, FOOT, 0.4), LOOK.MATTE, 0, 0, alpha, k * 2 + (side > 0 ? 1 : 0));
    sc.box(fx + hx * rs * 0.12, foot + rs * 0.09, fz + hz * rs * 0.12, rs * 0.4, rs * 0.09, rs * 0.26, yaw, ...FOOT, LOOK.RUBBER, 0, 0, alpha);
  }
  sc.sphere(x, by, z, rs, ...rgb, LOOK.MATTE, 0, 0, alpha, k & 4095);
  // a lump or two of rock on its back, and the brow
  sc.sphere(x - hx * rs * 0.35 + sx * rs * 0.3, by + rs * 0.62, z - hz * rs * 0.35 + sz * rs * 0.3, rs * 0.42, ...shade(rgb, FOOT, 0.15), LOOK.MATTE, 0, 0, alpha, (k * 3) & 4095);
  sc.sphere(x - hx * rs * 0.5 - sx * rs * 0.35, by + rs * 0.45, z - hz * rs * 0.5 - sz * rs * 0.35, rs * 0.32, ...shade(rgb, FOOT, 0.25), LOOK.MATTE, 0, 0, alpha, (k * 5) & 4095);
  const ex = x + hx * rs * 0.86, ez = z + hz * rs * 0.86, ey = by + rs * 0.22;
  sc.box(ex - hx * rs * 0.06, ey + rs * 0.2, ez - hz * rs * 0.06, rs * 0.14, rs * 0.08, rs * 0.55, yaw, ...shade(rgb, FOOT, 0.6), LOOK.MATTE, 0, 0, alpha);
  for (const side of [-1, 1]) {
    sc.sphere(ex + sx * side * rs * 0.3, ey, ez + sz * side * rs * 0.3, rs * 0.12, 1, 0.55, 0.15, LOOK.GLOW, 1.6, 0.3, alpha);
  }
  out.casters?.push([x, by, z, -rs]);
}

// Dust thrown up at (x, z): a few soft grey puffs, by age u (0 to 1) and size.
function dust(out, x, z, u, size, seed = 0) {
  if (u < 0 || u >= 1) return;
  for (let i = 0; i < 4; i++) {
    const a = seed * 1.7 + i * 1.5708, d = size * (0.3 + 0.9 * u);
    out.glow.push({ pos: [x + Math.cos(a) * d, PLAT_Y + 0.3 + u * size * 0.4, z + Math.sin(a) * d], size: size * (0.6 + 0.8 * u), color: [0.78, 0.7, 0.58, 0.45 * (1 - u)], kind: SPRITE.FLASH, minpx: 2 });
  }
}

// Charge k on tick tp: its path (shown SG_TELE before it sets off, ahead of
// it as it goes, inside the rim as it stands), the drop onto its start, the
// body stamping along, falling into the sea past its end.
function charge(sc, out, s, k, tp, now, rim, ctx) {
  const tf = s.tf[k], te = s.te[k], rs = s.rs[k], ra = s.ra[k], v = s.v[k];
  const sg = s.w[k] > 0 ? 1 : -1;
  const wrad = Math.abs(s.w[k]) * TURN / TICK;
  // the path, by how soon its stomper gets to each piece of it
  if (tp < te) {
    const from = Math.max(tp, tf);
    const th0 = (s.a0[k] + s.w[k] * (from - tf)) * TURN, th1 = (s.a0[k] + s.w[k] * (te - tf)) * TURN;
    const span1 = Math.abs(th1 - th0) * ra;
    const n = Math.min(160, Math.ceil(span1 / SEG));
    const u = Math.max(0, Math.min(1, (tp - (tf - MC.SG_TELE)) / MC.SG_TELE));
    const pulse = tp < tf ? 0.75 + 0.25 * Math.sin(now * TICK * Math.PI * 2 * (1.5 + 4 * u)) : 1;
    const wait = Math.max(0, (tf - tp) * TICK);
    for (let i = 0; i < n; i++) {
      const a = th0 + (th1 - th0) * ((i + 0.5) / n);
      const x = s.ox[k] + ra * Math.cos(a), z = s.oz[k] + ra * Math.sin(a);
      if (Math.hypot(x - s.cx, z - s.cx) > rim + 0.3) continue;
      const eta = wait + Math.abs(a - th0) / wrad;
      const hot = eta < HOT1 ? 1 : eta < HOT2 ? 0.55 : 0.2 + 0.15 * u;
      const yaw = Math.atan2(sg * Math.cos(a), -sg * Math.sin(a));
      const len = (span1 / n) / 2 + 0.05;
      sc.box(x, PLAT_Y + 0.04, z, len, 0.025, rs, yaw, ...PATH, LOOK.GLOW, (0.6 + 1.1 * hot) * pulse, 0.25, 0.3 + 0.55 * hot);
      if (hot >= 0.55) sc.box(x, PLAT_Y + 0.05, z, len, 0.025, 0.14, yaw, 1, 0.75, 0.4, LOOK.GLOW, 1, 0, 0.5);
    }
  }
  // the body: dropping onto its start, charging, then off the rim into the sea
  if (tp < tf - DROP) return;
  const p = chargeAt(s, k, tf, P0);
  if (tp < tf) {
    const u = (tp - (tf - DROP)) / DROP, y = PLAT_Y + DROPH * (1 - u * u);
    stomper(sc, out, k, p.x, y, p.z, rs, p.hx, p.hz, 0, 0, y);
    out.decals?.push({ pos: [p.x, PLAT_Y + 0.06, p.z], radius: rs * (0.6 + 0.5 * u), width: rs * 0.5, color: [0.1, 0.08, 0.06, 0.25 + 0.4 * u], kind: DECAL.DISC });
    return;
  }
  const age = tp - tf;
  const phase = (age * TICK * v) / (rs * 1.1) * Math.PI;
  if (age < 40) dust(out, p.x, p.z, age / 40, rs * 1.6, k);
  const c = chargeAt(s, k, tp, P1);
  // past the rim as it stands now, it's going over: by how far, at its speed, how long since
  const over = Math.hypot(c.x - s.cx, c.z - s.cx) - (rim + rs * 0.4);
  if (over <= 0 && tp < te) {
    stomper(sc, out, k, c.x, PLAT_Y, c.z, rs, c.hx, c.hz, phase, age < 15 ? 1 - age / 15 : 0);
    // a footfall: dust under the foot that came down, and a thud near the camera
    const step = Math.floor(phase / Math.PI);
    if (step !== Math.floor(PHASE[k] / Math.PI) && PHASE[k] < phase) {
      const side = step & 1 ? 1 : -1;
      out.glow.push({ pos: [c.x - c.hz * side * rs * 0.5, PLAT_Y + 0.25, c.z + c.hx * side * rs * 0.5], size: rs * 1.2, color: [0.8, 0.72, 0.6, 0.5], kind: SPRITE.FLASH, minpx: 2 });
      const d = ctx?.cam ? Math.hypot(c.x - ctx.cam[0], c.z - ctx.cam[2]) : 1e9;
      if (d < 30 && ctx.now - lastStep > 110) { lastStep = ctx.now; ctx.sound?.land?.(Math.min(24, 300 / (d + 8))); }
    }
    PHASE[k] = phase;
    return;
  }
  const fall = Math.max(0, over) / v;
  const y = PLAT_Y - 10 * fall * fall;
  if (y > -rs * 3) stomper(sc, out, k, c.x, y, c.z, rs, c.hx, c.hz, phase, 0, y);
  if (y < 2 && y > -8) out.glow.push({ pos: [c.x, 1, c.z], size: rs * 3, color: [0.85, 0.92, 1, 0.6], kind: SPRITE.FLASH, minpx: 2 });
}
const P0 = { x: 0, z: 0, hx: 1, hz: 0, th: 0 }, P1 = { x: 0, z: 0, hx: 1, hz: 0, th: 0 };

// Leap k on tick tp: its ring (SG_TELE before it lands), the leap in out of
// the sea, the slam and the shockwave, standing, leaping away.
function leap(sc, out, s, k, tp, now) {
  const tf = s.tf[k], rs = s.rs[k], tx = s.ox[k], tz = s.oz[k];
  const R = rs + MC.SG_SLAMR + RB; // the ring a ball's centre is thrown from
  if (tp < tf) {
    const u = Math.max(0, Math.min(1, (tp - (tf - MC.SG_TELE)) / MC.SG_TELE));
    const pulse = 0.8 + 0.2 * Math.sin(now * TICK * Math.PI * 2 * (1.5 + 5 * u));
    out.decals?.push({ pos: [tx, PLAT_Y + 0.07, tz], radius: R, width: 0.35, color: [1, 0.28, 0.08, (0.55 + 0.4 * u) * pulse], kind: DECAL.TARGET });
    out.decals?.push({ pos: [tx, PLAT_Y + 0.08, tz], radius: Math.max(0.6, R * (1 + 2 * (1 - u))), width: 0.25, color: [1, 0.85, 0.6, 0.35 + 0.5 * u], kind: DECAL.RING });
    out.decals?.push({ pos: [tx, PLAT_Y + 0.06, tz], radius: s.rw[k], width: 0.12, color: [1, 0.6, 0.3, 0.12 + 0.2 * u], kind: DECAL.RING });
  }
  const t0 = tf - MC.SG_LEAPT;
  if (tp >= t0 && tp < tf) {
    // out of the sea, high, down onto the ring
    const u = (tp - t0) / MC.SG_LEAPT;
    const x = s.lx[k] + (tx - s.lx[k]) * u, z = s.lz[k] + (tz - s.lz[k]) * u;
    const y0 = PLAT_Y - 12, y = y0 + (PLAT_Y - y0) * u + MC.SG_LEAPH * 4 * u * (1 - u) * 1.6;
    const hx = tx - s.lx[k], hz = tz - s.lz[k], hl = Math.hypot(hx, hz) || 1;
    stomper(sc, out, k, x, y, z, rs, hx / hl, hz / hl, 0.6, 0, y);
    out.decals?.push({ pos: [tx, PLAT_Y + 0.05, tz], radius: rs * (0.4 + 0.8 * u), width: rs * 0.5, color: [0.1, 0.08, 0.06, 0.15 + 0.45 * u], kind: DECAL.DISC });
    if (u < 0.15) out.glow.push({ pos: [s.lx[k], 1, s.lz[k]], size: rs * 3, color: [0.85, 0.92, 1, 0.7 * (1 - u / 0.15)], kind: SPRITE.FLASH, minpx: 2 });
    return;
  }
  if (tp < tf) return;
  const el = tp - tf;
  // the shockwave: a ring of flung-up rubble at ball height running out along the floor
  const r1 = frontAt(s, k, Math.max(1, el));
  if (r1 > 0) {
    const fade = 1 - (r1 - rs) / (s.rw[k] - rs);
    out.decals?.push({ pos: [tx, PLAT_Y + 0.07, tz], radius: r1, width: MC.SG_BAND + 0.2, color: [1, 0.8, 0.5, 0.8 * fade], kind: DECAL.RING });
    const n = Math.max(8, Math.min(90, Math.ceil((2 * Math.PI * r1) / SEG)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI + k;
      const h = MC.SG_HW * (0.7 + 0.5 * (((i * 7 + k) % 5) / 5));
      sc.box(tx + Math.cos(a) * (r1 - 0.2), PLAT_Y + h / 2, tz + Math.sin(a) * (r1 - 0.2), (Math.PI * r1) / n * 0.8, h / 2, 0.22, a + Math.PI / 2, ...RUBBLE, LOOK.MATTE, 0, 0, 0.35 + 0.6 * fade, (k * 31 + i) & 4095);
    }
  }
  if (el < 50) dust(out, tx, tz, el / 50, rs * 2.2, k);
  const hx = tx - s.lx[k], hz = tz - s.lz[k], hl = Math.hypot(hx, hz) || 1;
  if (el < MC.SG_STAY) {
    stomper(sc, out, k, tx, PLAT_Y, tz, rs, hx / hl, hz / hl, 0, el < 20 ? 1 - el / 20 : 0);
    return;
  }
  // away: up and on the way it came, out of sight
  const u = (el - MC.SG_STAY) / LEAVE;
  if (u >= 1) return;
  const y = PLAT_Y + MC.SG_LEAPH * 2.4 * u * (2 - u);
  stomper(sc, out, k, tx + (hx / hl) * 30 * u, y, tz + (hz / hl) * 30 * u, rs, hx / hl, hz / hl, 0.6, 0, y, 1 - u * u);
}

// ---- the AI ball

// how long after a path shows each AI ball notices it, by slot (its goal() sets it from its skill)
const REACT = new Uint8Array(L.NPLAYER).fill(20);
// what each ball's last think kept of the stompers near it: { at (view tick), x, z, list }
const NEAR = [];
const NEAR_R = 10, NEAR_LANE = 13;
// The stompers near (x, z) (paths or rings within reach) that ball slot can
// see, from the view's tick: kept a think for points within NEAR_R of the first.
function nearStompers(view, s, slot, x, z) {
  const g = view.party();
  const c = slot >= 0 ? NEAR[slot] : null;
  if (c && c.at === view.tick && c.bank === view.bank && c.round === g.round && (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) < NEAR_R * NEAR_R) return c.list;
  const t = g.t, seen = t - (slot >= 0 ? REACT[slot] : 20);
  const list = [];
  const [k0, k1] = span(s, Math.max(0, t - 10), seen + MC.SG_TELE);
  for (let k = k0; k < k1; k++) {
    if (s.tf[k] - MC.SG_TELE > seen || t >= s.te[k]) continue;
    if (isLeap(s, k)) { if (Math.hypot(x - s.ox[k], z - s.oz[k]) < s.rw[k] + NEAR_LANE) list.push(k); }
    else if (Math.abs(Math.hypot(x - s.ox[k], z - s.oz[k]) - s.ra[k]) < s.rs[k] + RB + NEAR_LANE) list.push(k);
  }
  if (slot >= 0) NEAR[slot] = { at: view.tick, bank: view.bank, round: g.round, x, z, list };
  return list;
}
const P = { x: 0, z: 0, hx: 1, hz: 0, th: 0 };
const E = { off: 0, eta: 0, pass: 0 };
// How bad being at (x, z) on tick t (HDR_TICK's count) is: a fall where no
// flagstone holds then; a stomper there then; one coming along its path soon;
// under a leap's ring as it lands or by it as it stands; a little the rim.
function danger(view, x, z, t, slot) {
  const g = view.party();
  if (g.state !== L.H_PLAY) return 0;
  const s = stage(view);
  const cx = s.cx, tp = (t - g.start) | 0;
  const drop = dropOf(view, cellAt(x, z, cx));
  if (tp >= drop) return 1;
  let d = drop - tp < 60 ? 0.7 : 0;
  for (const k of nearStompers(view, s, slot, x, z)) {
    const rs = s.rs[k];
    if (isLeap(s, k)) {
      const dd = Math.hypot(x - s.ox[k], z - s.oz[k]);
      if (tp <= s.tf[k] + 2 && dd < rs + MC.SG_SLAMR + RB + 0.6 && s.tf[k] - tp < 140) d = Math.max(d, 0.9);
      else if (tp > s.tf[k] && tp < s.tf[k] + MC.SG_STAY && dd < rs + RB + 0.3) d = Math.max(d, 0.8);
      continue;
    }
    if (tp >= s.tf[k] && tp < s.te[k]) {
      const p = chargeAt(s, k, tp, P);
      if (Math.hypot(x - p.x, z - p.z) < rs + RB + 0.3) return Math.max(d, 0.95);
    }
    const e = chargeEta(s, k, x, z, tp, rs + RB + 0.9, E);
    if (!e || e.eta > 1.3) continue;
    const side = 1 - Math.max(0, e.off - (rs + RB) * 0.5) / ((rs + RB) * 0.5 + 0.9);
    d = Math.max(d, (0.4 + 0.45 * (1 - e.eta / 1.3)) * Math.max(0.3, side));
  }
  const rho = Math.hypot(x - cx, z - cx), edge = rimAt(s.r0, tp + 90);
  if (rho > edge - 2.5) d = Math.max(d, 0.25 + 0.3 * Math.min(1, (rho - edge + 2.5) / 2.5));
  return d;
}
// How much the stompers threaten (x, z) over the next 2.5 s from tick t into
// play: each charge by how near its path runs and how soon it gets there,
// each leap by how near its ring is, and a shockwave near the rim.
function threat(s, list, x, z, t, rim) {
  let sum = 0;
  for (const k of list) {
    const rs = s.rs[k];
    if (isLeap(s, k)) {
      if (t > s.tf[k] + MC.SG_STAY) continue;
      const dd = Math.hypot(x - s.ox[k], z - s.oz[k]), R = rs + MC.SG_SLAMR + RB + 1.5;
      if (dd < R) sum += 1.4 * (1 - dd / R);
      // the shockwave toward the rim from here
      if (dd < s.rw[k] && Math.hypot(x - s.cx, z - s.cx) > rim - 7) sum += 0.4;
      continue;
    }
    const e = chargeEta(s, k, x, z, t, rs + RB + 1.6, E);
    if (!e || e.eta > 2.5) continue;
    sum += (1 - e.off / (rs + RB + 1.6)) * (1.3 - e.eta / 2.5);
  }
  return sum;
}
// When the next shockwave's front reaches (x, z) moving at (vx, vz), from
// tick t into play: s, or Infinity.
function waveEta(s, list, x, z, vx, vz, t) {
  let best = Infinity;
  for (const k of list) {
    if (!isLeap(s, k)) continue;
    const el = t - s.tf[k];
    if (el > s.te[k] - s.tf[k]) continue;
    const dx = x - s.ox[k], dz = z - s.oz[k], dd = Math.hypot(dx, dz);
    if (dd > s.rw[k] || dd < s.rs[k]) continue;
    const vr = dd > 0.01 ? (vx * dx + vz * dz) / dd : 0;
    const front = Math.max(s.rs[k], s.rs[k] + MC.SG_VW * TICK * Math.max(0, el));
    const pre = el < 0 ? -el * TICK : 0;
    if (front > dd + 0.05) continue; // gone by
    const eta = pre + (dd + vr * pre - front) / Math.max(1, MC.SG_VW - vr);
    if (eta < best) best = eta;
  }
  return best;
}
const slotOf = (me) => (typeof me === 'number' ? me : me?.slot ?? -1);
const CROWD = new Map(); // per view tick and bank: balls in by 3 m square
function crowdOf(view) {
  const key = view.bank;
  const c = CROWD.get(key);
  if (c && c.tick === view.tick) return c.grid;
  const grid = new Map();
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + view.bank + p * L.PSIZE;
    if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const k = Math.floor(view.dv.getFloat32(a + L.P_PX, true) / 3) * 4096 + Math.floor(view.dv.getFloat32(a + L.P_PZ, true) / 3);
    grid.set(k, (grid.get(k) || 0) + 1);
  }
  CROWD.set(key, { tick: view.tick, grid });
  return grid;
}
const crowdAt = (grid, x, z) => grid.get(Math.floor(x / 3) * 4096 + Math.floor(z / 3)) || 0;
// The ticks before going out a stomper's hit (PG_M) still gets the credit: SG_SHARE to start falling, then the fall.
const CREDIT = MC.SG_SHARE + 250;
// A hop's bottom over SG_HW: from and to, s after it leaves the floor.
export function hopWindow(hop) {
  const q = Math.sqrt(Math.max(0, hop * hop - 2 * 20 * MC.SG_HW));
  return [(hop - q) / 20, (hop + q) / 20];
}

export default {
  id: L.MG_STOMP, key: 'stomp', name: 'STOMPIN GROUND',
  hint: 'DODGE THE STOMPERS CHARGING DOWN THEIR PATHS  HOP THE SHOCKWAVES',
  rules: 'LAST ONE IN WINS  A SLAM SENDS A RING OUT  THE EDGE GOES AT 60 S',
  env: 'sunset',

  draw(view, ctx, out) {
    const s = stage(view);
    if (!(s.r0 > 0)) return;
    const { now, tp } = clock(view, ctx);
    const sc = out.scene;
    const y0 = PLAT_Y - HH;
    // the column the disc stands on, down into the sea
    sc.cyl(s.cx, PLAT_Y - 2 * HH - 22, s.cx, MC.SG_RMIN * 0.6, 22, 0.5, 0.42, 0.36, LOOK.MATTE);
    sc.cyl(s.cx, PLAT_Y - 2 * HH - 1.3, s.cx, MC.SG_RMIN * 0.92, 1.3, 0.55, 0.46, 0.38, LOOK.MATTE);
    // the quakes: where a stomper landed in the last QUAKE ticks
    const quakes = [];
    if (tp >= 0) {
      const [k0, k1] = span(s, tp - QUAKE, tp);
      for (let k = k0; k < k1; k++) {
        const age = tp - s.tf[k];
        if (age < 0 || age >= QUAKE) continue;
        const c = isLeap(s, k) ? { x: s.ox[k], z: s.oz[k] } : chargeAt(s, k, s.tf[k], { x: 0, z: 0, hx: 1, hz: 0, th: 0 });
        quakes.push([c.x, c.z, (1 - age / QUAKE) * (isLeap(s, k) ? 0.22 : 0.12)]);
      }
    }
    for (const T of s.tiles) {
      if (tp < 0) { sc.box(T.x, y0, T.z, S * DRAWN, HH, S * DRAWN, 0, ...T.rgb, LOOK.MATTE, 0, 0, 1, (T.q * 31 + T.r) & 4095); continue; }
      const left = T.drop - tp;
      if (left <= 0) {
        const a = -left * TICK;
        if (a < FALL) sc.box(T.x, y0 - 15 * a * a, T.z, S * DRAWN, HH, S * DRAWN, a * (T.wob - 0.5) * 3, ...shade(T.rgb, DOOM, 0.8), LOOK.MATTE, 0, 0, 1 - a / FALL);
        continue;
      }
      let rgb = T.rgb, dx = 0, dz = 0, dy = 0;
      if (left < WARN) {
        const k = 1 - left / WARN;
        rgb = shade(rgb, DOOM, 0.75 * k);
        dy = -0.12 * k;
        const sh = left < 60 ? 0.07 * (1 - left / 60) : 0;
        dx = sh * Math.sin(now * 2.3 + T.q * 5.1 + T.r * 2.7);
        dz = sh * Math.sin(now * 2.9 + T.q * 3.3 - T.r * 4.1);
      }
      for (const [qx, qz, amp] of quakes) {
        const d = Math.hypot(T.x - qx, T.z - qz);
        if (d < QUAKER) dy += amp * (1 - d / QUAKER) * Math.sin(now * 0.09 + T.q * 1.7 + T.r * 2.3);
      }
      sc.box(T.x + dx, y0 + dy, T.z + dz, S * DRAWN, HH, S * DRAWN, 0, ...rgb, LOOK.MATTE, 0, 0, 1, (T.q * 31 + T.r) & 4095);
    }
    if (tp < 0) return;
    const rim = rimAt(s.r0, tp);
    const [k0, k1] = span(s, tp - SEA - LEAVE, tp + MC.SG_TELE);
    for (let k = k0; k < k1; k++) {
      if (isLeap(s, k)) {
        if (tp < s.tf[k] - Math.max(MC.SG_TELE, MC.SG_LEAPT) || tp > s.tf[k] + MC.SG_STAY + LEAVE) continue;
        leap(sc, out, s, k, tp, now);
      } else {
        if (tp < s.tf[k] - MC.SG_TELE || tp > s.te[k] + SEA) continue;
        charge(sc, out, s, k, tp, now, rim, ctx);
      }
    }
  },

  // the disc as it stands
  frame(view) {
    const s = stage(view);
    const g = view.party();
    const r0 = s.r0 > 0 ? s.r0 : g.size;
    const tp = g.state === L.H_PLAY ? g.t : g.state === L.H_OVER ? Math.max(0, ((g.until - L.P_OVER) - g.start) | 0) : 0;
    return { centre: [s.cx || g.cx, PLAT_Y, s.cx || g.cx], radius: rimAt(r0, tp) + S * 0.7, shape: 'disc' };
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const now = ctx.now ?? 0;
    if (fx.kind === MC.SG_FX_LAND) {
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.5, fx.pos[2]], size: fx.size * 3, color: [0.8, 0.72, 0.6, 0.7], kind: SPRITE.FLASH, life: 700, grow: true });
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.2, fx.pos[2]], size: fx.size * 2.2, color: [0.9, 0.8, 0.6, 0.6], kind: SPRITE.RING, life: 450, grow: true });
      if (d < 150 && !(now - lastThud < 60)) { lastThud = now; ctx.sound?.blast?.(d + 3, 6); ctx.sound?.land?.(Math.min(30, 900 / (d + 20))); }
    } else if (fx.kind === MC.SG_FX_HIT) {
      const wave = fx.shot & 0x8000;
      ctx.glow?.({ pos: fx.pos, size: 1.2 + fx.size * 0.07, color: wave ? [1, 0.85, 0.5, 0.8] : [1, 0.6, 0.3, 0.9], kind: SPRITE.SPARK, life: 320 });
      ctx.glow?.({ pos: fx.pos, size: 1.5 + fx.size * 0.06, color: [0.85, 0.75, 0.6, 0.5], kind: SPRITE.FLASH, life: 300, grow: true });
      ctx.sound?.boing?.(Math.min(30, fx.size * 1.5), fx.owner === ctx.slot ? 0 : d);
      if (!wave) ctx.sound?.land?.(Math.min(30, fx.size * 1.5));
      if (fx.owner === ctx.slot && fx.size > 6) ctx.banner?.(wave ? 'SHOCKWAVE!' : 'STOMPED!', C.RED, 900);
    } else if (fx.kind === MC.SG_FX_LEAP) {
      if (d < 160) ctx.sound?.jump?.();
    } else if (fx.kind === MC.SG_FX_CALL) {
      if (fx.shot === 0x8001) ctx.banner?.('LEAPERS COMING  HOP THE SHOCKWAVES', C.ORANGE, 2200);
      else if (fx.shot === 0x8002) ctx.banner?.('THE RIM IS CRUMBLING  GET IN', C.ORANGE, 2200);
      else ctx.sound?.tick?.();
    }
  },

  // a ball out off a stomper's knock (its PG_M, on the confirmed world)
  sink(f, name, view) {
    if (f.shot !== 255) return null;
    const m = view.dv.getUint32(L.PLAYERS + f.owner * L.PSIZE + L.PG_M, true);
    if (!(m & 0xffff)) return null;
    const out = (f.tick - view.party().start) | 0;
    if (out - (m >>> 16) > CREDIT) return null;
    const s = stage(view), k = (m & 0xffff) - 1;
    return k < s.ns && isLeap(s, k) ? `${name(f.owner)} SLAMMED` : `${name(f.owner)} STOMPED`;
  },

  // the waves, the next turn of the round, and what's coming at you
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const s = stage(view);
    if (!(s.r0 > 0)) return;
    const tp = g.t;
    const wv = waveAt(s, tp);
    if (!wv || (wv.vol === 0 && wv.start - tp > MC.SG_TELE)) ctx.right(3, 'STOMPERS CHARGE DOWN THE GLOWING PATHS', C.ORANGE);
    else ctx.right(3, `WAVE ${wv.vol + 1}  ${wv.n} ${wv.n === 1 ? 'STOMPER' : 'STOMPERS'}${wv.gap ? `  EVERY ${(wv.gap * TICK).toFixed(1)}S` : ''}`, C.GREY);
    if (tp < MC.SG_LEAPFROM) ctx.right(4, `LEAPERS IN ${Math.ceil((MC.SG_LEAPFROM - tp) * TICK)}S`, C.GREY);
    else if (tp < MC.SG_CRUMBLE) ctx.right(4, `THE RIM CRUMBLES IN ${Math.ceil((MC.SG_CRUMBLE - tp) * TICK)}S`, tp > MC.SG_CRUMBLE - 1250 ? C.ORANGE : C.GREY);
    else ctx.right(4, rimAt(s.r0, tp) > MC.SG_RMIN ? 'THE RIM IS CRUMBLING' : `THE RIM HAS STOPPED AT ${MC.SG_RMIN} M`, C.ORANGE);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out || me.falling) return;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    const x = me.pos[0], z = me.pos[2];
    let soon = Infinity, ring = Infinity, slam = false;
    const [k0, k1] = span(s, tp, tp + MC.SG_TELE);
    for (let k = k0; k < k1; k++) {
      if (s.tf[k] - MC.SG_TELE > tp || tp >= s.te[k]) continue;
      if (isLeap(s, k)) {
        const dd = Math.hypot(x - s.ox[k], z - s.oz[k]);
        if (tp <= s.tf[k] && dd < s.rs[k] + MC.SG_SLAMR + RB) slam = true;
        continue;
      }
      const e = chargeEta(s, k, x, z, tp, s.rs[k] + RB, E);
      if (e && e.eta < soon) soon = e.eta;
    }
    ring = waveEta(s, nearStompers(view, s, -1, x, z), x, z, me.vel[0], me.vel[2], tp);
    if (slam) ctx.centre(row, 'GET OUT OF THE RING!', C.RED);
    else if (soon < 2.5) ctx.centre(row, `STOMPER  MOVE!  ${soon.toFixed(1)}`, soon < 1 ? C.RED : C.ORANGE);
    else if (ring < 1.5) ctx.centre(row, `SHOCKWAVE  HOP!  ${ring.toFixed(1)}`, ring < 0.5 ? C.RED : C.ORANGE);
    else {
      const a = cellAt(x, z, s.cx);
      if (a >= 0 && dropOf(view, a) - tp < WARN) ctx.centre(row, 'THE EDGE IS GOING  GET IN', C.ORANGE);
    }
  },

  brain: {
    danger(view, x, z, tick, me) { return danger(view, x, z, tick, slotOf(me)); },

    // Somewhere no stomper it has seen comes through soon, off the leaps'
    // rings, in off the rim as it will be, on floor that holds, out of the
    // crowd's thick; kept (in bot.mem) unless somewhere is clearly better.
    goal(view, me, bot) {
      const g = view.party();
      const slot = slotOf(me);
      if (g.state !== L.H_PLAY || slot < 0) return null;
      const s = stage(view);
      const skill = bot?.skill ?? 0.6;
      REACT[slot] = Math.round(10 + 40 * (1 - skill));
      const b = typeof me === 'number' ? view.partier(me) : me;
      const x0 = bot?.pos?.[0] ?? b.pos[0], z0 = bot?.pos?.[1] ?? b.pos[2];
      const t = ((bot?.at ?? view.tick) - g.start) | 0, cx = s.cx;
      const edge = rimAt(s.r0, t + 250);
      const list = nearStompers(view, s, slot, x0, z0);
      const grid = crowdOf(view);
      const score = (x, z) => {
        const rho = Math.hypot(x - cx, z - cx);
        let v = 3 * threat(s, list, x, z, t, edge) + 0.05 * Math.hypot(x - x0, z - z0) + 0.03 * rho + 0.3 * crowdAt(grid, x, z);
        if (rho > edge - 5) v += 2 + (rho - edge + 5);
        if (!holds(view, cellAt(x, z, cx), t + 90)) v += 6;
        return v;
      };
      const mem = bot?.mem || {};
      let best = null, bs = Infinity;
      if (mem.sg) { bs = score(mem.sg[0], mem.sg[1]) - 0.4; best = mem.sg; }
      const cand = [[x0, z0], [cx, cx]];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * 2 * Math.PI + (bot?.rand ? bot.rand() * 0.5 : 0);
        for (const r of [3.5, 7, 11]) cand.push([x0 + Math.cos(a) * r, z0 + Math.sin(a) * r]);
      }
      for (const [x, z] of cand) {
        const v = score(x, z);
        if (v < bs) { bs = v; best = [x, z]; }
      }
      mem.sg = best;
      return best;
    },

    // a shockwave's front about to reach it, timed so its bottom is over
    // SG_HW as the front goes by, and floor to come down on
    hop(view, me, bot) {
      const b = typeof me === 'number' ? view.partier(me) : me;
      if (!b || !b.ground || b.out || b.falling) return false;
      const g = view.party();
      if (g.state !== L.H_PLAY) return false;
      const s = stage(view);
      const slot = slotOf(me);
      const x0 = bot?.pos?.[0] ?? b.pos[0], z0 = bot?.pos?.[1] ?? b.pos[2];
      const vx = bot?.vel?.[0] ?? b.vel[0], vz = bot?.vel?.[1] ?? b.vel[2];
      const t = ((bot?.at ?? view.tick) - g.start) | 0;
      const hopV = view.dv.getFloat32(L.PG_HOP + view.bank, true);
      if (!(hopV > 0)) return false;
      const [up, down] = hopWindow(hopV);
      const eta = waveEta(s, nearStompers(view, s, slot, x0, z0), x0, z0, vx, vz, t);
      if (!(eta >= up + 0.04 && eta <= Math.min(down - 0.12, up + 0.3))) return false;
      const air = (2 * hopV) / 20;
      return holds(view, cellAt(x0 + vx * air, z0 + vz * air, s.cx), t + Math.round(air / TICK));
    },
  },
};
