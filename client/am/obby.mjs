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
import { partAt } from '../../src/arena-view.mjs';

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
const mid = (b) => [(b[0] + b[3]) / 2, b[4], (b[2] + b[5]) / 2];

// The highest top at or under `top` that a body at (x, z) would stand on at
// tick t, of the map's boxes where they are then, and whether that box is a
// part that kills, and whether it is moving: [y, deadly, moving] (y
// -Infinity over nothing).
function floorAt(map, x, z, top, t, r) {
  let y = -Infinity, deadly = false, moving = false;
  const hit = (b) => x - r < b[3] && x + r > b[0] && z - r < b[5] && z + r > b[2];
  for (const g of map.groups) {
    const o = g.move ? moverOf(g.move, t) : null;
    if (!o && !hit(g.box)) continue;
    for (let k = g.first; k < g.first + g.count; k++) {
      const b = map.boxes[k].box, bb = o ? [b[0] + o[0], b[1] + o[1], b[2] + o[2], b[3] + o[0], b[4] + o[1], b[5] + o[2]] : b;
      if (hit(bb) && bb[4] <= top && bb[4] > y) { y = bb[4]; moving = !!o; }
    }
  }
  for (const p of map.parts) {
    if (p.kind !== L.PK_KILL) continue;
    const b = partAt(map, p, t);
    if (hit(b) && Math.abs(b[4] - y) < 0.05) deadly = true;
  }
  return [y, deadly, moving];
}
// (partAt's mover, for a group: kept apart so floorAt needn't build a part)
function moverOf(mv, t) { return partAt({ groups: [{ move: mv }] }, { group: 0, box: [0, 0, 0, 0, 0, 0] }, t); }

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

  // rows 2 to 4: your stage of the course's, your time or the clock's cut
  hud(view, ctx) {
    const n = stages(view);
    if (view.hole().state === L.H_COUNT) { ctx.put(1, 2, 'REACH THE END  MIND WHAT GLOWS RED', ctx.C.WHITE); return; }
    if (ctx.slot < 0) return;
    const done = doneOf(view, ctx.slot), st = stageOf(view, ctx.slot);
    ctx.put(1, 2, done ? `FINISHED IN ${clock(done)}` : n ? `STAGE ${st} OF ${n}` : 'RUN FOR THE FINISH', done ? ctx.C.GREEN : ctx.C.YELLOW);
    const fin = view.dv.getUint32(L.AO + AC.OY_DONE, true);
    if (fin) ctx.put(1, 3, `${fin} FINISHED`, ctx.C.GREY);
    if (!done && ctx.me && ctx.me.dead) ctx.put(1, 4, st ? 'BACK TO YOUR CHECKPOINT' : 'BACK TO THE START', ctx.C.RED);
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

  cols: [{ head: 'STAGE', get: (o) => String(o.points) }, { head: 'FALLS', get: (o) => String(o.deaths) }],

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
    const dx = dx0 / d, dz = dz0 / d;
    bot.turnTo(Math.atan2(dz, dx) * TURN / (2 * Math.PI), 512, 0.5);
    bot.pitch = 512;
    const off = Math.abs(((Math.atan2(dz, dx) * TURN / (2 * Math.PI) - bot.yaw + TURN * 1.5) % TURN) - TURN / 2);
    if (off > TURN / 12) return { move: 0 };
    if (!me.ground) return { move: FWD };
    // how far a jump carries: the map's own walk and gravity, or the arena's
    const mv = map.movement;
    const air = mv ? 2 * mv.jump / (mv.grav * L.TICK_HZ) : 2 * Number(L.PHYS.JUMP) / (Number(L.PHYS.GP_DT) * L.TICK_HZ);
    const reach = 0.85 * (mv ? mv.walk : Number(L.PHYS.RUN)) * air;
    const speed = me.vel[0] * dx + me.vel[2] * dz, fast = speed > 0.7 * (mv ? mv.walk : Number(L.PHYS.RUN));
    // something that kills in the way: over a low one, wait out a tall one
    const kill = killAhead(map, me.pos, dx, dz, 1.6, tick, body);
    if (kill) {
      if (kill.up > 1) return { move: 0 };
      if (kill.s <= 1.0) return { move: FWD, jump: 1 };
      return { move: FWD };
    }
    // the floor a stride on: there, walk
    const under = (s) => floorAt(map, me.pos[0] + dx * s, me.pos[2] + dz * s, me.pos[1] + 0.6, tick, body.r);
    const ok = (s) => { const [y, deadly] = under(s); return y > me.pos[1] - 2.5 && !deadly; };
    if (ok(0.9) || d < 0.9) return { move: FWD };
    // an edge. Nothing that moves is jumped from or onto: it comes alongside,
    // and is walked. Else somewhere to land inside a jump's reach, taken at
    // speed: short of it, a step back from the brink for the run-up.
    const brink = !ok(0.5);
    if (!under(0)[2]) {
      for (let s = 1.4; s <= reach; s += 0.2) {
        if (ok(s) && ok(s + 0.4) && !under(s)[2]) return fast ? { move: FWD, jump: 1 } : { move: brink ? BACK : FWD };
      }
    }
    return { move: brink ? BACK : 0 };
  },

  state(view) {
    const done = [];
    for (let p = 0; p < L.NPLAYER; p++) if (doneOf(view, p)) done.push(p);
    // (finished: this match's so far, and every match before it was run to its end)
    return { leader: view.mode().leader, stages: stages(view), finished: view.dv.getUint32(L.AO + AC.OY_DONE, true) + view.hole().hole, done };
  },
};
