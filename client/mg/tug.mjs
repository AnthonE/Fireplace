// TUG O WAR, as drawn and as the AI ball sees it. Two wooden decks on posts
// over a mud lake, red's at low x and blue's at high x, a rail along each
// back; each deck's front TW_APRON is a flap, hinged at its back, that swings
// down into the pit when its side loses a pull and up again a second later.
// The band a ball holds the rope in is painted down each deck in its side's
// colour. The rope runs rail to rail at the riders' hands, knotted every 2 m,
// sliding with the flag (a cloth hanging from its middle, in the colour of
// the side whose half it is in), drawn TW_V on from the confirmed tick; the
// lines the flag must reach to win stand over the band as glowing gates,
// closing in through the pull. The HUD keeps the pulls, the holders a side,
// the flag's way and your hold on the rope.
import * as L from '../../src/layout.mjs';
import * as MC from '../../src/mg/tug.mjs'; // TW_*: the minigame's own constants
import { PLAT_Y, SIDES } from '../../src/party-view.mjs';
import { LOOK, SPRITE } from '../party-render.mjs';
import { C } from '../font.mjs';
import { team } from '../party-world.mjs';

const TICK = 0.008;
const HH = 0.4; // a deck's half thickness, m
const RY = 2.4; // the rope's height over the decks, at the riders' hands
const G2 = MC.TW_GAP / 2;
const WOOD = [[0.66, 0.47, 0.3], [0.6, 0.42, 0.27]];
const MUD = [0.33, 0.22, 0.13];
const ROPE = [0.86, 0.74, 0.5];
const RAIL = [0.48, 0.34, 0.22];
const SIDE_C = [C.RED, C.CYAN];

// ---- what the sim keeps, read

// The stage and the rope on the view's bank (the holders and the pulls from the confirmed world's PG_S);
// the confirmed world's kept on the view for its tick, as the AI asks for it 90 times a think.
export function stage(view) {
  const o = view.bank || 0;
  if (!o && view._tw?.tick === view.tick) return view._tw.st;
  const st = read(view, o);
  if (!o) view._tw = { tick: view.tick, st };
  return st;
}
function read(view, o) {
  const dv = view.dv, h = (k) => L.PG_H + k + o, u = (a) => dv.getUint32(a + o, true);
  const state = u(L.HDR_STATE);
  const log = [];
  const np = dv.getUint32(h(MC.TW_NP), true);
  for (let k = 0; k < Math.min(np, MC.TW_NLOG); k++) {
    const a = L.PG_S + MC.TW_LOG + 4 * k, w = view.u8[a];
    if (w) log.push({ k, side: (w & 3) - 1, decider: !!(w & 4), ticks: dv.getUint16(a + 2, true) });
  }
  return {
    d: dv.getFloat32(h(MC.TW_D), true), hw: dv.getFloat32(h(MC.TW_HW), true), band: dv.getFloat32(h(MC.TW_BAND), true),
    phase: dv.getUint32(h(MC.TW_PHASE), true), at: dv.getUint32(h(MC.TW_AT), true) | 0, from: dv.getUint32(h(MC.TW_FROM), true) | 0,
    m: dv.getFloat32(h(MC.TW_M), true), v: dv.getFloat32(h(MC.TW_V), true), tipAt: dv.getUint32(h(MC.TW_TIPAT), true) | 0, tips: dv.getUint32(h(MC.TW_TIPS), true),
    np, cx: dv.getFloat32(L.PG_CX + o, true), state, start: u(L.HDR_START) | 0, until: u(L.HDR_UNTIL) | 0, len: u(L.PG_LEN),
    t: state === L.H_PLAY ? (u(L.HDR_TICK) - u(L.HDR_START)) | 0 : 0,
    hold: [dv.getUint16(L.PG_S + MC.TW_HOLD, true), dv.getUint16(L.PG_S + MC.TW_HOLD + 2, true)],
    sum: [dv.getFloat32(L.PG_S + MC.TW_SUM, true), dv.getFloat32(L.PG_S + MC.TW_SUM + 4, true)],
    score: [u(L.PG_TSCORE), u(L.PG_TSCORE + 4)], log,
  };
}
// Side s's way out from the middle along x.
export const dir = (s) => (s ? 1 : -1);
// The line the flag must reach to win, m from the middle, t ticks into play (the pull on began at st.from).
export const winAt = (st, t) => (st.phase === MC.TW_P_PULL ? Math.max(MC.TW_WIN1, MC.TW_WIN0 - (t - st.from) * (MC.TW_WIN0 - MC.TW_WIN1) / MC.TW_CLOSE) : MC.TW_WIN0);
// How far (x, z) is into side s's deck from its front edge (negative: the pit, or past it), and across from the rope.
export const into = (st, s, x) => (x - st.cx) * dir(s) - G2;
// Is the deck under (x, z) on tick t into play: either one, not past its back or sides, not on a tipped front?
export function onDeck(st, x, z, t) {
  if (Math.abs(z - st.cx) > st.hw) return false;
  const u = Math.abs(x - st.cx) - G2;
  if (u < 0 || u > st.d) return false;
  return !(tipping(st, t) && u < MC.TW_APRON && (x > st.cx ? 1 : 0) === st.tips);
}
// Is a deck's front down on tick t into play?
export const tipping = (st, t) => st.tipAt > 0 && t >= st.tipAt && t < st.tipAt + MC.TW_TIP;
// Does ball b (a partier()) hold the rope, as $tw_holds has it?
export function holds(st, b) {
  if (!b || !b.live || b.out || b.falling || !b.ground) return false;
  const u = into(st, b.side, b.pos[0]);
  return u >= 0 && u <= st.d && Math.abs(b.pos[2] - st.cx) <= st.band;
}
// The side whose half of the middle the flag is in, -1 dead centre.
const flagSide = (m) => (m < 0 ? 0 : m > 0 ? 1 : -1);

// Ticks into play, fractional, on the given clock, held at the end through the result.
function playT(st, tick) {
  if (st.state !== L.H_PLAY && st.state !== L.H_OVER) return 0;
  const i = Math.floor(tick);
  let t = ((i - st.start) | 0) + tick - i;
  if (st.state === L.H_OVER) t = Math.min(t, (st.until - L.P_OVER - st.start) | 0);
  return Math.max(0, t);
}

// ---- drawing

// Side s's deck: the main boards and the front flap (swung down theta, about its back's top), a rail, the posts, the band.
function deck(sc, st, s, theta) {
  const a = dir(s), cx = st.cx, w = WOOD[s];
  const rest = st.d - MC.TW_APRON;
  sc.box(cx + a * (G2 + MC.TW_APRON + rest / 2), PLAT_Y - HH, cx, rest / 2, HH, st.hw, 0, ...w, LOOK.WOOD, 0, 0, 1, 11 + s);
  // the flap: its centre (A/2 toward the pit, HH down) from the hinge, turned down by theta
  const A2 = MC.TW_APRON / 2, c = Math.cos(theta), sn = Math.sin(theta);
  const fs = A2 * c - HH * sn, fy = -A2 * sn - HH * c;
  const hx = cx + a * (G2 + MC.TW_APRON);
  sc.box(hx - a * fs, PLAT_Y + fy, cx, st.hw, HH, A2, Math.PI / 2, ...w.map((v) => v * 0.94), LOOK.WOOD, 0, 0, 1, 21 + s, s ? theta : -theta);
  // the band painted down it (on the flap only while it's up)
  const col = SIDES[s].color;
  sc.box(cx + a * (G2 + MC.TW_APRON + rest / 2), PLAT_Y + 0.01, cx, rest / 2, 0.012, st.band, 0, ...col, LOOK.PAINT, 0, 0, 0.55, 31 + s);
  if (theta < 0.01) sc.box(cx + a * (G2 + A2), PLAT_Y + 0.01, cx, A2, 0.012, st.band, 0, ...col, LOOK.PAINT, 0, 0, 0.55, 41 + s);
  // the rail along the back, and posts down into the mud at the corners
  sc.box(cx + a * (G2 + st.d + 0.15), PLAT_Y + 0.35, cx, 0.15, 0.35, st.hw, 0, ...RAIL, LOOK.WOOD, 0, 0, 1, 51 + s);
  const py = (PLAT_Y - 2 * HH + PLAT_Y - MC.TW_MUD - 1) / 2, ph = (MC.TW_MUD + 1 - 2 * HH) / 2;
  for (const u of [MC.TW_APRON + 0.4, st.d - 0.4]) for (const sz of [-1, 1]) sc.cyl(cx + a * (G2 + u), py, cx + sz * (st.hw - 0.4), 0.3, ph, ...RAIL, LOOK.WOOD);
}

// The flap's swing on tick t (fractional): down fast as the front tips, back up as it ends.
function swing(st, t) {
  if (!(st.tipAt > 0)) return 0;
  const a = (t - st.tipAt) * TICK, len = MC.TW_TIP * TICK;
  if (a < 0 || a > len + 0.4) return 0;
  const down = Math.min(1, a / 0.18), up = a > len ? 1 - (a - len) / 0.4 : 1;
  return 1.25 * down * Math.max(0, up);
}

export default {
  id: L.MG_TUG, key: 'tug', name: 'TUG O WAR',
  hint: 'ON THE ROPE ROLL AWAY FROM THE MUD  HOP OVER TO KNOCK THEIRS OFF',
  rules: `FIRST SIDE TO ${MC.TW_BEST} PULLS WINS  THE MUD KEEPS YOU OUT ${MC.TW_RESPAWN / 125} S`,
  env: 'day',

  draw(view, ctx, out) {
    const st = stage(view);
    if (!(st.d > 0)) return;
    const sc = out.scene, cx = st.cx;
    const t = playT(st, ctx.ptick ?? ctx.tick + (ctx.dt || 0) / TICK);
    const now = (ctx.now ?? 0) / 1000;
    // the mud lake
    const ex = G2 + st.d + 14, ez = st.hw + 14;
    sc.box(cx, PLAT_Y - MC.TW_MUD - 2, cx, ex, 2, ez, 0, ...MUD, LOOK.MATTE, 0, 0, 1, 7);
    for (const s of [0, 1]) deck(sc, st, s, s === st.tips ? swing(st, t) : 0);
    // the rope rail to rail, the flag on it moved on from the confirmed tick at its speed
    const lim = G2 + st.d;
    const dt = st.state === L.H_PLAY ? Math.min(0.25, Math.max(0, ctx.dt || 0)) : 0;
    const m = Math.max(-lim, Math.min(lim, st.m + (st.phase === MC.TW_P_SET ? 0 : st.v * dt)));
    const ry = PLAT_Y + RY;
    sc.box(cx, ry, cx, lim, 0.13, 0.13, 0, ...ROPE, LOOK.MATTE, 0, 0, 1, 61);
    const k0 = Math.ceil((-lim - m) / 2), k1 = Math.floor((lim - m) / 2);
    for (let k = k0; k <= k1; k++) sc.sphere(cx + m + 2 * k, ry, cx, k === 0 ? 0.26 : 0.2, ...ROPE, LOOK.MATTE);
    // posts holding the rope up at each rail
    for (const s of [-1, 1]) sc.cyl(cx + s * (lim + 0.15), PLAT_Y + RY / 2, cx, 0.16, RY / 2 + 0.15, ...RAIL, LOOK.WOOD);
    const fs = flagSide(m), fc = fs < 0 ? [0.95, 0.95, 0.9] : SIDES[fs].color;
    sc.box(cx + m, ry - 0.6, cx, 0.06, 0.45, 0.45, 0, ...fc, LOOK.PLASTIC, 0, 0, 1, 71);
    out.glow.push({ pos: [cx + m, ry + 0.5, cx], size: 0.9, color: [...fc, 0.8], kind: SPRITE.FLASH });
    // the lines it must reach, gates over the band either side, closing in through the pull
    if (st.state === L.H_PLAY && st.phase <= MC.TW_P_PULL) {
      const w = winAt(st, t), pulse = 0.6 + 0.4 * Math.sin(now * 6);
      for (const s of [0, 1]) {
        const x = cx + dir(s) * w, col = SIDES[s].color;
        sc.box(x, PLAT_Y + 1.4, cx, 0.06, 1.4, st.band + 0.3, 0, ...col, LOOK.GLOW, pulse, 0.4, 0.3, 81 + s);
        for (const sz of [-1, 1]) sc.cyl(x, PLAT_Y + 1.5, cx + sz * (st.band + 0.4), 0.12, 1.5, ...col, LOOK.GLOW, 0.8, 0.4);
      }
    }
  },

  // the decks and the pit
  frame(view) {
    const st = stage(view);
    return { centre: [st.cx, PLAT_Y, st.cx], radius: Math.max(G2 + st.d, st.hw) + 1 || view.party().size, shape: 'square' };
  },

  fx(fx, ctx) {
    const v = ctx.view, me = v && ctx.slot >= 0 ? v.partier(ctx.slot) : null;
    const mine = me && me.live && v?.party().teams ? me.side : -1;
    if (fx.kind === MC.TW_FX_PULL) {
      ctx.sound?.count?.(0);
      ctx.banner?.(`PULL ${fx.shot}!`, C.YELLOW, 1100);
    } else if (fx.kind === MC.TW_FX_WON) {
      const s = fx.shot & 1, dec = fx.shot & 2;
      ctx.sound?.holed?.(s === mine ? 0 : 20);
      ctx.glow?.({ pos: fx.pos, size: 4, color: [...SIDES[s].color, 1], kind: SPRITE.FLASH, life: 600 });
      const what = dec ? 'THE DECIDER' : `PULL ${fx.shot >> 2}`;
      if (mine < 0) ctx.banner?.(`${SIDES[s].name} TAKES ${what}`, SIDE_C[s], 1800);
      else if (s === mine) ctx.banner?.(`YOUR SIDE TAKES ${what}!`, C.GREEN, 1800);
      else ctx.banner?.(`${what} LOST  GET OFF THE FRONT!`, C.RED, 1800);
      ctx.feed?.(`${SIDES[s].name} TAKES ${what} IN ${fx.size.toFixed(1)} S`, SIDE_C[s]);
    } else if (fx.kind === MC.TW_FX_TIP) {
      ctx.sound?.land?.(30);
      ctx.glow?.({ pos: fx.pos, size: 6, color: [0.55, 0.38, 0.22, 0.9], kind: SPRITE.RING, life: 700, grow: true });
    } else if (fx.kind === MC.TW_FX_MUD) {
      ctx.glow?.({ pos: fx.pos, size: 3.5, color: [0.45, 0.3, 0.17, 0.95], kind: SPRITE.RING, life: 800, grow: true });
      ctx.glow?.({ pos: [fx.pos[0], fx.pos[1] + 0.8, fx.pos[2]], size: 2.2, color: [0.5, 0.36, 0.22, 0.8], kind: SPRITE.FLASH, life: 350 });
      ctx.sound?.land?.(fx.owner === ctx.slot ? 24 : 10);
    }
  },

  // a fall of its own is into the mud; a knock, the usual line
  sink(f, name) { return f.shot !== 255 && f.shot !== f.owner ? null : `${name(f.owner)} IN THE MUD`; },

  // the pull, the flag's way and the lines, the holders; your hold
  hud(view, ctx) {
    const st = stage(view);
    if (st.state !== L.H_PLAY || !(st.d > 0)) return;
    const t = Math.max(0, typeof ctx.t === 'number' ? ctx.t / TICK : st.t);
    const row = Math.max(3, Math.floor((ctx.rows || 40) * 0.18));
    ctx.right(2, `FIRST TO ${MC.TW_BEST} PULLS  RED ${st.score[0]} BLUE ${st.score[1]}`, C.GREY);
    ctx.right(3, `ON THE ROPE  RED ${st.hold[0]}  BLUE ${st.hold[1]}`, C.GREY);
    if (st.phase === MC.TW_P_SET) ctx.centre(row, `SET... PULL ${st.np + 1} IN ${Math.max(0, (st.at - t) * TICK).toFixed(1)}`, C.YELLOW);
    if (st.phase === MC.TW_P_PULL) {
      const w = winAt(st, t), fs = flagSide(st.m);
      ctx.right(4, `FLAG ${Math.abs(st.m).toFixed(1)} M ${fs < 0 ? '' : `TO ${SIDES[fs].name}`}  LINES AT ${w.toFixed(1)}`, fs < 0 ? C.GREY : SIDE_C[fs]);
    }
    const me = ctx.me ?? (ctx.slot >= 0 ? view.partier(ctx.slot) : null);
    if (!me || !me.live || me.out) return;
    if (st.phase >= MC.TW_P_REEL && st.tips === me.side && t < st.tipAt + MC.TW_TIP) {
      if (onDeck(st, me.pos[0], me.pos[2], t) && into(st, me.side, me.pos[0]) < MC.TW_APRON + 1) ctx.centre(row + 1, `THE FRONT TIPS IN ${Math.max(0, (st.tipAt - t) * TICK).toFixed(1)}  GET BACK!`, C.RED);
    } else if (holds(st, me)) ctx.centre(row + 1, 'ON THE ROPE  ROLL AWAY FROM THE MUD', C.GREEN);
    else if (st.phase <= MC.TW_P_PULL && into(st, me.side, me.pos[0]) >= 0) ctx.centre(row + 1, `GET ON THE ROPE: THE ${SIDES[me.side].name} BAND`, C.GREY);
  },

  brain: {
    // off the decks on that tick is a fall; a front about to tip, the same;
    // near a side or the front edge, a risk
    danger(view, x, z, tick, me) {
      const st = stage(view);
      if (st.state !== L.H_PLAY) return 0;
      const t = (tick - st.start) | 0;
      if (!onDeck(st, x, z, t)) return 1;
      const u = Math.abs(x - st.cx) - G2;
      if (st.tipAt > 0 && u < MC.TW_APRON + 0.8 && (x > st.cx ? 1 : 0) === st.tips && t >= st.tipAt - 60 && t < st.tipAt + MC.TW_TIP + 20) return 1;
      let d = 0;
      if (st.hw - Math.abs(z - st.cx) < 1.4) d = 0.4;
      if (u < 1.2 || st.d - u < 0.8) d = Math.max(d, 0.3);
      return d;
    },

    // a spot in its band, spread along it by its place in its side, behind
    // the front; a raider's run-up or line-up (its job, in bot.mem)
    goal(view, me, bot) {
      const st = stage(view);
      if (st.state !== L.H_PLAY || !me || !me.live) return null;
      const j = job(view, st, me, bot);
      return j.goal;
    },

    think(view, me, bot, tick) {
      const st = stage(view);
      if (st.state !== L.H_PLAY || !me || !me.live || me.out) return null;
      const j = job(view, st, me, bot);
      return j.word;
    },

    hop() { return false; },
  },
};

// ---- the AI ball

// A ball's job for its next word: a raider (in a side of 3 or more, a fifth,
// at least one, turned each round) hops the pit and knocks the other side's
// holders off the rope across it; everyone else holds the rope and pulls,
// lets go and steps out of the band when dragged to the front edge, and
// gets off the front when its side has lost the pull. { goal, word }: word
// null leaves the steering to the planner, toward goal.
function job(view, st, me, bot) {
  const s = me.side, a = dir(s), cx = st.cx;
  const [px, pz] = bot?.pos ?? [me.pos[0], me.pos[2]];
  const [vx] = bot?.vel ?? [me.vel[0], me.vel[2]];
  const mem = bot?.mem ?? {};
  const { mates, foes } = team(view, me.slot);
  const m = mates.length + 1;
  const idx = mates.filter((b) => b.slot < me.slot).length;
  const nraid = m >= 3 ? Math.max(1, Math.floor(m / 5)) : 0;
  const raider = (idx + 3 * (view.party?.().round ?? 0)) % m < nraid;
  const t = st.t + Math.max(0, ((bot?.at ?? view.tick) - view.tick) | 0);
  const u = into(st, s, px);
  const spot = MC.TW_APRON + 1 + ((idx * 7) % 11) / 10 * Math.max(1, st.d - MC.TW_APRON - 3);
  const hold = [cx + a * (G2 + spot), cx + (((idx * 5) % 9) / 8 - 0.5) * st.band];
  // lost the pull: off the front, out of the band, until it has tipped
  if (st.phase >= MC.TW_P_REEL && st.tips === s && t < st.tipAt + MC.TW_TIP + 10) {
    if (u >= 0) return { goal: [cx + a * (G2 + Math.max(u, MC.TW_APRON + 3)), cx + (pz >= cx ? 1 : -1) * (st.band + 2.5)], word: null };
  }
  if (raider && st.phase <= MC.TW_P_PULL) {
    const r = raid(st, s, px, pz, vx, u, foes, mem, me.slot & 1 ? 1 : -1);
    if (r) return r;
  }
  if (u < 0) return { goal: hold, word: null }; // over the pit or beyond: home, if it can
  if (holds(st, { ...me, pos: [px, me.pos[1], pz] })) {
    // dragged near the front edge, or dragged forward far from its spot while the pull is set: let go, sideways
    const out = { goal: null, word: { yaw: Math.atan2(pz >= cx ? 1 : -1, 0), move: 1 } };
    if (u < 1.8 && st.v * a < -0.3) return out;
    if (st.phase === MC.TW_P_SET && spot - u > 3.5 && st.at - t > 60) return out;
    const off = pz - cx;
    return { goal: hold, word: { yaw: Math.atan2(Math.abs(off) > st.band * 0.6 ? -off * 0.25 : 0, a), move: 1 } };
  }
  return { goal: hold, word: null };
}

// A raider's word: from its own deck a run-up straight at the pit beside
// the rope, a hop off the front edge at speed (or back for another run if
// too slow); on the other deck, line up beside the nearest holder on the
// rope's side of it and charge across the band at it.
function raid(st, s, px, pz, vx, u, foes, mem, way) {
  const a = dir(s), cx = st.cx;
  const lane = cx + way * (st.band + 1.2);
  const vt = -vx * a; // toward the pit
  if (u >= 0) {
    if (mem.go && u < 2.6 && vt < 6.4) mem.go = false;
    if (!mem.go) {
      if (u > Math.min(9, st.d - 2)) mem.go = true;
      else return { goal: [cx + a * (G2 + Math.min(9.5, st.d - 1.5)), lane], word: null };
    }
    return { goal: null, word: { yaw: Math.atan2((lane - pz) * 0.3, -a), move: 1, hop: u < 1.5 && vt > 6.8 } };
  }
  const uf = into(st, 1 - s, px);
  if (uf < 0) return { goal: null, word: { yaw: Math.atan2(0, -a), move: 1 } }; // over the pit: on across
  mem.go = false;
  // the nearest foe on the rope
  let best = null, bd = Infinity;
  for (const b of foes) {
    const bu = into(st, 1 - s, b.x);
    if (bu < 0 || bu > st.d || Math.abs(b.z - cx) > st.band) continue;
    const d = Math.hypot(b.x - px, b.z - pz);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return { goal: [cx - a * (G2 + st.d / 2), cx], word: null };
  // knock it out across the band the way it already leans: line up 2.6 m
  // the other side of it, then charge; straight at the line-up point, the
  // deck's sides kept clear
  const side = best.z >= cx ? 1 : -1;
  const lx = best.x, lz = Math.max(cx - st.hw + 1.5, Math.min(cx + st.hw - 1.5, best.z - side * 2.6));
  if (Math.abs(px - lx) < 1.4 && (pz - best.z) * side < -0.8) return { goal: null, word: { yaw: Math.atan2(best.z - pz, best.x - px), move: 1 } };
  const dx = lx - px, dz = lz - pz, dd = Math.hypot(dx, dz);
  if (dd < 0.6) return { goal: null, word: { yaw: Math.atan2(side, 0), move: 0 } };
  return { goal: null, word: { yaw: Math.atan2(dz, dx), move: dd > 2.5 || Math.hypot(vx, 0) < 3 ? 1 : 0 } };
}
