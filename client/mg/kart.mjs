// KART GRAB, as drawn and as the AI kart drives it. A square course of
// checkered tarmac walled in red and white kerbs; toy blocks on the lattice,
// dash panels of glowing chevrons in the lanes between them, item boxes
// spinning in rows (gone while they come back); coins dropping onto it and
// lying there, flying off a kart that's hit. Every ball sits in a kart (a tub,
// a bumper, four wheels, the front two steering) turned to its heading, drift
// sparks at its back wheels the colour of its charge, a flame while it boosts,
// stars while it spins out. The heading, the drift and the spin are read from
// the kart's PG_M (your own from the prediction), the coins from their records
// (src/mg/kart.mjs's layout), each placed on its flight as $kt_at places it;
// a coin your predicted kart drives into is hidden at once, before the take
// comes back from the confirmed world.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/kart.mjs'; // KT_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const TURN = 16384;
const YL = Math.fround(PLAT_Y + MC.KT_CY); // a lying coin's centre, the sim's f32
const COIN_R = 0.42;
const PU_NAME = ['', 'MEGA', 'MUSHROOM', 'POW', 'ROCKET', 'SPRING'];
const since = (T, start) => ((Math.floor(T) - start) | 0) + (T - Math.floor(T));
const ordinal = (n) => `${n}${[, 'ST', 'ND', 'RD'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'TH'}`;
const slotColor = (s) => { const h = (s * 0.618034) % 1; return [0, 0.33, 0.67].map((o) => 0.55 + 0.4 * Math.cos(6.2832 * (h + o))); };
const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

// ---- the course, read from the sim (fixed at setup: the confirmed world's, bank 0)

export const half = (view) => view.dv.getFloat32(L.PG_H + MC.KT_HALF, true);
const centre = (view) => view.dv.getFloat32(L.PG_CX, true);
// A kart's PG_M: { h (its heading, 1/16384 turns), dir (KT_DL, KT_DR or 0), charge, spin (ticks left) }.
export const kartOf = (m) => ({ h: m & (TURN - 1), dir: (m >>> 14) & 3, charge: (m >>> 16) & 255, spin: m >>> 24 });
// The way of a panel (0 +x, 1 +z, 2 -x, 3 -z) as an angle.
export const wayAngle = (w) => (w & 3) * Math.PI / 2;
export function course(view) {
  if (view._ktc?.tick === view.tick) return view._ktc;
  const dv = view.dv;
  const blocks = [], pads = [], boxes = [];
  const nb = Math.min(MC.KT_NBLKMAX, dv.getUint32(L.PG_H + MC.KT_NBLK, true));
  for (let i = 0; i < nb; i++) { const a = L.PG_S + MC.KT_BLK + 8 * i; blocks.push({ i, x: dv.getFloat32(a, true), z: dv.getFloat32(a + 4, true) }); }
  const np = Math.min(MC.KT_NPADMAX, dv.getUint32(L.PG_H + MC.KT_NPAD, true));
  for (let i = 0; i < np; i++) { const a = L.PG_S + MC.KT_PAD + 12 * i; pads.push({ i, x: dv.getFloat32(a, true), z: dv.getFloat32(a + 4, true), way: dv.getUint32(a + 8, true) }); }
  const nx = Math.min(MC.KT_NBOXMAX, dv.getUint32(L.PG_H + MC.KT_NBOX, true));
  for (let i = 0; i < nx; i++) { const a = L.PG_S + MC.KT_BOX + 12 * i; boxes.push({ i, x: dv.getFloat32(a, true), z: dv.getFloat32(a + 4, true), back: dv.getUint32(a + 8, true) }); }
  view._ktc = { tick: view.tick, H: half(view), cx: centre(view), blocks, pads, boxes };
  return view._ktc;
}
export const fever = (tp) => tp >= MC.KT_FEVER;

// Every coin in the records, once a world tick: { c, x, z (where it lies), x0, y0, z0, h, t0, air, v, kind,
// ready (the tick it is anyone's), gone (the tick it goes) }.
export function coins(view) {
  if (view._ktk?.tick === view.tick) return view._ktk.list;
  const dv = view.dv, list = [];
  for (let c = 0; c < MC.KT_MAX; c++) {
    const a = L.PG_BIG + MC.KT_COINS + c * MC.KT_CSIZE;
    const v = view.u8[a + MC.KT_C_V];
    if (!v) continue;
    const t0 = dv.getUint32(a + MC.KT_C_T0, true), air = dv.getUint16(a + MC.KT_C_AIR, true), kind = view.u8[a + MC.KT_C_KIND];
    list.push({
      c, v, kind, t0, air, x: dv.getFloat32(a + MC.KT_C_X, true), z: dv.getFloat32(a + MC.KT_C_Z, true),
      x0: dv.getFloat32(a + MC.KT_C_X0, true), y0: dv.getFloat32(a + MC.KT_C_Y0, true), z0: dv.getFloat32(a + MC.KT_C_Z0, true), h: dv.getFloat32(a + MC.KT_C_H, true),
      ready: t0 + (kind === MC.KT_KLOOSE ? MC.KT_LOOSE : Math.max(0, air - 10)), gone: t0 + air + MC.KT_LIFE,
    });
  }
  view._ktk = { tick: view.tick, list };
  return list;
}
// Where coin k is on tick t (fractional), as $kt_at: [x, y, z].
export function coinAt(k, t) {
  const tau = t - k.t0;
  if (tau >= k.air) return [k.x, YL, k.z];
  const u = tau / k.air;
  return [k.x0 + (k.x - k.x0) * u, k.y0 + (YL - k.y0) * u + 4 * k.h * u * (1 - u), k.z0 + (k.z - k.z0) * u];
}
// Is a ball whose bottom is at (x, y, z) within reach of coin k on tick t, as $kt_tick takes them?
function reaches(k, t, x, y, z, r = 1) {
  if (t < k.t0 || t >= k.gone || (k.kind === MC.KT_KLOOSE && t < k.t0 + MC.KT_LOOSE)) return false;
  const p = coinAt(k, t);
  if (p[1] > PLAT_Y + MC.KT_GRABH) return false;
  const R = r + MC.KT_REACH;
  return (p[0] - x) ** 2 + (p[1] - y - r) ** 2 + (p[2] - z) ** 2 < R * R;
}

// ---- drawing

const ghosts = new Map(); // `${c}:${t0}` -> the confirmed tick by which the take should be back
let env = 'day';
const BLOCK_COLORS = [[0.98, 0.78, 0.15], [0.2, 0.5, 0.95], [0.92, 0.25, 0.2], [0.25, 0.75, 0.35]];

function stage(out, w, now, tp, playing) {
  const sc = out.scene, { H, cx } = w;
  // tarmac, and the plinth under it
  sc.box(cx, PLAT_Y - 0.5, cx, H + 0.6, 0.5, H + 0.6, 0, 0.32, 0.34, 0.4, LOOK.CHECKER, 4, 0.72);
  sc.box(cx, PLAT_Y - 4, cx, H + 0.4, 3, H + 0.4, 0, 0.2, 0.18, 0.22, LOOK.MATTE);
  // kerbs, red and white, 2 m a piece
  const n = Math.max(2, Math.ceil(H));
  const seg = (2 * H + 1.2) / n;
  for (let k = 0; k < n; k++) {
    const u = cx - H - 0.6 + seg * (k + 0.5);
    const [r, g, b] = k & 1 ? [0.95, 0.95, 0.95] : [0.9, 0.12, 0.12];
    const hh = MC.KT_WALLH / 2;
    sc.box(u, PLAT_Y + hh, cx - H - 0.3, seg / 2, hh, 0.3, 0, r, g, b, LOOK.PLASTIC);
    sc.box(u, PLAT_Y + hh, cx + H + 0.3, seg / 2, hh, 0.3, 0, r, g, b, LOOK.PLASTIC);
    sc.box(cx - H - 0.3, PLAT_Y + hh, u, 0.3, hh, seg / 2, 0, r, g, b, LOOK.PLASTIC);
    sc.box(cx + H + 0.3, PLAT_Y + hh, u, 0.3, hh, seg / 2, 0, r, g, b, LOOK.PLASTIC);
  }
  // the toy blocks
  const bh = MC.KT_BLOCKH / 2;
  for (const b of w.blocks) {
    const c = BLOCK_COLORS[b.i % 4];
    sc.box(b.x, PLAT_Y + bh, b.z, MC.KT_BLOCK, bh, MC.KT_BLOCK, 0, ...c, LOOK.PLASTIC);
    sc.box(b.x, PLAT_Y + MC.KT_BLOCKH + 0.06, b.z, MC.KT_BLOCK - 0.4, 0.06, MC.KT_BLOCK - 0.4, 0, 0.96, 0.95, 0.92, LOOK.PLASTIC);
  }
  // the dash panels: an orange plate, three chevrons lighting in turn along its way
  for (const p of w.pads) {
    const a = wayAngle(p.way), fx = Math.cos(a), fz = Math.sin(a);
    sc.box(p.x, PLAT_Y + 0.02, p.z, MC.KT_PADL, 0.02, MC.KT_PADW, a, 1, 0.5, 0.12, LOOK.GLOW, 0.5, 0.5);
    for (let k = 0; k < 3; k++) {
      const s = (k - 1) * 1.5;
      const lit = 0.6 + 1.6 * Math.max(0, Math.sin(now / 120 - k * 1.1));
      const tx = p.x + fx * (s + 0.45), tz = p.z + fz * (s + 0.45);
      for (const side of [-1, 1]) {
        const ax = tx - fx * 0.42 - fz * 0.42 * side, az = tz - fz * 0.42 + fx * 0.42 * side;
        sc.box(ax, PLAT_Y + 0.05, az, 0.62, 0.025, 0.13, a - side * Math.PI / 4, 1, 0.92, 0.5, LOOK.GLOW, lit, 0.2);
      }
    }
  }
  // the item boxes, spinning and bobbing, their colour going round; one taken comes back growing
  for (const b of w.boxes) {
    const left = playing ? b.back - tp : 0;
    if (left > 30) continue;
    const grow = left > 0 ? 1 - left / 30 : 1;
    const hue = now / 900 + b.i * 0.37;
    const col = [0, 0.33, 0.67].map((o) => 0.6 + 0.4 * Math.cos(6.2832 * (hue + o)));
    const y = PLAT_Y + MC.KT_BOXY + 0.15 * Math.sin(now / 300 + b.i);
    const s = 0.62 * grow;
    sc.box(b.x, y, b.z, s, s, s, now / 600 + b.i, ...col, LOOK.GLOW, 0.7, 0.8, 0.8);
    sc.box(b.x, y, b.z, s * 0.45, s * 0.45, s * 0.45, -now / 400 + b.i, 1, 1, 1, LOOK.GLOW, 1.4, 0.2);
    out.decals.push({ pos: [b.x, PLAT_Y + 0.03, b.z], radius: 1.1, width: 0.12, color: [...col, 0.35], kind: DECAL.RING });
  }
  out.decals.push({ pos: [cx, PLAT_Y + 0.02, cx], radius: MC.KT_RING + 1.6, width: 0.25, color: [1, 0.85, 0.35, 0.45], kind: DECAL.TARGET });
}

// A kart under the ball whose bottom is at pos: heading a, the front wheels turned by steer, its colour.
function kart(out, pos, a, steer, col, k, now, dash, spinning) {
  const sc = out.scene, [x, y, z] = pos;
  const fx = Math.cos(a), fz = Math.sin(a), lx = -fz, lz = fx;
  const at = (f, l, h = 0) => [x + fx * f + lx * l, y + h, z + fz * f + lz * l];
  sc.box(x, y + 0.42, z, 1.5, 0.22, 1.0, a, ...col, LOOK.PLASTIC);
  const nose = at(1.58, 0, 0.32);
  sc.box(nose[0], nose[1], nose[2], 0.16, 0.16, 0.85, a, 0.12, 0.12, 0.14, LOOK.RUBBER);
  const back = at(-1.45, 0, 0.62);
  sc.box(back[0], back[1], back[2], 0.2, 0.3, 0.72, a, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, LOOK.METAL);
  for (const [f, l] of [[1.05, 1.08], [1.05, -1.08], [-1.05, 1.08], [-1.05, -1.08]]) {
    const w = at(f, l, 0.4);
    sc.cyl(w[0], w[1], w[2], 0.4, 0.2, 0.08, 0.08, 0.09, LOOK.RUBBER, 0, 0, 1, undefined, Math.PI / 2, f > 0 ? a + steer : a);
  }
  // drift sparks off the back wheels: white charging, blue for a mini-turbo, orange for a long one
  if (k.dir && !spinning) {
    const c = k.charge >= MC.KT_MT2 ? [1, 0.55, 0.15] : k.charge >= MC.KT_MT1 ? [0.35, 0.65, 1] : [1, 1, 1];
    for (const l of [1.08, -1.08]) {
      const p = at(-1.25, l, 0.15);
      out.glow.push({ pos: p, size: 0.35 + 0.25 * Math.abs(Math.sin(now / 37 + l)), color: [...c, 0.9], kind: SPRITE.SPARK, minpx: 1 });
    }
  }
  if (dash) out.glow.push({ pos: at(-1.85, 0, 0.62), size: 0.7 + 0.3 * Math.sin(now / 30), color: [1, 0.6, 0.2, 0.9], kind: SPRITE.FLASH, minpx: 1 });
  if (spinning) {
    for (let s = 0; s < 3; s++) {
      const t = now / 160 + s * 2.094;
      out.glow.push({ pos: [x + Math.cos(t) * 0.9, y + 3.3, z + Math.sin(t) * 0.9], size: 0.32, color: [1, 0.95, 0.4, 1], kind: SPRITE.SPARK, minpx: 1 });
    }
  }
}

export default {
  id: L.MG_KART, key: 'kart', name: 'KART GRAB',
  hint: 'STEER WITH THE MOUSE  HOLD SPACE IN A TURN TO DRIFT  GRAB THE COINS',
  rules: 'MOST COINS WINS  ITEMS SPIN RIVALS OUT AND DROP THEIR COINS',
  get env() { return env; },

  draw(view, ctx, out) {
    const w = course(view);
    if (!(w.H > 0)) return;
    const g = view.party();
    const now = ctx.now ?? 0;
    // on the prediction's clock, where your own kart is drawn
    const T = ctx.ptick ?? ctx.tick + (ctx.dt || 0) / TICK;
    const playing = g.state === L.H_PLAY;
    const tp = playing ? since(T, g.start) : 0;
    env = playing && fever(tp) ? 'sunset' : 'day';
    stage(out, w, now, tp, playing);
    // the karts, under the balls the frontend draws
    const dt = ctx.dt || 0;
    for (let p = 0; p < L.NPLAYER; p++) {
      const a = L.PLAYERS + p * L.PSIZE;
      const fl = view.u8[a + L.P_FL];
      if ((fl & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) continue;
      const own = p === ctx.slot && ctx.pme && !ctx.pme.out;
      const rec = own ? ctx.pme : null;
      const m = rec ? rec.m : view.dv.getUint32(a + L.PG_M, true);
      const k = kartOf(m);
      const pos = own && ctx.own ? ctx.own
        : [0, 4, 8].map((o, i) => view.dv.getFloat32(a + L.P_PX + o, true) + view.dv.getFloat32(a + L.P_VX + o, true) * dt * (i === 1 ? 0 : 1));
      const h = k.h / TURN * 2 * Math.PI;
      const yaw = rec ? rec.yaw : (view.dv.getUint32(a + L.P_IN, true) & (TURN - 1)) / TURN * 2 * Math.PI;
      const steer = Math.max(-0.45, Math.min(0.45, wrap(yaw - h)));
      const dash = view.dv.getUint16(a + L.B_DASH, true) > 0 || (rec?.dash ?? 0) > 0;
      kart(out, pos, h, k.spin ? 0 : steer, slotColor(p), k, now, dash, k.spin > 0);
    }
    // the coins
    const me = ctx.pme && !ctx.pme.out ? ctx.pme : null;
    for (const [key, until] of ghosts) if (view.tick > until) ghosts.delete(key);
    for (const c of coins(view)) {
      if (T < c.t0 || T >= c.gone) continue;
      const key = `${c.c}:${c.t0}`;
      if (me && !ghosts.has(key) && reaches(c, Math.floor(T), me.pos[0], me.pos[1], me.pos[2], me.radius)) ghosts.set(key, Math.ceil(T) + 30);
      if (ghosts.has(key)) continue;
      const left = (c.gone - T) * TICK;
      if (left < 2 && Math.sin(now / (40 + 60 * left)) < -0.2) continue;
      const p = coinAt(c, T);
      const lying = T - c.t0 >= c.air;
      if (lying) p[1] += COIN_R - MC.KT_CY + 0.14 + 0.08 * Math.sin(now / 280 + c.c);
      out.solid.push({ pos: p, size: COIN_R, color: [1, 0.8, 0.2, 1], kind: SPRITE.COIN, minpx: 1.5, roll: c.c * 0.77 });
      if (!lying) {
        out.casters.push([p[0], p[1], p[2], -COIN_R * 1.2]);
        if (c.kind === MC.KT_KDROP) {
          const u = (T - c.t0) / c.air;
          out.decals.push({ pos: [c.x, PLAT_Y + 0.03, c.z], radius: 0.5 + 0.8 * (1 - u), width: 0.14, color: [1, 0.85, 0.3, 0.25 + 0.5 * u], kind: DECAL.RING });
        }
      }
    }
  },

  frame(view) {
    const H = half(view) || view.party().size;
    const cx = centre(view);
    return { centre: [cx, PLAT_Y, cx], radius: H, shape: 'square' };
  },

  fx(f, ctx) {
    const mine = f.owner === ctx.slot;
    const d = typeof ctx.dist === 'function' ? ctx.dist(f.pos) : ctx.dist ?? 0;
    const name = (p) => ctx.name?.(p) ?? `P${p + 1}`;
    if (f.kind === MC.KT_FX_TAKE) {
      ctx.glow?.({ pos: f.pos, size: 0.9, color: [1, 0.9, 0.4, 0.9], kind: SPRITE.SPARK, life: 260 });
      if (mine) ctx.sound?.pickup?.();
      return;
    }
    if (f.kind === MC.KT_FX_HIT) {
      ctx.glow?.({ pos: f.pos, size: 1.5, color: [1, 0.85, 0.3, 0.85], kind: SPRITE.RING, life: 400, grow: true });
      if (mine) ctx.banner?.(f.shot ? `SPUN OUT  -${f.shot} ${f.shot === 1 ? 'COIN' : 'COINS'}` : 'SPUN OUT', C.RED, 1200);
      else if (f.shot >= MC.KT_LOSEMAX) ctx.feed?.(`${name(f.owner)} DROPPED ${f.shot} COINS`, C.YELLOW);
      if (mine || d < 25) ctx.sound?.land?.(f.size > 0.5 ? 30 : 20);
      return;
    }
    if (f.kind === MC.KT_FX_BOX) {
      ctx.glow?.({ pos: f.pos, size: 1.2, color: [1, 1, 1, 0.8], kind: SPRITE.RING, life: 300, grow: true });
      if (mine) { ctx.banner?.(PU_NAME[f.size] || 'ITEM', C.CYAN, 900); ctx.sound?.tick?.(); }
      return;
    }
    if (f.kind === MC.KT_FX_BOOST) {
      const c = f.shot === 2 ? [1, 0.55, 0.15, 0.9] : f.shot === 1 ? [0.35, 0.65, 1, 0.9] : [1, 0.6, 0.2, 0.7];
      ctx.glow?.({ pos: f.pos, size: f.shot ? 2 : 1.4, color: c, kind: SPRITE.FLASH, life: 300, grow: true });
      if (mine) {
        if (f.shot) ctx.banner?.(f.shot === 2 ? 'SUPER TURBO' : 'TURBO', f.shot === 2 ? C.ORANGE : C.CYAN, 600);
        ctx.sound?.jump?.();
      } else if (d < 15) ctx.sound?.boing?.(8, d);
    }
  },

  // your drift's charge, the fever on the clock, and where you stand
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const tp = typeof ctx.t === 'number' && ctx.t > 0 ? ctx.t / TICK : g.t;
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (me?.live && !me.out) {
      const k = kartOf(me.m);
      if (k.spin) ctx.right(3, 'SPUN OUT', C.RED);
      else if (k.dir) {
        const lvl = k.charge >= MC.KT_MT2 ? 2 : k.charge >= MC.KT_MT1 ? 1 : 0;
        const bar = '='.repeat(Math.min(12, Math.round(k.charge / MC.KT_MT2 * 12)));
        ctx.right(3, `DRIFT ${bar}${lvl === 2 ? ' SUPER' : lvl ? ' TURBO' : ''}`, lvl === 2 ? C.ORANGE : lvl ? C.CYAN : C.WHITE);
      }
    }
    if (fever(tp)) ctx.right(4, 'COIN FEVER', Math.floor(ctx.now / 250) % 2 ? C.ORANGE : C.YELLOW);
    else ctx.right(4, `COIN FEVER IN ${Math.ceil((MC.KT_FEVER - tp) * TICK)}`, C.GREY);
    if (me?.live) {
      let place = 1, n = 0;
      for (let p = 0; p < L.NPLAYER; p++) {
        const a = L.PLAYERS + p * L.PSIZE;
        if (!(view.u8[a + L.P_FL] & L.PF_LIVE)) continue;
        n++;
        if (view.dv.getUint16(a + L.PG_SCORE, true) > me.score) place++;
      }
      ctx.right(5, `${ordinal(place)} OF ${n}`, place === 1 ? C.GREEN : C.WHITE);
    }
  },

  brain: {
    // the walls and the blocks stop a kart: they're what it steers round
    danger(view, x, z) {
      const w = course(view);
      if (Math.abs(x - w.cx) > w.H - 1 || Math.abs(z - w.cx) > w.H - 1) return 0.6;
      for (const b of w.blocks) if (Math.abs(x - b.x) < MC.KT_BLOCK + 1 && Math.abs(z - b.z) < MC.KT_BLOCK + 1) return 0.6;
      return 0;
    },
    goal(view, me, bot) {
      const p = plan(view, me, bot);
      return p ? p.goal : null;
    },
    hop() { return false; },
    think(view, me, bot, t) { return drive(view, me, bot, t); },
  },
};

// ---- the AI kart

const CELL = 8, GN = 16; // the brain's coin grid: 8 m cells over 128 m round the centre

// What every AI kart looking at one world tick shares: the course, the coins in a grid, the karts in.
function fieldOf(view) {
  if (view._ktf?.tick === view.tick) return view._ktf;
  const w = course(view);
  const o = w.cx - (GN * CELL) / 2;
  const list = coins(view);
  const head = new Int32Array(GN * GN).fill(-1), next = new Int32Array(list.length);
  list.forEach((k, n) => {
    const i = Math.floor((k.x - o) / CELL), j = Math.floor((k.z - o) / CELL);
    next[n] = -1;
    if (i >= 0 && j >= 0 && i < GN && j < GN) { next[n] = head[j * GN + i]; head[j * GN + i] = n; }
  });
  const balls = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const b = L.PLAYERS + p * L.PSIZE;
    if ((view.u8[b + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
    balls.push({ slot: p, x: view.dv.getFloat32(b + L.P_PX, true), z: view.dv.getFloat32(b + L.P_PZ, true),
      vx: view.dv.getFloat32(b + L.P_VX, true), vz: view.dv.getFloat32(b + L.P_VZ, true), score: view.dv.getUint16(b + L.PG_SCORE, true) });
  }
  view._ktf = { tick: view.tick, ...w, o, list, head, next, balls };
  return view._ktf;
}
function around(w, x, z, r, fn) {
  const i0 = Math.max(0, Math.floor((x - r - w.o) / CELL)), i1 = Math.min(GN - 1, Math.floor((x + r - w.o) / CELL));
  const j0 = Math.max(0, Math.floor((z - r - w.o) / CELL)), j1 = Math.min(GN - 1, Math.floor((z + r - w.o) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let n = w.head[j * GN + i]; n >= 0; n = w.next[n]) fn(w.list[n]);
}
// Does the straight way from (x0, z0) to (x1, z1) pass within m of a block?
function blocked(w, x0, z0, x1, z1, m = 1.4) {
  const B = MC.KT_BLOCK + m;
  for (const b of w.blocks) {
    // the segment against the grown square, by slabs
    let t0 = 0, t1 = 1;
    for (const [p0, d, c] of [[x0, x1 - x0, b.x], [z0, z1 - z0, b.z]]) {
      if (Math.abs(d) < 1e-9) { if (Math.abs(p0 - c) > B) { t0 = 2; break; } continue; }
      let a = (c - B - p0) / d, e = (c + B - p0) / d;
      if (a > e) [a, e] = [e, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, e);
      if (t0 > t1) break;
    }
    if (t0 <= t1) return b;
  }
  return null;
}

// What the kart goes for, thought again every think: a coin worth the drive (the turn it takes counted:
// a coin beside a fast kart is a loop away), an item box with nothing held, through any block in the way
// counted as a detour. It keeps what it's after unless something is clearly better.
function plan(view, me, bot) {
  const slot = typeof me === 'number' ? me : me?.slot;
  const g = view.party();
  if (g.state !== L.H_PLAY || !(slot >= 0)) return null;
  const b = L.PLAYERS + slot * L.PSIZE;
  if ((view.u8[b + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) !== L.PF_LIVE) return null;
  const mind = bot?.mem ?? {};
  const t = bot?.at ?? view.tick;
  if (mind.at === t && mind.plan) return mind.plan;
  const w = fieldOf(view);
  const x0 = bot?.pos?.[0] ?? view.dv.getFloat32(b + L.P_PX, true), z0 = bot?.pos?.[1] ?? view.dv.getFloat32(b + L.P_PZ, true);
  const vx = bot?.vel?.[0] ?? view.dv.getFloat32(b + L.P_VX, true), vz = bot?.vel?.[1] ?? view.dv.getFloat32(b + L.P_VZ, true);
  const h = kartOf(view.dv.getUint32(b + L.PG_M, true)).h / TURN * 2 * Math.PI;
  const sp = Math.hypot(vx, vz);
  const skill = bot?.skill ?? 0.6;
  const held = view.u8[b + L.B_ITEM];
  const tp = (t - g.start) | 0;
  const eta = (x, z) => {
    const dx = x - x0, dz = z - z0, d = Math.hypot(dx, dz);
    const turn = Math.abs(wrap(Math.atan2(dz, dx) - h));
    let e = d / 14 + turn * (0.25 + sp / 40) + 0.3 * (1 - skill);
    if (d < sp * 0.5 && turn > 1) e += 1.2; // inside its turning circle: a loop round
    if (blocked(w, x0, z0, x, z)) e += 0.7;
    return e;
  };
  let best = null;
  const consider = (x, z, s, kind, key) => {
    if (kind === mind.kind && key === mind.key) s *= 1.35;
    if (!best || s > best.s) best = { x, z, s, kind, key };
  };
  const coin = (k) => {
    let e = eta(k.x, k.z);
    const at = t + e / TICK;
    if (at > k.gone - 20) return;
    if (at < k.ready) e += (k.ready - at) * TICK * 0.8;
    // a coin with others close by is worth more: a line of three
    let near = 0;
    around(w, k.x, k.z, 3, (o) => { if (o !== k && (o.x - k.x) ** 2 + (o.z - k.z) ** 2 < 9) near++; });
    consider(k.x, k.z, k.v * (1 + 0.45 * near) / (e + 0.4), 0, k.t0 * MC.KT_MAX + k.c);
  };
  if (w.list.length > 40) {
    around(w, x0, z0, 2 * CELL, coin);
    if (!best) for (const k of w.list) coin(k);
  } else for (const k of w.list) coin(k);
  if (!held) for (const bx of w.boxes) if (tp >= bx.back) consider(bx.x, bx.z, 1.6 / (eta(bx.x, bx.z) + 0.4), 1, bx.i);
  mind.at = t;
  mind.kind = best?.kind;
  mind.key = best?.key;
  mind.plan = { goal: best ? [best.x, best.z] : [w.cx, w.cx], pos: [x0, z0], vel: [vx, vz], h, sp, held, slot, skill };
  return mind.plan;
}

// The word: the yaw toward the goal (round the corner of any block in the way, off a wall it's nose-in
// to), the gas, the brake to take a goal inside its turning circle, a drift through a wide turn at speed,
// backing out when it's stuck, and its power-up when it pays.
function drive(view, me, bot, t) {
  const p = plan(view, me, bot);
  if (!p) return null;
  const w = fieldOf(view);
  const mind = bot?.mem ?? {};
  const [x0, z0] = p.pos;
  let [gx, gz] = p.goal;
  // a block in the way: aim past its nearer corner
  const blk = blocked(w, x0, z0, gx, gz, 1.2);
  if (blk) {
    const B = MC.KT_BLOCK + 2.2;
    let pick = null, pd = Infinity;
    for (const [cx, cz] of [[blk.x - B, blk.z - B], [blk.x + B, blk.z - B], [blk.x - B, blk.z + B], [blk.x + B, blk.z + B]]) {
      if (blocked(w, x0, z0, cx, cz, 0.9)) continue;
      const dd = Math.hypot(cx - x0, cz - z0) + Math.hypot(gx - cx, gz - cz);
      if (dd < pd) { pd = dd; pick = [cx, cz]; }
    }
    if (pick) [gx, gz] = pick;
  }
  const dx = gx - x0, dz = gz - z0, d = Math.hypot(dx, dz);
  let yaw = Math.atan2(dz, dx);
  const off = wrap(yaw - p.h);
  let move = 1, hop = 0, use = false;
  // stuck nose-in to a wall or a block: back out a while, turned away
  mind.slow = p.sp < 1.5 ? (mind.slow ?? 0) + 1 : 0;
  if (mind.slow > 12 && !(mind.back > 0)) mind.back = 14 + Math.floor((bot?.rand?.() ?? 0.5) * 10);
  if (mind.back > 0) {
    mind.back--;
    mind.slow = 0;
    return { yaw: p.h + 0.9, move: 2, hop: 0, use: false };
  }
  // a goal inside its turning circle: off the gas, then the brake
  if (Math.abs(off) > 1.2 && d < 9) move = p.sp > 7 ? 2 : p.sp > 4 ? 0 : 1;
  else if (Math.abs(off) > 0.7 && d < 4 && p.sp > 6) move = 0;
  // a drift through a wide turn at speed, held till it's round
  if (mind.drift) {
    if (Math.abs(off) < 0.2 || p.sp < 6) mind.drift = false;
    else hop = 1;
  } else if (p.skill > 0.35 && p.sp > 10 && d > 8 && Math.abs(off) > 0.6 && Math.abs(off) < 2.4) {
    mind.drift = true;
    hop = 1;
  }
  // power-ups: a mushroom down a long straight, a rocket at a rival with coins ahead, MEGA and POW among rivals
  if (p.held && view.dv.getUint16(L.PLAYERS + p.slot * L.PSIZE + L.P_REFIRE, true) === 0) {
    const look = (b, cone, r) => {
      const ex = b.x - x0, ez = b.z - z0, e = Math.hypot(ex, ez) || 1;
      return e < r && (ex * Math.cos(yaw) + ez * Math.sin(yaw)) / e > cone && !blocked(w, x0, z0, b.x, b.z, 0.3);
    };
    const rivals = w.balls.filter((b) => b.slot !== p.slot);
    switch (p.held) {
      case L.PU_DASH: use = d > 14 && Math.abs(off) < 0.15; break;
      case L.PU_ROCKET: {
        const tgt = rivals.find((b) => b.score > 0 && look(b, 0.985, 26));
        if (tgt) { yaw = Math.atan2(tgt.z - z0, tgt.x - x0); use = true; }
        break;
      }
      case L.PU_MEGA: use = rivals.some((b) => Math.hypot(b.x - x0, b.z - z0) < 14); break;
      case L.PU_POW: use = rivals.filter((b) => b.score > 0 && Math.hypot(b.x - x0, b.z - z0) < 9).length >= 2; break;
      case L.PU_SPRING: use = rivals.some((b) => b.score > 2 && Math.hypot(b.x - x0, b.z - z0) < 5); break;
      default:
    }
  }
  return { yaw, move, hop, use };
}
