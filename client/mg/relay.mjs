// RELAY RACE, as drawn and as the AI ball sees it. A running track on an
// infield of grass, slate grey, walled, lane lines down it; a zone across each end in its
// side's colour (red's at low x, blue's at high x) behind a chequered line,
// flags at its corners, stands along one side. Between the zones the rows of
// posts, striped, sliding in their slots where $ry_off has them on the
// prediction's clock. A baton is a stick in its side's colour: lying, on the
// floor in a ring with a beam over it (brighter while your side may take
// it), dropped ones falling off their carrier's head; carried, over its
// carrier's head. A carrier of yours sees where to set it down. The sides'
// legs are the HUD's side scores.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/relay.mjs'; // RY_*: the minigame's own constants
import { PLAT_Y, B_RAD, MEGA_RAD, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';
import { world, team } from '../party-world.mjs';

const TICK = 0.008;
const HH = 0.5; // the floor's half height, m
const GRASS = [0.36, 0.6, 0.3];
const TRACK = [0.38, 0.43, 0.5];
const LINE = [0.96, 0.95, 0.9];
const WALL = [0.9, 0.9, 0.92];
const POST = [1, 0.78, 0.1];
const SLOT = [0.2, 0.2, 0.23];
const STAND = [0.55, 0.57, 0.62];
const MARGIN = 7; // m of grass round the walls
const SPEED = 8.5; // m/s, a carrier flat out
const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
const luck = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 7, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 2 ** 32; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- what the sim keeps, read

// The track on the view's bank: its half length and width, a zone's line from
// the middle, batons a side, the legs that win, and the rows of posts
// ({ x (world), w (its phase and step) }).
export function track(view) {
  const dv = view.dv, o = view.bank || 0, h = (k) => L.PG_H + k + o;
  const nr = Math.min(MC.RY_ROWMAX, dv.getUint32(h(MC.RY_NR), true)), cx = dv.getFloat32(L.PG_CX + o, true);
  const rows = [];
  for (let r = 0; r < nr; r++) rows.push({ x: cx + (r - (nr - 1) / 2) * MC.RY_ROWGAP, w: dv.getUint32(h(MC.RY_ROWS + 4 * r), true) });
  return { hx: dv.getFloat32(h(MC.RY_HX), true), hz: dv.getFloat32(h(MC.RY_HZ), true), zx: dv.getFloat32(h(MC.RY_ZX), true), nb: dv.getUint32(h(MC.RY_NB), true),
    goal: dv.getUint32(h(MC.RY_GOAL), true), nr, rows, cx };
}
// Zone e's way from the middle, and where a baton is set down in it at z: world [x, z].
export const dir = (e) => (e ? 1 : -1);
export const setAt = (c, e, z) => [c.cx + dir(e) * (c.zx + MC.RY_SET), clamp(z, c.cx - c.hz + 1, c.cx + c.hz - 1)];
// The batons in play (PG_S, the confirmed world's): { k, st, by, to, side, at, x, z }.
export function batons(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  for (let k = 0; k < 2 * MC.RY_BMAX; k++) {
    const a = L.PG_S + MC.RY_BAT + k * MC.RY_BSIZE;
    if (u8[a + MC.RY_BST] === MC.RY_NONE) continue;
    out.push({ k, st: u8[a + MC.RY_BST], by: u8[a + MC.RY_BBY], to: u8[a + MC.RY_BTO], side: u8[a + MC.RY_BSIDE], at: dv.getUint32(a + MC.RY_BAT_AT, true) | 0,
      x: dv.getFloat32(a + MC.RY_BX, true), z: dv.getFloat32(a + MC.RY_BZ, true) });
  }
  return out;
}
// Slot p's own: its tallies and the tick into play it may take a baton again.
export function slotOf(view, p) {
  const a = L.PG_BIG + MC.RY_SLOT + p * MC.RY_SSIZE, dv = view.dv;
  return { legs: dv.getUint16(a + MC.RY_SLEGS, true), knocks: dv.getUint16(a + MC.RY_SKNOCKS, true), lost: dv.getUint16(a + MC.RY_SLOST, true), next: dv.getUint32(a + MC.RY_SNEXT, true) | 0 };
}
// The baton slot p carries (its PG_M less 1, on the view's bank), -1 none.
export const carried = (view, p) => view.dv.getUint32(L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.PG_M, true) - 1;
const sideOf = (view, p) => (view.u8[L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.P_FL] & L.PF_BLUE ? 1 : 0);

// $ry_off: where row r's posts (its word w) stand along z from the middle
// line, t ticks into play (fractional for drawing).
export function postOff(w, r, t) {
  const u = Math.abs((((w & 0xffff) + t * (w >>> 16)) % 65536) - 32768);
  return (u - 16384) * (MC.RY_PA / 16384) + (r & 1 ? MC.RY_PS / 2 : 0);
}
// The post of track c nearest (x, z), t ticks into play: { d (m from its middle), x, z }, or null off every row.
export function postNear(c, x, z, t, reach = 6) {
  if (!c.nr) return null;
  const r = Math.round((x - c.cx) / MC.RY_ROWGAP + (c.nr - 1) / 2);
  if (r < 0 || r >= c.nr) return null;
  const row = c.rows[r];
  if (Math.abs(x - row.x) > reach) return null;
  const off = postOff(row.w, r, t) + c.cx;
  const pz = Math.round((z - off) / MC.RY_PS) * MC.RY_PS + off;
  return { d: Math.hypot(x - row.x, z - pz), x: row.x, z: pz, r };
}

// Ticks into play to draw at (fractional; the prediction's clock if given), -1 before play; frozen where the round ended.
function playTime(g, ctx) {
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return -1;
  let t = typeof ctx?.pt === 'number' && ctx.pt > 0 ? ctx.pt / TICK : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}

// ---- the AI ball

// What every AI ball looking at one world tick shares: the track, the clock,
// the batons, each side's balls in, and the jobs. For each baton of a side: a
// carrier runs it; lying, the nearest teammate free that will be rested when
// it gets there fetches it; the nearest free one that will be rested as it
// arrives waits where it will be set down ('wait'), and the nearest left
// waits in the zone it left for the leg after ('next'). Of the rest an eighth
// of the side (two at least) hunt, each the nearest of the other side's
// carriers nobody hunts yet, else any, and the others stand by in a zone.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._ry;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const c = track(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const t = state === L.H_PLAY ? (view.tick - dv.getUint32(L.HDR_START + o, true)) | 0 : 0;
  const round = dv.getUint32(L.HDR_HOLE + o, true);
  const list = state === L.H_PLAY ? batons(view) : [];
  const side = state === L.H_PLAY ? world(view).sides : [[], []];
  const job = new Map(); // slot -> { role: 'run' | 'fetch' | 'wait' | 'next' | 'hunt' | 'help', goal [x, z], bat, foe }
  const bySlot = new Map();
  for (const s of [0, 1]) for (const b of side[s]) bySlot.set(b.slot, b);
  const carriers = [[], []];
  for (const b of list) if (b.st === MC.RY_HELD && bySlot.has(b.by)) carriers[b.side].push(bySlot.get(b.by));
  for (const s of [0, 1]) {
    const mine = side[s];
    const next = new Map(mine.map((b) => [b.slot, slotOf(view, b.slot).next]));
    const free = new Set(mine.filter((b) => carried(view, b.slot) < 0));
    // the nearest free ball to (x, z) rested within eta s (plus the roll there), taken from the free
    const pick = (x, z, eta, need) => {
      let best = null, bd = Infinity;
      for (const b of free) {
        const d = Math.hypot(b.x - x, b.z - z);
        if (need && (next.get(b.slot) - t) * TICK > Math.max(eta, d / 10) + 0.3) continue;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) free.delete(best);
      return best;
    };
    const mineBats = list.filter((b) => b.side === s);
    const legs = [];
    for (const b of mineBats) {
      let x = b.x, z = b.z, runner = null;
      if (b.st === MC.RY_HELD) {
        runner = bySlot.get(b.by);
        if (!runner) continue;
        x = runner.x; z = runner.z;
      } else {
        runner = pick(b.x, b.z, 0, true);
        if (runner) job.set(runner.slot, { role: 'fetch', goal: [b.x, b.z], bat: b });
      }
      legs.push({ b, x, z, runner, eta: Math.max(0, c.zx - dir(b.to) * (x - c.cx)) / SPEED + (b.st === MC.RY_HELD || !runner ? 0 : Math.hypot(runner.x - x, runner.z - z) / 10) });
    }
    // where each will be set down: someone rested by then, waiting on it
    for (const l of legs) {
      const at = setAt(c, l.b.to, l.z);
      const wtr = pick(at[0], at[1], l.eta, true);
      l.at = at;
      if (wtr) { job.set(wtr.slot, { role: 'wait', goal: at, bat: l.b }); l.wait = wtr; }
      if (l.b.st === MC.RY_HELD) job.set(l.runner.slot, { role: 'run', goal: wtr && l.eta < 2.5 ? [at[0], clamp(wtr.z, c.cx - c.hz + 1, c.cx + c.hz - 1)] : at, bat: l.b });
    }
    // and in the zone it left, for the leg after: a third of the side at most
    let spare = Math.floor(mine.length / 3);
    for (const l of legs) {
      if (spare-- <= 0) break;
      const at = setAt(c, 1 - l.b.to, l.z);
      const nx = pick(at[0], at[1], 0, false);
      if (nx) job.set(nx.slot, { role: 'next', goal: at, bat: l.b });
    }
    // the hunters, an eighth of the side (two at least): a foe carrier each while they last, then any
    const prey = carriers[1 - s].slice();
    const hunted = new Set();
    let hunters = Math.max(2, Math.floor(mine.length / 8));
    for (const b of [...free].sort((p, q) => luck(p.slot, round) - luck(q.slot, round))) {
      if (hunters-- <= 0) {
        // the rest stand by in the zone they are nearer, across it, for a baton nobody is waiting on
        job.set(b.slot, { role: 'help', goal: setAt(c, b.x > c.cx ? 1 : 0, c.cx + (luck(b.slot + 99, round) * 2 - 1) * (c.hz - 2)) });
        continue;
      }
      let best = null, bd = Infinity;
      for (const f of prey) {
        const d = Math.hypot(f.x - b.x, f.z - b.z) + (hunted.has(f.slot) ? 30 : 0);
        if (d < bd) { bd = d; best = f; }
      }
      if (best) hunted.add(best.slot);
      job.set(b.slot, { role: 'hunt', foe: best, goal: best ? null : [c.cx - dir(s) * c.zx * (luck(b.slot, round) - 0.5), c.cx + (luck(b.slot + 99, round) * 2 - 1) * c.hz * 0.6] });
    }
  }
  view._ry = { tick: view.tick, bank: o, c, state, t, round, list, side, job, carriers, near: new Map() };
  return view._ry;
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

// The word, for a ball carrying nothing with a foe carrier in reach: a hunter
// at its own within 8 m, one waiting for the leg after at any within 4 m; no
// post in the way. Else null: the planner takes it to its goal.
function play(view, w, me, bot, tick) {
  const j = w.job.get(me.slot);
  if (!j || (j.role !== 'hunt' && j.role !== 'next')) return null;
  const lagS = Math.max(0, Math.min(60, (tick - view.tick) | 0)) * TICK;
  const px = bot?.pos?.[0] ?? me.pos[0], pz = bot?.pos?.[1] ?? me.pos[2];
  let foe = null, fd = j.role === 'hunt' ? 8 : 4;
  for (const b of w.carriers[1 - me.side]) {
    if (j.role === 'hunt' && j.foe && b !== j.foe) continue;
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d < fd) { fd = d; foe = b; }
  }
  if (!foe) return null;
  const word = charge(px, pz, foe, lagS, bot?.skill ?? 0.6);
  // a post on the way there: leave it to the planner
  const n = (tick - view.tick) | 0;
  for (const u of [0.35, 0.7]) {
    const x = px + Math.cos(word.yaw) * fd * u, z = pz + Math.sin(word.yaw) * fd * u;
    const p = postNear(w.c, x, z, w.t + n + (fd * u / 10) / TICK);
    if (p && p.d < MC.RY_PR + B_RAD + 0.6) return null;
  }
  return word;
}

export default {
  id: L.MG_RELAY, key: 'relay', name: 'RELAY RACE',
  hint: 'RUN A BATON TO THE FAR ZONE  HAND IT ON  BUMP THEIR CARRIERS',
  rules: 'A LEG IS A POINT  REST AFTER YOURS  A HARD BUMP KNOCKS A BATON LOOSE',
  env: 'day',

  draw(view, ctx, out) {
    const c = track(view);
    if (!(c.hx > 0)) return;
    const g = view.party();
    const sc = out.scene, cx = c.cx;
    const ms0 = ctx?.now ?? 0, now = ms0 / 1000;
    // the infield's grass, the track on it, a zone's plate at each end behind a chequered line
    sc.box(cx, PLAT_Y - HH - 0.05, cx, c.hx + MARGIN, HH, c.hz + MARGIN, 0, ...GRASS, LOOK.MATTE, 0, 0, 1, 7);
    sc.box(cx, PLAT_Y - HH, cx, c.hx, HH, c.hz, 0, ...TRACK, LOOK.RUBBER, 0, 0, 1, 8);
    for (const e of [0, 1]) {
      const col = SIDES[e].color;
      sc.box(cx + dir(e) * (c.zx + MC.RY_ZD / 2), PLAT_Y - HH + 0.012, cx, MC.RY_ZD / 2, HH, c.hz, 0, ...mix(TRACK, col, 0.55), LOOK.RUBBER, 0, 0, 1, 9 + e);
      sc.box(cx + dir(e) * c.zx, PLAT_Y - HH + 0.02, cx, 0.3, HH, c.hz, 0, ...LINE, LOOK.CHECKER, 0.3, 0, 1, 11 + e);
      // flags at its corners
      for (const z of [-1, 1]) {
        const fx = cx + dir(e) * (c.hx + 0.6), fz = cx + z * (c.hz + 0.6);
        sc.cyl(fx, PLAT_Y + 2, fz, 0.07, 2, 0.85, 0.85, 0.88, LOOK.METAL);
        sc.box(fx - dir(e) * 0.62, PLAT_Y + 3.5, fz, 0.6, 0.4, 0.03, 0, ...col, LOOK.PLASTIC);
      }
    }
    // lane lines between the zones, about 4 m apart
    const lanes = Math.max(2, Math.round(c.hz / 2));
    for (let i = 1; i < lanes; i++) sc.box(cx, PLAT_Y - HH + 0.008, cx - c.hz + (2 * c.hz * i) / lanes, c.zx - 0.3, HH, 0.05, 0, ...LINE, LOOK.MATTE, 0, 0, 1, 20 + i);
    // the walls
    const wh = MC.RY_WALL_H / 2;
    for (const e of [-1, 1]) {
      sc.box(cx + e * (c.hx + 0.15), PLAT_Y + wh, cx, 0.15, wh, c.hz + 0.3, 0, ...WALL, LOOK.PLASTIC, 0, 0, 1, 3);
      sc.box(cx, PLAT_Y + wh, cx + e * (c.hz + 0.15), c.hx, wh, 0.15, 0, ...WALL, LOOK.PLASTIC, 0, 0, 1, 4);
    }
    // stands along one side: three steps and a rail
    for (let i = 0; i < 3; i++) sc.box(cx, PLAT_Y + 0.5 + i * 0.9, cx - c.hz - 3.2 - i * 1.5, c.hx * 0.7, 0.5 + i * 0.9, 0.75, 0, ...STAND, LOOK.MATTE, 0, 0, 1, 40 + i);
    // the posts: each row's slot across the track, and its posts where they stand now
    const tp = playTime(g, ctx);
    const tq = Math.max(0, tp);
    for (let r = 0; r < c.nr; r++) {
      const row = c.rows[r];
      sc.box(row.x, PLAT_Y - HH + 0.01, cx, 0.22, HH, c.hz, 0, ...SLOT, LOOK.METAL, 0, 0, 1, 50 + r);
      const off = postOff(row.w, r, tq) + cx;
      const j0 = Math.ceil((cx - c.hz - off) / MC.RY_PS), j1 = Math.floor((cx + c.hz - off) / MC.RY_PS);
      for (let j = j0; j <= j1; j++) {
        const z = off + j * MC.RY_PS;
        sc.cyl(row.x, PLAT_Y + MC.RY_PH / 2, z, MC.RY_PR, MC.RY_PH / 2, ...POST, LOOK.HAZARD, 0, 0, 1, 60 + r);
        sc.cyl(row.x, PLAT_Y + MC.RY_PH + 0.08, z, MC.RY_PR + 0.1, 0.08, 0.25, 0.25, 0.28, LOOK.METAL, 0, 0, 1, 70 + r);
        out.casters.push([row.x, PLAT_Y + MC.RY_PH - MC.RY_PR, z, -MC.RY_PR]);
      }
    }
    const list = batons(view);
    if (!list.length) return;
    const dt = g.state === L.H_PLAY ? ctx?.dt || 0 : 0;
    const slot = ctx?.slot ?? -1;
    const mine = ctx?.pme && !ctx.pme.out ? ctx.pme : null;
    const mySide = slot >= 0 && (ctx?.me || mine) ? sideOf(view, slot) : -1;
    const dvb = view.dv;
    const ballAt = (p) => {
      if (mine && p === slot && ctx.own) return [ctx.own[0], ctx.own[1], ctx.own[2]];
      const a = L.PLAYERS + p * L.PSIZE;
      return [0, 1, 2].map((i) => dvb.getFloat32(a + L.P_PX + 4 * i, true) + dvb.getFloat32(a + L.P_VX + 4 * i, true) * dt);
    };
    const top = (p) => 2 * (dvb.getUint16(L.PLAYERS + p * L.PSIZE + L.B_MEGA, true) ? MEGA_RAD : B_RAD) + 1.5;
    const rested = slot >= 0 && tp >= 0 ? slotOf(view, slot).next <= tp : true;
    for (const b of list) {
      const col = SIDES[b.side].color;
      if (b.st === MC.RY_HELD) {
        const h = ballAt(b.by);
        const y = h[1] + top(b.by) + 0.08 * Math.sin(now * 6 + b.k);
        sc.cyl(h[0], y, h[2], 0.26, MC.RY_BH / 2, ...col, LOOK.PLASTIC, 0, 0, 1, b.k, 0.5, now * 2 + b.k);
        out.casters.push([h[0], y, h[2], -0.3]);
        out.glow.push({ pos: [h[0], y, h[2]], size: 1.3, color: [...col, 0.35], kind: SPRITE.FLASH, minpx: 2 });
        // yours: where it is set down
        if (b.by === slot && tp >= 0) {
          const at = setAt(c, b.to, h[2]);
          out.decals.push({ pos: [at[0], PLAT_Y + 0.05, at[1]], radius: 1.8, width: 0.3, color: [...col, 0.9], kind: DECAL.TARGET });
        }
        continue;
      }
      // lying: on the floor in its ring, a beam over it; just dropped, down off its carrier's head
      let y = PLAT_Y + 0.26;
      const locked = tp >= 0 && b.at > tp;
      if (locked) { const u = 1 - (b.at - tp) / MC.RY_LOCK; y += (2 * B_RAD + 1.5) * (1 - u * u); }
      const open = !locked && b.side === mySide && rested;
      const pulse = 0.5 + 0.5 * Math.sin(now * 7 + b.k);
      sc.cyl(b.x, y, b.z, 0.26, MC.RY_BH / 2, ...col, LOOK.PLASTIC, 0, 0, 1, b.k, Math.PI / 2, b.k * 1.3);
      out.casters.push([b.x, y, b.z, -0.3]);
      out.decals.push({ pos: [b.x, PLAT_Y + 0.045, b.z], radius: 1.2 + (open ? 0.25 * pulse : 0), width: 0.22, color: [...mix(col, LINE, 0.45), open ? 0.95 : 0.6], kind: DECAL.RING });
      out.beams?.push({ a: [b.x, PLAT_Y + 6, b.z], b: [b.x, PLAT_Y + 0.3, b.z], width: 0.14, color: [...col, open ? 0.55 : 0.25] });
      out.glow.push({ pos: [b.x, y, b.z], size: 1.2, color: [...col, 0.3 + (open ? 0.2 * pulse : 0)], kind: SPRITE.FLASH, minpx: 2 });
    }
  },

  // the whole track
  frame(view) {
    const c = track(view), g = view.party();
    const cx = c.cx || g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: (c.hx > 0 ? c.hx : g.size) + 1, shape: 'square' };
  },

  // the countdown turns you down the track
  facing(view, slot) {
    const x = view.dv.getFloat32(L.PLAYERS + slot * L.PSIZE + L.P_PX, true);
    return x > view.dv.getFloat32(L.PG_CX, true) ? Math.PI : 0;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    const me = ctx.slot, mySide = ctx.view && me >= 0 ? sideOf(ctx.view, me) : -1;
    if (fx.kind === MC.RY_FX_TAKE) {
      const s = (fx.shot & 255) >= MC.RY_BMAX ? 1 : 0;
      ctx.glow?.({ pos: fx.pos, size: 1.4, color: [...SIDES[s].color, 0.8], kind: SPRITE.SPARK, life: 250 });
      if (fx.owner === me) { ctx.sound?.pickup?.(); ctx.banner?.('YOU HAVE THE BATON  RUN!', C.GREEN, 1000); } else if (d < 12) ctx.sound?.pickup?.();
    } else if (fx.kind === MC.RY_FX_LEG) {
      const s = (fx.shot >> 8) & 1;
      ctx.glow?.({ pos: fx.pos, size: 4, color: [...SIDES[s].color, 0.9], kind: SPRITE.RING, life: 500, grow: true });
      if (fx.owner === me) { ctx.banner?.('LEG RUN!  NOW REST', C.GREEN, 1000); ctx.sound?.holed?.(); } else if (d < 30) ctx.sound?.land?.(10);
      const goal = ctx.view ? track(ctx.view).goal : 0;
      if (goal && fx.size === goal - 1) ctx.feed?.(`${SIDES[s].name} NEEDS ONE MORE LEG`, mySide === s ? C.GREEN : mySide === 1 - s ? C.RED : C.YELLOW);
    } else if (fx.kind === MC.RY_FX_DROP) {
      const by = fx.shot & 255;
      ctx.glow?.({ pos: fx.pos, size: 2.4, color: [1, 0.97, 0.85, 0.95], kind: SPRITE.SPARK, life: 300 });
      ctx.glow?.({ pos: fx.pos, size: 3, color: [1, 0.9, 0.6, 0.7], kind: SPRITE.RING, life: 380, grow: true });
      ctx.sound?.boing?.(Math.min(30, fx.size), fx.owner === me || by === me ? 0 : d);
      // yours, or one near enough to see: a full room knocks five loose a second
      if (fx.owner === me || by === me || d < 25) ctx.feed?.(`${name(by)} KNOCKED ${name(fx.owner)}'S BATON LOOSE`, fx.owner === me ? C.RED : by === me ? C.GREEN : C.GREY);
      if (fx.owner === me) ctx.banner?.('BATON KNOCKED LOOSE!', C.RED, 1000);
      else if (by === me) ctx.banner?.('KNOCKED IT LOOSE!', C.GREEN, 900);
    } else if (fx.kind === MC.RY_FX_BONK) {
      ctx.glow?.({ pos: fx.pos, size: 2, color: [1, 0.85, 0.3, 0.9], kind: SPRITE.SPARK, life: 220 });
      if (fx.owner === me || d < 25) ctx.sound?.boing?.(9, fx.owner === me ? 0 : d);
    }
  },

  // the target; your tallies; what you carry, how long you rest, or a baton of yours lying within 20 m
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const c = track(view);
    if (!(c.hx > 0)) return;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    ctx.right(3, `FIRST TO ${c.goal} LEGS`, C.GREY);
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    const s = slotOf(view, ctx.slot);
    ctx.right(4, `LEGS ${s.legs}  KNOCKED ${s.knocks}`, C.GREY);
    if (carried(view, ctx.slot) >= 0) ctx.centre(row, 'YOU HAVE THE BATON  RUN IT TO THE FAR ZONE', C.WHITE);
    else if (s.next > g.t) ctx.centre(row, `RESTING  A BATON AGAIN IN ${((s.next - g.t) * TICK).toFixed(1)}`, C.GREY);
    else if (batons(view).some((b) => b.side === me.side && b.st === MC.RY_LIES && Math.hypot(b.x - me.pos[0], b.z - me.pos[2]) < 20)) ctx.centre(row, 'A BATON OF YOURS IS DOWN  ROLL OVER IT', C.YELLOW);
  },

  brain: {
    // a post about to be where you'll be; carrying, a foe too
    danger(view, x, z, tick, me) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY) return 0;
      let d = 0;
      const p = postNear(w.c, x, z, w.t + ((tick - view.tick) | 0), MC.RY_PR + B_RAD + 1.5);
      if (p) {
        const gap = p.d - MC.RY_PR - B_RAD;
        if (gap < 0.3) d = 1; else if (gap < 1.4) d = 0.5 * (1 - (gap - 0.3) / 1.1);
      }
      if (!me || carried(view, me.slot) < 0) return d;
      const n = (tick - view.tick) * TICK * 0.7;
      let near = w.near.get(me.slot);
      if (!near) w.near.set(me.slot, near = team(view, me.slot).foes.filter((b) => carried(view, b.slot) < 0 && Math.hypot(b.x - me.pos[0], b.z - me.pos[2]) < 14));
      for (const b of near) {
        const dx = x - (b.x + b.vx * n), dz = z - (b.z + b.vz * n), d2 = dx * dx + dz * dz;
        if (d2 < 9) d = Math.max(d, 0.6 * (1 - Math.sqrt(d2) / 3));
      }
      return d;
    },
    // its job's: the far zone with a baton, a baton lying, where one will be set down, a foe's carrier
    goal(view, me, bot) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return null;
      const j = w.job.get(me.slot);
      if (!j) return null;
      if (j.role === 'hunt' && j.foe) return lead(j.foe, 0.4);
      return j.goal;
    },
    hop() { return false; },
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      return play(view, w, me, bot, tick);
    },
  },
};
