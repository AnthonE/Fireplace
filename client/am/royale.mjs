// BATTLE ROYALE (M_ROYALE), as drawn and as the AI fighter plays it (the
// rules are src/am/royale.wat's, the circles and crates AO's as
// src/am/royale.mjs lays them out). The zone is drawn from the circles and
// the schedule as the sim has them, run on to the frame (zoneAt, the sim's
// $ry_zone in doubles): the renderer's storm (client/arena-render.mjs) tints
// the ground and boxes outside the wall violet, hangs the wall as a curtain
// where the eye's ray crosses it and draws the next circle as a white line
// on the ground; a minimap at the top right has the bounds, the wall, the
// next circle and you. Each shut crate is a crate sprite (kind CRATE) in its
// loot's colour (a gun's rarity, shields blue, health red, frags orange). The
// HUD has who's alive and your kills, when the zone moves and how far in you
// are; the feed every fighter out with how many are left, the zone's news,
// what you looted; the board your kills, crates and when you went out.
// The brain: outside the wall, straight in; outside the next circle with too
// little time to walk in before it closes, in, shooting on the way; holding
// the starter alone, the nearest crate of use (and only that, at a hurry);
// armed, a crate of use within LOOT at no hurry; else a point inside the
// next circle, fighting whoever it sees on the way.
import * as L from '../../src/layout.mjs';
import * as AC from '../../src/am/consts.mjs';
import { C } from '../font.mjs';

// the renderer's crate sprite (client/arena-render.mjs, fs_splat)
export const CRATE = 16;
// a crate's colour by what it holds: a gun by rarity (common, uncommon, rare, epic, legendary), or the item's
const RARE = [[0.78, 0.78, 0.74], [0.35, 0.85, 0.35], [0.3, 0.55, 1], [0.7, 0.35, 1], [1, 0.72, 0.2]];
const RARITY = { [L.W_AR]: 0, [L.W_MAGNUM]: 0, [L.W_BR]: 1, [L.W_SHOTGUN]: 1, [L.W_PLASMA]: 2, [L.W_NEEDLER]: 2, [L.W_SNIPER]: 3, [L.W_ROCKET]: 4, [L.W_SWORD]: 4 };
const ITEM = { [AC.RY_R_OVER]: [0.35, 0.8, 1], [AC.RY_R_HEAL]: [0.95, 0.3, 0.3], [AC.RY_R_FRAGS]: [1, 0.55, 0.15] };
export const crateColor = (what) => ITEM[what] ?? RARE[RARITY[what] ?? 0];
// what a crate holds, in the feed's words
const ITEM_NAME = { [AC.RY_R_OVER]: 'OVERSHIELD', [AC.RY_R_HEAL]: 'HEALTH', [AC.RY_R_FRAGS]: 'FRAGS' };
export const lootName = (what) => ITEM_NAME[what] ?? L.ARMS[what]?.name ?? '?';
const STORM = [0.62, 0.3, 0.95];
const LOOT = 30; // m: an armed fighter goes for a crate of use this near
const RUN = 8.5; // m/s the brain reckons it gets in at, round what's in the way
const HALF = 0.45; // m: half a crate's side, its middle this over its foot

// The tick of play the confirmed world last ran ($a_played as its hooks saw it: the header's tick has moved on by one since).
export const playedOf = (h) => (h.tick - 1 - h.start) >>> 0;
const clock = (n) => `${Math.floor(n / 125 / 60)}:${String(Math.floor(n / 125) % 60).padStart(2, '0')}`;
const across = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// The circles as AO holds them: [{ x, z, r }] for circles 0 .. RY_STAGES (all 0 before play).
export function circlesOf(view) {
  const f = (o) => view.dv.getFloat32(L.AO + o, true);
  return Array.from({ length: AC.RY_STAGES + 1 }, (_, k) => ({ x: f(AC.RY_C + 16 * k), z: f(AC.RY_C + 16 * k + 4), r: f(AC.RY_C + 16 * k + 8) }));
}

// RY_SCHED's ticks of play on this match's clock (the sim's $ry_at).
export function scheduleOf(view) {
  const h = view.hole(), full = L.MODE_TICKS[L.M_ROYALE];
  const len = Math.min(full, (h.until - h.start) >>> 0);
  return AC.RY_SCHED.map((t) => Math.floor(t * len / full));
}

// The zone at `played` ticks of play (a fraction for drawing between ticks),
// as $ry_zone has it: the wall { x, z, r }, its stage (closes done), whether
// it is closing, the next circle (null once the last has closed), the ticks
// until the next close starts (0 while closing, null when none is left), until
// it ends, and the damage a second outside.
export function zoneAt(view, played, cs = circlesOf(view), at = scheduleOf(view)) {
  let k = 0;
  while (k < AC.RY_STAGES && played >= at[2 * k + 1]) k++;
  if (k >= AC.RY_STAGES) return { ...cs[k], wall: cs[k], stage: k, closing: false, next: null, closeIn: null, endIn: null, hit: AC.RY_DMG_END };
  const s = at[2 * k], e = at[2 * k + 1], a = cs[k], b = cs[k + 1];
  const closing = played >= s;
  const f = closing ? (played - s) / Math.max(1, e - s) : 0;
  const wall = { x: a.x + f * (b.x - a.x), z: a.z + f * (b.z - a.z), r: a.r + f * (b.r - a.r) };
  return { ...wall, wall, stage: k, closing, next: b, closeIn: closing ? 0 : s - played, endIn: e - played, hit: AC.RY_DMG[k] };
}

// The match's counts and how it ended (RY_END: 0 playing, 1 one stood, 2 nobody stood, 3 the clock).
export function royaleOf(view) {
  const u = (o) => view.dv.getUint32(L.AO + o, true);
  return { crates: u(AC.RY_N), stand: u(AC.RY_STAND), out: u(AC.RY_OUT), end: u(AC.RY_END), stage: u(AC.RY_STAGE), closing: u(AC.RY_CLOSING),
    hit: u(AC.RY_HIT), opened: u(AC.RY_OPENED), zoned: u(AC.RY_ZONED), winner: view.mode().winner };
}

// The crates as AO holds them: { k, pos (its foot), what, open }.
export function cratesOf(view) {
  const dv = view.dv, n = Math.min(AC.RY_MAX, dv.getUint32(L.AO + AC.RY_N, true)), out = [];
  for (let k = 0; k < n; k++) {
    const a = L.AO + AC.RY_CRATES + k * AC.RY_CSIZE;
    out.push({ k, pos: [dv.getFloat32(a, true), dv.getFloat32(a + 4, true), dv.getFloat32(a + 8, true)], what: view.u8[a + 12], open: !!view.u8[a + 13] });
  }
  return out;
}

// Whether a crate holding `what` is of use to fighter f (the sim's $ry_use).
export function useful(f, what) {
  if (what < AC.RY_R_OVER) {
    const s = f.gun.indexOf(what);
    if (s >= 0) return f.mag[s] < L.ARMS[what].mag || f.res[s] < L.ARMS[what].res || (f.gun[s ^ 1] === what && (f.mag[s ^ 1] < L.ARMS[what].mag || f.res[s ^ 1] < L.ARMS[what].res));
    return f.gun.includes(AC.RY_GUN);
  }
  if (what === AC.RY_R_OVER) return f.sh < L.OVERSHIELD;
  if (what === AC.RY_R_HEAL) return f.hp < 100 || f.sh < 100;
  if (what === AC.RY_R_FRAGS) return f.grens < 4;
  return false;
}
// Whether a fighter holds nothing but the starter.
export const bare = (f) => f.gun.every((g) => g === AC.RY_GUN || g === 0);
// Slot p is standing (in the room, alive); out from the start (came in after the first close).
const standing = (o) => o.live && !o.dead;
const late = (o) => o.live && o.dead && !o.points;

// A point the brain can stand at near (x, z): on the ground or a floor there,
// out of every box, kept inside the bounds; the first of it and eight round it 3 m off.
function spot(view, x, z) {
  const map = view.map(), [x0, x1, z0, z1] = map.bounds;
  for (let k = 0; k < 9; k++) {
    const a = k * Math.PI / 4;
    const px = Math.max(x0 + 3, Math.min(x1 - 3, x + (k ? 3 * Math.cos(a) : 0))), pz = Math.max(z0 + 3, Math.min(z1 - 3, z + (k ? 3 * Math.sin(a) : 0)));
    const y = view.stand(px, pz, view.height(px, pz) + 0.6);
    const inside = map.boxes.some((b) => px + 0.5 > b.box[0] && px - 0.5 < b.box[3] && pz + 0.5 > b.box[2] && pz - 0.5 < b.box[5] && y + 1 > b.box[1] && y + 0.5 < b.box[4]);
    if (!inside) return [px, y, pz];
  }
  return [x, view.height(x, z), z];
}

// Toward circle c's middle from `pos`: a point `share` of its radius from the
// middle on the way there (the middle itself for a circle of no size, or from inside that).
function into(view, pos, c, share) {
  const d = Math.hypot(pos[0] - c.x, pos[2] - c.z), k = Math.min(d, share * c.r);
  if (d < 1e-3) return spot(view, c.x, c.z);
  return spot(view, c.x + (pos[0] - c.x) / d * k, c.z + (pos[2] - c.z) / d * k);
}

// Draws the minimap at the HUD's top right (320 x 200 units): the bounds, the
// wall in violet, the next circle in white, the fighter shown in yellow.
function minimap(view, ctx, z) {
  const [x0, x1, z0, z1] = view.map().bounds;
  const W = 46, s = W / Math.max(x1 - x0, z1 - z0), w = (x1 - x0) * s, d = (z1 - z0) * s;
  const left = 316 - w, top = 4;
  const at = (x, zz) => [left + (x - x0) * s, top + (zz - z0) * s];
  ctx.rect(left - 1, top - 1, left + w + 1, top + d + 1, 0.04, 0.04, 0.06, 0.6);
  const ring = (c, n, rgb, a) => {
    for (let k = 0; k < n; k++) {
      const t = k / n * 2 * Math.PI, [px, py] = at(c.x + c.r * Math.cos(t), c.z + c.r * Math.sin(t));
      if (px < left - 1 || px > left + w + 1 || py < top - 1 || py > top + d + 1) continue;
      ctx.rect(px - 0.6, py - 0.6, px + 0.6, py + 0.6, ...rgb, a);
    }
  };
  ring(z.wall, 28, STORM, 0.95);
  if (z.next) ring(z.next, 20, [1, 1, 1], 0.9);
  if (ctx.me && ctx.me.live && !ctx.me.dead) {
    const [px, py] = at(ctx.me.pos[0], ctx.me.pos[2]);
    ctx.rect(px - 1, py - 1, px + 1, py + 1, 1, 0.9, 0.2, 1);
  }
}

export default {
  mode: L.M_ROYALE,
  key: 'royale',
  // the top left is its own (the alive count over your kills), and the board's columns are
  own: true,
  kills: false,
  // the board's order in play, as the sim's $ry_key: standing first, then the later out, then kills
  standing: (o) => (standing(o) ? 2 ** 31 : Math.min(o.points, 0xffff) * 32768) + Math.min(o.kills, 0x7fff),
  over: (view) => {
    const e = royaleOf(view);
    if (e.end === 1 && e.winner >= 0) return `P${e.winner + 1} IS THE LAST ONE STANDING`;
    if (e.end === 2) return 'NOBODY STOOD';
    return `${e.stand} STOOD TO THE END`;
  },
  dead: (f) => (late(f) ? 'THE ZONE HAD MOVED  WATCHING' : 'OUT  WATCHING'),
  // out, you watch someone standing
  watch: (view, q) => standing(view.fighter(q)),
  dealt: () => 'MAGNUM  CRATES HAVE THE GUNS',

  // rows 0 to 3: how many are alive and your kills; when the zone moves; how far in you are
  hud(view, ctx) {
    const h = view.hole();
    if (h.state === L.H_COUNT) {
      ctx.put(1, 0, 'ONE LIFE  EVERYONE FOR THEMSELVES', ctx.C.YELLOW);
      ctx.put(1, 1, 'WALK INTO CRATES FOR GUNS', ctx.C.GREY);
      ctx.put(1, 2, 'STAY INSIDE THE ZONE', ctx.C.GREY);
      return;
    }
    if (h.state !== L.H_PLAY) return;
    const e = royaleOf(view);
    const z = zoneAt(view, playedOf(h));
    const me = ctx.me;
    ctx.put(1, 0, `${e.stand} ALIVE${me ? `  ${me.kills} KILL${me.kills === 1 ? '' : 'S'}` : ''}`, ctx.C.YELLOW);
    if (z.next === null) ctx.put(1, 1, 'THE ZONE HAS CLOSED', ctx.C.RED);
    else if (z.closing) ctx.put(1, 1, `ZONE CLOSING  ${clock(z.endIn)}`, ctx.C.RED);
    else ctx.put(1, 1, `ZONE MOVES IN ${clock(z.closeIn)}`, z.closeIn < AC.RY_WARN ? ctx.C.ORANGE : ctx.C.WHITE);
    if (me && me.live && !me.dead) {
      const out = Math.hypot(me.pos[0] - z.x, me.pos[2] - z.z) >= z.r;
      const far = z.next ? Math.hypot(me.pos[0] - z.next.x, me.pos[2] - z.next.z) - z.next.r : 0;
      if (out) ctx.put(1, 2, `OUTSIDE THE ZONE  ${z.hit} A SECOND`, (ctx.now >> 8) & 1 ? ctx.C.RED : ctx.C.WHITE);
      else if (far > 0) ctx.put(1, 2, `${Math.ceil(far)} M TO THE NEXT CIRCLE`, ctx.C.ORANGE);
      else ctx.put(1, 2, 'IN THE NEXT CIRCLE', ctx.C.GREY);
    }
    if (ctx.watching && ctx.mine >= 0) {
      const mine = view.fighter(ctx.mine);
      if (mine.dead) ctx.centre(ctx.rows - 9, `YOU ARE OUT  WATCHING P${ctx.slot + 1}`, ctx.C.RED);
    }
    minimap(view, ctx, z);
  },

  // The feed: fighters out and how many are left, the zone's news, your loot.
  news(f, ctx) {
    const you = ctx.slot >= 0 && f.owner === ctx.slot;
    switch (f.size) {
      case AC.RY_MX_OUT:
        ctx.feed(`${ctx.name(f.owner)} ${you ? 'ARE' : 'IS'} OUT  ${f.shot} LEFT`, you ? C.RED : C.WHITE);
        if (you) ctx.banner(`YOU ARE OUT  #${f.shot + 1}`, C.RED, 4000);
        break;
      case AC.RY_MX_SHOW:
        ctx.feed(f.shot === 1 ? 'THE FIRST CIRCLE IS ON THE MAP' : 'THE NEXT CIRCLE IS ON THE MAP', C.CYAN);
        if (f.shot > 1) ctx.banner('NEXT CIRCLE SHOWN', C.CYAN, 2000);
        break;
      case AC.RY_MX_WARN:
        ctx.banner(`THE ZONE MOVES IN ${Math.round(AC.RY_WARN / 125)}`, C.ORANGE, 2500);
        ctx.sound?.tick?.();
        break;
      case AC.RY_MX_CLOSE:
        ctx.feed('THE ZONE IS CLOSING IN', C.RED);
        ctx.banner('THE ZONE IS CLOSING', C.RED, 2500);
        break;
      case AC.RY_MX_LOOT: {
        const c = crateColor(f.shot);
        ctx.glow({ pos: [f.pos[0], f.pos[1] + HALF, f.pos[2]], size: 1.4, color: [...c, 0.9], kind: 6, life: 450, grow: true });
        if (you) { ctx.banner(lootName(f.shot), C.YELLOW, 1800); ctx.sound?.pickup?.(); }
        break;
      }
      case AC.RY_MX_LATE:
        if (you) ctx.banner('THE ZONE HAS MOVED  YOU WATCH THIS ONE', C.ORANGE, 4000);
        break;
      case AC.RY_MX_WIN:
        ctx.feed(`${ctx.name(f.owner)} ${you ? 'ARE' : 'IS'} THE LAST ONE STANDING`, C.YELLOW);
        ctx.banner(you ? 'VICTORY  LAST ONE STANDING' : `P${f.owner + 1} WINS`, C.YELLOW, 5000);
        break;
      case AC.RY_MX_END:
        ctx.banner(f.shot ? `${f.shot} STOOD TO THE END` : 'NOBODY STOOD', f.shot ? C.GREEN : C.RED, 4000);
        break;
      default:
    }
  },

  // Each shut crate on its foot, bobbing a little in a glow of its colour;
  // the zone as the frame has it (the renderer's storm); a waypoint on the
  // nearest crate of use while the fighter shown holds the starter alone,
  // and on the next circle's middle while it is outside it.
  draw(view, ctx, out) {
    for (const c of cratesOf(view)) {
      if (c.open) continue;
      const col = crateColor(c.what);
      const mid = [c.pos[0], c.pos[1] + HALF + 0.05 * Math.sin(ctx.now / 400 + c.k), c.pos[2]];
      out.solid.push({ pos: mid, size: HALF, aspect: 1, color: [...col, 1], kind: CRATE, minpx: 3 });
      out.glow.push({ pos: [c.pos[0], c.pos[1] + 0.2, c.pos[2]], size: 1, color: [...col, 0.35], kind: 3, minpx: 1 });
    }
    const h = view.hole();
    if (h.state !== L.H_PLAY && h.state !== L.H_OVER) return;
    // (once it's over, the wall where it stopped)
    if (h.state === L.H_OVER) {
      const f = (o) => view.dv.getFloat32(L.AO + o, true);
      if (f(AC.RY_C + 8) > 0) out.storm = { x: f(AC.RY_WX), z: f(AC.RY_WZ), r: f(AC.RY_WR), next: null };
      return;
    }
    const z = zoneAt(view, playedOf(h) + ctx.dt * 125);
    out.storm = { x: z.x, z: z.z, r: z.r, next: z.next };
    const eye = ctx.shown >= 0 ? view.fighter(ctx.shown) : null;
    if (!eye || !standing(eye)) return;
    if (z.next && Math.hypot(eye.pos[0] - z.next.x, eye.pos[2] - z.next.z) > z.next.r) {
      out.markers.push({ pos: [z.next.x, view.height(z.next.x, z.next.z) + 2, z.next.z], label: 'ZONE', color: C.PURPLE });
    }
    if (bare(eye)) {
      let best = null, bd = 120;
      for (const c of cratesOf(view)) {
        if (c.open || !useful(eye, c.what)) continue;
        const d = across(c.pos, eye.pos);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) out.markers.push({ pos: [best.pos[0], best.pos[1] + 1.2, best.pos[2]], label: 'LOOT', color: C.YELLOW });
    }
  },

  cols: [
    { head: 'KILLS', get: (o) => String(o.kills) },
    { head: 'CRATES', get: (o) => String(o.aux) },
    { head: 'STATUS', get: (o) => (standing(o) ? 'ALIVE' : o.points ? `OUT ${clock(o.points - 1)}` : 'LATE') },
  ],

  // The AI fighter's goal, from the zone, its guns and the crates.
  goal(view, me, ctx) {
    const h = view.hole();
    if (h.state !== L.H_PLAY || !standing(me)) return null;
    const z = zoneAt(view, playedOf(h));
    const next = z.next ?? z.wall;
    const fromWall = Math.hypot(me.pos[0] - z.x, me.pos[2] - z.z);
    // outside the wall (or about to be): straight in, fighting nobody
    if (fromWall > z.r - 3) return { pos: into(view, me.pos, z.closing ? next : z.wall, 0.4), r: 4, hurry: 0.95, hold: false };
    // the next circle: in while there's time to walk it, with some to spare
    const far = Math.hypot(me.pos[0] - next.x, me.pos[2] - next.z) - next.r * 0.8;
    const left = z.next === null ? 0 : z.closing ? z.endIn : z.closeIn + (z.endIn - z.closeIn) * 0.5;
    if (far > 0 && far / RUN * 125 + 1500 > left) return { pos: into(view, me.pos, next, 0.5), r: 4, hurry: 0.6, hold: false };
    // loot: the nearest crate of use, any distance holding the starter alone; armed, within LOOT
    const need = bare(me);
    let best = null, bd = need ? 200 : LOOT;
    for (const c of cratesOf(view)) {
      if (c.open || !useful(me, c.what)) continue;
      if (z.next && Math.hypot(c.pos[0] - next.x, c.pos[2] - next.z) > next.r && (z.closing || z.closeIn < 30 * 125)) continue;
      const d = across(c.pos, me.pos) + 3 * Math.abs(c.pos[1] - me.pos[1]);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return { pos: best.pos, r: 0.7, hurry: need ? 0.6 : 0, hold: false };
    // else somewhere inside the next circle, a new spot every 16 s or so
    let seed = ((me.slot + 1) * 0x9e3779b1 + (ctx.t >> 11) * 0x85ebca6b) >>> 0;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
    const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * next.r * 0.6;
    return { pos: spot(view, next.x + d * Math.cos(a), next.z + d * Math.sin(a)), r: 6, hurry: 0, hold: false };
  },

  state(view) {
    const h = view.hole();
    const z = h.state === L.H_PLAY ? zoneAt(view, playedOf(h)) : null;
    return { ...royaleOf(view), wall: z ? [z.x, z.z, z.r].map((v) => Math.round(v * 10) / 10) : null, shut: cratesOf(view).filter((c) => !c.open).length };
  },
};
