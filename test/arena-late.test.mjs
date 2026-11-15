// Words that came too late: the relay closes a tick with the slot's last word
// repeated in place of its own, and marks the change (net/wire.mjs EV_LATE,
// EV_ONTIME). The arena's frame is a bit a tick over 8 ticks, so a repeated
// word carries the bit of the tick before: without the marks a frame could
// decode to a lag, a reload or a pickup nobody sent. With them the frame is
// dropped whole, and its sender sends it again (src/arena-view.mjs FrameLog).
import test from 'node:test';
import assert from 'node:assert/strict';
import { newArena, newFlight } from './helpers.mjs';
import { View, arenaWord, arenaFrame, frameDue, FrameLog } from '../src/arena-view.mjs';
import * as L from '../src/layout.mjs';
import * as W from '../net/wire.mjs';
import { feedTick } from '../net/inbox.mjs';

// A room of one fighter, stepped through the wire's own coding: each tick the
// relay's row and marks (as net/relay.ts closeTick makes them) are encoded,
// decoded and fed as every client and the referee feed them.
async function room({ flight = false, marks = true } = {}) {
  const sim = flight ? await newFlight(true) : await newArena(true);
  sim.init(7);
  const v = new View(sim.memory.buffer);
  const dv = new DataView(sim.memory.buffer);
  sim.feedPlayers([[L.EV_JOIN, 0]]);
  sim.x.step();
  while (v.hole().state !== L.H_PLAY) sim.x.step();
  // Fiesta deals guns at random: a rifle with a reserve, so a reload can start
  if (!flight) {
    dv.setUint8(L.PLAYERS + L.A_GUN, L.W_AR); dv.setUint8(L.PLAYERS + L.A_GUN + 1, L.W_MAGNUM);
    dv.setUint8(L.PLAYERS + L.A_ACT, dv.getUint8(L.PLAYERS + L.A_ACT) & ~L.AB_SLOT);
    dv.setUint16(L.PLAYERS + L.A_RES, 999, true);
  }
  // the words ticks are coded against: none yet, on both sides
  const base = new W.TickBase();
  let prev = new Uint32Array(W.NP), last = 0, repeating = false, late = 0;
  // one tick: the word sent for it, and whether it came in time
  const tick = (word, onTime) => {
    const row = new Uint32Array(W.NP);
    const ev = [];
    if (onTime) { row[0] = last = word; if (repeating) ev.push({ slot: 0, kind: W.EV_ONTIME }); repeating = false; }
    else { row[0] = (last & ~W.JUMP_BIT) >>> 0; late++; if (!repeating) ev.push({ slot: 0, kind: W.EV_LATE }); repeating = true; }
    const parts = W.encodeTick(marks ? ev : [], prev, row);
    prev = row;
    const { events, words } = base.apply(parts);
    feedTick(sim.u8, dv, { ev: events, w: words });
    sim.x.step();
  };
  return { sim, v, dv, tick, late: () => late };
}

const rng = (seed) => () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };

// Windows of 8 ticks, each sending a frame of a random lag (and now and then a
// reload), some of their words late in bursts. After each window the fighter's
// lag must be the one it held or the one just sent, and a reload may start
// only at a window that asked for one.
function soak(g, rand, windows) {
  let wrong = 0, dropped = 0, spurious = 0, reloads = 0;
  while (g.v.tick & 7) g.tick(arenaWord({}), true);
  for (let k = 0; k < windows; k++) {
    // keep a reload possible: a part-spent magazine, nothing under way
    g.dv.setUint8(L.PLAYERS + L.A_MAG, 10);
    g.dv.setUint8(L.PLAYERS + L.A_RELOAD, 0);
    const before = g.v.fighter(0).lag;
    const lag = 1 + Math.floor(rand() * 31), reload = rand() < 0.25;
    const frame = arenaFrame({ lag, reload });
    let burst = 0;
    for (let i = 0; i < 8; i++) {
      if (!burst && rand() < 0.08) burst = 1 + Math.floor(rand() * 10);
      g.tick(arenaWord({ serial: (frame >> i) & 1 }), !(burst && burst--));
    }
    const f = g.v.fighter(0);
    if (f.lag !== before && f.lag !== lag) wrong++;
    if (f.lag === before && before !== lag) dropped++;
    if (f.reload > 0 && !reload) spurious++;
    if (f.reload > 0 && reload) reloads++;
  }
  return { wrong, dropped, spurious, reloads };
}

test('late words: a frame they fall in is dropped whole, never read as one nobody sent', async () => {
  const g = await room();
  const r = soak(g, rng(11), 1500);
  assert.equal(r.wrong, 0, 'a lag nobody sent');
  assert.equal(r.spurious, 0, 'a reload nobody asked for');
  assert.ok(r.dropped > 100, `frames dropped: ${r.dropped}`);
  assert.ok(r.reloads > 200, `reloads asked for and started: ${r.reloads}`);
  assert.ok(g.late() > 1000);
});

test('late words, without the marks: the same lateness makes frames lie (the bug the marks close)', async () => {
  const g = await room({ marks: false });
  const r = soak(g, rng(11), 1500);
  assert.ok(r.wrong > 50, `lags nobody sent: ${r.wrong}`);
  assert.ok(r.spurious > 20, `reloads nobody asked for: ${r.spurious}`);
});

test('late words in Dogfight: its frames are the arena\'s, dropped the same way', async () => {
  const g = await room({ flight: true });
  const r = soak(g, rng(5), 600);
  assert.equal(r.wrong, 0);
  assert.equal(r.spurious, 0);
  assert.ok(r.dropped > 30);
});

test('late words: the sender learns from the relay\'s count, sends the frame again, and its reload happens', async () => {
  const g = await room();
  const log = new FrameLog();
  const keep = {};
  g.dv.setUint8(L.PLAYERS + L.A_MAG, 10);
  while (g.v.tick & 7) g.tick(arenaWord({}), true);
  let frame = 0, ask = true, seenLate = 0;
  // the first window's words 2..4 come late; afterwards everything on time
  for (let t = 0; t < 64; t++) {
    const st = g.v.tick;
    if ((st & 7) === 0) {
      const redo = log.take();
      const reload = ask || !!redo?.reload;
      ask = false;
      frame = frameDue(keep, st, 12, reload || !!redo) ? arenaFrame({ lag: 12, reload }) : 0;
      log.add(st, frame);
    }
    g.tick(arenaWord({ serial: (frame >> (st & 7)) & 1 }), !(t >= 2 && t <= 4));
    // a bundle every second tick tells the sender the relay's count, as its trailer does
    if (t & 1 && g.late() !== seenLate) { seenLate = g.late(); log.lost(st - 1, st); }
    if (t === 7) assert.equal(g.v.fighter(0).reload, 0, 'the first frame, dropped');
  }
  assert.equal(g.v.fighter(0).lag, 12);
  assert.ok(g.v.fighter(0).reload > 0 || g.v.fighter(0).mag[0] > 10, 'the reload asked for again, and started');
});

test('late words: the prediction drops a frame the confirmed world will drop, and takes its own words to arrive', async () => {
  const g = await room();
  while (g.v.tick & 7) g.tick(arenaWord({}), true);
  const frame = arenaFrame({ lag: 9 });
  // the window's first three words late: the confirmed world is mid-window with the frame stale
  for (let i = 0; i < 3; i++) g.tick(arenaWord({ serial: (frame >> i) & 1 }), i > 0 ? false : true);
  assert.ok(g.dv.getUint8(L.PLAYERS + L.A_LAG) & L.AL_STALE);
  assert.ok(g.dv.getUint8(L.PLAYERS + L.A_LAG) & L.AL_LATE);
  const pv = new View(g.sim.memory.buffer, L.PRED_D);
  const run = (words) => {
    const u32 = new Uint32Array(g.sim.memory.buffer);
    words.forEach((w, k) => { u32[(L.PWORDS >> 2) + k] = w; });
    g.sim.x.predict(0, words.length);
  };
  // the rest of this window, then a whole window of its own: the first dropped, the second taken
  const rest = [3, 4, 5, 6, 7].map((i) => arenaWord({ serial: (frame >> i) & 1 }));
  const next = arenaFrame({ lag: 20 });
  run([...rest, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => arenaWord({ serial: (next >> i) & 1 }))]);
  assert.equal(pv.fighter(0).lag, 20, 'the next window, predicted as arriving whole');
  run(rest);
  assert.equal(pv.fighter(0).lag, g.v.fighter(0).lag, 'the stale window: no new lag');
  // and the confirmed world agrees once its words come
  for (let i = 3; i < 8; i++) g.tick(arenaWord({ serial: (frame >> i) & 1 }), true);
  assert.notEqual(g.v.fighter(0).lag, 9);
  assert.equal(g.dv.getUint8(L.PLAYERS + L.A_LAG) & (L.AL_STALE | L.AL_LATE), 0);
});

test('late words: the marks are 2 bits of a tick\'s events, and a sim without the arena ignores them', async () => {
  const prev = new Uint32Array(W.NP), cur = new Uint32Array(W.NP);
  cur[3] = 77;
  const parts = W.encodeTick([{ slot: 3, kind: W.EV_LATE }, { slot: 200, kind: W.EV_ONTIME }, { slot: 5, kind: W.EV_JOIN }], prev, cur);
  const { events, words } = new W.TickBase().apply(parts);
  assert.deepEqual(events, [{ slot: 3, kind: W.EV_LATE }, { slot: 200, kind: W.EV_ONTIME }, { slot: 5, kind: W.EV_JOIN }]);
  assert.deepEqual(words, [[3, 77]]);
});
