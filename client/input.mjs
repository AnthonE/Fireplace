// One input word a tick from the input slots in shared memory, which a page's
// keys and mouse (or its bot) write: golf's layout, or the arena's with its
// presses and its frame. The net worker (client/net.mjs) sends these words to
// the relay; the local room (client/local.mjs) closes its ticks with them.
// sampler() returns sample(t), called once per tick in order.
//   arena: the arena's words always; fireplace: the arena's while it is the
//   game on (FP_GAME in the confirmed world), else golf's
import * as W from '../net/wire.mjs';
import * as L from '../src/layout.mjs';
import { readClock } from './clock.mjs';
import { arenaWord, arenaFrame, frameDue } from '../src/arena-view.mjs';

const epoch = () => performance.timeOrigin + performance.now();

export function sampler({ memory, roomStart, arena = false, fireplace = false }) {
  const i32 = new Int32Array(memory.buffer);
  const f64 = new Float64Array(memory.buffer);
  const rd = (a) => Atomics.load(i32, a >> 2);
  let sentPresses = rd(L.CL_PRESSES);
  Atomics.store(i32, L.CL_SENT >> 2, sentPresses);
  let lastMove = -1;
  // the arena's: presses sampled, a bit flipping per press; the frame, latched every 8 ticks
  const sent = { [L.CL_MELEE]: rd(L.CL_MELEE), [L.CL_GREN]: rd(L.CL_GREN), [L.CL_RELOAD]: rd(L.CL_RELOAD), [L.CL_USE]: rd(L.CL_USE) };
  let frame = 0;
  const lastFrame = {}; // the last frame sent: its lag and tick
  const take = (a) => { if (((rd(a) - sent[a]) | 0) > 0) { sent[a]++; return true; } return false; };
  return (t) => {
    const armed = fireplace ? rd(L.FP_GAME) === L.G_ARENA : arena;
    // an automatic held: a shot asked for every tick, so it fires as fast as it can
    if (armed && rd(L.CL_AUTO) && ((rd(L.CL_PRESSES) - sentPresses) | 0) <= 0) Atomics.store(i32, L.CL_PRESSES >> 2, sentPresses + 1);
    // a press advances the counter one step a tick, so quick clicks never merge
    if (((rd(L.CL_PRESSES) - sentPresses) | 0) > 0) sentPresses++;
    Atomics.store(i32, L.CL_SENT >> 2, sentPresses);
    const mv = rd(L.CL_MOVE);
    // the first tick with new move bits, and when they changed, for the latency figures
    if ((mv & 15) !== lastMove) { lastMove = mv & 15; f64[L.CL_MOVESEEN >> 3] = f64[L.CL_MOVEAT >> 3]; Atomics.store(i32, L.CL_MOVETICK >> 2, t); }
    if (!armed) return W.packInput({ yaw: rd(L.CL_YAW), pitch: rd(L.CL_PITCH), move: mv & 15, jump: (mv >> 4) & 1, shot: sentPresses & 3, weapon: rd(L.CL_WEAPON) });
    take(L.CL_MELEE);
    take(L.CL_GREN);
    Atomics.store(i32, L.CL_MSENT >> 2, sent[L.CL_MELEE]);
    Atomics.store(i32, L.CL_GSENT >> 2, sent[L.CL_GREN]);
    const st = t - roomStart;
    if ((st & 7) === 0) {
      // the view lag: this word's tick less the confirmed tick on screen now
      const lag = Math.round(t - readClock(i32, f64, L.CL_PLAY, epoch()) + 1);
      const reload = take(L.CL_RELOAD), use = take(L.CL_USE);
      frame = frameDue(lastFrame, st, lag, reload || use) ? arenaFrame({ lag, reload, use }) : 0;
      Atomics.store(i32, L.CL_FRAME >> 2, frame);
    }
    return arenaWord({ yaw: rd(L.CL_YAW), pitch: rd(L.CL_PITCH), move: mv & 15, jump: (mv >> 4) & 1, shot: sentPresses & 3,
      melee: sent[L.CL_MELEE] & 1, gren: sent[L.CL_GREN] & 1, slot: rd(L.CL_WEAPON), serial: (frame >> (st & 7)) & 1 });
  };
}
