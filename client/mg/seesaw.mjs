// SEESAWS, as drawn and as the AI ball sees it. Each plank is a long box of
// boards turned by the renderer's roll to its slope, on a steel wedge atop a
// steel post out of the sea. Over it, while its slope is changing, a glowing
// ghost of the plank 1.6 s on (orange, red at a hard tip), and a stepped
// arrowhead on it pointing to the end going down: the slope the sim has
// already written (src/mg/seesaw.wat's ring, SS_LAG ahead), so what's coming
// is what will be. A cut's ends or sides glow red and flash through its
// warning, then fall away; a plank dropping flashes red for its 3 s, then
// falls into the sea. Every slope, cut and drop is read from the sim's own
// PG_S and PG_BIG and the planks found as $ss_at finds them, in f32, so what
// is drawn and what the bots steer by is what the sim does.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/seesaw.mjs'; // SS_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE } from '../party-render.mjs';
import { C } from '../font.mjs';

const f = Math.fround;
const TICK = 0.008;
const HY = 0.22; // a plank's half thickness, m
const GHOST = 200; // ticks on the ghost shows (1.6 s)
const FALL = 1.6; // s a dropped plank or a cut piece is drawn falling
const SX = f(MC.SS_SX), SZ = f(MC.SS_SZ);
const PL = f(MC.SS_PL), PW = f(MC.SS_PW), PL_CUT = f(MC.SS_PL * MC.SS_CUTL), PW_CUT = f(MC.SS_PW * MC.SS_CUTW);
const SHIFT = Math.log2(MC.SS_RING);
const STEEL = [0.55, 0.58, 0.62];
const WOODS = [[0.78, 0.55, 0.33], [0.7, 0.48, 0.28], [0.84, 0.62, 0.38]];
// f32.nearest: ties to even
const nearest = (v) => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; };

// ---- the field, as the sim lays it out and finds a point on it

const memo = new WeakMap();
// The planks on the view's bank: the header (PG_H, fixed at setup), each
// plank's cut and drop (PG_S, the confirmed world's), read once a tick; and
// the confirmed world's clock, which says how far its rings run.
export function stage(view, fresh = false) {
  const dv = view.dv, o = view.bank || 0;
  const u = (a) => dv.getUint32(a + o, true);
  const tick = u(L.HDR_TICK), ctick = dv.getUint32(L.HDR_TICK, true), cstart = dv.getUint32(L.HDR_START, true);
  let byBank = memo.get(dv.buffer);
  if (!byBank) memo.set(dv.buffer, (byBank = new Map()));
  const old = byBank.get(o);
  if (!fresh && old && old.tick === tick && old.ctick === ctick && old.cstart === cstart && old.hole === u(L.HDR_HOLE)) return old;
  const K = Math.min(MC.SS_KMAX, u(L.PG_H + MC.SS_K)), cols = u(L.PG_H + MC.SS_COLS), rows = u(L.PG_H + MC.SS_ROWS);
  const x0 = dv.getFloat32(L.PG_H + MC.SS_X0 + o, true), z0 = dv.getFloat32(L.PG_H + MC.SS_Z0 + o, true);
  const planks = [];
  for (let k = 0; k < K && cols > 0; k++) {
    const a = L.PG_S + MC.SS_PLANKS + k * MC.SS_PSIZE, c = k % cols, r = (k / cols) | 0;
    planks.push({ k, c, r, x: f(f(c * SX) + x0), z: f(f(r * SZ) + z0), cut: dv.getUint32(a + MC.SS_P_CUT, true), drop: dv.getUint32(a + MC.SS_P_DROP, true),
      kind: dv.getUint8(a + MC.SS_P_KIND), n: dv.getUint16(a + MC.SS_P_N, true), seed: k * 37 + 5 });
  }
  const cstate = dv.getUint32(L.HDR_STATE, true);
  const st = {
    tick, ctick, cstart, hole: u(L.HDR_HOLE), K, cols, rows, x0, z0, planks, dv,
    state: u(L.HDR_STATE), start: u(L.HDR_START), until: u(L.HDR_UNTIL), cx: dv.getFloat32(L.PG_CX + o, true),
    keep: u(L.PG_H + MC.SS_KEEP),
    // the next tick into play the confirmed world steps: its rings run to tc + SS_LAG - 1
    tc: cstate >= L.H_PLAY ? (ctick - cstart) | 0 : 0,
  };
  byBank.set(o, st);
  return st;
}
// Is plank p standing on tick t into play?
export const standing = (p, t) => !p.drop || t < p.drop;
// Its half-width and half-length on tick t: [hw, hl].
export function dims(p, t) {
  if (p.cut && t >= p.cut) return p.kind === MC.SS_K_SHORT ? [PW, PL_CUT] : [PW_CUT, PL];
  return [PW, PL];
}
// $ss_at: the plank under (x, z) on tick t into play and how far along it
// from the pivot (toward +z), [k, dz]; [-1, 0] over a gap, off the field,
// or where it has been cut back or dropped by then.
export function at(st, x, z, t) {
  if (!st.cols) return [-1, 0];
  const c = nearest(f(f(x - st.x0) / SX)), r = nearest(f(f(z - st.z0) / SZ));
  if (c < 0 || c >= st.cols || r < 0 || r >= st.rows) return [-1, 0];
  const p = st.planks[r * st.cols + c];
  if (!p || !standing(p, t)) return [-1, 0];
  const [hw, hl] = dims(p, t), dx = f(x - p.x), dz = f(z - p.z);
  if (Math.abs(dx) > hw || Math.abs(dz) > hl) return [-1, 0];
  return [p.k, dz];
}
// The last tick into play whose slope the confirmed world has written, and the first still in the ring.
const known = (st) => st.tc + MC.SS_LAG - 1;
const kept = (st) => Math.max(0, st.tc + MC.SS_LAG - MC.SS_RING);
// Plank k's slope on tick t into play (its top falls g a metre toward +z), from its ring: a tick past what's
// written reads the last written, one before the ring the first in it.
export function slopeAt(st, k, t) {
  if (st.state < L.H_PLAY && st.tc <= 0) return 0;
  const i = Math.max(kept(st), Math.min(known(st), t | 0));
  return st.dv.getFloat32(L.PG_BIG + MC.SS_SLOPES + 4 * ((k << SHIFT) | (i & (MC.SS_RING - 1))), true);
}
// The slope at a fractional tick, between its two (drawing).
function slopeSmooth(st, k, t) {
  const i = Math.floor(t), a = slopeAt(st, k, i), b = slopeAt(st, k, i + 1);
  return a + (b - a) * (t - i);
}
// $ss_top: the top of a plank sloping g at dz along it.
export const topAt = (g, dz) => f(f(PLAT_Y) - f(g * dz));
// A slope in degrees, rounded.
export const degOf = (g) => Math.round(Math.atan(Math.abs(g)) * 180 / Math.PI);
// The steepest slope plank k comes to from tick t to as far as is written (at most 2.05 s on), and its tick.
export function steepest(st, k, t) {
  let best = slopeAt(st, k, t), when = t;
  for (let i = t + 8, end = Math.min(known(st), t + MC.SS_LAG); i <= end; i += 8) {
    const g = slopeAt(st, k, i);
    if (Math.abs(g) > Math.abs(best)) { best = g; when = i; }
  }
  return [best, when];
}
// Planks standing on tick t.
export const left = (st, t) => st.planks.reduce((n, p) => n + standing(p, t), 0);

// Ticks into play, fractional, on the given clock (the prediction's when drawing), held at the end through the result.
function playT(st, tick) {
  if (st.state !== L.H_PLAY && st.state !== L.H_OVER) return 0;
  const i = Math.floor(tick);
  let t = ((i - st.start) | 0) + tick - i;
  if (st.state === L.H_OVER) t = Math.min(t, (st.until - L.P_OVER - st.start) | 0);
  return Math.max(0, t);
}

// ---- drawing

// A box lying in a plank sloping g (roll atan g, yaw 0): at plan (px, pz) from the pivot (x, z), plan half
// extents (ex, ez), its centre ly over the top along the plank's up, dy more in the world's y, half height hy.
function pbox(sc, x, z, g, px, pz, ex, ez, ly, hy, rgb, look, a = 0, b = 0, alpha = 1, seed = 0, dy = 0, roll = 0) {
  const r = Math.atan(g), c = Math.cos(r), s = Math.sin(r);
  const lz = pz / c;
  // local (y up, z along) to the world: y' = c y - s z, z' = s y + c z
  const wy = c * ly - s * lz, wz = s * ly + c * lz;
  sc.box(x + px, PLAT_Y + wy + dy, z + wz, ex, hy, ez / c, 0, rgb[0], rgb[1], rgb[2], look, a, b, alpha, seed, r + roll);
}

function plank(sc, st, p, t, now) {
  const ti = Math.floor(t);
  const blink = 0.5 + 0.5 * Math.sin(now * 14);
  // a plank that has dropped falls away into the sea, tumbling
  if (!standing(p, ti)) {
    const a = (t - p.drop) * TICK;
    if (a < FALL) {
      const g = slopeAt(st, p.k, p.drop), [hw, hl] = dims(p, p.drop);
      pbox(sc, p.x, p.z, g, 0, 0, hw, hl, -HY, HY, WOODS[p.k % 3], LOOK.WOOD, 0, 0, 1 - a / FALL, p.seed, -13 * a * a, 0.9 * a * (p.k & 1 ? 1 : -1));
    }
    return;
  }
  const g = slopeSmooth(st, p.k, t);
  const [hw, hl] = dims(p, ti);
  const warnDrop = p.drop && ti >= p.drop - MC.SS_DROPWARN;
  const warnCut = p.cut && ti < p.cut && ti >= p.cut - MC.SS_CUTWARN;
  const wood = WOODS[p.k % 3];
  if (warnDrop) {
    // the whole plank flashes red, faster as it nears
    const w = (ti - (p.drop - MC.SS_DROPWARN)) / MC.SS_DROPWARN, on = Math.sin(now * (8 + 24 * w)) > 0;
    pbox(sc, p.x, p.z, g, 0, 0, hw, hl, -HY, HY, on ? [1, 0.2, 0.12] : wood, on ? LOOK.GLOW : LOOK.WOOD, on ? 0.9 : 0, on ? 0.4 : 0, 1, p.seed);
  } else if (warnCut) {
    // what stays, in wood; what goes, glowing red and flashing
    const short = p.kind === MC.SS_K_SHORT, [kw, kl] = short ? [PW, PL_CUT] : [PW_CUT, PL];
    pbox(sc, p.x, p.z, g, 0, 0, kw, kl, -HY, HY, wood, LOOK.WOOD, 0, 0, 1, p.seed);
    const red = [1, 0.25, 0.12], lit = 0.4 + 0.9 * blink;
    for (const sgn of [-1, 1]) {
      if (short) pbox(sc, p.x, p.z, g, 0, sgn * (PL + PL_CUT) / 2, PW, (PL - PL_CUT) / 2, -HY, HY * 0.98, red, LOOK.GLOW, lit, 0.4, 1, p.seed + 1);
      else pbox(sc, p.x, p.z, g, sgn * (PW + PW_CUT) / 2, 0, (PW - PW_CUT) / 2, PL, -HY, HY * 0.98, red, LOOK.GLOW, lit, 0.4, 1, p.seed + 1);
    }
  } else {
    pbox(sc, p.x, p.z, g, 0, 0, hw, hl, -HY, HY, wood, LOOK.WOOD, 0, 0, 1, p.seed);
  }
  // a cut's pieces falling away just after it
  if (p.cut && ti >= p.cut && (t - p.cut) * TICK < FALL) {
    const a = (t - p.cut) * TICK, gc = slopeAt(st, p.k, p.cut), short = p.kind === MC.SS_K_SHORT;
    for (const sgn of [-1, 1]) {
      if (short) pbox(sc, p.x, p.z, gc, 0, sgn * ((PL + PL_CUT) / 2 + a * 1.5), PW, (PL - PL_CUT) / 2, -HY, HY, wood, LOOK.WOOD, 0, 0, 1 - a / FALL, p.seed + 2, -13 * a * a, sgn * a);
      else pbox(sc, p.x, p.z, gc, sgn * ((PW + PW_CUT) / 2 + a * 1.5), 0, (PW - PW_CUT) / 2, PL, -HY, HY, wood, LOOK.WOOD, 0, 0, 1 - a / FALL, p.seed + 2, -13 * a * a);
    }
  }
  // the ghost: the slope 1.6 s on, while it's changing; a chevron glowing at the end going down
  const gf = slopeAt(st, p.k, ti + GHOST);
  if (Math.abs(gf - g) > 0.035) {
    const hard = Math.abs(gf) >= MC.SS_GHARD;
    const col = hard ? [1, 0.18, 0.1] : [1, 0.62, 0.15];
    pbox(sc, p.x, p.z, gf, 0, 0, hw * 0.98, hl, 0.05, 0.05, col, LOOK.GLOW, hard ? 0.7 + 0.6 * blink : 0.6, 0.6, hard ? 0.4 : 0.28, p.seed + 3);
    // a stepped arrowhead on the top, its point toward the end turning down (toward +z if g grows)
    const down = Math.sign(gf - g) || 1, ez = hl - 0.9;
    for (let i = 0; i < 3; i++) {
      pbox(sc, p.x, p.z, g, 0, down * (ez - i * 0.45), hw * (0.18 + 0.24 * i), 0.18, 0.05, 0.05, col, LOOK.GLOW, 1.1 + 0.4 * blink, 0.3, 0.9, p.seed + 4 + i);
    }
  }
}

// The pivot under plank p: a steel wedge, its edge under the pivot, on a steel post out of the sea.
function pivot(sc, p) {
  const wy = PLAT_Y - 2 * HY - 0.42;
  sc.box(p.x, wy, p.z, PW * 0.85, 0.42, 0.42, 0, ...STEEL, LOOK.METAL, 0, 0, 1, p.seed, Math.PI / 4);
  const top = wy - 0.4;
  sc.cyl(p.x, top / 2, p.z, 0.38, top / 2, ...STEEL, LOOK.METAL);
}

// ---- the AI ball

const THINK_T = 150; // ticks on (1.2 s) a ball readies itself for
const ball = (view, me) => (typeof me === 'number' ? view.partier(me) : me);
// The coming slope plank k reaches by about THINK_T on.
const coming = (st, k, t) => slopeAt(st, k, t + THINK_T);
// The way off plank p to a neighbour across (dc -1 or 1) or along (dr): its plank, or null.
function neighbour(st, p, dc, dr) {
  const c = p.c + dc, r = p.r + dr;
  if (c < 0 || c >= st.cols || r < 0 || r >= st.rows) return null;
  return st.planks[r * st.cols + c];
}

export default {
  id: L.MG_SEESAW, key: 'seesaw', name: 'SEESAWS',
  hint: 'THE PLANKS TIP UNDER YOUR WEIGHT  STAY HIGH  LAST ONE ON WINS',
  env: 'day',

  draw(view, ctx, out) {
    const st = stage(view);
    if (!st.K) return;
    const sc = out.scene;
    // on the prediction's clock: the plank your ball rides is where it's drawn
    const t = playT(st, ctx.ptick ?? ctx.tick + (ctx.dt || 0) / TICK);
    const now = (ctx.now ?? 0) / 1000;
    for (const p of st.planks) {
      plank(sc, st, p, t, now);
      pivot(sc, p);
    }
  },

  // the field
  frame(view) {
    const g = view.party();
    return { centre: [g.cx, PLAT_Y, g.cx], radius: g.size + 1, shape: 'square' };
  },

  fx(fx, ctx) {
    const v = ctx.view, me = v && ctx.slot >= 0 ? v.partier(ctx.slot) : null;
    const k = fx.shot & 255, sub = fx.shot >> 8;
    let mine = false;
    if (me && me.live && !me.out && v) {
      const st = stage(v), [mk] = at(st, me.pos[0], me.pos[2], v.party().t);
      mine = mk === k;
    }
    if (fx.kind === MC.SS_FX_CREAK) {
      ctx.sound?.boing?.(1, mine ? 0 : ctx.dist);
      if (mine) ctx.banner?.('YOUR PLANK TIPS HARD IN 2 S!', C.ORANGE, 1400);
    } else if (fx.kind === MC.SS_FX_WARN) {
      if (sub === MC.SS_K_DROP) {
        ctx.sound?.count?.(1);
        if (mine) ctx.banner?.('YOUR PLANK DROPS IN 3 S  HOP OFF!', C.RED, 2000);
      } else {
        ctx.sound?.tick?.();
        if (mine) ctx.banner?.(sub === MC.SS_K_SHORT ? 'YOUR PLANK GETS SHORTER: KEEP TO THE MIDDLE' : 'YOUR PLANK GETS NARROWER', C.ORANGE, 1600);
      }
    } else if (fx.kind === MC.SS_FX_GO) {
      ctx.sound?.land?.(sub === MC.SS_K_DROP ? 30 : 16);
      ctx.glow?.({ pos: fx.pos, size: sub === MC.SS_K_DROP ? 5 : 3, color: [1, 0.55, 0.2, 1], kind: SPRITE.FLASH, life: 350 });
      if (sub === MC.SS_K_DROP) ctx.feed?.('A PLANK DROPS', C.ORANGE);
    } else if (fx.kind === MC.SS_FX_SPLASH) {
      ctx.glow?.({ pos: [fx.pos[0], 0.3, fx.pos[2]], size: 4, color: [0.75, 0.92, 1, 0.9], kind: SPRITE.RING, life: 900, grow: true });
      ctx.glow?.({ pos: [fx.pos[0], 1, fx.pos[2]], size: 2.5, color: [0.9, 0.97, 1, 0.8], kind: SPRITE.FLASH, life: 400 });
      ctx.sound?.land?.(fx.owner === ctx.slot ? 26 : 12);
    }
  },

  // your plank's slope now and the steepest coming (which way is up, as you
  // face, and how soon); a drop or a cut coming to it; the planks left
  hud(view, ctx) {
    const st = stage(view);
    if (st.state !== L.H_PLAY || !st.K) return;
    const t = Math.max(0, typeof ctx.t === 'number' ? ctx.t / TICK : view.party().t);
    const ti = Math.floor(t);
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const playing = me && me.live && !me.out;
    ctx.right(3, `PLANKS ${left(st, ti)} OF ${st.K}`, C.GREY);
    if (!playing) return;
    const [k, dz] = at(st, me.pos[0], me.pos[2], ti);
    if (k < 0) return;
    const p = st.planks[k], g = slopeAt(st, k, ti), [gf, when] = steepest(st, k, ti);
    ctx.right(4, `YOUR PLANK ${degOf(g)} DEG`, C.GREY);
    // which way up the plank is, as you face: ahead, behind, left or right
    const way = (up) => {
      const c = Math.cos(me.yaw), s = Math.sin(me.yaw), fw = up * s, rt = up * c;
      return Math.abs(fw) >= Math.abs(rt) ? (fw > 0 ? 'FORWARD' : 'BACK') : rt > 0 ? 'RIGHT' : 'LEFT';
    };
    if (p.drop && ti >= p.drop - MC.SS_DROPWARN) {
      ctx.centre(row, `YOUR PLANK DROPS IN ${Math.max(0, (p.drop - t) * TICK).toFixed(1)}  HOP OFF!`, C.RED);
    } else if (Math.abs(gf) >= MC.SS_GHARD && Math.abs(gf) > Math.abs(g) + 0.05) {
      const secs = Math.max(0, (when - t) * TICK), up = -Math.sign(gf);
      ctx.centre(row, `TIPS TO ${degOf(gf)} DEG IN ${secs.toFixed(1)}`, C.ORANGE);
      if (dz * Math.sign(gf) > -1) ctx.centre(row + 1, `GET HIGH: GO ${way(up)}`, C.YELLOW);
    }
    if (p.cut && ti < p.cut && ti >= p.cut - MC.SS_CUTWARN) {
      ctx.centre(row + 2, `YOUR PLANK GETS ${p.kind === MC.SS_K_SHORT ? 'SHORTER' : 'NARROWER'} IN ${((p.cut - t) * TICK).toFixed(1)}`, C.ORANGE);
    }
  },

  brain: {
    // off every plank on that tick is a fall; a plank about to drop, nearly
    // as bad; near the end its slope runs down to, a risk by how steep;
    // what a cut coming takes off, and near the sides, a little; the low
    // half of a hard tip coming, a little
    danger(view, x, z, tick, me) {
      const st = stage(view);
      if (st.state !== L.H_PLAY) return 0;
      const t = (tick - st.start) | 0;
      const [k, dz] = at(st, x, z, t);
      if (k < 0) return 1;
      const p = st.planks[k];
      if (p.drop) { if (t >= p.drop - 40) return 1; if (t >= p.drop - MC.SS_DROPWARN) return 0.6; }
      let d = 0;
      const [hw, hl] = p.cut && t >= p.cut - 80 ? (p.kind === MC.SS_K_SHORT ? [PW, PL_CUT] : [PW_CUT, PL]) : dims(p, t);
      const dx = x - p.x;
      if (Math.abs(dx) > hw || Math.abs(dz) > hl) return 0.9;
      const g = slopeAt(st, k, t), s = Math.sign(g), ag = Math.abs(g);
      const toLow = hl - dz * s, margin = 1.5 + 12 * ag;
      if (toLow < margin) d = Math.max(d, Math.min(0.95, (1 - toLow / margin) * (0.35 + ag)));
      if (hl - Math.abs(dz) < 1.5) d = Math.max(d, 0.3);
      if (hw - Math.abs(dx) < 1.2) d = Math.max(d, 0.5 * (1.2 - (hw - Math.abs(dx))) + 0.2);
      const gf = coming(st, k, t);
      if (Math.abs(gf) >= MC.SS_GHARD && dz * Math.sign(gf) > 1.5) d = Math.max(d, 0.25 + 0.03 * dz * Math.sign(gf));
      return d;
    },

    // on its plank, uphill of the slope coming and near the middle, spread
    // by its slot along it and across; off any, the nearest plank standing
    goal(view, me, bot) {
      const b = ball(view, me);
      if (!b || !b.live || b.out) return null;
      const st = stage(view);
      if (st.state !== L.H_PLAY) return null;
      const t = ((bot?.at ?? view.tick) - st.start) | 0;
      const x = bot?.pos?.[0] ?? b.pos[0], z = bot?.pos?.[1] ?? b.pos[2];
      let [k] = at(st, x, z, t);
      if (bot?.mem?.cross && standing(st.planks[bot.mem.cross.k], t)) k = bot.mem.cross.k;
      if (k < 0) {
        let best = null, bd = Infinity;
        for (const p of st.planks) { if (!standing(p, t + 60)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
        return best ? [best.x, best.z] : null;
      }
      const p = st.planks[k];
      const [hw, hl] = p.cut && t >= p.cut - MC.SS_CUTWARN ? (p.kind === MC.SS_K_SHORT ? [PW, PL_CUT] : [PW_CUT, PL]) : dims(p, t);
      const gf = coming(st, k, t);
      const slot = b.slot ?? bot?.slot ?? 0, sa = ((slot * 0.618034) % 1) - 0.5, sb = ((slot * 0.381966 + 0.25) % 1) - 0.5;
      const up = Math.max(-2.5, Math.min(2.5, -gf * 5));
      const along = Math.max(-(hl - 2.5), Math.min(hl - 2.5, up + sa * Math.min(4, hl * 0.4)));
      return [p.x + sb * hw * 0.9, p.z + along];
    },

    hop() { return false; },

    // steering outright only to change planks: off one about to drop, or
    // about to tip hard when a neighbour across is calmer; to the pivot
    // first, then across, hopping at the edge
    think(view, me, bot, tick) {
      const st = stage(view);
      if (st.state !== L.H_PLAY || !me || !bot) return null;
      const t = (tick - st.start) | 0;
      const [x, z] = bot.pos, [vx] = bot.vel;
      const m = bot.mem;
      const [k, dz] = at(st, x, z, t);
      const fit = (q) => q && standing(q, t + MC.SS_DROPWARN + 60) && !q.drop;
      if (m.cross && (t > m.cross.until || k === m.cross.k || !fit(st.planks[m.cross.k]))) m.cross = null;
      if (!m.cross && k >= 0 && t >= (m.calm ?? 0)) {
        m.calm = t + 24;
        const p = st.planks[k];
        const dropping = p.drop && t >= p.drop - MC.SS_DROPWARN;
        const [gh] = steepest(st, k, t);
        // on the low side of a hard tip coming, now and then (so a crowd doesn't all go at once); off a plank dropping, now
        const tipping = Math.abs(gh) >= MC.SS_GHARD && dz * Math.sign(gh) > -1 && bot.rand() < 0.2;
        if (dropping || tipping) {
          let best = null, bb = dropping ? 98 : Math.abs(gh) - 0.25;
          // across first; along (end to end, a riskier hop) only off a plank dropping with nothing across
          for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const q = neighbour(st, p, dc, dr);
            if (!fit(q) || (dr && (!dropping || best))) continue;
            const b = Math.abs(steepest(st, q.k, t)[0]) + 0.06 * q.n + 0.01 * Math.abs(q.x - x) + (dr ? 1 : 0);
            if (b < bb) { bb = b; best = q; }
          }
          if (best) m.cross = { k: best.k, until: t + 450, run: false };
        }
      }
      if (!m.cross) return null;
      const q = st.planks[m.cross.k];
      if (k < 0) return { yaw: Math.atan2(q.z - z, q.x - x) };
      const p = st.planks[k];
      if (q.c === p.c) {
        // end to end: up its middle to the end facing the other, hopping off it
        const way = Math.sign(q.z - p.z), [, hl] = dims(p, t);
        return { yaw: Math.atan2(q.z - z, (p.x - x) * 2), hop: (z - p.z) * way > hl - 0.5 };
      }
      const toward = Math.sign(q.x - p.x), hw = dims(p, t)[0], ex = (x - p.x) * toward;
      // to the pivot first (the neighbours' tops differ least there), on the far side of the middle for a run-up
      if (!m.cross.run && (ex < -0.8 || (vx * toward > 3.5 && ex < hw - 1.2)) && Math.abs(dz) < 1.6) m.cross.run = true;
      if (m.cross.run && vx * toward < 2 && ex > hw - 1.5) m.cross.run = false;
      if (!m.cross.run) return { yaw: Math.atan2(p.z - z, p.x - toward * 1.5 - x) };
      // then across, hopping at the edge
      return { yaw: Math.atan2((p.z - z) * 0.5, q.x - x), hop: ex > hw - 0.4 && vx * toward > 3.5 };
    },
  },
};
