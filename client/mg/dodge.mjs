// DODGEBALL, as drawn and as the AI ball sees it. A wooden court in a hall
// light, red's half tinted red and blue's blue, a glowing low wall down the
// centre line, rubber fences at the back lines with the jails past them, and
// the walls round it all. The dodgeballs are red rubber; a throw flies in its
// thrower's side's colour, flown on to the prediction's tick as $db_fly flies
// it (so the one coming at you is where it is when your click lands), and
// your own throw leaves your ball the moment you click, before the world has
// it. Holding one, its arc ahead of you is drawn; with an enemy throw coming
// in, your reach is a ring round you (the throw inside it: click). The sides
// in play are the HUD's team scores.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/dodge.mjs'; // DB_*: the minigame's own constants
import { PLAT_Y, B_RAD, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const HH = 0.5; // the floor's half height, m
const WOOD = [[0.72, 0.42, 0.36], [0.42, 0.5, 0.72]];
const JAIL = [0.3, 0.3, 0.34];
const WALL = [0.85, 0.85, 0.88];
const RUBBER = [0.85, 0.16, 0.2];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const luck = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 7, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 2 ** 32; };
const f = Math.fround;

// ---- what the sim keeps, read

// The court on the view's bank.
export function court(view) {
  const dv = view.dv, o = view.bank || 0;
  return { hx: dv.getFloat32(L.PG_H + MC.DB_HX + o, true), hz: dv.getFloat32(L.PG_H + MC.DB_HZ + o, true), jd: dv.getFloat32(L.PG_H + MC.DB_JD + o, true),
    nb: dv.getUint32(L.PG_H + MC.DB_NB + o, true), cx: dv.getFloat32(L.PG_CX + o, true) };
}
// Side s's way from the line to its back line.
export const dir = (s) => (s ? 1 : -1);
// The dodgeballs (PG_S, the confirmed world's), the unused left out.
export function balls(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  const n = Math.min(MC.DB_NMAX, dv.getUint32(L.PG_H + MC.DB_NB, true));
  for (let k = 0; k < n; k++) {
    const a = L.PG_S + MC.DB_BALL + k * MC.DB_BSIZE;
    const st = u8[a + MC.DB_BST];
    if (st === MC.DB_NONE) continue;
    out.push({ k, st, by: u8[a + MC.DB_BBY], side: u8[a + MC.DB_BSIDE], at: dv.getUint32(a + MC.DB_BAT, true),
      x: dv.getFloat32(a + MC.DB_BX, true), y: dv.getFloat32(a + MC.DB_BY, true), z: dv.getFloat32(a + MC.DB_BZ, true),
      vx: dv.getFloat32(a + MC.DB_BVX, true), vy: dv.getFloat32(a + MC.DB_BVY, true), vz: dv.getFloat32(a + MC.DB_BVZ, true) });
  }
  return out;
}
// Slot p's own: the use counter last seen, the dodgeball held (-1 none), its catch's lock, its tallies.
export function slotOf(view, p) {
  const a = L.PG_S + MC.DB_SLOT + p * MC.DB_SSIZE, dv = view.dv;
  return { seen: view.u8[a + MC.DB_SEEN], hold: view.u8[a + MC.DB_HOLD] - 1, lock: dv.getUint16(a + MC.DB_LOCKT, true),
    hits: dv.getUint16(a + MC.DB_HITS, true), catches: dv.getUint16(a + MC.DB_CATCHES, true), throws: dv.getUint16(a + MC.DB_THROWS, true),
    jailt: dv.getUint32(a + MC.DB_JAILT, true) };
}
// Is slot p in jail (its PG_M, on the view's bank)?
export const jailed = (view, p) => view.dv.getUint32(L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.PG_M, true) === MC.DB_JAIL;
export const reach = (sp) => MC.DB_REACH0 + sp * MC.DB_WIN;

// Dodgeball b (a copy, changed) flown and rolled n whole ticks on, then frac
// of one more, as $db_fly does it in f32, short of the balls it might hit:
// gravity, the hall's walls, the floor and the jails' slope, a throw loose
// once it touches a wall or the floor.
export function fly(b, c, n, frac = 0) {
  const R = MC.DB_R, top = f(PLAT_Y + R), X = f(f(c.hx + c.jd) - R);
  const xlo = f(c.cx - X), xhi = f(c.cx + X), zlo = f(c.cx - f(c.hz - R)), zhi = f(c.cx + f(c.hz - R));
  for (let k = 0; k <= n; k++) {
    const part = k < n ? 1 : frac;
    if (part <= 0) break;
    let { x, y, z, vx, vy, vz } = b;
    if (b.st === MC.DB_LOOSE && y <= top && vy === 0) {
      vx = f(vx * f(MC.DB_ROLL)); vz = f(vz * f(MC.DB_ROLL));
      // in a jail, down its slope toward the court
      const dx = f(x - c.cx);
      if (Math.abs(dx) > c.hx) vx = f(vx - (dx < 0 ? -f(MC.DB_TILT) : f(MC.DB_TILT)));
    } else vy = f(vy - f(MC.DB_G));
    if (part < 1) { b.x = x + vx * TICK * part; b.y = Math.max(top, y + vy * TICK * part); b.z = z + vz * TICK * part; break; }
    x = f(f(vx * f(TICK)) + x); y = f(f(vy * f(TICK)) + y); z = f(f(vz * f(TICK)) + z);
    let dead = false;
    if (x < xlo) { x = xlo; dead = true; if (vx < 0) vx = f(vx * f(-MC.DB_WE)); }
    if (x > xhi) { x = xhi; dead = true; if (vx > 0) vx = f(vx * f(-MC.DB_WE)); }
    if (z < zlo) { z = zlo; dead = true; if (vz < 0) vz = f(vz * f(-MC.DB_WE)); }
    if (z > zhi) { z = zhi; dead = true; if (vz > 0) vz = f(vz * f(-MC.DB_WE)); }
    if (y < top) { y = top; dead = true; vy = vy < -MC.DB_SETTLE ? f(vy * f(-MC.DB_FE)) : 0; }
    if (dead) b.st = MC.DB_LOOSE;
    Object.assign(b, { x, y, z, vx, vy, vz });
  }
  return b;
}

// A throw from a ball at (x, y, z) (its bottom) facing yaw (radians): where it leaves and how fast, as $db_throw has it.
export function launch(x, y, z, yaw, r = B_RAD) {
  const c = Math.cos(yaw), s = Math.sin(yaw), out = r + MC.DB_R + MC.DB_OUT;
  return { st: MC.DB_FLY, x: x + c * out, y: y + r + MC.DB_UP, z: z + s * out, vx: c * MC.DB_V, vy: MC.DB_LOFT, vz: s * MC.DB_V };
}

// Ticks into play to draw at (fractional; the prediction's clock if given), -1 before play; frozen where the round ended.
function playTime(view, g, ctx) {
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return -1;
  let t = typeof ctx?.pt === 'number' && ctx.pt > 0 ? ctx.pt / TICK : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}

// your throw drawn from the click, before the world has it: { at (the prediction's tick), b (its launch), from (the use counter it went out on) }
let ghost = null;

// ---- the AI ball

// What every AI ball looking at one world tick shares: the court, the clock,
// the dodgeballs, each side's throws in the air and its balls in play.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._db;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const c = court(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const start = dv.getUint32(L.HDR_START + o, true);
  const list = state === L.H_PLAY ? balls(view) : [];
  // the throws in the air by the side that threw them
  const air = [[], []];
  for (const b of list) if (b.st === MC.DB_FLY) air[b.side & 1].push(b);
  // each side's balls in play (not jailed, not down), where and how fast
  const inPlay = [[], []];
  if (state === L.H_PLAY) {
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + o + p * L.PSIZE;
      const fl = view.u8[a + L.P_FL];
      if ((fl & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE || dv.getUint32(a + L.PG_M, true) === MC.DB_JAIL) continue;
      inPlay[fl & L.PF_BLUE ? 1 : 0].push({ slot: p, x: dv.getFloat32(a + L.P_PX, true), z: dv.getFloat32(a + L.P_PZ, true), vx: dv.getFloat32(a + L.P_VX, true), vz: dv.getFloat32(a + L.P_VZ, true) });
    }
  }
  view._db = { tick: view.tick, bank: o, c, state, start, t: state === L.H_PLAY ? (view.tick - start) | 0 : 0, balls: list, air, inPlay };
  return view._db;
}
const sideOf = (view, p) => (view.u8[L.PLAYERS + p * L.PSIZE + L.P_FL] & L.PF_BLUE ? 1 : 0);
// (x, z) kept on side s's half, m in from its line, back line and walls.
function onHalf(c, s, x, z, m = 1.5) {
  const a = c.cx + dir(s) * m, b = c.cx + dir(s) * (c.hx - m);
  return [Math.min(Math.max(x, Math.min(a, b)), Math.max(a, b)), Math.min(Math.max(z, c.cx - c.hz + m), c.cx + c.hz - m)];
}

// The enemy throw nearest to landing on slot's ball at (mx, mz), flown from
// the view's tick: { b (as it stands), f (flown on n ticks, to the tick the
// word lands), eta (ticks from then to its closest pass), miss (m, flat, at it) }, or null.
function incoming(w, side, mx, mz, n) {
  let best = null;
  for (const b of w.air[1 - side]) {
    // closest approach of its flat path to the ball, if still to come
    const ff = fly({ ...b }, w.c, n);
    if (ff.st !== MC.DB_FLY) continue;
    const vv = ff.vx * ff.vx + ff.vz * ff.vz || 1;
    const s = ((mx - ff.x) * ff.vx + (mz - ff.z) * ff.vz) / vv;
    if (s < 0) continue;
    const px = ff.x + ff.vx * s, pz = ff.z + ff.vz * s;
    const miss = Math.hypot(px - mx, pz - mz);
    const eta = s / TICK;
    if (miss < B_RAD + MC.DB_R + 1.2 && (!best || eta < best.eta)) best = { b, f: ff, eta, miss, px, pz };
  }
  return best;
}

// The word for a ball: in play, with an enemy throw on its way in, a catch
// (as often as its skill says, clicking when the throw, flown on to the tick
// the word lands, is inside the share of its reach it means to let it in,
// once it has seen it its reaction time) or a dodge across its path;
// holding, in play or in jail, a throw at the nearest foe in play with lead,
// once it has held it a moment (from luck), stepping up toward the line till
// then; else the planner (to the loose balls).
function play(view, w, me, bot, tick) {
  const slot = me.slot, side = me.side;
  const jail = jailed(view, slot);
  const mem = bot?.mem || (bot ? (bot.mem = {}) : {});
  const lagN = Math.max(0, Math.min(60, (tick - view.tick) | 0));
  const mx = bot?.pos?.[0] ?? me.pos[0], mz = bot?.pos?.[1] ?? me.pos[2];
  const skill = bot?.skill ?? 0.6;
  const mine = slotOf(view, slot);
  const c = w.c;
  const inc = jail ? null : incoming(w, side, mx, mz, lagN);
  if (inc && mine.hold < 0) {
    const key = `${inc.b.k}:${inc.b.at}`;
    mem.dbSeen = mem.dbSeen || {};
    if (mem.dbSeen[key] === undefined) mem.dbSeen[key] = view.tick;
    const tries = luck(slot * 131 + inc.b.k, inc.b.at) < 0.25 + 0.45 * skill;
    if (tries) {
      const sp = Math.hypot(inc.f.vx, inc.f.vy, inc.f.vz);
      const d = Math.hypot(inc.f.x - mx, inc.f.y - (me.pos[1] + B_RAD), inc.f.z - mz);
      const react = Math.round((0.26 - 0.16 * skill) / TICK);
      const share = 0.4 + 0.45 * luck(inc.b.at + 1, slot * 7 + inc.b.k);
      const locked = (mem.dbClick ?? -1e9) > tick - MC.DB_LOCK - 2 || mine.lock > w.t + lagN;
      const use = !locked && view.tick - mem.dbSeen[key] >= react && d <= reach(sp) * share;
      if (use) mem.dbClick = tick;
      return { yaw: Math.atan2(-inc.f.vz, -inc.f.vx), move: 0, use: use ? 1 : 0 };
    }
    // a dodge: across its path, away from where it passes, kept on the half
    if (inc.eta < 70) {
      let ax = mx - inc.px, az = mz - inc.pz;
      if (Math.hypot(ax, az) < 0.05) { ax = -inc.f.vz; az = inc.f.vx; }
      const [gx, gz] = onHalf(c, side, mx + ax * 4, mz + az * 4);
      if (Math.hypot(gx - mx, gz - mz) < 1) { ax = -ax; az = -az; }
      return { yaw: Math.atan2(az, ax), move: 1 };
    }
  }
  if (mine.hold >= 0) {
    // a moment held first (and a step up), then at the nearest foe in play, with lead
    const held = mem.dbHeld === mine.hold && mem.dbHeldAt !== undefined ? mem.dbHeldAt : (mem.dbHeldAt = view.tick, mem.dbHeld = mine.hold, view.tick);
    const wait = Math.round((0.4 + 0.9 * luck(slot, mine.hold * 17 + held)) / TICK * (1.2 - 0.5 * skill));
    const foes = w.inPlay[1 - side];
    if (!foes.length) return null;
    let tgt = null, bd = Infinity;
    for (const b of foes) { const d = Math.hypot(b.x - mx, b.z - mz); if (d < bd) { bd = d; tgt = b; } }
    let ax = tgt.x + tgt.vx * lagN * TICK, az = tgt.z + tgt.vz * lagN * TICK;
    for (let i = 0; i < 2; i++) {
      const t = Math.hypot(ax - mx, az - mz) / MC.DB_V;
      ax = tgt.x + tgt.vx * (lagN * TICK + t * (0.4 + 0.6 * skill));
      az = tgt.z + tgt.vz * (lagN * TICK + t * (0.4 + 0.6 * skill));
    }
    const yaw = Math.atan2(az - mz, ax - mx) + (luck(held, slot) - 0.5) * 0.12 * (1 - skill);
    if (view.tick - held >= wait && bd < 26) { mem.dbHeldAt = undefined; return { yaw, move: 0, use: 1 }; }
    return null;
  }
  return null;
}

export default {
  id: L.MG_DODGE, key: 'dodge', name: 'DODGEBALL',
  hint: 'ROLL OVER A BALL  CLICK TO THROW  CLICK AS A THROW COMES TO CATCH',
  rules: 'HIT AND YOU GO TO JAIL  A CATCH FREES ONE  THE LAST SIDE IN WINS',
  env: 'day',

  draw(view, ctx, out) {
    const c = court(view);
    if (!(c.hx > 0)) return;
    const g = view.party();
    const sc = out.scene, cx = c.cx;
    const now = (ctx?.now ?? 0) / 1000;
    const tp = playTime(view, g, ctx);
    // the halves, the jails past them, the line, the back lines' fences, the walls
    for (const s of [0, 1]) {
      sc.box(cx + dir(s) * c.hx / 2, PLAT_Y - HH, cx, c.hx / 2, HH, c.hz, 0, ...WOOD[s], LOOK.WOOD);
      sc.box(cx - dir(s) * (c.hx + c.jd / 2), PLAT_Y - HH, cx, c.jd / 2, HH, c.hz, 0, ...JAIL, LOOK.CHECKER, 1.5, 0.5);
      // the other side's jail is past this side's back line: a fence of posts and a rail
      const bx = cx + dir(s) * c.hx;
      sc.box(bx, PLAT_Y + 0.3, cx, 0.12, 0.3, c.hz, 0, ...SIDES[s].color.map((v) => v * 0.6), LOOK.RUBBER);
      for (let z = -c.hz + 1; z < c.hz; z += 2.5) sc.cyl(bx, PLAT_Y + 0.6, cx + z, 0.08, 0.6, 0.7, 0.7, 0.75, LOOK.METAL);
      sc.box(bx, PLAT_Y + 1.2, cx, 0.06, 0.06, c.hz, 0, 0.7, 0.7, 0.75, LOOK.METAL);
    }
    const pulse = 0.6 + 0.2 * Math.sin(now * 3);
    sc.box(cx, PLAT_Y + MC.DB_LINE_H / 2, cx, 0.1, MC.DB_LINE_H / 2, c.hz, 0, 1, 0.95, 0.8, LOOK.GLOW, pulse, 0.3);
    const X = c.hx + c.jd;
    for (const s of [-1, 1]) {
      sc.box(cx, PLAT_Y + MC.DB_WALL_H / 2, cx + s * (c.hz + 0.2), X + 0.4, MC.DB_WALL_H / 2, 0.2, 0, ...WALL, LOOK.PLASTIC);
      sc.box(cx + s * (X + 0.2), PLAT_Y + MC.DB_WALL_H / 2, cx, 0.2, MC.DB_WALL_H / 2, c.hz + 0.4, 0, ...WALL, LOOK.PLASTIC);
    }
    if (g.state !== L.H_PLAY && g.state !== L.H_COUNT && g.state !== L.H_OVER) return;
    // the dodgeballs: held over their holders, loose where they roll, throws flown on to the prediction's tick
    const mine = ctx?.pme && !ctx.pme.out ? ctx.pme : null;
    const slot = ctx?.slot ?? -1;
    const ptick = typeof ctx?.ptick === 'number' ? ctx.ptick : g.tick + (ctx?.dt || 0) / TICK;
    const ahead = g.state === L.H_PLAY ? Math.max(0, Math.min(60, ptick - g.tick)) : 0;
    const whole = Math.floor(ahead), frac = ahead - whole;
    const dt = ctx?.dt || 0;
    const dvb = view.dv;
    const ballAt = (p) => {
      if (mine && p === slot) return ctx.own ? [ctx.own[0], ctx.own[1], ctx.own[2]] : [...mine.pos];
      const a = L.PLAYERS + p * L.PSIZE;
      return [0, 1, 2].map((i) => dvb.getFloat32(a + L.P_PX + 4 * i, true) + dvb.getFloat32(a + L.P_VX + 4 * i, true) * dt);
    };
    const me = slot >= 0 ? slotOf(view, slot) : null;
    // your throw: from the click, before the world has it
    const pend = mine && me && me.hold >= 0 && ((mine.input >>> 29) & 3) !== me.seen;
    if (pend && !ghost) {
      const at = ctx.own || mine.pos;
      ghost = { at: ptick, b: launch(at[0], at[1], at[2], mine.yaw), from: me.seen };
    }
    if (!pend || g.state !== L.H_PLAY) ghost = null;
    const list = balls(view);
    for (const b of list) {
      let x = b.x, y = b.y, z = b.z, col = RUBBER, flying = false;
      if (b.st === MC.DB_HELD) {
        if (ghost && b.by === slot) continue;
        const h = ballAt(b.by);
        x = h[0]; y = h[1] + 2 * B_RAD + 1.45; z = h[2];
      } else if (b.st === MC.DB_FLY) {
        const ff = fly({ ...b }, c, whole, frac);
        ({ x, y, z } = ff);
        flying = ff.st === MC.DB_FLY;
        if (flying) col = SIDES[b.side & 1].color;
      } else {
        const ff = fly({ ...b }, c, Math.floor(dt / TICK), (dt / TICK) % 1);
        ({ x, y, z } = ff);
      }
      sc.sphere(x, y, z, MC.DB_R, ...col, LOOK.RUBBER, 0, 0, 1, b.k);
      out.casters.push([x, y, z, -MC.DB_R]);
      if (flying) {
        for (let k = 1; k <= 4; k++) out.glow.push({ pos: [x - b.vx * 0.012 * k, y - b.vy * 0.012 * k, z - b.vz * 0.012 * k], size: 0.55 - 0.08 * k, color: [...col, 0.45 - 0.08 * k], kind: SPRITE.FLASH, minpx: 1 });
        // coming at you: your reach round you, white with it inside
        if (mine && slot >= 0 && (b.side & 1) !== mine.side && !jailed(view, slot)) {
          const p = ballAt(slot), sp = Math.hypot(b.vx, b.vy, b.vz);
          const d = Math.hypot(x - p[0], y - p[1] - B_RAD, z - p[2]);
          const closing = (p[0] - x) * b.vx + (p[2] - z) * b.vz > 0;
          if (closing && d < reach(sp) * 2.2) {
            const inside = d <= reach(sp);
            const locked = me.lock > g.t + ahead;
            out.decals.push({ pos: [p[0], PLAT_Y + 0.04, p[2]], radius: reach(sp), width: inside ? 0.4 : 0.18,
              color: locked || me.hold >= 0 ? [0.5, 0.5, 0.5, 0.4] : inside ? [1, 1, 1, 0.9] : [1, 0.4, 0.3, 0.3 + 0.4 * clamp01(2 - d / reach(sp))], kind: DECAL.RING });
          }
        }
      }
    }
    if (ghost && mine) {
      const ff = fly({ ...ghost.b }, c, Math.floor(ptick - ghost.at), (ptick - ghost.at) % 1);
      const col = SIDES[mine.side].color;
      sc.sphere(ff.x, ff.y, ff.z, MC.DB_R, ...col, LOOK.RUBBER);
      out.casters.push([ff.x, ff.y, ff.z, -MC.DB_R]);
    }
    // holding: the arc your throw would fly, from where you are, the way you face
    if (mine && me && me.hold >= 0 && !ghost && g.state === L.H_PLAY) {
      const at = ctx.own || mine.pos;
      let b = launch(at[0], at[1], at[2], mine.yaw), prev = [b.x, b.y, b.z];
      for (let k = 0; k < 10 && b.st === MC.DB_FLY; k++) {
        b = fly(b, c, 12);
        out.beams.push({ a: prev, b: [b.x, b.y, b.z], width: 0.05, color: [...SIDES[mine.side].color, 0.5 - 0.04 * k] });
        prev = [b.x, b.y, b.z];
      }
    }
    // the jailed: a grey ring round each
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + p * L.PSIZE;
      if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE || !jailed(view, p)) continue;
      const q = ballAt(p);
      out.decals.push({ pos: [q[0], PLAT_Y + 0.05, q[2]], radius: B_RAD * 1.7, width: 0.15, color: [0.6, 0.6, 0.65, 0.6], kind: DECAL.RING });
    }
    if (tp < 0) return;
  },

  // the whole hall, the jails in it
  frame(view) {
    const c = court(view), g = view.party();
    const cx = c.cx || g.cx;
    return { centre: [cx, PLAT_Y, cx], radius: (c.hx > 0 ? c.hx + c.jd : g.size) + 1, shape: 'square' };
  },

  // the countdown turns you to the line
  facing(view, slot) {
    return sideOf(view, slot) ? Math.PI : 0;
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const name = (p) => (ctx.name ? ctx.name(p) : `P${p + 1}`);
    if (fx.kind === MC.DB_FX_THROW) {
      ctx.glow?.({ pos: fx.pos, size: 1.2, color: [1, 1, 1, 0.6], kind: SPRITE.FLASH, life: 150 });
      ctx.sound?.melee?.(fx.owner === ctx.slot ? 0 : d);
    } else if (fx.kind === MC.DB_FX_HIT) {
      const by = fx.shot & 255;
      ctx.glow?.({ pos: fx.pos, size: 2.4, color: [1, 0.85, 0.5, 0.9], kind: SPRITE.SPARK, life: 300 });
      ctx.glow?.({ pos: fx.pos, size: 3, color: [1, 0.5, 0.35, 0.8], kind: SPRITE.RING, life: 400, grow: true });
      ctx.sound?.boing?.(18, d);
      ctx.feed?.(`${name(by)} HIT ${name(fx.owner)}`, fx.owner === ctx.slot ? C.RED : by === ctx.slot ? C.GREEN : C.WHITE);
      if (fx.owner === ctx.slot) { ctx.banner?.('HIT!  TO JAIL', C.RED, 1600); ctx.sound?.hurt?.(false); }
      else if (by === ctx.slot) { ctx.banner?.(`YOU HIT ${name(fx.owner)}`, C.GREEN, 1200); ctx.sound?.kill?.(); }
    } else if (fx.kind === MC.DB_FX_CATCH) {
      const by = fx.shot & 255, freed = (fx.shot >> 8) & 255;
      ctx.glow?.({ pos: fx.pos, size: 2.6, color: [0.6, 1, 0.7, 0.9], kind: SPRITE.RING, life: 450, grow: true });
      ctx.sound?.pickup?.();
      ctx.feed?.(`${name(fx.owner)} CAUGHT ${by === 255 ? 'A THROW' : name(by)}${freed !== 255 ? `  ${name(freed)} BACK IN` : ''}`, fx.owner === ctx.slot || freed === ctx.slot ? C.GREEN : by === ctx.slot ? C.RED : C.WHITE);
      if (fx.owner === ctx.slot) ctx.banner?.(`CAUGHT!${by !== 255 ? `  ${name(by)} TO JAIL` : ''}`, C.GREEN, 1600);
      else if (by === ctx.slot) ctx.banner?.(`${name(fx.owner)} CAUGHT IT  TO JAIL`, C.RED, 1600);
      else if (freed === ctx.slot) ctx.banner?.('FREED!  BACK IN', C.GREEN, 1600);
    } else if (fx.kind === MC.DB_FX_WHIFF) {
      ctx.glow?.({ pos: fx.pos, size: 1.4, color: [0.6, 0.6, 0.65, 0.5], kind: SPRITE.RING, life: 250, grow: true });
      if (fx.owner === ctx.slot) { ctx.banner?.(fx.shot ? 'STILL LOCKED' : 'MISSED  LOCKED', C.GREY, 600); ctx.sound?.hurt?.(true); }
    }
  },

  // in jail, holding, a throw coming, locked; your hits and catches; the jails
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const c = court(view);
    if (!(c.hx > 0)) return;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const jail = [0, 0];
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + p * L.PSIZE;
      if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) === L.PF_LIVE && jailed(view, p)) jail[sideOf(view, p)]++;
    }
    ctx.right(3, `IN JAIL  RED ${jail[0]}  BLUE ${jail[1]}`, C.GREY);
    if (!me || !me.live || me.out) return;
    const s = slotOf(view, ctx.slot);
    ctx.right(4, `HITS ${s.hits}  CATCHES ${s.catches}`, C.GREY);
    const blink = Math.floor((ctx.now || 0) / 200) & 1;
    if (jailed(view, ctx.slot)) { ctx.centre(row, 'IN JAIL  A CATCH BY YOUR SIDE BRINGS YOU BACK', C.ORANGE); return; }
    if (s.hold >= 0) ctx.centre(row, 'YOU HAVE A BALL  CLICK TO THROW', C.WHITE);
    else {
      const w = worldOf(view);
      const inc = incoming(w, me.side, me.pos[0], me.pos[2], 0);
      if (inc && inc.eta < 90) ctx.centre(row, 'INCOMING!  CLICK AS IT REACHES YOUR RING TO CATCH', blink ? C.RED : C.WHITE);
      if (s.lock > g.t) ctx.centre(row + 1, `CATCH LOCKED ${((s.lock - g.t) * TICK).toFixed(1)}`, C.GREY);
    }
  },

  brain: {
    // a throw's path coming in is the danger, the nearer its line the worse;
    // off your half a little (the line and the walls stop you anyway)
    danger(view, x, z, tick, me) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || jailed(view, me.slot)) return 0;
      const side = me.side ?? 0;
      const c = w.c;
      let d = 0;
      if ((x - c.cx) * dir(side) < 0.5 || Math.abs(x - c.cx) > c.hx - 0.5 || Math.abs(z - c.cx) > c.hz - 0.5) d = 0.2;
      const n = (tick - view.tick) * TICK;
      for (const b of w.air[1 - side]) {
        const bx = b.x + b.vx * n, bz = b.z + b.vz * n;
        const dx = x - bx, dz = z - bz, d2 = dx * dx + dz * dz;
        if (d2 < 6.25) d = Math.max(d, 1 - Math.sqrt(d2) / 2.5);
      }
      return d;
    },
    // in jail, its middle; holding, up toward the line facing the foes; else the nearest loose ball it can reach on its half or the line, else back from the line
    goal(view, me, bot) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me) return null;
      const c = w.c, side = me.side, slot = me.slot;
      const mx = bot?.pos?.[0] ?? me.pos[0], mz = bot?.pos?.[1] ?? me.pos[2];
      const mine = slotOf(view, slot);
      if (jailed(view, slot)) {
        // in jail: the nearest loose ball in it or rolling out past it, else its middle
        let best = null, bd = Infinity;
        for (const b of w.balls) {
          if (b.st !== MC.DB_LOOSE || (b.x - c.cx) * -dir(side) < c.hx - 2) continue;
          const d = Math.hypot(b.x - mx, b.z - mz);
          if (d < bd) { bd = d; best = b; }
        }
        return best && mine.hold < 0 ? [best.x, best.z] : [c.cx - dir(side) * (c.hx + c.jd / 2), mz];
      }
      if (mine.hold >= 0) return onHalf(c, side, c.cx + dir(side) * (3 + 4 * luck(slot, w.start)), mz, 1.5);
      let best = null, bd = Infinity;
      for (const b of w.balls) {
        if (b.st !== MC.DB_LOOSE || (b.x - c.cx) * dir(side) < -0.6) continue;
        const d = Math.hypot(b.x - mx, b.z - mz);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) return [best.x, best.z];
      const u = (slot * 0.618034) % 1;
      return onHalf(c, side, c.cx + dir(side) * c.hx * (0.45 + 0.25 * u), c.cx + (u * 2 - 1) * c.hz * 0.7);
    },
    hop() { return false; },
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      return play(view, w, me, bot, tick);
    },
  },
};
