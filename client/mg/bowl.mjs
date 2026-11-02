// BOWLING, as drawn and as the AI ball sees it. Maple lanes side by side
// under a row of pinsetters, their gutters steel, the dividers capped in
// blue, kickbacks along the decks; the foul line, the dots and the arrows
// on each lane; the pit dark behind. The pins are drawn from the confirmed
// world: standing on their spots (a golden one gold), knocked ones slid on
// to the prediction's tick as $bw_pins slides them, toppling over BW_TIP
// the way they fall, dropped ones falling away. A called lane's sweep bar
// comes down in front of its deck, its deck drops BW_SWEEP on, and rises
// with the fresh ten (drawn on the prediction's clock, as your own ball
// meets it).
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/bowl.mjs'; // BW_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const f = Math.fround;
const GY = PLAT_Y - MC.BW_GD; // the gutters' floor
const WOOD = [0.86, 0.66, 0.42];
const WOOD2 = [0.8, 0.58, 0.36]; // the approach, a shade darker
const DECK = [0.9, 0.74, 0.5];
const GUTTER = [0.36, 0.38, 0.42];
const CAP = [0.16, 0.36, 0.78];
const INK = [0.12, 0.08, 0.06];
const PIN = [0.97, 0.96, 0.93];
const BAND = [0.85, 0.1, 0.08];
const GOLDEN = [1, 0.76, 0.22];
const MASK = [[0.12, 0.2, 0.42], [0.42, 0.1, 0.12]];
const half = MC.BW_LW / 2 + MC.BW_GW; // a lane's middle to its divider's face

// ---- what the sim keeps, read

// The stage on the view's bank (null before a round of it is laid out).
export function stage(view) {
  const dv = view.dv, o = view.bank || 0, h = (k) => dv.getFloat32(L.PG_H + k + o, true);
  const nl = dv.getUint32(L.PG_H + MC.BW_NL + o, true);
  if (!nl || nl > MC.BW_NLMAX) return null;
  return { nl, xa: h(MC.BW_XA), xf: h(MC.BW_XF), xd: h(MC.BW_XD), xh: h(MC.BW_XH), xe: h(MC.BW_XE), xb: h(MC.BW_XB), zl: h(MC.BW_ZL), cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Lane l's middle, z, as $bw_zc works it.
export const laneZ = (s, l) => f(f(f(l) * f(MC.BW_PITCH)) + f(s.zl + f(MC.BW_PITCH / 2)));
// The lane under z and z less its middle, as $bw_lane.
export function laneAt(s, z) {
  let l = Math.trunc(Math.floor(f(f(z - s.zl) / f(MC.BW_PITCH))));
  if (l >= s.nl) l = s.nl - 1;
  if (l < 0) l = 0;
  return [l, f(z - laneZ(s, l))];
}
// The lanes' records (PG_S, the confirmed world's).
export function lanes(view) {
  const s = stage(view);
  if (!s) return [];
  const dv = view.dv, u8 = view.u8;
  return Array.from({ length: s.nl }, (_, l) => {
    const a = L.PG_S + MC.BW_LANES + l * MC.BW_LSIZE;
    return { l, call: dv.getUint32(a + MC.BW_L_CALL, true), first: dv.getUint32(a + MC.BW_L_FIRST, true), rack: dv.getUint32(a + MC.BW_L_RACK, true),
      racks: dv.getUint16(a + MC.BW_L_RACKS, true), strikes: dv.getUint16(a + MC.BW_L_STRIKES, true), n: u8[a + MC.BW_L_N], move: u8[a + MC.BW_L_MOVE], gold: u8[a + MC.BW_L_GOLD] };
  });
}
// Lane l's ten pins (PG_BIG, the confirmed world's).
export function pins(view, l) {
  const dv = view.dv, u8 = view.u8;
  return Array.from({ length: 10 }, (_, k) => {
    const a = L.PG_BIG + MC.BW_PINS + (l * 10 + k) * MC.BW_PSIZE;
    return { k, st: u8[a + MC.BW_P_ST], by: u8[a + MC.BW_P_BY], cr: u8[a + MC.BW_P_CR], gold: u8[a + MC.BW_P_GOLD], at: dv.getUint32(a + MC.BW_P_AT, true),
      x: dv.getFloat32(a + MC.BW_P_X, true), z: dv.getFloat32(a + MC.BW_P_Z, true), vx: dv.getFloat32(a + MC.BW_P_VX, true), vz: dv.getFloat32(a + MC.BW_P_VZ, true),
      ux: dv.getFloat32(a + MC.BW_P_UX, true), uz: dv.getFloat32(a + MC.BW_P_UZ, true) };
  });
}
// Slot p's record.
export function slotOf(view, p) {
  const a = L.PG_S + MC.BW_SLOTS + p * MC.BW_SSIZE, dv = view.dv, u8 = view.u8;
  return { lane: u8[a + MC.BW_S_LANE], live: u8[a + MC.BW_S_LIVE], gut: u8[a + MC.BW_S_GUT], gutters: u8[a + MC.BW_S_GUTTERS],
    pins: dv.getUint16(a + MC.BW_S_PINS, true), strikes: dv.getUint16(a + MC.BW_S_STRIKES, true), roll: u8[a + MC.BW_S_ROLL], rgut: u8[a + MC.BW_S_RGUT] };
}
// Pin k's spot from the head pin's, [along x, across z], as $bw_spot.
export function spot(k) {
  const r = (k >= 1) + (k >= 3) + (k >= 6), i = k - (r * (r + 1)) / 2;
  return [f(f(r) * f(MC.BW_ROW)), f(f(f(i) - f(f(r) * 0.5)) * f(MC.BW_PS))];
}
// Is a lane's deck down on tick t ($bw_down)?
export const deckDown = (lane, t) => lane.call !== 0 && ((t - lane.call - MC.BW_SWEEP) >>> 0) < MC.BW_DOWN;
// The tick a called lane's fresh ten stand.
export const rackAt = (lane) => (lane.call + MC.BW_SWEEP + MC.BW_DOWN) | 0;

// Knocked pin p (a copy, changed) slid n whole ticks on and frac of one more
// as $bw_pins slides it, short of the pins it meets: dropped off the lane's
// surface or past the lip (b.drop the tick into it, from 1).
export function slide(p, s, l, n, frac = 0) {
  const R = f(MC.BW_PROLL), DT = f(TICK), STOP = f(MC.BW_PSTOP * MC.BW_PSTOP), zc = laneZ(s, l), HW = f(MC.BW_LW / 2);
  for (let i = 0; i <= n; i++) {
    const part = i < n ? 1 : frac;
    if (part <= 0 || p.drop) break;
    let vx = f(p.vx * R), vz = f(p.vz * R);
    if (f(f(vx * vx) + f(vz * vz)) < STOP) { vx = 0; vz = 0; }
    if (part < 1) { p.x += vx * TICK * part; p.z += vz * TICK * part; break; }
    p.x = f(f(vx * DT) + p.x); p.z = f(f(vz * DT) + p.z); p.vx = vx; p.vz = vz;
    if (Math.abs(f(p.z - zc)) > HW || p.x >= s.xe) p.drop = i + 1;
  }
  return p;
}

// ---- drawing

// A pin with its foot at (x, z), y over the surface, tilted t (radians, 0
// up) the way (ux, uz): a foot, a belly, a shoulder, a neck with two bands,
// a head, laid along its axis (a lying one rests on its belly).
function drawPin(sc, x, y, z, ux, uz, t, gold, seed) {
  const sn = Math.sin(t), cs = Math.cos(t), yaw = Math.atan2(-ux, uz);
  const ax = ux * sn, ay = cs, az = uz * sn;
  const by = PLAT_Y + y + 0.33 * sn;
  const at = (h) => [x + ax * h, by + ay * h, z + az * h];
  const col = gold ? GOLDEN : PIN, look = gold ? LOOK.METAL : LOOK.PLASTIC;
  const band = gold ? [0.5, 0.08, 0.05] : BAND;
  const cyl = (h, hh, r, c, lk) => { const [px, py, pz] = at(h); sc.cyl(px, py, pz, r, hh, ...c, lk, 0, 0, 1, seed, t, yaw); };
  const ball = (h, r) => { const [px, py, pz] = at(h); sc.sphere(px, py, pz, r, ...col, look, 0, 0, 1, seed); };
  cyl(0.07, 0.07, 0.24, col, look);
  cyl(0.43, 0.31, 0.33, col, look);
  ball(0.76, 0.28);
  cyl(1.06, 0.22, 0.15, col, look);
  cyl(0.98, 0.035, 0.165, band, LOOK.PLASTIC);
  cyl(1.1, 0.03, 0.16, band, LOOK.PLASTIC);
  ball(1.3, 0.2);
}

// A chevron of the lane's arrows, its tip at (x, z), pointing down the lane.
function chevron(sc, x, z) {
  for (const e of [-1, 1]) sc.box(x - 0.24 * Math.cos(0.6), PLAT_Y + 0.004, z + e * 0.24 * Math.sin(0.6), 0.24, 0.004, 0.035, -e * 0.6, ...INK, LOOK.MATTE);
}

// How far a called lane's deck is down on clock tick tc from its call, m:
// down fast as it drops, up again with the fresh ten over its last 0.2 s.
function deckDrop(tc) {
  const a = tc - MC.BW_SWEEP, b = MC.BW_SWEEP + MC.BW_DOWN - tc;
  if (a < 0 || b <= 0) return 0;
  return 1.6 * Math.min(1, a / 12, b / 25);
}

const smooth = (x) => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };

// ---- the AI ball

// The pocket: the AI's line, m off the lane's middle. A ball's edge clips
// the head pin there and sends it across the rack (lines out to 1.25 m knock
// 8 to 10 of the ten, 1.5 to 2 m about 6, wider 3).
const POCKET = 0.9;

// Ticks a ball at x rolling vx down the lane takes to reach the head pin
// flat out, rolled on in steps of 4 ticks with the round's push and drag.
function arrive(s, x, vx, g) {
  const acc = Number(L.BPHYS.B_ACC_DT) * g.acc, d = g.drag ** 4;
  let n = 0, v = Math.max(0, vx);
  const end = s.xh - 1.35;
  while (x < end && n < 1500) { v = v * d + acc * 4; x += v * 4 * TICK; n += 4; }
  return n;
}

// What every AI ball looking at one world tick shares: the stage, the
// lanes and the pins standing on each, and on each lane the balls on its
// approach (its queue: first come first served, the one back from the pit
// longest first, those that haven't been down this round before them, ties
// by slot) and those on a live roll down it, short of the lip.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._bw;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv, u8 = view.u8;
  const s = stage(view);
  const g = view.party();
  const w = { tick: view.tick, bank: o, s: null, g };
  view._bw = w;
  if (!s || g.state !== L.H_PLAY) return w;
  w.s = s;
  w.lanes = lanes(view).map((ln) => ({ ...ln, up: pins(view, ln.l).filter((p) => p.st === MC.BW_UP) }));
  w.queue = w.lanes.map(() => []);
  w.rolling = w.lanes.map(() => []);
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + o + p * L.PSIZE;
    if ((u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const x = dv.getFloat32(a + L.P_PX, true), y = dv.getFloat32(a + L.P_PY, true), z = dv.getFloat32(a + L.P_PZ, true), vx = dv.getFloat32(a + L.P_VX, true);
    if (y < PLAT_Y - MC.BW_GIN) continue;
    const [l, u] = laneAt(s, z);
    const out = dv.getUint32(a + L.B_OUTAT, true);
    if (x < s.xf) w.queue[l].push({ slot: p, x, u, back: ((out - g.start) | 0) >= 0 ? (out - g.start) | 0 : -1 });
    else if (x < s.xe && u8[L.PG_S + MC.BW_SLOTS + p * MC.BW_SSIZE + MC.BW_S_LIVE]) w.rolling[l].push({ slot: p, x, u, vx });
  }
  for (const q of w.queue) q.sort((a, b) => a.back - b.back || a.slot - b.slot);
  return w;
}

// Where the j-th waiting behind the first stands, [x, z]: four across in a
// row clear of where balls drop in from the pit (two rows at the back), the
// rest out at the sides beside the first, every spot more than a ball's
// width from the others and from the first's.
const waitAt = (s, zc, j) => (j < 4 ? [s.xa + 5.3, zc + [-3.3, 3.3, -1.1, 1.1][j]] : [s.xa + 7.4, zc + (j & 1 ? 3.4 : -3.4)]);

// Brake onto (tx, tz) from (px, pz) rolling (vx, vz).
function steer(px, pz, vx, vz, tx, tz) {
  const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz);
  const k = Math.min(10, d * 2.5) / (d || 1);
  const ex = dx * k - vx, ez = dz * k - vz;
  return { yaw: Math.atan2(ez, ex), move: Math.hypot(ex, ez) > 0.8 ? 1 : 0 };
}

// Down the lane on its line, flat out: aimed a little across to close on the
// line and take out the drift, never more than 0.4 rad off straight.
function roll(pz, vz, tz) {
  return { yaw: Math.atan2(Math.max(-0.4, Math.min(0.4, (tz - pz) * 0.5 - vz * 0.35)), 1), move: 1 };
}

// The AI ball's word. Down a gutter or past the pins: on into the pit, the
// quick way back. Past the foul line: down the lane on its line. On the
// approach, its lane's queue: the rest wait at the back; the first picks its
// line (the pocket, POCKET off the middle so its edge clips the head pin
// across the rack, on the side its slot picks or the other side from a
// lanemate rolling now, off by up to 1.4 m times what it lacks of skill),
// lines up at the front, and goes once the pins will be standing when it
// gets there: none of the ten there now going, or a fresh ten due by the
// time it arrives (0.2 s to spare, and the lag it sees the world with),
// counting the latest a rack being knocked (or about to be, by a lanemate
// rolling at it) could be swept and racked again.
function think(view, me, bot, tick) {
  const w = worldOf(view);
  if (!w.s || !me || !me.live || me.out || me.falling) return null;
  const s = w.s, g = w.g;
  const mem = bot?.mem || {};
  const skill = bot?.skill ?? 0.6;
  const px = bot?.pos?.[0] ?? me.pos[0], pz = bot?.pos?.[1] ?? me.pos[2];
  const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  const [l] = laneAt(s, pz);
  const zc = laneZ(s, l);
  const lane = w.lanes[l];
  if (me.pos[1] < PLAT_Y - MC.BW_GIN || px > s.xh - 1.5) { mem.bwGo = mem.bwFirst = false; return { yaw: 0, move: 1 }; }
  if (px >= s.xf) {
    mem.bwGo = mem.bwFirst = false;
    return roll(pz, vz, mem.bwLane === l && mem.bwLine !== undefined ? mem.bwLine : zc + (me.slot & 1 ? -POCKET : POCKET));
  }
  const q = w.queue[l];
  const rank = Math.max(0, q.findIndex((b) => b.slot === me.slot));
  if (rank > 0 && !mem.bwGo) {
    mem.bwFirst = false;
    const j = rank - 1;
    return steer(px, pz, vx, vz, ...waitAt(s, zc, j));
  }
  const others = w.rolling[l].filter((b) => b.slot !== me.slot);
  if (!mem.bwFirst || mem.bwLane !== l) {
    const side = others.length ? (others[0].u > 0 ? -1 : 1) : (me.slot & 1 ? -1 : 1);
    const err = bot?.rand ? (bot.rand() - 0.5) * 2.8 * (1 - skill) : 0;
    Object.assign(mem, { bwFirst: true, bwGo: false, bwLane: l, bwLine: zc + side * POCKET + err });
  }
  const t = tick ?? view.tick;
  const eta = t + arrive(s, px, vx, g);
  const later = MC.BW_WAIT + MC.BW_SWEEP + MC.BW_DOWN;
  let due = lane.call ? rackAt(lane) : lane.first ? lane.first + later : 0;
  for (const b of others) due = Math.max(due, Math.max(t + Math.ceil(Math.max(0, s.xh - 1.35 - b.x) / Math.max(5, b.vx) / TICK), lane.call ? rackAt(lane) : 0) + later);
  if (!mem.bwGo && eta >= due + 25 + (bot?.lag || 0) && Math.abs(pz - mem.bwLine) < 0.6 && Math.abs(vz) < 1.5) mem.bwGo = true;
  if (mem.bwGo) return roll(pz, vz, mem.bwLine);
  return steer(px, pz, vx, vz, s.xf - 1.4, mem.bwLine);
}

export default {
  id: L.MG_BOWL, key: 'bowl', name: 'BOWLING',
  hint: 'ROLL FROM BEHIND THE FOUL LINE  A POINT A PIN  ALL TEN A STRIKE',
  rules: 'KEEP ROLLING DOWN THE LANE TO KNOCK PINS  MOST POINTS WINS',
  env: 'night',
  quietDown: true, // every roll ends in the pit: the feed says how it went, no DOWN banner

  draw(view, ctx, out) {
    const s = stage(view);
    if (!s) return;
    const g = view.party();
    const sc = out.scene;
    const ptick = typeof ctx?.ptick === 'number' ? ctx.ptick : g.tick + (ctx?.dt || 0) / TICK;
    const ahead = g.state === L.H_PLAY ? Math.max(0, Math.min(60, ptick - g.tick)) : 0;
    const whole = Math.floor(ahead), frac = ahead - whole;
    const ls = lanes(view);
    const W = s.nl * MC.BW_PITCH, zm = s.zl + W / 2;
    const appX = (s.xa + s.xf) / 2, appH = (s.xf - s.xa) / 2;
    // the pit, its back curtain and the pinsetters' masks over the decks, across them all
    sc.box((s.xe + s.xb) / 2, PLAT_Y - 3, zm, (s.xb - s.xe) / 2, 0.5, W / 2, 0, 0.03, 0.03, 0.04, LOOK.MATTE);
    sc.box(s.xb + 0.2, PLAT_Y + 0.5, zm, 0.2, 3.5, W / 2 + MC.BW_DIV / 2, 0, 0.05, 0.05, 0.07, LOOK.MATTE);
    // behind the approaches, the settee's wall
    sc.box(s.xa - 0.3, PLAT_Y + 0.3, zm, 0.3, 0.8, W / 2 + MC.BW_DIV / 2, 0, 0.3, 0.2, 0.14, LOOK.WOOD);
    for (let k = 0; k <= s.nl; k++) {
      const z = s.zl + k * MC.BW_PITCH;
      // a divider capped in blue, its kickback tall along the deck
      sc.box((s.xa + s.xd) / 2, PLAT_Y + (MC.BW_DIVH - 1) / 2, z, (s.xd - s.xa) / 2, (MC.BW_DIVH + 1) / 2, MC.BW_DIV / 2, 0, 0.9, 0.88, 0.82, LOOK.PLASTIC);
      sc.box((s.xa + s.xd) / 2, PLAT_Y + MC.BW_DIVH + 0.03, z, (s.xd - s.xa) / 2, 0.03, MC.BW_DIV / 2 + 0.02, 0, ...CAP, LOOK.PLASTIC);
      sc.box((s.xd + s.xb) / 2, PLAT_Y + 0.3, z, (s.xb - s.xd) / 2, 1.3, MC.BW_DIV / 2, 0, 0.16, 0.12, 0.1, LOOK.WOOD);
    }
    for (const ln of ls) {
      const l = ln.l, zc = laneZ(s, l);
      // the approach (its boards along the lane), the lane, the gutters
      for (const [z0, hw] of [[zc, MC.BW_LW / 2], [zc - MC.BW_LW / 2 - MC.BW_GW / 2, MC.BW_GW / 2], [zc + MC.BW_LW / 2 + MC.BW_GW / 2, MC.BW_GW / 2]])
        sc.box(appX, PLAT_Y - 0.5, z0, appH, 0.5, hw, 0, ...WOOD2, LOOK.WOOD);
      sc.box((s.xf + s.xd) / 2, PLAT_Y - 0.5, zc, (s.xd - s.xf) / 2, 0.5, MC.BW_LW / 2, 0, ...WOOD, LOOK.WOOD);
      for (const e of [-1, 1]) sc.box((s.xf + s.xe) / 2, GY - 0.3, zc + e * (MC.BW_LW / 2 + MC.BW_GW / 2), (s.xe - s.xf) / 2, 0.3, MC.BW_GW / 2, 0, ...GUTTER, LOOK.METAL);
      // the deck: down while its lane's is, up with the fresh ten
      const tc = ln.call ? ptick - ln.call : -1;
      const drop = ln.call ? deckDrop(tc) : 0;
      sc.box((s.xd + s.xe) / 2, PLAT_Y - 0.5 - drop, zc, (s.xe - s.xd) / 2, 0.5, MC.BW_LW / 2, 0, ...DECK, LOOK.WOOD);
      // the foul line, the dots, the arrows
      sc.box(s.xf + 0.05, PLAT_Y + 0.004, zc, 0.05, 0.004, MC.BW_LW / 2, 0, ...INK, LOOK.MATTE);
      for (let i = -2; i <= 2; i++) {
        for (const x of [s.xf - 1.6, s.xf - 5, s.xf + 2.6]) sc.cyl(x, PLAT_Y + 0.004, zc + i * 1.2, 0.07, 0.004, ...INK, LOOK.MATTE);
      }
      for (let i = -3; i <= 3; i++) chevron(sc, s.xf + 11 + (3 - Math.abs(i)) * 0.7, zc + i * 0.75);
      // the pinsetter's mask, and its sweep bar: up in it, down in front of the deck once the lane is called,
      // across the deck as it drops, back up as the fresh ten come
      sc.box((s.xh + 4.4 + s.xb) / 2, PLAT_Y + 3.5, zc, (s.xb - s.xh - 4.4) / 2, 0.45, half + MC.BW_DIV / 2, 0, ...MASK[l & 1], LOOK.MATTE);
      sc.box(s.xh + 4.35, PLAT_Y + 3.05, zc, 0.05, 0.05, half - 0.3, 0, 1, 0.85, 0.5, LOOK.GLOW, ln.call ? 0.4 : 1.2);
      let bx = s.xd + 0.3, byy = PLAT_Y + 2.6;
      if (ln.call) {
        if (tc < MC.BW_SWEEP) byy = PLAT_Y + 2.6 - 2.35 * smooth(tc / (MC.BW_SWEEP * 0.5));
        else if (tc < MC.BW_SWEEP + 40) { byy = PLAT_Y + 0.25; bx = s.xd + 0.3 + (s.xe - s.xd - 0.3) * smooth((tc - MC.BW_SWEEP) / 40); }
        else { bx = s.xe; byy = PLAT_Y + 0.25 + 2.35 * smooth((tc - MC.BW_SWEEP - 40) / (MC.BW_DOWN - 40)); }
      }
      sc.box(bx, byy, zc, 0.08, 0.16, MC.BW_LW / 2 + 0.1, 0, 0.9, 0.8, 0.2, LOOK.HAZARD, 0.4);
      // the fresh ten rising with the deck
      if (ln.call && drop > 0 && tc > MC.BW_SWEEP + MC.BW_DOWN - 25) {
        for (let k = 0; k < 10; k++) { const [dx, dz] = spot(k); drawPin(sc, s.xh + dx, -drop, zc + dz, 1, 0, 0, false, l * 10 + k); }
      }
      // the pins
      for (const p of pins(view, l)) {
        if (p.st === MC.BW_UP) drawPin(sc, p.x, 0, p.z, 1, 0, 0, p.gold, l * 10 + p.k);
        else if (p.st === MC.BW_HIT) {
          const q = g.state === L.H_PLAY ? slide({ ...p }, s, l, whole, frac) : p;
          const age = ptick - p.at;
          const y = q.drop ? -4.9 * ((whole + frac - q.drop) * TICK) ** 2 : 0;
          if (y > -2) drawPin(sc, q.x, y, q.z, p.ux, p.uz, Math.min(1, Math.max(0, age) / MC.BW_TIP) * Math.PI / 2, p.gold, l * 10 + p.k);
        } else if (p.st === MC.BW_DROP) {
          const fall = Math.max(0, ptick - p.at) * TICK;
          if (fall < 0.65) drawPin(sc, p.x, -4.9 * fall * fall, p.z, p.ux, p.uz, Math.min(1, Math.max(0, (ptick - p.at) / MC.BW_TIP + 0.5)) * Math.PI / 2, p.gold, l * 10 + p.k);
        }
      }
    }
  },

  // all the lanes, the approach to the pit
  frame(view) {
    const s = stage(view), g = view.party();
    if (!s) return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size, shape: 'square' };
    return { centre: [(s.xa + s.xb) / 2, PLAT_Y, s.zl + s.nl * MC.BW_PITCH / 2], radius: Math.max(s.xb - s.xa, s.nl * MC.BW_PITCH) / 2 + 1, shape: 'square' };
  },

  // a new round faces you down your lane
  facing() { return 0; },

  // into the pit after a roll: how it went
  sink(f, name, view) {
    const r = slotOf(view, f.owner);
    return `${name(f.owner)} ${r.roll ? `${r.roll} PIN${r.roll > 1 ? 'S' : ''}` : r.rgut ? 'GUTTER BALL' : 'NO PINS'}`;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    const mine = fx.owner === ctx.slot && ctx.slot >= 0;
    const myLane = ctx.view && ctx.slot >= 0 ? slotOf(ctx.view, ctx.slot).lane : -1;
    if (fx.kind === MC.BW_FX_KNOCK) {
      if (d < 70) ctx.sound?.crackle?.(Math.min(2, 14 / (d + 6)));
      if (fx.size > 0 && d < 30) ctx.sound?.melee?.(d);
      if (mine && fx.size > 0) ctx.glow?.({ pos: fx.pos, size: fx.size >= MC.BW_GOLD ? 2.4 : 1.2, color: fx.size >= MC.BW_GOLD ? [1, 0.8, 0.3, 0.9] : [1, 1, 1, 0.6], kind: SPRITE.FLASH, life: 220 });
    } else if (fx.kind === MC.BW_FX_STRIKE) {
      ctx.glow?.({ pos: fx.pos, size: 7, color: [1, 0.85, 0.3, 0.95], kind: SPRITE.RING, life: 800, grow: true });
      ctx.glow?.({ pos: fx.pos, size: 4, color: [1, 1, 0.8, 0.9], kind: SPRITE.SPARK, life: 600 });
      if (mine) { ctx.banner?.('STRIKE!', C.YELLOW, 1400); ctx.sound?.holed?.(); }
      else if (d < 60) ctx.sound?.blast?.(d, 3);
      ctx.feed?.(`${name(fx.owner)} STRIKE  ${fx.size}`, mine ? C.GREEN : C.YELLOW);
    } else if (fx.kind === MC.BW_FX_LANE) {
      const what = fx.shot >> 8, l = fx.shot & 255;
      if (what === MC.BW_WDOUBLE) { ctx.banner?.('DOUBLE PINS', C.YELLOW, 1400); ctx.sound?.count?.(0); }
      else if (l === myLane) {
        if (what === MC.BW_WSWEEP) ctx.sound?.land?.(10);
        else if (what === MC.BW_WRACK) ctx.sound?.tick?.();
      }
    } else if (fx.kind === MC.BW_FX_GUTTER) {
      if (mine) { ctx.banner?.('GUTTER', C.GREY, 700); ctx.sound?.boing?.(3); }
    }
  },

  // double time; your pins and strikes; your lane, its pins as they stand
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const s = stage(view);
    if (!s) return;
    if (g.t >= MC.BW_LEN - MC.BW_DOUBLE) ctx.right(2, 'DOUBLE PINS', C.YELLOW);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    const so = slotOf(view, ctx.slot);
    const ln = lanes(view)[Math.min(so.lane, s.nl - 1)];
    const ps = pins(view, ln.l);
    const up = ps.filter((p) => p.st === MC.BW_UP).length;
    ctx.right(3, `PINS ${so.pins}  STRIKES ${so.strikes}`, C.GREY);
    ctx.right(4, ln.call ? `LANE ${ln.l + 1}  SWEEPING` : `LANE ${ln.l + 1}  ${up} STANDING`, ln.call ? C.CYAN : C.WHITE);
    if (ctx.rect) {
      // the ten as you look down the lane: the head pin nearest you, the back row on top
      const x0 = 320 - 4 - 30, y0 = 5 * 6 + 2;
      ctx.rect(x0 - 2, y0 - 2, x0 + 30, y0 + 25, 0.02, 0.03, 0.07, 0.7);
      for (const p of ps) {
        const r = (p.k >= 1) + (p.k >= 3) + (p.k >= 6), i = p.k - (r * (r + 1)) / 2;
        const cx = x0 + 13 + (i - r / 2) * 7, cy = y0 + (3 - r) * 6;
        const c = p.st !== MC.BW_UP || ln.call ? [0.25, 0.25, 0.3] : p.gold ? GOLDEN : [1, 1, 1];
        ctx.rect(cx, cy, cx + 4, cy + 4, ...c, 1);
      }
    }
  },

  brain: {
    // a gutter past the foul line is a lost roll
    danger(view, x, z) {
      const s = stage(view);
      if (!s || x < s.xf) return 0;
      return Math.abs(laneAt(s, z)[1]) > MC.BW_LW / 2 - 0.4 ? 1 : 0;
    },
    // the front of its lane's approach, on the pocket
    goal(view, me) {
      const s = stage(view);
      if (!s || !me) return null;
      const [l] = laneAt(s, me.pos[2]);
      return [s.xf - 1.4, laneZ(s, l) + (me.slot & 1 ? -POCKET : POCKET)];
    },
    hop() { return false; },
    think,
  },
};
