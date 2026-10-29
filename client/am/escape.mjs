// ESCAPE (M_ESCAPE), as drawn and as the AI fighter plays it (the rules are
// src/am/escape.wat's, the state AO's and MODE_REC's as src/am/escape.mjs
// lays it out). The hunter is the juggernaut's gold (the renderer's PF_JUGG),
// the survivors one blue; the downed and a stunned hunter lie on the ground.
// Each terminal is a console (the renderer's kind TERMINAL), its screen dim
// cyan, flickering amber while it's hacked, green once done; the exits, once
// open, a green flag each and a ring on the ground. The HUD has your role
// and state, the terminals, the room's counts, your shove; a hunter's has
// the noise (terminals being hacked), a NOISE waypoint on each. Waypoints:
// HACK on the nearest terminals, EXIT on the exits, REVIVE (FINISH for a
// hunter) on the nearest downed.
// The brains. A survivor: down, still by a friend or crawling to one; up, a
// hunter it knows of (seen, or heard within HEAR) on top of it, or held
// still over a downed friend within RESCUE, it shoves; one inside RUN it
// runs from (to the point of twelve round it farthest from
// the hunters); the exits open, to the nearest; a downed friend within HELP
// with no hunter it knows of within CLEAR, to revive; else the terminal
// nearest, less crowded and farther from the hunters, to hack. A hunter:
// whoever it sees it fights (the bot's own, the sword); a downed survivor
// near with nobody standing by, to finish; else the nearest noisy terminal,
// the exits once open, the terminals in turn.
import * as L from '../../src/layout.mjs';
import * as AC from '../../src/am/consts.mjs';
import { boxClear, sees } from '../../src/arena-view.mjs';
import { C } from '../font.mjs';

// the renderer's terminal (client/arena-render.mjs, fs_splat): a console, its screen in the sprite's colour
export const TERMINAL = 14;
// m: a hunter heard through walls within HEAR, seen within SEE; one inside
// RUN sends a survivor off, inside SHOVE it's shoved; a downed friend within
// HELP is worth going back for, with no hunter known of within CLEAR of it;
// a flee point is AWAY off; a hunter finishes a downed survivor within
// FINISH with nobody standing within GUARD of it; one finishing a friend
// within RESCUE is gone for, to shove it off
const HEAR = 14, SEE = 80, RUN = 26, SHOVE = 3.2, RESCUE = 35, HELP = 60, CLEAR = 22, AWAY = 16, FINISH = 30, GUARD = 7;
const MARKS = 3; // HACK and REVIVE waypoints at most, the nearest

const across = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const clock = (n) => `${Math.floor(n / 125 / 60)}:${String(Math.floor(n / 125) % 60).padStart(2, '0')}`;
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;
function feet(view, p, dt = 0) {
  const b = L.PLAYERS + p * L.PSIZE, f = (o) => view.dv.getFloat32(b + o, true);
  return [f(L.P_PX) + f(L.P_VX) * dt, f(L.P_PY) + f(L.P_VY) * dt, f(L.P_PZ) + f(L.P_VZ) * dt];
}

// The match's counts and state (AO's): end 0 playing, 1 nobody left in play, 2 the clock; open 0 shut, 1 by the terminals, 2 by the clock.
export function escapeOf(view) {
  const u = (o) => view.dv.getUint32(L.AO + o, true);
  return { terminals: u(AC.ES_NT), need: u(AC.ES_NEED), hacked: u(AC.ES_HACKED), open: u(AC.ES_OPEN), in: u(AC.ES_IN), up: u(AC.ES_UP), down: u(AC.ES_DOWNED),
    out: u(AC.ES_OUT), free: u(AC.ES_FREE), hunters: u(AC.ES_HUNTERS), end: u(AC.ES_END), escapes: u(AC.ES_ESCAPES), downs: u(AC.ES_DOWNS), ups: u(AC.ES_UPS),
    stuns: u(AC.ES_STUNS), finished: u(AC.ES_FINISHED) };
}

// The terminals: { k, pos (feet), prog (0..1), crew (hacking it this tick: its noise), done }.
export function termsOf(view) {
  const d = view.dv, n = Math.min(d.getUint32(L.AO + AC.ES_NT, true), AC.ES_TMAX), out = [];
  for (let k = 0; k < n; k++) {
    const c = L.AO + AC.ES_T + k * AC.ES_TSIZE, f = (o) => d.getFloat32(c + o, true);
    out.push({ k, pos: [f(AC.ES_T_X), f(AC.ES_T_Y), f(AC.ES_T_Z)], prog: d.getUint16(c + AC.ES_T_PROG, true) / (4 * AC.ES_HACK), crew: view.u8[c + AC.ES_T_CREW], done: !!view.u8[c + AC.ES_T_DONE] });
  }
  return out;
}

// The exits' feet, once open ([] while shut).
export function exitsOf(view) {
  if (!view.dv.getUint32(L.AO + AC.ES_OPEN, true)) return [];
  return [0, 1].map((e) => [0, 4, 8].map((o) => view.dv.getFloat32(L.AO + AC.ES_EXIT + 16 * e + o, true)));
}

// Slot p as Escape has it, from the confirmed world: hunter (or a survivor),
// state ('up', 'down' (a stunned hunter too), 'out', 'free', or null: not in
// the room); a survivor's escape order, shove cooldown or bleed (ticks), and
// ticks of being revived; a hunter's ticks stunned, calm and finishing.
export function stateOf(view, p) {
  const fl = view.u8[L.PLAYERS + p * L.PSIZE + L.P_FL], r = L.MODE_REC + p * L.MR_SIZE;
  const hunter = !!(fl & L.PF_JUGG), order = hunter ? 0 : view.u8[r + AC.ES_MR_ORDER];
  const state = !(fl & L.PF_LIVE) ? null : fl & L.PF_DEAD ? (order ? 'free' : 'out') : (fl & L.PF_DOWN) === L.PF_DOWN ? 'down' : 'up';
  return hunter
    ? { hunter, state, stun: view.u8[r + AC.ES_MR_STUN], calm: view.u8[r + AC.ES_MR_CALM], fin: view.u8[r + AC.ES_MR_FIN] }
    : { hunter, state, order, time: view.dv.getUint16(r + AC.ES_MR_TIME, true), help: view.dv.getUint16(L.AO + AC.ES_HELP + 2 * p, true) };
}

// Where a fighter at `pos` runs from `foes` (feet): of twelve points AWAY
// round it it can walk to (no box across the way at knee or chest height,
// not up or down a cliff, 15 m inside the map's bounds), the one whose
// nearest foe is farthest, a teleporter's pad near by counting as far as
// the canyon is long; null if none is clear.
function away(view, pos, foes) {
  const map = view.map(), [x0, x1, z0, z1] = map.bounds;
  const far = (p) => Math.min(...foes.map((f) => across(f, p)));
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

// The fighters as one with its eye at `eye` knows of them: [slot, feet,
// state] of those seen (nothing of the map between the eyes and their chest,
// within SEE) or heard (within HEAR), that `want` takes.
function known(view, eye, me, want) {
  const out = [];
  for (let q = 0; q < L.NPLAYER; q++) {
    if (q === me) continue;
    const s = stateOf(view, q);
    if (!s.state || !want(s)) continue;
    const p = feet(view, q), d = across(p, eye);
    if (d < HEAR || (d < SEE && sees(view, eye, [p[0], p[1] + 1.2, p[2]]))) out.push([q, p, s]);
  }
  return out;
}

// the screen's colour: dim cyan idle, amber flickering while hacked, green once done
const SCREEN = { idle: [0.25, 0.7, 0.8], noise: [1, 0.68, 0.2], done: [0.3, 1, 0.45] };

export default {
  mode: L.M_ESCAPE,
  key: 'escape',
  // the top left is all its own (nobody keeps kills), and so is the board; survivors one colour, the hunter gold; no frags
  own: true,
  kills: false,
  sides: 1,
  frags: false,
  // the board's order in play, as the sim's $es_key: the escaped by order, the hunters by finishes then downs, the survivors in, then out
  standing: (o) => {
    const tier = o.jugg ? 2 : o.dead ? (o.rung ? 3 : 0) : 1;
    return tier * 2 ** 28 + (tier === 3 ? (0xfff - o.rung) * 65536 : Math.min(o.points, 0xfff) * 65536 + Math.min(o.aux, 0xffff));
  },
  over: (view) => { const e = escapeOf(view); return e.free ? `${e.free} ESCAPED` : `THE HUNTER${e.hunters === 1 ? '' : 'S'} GOT EVERYONE`; },
  dead: (f) => (f.rung ? `ESCAPED ${nth(f.rung)}  SPECTATING` : 'OUT  SPECTATING'),
  // out or escaped, you watch someone still in it, either side
  watch: (view, q) => ['up', 'down'].includes(stateOf(view, q).state),
  dealt: (me) => (me.jugg ? 'THE HUNTER: THE SWORD' : 'SURVIVOR: NO GUNS  Q SHOVES THE HUNTER'),

  // rows 0 to 3 (a mode with no sides has the top left to itself)
  hud(view, ctx) {
    const h = view.hole();
    if (h.state === L.H_COUNT) { ctx.put(1, 0, 'ONE HUNTER AGAINST THE ROOM', ctx.C.YELLOW); ctx.put(1, 1, 'HACK THE TERMINALS', ctx.C.GREY); ctx.put(1, 2, 'THEN RUN FOR THE EXITS', ctx.C.GREY); return; }
    const e = escapeOf(view);
    const me = ctx.slot >= 0 ? stateOf(view, ctx.slot) : null;
    const who = ctx.watching ? `P${ctx.slot + 1}` : 'YOU';
    const flick = (ctx.now >> 8) & 1;
    if (ctx.watching && ctx.mine >= 0 && ['out', 'free'].includes(stateOf(view, ctx.mine).state)) ctx.centre(ctx.rows - 9, `WATCHING P${ctx.slot + 1}`, ctx.C.CYAN);
    // (the top left's lines stop short of the shield bar, 26 columns in)
    const terms = e.open ? 'THE EXITS ARE OPEN' : `TERMINALS ${Math.min(e.hacked, e.need)} OF ${e.need}`;
    if (me?.hunter) {
      ctx.put(1, 0, me.state === 'down' ? `${who}: THE HUNTER  STUNNED` : `${who}: THE HUNTER`, me.state === 'down' && flick ? ctx.C.WHITE : ctx.C.ORANGE);
      const f = view.fighter(ctx.slot);
      ctx.put(1, 1, `FINISHED ${f.points}  DOWNED ${f.aux}`, ctx.C.GREY);
      const noisy = termsOf(view).filter((t) => t.crew && !t.done).length;
      ctx.put(1, 2, noisy ? `NOISE AT ${noisy} TERMINAL${noisy === 1 ? '' : 'S'}` : 'ALL QUIET', noisy ? (flick ? ctx.C.RED : ctx.C.ORANGE) : ctx.C.GREY);
      ctx.put(1, 3, terms, e.open ? ctx.C.GREEN : ctx.C.GREY);
      if (me.fin) { ctx.centre(ctx.rows - 7, 'FINISHING  HOLD STILL', ctx.C.RED); bar(ctx, me.fin / AC.ES_FINISH, [1, 0.3, 0.2]); }
      return;
    }
    if (me?.state === 'up') ctx.put(1, 0, `${who}: SURVIVOR`, ctx.C.CYAN);
    else if (me?.state === 'down') ctx.put(1, 0, `${who}: DOWN  OUT IN ${Math.ceil(me.time / 125)}`, flick ? ctx.C.RED : ctx.C.WHITE);
    else if (me?.state === 'free') ctx.put(1, 0, `${who}: ESCAPED ${nth(me.order)}`, ctx.C.GREEN);
    else if (me?.state === 'out') ctx.put(1, 0, `${who}: OUT`, ctx.C.RED);
    ctx.put(1, 1, terms, e.open ? ctx.C.GREEN : ctx.C.YELLOW);
    ctx.put(1, 2, `${e.up} UP  ${e.down} DOWN`, ctx.C.GREY);
    ctx.put(1, 3, `${e.free} ESCAPED  ${e.out} OUT`, ctx.C.GREY);
    if (me?.state === 'up') ctx.put(1, 4, me.time ? `SHOVE IN ${Math.ceil(me.time / 125)}` : 'SHOVE READY  Q', me.time ? ctx.C.GREY : ctx.C.GREEN);
    // the middle: being finished or revived, reviving, hacking
    if (me?.state === 'down') {
      const fin = hunterOver(view, ctx.slot);
      if (fin) { ctx.centre(ctx.rows - 7, 'THE HUNTER IS FINISHING YOU', ctx.C.RED); bar(ctx, fin / AC.ES_FINISH, [1, 0.3, 0.2]); }
      else { ctx.centre(ctx.rows - 7, me.help ? 'BEING REVIVED  HOLD ON' : 'DOWN  CRAWL TO A FRIEND', me.help ? ctx.C.GREEN : ctx.C.RED); if (me.help) bar(ctx, me.help / AC.ES_REVIVE); }
    } else if (me?.state === 'up') {
      const pos = feet(view, ctx.slot);
      for (let q = 0; q < L.NPLAYER; q++) {
        const s = q === ctx.slot ? null : stateOf(view, q);
        if (s?.hunter || s?.state !== 'down' || !s.help || across(feet(view, q), pos) > Number(AC.ES_REACH)) continue;
        ctx.centre(ctx.rows - 7, `REVIVING P${q + 1}  HOLD STILL`, ctx.C.GREEN);
        bar(ctx, s.help / AC.ES_REVIVE);
        return;
      }
      const t = termsOf(view).find((x) => !x.done && x.crew && across(x.pos, pos) < Number(AC.ES_TERM_R) && Math.abs(x.pos[1] - pos[1]) < Number(AC.ES_TERM_H));
      if (t) { ctx.centre(ctx.rows - 7, t.crew > 1 ? `HACKING WITH ${t.crew - 1}  HOLD STILL` : 'HACKING  HOLD STILL', ctx.C.CYAN); bar(ctx, t.prog, [0.3, 0.85, 1]); }
    }
  },

  // The feed: downs in red, revives and escapes in green, the hunter in orange; banners for what's yours.
  news(f, ctx) {
    const you = ctx.slot >= 0 && f.owner === ctx.slot;
    const up = (y) => [f.pos[0], f.pos[1] + y, f.pos[2]];
    const e = escapeOf(ctx.view);
    switch (f.size) {
      case AC.ES_MX_DOWN:
        ctx.feed(`${ctx.name(f.shot)} DOWNED ${f.owner === ctx.slot ? 'YOU' : `P${f.owner + 1}`}`, C.RED);
        ctx.glow({ pos: up(0.6), size: 2.2, color: [1, 0.2, 0.15, 0.9], kind: 6, life: 700, grow: true });
        if (you) { ctx.banner('DOWNED  CRAWL TO A FRIEND', C.RED, 3000); ctx.sound?.hurt?.(); }
        else if (f.shot === ctx.slot) { ctx.banner(`DOWNED P${f.owner + 1}  HOLD STILL OVER THEM`, C.ORANGE, 2500); ctx.sound?.hit?.(); }
        else ctx.sound?.hit?.();
        break;
      case AC.ES_MX_UP:
        ctx.feed(`${ctx.name(f.owner)} REVIVED ${f.shot === ctx.slot ? 'YOU' : `P${f.shot + 1}`}`, C.GREEN);
        ctx.glow({ pos: up(1), size: 1.8, color: [0.4, 1, 0.5, 0.9], kind: 6, life: 600, grow: true });
        if (f.shot === ctx.slot) { ctx.banner('BACK ON YOUR FEET', C.GREEN, 2500); ctx.sound?.pickup?.(); }
        else if (you) { ctx.banner(`YOU REVIVED P${f.shot + 1}`, C.GREEN, 2000); ctx.sound?.pickup?.(); }
        break;
      case AC.ES_MX_OUT:
        ctx.feed(f.shot === f.owner ? `${ctx.name(f.owner)} BLED OUT` : `${ctx.name(f.shot)} FINISHED ${f.owner === ctx.slot ? 'YOU' : `P${f.owner + 1}`}`, C.WHITE);
        if (you) ctx.banner('YOU ARE OUT  WATCH THE OTHERS', C.RED, 3500);
        else if (f.shot === ctx.slot) ctx.banner(`FINISHED P${f.owner + 1}`, C.ORANGE, 2000);
        break;
      case AC.ES_MX_HACK:
        ctx.feed(`A TERMINAL IS HACKED  ${Math.min(e.hacked, e.need)} OF ${e.need}`, C.CYAN);
        ctx.glow({ pos: up(1.5), size: 2, color: [0.3, 1, 0.45, 0.9], kind: 6, life: 800, grow: true });
        if (you) ctx.banner('TERMINAL HACKED', C.CYAN, 2000);
        ctx.sound?.pickup?.();
        break;
      case AC.ES_MX_OPEN:
        ctx.feed('THE EXITS ARE OPEN', C.GREEN);
        ctx.banner(f.shot === 2 ? 'TIME IS SHORT  THE EXITS ARE OPEN' : 'THE EXITS ARE OPEN  RUN', C.GREEN, 3500);
        break;
      case AC.ES_MX_FREE:
        ctx.feed(`${ctx.name(f.owner)} ESCAPED ${nth(f.shot)}`, C.GREEN);
        ctx.glow({ pos: up(1), size: 2.4, color: [0.4, 1, 0.5, 0.9], kind: 6, life: 900, grow: true });
        if (you) { ctx.banner(`YOU ESCAPED ${nth(f.shot)}`, C.GREEN, 3500); ctx.sound?.pickup?.(); }
        break;
      case AC.ES_MX_STUN:
        ctx.feed(`${ctx.name(f.owner)} STUNNED ${f.shot === ctx.slot ? 'YOU' : `THE HUNTER P${f.shot + 1}`}`, C.CYAN);
        ctx.glow({ pos: up(1), size: 1.6, color: [0.6, 0.9, 1, 0.9], kind: 5, life: 500 });
        if (f.shot === ctx.slot) ctx.banner('STUNNED', C.CYAN, 1500);
        else if (you) ctx.banner('THE HUNTER IS STUNNED  RUN', C.CYAN, 1500);
        break;
      case AC.ES_MX_HUNT:
        ctx.feed(`${ctx.name(f.owner)} ${you ? 'ARE' : 'IS'} THE HUNTER`, C.ORANGE);
        if (you) ctx.banner('YOU ARE THE HUNTER  DOWN THEM ALL', C.ORANGE, 3500);
        break;
      default:
    }
  },

  // The terminals (their light flickering while hacked), the exits once open
  // (a flag, a ring, the nearest one's zone), waypoints for the one shown.
  draw(view, ctx, out) {
    const terms = termsOf(view);
    for (const t of terms) {
      const noisy = t.crew && !t.done;
      const lit = noisy ? 0.55 + 0.45 * Math.abs(Math.sin(ctx.now / 37 + t.k * 1.7) * Math.sin(ctx.now / 91)) : 1;
      const c = (t.done ? SCREEN.done : noisy ? SCREEN.noise : SCREEN.idle).map((x) => x * lit);
      out.solid.push({ pos: [t.pos[0], t.pos[1] + 0.8, t.pos[2]], size: 0.5, aspect: 1.6, color: [...c, 1], kind: TERMINAL, minpx: 3 });
      if (noisy) out.glow.push({ pos: [t.pos[0], t.pos[1] + 1.25, t.pos[2]], size: 1.1, color: [1, 0.68, 0.2, 0.6 * lit], kind: 3, minpx: 1 });
    }
    const exits = exitsOf(view);
    const from = ctx.shown >= 0 ? feet(view, ctx.shown) : ctx.cam;
    for (const x of exits) {
      out.solid.push({ pos: [x[0], x[1] + 1.2, x[2]], size: 0.6, aspect: 2, color: [0.3, 1, 0.45, 1], kind: 7, minpx: 2 });
      out.glow.push({ pos: [x[0], x[1] + 0.3, x[2]], size: 1.2, color: [0.3, 1, 0.45, 0.45 + 0.2 * Math.sin(ctx.now / 200)], kind: 6, minpx: 1 });
    }
    if (exits.length) {
      const x = [...exits].sort((a, b) => across(a, from) - across(b, from))[0];
      out.zone = { x: x[0], z: x[2], r: Number(AC.ES_EXIT_R), y: x[1], color: [0.3, 1, 0.45], pulse: 0.5 + 0.5 * Math.sin(ctx.now / 250) };
    }
    if (view.hole().state !== L.H_PLAY) return;
    const me = ctx.shown >= 0 ? stateOf(view, ctx.shown) : null;
    for (const x of exits) out.markers.push({ pos: [x[0], x[1] + 2.6, x[2]], label: 'EXIT', color: C.GREEN });
    if (me?.hunter) {
      for (const t of terms) if (t.crew && !t.done) out.markers.push({ pos: [t.pos[0], t.pos[1] + 1.8, t.pos[2]], label: 'NOISE', color: C.RED });
    } else if (me && !exits.length) {
      for (const t of terms.filter((x) => !x.done).sort((a, b) => across(a.pos, from) - across(b.pos, from)).slice(0, MARKS)) {
        out.markers.push({ pos: [t.pos[0], t.pos[1] + 1.8, t.pos[2]], label: `HACK ${Math.floor(t.prog * 100)}%`, color: C.CYAN });
      }
    }
    // the downed nearest the fighter shown (not it): REVIVE to a survivor, FINISH to a hunter
    const downed = [];
    for (let q = 0; q < L.NPLAYER; q++) { const s = q === ctx.shown ? null : stateOf(view, q); if (s && !s.hunter && s.state === 'down') downed.push([q, s]); }
    downed.sort((a, b) => across(feet(view, a[0]), from) - across(feet(view, b[0]), from) || a[0] - b[0]);
    for (const [q, s] of downed.slice(0, MARKS)) {
      const p = feet(view, q, ctx.dt);
      if (me?.hunter) out.markers.push({ pos: [p[0], p[1] + 1.2, p[2]], label: 'FINISH', color: C.ORANGE });
      else out.markers.push({ pos: [p[0], p[1] + 1.2, p[2]], label: s.help ? 'REVIVING' : `REVIVE ${Math.ceil(s.time / 125)}`, color: s.help ? C.GREEN : C.RED });
    }
  },

  cols: [
    { head: 'NOW', get: (o) => (o.jugg ? 'HUNTER' : o.dead ? (o.rung ? `OUT ${nth(o.rung)}` : 'OUT') : o.down ? 'DOWN' : 'UP') },
    { head: 'REVIVES', get: (o) => (o.jugg ? '-' : String(o.points)) },
    { head: 'HACKING', get: (o) => (o.jugg ? '-' : clock(o.aux)) },
    { head: 'DOWNS', get: (o) => (o.jugg ? String(o.aux) : '-') },
    { head: 'FINISHED', get: (o) => (o.jugg ? String(o.points) : '-') },
  ],

  // The AI fighter's goal, from what it sees and hears.
  goal(view, me, ctx) {
    if (view.hole().state !== L.H_PLAY) return null;
    const mine = stateOf(view, me.slot);
    const eye = [me.pos[0], me.pos[1] + 1.6, me.pos[2]];
    const terms = termsOf(view);
    const exits = exitsOf(view);
    if (mine.hunter) return hunt(view, me, mine, eye, terms, exits, ctx);
    const friends = [];
    for (let q = 0; q < L.NPLAYER; q++) {
      if (q === me.slot) continue;
      const s = stateOf(view, q);
      if (!s.hunter && (s.state === 'up' || s.state === 'down')) friends.push([q, feet(view, q), s]);
    }
    const foes = known(view, eye, me.slot, (s) => s.hunter);
    if (mine.state === 'down') {
      // a friend standing by: still, for the revive; a hunter it knows of inside RUN: away from it; else to the nearest friend standing
      if (friends.some(([, p, s]) => s.state === 'up' && across(p, me.pos) < Number(AC.ES_REACH) + 1)) return { pos: me.pos, r: 3, hurry: 1, hold: true, still: true };
      const close = foes.filter(([, p]) => across(p, me.pos) < RUN).map(([, p]) => p);
      const off = close.length ? away(view, me.pos, close) : null;
      if (off) return { pos: off, r: 1, hurry: 1, hold: false };
      let best = null, bd = Infinity;
      for (const [, p, s] of friends) { const d = across(p, me.pos); if (s.state === 'up' && d < bd) { bd = d; best = p; } }
      return best ? { pos: best, r: 1, hurry: 1, hold: true } : null;
    }
    if (mine.state !== 'up') return null;
    // a hunter standing (a stunned one counts as farther off by 12 m)
    const threat = foes.map(([q, p, s]) => [q, p, across(p, me.pos) + (s.state === 'down' ? 12 : 0), s]).sort((a, b) => a[2] - b[2]);
    const near = threat.filter(([, , d]) => d < RUN);
    const ready = !mine.time;
    // one on top of it, standing and not calm, the shove ready: at it, to shove
    const top = near.find(([, , d, s]) => d < SHOVE && s.state === 'up' && !s.calm);
    if (top && ready) return { pos: top[1], r: 0.3, hurry: 1, hold: true, swing: true };
    // one held still over a friend it downed (finishing it), within RESCUE, the shove ready: at it, to shove it off
    const over = ready && foes.find(([q, p, s]) => s.state === 'up' && !s.calm && across(p, me.pos) < RESCUE && Math.hypot(...view.fighter(q).vel) < 2
      && friends.some(([, f, t]) => t.state === 'down' && across(f, p) < Number(AC.ES_REACH) + 0.5));
    if (over) return { pos: over[1], r: 0.3, hurry: 1, hold: true, swing: true };
    // the exits open: the nearest it can get to
    // (each the way there, and 3 m more for each metre a hunter it knows of is inside 20 m of it)
    const cost = (x) => across(x, me.pos) + near.reduce((n, [, p]) => n + 3 * Math.max(0, 20 - across(p, x)), 0);
    if (exits.length) {
      const x = [...exits].sort((a, b) => cost(a) - cost(b))[0];
      if (!near.length || across(x, me.pos) < 12) return { pos: x, r: 1, hurry: 1, hold: false, swing: ready };
    }
    if (near.length) {
      const to = away(view, me.pos, near.map(([, p]) => p));
      if (to) return { pos: to, r: 2, hurry: 1, hold: false, flee: true, swing: ready };
    }
    if (exits.length) return { pos: [...exits].sort((a, b) => cost(a) - cost(b))[0], r: 1, hurry: 1, hold: false, swing: ready };
    // a friend down near, no hunter it knows of near it: to revive it
    let help = null, hd = HELP;
    for (const [, p, s] of friends) {
      if (s.state !== 'down') continue;
      const d = across(p, me.pos);
      if (d < hd && foes.every(([, f]) => across(f, p) > CLEAR)) { hd = d; help = p; }
    }
    if (help) return { pos: help, r: 1.2, hurry: 1, hold: true, still: true };
    // a terminal to hack: the nearest, less one already crowded (two or more on it) and those a hunter is known near
    let best = null, bs = Infinity;
    for (const t of terms) {
      if (t.done) continue;
      const crew = friends.filter(([, p, s]) => s.state === 'up' && across(p, t.pos) < 3).length;
      const s = across(t.pos, me.pos) + 25 * Math.max(0, crew - 1) + (foes.some(([, p]) => across(p, t.pos) < CLEAR) ? 60 : 0);
      if (s < bs) { bs = s; best = t; }
    }
    if (best) return { pos: best.pos, r: 1.2, hurry: 1, hold: true, still: true };
    return null;
  },

  state(view) {
    const e = escapeOf(view);
    return { ...e, caught: e.downs, terms: termsOf(view).map((t) => ({ pos: t.pos.map((x) => Math.round(x * 10) / 10), prog: Math.round(t.prog * 100) / 100, done: t.done })), exits: exitsOf(view) };
  },
};

// The ticks a hunter has been finishing slot p (the most of any standing over it), or 0.
function hunterOver(view, p) {
  const at = feet(view, p);
  let n = 0;
  for (let q = 0; q < L.NPLAYER; q++) {
    const s = stateOf(view, q);
    if (s.hunter && s.fin && across(feet(view, q), at) < Number(AC.ES_REACH)) n = Math.max(n, s.fin);
  }
  return n;
}

// The hunter's goal: stunned, nothing; a downed survivor within FINISH with
// nobody standing within GUARD of it, to finish; the nearest survivor it
// knows of, led by its velocity; the nearest noisy terminal (one it is the
// nearest hunter to, before others); the exits once open; the terminals not
// hacked in turn. All but the finish at hurry 0.6: straight on to it, the
// bot's own fight (the sword) with whoever it sees on the way.
function hunt(view, me, mine, eye, terms, exits, ctx) {
  if (mine.state !== 'up') return { pos: me.pos, r: 3, hurry: 1, hold: true, still: true };
  const prey = known(view, eye, me.slot, (s) => !s.hunter && (s.state === 'up' || s.state === 'down'));
  const up = prey.filter(([, , s]) => s.state === 'up');
  const downed = prey.filter(([, p, s]) => s.state === 'down' && across(p, me.pos) < FINISH).sort((a, b) => across(a[1], me.pos) - across(b[1], me.pos));
  if (downed.length) {
    const p = downed[0][1], guard = up.some(([, u]) => across(u, p) < GUARD);
    if (!guard) return { pos: p, r: 1.2, hurry: 1, hold: true, still: true };
  }
  // (a chase is straight in at where it's going, no strafe: the bot fights whoever it sees on the way, hurry 0.6)
  if (up.length) {
    const [q, p] = up.sort((a, b) => across(a[1], me.pos) - across(b[1], me.pos))[0];
    const v = view.fighter(q).vel, lead = Math.min(0.6, across(p, me.pos) / 25);
    const x = p[0] + v[0] * lead, z = p[2] + v[2] * lead;
    return { pos: [x, view.stand(x, z, p[1] + 0.6), z], r: 0.5, hurry: 0.6, hold: false };
  }
  const hunters = [];
  for (let q = 0; q < L.NPLAYER; q++) if (q !== me.slot && stateOf(view, q).hunter && stateOf(view, q).state) hunters.push(feet(view, q));
  const noisy = terms.filter((t) => t.crew && !t.done).sort((a, b) => across(a.pos, me.pos) - across(b.pos, me.pos));
  const mineNoise = noisy.find((t) => hunters.every((h) => across(h, t.pos) >= across(me.pos, t.pos))) ?? noisy[0];
  if (mineNoise) return { pos: mineNoise.pos, r: 2, hurry: 0.6, hold: false };
  if (exits.length) return { pos: exits[((ctx.t >> 10) + me.slot) & 1], r: 4, hurry: 0.6, hold: true };
  const left = terms.filter((t) => !t.done);
  const t = left[((ctx.t >> 10) + me.slot) % Math.max(1, left.length)];
  return t ? { pos: t.pos, r: 4, hurry: 0.6, hold: false } : null;
}

// A progress bar under the middle line, in the HUD's 320 x 200 units.
function bar(ctx, share, rgb = [0.4, 1, 0.5]) {
  const y = (ctx.rows - 6) * 6 + 2;
  ctx.rect(120, y, 200, y + 3, 0.06, 0.06, 0.08, 0.75);
  ctx.rect(120, y, 120 + 80 * Math.min(1, share), y + 3, ...rgb, 1);
}
