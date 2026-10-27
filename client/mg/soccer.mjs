// SOCCER, as drawn and as the AI ball sees it. A striped grass pitch, its
// lines, boards round it with glass over them and the corners cut, and at
// each end a goal: white posts and bar and a net in the colour of the side
// that defends it. The footballs are drawn from the confirmed world, flown on
// to the prediction's tick as $so_fly flies them (a touch comes a round trip
// late, so in flight they're where they'll be when your own ball gets
// there), turning as they roll; one in the air rings the floor where it
// comes down, and one on its spot for a kickoff pulses there till it's let go.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/soccer.mjs'; // SO_*: the minigame's own constants
import { PLAT_Y, B_RAD, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const HH = 0.5; // the floor's half height, m
const GRASS = [[0.27, 0.55, 0.22], [0.33, 0.62, 0.26]];
const LINE = [0.95, 0.95, 0.95];
const BOARD = [0.9, 0.9, 0.92];
const GLASS = [0.8, 0.9, 1];
const WALL_H = 1.2; // the boards' height (a football comes off the glass over them at any height)
const GLASS_H = 6;
const f = Math.fround;
const luck = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 7, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 2 ** 32; };
const sgn = (x) => (x < 0 || Object.is(x, -0) ? -1 : 1); // f32.copysign(1, x)

// ---- what the sim keeps, read

// The pitch on the view's bank.
export function pitch(view) {
  const dv = view.dv, o = view.bank || 0, h = (k) => L.PG_H + k + o;
  const tn = dv.getUint32(h(MC.SO_TN), true);
  return { hx: dv.getFloat32(h(MC.SO_HX), true), hz: dv.getFloat32(h(MC.SO_HZ), true), nb: dv.getUint32(h(MC.SO_NB), true), goal: dv.getUint32(h(MC.SO_GOAL), true),
    gw: dv.getFloat32(h(MC.SO_GW), true), boxd: dv.getFloat32(h(MC.SO_BOXD), true), boxhw: dv.getFloat32(h(MC.SO_BOXHW), true), cn: dv.getFloat32(h(MC.SO_CN), true),
    ko: dv.getUint32(h(MC.SO_KO), true) | 0, kogo: dv.getUint32(h(MC.SO_KOGO), true) | 0, tn: [tn & 0xffff, tn >>> 16], cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Side s's way from the halfway line to its own goal.
export const dir = (s) => (s ? 1 : -1);
// The footballs (PG_S, the confirmed world's), the unused left out: x and z from the pitch's centre, y over the floor.
export function footballs(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  const n = Math.min(MC.SO_NMAX, dv.getUint32(L.PG_H + MC.SO_NB, true));
  for (let k = 0; k < n; k++) {
    const a = L.PG_S + MC.SO_BALL + k * MC.SO_FSIZE;
    const st = u8[a + MC.SO_FST];
    if (st === MC.SO_NONE) continue;
    out.push({ k, st, by: u8[a + MC.SO_FBY], last: [u8[a + MC.SO_FLAST], u8[a + MC.SO_FLAST + 1]], at: dv.getUint32(a + MC.SO_FAT, true) | 0,
      next: dv.getUint32(a + MC.SO_FNEXT, true) | 0,
      x: dv.getFloat32(a + MC.SO_FX, true), y: dv.getFloat32(a + MC.SO_FY, true), z: dv.getFloat32(a + MC.SO_FZ, true),
      vx: dv.getFloat32(a + MC.SO_FVX, true), vy: dv.getFloat32(a + MC.SO_FVY, true), vz: dv.getFloat32(a + MC.SO_FVZ, true) });
  }
  return out;
}
// Slot p's tallies.
export function slotOf(view, p) {
  const a = L.PG_S + MC.SO_SLOT + p * MC.SO_SSIZE, dv = view.dv;
  return { touches: dv.getUint16(a + MC.SO_TOUCHES, true), goals: dv.getUint16(a + MC.SO_GOALS, true), saves: dv.getUint16(a + MC.SO_SAVES, true), own: dv.getUint16(a + MC.SO_OWN, true) };
}
// Football k's spot on the halfway line, as $so_spot puts it.
export function spot(c, k) {
  return [0, f(f(f(f(f(f(k) + 0.5) * 2) / f(c.nb)) - 1) * f(c.hz * f(0.8)))];
}
// Place k of m on side s, world [x, z], as $so_form lays it out (for drawing and steering: near enough).
export function place(c, s, k, m) {
  const deep = c.hx - (MC.SO_X0 + 2);
  m = Math.max(1, m);
  k %= m;
  const cols = Math.max(1, Math.round(Math.sqrt(m * 2 * c.hz / deep))), rows = Math.ceil(m / cols);
  return [c.cx + dir(s) * (deep * (Math.floor(k / cols) + 0.5) / rows + MC.SO_X0), c.cx + (((k % cols) + 0.5) * 2 / cols - 1) * c.hz * 0.85];
}

// Football b (a copy, changed) flown n whole ticks on, then frac of one more,
// as $so_fly does it in f32, short of the balls that touch it and the other
// footballs: rolling or falling, the walls, the chamfers, a goal's box, the
// posts and the bar, the floor; in a goal, b.goal is the side that scored
// and it flies no further.
export function fly(b, c, n, frac = 0) {
  const R = f(MC.SO_R), DT = f(TICK), hx = c.hx, hz = c.hz, gw = c.gw, cn = c.cn;
  const ROLL = f(MC.SO_ROLL), AIR = f(MC.SO_AIR), G = f(MC.SO_G), V2 = f(MC.SO_VMAX * MC.SO_VMAX), VM = f(MC.SO_VMAX);
  const gwR = f(gw - R), boxX = f(hx + f(MC.SO_GD - MC.SO_R)), roof = f(MC.SO_GH - MC.SO_R), NE = f(-MC.SO_NE), WE = f(-MC.SO_WE), WE1 = f(1 + MC.SO_WE);
  const hxR = f(hx - R), hzR = f(hz - R), corner = f(f(hx + hz) - cn), RS2 = f(MC.SO_R * Math.SQRT2), GH = f(MC.SO_GH);
  const FRR = f(MC.SO_R + MC.SO_FR), FRR2 = f((MC.SO_R + MC.SO_FR) * (MC.SO_R + MC.SO_FR)), FRE = f(1 + MC.SO_FRE);
  const SETTLE = f(-MC.SO_SETTLE), FE = f(-MC.SO_FE), FH = f(MC.SO_FH), goalX = f(hx + R);
  for (let i = 0; i <= n; i++) {
    const part = i < n ? 1 : frac;
    if (part <= 0 || b.goal !== undefined) break;
    let { x, y, z, vx, vy, vz } = b;
    if (y <= R && vy === 0) { vx = f(vx * ROLL); vz = f(vz * ROLL); } else { vy = f(vy - G); vx = f(vx * AIR); vz = f(vz * AIR); }
    const sp = f(f(f(vx * vx) + f(vy * vy)) + f(vz * vz));
    if (sp > V2) { const s = f(VM / f(Math.sqrt(sp))); vx = f(vx * s); vy = f(vy * s); vz = f(vz * s); }
    if (part < 1) { b.x = x + vx * TICK * part; b.y = Math.max(R, y + vy * TICK * part); b.z = z + vz * TICK * part; break; }
    x = f(f(vx * DT) + x); y = f(f(vy * DT) + y); z = f(f(vz * DT) + z);
    const sx = sgn(x), sz = sgn(z);
    let ax = Math.abs(x), az = Math.abs(z);
    vx = f(vx * sx); vz = f(vz * sz);
    if (ax > hx && az < gw) {
      if (az > gwR) { az = gwR; if (vz > 0) vz = f(vz * NE); }
      if (ax > boxX) { ax = boxX; if (vx > 0) vx = f(vx * NE); }
      if (y > roof) { y = roof; if (vy > 0) vy = f(vy * NE); }
    } else if (ax > hx) {
      ax = hxR; if (vx > 0) vx = f(vx * WE);
    } else {
      let q = f(f(f(ax + az) - corner) + RS2);
      if (q > 0) {
        ax = f(ax - f(q * 0.5)); az = f(az - f(q * 0.5));
        q = f(f(vx + vz) * 0.5);
        if (q > 0) { vx = f(vx - f(q * WE1)); vz = f(vz - f(q * WE1)); }
      }
      if (az > hzR) { az = hzR; if (vz > 0) vz = f(vz * WE); }
      if (ax > hxR && (az >= gw || y >= GH)) { ax = hxR; if (vx > 0) vx = f(vx * WE); }
    }
    for (let j = 0; j < 2; j++) {
      let dx = f(ax - hx), dy, dz;
      if (j) { dy = f(y - GH); dz = f(az - Math.min(az, gw)); } else { dy = f(y - Math.min(Math.max(y, 0), GH)); dz = f(az - gw); }
      let dd = f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz));
      if (dd < FRR2 && dd > 0) {
        dd = f(Math.sqrt(dd));
        let q = f(FRR - dd);
        dx = f(dx / dd); dy = f(dy / dd); dz = f(dz / dd);
        ax = f(f(dx * q) + ax); y = f(f(dy * q) + y); az = f(f(dz * q) + az);
        q = f(f(f(vx * dx) + f(vy * dy)) + f(vz * dz));
        if (q < 0) { q = f(q * FRE); vx = f(vx - f(q * dx)); vy = f(vy - f(q * dy)); vz = f(vz - f(q * dz)); }
      }
    }
    if (y < R) {
      y = R;
      if (vy < SETTLE) { vy = f(vy * FE); vx = f(vx * FH); vz = f(vz * FH); } else vy = 0;
    }
    x = f(ax * sx); z = f(az * sz); vx = f(vx * sx); vz = f(vz * sz);
    Object.assign(b, { x, y, z, vx, vy, vz });
    if (ax > goalX && az < gw) b.goal = x < 0 ? 1 : 0;
  }
  return b;
}

// A football's path from the view's tick: n + 1 points [x, y, z] (local),
// ticks 0..n, flown as fly() flies it (till a goal; the rest then repeat it).
export function path(b, c, n) {
  const s = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz };
  const out = new Float32Array(3 * (n + 1));
  for (let i = 0; i <= n; i++) {
    if (i) fly(s, c, 1);
    out[3 * i] = s.x; out[3 * i + 1] = s.y; out[3 * i + 2] = s.z;
  }
  return out;
}

const sideOf = (view, p) => (view.u8[L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.P_FL] & L.PF_BLUE ? 1 : 0);
const playT = (g) => (g.state === L.H_PLAY ? g.t : -1);
const HORIZON = 150; // ticks of each football's path the AI reads

// ---- the AI ball

// Paths flown on from the confirmed world, kept while the football flies as
// fly() said it would (no touch, no other football in the way): a touch's
// tick and toucher, its state and its next mark one, and the point it should
// be at now has to be where it is.
const PATHS = new WeakMap(); // memory -> Map(k -> { key, tick, p })
function pathOf(view, b, c) {
  let m = PATHS.get(view.u8.buffer);
  if (!m) PATHS.set(view.u8.buffer, m = new Map());
  const key = `${b.at}:${b.by}:${b.st}:${b.next}:${c.hx}`;
  const e = m.get(b.k), d = e ? view.tick - e.tick : -1;
  if (e && e.key === key && d >= 0 && d <= HORIZON / 2 && e.p[3 * d] === b.x && e.p[3 * d + 1] === b.y && e.p[3 * d + 2] === b.z) return { p: e.p, o: d };
  const p = path(b, c, HORIZON * 2);
  m.set(b.k, { key, tick: view.tick, p });
  return { p, o: 0 };
}
// Football b's point i ticks after the view's (local [x, y, z]).
const at = (fp, i) => { const j = fp.still ? 0 : 3 * Math.min(fp.o + Math.max(0, i), HORIZON * 2); return [fp.p[j], fp.p[j + 1], fp.p[j + 2]]; };

// Roles kept from one world tick to the next, so a ball keeps its job until
// another is clearly better placed: memory -> Map(slot -> { role, k }).
const ROLES = new WeakMap();

// What every AI ball looking at one world tick shares: the pitch, the
// footballs in play and their paths, each side's balls in and each side's
// keeper as the other sees it; then each side's jobs: for each football (the
// one nearest our goal first) the ball that gets to it soonest (slower from
// in front of it, where it has to go round; a little quicker for the one on
// it already), a chaser, and while the side has three for each and one over,
// a second, its support; while a football is in our third, of the rest the
// one nearest our goal (two, for two such) keeps goal; the rest go home to a
// grid over the pitch drawn toward the play, and play one that comes within
// 4 m of them.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._so;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const c = pitch(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const t = state === L.H_PLAY ? (view.tick - dv.getUint32(L.HDR_START + o, true)) | 0 : 0;
  const list = state === L.H_PLAY ? footballs(view).filter((b) => b.st === MC.SO_LIVE || b.st === MC.SO_HELD) : [];
  for (const b of list) b.fp = b.st === MC.SO_LIVE ? pathOf(view, b, c) : { p: new Float32Array([b.x, b.y, b.z]), o: 0, still: true };
  const side = [[], []];
  if (state === L.H_PLAY) {
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + o + p * L.PSIZE;
      const fl = view.u8[a + L.P_FL];
      if ((fl & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
      side[fl & L.PF_BLUE ? 1 : 0].push({ slot: p, x: dv.getFloat32(a + L.P_PX, true) - c.cx, z: dv.getFloat32(a + L.P_PZ, true) - c.cx });
    }
  }
  // each side's keeper as the other side sees it: the ball nearest the middle of its goal mouth, within 6 m of it
  const keeper = [0, 1].map((s) => {
    let k = null, kd = 6;
    for (const m of side[s]) { const d = Math.hypot(m.x - dir(s) * c.hx, m.z); if (d < kd) { kd = d; k = m.z; } }
    return k;
  });
  let prev = ROLES.get(view.u8.buffer);
  if (!prev || prev.round !== dv.getUint32(L.HDR_HOLE + o, true)) ROLES.set(view.u8.buffer, prev = { round: dv.getUint32(L.HDR_HOLE + o, true), map: new Map() });
  const job = new Map(); // slot -> { role: 'chase' | 'keep' | 'home', b, i, n }
  for (const s of [0, 1]) {
    const mine = side[s];
    if (!mine.length) continue;
    const tn = -dir(s);
    // the footballs, the one nearest our goal first
    const order = list.slice().sort((a, b) => b.x * dir(s) - a.x * dir(s) || a.k - b.k);
    // a chaser for each, and a second for each while the side has the balls to spare (three in for each football and a keeper)
    const per = mine.length >= 3 * order.length + 1 ? 2 : 1;
    for (let n = 0; n < per; n++) {
      for (const b of order) {
        let best = null, bt = Infinity;
        for (const m of mine) {
          if (job.has(m.slot)) continue;
          // behind it (goal-side) is quicker to play from than in front, where it has to go round
          const ahead = (m.x - b.x) * tn > 0 ? 1.2 : 0;
          const was = prev.map.get(m.slot);
          const keep = was && was.role === 'chase' && was.k === b.k ? 0.5 : 0;
          const tt = Math.hypot(m.x - b.x, m.z - b.z) / 8 + ahead - keep;
          if (tt < bt) { bt = tt; best = m; }
        }
        if (best) job.set(best.slot, { side: s, role: 'chase', b, n });
      }
    }
    // keepers, while a football is in our third: of the rest, the nearest our goal
    const rest = mine.filter((m) => !job.has(m.slot));
    const threat = list.filter((b) => b.x * dir(s) > c.hx * 0.33).length;
    const nk = mine.length >= 3 ? Math.min(rest.length, threat, 2) : 0;
    const gx = dir(s) * c.hx;
    const near = rest.map((m) => {
      const was = prev.map.get(m.slot);
      return { m, d: Math.hypot(m.x - gx, m.z) - (was && was.role === 'keep' ? 4 : 0) };
    }).sort((a, b) => a.d - b.d || a.m.slot - b.m.slot);
    near.slice(0, nk).sort((a, b) => a.m.z - b.m.z || a.m.slot - b.m.slot).forEach(({ m }, i) => job.set(m.slot, { side: s, role: 'keep', i, n: nk }));
    const home = rest.filter((m) => !job.has(m.slot)).sort((a, b) => a.slot - b.slot);
    home.forEach((m, i) => {
      // one that a football comes near plays it too
      let b = null, bd = 4;
      for (const f of list) { if (f.st !== MC.SO_LIVE) continue; const d = Math.hypot(f.x - m.x, f.z - m.z); if (d < bd) { bd = d; b = f; } }
      job.set(m.slot, b ? { side: s, role: 'chase', b, i, n: home.length } : { side: s, role: 'home', i, n: home.length });
    });
  }
  prev.map = new Map([...job].map(([slot, j]) => [slot, { role: j.role, k: j.b ? j.b.k : -1 }]));
  view._so = { tick: view.tick, bank: o, c, state, t, list, side, job, keeper };
  return view._so;
}

// Where side s wants football b to go from local (x, z): the other goal
// (the far side of its mouth from its keeper at kz, or with none, from
// where the ball comes, give or take luck), turned away from our own goal as
// it gets near it (a clearance).
function aim(c, s, x, z, r, kz = null) {
  const tn = -dir(s);
  const gz = kz === null ? Math.max(-c.gw * 0.55, Math.min(c.gw * 0.55, -z * 0.15 + (luck(r, 9) - 0.5) * c.gw * 0.6))
    : (kz > 0.3 || (kz > -0.3 && luck(r, 9) < 0.5) ? -1 : 1) * c.gw * (0.5 + 0.15 * luck(r, 10));
  let ux = tn * c.hx - x, uz = gz - z;
  let l = Math.hypot(ux, uz) || 1;
  ux /= l; uz /= l;
  // our own goal: within 0.4 of the length of it, more and more straight away from it
  const ox = x - dir(s) * c.hx, d = Math.hypot(ox, z);
  const w = Math.max(0, Math.min(1, 1.6 - d / (0.5 * c.hx)));
  if (w > 0) {
    ux = ux * (1 - w) + (ox / (d || 1)) * w; uz = uz * (1 - w) + (z / (d || 1)) * w;
    l = Math.hypot(ux, uz) || 1;
    ux /= l; uz /= l;
  }
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

// The chaser's word: to the point behind football b, on the far side of it
// from where it wants it to go, soonest reachable along its path; round it
// first if it is on the wrong side (never pushing it back toward its own
// goal), then in along that line and through it, at a dribble, or flat out
// near the goal. A foe close in front of it on that line: past him, turned
// half a right angle the open way, or (now and then, more with skill) a hop
// into it, a chip over him; a wall close by, off it. A chip too now and
// then from 9 to 24 m out. Skill sets how fast it reckons it gets there and
// how true it lines up.
function chase(w, me, bot, b, lag) {
  const c = w.c, s = me.side, tn = -dir(s);
  const skill = bot?.skill ?? 0.6;
  const mem = bot?.mem || {};
  const px = (bot?.pos?.[0] ?? me.pos[0]) - c.cx, pz = (bot?.pos?.[1] ?? me.pos[2]) - c.cx;
  const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  const rr = MC.SO_R + B_RAD;
  const r = Math.imul(me.slot + 1, 7919) + b.at * 31 + b.k;
  const vmax = 6.5 + 2.5 * skill;
  // the soonest point along its path it can be behind it
  let pick = null;
  for (let i = 0; i <= HORIZON; i += 3) {
    const [fx, fy, fz] = at(b.fp, i + lag);
    const [ux, uz] = aim(c, s, fx, fz, r, w.keeper[1 - s]);
    const tt = Math.hypot(fx - ux * rr - px, fz - uz * rr - pz) / vmax + 0.15;
    pick = { fx, fy, fz, ux, uz, i };
    if (tt <= i * TICK || b.fp.still) break;
  }
  const { fx, fz } = pick;
  let { ux, uz } = pick;
  // a foe in the way: round him, or over him
  let block = false;
  for (const q of w.side[1 - s]) {
    const qx = q.x - fx, qz = q.z - fz, a = qx * ux + qz * uz, l = -qx * uz + qz * ux;
    if (a > 0.5 && a < 6 && Math.abs(l) < 2.4) { block = l < 0 || Object.is(l, -0) ? 1 : -1; break; }
  }
  const chipping = block && luck(r, 4) < 0.25 + 0.4 * skill;
  if (block && !chipping) {
    const t = 0.8 * block, ca = Math.cos(t), sa = Math.sin(t);
    const nx = ux * ca - uz * sa, nz = ux * sa + uz * ca;
    if (nx * tn > -0.1) { ux = nx; uz = nz; }
  }
  // a wall close by, the way it would go: off it, toward the middle
  if (Math.abs(fz) > c.hz - 2.5 && uz * Math.sign(fz) > -0.2) {
    uz -= 0.6 * Math.sign(fz);
    const l = Math.hypot(ux, uz) || 1;
    ux /= l; uz /= l;
  }
  const rx = px - fx, rz = pz - fz;
  const along = rx * ux + rz * uz; // how far in front of it, toward where it should go
  const perp = -rx * uz + rz * ux;
  const err = Math.abs(perp);
  // in front of it, or beside it: round it, on the side we're on, to well behind
  if (along > -rr * 0.6) {
    const side = perp < 0 || Object.is(perp, -0) ? -1 : 1;
    const back = rr + 2.2, out = rr + 1.6;
    const tx = fx - ux * back - uz * out * side, tz = fz - uz * back + ux * out * side;
    // keeping up with it as it goes
    const [nx, , nz] = at(b.fp, pick.i + lag + 1);
    return { ...steer(px, pz, vx, vz, tx, tz, (nx - fx) / TICK, (nz - fz) / TICK), hop: 0 };
  }
  const goalD = Math.hypot(tn * c.hx - fx, fz);
  const hit = goalD < 26 || block ? 10 : 5 + 2 * skill;
  // in from behind along its line: aimed a little further back the further off it is, then through it
  const lineErr = (1 - skill) * (luck(r, 3) - 0.5) * 1.2;
  const dist = Math.hypot(rx, rz);
  const behind = rr - 0.3 + Math.max(0, Math.min(3, (dist - rr) * 0.3 + err * 0.5));
  const tx = fx - ux * behind - uz * lineErr, tz = fz - uz * behind + ux * lineErr;
  const into = dist < rr + 4 ? hit : 0;
  const out = steer(px, pz, vx, vz, tx, tz, ux * into, uz * into);
  // a chip: lined up, just before it gets there
  const sp = vx * ux + vz * uz;
  const chip = (chipping || (goalD > 9 && goalD < 24 && luck(r, 5) < 0.15)) && err < 0.8 && me.ground;
  const hop = chip && sp > 2.5 && dist - rr < sp * (0.14 + 0.08 * luck(r, 6)) && !mem.soHop;
  if (bot) bot.mem.soHop = hop ? 20 : Math.max(0, (bot.mem.soHop || 0) - 1);
  return { yaw: out.yaw, move: out.move, hop: hop ? 1 : 0 };
}

// The second on a football: 5 m back from it on the way it should go and
// 4 m out on the side away from the first, to take it when it comes loose
// or back off him; within 3.5 m of it, it plays it.
function support(w, me, bot, b, lag) {
  const c = w.c, s = me.side;
  const px = (bot?.pos?.[0] ?? me.pos[0]) - c.cx, pz = (bot?.pos?.[1] ?? me.pos[2]) - c.cx;
  const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  const [fx, , fz] = at(b.fp, lag + 25);
  if (Math.hypot(fx - px, fz - pz) < 3.5) return chase(w, me, bot, b, lag);
  const [ux, uz] = aim(c, s, fx, fz, me.slot, w.keeper[1 - s]);
  let first = null;
  for (const [slot, j] of w.job) if (j.role === 'chase' && j.b === b && j.n === 0 && j.side === s) first = slot;
  const fm = first !== null ? w.side[s].find((m) => m.slot === first) : null;
  const l = fm ? -(fm.x - fx) * uz + (fm.z - fz) * ux : 0;
  const side = l > 0 ? -1 : 1;
  let tx = fx - ux * 5 - uz * 4 * side, tz = fz - uz * 5 + ux * 4 * side;
  tx = Math.max(-c.hx + 1.5, Math.min(c.hx - 1.5, tx));
  tz = Math.max(-c.hz + 1.5, Math.min(c.hz - 1.5, tz));
  return { ...steer(px, pz, vx, vz, tx, tz), hop: 0 };
}

// The keeper's word: just off its goal line in its share of the mouth,
// following the football nearest it across about half as far, and slowly
// (it reads where the football is with the lag of a fifth to a third of a
// second); out to clear one lying loose in the box near it.
function keep(w, me, bot, j, lag) {
  const c = w.c, s = me.side, gx = dir(s) * c.hx;
  const skill = bot?.skill ?? 0.6;
  const px = (bot?.pos?.[0] ?? me.pos[0]) - c.cx, pz = (bot?.pos?.[1] ?? me.pos[2]) - c.cx;
  const vx = bot?.vel?.[0] ?? me.vel[0], vz = bot?.vel?.[1] ?? me.vel[2];
  const gz = j.n > 1 ? ((j.i + 0.5) / j.n * 2 - 1) * c.gw * 0.6 : 0;
  let threat = null, td = Infinity;
  for (const b of w.list) {
    const [fx, , fz] = at(b.fp, lag);
    const d = Math.hypot(fx - gx, fz - gz);
    if (d < td) { td = d; threat = { b, fx, fz }; }
  }
  const tx = gx - dir(s) * 1.6;
  if (!threat) return { ...steer(px, pz, vx, vz, tx, gz), hop: 0 };
  const { b, fx, fz } = threat;
  const inBox = (fx * dir(s)) > c.hx - c.boxd && Math.abs(fz) < c.boxhw;
  if (inBox && Math.hypot(b.vx, b.vz) < 4 && Math.hypot(fx - px, fz - pz) < 6) return chase(w, me, bot, b, lag);
  const lim = Math.max(0, c.gw / j.n - 0.8);
  const want = Math.max(gz - lim, Math.min(gz + lim, gz + (fz - gz) * 0.35));
  const mem = bot?.mem;
  let kz = want;
  if (mem) { mem.soKz = mem.soKz === undefined ? want : mem.soKz + (want - mem.soKz) * (0.06 + 0.06 * skill); kz = mem.soKz; }
  return { ...steer(px, pz, vx, vz, tx, kz), hop: 0 };
}

// A home spot, world: place i of n in a grid over the pitch from its own box
// out to 0.6 of the way into the other half, then 0.4 of the way toward the
// football nearest it (0.35 across).
function homeOf(w, me, j) {
  const c = w.c, s = me.side;
  const x0 = dir(s) * (c.hx - c.boxd - 1), x1 = -dir(s) * 0.6 * c.hx;
  const span = Math.abs(x1 - x0);
  const cols = Math.max(1, Math.round(Math.sqrt(j.n * 2 * c.hz / span))), rows = Math.ceil(j.n / cols);
  const row = Math.floor(j.i / cols), col = j.i % cols;
  let hx = x0 + (x1 - x0) * (row + 0.5) / rows, hz = ((col + 0.5) * 2 / cols - 1) * c.hz * 0.8;
  let best = null, bd = Infinity;
  for (const b of w.list) { const d = Math.hypot(b.x - hx, b.z - hz); if (d < bd) { bd = d; best = b; } }
  if (best) { hx += (best.x - hx) * 0.55; hz += (best.z - hz) * 0.35; }
  return [c.cx + hx, c.cx + hz];
}

export default {
  id: L.MG_SOCCER, key: 'soccer', name: 'SOCCER',
  hint: 'ROLL INTO A FOOTBALL TO PUSH IT  HOP INTO IT TO CHIP IT UP AND OVER',
  rules: 'ALL THE WAY INTO THEIR GOAL IS A GOAL  FIRST TO THE TARGET WINS',
  env: 'day',

  draw(view, ctx, out) {
    const c = pitch(view);
    if (!(c.hx > 0)) return;
    const g = view.party();
    const sc = out.scene, cx = c.cx;
    const now = (ctx?.now ?? 0) / 1000;
    // the grass in stripes, under the goals' boxes too
    const ns = Math.max(4, Math.round(c.hx / 2.5)) * 2, sw = c.hx * 2 / ns;
    for (let i = 0; i < ns; i++) sc.box(cx - c.hx + (i + 0.5) * sw, PLAT_Y - HH, cx, sw / 2, HH, c.hz, 0, ...GRASS[i & 1], LOOK.MATTE);
    for (const e of [-1, 1]) sc.box(cx + e * (c.hx + MC.SO_GD / 2 + 0.1), PLAT_Y - HH, cx, MC.SO_GD / 2 + 0.1, HH, c.gw, 0, ...GRASS[0], LOOK.MATTE);
    // the lines: halfway, the goal lines, the boxes; the centre circle and spot
    const ln = (x, z, hx, hz) => sc.box(x, PLAT_Y + 0.01, z, hx, 0.01, hz, 0, ...LINE, LOOK.MATTE);
    ln(cx, cx, 0.08, c.hz);
    for (const e of [-1, 1]) {
      ln(cx + e * (c.hx - 0.08), cx, 0.08, c.hz);
      ln(cx + e * (c.hx - c.boxd), cx, 0.08, c.boxhw);
      for (const z of [-1, 1]) ln(cx + e * (c.hx - c.boxd / 2), cx + z * c.boxhw, c.boxd / 2, 0.08);
    }
    out.decals.push({ pos: [cx, PLAT_Y + 0.03, cx], radius: MC.SO_CIRC, width: 0.16, color: [...LINE, 0.85], kind: DECAL.RING });
    for (let k = 0; k < c.nb; k++) out.decals.push({ pos: [cx, PLAT_Y + 0.03, cx + spot(c, k)[1]], radius: 0.3, color: [...LINE, 0.85], kind: DECAL.DISC });
    // the boards and the glass: the sides, the ends beside the mouths and over the bars, the chamfered corners
    const wall = (x, z, hx, hz, yaw = 0) => {
      sc.box(x, PLAT_Y + WALL_H / 2, z, hx, WALL_H / 2, hz, yaw, ...BOARD, LOOK.PLASTIC);
      sc.box(x, PLAT_Y + WALL_H + GLASS_H / 2, z, hx, GLASS_H / 2, Math.min(hz, 0.05), yaw, ...GLASS, LOOK.ICE, 0, 0, 0.14);
    };
    const run = c.hx - c.cn, side = c.hz - c.cn, endLen = (c.hz - c.cn - c.gw - MC.SO_FR) / 2;
    for (const e of [-1, 1]) {
      wall(cx, cx + e * (c.hz + 0.2), run, 0.2);
      for (const z of [-1, 1]) {
        const ez = cx + z * (c.gw + MC.SO_FR + endLen);
        sc.box(cx + e * (c.hx + 0.2), PLAT_Y + WALL_H / 2, ez, 0.2, WALL_H / 2, endLen, 0, ...BOARD, LOOK.PLASTIC);
        sc.box(cx + e * (c.hx + 0.1), PLAT_Y + WALL_H + GLASS_H / 2, ez, 0.05, GLASS_H / 2, endLen, 0, ...GLASS, LOOK.ICE, 0, 0, 0.14);
        // the corner, cut at 45 degrees
        const kx = cx + e * (c.hx - c.cn / 2 + 0.14), kz = cx + z * (c.hz - c.cn / 2 + 0.14), yaw = e * z > 0 ? -Math.PI / 4 : Math.PI / 4;
        sc.box(kx, PLAT_Y + WALL_H / 2, kz, c.cn * Math.SQRT1_2 + 0.2, WALL_H / 2, 0.2, yaw, ...BOARD, LOOK.PLASTIC);
        sc.box(kx, PLAT_Y + WALL_H + GLASS_H / 2, kz, c.cn * Math.SQRT1_2 + 0.2, GLASS_H / 2, 0.05, yaw, ...GLASS, LOOK.ICE, 0, 0, 0.14);
      }
      sc.box(cx + e * (c.hx + 0.1), PLAT_Y + (MC.SO_GH + WALL_H + GLASS_H) / 2, cx, 0.05, (WALL_H + GLASS_H - MC.SO_GH) / 2, c.gw + MC.SO_FR, 0, ...GLASS, LOOK.ICE, 0, 0, 0.14);
      // the goal: its frame white, its net the defending side's colour (red's at low x)
      const col = SIDES[e < 0 ? 0 : 1].color, gx = cx + e * c.hx;
      for (const z of [-1, 1]) sc.cyl(gx, PLAT_Y + MC.SO_GH / 2, cx + z * c.gw, MC.SO_FR, MC.SO_GH / 2, 0.97, 0.97, 0.97, LOOK.PLASTIC);
      sc.cyl(gx, PLAT_Y + MC.SO_GH, cx, MC.SO_FR, c.gw, 0.97, 0.97, 0.97, LOOK.PLASTIC, 0, 0, 1, undefined, Math.PI / 2, 0);
      const net = (x, y, z, hx, hy, hz) => sc.box(x, y, z, hx, hy, hz, 0, ...col.map((v) => 0.55 + 0.45 * v), LOOK.CHECKER, 0.2, 0.3, 0.55);
      for (const z of [-1, 1]) net(gx + e * MC.SO_GD / 2, PLAT_Y + MC.SO_GH / 2, cx + z * c.gw, MC.SO_GD / 2, MC.SO_GH / 2, 0.03);
      net(gx + e * MC.SO_GD, PLAT_Y + MC.SO_GH / 2, cx, 0.03, MC.SO_GH / 2, c.gw);
      net(gx + e * MC.SO_GD / 2, PLAT_Y + MC.SO_GH, cx, MC.SO_GD / 2, 0.03, c.gw);
    }
    if (g.state !== L.H_PLAY && g.state !== L.H_COUNT && g.state !== L.H_OVER) return;
    // the footballs: live ones flown on to the prediction's tick, held ones on their spots
    const ptick = typeof ctx?.ptick === 'number' ? ctx.ptick : g.tick + (ctx?.dt || 0) / TICK;
    const ahead = g.state === L.H_PLAY ? Math.max(0, Math.min(60, ptick - g.tick)) : 0;
    const whole = Math.floor(ahead), frac = ahead - whole;
    const t = playT(g);
    for (const b of footballs(view)) {
      if (b.st === MC.SO_GONE_ST) continue;
      let { x, y, z } = b;
      if (b.st === MC.SO_LIVE) {
        const s = fly({ ...b }, c, whole, frac);
        if (s.goal !== undefined) continue;
        ({ x, y, z } = s);
      }
      const wx = cx + x, wy = PLAT_Y + y, wz = cx + z;
      drawFootball(sc, b.k, wx, wy, wz, view.u8.buffer);
      out.casters.push([wx, wy, wz, -MC.SO_R]);
      if (b.st === MC.SO_HELD && t >= 0) {
        const left = Math.max(0, (b.next - t) * TICK), pulse = 0.5 + 0.5 * Math.sin(now * 8);
        out.decals.push({ pos: [wx, PLAT_Y + 0.04, wz], radius: MC.SO_R * (1.4 + 0.3 * pulse), width: 0.25, color: [1, 1, 1, Math.min(0.9, 0.3 + left)], kind: DECAL.RING });
      }
      if (b.st !== MC.SO_LIVE || y < MC.SO_R + 0.4) continue;
      // in the air: where it comes down
      const s = { ...b };
      fly(s, c, whole);
      for (let i = 0; i < 300 && s.goal === undefined; i++) {
        const vy = s.vy;
        fly(s, c, 1);
        if (vy < 0 && s.y <= MC.SO_R + 1e-4) break;
      }
      if (s.goal === undefined) out.decals.push({ pos: [cx + s.x, PLAT_Y + 0.04, cx + s.z], radius: MC.SO_R * 1.1, width: 0.18, color: [1, 1, 1, 0.5], kind: DECAL.RING });
    }
  },

  // the whole pitch and its goals
  frame(view) {
    const c = pitch(view), g = view.party();
    const cx = c.cx || g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: (c.hx > 0 ? c.hx + MC.SO_GD : g.size) + 1, shape: 'square' };
  },

  // the countdown turns you to the other goal
  facing(view, slot) {
    return sideOf(view, slot) ? Math.PI : 0;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    if (fx.kind === MC.SO_FX_TOUCH) {
      const air = fx.shot & 256, keeper = fx.shot & 512, save = fx.shot & 1024;
      ctx.glow?.({ pos: fx.pos, size: air || save ? 2.6 : 1.8, color: save ? [0.5, 1, 0.6, 0.9] : air ? [1, 0.9, 0.5, 0.9] : [1, 1, 1, 0.5], kind: air ? SPRITE.SPARK : SPRITE.FLASH, life: 200 });
      ctx.sound?.boing?.(Math.min(30, 6 + fx.size * 1.5), fx.owner === ctx.slot ? 0 : d);
      if (save) ctx.feed?.(`${name(fx.owner)} SAVES`, ctx.view && sideOf(ctx.view, fx.owner) === sideOf(ctx.view, ctx.slot) ? C.GREEN : C.GREY);
      if (fx.owner === ctx.slot) {
        if (save) ctx.banner?.('SAVE!', C.GREEN, 900);
        else if (air) ctx.banner?.('CHIP!', C.YELLOW, 600);
        else if (keeper && fx.size > 8) ctx.banner?.('CLEARED', C.CYAN, 600);
      }
    } else if (fx.kind === MC.SO_FX_GOAL) {
      const s = (fx.shot >> 8) & 1, own = fx.shot & 512;
      const mine = ctx.view && ctx.slot >= 0 ? sideOf(ctx.view, ctx.slot) : -1;
      ctx.glow?.({ pos: fx.pos, size: 9, color: [...SIDES[s].color, 0.95], kind: SPRITE.RING, life: 900, grow: true });
      ctx.glow?.({ pos: fx.pos, size: 5, color: [1, 1, 0.8, 0.9], kind: SPRITE.SPARK, life: 700 });
      ctx.sound?.blast?.(Math.min(40, 900 / (d + 20)));
      const who = fx.owner !== 255 ? name(fx.owner) : null;
      ctx.feed?.(`${SIDES[s].name} SCORES ${fx.size}${own ? '  AN OWN GOAL' : ''}${who ? `  ${who}` : ''}`,
        mine === s ? C.GREEN : mine === 1 - s ? C.RED : s ? C.CYAN : C.RED);
      if (ctx.slot >= 0 && mine >= 0 && ctx.view?.partier?.(ctx.slot)?.live) {
        if (mine === s) { ctx.banner?.(fx.owner === ctx.slot ? 'YOUR GOAL!' : 'GOAL!', C.GREEN, 1400); ctx.sound?.kill?.(); }
        else ctx.banner?.(`GOAL TO ${SIDES[s].name}`, C.RED, 1400);
      }
    } else if (fx.kind === MC.SO_FX_SPOT) {
      ctx.glow?.({ pos: fx.pos, size: 3, color: [1, 1, 1, 0.7], kind: SPRITE.RING, life: 400, grow: true });
      if (fx.shot & 256) { ctx.banner?.('KICKOFF', C.WHITE, 900); ctx.sound?.tick?.(); }
      else ctx.sound?.boing?.(10, d);
    } else if (fx.kind === MC.SO_FX_HIT) {
      if (fx.shot & 256) { ctx.glow?.({ pos: fx.pos, size: 1.4, color: [1, 1, 1, 0.6], kind: SPRITE.FLASH, life: 160 }); if (d < 50) ctx.sound?.land?.(Math.min(24, fx.size * 2.5)); }
      else if (d < 40) ctx.sound?.land?.(Math.min(18, fx.size * 1.5));
    }
  },

  // the target; your touches, goals and saves; the kickoff's count
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const c = pitch(view);
    if (!(c.hx > 0)) return;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    ctx.right(3, `FIRST TO ${c.goal}`, C.GREY);
    if (c.nb === 1 && g.t >= c.ko && g.t < c.kogo) ctx.centre(row, `KICKOFF IN ${Math.ceil((c.kogo - g.t) * TICK)}`, C.YELLOW);
    else if (c.nb === 1 && g.t >= c.ko - MC.SO_GONE && g.t < c.ko) ctx.centre(row, 'BACK TO YOUR OWN HALF FOR THE KICKOFF', C.GREY);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    const s = slotOf(view, ctx.slot);
    ctx.right(4, `TOUCHES ${s.touches}  GOALS ${s.goals}  SAVES ${s.saves}`, C.GREY);
  },

  brain: {
    // nothing on the pitch hurts
    danger() { return 0; },
    // a home spot, spread over the pitch with its side, drawn toward the play
    goal(view, me) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return null;
      const j = w.job.get(me.slot);
      if (!j || j.role !== 'home') return null;
      return homeOf(w, me, j);
    },
    hop() { return false; },
    // a chaser or a keeper steers itself; the rest go home round the others
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      const j = w.job.get(me.slot);
      if (!j || j.role === 'home') return null;
      const lag = Math.max(0, (tick - view.tick) | 0);
      return j.role === 'chase' ? (j.n === 1 ? support(w, me, bot, j.b, lag) : chase(w, me, bot, j.b, lag)) : keep(w, me, bot, j, lag);
    },
  },
};

// A football: white, twelve dark patches on it turning as it rolls (the
// turn worked out here from how far it moved since the last frame, drawing
// only), as a ball's look is drawn.
const ICO = (() => {
  const p = (1 + Math.sqrt(5)) / 2, v = [];
  for (const a of [-1, 1]) for (const b of [-p, p]) v.push([0, a, b], [a, b, 0], [b, 0, a]);
  return v.map((x) => { const l = Math.hypot(...x); return x.map((y) => y / l); });
})();
const TURNS = new WeakMap(); // memory -> Map(k -> { x, y, z, m: 3x3 })
function drawFootball(sc, k, x, y, z, key) {
  let m = TURNS.get(key);
  if (!m) TURNS.set(key, m = new Map());
  let e = m.get(k);
  if (!e) m.set(k, e = { x, y, z, m: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
  const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz);
  if (d > 4) { e.x = x; e.z = z; } else if (d > 1e-5) {
    // a roll about (dz, 0, -dx) by d / R
    const ax = dz / d, az = -dx / d, a = d / MC.SO_R, ca = Math.cos(a), sa = Math.sin(a), t = 1 - ca;
    const r = [t * ax * ax + ca, -sa * az, t * ax * az, sa * az, ca, -sa * ax, t * ax * az, sa * ax, t * az * az + ca];
    const o = e.m, n = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) n[3 * i + j] = r[3 * i] * o[j] + r[3 * i + 1] * o[3 + j] + r[3 * i + 2] * o[6 + j];
    e.m = n;
    e.x = x; e.z = z;
  }
  e.y = y;
  sc.sphere(x, y, z, MC.SO_R, 0.97, 0.97, 0.95, LOOK.PLASTIC, 0, 0, 1, k);
  const q = e.m;
  for (const [a, b, c] of ICO) {
    const px = q[0] * a + q[1] * b + q[2] * c, py = q[3] * a + q[4] * b + q[5] * c, pz = q[6] * a + q[7] * b + q[8] * c;
    sc.sphere(x + px * MC.SO_R * 0.72, y + py * MC.SO_R * 0.72, z + pz * MC.SO_R * 0.72, MC.SO_R * 0.33, 0.12, 0.12, 0.14, LOOK.PLASTIC, 0, 0, 1, k);
  }
}
