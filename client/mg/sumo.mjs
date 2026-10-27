// SUMO RING, as drawn and as the AI ball sees it: a ring of clay-coloured
// rubber with a white edge, its posts striped drums riding round it,
// swinging one way and then back. While it shrinks a red line on the floor
// marks how far it will go. The rules are Rust (rust/mg/sumo/src/lib.rs);
// what is here works the same schedule again (the posts' bearing in 2^-24
// turn in i32, the ring's radius in f32) for drawing and steering only.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/sumo.mjs'; // SU_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const f = Math.fround;
const TICK = 0.008;
const TAU = 2 * Math.PI;
const HH = 0.5; // the ring's half height, m

// The ring's radius on tick t of play, from r0 to r1, as the Rust works it in f32.
export function ringAt(r0, r1, t) {
  if (t <= MC.SU_HOLD) return r0;
  if (t >= MC.SU_HOLD + MC.SU_SHRINK) return r1;
  const k = f(f(t - MC.SU_HOLD) / f(MC.SU_SHRINK));
  return f(r0 - f(f(r0 - r1) * k));
}
// How far along their swing the posts are on tick t (t may be fractional for drawing).
export function swingAt(t) {
  t = Math.max(0, t);
  const m = t % MC.SU_SWING;
  return Math.floor(t / MC.SU_SWING) % 2 === 0 ? m : MC.SU_SWING - m;
}
// Post k's bearing on (whole) tick t, 1/2^24 turn, as the sim's i32 works it.
export function bearingAt(st, k, t) {
  return ((st.a0 + Math.imul(st.spin, swingAt(t)) + ((k * 2 ** 24) / st.np | 0)) >>> 0) & 0xffffff;
}
// The round's stage from its header (the view's bank).
export function stage(view) {
  const dv = view.dv, o = view.bank;
  return {
    r0: dv.getFloat32(L.PG_H + MC.SU_RAD + o, true), r1: dv.getFloat32(L.PG_H + MC.SU_RLOW + o, true),
    np: dv.getUint32(L.PG_H + MC.SU_NP + o, true), a0: dv.getUint32(L.PG_H + MC.SU_A0 + o, true),
    spin: dv.getInt32(L.PG_H + MC.SU_SPIN + o, true), cx: dv.getFloat32(L.PG_CX + o, true),
  };
}
// Post k's centre [x, z] on tick t, its bearing to 1/16384 turn as $sincos
// takes it (fractional t for drawing: eased between ticks).
export function postAt(st, k, t) {
  const t0 = Math.floor(t);
  let a = bearingAt(st, k, t0) >> 10;
  if (t > t0) a += ((((bearingAt(st, k, t0 + 1) >> 10) - a) << 18) >> 18) * (t - t0);
  const rho = MC.SU_ORBIT * ringAt(st.r0, st.r1, t);
  const u = (a / 16384) * TAU;
  return [st.cx + Math.cos(u) * rho, st.cx + Math.sin(u) * rho];
}
// Ticks into play on tick `tick` (fractional for drawing), as $p_t counts: the sim's i32 subtraction wraps.
const playT = (view, tick) => { const i = Math.floor(tick); return Math.max(0, ((i - view.hole().start) | 0) + tick - i); };
const radius = (view, t) => { const st = stage(view); return st.r0 > 0 ? ringAt(st.r0, st.r1, t) : view.party().size; };

export default {
  id: L.MG_SUMO, key: 'sumo', name: 'SUMO RING',
  hint: 'BUMP THE OTHERS OFF  MIND THE POSTS  LAST ONE ON WINS',
  env: 'sunset',

  draw(view, ctx, out) {
    const st = stage(view);
    if (!(st.r0 > 0)) return;
    // on the prediction's clock: the posts your own ball meets where it meets them
    const now = ctx.ptick ?? ctx.tick + ctx.dt / TICK;
    const t = view.hole().state >= L.H_PLAY ? playT(view, now) : 0;
    const r = ringAt(st.r0, st.r1, t);
    out.scene.cyl(st.cx, PLAT_Y - HH, st.cx, r, HH, 0.86, 0.66, 0.44, LOOK.RUBBER);
    out.decals?.push({ pos: [st.cx, PLAT_Y + 0.03, st.cx], radius: r, width: 0.45, color: [1, 1, 0.95, 0.9], kind: DECAL.RING });
    out.decals?.push({ pos: [st.cx, PLAT_Y + 0.03, st.cx], radius: Math.min(2.5, r * 0.15), width: 0.25, color: [1, 1, 0.95, 0.6], kind: DECAL.RING });
    if (t > MC.SU_HOLD - 500 && t < MC.SU_HOLD + MC.SU_SHRINK) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.05);
      out.decals?.push({ pos: [st.cx, PLAT_Y + 0.05, st.cx], radius: st.r1, width: 0.3, color: [1, 0.2, 0.1, 0.45 + 0.4 * pulse], kind: DECAL.RING });
    }
    for (let k = 0; k < st.np; k++) {
      const [x, z] = postAt(st, k, t);
      const h = MC.SU_POSTH / 2;
      out.scene.cyl(x, PLAT_Y + h, z, MC.SU_POSTR, h, 0.95, 0.75, 0.15, LOOK.HAZARD);
      out.scene.cyl(x, PLAT_Y + MC.SU_POSTH + 0.08, z, MC.SU_POSTR * 1.08, 0.08, 0.7, 0.72, 0.76, LOOK.METAL);
      out.casters?.push([x, PLAT_Y + h, z, -MC.SU_POSTR]);
    }
  },

  frame(view) {
    const st = stage(view);
    const cx = st.cx || view.party().cx;
    return { centre: [cx, PLAT_Y, cx], radius: radius(view, view.party().t), shape: 'disc' };
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    if (fx.kind === MC.SU_FX_BONK) {
      const mine = fx.owner === ctx.slot;
      ctx.sound?.boing?.(Math.min(30, fx.size * 2), mine ? 0 : d);
      if (mine || d < 40) ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 1, fx.pos[2]], size: 2, color: [1, 0.8, 0.25, 0.8], kind: SPRITE.RING, life: 360, grow: true });
      if (mine) ctx.banner?.('BONK!', C.ORANGE, 600);
    } else if (fx.kind === MC.SU_FX_RING) {
      if (fx.shot === 0) { ctx.banner?.('THE RING SHRINKS', C.YELLOW, 1800); ctx.sound?.count?.(1); }
      else { ctx.banner?.('LAST STAND', C.RED, 1800); ctx.sound?.land?.(24); }
    } else if (fx.kind === MC.SU_FX_TURN) {
      ctx.sound?.tick?.();
    }
  },

  hud(view, ctx) {
    if (view.hole().state !== L.H_PLAY) return;
    const t = view.party().t;
    const r = Math.round(radius(view, t));
    if (t < MC.SU_HOLD) ctx.right(3, `RING ${r} M  SHRINKS IN ${Math.ceil((MC.SU_HOLD - t) * TICK)} S`, ctx.C?.CYAN);
    else ctx.right(3, `RING ${r} M`, ctx.C?.YELLOW);
  },

  brain: {
    // off the ring is a fall, its edge a risk; where a post will be, a knock
    danger(view, x, z, tick) {
      const st = stage(view);
      if (!(st.r0 > 0)) return 0;
      const t = playT(view, tick);
      const r = ringAt(st.r0, st.r1, t), dx = x - st.cx, dz = z - st.cx, d2 = dx * dx + dz * dz;
      if (d2 > (r - 0.6) ** 2) return 1;
      const risk = d2 > (r - 3) ** 2 ? 0.35 : 0;
      const reach = MC.SU_POSTR + 1.8;
      for (let k = 0; k < st.np; k++) {
        const [px, pz] = postAt(st, k, t);
        if ((x - px) ** 2 + (z - pz) ** 2 < reach * reach) return Math.max(risk, 0.7);
      }
      return risk;
    },
    // the middle, where a bump has the furthest to push you
    goal(view) {
      const st = stage(view);
      return [st.cx, st.cx];
    },
    hop() { return false; },
  },
};
