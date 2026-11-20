import test from 'node:test';
import assert from 'node:assert/strict';
import { createImpair, parseImpair, PRESETS } from '../net/impair.js';

// A datagram every 16 ms for `ms` of a test clock, one way: which were lost,
// and when each delivered one landed.
function run(opts, ms) {
  let t = 0;
  const out = [];
  const imp = createImpair({ ...opts, now: () => t, later: (fn, d) => fn(t + d) });
  for (; t < ms; t += 16) {
    let at = null;
    imp.send((when = t) => { at = when; });
    out.push({ sent: t, at });
  }
  return { out, stats: imp.stats };
}

test('impair: the old options draw as they always have (loss, then jitter, from the seed)', () => {
  // the generator as it was: xorshift32, a draw for loss, then one for jitter
  let s = 7;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const want = [];
  for (let k = 0; k < 2000; k++) {
    if (rand() < 0.05) { want.push(null); continue; }
    want.push(k * 16 + 30 + (rand() * 2 - 1) * 5);
  }
  const { out } = run({ delay: 60, jitter: 10, loss: 0.05, seed: 7 }, 2000 * 16);
  assert.deepEqual(out.map((o) => o.at), want);
});

test('impair: burst loses `loss` of the datagrams, in runs as long as the bursts', () => {
  const { out, stats } = run({ loss: 0.02, burst: 40, seed: 3 }, 30 * 60 * 1000);
  const lost = out.filter((o) => o.at === null).length;
  assert.ok(Math.abs(lost / out.length - 0.02) < 0.004, `lost ${(100 * lost / out.length).toFixed(2)}%`);
  assert.equal(stats.dropped, lost);
  // runs of consecutive losses: a 40 ms burst takes 2.5 datagrams 16 ms apart on average (less the ones it falls between)
  const runs = [];
  let n = 0;
  for (const o of out) { if (o.at === null) n++; else if (n) { runs.push(n); n = 0; } }
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  assert.ok(mean > 2 && mean < 3.5, `mean run ${mean.toFixed(2)}`);
  // independent loss at the same rate almost never loses three in a row
  const indep = run({ loss: 0.02, seed: 3 }, 30 * 60 * 1000).out;
  let threes = 0;
  for (let k = 2; k < indep.length; k++) if (indep[k].at === null && indep[k - 1].at === null && indep[k - 2].at === null) threes++;
  assert.ok(threes < 3);
  // each way has bursts of its own: one link, a datagram each way every 16 ms
  let t = 0;
  const imp = createImpair({ loss: 0.02, burst: 40, seed: 3, now: () => t, later: (fn) => fn() });
  let up = 0, down = 0, both = 0;
  for (; t < 30 * 60 * 1000; t += 16) {
    let a = false, b = false;
    imp.send(() => { a = true; });
    imp.recv(() => { b = true; });
    up += !a; down += !b; both += !a && !b;
  }
  assert.ok(up > 0 && down > 0 && both < 0.2 * Math.min(up, down), `up ${up}, down ${down}, both ${both}`);
});

test('impair: a stall holds everything sent in it, then lets it go in order', () => {
  const { out, stats } = run({ delay: 40, stall: 200, stallEvery: 5000, seed: 9 }, 60 * 1000);
  assert.ok(stats.held > 0);
  assert.equal(out.filter((o) => o.at === null).length, 0, 'a stall loses nothing');
  const late = out.filter((o) => o.at - o.sent > 20 + 1e-9);
  assert.ok(late.length > 60 && late.length < 300, `${late.length} held`);
  for (const o of late) assert.ok(o.at - o.sent <= 200 + 20 + 1e-9);
  // in order: no datagram lands before one sent ahead of it
  for (let k = 1; k < out.length; k++) assert.ok(out[k].at >= out[k - 1].at);
});

test('impair: stepAt moves the round trip to stepTo', () => {
  const { out } = run({ delay: 40, stepAt: 1000, stepTo: 140, seed: 1 }, 2000);
  assert.ok(out.filter((o) => o.sent < 1000).every((o) => o.at - o.sent === 20));
  assert.ok(out.filter((o) => o.sent >= 1000).every((o) => o.at - o.sent === 70));
});

test('impair: a preset by name, options after it in its place', () => {
  assert.deepEqual(parseImpair('wifi'), PRESETS.wifi);
  assert.deepEqual(parseImpair('wifi,delay=120,loss=0.05'), { ...PRESETS.wifi, delay: 120, loss: 0.05 });
  assert.deepEqual(parseImpair('delay=60,jitter=10'), { delay: 60, jitter: 10 });
  assert.deepEqual(parseImpair(''), {});
});
