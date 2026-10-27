// PARRY BALL, as drawn and as the AI ball sees it. A dark slate disc in a
// low rubber rim, under the night sky; the orbs are balls of light, each
// with a beam to the ball it hunts, whose ring on the floor turns red. The
// orbs are the confirmed world's (PG_S), and each is drawn flown on along
// its homing path to the prediction's tick, worked here as $py_fly works it,
// with the ball it hunts where the prediction has yours and where the others
// are heading: so the orb coming at you is where it is when your click lands.
// Hunted, your reach is a ring round your ball (the orb inside it, click),
// and the ball you face, the one a parry sends it to, is marked. From 60 s
// the rim moves in, its last place glowing on the floor from 50 s.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/parry.mjs'; // PY_*: the minigame's own constants
import { PLAT_Y, B_RAD } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL, COLS } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const HH = 0.5; // the floor's half height, m
const FLOOR = [0.2, 0.22, 0.27];
const PLAY = [0.27, 0.3, 0.36];
const RIM = [0.08, 0.08, 0.1];
const ORB = [0.55, 0.9, 1];
const HOT = [1, 0.18, 0.12];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const luck = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 7, 0x165667b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 2 ** 32; };

// ---- what the sim keeps, read

// The disc on the view's bank.
export function sched(view) {
  const dv = view.dv, o = view.bank || 0;
  return { rad: dv.getFloat32(L.PG_H + MC.PY_RAD + o, true), rfin: dv.getFloat32(L.PG_H + MC.PY_RFINAL + o, true),
    norb: dv.getUint32(L.PG_H + MC.PY_NORB + o, true), cx: dv.getFloat32(L.PG_CX + o, true) };
}
// The rim's radius on tick t into play ($py_rim; a fraction for drawing).
export function rimAt(s, t) {
  if (t <= MC.PY_SHRINK0) return s.rad;
  if (t >= MC.PY_SHRINK1) return s.rfin;
  return s.rad + (s.rfin - s.rad) * (t - MC.PY_SHRINK0) / (MC.PY_SHRINK1 - MC.PY_SHRINK0);
}
export const base = (t) => MC.PY_S0 + t * MC.PY_SKT;
export const reach = (sp) => MC.PY_REACH0 + sp * MC.PY_WIN;
// The orbs not idle (PG_S, the confirmed world's).
export function orbs(view) {
  const dv = view.dv, u8 = view.u8, out = [];
  for (let k = 0; k < MC.PY_NMAX; k++) {
    const a = L.PG_S + MC.PY_ORB + k * MC.PY_OSIZE;
    const st = u8[a + MC.PY_OST];
    if (st === MC.PY_IDLE) continue;
    out.push({ k, st, tgt: u8[a + MC.PY_OTGT], by: u8[a + MC.PY_OBY], rally: u8[a + MC.PY_ORALLY], at: dv.getUint32(a + MC.PY_OAT, true),
      x: dv.getFloat32(a + MC.PY_OX, true), z: dv.getFloat32(a + MC.PY_OZ, true), dx: dv.getFloat32(a + MC.PY_ODX, true), dz: dv.getFloat32(a + MC.PY_ODZ, true),
      sp: dv.getFloat32(a + MC.PY_OSP, true), last: u8[a + MC.PY_OLAST] });
  }
  return out;
}
// Slot p's clicks: the tick into play its parry is locked till, its parries and misses.
export function clicks(view, p) {
  const a = L.PG_S + MC.PY_SLOT + p * 8, dv = view.dv;
  return { lock: dv.getUint16(a + MC.PY_LOCKT, true), parries: dv.getUint16(a + MC.PY_PARRIES, true), whiffs: dv.getUint16(a + MC.PY_WHIFFS, true) };
}

// Orb o (a copy, changed) flown n whole ticks on from tick t into play (the
// next the sim plays), as $py_fly flies it, with the ball it hunts at at(k)
// ([x, z] k ticks on, k from 1): stops where it would hit. Then frac of one
// more tick, for drawing.
export function fly(o, t, n, at, frac = 0) {
  o.hit = false;
  for (let k = 0; k <= n; k++) {
    const f = k < n ? 1 : frac;
    if (f <= 0) break;
    const tt = t + k;
    if (o.st === MC.PY_WAIT) {
      if (tt < o.at) continue;
      if (f < 1) break;
    }
    const [tx, tz] = at(k + 1);
    let dx = tx - o.x, dz = tz - o.z;
    const dist = Math.hypot(dx, dz);
    const ux = dist > 0.001 ? dx / dist : o.dx, uz = dist > 0.001 ? dz / dist : o.dz;
    if (o.st === MC.PY_WAIT) { o.st = MC.PY_FLY; o.at = tt; o.dx = ux; o.dz = uz; }
    const sp = Math.max(o.sp, base(tt));
    if (dist <= reach(sp)) { o.dx = ux; o.dz = uz; } else {
      const rate = Math.min(MC.PY_TURN0 + (tt - o.at) * MC.PY_TURNK, MC.PY_TURN1);
      const sg = o.dx * uz - o.dz * ux >= 0 ? rate : -rate;
      let nx = o.dx - o.dz * sg, nz = o.dz + o.dx * sg;
      const len = Math.hypot(nx, nz);
      nx /= len; nz /= len;
      if ((nx * uz - nz * ux) * sg <= 0 && nx * ux + nz * uz > 0) { o.dx = ux; o.dz = uz; } else { o.dx = nx; o.dz = nz; }
    }
    o.x += o.dx * sp * TICK * f;
    o.z += o.dz * sp * TICK * f;
    if (f === 1) o.sp = sp;
    dx = tx - o.x; dz = tz - o.z;
    if (dx * dx + dz * dz <= MC.PY_HIT * MC.PY_HIT) {
      // held at the ball's skin, as it lands
      const d = Math.hypot(dx, dz) || 1;
      o.x = tx - (dx / d) * MC.PY_HIT; o.z = tz - (dz / d) * MC.PY_HIT;
      o.hit = true;
      break;
    }
  }
  return o;
}

// Where slot p is k ticks past the view's tick: yours (with the prediction)
// slid from the confirmed ball to the predicted one over the ticks between,
// the rest on their way.
function pathOf(view, p, own) {
  const a = L.PLAYERS + p * L.PSIZE, dv = view.dv;
  const x = dv.getFloat32(a + L.P_PX, true), z = dv.getFloat32(a + L.P_PZ, true);
  const vx = dv.getFloat32(a + L.P_VX, true), vz = dv.getFloat32(a + L.P_VZ, true);
  if (own) {
    const span = Math.max(1, own.n);
    return (k) => (k >= span ? [own.x + own.vx * (k - span) * TICK, own.z + own.vz * (k - span) * TICK] : [x + (own.x - x) * k / span, z + (own.z - z) * k / span]);
  }
  return (k) => [x + vx * k * TICK, z + vz * k * TICK];
}

// How near a parry at speed sp (before it) may send the orb, m: PY_SEND s of its new speed's flight, past both balls' skins.
export const sendMin = (sp) => Math.min(sp * MC.PY_UP, MC.PY_SMAX) * MC.PY_SEND + MC.PY_HIT + B_RAD;
// The ball slot p's parry would send an orb to, facing yaw ($py_pick), from
// (x, z), at least min off (with none that far, the farthest): [slot, inCone] or null.
export function victim(view, p, x, z, yaw, hunted, min = 0) {
  const dv = view.dv, u8 = view.u8;
  const fx = Math.cos(yaw), fz = Math.sin(yaw);
  for (let pass = 0; pass < 4; pass++) {
    let cone = -1, any = -1, bc = Infinity, ba = Infinity, bf = -1;
    for (let q = 0; q < L.NPLAYER; q++) {
      if (q === p) continue;
      const a = L.PLAYERS + q * L.PSIZE;
      if ((u8[a + L.P_FL] & (L.PF_LIVE | L.PF_DEAD | L.PF_FALL)) !== L.PF_LIVE) continue;
      if (!(pass & 1) && hunted?.has(q)) continue;
      const dx = dv.getFloat32(a + L.P_PX, true) - x, dz = dv.getFloat32(a + L.P_PZ, true) - z, d2 = dx * dx + dz * dz;
      if (pass >= 2) { if (d2 >= bf) { bf = d2; any = q; } continue; }
      if (d2 < min * min) continue;
      if (d2 < ba) { ba = d2; any = q; }
      if (d2 < bc && d2 > 0 && dx * fx + dz * fz >= MC.PY_CONE * Math.sqrt(d2)) { bc = d2; cone = q; }
    }
    if (cone >= 0) return [cone, true];
    if (any >= 0) return [any, false];
  }
  return null;
}

// Ticks into play to draw at (fractional; the prediction's clock if given), -1 before play; frozen where the round ended.
function playTime(view, g, ctx) {
  if (g.state !== L.H_PLAY && g.state !== L.H_OVER) return -1;
  let t = typeof ctx?.pt === 'number' && ctx.pt > 0 ? ctx.pt / TICK : typeof ctx?.t === 'number' && ctx.t > 0 ? ctx.t / TICK : g.t + (ctx?.dt || 0) / TICK;
  if (g.state === L.H_OVER) t = Math.min(t, (g.until - L.P_OVER - g.start) | 0);
  return Math.max(0, t);
}

// ---- the AI ball

// What every AI ball looking at one world tick shares: the disc, the clock,
// the orbs, and which balls they hunt.
function worldOf(view) {
  const o = view.bank || 0;
  const w0 = view._py;
  if (w0 && w0.tick === view.tick && w0.bank === o) return w0;
  const dv = view.dv;
  const s = sched(view);
  const state = dv.getUint32(L.HDR_STATE + o, true);
  const start = dv.getUint32(L.HDR_START + o, true);
  const t = state === L.H_PLAY ? (view.tick - start) | 0 : 0;
  const list = state === L.H_PLAY || state === L.H_COUNT ? orbs(view) : [];
  const hunted = new Set(list.map((b) => b.tgt));
  // where each orb and each hunted ball is, for danger to look through
  const marks = [];
  for (const b of list) {
    const a = L.PLAYERS + b.tgt * L.PSIZE;
    marks.push({ x: b.x, z: b.z, orb: true, tgt: b.tgt });
    marks.push({ x: dv.getFloat32(a + L.P_PX, true), z: dv.getFloat32(a + L.P_PZ, true), orb: false, tgt: b.tgt });
  }
  view._py = { tick: view.tick, bank: o, s, t, start, state, orbs: list, hunted, marks };
  return view._py;
}
const slotOf = (me) => (typeof me === 'number' ? me : me?.slot);

// Hunted by an orb in flight: face the ball the parry should go to (the
// nearest no orb hunts and far enough off for the parry to go to, so it has
// the least time) and click when the orb, flown on to the tick this word is
// for, is inside the reach by the share this ball means to let it in (each
// incoming its own, from luck; now and then too early, the less skilled the
// more). Not before it has seen the orb come at it for its reaction time,
// and not again within a lock of its last click (it can't yet see whether
// that one parried).
function parry(view, w, mine, bot, tick) {
  const slot = mine.slot;
  const mem = bot?.mem || (bot ? (bot.mem = {}) : {});
  const lagN = Math.max(0, Math.min(60, (tick - view.tick) | 0));
  const mx = bot?.pos?.[0] ?? mine.pos[0], mz = bot?.pos?.[1] ?? mine.pos[2];
  const own = { x: mx, z: mz, vx: bot?.vel?.[0] ?? mine.vel[0], vz: bot?.vel?.[1] ?? mine.vel[2], n: lagN };
  const skill = bot?.skill ?? 0.6;
  let best = null;
  for (const o of w.orbs) {
    if (o.tgt !== slot || o.st !== MC.PY_FLY) continue;
    const f = fly({ ...o }, w.t, lagN, pathOf(view, slot, own));
    const d = Math.hypot(f.x - mx, f.z - mz);
    const eta = Math.max(0, d - MC.PY_HIT) / Math.max(1, f.sp);
    if (!best || eta < best.eta) best = { o, f, d, eta };
  }
  if (!best) return null;
  const { o, f, d } = best;
  // when it first saw this one coming (a launch or a parry is a new one)
  const key = `${o.k}:${o.at}`;
  mem.pySeen = mem.pySeen || {};
  if (mem.pySeen[key] === undefined) mem.pySeen[key] = view.tick;
  const react = Math.round((0.24 - 0.16 * skill) / TICK);
  const r = reach(f.sp);
  const u = luck(slot * 977 + o.k, o.at * 31 + o.rally);
  const early = luck(o.at + 3, slot * 13 + o.rally) < 0.03 + 0.14 * (1 - skill);
  const share = early ? 1.35 + 0.3 * u : 0.35 + 0.5 * u;
  const clickAt = mem.pyClick ?? -1e9;
  const locked = clickAt > tick - MC.PY_LOCK - 2 || clicks(view, slot).lock > w.t + lagN;
  const use = !locked && view.tick - mem.pySeen[key] >= react && d <= r * share;
  if (use) mem.pyClick = tick;
  if (best.eta > 0.9 && !use) return null;
  // face the one to send it to (no facing given: the nearest it may go to)
  const v = victim(view, slot, mx, mz, NaN, w.hunted, sendMin(f.sp));
  const a = v && L.PLAYERS + v[0] * L.PSIZE;
  const yaw = v ? Math.atan2(view.dv.getFloat32(a + L.P_PZ, true) - mz, view.dv.getFloat32(a + L.P_PX, true) - mx) : Math.atan2(o.dz, o.dx) + Math.PI;
  return { yaw, move: 0, hop: 0, use: use ? 1 : 0 };
}

export default {
  id: L.MG_PARRY, key: 'parry', name: 'PARRY BALL',
  hint: 'CLICK WHEN THE ORB IS IN YOUR RING  IT GOES TO WHO YOU FACE',
  rules: 'HIT BY AN ORB AND YOU ARE OUT  THE LAST ONE IN WINS',
  env: 'night',

  draw(view, ctx, out) {
    const s = sched(view);
    if (!(s.rad > 0)) return;
    const g = view.party();
    const tp = playTime(view, g, ctx);
    const tt = Math.max(0, tp);
    const sc = out.scene, cx = s.cx;
    const now = (ctx?.now ?? 0) / 1000;
    const R = rimAt(s, tt);
    // the floor, the play inside the rim lighter, the rim's low wall in segments round it
    sc.cyl(cx, PLAT_Y - HH, cx, s.rad + 1.5, HH, ...FLOOR, LOOK.MATTE);
    sc.cyl(cx, PLAT_Y - HH + 0.005, cx, R, HH, ...PLAY, LOOK.MATTE);
    const n = Math.max(24, Math.ceil((2 * Math.PI * R) / 1.6));
    const closing = tp >= 0 && tt > MC.PY_SHRINK0 && tt < MC.PY_SHRINK1;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * 2 * Math.PI;
      const rr = R + 0.25;
      sc.box(cx + Math.cos(a) * rr, PLAT_Y + MC.PY_RIM_H / 2, cx + Math.sin(a) * rr, 0.25, MC.PY_RIM_H / 2, (Math.PI * rr) / n * 1.04, a, ...RIM, LOOK.RUBBER);
    }
    // a glow line along the rim's top, pulsing while it moves; its last place shown from 10 s before
    out.decals.push({ pos: [cx, PLAT_Y + 0.02, cx], radius: R, width: 0.3, color: closing ? [1, 0.4, 0.2, 0.5 + 0.3 * Math.sin(now * 6)] : [0.4, 0.75, 1, 0.45], kind: DECAL.RING });
    if (tp >= 0 && tt > MC.PY_SHRINK0 - 1250 && tt < MC.PY_SHRINK1) out.decals.push({ pos: [cx, PLAT_Y + 0.02, cx], radius: s.rfin, width: 0.25, color: [1, 0.5, 0.2, 0.35], kind: DECAL.RING });
    if (g.state !== L.H_PLAY && g.state !== L.H_COUNT && g.state !== L.H_OVER) return;
    // the orbs, flown on to the prediction's tick (the confirmed world's, frozen once over)
    const mine = ctx?.pme && !ctx.pme.out ? ctx.pme : null;
    const ptick = typeof ctx?.ptick === 'number' ? ctx.ptick : g.tick + (ctx?.dt || 0) / TICK;
    const ahead = g.state === L.H_PLAY ? Math.max(0, Math.min(60, ptick - g.tick)) : 0;
    const whole = Math.floor(ahead), frac = ahead - whole;
    const dvb = view.dv;
    const dt = ctx?.dt || 0;
    const ballAt = (p) => {
      if (mine && p === ctx.slot) return ctx.own ? [ctx.own[0], ctx.own[1], ctx.own[2]] : [mine.pos[0], mine.pos[1], mine.pos[2]];
      const a = L.PLAYERS + p * L.PSIZE;
      return [0, 1, 2].map((i) => dvb.getFloat32(a + L.P_PX + 4 * i, true) + dvb.getFloat32(a + L.P_VX + 4 * i, true) * dt);
    };
    const own = mine ? { x: (ctx.own || mine.pos)[0], z: (ctx.own || mine.pos)[2], vx: mine.vel[0], vz: mine.vel[2], n: ahead } : null;
    const list = orbs(view);
    for (const o of list) {
      const path = pathOf(view, o.tgt, o.tgt === ctx?.slot ? own : null);
      const f = fly({ ...o }, g.t, whole, path, frac);
      const bob = o.st === MC.PY_WAIT && f.st === MC.PY_WAIT ? 0.25 * Math.sin(now * 3 + o.k) : 0;
      const y = PLAT_Y + MC.PY_Y + bob;
      const heat = clamp01((f.sp - MC.PY_S0) / (MC.PY_SMAX - MC.PY_S0));
      const col = [ORB[0] + (HOT[0] - ORB[0]) * heat, ORB[1] + (HOT[1] - ORB[1]) * heat, ORB[2] + (HOT[2] - ORB[2]) * heat];
      out.solid.push({ pos: [f.x, y, f.z], size: 0.55, color: [...col, 1], kind: SPRITE.ORB, minpx: 3 });
      out.glow.push({ pos: [f.x, y, f.z], size: 1.3 + 0.6 * heat, color: [...col, 0.75], kind: SPRITE.FLASH, minpx: 2 });
      if (f.st === MC.PY_FLY) for (let k = 1; k <= 4; k++) {
        const back = k * 0.012 * f.sp;
        out.glow.push({ pos: [f.x - f.dx * back, y, f.z - f.dz * back], size: 0.9 - 0.15 * k, color: [...col, 0.4 - 0.08 * k], kind: SPRITE.FLASH, minpx: 1 });
      }
      // the beam to the ball it hunts, and its ring red
      const tb = ballAt(o.tgt);
      const tgtIn = (view.u8[L.PLAYERS + o.tgt * L.PSIZE + L.P_FL] & (L.PF_LIVE | L.PF_DEAD)) === L.PF_LIVE;
      if (!tgtIn) continue;
      const pulse = 0.5 + 0.5 * Math.sin(now * 10 + o.k);
      out.beams.push({ a: [f.x, y, f.z], b: [tb[0], tb[1] + B_RAD, tb[2]], width: 0.06 + 0.05 * pulse, color: [1, 0.25, 0.2, 0.35 + 0.25 * pulse] });
      out.glow.push({ pos: [tb[0], tb[1] + B_RAD, tb[2]], size: B_RAD * 1.5, color: [1, 0.2, 0.15, 0.45 + 0.3 * pulse], kind: SPRITE.RING, minpx: 1 });
      out.decals.push({ pos: [tb[0], PLAT_Y + 0.03, tb[2]], radius: 1.6, width: 0.35, color: [1, 0.15, 0.1, 0.8], kind: DECAL.RING });
      // yours: your reach round you, white with the orb in it, and the ball you'd send it to
      if (mine && o.tgt === ctx.slot && f.st === MC.PY_FLY) {
        const r = reach(f.sp), d = Math.hypot(f.x - tb[0], f.z - tb[2]);
        const inside = d <= r;
        const locked = clicks(view, ctx.slot).lock > g.t + ahead;
        out.decals.push({ pos: [tb[0], PLAT_Y + 0.04, tb[2]], radius: r, width: inside ? 0.4 : 0.18,
          color: locked ? [0.5, 0.5, 0.5, 0.5] : inside ? [1, 1, 1, 0.9] : [1, 0.4, 0.3, 0.3 + 0.4 * clamp01(1 - (d - r) / (2 * r))], kind: DECAL.RING });
        const v = victim(view, ctx.slot, tb[0], tb[2], mine.yaw, new Set(list.filter((b) => b.k !== o.k).map((b) => b.tgt)), sendMin(f.sp));
        if (v) {
          const vb = ballAt(v[0]);
          out.decals.push({ pos: [vb[0], PLAT_Y + 0.03, vb[2]], radius: 1.9, width: 0.2, color: v[1] ? [1, 0.85, 0.3, 0.7] : [1, 0.85, 0.3, 0.3], kind: DECAL.RING });
        }
      }
    }
  },

  // the disc as the rim stands now
  frame(view) {
    const s = sched(view);
    const g = view.party();
    const t = g.state === L.H_PLAY ? Math.max(0, g.t) : 0;
    return { centre: [s.cx || g.cx, PLAT_Y, s.cx || g.cx], radius: (s.rad > 0 ? rimAt(s, t) : g.size) + 0.5, shape: 'disc' };
  },

  fx(fx, ctx) {
    const d = typeof ctx.dist === 'function' ? ctx.dist(fx.pos) : ctx.dist ?? 0;
    const near = Math.min(1, 14 / (d + 10));
    if (fx.kind === MC.PY_FX_PARRY) {
      const to = fx.shot & 255;
      const heat = clamp01((fx.size - MC.PY_S0) / (MC.PY_SMAX - MC.PY_S0));
      ctx.glow?.({ pos: fx.pos, size: 2.2 + 1.5 * heat, color: [1, 1, 1, 0.9], kind: SPRITE.SPARK, life: 250 });
      ctx.glow?.({ pos: fx.pos, size: 3, color: [0.6, 0.9, 1, 0.8], kind: SPRITE.RING, life: 300, grow: true });
      ctx.sound?.boing?.(10 + fx.size * 0.4, d);
      if (fx.owner === ctx.slot) {
        ctx.banner?.(to === ctx.slot ? 'PARRIED!' : `PARRIED!  TO ${ctx.name ? ctx.name(to) : `P${to + 1}`}`, C.GREEN, 900);
        ctx.sound?.pickup?.();
      } else if (to === ctx.slot) {
        ctx.banner?.(`${ctx.name ? ctx.name(fx.owner) : `P${fx.owner + 1}`} SENT IT AT YOU!`, C.RED, 1000);
        ctx.sound?.hurt?.(false);
      }
    } else if (fx.kind === MC.PY_FX_HIT) {
      ctx.glow?.({ pos: fx.pos, size: 6, color: [1, 0.45, 0.3, 0.95], kind: SPRITE.FLASH, life: 500, grow: true });
      ctx.glow?.({ pos: fx.pos, size: 4.5, color: [1, 0.8, 0.5, 0.9], kind: SPRITE.RING, life: 450, grow: true });
      ctx.glow?.({ pos: fx.pos, size: 2.5, color: [1, 1, 1, 1], kind: SPRITE.SPARK, life: 300 });
      ctx.sound?.blast?.(d, 3);
    } else if (fx.kind === MC.PY_FX_SERVE) {
      ctx.glow?.({ pos: fx.pos, size: 3, color: [0.6, 0.9, 1, 0.8], kind: SPRITE.RING, life: 500, grow: true });
      if (fx.owner === ctx.slot) {
        ctx.banner?.('THE ORB IS COMING FOR YOU', C.ORANGE, 1400);
        ctx.sound?.count?.(1);
      }
    } else if (fx.kind === MC.PY_FX_WHIFF) {
      ctx.glow?.({ pos: fx.pos, size: 1.4, color: [0.6, 0.6, 0.65, 0.5 * near], kind: SPRITE.RING, life: 250, grow: true });
      if (fx.owner === ctx.slot) {
        ctx.banner?.(fx.shot ? 'STILL LOCKED' : 'MISSED  LOCKED', C.GREY, 600);
        ctx.sound?.hurt?.(true);
      }
    }
  },

  // the feed for a ball out: every one is an orb's (nobody falls here), the KO to whoever sent it
  sink(f, name) {
    const who = name(f.owner);
    return `${who} ${who === 'YOU' ? 'WERE' : 'WAS'} HIT` + (f.shot === 255 || f.shot === f.owner ? '' : `  ${name(f.shot)} SENT IT`);
  },

  // hunted or not, locked, the orbs' speed, your parries, the rim
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const s = sched(view);
    if (!(s.rad > 0)) return;
    const tt = typeof ctx.t === 'number' && ctx.t > 0 ? ctx.t / TICK : g.t;
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    const playing = me && me.live && !me.out;
    const list = orbs(view);
    if (playing) {
      const mineOrb = list.find((o) => o.tgt === ctx.slot);
      const c = clicks(view, ctx.slot);
      const blink = Math.floor((ctx.now || 0) / 200) & 1;
      if (c.lock > g.t) ctx.centre(row + 1, `LOCKED ${((c.lock - g.t) * TICK).toFixed(1)}`, C.GREY);
      if (mineOrb?.st === MC.PY_FLY) ctx.centre(row, 'IT\'S AFTER YOU!  CLICK WHEN IT\'S IN YOUR RING', blink ? C.RED : C.WHITE);
      else if (mineOrb) ctx.centre(row, `IT COMES FOR YOU IN ${(Math.max(0, mineOrb.at - tt) * TICK).toFixed(1)}`, C.ORANGE);
      ctx.right(4, `PARRIES ${c.parries}`, C.GREY);
    }
    const fast = list.reduce((m, o) => Math.max(m, o.st === MC.PY_FLY ? o.sp : 0), 0);
    ctx.right(3, `${list.length} ${list.length === 1 ? 'ORB' : 'ORBS'}` + (fast > 0 ? `  ${Math.round(fast)} M/S` : ''), C.GREY);
    if (tt > MC.PY_SHRINK0 - 625 && tt < MC.PY_SHRINK1) ctx.right(5, tt < MC.PY_SHRINK0 ? 'THE RIM CLOSES IN SOON' : 'THE RIM CLOSES IN', C.ORANGE);
  },

  brain: {
    // past the rim as it will be is the wall (a little), and near any ball
    // an orb hunts, or an orb, the worse the nearer: a parry there comes
    // your way before you'd see it
    danger(view, x, z, tick, me) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY) return 0;
      const s = w.s, t = (tick - w.start) | 0;
      const R = rimAt(s, Math.max(0, t));
      const rho = Math.hypot(x - s.cx, z - s.cx);
      let d = rho > R - 2 ? 0.3 : 0;
      const slot = slotOf(me);
      for (const m of w.marks) {
        if (m.tgt === slot) continue;
        const dx = x - m.x, dz = z - m.z, d2 = dx * dx + dz * dz;
        if (d2 >= 81) continue;
        const k = (1 - Math.sqrt(d2) / 9) * (m.orb ? 0.5 : 0.7);
        if (k > d) d = k;
      }
      return d;
    },
    // somewhere roomy: away from the hunted balls and the orbs (the nearer
    // the harder), in from the rim; with nothing near, a spot in the middle,
    // kept a while
    goal(view, me, bot) {
      const w = worldOf(view);
      const slot = slotOf(me);
      if (w.state !== L.H_PLAY || !me) return null;
      const s = w.s, cx = s.cx;
      const mx = bot?.pos?.[0] ?? me.pos[0], mz = bot?.pos?.[1] ?? me.pos[2];
      const R = rimAt(s, w.t + 250);
      let fx = 0, fz = 0;
      for (const m of w.marks) {
        if (m.tgt === slot && !m.orb) continue;
        const dx = mx - m.x, dz = mz - m.z, d2 = Math.max(1, dx * dx + dz * dz);
        if (d2 > 400) continue;
        fx += (dx / d2) * 12; fz += (dz / d2) * 12;
      }
      const rho = Math.hypot(mx - cx, mz - cx) || 1;
      const nx = (mx - cx) / rho, nz = (mz - cx) / rho;
      const edge = clamp01((7 - (R - rho)) / 5);
      const outw = fx * nx + fz * nz;
      if (outw > 0) { fx -= nx * outw * edge; fz -= nz * outw * edge; }
      fx -= nx * (Math.max(0, rho / R - 0.6) * 2 + 2 * edge);
      fz -= nz * (Math.max(0, rho / R - 0.6) * 2 + 2 * edge);
      const mem = bot?.mem || {};
      let gx, gz;
      if (Math.hypot(fx, fz) > 0.25) {
        const k = 8 / Math.hypot(fx, fz);
        gx = mx + fx * k; gz = mz + fz * k;
        mem.pyWander = null;
      } else {
        const v = mem.pyWander;
        if (!v || w.tick - v.at > 500 || Math.hypot(v.x - mx, v.z - mz) < 3) {
          const a = (bot?.rand?.() ?? luck(slot, w.tick)) * 2 * Math.PI, rr = R * 0.7 * Math.sqrt(bot?.rand?.() ?? 0.5);
          mem.pyWander = { x: cx + Math.cos(a) * rr, z: cx + Math.sin(a) * rr, at: w.tick };
        }
        gx = mem.pyWander.x; gz = mem.pyWander.z;
      }
      const gr = Math.hypot(gx - cx, gz - cx), lim = Math.max(1, R - 3);
      if (gr > lim) { gx = cx + ((gx - cx) * lim) / gr; gz = cx + ((gz - cx) * lim) / gr; }
      return [gx, gz];
    },
    hop() { return false; },
    // hunted, with the orb on its way: face and click (parry above); else the planner
    think(view, me, bot, tick = view.tick) {
      const w = worldOf(view);
      if (w.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      return parry(view, w, me, bot, tick);
    },
  },
};
