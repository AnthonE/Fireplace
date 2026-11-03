// FALL BALL, as drawn and as the AI ball sees it. A striped pitch floating
// over the sea, the sides open but for red and white kerbs by the corners and
// the halfway line; at each end a wall and a wide goal, its posts and bar
// white, its net box in the colour of the side that defends it. The giant
// balls are drawn from the confirmed world, flown on to the prediction's tick
// as $fa_fly flies them (a shove comes a round trip late, so they are where
// they'll be when your own ball gets there), turning as they roll; one
// dropping rings the floor where it comes down, the ring closing in on it.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/fallball.mjs'; // FA_*: the minigame's own constants
import { PLAT_Y, B_RAD, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const HH = 0.5; // the pitch's half height, m
const GRASS = [[0.3, 0.6, 0.25], [0.36, 0.67, 0.29]];
const LINE = [0.95, 0.95, 0.95];
const WALL = [0.92, 0.9, 0.85];
const WALL_H = 3;
const GOLD = [1, 0.8, 0.25];
// the giant balls' colours, by serial: a toy's patches on white
const PATCH = [[0.95, 0.3, 0.25], [0.25, 0.55, 0.95], [0.98, 0.78, 0.2], [0.3, 0.8, 0.4], [0.75, 0.4, 0.9], [1, 0.55, 0.2]];
const f = Math.fround;
const sgn = (x) => (x < 0 || Object.is(x, -0) ? -1 : 1); // f32.copysign(1, x)
// a kerb's reach in from the side line for a giant ball, as $fa_fly has it
const KERB = f(Math.sqrt(MC.FA_R * MC.FA_R - (MC.FA_R - MC.FA_BH) * (MC.FA_R - MC.FA_BH)));
// Seconds for a giant ball at height h over its resting height, coming down
// at v m/s, to fall that far: under FA_G to FA_VMAX, then at it.
export function fallFor(h, v = 0) {
  const g = MC.FA_G / TICK, vm = MC.FA_VMAX;
  h = Math.max(0, h);
  const t1 = Math.max(0, (vm - v) / g), h1 = v * t1 + g * t1 * t1 / 2;
  return h <= h1 ? (-v + Math.sqrt(v * v + 2 * g * h)) / g : t1 + (h - h1) / vm;
}
// a drop's fall in seconds, from FA_DROPY to the floor
export const FALL_S = fallFor(MC.FA_DROPY - MC.FA_R);

// ---- what the sim keeps, read

// The pitch on the view's bank.
export function pitch(view) {
  const dv = view.dv, o = view.bank || 0, h = (k) => L.PG_H + k + o;
  return { hx: dv.getFloat32(h(MC.FA_HX), true), hz: dv.getFloat32(h(MC.FA_HZ), true), gw: dv.getFloat32(h(MC.FA_GW), true),
    bx0: dv.getFloat32(h(MC.FA_BX0), true), bx1: dv.getFloat32(h(MC.FA_BX1), true), cap: dv.getUint32(h(MC.FA_CAP), true),
    next: dv.getUint32(h(MC.FA_NEXT), true) | 0, ser: dv.getUint32(h(MC.FA_SER), true), goldn: dv.getUint32(h(MC.FA_GOLDN), true),
    goals: dv.getUint32(h(MC.FA_GOALS), true), lost: dv.getUint32(h(MC.FA_LOST), true), cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Side s's way from the halfway line to its own goal.
export const dir = (s) => (s ? 1 : -1);
// Is there a kerb along the side at |x| = ax?
export const kerbed = (c, ax) => ax >= c.bx0 || ax <= c.bx1;
// The giant balls (PG_S, the confirmed world's), the empty records left out: x and z from the pitch's centre, y over the floor.
export function giants(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  for (let k = 0; k <= MC.FA_NMAX; k++) {
    const a = L.PG_S + MC.FA_BALL + k * MC.FA_BSIZE;
    const st = u8[a + MC.FA_FST];
    if (st === MC.FA_NONE) continue;
    out.push({ k, st, gold: u8[a + MC.FA_FGOLD], by: u8[a + MC.FA_FBY], last: [u8[a + MC.FA_FLAST], u8[a + MC.FA_FLAST + 1]],
      ser: dv.getUint32(a + MC.FA_FSER, true), at: dv.getUint32(a + MC.FA_FAT, true) | 0,
      x: dv.getFloat32(a + MC.FA_FX, true), y: dv.getFloat32(a + MC.FA_FY, true), z: dv.getFloat32(a + MC.FA_FZ, true),
      vx: dv.getFloat32(a + MC.FA_FVX, true), vy: dv.getFloat32(a + MC.FA_FVY, true), vz: dv.getFloat32(a + MC.FA_FVZ, true) });
  }
  return out;
}
// Slot p's tallies.
export function slotOf(view, p) {
  const a = L.PG_S + MC.FA_SLOT + p * MC.FA_SSIZE, dv = view.dv;
  return { touches: dv.getUint16(a + MC.FA_TOUCHES, true), goals: dv.getUint16(a + MC.FA_GOALN, true), assists: dv.getUint16(a + MC.FA_ASSISTS, true), kos: dv.getUint16(a + MC.FA_KOS, true) };
}
const onFloor = (c, ax, az) => (ax <= c.hx && az <= c.hz) || (ax <= f(c.hx + MC.FA_GD) && az < c.gw);

// Giant ball b (a copy, changed) flown n whole ticks on, then frac of one
// more, as $fa_fly does it in f32, short of the balls that meet it and the
// other giant balls: rolling or falling, the end walls, a goal's nets, the
// kerbs, the posts, the floor; in a goal b.goal is the side that scored, off
// the pitch and FA_LOSTY down b.lost, and it flies no further; b.landed is
// the tick (of the n) a dropping one came down.
export function fly(b, c, n, frac = 0) {
  const R = f(MC.FA_R), DT = f(TICK), hx = c.hx, hz = c.hz, gw = c.gw;
  const ROLL = f(MC.FA_ROLL), FRIC = f(MC.FA_FRIC), AIR = f(MC.FA_AIR), G = f(MC.FA_G), V2 = f(MC.FA_VMAX * MC.FA_VMAX), VM = f(MC.FA_VMAX);
  const gwR = f(gw - R), boxX = f(hx + f(MC.FA_GD - MC.FA_R)), WE = f(-MC.FA_WE), BE = f(-MC.FA_BE), WE1 = f(1 + MC.FA_WE), hxR = f(hx - R);
  const RBH = f(MC.FA_R + MC.FA_BH), hzK = f(hz - KERB), RFR = f(MC.FA_R + MC.FA_FR), RFR2 = f((MC.FA_R + MC.FA_FR) * (MC.FA_R + MC.FA_FR));
  const R1 = f(MC.FA_R - 1), SETTLE = f(-MC.FA_SETTLE), FE = f(-MC.FA_FE), goalX = f(hx + R), LOSTY = f(MC.FA_LOSTY);
  for (let i = 0; i <= n; i++) {
    const part = i < n ? 1 : frac;
    if (part <= 0 || b.goal !== undefined || b.lost) break;
    let { x, y, z, vx, vy, vz } = b;
    if (y <= R && vy === 0 && onFloor(c, Math.abs(x), Math.abs(z))) {
      vx = f(vx * ROLL); vz = f(vz * ROLL);
      let sp = f(Math.sqrt(f(f(vx * vx) + f(vz * vz))));
      if (sp > FRIC) { sp = f(f(sp - FRIC) / sp); vx = f(vx * sp); vz = f(vz * sp); } else { vx = 0; vz = 0; }
    } else { vy = f(vy - G); vx = f(vx * AIR); vz = f(vz * AIR); }
    const sp = f(f(f(vx * vx) + f(vy * vy)) + f(vz * vz));
    if (sp > V2) { const s = f(VM / f(Math.sqrt(sp))); vx = f(vx * s); vy = f(vy * s); vz = f(vz * s); }
    if (part < 1) { b.x = x + vx * TICK * part; b.y = Math.max(R, y + vy * TICK * part); b.z = z + vz * TICK * part; break; }
    x = f(f(vx * DT) + x); y = f(f(vy * DT) + y); z = f(f(vz * DT) + z);
    const sx = sgn(x), sz = sgn(z);
    let ax = Math.abs(x), az = Math.abs(z);
    vx = f(vx * sx); vz = f(vz * sz);
    if (ax > hx && az < gw) {
      if (az > gwR) { az = gwR; if (vz > 0) vz = f(vz * WE); }
      if (ax > boxX) { ax = boxX; if (vx > 0) vx = f(vx * WE); }
    } else {
      if (ax > hx || (ax > hxR && az >= gw)) { ax = hxR; if (vx > 0) vx = f(vx * WE); }
      if (y < RBH && az <= hz && az > hzK && kerbed(c, ax)) { az = hzK; if (vz > 0) vz = f(vz * BE); }
    }
    let dx = f(ax - hx), dz = f(az - gw), dd = f(f(dx * dx) + f(dz * dz));
    if (dd < RFR2 && dd > 0) {
      dd = f(Math.sqrt(dd));
      dx = f(dx / dd); dz = f(dz / dd);
      ax = f(f(dx * RFR) + hx); az = f(f(dz * RFR) + gw);
      let q = f(f(vx * dx) + f(vz * dz));
      if (q < 0) { q = f(q * WE1); vx = f(vx - f(q * dx)); vz = f(vz - f(q * dz)); }
    }
    if (y < R && y > R1 && onFloor(c, ax, az)) {
      if (b.st === MC.FA_FALL) { b.st = MC.FA_LIVE; b.landed = i; }
      y = R;
      if (vy < SETTLE) vy = f(vy * FE); else vy = 0;
    }
    x = f(ax * sx); z = f(az * sz); vx = f(vx * sx); vz = f(vz * sz);
    Object.assign(b, { x, y, z, vx, vy, vz });
    if (ax > goalX && az < gw) b.goal = x < 0 ? 1 : 0;
    else if (y < LOSTY) b.lost = true;
  }
  return b;
}

// Ticks till a dropping giant ball comes down (its centre to FA_R over the
// floor), as near as fallFor has it.
export function landIn(b) {
  return b.st === MC.FA_FALL ? fallFor(b.y - MC.FA_R, Math.max(0, -b.vy)) / TICK : 0;
}

const sideOf = (view, p) => (view.u8[L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.P_FL] & L.PF_BLUE ? 1 : 0);
// a ball on the floor meets a giant ball this far from its centre, level
const RR = 2 * Math.sqrt(MC.FA_R * B_RAD);
const DEF = 0.15; // of a side's balls, the backs

// ---- the AI ball

// Jobs kept from one world tick to the next, so a ball sticks to its giant
// ball until another is clearly better: memory -> { round, map: slot -> k }.
const JOBS = new WeakMap();

// What every AI ball looking at one world tick shares: the pitch, the giant
// balls in flight (where each will be a few ticks on; a dropping one where
// it lands and when), each side's balls in play; then each side's jobs. A
// keeper (one from 8 balls a side, two from 24) holds its goal mouth; the
// rest are shared out over the giant balls: those in our third first, then
// the golden one, then the least contested, each wanting one more of ours
// than it has foes on it, any over shared round; each ball keeps the one it
// had while that has room, and each giant ball takes the nearest of the
// rest till it has its share.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._fa;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const c = pitch(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const t = state === L.H_PLAY ? (view.tick - dv.getUint32(L.HDR_START + o, true)) | 0 : 0;
  const list = state === L.H_PLAY && c.hx > 0 ? giants(view).filter((b) => b.st === MC.FA_FALL || b.st === MC.FA_LIVE) : [];
  for (const b of list) {
    b.land = landIn(b);
    // where it will be a few ticks on (a dropping one: where it lands)
    const s = fly({ ...b }, c, b.st === MC.FA_FALL ? 0 : 8);
    b.px = s.x; b.pz = s.z;
  }
  const side = [[], []];
  if (state === L.H_PLAY) {
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + o + p * L.PSIZE;
      const fl = view.u8[a + L.P_FL];
      if ((fl & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
      side[fl & L.PF_BLUE ? 1 : 0].push({ slot: p, x: dv.getFloat32(a + L.P_PX, true) - c.cx, z: dv.getFloat32(a + L.P_PZ, true) - c.cx });
    }
  }
  let prev = JOBS.get(view.u8.buffer);
  const round = dv.getUint32(L.HDR_HOLE + o, true);
  if (!prev || prev.round !== round) JOBS.set(view.u8.buffer, prev = { round, map: new Map() });
  const job = new Map(); // slot -> { role: 'push' | 'keep' | 'home', b, i, n }
  for (const s of [0, 1]) {
    const mine = side[s];
    if (!mine.length) continue;
    const gx = dir(s) * c.hx;
    const nk = list.length ? (mine.length >= 24 ? 2 : mine.length >= 8 ? 1 : 0) : 0;
    // the keepers: the nearest our goal
    const near = mine.map((m) => ({ m, d: Math.hypot(m.x - gx, m.z) - (prev.map.get(m.slot) === -2 ? 6 : 0) })).sort((a, b) => a.d - b.d || a.m.slot - b.m.slot);
    near.slice(0, nk).sort((a, b) => a.m.z - b.m.z || a.m.slot - b.m.slot).forEach(({ m }, i) => job.set(m.slot, { role: 'keep', i, n: nk }));
    const rest = mine.filter((m) => !job.has(m.slot));
    if (!list.length) { rest.forEach((m, i) => job.set(m.slot, { role: 'home', i, n: rest.length })); continue; }
    // the backs: DEF of the rest, the nearest our goal, playing the giant
    // balls in our half; the forwards the rest, playing those out of our
    // third (any, if none is). Each giant ball its share of its players, the
    // least contested and the golden one first; each keeps the one it had
    // while that one has room, then each giant ball takes the nearest of the
    // rest till it has its share.
    const nd = Math.round(rest.length * DEF);
    const byGoal = rest.slice().sort((a, b) => (b.x - a.x) * dir(s) - (prev.map.get(b.slot) >= 99 ? 6 : 0) + (prev.map.get(a.slot) >= 99 ? 6 : 0) || a.slot - b.slot);
    const backs = byGoal.slice(0, nd), fwds = byGoal.slice(nd);
    const foes = side[1 - s];
    for (const b of list) b.foes = foes.filter((q) => Math.hypot(q.x - b.px, q.z - b.pz) < RR + 2.5).length;
    const ours = list.filter((b) => b.px * dir(s) > -c.hx * 0.1), theirs = list.filter((b) => b.px * dir(s) < c.hx * 0.33);
    const count = new Map(list.map((b) => [b.k, 0]));
    const share = (group, balls, tag) => {
      if (!balls.length) { group.forEach((m, i) => job.set(m.slot, { role: 'home', i, n: group.length, back: tag })); return; }
      const order = balls.slice().sort((a, b) => (b.gold - a.gold) || (a.foes - b.foes) || a.k - b.k);
      const quota = new Map(order.map((b, i) => [b.k, Math.floor(group.length / order.length) + (i < group.length % order.length ? 1 : 0)]));
      const got = new Map(order.map((b) => [b.k, 0]));
      const give = (m, b) => { job.set(m.slot, { role: 'push', b, i: count.get(b.k), n: 0, back: tag }); count.set(b.k, count.get(b.k) + 1); got.set(b.k, got.get(b.k) + 1); };
      const left = [];
      for (const m of group) {
        const b = order.find((x) => x.k === prev.map.get(m.slot) % 100);
        if (b && got.get(b.k) < quota.get(b.k)) give(m, b); else left.push(m);
      }
      for (const b of order) {
        while (left.length && got.get(b.k) < quota.get(b.k)) {
          let best = -1, bt = Infinity;
          for (let i = 0; i < left.length; i++) { const d = Math.hypot(left[i].x - b.px, left[i].z - b.pz); if (d < bt) { bt = d; best = i; } }
          give(left.splice(best, 1)[0], b);
        }
      }
    };
    share(backs, ours, 100);
    share(fwds, theirs.length ? theirs : list, 0);
    for (const j of job.values()) if (j.role === 'push') j.n = count.get(j.b.k);
  }
  prev.map = new Map([...job].map(([slot, j]) => [slot, j.role === 'push' ? j.b.k + (j.back || 0) : j.role === 'keep' ? -2 : (j.back || 0) - 1]));
  view._fa = { tick: view.tick, bank: o, c, state, t, list, side, job };
  return view._fa;
}

// Where side s wants giant ball b to go from local (x, z): the middle of the
// other goal's mouth (the nearer half of it); near an open side, along it
// rather than toward it (it can't be pushed in from over the void).
export function aim(c, s, x, z) {
  const tn = -dir(s);
  const gz = Math.max(-c.gw * 0.5, Math.min(c.gw * 0.5, z * 0.5));
  let ux = tn * (c.hx + MC.FA_R + 1) - x, uz = gz - z;
  let l = Math.hypot(ux, uz) || 1;
  ux /= l; uz /= l;
  if (c.hz - Math.abs(z) < MC.FA_R + 3 && uz * z > 0 && !kerbed(c, Math.abs(x))) { uz = 0; ux = Math.sign(ux) || 1; }
  return [ux, uz];
}

// A heading for a ball at (px, pz) rolling (vx, vz) to be at (tx, tz) rolling
// (wx, wz): toward the velocity it wants (to the spot, slowing as it nears,
// plus the roll it wants there).
function steer(px, pz, vx, vz, tx, tz, wx = 0, wz = 0) {
  const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz);
  const k = Math.min(10, d * 3) / (d || 1);
  const ex = dx * k + wx - vx, ez = dz * k + wz - vz;
  return { yaw: Math.atan2(ez, ex), move: Math.hypot(ex, ez) > 0.8 ? 1 : 0 };
}

// Where the pusher wants to be, local: i of the n on giant ball b, { x, z }
// and the roll it wants there { wx, wz }. Behind it (on the far side from
// where it should go), spread across its back; from in front of or beside
// it, round it first, the side it's on; lined up, into it flat out.
function pushAt(w, me, bot, j) {
  const c = w.c, s = me.side, b = j.b;
  const px = (bot?.pos?.[0] ?? me.pos[0]) - c.cx, pz = (bot?.pos?.[1] ?? me.pos[2]) - c.cx;
  const fx = b.px, fz = b.pz;
  const [ux, uz] = aim(c, s, fx, fz);
  const lat = j.n > 1 ? ((j.i + 0.5) / j.n - 0.5) * 2 * MC.FA_R * 0.6 : 0;
  const rx = px - fx, rz = pz - fz;
  const along = rx * ux + rz * uz, perp = -rx * uz + rz * ux;
  const fvx = (b.px - b.x) / (8 * TICK), fvz = (b.pz - b.z) / (8 * TICK);
  // a dropping one: to where it will be pushed from, clear of where it lands
  if (b.st === MC.FA_FALL) return { x: fx - ux * (RR + 2.5) - uz * lat, z: fz - uz * (RR + 2.5) + ux * lat, wx: 0, wz: 0 };
  if (along > -RR * 0.6) {
    const side = perp < 0 || Object.is(perp, -0) ? -1 : 1;
    const back = RR * 0.8, wide = RR + 1.5;
    return { x: fx - ux * back - uz * wide * side, z: fz - uz * back + ux * wide * side, wx: fvx, wz: fvz };
  }
  // lined up behind it (its own share of the back), then in
  const ex = -uz * lat, ez = ux * lat;
  const off = Math.abs(perp - lat), dist = Math.hypot(rx - ex, rz - ez);
  const into = off < 1.2 ? 10 : 0;
  const behind = RR - 0.6 + Math.min(2.5, off * 0.8 + Math.max(0, dist - RR) * 0.2);
  return { x: fx - ux * behind + ex, z: fz - uz * behind + ez, wx: fvx + ux * into, wz: fvz + uz * into };
}

// The keeper's spot, local: just off its goal line in its share of the
// mouth, toward the giant ball nearest it; one within 12 m of the line it
// pushes away, from the goal's side.
function keepAt(w, me, bot, j) {
  const c = w.c, s = me.side, gx = dir(s) * c.hx;
  const gz = j.n > 1 ? ((j.i + 0.5) / j.n * 2 - 1) * c.gw * 0.5 : 0;
  let threat = null, td = Infinity;
  for (const b of w.list) {
    const d = Math.hypot(b.px - gx, b.pz - gz);
    if (d < td) { td = d; threat = b; }
  }
  if (threat && threat.st === MC.FA_LIVE && Math.abs(threat.px - gx) < 12 + MC.FA_R && Math.abs(threat.pz) < c.gw + MC.FA_R) return pushAt(w, me, bot, { b: threat, i: j.i, n: j.n });
  const z = threat ? Math.max(gz - c.gw * 0.5, Math.min(gz + c.gw * 0.5, gz + (threat.pz - gz) * 0.4)) : gz;
  return { x: gx - dir(s) * 2, z, wx: 0, wz: 0 };
}

// The job's spot, local, kept on the pitch.
function spotOf(w, me, bot, j) {
  const c = w.c;
  const p = j.role === 'push' ? pushAt(w, me, bot, j) : j.role === 'keep' ? keepAt(w, me, bot, j) : homeOf(w, me, j);
  p.x = Math.max(-c.hx + 1.2, Math.min(c.hx - 1.2, p.x));
  p.z = Math.max(-c.hz + 1.3, Math.min(c.hz - 1.3, p.z));
  return p;
}

// A home spot, local: i of n in a grid over our half, drawn toward the middle.
function homeOf(w, me, j) {
  const c = w.c, s = me.side;
  const cols = Math.max(1, Math.round(Math.sqrt(j.n * c.hz / c.hx))), rows = Math.ceil(j.n / cols);
  const row = Math.floor(j.i / cols), col = j.i % cols;
  return { x: dir(s) * c.hx * (0.15 + 0.6 * (row + 0.5) / rows), z: ((col + 0.5) * 2 / cols - 1) * c.hz * 0.7, wx: 0, wz: 0 };
}

export default {
  id: L.MG_FALLBALL, key: 'fallball', name: 'FALL BALL',
  hint: 'ROLL INTO A GIANT BALL TO SHOVE IT  TEAM UP TO MOVE IT',
  rules: 'ALL THE WAY INTO THEIR GOAL SCORES  MOST GOALS AT THE CLOCK WINS',
  env: 'day',

  draw(view, ctx, out) {
    const c = pitch(view);
    if (!(c.hx > 0)) return;
    const g = view.party();
    const sc = out.scene, cx = c.cx;
    const now = (ctx?.now ?? 0) / 1000;
    // the pitch in stripes, a slab under it, the goals' boxes
    const ns = Math.max(4, Math.round(c.hx / 2.5)) * 2, sw = c.hx * 2 / ns;
    for (let i = 0; i < ns; i++) sc.box(cx - c.hx + (i + 0.5) * sw, PLAT_Y - HH, cx, sw / 2, HH, c.hz, 0, ...GRASS[i & 1], LOOK.MATTE);
    sc.box(cx, PLAT_Y - 2 * HH - 1.2, cx, c.hx - 0.4, 1.2, c.hz - 0.4, 0, 0.55, 0.45, 0.35, LOOK.MATTE);
    for (const e of [-1, 1]) sc.box(cx + e * (c.hx + MC.FA_GD / 2), PLAT_Y - HH, cx, MC.FA_GD / 2, HH, c.gw + 0.3, 0, ...GRASS[0], LOOK.MATTE);
    // the lines: halfway, the goal lines; the centre circle and spot
    const ln = (x, z, hx, hz) => sc.box(x, PLAT_Y + 0.01, z, hx, 0.01, hz, 0, ...LINE, LOOK.MATTE);
    ln(cx, cx, 0.1, c.hz);
    for (const e of [-1, 1]) ln(cx + e * (c.hx - 0.1), cx, 0.1, c.gw);
    out.decals.push({ pos: [cx, PLAT_Y + 0.03, cx], radius: MC.FA_R + 1.5, width: 0.2, color: [...LINE, 0.85], kind: DECAL.RING });
    // the kerbs, red and white, by the corners and the halfway line
    for (const e of [-1, 1]) {
      const kz = cx + e * (c.hz + MC.FA_BT / 2);
      sc.box(cx, PLAT_Y + MC.FA_BH / 2, kz, c.bx1, MC.FA_BH / 2, MC.FA_BT / 2, 0, 0.9, 0.2, 0.18, LOOK.HAZARD, 0.8);
      for (const x of [-1, 1]) sc.box(cx + x * (c.bx0 + c.hx) / 2, PLAT_Y + MC.FA_BH / 2, kz, (c.hx - c.bx0) / 2, MC.FA_BH / 2, MC.FA_BT / 2, 0, 0.9, 0.2, 0.18, LOOK.HAZARD, 0.8);
    }
    // the end walls beside the mouths, and the goals: the frame white, the net the defending side's colour (red's at low x)
    for (const e of [-1, 1]) {
      const wl = (c.hz - c.gw - MC.FA_FR) / 2;
      for (const z of [-1, 1]) sc.box(cx + e * (c.hx + 0.25), PLAT_Y + WALL_H / 2, cx + z * (c.gw + MC.FA_FR + wl), 0.25, WALL_H / 2, wl, 0, ...WALL, LOOK.PLASTIC);
      const col = SIDES[e < 0 ? 0 : 1].color, gx = cx + e * c.hx;
      for (const z of [-1, 1]) sc.cyl(gx, PLAT_Y + MC.FA_GH / 2, cx + z * c.gw, MC.FA_FR, MC.FA_GH / 2, 0.97, 0.97, 0.97, LOOK.PLASTIC);
      sc.cyl(gx, PLAT_Y + MC.FA_GH, cx, MC.FA_FR, c.gw, 0.97, 0.97, 0.97, LOOK.PLASTIC, 0, 0, 1, undefined, Math.PI / 2, 0);
      const net = (x, y, z, hx, hy, hz) => sc.box(x, y, z, hx, hy, hz, 0, ...col.map((v) => 0.55 + 0.45 * v), LOOK.CHECKER, 0.3, 0.3, 0.55);
      for (const z of [-1, 1]) net(gx + e * MC.FA_GD / 2, PLAT_Y + MC.FA_GH / 2, cx + z * c.gw, MC.FA_GD / 2, MC.FA_GH / 2, 0.04);
      net(gx + e * MC.FA_GD, PLAT_Y + MC.FA_GH / 2, cx, 0.04, MC.FA_GH / 2, c.gw);
      net(gx + e * MC.FA_GD / 2, PLAT_Y + MC.FA_GH, cx, MC.FA_GD / 2, 0.04, c.gw);
    }
    if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return;
    // the giant balls, flown on to the prediction's tick
    const ptick = typeof ctx?.ptick === 'number' ? ctx.ptick : g.tick + (ctx?.dt || 0) / TICK;
    const ahead = g.state === L.H_PLAY ? Math.max(0, Math.min(60, ptick - g.tick)) : 0;
    const whole = Math.floor(ahead), frac = ahead - whole;
    for (const b of giants(view)) {
      if (b.st !== MC.FA_FALL && b.st !== MC.FA_LIVE) continue;
      const s = fly({ ...b }, c, whole, frac);
      if (s.goal !== undefined || s.lost) continue;
      const wx = cx + s.x, wy = PLAT_Y + s.y, wz = cx + s.z;
      drawGiant(sc, b, wx, wy, wz, view.u8.buffer);
      out.casters.push([wx, wy, wz, -MC.FA_R]);
      if (s.st === MC.FA_FALL) {
        // where it comes down: a ring closing in as it falls, a disc under it
        const left = Math.min(1, landIn(s) * TICK / FALL_S), col = b.gold ? GOLD : [1, 0.35, 0.25];
        const pulse = 0.5 + 0.5 * Math.sin(now * 10);
        out.decals.push({ pos: [wx, PLAT_Y + 0.04, wz], radius: MC.FA_R * (1.05 + 1.6 * left), width: 0.35, color: [...col, 0.85], kind: DECAL.RING });
        out.decals.push({ pos: [wx, PLAT_Y + 0.035, wz], radius: MC.FA_R + B_RAD, color: [...col, 0.25 + 0.2 * pulse], kind: DECAL.DISC });
      }
    }
  },

  // the whole pitch and its goals
  frame(view) {
    const c = pitch(view), g = view.party();
    const cx = c.cx || g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: (c.hx > 0 ? c.hx + MC.FA_GD : g.size) + 1, shape: 'square' };
  },

  // the countdown turns you to the other goal
  facing(view, slot) {
    return sideOf(view, slot) ? Math.PI : 0;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    if (fx.kind === MC.FA_FX_DROP) {
      const gold = fx.shot & 256;
      ctx.glow?.({ pos: fx.pos, size: MC.FA_R * 2.5, color: gold ? [...GOLD, 0.8] : [1, 0.4, 0.3, 0.6], kind: SPRITE.RING, life: 500, grow: true });
      if (gold) { ctx.banner?.(`GOLDEN BALL  WORTH ${MC.FA_GOLDV}`, C.YELLOW, 1600); ctx.sound?.pickup?.(); }
      else ctx.sound?.tick?.();
    } else if (fx.kind === MC.FA_FX_LAND) {
      ctx.glow?.({ pos: fx.pos, size: MC.FA_R * 2.2, color: [0.9, 0.85, 0.7, 0.7], kind: SPRITE.RING, life: 450, grow: true });
      ctx.sound?.land?.(Math.min(40, 10 + fx.size * 1.2), d);
    } else if (fx.kind === MC.FA_FX_GOAL) {
      const s = (fx.shot >> 8) & 1, gold = fx.shot & 512, nobody = fx.shot & 1024;
      const mine = ctx.view && ctx.slot >= 0 ? sideOf(ctx.view, ctx.slot) : -1;
      ctx.glow?.({ pos: fx.pos, size: 12, color: [...SIDES[s].color, 0.95], kind: SPRITE.RING, life: 900, grow: true });
      ctx.glow?.({ pos: fx.pos, size: 7, color: gold ? [...GOLD, 0.95] : [1, 1, 0.8, 0.9], kind: SPRITE.SPARK, life: 700 });
      ctx.sound?.blast?.(Math.min(40, 900 / (d + 20)));
      const who = fx.owner !== 255 ? name(fx.owner) : null;
      ctx.feed?.(`${SIDES[s].name} SCORES ${fx.size}${gold ? '  GOLDEN' : ''}${nobody ? '  UNTOUCHED' : who ? `  ${who}` : ''}`,
        mine === s ? C.GREEN : mine === 1 - s ? C.RED : s ? C.CYAN : C.RED);
      if (ctx.slot >= 0 && mine >= 0 && ctx.view?.partier?.(ctx.slot)?.live) {
        if (mine === s) { ctx.banner?.(fx.owner === ctx.slot ? 'YOUR GOAL!' : gold ? 'GOLDEN GOAL!' : 'GOAL!', C.GREEN, 1400); ctx.sound?.kill?.(); }
        else ctx.banner?.(`GOAL TO ${SIDES[s].name}`, C.RED, 1400);
      }
    } else if (fx.kind === MC.FA_FX_LOST) {
      ctx.glow?.({ pos: fx.pos, size: 4, color: [1, 1, 1, 0.5], kind: SPRITE.RING, life: 500, grow: true });
      ctx.feed?.(fx.shot & 512 ? 'THE GOLDEN BALL FELL OFF' : 'A BALL FELL OFF', C.GREY);
    }
  },

  // the balls in play, the golden one's call; your touches, goals, assists and KOs
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const c = pitch(view);
    if (!(c.hx > 0)) return;
    const n = giants(view).filter((b) => b.st === MC.FA_FALL || b.st === MC.FA_LIVE).length;
    const gold = giants(view).some((b) => b.gold && b.st !== MC.FA_NONE);
    ctx.right(3, gold ? `BALLS ${n}  GOLDEN BALL WORTH ${MC.FA_GOLDV}` : c.goldn ? `BALLS ${n}` : `BALLS ${n}  GOLDEN BALL AT ${Math.round(MC.FA_GOLDT * TICK)} S`, gold ? C.YELLOW : C.GREY);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live) return;
    const s = slotOf(view, ctx.slot);
    ctx.right(4, `TOUCHES ${s.touches}  GOALS ${s.goals}  ASSISTS ${s.assists}  KOS ${s.kos}`, C.GREY);
  },

  brain: {
    // off an open side is a fall, near it a risk; under a giant ball coming down, deadly
    danger(view, x, z, tick) {
      const w = worldOf(view), c = w.c;
      if (!(c.hx > 0)) return 0;
      const lx = x - c.cx, lz = z - c.cx, ax = Math.abs(lx), az = Math.abs(lz);
      let d = 0;
      if (!kerbed(c, ax) && ax < c.hx) {
        if (az > c.hz - 0.7) return 1;
        if (az > c.hz - 1.8) d = 0.3;
      }
      for (const b of w.list) {
        if (b.st !== MC.FA_FALL) continue;
        const dt = view.tick + b.land - tick;
        if (dt < 40 && dt > -8 && Math.hypot(lx - b.px, lz - b.pz) < RR + 1) return 1;
      }
      return d;
    },
    // the job's spot, for the planner when it steers (near an open side)
    goal(view, me, bot) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return null;
      const j = w.job.get(me.slot);
      if (!j) return null;
      const p = spotOf(w, me, bot, j);
      return [w.c.cx + p.x, w.c.cx + p.z];
    },
    hop() { return false; },
    // to the job's spot and roll, steered outright; near an open side, or
    // where that roll would take it there, the planner steers instead
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      const j = w.job.get(me.slot);
      if (!j) return null;
      const c = w.c;
      const px = (bot?.pos?.[0] ?? me.pos[0]) - c.cx, pz = (bot?.pos?.[1] ?? me.pos[2]) - c.cx;
      const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
      const p = spotOf(w, me, bot, j);
      const out = steer(px, pz, vx, vz, p.x, p.z, p.wx, p.wz);
      const sp = Math.max(4, Math.hypot(vx, vz));
      for (const t of [0.15, 0.35, 0.6]) {
        const x = px + Math.cos(out.yaw) * sp * t, z = pz + Math.sin(out.yaw) * sp * t;
        if (this.danger(view, c.cx + x, c.cx + z, tick + Math.round(t / TICK)) >= 0.9) return null;
      }
      return out;
    },
  },
};

// A giant ball: white, with eight patches of its serial's colour turning as
// it rolls (the turn worked out here from how far it moved since the last
// frame, drawing only); the golden one gold all over.
const OCT = [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map((v) => v.map((x) => x / Math.sqrt(3)));
const TURNS = new WeakMap(); // memory -> Map(serial -> { x, z, m: 3x3 })
function drawGiant(sc, b, x, y, z, key) {
  let m = TURNS.get(key);
  if (!m) TURNS.set(key, m = new Map());
  let e = m.get(b.ser);
  if (!e) { m.set(b.ser, e = { x, z, m: [1, 0, 0, 0, 1, 0, 0, 0, 1] }); if (m.size > 64) m.delete(m.keys().next().value); }
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
  if (d > 6) { e.x = x; e.z = z; } else if (d > 1e-5) {
    // a roll about (dz, 0, -dx) by d / R
    const ax = dz / d, az = -dx / d, a = d / MC.FA_R, ca = Math.cos(a), sa = Math.sin(a), t = 1 - ca;
    const r = [t * ax * ax + ca, -sa * az, t * ax * az, sa * az, ca, -sa * ax, t * ax * az, sa * ax, t * az * az + ca];
    const o = e.m, n = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) n[3 * i + j] = r[3 * i] * o[j] + r[3 * i + 1] * o[3 + j] + r[3 * i + 2] * o[6 + j];
    e.m = n;
    e.x = x; e.z = z;
  }
  if (b.gold) { sc.sphere(x, y, z, MC.FA_R, ...GOLD, LOOK.METAL, 0, 0, 1, b.ser); return; }
  sc.sphere(x, y, z, MC.FA_R, 0.96, 0.95, 0.92, LOOK.PLASTIC, 0, 0, 1, b.ser);
  const col = PATCH[b.ser % PATCH.length], q = e.m;
  for (const [a, bb, cc] of OCT) {
    const px = q[0] * a + q[1] * bb + q[2] * cc, py = q[3] * a + q[4] * bb + q[5] * cc, pz = q[6] * a + q[7] * bb + q[8] * cc;
    sc.sphere(x + px * MC.FA_R * 0.66, y + py * MC.FA_R * 0.66, z + pz * MC.FA_R * 0.66, MC.FA_R * 0.4, ...col, LOOK.PLASTIC, 0, 0, 1, b.ser);
  }
}
