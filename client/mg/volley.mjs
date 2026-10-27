// VOLLEYBALL, as drawn and as the AI ball sees it. A wooden court in two
// halves, red's tinted red and blue's blue, a net down the middle with a
// white band at its top on two posts, low walls round it all and glass over
// them (a volleyball bounces off the glass at any height). The volleyballs
// are drawn from the confirmed world, flown on to the prediction's tick as
// $vb_fly flies them (a touch comes a round trip late, so in flight they're
// where they'll be when your own ball gets there); each one's landing spot
// is a ring on the floor in the colour of the side whose floor it is, and a
// run of touches shows as pips over it in the toucher's colour. A volleyball
// waiting to be served hangs at its server's back line; a dead one fades.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/volley.mjs'; // VB_*: the minigame's own constants
import { PLAT_Y, B_RAD, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const HH = 0.5; // the floor's half height, m
const WOOD = [[0.78, 0.5, 0.42], [0.46, 0.56, 0.78]];
const WALL = [0.85, 0.85, 0.88];
const GLASS = [0.8, 0.9, 1];
const LEATHER = [[0.98, 0.95, 0.86], [0.98, 0.82, 0.25]];
const f = Math.fround;
const luck = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 7, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 2 ** 32; };
// the height a volleyball's centre comes down to over a ball's that rolls under it, and one that hops into it
const BUMP_Y = PLAT_Y + B_RAD + 2.1;
const SPIKE_Y = PLAT_Y + B_RAD + 3.2;
const RUN = 0.6; // s, an AI ball's run-up into a touch


// ---- what the sim keeps, read

// The court on the view's bank.
export function court(view) {
  const dv = view.dv, o = view.bank || 0;
  return { hx: dv.getFloat32(L.PG_H + MC.VB_HX + o, true), hz: dv.getFloat32(L.PG_H + MC.VB_HZ + o, true),
    nb: dv.getUint32(L.PG_H + MC.VB_NB + o, true), goal: dv.getUint32(L.PG_H + MC.VB_GOAL + o, true), cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Side s's way from the net to its back line.
export const dir = (s) => (s ? 1 : -1);
// The volleyballs (PG_S, the confirmed world's), the unused left out.
export function balls(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  const n = Math.min(MC.VB_NMAX, dv.getUint32(L.PG_H + MC.VB_NB, true));
  for (let k = 0; k < n; k++) {
    const a = L.PG_S + MC.VB_BALL + k * MC.VB_BSIZE;
    const st = u8[a + MC.VB_BST];
    if (st === MC.VB_NONE) continue;
    out.push({ k, st, by: u8[a + MC.VB_BBY], side: u8[a + MC.VB_BSIDE], n: u8[a + MC.VB_BN], at: dv.getUint32(a + MC.VB_BAT, true) | 0,
      next: dv.getUint32(a + MC.VB_BNEXT, true) | 0, serve: u8[a + MC.VB_BSERVE],
      x: dv.getFloat32(a + MC.VB_BX, true), y: dv.getFloat32(a + MC.VB_BY, true), z: dv.getFloat32(a + MC.VB_BZ, true),
      vx: dv.getFloat32(a + MC.VB_BVX, true), vy: dv.getFloat32(a + MC.VB_BVY, true), vz: dv.getFloat32(a + MC.VB_BVZ, true) });
  }
  return out;
}
// Slot p's tallies.
export function slotOf(view, p) {
  const a = L.PG_S + MC.VB_SLOT + p * MC.VB_SSIZE, dv = view.dv;
  return { touches: dv.getUint16(a + MC.VB_TOUCHES, true), spikes: dv.getUint16(a + MC.VB_SPIKES, true), kills: dv.getUint16(a + MC.VB_KILLS, true), faults: dv.getUint16(a + MC.VB_FAULTS, true) };
}

// Volleyball b (a copy, changed) flown n whole ticks on, then frac of one
// more, as $vb_fly does it in f32, short of the balls that might touch it:
// gravity, the net, the walls and the floor; flying, the floor leaves it
// dead (b.land: where), and dead it bounces and settles.
export function fly(b, c, n, frac = 0) {
  const R = f(MC.VB_R), top = f(PLAT_Y + MC.VB_R), net = f(PLAT_Y + MC.VB_NET_H), cx = c.cx, R2 = f(MC.VB_R * MC.VB_R);
  const X = f(c.hx - MC.VB_R), Z = f(c.hz - MC.VB_R);
  const xlo = f(cx - X), xhi = f(cx + X), zlo = f(cx - Z), zhi = f(cx + Z);
  const DT = f(TICK), NE = f(1 + MC.VB_NE);
  for (let k = 0; k <= n; k++) {
    const part = k < n ? 1 : frac;
    if (part <= 0) break;
    let { x, y, z, vx, vy, vz } = b;
    if (b.st === MC.VB_DEAD && y <= top && vy === 0) { vx = f(vx * f(MC.VB_ROLL)); vz = f(vz * f(MC.VB_ROLL)); } else vy = f(vy - f(MC.VB_G));
    if (part < 1) { b.x = x + vx * TICK * part; b.y = Math.max(top, y + vy * TICK * part); b.z = z + vz * TICK * part; break; }
    x = f(f(vx * DT) + x); y = f(f(vy * DT) + y); z = f(f(vz * DT) + z);
    // the net: its face, or its top edge
    const dx = f(x - cx), dy = Math.max(f(y - net), 0), d2 = f(f(dx * dx) + f(dy * dy));
    if (d2 < R2) {
      let nx, ny;
      if (dy === 0) {
        nx = (dx !== 0 ? dx : -vx) < 0 || Object.is(dx !== 0 ? dx : -vx, -0) ? -1 : 1;
        ny = 0;
        x = f(f(nx * R) + cx);
      } else {
        const d = f(Math.sqrt(d2));
        nx = f(dx / d); ny = f(dy / d);
        x = f(f(nx * R) + cx); y = f(f(ny * R) + net);
      }
      let vn = f(f(vx * nx) + f(vy * ny));
      if (vn < 0) { vn = f(vn * NE); vx = f(vx - f(vn * nx)); vy = f(vy - f(vn * ny)); }
    }
    if (x < xlo) { x = xlo; if (vx < 0) vx = f(vx * f(-MC.VB_WE)); }
    if (x > xhi) { x = xhi; if (vx > 0) vx = f(vx * f(-MC.VB_WE)); }
    if (z < zlo) { z = zlo; if (vz < 0) vz = f(vz * f(-MC.VB_WE)); }
    if (z > zhi) { z = zhi; if (vz > 0) vz = f(vz * f(-MC.VB_WE)); }
    if (y < top) {
      y = top;
      if (b.st === MC.VB_FLY) { b.st = MC.VB_DEAD; b.land = { x, z, side: x > cx ? 1 : 0 }; }
      if (vy < -MC.VB_SETTLE) { vy = f(vy * f(-MC.VB_FE)); vx = f(vx * f(MC.VB_FH)); vz = f(vz * f(MC.VB_FH)); } else vy = 0;
    }
    Object.assign(b, { x, y, z, vx, vy, vz });
  }
  return b;
}

// Where a flying volleyball comes down: flown on from the view's tick (at
// most max ticks) to the floor, and the last tick before it its centre fell
// through height y (a rolling ball's reach) and hy (a hopping one's): { x, z,
// eta (ticks to y), hi: { x, z, eta } (to hy, or null), lx, lz, side (whose
// floor), ticks (to it) }, or null.
export function landing(b, c, y = BUMP_Y, hy = SPIKE_Y, max = 900) {
  if (b.st !== MC.VB_FLY) return null;
  const s = { ...b };
  let lo = null, hi = null;
  for (let k = 1; k <= max; k++) {
    const py = s.y;
    fly(s, c, 1);
    if (s.vy < 0 && py >= y && s.y < y) lo = { x: s.x, z: s.z, eta: k };
    if (s.vy < 0 && py >= hy && s.y < hy) hi = { x: s.x, z: s.z, eta: k };
    if (s.land) {
      lo = lo || { x: s.land.x, z: s.land.z, eta: k };
      return { ...lo, hi, lx: s.land.x, lz: s.land.z, side: s.land.side, ticks: k };
    }
  }
  return null;
}

// A touch, as $vb_touch makes it, from a ball of side s rolling at (vx, vz),
// in the air (a spike) or not: the volleyball's new velocity.
export function touch(vx, vz, air, s) {
  const sp = Math.hypot(vx, vz), tn = -dir(s);
  let ux = tn, uz = 0;
  if (sp > MC.VB_SLOW) { ux = vx / sp; uz = vz / sp; }
  if (air && ux * tn < MC.VB_FWD) { ux = tn * MC.VB_FWD; uz = (uz < 0 || Object.is(uz, -0) ? -1 : 1) * Math.sqrt(1 - MC.VB_FWD ** 2); }
  const h = air ? Math.min(MC.VB_SPIKE0 + sp * MC.VB_SPIKEK, MC.VB_SPIKEMAX) : Math.min(MC.VB_BUMP0 + sp * MC.VB_BUMPK, MC.VB_BUMPMAX);
  return { vx: ux * h, vy: air ? MC.VB_SPIKEUP : MC.VB_BUMPUP, vz: uz * h };
}

const sideOf = (view, p) => (view.u8[L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.P_FL] & L.PF_BLUE ? 1 : 0);
// Ticks into play the view stands at, -1 before play.
const playT = (g) => (g.state === L.H_PLAY ? g.t : -1);

// ---- the AI ball

// What every AI ball looking at one world tick shares: the court, the
// volleyballs, where each flying one comes down, and each side's balls in;
// then for each side its volleyballs coming down on its half, soonest first,
// each handed to the nearest of the side's balls that has none yet (by how
// long it takes to get there), so teammates spread over the ones coming; and
// each side's balls in order, for a home spot each over its half.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._vb;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const c = court(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const list = state === L.H_PLAY ? balls(view) : [];
  const side = [[], []];
  if (state === L.H_PLAY) {
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + o + p * L.PSIZE;
      const fl = view.u8[a + L.P_FL];
      if ((fl & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
      side[fl & L.PF_BLUE ? 1 : 0].push({ slot: p, x: dv.getFloat32(a + L.P_PX, true), z: dv.getFloat32(a + L.P_PZ, true) });
    }
  }
  const coming = [];
  for (const b of list) {
    const l = cachedLanding(view, b, c);
    if (l) coming.push({ b, ...l, half: l.x > c.cx ? 1 : 0 });
  }
  coming.sort((a, b) => a.eta - b.eta || a.b.k - b.b.k);
  const job = new Map(); // slot -> the coming volleyball it plays
  for (const v of coming) {
    let best = null, bt = Infinity;
    for (const m of side[v.half]) {
      if (job.has(m.slot)) continue;
      const t = Math.hypot(m.x - v.x, m.z - v.z) / 8 - v.eta * TICK;
      if (t < bt) { bt = t; best = m; }
    }
    if (best) job.set(best.slot, v);
  }
  const rank = new Map();
  for (const s of [0, 1]) side[s].forEach((m, i) => rank.set(m.slot, [i, side[s].length]));
  view._vb = { tick: view.tick, bank: o, c, state, t: state === L.H_PLAY ? (view.tick - dv.getUint32(L.HDR_START + o, true)) | 0 : 0, balls: list, coming, job, rank, side };
  return view._vb;
}

// landing() for flying volleyball b on the view's tick, from the flight
// worked out when it was last touched or served (a touch's tick, its
// toucher and its count, its state, mark a flight; nothing but a touch or a
// serve changes one): the ticks to come counted from now, and a crossing
// already behind it gone, as landing() itself would have it from now.
const PATHS = new WeakMap(); // memory -> Map(k -> { key, tick, l })
function cachedLanding(view, b, c) {
  if (b.st !== MC.VB_FLY) return null;
  let m = PATHS.get(view.u8.buffer);
  if (!m) PATHS.set(view.u8.buffer, m = new Map());
  const key = `${b.at}:${b.by}:${b.n}:${b.next}:${c.hx}:${c.hz}`;
  let e = m.get(b.k);
  if (!e || e.key !== key || view.tick < e.tick) {
    const l = landing(b, c);
    if (!l) return null;
    m.set(b.k, e = { key, tick: view.tick, l });
  }
  const d = view.tick - e.tick, l = e.l;
  if (!d) return l;
  const land = { x: l.lx, z: l.lz, eta: l.ticks - d };
  const lo = l.eta - d > 0 ? { x: l.x, z: l.z, eta: l.eta - d } : land;
  const hi = l.hi && l.hi.eta - d > 0 ? { ...l.hi, eta: l.hi.eta - d } : null;
  return { ...lo, hi, lx: l.lx, lz: l.lz, side: l.side, ticks: l.ticks - d };
}

// Slot's home spot: its place k of m among its side's balls in, in a grid over the half as the round lays them out.
function home(c, s, k, m) {
  const cols = Math.max(1, Math.round(Math.sqrt(m * 2 * c.hz / c.hx))), rows = Math.ceil(m / cols);
  return [c.cx + dir(s) * c.hx * (0.15 + 0.75 * (Math.floor(k / cols) + 0.5) / rows), c.cx + c.hz * 0.9 * (((k % cols) + 0.5) * 2 / cols - 1)];
}

// A heading for a ball at (px, pz) rolling (vx, vz) to be at (tx, tz) rolling
// (wx, wz): toward the velocity it wants (to the spot, slowing as it nears,
// plus the roll it wants there), braking when it's near enough.
function steer(px, pz, vx, vz, tx, tz, wx = 0, wz = 0) {
  const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz);
  const k = Math.min(10, d * 3) / (d || 1);
  const ex = dx * k + wx - vx, ez = dz * k + wz - vz;
  return { yaw: Math.atan2(ez, ex), move: Math.hypot(ex, ez) > 0.8 ? 1 : 0 };
}

// The spot on the other half a spike from (x, z) should go for: of a grid
// over it, the one farthest from the other side's balls, give or take luck.
function aimAt(w, s, x, z, r) {
  const c = w.c, foes = w.side[1 - s];
  let best = null, bs = -Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
    const ax = c.cx - dir(s) * c.hx * (0.25 + 0.2 * i), az = c.cx + c.hz * 0.8 * (j / 2 - 1);
    let m = 30;
    for (const b of foes) m = Math.min(m, Math.hypot(b.x - ax, b.z - az));
    const sc = m - 0.05 * Math.hypot(ax - x, az - z) + 3 * luck(r + i * 5 + j, s);
    if (sc > bs) { bs = sc; best = [ax, az]; }
  }
  return best;
}

// Where a touch at (x, y, z) from a ball rolling (ux, uz) at sp, in the air
// or not, sends a volleyball: its landing (as landing() has it), or null.
function sent(c, s, x, y, z, ux, uz, sp, air) {
  const t = touch(ux * sp, uz * sp, air, s);
  return landing({ st: MC.VB_FLY, x, y, z, ...t }, c, PLAT_Y - 1, PLAT_Y - 1, 500);
}

// The word for a ball with a volleyball coming down to it: a run-up behind
// the spot it falls through a ball's reach, from where it means to send it,
// then along it into the spot its last RUN s. Its plan, made once a touch,
// from luck: a spike, from a hop as it comes into reach, at the open floor

// over the net, or else straight over it, if one flown on as $vb_fly would
// fly it lands on the other side; else a bump, rolling under it, on to a
// spot near the net for a teammate (the side's last touch: as hard as it can
// toward the net). Skill sets how often it goes for the spike, how soon it
// reads a touch, how close it gets and how hard it goes into it.
function play(view, w, me, bot, tick) {
  const v = w.job.get(me.slot);
  if (!v) return null;
  const c = w.c, s = me.side, tn = -dir(s);
  const mem = bot?.mem || (bot ? (bot.mem = {}) : {});
  const skill = bot?.skill ?? 0.6;
  const lag = Math.max(0, (tick - view.tick) | 0);
  const mx = bot?.pos?.[0] ?? me.pos[0], mz = bot?.pos?.[1] ?? me.pos[2];
  const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  const key = `${v.b.k}:${v.b.at}:${v.b.n}`;
  if (mem.vbKey !== key) {
    const r = Math.imul(me.slot + 1, 7919) + v.b.at * 31 + v.b.k;
    const last = v.b.side === s && v.b.n >= MC.VB_MAXT - 1;
    mem.vbKey = key;
    mem.vbSeen = view.tick;
    mem.vbErr = [(luck(r, 1) - 0.5) * 7 * (1 - skill), (luck(r, 2) - 0.5) * 7 * (1 - skill)];
    mem.vbHop = Math.round((0.28 + 0.14 * luck(r, 3)) / TICK);
    mem.vbSpike = false;
    if (v.hi && (last || luck(r, 4) < 0.55 + 0.45 * skill)) {
      const sp = 3 + 4 * skill;
      const a = aimAt(w, s, v.hi.x, v.hi.z, r);
      // over, with room: met a little low, and a little harder than it means to
      const over = (ux, uz) => [[sp, 0], [sp + 2, -0.4]].every(([q, dy]) => { const to = sent(c, s, v.hi.x, SPIKE_Y + dy, v.hi.z, ux, uz, q, true); return to && to.side !== s; });
      for (const [ax, az] of [[a[0] - v.hi.x, a[1] - v.hi.z], [tn, 0.4], [tn, -0.4], [tn, 0]]) {
        const l = Math.hypot(ax, az), ux = ax / l, uz = az / l;
        if (ux * tn > 0.75 && over(ux, uz)) { mem.vbSpike = true; mem.vbU = [ux, uz]; mem.vbSp = sp; break; }
      }
    }
    if (!mem.vbSpike) {
      // a set: on to 3.5 m off the net, as fast as gets it there in about 1.5 s; the last touch, all it has toward the net
      const gx = c.cx + dir(s) * 3.5 - v.x, gz = (c.cx - v.z) * 0.2, l = Math.hypot(gx, gz) || 1;
      mem.vbU = last ? [tn, 0] : [gx / l, gz / l];
      mem.vbSp = last ? 9 : Math.max(0, Math.min(9, (l / 1.5 - MC.VB_BUMP0) / MC.VB_BUMPK));
    }
  }
  // it reads a touch its reaction time after it sees it
  if (view.tick - mem.vbSeen < Math.round((0.5 - 0.3 * skill) / TICK)) return null;
  // a spike meets it high, from a hop; a bump low, rolling
  const at = mem.vbSpike && v.hi ? v.hi : v;
  const eta = at.eta - lag; // ticks from the word's tick
  if (eta < -20) return null;
  const [ux, uz] = mem.vbU;
  // where to be: a run-up behind the spot from where it's going, then along it into the spot
  const run = Math.min(Math.max(0, eta) * TICK, RUN), sp = mem.vbSp;
  const tx = at.x - ux * sp * run + mem.vbErr[0], tz = at.z - uz * sp * run + mem.vbErr[1];
  const into = eta * TICK < RUN + 0.1 ? sp : 0;
  const out = steer(mx, mz, vx, vz, tx, tz, ux * into, uz * into);
  const near = Math.hypot(at.x - mx, at.z - mz);
  const hop = mem.vbSpike && me.ground && eta <= mem.vbHop && eta > mem.vbHop - 20 && near < 2.6;
  return { yaw: out.yaw, move: out.move, hop: hop ? 1 : 0 };
}

export default {
  id: L.MG_VOLLEY, key: 'volley', name: 'VOLLEYBALL',
  hint: 'ROLL INTO A VOLLEYBALL TO BUMP IT  HOP INTO IT TO SPIKE IT OVER',
  rules: 'A BALL ON YOUR FLOOR IS THEIR POINT  SO ARE FOUR TOUCHES IN A ROW',
  env: 'day',

  draw(view, ctx, out) {
    const c = court(view);
    if (!(c.hx > 0)) return;
    const g = view.party();
    const sc = out.scene, cx = c.cx;
    const now = (ctx?.now ?? 0) / 1000;
    // the halves, their lines, the net on its posts, the walls and the glass
    for (const s of [0, 1]) {
      sc.box(cx + dir(s) * c.hx / 2, PLAT_Y - HH, cx, c.hx / 2, HH, c.hz, 0, ...WOOD[s], LOOK.WOOD);
      // the attack line, a third of the way back, and the back line
      sc.box(cx + dir(s) * c.hx / 3, PLAT_Y + 0.01, cx, 0.06, 0.01, c.hz, 0, 0.95, 0.95, 0.95, LOOK.MATTE);
      sc.box(cx + dir(s) * (c.hx - 0.08), PLAT_Y + 0.01, cx, 0.08, 0.01, c.hz, 0, 0.95, 0.95, 0.95, LOOK.MATTE);
    }
    const NH = MC.VB_NET_H;
    sc.box(cx, PLAT_Y + NH / 2, cx, 0.04, NH / 2, c.hz, 0, 0.12, 0.12, 0.14, LOOK.CHECKER, 0.2, 0.2, 0.6);
    sc.box(cx, PLAT_Y + NH - 0.1, cx, 0.07, 0.1, c.hz, 0, 0.97, 0.97, 0.97, LOOK.PLASTIC);
    for (const e of [-1, 1]) sc.cyl(cx, PLAT_Y + (NH + 0.3) / 2, cx + e * (c.hz - 0.15), 0.14, (NH + 0.3) / 2, 0.7, 0.7, 0.75, LOOK.METAL);
    const GH = 6;
    for (const s of [-1, 1]) {
      sc.box(cx, PLAT_Y + MC.VB_WALL_H / 2, cx + s * (c.hz + 0.2), c.hx + 0.4, MC.VB_WALL_H / 2, 0.2, 0, ...WALL, LOOK.PLASTIC);
      sc.box(cx + s * (c.hx + 0.2), PLAT_Y + MC.VB_WALL_H / 2, cx, 0.2, MC.VB_WALL_H / 2, c.hz + 0.4, 0, ...WALL, LOOK.PLASTIC);
      sc.box(cx, PLAT_Y + MC.VB_WALL_H + GH / 2, cx + s * (c.hz + 0.1), c.hx + 0.3, GH / 2, 0.05, 0, ...GLASS, LOOK.ICE, 0, 0, 0.14);
      sc.box(cx + s * (c.hx + 0.1), PLAT_Y + MC.VB_WALL_H + GH / 2, cx, 0.05, GH / 2, c.hz + 0.3, 0, ...GLASS, LOOK.ICE, 0, 0, 0.14);
    }
    if (g.state !== L.H_PLAY && g.state !== L.H_COUNT && g.state !== L.H_OVER) return;
    // the volleyballs: flying ones flown on to the prediction's tick, dead ones on to now, waiting ones at their server's spot
    const ptick = typeof ctx?.ptick === 'number' ? ctx.ptick : g.tick + (ctx?.dt || 0) / TICK;
    const ahead = g.state === L.H_PLAY ? Math.max(0, Math.min(60, ptick - g.tick)) : 0;
    const whole = Math.floor(ahead), frac = ahead - whole;
    const dt = g.state === L.H_PLAY ? ctx?.dt || 0 : 0;
    const t = playT(g);
    for (const b of balls(view)) {
      let x = b.x, y = b.y, z = b.z, alpha = 1;
      if (b.st === MC.VB_FLY) ({ x, y, z } = fly({ ...b }, c, whole, frac));
      else if (b.st === MC.VB_DEAD) {
        ({ x, y, z } = fly({ ...b }, c, Math.floor(dt / TICK), (dt / TICK) % 1));
        alpha = t >= 0 ? Math.max(0.25, Math.min(1, (b.next - t) / 120)) : 0.25;
      } else {
        y += 0.2 * Math.sin(now * 2.5 + b.k);
        alpha = t >= 0 ? Math.max(0.35, 1 - (b.next - t) / 250) : 0.35;
      }
      const col = LEATHER[b.k & 1];
      sc.sphere(x, y, z, MC.VB_R, ...col, LOOK.PLASTIC, 0, 0, alpha, b.k);
      if (alpha > 0.7) out.casters.push([x, y, z, -MC.VB_R]);
      if (b.st === MC.VB_WAIT && t >= 0 && b.next - t < 125) {
        out.glow.push({ pos: [x, y, z], size: 3.2, color: [...SIDES[b.serve & 1].color, 0.5], kind: SPRITE.RING, minpx: 2 });
      }
      if (b.st !== MC.VB_FLY) continue;
      // where it comes down, in the colour of whose floor that is; the side's touches in a row over it
      const l = landing({ ...b }, c, PLAT_Y);
      if (l) {
        const near = Math.max(0, 1 - (l.ticks - ahead) / 250);
        out.decals.push({ pos: [l.lx, PLAT_Y + 0.04, l.lz], radius: MC.VB_R * (1.6 - 0.6 * near), width: 0.2 + 0.25 * near, color: [...SIDES[l.side].color, 0.35 + 0.5 * near], kind: DECAL.RING });
      }
      out.decals.push({ pos: [x, PLAT_Y + 0.03, z], radius: MC.VB_R * 0.9, color: [0, 0, 0, 0.25], kind: DECAL.DISC });
      if (b.side < 2 && b.n > 0) {
        for (let i = 0; i < b.n; i++) {
          out.glow.push({ pos: [x + (i - (b.n - 1) / 2) * 0.7, y + MC.VB_R + 0.6, z], size: 0.45, color: [...SIDES[b.side].color, b.n >= MC.VB_MAXT ? 0.95 : 0.7], kind: SPRITE.FLASH, minpx: 2 });
        }
      }
    }
  },

  // the whole court
  frame(view) {
    const c = court(view), g = view.party();
    const cx = c.cx || g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: (c.hx > 0 ? c.hx : g.size) + 1, shape: 'square' };
  },

  // the countdown turns you to the net
  facing(view, slot) {
    return sideOf(view, slot) ? Math.PI : 0;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    if (fx.kind === MC.VB_FX_TOUCH) {
      const spike = fx.shot & 256, n = fx.shot >> 9;
      ctx.glow?.({ pos: fx.pos, size: spike ? 3 : 2, color: spike ? [1, 0.9, 0.5, 0.9] : [1, 1, 1, 0.6], kind: spike ? SPRITE.SPARK : SPRITE.FLASH, life: spike ? 300 : 180 });
      ctx.sound?.boing?.(spike ? 24 : 12, fx.owner === ctx.slot ? 0 : d);
      if (fx.owner === ctx.slot && spike) ctx.banner?.('SPIKE!', C.YELLOW, 700);
      else if (fx.owner === ctx.slot && n >= MC.VB_MAXT) ctx.banner?.(`TOUCH ${n}  IT HAS TO GO OVER`, C.ORANGE, 900);
    } else if (fx.kind === MC.VB_FX_POINT) {
      const s = (fx.shot >> 8) & 1, fault = fx.shot & 512;
      const mine = ctx.view ? sideOf(ctx.view, ctx.slot) : -1;
      ctx.glow?.({ pos: [fx.pos[0], PLAT_Y + 0.1, fx.pos[2]], size: 4, color: [...SIDES[s].color, 0.9], kind: SPRITE.RING, life: 500, grow: true });
      ctx.sound?.land?.(Math.min(30, 600 / (d + 20)));
      const who = fx.owner !== 255 ? name(fx.owner) : null;
      const theirs = who && ctx.view && sideOf(ctx.view, fx.owner) === s;
      ctx.feed?.(`${SIDES[s].name} SCORES ${fx.size}${fault ? `  ${who || 'A BALL'} TOUCHED IT FOUR TIMES` : theirs ? `  ${who}` : ''}`,
        mine === s ? C.GREEN : mine === 1 - s ? C.RED : s ? C.CYAN : C.RED);
      if (ctx.slot >= 0 && mine >= 0 && ctx.view?.partier?.(ctx.slot)?.live) {
        if (mine === s) { ctx.banner?.(fx.owner === ctx.slot && !fault ? 'YOUR POINT!' : 'POINT!', C.GREEN, 1000); ctx.sound?.kill?.(); }
        else ctx.banner?.(fault ? 'FOUR TOUCHES  THEIR POINT' : `POINT TO ${SIDES[s].name}`, C.RED, 1000);
      }
    } else if (fx.kind === MC.VB_FX_SERVE) {
      ctx.glow?.({ pos: fx.pos, size: 2.5, color: [...SIDES[(fx.shot >> 8) & 1].color, 0.7], kind: SPRITE.RING, life: 300, grow: true });
      ctx.sound?.boing?.(16, d);
    } else if (fx.kind === MC.VB_FX_NET) {
      ctx.glow?.({ pos: fx.pos, size: 1.5, color: [1, 1, 1, 0.4], kind: SPRITE.FLASH, life: 150 });
      if (d < 40) ctx.sound?.land?.(Math.min(20, fx.size * 3));
    }
  },

  // the target; your touches, spikes and points; one coming down to you
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const c = court(view);
    if (!(c.hx > 0)) return;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    ctx.right(3, `FIRST TO ${c.goal}`, C.GREY);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    const s = slotOf(view, ctx.slot);
    ctx.right(4, `TOUCHES ${s.touches}  SPIKES ${s.spikes}  POINTS ${s.kills}`, C.GREY);
    const w = worldOf(view);
    let soon = null;
    for (const v of w.coming) if (v.half === me.side && Math.hypot(v.x - me.pos[0], v.z - me.pos[2]) < 8 && (!soon || v.eta < soon.eta)) soon = v;
    if (soon && soon.eta < 190) {
      const blink = Math.floor((ctx.now || 0) / 200) & 1;
      const last = soon.b.side === me.side && soon.b.n >= MC.VB_MAXT;
      ctx.centre(row, last ? 'THREE TOUCHES  ONE MORE IS THEIR POINT' : soon.b.side === me.side && soon.b.n === MC.VB_MAXT - 1 ? 'LAST TOUCH  HOP INTO IT TO SEND IT OVER' : 'GET UNDER IT  HOP INTO IT TO SPIKE',
        last ? C.ORANGE : blink ? C.YELLOW : C.WHITE);
    }
  },

  brain: {
    // under a volleyball coming down on its half that's a teammate's to play: in the way (a touch it didn't mean counts)
    danger(view, x, z, tick, me) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return 0;
      const mine = w.job.get(me.slot);
      let d = 0;
      for (const v of w.coming) {
        if (v === mine || v.half !== me.side) continue;
        const dx = x - v.x, dz = z - v.z, d2 = dx * dx + dz * dz;
        if (d2 < 9) d = Math.max(d, 0.6 * (1 - Math.sqrt(d2) / 3));
      }
      return d;
    },
    // its home spot over its half, spread among its side
    goal(view, me) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return null;
      const r = w.rank.get(me.slot);
      if (!r) return null;
      return home(w.c, me.side, r[0], r[1]);
    },
    hop() { return false; },
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      return play(view, w, me, bot, tick);
    },
  },
};
