// OBBY (M_OBBY), as drawn and as the AI fighter runs it (the rules are
// src/am/obby.wat's, its numbers src/am/obby.mjs). Everyone for itself and
// nobody armed: the frontend's free-for-all HUD with the kills and frags
// lines gone, this module's stage and time in their place. The course is the
// map's parts (src/arena-view.mjs map().parts): a marker stands over the next
// checkpoint and the finish. Nothing here is a fight, so the AI fighter is
// driven by drive(), not by the bot's brain: it walks at the next checkpoint,
// jumps what it must, and waits for what moves.
import * as L from '../../src/layout.mjs';
import * as AC from '../../src/am/consts.mjs';
import { partAt, moverAt } from '../../src/arena-view.mjs';

const TURN = 16384, FWD = 1, BACK = 2;
const rec = (view, p) => L.MODE_REC + p * L.MR_SIZE;
// slot p's stage (0 before the first checkpoint) and the ticks it finished in (0: still running)
export const stageOf = (view, p) => view.dv.getUint16(rec(view, p) + L.MR_POINTS, true);
export const doneOf = (view, p) => view.dv.getUint16(rec(view, p) + AC.OY_MR_DONE, true);
export const stages = (view) => view.dv.getUint32(L.AO + AC.OY_STAGES, true);
const clock = (ticks) => { const s = ticks / L.TICK_HZ; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`; };

// The part a fighter on `stage` goes for next: the checkpoint of the lowest
// stage past its own, or with none left the finish; null on a map with neither.
export function nextPart(map, stage) {
  let best = null;
  for (const p of map.parts) if (p.kind === L.PK_CHECK && p.stage > stage && (!best || p.stage < best.stage)) best = p;
  return best || map.parts.find((p) => p.kind === L.PK_FINISH) || null;
}
// The room as the HUD's corner lists it: who is in, the finishers first by
// their time, then by stage, then the fewer falls (the board's own order).
const ROSTER = 6;
export function roster(view) {
  const list = [];
  for (let p = 0; p < L.NPLAYER; p++) {
    const o = view.fighter(p);
    if (o.live) list.push({ slot: p, stage: stageOf(view, p), done: doneOf(view, p), deaths: o.deaths });
  }
  return list.sort((a, b) => (a.done || 1e9) - (b.done || 1e9) || b.stage - a.stage || a.deaths - b.deaths || a.slot - b.slot);
}
const mid = (b) => [(b[0] + b[3]) / 2, b[4], (b[2] + b[5]) / 2];

// The highest top at or under `top` that a body at (x, z) would stand on at
// tick t, of the map's boxes where they are then, and whether that box is a
// part that kills, and whether it is moving: [y, deadly, moving] (y
// -Infinity over nothing).
function floorAt(map, x, z, top, t, r) {
  let y = -Infinity, deadly = false, moving = false;
  const hit = (b, o) => (o ? x - r < b[3] + o[0] && x + r > b[0] + o[0] && z - r < b[5] + o[2] && z + r > b[2] + o[2] : x - r < b[3] && x + r > b[0] && z - r < b[5] && z + r > b[2]);
  const at = moversAt(map, t);
  for (let k = 0; k < map.groups.length; k++) {
    const g = map.groups[k], o = at.off[k];
    if (!hit(o ? at.built[k] : g.box, o)) continue;
    for (let i = g.first; i < g.first + g.count; i++) {
      const b = map.boxes[i].box, h = o ? b[4] + o[1] : b[4];
      if (hit(b, o) && h <= top && h > y) { y = h; moving = !!o; }
    }
  }
  for (const b of at.deadly) if (Math.abs(b[4] - y) < 0.05 && hit(b, null)) deadly = true;
  return [y, deadly, moving];
}
// What floorAt asks of a map again and again, kept: for the map, each moving
// group's bounds as built and the parts that kill; for the last tick asked
// about, where each mover and each part that kills is. (A room of fighters waiting at one edge asks
// some thousands of times a tick: 64 at Sky Steps' ferry stalled the bot host
// when every call worked these out.)
const kept = new WeakMap();
function moversAt(map, t) {
  let c = kept.get(map);
  if (!c) {
    const built = map.groups.map((g) => {
      if (!g.move) return null;
      const u = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = g.first; i < g.first + g.count; i++) { const b = map.boxes[i].box; for (let k = 0; k < 3; k++) { u[k] = Math.min(u[k], b[k]); u[k + 3] = Math.max(u[k + 3], b[k + 3]); } }
      return u;
    });
    kept.set(map, c = { built, kills: map.parts.filter((p) => p.kind === L.PK_KILL), t: NaN, off: [], deadly: [] });
  }
  if (c.t !== t) { c.t = t; c.off = map.groups.map((g) => (g.move ? moverAt(g.move, t) : null)); c.deadly = c.kills.map((p) => partAt(map, p, t)); }
  return c;
}

// A part that kills within `far` metres ahead of the body along (dx, dz) at
// tick t: how far off its near side is, and how high its top stands over the
// feet (null for none).
function killAhead(map, pos, dx, dz, far, t, body) {
  let best = null;
  for (const p of map.parts) {
    if (p.kind !== L.PK_KILL) continue;
    const b = partAt(map, p, t);
    if (b[4] < pos[1] - 0.2 || b[1] > pos[1] + body.top) continue;
    for (let s = 0.2; s <= far; s += 0.2) {
      const x = pos[0] + dx * s, z = pos[2] + dz * s, r = body.r + 0.08;
      if (x - r < b[3] && x + r > b[0] && z - r < b[5] && z + r > b[2]) { if (!best || s < best.s) best = { s, up: b[4] - pos[1] }; break; }
    }
  }
  return best;
}

export default {
  mode: L.M_OBBY,
  key: 'obby',
  kills: false,
  frags: false,
  own: true,

  // nothing to shoot with or be shot by: the frontend draws no bars, tracker or crosshair, and a phone has only a jump
  unarmed: true,

  // rows 0 to 2 (no kills line over them: nobody is counting kills): your
  // stage of the course's or your time, how many are home, where a fall puts
  // you. Where a fight's bars would be, the course as a bar, a cell a stage
  // and the finish's last, and your run's clock under it; in the top right
  // the room by how far along each is, as a Roblox place lists its players.
  hud(view, ctx) {
    const n = stages(view);
    if (view.hole().state === L.H_COUNT) { ctx.put(1, 0, 'REACH THE END  MIND WHAT GLOWS RED', ctx.C.WHITE); return; }
    if (ctx.slot < 0) return;
    const done = doneOf(view, ctx.slot), st = stageOf(view, ctx.slot);
    ctx.put(1, 0, done ? `FINISHED IN ${clock(done)}` : n ? `STAGE ${st} OF ${n}` : 'RUN FOR THE FINISH', done ? ctx.C.GREEN : ctx.C.YELLOW);
    const fin = view.dv.getUint32(L.AO + AC.OY_DONE, true);
    if (fin) ctx.put(1, 1, `${fin} FINISHED`, ctx.C.GREY);
    if (!done && ctx.me && ctx.me.dead) ctx.put(1, 2, st ? 'BACK TO YOUR CHECKPOINT' : 'BACK TO THE START', ctx.C.RED);
    if (ctx.board || view.hole().state !== L.H_PLAY) return;
    if (ctx.rect) {
      // (320 x 200 units: the bars' own place under the match's clock)
      const w = 100 / (n + 1);
      ctx.rect(109, 8, 211, 15, 0.05, 0.08, 0.12, 0.7);
      for (let k = 0; k <= n; k++) {
        const c = k === n ? (done ? [1, 0.85, 0.3] : [0.3, 0.27, 0.12]) : k < st || done ? [0.3, 0.9, 0.45] : [0.15, 0.2, 0.17];
        ctx.rect(110 + k * w + 0.5, 9, 110 + (k + 1) * w - 0.5, 14, ...c);
      }
    }
    ctx.centre?.(3, clock(done || Math.round((ctx.t ?? 0) * L.TICK_HZ)), done ? ctx.C.GREEN : ctx.C.WHITE);
    if (!ctx.right) return;
    const list = roster(view), top = list.slice(0, ROSTER);
    const mine = list.find((o) => o.slot === ctx.slot);
    if (mine && !top.includes(mine)) top[ROSTER - 1] = mine;
    top.forEach((o, k) => ctx.right(k, `${ctx.name ? ctx.name(o.slot) : `P${o.slot + 1}`}  ${o.done ? clock(o.done) : String(o.stage).padStart(2)}`, o.slot === ctx.slot ? ctx.C.YELLOW : o.done ? ctx.C.GREEN : ctx.C.WHITE));
  },

  news(f, ctx) {
    const mine = f.owner === ctx.slot;
    if (f.size === AC.OY_MX_STAGE) {
      if (mine) { ctx.banner(`CHECKPOINT ${f.shot}`, ctx.C.GREEN, 1200); ctx.sound.pickup?.(); }
      ctx.glow({ pos: f.pos, size: 1.6, color: [0.3, 1, 0.45, 0.8], kind: 6, life: 500, grow: 3 });
      return;
    }
    if (f.size === AC.OY_MX_DONE) {
      const nth = ['', '1ST', '2ND', '3RD'][f.shot] || `${f.shot}TH`;
      ctx.feed(`${ctx.name(f.owner)} FINISHED ${nth}`, mine ? ctx.C.GREEN : ctx.C.WHITE);
      if (mine) ctx.banner(`FINISHED ${nth}`, ctx.C.YELLOW, 2500);
      ctx.glow({ pos: f.pos, size: 2.4, color: [1, 0.9, 0.4, 0.9], kind: 6, life: 900, grow: 4 });
      return;
    }
    if (f.size === AC.OY_MX_FIRST) ctx.banner(mine ? `${f.shot} SECONDS FOR THE REST` : `${ctx.name(f.owner)} IS HOME  ${f.shot} SECONDS LEFT`, ctx.C.RED, 2500);
  },

  // a waypoint over the next checkpoint of the fighter shown, and the finish once it is all that's left
  draw(view, ctx, out) {
    if (ctx.shown < 0 || doneOf(view, ctx.shown)) return;
    const map = view.map(), next = nextPart(map, stageOf(view, ctx.shown));
    if (!next) return;
    const p = mid(partAt(map, next, view.tick));
    out.markers.push({ pos: [p[0], p[1] + 1.2, p[2]], label: next.kind === L.PK_FINISH ? 'FINISH' : `CHECKPOINT ${next.stage}`, color: next.kind === L.PK_FINISH ? ctx.C?.YELLOW : ctx.C?.GREEN });
  },

  // (the frontend hands a column the view too: a run's time is the mode's record, not the fighter's)
  cols: [{ head: 'STAGE', get: (o) => String(o.points) }, { head: 'FALLS', get: (o) => String(o.deaths) }, { head: 'TIME', get: (o, view) => (view && doneOf(view, o.slot) ? clock(doneOf(view, o.slot)) : '-') }],

  // the board's order in play: by stage, then the fewer falls (the sim's places once it's over, finishers first)
  standing: (o) => o.points * 65536 + (65535 - Math.min(o.deaths, 65535)),

  dealt: () => 'NO GUNS  JUST LEGS',

  goal: () => null,

  // The AI fighter's word for this tick: at the next checkpoint (or the
  // finish), forward; a jump at an edge with somewhere to land in a jump's
  // reach, and over a low thing that kills; a halt at an edge with nowhere
  // to land yet (a platform on its way) and before a tall thing that kills.
  drive(view, me, bot, t) {
    const map = view.map(), body = map.body, slot = bot.slot;
    if (doneOf(view, slot)) return { move: 0 };
    const next = nextPart(map, stageOf(view, slot));
    if (!next) return { move: 0 };
    const tick = view.tick, at = mid(partAt(map, next, tick));
    const dx0 = at[0] - me.pos[0], dz0 = at[2] - me.pos[2], d = Math.hypot(dx0, dz0) || 1;
    // straight at it, unless an edge sent it another way for a while (bot.oy, below) and it is still on the ground this side
    const steer = bot.oy && t < bot.oy.until && bot.oy.slot === undefined ? bot.oy : null;
    const aim = steer ? steer.ang : Math.atan2(dz0, dx0);
    const dx = Math.cos(aim), dz = Math.sin(aim);
    bot.turnTo(aim * TURN / (2 * Math.PI), 512, 0.5);
    bot.pitch = 512;
    const off = Math.abs(((aim * TURN / (2 * Math.PI) - bot.yaw + TURN * 1.5) % TURN) - TURN / 2);
    if (off > TURN / 12) return { move: 0 };
    if (!me.ground) { if (steer) bot.oy.until = Math.min(bot.oy.until, t + 40); return { move: FWD }; }
    // how far a jump carries: the map's own walk and gravity, or the arena's
    const mv = map.movement;
    const air = mv ? 2 * mv.jump / (mv.grav * L.TICK_HZ) : 2 * Number(L.PHYS.JUMP) / (Number(L.PHYS.GP_DT) * L.TICK_HZ);
    // (0.9 of it: the halt a stride short of an edge is where a thin body must find its landing from)
    const reach = 0.9 * (mv ? mv.walk : Number(L.PHYS.RUN)) * air;
    const speed = me.vel[0] * dx + me.vel[2] * dz, fast = speed > 0.7 * (mv ? mv.walk : Number(L.PHYS.RUN));
    // something that kills in the way: over a low one, wait out a tall one
    // (on a belt running its way it meets one sooner: it looks, and jumps, as much further off as the belt makes it faster)
    let pace = 1;
    for (const p of map.parts) {
      if (p.kind !== L.PK_CONVEY) continue;
      const b = partAt(map, p, tick);
      if (me.pos[0] > b[0] && me.pos[0] < b[3] && me.pos[2] > b[2] && me.pos[2] < b[5] && Math.abs(b[4] - me.pos[1]) < 0.1) pace = Math.max(1, 1 + (p.a * dx + p.b * dz) / (mv ? mv.walk : Number(L.PHYS.RUN)));
    }
    // (and where one that moves will be in the half second the crossing takes: a wall sweeping in is waited for)
    const kill = killAhead(map, me.pos, dx, dz, 1.6 * pace, tick, body) || killAhead(map, me.pos, dx, dz, 1.6 * pace, tick + 35, body) || killAhead(map, me.pos, dx, dz, 1.6 * pace, tick + 70, body);
    if (kill) {
      if (kill.up > 1) return { move: 0 };
      if (kill.s <= 1.0 * pace) return { move: FWD, jump: 1 };
      return { move: FWD };
    }
    // a ladder at hand with more of it overhead: forward climbs it (a wall is no floor to the test below)
    for (const p of map.parts) {
      if (p.kind !== L.PK_LADDER) continue;
      const b = partAt(map, p, tick), r = body.r + 0.4;
      if (me.pos[0] - r < b[3] && me.pos[0] + r > b[0] && me.pos[2] - r < b[5] && me.pos[2] + r > b[2] && b[4] > me.pos[1] + 0.3 && b[1] < me.pos[1] + body.top) return { move: FWD };
    }
    // the floor a stride on, every step of the way (a thin body falls into a gap a wide one strides): there, walk
    const at2 = (ax, az, s) => floorAt(map, me.pos[0] + ax * s, me.pos[2] + az * s, me.pos[1] + 0.6, tick, body.r);
    const okAt = (ax, az, s) => { const [y, deadly] = at2(ax, az, s); return y > me.pos[1] - 2.5 && !deadly; };
    const ok = (s) => okAt(dx, dz, s);
    const clear = (to) => { for (let s = 0.1; s <= to + 1e-6; s += 0.1) if (!ok(s)) return false; return true; };
    if (clear(0.9) || d < 0.9) return { move: FWD };
    // an edge. Nothing that moves is jumped from or onto: it comes alongside,
    // and is walked. Else somewhere to land inside a jump's reach, taken at
    // speed: short of it, a step back from the brink for the run-up.
    const brink = !clear(0.5);
    const landing = (ax, az) => { for (let s = 1.4; s <= reach + 1e-6; s += 0.1) if (okAt(ax, az, s) && okAt(ax, az, s + 0.4) && !at2(ax, az, s)[2]) return true; return false; };
    if (!at2(dx, dz, 0)[2]) {
      if (landing(dx, dz)) return fast ? { move: FWD, jump: 1 } : { move: brink ? BACK : FWD };
      // none straight on (a stone off the line to the checkpoint): the nearest heading that has one, held a while
      if (!steer) {
        for (const da of [0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8, 1.0, -1.0]) {
          const a = aim + da;
          if (landing(Math.cos(a), Math.sin(a))) { bot.oy = { ang: a, until: t + 250 }; break; }
        }
      }
    }
    return { move: brink ? BACK : 0 };
  },

  state(view) {
    const done = [];
    let furthest = 0, falls = 0;
    for (let p = 0; p < L.NPLAYER; p++) {
      if (doneOf(view, p)) done.push(p);
      if (view.fighter(p).live) { furthest = Math.max(furthest, stageOf(view, p)); falls += view.fighter(p).deaths; }
    }
    // (finished: this match's so far, and every match before it was run to its end)
    return { leader: view.mode().leader, stages: stages(view), furthest, falls, finished: view.dv.getUint32(L.AO + AC.OY_DONE, true) + view.hole().hole, done };
  },
};
