// WHACK A MOLE, as drawn and as the AI ball sees it. A square lawn mown in
// stripes along the rows of holes, on a block of earth over the sea, a white
// picket fence round it; each hole a dark pit in a ring of dirt. Before a
// mole rises its hole's dirt heaves and shakes (glinting for a gold one,
// spike tips poking through for a spiked one), a ring round it brightening in
// the mole's colour, warm white, gold or red; the mole is a brown cylinder
// with a round head, a pink snout and two eyes, its paws on the rim, turned
// to the camera: gold ones shine, spiked ones are dark with red spikes round
// the crown and a striped collar. A whacked mole is flattened, stars turning
// over it. Every pop is read from the sim's own schedule (src/mg/mole.mjs's
// layout, in PG_S and PG_BIG) and its height worked out as $wm_lift does on
// the prediction's clock, where your own ball meets it; a mole your
// predicted ball is standing on is drawn whacked at once, before the
// confirmed world says so.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/mole.mjs'; // WM_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const f = Math.fround;
const TICK = 0.008;
const TOP = f(MC.WM_TOP);
const KR = f(MC.WM_TOP / MC.WM_RISE), KD = f(MC.WM_TOP / MC.WM_DUCK);
const POPS = L.PG_BIG + MC.WM_POPS;
const GRASS = [[0.33, 0.62, 0.2], [0.29, 0.55, 0.17]];
const EARTH = [0.42, 0.29, 0.17];
const DIRT = [0.36, 0.24, 0.13];
const FUR = [0.45, 0.3, 0.2];
const GOLDC = [1, 0.78, 0.25];
const SPIKEC = [0.3, 0.24, 0.28];
const PINK = [1, 0.6, 0.62];
const HEAD = 0.4; // the drawn head's radius, m
const RING = [[1, 0.93, 0.7], [1, 0.8, 0.2], [1, 0.2, 0.12]]; // by kind: the ring round a hole whose mole heaves or is up
// Ticks into play at tick T (fractional) of a round started on tick start: the sim's i32 subtraction wraps.
const since = (T, start) => ((Math.floor(T) - start) | 0) + (T - Math.floor(T));
const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;

// ---- what the sim says (its own state is the confirmed world's: bank 0 always)

// The lawn and every hole's pops: { half, cx, G, nh, x0, holes: [{ i, x, z, pops: [{ t0, up, kind, a }] }] },
// read again only when the round is laid out again.
const CACHE = new WeakMap(); // memory -> the last stage read from it
export function stage(view) {
  const dv = view.dv, buf = dv.buffer;
  const tick = dv.getUint32(L.HDR_TICK, true), round = dv.getUint32(L.HDR_HOLE, true);
  const c = CACHE.get(buf);
  if (c && c.tick === tick && c.round === round) return c;
  const G = Math.min(MC.WM_GMAX, dv.getUint32(L.PG_H + MC.WM_G, true)), nh = G * G;
  const npop = dv.getUint32(L.PG_H + MC.WM_NPOP, true), x0 = dv.getFloat32(L.PG_H + MC.WM_X0, true);
  let sig = `${round}:${G}:${npop}:${x0}`;
  for (let i = 0; i < nh; i++) sig += `:${view.u8[L.PG_S + MC.WM_COUNT + i]},${dv.getUint16(POPS + i * MC.WM_PMAX * MC.WM_PSIZE + MC.WM_P_T0, true)}`;
  if (c && c.sig === sig) { c.tick = tick; return c; }
  const holes = [];
  for (let i = 0; i < nh; i++) {
    const pops = [];
    const n = Math.min(MC.WM_PMAX, view.u8[L.PG_S + MC.WM_COUNT + i]);
    for (let k = 0; k < n; k++) {
      const a = (i * MC.WM_PMAX + k) * MC.WM_PSIZE;
      pops.push({ t0: dv.getUint16(POPS + a + MC.WM_P_T0, true), up: view.u8[POPS + a + MC.WM_P_UP], kind: view.u8[POPS + a + MC.WM_P_KIND], a });
    }
    holes.push({ i, x: f(f((i % G) * MC.WM_PITCH) + x0), z: f(f(Math.floor(i / G) * MC.WM_PITCH) + x0), pops });
  }
  const st = { tick, round, sig, G, nh, x0, npop, half: dv.getFloat32(L.PG_H + MC.WM_HALF, true), cx: dv.getFloat32(L.PG_CX, true), holes };
  CACHE.set(buf, st);
  return st;
}
// Hole h's pop on tick tp into play, as $wm_pop: the last whose heave has begun, or null.
export function popAt(h, tp) {
  let lo = 0, hi = h.pops.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (h.pops[mid].t0 - MC.WM_TELE <= tp) lo = mid + 1; else hi = mid; }
  return lo ? h.pops[lo - 1] : null;
}
// How far out of its hole pop p's mole is on tick tp into play, as $wm_lift (f32).
export function liftAt(p, tp) {
  let el = (tp - p.t0) | 0;
  if (el < 0) return 0;
  if (el < MC.WM_RISE) return f(el * KR);
  el -= MC.WM_RISE;
  if (el < p.up) return TOP;
  el -= p.up;
  if (el < MC.WM_DUCK) return f((MC.WM_DUCK - el) * KD);
  return 0;
}
// The same on a fractional clock, for drawing.
function liftSmooth(p, tp) {
  const el = tp - p.t0;
  if (el <= 0) return 0;
  if (el < MC.WM_RISE) return TOP * el / MC.WM_RISE;
  const d = el - MC.WM_RISE - p.up;
  if (d <= 0) return TOP;
  return d < MC.WM_DUCK ? TOP * (1 - d / MC.WM_DUCK) : 0;
}
// The confirmed world's word on pop p: whacked (by whom, when), or null.
export function whacked(view, p) {
  if (!view.u8[POPS + p.a + MC.WM_P_HIT]) return null;
  return { by: view.u8[POPS + p.a + MC.WM_P_BY], at: view.dv.getUint16(POPS + p.a + MC.WM_P_WT, true) };
}
// What a mole of kind k pays whacked on tick tp into play.
export const worth = (k, tp) => (k === MC.WM_KSPIKE ? -MC.WM_SPIKEV : (k === MC.WM_KGOLD ? MC.WM_GOLDV : 1) * (tp >= MC.WM_FRENZY ? 2 : 1));
// f32.nearest: to the nearest whole number, ties to even.
const even = (v) => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; };
// The hole nearest (x, z), as $wm_near.
export function nearest(st, x, z) {
  const k = (v) => Math.max(0, Math.min(st.G - 1, even(f(f(v - st.x0) * f(1 / MC.WM_PITCH)))));
  return st.holes[k(z) * st.G + k(x)];
}

// ---- drawing

const pending = new Map(); // `${hole}:${t0}` -> the confirmed tick by which your predicted whack should be back

function lawn(out, st) {
  const sc = out.scene, { cx, half, G, x0 } = st;
  const e = half + 0.25;
  // the earth under it, then the grass in stripes along the rows of holes (the outer two out to the fence)
  sc.box(cx, PLAT_Y - 2.2, cx, e, 2, e, 0, ...EARTH, LOOK.MATTE);
  sc.box(cx, PLAT_Y - 6, cx, e * 0.82, 2, e * 0.82, 0, 0.36, 0.26, 0.18, LOOK.MATTE);
  for (let j = 0; j < G; j++) {
    const z0 = j === 0 ? cx - e : x0 + (j - 0.5) * MC.WM_PITCH, z1 = j === G - 1 ? cx + e : x0 + (j + 0.5) * MC.WM_PITCH;
    sc.box(cx, PLAT_Y - 0.15, (z0 + z1) / 2, e, 0.15, (z1 - z0) / 2, 0, ...GRASS[j & 1], LOOK.MATTE);
  }
  // the picket fence: a post every 1.2 m or so, two rails
  const n = Math.max(4, Math.round((2 * half) / 1.2));
  const H = MC.WM_FENCEH;
  for (let s = 0; s < 4; s++) {
    const ax = s < 2, sg = s & 1 ? 1 : -1;
    for (let k = 0; k <= n; k++) {
      const u = -half + (2 * half * k) / n;
      const [x, z] = ax ? [cx + sg * (half + 0.1), cx + u] : [cx + u, cx + sg * (half + 0.1)];
      sc.box(x, PLAT_Y + H / 2, z, 0.07, H / 2, 0.07, 0, 0.96, 0.96, 0.93, LOOK.PLASTIC);
    }
    for (const y of [0.4, 0.95]) {
      if (ax) sc.box(cx + sg * (half + 0.18), PLAT_Y + y, cx, 0.03, 0.05, half, 0, 0.92, 0.92, 0.9, LOOK.PLASTIC);
      else sc.box(cx, PLAT_Y + y, cx + sg * (half + 0.18), half, 0.05, 0.03, 0, 0.92, 0.92, 0.9, LOOK.PLASTIC);
    }
  }
}

// A mole of kind k at (x, z) its head's top at y, facing (fx, fz); whacked squashed with stars over it.
function mole(out, x, y, z, k, fx, fz, dazed, now, seed) {
  const sc = out.scene;
  const col = k === MC.WM_KGOLD ? GOLDC : k === MC.WM_KSPIKE ? SPIKEC : FUR;
  const look = k === MC.WM_KGOLD ? LOOK.METAL : LOOK.MATTE;
  const sq = dazed ? 0.16 : 0; // how far a whacked head is squashed down
  const hy = y - HEAD - sq; // the head's centre
  const r = HEAD * (dazed ? 1.08 : 1);
  if (hy > PLAT_Y - 0.6) sc.cyl(x, Math.min(hy, PLAT_Y) - 0.35 + (hy - PLAT_Y) / 2, z, 0.36, Math.max(0.05, (hy - PLAT_Y) / 2 + 0.35), ...col, look);
  sc.sphere(x, hy, z, r, ...col, look);
  if (dazed) sc.cyl(x, hy + r * 0.55, z, r * 1.05, 0.06, ...col, look);
  const sx = -fz, sz = fx; // its right
  // the snout, the eyes (shut when whacked), the paws on the rim
  sc.sphere(x + fx * r * 0.92, hy - 0.04, z + fz * r * 0.92, 0.11, ...PINK, LOOK.PLASTIC);
  if (!dazed) for (const s of [-1, 1]) sc.sphere(x + fx * r * 0.78 + sx * s * 0.15, hy + 0.14, z + fz * r * 0.78 + sz * s * 0.15, 0.06, 0.05, 0.04, 0.05, LOOK.PLASTIC);
  else for (const s of [-1, 1]) sc.box(x + fx * r * 0.8 + sx * s * 0.15, hy + 0.12, z + fz * r * 0.8 + sz * s * 0.15, 0.07, 0.015, 0.015, Math.atan2(fx, fz), 0.05, 0.04, 0.05, LOOK.MATTE);
  if (y - PLAT_Y > 0.2) for (const s of [-1, 1]) sc.sphere(x + fx * 0.45 + sx * s * 0.32, PLAT_Y + 0.08, z + fz * 0.45 + sz * s * 0.32, 0.12, ...PINK, LOOK.MATTE);
  if (k === MC.WM_KGOLD) out.glow.push({ pos: [x, hy, z], size: 1.2 + 0.2 * Math.sin(now / 150 + seed), color: [1, 0.85, 0.35, 0.35], kind: SPRITE.FLASH, minpx: 1 });
  if (k === MC.WM_KSPIKE) {
    // red spikes round the crown, and a striped collar at the rim
    for (let s = 0; s < 7; s++) {
      const a = (s / 7) * 2 * Math.PI + seed;
      const ca = Math.cos(a), sa = Math.sin(a);
      sc.box(x + ca * r * 0.75, hy + r * 0.62, z + sa * r * 0.75, 0.05, 0.2, 0.05, -a, 0.95, 0.15, 0.1, LOOK.PLASTIC, 0, 0, 1, undefined, 0.6);
    }
    sc.box(x, hy + r + 0.08, z, 0.05, 0.2, 0.05, 0, 0.95, 0.15, 0.1, LOOK.PLASTIC);
    if (y - PLAT_Y > 0.15) sc.cyl(x, PLAT_Y + 0.05, z, 0.52, 0.05, 0.95, 0.75, 0.1, LOOK.HAZARD);
  }
  if (dazed) {
    for (let s = 0; s < 3; s++) {
      const a = now / 260 + (s * 2 * Math.PI) / 3;
      out.glow.push({ pos: [x + Math.cos(a) * 0.5, hy + r + 0.3, z + Math.sin(a) * 0.5], size: 0.22, color: [1, 0.92, 0.3, 1], kind: SPRITE.SPARK, minpx: 1.5 });
    }
  }
}

export default {
  id: L.MG_MOLE, key: 'mole', name: 'WHACK A MOLE',
  hint: 'HOP ONTO THE MOLES AS THEY POP UP  GOLD PAYS 3  SPIKES HURT',
  env: 'day',

  draw(view, ctx, out) {
    const st = stage(view);
    if (!(st.half > 0) || !st.G) return;
    const g = view.party();
    const now = ctx.now ?? 0;
    // on the prediction's clock, where your own ball is drawn
    const T = ctx.ptick ?? ctx.tick + (ctx.dt || 0) / TICK;
    const playing = g.state === L.H_PLAY;
    const tp = playing ? since(T, g.start) : -1e9;
    lawn(out, st);
    // your predicted ball standing on a head: that mole drawn whacked now
    const me = ctx.pme && !ctx.pme.out ? ctx.pme : null;
    for (const [key, until] of pending) if (view.tick > until) pending.delete(key);
    if (me && playing && me.ground && me.pos[1] > PLAT_Y + 0.05) {
      const h = nearest(st, me.pos[0], me.pos[2]);
      const p = popAt(h, Math.floor(tp));
      if (p && p.kind !== MC.WM_KSPIKE && liftAt(p, Math.floor(tp)) > 0 && Math.hypot(me.pos[0] - h.x, me.pos[2] - h.z) <= MC.WM_HEADR) pending.set(`${h.i}:${p.t0}`, Math.ceil(T) + 40);
    }
    const cam = ctx.cam || [st.cx, PLAT_Y + 30, st.cx - 40];
    const sc = out.scene;
    for (const h of st.holes) {
      // the dirt ring and the pit
      sc.cyl(h.x, PLAT_Y + 0.02, h.z, 0.98, 0.03, ...DIRT, LOOK.MATTE);
      sc.cyl(h.x, PLAT_Y + 0.035, h.z, 0.62, 0.03, 0.07, 0.05, 0.04, LOOK.MATTE);
      const p = popAt(h, Math.floor(tp));
      if (!p) continue;
      const el = tp - p.t0;
      const hit = el >= 0 && (whacked(view, p) || pending.has(`${h.i}:${p.t0}`));
      // a ring round the hole, its mole's colour, brightening through the heave, steady while it's up
      if (!hit && el < MC.WM_RISE + p.up + MC.WM_DUCK) {
        const k = el < 0 ? 1 + el / MC.WM_TELE : 1;
        const beat = el < 0 ? 0.5 + 0.5 * Math.sin(now / (60 + 90 * (1 - k))) : 1;
        out.decals.push({ pos: [h.x, PLAT_Y + 0.07, h.z], radius: 1.35, width: 0.22, color: [...RING[p.kind], 0.25 + 0.6 * k * beat], kind: DECAL.RING });
      }
      if (el < 0) {
        // the heave: a mound of dirt swelling and shaking, faster as it nears
        const k = 1 + el / MC.WM_TELE;
        const j = 0.05 * k * Math.sin(now / (30 + 40 * (1 - k)) + h.i);
        sc.sphere(h.x + j, PLAT_Y - 0.62 + 0.3 * k, h.z - j, 0.72, ...DIRT, LOOK.MATTE);
        for (let s = 0; s < 4; s++) {
          const a = h.i * 1.7 + s * 1.57, b = (now / 180 + s * 0.37 + h.i * 0.13) % 1;
          out.solid.push({ pos: [h.x + Math.cos(a) * (0.5 + 0.4 * b), PLAT_Y + 0.1 + k * 0.5 * Math.sin(Math.PI * b), h.z + Math.sin(a) * (0.5 + 0.4 * b)], size: 0.07, color: [0.4, 0.27, 0.15, 1], kind: SPRITE.CRUMB, minpx: 1, seed: h.i * 4 + s });
        }
        if (p.kind === MC.WM_KGOLD) out.glow.push({ pos: [h.x, PLAT_Y + 0.3 * k, h.z], size: 0.5 + 0.5 * k + 0.2 * Math.sin(now / 70), color: [1, 0.85, 0.3, 0.7], kind: SPRITE.SPARK, minpx: 1 });
        if (p.kind === MC.WM_KSPIKE) for (let s = 0; s < 5; s++) {
          const a = s * 1.2566 + h.i;
          sc.box(h.x + Math.cos(a) * 0.35, PLAT_Y - 0.15 + 0.3 * k, h.z + Math.sin(a) * 0.35, 0.05, 0.16, 0.05, 0, 0.95, 0.15, 0.1, LOOK.PLASTIC);
        }
        continue;
      }
      const y = liftSmooth(p, tp);
      if (y <= 0) continue;
      const dx = cam[0] - h.x, dz = cam[2] - h.z, dl = Math.hypot(dx, dz) || 1;
      mole(out, h.x, PLAT_Y + y, h.z, p.kind, dx / dl, dz / dl, hit && p.kind !== MC.WM_KSPIKE, now, h.i * 0.9);
    }
  },

  frame(view) {
    const st = stage(view);
    return { centre: [st.cx, PLAT_Y, st.cx], radius: st.half || view.party().size, shape: 'square' };
  },

  fx(f, ctx) {
    const mine = f.owner === ctx.slot;
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    if (f.kind === MC.WM_FX_POP) {
      if (d < 22) ctx.sound?.jump?.();
      if (f.size === MC.WM_KGOLD) ctx.glow?.({ pos: [f.pos[0], f.pos[1] + 0.6, f.pos[2]], size: 1.6, color: [1, 0.85, 0.3, 0.8], kind: SPRITE.RING, life: 350, grow: true });
      return;
    }
    if (f.kind === MC.WM_FX_WHACK) {
      if (f.size < 0) {
        ctx.glow?.({ pos: f.pos, size: 1.6, color: [1, 0.2, 0.15, 0.9], kind: SPRITE.FLASH, life: 350 });
        if (mine) { ctx.banner?.(`SPIKED  -${-f.size}`, C.RED, 1200); ctx.sound?.hurt?.(false); }
        return;
      }
      const big = f.size >= MC.WM_GOLDV;
      ctx.glow?.({ pos: f.pos, size: big ? 2.6 : 1.6, color: big ? [1, 0.85, 0.3, 0.9] : [1, 1, 0.8, 0.9], kind: SPRITE.RING, life: 380, grow: true });
      ctx.glow?.({ pos: f.pos, size: 0.9, color: [1, 0.95, 0.6, 1], kind: SPRITE.SPARK, life: 250 });
      if (mine || d < 25) ctx.sound?.melee?.(mine ? 0 : d);
      if (mine) {
        if (big) ctx.sound?.holed?.(); else ctx.sound?.kill?.();
        ctx.banner?.(big ? `GOLD MOLE  +${f.size}` : `WHACK  +${f.size}`, big ? C.YELLOW : C.GREEN, 700);
      } else if (big && d < 30) ctx.feed?.(`${ctx.name?.(f.owner) ?? `P${f.owner + 1}`} WHACKED A GOLD MOLE`, C.YELLOW);
      return;
    }
    if (f.kind === MC.WM_FX_SPIKE) {
      ctx.glow?.({ pos: f.pos, size: 1.4, color: [1, 0.25, 0.15, 0.9], kind: SPRITE.SPARK, life: 300 });
      if (mine || d < 25) ctx.sound?.boing?.(MC.WM_FLING, mine ? 0 : d);
      if (mine && f.shot < 0x100) ctx.banner?.('OUCH  SPIKES', C.ORANGE, 800);
      return;
    }
    if (f.kind === MC.WM_FX_CALL) {
      if (f.shot === 0) { ctx.banner?.('SPIKED MOLES!  DON\'T TOUCH THEM', C.ORANGE, 2200); ctx.sound?.count?.(1); }
      else if (f.shot === 1) { ctx.banner?.('FRENZY!  DOUBLE POINTS', C.YELLOW, 2200); ctx.sound?.holed?.(); }
    }
  },

  // your points and place, the frenzy and the spikes on the clock
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const tp = typeof ctx.t === 'number' && ctx.t > 0 ? ctx.t / TICK : g.t;
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (me?.live) {
      let place = 1, n = 0;
      for (let p = 0; p < L.NPLAYER; p++) {
        const a = L.PLAYERS + p * L.PSIZE;
        if (!(view.u8[a + L.P_FL] & L.PF_LIVE)) continue;
        n++;
        if (view.dv.getUint16(a + L.PG_SCORE, true) > me.score) place++;
      }
      ctx.right(3, `${me.score} ${me.score === 1 ? 'POINT' : 'POINTS'}  ${ordinal(place)} OF ${n}`, place === 1 ? C.GREEN : C.WHITE);
    }
    if (tp >= MC.WM_FRENZY) ctx.right(4, 'FRENZY  DOUBLE POINTS', Math.floor(ctx.now / 250) % 2 ? C.ORANGE : C.YELLOW);
    else ctx.right(4, `FRENZY IN ${Math.ceil((MC.WM_FRENZY - tp) * TICK)}`, C.GREY);
    if (tp < MC.WM_SPIKE - MC.WM_TELE) ctx.right(5, `SPIKED MOLES IN ${Math.ceil((MC.WM_SPIKE - MC.WM_TELE - tp) * TICK)}`, C.GREY);
  },

  brain: {
    // past the fence is the sea; on that tick a mole whose heave it has seen,
    // out or about to rise, is a post to go round, a spiked one a thing to
    // keep well clear of
    danger(view, x, z, tick) {
      const st = stage(view);
      const g = view.party();
      if (Math.abs(x - st.cx) > st.half - 0.5 || Math.abs(z - st.cx) > st.half - 0.5) return 0.4;
      const tp = ((tick ?? view.tick) - g.start) | 0;
      const h = nearest(st, x, z);
      const p = popAt(h, (view.tick - g.start) | 0);
      if (!p || tp >= p.t0 + MC.WM_RISE + p.up + MC.WM_DUCK) return 0;
      const d = Math.hypot(x - h.x, z - h.z);
      if (p.kind === MC.WM_KSPIKE) return d < MC.WM_MR + 2 ? 1 : d < MC.WM_MR + 3 ? 0.4 : 0;
      return tp + 20 >= p.t0 && d < MC.WM_MR + 1.1 ? 0.3 : 0;
    },
    goal(view, me, bot) {
      const p = plan(view, me, bot);
      return p ? p.goal : null;
    },
    hop() { return false; },
    // The whole word: the mole it goes for, rolled at so as to come down on
    // its head while it's up, the hop timed off where the ball would land;
    // in the air, steered onto the head; round the posts on the way.
    think(view, me, bot, tick) {
      const p = plan(view, me, bot, tick);
      return p ? p.word : null;
    },
  },
};

// ---- the AI ball

const MINDS = new WeakMap();
function mindOf(bot) {
  if (!bot || typeof bot !== 'object') return {};
  if (bot.mem) return (bot.mem.wm ||= {});
  let m = MINDS.get(bot);
  if (!m) MINDS.set(bot, (m = {}));
  return m;
}
const N = (k) => f(Number(L.BPHYS[k]));
const AIR = N('B_AIR_DT'), AIR_DRAG = N('B_AIR_DRAG');
const VMAX = 9.4; // m/s a ball rolls at, about, keys held
const REACH = 18; // m round it a ball looks for moles
const len = (x, z) => Math.sqrt(x * x + z * z);
// n ticks of v = wish * a + v * d from (x, v), as bumper's roll: where it is and how fast.
function roll(x, v, wish, a, d, n) {
  const dn = d ** n;
  const s = d * (1 - dn) / (1 - d);
  const k = wish * a / (1 - d);
  return [x + TICK * (v * s + k * (n - s)), v * dn + k * (1 - dn)];
}
// Ticks a hop off the lawn (bottom y0 m over it, rising vy) takes to come down through height top.
function airTicks(y0, vy, top) {
  let y = y0, v = vy;
  for (let n = 1; n < 240; n++) {
    v -= 0.16;
    y += v * TICK;
    if (v < 0 && y <= top) return n;
  }
  return 240;
}
const HOP_N = airTicks(0, 6, MC.WM_TOP); // a hop off the lawn onto a head: about 61 ticks
// How far a hop at v m/s carries the ball before it comes down on a head, pushing on all the way: HOP_A v + HOP_B.
const HOP_A = roll(0, 1, 0, AIR, AIR_DRAG, HOP_N)[0], HOP_B = roll(0, 0, 1, AIR, AIR_DRAG, HOP_N)[0];
// Ticks till a ball d m from a head, rolling at v0 toward it (vp across), could
// hop onto it, pushing flat out (a push of acc a tick, drag dr): the first n,
// by 4s, from which the hop reaches it; far more if it's already too close for
// its speed and has to back off first.
function hopIn(d, v0, vp, acc, dr) {
  if (d < HOP_A * Math.max(0, v0) + HOP_B - 0.6) return 125;
  const k = acc / (1 - dr), d4 = dr ** 4;
  for (let n = 0, dn = 1; n <= 320; n += 4, dn *= d4) {
    const s = dr * (1 - dn) / (1 - dr);
    if (TICK * (v0 * s + k * (n - s)) + HOP_A * (v0 * dn + k * (1 - dn)) + HOP_B >= d) return n + Math.abs(vp) * 6;
  }
  return 1e9;
}

// Every ball in (by slot too), and for every hole the three nearest of them,
// once a world tick.
function fieldOf(view, st) {
  if (view._wmf?.tick === view.tick && view._wmf.st === st) return view._wmf;
  const balls = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const a = L.PLAYERS + p * L.PSIZE;
    if ((view.u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    balls.push({ slot: p, x: view.dv.getFloat32(a + L.P_PX, true), z: view.dv.getFloat32(a + L.P_PZ, true), vx: view.dv.getFloat32(a + L.P_VX, true), vz: view.dv.getFloat32(a + L.P_VZ, true),
      air: !(view.u8[a + L.P_FL] & L.PF_GROUND) });
  }
  // per hole: [d0, d1, d2, s0, s1, s2], the three nearest within two holes of it
  const near = new Float64Array(st.nh * 6).fill(1e9);
  const span = 2;
  for (const b of balls) {
    const ci = Math.round((b.x - st.x0) / MC.WM_PITCH), cj = Math.round((b.z - st.x0) / MC.WM_PITCH);
    for (let j = Math.max(0, cj - span); j <= Math.min(st.G - 1, cj + span); j++) {
      for (let i = Math.max(0, ci - span); i <= Math.min(st.G - 1, ci + span); i++) {
        const h = st.holes[j * st.G + i], o = h.i * 6;
        const d = len(b.x - h.x, b.z - h.z);
        if (d >= near[o + 2]) continue;
        let k = 2;
        while (k > 0 && near[o + k - 1] > d) { near[o + k] = near[o + k - 1]; near[o + 3 + k] = near[o + 3 + k - 1]; k--; }
        near[o + k] = d; near[o + 3 + k] = b.slot;
      }
    }
  }
  const bySlot = [];
  for (const b of balls) bySlot[b.slot] = b;
  view._wmf = { tick: view.tick, st, balls, bySlot, near };
  return view._wmf;
}

// How much pop key favours slot s over the others as near it: a draw of the two.
const favour = (s, key) => Math.imul((s + 1) * 0x9e3779b1 ^ key, 0x85ebca6b) >>> 0;

// Is the way from (x, z) to where a hop comes down (lx, lz) clear of every
// rival in (none of them within a ball's width of it, but by the landing,
// where the planner already ruled out one nearer)?
function clear(fld, slot, x, z, lx, lz) {
  const ux = lx - x, uz = lz - z, l2 = ux * ux + uz * uz || 1;
  for (const b of fld.balls) {
    if (b.slot === slot) continue;
    const t = ((b.x - x) * ux + (b.z - z) * uz) / l2;
    if (t < 0.15 || t > 0.85) continue;
    const ex = b.x - x - ux * t, ez = b.z - z - uz * t;
    if (ex * ex + ez * ez < 3.2) return false;
  }
  return true;
}

// The mole the ball goes for and the word that gets it there: every mole
// whose heave it has seen within REACH (0.14 s after it starts for a skilled
// ball, 0.38 s for a clumsy one), not whacked, not spiked, that it can
// come down on before it ducks; worth over the time till it would land,
// less for every rival nearer it; the one it's after kept unless another is
// clearly better. Then: on the ground, flat out at it once that would bring
// it down on the head no sooner than just after it's up (till then waiting,
// edging in to a run-up's length, or backing off if too near to get up
// speed), hopping once where the hop would come down is on the head while
// it's up and nobody is in the way; in the air, the push that brings where it
// comes down onto the head; posts and spikes on the way steered round; with
// nothing to go for, by a hole nobody else is by. { goal [x, z], word } or null.
function plan(view, me, bot, tick) {
  const slot = typeof me === 'number' ? me : me?.slot;
  const g = view.party();
  if (g.state !== L.H_PLAY || !(slot >= 0)) return null;
  const st = stage(view);
  if (!st.G) return null;
  const rec = L.PLAYERS + slot * L.PSIZE;
  if ((view.u8[rec + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) return null;
  const mind = mindOf(bot);
  const at = tick ?? bot?.at ?? view.tick;
  if (mind.at === at && mind.round === g.round && mind.plan) return mind.plan;
  const tpv = (view.tick - g.start) | 0; // what it can see
  const tp = (at - g.start) | 0; // when its word lands
  const skill = bot?.skill ?? 0.6;
  if (mind.round !== g.round) { mind.round = g.round; mind.done = new Set(); mind.land = -1; mind.hopTick = -1; mind.target = null; mind.hopKey = null; }
  // Where it will be on tick at: what it sees rolled on with its last word,
  // and the hop it has sent if the world hasn't seen it yet; in the air, when
  // it comes down, from how high it is and how fast it rises.
  const b = view.partier(slot);
  const acc = Number(L.BPHYS.B_ACC_DT) * g.acc, dr = g.drag;
  const lastMove = bot?.move ? 1 : 0, lastYaw = ((bot?.yaw ?? 0) / 16384) * 2 * Math.PI;
  const cw = Math.cos(lastYaw) * lastMove, sw = Math.sin(lastYaw) * lastMove;
  let x0 = b.pos[0], z0 = b.pos[2], vx = b.vel[0], vz = b.vel[2], land = -1;
  const on = (n, a, d) => { [x0, vx] = roll(x0, vx, cw, a, d, n); [z0, vz] = roll(z0, vz, sw, a, d, n); };
  const n0 = Math.max(0, Math.min(40, at - view.tick));
  if (b.ground && mind.hopTick >= view.tick && mind.hopTick <= at) {
    on(mind.hopTick - view.tick, acc * lastMove, lastMove ? dr : g.idle);
    on(at - mind.hopTick, AIR * lastMove, AIR_DRAG);
    land = mind.land;
  } else if (!b.ground) {
    const top = mind.hopKey && at <= mind.land + 8 ? MC.WM_TOP : 0;
    land = view.tick + airTicks(b.pos[1] - PLAT_Y, b.vel[1], top);
    on(n0, AIR * lastMove, AIR_DRAG);
  } else on(n0, acc * lastMove, lastMove ? dr : g.idle);
  const air = land > at;
  const sp = len(vx, vz);
  const fld = fieldOf(view, st);
  // the hop it took has come down: whatever it was after, it has had its go
  if (!air && mind.hopKey && at >= mind.land) { mind.done.add(mind.hopKey); mind.hopKey = null; }

  // ---- what to go for
  let best = null;
  const span = Math.ceil(REACH / MC.WM_PITCH);
  const ci = Math.round((x0 - st.x0) / MC.WM_PITCH), cj = Math.round((z0 - st.x0) / MC.WM_PITCH);
  const slow = (0.03 + 0.12 * (1 - skill)) / TICK;
  const react = Math.round((0.1 + 0.4 * (1 - skill)) / TICK); // ticks before it sees a heave for what it is
  for (let j = Math.max(0, cj - span); j <= Math.min(st.G - 1, cj + span); j++) {
    for (let i = Math.max(0, ci - span); i <= Math.min(st.G - 1, ci + span); i++) {
      const h = st.holes[j * st.G + i];
      const p = popAt(h, tpv - react);
      if (!p || p.kind === MC.WM_KSPIKE) continue;
      const w0 = p.t0 + MC.WM_RISE + 2, w1 = p.t0 + MC.WM_RISE + p.up - 4;
      if (tp + HOP_N > w1) continue;
      const key = h.i * 65536 + p.t0;
      if (mind.done.has(key) || whacked(view, p)) continue;
      const d = len(h.x - x0, h.z - z0);
      if (d > REACH) continue;
      // the soonest it could land on it, flat out (a clumsy ball a little later)
      const ux = d > 1e-6 ? (h.x - x0) / d : 1, uz = d > 1e-6 ? (h.z - z0) / d : 0;
      const va = vx * ux + vz * uz, vp = vz * ux - vx * uz;
      const go = hopIn(d, va, vp, acc, dr);
      const land = tp + go + HOP_N;
      if (land > w1) continue;
      if (land + slow > w1 && key !== mind.target) continue;
      const wait = Math.max(land, w0) - tp;
      let k = Math.max(1, worth(p.kind, p.t0)) / (wait * TICK + 0.35);
      // rivals nearer it than this ball: one already by it will be on its head first
      // (once its head is up, only one that's on its way: rolling at it, or in the air)
      const up = tpv >= p.t0 + MC.WM_RISE;
      const going = (rs) => { const r = fld.bySlot[rs]; return !up || (r && (r.air || (r.vx * (h.x - r.x) + r.vz * (h.z - r.z)) > len(h.x - r.x, h.z - r.z))); };
      let nearer = 0, by = false;
      for (let q = 0; q < 3; q++) if (fld.near[h.i * 6 + 3 + q] !== slot && fld.near[h.i * 6 + q] < Math.min(2.3, d - 0.3) && going(fld.near[h.i * 6 + 3 + q])) by = true;
      if (by) continue;
      // (as near, give or take half a metre: the one the pop favours, a draw by
      // slot and pop); one ahead of it within a run-up's reach takes it, so two
      // don't meet over its head
      let ahead = false;
      for (let q = 0; q < 3; q++) {
        const rs = fld.near[h.i * 6 + 3 + q], rd = fld.near[h.i * 6 + q];
        if (rs === slot || !(rd < d - 0.5 || (rd < d + 0.5 && favour(rs, key) > favour(slot, key))) || !going(rs)) continue;
        nearer += rd < 4 ? 2 : 1;
        if (rd < 5) ahead = true;
      }
      if (ahead) continue;
      k /= 1 + 2.5 * nearer;
      if (key === mind.target) k *= 1.4 + 0.4 * (1 - skill);
      if (!best || k > best.k) best = { k, h, p, key, w0, w1, d, go };
    }
  }
  mind.target = best?.key ?? null;

  // ---- how
  let goal, wx = 0, wz = 0, hop = 0, move = 1;
  if (air) {
    // in the air: push where it would come down onto the head it hopped for (thrown, it lets it fly)
    const T = mind.hopKey ? mind.hopAt : null;
    goal = T ? [T.x, T.z] : [x0, z0];
    const n = land - at;
    const lx = roll(x0, vx, 0, AIR, AIR_DRAG, n)[0], lz = roll(z0, vz, 0, AIR, AIR_DRAG, n)[0];
    const ex = goal[0] - lx, ez = goal[1] - lz, e = len(ex, ez);
    if (!T || e < 0.08 + 0.1 * (1 - skill)) move = 0;
    else { wx = ex / e; wz = ez / e; }
  } else if (best) {
    const { h, key, w0, w1, d, go } = best;
    goal = [h.x, h.z];
    const ux = d > 1e-6 ? (h.x - x0) / d : 1, uz = d > 1e-6 ? (h.z - z0) / d : 0;
    // a hop now: where it would come down, pushing at the head all the way
    const lx = roll(x0, vx, ux, AIR, AIR_DRAG, HOP_N)[0], lz = roll(z0, vz, uz, AIR, AIR_DRAG, HOP_N)[0];
    const miss = len(h.x - lx, h.z - lz);
    const landAt = tp + HOP_N;
    const tol = 0.3 + 0.2 * (1 - skill);
    let vd;
    if (miss < tol && landAt >= w0 && landAt <= w1 && clear(fld, slot, x0, z0, lx, lz)) {
      hop = 1;
      mind.hopTick = at;
      mind.land = at + HOP_N;
      mind.hopAt = { x: h.x, z: h.z };
      mind.hopKey = key;
      vd = sp;
    } else {
      // too near to get up speed for a hop (and not rolling in): back off; going now would come down
      // before the head is up: wait, edging in to a run-up's length; else flat out
      if (mind.back && d > 2.8) mind.back = false;
      const va = vx * ux + vz * uz;
      if (d < 1.7 || (d < 2.1 && va < 1)) mind.back = true;
      const early = w0 + 6 - (tp + go + HOP_N);
      if (mind.back) vd = -3;
      else if (early > 4) vd = d > 5 ? Math.min(4, (d - 4.5) * 1.2) : 0;
      else vd = VMAX + 1;
    }
    wx = ux * vd; wz = uz * vd;
  } else {
    // nothing to go for: a run-up's length off a hole near it that no rival
    // is nearer (one within 3.2 m has it), fewest others by (the crowd
    // spreads over the lawn) and no spiked mole coming up, keeping to the one
    // it chose unless another is clearly better; still once there
    const ci0 = Math.round((x0 - st.x0) / MC.WM_PITCH), cj0 = Math.round((z0 - st.x0) / MC.WM_PITCH);
    let pick = null;
    for (let j = Math.max(0, cj0 - 2); j <= Math.min(st.G - 1, cj0 + 2); j++) {
      for (let i = Math.max(0, ci0 - 2); i <= Math.min(st.G - 1, ci0 + 2); i++) {
        const h = st.holes[j * st.G + i];
        let k = len(h.x - x0, h.z - z0) / MC.WM_PITCH - (h.i === mind.idle ? 0.75 : 0);
        const sp0 = popAt(h, tpv);
        if (sp0 && sp0.kind === MC.WM_KSPIKE && tp < sp0.t0 + MC.WM_RISE + sp0.up + MC.WM_DUCK) k += 5;
        for (let q = 0; q < 3; q++) {
          const rd = fld.near[h.i * 6 + q];
          if (fld.near[h.i * 6 + 3 + q] !== slot) k += rd < 3.2 ? 3 : rd < 5 ? 1 : 0;
        }
        if (!pick || k < pick.k) pick = { k, h, dh: len(h.x - x0, h.z - z0) };
      }
    }
    const { h, dh } = pick;
    mind.idle = h.i;
    goal = dh > 1e-6 ? [h.x + ((x0 - h.x) / dh) * 2.8, h.z + ((z0 - h.z) / dh) * 2.8] : [h.x + 2.8, h.z];
    // already a run-up off one, alone by it: where it is will do
    if (pick.k < 0.25 && dh > 2 && dh < 4.5) goal = [x0, z0];
    // and never inside the berth it gives a spiked mole coming up
    const gi = Math.round((goal[0] - st.x0) / MC.WM_PITCH), gj = Math.round((goal[1] - st.x0) / MC.WM_PITCH);
    for (let j = Math.max(0, gj - 1); j <= Math.min(st.G - 1, gj + 1); j++) {
      for (let i = Math.max(0, gi - 1); i <= Math.min(st.G - 1, gi + 1); i++) {
        const s2 = st.holes[j * st.G + i], p2 = popAt(s2, tpv);
        if (!p2 || p2.kind !== MC.WM_KSPIKE || tp >= p2.t0 + MC.WM_RISE + p2.up + MC.WM_DUCK) continue;
        const gx = goal[0] - s2.x, gz = goal[1] - s2.z, gd = len(gx, gz);
        if (gd < 3.3) goal = gd > 1e-6 ? [s2.x + (gx / gd) * 3.3, s2.z + (gz / gd) * 3.3] : [s2.x + 3.3, s2.z];
      }
    }
    // (there once where it's seen is within a metre: its reckoning rolled on with its last push would dither)
    const ex = goal[0] - x0, ez = goal[1] - z0, e = len(ex, ez);
    if (e > 0.8 && len(goal[0] - b.pos[0], goal[1] - b.pos[2]) > 1) { const vd = Math.min(4, e); wx = (ex / e) * vd; wz = (ez / e) * vd; }
  }
  let yaw;
  if (!air) {
    // round the posts (out or about to rise) and well clear of spikes (from
    // their heave on): pushed off any near where it will be in a quarter second
    const ax = x0 + vx * 0.25, az = z0 + vz * 0.25;
    const ni = Math.round((ax - st.x0) / MC.WM_PITCH), nj = Math.round((az - st.x0) / MC.WM_PITCH);
    for (let j = Math.max(0, nj - 1); j <= Math.min(st.G - 1, nj + 1); j++) {
      for (let i = Math.max(0, ni - 1); i <= Math.min(st.G - 1, ni + 1); i++) {
        const h = st.holes[j * st.G + i];
        if (best && h === best.h && !hop) continue;
        const p = popAt(h, tpv);
        if (!p || tp >= p.t0 + MC.WM_RISE + p.up + MC.WM_DUCK) continue;
        const spike = p.kind === MC.WM_KSPIKE;
        if (!spike && tp + 25 < p.t0) continue;
        const r = spike ? MC.WM_MR + 2.4 : MC.WM_MR + 1.6;
        const ex = ax - h.x, ez = az - h.z, e = len(ex, ez);
        if (e >= r || e < 1e-6) continue;
        const k = (r - e) * (spike ? 6 : 3.5);
        wx += (ex / e) * k; wz += (ez / e) * k;
      }
    }
    // and off the fence
    const lim = st.half - 1.6;
    if (ax - st.cx > lim) wx -= (ax - st.cx - lim) * 4;
    if (st.cx - ax > lim) wx += (st.cx - ax - lim) * 4;
    if (az - st.cx > lim) wz -= (az - st.cx - lim) * 4;
    if (st.cx - az > lim) wz += (st.cx - az - lim) * 4;
    // keys for that velocity: toward the difference, or none (the brake) once
    // it's going faster than that, or wants to be still
    const ex = wx - vx, ez = wz - vz, e = len(ex, ez), want = len(wx, wz);
    if (want < 0.5) { move = 0; yaw = Math.atan2(vz, vx); }
    else if (e < 0.7) {
      if (sp > want + 0.3) move = 0;
      yaw = Math.atan2(wz, wx);
    } else yaw = Math.atan2(ez, ex);
  } else yaw = move ? Math.atan2(wz, wx) : Math.atan2(vz, vx);
  if (!Number.isFinite(yaw)) yaw = 0;
  mind.at = at;
  mind.plan = { goal, word: { yaw, move, hop, use: 0 }, target: best ? best.h.i : -1 };
  return mind.plan;
}
