// SWISS ROLL, as drawn and as the AI ball sees it: bumper balls' wheel of
// Swiss cheese, its holes cut right through (party-render's CHEESE look: the
// wheel, then a shaft for each hole, open at both ends, darker the deeper),
// the rim crumbling in and the holes widening as the sim has them, crumbs
// dropping off the rim while it goes, and bumper's power-ups falling onto it.
// The wheel is worked out here from PG_H, the holes in PG_S and the tick into
// play, as $ch_floor has it, so the bots steer by what the sim does: away
// from every hole and the rim, for a power-up near, else at the rival best
// placed to be knocked in, from the side away from its nearest drop.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/cheese.mjs'; // CH_*: the minigame's own constants
import { PLAT_Y } from '../../src/party-view.mjs';
import { LOOK, SPRITE, DECAL, SHAPE } from '../party-render.mjs';
import { C } from '../font.mjs';

const TICK = 0.008;
const CHEESE = [1, 0.82, 0.35];
const HH = MC.CH_THICK / 2;
// the power-ups' colours, by PU_* (bumper's)
const PU_RGB = [[1, 1, 1], [1, 0.3, 0.25], [0.3, 0.8, 1], [1, 0.85, 0.2], [1, 0.55, 0.15], [0.5, 1, 0.45]];
const GRID = 4; // m, the danger grid's cells

// ---- the wheel, as the sim has it (PG_H and the holes, read once a world tick)

export function stage(view) {
  const o = view.bank || 0;
  if (view._ch && view._ch.tick === view.tick && view._ch.o === o) return view._ch;
  const dv = view.dv;
  const nh = Math.min(MC.CH_NHMAX, dv.getUint32(L.PG_H + o + MC.CH_NH, true));
  const holes = [];
  for (let k = 0; k < nh; k++) {
    const a = L.PG_S + MC.CH_HOLES + 16 * k;
    holes.push({ x: dv.getFloat32(a, true), z: dv.getFloat32(a + 4, true), r0: dv.getFloat32(a + 8, true) });
  }
  view._ch = { tick: view.tick, o, cx: dv.getFloat32(L.PG_CX + o, true), r0: dv.getFloat32(L.PG_H + o + MC.CH_RAD, true), holes, at: null };
  return view._ch;
}

// How far it has squeezed on tick t into play, fractional for drawing ($ch_squeeze).
export const squeeze = (t) => Math.min(Math.max(0, t) * Math.fround(1 / MC.CH_SHRINK), 1);
// The wheel on tick t into play: the rim's radius, and each hole's now ($ch_rim, $ch_hole_r).
export function wheel(st, t) {
  const f = squeeze(t);
  return { cx: st.cx, rim: st.r0 - Math.max(0, st.r0 - MC.CH_RMIN) * f, grow: f * 0.5 + 1, holes: st.holes, f };
}
// What is under (x, z): -1 cheese, k the hole, 255 past the rim ($ch_floor).
export function floorAt(w, x, z) {
  if ((x - w.cx) ** 2 + (z - w.cx) ** 2 >= w.rim * w.rim) return 255;
  for (let k = 0; k < w.holes.length; k++) {
    const h = w.holes[k], r = h.r0 * w.grow;
    if ((x - h.x) ** 2 + (z - h.z) ** 2 < r * r) return k;
  }
  return -1;
}
// How far (x, z) is from the nearest drop, a hole's edge or the rim (negative over one); `near` the holes to try.
export function edge(w, x, z, near = w.holes) {
  let e = w.rim - Math.hypot(x - w.cx, z - w.cx);
  for (const h of near) e = Math.min(e, Math.hypot(x - h.x, z - h.z) - h.r0 * w.grow);
  return e;
}
// The wheel on whole tick t, with the holes near each GRID cell (within 3 m of it), for danger's few reads.
function gridded(st, t) {
  if (st.at && st.at.t === t) return st.at;
  const w = wheel(st, t);
  const n = Math.ceil((2 * st.r0 + 2) / GRID), x0 = st.cx - st.r0 - 1;
  const cells = Array.from({ length: n * n }, () => []);
  for (const h of st.holes) {
    const r = h.r0 * w.grow + 3;
    for (let j = Math.max(0, Math.floor((h.z - r - x0) / GRID)); j <= Math.min(n - 1, Math.floor((h.z + r - x0) / GRID)); j++)
      for (let i = Math.max(0, Math.floor((h.x - r - x0) / GRID)); i <= Math.min(n - 1, Math.floor((h.x + r - x0) / GRID)); i++) cells[j * n + i].push(h);
  }
  st.at = { t, w, n, x0, cells };
  return st.at;
}

// Every ball in, once a world tick: [slot, x, z].
function balls(view) {
  if (view._chb?.tick === view.tick) return view._chb.list;
  const list = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const b = view.partier(p);
    if (b.live && !b.out && !b.falling) list.push([p, b.pos[0], b.pos[2]]);
  }
  view._chb = { tick: view.tick, list };
  return list;
}

const hash = (a) => { let s = Math.imul(a | 0, 2654435761) >>> 0; s ^= s >>> 15; s = Math.imul(s, 2246822519) >>> 0; s ^= s >>> 13; return s / 2 ** 32; };

export default {
  id: L.MG_CHEESE, key: 'cheese', name: 'SWISS ROLL',
  hint: 'BUMP THE OTHERS INTO THE HOLES  LAST ONE ROLLING WINS',
  env: 'day',

  draw(view, ctx, out) {
    const st = stage(view);
    if (!(st.r0 > 0)) return;
    const g = view.party();
    const sc = out.scene;
    const tp = g.state >= L.H_PLAY ? Math.max(0, (ctx?.pt ?? ctx?.t ?? 0) / TICK) : 0;
    const w = wheel(st, tp);
    // the wheel, and right after it each hole's shaft (party-render's CHEESE)
    sc.cyl(st.cx, PLAT_Y - HH, st.cx, w.rim, HH, ...CHEESE, LOOK.CHEESE, st.holes.length, 0, 1, 3);
    st.holes.forEach((h, k) => sc.put(SHAPE.CYL, h.x, PLAT_Y - HH, h.z, -h.r0 * w.grow, HH, h.r0 * w.grow, 0, ...CHEESE, LOOK.CHEESE, -(k + 1), 0, 1, 3));
    // crumbs off the rim while it crumbles: a dozen at a time, each falling for 0.9 s
    const now = ctx?.now ?? 0;
    if (g.state === L.H_PLAY && w.f > 0 && w.f < 1) {
      for (let i = 0; i < 12; i++) {
        const age = (now / 900 + i / 12) % 1, n = Math.floor(now / 900 + i / 12);
        const a = hash(n * 97 + i) * 2 * Math.PI, fall = 4.9 * (age * 0.9) ** 2;
        out.solid?.push({ pos: [st.cx + Math.cos(a) * (w.rim + 0.2), PLAT_Y - 0.2 - fall, st.cx + Math.sin(a) * (w.rim + 0.2)], size: 0.22 + 0.15 * hash(n * 31 + i), color: [...CHEESE, 1], kind: SPRITE.CRUMB, minpx: 1, seed: i });
      }
    }
    // the power-ups: a target where one will land and a streak as it falls, then on the cheese, bobbing
    const dt = ctx?.dt || 0;
    for (let k = 0; k < MC.CH_NORB; k++) {
      const o = L.PG_S + MC.CH_ORBS + 16 * k;
      const kind = view.u8[o + 12];
      if (!kind || !PU_RGB[kind]) continue;
      const x = view.dv.getFloat32(o, true), z = view.dv.getFloat32(o + 8, true);
      const falling = view.u8[o + 13] === 1;
      const y = falling ? view.dv.getFloat32(o + 4, true) - 10 * dt : PLAT_Y + 0.6 + 0.15 * Math.sin(now / 333 + k);
      const rgb = PU_RGB[kind];
      out.casters?.push([x, y, z, -0.6]);
      out.solid?.push({ pos: [x, y, z], size: 0.6, color: [...rgb, 1], kind: SPRITE.ORB, minpx: 2 });
      out.glow?.push({ pos: [x, y, z], size: 1.5, color: [...rgb, 0.5], kind: SPRITE.FLASH, minpx: 2 });
      if (falling && y > PLAT_Y) {
        out.beams?.push({ a: [x, y + 5, z], b: [x, y, z], width: 0.12, color: [...rgb, 0.35] });
        out.decals?.push({ pos: [x, PLAT_Y, z], radius: 1.4, width: 0.25, color: [...rgb, 0.85], kind: DECAL.TARGET });
      }
    }
  },

  frame(view) {
    const st = stage(view);
    const g = view.party();
    return { centre: [st.cx || g.cx, PLAT_Y, st.cx || g.cx], radius: st.r0 || g.size, shape: 'disc' };
  },

  fx() {},

  // how long the rim has left to crumble
  hud(view, ctx) {
    const g = view.party();
    if (g.state !== L.H_PLAY) return;
    const t = typeof ctx.t === 'number' ? ctx.t / TICK : g.t;
    const left = MC.CH_SHRINK - t;
    ctx.right(3, left > 0 ? `THE RIM CRUMBLES  ${Math.ceil(left * TICK)}` : 'THE CHEESE HOLDS', left > 0 ? C.ORANGE : C.GREY);
  },

  brain: {
    // over a hole or past the rim is a fall; the last 2 m before one a warning
    danger(view, x, z, tick) {
      const st = stage(view);
      const o = view.bank || 0;
      const t = view.dv.getUint32(L.HDR_STATE + o, true) >= L.H_PLAY ? Math.max(0, ((tick ?? view.tick) - view.dv.getUint32(L.HDR_START + o, true)) | 0) : 0;
      const a = gridded(st, t);
      const i = Math.floor((x - a.x0) / GRID), j = Math.floor((z - a.x0) / GRID);
      const e = edge(a.w, x, z, i >= 0 && j >= 0 && i < a.n && j < a.n ? a.cells[j * a.n + i] : []);
      return e <= 0 ? 1 : e < 2 ? ((2 - e) / 2) * 0.7 : 0;
    },
    // a power-up near and its hands free, else the rival nearest a drop (from the side away from it), else the middle;
    // a rival held a second at a time
    goal(view, me, bot) {
      const st = stage(view);
      const g = view.party();
      const w = gridded(st, g.t).w;
      const [px, pz] = bot.pos;
      if (!me.item) {
        let best = 26, at = null;
        for (let k = 0; k < MC.CH_NORB; k++) {
          const o = L.PG_S + MC.CH_ORBS + 16 * k;
          if (!view.u8[o + 12]) continue;
          const x = view.dv.getFloat32(o, true), z = view.dv.getFloat32(o + 8, true);
          const d = Math.hypot(x - px, z - pz);
          if (d < best && edge(w, x, z) > 1) { best = d; at = [x, z]; }
        }
        if (at) return at;
      }
      const m = bot.mem;
      if (!(m.until > view.tick)) {
        m.until = view.tick + 125;
        m.who = -1;
        if (bot.rand() < 0.3 + 0.7 * bot.skill) {
          let best = Infinity;
          for (const [p, x, z] of balls(view)) {
            if (p === bot.slot) continue;
            const d = Math.hypot(x - px, z - pz);
            if (d > 30) continue;
            const s = d + 3 * Math.max(0, edge(w, x, z));
            if (s < best) { best = s; m.who = p; }
          }
        }
      }
      if (m.who >= 0) {
        const b = view.partier(m.who);
        if (b.live && !b.out && !b.falling) {
          // its nearest drop: come at it from the far side
          let ax = b.pos[0] - w.cx, az = b.pos[2] - w.cx, e = w.rim - Math.hypot(ax, az);
          for (const h of w.holes) {
            const hx = h.x - b.pos[0], hz = h.z - b.pos[2], d = Math.hypot(hx, hz) - h.r0 * w.grow;
            if (d < e) { e = d; ax = hx; az = hz; }
          }
          const n = Math.hypot(ax, az) || 1;
          return [b.pos[0] - (ax / n) * 1.2, b.pos[2] - (az / n) * 1.2];
        }
      }
      return [w.cx, w.cx];
    },
    hop() { return false; },
  },
};
