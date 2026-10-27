// EVADE (M_EVADE), as drawn and as the AI fighter plays it (the rules are
// src/am/evade.wat's, the state AO's and MODE_REC's as src/am/evade.mjs lays
// it out). Each chaser is a flat face on a billboard (the renderer's kind
// FACE), drawn where the confirmed world has it run on by its velocity, a
// shimmer over it while it's stunned. The downed lie on the ground (the
// renderer reads PF_DOWN); a waypoint on each says REVIVE, with a ring that
// fills as someone revives it. The HUD has your state, how many stand, are
// down and are out, and the chasers and when the next comes; the feed every
// catch, revive and fighter out; the board's columns are each fighter's
// revives, time standing and state.
// The brain: a chaser seen (or heard, within HEAR) inside RUN sends it off
// the other way, as far from every chaser it knows of as a ring of points
// round it goes, keeping on; it shoots a chaser closing on it inside SHOOT
// to stun it. With none near, a downed teammate within HELP whose chasers
// are all at least CLEAR off is revived: to it, then still beside it. Else
// it keeps moving, to a spawn point far from the chasers. Downed, it
// crawls to its nearest standing teammate.
import * as L from '../../src/layout.mjs';
import * as AC from '../../src/am/consts.mjs';
import { boxClear, sees } from '../../src/arena-view.mjs';
import { C } from '../font.mjs';

// the renderer's chaser face (client/arena-render.mjs, fs_splat): its colour's alpha picks one of FACES faces
export const FACE = 12;
export const FACES = 4;
const SIZE = 1.25; // m: half the face's width; its middle AC.ED_HIT_Y over the chaser's feet
// the faces' colours, by chaser
const TINT = [[0.98, 0.86, 0.62], [0.72, 0.9, 1], [1, 0.62, 0.7], [0.78, 1, 0.66], [1, 0.95, 0.5], [0.9, 0.75, 1]];
// m: a chaser heard through walls within HEAR; one seen (or heard) inside RUN
// sends a fighter off; inside SHOOT it shoots at one it sees; a downed
// teammate within HELP is worth going back for, once every chaser is CLEAR
// of it and of you; a flee point is AWAY off; a chaser not headed for a
// point counts GOING farther from it than it is
const MARKS = 4; // REVIVE waypoints at most, the nearest
const HEAR = 22, RUN = 40, SHOOT = 28, HELP = 150, CLEAR = 22, AWAY = 16, GOING = 15, HIDE = 25, JUKE = 6;

// The chasers as AO holds them: { k, pos (feet), vel, stun, calm, prey (-1 nobody), climb }.
export function chasersOf(view) {
  const d = view.dv, n = Math.min(d.getUint32(L.AO + AC.ED_N, true), AC.ED_MAX), out = [];
  for (let k = 0; k < n; k++) {
    const c = L.AO + AC.ED_CH + k * AC.ED_CSIZE, f = (o) => d.getFloat32(c + o, true);
    out.push({ k, pos: [f(AC.ED_C_X), f(AC.ED_C_Y), f(AC.ED_C_Z)], vel: [f(AC.ED_C_VX), f(AC.ED_C_VY), f(AC.ED_C_VZ)],
      stun: d.getUint16(c + AC.ED_C_STUN, true), calm: d.getUint16(c + AC.ED_C_CALM, true), prey: d.getUint16(c + AC.ED_C_PREY, true) - 1, climb: view.u8[c + AC.ED_C_CLIMB] });
  }
  return out;
}

// The match's counts and how it ended (AC.ED_END: 0 playing, 1 the clock ran out with someone standing, 2 nobody stood).
export function evadeOf(view) {
  const u = (o) => view.dv.getUint32(L.AO + o, true);
  return { chasers: u(AC.ED_N), stand: u(AC.ED_STAND), down: u(AC.ED_DOWNED), out: u(AC.ED_OUT), end: u(AC.ED_END), caught: u(AC.ED_CAUGHT), ups: u(AC.ED_UPS), stuns: u(AC.ED_STUNS) };
}

// Slot p as Evade has it, from the confirmed world: its state ('up', 'down', 'out', or null: not in the room),
// ticks left bleeding, ticks of reviving it has had, ticks it can't be caught.
export function stateOf(view, p) {
  const fl = view.u8[L.PLAYERS + p * L.PSIZE + L.P_FL], r = L.MODE_REC + p * L.MR_SIZE;
  const state = !(fl & L.PF_LIVE) ? null : fl & L.PF_DEAD ? 'out' : (fl & L.PF_DOWN) === L.PF_DOWN ? 'down' : 'up';
  return { state, bleed: view.dv.getUint16(r + AC.ED_MR_BLEED, true), help: view.dv.getUint16(L.AO + AC.ED_HELP + 2 * p, true), safe: view.u8[r + AC.ED_MR_SAFE] };
}

// When the next chaser comes, in ticks of play from now (null: no more come, or none while the room is this full).
export function nextIn(view) {
  const h = view.hole(), e = evadeOf(view), live = h.live;
  const cap = Math.min(AC.ED_MAX, Math.max(AC.ED_MIN, Math.floor(live / AC.ED_SHARE) + 1));
  if (e.chasers >= cap) return null;
  const played = h.state === L.H_PLAY ? h.tick - h.start : 0;
  const k = e.chasers - AC.ED_MIN - Math.floor(live / AC.ED_PER) + 1;
  return k * AC.ED_WAVE - played;
}

const clock = (n) => `${Math.floor(n / 125 / 60)}:${String(Math.floor(n / 125) % 60).padStart(2, '0')}`;
const across = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
function feet(view, p, dt = 0) {
  const b = L.PLAYERS + p * L.PSIZE, f = (o) => view.dv.getFloat32(b + o, true);
  return [f(L.P_PX) + f(L.P_VX) * dt, f(L.P_PY) + f(L.P_VY) * dt, f(L.P_PZ) + f(L.P_VZ) * dt];
}
const face = (c) => [c.pos[0], c.pos[1] + Number(AC.ED_HIT_Y), c.pos[2]];

// The chasers a fighter with its eye at `eye` knows of: seen (nothing of the
// map between its eye and the face) or heard (within HEAR, walls or not).
export function known(view, eye, list = chasersOf(view)) {
  return list.filter((c) => across(c.pos, eye) < HEAR || (across(c.pos, eye) < 160 && sees(view, eye, face(c))));
}

// Where a fighter at `pos` runs from the chasers `foes`: of twelve points
// AWAY round it it can walk to (no box across the way at knee or chest
// height, not up or down a cliff, 15 m inside the map's bounds), the one
// whose nearest chaser is farthest (less a quarter of the way to `toward`,
// a downed teammate, if any), a teleporter's pad near by counting as far as
// the canyon is long; null if none is clear.
function away(view, pos, foes, toward = null) {
  const map = view.map(), [x0, x1, z0, z1] = map.bounds;
  const far = (p) => Math.min(...foes.map((c) => across(c.pos, p) - (c.stun ? 10 : 0))) - (toward ? 0.25 * across(p, toward) : 0);
  let best = null, bs = -Infinity;
  for (const tp of map.teleporters) {
    const d = across(tp.from, pos);
    if (d < 30 && far(tp.from) > d + 4 && walkable2(map, pos, tp.from)) { const s = 200 - d; if (s > bs) { bs = s; best = tp.from; } }
  }
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    const x = pos[0] + AWAY * Math.cos(a), z = pos[2] + AWAY * Math.sin(a);
    if (x < x0 + 15 || x > x1 - 15 || z < z0 + 15 || z > z1 - 15) continue;
    const y = view.stand(x, z, pos[1] + 0.6);
    if (Math.abs(y - pos[1]) > 2.5) continue;
    const p = [x, y, z];
    if (!walkable2(map, pos, p)) continue;
    const s = far(p);
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
const walkable2 = (map, a, b) => [0.5, 1.4].every((h) => boxClear(map, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]]));

// Keep moving: with chasers known of, the spawn point (12 m off or more)
// farthest from them, less a little for the way there; with none, one of the
// three nearest such, by `pick` (the clock's and the slot's: it holds a while).
function roam(view, pos, list, pick) {
  const spots = view.map().spawns.filter((s) => across(s, pos) >= 12);
  if (!list.length) return spots.sort((a, b) => across(a, pos) - across(b, pos))[pick % Math.min(3, spots.length)] ?? null;
  let best = null, bs = -Infinity;
  for (const s of spots) {
    const v = Math.min(Math.min(...list.map((c) => across(c.pos, s))), 120) - 0.2 * across(s, pos);
    if (v > bs) { bs = v; best = s; }
  }
  return best;
}

export default {
  mode: L.M_EVADE,
  key: 'evade',
  // the top left is all its own (nobody keeps kills), and so is the board: no KILLS or DEATHS
  own: true,
  kills: false,
  // the board's order in play, as the sim's $ed_key: standing first, then time standing, then revives
  standing: (o) => (o.live && !o.dead && !o.down ? 2 ** 31 : 0) + Math.min(o.aux, 0x7fff) * 65536 + Math.min(o.points, 0xffff),
  over: (view) => { const e = evadeOf(view); return e.end === 1 ? `${e.stand} SURVIVED` : 'THE CHASERS GOT EVERYONE'; },
  dead: () => 'OUT  SPECTATING',
  // out, you watch someone standing
  watch: (view, q) => stateOf(view, q).state === 'up',

  // rows 0 to 2 (a mode with no sides has the top left to itself): your state, the room's, the chasers
  hud(view, ctx) {
    const h = view.hole();
    if (h.state === L.H_COUNT) { ctx.put(1, 0, 'EVERYONE AGAINST THE CHASERS', ctx.C.YELLOW); ctx.put(1, 1, 'STAND STILL BY THE DOWNED TO REVIVE', ctx.C.GREY); return; }
    const e = evadeOf(view);
    const me = ctx.slot >= 0 ? stateOf(view, ctx.slot) : null;
    const who = ctx.watching ? `P${ctx.slot + 1}` : 'YOU';
    if (ctx.watching && ctx.mine >= 0 && stateOf(view, ctx.mine).state === 'out') ctx.centre(ctx.rows - 9, `YOU ARE OUT  WATCHING P${ctx.slot + 1}`, ctx.C.RED);
    if (me?.state === 'up') ctx.put(1, 0, `${who}: STANDING`, ctx.C.YELLOW);
    else if (me?.state === 'down') ctx.put(1, 0, `${who}: DOWN  OUT IN ${Math.ceil(me.bleed / 125)}`, (ctx.now >> 9) & 1 ? ctx.C.RED : ctx.C.WHITE);
    else if (me?.state === 'out') ctx.put(1, 0, `${who}: OUT`, ctx.C.RED);
    ctx.put(1, 1, `${e.stand} STANDING  ${e.down} DOWN  ${e.out} OUT`, ctx.C.GREY);
    const next = nextIn(view);
    ctx.put(1, 2, `${e.chasers} CHASER${e.chasers === 1 ? '' : 'S'}${next !== null && next > 0 ? `  NEXT IN ${clock(next)}` : ''}`, ctx.C.ORANGE);
    // the middle: being revived, or reviving someone
    if (me?.state === 'down') {
      ctx.centre(ctx.rows - 7, me.help ? 'BEING REVIVED  HOLD ON' : 'DOWN  CRAWL TO A FRIEND', me.help ? ctx.C.GREEN : ctx.C.RED);
      if (me.help) bar(ctx, me.help / AC.ED_REVIVE);
    } else if (me?.state === 'up') {
      const pos = feet(view, ctx.slot);
      for (let q = 0; q < L.NPLAYER; q++) {
        const s = q === ctx.slot ? null : stateOf(view, q);
        if (s?.state !== 'down' || !s.help || across(feet(view, q), pos) > Number(AC.ED_REACH)) continue;
        ctx.centre(ctx.rows - 7, `REVIVING P${q + 1}  HOLD STILL`, ctx.C.GREEN);
        bar(ctx, s.help / AC.ED_REVIVE);
        break;
      }
    }
  },

  // The feed: catches in red, revives in green, the rest in white; banners for what's yours.
  news(f, ctx) {
    const you = ctx.slot >= 0 && f.owner === ctx.slot;
    const up = (y) => [f.pos[0], f.pos[1] + y, f.pos[2]];
    switch (f.size) {
      case AC.ED_MX_DOWN:
        ctx.feed(`${ctx.name(f.owner)} ${you ? 'WERE' : 'WAS'} CAUGHT`, C.RED);
        ctx.glow({ pos: up(0.6), size: 2.2, color: [1, 0.2, 0.15, 0.9], kind: 6, life: 700, grow: true });
        if (you) { ctx.banner('CAUGHT  CRAWL TO A FRIEND', C.RED, 3000); ctx.sound?.hurt?.(); }
        else ctx.sound?.hit?.();
        break;
      case AC.ED_MX_UP:
        ctx.feed(`${ctx.name(f.owner)} REVIVED ${f.shot === ctx.slot ? 'YOU' : `P${f.shot + 1}`}`, C.GREEN);
        ctx.glow({ pos: up(1), size: 1.8, color: [0.4, 1, 0.5, 0.9], kind: 6, life: 600, grow: true });
        if (f.shot === ctx.slot) { ctx.banner('BACK ON YOUR FEET', C.GREEN, 2500); ctx.sound?.pickup?.(); }
        else if (you) { ctx.banner(`YOU REVIVED P${f.shot + 1}`, C.GREEN, 2000); ctx.sound?.pickup?.(); }
        break;
      case AC.ED_MX_OUT:
        ctx.feed(`${ctx.name(f.owner)} ${you ? 'ARE' : 'IS'} OUT`, C.WHITE);
        if (you) ctx.banner('YOU ARE OUT  WATCH THE OTHERS', C.RED, 3500);
        break;
      case AC.ED_MX_COME:
        ctx.feed(f.shot < AC.ED_MIN ? 'THE CHASERS ARE LOOSE' : 'ANOTHER CHASER IS LOOSE', C.ORANGE);
        if (f.shot >= AC.ED_MIN) ctx.banner('ANOTHER CHASER', C.ORANGE, 2000);
        break;
      case AC.ED_MX_STUN:
        if (you) ctx.glow({ pos: f.pos, size: 1.6, color: [0.6, 0.9, 1, 0.9], kind: 5, life: 400 });
        break;
      case AC.ED_MX_LAST:
        ctx.feed(`${ctx.name(f.owner)} ${you ? 'ARE' : 'IS'} THE LAST ONE STANDING`, C.YELLOW);
        if (you) ctx.banner('LAST ONE STANDING', C.YELLOW, 3000);
        break;
      case AC.ED_MX_END:
        ctx.banner(f.shot ? `${f.shot} SURVIVED` : 'THE CHASERS GOT EVERYONE', f.shot ? C.GREEN : C.RED, 4000);
        break;
      default:
    }
  },

  // The chasers' faces where the confirmed world has them run on by dt (a
  // stunned one shimmering, a climbing one bobbing), a glow under each; a
  // REVIVE waypoint on the MARKS downed nearest the one shown (not on it), a
  // ring over each filling as it's revived.
  draw(view, ctx, out) {
    for (const c of chasersOf(view)) {
      const moving = c.stun ? 0 : 1;
      const p = [c.pos[0] + c.vel[0] * ctx.dt * moving, c.pos[1] + c.vel[1] * ctx.dt * moving, c.pos[2] + c.vel[2] * ctx.dt * moving];
      const bob = c.climb ? 0.08 * Math.sin(ctx.now / 60) : 0.04 * Math.sin(ctx.now / 180 + c.k);
      const t = TINT[c.k % TINT.length];
      const mid = [p[0], p[1] + Number(AC.ED_HIT_Y) + bob, p[2]];
      out.solid.push({ pos: mid, size: SIZE, aspect: 1, color: [...t, ((c.k % FACES) + 0.5) / FACES], kind: FACE, minpx: 3 });
      if (c.stun) out.glow.push({ pos: mid, size: SIZE * 1.4, color: [0.6, 0.85, 1, 0.5 + 0.3 * Math.sin(ctx.now / 50)], kind: 6, minpx: 2 });
      out.glow.push({ pos: [p[0], p[1] + 0.1, p[2]], size: 1.4, color: [0, 0, 0, 0.35], kind: 3, minpx: 1 });
    }
    if (view.hole().state !== L.H_PLAY) return;
    // the MARKS downed nearest the fighter shown (the camera, for nobody)
    const from = ctx.shown >= 0 ? feet(view, ctx.shown) : ctx.cam;
    const downed = [];
    for (let q = 0; q < L.NPLAYER; q++) if (q !== ctx.shown && stateOf(view, q).state === 'down') downed.push(q);
    downed.sort((a, b) => across(feet(view, a), from) - across(feet(view, b), from) || a - b);
    for (const q of downed.slice(0, MARKS)) {
      const s = stateOf(view, q);
      const p = feet(view, q, ctx.dt);
      out.markers.push({ pos: [p[0], p[1] + 1.2, p[2]], label: s.help ? 'REVIVING' : `REVIVE ${Math.ceil(s.bleed / 125)}`, color: s.help ? C.GREEN : C.RED });
      if (s.help) out.glow.push({ pos: [p[0], p[1] + 0.5, p[2]], size: 0.6 + 1.4 * s.help / AC.ED_REVIVE, color: [0.4, 1, 0.5, 0.7], kind: 6, minpx: 1 });
    }
  },

  cols: [
    { head: 'REVIVES', get: (o) => String(o.points) },
    { head: 'STOOD', get: (o) => clock(o.aux) },
    { head: 'NOW', get: (o) => (o.dead ? 'OUT' : o.down ? 'DOWN' : 'UP') },
  ],

  // The AI fighter's goal, from what it sees and hears of the chasers.
  goal(view, me, ctx) {
    if (view.hole().state !== L.H_PLAY) return null;
    const list = chasersOf(view);
    const mine = stateOf(view, me.slot);
    const standing = [];
    const downed = [];
    for (let q = 0; q < L.NPLAYER; q++) {
      if (q === me.slot) continue;
      const s = stateOf(view, q);
      if (s.state === 'up') standing.push([q, feet(view, q)]);
      if (s.state === 'down') downed.push([q, feet(view, q), s]);
    }
    const eye = [me.pos[0], me.pos[1] + 1.6, me.pos[2]];
    const foes = known(view, eye, list);
    if (mine.state === 'down') {
      // a friend standing by: still, for the revive; away from a chaser it knows of inside HIDE, so its
      // friends can come; else to the nearest friend standing
      if (standing.some(([, p]) => across(p, me.pos) < Number(AC.ED_REACH) + 1)) return { pos: me.pos, r: 3, hurry: 1, hold: true, still: true };
      const close = foes.filter((c) => across(c.pos, me.pos) < HIDE);
      const off = close.length ? away(view, me.pos, close) : null;
      if (off) return { pos: off, r: 1, hurry: 1, hold: false };
      let best = null, bd = Infinity;
      for (const [, p] of standing) { const d = across(p, me.pos); if (d < bd) { bd = d; best = p; } }
      return best ? { pos: best, r: 1, hurry: 1, hold: true } : null;
    }
    if (mine.state !== 'up') return null;
    // how far a chaser is from a point as a threat: as far as it is, or GOING farther if it isn't headed for it
    // (its way within about 50 degrees of the point's) or is stunned
    const threat = (c, p) => {
      const d = across(c.pos, p), dx = p[0] - c.pos[0], dz = p[2] - c.pos[2];
      return d + (c.stun || c.vel[0] * dx + c.vel[2] * dz <= 0.65 * Math.hypot(c.vel[0], c.vel[2]) * d ? GOING : 0);
    };
    const near = foes.filter((c) => threat(c, me.pos) < RUN);
    // one to stun: the nearest it sees closing in, not stunned or shrugging off stuns
    const shoot = foes.filter((c) => !c.stun && !c.calm && across(c.pos, me.pos) < SHOOT && sees(view, eye, face(c)))
      .sort((a, b) => across(a.pos, me.pos) - across(b.pos, me.pos))[0];
    const aim = shoot ? [shoot.pos[0] + shoot.vel[0] * 0.1, shoot.pos[1] + Number(AC.ED_HIT_Y) - 0.3, shoot.pos[2] + shoot.vel[2] * 0.1] : null;
    // one about to catch it (inside JUKE, closing): a step square to its way, to the side it's on, so it goes by
    const close = foes.filter((c) => !c.stun && across(c.pos, me.pos) < JUKE && c.vel[0] * (me.pos[0] - c.pos[0]) + c.vel[2] * (me.pos[2] - c.pos[2]) > 0)
      .sort((a, b) => across(a.pos, me.pos) - across(b.pos, me.pos))[0];
    if (close) {
      const v = Math.hypot(close.vel[0], close.vel[2]) || 1, nx = -close.vel[2] / v, nz = close.vel[0] / v;
      const side = nx * (me.pos[0] - close.pos[0]) + nz * (me.pos[2] - close.pos[2]) >= 0 ? 1 : -1;
      const x = me.pos[0] + nx * side * 6 + close.vel[0] / v * 2, z = me.pos[2] + nz * side * 6 + close.vel[2] / v * 2;
      return { pos: [x, view.stand(x, z, me.pos[1] + 0.6), z], r: 1, hurry: 1, hold: false, dodge: true, flee: true, shoot: aim };
    }
    // by a teammate down (reviving it already, or there to): on with it while no chaser it knows of can get there before it's done
    for (const [, p, s] of downed) {
      if (across(p, me.pos) > Number(AC.ED_REACH) + (s.help ? -0.3 : 1)) continue;
      const left = (AC.ED_REVIVE - s.help) / 125 * Number(AC.ED_RUN) + 4;
      if (foes.every((c) => threat(c, p) > left)) return { pos: p, r: 1.2, hurry: 1, hold: true, still: true, shoot: aim };
    }
    // the nearest teammate down within HELP; worth going for with the coast clear of every chaser it knows of
    let help = null, hd = HELP;
    for (const [q, p] of downed) { const d = across(p, me.pos); if (d < hd) { hd = d; help = [q, p]; } }
    const clear = help && foes.every((c) => threat(c, help[1]) > CLEAR && threat(c, me.pos) > CLEAR * 0.7);
    if (near.length && !clear) {
      const to = away(view, me.pos, near, help?.[1]);
      if (to) return { pos: to, r: 2, hurry: 1, hold: false, shoot: aim, flee: true };
    }
    if (clear) return { pos: help[1], r: 1.2, hurry: 1, hold: true, still: true, shoot: aim };
    const to = roam(view, me.pos, foes, (ctx.t >> 11) + me.slot);
    return to ? { pos: to, r: 6, hurry: 1, hold: false, shoot: aim } : null;
  },

  state(view) {
    const e = evadeOf(view);
    return { ...e, chasers: chasersOf(view).map((c) => ({ pos: c.pos.map((x) => Math.round(x * 10) / 10), stun: c.stun, prey: c.prey })) };
  },
};

// A progress bar under the middle line, in the HUD's 320 x 200 units.
function bar(ctx, share) {
  const y = (ctx.rows - 6) * 6 + 2;
  ctx.rect(120, y, 200, y + 3, 0.06, 0.06, 0.08, 0.75);
  ctx.rect(120, y, 120 + 80 * Math.min(1, share), y + 3, 0.4, 1, 0.5, 1);
}
