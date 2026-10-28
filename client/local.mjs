// The local room, in the net worker's place when the page has no relay to
// join (?local=1, or no relay set: a fresh copy's GitHub Pages site). This
// worker is the room's relay: it closes every tick itself, the page's player
// in slot 0 and AI players in the slots after, and hands each to the sim
// worker coded as the relay codes it (net/wire.mjs encodeTick). Nothing
// crosses the network and nobody else can join.
//   in:  { local: { kind, bots, seed }, memory, prefix, simPort, watch, arena, fireplace } once, then { leave }
//   kind: the AI players' brain, by the page's game (fireplace, arena, flight,
//   bumper, party; golf has none); a spectator (watch) has only them in the room.
// Tick T closes when the room's clock passes T + 1, with the word sampled for
// it LEAD ticks early; the sim steps it DELAY ticks after that, so a timer that
// runs late still finds it there. The prediction covers the gap, as online.
import * as W from '../net/wire.mjs';
import * as L from '../src/layout.mjs';
import { View } from '../src/view.mjs';
import '../src/arena-view.mjs';
import '../src/bumper-view.mjs';
import '../src/party-view.mjs';
import '../src/flight-view.mjs';
import { writeClock } from './clock.mjs';
import { sampler } from './input.mjs';
import { guestLook } from './looks.mjs';

const epoch = () => performance.timeOrigin + performance.now();
const LEAD = 2;
const DELAY = 3;

let stop = () => {};
self.onmessage = (e) => {
  if (e.data.leave) { stop(); return; }
  run(e.data).catch((err) => {
    Atomics.store(new Int32Array(e.data.memory.buffer), L.CL_STATE >> 2, 3);
    self.postMessage({ error: String(err?.stack || err) });
  });
};

// an AI player for the page's game, think(view, t, lag) giving its word for tick t
async function brain(kind, slot, seed) {
  const skill = 0.35 + 0.5 * ((slot * 7) % 10) / 10;
  if (kind === 'fireplace') {
    const [{ Guest }, { GOLFER }] = await Promise.all([import('./fireplace-bot.mjs'), import('./brain.mjs')]);
    return new Guest(slot, seed, skill, GOLFER);
  }
  if (kind === 'arena') return new (await import('./arena-bot.mjs')).Fighter(slot, seed, skill);
  if (kind === 'flight') return new (await import('./flight-bot.mjs')).Pilot(slot, seed, skill);
  if (kind === 'bumper') return new (await import('./bumper-bot.mjs')).Roller(slot, seed, skill);
  if (kind === 'party') return new (await import('./party-bot.mjs')).Partier(slot, seed, skill);
  return null;
}

async function run({ local: { kind = '', bots = 0, seed }, memory, simPort, watch = false, arena = false, fireplace = false }) {
  const i32 = new Int32Array(memory.buffer);
  const u32 = new Uint32Array(memory.buffer);
  const f32 = new Float32Array(memory.buffer);
  const f64 = new Float64Array(memory.buffer);
  const view = new View(memory.buffer);
  seed = seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  const me = watch ? -1 : 0;
  const guests = [];
  for (let k = 0; k < bots && me + 1 + k < L.NPLAYER; k++) {
    const g = await brain(kind, me + 1 + k, seed);
    if (!g) break;
    guests.push(g);
  }

  const t0 = epoch();
  const welcome = { watch, slot: me, seed, roomStart: 0, joinTick: 0, serverTick: 0 };
  Atomics.store(i32, L.CL_ROOM >> 2, 0);
  Atomics.store(i32, L.CL_SLOT >> 2, me);
  Atomics.store(i32, L.CL_NEXT >> 2, 0);
  writeClock(i32, f64, L.CL_PLAY, -DELAY, t0);
  writeClock(i32, f64, L.CL_PRED, LEAD, t0);
  f32[L.CL_LEAD >> 2] = LEAD;
  f32[L.CL_DELAY >> 2] = DELAY;
  u32.fill(0, L.CL_LOOKS >> 2, (L.CL_LOOKS >> 2) + L.NPLAYER);
  for (let k = 0; k < guests.length; k++) u32[(L.CL_LOOKS >> 2) + me + 1 + k] = guestLook(me + 1 + k); // the AI players' looks, drawing only
  simPort.onmessage = () => {}; // its hash reports and resync asks have nobody to go to
  simPort.postMessage({ welcome });
  simPort.postMessage({ key: { tick: 0, reason: W.SYNC.JOIN, region: null } });
  self.postMessage({ welcome });

  const sample = sampler({ memory, roomStart: 0, arena, fireplace });
  const mine = new Map(); // tick -> this page's word, sampled ahead of its close
  let nextTick = 0; // the next tick to sample
  let closed = 0; // the next tick to close
  let prev = new Uint32Array(W.NP);
  const clock = (now) => (now - t0) / W.TICK_MS;
  const timer = setInterval(() => {
    const s = clock(epoch());
    if (me >= 0) {
      while (nextTick <= Math.floor(s + LEAD)) {
        const w = sample(nextTick);
        mine.set(nextTick, w);
        u32[(L.CL_WORDS >> 2) + (nextTick & 255)] = w;
        nextTick++;
      }
      Atomics.store(i32, L.CL_NEXT >> 2, nextTick);
    }
    const ticks = [];
    for (; closed + 1 <= s; closed++) {
      const T = closed;
      const events = [];
      const cur = prev.slice();
      if (me >= 0) {
        if (T === 0) events.push({ slot: me, kind: W.EV_JOIN });
        cur[me] = mine.get(T) ?? prev[me];
        mine.delete(T);
      }
      // the AI players come in one a quarter second, and decide on the world as the sim has it now
      guests.forEach((g, k) => {
        const at = 31 * k;
        if (T === at) events.push({ slot: g.slot, kind: W.EV_JOIN });
        if (T >= at) cur[g.slot] = g.think(view, T, Math.max(0, T - view.tick)) >>> 0;
      });
      ticks.push({ t: T, parts: W.encodeTick(events, prev, cur) });
      prev = cur;
    }
    if (ticks.length) simPort.postMessage({ ticks });
  }, W.TICK_MS / 2);
  stop = () => clearInterval(timer);
}
