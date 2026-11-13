// RUSH HOUR, as drawn and as the AI ball sees it. A street between two
// pavements under a flyover at each end: asphalt lanes with dashed lines, a
// red bike lane, a tram line with its rails and wire, planted medians, a
// belt of sliding slats; a zebra across all of it, its stripes lit while its
// lights hold the traffic back; cars, vans, lorries, motorbikes and trams
// from the renderer's boxes, cylinders and spheres; gold coins on the lanes.
// Every vehicle is the sim's own train of cells (src/mg/traffic.wat, PG_S
// and PG_BIG) worked forward to the frame's tick, so what is drawn and what
// the AI ball times its run by is what the sim knocks a ball with.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/traffic.mjs'; // RH_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const RB = 1; // a ball's radius
const Y = PLAT_Y;
const PORTAL = 26; // m of street drawn under each flyover: a tram's length and more
const DECK = 4.5; // m from the road to a flyover's underside

// The vehicles by kind (RH_K*), as the sim's constants have them.
export const KINDS = [null,
  { name: 'CAR', len: MC.RH_KLEN[1] / 100, hw: MC.RH_KHW[1] / 100 },
  { name: 'VAN', len: MC.RH_KLEN[2] / 100, hw: MC.RH_KHW[2] / 100 },
  { name: 'LORRY', len: MC.RH_KLEN[3] / 100, hw: MC.RH_KHW[3] / 100 },
  { name: 'MOTORBIKE', len: MC.RH_KLEN[4] / 100, hw: MC.RH_KHW[4] / 100 },
  { name: 'TRAM', len: MC.RH_KLEN[5] / 100, hw: MC.RH_KHW[5] / 100 },
];
const PAINT = [[0.9, 0.16, 0.14], [0.16, 0.42, 0.9], [0.96, 0.78, 0.12], [0.94, 0.94, 0.96], [0.14, 0.15, 0.18], [0.2, 0.68, 0.34], [0.95, 0.5, 0.12], [0.6, 0.62, 0.66],
  [0.55, 0.2, 0.7], [0.1, 0.6, 0.66], [0.75, 0.1, 0.3], [0.85, 0.82, 0.7], [0.3, 0.34, 0.5], [0.98, 0.6, 0.7], [0.45, 0.28, 0.16], [0.7, 0.88, 0.95]];
const GLASS = [0.1, 0.14, 0.2];
const TYRE = [0.07, 0.07, 0.08];

// ---- the street: its header, strips and traffic, read once a round

let memo = null;
// This round's street: the header on the view's bank, the strips (PG_S) and
// each lane's cells (PG_BIG) from the confirmed world; read again while the
// countdown may still lay it out for a newcomer.
export function stage(view) {
  const dv = view.dv, o = view.bank || 0;
  const hf = (k) => dv.getFloat32(L.PG_H + k + o, true);
  const seed = dv.getUint32(L.HDR_SEED + o, true), hole = dv.getUint32(L.HDR_HOLE + o, true), state = dv.getUint32(L.HDR_STATE + o, true);
  const hw = hf(MC.RH_HW), xa = hf(MC.RH_XA), start = dv.getUint32(L.HDR_START + o, true);
  const m = memo;
  if (m && m.buf === dv.buffer && m.seed === seed && m.hole === hole && m.hw === hw && m.xa === xa && m.fixed && (state === L.H_PLAY || state === L.H_OVER)) { m.start = start; return m; }
  const cx = dv.getFloat32(L.PG_CX + o, true);
  const s = { buf: dv.buffer, seed, hole, hw, xa, xb: hf(MC.RH_XB), zc: hf(MC.RH_ZC), zh: hf(MC.RH_ZH), cx, z0: cx - hw, z1: cx + hw, start,
    fixed: state === L.H_PLAY || state === L.H_OVER, strips: [], safe: [] };
  for (let k = 0; k < MC.RH_NS; k++) {
    const a = L.PG_S + k * MC.RH_SREC;
    const type = dv.getUint8(a + MC.RH_STYPE);
    const st = { k, type, x0: dv.getFloat32(a + MC.RH_SX0, true), x1: dv.getFloat32(a + MC.RH_SX1, true), dir: dv.getUint8(a + MC.RH_SDIR),
      v: dv.getFloat32(a + MC.RH_SV, true), pitch: dv.getFloat32(a + MC.RH_SPITCH, true), cells: null };
    st.xc = (st.x0 + st.x1) / 2;
    st.sgn = st.dir ? -1 : 1;
    st.traffic = type >= MC.RH_TLANE && type <= MC.RH_TTRAM;
    if (st.traffic) st.cells = new Uint8Array(dv.buffer.slice(L.PG_BIG + MC.RH_CELLS + k * MC.RH_NCELL * 2, L.PG_BIG + MC.RH_CELLS + (k + 1) * MC.RH_NCELL * 2));
    s.strips.push(st);
  }
  // where nothing drives, in x: the pavements and the medians and belts between (a little in from their edges)
  s.safe.push({ lo: -Infinity, hi: s.xa - 0.2, at: s.xa - 1.4, belt: 0 });
  for (const st of s.strips) if (st.type === MC.RH_TMEDIAN || st.type === MC.RH_TBELT) s.safe.push({ lo: st.x0 + 0.35, hi: st.x1 - 0.35, at: st.xc, belt: st.type === MC.RH_TBELT ? st.sgn : 0 });
  s.safe.push({ lo: s.xb + 0.2, hi: Infinity, at: s.xb + 1.6, belt: 0 });
  memo = s;
  return s;
}
// Drop what was read (a test that writes the street reads it again).
export const forget = () => { memo = null; };
// The traffic's clock on tick t into play ($rh_run), and how far strip st has run by then, m.
export const run = (t) => t + t * t * MC.RH_QA / 2;
export const ran = (st, t) => run(t) * st.v * TICK;
// A point's place along strip st's way from where the lane comes in, and back.
const along = (s, st, z) => (st.dir ? s.z1 - z : z - s.z0);
const zOf = (s, st, y) => (st.dir ? s.z1 - y : s.z0 + y);
// Strip st's vehicles between y0 and y1 along its way on tick t into play
// (fractional: drawn between ticks): fn(kind, colour, front, len, cell).
export function vehicles(s, st, t, y0, y1, fn) {
  if (!st.traffic) return;
  const d = ran(st, t);
  const lo = Math.max(0, Math.floor((d - y1) / st.pitch) + MC.RH_C0 - 1), hi = Math.min(MC.RH_NCELL - 1, Math.floor((d - y0) / st.pitch) + MC.RH_C0 + 1);
  for (let i = lo; i <= hi; i++) {
    const c = st.cells[2 * i], kind = c & 7;
    if (!kind) continue;
    const front = d - (i - MC.RH_C0) * st.pitch - st.cells[2 * i + 1] / 8, len = KINDS[kind].len;
    if (front < y0 || front - len > y1) continue;
    fn(kind, c >> 4, front, len, i);
  }
}
// The kind of the vehicle within `reach` of (x, z) on tick t into play, as
// $rh_push finds it for a ball of that radius; 0 for none.
export function vehicleAt(s, x, z, t, reach = RB) {
  for (const st of s.strips) {
    if (!st.traffic) continue;
    const dxc = Math.abs(x - st.xc);
    if (dxc >= reach + MC.RH_VHWMAX) continue;
    const y = along(s, st, z);
    let hit = 0;
    vehicles(s, st, t, y - reach, y + reach, (kind, col, front, len) => {
      const dy = Math.max(front - len - y, y - front, 0), dx = Math.max(dxc - KINDS[kind].hw, 0);
      if (!hit && dx * dx + dy * dy < reach * reach) hit = kind;
    });
    if (hit) return hit;
  }
  return 0;
}
// The lights on tick t into play: 'red', 'amber' (green RH_LWARN on), 'green' or 'end' (its last RH_LEND), and the ticks till the next change.
export function lights(t) {
  const c = ((t + MC.RH_LT - MC.RH_LA) % MC.RH_LT + MC.RH_LT) % MC.RH_LT;
  if (t >= MC.RH_LA && c < MC.RH_LW - MC.RH_LEND) return { now: 'green', left: MC.RH_LW - c };
  if (t >= MC.RH_LA && c < MC.RH_LW) return { now: 'end', left: MC.RH_LW - c };
  if (c >= MC.RH_LT - MC.RH_LWARN) return { now: 'amber', left: MC.RH_LT - c };
  return { now: 'red', left: MC.RH_LT - c };
}
// The clock to draw at, in ticks into play (fractional), on the prediction's
// where there is one, a tick back (the move that put your ball where it is
// drawn met the traffic a tick before); 0 through the countdown, held where
// the round ended through the result.
function playTicks(view, g, ctx) {
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return 0;
  let t = typeof ctx?.pt === 'number' && ctx.pt > 0 ? ctx.pt / TICK : typeof ctx?.t === 'number' && ctx.t > 0 ? ctx.t / TICK : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t - 1);
}
// The coins lying now: [{ q, x, z, age (ticks) }].
export function coins(view, t) {
  const out = [], dv = view.dv;
  for (let q = 0; q < MC.RH_NCOIN; q++) {
    const a = L.PG_S + MC.RH_COINS + 16 * q, n = dv.getUint32(a + 8, true);
    if (n) out.push({ q, x: dv.getFloat32(a, true), z: dv.getFloat32(a + 4, true), age: t + 1 - n });
  }
  return out;
}
const downOf = (m) => (m & MC.RH_MDOWN) !== 0;

// ---- the AI ball

// A ball flat out along x from (x, u) (u its speed that way): how far it is after tau s (bumper's roll: 10 m/s, 1.1/s).
const KD = 1.105;
const reachOf = (u, tau) => 10 * tau - (10 - u) * (1 - Math.exp(-KD * tau)) / KD;
const STEP = 0.04, NSTEP = 80;
// The first s at which a ball rolling flat out from x toward `to` (z held but
// for what speed across it has) meets a vehicle, the traffic read as
// (1 - slow) of the way it will really be; Infinity if it gets there clear.
function firstHit(s, x, z, vx, vz, to, t, margin, slow) {
  const way = to >= x ? 1 : -1, u = vx * way, dist = Math.abs(to - x);
  for (let j = 1; j <= NSTEP; j++) {
    const tau = j * STEP, d = reachOf(u, tau);
    const zj = z + vz * (1 - Math.exp(-KD * tau)) / KD;
    if (vehicleAt(s, x + way * Math.min(d, dist), zj, t + tau * (1 - slow) / TICK, RB + margin)) return tau;
    if (d >= dist) break;
  }
  return Infinity;
}
// What the ball does on tick `tick` (the one its word is for): from where
// nothing drives it looks across the lanes to the next such place and goes
// when it reckons it will get there clear, else waits, sidling toward the
// zebra when its green is near or to a coin on the way; caught in a lane it
// goes on if that is clear, back if that is, else on. Its skill is the room
// it leaves, how well it judges speed, and how long before it chances it.
function plan(view, me, bot, tick) {
  const dv = view.dv, o = view.bank || 0;
  const slot = typeof me === 'number' ? me : me?.slot;
  if (dv.getUint32(L.HDR_STATE + o, true) !== L.H_PLAY || !(slot >= 0)) return null;
  const rb = L.PLAYERS + o + slot * L.PSIZE;
  if ((view.u8[rb + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) return null;
  const s = stage(view);
  if (!(s.hw > 0)) return null;
  const m = dv.getUint32(rb + L.PG_M, true);
  const mem = bot?.mem ?? {};
  if (downOf(m)) { mem.wait = 0; return { yaw: 0, move: 0, down: true }; }
  const t = Math.max(0, (tick - dv.getUint32(L.HDR_START + o, true)) | 0);
  const skill = bot?.skill ?? 0.6;
  const x = bot?.pos ? bot.pos[0] : dv.getFloat32(rb + L.P_PX, true), z = bot?.pos ? bot.pos[1] : dv.getFloat32(rb + L.P_PZ, true);
  const vx = bot?.vel ? bot.vel[0] : dv.getFloat32(rb + L.P_VX, true), vz = bot?.vel ? bot.vel[1] : dv.getFloat32(rb + L.P_VZ, true);
  const way = m & MC.RH_MSIDE ? -1 : 1;
  // the safe places in the order it meets them: where it stands (or the last behind it), and the next ahead
  const safe = way > 0 ? s.safe : [...s.safe].reverse();
  let here = -1, next = safe.length - 1, prev = 0;
  for (let k = 0; k < safe.length; k++) {
    const q = safe[k];
    if (x >= q.lo && x <= q.hi) here = k;
    if ((way > 0 ? q.hi < x : q.lo > x)) prev = k;
  }
  for (let k = safe.length - 1; k >= 0; k--) { const q = safe[k]; if (way > 0 ? q.lo > x : q.hi < x) next = k; }
  if (here === safe.length - 1) return { yaw: way > 0 ? 0 : Math.PI, move: 1 }; // over the kerb: on to where the crossing counts
  const margin = 0.05 + 0.4 * skill;
  if (mem.slow === undefined || here !== mem.here) { mem.slow = (1 - skill) * 0.5 * (bot?.rand ? bot.rand() : 0.5); mem.here = here; if (here >= 0) mem.wait = 0; }
  // where the next place's safety starts, a little in
  const edge = (q) => (way > 0 ? Math.max(q.lo, q.at - 0.6) : Math.min(q.hi, q.at + 0.6));
  const to = edge(safe[next]);
  const hit = firstHit(s, x, z, vx, vz, to, t, margin, mem.slow);
  const go = { yaw: way > 0 ? 0 : Math.PI, move: 1 };
  if (hit === Infinity) { mem.wait = 0; return go; }
  if (here < 0) {
    // in a lane with something coming: back if that is clear, else whichever is hit later
    const q = safe[prev], back = way > 0 ? Math.min(q.hi, q.at + 0.6) : Math.max(q.lo, q.at - 0.6);
    const hitB = firstHit(s, x, z, vx, vz, back, t, margin, mem.slow);
    return hitB === Infinity || hitB > hit ? { yaw: way > 0 ? Math.PI : 0, move: 1 } : go;
  }
  // waiting: after a while it chances a run it reckons is only nearly clear
  mem.wait = (mem.wait || 0) + 1;
  if (mem.wait * 4 * TICK > 1.5 + 5 * skill && hit > 0.9 + 0.5 * skill) return go;
  // where along the kerb to wait: by a coin on the way across, on the zebra when its green is near, else here
  const q = safe[here];
  let zt = z;
  const lt = lights(t);
  const dzc = s.zc - z, room = Math.max(0, s.zh - 1);
  const zz = s.zc + room * ((((slot * 0.618034) % 1) * 2) - 1);
  if (Math.abs(dzc) < 26 && ((lt.now === 'green') || (lt.now !== 'end' && lt.left * TICK < 1.5 + Math.abs(dzc) / 6))) zt = zz;
  else {
    let best = 7;
    for (const c of coins(view, t)) {
      if (way > 0 ? c.x < x || c.x > safe[next].at : c.x > x || c.x < safe[next].at) continue;
      const d = Math.abs(c.z - z);
      if (d < best && c.age < MC.RH_CLIFE - 375) { best = d; zt = c.z; }
    }
  }
  zt = Math.max(s.z0 + RB + 0.5, Math.min(s.z1 - RB - 0.5, zt));
  const ax = (here === 0 ? q.at : Math.max(q.lo, Math.min(q.hi, q.at))) - x, az = zt - z;
  if (Math.hypot(ax, az) < 0.5) return { yaw: way > 0 ? 0 : Math.PI, move: 0 };
  // sidle no faster than it can stop from
  if (Math.hypot(vx, vz - (q.belt ? q.belt * MC.RH_BELT : 0)) > 3 + Math.hypot(ax, az)) return { yaw: way > 0 ? 0 : Math.PI, move: 0 };
  return { yaw: Math.atan2(az, ax), move: 1 };
}

// ---- drawing

// A wheel pair: a tyre across the vehicle at z, its axle along x.
const axle = (sc, x, z, hw, r, seed) => sc.cyl(x, Y + r, z, r, hw, ...TYRE, LOOK.RUBBER, 0, 0, 1, seed, Math.PI / 2, Math.PI / 2);
// A vehicle whose nose is at z (zf) heading sgn along z, in lane x.
function vehicle(sc, out, kind, col, x, zf, sgn, seed, lit) {
  const K = KINDS[kind], len = K.len, zc = zf - sgn * len / 2, zr = zf - sgn * len;
  const p = PAINT[col & 15];
  const lamp = (z, r, g, b, a) => sc.box(x, Y + 0.7, z, K.hw * 0.8, 0.09, 0.04, 0, r, g, b, LOOK.GLOW, a, 0.5, 1, seed);
  if (kind === MC.RH_KCAR) {
    sc.box(x, Y + 0.64, zc, K.hw, 0.38, len / 2, 0, ...p, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 1.2, zc - sgn * 0.3, K.hw * 0.86, 0.22, len * 0.27, 0, ...GLASS, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 1.45, zc - sgn * 0.3, K.hw * 0.9, 0.04, len * 0.28, 0, ...p, LOOK.PLASTIC, 0, 0, 1, seed);
    axle(sc, x, zf - sgn * 0.9, K.hw + 0.03, 0.36, seed); axle(sc, x, zr + sgn * 0.9, K.hw + 0.03, 0.36, seed);
    lamp(zf + sgn * 0.02, 1, 0.95, 0.7, lit); lamp(zr - sgn * 0.02, 1, 0.1, 0.08, 0.8);
    out.casters.push([x, Y + 0.8, zc - 1, -1.1], [x, Y + 0.8, zc + 1, -1.1]);
  } else if (kind === MC.RH_KVAN) {
    sc.box(x, Y + 1.3, zc - sgn * 0.5, K.hw, 0.98, len / 2 - 0.5, 0, ...p, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 0.9, zf - sgn * 0.55, K.hw, 0.58, 0.55, 0, ...p, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 1.82, zf - sgn * 1.0, K.hw * 0.9, 0.4, 0.12, 0, ...GLASS, LOOK.PLASTIC, 0, 0, 1, seed);
    axle(sc, x, zf - sgn * 1.2, K.hw + 0.03, 0.4, seed); axle(sc, x, zr + sgn * 1.1, K.hw + 0.03, 0.4, seed);
    lamp(zf + sgn * 0.02, 1, 0.95, 0.7, lit); lamp(zr - sgn * 0.02, 1, 0.1, 0.08, 0.8);
    out.casters.push([x, Y + 1.2, zc - 1.5, -1.3], [x, Y + 1.2, zc + 1.5, -1.3]);
  } else if (kind === MC.RH_KLORRY) {
    const q = PAINT[(col * 7 + 3) & 15];
    sc.box(x, Y + 1.55, zf - sgn * 1.1, K.hw * 0.96, 1.15, 1.1, 0, ...p, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 2.1, zf - sgn * 0.02, K.hw * 0.86, 0.42, 0.04, 0, ...GLASS, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 2.05, zr + sgn * (len - 2.5) / 2, K.hw, 1.45, (len - 2.5) / 2, 0, ...q, LOOK.METAL, 0, 0, 1, seed);
    sc.box(x, Y + 0.75, zr - sgn * 0.03, K.hw, 0.18, 0.05, 0, 1, 0.8, 0.1, LOOK.HAZARD, 0.3, 0, 1, seed);
    axle(sc, x, zf - sgn * 1.1, K.hw + 0.03, 0.5, seed); axle(sc, x, zr + sgn * 1.2, K.hw + 0.03, 0.5, seed); axle(sc, x, zr + sgn * 2.5, K.hw + 0.03, 0.5, seed);
    lamp(zf + sgn * 0.02, 1, 0.95, 0.7, lit);
    for (let k = 0; k < 4; k++) out.casters.push([x, Y + 1.6, zr + sgn * (1.3 + k * 2.6), -1.5]);
  } else if (kind === MC.RH_KBIKE) {
    sc.box(x, Y + 0.62, zc, 0.16, 0.24, len * 0.36, 0, ...p, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.cyl(x, Y + 0.38, zf - sgn * 0.4, 0.38, 0.09, ...TYRE, LOOK.RUBBER, 0, 0, 1, seed, Math.PI / 2, Math.PI / 2);
    sc.cyl(x, Y + 0.38, zr + sgn * 0.4, 0.38, 0.09, ...TYRE, LOOK.RUBBER, 0, 0, 1, seed, Math.PI / 2, Math.PI / 2);
    sc.box(x, Y + 1.2, zc - sgn * 0.1, 0.26, 0.36, 0.2, 0, 0.12, 0.12, 0.14, LOOK.MATTE, 0, 0, 1, seed);
    sc.sphere(x, Y + 1.78, zc, 0.25, ...p, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 0.95, zf - sgn * 0.3, 0.12, 0.08, 0.04, 0, 1, 0.95, 0.7, LOOK.GLOW, lit + 0.4, 0.5, 1, seed);
    out.casters.push([x, Y + 0.9, zc, -0.7]);
  } else {
    const q = col & 1 ? [0.92, 0.2, 0.16] : [0.98, 0.76, 0.1];
    sc.box(x, Y + 1.95, zc, K.hw, 1.25, len / 2, 0, ...q, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 2.35, zc, K.hw + 0.02, 0.42, len / 2 - 0.5, 0, ...GLASS, LOOK.GLOW, 0.12, 0.2, 1, seed);
    sc.box(x, Y + 0.5, zc, K.hw * 0.92, 0.26, len / 2 - 0.3, 0, 0.16, 0.16, 0.18, LOOK.METAL, 0, 0, 1, seed);
    sc.box(x, Y + 3.3, zc, K.hw * 0.8, 0.1, len / 2 - 0.8, 0, 0.9, 0.9, 0.92, LOOK.PLASTIC, 0, 0, 1, seed);
    sc.box(x, Y + 4.1, zc, 0.05, 0.7, 0.9, 0, 0.2, 0.2, 0.22, LOOK.METAL, 0, 0, 1, seed);
    sc.box(x, Y + 1.5, zf - sgn * 0.02, K.hw * 0.6, 0.12, 0.05, 0, 1, 0.95, 0.7, LOOK.GLOW, lit + 0.3, 0.5, 1, seed);
    sc.box(x, Y + 1.5, zr + sgn * 0.02, K.hw * 0.6, 0.12, 0.05, 0, 1, 0.1, 0.08, LOOK.GLOW, 0.8, 0.5, 1, seed);
    for (let k = 0; k < 7; k++) out.casters.push([x, Y + 1.7, zr + sgn * (1.6 + k * 3.1), -1.6]);
  }
}

// The street's fixed parts: pavements, the strips of the road and what is painted on them, the flyovers.
function street(sc, out, s, t, now) {
  const len = s.hw + PORTAL, xm = (s.xa + s.xb) / 2;
  // the pavements: slabs, a kerb, a low edge along the back (nothing there to hide a ball from its camera), lamps and trees behind it
  for (const [kerb, way] of [[s.xa, -1], [s.xb, 1]]) {
    const back = kerb + way * MC.RH_PAVE;
    sc.box(kerb + way * MC.RH_PAVE / 2, Y - 0.5, s.cx, MC.RH_PAVE / 2, 0.5, s.hw, 0, 0.8, 0.78, 0.74, LOOK.CHECKER, 2.2, 0.88);
    sc.box(kerb + way * 0.18, Y - 0.46, s.cx, 0.18, 0.5, s.hw, 0, 0.93, 0.93, 0.9, LOOK.MATTE);
    sc.box(back + way * 0.15, Y + 0.05, s.cx, 0.15, 0.25, s.hw, 0, 0.25, 0.3, 0.34, LOOK.METAL);
    for (let z = s.z0 + 7, i = 0; z < s.z1 - 3; z += 9, i++) {
      if (i & 1) {
        sc.cyl(back + way * 0.9, Y + 2.6, z, 0.14, 2.6, 0.2, 0.22, 0.26, LOOK.METAL);
        sc.box(back + way * 0.3, Y + 5.2, z, 0.75, 0.07, 0.1, 0, 0.2, 0.22, 0.26, LOOK.METAL);
        sc.sphere(back - way * 0.3, Y + 5.05, z, 0.24, 1, 0.92, 0.7, LOOK.GLOW, 0.9);
      } else {
        sc.cyl(back + way * 1.3, Y + 1.1, z, 0.22, 1.1, 0.42, 0.28, 0.16, LOOK.WOOD);
        sc.sphere(back + way * 1.3, Y + 3.1, z, 1.5, 0.24, 0.6, 0.26, LOOK.MATTE);
      }
    }
  }
  // the strips
  for (const st of s.strips) {
    const hx = (st.x1 - st.x0) / 2;
    if (st.type === MC.RH_TMEDIAN) {
      sc.box(st.xc, Y - 0.5, s.cx, hx, 0.5, len, 0, 0.74, 0.74, 0.72, LOOK.MATTE);
      sc.box(st.xc, Y - 0.47, s.cx, hx - 0.7, 0.5, s.hw - 0.6, 0, 0.3, 0.62, 0.26, LOOK.MATTE);
      for (const e of [-1, 1]) sc.box(st.xc + e * (hx - 0.14), Y - 0.47, s.cx, 0.14, 0.5, s.hw, 0, 1, 0.8, 0.1, LOOK.HAZARD, 0.6);
    } else if (st.type === MC.RH_TBELT) {
      sc.box(st.xc, Y - 0.52, s.cx, hx, 0.5, len, 0, 0.12, 0.12, 0.14, LOOK.RUBBER);
      const off = ((MC.RH_BELT * t * TICK * st.sgn) % 1.2 + 1.2) % 1.2;
      for (let z = s.z0 + off - 1.2, i = 0; z < s.z1; z += 1.2, i++) {
        if (z < s.z0 + 0.3) continue;
        sc.box(st.xc, Y - 0.5, z, hx - 0.25, 0.5, 0.42, 0, 0.3, 0.4, 0.5, LOOK.METAL, 0, 0, 1, 77);
      }
      for (const e of [-1, 1]) sc.box(st.xc + e * (hx - 0.12), Y - 0.47, s.cx, 0.12, 0.5, s.hw, 0, 0.2, 0.75, 0.95, LOOK.GLOW, 0.35, 0.3);
    } else if (st.type === MC.RH_TBIKE) {
      sc.box(st.xc, Y - 0.5, s.cx, hx, 0.5, len, 0, 0.56, 0.2, 0.17, LOOK.RUBBER);
    } else if (st.type === MC.RH_TTRAM) {
      sc.box(st.xc, Y - 0.5, s.cx, hx, 0.5, len, 0, 0.34, 0.33, 0.33, LOOK.CHECKER, 0.6, 0.9);
      for (const e of [-1, 1]) sc.box(st.xc + e * 0.75, Y - 0.47, s.cx, 0.06, 0.5, len, 0, 0.75, 0.76, 0.8, LOOK.METAL);
      sc.box(st.xc, Y + DECK + 0.25, s.cx, 0.03, 0.03, len, 0, 0.1, 0.1, 0.12, LOOK.METAL);
    } else {
      sc.box(st.xc, Y - 0.5, s.cx, hx, 0.5, len, 0, 0.2, 0.21, 0.23, LOOK.RUBBER);
    }
    // a dashed line where two lanes of traffic lie side by side
    const nx = s.strips[st.k + 1];
    if (st.traffic && nx?.traffic) for (let z = s.z0 + 1.5; z < s.z1; z += 6) sc.box(st.x1, Y - 0.48, z + 1.4, 0.08, 0.5, 1.4, 0, 0.92, 0.92, 0.9, LOOK.MATTE);
  }
  // the zebra: stripes across every lane, lit while its lights hold the traffic; a light at each kerb either side of it
  const lt = lights(t);
  const flash = Math.sin(now / 70) > 0;
  const on = lt.now === 'green' || (lt.now === 'end' && flash);
  for (let x = s.xa + 0.5; x < s.xb - 0.2; x += 1) {
    if (on) sc.box(x, Y - 0.47, s.zc, 0.28, 0.5, s.zh, 0, 0.6, 1, 0.65, LOOK.GLOW, 0.75, 0.6);
    else if (lt.now === 'amber') sc.box(x, Y - 0.47, s.zc, 0.28, 0.5, s.zh, 0, 1, 0.8, 0.4, LOOK.GLOW, flash ? 0.6 : 0.25, 0.6);
    else sc.box(x, Y - 0.47, s.zc, 0.28, 0.5, s.zh, 0, 0.95, 0.95, 0.93, LOOK.MATTE);
  }
  for (const x of [s.xa - 0.7, s.xb + 0.7]) for (const e of [-1, 1]) {
    const z = s.zc + e * (s.zh + 0.9);
    sc.cyl(x, Y + 1.7, z, 0.12, 1.7, 0.16, 0.17, 0.2, LOOK.METAL);
    sc.box(x, Y + 3.95, z, 0.3, 0.75, 0.3, 0, 0.1, 0.1, 0.12, LOOK.PLASTIC);
    const lamps = [[1, 0.15, 0.1, lt.now === 'red'], [1, 0.7, 0.1, lt.now === 'amber'], [0.2, 1, 0.35, on]];
    lamps.forEach(([r, g, b, lit], k) => {
      sc.sphere(x, Y + 4.4 - 0.45 * k, z, 0.2, r, g, b, LOOK.GLOW, lit ? 1.6 : 0.06);
      if (lit) out.glow.push({ pos: [x, Y + 4.4 - 0.45 * k, z], size: 1.6, color: [r, g, b, 0.6], kind: SPRITE.FLASH, minpx: 2 });
    });
  }
  // a flyover over each end, the street going on under it, its abutments the walls
  for (const e of [-1, 1]) {
    const zw = s.cx + e * s.hw, zd = zw + e * PORTAL / 2;
    sc.box(xm, Y + DECK + 1.1, zd, (s.xb - s.xa) / 2 + MC.RH_PAVE + 2, 0.6, PORTAL / 2, 0, 0.62, 0.62, 0.64, LOOK.MATTE);
    for (const z of [zw + e * 0.3, zw + e * (PORTAL - 0.3)]) sc.box(xm, Y + DECK + 2.1, z, (s.xb - s.xa) / 2 + MC.RH_PAVE + 2, 0.5, 0.3, 0, 0.9, 0.9, 0.92, LOOK.PLASTIC);
    sc.box(xm, Y + DECK + 0.25, zw + e * 0.2, (s.xb - s.xa) / 2, 0.25, 0.2, 0, 1, 0.8, 0.1, LOOK.HAZARD, 0.8);
    for (const [kerb, way] of [[s.xa, -1], [s.xb, 1]]) sc.box(kerb + way * (MC.RH_PAVE / 2 + 1), Y + DECK / 2 - 0.25, zd, MC.RH_PAVE / 2 + 1, DECK / 2 + 0.75, PORTAL / 2, 0, 0.66, 0.4, 0.33, LOOK.CHECKER, 0.5, 0.86);
    for (const st of s.strips) if (!st.traffic) sc.box(st.xc, Y + DECK / 2, zd, (st.x1 - st.x0) / 2 - 0.5, DECK / 2 + 0.5, PORTAL / 2, 0, 0.58, 0.58, 0.6, LOOK.MATTE);
  }
}

export default {
  id: L.MG_TRAFFIC, key: 'traffic', name: 'RUSH HOUR',
  hint: 'CROSS THE ROAD AND BACK  A POINT A CROSSING  MIND THE TRAFFIC',
  rules: 'MOST POINTS WINS  A HIT SENDS YOU BACK TO YOUR KERB',
  env: 'day',

  draw(view, ctx, out) {
    const s = stage(view);
    if (!(s.hw > 0)) return;
    const g = view.party();
    const t = playTicks(view, g, ctx);
    const now = ctx?.now ?? 0;
    const sc = out.scene;
    street(sc, out, s, t, now);
    // the traffic, out from under one flyover and in under the other
    const W = 2 * s.hw;
    for (const st of s.strips) {
      vehicles(s, st, t, -2, W + PORTAL - 2, (kind, col, front, len, i) => {
        vehicle(sc, out, kind, col, st.xc, zOf(s, st, front), st.sgn, (st.k * 160 + i) & 4095, 0.9);
      });
    }
    // the coins, bobbing; a coin about to go blinks
    for (const c of coins(view, t)) {
      if (c.age > MC.RH_CLIFE - 250 && Math.sin(now / 60) > 0.3) continue;
      const p = [c.x, Y + 1.1 + 0.2 * Math.sin(now / 280 + c.q), c.z];
      out.solid.push({ pos: p, size: 0.8, color: [1, 0.8, 0.2, 1], kind: SPRITE.COIN, minpx: 2, roll: now / 160 + c.q });
      out.decals.push({ pos: [c.x, Y + 0.03, c.z], radius: 1.1, width: 0.16, color: [1, 0.85, 0.3, 0.7], kind: DECAL.RING });
    }
  },

  // the whole street, pavement to pavement
  frame(view) {
    const g = view.party();
    const s = stage(view);
    if (!(s.hw > 0)) return { centre: [g.cx, Y, g.cx], radius: g.size, shape: 'square' };
    return { centre: [(s.xa + s.xb) / 2, Y, s.cx], radius: Math.max(s.hw, (s.xb - s.xa) / 2 + MC.RH_PAVE), shape: 'square' };
  },

  // across the road
  facing() { return 0; },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const mine = fx.owner === ctx.slot;
    if (fx.kind === MC.RH_FX_CROSS) {
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 1, fx.pos[2]], size: 2.6, color: [0.5, 1, 0.6, 0.8], kind: SPRITE.FLASH, life: 400, grow: true });
      if (mine) { ctx.banner?.(`ACROSS  +${fx.size}`, fx.size > 1 ? C.YELLOW : C.GREEN, 700); ctx.sound?.pickup?.(); } else if (d < 25) ctx.sound?.tick?.();
    } else if (fx.kind === MC.RH_FX_HIT) {
      const K = KINDS[fx.shot & 7] || KINDS[1];
      ctx.glow?.({ pos: fx.pos, size: 2.2, color: [1, 0.85, 0.4, 0.9], kind: SPRITE.SPARK, life: 320 });
      ctx.glow?.({ pos: fx.pos, size: 2.6, color: [1, 0.5, 0.3, 0.5], kind: SPRITE.FLASH, life: 280, grow: true });
      ctx.sound?.boing?.(Math.min(30, fx.size), mine ? 0 : d);
      if (mine) ctx.banner?.(`${K.name}!  BACK TO YOUR KERB`, C.RED, 1100);
      else if (d < 40) ctx.feed?.(`${ctx.name(fx.owner)} MET A ${K.name}`, C.GREY);
    } else if (fx.kind === MC.RH_FX_COIN) {
      if (fx.owner === 255) { ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 1, fx.pos[2]], size: 1.6, color: [1, 0.85, 0.3, 0.7], kind: SPRITE.FLASH, life: 300 }); return; }
      ctx.glow?.({ pos: fx.pos, size: 2.4, color: [1, 0.85, 0.3, 0.9], kind: SPRITE.SPARK, life: 350 });
      if (mine) { ctx.banner?.(`COIN  +${fx.size}`, C.YELLOW, 700); ctx.sound?.holed?.(); } else if (d < 25) ctx.sound?.pickup?.();
    } else if (fx.kind === MC.RH_FX_CALL) {
      if (fx.shot === MC.RH_CAMBER || fx.shot === MC.RH_CEND) ctx.sound?.tick?.();
      else if (fx.shot === MC.RH_CWALK) { ctx.sound?.count?.(0); ctx.feed?.('THE ZEBRA IS CLEAR', C.GREEN); } else if (fx.shot === MC.RH_CDOUBLE) {
        ctx.banner?.('LAST 15 SECONDS  DOUBLE POINTS', C.YELLOW, 2500);
        ctx.sound?.count?.(1);
      }
    }
  },

  // your crossings, the zebra's lights, which kerb you want
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const t = g.t;
    if (me?.live) {
      ctx.right(2, `CROSSINGS ${me.m >>> 24}  POINTS ${me.score}`, C.WHITE);
      if (downOf(me.m)) ctx.right(4, 'KNOCKED DOWN  BACK TO YOUR KERB', C.RED);
      else ctx.right(4, t >= MC.RH_DOUBLE ? 'DOUBLE POINTS' : me.m & MC.RH_MSIDE ? 'BACK TO THE NEAR PAVEMENT' : 'OVER TO THE FAR PAVEMENT', t >= MC.RH_DOUBLE ? C.YELLOW : C.GREY);
    }
    const lt = lights(t), sec = (lt.left * TICK).toFixed(1);
    if (lt.now === 'green' || lt.now === 'end') ctx.right(3, `ZEBRA CLEAR FOR ${sec}`, lt.now === 'end' ? C.ORANGE : C.GREEN);
    else ctx.right(3, `ZEBRA CLEAR IN ${sec}`, lt.now === 'amber' ? C.ORANGE : C.GREY);
  },

  brain: {
    // a vehicle there on that tick
    danger(view, x, z, tick) {
      const o = view.bank || 0;
      if (view.dv.getUint32(L.HDR_STATE + o, true) !== L.H_PLAY) return 0;
      const s = stage(view);
      const t = Math.max(0, (tick - view.dv.getUint32(L.HDR_START + o, true)) | 0);
      return vehicleAt(s, x, z, t, RB + 0.3) ? 1 : 0;
    },
    // the far pavement, straight across
    goal(view, me) {
      const s = stage(view);
      if (!me || !(s.hw > 0)) return null;
      return [me.m & MC.RH_MSIDE ? s.xa - 2 : s.xb + 2, me.pos[2]];
    },
    hop() { return false; },
    think(view, me, bot, tick = view.tick) {
      const p = plan(view, me, bot, tick);
      return p ? { yaw: p.yaw, move: p.move } : null;
    },
  },
};
