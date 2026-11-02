// EGG RAID, as drawn and as the AI ball sees it. A farmyard fenced off on a
// grassy island, the wooden fence rounded at the corners, a barn and
// hay bales outside it; a patch of dirt in the middle where the eggs are
// piled; at each end a straw nest in its side's colour, a mound of straw in
// a ring of bundles with a flag behind it, the eggs laid there heaped in
// it. The eggs are white (golden ones gold): loose ones slid on to now as
// $eg_slide slides them, one just knocked loose popping off its carrier, a
// carried one riding over its carrier's head (over the power-up it holds, if
// any). A golden egg's landing is a pulsing ring in the middle from its call,
// the egg falling into it for its last 0.8 s. Bumper's power-ups fall onto the
// yard as Swiss Roll's do: a target where one will land and a streak as it
// falls, then lying, bobbing. The nests' values are the HUD's side scores.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/eggs.mjs'; // EG_*: the minigame's own constants
import { PLAT_Y, B_RAD, MEGA_RAD, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE, SHAPE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';
import { world, team } from '../party-world.mjs';

const TICK = 0.008;
const HH = 0.5; // the floor's half height, m
const GRASS = [0.42, 0.62, 0.27];
const DIRT = [0.55, 0.41, 0.26];
const STRAW = [0.88, 0.74, 0.4];
const FENCE = [0.62, 0.45, 0.3];
const SHELL = [0.97, 0.95, 0.88];
const GOLD = [1, 0.76, 0.18];
const BARN = [0.66, 0.16, 0.12];
// the power-ups' colours, by PU_* (bumper's)
const PU_RGB = [[1, 1, 1], [1, 0.3, 0.25], [0.3, 0.8, 1], [1, 0.85, 0.2], [1, 0.55, 0.15], [0.5, 1, 0.45]];
const EW = 0.33, EH2 = MC.EG_EH / 2; // an egg's half width and half height as drawn
const MARGIN = 9; // m of grass round the fence
const f = Math.fround;
const sgn = (x) => (x < 0 || Object.is(x, -0) ? -1 : 1); // f32.copysign(1, x)
const luck = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 7, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 2 ** 32; };
const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);

// ---- what the sim keeps, read

// The yard on the view's bank.
export function yard(view) {
  const dv = view.dv, o = view.bank || 0, h = (k) => L.PG_H + k + o;
  return { hx: dv.getFloat32(h(MC.EG_HX), true), hz: dv.getFloat32(h(MC.EG_HZ), true), cr: dv.getFloat32(h(MC.EG_CR), true), nr: dv.getFloat32(h(MC.EG_NR), true),
    nx: dv.getFloat32(h(MC.EG_NX), true), pr: dv.getFloat32(h(MC.EG_PR), true), ne: dv.getUint32(h(MC.EG_NE), true), cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Side s's way from the middle to its own nest, and its nest's centre, world [x, z].
export const dir = (s) => (s ? 1 : -1);
export const nestAt = (c, s) => [f(f(dir(s) * c.nx) + c.cx), c.cx];
// Golden egg k's landing, ticks into play.
export const goldAt = (k) => MC.EG_GOLD0 + k * MC.EG_GOLDP;
// The eggs (PG_S, the confirmed world's), golden ones still to come included: { k, st, by, side, v, at, x, z, vx, vz }.
export function eggs(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  const n = Math.min(MC.EG_NMAX, dv.getUint32(L.PG_H + MC.EG_NE, true)) + MC.EG_NGOLD;
  for (let k = 0; k < n; k++) {
    const a = L.PG_S + MC.EG_EGG + k * MC.EG_ESIZE;
    out.push({ k, st: u8[a + MC.EG_EST], by: u8[a + MC.EG_EBY], side: u8[a + MC.EG_ESIDE], v: u8[a + MC.EG_EV], at: dv.getUint32(a + MC.EG_EAT, true) | 0,
      x: dv.getFloat32(a + MC.EG_EX, true), z: dv.getFloat32(a + MC.EG_EZ, true), vx: dv.getFloat32(a + MC.EG_EVX, true), vz: dv.getFloat32(a + MC.EG_EVZ, true) });
  }
  return out;
}
// Slot p's own: its tallies and the tick into play it may take an egg again.
export function slotOf(view, p) {
  const a = L.PG_BIG + MC.EG_SLOT + p * MC.EG_SSIZE, dv = view.dv;
  return { laid: dv.getUint16(a + MC.EG_SLAID, true), steals: dv.getUint16(a + MC.EG_SSTEALS, true), knocks: dv.getUint16(a + MC.EG_SKNOCKS, true),
    lost: dv.getUint16(a + MC.EG_SLOST, true), gold: dv.getUint16(a + MC.EG_SGOLD, true), next: dv.getUint32(a + MC.EG_SNEXT, true) | 0 };
}
// The egg slot p carries (its PG_M less 1, on the view's bank), -1 none.
export const carried = (view, p) => view.dv.getUint32(L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.PG_M, true) - 1;
// The power-up slot p holds (PU_*, 0 none), on the view's bank.
const holds = (view, p) => view.u8[L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.B_ITEM];
// The power-ups from the sky (PG_S, the confirmed world's): { k, x, y (its centre), z, kind, falling, life }.
export function orbs(view) {
  const dv = view.dv, out = [];
  for (let k = 0; k < MC.EG_NORB; k++) {
    const a = L.PG_S + MC.EG_ORBS + 16 * k, kind = view.u8[a + 12];
    if (kind) out.push({ k, x: dv.getFloat32(a, true), y: dv.getFloat32(a + 4, true), z: dv.getFloat32(a + 8, true), kind, falling: view.u8[a + 13] === 1, life: dv.getUint16(a + 14, true) });
  }
  return out;
}

// $eg_tilt: (vx, vz) after the nest at (nx, cx) if (x, z) is on its floor.
function tilt(x, z, vx, vz, nx, cx, nr) {
  const T = f(MC.EG_TILT);
  const dx = f(x - nx), dz = f(z - cx);
  let d = f(f(dx * dx) + f(dz * dz));
  if (d < f(nr * nr)) {
    if (d > f(1e-4)) { d = f(T / f(Math.sqrt(d))); vx = f(f(dx * d) + vx); vz = f(f(dz * d) + vz); }
    else vx = f(vx + sgn(f(cx - nx)) * T);
  }
  return [vx, vz];
}
// $eg_fence: a circle of radius r at (x, z) moving (vx, vz) kept in yard c, off it at e.
export function fence(c, x, z, vx, vz, r, e) {
  const sx = sgn(f(x - c.cx)), sz = sgn(f(z - c.cx));
  let ax = Math.abs(f(x - c.cx)), az = Math.abs(f(z - c.cx));
  vx = f(vx * sx); vz = f(vz * sz);
  const ix = f(c.hx - c.cr), iz = f(c.hz - c.cr);
  let ch = false;
  if (ax > ix && az > iz) {
    let qx = f(ax - ix), qz = f(az - iz);
    let q = f(Math.sqrt(f(f(qx * qx) + f(qz * qz))));
    const lim = f(c.cr - r);
    if (q > lim) {
      qx = f(qx / q); qz = f(qz / q);
      ax = f(f(qx * lim) + ix); az = f(f(qz * lim) + iz);
      ch = true;
      q = f(f(vx * qx) + f(vz * qz));
      if (q > 0) { q = f(q * f(e + 1)); vx = f(vx - f(q * qx)); vz = f(vz - f(q * qz)); }
    }
  } else {
    if (ax > f(c.hx - r)) { ax = f(c.hx - r); ch = true; if (vx > 0) vx = f(vx * f(-e)); }
    if (az > f(c.hz - r)) { az = f(c.hz - r); ch = true; if (vz > 0) vz = f(vz * f(-e)); }
  }
  if (ch) { x = f(f(sx * ax) + c.cx); z = f(f(sz * az) + c.cx); }
  return [x, z, f(vx * sx), f(vz * sz)];
}
// Loose egg b (a copy, changed) slid n whole ticks on, then frac of one more,
// as $eg_slide does it in f32: friction, the nests' floors, the fence.
export function slide(b, c, n, frac = 0) {
  const FR = f(MC.EG_FRIC), STOP2 = f(MC.EG_STOP * MC.EG_STOP), DT = f(TICK), R = f(MC.EG_R), WE = f(MC.EG_WE);
  const n0 = f(c.cx - c.nx), n1 = f(c.cx + c.nx);
  for (let i = 0; i <= n; i++) {
    const part = i < n ? 1 : frac;
    if (part <= 0) break;
    let { x, z, vx, vz } = b;
    vx = f(vx * FR); vz = f(vz * FR);
    [vx, vz] = tilt(x, z, vx, vz, n0, c.cx, c.nr);
    [vx, vz] = tilt(x, z, vx, vz, n1, c.cx, c.nr);
    if (f(f(vx * vx) + f(vz * vz)) < STOP2) { vx = 0; vz = 0; }
    if (part < 1) { b.x = x + vx * TICK * part; b.z = z + vz * TICK * part; break; }
    x = f(f(vx * DT) + x); z = f(f(vz * DT) + z);
    [x, z, vx, vz] = fence(c, x, z, vx, vz, R, WE);
    Object.assign(b, { x, z, vx, vz });
  }
  return b;
}

// Where the j-th egg of a nest of radius nr lies, from its centre [x, y, z]:
// a heap, its floor a sunflower at an egg to 0.5 m², each layer above 0.72
// as wide on the eggs under it.
export function heap(nr, j) {
  let r = Math.max(0.4, nr - 0.75), y = 0;
  for (;;) {
    const cap = Math.max(1, Math.floor(Math.PI * r * r / 0.5));
    if (j < cap || r <= 0.4) {
      const i = j % cap, rr = cap > 1 ? r * Math.sqrt((i + 0.5) / cap) : 0, a = i * 2.39996;
      return [Math.cos(a) * rr, y, Math.sin(a) * rr];
    }
    j -= cap; r *= 0.72; y += 0.55;
  }
}

// Ticks into play to draw at (fractional; the prediction's clock if given), -1 before play; frozen where the round ended.
function playTime(g, ctx) {
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return -1;
  let t = typeof ctx?.pt === 'number' && ctx.pt > 0 ? ctx.pt / TICK : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}
const sideOf = (view, p) => (view.u8[L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.P_FL] & L.PF_BLUE ? 1 : 0);

// The fence's line: points round the rounded rectangle about every `step` m, [x, z] world, in order, closed.
function fenceLine(c, step) {
  const pts = [], o = 0.15, hx = c.hx + o, hz = c.hz + o, cr = c.cr + o, ix = c.hx - c.cr, iz = c.hz - c.cr;
  const run = (x0, z0, x1, z1) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step)); for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); };
  const arc = (ox, oz, a0, a1) => { const n = Math.max(2, Math.round(cr * Math.PI / 2 / step)); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([ox + Math.cos(a) * cr, oz + Math.sin(a) * cr]); } };
  const H = Math.PI / 2;
  run(ix, -hz, -ix, -hz); arc(-ix, -iz, -H, -2 * H);
  run(-hx, -iz, -hx, iz); arc(-ix, iz, 2 * H, H);
  run(-ix, hz, ix, hz); arc(ix, iz, H, 0);
  run(hx, iz, hx, -iz); arc(ix, -iz, 0, -H);
  return pts.map(([x, z]) => [c.cx + x, c.cx + z]);
}

// shell bits from the pops the page has heard of, drawn for half a second: { pos, t (ms), seed }
const pops = [];

// ---- the AI ball

// What every AI ball looking at one world tick shares: the yard, the clock,
// the eggs loose, carried and in each nest, the power-ups lying (or a second
// from landing), each side's balls in (client/party-world.mjs's, in slot
// order), and the jobs: in a side of three or more, a quarter guard its nest
// and a quarter raid the other (from its place in the side, turned each
// round), the rest fetch; each loose egg (the golden ones first) to the
// nearest fetcher free (any ball of the side carrying nothing, but the guards
// while a foe threatens and the raiders while the other nest has eggs); then
// each power-up to the nearest of the side within 12 m with its hands free,
// carrying nothing (no guard while a foe threatens), and no egg it is sent
// for under twice as far.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._eg;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const c = yard(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const t = state === L.H_PLAY ? (view.tick - dv.getUint32(L.HDR_START + o, true)) | 0 : 0;
  const round = dv.getUint32(L.HDR_HOLE + o, true);
  const list = state === L.H_PLAY ? eggs(view) : [];
  const loose = list.filter((e) => e.st === MC.EG_FREE);
  const nest = [0, 0];
  for (const e of list) if (e.st === MC.EG_NEST) nest[e.side & 1] += e.v;
  const ups = state === L.H_PLAY ? orbs(view).filter((u) => !u.falling || u.y < PLAT_Y + 10) : [];
  const side = state === L.H_PLAY ? world(view).sides : [[], []];
  const job = new Map(); // slot -> { role: 'guard' | 'raid' | 'fetch', egg (the loose egg it's sent for, or null), orb (the power-up, or null), i, n }
  for (const s of [0, 1]) {
    const mine = side[s], m = mine.length;
    const ng = m >= 3 ? Math.floor(m / 4) : 0, nraid = m >= 3 ? Math.max(1, Math.floor(m / 4)) : 0;
    const [nx, nz] = nestAt(c, s);
    // a foe near our nest, or carrying one of ours away
    const threat = side[1 - s].some((b) => carried(view, b.slot) >= 0 || Math.hypot(b.x - nx, b.z - nz) < c.nr + 12);
    const free = [], hands = [];
    let gi = 0;
    mine.forEach((b, i) => {
      const rot = (i + round * 7) % m;
      const role = rot < ng ? 'guard' : rot < ng + nraid ? 'raid' : 'fetch';
      const j = { role, egg: null, orb: null, i: role === 'guard' ? gi++ : 0, n: ng };
      job.set(b.slot, j);
      if (carried(view, b.slot) >= 0) return;
      if (role === 'fetch' || (role === 'guard' && !threat) || (role === 'raid' && nest[1 - s] === 0)) free.push(b);
      if (!holds(view, b.slot) && !(role === 'guard' && threat)) hands.push(b);
    });
    // the golden eggs first, then the rest in order: each to the nearest fetcher free
    const order = loose.slice().sort((a, b) => b.v - a.v || a.k - b.k);
    for (const e of order) {
      if (!free.length) break;
      let best = -1, bd = Infinity;
      for (let i = 0; i < free.length; i++) { const d = Math.hypot(free[i].x - e.x, free[i].z - e.z); if (d < bd) { bd = d; best = i; } }
      job.get(free[best].slot).egg = e;
      free.splice(best, 1);
    }
    for (const u of ups) {
      let best = null, bd = 12;
      for (const b of hands) {
        const j = job.get(b.slot), d = Math.hypot(b.x - u.x, b.z - u.z);
        if (!j.orb && d < bd && (!j.egg || Math.hypot(b.x - j.egg.x, b.z - j.egg.z) > 2 * d)) { bd = d; best = j; }
      }
      if (best) best.orb = u;
    }
  }
  view._eg = { tick: view.tick, bank: o, c, state, t, round, list, loose, nest, ups, side, job, near: new Map() };
  return view._eg;
}

// Where ball b will be s seconds on.
const lead = (b, s) => [b.x + b.vx * s, b.z + b.vz * s];

// A charge at foe b: at where it will be when this ball gets there (it
// closes at about 11 m/s), straight in, flat out, so it is the faster into
// the bump.
function charge(px, pz, b, lagS, skill) {
  const [bx, bz] = lead(b, lagS);
  const tt = Math.min(1.2, Math.hypot(bx - px, bz - pz) / 11) * (0.5 + 0.5 * skill);
  return { yaw: Math.atan2(bz + b.vz * tt - pz, bx + b.vx * tt - px), move: 1 };
}

// Is the way from (px, pz) to (tx, tz) clear of every ball of list (none
// within 1.8 m of it, between the two)? A rocket goes off on the first ball it meets.
function clear(list, px, pz, tx, tz) {
  const dx = tx - px, dz = tz - pz, l2 = dx * dx + dz * dz || 1;
  for (const b of list) {
    const u = ((b.x - px) * dx + (b.z - pz) * dz) / l2;
    if (u > 0 && u < 1 && Math.hypot(px + dx * u - b.x, pz + dz * u - b.z) < 1.8) return false;
  }
  return true;
}

// The power-up held, spent where it pays, or null: a POW at a foe carrier
// within 7 m (its blast knocks the egg loose), or a carrier's at a foe within
// 4; a ROCKET at a foe carrier within 22 m, led, no teammate in its way; a
// DASH home for a carrier with a foe within 9 m or 18 m still to go, or at a
// foe carrier 2.5 to 9 m off, led (the faster into the bump); a SPRING over a
// foe closing on a carrier within 5 m; MEGA by a foe carrier within 10 m, or
// a carrier's with a foe within 8. Foes as they will be when the word lands;
// a word with a yaw aims it, one without leaves the steering as it was.
function spend(view, w, me, item, px, pz, vx, vz, lagS, mine) {
  const { mates, foes } = team(view, me.slot);
  let fc = null, fd = Infinity, near = Infinity, closing = 0;
  for (const b of foes) {
    const [bx, bz] = lead(b, lagS), d = Math.hypot(bx - px, bz - pz);
    if (carried(view, b.slot) >= 0) { if (d < fd) { fd = d; fc = b; } } else if (d < near) { near = d; closing = ((b.vx - vx) * (px - bx) + (b.vz - vz) * (pz - bz)) / (d || 1); }
  }
  const aim = (b, s) => { const [x, z] = lead(b, lagS + s); return Math.atan2(z - pz, x - px); };
  switch (item) {
    case L.PU_POW:
      if (fd < 7 || (mine && near < 4)) return { use: true };
      break;
    case L.PU_ROCKET:
      if (fd < 22 && clear(mates, px, pz, ...lead(fc, lagS + fd / 30))) return { yaw: aim(fc, fd / 30), move: 1, use: true };
      break;
    case L.PU_DASH:
      if (mine) {
        const [nx, nz] = nestAt(w.c, me.side), nd = Math.hypot(nx - px, nz - pz);
        if (nd > 8 && (near < 9 || nd > 18)) return { yaw: Math.atan2(nz - pz, nx - px), move: 1, use: true };
      } else if (fd > 2.5 && fd < 9) return { yaw: aim(fc, fd / 16), move: 1, use: true };
      break;
    case L.PU_SPRING:
      if (mine && near < 5 && closing > 2) return { use: true };
      break;
    case L.PU_MEGA:
      if (fd < 10 || (mine && near < 8)) return { use: true };
      break;
    default:
  }
  return null;
}

// The word: the power-up held when it pays (now and then by skill, as
// balloon's AI fires); else for a ball carrying nothing with a foe carrier in
// reach, a charge (any ball, at one within 7 m; a guard at one anywhere on its
// own half or within 25 m); a guard with none, at a foe come within 10 m of
// its nest, raiding. Else null: the planner takes it to its goal.
function play(view, w, me, bot, tick, item) {
  const lagS = Math.max(0, Math.min(60, (tick - view.tick) | 0)) * TICK;
  const px = bot?.pos?.[0] ?? me.pos[0], pz = bot?.pos?.[1] ?? me.pos[2];
  const skill = bot?.skill ?? 0.6;
  const mine = carried(view, me.slot) >= 0;
  let use = false;
  if (item && me.refire === 0) {
    const u = spend(view, w, me, item, px, pz, bot?.vel?.[0] ?? me.vel[0], bot?.vel?.[1] ?? me.vel[2], lagS, mine);
    if (u && (!bot?.rand || bot.rand() < 0.3 + 0.6 * skill)) {
      if (u.yaw !== undefined) return u;
      use = true;
    }
  }
  const word = mine ? null : hunt(view, w, me, px, pz, lagS, skill);
  return use ? { ...word, use } : word;
}

// A charge for a ball carrying nothing at a foe carrier in reach, or a
// guard's at a raider near its nest; else null.
function hunt(view, w, me, px, pz, lagS, skill) {
  const c = w.c, s = me.side;
  const j = w.job.get(me.slot);
  const guard = j?.role === 'guard';
  const [nx, nz] = nestAt(c, s);
  const { foes } = team(view, me.slot);
  let best = null, bd = Infinity;
  for (const b of foes) {
    if (carried(view, b.slot) < 0) continue;
    const d = Math.hypot(b.x - px, b.z - pz);
    const ours = (b.x - c.cx) * dir(s) > 0;
    if ((d < 7 || (guard && (ours || d < 25))) && d < bd) { bd = d; best = b; }
  }
  if (best) return charge(px, pz, best, lagS, skill);
  if (guard) {
    for (const b of foes) {
      const d = Math.hypot(b.x - nx, b.z - nz);
      if (d < c.nr + 10 && d < bd) { bd = d; best = b; }
    }
    if (best) return charge(px, pz, best, lagS, skill);
  }
  return null;
}

// Where a ball wants to be: carrying, its own nest; sent for a power-up or
// an egg, there; a guard, its spot on an arc round its nest toward the
// middle; a raider (or any with nothing to fetch) the other nest while it has
// eggs; else spread over its half of the middle.
function goalOf(view, w, me, bot) {
  const c = w.c, s = me.side, slot = me.slot;
  if (carried(view, slot) >= 0) return nestAt(c, s);
  const j = w.job.get(slot);
  if (j?.orb) return [j.orb.x, j.orb.z];
  if (j?.egg) return [j.egg.x, j.egg.z];
  if (j?.role === 'guard') {
    const [nx, nz] = nestAt(c, s);
    const a = ((j.i + 0.5) / Math.max(1, j.n) - 0.5) * 2.2;
    const r = c.nr + 3.5;
    return [nx - dir(s) * Math.cos(a) * r, nz + Math.sin(a) * r];
  }
  if (w.nest[1 - s] > 0) return nestAt(c, 1 - s);
  const u = luck(slot, w.round);
  return [c.cx + dir(s) * c.pr * (1 + 2 * u), c.cx + (luck(slot + 99, w.round) * 2 - 1) * c.hz * 0.6];
}

export default {
  id: L.MG_EGGS, key: 'eggs', name: 'EGG RAID',
  hint: 'ROLL OVER AN EGG  ROLL IT INTO YOUR NEST  RAID THEIRS',
  rules: 'A HARD BUMP OR A BLAST KNOCKS AN EGG LOOSE  THE BIGGER NEST WINS',
  env: 'day',

  draw(view, ctx, out) {
    const c = yard(view);
    if (!(c.hx > 0)) return;
    const g = view.party();
    const sc = out.scene, cx = c.cx;
    const ms0 = ctx?.now ?? 0, now = ms0 / 1000;
    // the island's grass, one solid so no seam crosses the yard; the dirt in the middle
    sc.box(cx, PLAT_Y - HH, cx, c.hx + MARGIN, HH, c.hz + MARGIN, 0, ...GRASS, LOOK.MATTE, 0, 0, 1, 7);
    out.decals.push({ pos: [cx, PLAT_Y + 0.02, cx], radius: c.pr + 2.2, color: [...DIRT, 0.85], kind: DECAL.DISC });
    // the fence: a post about every 2.4 m and two rails between
    const line = fenceLine(c, 2.4);
    for (let i = 0; i < line.length; i++) {
      const [x0, z0] = line[i], [x1, z1] = line[(i + 1) % line.length];
      sc.cyl(x0, PLAT_Y + MC.EG_FENCE_H / 2, z0, 0.11, MC.EG_FENCE_H / 2 + 0.08, ...FENCE, LOOK.WOOD, 0, 0, 1, i);
      const len = Math.hypot(x1 - x0, z1 - z0) / 2, yaw = Math.atan2(z1 - z0, x1 - x0);
      for (const y of [0.45, 0.95]) sc.box((x0 + x1) / 2, PLAT_Y + y * MC.EG_FENCE_H, (z0 + z1) / 2, len + 0.06, 0.06, 0.04, yaw, ...FENCE, LOOK.WOOD, 0, 0, 1, i);
    }
    // outside: a barn along one side, hay bales by the corners
    const bx = cx + c.hx * 0.25, bz = cx - c.hz - 6.5;
    sc.box(bx, PLAT_Y + 2.2, bz, 5, 2.2, 3.2, 0, ...BARN, LOOK.WOOD, 0, 0, 1, 3);
    for (const e of [-1, 1]) sc.box(bx, PLAT_Y + 5.3, bz + e * 1.75, 5.3, 0.12, 2.1, 0, 0.35, 0.33, 0.32, LOOK.METAL, 0, 0, 1, 4, e * 0.72);
    sc.box(bx, PLAT_Y + 1.5, bz + 3.22, 1.4, 1.5, 0.05, 0, 0.95, 0.93, 0.88, LOOK.WOOD, 0, 0, 1, 5);
    for (let i = 0; i < 6; i++) {
      const e = i & 1 ? 1 : -1, z = i & 2 ? 1 : -1;
      sc.cyl(cx + e * (c.hx + 2.5 + (i >> 2) * 1.8), PLAT_Y + 0.6, cx + z * (c.hz - 1 - (i >> 2) * 2.4), 0.6, 0.75, ...STRAW, LOOK.MATTE, 0, 0, 1, 20 + i, Math.PI / 2, 0);
    }
    // the nests: a mound of straw in a ring of bundles in the side's colour, a flag behind
    const list = g.state === L.H_PLAY || g.state === L.H_OVER || g.state === L.H_COUNT ? eggs(view) : [];
    const inNest = [[], []];
    for (const e of list) if (e.st === MC.EG_NEST) inNest[e.side & 1].push(e);
    for (const s of [0, 1]) {
      const [nx, nz] = nestAt(c, s), col = SIDES[s].color, tint = mix(STRAW, col, 0.7);
      out.decals.push({ pos: [nx, PLAT_Y + 0.025, nz], radius: c.nr + 0.15, color: [...col, 0.55], kind: DECAL.DISC });
      sc.put(SHAPE.SPHERE, nx, PLAT_Y - 0.06, nz, c.nr - 0.25, 0.2, c.nr - 0.25, 0, ...STRAW, LOOK.MATTE, 0, 0, 1, 30 + s);
      const nb = Math.max(10, Math.round(2 * Math.PI * c.nr / 0.85));
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * 2 * Math.PI;
        sc.cyl(nx + Math.cos(a) * c.nr, PLAT_Y + 0.28, nz + Math.sin(a) * c.nr, 0.3, 0.5, ...tint, LOOK.MATTE, 0, 0, 1, 40 + i, Math.PI / 2, a);
      }
      const fx = nx + dir(s) * (c.nr + 1.2);
      sc.cyl(fx, PLAT_Y + 1.8, nz, 0.07, 1.8, 0.85, 0.85, 0.88, LOOK.METAL);
      sc.box(fx - dir(s) * 0.62, PLAT_Y + 3.15, nz, 0.6, 0.4, 0.03, 0, ...col, LOOK.PLASTIC);
      inNest[s].forEach((e, j) => {
        const [ox, oy, oz] = heap(c.nr, j), col2 = e.v > 1 ? GOLD : SHELL;
        sc.put(SHAPE.SPHERE, nx + ox, PLAT_Y + 0.12 + EH2 + oy, nz + oz, EW, EH2, EW, 0, ...col2, e.v > 1 ? LOOK.METAL : LOOK.PLASTIC, 0, 0, 1, e.k);
      });
    }
    if (!list.length) return;
    const tp = playTime(g, ctx);
    const dt = g.state === L.H_PLAY ? ctx?.dt || 0 : 0;
    const slot = ctx?.slot ?? -1;
    const mine = ctx?.pme && !ctx.pme.out ? ctx.pme : null;
    const dvb = view.dv;
    const ballAt = (p) => {
      if (mine && p === slot && ctx.own) return [ctx.own[0], ctx.own[1], ctx.own[2]];
      const a = L.PLAYERS + p * L.PSIZE;
      return [0, 1, 2].map((i) => dvb.getFloat32(a + L.P_PX + 4 * i, true) + dvb.getFloat32(a + L.P_VX + 4 * i, true) * dt);
    };
    // over a carrier's head: its radius (MEGA's bigger) and the power-up party's frontend draws there (yours as predicted)
    const over = (p) => {
      const b = mine && p === slot ? mine : { item: view.u8[L.PLAYERS + p * L.PSIZE + L.B_ITEM], mega: dvb.getUint16(L.PLAYERS + p * L.PSIZE + L.B_MEGA, true) };
      return 2 * (b.mega ? MEGA_RAD : B_RAD) + 1.5 + (b.item ? 0.8 : 0);
    };
    // the power-ups: a target where one will land and a streak as it falls, then on the floor, bobbing
    for (const o of orbs(view)) {
      const rgb = PU_RGB[o.kind] || PU_RGB[0];
      const y = o.falling ? Math.max(PLAT_Y + 0.6, o.y - 10 * dt) : PLAT_Y + 0.6 + 0.15 * Math.sin(ms0 / 333 + o.k);
      out.casters.push([o.x, y, o.z, -0.6]);
      out.solid.push({ pos: [o.x, y, o.z], size: 0.6, color: [...rgb, 1], kind: SPRITE.ORB, minpx: 2 });
      out.glow.push({ pos: [o.x, y, o.z], size: 1.5, color: [...rgb, 0.5], kind: SPRITE.FLASH, minpx: 2 });
      if (o.falling && y > PLAT_Y + 0.6) {
        out.beams?.push({ a: [o.x, y + 5, o.z], b: [o.x, y, o.z], width: 0.12, color: [...rgb, 0.35] });
        out.decals.push({ pos: [o.x, PLAT_Y + 0.03, o.z], radius: 1.4, width: 0.25, color: [...rgb, 0.85], kind: DECAL.TARGET });
      }
    }
    for (const e of list) {
      const col = e.v > 1 ? GOLD : SHELL, look = e.v > 1 ? LOOK.METAL : LOOK.PLASTIC;
      let x, y, z;
      if (e.st === MC.EG_FREE) {
        const s = slide({ ...e }, c, Math.floor(dt / TICK), (dt / TICK) % 1);
        x = s.x; z = s.z; y = PLAT_Y + EH2;
        // just knocked loose: off its carrier's head, down to the floor
        if (tp >= 0 && e.at > tp) { const u = 1 - (e.at - tp) / MC.EG_LOCK; y += (2 * B_RAD + 0.8) * (1 - u * u); }
      } else if (e.st === MC.EG_HELD) {
        const h = ballAt(e.by);
        x = h[0]; z = h[2]; y = h[1] + over(e.by) + 0.08 * Math.sin(now * 6 + e.k);
      } else if (e.st === MC.EG_NONE && e.v > 1 && tp >= 0) {
        // a golden egg called: its ring in the middle, and the egg falling into it
        const k = e.k - c.ne, T = goldAt(k);
        if (T >= g.len || tp < T - MC.EG_GOLDW || tp >= T) continue;
        const left = T - tp, pulse = 0.5 + 0.5 * Math.sin(now * 9);
        out.decals.push({ pos: [cx, PLAT_Y + 0.04, cx], radius: 1.4 + 0.3 * pulse, width: 0.3, color: [...GOLD, 0.5 + 0.4 * (1 - left / MC.EG_GOLDW)], kind: DECAL.RING });
        if (left > MC.EG_GOLDFALL) continue;
        x = cx; z = cx; y = PLAT_Y + EH2 + MC.EG_GOLDH * (left / MC.EG_GOLDFALL) ** 2;
      } else continue;
      sc.put(SHAPE.SPHERE, x, y, z, EW, EH2, EW, 0, ...col, look, 0, 0, 1, e.k);
      out.casters.push([x, y, z, -EW]);
      if (e.v > 1) out.glow.push({ pos: [x, y, z], size: 1.1, color: [1, 0.85, 0.3, 0.25 + 0.1 * Math.sin(now * 5)], kind: SPRITE.FLASH, minpx: 1 });
    }
    // shell bits from a crack, flying off for half a second
    const ms = ctx?.now ?? 0;
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i], age = (ms - p.t) / 1000;
      if (age > 0.5 || age < 0) { pops.splice(i, 1); continue; }
      for (let k = 0; k < 7; k++) {
        const a = luck(p.seed, k) * 2 * Math.PI, sp = 2 + 3 * luck(p.seed, k + 9);
        out.solid.push({ pos: [p.pos[0] + Math.cos(a) * sp * age, p.pos[1] + 3 * age - 4.9 * age * age, p.pos[2] + Math.sin(a) * sp * age],
          size: 0.09 + 0.06 * luck(p.seed, k + 3), color: [...(p.gold ? GOLD : SHELL), 1], kind: SPRITE.CRUMB, minpx: 1, seed: p.seed + k });
      }
    }
  },

  // the whole yard
  frame(view) {
    const c = yard(view), g = view.party();
    const cx = c.cx || g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: (c.hx > 0 ? c.hx : g.size) + 1, shape: 'square' };
  },

  // the countdown turns you to the pile
  facing(view, slot) {
    return sideOf(view, slot) ? Math.PI : 0;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    const me = ctx.slot, mySide = ctx.view && me >= 0 ? sideOf(ctx.view, me) : -1;
    if (fx.kind === MC.EG_FX_GET) {
      const steal = fx.shot & 256, gold = fx.size > 1;
      ctx.glow?.({ pos: fx.pos, size: gold ? 2 : 1.2, color: gold ? [1, 0.85, 0.3, 0.9] : [1, 1, 0.95, 0.7], kind: SPRITE.SPARK, life: 250 });
      if (fx.owner === me || d < 12) ctx.sound?.pickup?.();
      if (steal) {
        const thief = ctx.view ? sideOf(ctx.view, fx.owner) : 0;
        ctx.feed?.(`${name(fx.owner)} STOLE ${gold ? 'A GOLDEN EGG' : 'AN EGG'} FROM ${SIDES[1 - thief].name}`, mySide === thief ? C.GREEN : mySide === 1 - thief ? C.RED : C.WHITE);
        if (fx.owner === me) ctx.banner?.('STOLEN!  GET IT HOME', C.GREEN, 1100);
      } else if (fx.owner === me && gold) ctx.banner?.('GOLDEN EGG!  WORTH 3', C.YELLOW, 1100);
    } else if (fx.kind === MC.EG_FX_LAY) {
      const s = (fx.shot >> 8) & 1, gold = fx.shot & 512;
      ctx.glow?.({ pos: fx.pos, size: 4, color: [...SIDES[s].color, 0.9], kind: SPRITE.RING, life: 500, grow: true });
      if (fx.owner === me) { ctx.banner?.(gold ? 'GOLDEN EGG LAID  +3' : 'LAID!', gold ? C.YELLOW : C.GREEN, 900); ctx.sound?.holed?.(); }
      else if (d < 30) ctx.sound?.land?.(10);
      if (gold) ctx.feed?.(`${name(fx.owner)} LAID A GOLDEN EGG`, mySide === s ? C.GREEN : mySide === 1 - s ? C.RED : C.YELLOW);
    } else if (fx.kind === MC.EG_FX_POP) {
      const by = fx.shot & 255, blast = fx.shot & 256, gold = fx.shot & 512;
      pops.push({ pos: fx.pos, t: ctx.now ?? 0, seed: fx.tick & 4095, gold });
      ctx.glow?.({ pos: fx.pos, size: 2.4, color: [1, 0.97, 0.85, 0.95], kind: SPRITE.SPARK, life: 300 });
      ctx.glow?.({ pos: fx.pos, size: 3, color: [1, 0.9, 0.6, 0.7], kind: SPRITE.RING, life: 380, grow: true });
      ctx.sound?.crackle?.(3);
      ctx.sound?.boing?.(Math.min(30, fx.size), fx.owner === me || by === me ? 0 : d);
      const who = blast ? `${name(by)}'S BLAST` : name(by);
      ctx.feed?.(`${who} KNOCKED ${name(fx.owner)}'S EGG LOOSE`, fx.owner === me ? C.RED : by === me ? C.GREEN : C.GREY);
      if (fx.owner === me) ctx.banner?.(gold ? 'CRACK!  YOUR GOLDEN EGG IS LOOSE' : 'CRACK!  EGG KNOCKED LOOSE', C.RED, 1000);
      else if (by === me) ctx.banner?.('KNOCKED IT LOOSE!', C.GREEN, 900);
    } else if (fx.kind === MC.EG_FX_GOLD) {
      if (fx.shot & 256) {
        ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.5, fx.pos[2]], size: 4, color: [1, 0.85, 0.3, 0.9], kind: SPRITE.RING, life: 500, grow: true });
        if (d < 60) ctx.sound?.land?.(20);
      } else { ctx.banner?.('A GOLDEN EGG IS COMING  TO THE MIDDLE', C.YELLOW, 1800); ctx.sound?.count?.(1); }
    }
  },

  // the loose eggs and the next golden one; your tallies; what you carry
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const c = yard(view);
    if (!(c.hx > 0)) return;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    const list = eggs(view);
    const loose = list.filter((e) => e.st === MC.EG_FREE).length;
    let next = -1;
    for (let k = 0; k < MC.EG_NGOLD; k++) if (goldAt(k) > g.t && goldAt(k) < g.len) { next = goldAt(k); break; }
    ctx.right(3, `LOOSE EGGS ${loose}${next >= 0 ? `  GOLDEN EGG IN ${Math.ceil((next - g.t) * TICK)}` : ''}`, C.GREY);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    const s = slotOf(view, ctx.slot);
    ctx.right(4, `LAID ${s.laid}  STOLEN ${s.steals}  KNOCKED ${s.knocks}`, C.GREY);
    const k = carried(view, ctx.slot);
    if (k >= 0) {
      const gold = list[k]?.v > 1;
      ctx.centre(row, gold ? 'YOU HAVE THE GOLDEN EGG  GET IT TO YOUR NEST' : 'YOU HAVE AN EGG  ROLL INTO YOUR NEST', gold ? C.YELLOW : C.WHITE);
    } else if (s.next > g.t) ctx.centre(row, `EGG LOST  YOURS AGAIN IN ${((s.next - g.t) * TICK).toFixed(1)}`, C.GREY);
  },

  brain: {
    // carrying, a foe carrying nothing about to be where you'll be
    danger(view, x, z, tick, me) {
      if (!me || carried(view, me.slot) < 0) return 0;
      const w = worldOf(view);
      if (w.state !== L.H_PLAY) return 0;
      const n = (tick - view.tick) * TICK * 0.7;
      let d = 0;
      let near = w.near.get(me.slot);
      if (!near) w.near.set(me.slot, near = team(view, me.slot).foes.filter((b) => carried(view, b.slot) < 0 && Math.hypot(b.x - me.pos[0], b.z - me.pos[2]) < 14));
      for (const b of near) {
        const dx = x - (b.x + b.vx * n), dz = z - (b.z + b.vz * n), d2 = dx * dx + dz * dz;
        if (d2 < 9) d = Math.max(d, 0.6 * (1 - Math.sqrt(d2) / 3));
      }
      return d;
    },
    goal(view, me, bot) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return null;
      return goalOf(view, w, me, bot);
    },
    hop() { return false; },
    // the power-up is the brain's to spend (the planner's own rule would fire it
    // at any ball ahead, carrying or not): the record it reads holds none (a
    // fresh one each think), as Tag's does
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      const item = me.item;
      me.item = 0;
      return play(view, w, me, bot, tick, item);
    },
  },
};

