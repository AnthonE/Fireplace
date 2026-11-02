// BALLOON BASH, as drawn and as the AI ball sees it. A party mat in the sun,
// ringed by a wall of inflated pillars that closes in from 35 s, the last
// ring marked on the mat; wooden crates, tall painted ones with a step, the
// blue and yellow tower in the middle; a crate the wall reaches flashes, then
// sinks into the mat. Every ball's balloons (three, one gone for each it has
// lost) float over it on strings in its colour, bobbing, and blink while
// it's guarded (your own see-through, in front of the camera); a pop bursts
// in that colour. Bumper's power-ups fall from the sky and lie on the mat or
// a crate. The arena, the wall and the boxes are the sim's
// (src/mg/balloon.wat) read from PG_H, PG_S and the tick into play; the
// balloons are each ball's PG_M. The AI ball hunts a rival it can ram
// (backing off for a run-up when it's too close and slow, then aiming
// through it) or climbs a crate beside it to jump down on it, hops onto any
// box a hop high in its way, grabs power-ups and fires them at rivals in
// reach, and on its last balloon flees whatever comes at it fast.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/balloon.mjs'; // BL_*: the minigame's own constants
import { PLAT_Y, B_RAD, MEGA_RAD } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL, SHAPE } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const STEP = Number(L.P_STEP);
const HOPS = 1.05; // m up a hop gets a ball's bottom onto (0.9 m at its top, and the step)
const MAT = [0.98, 0.62, 0.72];
const PILLARS = [[0.95, 0.22, 0.25], [1, 0.84, 0.2], [0.25, 0.55, 1], [0.96, 0.96, 0.94]];
const CRATE = [0.78, 0.56, 0.32];
const TALL = [[0.3, 0.75, 0.4], [0.95, 0.5, 0.2], [0.6, 0.4, 0.9]];
const BASE = [0.25, 0.55, 0.95];
const TOP = [1, 0.8, 0.2];
// the power-ups' colours, by PU_* (bumper's)
const PU_RGB = [[1, 1, 1], [1, 0.3, 0.25], [0.3, 0.8, 1], [1, 0.85, 0.2], [1, 0.55, 0.15], [0.5, 1, 0.45]];
const HOW = ['STOMPED', 'RAMMED', 'BLASTED'];
const slotColor = (s) => { const h = (s * 0.618034) % 1; return [0, 0.33, 0.67].map((o) => 0.55 + 0.4 * Math.cos(6.2832 * (h + o))); };
const since = (T, start) => ((Math.floor(T) - start) | 0) + (T - Math.floor(T));

// ---- the arena, as the sim has it

// { cx, r0, boxes [{ i, x, z, h, top, gone, kind }], orbs [{ k, x, y (its bottom), z, kind, falling }] }, once a world tick.
export function stage(view) {
  const o = view.bank || 0;
  if (view._bl && view._bl.tick === view.tick && view._bl.o === o) return view._bl;
  const dv = view.dv;
  const nb = Math.min(MC.BL_BMAX, dv.getUint32(L.PG_H + o + MC.BL_NB, true));
  const boxes = [];
  for (let i = 0; i < nb; i++) {
    const a = L.PG_S + MC.BL_BOX + 32 * i;
    boxes.push({ i, x: dv.getFloat32(a, true), z: dv.getFloat32(a + 4, true), h: dv.getFloat32(a + 8, true), top: dv.getFloat32(a + 12, true),
      gone: dv.getInt32(a + 16, true), kind: dv.getUint32(a + 20, true) });
  }
  const orbs = [];
  for (let k = 0; k < MC.BL_NORB; k++) {
    const a = L.PG_S + MC.BL_ORBS + 16 * k;
    const kind = view.u8[a + 12];
    if (kind) orbs.push({ k, x: dv.getFloat32(a, true), y: dv.getFloat32(a + 4, true), z: dv.getFloat32(a + 8, true), kind, falling: view.u8[a + 13] === 1 });
  }
  view._bl = { tick: view.tick, o, cx: dv.getFloat32(L.PG_CX + o, true), r0: dv.getFloat32(L.PG_H + o + MC.BL_RAD, true), boxes, orbs, grid: null };
  return view._bl;
}
// The wall's radius at t ticks into play ($bl_rim; fractional for drawing).
export function wallAt(st, t) {
  const f = Math.min(1, Math.max(0, (t - MC.BL_CLOSE0) / (MC.BL_CLOSE1 - MC.BL_CLOSE0)));
  return st.r0 - (st.r0 - MC.BL_RMIN) * f;
}
// Box b's top over the floor at t ticks into play, -1 once gone ($bl_top).
export function topAt(b, t) {
  if (t >= b.gone) return -1;
  return b.gone - t > MC.BL_SINK ? b.top : b.top * (b.gone - t) / MC.BL_SINK;
}
// The highest top under (x, z) no higher than y (a world height) at t into play: $bl_ground.
export function groundAt(st, x, z, y, t) {
  let best = PLAT_Y;
  for (const b of st.boxes) {
    if (Math.abs(x - b.x) > b.h || Math.abs(z - b.z) > b.h) continue;
    const top = PLAT_Y + topAt(b, t);
    if (top <= y && top > best) best = top;
  }
  return best;
}
// A ball's balloons from its PG_M (three less those it has lost), and is it guarded at t into play?
export const balloonsOf = (m) => MC.BL_BALLOONS - (m & 3);
export const guarded = (m, t) => t < MC.BL_GUARD0 || ((m >>> 16) !== 0 && t + 1 - (m >>> 16) < MC.BL_GUARD);
// The boxes near each 4 m cell (within 1.8 m of its square), for the brain's few reads.
const GRID = 4;
function grid(st) {
  if (st.grid) return st.grid;
  const n = Math.ceil((2 * st.r0 + 4) / GRID), x0 = st.cx - st.r0 - 2;
  const cells = Array.from({ length: n * n }, () => []);
  for (const b of st.boxes) {
    const r = b.h + 1.8;
    for (let j = Math.max(0, Math.floor((b.z - r - x0) / GRID)); j <= Math.min(n - 1, Math.floor((b.z + r - x0) / GRID)); j++)
      for (let i = Math.max(0, Math.floor((b.x - r - x0) / GRID)); i <= Math.min(n - 1, Math.floor((b.x + r - x0) / GRID)); i++) cells[j * n + i].push(b);
  }
  st.grid = { n, x0, cells };
  return st.grid;
}
const near = (st, x, z) => { const g = grid(st); const i = Math.floor((x - g.x0) / GRID), j = Math.floor((z - g.x0) / GRID); return i >= 0 && j >= 0 && i < g.n && j < g.n ? g.cells[j * g.n + i] : []; };

// ---- drawing

let env = 'day';
const popped = new Map(); // slot -> ms it last lost a balloon, for the flash

// The balloons over a ball whose bottom is at pos: n of them in its colour, bobbing round a tether on its
// rider (alpha under 1: see-through, as your own are, in front of the camera).
function balloons(sc, pos, r, n, col, p, now, blink, alpha = 1) {
  if (blink && Math.floor(now / 110) % 2) return;
  const hand = [pos[0], pos[1] + 2 * r + 0.75, pos[2]];
  for (let k = 0; k < n; k++) {
    const a = now / 1700 + p * 1.37 + (k * 2 * Math.PI) / Math.max(n, 1);
    const off = n > 1 ? 0.55 : 0.2;
    const x = pos[0] + Math.cos(a) * off, z = pos[2] + Math.sin(a) * off;
    const y = pos[1] + 2 * r + MC.BL_FXY + 0.12 * Math.sin(now / 420 + k * 1.9 + p);
    sc.put(SHAPE.SPHERE, x, y, z, 0.42, 0.5, 0.42, 0, ...col, LOOK.PLASTIC, 0, 0, alpha, p * 3 + k);
    sc.sphere(x, y - 0.52, z, 0.07, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, LOOK.PLASTIC);
    // the string, hand to knot: a thin rod rolled off the vertical toward it, then turned to face it
    const dx = x - hand[0], dy = y - 0.56 - hand[1], dz = z - hand[2], len = Math.hypot(dx, dy, dz);
    sc.cyl((x + hand[0]) / 2, (y - 0.56 + hand[1]) / 2, (z + hand[2]) / 2, 0.018, len / 2, 0.95, 0.95, 0.95, LOOK.MATTE, 0, 0, 1, 0, Math.acos(dy / len), Math.atan2(-dx, dz));
  }
}

function arena(sc, out, st, rim, tp, playing, now) {
  const { cx, r0 } = st;
  sc.cyl(cx, PLAT_Y - 0.5, cx, r0 + 1.6, 0.5, ...MAT, LOOK.CHECKER, 3, 0.45);
  sc.cyl(cx, PLAT_Y - 3.5, cx, r0 + 1.2, 2.5, 0.42, 0.36, 0.5, LOOK.MATTE);
  // the ring the wall closes to, from a few seconds before it starts
  const warn = tp > MC.BL_CLOSE0 - 625;
  out.decals.push({ pos: [cx, PLAT_Y + 0.02, cx], radius: MC.BL_RMIN, width: 0.3, color: warn ? [1, 0.25, 0.2, 0.55 + 0.35 * Math.sin(now / 160)] : [1, 1, 1, 0.35], kind: DECAL.RING });
  // the wall: inflated pillars standing round it, touching
  const n = Math.max(24, Math.ceil((2 * Math.PI * (rim + 0.6)) / 1.15));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI;
    const c = PILLARS[k % 4];
    sc.cyl(cx + Math.cos(a) * (rim + 0.6), PLAT_Y + 1.05, cx + Math.sin(a) * (rim + 0.6), 0.62, 1.05, ...c, LOOK.PLASTIC, 0, 0, 1, k);
    sc.sphere(cx + Math.cos(a) * (rim + 0.6), PLAT_Y + 2.1, cx + Math.sin(a) * (rim + 0.6), 0.62, ...c, LOOK.PLASTIC, 0, 0, 1, k);
  }
  // the boxes, sinking as the wall takes them
  for (const b of st.boxes) {
    const top = playing ? topAt(b, tp) : b.top;
    if (top <= 0.01) continue;
    const hh = top / 2;
    if (b.kind === MC.BL_KBASE) sc.box(b.x, PLAT_Y + hh, b.z, b.h, hh, b.h, 0, ...BASE, LOOK.PLASTIC);
    else if (b.kind === MC.BL_KTOP) {
      // the top tier stands on the base: drawn from the base's top up
      const base = st.boxes.find((o) => o.kind === MC.BL_KBASE);
      const lo = base ? (playing ? topAt(base, tp) : base.top) : 0;
      sc.box(b.x, PLAT_Y + (lo + top) / 2, b.z, b.h, (top - lo) / 2, b.h, 0, ...TOP, LOOK.PLASTIC);
    } else if (b.kind === MC.BL_KHIGH) sc.box(b.x, PLAT_Y + hh, b.z, b.h, hh, b.h, 0, ...TALL[b.i % 3], LOOK.PLASTIC);
    else {
      sc.box(b.x, PLAT_Y + hh, b.z, b.h, hh, b.h, 0, ...CRATE, LOOK.WOOD);
      sc.box(b.x, PLAT_Y + top + 0.02, b.z, b.h - 0.12, 0.02, b.h - 0.12, Math.PI / 2, CRATE[0] * 1.12, CRATE[1] * 1.12, CRATE[2] * 1.1, LOOK.WOOD);
    }
    if (playing && b.gone - tp < 190 && b.gone - tp > 0) {
      out.decals.push({ pos: [b.x, PLAT_Y + 0.03, b.z], radius: b.h * 1.45, width: 0.2, color: [1, 0.3, 0.2, 0.5 + 0.4 * Math.sin(now / 70)], kind: DECAL.RING });
    }
  }
}

export default {
  id: L.MG_BALLOON, key: 'balloon', name: 'BALLOON BASH',
  hint: 'STOMP OR RAM THE OTHERS TO POP THEIR BALLOONS  KEEP YOURS',
  rules: 'OUT OF BALLOONS YOU ARE OUT  A POP STEALS ONE  LAST ONE IN WINS',
  get env() { return env; },

  draw(view, ctx, out) {
    const st = stage(view);
    if (!(st.r0 > 0)) return;
    const g = view.party();
    const now = ctx.now ?? 0;
    const playing = g.state === L.H_PLAY;
    // the arena on the prediction's clock, where your own ball meets it
    const T = ctx.ptick ?? ctx.tick + (ctx.dt || 0) / TICK;
    const tp = playing ? since(T, g.start) : 0;
    const rim = wallAt(st, tp);
    env = 'day';
    const sc = out.scene;
    arena(sc, out, st, rim, tp, playing, now);
    // the power-ups: falling with a streak and the spot they'll land on, then lying, bobbing
    const dt = ctx.dt || 0;
    for (const o of st.orbs) {
      const rgb = PU_RGB[o.kind] || PU_RGB[0];
      const y = o.falling ? o.y + 0.6 - 10 * dt : o.y + 0.6 + 0.15 * Math.sin(now / 333 + o.k);
      out.casters?.push([o.x, y, o.z, -0.6]);
      out.solid?.push({ pos: [o.x, y, o.z], size: 0.6, color: [...rgb, 1], kind: SPRITE.ORB, minpx: 2 });
      out.glow?.push({ pos: [o.x, y, o.z], size: 1.5, color: [...rgb, 0.5], kind: SPRITE.FLASH, minpx: 2 });
      if (o.falling) {
        const land = groundAt(st, o.x, o.z, o.y, playing ? Math.floor(tp) : 0);
        out.beams?.push({ a: [o.x, y + 5, o.z], b: [o.x, y, o.z], width: 0.12, color: [...rgb, 0.35] });
        out.decals?.push({ pos: [o.x, land + 0.03, o.z], radius: 1.4, width: 0.25, color: [...rgb, 0.85], kind: DECAL.TARGET });
      }
    }
    // every ball's balloons
    const tc = playing ? g.t + dt / TICK : 0;
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + p * L.PSIZE;
      const fl = view.u8[a + L.P_FL];
      if ((fl & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) continue;
      const own = p === ctx.slot && ctx.pme && !ctx.pme.out && ctx.own;
      const m = view.dv.getUint32(a + L.PG_M, true);
      const mega = view.dv.getUint16(a + L.B_MEGA, true) > 0;
      const r = own ? ctx.pme.radius : mega ? MEGA_RAD : B_RAD;
      const pos = own ? ctx.own : [0, 4, 8].map((k) => view.dv.getFloat32(a + L.P_PX + k, true) + view.dv.getFloat32(a + L.P_VX + k, true) * dt);
      const col = slotColor(p).map((c) => Math.min(1, c * 1.15));
      balloons(sc, pos, r, balloonsOf(m), col, p, now, playing && guarded(m, Math.floor(tc)), own ? 0.6 : 1);
      const hit = now - (popped.get(p) ?? -1e9);
      if (hit < 300) out.glow.push({ pos: [pos[0], pos[1] + r, pos[2]], size: r * 1.7, color: [1, 0.95, 0.8, 0.6 * (1 - hit / 300)], kind: SPRITE.FLASH, minpx: 1 });
      if (playing && guarded(m, Math.floor(tc)) && tc >= MC.BL_GUARD0) out.glow.push({ pos: [pos[0], pos[1] + r, pos[2]], size: r * 1.45, color: [...col, 0.35 + 0.15 * Math.sin(now / 60)], kind: SPRITE.RING, minpx: 1 });
    }
  },

  frame(view) {
    const st = stage(view);
    return { centre: [st.cx, PLAT_Y, st.cx], radius: st.r0 || view.party().size, shape: 'disc' };
  },

  fx(f, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const name = (p) => ctx.name?.(p) ?? `P${p + 1}`;
    if (f.kind === MC.BL_FX_POP) {
      const by = f.shot & 255, how = (f.shot >> 8) & 3, stole = !!(f.shot & 1024);
      const col = slotColor(f.owner);
      popped.set(f.owner, ctx.now ?? 0);
      ctx.glow?.({ pos: f.pos, size: 1.4, color: [...col, 1], kind: SPRITE.SPARK, life: 260 });
      ctx.glow?.({ pos: f.pos, size: 2.4, color: [...col, 0.85], kind: SPRITE.RING, life: 360, grow: true });
      ctx.glow?.({ pos: f.pos, size: 1.1, color: [1, 1, 1, 0.9], kind: SPRITE.FLASH, life: 140 });
      const mine = f.owner === ctx.slot || by === ctx.slot;
      if (mine || d < 30) ctx.sound?.shot?.(false);
      if (f.owner === ctx.slot) ctx.banner?.(by === 255 ? `POP  ${f.size} LEFT` : `${HOW[how]} BY ${name(by)}  ${f.size} LEFT`, f.size ? C.ORANGE : C.RED, 1100);
      else if (by === ctx.slot) { ctx.banner?.(stole ? `POP! ${name(f.owner)}  +1 BALLOON` : `POP! ${name(f.owner)}`, C.YELLOW, 900); ctx.sound?.pickup?.(); }
      else if (how === 0 && by !== 255) ctx.feed?.(`${name(by)} STOMPED ${name(f.owner)}`, C.WHITE);
      return;
    }
    if (f.kind === MC.BL_FX_CLOSE) {
      ctx.banner?.('THE WALL IS CLOSING IN', C.ORANGE, 2200);
      ctx.sound?.holed?.();
    }
  },

  // the feed's line for a ball out of balloons: who popped its last (the sim's credit)
  sink(f, name) {
    return f.shot === 255 ? `${name(f.owner)} RAN OUT OF BALLOONS` : `${name(f.shot)} POPPED ${name(f.owner)} OUT`;
  },

  // your balloons, the wall, and how many are left
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const tp = typeof ctx.t === 'number' && ctx.t > 0 ? ctx.t / TICK : g.t;
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (me?.live && !me.out) {
      const n = balloonsOf(me.m);
      const safe = guarded(me.m, Math.floor(tp));
      ctx.right(2, `BALLOONS ${'O'.repeat(n)}${'-'.repeat(MC.BL_BALLOONS - n)}${safe ? '  SAFE' : ''}`, n === 1 ? C.RED : n === 2 ? C.YELLOW : C.GREEN);
    }
    if (tp < MC.BL_CLOSE0) ctx.right(3, `THE WALL CLOSES IN ${Math.ceil((MC.BL_CLOSE0 - tp) * TICK)}`, C.GREY);
    else if (tp < MC.BL_CLOSE1) ctx.right(3, 'THE WALL IS CLOSING IN', Math.floor((ctx.now ?? 0) / 250) % 2 ? C.ORANGE : C.YELLOW);
    else ctx.right(3, 'THE FINAL RING', C.RED);
    let left = 0;
    for (let p = 0; p < L.NPLAYER; p++) if ((view.u8[L.PLAYERS + p * L.PSIZE + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) === L.PF_LIVE) left++;
    ctx.right(4, `${left} ${left === 1 ? 'BALL' : 'BALLS'} LEFT`, C.WHITE);
  },

  brain: {
    // the wall stops you, the boxes too high to hop onto stand in the way (a hop gets it onto the
    // rest), and on its last balloon whatever comes in fast is to be kept clear of
    danger(view, x, z, tick, me) {
      const w = worldOf(view);
      const st = w.st;
      const t = ((tick ?? view.tick) - w.start) | 0;
      const r = me?.radius ?? B_RAD;
      const rim = wallAt(st, w.playing ? t : 0);
      const dc = Math.hypot(x - st.cx, z - st.cx);
      let d = dc > rim - r - 0.3 ? 0.3 : dc > rim - r - 1.5 ? 0.1 : 0;
      const bot = me ? me.pos[1] - PLAT_Y : 0;
      for (const b of near(st, x, z)) {
        const top = topAt(b, w.playing ? t : 0);
        if (top <= 0 || top - bot <= HOPS) continue;
        if (Math.abs(x - b.x) < b.h + r && Math.abs(z - b.z) < b.h + r) { d = Math.max(d, 0.3); break; }
      }
      if (me && (me.m & 3) === MC.BL_BALLOONS - 1 && !guarded(me.m, w.t)) {
        const s = Math.max(0, (tick ?? view.tick) - view.tick) * TICK;
        for (const th of w.fast) {
          if (th.slot === me.slot) continue;
          if (Math.hypot(th.x + th.vx * s - x, th.z + th.vz * s - z) < 2.8) { d = Math.max(d, 0.7); break; }
        }
      }
      return d;
    },
    goal(view, me, bot) {
      return plan(view, me, bot);
    },
    // a hop up onto a box a hop high ahead of it: its centre over the side in under 0.45 s, so it's
    // high enough (over the step) as its edge reaches the side, and still as its centre crosses
    hop(view, me, bot) {
      const w = worldOf(view);
      const [x, z] = bot.pos, [vx, vz] = bot.vel;
      if (Math.hypot(vx, vz) < 1.5) return false;
      const mine = me.pos[1] - PLAT_Y;
      for (const b of near(w.st, x + vx * 0.2, z + vz * 0.2)) {
        const top = topAt(b, w.t);
        if (top - mine <= STEP || top - mine > HOPS) continue;
        // the time its centre takes to reach the square, along x and along z
        const ex = Math.abs(x - b.x) - b.h, ez = Math.abs(z - b.z) - b.h;
        const tx = ex <= 0 ? 0 : (x < b.x ? vx : -vx) > 0 ? ex / (x < b.x ? vx : -vx) : Infinity;
        const tz = ez <= 0 ? 0 : (z < b.z ? vz : -vz) > 0 ? ez / (z < b.z ? vz : -vz) : Infinity;
        const at = Math.max(tx, tz);
        if (at > 0.08 && at < 0.45 && Math.abs(x + vx * at - b.x) <= b.h + 0.3 && Math.abs(z + vz * at - b.z) <= b.h + 0.3) return true;
      }
      return false;
    },
    think(view, me, bot, t) { return act(view, me, bot, t); },
  },
};

// ---- the AI ball

// What every AI ball looking at one world tick shares: the arena, the clock,
// the balls in (where, how fast, their balloons, guarded or not), and the
// fast ones (over 6 m/s, or MEGA) a ball on its last balloon keeps clear of.
function worldOf(view) {
  const o = view.bank || 0;
  if (view._blw?.tick === view.tick && view._blw.o === o) return view._blw;
  const st = stage(view);
  const g = view.party();
  const playing = g.state === L.H_PLAY;
  const t = playing ? (view.tick - g.start) | 0 : 0;
  const balls = [], fast = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + o + p * L.PSIZE;
    if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const m = view.dv.getUint32(a + L.PG_M, true);
    const mega = view.dv.getUint16(a + L.B_MEGA, true) > 0;
    const b = {
      slot: p, x: view.dv.getFloat32(a + L.P_PX, true), y: view.dv.getFloat32(a + L.P_PY, true), z: view.dv.getFloat32(a + L.P_PZ, true),
      vx: view.dv.getFloat32(a + L.P_VX, true), vy: view.dv.getFloat32(a + L.P_VY, true), vz: view.dv.getFloat32(a + L.P_VZ, true),
      n: balloonsOf(m), safe: guarded(m, t), mega, r: mega ? MEGA_RAD : B_RAD,
    };
    balls.push(b);
    if (mega || Math.hypot(b.vx, b.vz) > 6) fast.push(b);
  }
  view._blw = { tick: view.tick, o, st, playing, t, start: g.start, rim: wallAt(st, t), balls, fast };
  return view._blw;
}

// The box whose top a ball whose bottom is at (x, y, z) stands on, or null (the floor).
function standing(st, x, y, z, t) {
  let on = null;
  for (const b of near(st, x, z)) {
    if (Math.abs(x - b.x) > b.h || Math.abs(z - b.z) > b.h) continue;
    const top = topAt(b, t);
    if (top > 0 && Math.abs(y - PLAT_Y - top) < 0.12 && (!on || top > topAt(on, t))) on = b;
  }
  return on;
}

// Where the AI ball goes, thought again every think and kept in its mem: on
// its last balloon away from a fast ball closing on it; for a power-up near
// with its hands free; up a crate beside its rival to jump down on it; else
// at its rival (one not guarded, nearest, the fewer balloons the better),
// from far enough back to hit it at a ram's speed.
function plan(view, me, bot) {
  const w = worldOf(view);
  const st = w.st;
  if (!w.playing || !st.r0) return null;
  const m = bot.mem;
  const [x, z] = bot.pos, [vx, vz] = bot.vel;
  const tick = bot.at ?? view.tick;
  const lead = (bot.lag || 0) * TICK;
  const inside = (gx, gz, k = 3) => {
    const dx = gx - st.cx, dz = gz - st.cx, d = Math.hypot(dx, dz), lim = w.rim - k;
    return d > lim ? [st.cx + (dx / d) * lim, st.cx + (dz / d) * lim] : [gx, gz];
  };
  // on its last balloon: away from what comes at it fast
  if ((me.m & 3) === MC.BL_BALLOONS - 1 && !guarded(me.m, w.t)) {
    let ax = 0, az = 0;
    for (const b of w.fast) {
      if (b.slot === bot.slot) continue;
      const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
      if (d > 9 || d < 0.01) continue;
      const closing = (b.vx * dx + b.vz * dz) / d;
      if (closing > 4) { ax += dx / d * (9 - d); az += dz / d * (9 - d); }
    }
    if (ax || az) {
      const n = Math.hypot(ax, az);
      return inside(x + (ax / n) * 8, z + (az / n) * 8);
    }
  }
  // a power-up near, its hands free (on the floor, or on a box: a hop gets it up)
  if (!me.item) {
    let best = 16, at = null;
    for (const o of st.orbs) {
      if (o.falling && o.y > PLAT_Y + 12) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < best && Math.hypot(o.x - st.cx, o.z - st.cx) < w.rim - 1.5) { best = d; at = o; }
    }
    if (at) return [at.x, at.z];
  }
  // the rival, held a second at a time
  let tgt = m.who >= 0 ? w.balls.find((b) => b.slot === m.who) : null;
  if (!(m.until > tick) || !tgt || tgt.safe) {
    m.until = tick + 110;
    m.who = -1;
    m.climb = undefined;
    m.runup = false;
    let best = Infinity;
    for (const b of w.balls) {
      if (b.slot === bot.slot || b.safe) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d > 40) continue;
      const s = d + 4 * b.n + (bot.rand() - 0.5) * 6 * (1 - bot.skill);
      if (s < best) { best = s; m.who = b.slot; }
    }
    tgt = m.who >= 0 ? w.balls.find((b) => b.slot === m.who) : null;
    // now and then (more often in the last ring, round the tower): up the low box nearest it (within 5 m
    // of it, 9 of us) to come down on it
    if (tgt && bot.rand() < (w.t > MC.BL_CLOSE1 - 1250 ? 0.4 : 0.15) + 0.35 * bot.skill) {
      let bb = null, bd = Infinity;
      for (const b of st.boxes) {
        if (b.kind === MC.BL_KHIGH || b.kind === MC.BL_KTOP || topAt(b, w.t) < b.top) continue;
        const dt = Math.max(Math.abs(tgt.x - b.x), Math.abs(tgt.z - b.z)) - b.h, dm = Math.max(Math.abs(x - b.x), Math.abs(z - b.z)) - b.h;
        if (dt < 5 && dm < 9 && dm + dt < bd) { bd = dm + dt; bb = b; }
      }
      if (bb) m.climb = bb.i;
    }
  }
  if (!tgt) return [st.cx + (x - st.cx) * 0.6, st.cx + (z - st.cx) * 0.6];
  // climbing: to the box, then (think) down onto the rival
  const cb = st.boxes[m.climb];
  if (cb) {
    const top = topAt(cb, w.t), mine = me.pos[1] - PLAT_Y;
    if (top <= 0 || (me.ground && mine < 0.1 && Math.max(Math.abs(x - cb.x), Math.abs(z - cb.z)) - cb.h > 9)) m.climb = undefined;
    else return [cb.x, cb.z];
  }
  const dx = tgt.x - x, dz = tgt.z - z, d = Math.hypot(dx, dz) || 1;
  const toward = (vx * dx + vz * dz) / d;
  // too close and too slow to ram it: back off for a run-up, then come in (in the last ring, where a
  // ram takes less, a metre and a half of run is enough)
  const last = w.t >= MC.BL_CLOSE1;
  const ram = last ? MC.BL_RAMF : MC.BL_RAM;
  if (!m.runup && d < (last ? 2.8 : 3.5) && toward < ram - 1) { m.runup = true; m.back = tick + (last ? 60 : 120); }
  if (m.runup && (d > (last ? 4 : 5.5) || tick > m.back)) m.runup = false;
  if (m.runup) return inside(x - (dx / d) * 6 + (dz / d) * 2, z - (dz / d) * 6 - (dx / d) * 2, last ? 1.5 : 3);
  // and through it, not to it: the planner slows for a goal it would pass
  const s = Math.min(0.8, d / 10 + lead);
  const ax = tgt.x + tgt.vx * s - x, az = tgt.z + tgt.vz * s - z, ad = Math.hypot(ax, az) || 1;
  return [x + ax * (1 + 5 / ad), z + az * (1 + 5 / ad)];
}

// The word when the AI ball knows better than the planner: a power-up fired
// at a rival in reach (aimed, for a ROCKET or a DASH); off a box top down
// onto a rival below (a hop to carry it there); in the air, steering onto one.
function act(view, me, bot, t) {
  const w = worldOf(view);
  const st = w.st;
  if (!w.playing || !st.r0 || !bot?.pos) return null;
  const [x, z] = bot.pos;
  const lead = (bot.lag || 0) * TICK;
  const rivals = [];
  for (const b of w.balls) {
    if (b.slot === bot.slot || b.safe) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d < 26) rivals.push({ b, d });
  }
  rivals.sort((a, b) => a.d - b.d || a.b.slot - b.b.slot);
  const aim = (b, s) => Math.atan2(b.z + b.vz * s - z, b.x + b.vx * s - x);
  if (me.item && me.refire === 0 && rivals.length && bot.rand() < 0.3 + 0.6 * bot.skill) {
    const [{ b, d }] = rivals;
    switch (me.item) {
      case L.PU_POW: if (d < 8) return { use: true }; break;
      case L.PU_SPRING: if (d < 4.5) return { use: true }; break;
      case L.PU_MEGA: if (d < 10) return { use: true }; break;
      case L.PU_DASH: if (d < 7) return { yaw: aim(b, d / 16 + lead), move: 1, use: true }; break;
      case L.PU_ROCKET: if (d < 22) return { yaw: aim(b, d / 30 + lead), move: 1, use: true }; break;
      default:
    }
  }
  const mine = me.pos[1] - PLAT_Y;
  if (mine < 0.6) return null;
  // up on a box, or in the air over the floor: the nearest rival well below it
  let v = null;
  for (const r of rivals) if (r.b.y - PLAT_Y <= mine - 0.5 && r.d < 6) { v = r; break; }
  if (!v) return null;
  const s = 0.3 + lead;
  const vx = v.b.x + v.b.vx * s - x, vz = v.b.z + v.b.vz * s - z, dist = Math.hypot(vx, vz);
  const yaw = Math.atan2(vz, vx);
  if (!me.ground) return { yaw, move: 1 };
  const on = standing(st, me.pos[0], me.pos[1], me.pos[2], w.t);
  if (!on) return null;
  return { yaw, move: 1, hop: dist > 2.2 && dist < 5.5 };
}
