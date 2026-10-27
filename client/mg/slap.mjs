// SLAP HAPPY, as drawn and as the AI ball sees it. A grassy island on a
// sandy rim over a column of rock, a ring of small ones round it with a
// glowing respawn pad each; every ball's glove beside it in its kind's
// colour (classic red, heavy black and bigger, quick yellow and smaller,
// long blue on an arm), pulled back as it winds up, with the cone it will
// land in lit red on the ground under it, swung round in front as it lands,
// dull through its cooldown; a ball just back on a pad in a bubble no slap
// gets through. The last 15 s the sun sets and every knock-off pays two.
// The islands, the gloves and the swings are the sim's (src/mg/slap.wat)
// read from PG_H, PG_S, the seed and each ball's PG_M, so the bots steer by
// what the sim does; your own glove is drawn on the prediction's clock.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/slap.mjs'; // SL_*: the minigame's own constants
import { PLAT_Y, seed } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const f32 = Math.fround;
const GRASS = [0.36, 0.66, 0.26];
const SAND = [0.92, 0.84, 0.6];
const ROCK = [0.45, 0.4, 0.36];
export const GLOVES = ['CLASSIC', 'HEAVY', 'QUICK', 'LONG'];
const GCOL = [[0.9, 0.14, 0.12], [0.16, 0.14, 0.18], [1, 0.82, 0.16], [0.2, 0.48, 1]];
const GSIZE = [0.42, 0.56, 0.34, 0.4];
const HUE = [C.RED, C.GREY, C.YELLOW, C.CYAN];
const STRIKE = 16; // ticks the glove is drawn out in front after it lands
const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;

// ---- the stage and the gloves, as the sim has them

// The islands: { cx, rm (the main one's radius), sr (a small one's), ring, sats [{ x, z }] }, once a world tick.
export function stage(view) {
  const o = view.bank || 0;
  if (view._sl && view._sl.tick === view.tick && view._sl.o === o) return view._sl;
  const dv = view.dv, h = L.PG_H + o;
  const ns = Math.min(MC.SL_KMAX, dv.getUint32(h + MC.SL_NS, true));
  const sats = [];
  for (let k = 0; k < ns; k++) sats.push({ k, x: dv.getFloat32(L.PG_S + MC.SL_SAT + 8 * k, true), z: dv.getFloat32(L.PG_S + MC.SL_SAT + 8 * k + 4, true) });
  view._sl = {
    tick: view.tick, o, cx: dv.getFloat32(L.PG_CX + o, true), rm: dv.getFloat32(h + MC.SL_RAD, true), sr: dv.getFloat32(h + MC.SL_SR, true),
    ring: dv.getFloat32(h + MC.SL_RING, true), sats,
  };
  return view._sl;
}
// The island under (x, z), as $sl_ground finds it: 0 the main one, k + 1 small island k, -1 the sea.
export function islandAt(st, x, z) {
  const dx = f32(x - st.cx), dz = f32(z - st.cx), r2 = f32(f32(dx * dx) + f32(dz * dz));
  if (r2 <= f32(st.rm * st.rm)) return 0;
  const hi = f32(st.ring + st.sr), lo = f32(st.ring - st.sr);
  if (r2 > f32(hi * hi) || r2 < f32(lo * lo)) return -1;
  for (const s of st.sats) {
    const ex = f32(x - s.x), ez = f32(z - s.z);
    if (f32(f32(ex * ex) + f32(ez * ez)) <= f32(st.sr * st.sr)) return s.k + 1;
  }
  return -1;
}
// Ball p's glove this round ($sl_glove).
export const gloveOf = (view, p) => (seed(view, MC.SL_KGLOVE + p) >>> 8) & 3;
// Ball p's swing on its bank's record at T ticks into play (fractional): { glove, age (ticks since the press, Infinity
// none), wind, cool, winding, striking, ready }.
export function swingOf(view, p, T) {
  const g = gloveOf(view, p);
  const m = view.dv.getUint32(L.PLAYERS + (view.bank || 0) + p * L.PSIZE + L.PG_M, true);
  const last = m >>> 16;
  const age = last ? T + 1 - last : Infinity;
  const wind = MC.SL_GWIND[g], cool = MC.SL_GCOOL[g];
  return { glove: g, age, wind, cool, winding: age >= 0 && age < wind, striking: age >= wind && age < wind + STRIKE, ready: !(age < cool) };
}
// Is ball b (a partier()) back on a pad, where no slap lands on it, on tick `tick`?
export const sheltered = (view, b, tick) => ((tick - b.outAt) >>> 0) < view.dv.getUint32(L.PG_RESPAWN, true) + MC.SL_SAFE;
// Where a glove of kind g on a ball of radius r at `pos` facing yaw is drawn, at age (ticks since the press).
function glovePos(pos, r, yaw, g, age, wind) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  let fwd = 0.55, side = r + 0.15, up = r * 0.95;
  if (age >= 0 && age < wind) {
    const k = age / wind;
    fwd = 0.55 - 1.3 * k; side = r + 0.15 + 0.35 * k; up = r * 0.95 + 0.5 * k;
  } else if (age >= wind && age < wind + STRIKE) {
    const k = (age - wind) / STRIKE, out = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
    const reach = MC.SL_GREACH[g] / 100 - 0.9;
    fwd = 0.55 + (reach - 0.55) * out; side = (r + 0.15) * (1 - out); up = r * 0.95;
  }
  return [pos[0] + c * fwd - s * side, pos[1] + up, pos[2] + s * fwd + c * side];
}

// ---- drawing

let env = 'day';
let own = null; // your glove as last drawn, for the HUD: swingOf's
const hits = new Map(); // slot -> ms it was last slapped, for the flash

function island(sc, out, x, z, R, pad, now) {
  sc.cyl(x, PLAT_Y - 0.45, z, R, 0.45, ...GRASS, LOOK.MATTE);
  sc.cyl(x, PLAT_Y - 0.6, z, R + 0.4, 0.42, ...SAND, LOOK.MATTE);
  sc.cyl(x, PLAT_Y - 2.4, z, R * 0.86, 1.5, ...ROCK, LOOK.MATTE);
  sc.cyl(x, PLAT_Y - 5.2, z, R * 0.58, 1.4, ROCK[0] * 0.85, ROCK[1] * 0.85, ROCK[2] * 0.85, LOOK.MATTE);
  sc.cyl(x, PLAT_Y - 7.6, z, R * 0.28, 1.1, ROCK[0] * 0.7, ROCK[1] * 0.7, ROCK[2] * 0.7, LOOK.MATTE);
  out.decals.push({ pos: [x, PLAT_Y + 0.02, z], radius: R - 0.05, width: 0.3, color: [1, 0.95, 0.75, 0.55], kind: DECAL.RING });
  if (pad) {
    const beat = 0.5 + 0.5 * Math.sin(now / 400 + x);
    out.decals.push({ pos: [x, PLAT_Y + 0.03, z], radius: R * MC.SL_PAD + 0.5, width: 0.35, color: [0.5, 0.9, 1, 0.45 + 0.25 * beat], kind: DECAL.TARGET });
  }
}

export default {
  id: L.MG_SLAP, key: 'slap', name: 'SLAP HAPPY',
  hint: 'CLICK TO SLAP  KNOCK THE OTHERS INTO THE SEA  HOP BETWEEN ISLANDS',
  rules: 'A POINT A KNOCK-OFF  A FALL COSTS ONE  THE LAST 15 S PAY DOUBLE',
  get env() { return env; },

  draw(view, ctx, out) {
    const st = stage(view);
    if (!(st.rm > 0)) return;
    const g = view.party();
    const now = ctx.now ?? 0;
    const playing = g.state === L.H_PLAY;
    const T = ctx.tick + (ctx.dt || 0) / TICK;
    const PT = ctx.ptick ?? T;
    const tp = playing ? ((Math.floor(T) - g.start) | 0) + (T - Math.floor(T)) : 0;
    env = playing && tp >= MC.SL_DOUBLE ? 'sunset' : 'day';
    const sc = out.scene;
    island(sc, out, st.cx, st.cx, st.rm, false, now);
    for (const s of st.sats) island(sc, out, s.x, s.z, st.sr, true, now);
    // the gloves
    own = null;
    for (let p = 0; p < L.NPLAYER; p++) {
      const b = view.partier(p);
      if (!b.live || b.out) continue;
      const mine = p === ctx.slot && ctx.pme && !ctx.pme.out && ctx.pview;
      const src = mine ? ctx.pme : b;
      const pos = mine && ctx.own ? ctx.own : [0, 1, 2].map((k) => b.pos[k] + b.vel[k] * (ctx.dt || 0));
      const tt = mine ? ((Math.floor(PT) - g.start) | 0) + (PT - Math.floor(PT)) : tp;
      const sw = playing ? swingOf(mine ? ctx.pview : view, p, tt) : { glove: gloveOf(view, p), age: Infinity, wind: 1, cool: 0, ready: true };
      if (mine) own = sw;
      const r = src.radius, gk = sw.glove;
      const at = glovePos(pos, r, src.yaw, gk, sw.age, sw.wind);
      const col = GCOL[gk].map((c) => (sw.ready || sw.winding || sw.striking ? c : 0.35 + 0.4 * c));
      if (sw.winding) {
        // winding up: the glove glows hotter, and the cone it lands in shows on the ground
        const k = sw.age / sw.wind, reach = MC.SL_GREACH[gk] / 100;
        sc.sphere(...at, GSIZE[gk], ...col, LOOK.GLOW, 0.3 + 1.2 * k);
        out.decals.push({ pos: [pos[0], PLAT_Y + 0.04, pos[2]], radius: reach, width: 0.18, color: [1, 0.25, 0.15, 0.25 + 0.5 * k], kind: DECAL.RING });
        for (const a of [-Math.PI / 3, 0, Math.PI / 3]) {
          const y = src.yaw + a;
          out.beams.push({ a: [pos[0], pos[1] + 0.15, pos[2]], b: [pos[0] + Math.cos(y) * reach, pos[1] + 0.15, pos[2] + Math.sin(y) * reach], width: a ? 0.08 : 0.14, color: [1, 0.3, 0.2, 0.3 + 0.5 * k] });
        }
      } else sc.sphere(...at, GSIZE[gk], ...col, LOOK.PLASTIC);
      // the cuff; the long glove's arm
      const c = Math.cos(src.yaw), s = Math.sin(src.yaw);
      sc.sphere(at[0] - c * GSIZE[gk] * 0.9, at[1], at[2] - s * GSIZE[gk] * 0.9, GSIZE[gk] * 0.55, 0.95, 0.95, 0.92, LOOK.PLASTIC);
      if (gk === MC.SL_G_LONG) {
        const mx = (pos[0] + at[0]) / 2, mz = (pos[2] + at[2]) / 2, len = Math.hypot(at[0] - pos[0], at[2] - pos[2]) / 2;
        sc.box(mx, at[1], mz, len, 0.07, 0.07, Math.atan2(at[2] - pos[2], at[0] - pos[0]), 0.85, 0.85, 0.9, LOOK.METAL);
      }
      // just back on a pad: a bubble
      if (playing && sheltered(view, b, view.tick)) {
        out.glow.push({ pos: [pos[0], pos[1] + r, pos[2]], size: r * 1.5, color: [0.5, 0.9, 1, 0.35 + 0.15 * Math.sin(now / 90)], kind: SPRITE.RING, minpx: 1 });
      }
      const hit = now - (hits.get(p) ?? -1e9);
      if (hit < 250) out.glow.push({ pos: [pos[0], pos[1] + r, pos[2]], size: r * 1.6, color: [1, 0.9, 0.6, 0.6 * (1 - hit / 250)], kind: SPRITE.FLASH, minpx: 1 });
    }
  },

  frame(view) {
    const st = stage(view);
    return { centre: [st.cx, PLAT_Y, st.cx], radius: view.party().size || st.rm, shape: 'disc' };
  },

  fx(f, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const name = (p) => ctx.name?.(p) ?? `P${p + 1}`;
    if (f.kind === MC.SL_FX_SLAP) {
      if (f.shot === 255) {
        ctx.glow?.({ pos: f.pos, size: 0.8, color: [1, 1, 1, 0.6], kind: SPRITE.SPARK, life: 180 });
        if (f.owner === ctx.slot) ctx.sound?.weapon?.();
        return;
      }
      hits.set(f.shot, ctx.now ?? 0);
      ctx.glow?.({ pos: f.pos, size: 1.6, color: [1, 0.95, 0.7, 1], kind: SPRITE.SPARK, life: 260 });
      ctx.glow?.({ pos: f.pos, size: 2.6, color: [1, 0.5, 0.3, 0.8], kind: SPRITE.RING, life: 380, grow: true });
      ctx.sound?.melee?.(f.owner === ctx.slot || f.shot === ctx.slot ? 0 : d);
      ctx.sound?.boing?.(f.size * 2, f.owner === ctx.slot || f.shot === ctx.slot ? 0 : d);
      if (f.shot === ctx.slot) ctx.banner?.(`SLAPPED BY ${name(f.owner)}`, C.RED, 900);
      else if (f.owner === ctx.slot) ctx.banner?.(`SLAP! ${name(f.shot)}`, C.YELLOW, 700);
      return;
    }
    if (f.kind === MC.SL_FX_SCORE) {
      ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 1, f.pos[2]], size: 3, color: [1, 0.85, 0.3, 0.9], kind: SPRITE.FLASH, life: 500, grow: true });
      if (f.owner === ctx.slot) { ctx.banner?.(`+${f.size}  ${name(f.shot)} IN THE SEA`, C.GREEN, 1500); ctx.sound?.kill?.(); }
      return;
    }
    if (f.kind === MC.SL_FX_CALL) {
      ctx.banner?.('LAST 15 S  KNOCK-OFFS PAY DOUBLE', C.ORANGE, 2200);
      ctx.sound?.holed?.();
    }
  },

  // the feed's line for a ball gone into the sea: who slapped it there (the sim's credit: slaps only)
  sink(f, name) {
    return f.shot === 255 ? `${name(f.owner)} FELL IN THE SEA` : `${name(f.shot)} SLAPPED ${name(f.owner)} INTO THE SEA`;
  },

  // your glove and its state, the double points, where you stand
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const tp = typeof ctx.t === 'number' && ctx.t > 0 ? ctx.t / TICK : g.t;
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (me?.live && ctx.slot >= 0) {
      const sw = own ?? swingOf(view, ctx.slot, tp);
      const state = me.out ? '' : sw.winding ? '  SWING' : sw.ready ? '  READY' : `  ${'#'.repeat(Math.ceil(4 * (1 - sw.age / sw.cool)))}`;
      ctx.right(2, `${GLOVES[sw.glove]} GLOVE${state}`, HUE[sw.glove]);
    }
    if (tp >= MC.SL_DOUBLE) ctx.right(3, 'DOUBLE POINTS', Math.floor((ctx.now ?? 0) / 250) % 2 ? C.ORANGE : C.YELLOW);
    else ctx.right(3, `DOUBLE IN ${Math.ceil((MC.SL_DOUBLE - tp) * TICK)}`, C.GREY);
    if (me?.live) {
      let place = 1, n = 0;
      for (let p = 0; p < L.NPLAYER; p++) {
        const a = L.PLAYERS + p * L.PSIZE;
        if (!(view.u8[a + L.P_FL] & L.PF_LIVE)) continue;
        n++;
        if (view.dv.getUint16(a + L.PG_SCORE, true) > me.score) place++;
      }
      ctx.right(4, `${ordinal(place)} OF ${n}`, place === 1 ? C.GREEN : C.WHITE);
    }
  },

  brain: {
    // the sea is a fall; an island's last metre a risk, its last three a little; in the cone of a
    // rival winding up, a risk
    danger(view, x, z, tick, me) {
      const w = worldOf(view, tick), st = w.st;
      const k = islandAt(st, x, z);
      if (k < 0) return 1;
      const e = k === 0 ? st.rm - Math.hypot(x - st.cx, z - st.cx) : st.sr - Math.hypot(x - st.sats[k - 1].x, z - st.sats[k - 1].z);
      let d = e < 1 ? 0.5 : e < 3 ? 0.15 * (3 - e) / 2 : 0;
      for (const th of w.threats) {
        if (th.slot === me?.slot) continue;
        const dx = x - th.x, dz = z - th.z, r2 = dx * dx + dz * dz;
        if (r2 < th.reach2 && dx * th.c + dz * th.s >= 0.4 * Math.sqrt(r2)) d = Math.max(d, 0.35);
      }
      return d;
    },
    goal(view, me, bot) {
      const p = plan(view, me, bot);
      return p ? p.goal : null;
    },
    hop() { return false; },
    // Off the main island, back to it: a run at the gap and a hop at its
    // edge (a run-up across the small island first if it's too slow). On it,
    // a slap when a rival will be in reach as it lands, turned to face it,
    // and facing it through the wind-up.
    think(view, me, bot, tick) {
      const w = worldOf(view, tick);
      const st = w.st;
      if (!st.rm || !me || !bot?.pos) return null;
      const m = bot.mem;
      const [x, z] = bot.pos, [vx, vz] = bot.vel;
      const k = islandAt(st, x, z);
      if (k > 0 && me.ground) {
        const s = st.sats[k - 1];
        const dx = st.cx - x, dz = st.cx - z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const along = vx * ux + vz * uz;
        // to the near edge of this island along the way in: solve |p + u t - s| = sr
        const px = x - s.x, pz = z - s.z, b = px * ux + pz * uz, cc = px * px + pz * pz - st.sr * st.sr;
        const left = -b + Math.sqrt(Math.max(0, b * b - cc));
        if (m.runup && Math.hypot(x - (s.x - ux * st.sr * 0.6), z - (s.z - uz * st.sr * 0.6)) < 1) m.runup = false;
        if (!m.runup && left < 1.1 && along < 6) m.runup = true;
        if (m.runup) return { yaw: Math.atan2(s.z - uz * st.sr * 0.6 - z, s.x - ux * st.sr * 0.6 - x), move: 1 };
        return { yaw: Math.atan2(dz, dx), move: 1, hop: left < 1.1 && along >= 6 };
      }
      m.runup = false;
      if (k !== 0) return null;
      const t = tick;
      const sw = m.swingAt ?? -1e9;
      const g = gloveOf(view, bot.slot);
      const wind = MC.SL_GWIND[g], reach = MC.SL_GREACH[g] / 100;
      const tgt = m.swingAt !== undefined && t - sw < wind + 2 ? w.balls.find((o) => o.slot === m.target) : null;
      const ahead = (wind + bot.lag) * TICK;
      if (tgt) return { yaw: Math.atan2(tgt.z + tgt.vz * ahead - z - vz * ahead, tgt.x + tgt.vx * ahead - x - vx * ahead), move: 1 };
      if (t - sw < MC.SL_GCOOL[g] + 4) return null;
      // the nearest rival in reach as the slap lands, not sheltered, not over the sea
      let best = null, bd = (reach - 0.5) ** 2;
      const mx = x + vx * wind * TICK, mz = z + vz * wind * TICK;
      for (const o of w.balls) {
        if (o.slot === bot.slot || o.safe) continue;
        const ox = o.x + o.vx * ahead, oz = o.z + o.vz * ahead, d2 = (ox - mx) ** 2 + (oz - mz) ** 2;
        if (d2 < bd) { bd = d2; best = { o, ox, oz }; }
      }
      if (!best || bot.rand() > 0.35 + 0.6 * bot.skill) return null;
      m.swingAt = t;
      m.target = best.o.slot;
      return { yaw: Math.atan2(best.oz - mz, best.ox - mx), move: 1, use: true };
    },
  },
};

// ---- the AI ball

// What every AI ball looking at one world tick shares: the islands, the
// balls in (where, how fast, sheltered or not), and the rivals winding up
// (where, which way, how far their slap reaches).
function worldOf(view, tick = view.tick) {
  if (view._slw?.tick === view.tick) return view._slw;
  const st = stage(view);
  const g = view.party();
  const t = g.state === L.H_PLAY ? (view.tick - g.start) | 0 : 0;
  const balls = [], threats = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + (view.bank || 0) + p * L.PSIZE;
    if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    const b = {
      slot: p, x: view.dv.getFloat32(a + L.P_PX, true), z: view.dv.getFloat32(a + L.P_PZ, true), vx: view.dv.getFloat32(a + L.P_VX, true),
      vz: view.dv.getFloat32(a + L.P_VZ, true), score: view.dv.getUint16(a + L.PG_SCORE, true),
      safe: ((view.tick - view.dv.getUint32(a + L.B_OUTAT, true)) >>> 0) < g.respawn + MC.SL_SAFE,
    };
    balls.push(b);
    if (g.state === L.H_PLAY) {
      const sw = swingOf(view, p, t);
      if (sw.winding) {
        const yaw = (view.dv.getUint32(a + L.P_IN, true) & 0x3fff) / 16384 * 2 * Math.PI;
        const r = MC.SL_GREACH[sw.glove] / 100 + 0.5;
        threats.push({ slot: p, x: b.x, z: b.z, c: Math.cos(yaw), s: Math.sin(yaw), reach2: r * r });
      }
    }
  }
  view._slw = { tick: view.tick, st, balls, threats, most: balls.reduce((a, b) => Math.max(a, b.score), 0) };
  return view._slw;
}

// What the ball goes for, thought again every second or so (or when it's
// gone): a rival near the edge of the main island, nearer it, the leader
// more so; and the spot just inside it, so a slap sends it out. Off the
// main island, the main island's middle. { goal [x, z] } or null.
function plan(view, me, bot) {
  const g = view.party();
  if (g.state !== L.H_PLAY || !me) return null;
  const w = worldOf(view);
  const st = w.st;
  const mind = bot?.mem ?? {};
  const t = bot?.at ?? view.tick;
  const x = bot?.pos?.[0] ?? me.pos[0], z = bot?.pos?.[1] ?? me.pos[2];
  if (islandAt(st, x, z) !== 0) return { goal: [st.cx, st.cx] };
  let tgt = mind.prey !== undefined ? w.balls.find((o) => o.slot === mind.prey) : null;
  if (!tgt || t - (mind.chose ?? -1e9) > 125 || islandAt(st, tgt.x, tgt.z) !== 0) {
    tgt = null;
    let best = -Infinity;
    for (const o of w.balls) {
      if (o.slot === me.slot || o.safe || islandAt(st, o.x, o.z) !== 0) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d > 18) continue;
      const out = Math.hypot(o.x - st.cx, o.z - st.cx) / st.rm;
      const s = 2 * out - d / 6 + (o.score && o.score >= w.most ? 0.6 : 0) + (bot ? bot.rand() * 0.4 : 0);
      if (s > best) { best = s; tgt = o; }
    }
    mind.prey = tgt?.slot;
    mind.chose = t;
  }
  if (!tgt) return { goal: [st.cx, st.cx] };
  // just inside it, between it and the middle (dead on the middle: on this side of it)
  let ux = tgt.x - st.cx, uz = tgt.z - st.cx, u = Math.hypot(ux, uz);
  if (u < 2) { ux = tgt.x - x; uz = tgt.z - z; u = Math.hypot(ux, uz) || 1; }
  return { goal: [tgt.x - (ux / u) * 2.2, tgt.z - (uz / u) * 2.2], prey: tgt.slot };
}
