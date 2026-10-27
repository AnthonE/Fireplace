// MINGLE, as drawn and as the AI ball sees it. A pastel hall: a carousel of
// painted spokes in the middle, turning with the music, its rim lights
// chasing round; the hall's sides each a coloured wall with a door and a
// room behind it, open to the sky. Over each door a lamp: dark while shut,
// green while open, flashing the last second before the slam, orange as the
// room shoves everyone out, grey and the door striped once the room has
// closed for good; and over an open room's door a row of lights, one for
// each place the number calls, lit for each ball inside (red past it).
// Doors slide aside as they open and slam back.
// A ball the slam puts out drops through a trapdoor. The clock is the sim's
// (src/mg/mingle.wat: $mi_when, from the round's seed) worked on the
// prediction's tick, so a door opens on the same tick of your own ball
// whatever your lag; which rooms open and the number are the header's.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/mingle.mjs'; // MI_*: the minigame's own constants
import { PLAT_Y, seed as pseed } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL, COLS } from '../party-render.mjs';
import { C } from '../font.mjs';

const f = Math.fround;
const TICK = 0.008;
const TAU = 2 * Math.PI;
const BALL_R = 1;
const WT = MC.MI_WT, WH = MC.MI_WH;
const HALF_WD = MC.MI_WD / 2, HALF_WI = MC.MI_WI / 2;
const ROOM_COLS = [[0.96, 0.55, 0.66], [0.55, 0.78, 0.95], [0.98, 0.85, 0.45], [0.6, 0.88, 0.62], [0.78, 0.62, 0.95], [0.98, 0.68, 0.45], [0.5, 0.88, 0.85], [0.95, 0.62, 0.85]];
const WEDGE = [[0.95, 0.35, 0.42], [0.98, 0.93, 0.85], [0.3, 0.62, 0.92], [0.98, 0.93, 0.85], [0.98, 0.78, 0.25], [0.98, 0.93, 0.85]];
const slotColor = (s) => { const h = (s * 0.618034) % 1; return [0, 0.33, 0.67].map((o) => 0.55 + 0.4 * Math.cos(6.2832 * (h + o))); };
export const PHASE = { MUSIC: MC.MI_MUSIC, OPEN: MC.MI_OPEN, SHUT: MC.MI_SHUT, OUT: MC.MI_OUT };

// ---- the sim's header and rooms, read as they are

// The round's hall and its cycle on the view's bank (PG_H), and where play started.
export function stage(view) {
  const dv = view.dv, o = view.bank || 0;
  const u = (k) => dv.getUint32(L.PG_H + k + o, true), r = (k) => dv.getFloat32(L.PG_H + k + o, true);
  return {
    rc: r(MC.MI_RC), a: r(MC.MI_A), ro: r(MC.MI_RO), hs: r(MC.MI_HS), K: Math.min(u(MC.MI_K), MC.MI_KMAX), off: u(MC.MI_OFF),
    cycle: u(MC.MI_CYC), c0: u(MC.MI_C0), num: u(MC.MI_NUM), nopen: u(MC.MI_NOPEN), nlive: u(MC.MI_NLIVE), n: u(MC.MI_N),
    safe: u(MC.MI_SAFE), lost: u(MC.MI_LOST),
    open: [u(MC.MI_OPENM), u(MC.MI_OPENM + 4)], live: [u(MC.MI_LIVEM), u(MC.MI_LIVEM + 4)],
    cx: dv.getFloat32(L.PG_CX + o, true), t0: dv.getUint32(L.HDR_START + o, true), state: dv.getUint32(L.HDR_STATE + o, true),
    seed: (k) => pseed(view, k),
  };
}
const bit = (m, k) => ((k < 32 ? m[0] >>> k : m[1] >>> (k - 32)) & 1) === 1;
// The rooms: each one's bearing (cos, sin, from PG_S, the confirmed world's), open this cycle, live.
export function roomsOf(view, st = stage(view)) {
  const dv = view.dv, out = [];
  for (let k = 0; k < st.K; k++) {
    const c = dv.getFloat32(L.PG_S + MC.MI_DIRS + 8 * k, true), s = dv.getFloat32(L.PG_S + MC.MI_DIRS + 8 * k + 4, true);
    out.push({ k, c, s, yaw: Math.atan2(s, c), open: bit(st.open, k), live: bit(st.live, k), col: ROOM_COLS[k % ROOM_COLS.length] });
  }
  return out;
}
// $mi_music, $mi_win, $mi_len: cycle c's music, scramble and whole length, in ticks.
export const musicOf = (st, c) => MC.MI_M0 + (st.seed(MC.MI_KMUSIC + c) % (MC.MI_M1 - MC.MI_M0 + 1));
export const winOf = (c) => Math.max(MC.MI_W1, MC.MI_W0 - MC.MI_WK * Math.min(c, 64));
export const lenOf = (st, c) => musicOf(st, c) + winOf(c) + MC.MI_HOLD + MC.MI_EJECT;
// $mi_when: tick t into play (whole), counted on from the header's cycle: its phase, cycle, start, and its moments.
export function when(st, t) {
  let c = st.cycle, c0 = st.c0;
  for (let k = 0; k < 64 && t >= c0 + lenOf(st, c); k++) { c0 += lenOf(st, c); c++; }
  const stop = c0 + musicOf(st, c), slam = stop + winOf(c), back = slam + MC.MI_HOLD, end = back + MC.MI_EJECT;
  const ph = t < stop ? MC.MI_MUSIC : t < slam ? MC.MI_OPEN : t < back ? MC.MI_SHUT : MC.MI_OUT;
  return { ph, c, c0, stop, slam, back, end, own: c === st.cycle };
}
// $mi_omega: the carousel's turn in rad/s, e ticks into cycle c's music (positive: +x toward +z).
export function omega(st, c, e) {
  const m = musicOf(st, c);
  if (e < 0 || e >= m) return 0;
  const k = Math.min(e, m - e, MC.MI_RAMP);
  const w = (MC.MI_VRIM / st.rc) * (k / MC.MI_RAMP);
  return st.seed(MC.MI_KDIR + c) & 1 ? -w : w;
}
// (x, z) in room r's own frame, as the sim works it in f32: u out along its bearing, w across.
export function frame(st, r, x, z) {
  const dx = f(x - st.cx), dz = f(z - st.cx);
  return [f(f(dx * r.c) + f(dz * r.s)), f(f(dz * r.c) - f(dx * r.s))];
}
const IN_U = f(MC.MI_DI + 2 * MC.MI_WT), IN_W = f(MC.MI_WI / 2 + MC.MI_WT);
// $mi_inside: past the door's line, short of the back, between the sides.
export function inside(st, r, x, z) {
  const [u, w] = frame(st, r, x, z);
  return u > st.a && u < f(st.a + IN_U) && Math.abs(w) < IN_W;
}
// The open room (x, z) is inside, or -1 (the rooms don't overlap: any order finds the sim's).
export function roomAt(st, rooms, x, z) {
  for (const r of rooms) if (r.open && inside(st, r, x, z)) return r.k;
  return -1;
}
// $mi_slam's count, of balls at pos(p) -> [x, y, z] or null (not in): the room each is in and each room's count.
export function count(st, rooms, pos) {
  const of = new Int16Array(L.NPLAYER).fill(-1), cnt = new Uint16Array(Math.max(1, st.K));
  for (let p = 0; p < L.NPLAYER; p++) {
    const b = pos(p);
    if (!b) continue;
    const k = roomAt(st, rooms, b[0], b[2]);
    if (k >= 0) { of[p] = k; cnt[k]++; }
  }
  return { of, cnt };
}
// The slams slot p has lived through this round, the room it was safe in at the last (-1 none), each room's last count.
export const saved = (view, p) => view.u8[L.PG_S + MC.MI_SAVED + p];
export const safeIn = (view, p) => { const k = view.u8[L.PG_S + MC.MI_ROOMOF + p]; return k === 255 ? -1 : k; };
export const lastCount = (view, k) => view.u8[L.PG_S + MC.MI_CNT + k];
const inAt = (view, b) => (view.u8[b + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) === L.PF_LIVE;
const ballPos = (view, p) => {
  const b = L.PLAYERS + (view.bank || 0) + p * L.PSIZE;
  return inAt(view, b) ? [view.dv.getFloat32(b + L.P_PX, true), view.dv.getFloat32(b + L.P_PY, true), view.dv.getFloat32(b + L.P_PZ, true)] : null;
};

// Ticks into play to draw at, on the prediction's clock (fractional), or -1 before play; frozen where the round ended.
function playTime(view, g, ctx) {
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return -1;
  let t = typeof ctx?.ptick === 'number' ? ctx.ptick - g.start : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}
// How far a door has slid open on tick tp into play (fractional): 0 shut, 1 open; it slams in its last 6 ticks.
function doorOpen(w, r, tp) {
  if (!r.open || !w.own) return 0;
  const ease = (a, b) => Math.max(0, Math.min(1, (tp - a) / (b - a)));
  if (w.ph === MC.MI_OPEN) return Math.min(ease(w.stop, w.stop + 18), 1 - ease(w.slam - 6, w.slam));
  if (w.ph === MC.MI_OUT) return Math.min(ease(w.back, w.back + 12), 1 - ease(w.end - 6, w.end));
  return 0;
}

// ---- drawing

const look = { spin: 0, at: -1, tp: -1, me: null, w: 0 }; // the carousel's turn, the last frame's clock and ball (for the HUD)

// A box in room r's frame: centre (u, w), half extents along u and w, height from y0 to y1.
function rbox(sc, st, r, u, w, hu, hw, y0, y1, col, lk, a = 0, b = 0, alpha = 1, seed) {
  const x = st.cx + u * r.c - w * r.s, z = st.cx + u * r.s + w * r.c;
  sc.box(x, (y0 + y1) / 2, z, hu, (y1 - y0) / 2, hw, r.yaw, col[0], col[1], col[2], lk, a, b, alpha, seed);
}

// The floor and the carousel, its wedges turned by look.spin, its rim lights chasing with the music.
function floor(out, st, now) {
  const sc = out.scene, cx = st.cx;
  sc.cyl(cx, PLAT_Y - 0.5, cx, st.ro, 0.5, 0.86, 0.8, 0.84, LOOK.MATTE);
  sc.cyl(cx, PLAT_Y - 0.48, cx, st.rc, 0.5, 0.95, 0.9, 0.82, LOOK.PLASTIC);
  const n = Math.max(12, Math.min(36, Math.round(st.rc * 1.2 / 2) * 2));
  for (let i = 0; i < n; i++) {
    const a = look.spin + (i + 0.5) / n * TAU, col = WEDGE[i % WEDGE.length];
    const half = Math.PI * st.rc / n * 0.5;
    sc.box(cx + Math.cos(a) * st.rc * 0.55, PLAT_Y + 0.012, cx + Math.sin(a) * st.rc * 0.55, st.rc * 0.42, 0.012, half, a, col[0], col[1], col[2], LOOK.PLASTIC, 0, 0, 1, i);
  }
  sc.cyl(cx, PLAT_Y + 0.02, cx, Math.min(2.5, st.rc * 0.2), 0.02, 0.98, 0.78, 0.25, LOOK.METAL);
  out.decals.push({ pos: [cx, PLAT_Y + 0.02, cx], radius: st.rc, width: 0.35, color: [1, 0.9, 0.6, 0.8], kind: DECAL.RING });
  const m = Math.max(16, Math.round(st.rc * 1.5));
  for (let i = 0; i < m; i++) {
    const a = look.spin + i / m * TAU;
    const lit = look.w > 0.05 ? 0.4 + 1.6 * look.w * (((i + Math.floor(now / 120)) % 3) === 0 ? 1 : 0.2) : 0.25;
    sc.sphere(cx + Math.cos(a) * (st.rc - 0.35), PLAT_Y + 0.08, cx + Math.sin(a) * (st.rc - 0.35), 0.16, 1, 0.85, 0.55, LOOK.GLOW, lit, 0, 1, i);
  }
}

// Room r's walls, its door (slid aside by how far it's open), its floor, the lamp over the door and its count lights.
function room(out, st, r, w, tp, cnt, num, now) {
  const sc = out.scene, a = st.a, hs = st.hs;
  const col = r.live ? r.col : [0.62, 0.6, 0.62];
  const wall = [col[0] * 0.8 + 0.15, col[1] * 0.8 + 0.15, col[2] * 0.8 + 0.15];
  const y0 = PLAT_Y, y1 = PLAT_Y + WH;
  // the side of the hall either side of the door, to past its corners
  const side = (hs - HALF_WD) / 2;
  rbox(sc, st, r, a, HALF_WD + side, WT, side, y0, y1, wall, LOOK.MATTE, 0, 0, 1, r.k * 8);
  rbox(sc, st, r, a, -HALF_WD - side, WT, side, y0, y1, wall, LOOK.MATTE, 0, 0, 1, r.k * 8 + 1);
  // the room: its sides, its back and its floor
  const du = MC.MI_DI + 2 * WT;
  rbox(sc, st, r, a + WT + du / 2, HALF_WI + WT, du / 2, WT, y0, y1, wall, LOOK.MATTE, 0, 0, 1, r.k * 8 + 2);
  rbox(sc, st, r, a + WT + du / 2, -HALF_WI - WT, du / 2, WT, y0, y1, wall, LOOK.MATTE, 0, 0, 1, r.k * 8 + 3);
  rbox(sc, st, r, a + MC.MI_DI + 2 * WT, 0, WT, HALF_WI + 2 * WT, y0, y1, wall, LOOK.MATTE, 0, 0, 1, r.k * 8 + 4);
  rbox(sc, st, r, a + WT + MC.MI_DI / 2, 0, MC.MI_DI / 2, HALF_WI, y0 - 0.02, y0 + 0.01, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], LOOK.WOOD, 0, 0, 1, r.k * 8 + 5);
  // the door: slid aside into the wall as it opens; a room closed for good is boarded with stripes
  const o = doorOpen(w, r, tp);
  if (o < 0.999) {
    rbox(sc, st, r, a, MC.MI_WD * o, WT * 0.8, HALF_WD, y0, y1 - 0.05, r.live ? [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55] : [0.9, 0.75, 0.2],
      r.live ? LOOK.PLASTIC : LOOK.HAZARD, r.live ? 0 : 0.5, 0, 1, r.k * 8 + 6);
  }
  // the lamp: green open, flashing as the slam nears, dark shut, grey for good
  let lc = [0.25, 0.08, 0.08], glow = 0.15;
  if (!r.live) { lc = [0.4, 0.4, 0.4]; glow = 0; } else if (o > 0.01 && w.ph === MC.MI_OPEN) {
    const flash = w.slam - tp < 125 && Math.floor(now / 90) % 2 === 0;
    lc = flash ? [1, 0.85, 0.2] : [0.25, 1, 0.4]; glow = 1.6;
  } else if (o > 0.01) { lc = [1, 0.6, 0.2]; glow = 1; }
  rbox(sc, st, r, a - WT - 0.05, 0, 0.12, 0.45, y1 - 0.45, y1 - 0.05, lc, LOOK.GLOW, glow, 0.4, 1, r.k * 8 + 7);
  // the count: a light for each place called, lit for each ball inside
  if (r.open && w.own && (w.ph === MC.MI_OPEN || w.ph === MC.MI_SHUT) && num > 0) {
    const n = Math.min(num, 8), over = cnt > num;
    for (let i = 0; i < n; i++) {
      const lit = i < cnt;
      const c = over ? [1, 0.2, 0.15] : lit ? (cnt === num ? [0.3, 1, 0.45] : [1, 0.9, 0.3]) : [0.25, 0.25, 0.3];
      const x = (i - (n - 1) / 2) * 0.55;
      rbox(sc, st, r, a - WT - 0.08, x, 0.06, 0.2, y1 + 0.25, y1 + 0.65, c, LOOK.GLOW, lit || over ? 1.8 : 0.1, 0.3, 1, 1000 + r.k * 8 + i);
    }
  }
}

// The balls the slam put out, dropping through trapdoors where they stood, for a second.
function trapdoors(view, ctx, out) {
  const now = ctx.tick + (ctx.dt || 0) / TICK;
  const d = view.dv;
  for (let p = 0; p < L.NPLAYER; p++) {
    const b = L.PLAYERS + p * L.PSIZE;
    if ((view.u8[b + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== (L.PF_LIVE | L.PF_DEAD)) continue;
    const age = (now - d.getUint32(b + L.B_OUTAT, true)) * TICK;
    const y0 = d.getFloat32(b + L.P_PY, true);
    if (age < 0 || age > 1.2 || y0 < PLAT_Y - 2) continue;
    const x = d.getFloat32(b + L.P_PX, true), z = d.getFloat32(b + L.P_PZ, true);
    out.decals.push({ pos: [x, PLAT_Y + 0.03, z], radius: 1.35, width: 0.3, color: [0, 0, 0, 0.95 * (1 - age / 1.2)], kind: DECAL.DISC });
    if (age > 0.9) continue;
    const y = y0 - 0.5 * 24 * age * age;
    const col = [...slotColor(p), 1];
    out.solid.push({ pos: [x, y + BALL_R, z], size: BALL_R, color: col, kind: SPRITE.BALL, minpx: 1, vel: [0, 0, 0], roll: 0, seed: p });
    out.solid.push({ pos: [x, y + 2 * BALL_R + 0.22, z], size: 0.34, color: col, kind: SPRITE.BODY, minpx: 1 });
    out.solid.push({ pos: [x, y + 2 * BALL_R + 0.78, z], size: 0.3, color: col, kind: SPRITE.HEAD, minpx: 1, vel: [1, 0, 0] });
  }
}

// ---- the AI ball

const MINDS = new WeakMap();
const SLOT_MINDS = [];
function mindOf(bot, slot) {
  if (bot && typeof bot === 'object') {
    if (bot.mem && typeof bot.mem === 'object') return (bot.mem.mi ||= { c: -1 });
    let m = MINDS.get(bot);
    if (!m) MINDS.set(bot, (m = { c: -1 }));
    return m;
  }
  return (SLOT_MINDS[slot] ||= { c: -1 });
}
// A number in [0, 1) for this ball, this cycle and k: its own luck.
const luck = (slot, c, k, s) => (((Math.imul(slot * 977 + k, 0x9e3779b1) ^ Math.imul(c + 1, 0x85ebca6b) ^ s) >>> 0) % 100003) / 100003;
// What every bot looking at one world tick shares: the rooms, the balls in, which open room each is inside
// and each room's count, and the rooms the AI balls not yet in one are making for (what a player sees them do).
let world = null;
const AIMS = { key: '', aim: new Int16Array(L.NPLAYER).fill(-1), room: new Int16Array(L.NPLAYER).fill(-1), since: new Int32Array(L.NPLAYER) };
function worldOf(view, st) {
  const key = `${view.tick}:${view.bank || 0}:${st.cycle}:${st.t0}`;
  if (world?.key === key && world.buf === view.dv.buffer) return world;
  const ck = `${st.t0}:${st.cycle}`;
  if (AIMS.key !== ck || AIMS.buf !== view.dv.buffer) { AIMS.key = ck; AIMS.buf = view.dv.buffer; AIMS.aim.fill(-1); AIMS.room.fill(-1); }
  const rooms = roomsOf(view, st);
  const balls = [];
  for (let p = 0; p < L.NPLAYER; p++) { const b = ballPos(view, p); if (b) balls.push([p, b[0], b[2]]); }
  const { of, cnt } = count(st, rooms, (p) => ballPos(view, p));
  // since when each ball has been in the room it's in: who came in last, as anyone watching the door saw
  for (let p = 0; p < L.NPLAYER; p++) {
    if (of[p] !== AIMS.room[p]) { AIMS.room[p] = of[p]; AIMS.since[p] = view.tick; }
  }
  // each room's AI balls on their way, as [slot, metres from its door]
  const coming = rooms.map(() => []);
  for (const [p, x, z] of balls) {
    const k = AIMS.aim[p];
    if (of[p] < 0 && k >= 0 && k < st.K) coming[k].push([p, Math.hypot(x - (st.cx + (st.a - 2.4) * rooms[k].c), z - (st.cx + (st.a - 2.4) * rooms[k].s))]);
  }
  world = { key, buf: view.dv.buffer, rooms, balls, of, cnt, coming };
  return world;
}

// What the ball wants on tick `tick` (the one its word is for): where to be,
// how fast, and whether to brake there. Through the music it rides the
// carousel, keeping to a ring of it; once the doors open (and it notices: a
// reaction time by its skill) it counts each open room's balls and picks the
// one it reaches soonest with a place left after those inside and those
// nearer it making for it, a filling one first; with none, it keeps clear of
// the doors (one in five pushes in anyway). At a door it waits a step back
// for whoever is nearer its front, then goes in and holds a place, the first
// in at the back. In a room over the number the last in goes for another
// with a place, or gives its place up (or, spiteful, fights for one deeper);
// those in before it shove it out through the door. Through the slam and
// the shove, no keys.
function plan(view, me, bot, tick) {
  const dv = view.dv, o = view.bank || 0;
  const slot = typeof me === 'number' ? me : me?.slot;
  if (dv.getUint32(L.HDR_STATE + o, true) !== L.H_PLAY || !(slot >= 0)) return null;
  const rb = L.PLAYERS + o + slot * L.PSIZE;
  if ((view.u8[rb + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) return null;
  const st = stage(view);
  if (!(st.a > 0) || !st.K) return null;
  const t = Math.max(0, (tick - st.t0) | 0);
  const w = when(st, t);
  const skill = bot?.skill ?? 0.6;
  const mind = mindOf(bot, slot);
  const lag = Math.max(0, Math.min(40, (tick - view.tick) | 0)) * TICK;
  const vel = bot?.vel ? [bot.vel[0], bot.vel[1]] : [dv.getFloat32(rb + L.P_VX, true), dv.getFloat32(rb + L.P_VZ, true)];
  const pos = bot?.pos ? [bot.pos[0], bot.pos[1]] : [dv.getFloat32(rb + L.P_PX, true) + vel[0] * lag, dv.getFloat32(rb + L.P_PZ, true) + vel[1] * lag];
  const seed = dv.getUint32(L.HDR_SEED + o, true);
  if (mind.c !== w.c || mind.t0 !== st.t0) {
    mind.c = w.c;
    mind.t0 = st.t0;
    mind.react = w.stop + Math.round((0.2 + 0.7 * (1 - skill) * luck(slot, w.c, 1, seed)) / TICK);
    mind.target = -1;
    mind.at = -1e9;
    mind.ring = 0.45 + 0.35 * luck(slot, w.c, 2, seed);
    mind.bold = luck(slot, w.c, 3, seed) < 0.3 + 0.5 * skill;
    mind.spite = luck(slot, w.c, 4, seed) < 0.2;
  }
  const cx = st.cx, rho = Math.hypot(pos[0] - cx, pos[1] - cx);
  const res = (goal, vmax, brake = true) => ({ goal, vmax, brake, pos, vel, slot });
  const W = worldOf(view, st);
  const AIM = AIMS.aim;
  // making for room k (-1 none): the world this tick hears of it at once, so the AI balls thinking after it see it
  const aim = (k) => {
    const old = AIM[slot];
    if (old === k) return;
    if (old >= 0 && W.coming[old]) { const i = W.coming[old].findIndex((e) => e[0] === slot); if (i >= 0) W.coming[old].splice(i, 1); }
    if (k >= 0 && W.of[slot] < 0 && W.coming[k]) W.coming[k].push([slot, Math.hypot(pos[0] - (cx + (st.a - 2.4) * W.rooms[k].c), pos[1] - (cx + (st.a - 2.4) * W.rooms[k].s))]);
    AIM[slot] = k;
  };
  // the music, or the doors open and it hasn't noticed: ride the carousel on its ring
  if (w.ph === MC.MI_MUSIC || (w.ph === MC.MI_OPEN && t < mind.react) || !w.own) {
    aim(-1);
    const want = st.rc * mind.ring;
    if (rho > st.rc - 1.2 || Math.abs(rho - want) > 3) {
      const k = rho > 1e-3 ? want / rho : 0;
      return res([cx + (pos[0] - cx) * k, cx + (pos[1] - cx) * k], 6);
    }
    return { hold: true, pos, vel, slot };
  }
  // slammed shut, or the rooms shoving: let it be
  if (w.ph !== MC.MI_OPEN) { aim(-1); return { hold: true, pos, vel, slot }; }
  const num = st.num;
  const remain = (w.slam - t) * TICK;
  const rooms = W.rooms;
  const here = roomAt(st, rooms, pos[0], pos[1]);
  // the i-th place in room r: rows of two from the back
  const spot = (r, i) => {
    const row = Math.floor(i / 2), su = st.a + WT + MC.MI_DI - 1.15 - 1.95 * Math.min(row, 2), sw = num === 1 ? 0 : (i % 2 ? 1.2 : -1.2);
    return [cx + su * r.c - sw * r.s, cx + su * r.s + sw * r.c];
  };
  const doorFront = (r, back = 2.4) => [cx + (st.a - back) * r.c, cx + (st.a - back) * r.s];
  // the room it would make for from outside (or leaving one): the one it reaches soonest with a place
  // left after those inside and those nearer it making for it, a filling one first
  const choose = (skip) => {
    let best = -1, bs = Infinity, bshort = 0;
    for (const r of rooms) {
      if (!r.open || r.k === skip) continue;
      const k = r.k, [fx, fz] = doorFront(r), dd = Math.hypot(fx - pos[0], fz - pos[1]);
      const eta = (dd + (here >= 0 ? 4 : 0) + 3) / 8;
      let ahead = 0;
      for (const [p, d] of W.coming[k]) if (p !== slot && d < dd) ahead++;
      const short = num - W.cnt[k] - ahead; // places left when it gets there, after those inside and those ahead of it
      let s = eta;
      if (eta > remain - 0.3) s += 20;
      if (short <= 0) s += 3 + 2 * -short;
      else s -= 0.4 * Math.min(1, W.cnt[k] / Math.max(1, num));
      if (k === mind.target) s -= 0.8;
      s += 0.6 * (1 - skill) * luck(slot, w.c, 100 + k, seed);
      if (s < bs) { bs = s; best = k; bshort = short; }
    }
    return { k: best, s: bs, short: bshort };
  };
  if (here >= 0) {
    // inside: who's in, the last in first (itself, if it's only just in by its own reckoning), then nearest the door
    const r = rooms[here];
    const late = view.tick + 1;
    const inn = [[slot, frame(st, r, pos[0], pos[1])[0], W.of[slot] === here ? AIMS.since[slot] : late]];
    for (const [p, x, z] of W.balls) if (p !== slot && W.of[p] === here) inn.push([p, frame(st, r, x, z)[0], AIMS.since[p]]);
    inn.sort((x, y) => y[2] - x[2] || x[1] - y[1] || x[0] - y[0]);
    const excess = inn.length - num;
    aim(here);
    if (excess > 0) {
      const rank = inn.findIndex((e) => e[0] === slot);
      if (rank < excess) {
        // one too many, and it's one of them: elsewhere if there's a place in time, else in deeper
        if (mind.target === here || t - mind.at >= 16) { mind.at = t; const c = choose(here); mind.leave = c.s < 6 ? c.k : -1; }
        if (mind.leave >= 0) { mind.target = mind.leave; aim(mind.leave); return res(doorFront(r, 3), 10, false); }
        // nowhere: a spiteful one fights for a place deeper in; the rest give it up rather than sink the room
        if (mind.spite) return res(spot(r, 0), 8, false);
        mind.gaveUp = w.c;
        aim(-1);
        return res(doorFront(r, 4), 9, false);
      }
      // the rest shove the one too many nearest the door out through it (for one, the deeper keeps it: stay deep)
      let e = 0;
      for (let i = 1; i < excess; i++) if (inn[i][1] < inn[e][1]) e = i;
      const extra = ballPos(view, inn[e][0]);
      if (num > 1 && extra && (mind.bold || rank === excess)) return res([extra[0] - 1.6 * r.c, extra[2] - 1.6 * r.s], mind.bold ? 10 : 7, false);
    }
    // its place: the first in at the back, the last nearest the door, so none of them stands in a newcomer's way
    mind.target = here;
    const order = inn.slice().sort((x, y) => x[2] - y[2] || x[0] - y[0]).map((x) => x[0]);
    return res(spot(r, order.indexOf(slot)), 7);
  }
  if (mind.target < 0 || t - mind.at >= 16 || !rooms[mind.target]?.open) {
    mind.at = t;
    const c = choose(-1);
    // no room with a place for it: only a spiteful one pushes in anyway; the rest keep clear of the doors
    mind.target = (mind.gaveUp === w.c && c.s >= 6) || (c.short <= 0 && !mind.spite) ? -1 : c.k;
    aim(mind.target);
  }
  if (mind.target < 0) {
    const k = rho > 1e-3 ? (st.rc + 1) / rho : 0;
    return rho > st.rc + 2 ? res([cx + (pos[0] - cx) * k, cx + (pos[1] - cx) * k], 5) : { hold: true, pos, vel, slot };
  }
  const r = rooms[mind.target];
  const [u, wv] = frame(st, r, pos[0], pos[1]);
  // to the front of its door; within a few metres of it, lined up, straight in; then to a place at the back
  if (u < st.a - 3.5) return res(doorFront(r), 10, false);
  // one ball through a door at a time: someone nearer its front than this, and time yet, wait a step back
  const [fx, fz] = doorFront(r), mine = Math.hypot(fx - pos[0], fz - pos[1]);
  const nearer = ([p, x, z]) => {
    if (p === slot || W.of[p] >= 0 || AIM[p] !== r.k) return false;
    const d = Math.hypot(fx - x, fz - z);
    return d < 4 && (d < mine || (d === mine && p < slot));
  };
  if (remain > 2 && mine > 0.8 && W.balls.some(nearer)) {
    const ww = Math.max(-2.5, Math.min(2.5, wv));
    return res([cx + (st.a - 4.6) * r.c - ww * r.s, cx + (st.a - 4.6) * r.s + ww * r.c], 5);
  }
  if (u < st.a + 0.5) {
    if (Math.abs(wv) > HALF_WD - 0.6 - Math.max(0, st.a - u) * 0.25) return res(doorFront(r, 2.4 + Math.max(0, u - st.a + 2.4) * 0.5), 8, false);
    return res([cx + (st.a + 2) * r.c, cx + (st.a + 2) * r.s], 9, false);
  }
  return res(spot(r, Math.min(num - 1, W.cnt[r.k])), 8);
}

// Push for the velocity that gets to the goal (and stops there, if braking):
// full speed while far, slowing as it closes, no keys once it's there.
function steer(p, last) {
  if (p.hold) return { yaw: last ?? 0, move: 0, hop: 0, use: 0 };
  const dx = p.goal[0] - p.pos[0], dz = p.goal[1] - p.pos[1], d = Math.hypot(dx, dz);
  const want = p.brake ? Math.min(p.vmax, Math.sqrt(2 * 6.5 * Math.max(0, d - 0.15))) : p.vmax;
  const vx = d > 1e-6 ? (dx / d) * want : 0, vz = d > 1e-6 ? (dz / d) * want : 0;
  const ax = vx - p.vel[0], az = vz - p.vel[1];
  if (Math.hypot(ax, az) < 0.6) return { yaw: last ?? 0, move: 0, hop: 0, use: 0 };
  return { yaw: Math.atan2(az, ax), move: 1, hop: 0, use: 0 };
}

export default {
  id: L.MG_MINGLE, key: 'mingle', name: 'MINGLE',
  hint: 'A NUMBER IS CALLED  GET INTO A ROOM WITH EXACTLY THAT MANY IN IT',
  rules: 'NOT IN A ROOM OF EXACTLY THE NUMBER AT THE SLAM AND YOU ARE OUT',
  env: 'sunset',

  draw(view, ctx, out) {
    const st = stage(view);
    if (!(st.a > 0) || !st.K) return;
    const g = view.party();
    const tp = playTime(view, g, ctx);
    const now = ctx?.now ?? 0;
    const ms = Math.min(100, Math.max(0, ctx?.ms ?? 16));
    const w = when(st, Math.max(0, Math.floor(tp)));
    // the carousel turns at the sim's rate while the music plays
    const om = tp < 0 || g.state !== L.H_PLAY ? 0 : omega(st, w.c, tp - w.c0);
    look.spin = (look.spin + om * ms / 1000) % (TAU * 64);
    look.w = tp < 0 ? 0 : Math.min(1, Math.abs(om) * st.rc / MC.MI_VRIM);
    look.tp = tp;
    look.me = ctx?.pme && !ctx.pme.out ? ctx.pme : ctx?.me ?? null;
    look.at = now;
    floor(out, st, now);
    const rooms = roomsOf(view, st);
    let cnt = null;
    if (tp >= 0 && w.own && (w.ph === MC.MI_OPEN || w.ph === MC.MI_SHUT)) {
      const me = ctx.pme && !ctx.pme.out ? ctx.pme : null;
      cnt = count(st, rooms, (p) => (me && p === ctx.slot ? me.pos : ballPos(view, p))).cnt;
      if (w.ph === MC.MI_SHUT && tpDone(view, st, w)) cnt = Uint16Array.from(rooms, (r) => lastCount(view, r.k));
    }
    const num = tp >= w.stop ? st.num : 0;
    for (const r of rooms) room(out, st, r, w, tp < 0 ? -1 : tp, cnt ? cnt[r.k] : 0, num, now);
    trapdoors(view, ctx, out);
  },

  // the hall to its rooms' backs
  frame(view) {
    const st = stage(view);
    const g = view.party();
    const cx = st.a > 0 ? st.cx : g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: st.a > 0 ? st.a + MC.MI_DI + 1 : g.size, shape: 'disc' };
  },

  // the music, only while it plays (on the prediction's clock, as the doors open)
  music(view, ptick) {
    const st = stage(view);
    if (st.state !== L.H_PLAY || !(st.a > 0)) return true;
    return when(st, Math.max(0, ((ptick ?? view.tick) - st.t0) | 0)).ph === MC.MI_MUSIC;
  },

  fx(fx, ctx) {
    if (fx.kind === MC.MI_FX_CALL) {
      ctx.banner?.(fx.shot === 1 ? 'ONE!  ALONE IN A ROOM' : `${fx.shot}!  ROOMS OF ${fx.shot}`, C.YELLOW, 1800);
      ctx.sound?.count?.(0);
    } else if (fx.kind === MC.MI_FX_SLAM) {
      ctx.sound?.land?.(30);
      if (fx.shot === 0) { ctx.banner?.('NOBODY MADE IT  AGAIN', C.ORANGE, 1800); return; }
      if (fx.size) ctx.feed?.(`${fx.size} OUT AT THE SLAM`, C.GREY);
      const k = ctx.slot >= 0 ? ctx.view?.u8?.[L.PG_S + MC.MI_ROOMOF + ctx.slot] : 255;
      const b = ctx.slot >= 0 ? ctx.view?.partier?.(ctx.slot) : null;
      if (k !== undefined && k !== 255 && b && !b.out) { ctx.banner?.('SAFE!', C.GREEN, 1200); ctx.sound?.pickup?.(); }
    } else if (fx.kind === MC.MI_FX_MUSIC) {
      if (fx.shot > 0) ctx.sound?.tick?.();
    } else if (fx.kind === MC.MI_FX_BONK) {
      if (fx.owner === ctx.slot || ctx.dist < 25) ctx.sound?.boing?.(Math.min(1, fx.size / 10));
    }
  },

  // out at the slam: in a room of the wrong number, nearest the door of one over it, or in none
  sink(f, name, view) {
    const st = stage(view);
    if (!(st.a > 0)) return null;
    const who = name(f.owner), was = who === 'YOU' ? 'WERE' : 'WAS';
    if (view.u8[L.PG_S + MC.MI_TRIM + f.owner]) return `${who} ${was} NEAREST THE DOOR`;
    const k = view.u8[L.PG_S + MC.MI_ROOMOF + f.owner];
    if (k === 255) return `${who} ${was} LEFT OUT`;
    const n = lastCount(view, k), d = n - st.num;
    return `${who} ${was} ONE OF ${n}  ${Math.abs(d) === 1 ? 'ONE' : Math.abs(d)} ${d > 0 ? 'TOO MANY' : 'SHORT'}`;
  },

  // the music or the number and its clock, your room's count, the last slam
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const st = stage(view);
    if (!(st.a > 0) || !st.K) return;
    const fresh = look.tp >= 0 && Math.abs((ctx.now ?? look.at) - look.at) < 200;
    const tp = fresh ? look.tp : ctx.t ? ctx.t / TICK : g.t;
    const w = when(st, Math.max(0, Math.floor(tp)));
    const row = 4;
    const me = fresh && look.me ? look.me : ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const playing = me && me.live && !me.out;
    const bar = (y, u, c, n = 30) => {
      const lit = Math.max(0, Math.min(n, Math.round(u * n))), x = Math.floor((COLS - n) / 2);
      if (lit) ctx.put(x, y, '='.repeat(lit), c);
      if (lit < n) ctx.put(x + lit, y, '-'.repeat(n - lit), C.GREY);
    };
    if (w.ph === MC.MI_MUSIC) {
      const k = Math.floor(tp / 30) % 4;
      ctx.centre(row, `${' '.repeat(k)}~ MUSIC ~${' '.repeat(3 - k)}`, C.PURPLE);
      ctx.centre(row + 1, 'STAY ON THE CAROUSEL', C.GREY);
    } else if (w.ph === MC.MI_OPEN && w.own) {
      const left = (w.slam - tp) * TICK;
      ctx.centre(row, `${st.num}!  ${st.num === 1 ? 'ALONE IN A ROOM' : `ROOMS OF ${st.num}`}  ${Math.max(0, left).toFixed(1)}`, C.YELLOW);
      bar(row + 1, left / (winOf(w.c) * TICK), left < 2 ? C.RED : C.YELLOW);
      if (playing) {
        const rooms = roomsOf(view, st);
        const k = roomAt(st, rooms, me.pos[0], me.pos[2]);
        if (k < 0) ctx.centre(row + 2, 'NOT IN A ROOM!', C.RED);
        else {
          const n = count(st, rooms, (p) => (p === ctx.slot ? me.pos : ballPos(view, p))).cnt[k], diff = n - st.num;
          const note = diff > 0 ? `  ${diff === 1 ? 'ONE' : diff} TOO MANY` : diff < 0 ? `  ${diff === -1 ? 'ONE' : -diff} SHORT` : '  JUST RIGHT';
          ctx.centre(row + 2, `IN YOUR ROOM ${n} OF ${st.num}${note}`,
            n === st.num ? C.GREEN : n > st.num ? C.RED : C.ORANGE);
        }
      }
    } else if (tpDone(view, st, w)) {
      if (st.safe === 0) ctx.centre(row, 'NOBODY MADE IT', C.ORANGE);
      else ctx.centre(row, `${st.safe} SAFE  ${st.lost} OUT`, C.WHITE);
      if (w.ph === MC.MI_OUT) ctx.centre(row + 1, 'BACK TO THE CAROUSEL', C.GREY);
    }
    ctx.right(2, `SONG ${w.c + 1}  ROOMS ${st.nopen} OF ${st.nlive}` + (playing ? `  SAFE ${saved(view, ctx.slot)}` : ''), C.GREY);
  },

  brain: {
    // the sea past the floor; through the music, off the carousel is a nuisance
    danger(view, x, z, tick) {
      const o = view.bank || 0;
      if (view.dv.getUint32(L.HDR_STATE + o, true) !== L.H_PLAY) return 0;
      const st = stage(view);
      const r = Math.hypot(x - st.cx, z - st.cx);
      if (r > st.ro) return 1;
      const w = when(st, Math.max(0, (tick - st.t0) | 0));
      return w.ph === MC.MI_MUSIC && r > st.rc ? 0.2 : 0;
    },
    goal(view, me, bot) {
      const p = plan(view, me, bot, view.tick);
      return p && !p.hold ? p.goal : null;
    },
    hop() { return false; },
    // all of it, as a word's fields (yaw in radians)
    think(view, me, bot, tick = view.tick) {
      const p = plan(view, me, bot, tick);
      if (!p) return null;
      const mind = mindOf(bot, p.slot);
      const s = steer(p, mind.yaw);
      mind.yaw = s.yaw;
      return s;
    },
  },
};
// Has the confirmed world made this cycle's slam (so MI_CNT, MI_SAFE are its)? It makes it on the step that plays tick slam.
function tpDone(view, st, w) { return w.own && (view.party().t | 0) > w.slam; }
