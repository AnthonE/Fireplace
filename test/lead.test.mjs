// The input lead (client/lead.mjs) on a model link: a client sampling a word
// a tick ahead of the server by its lead and sending the ones not yet closed
// every second tick, a relay closing tick k at (k + 1) x 8 ms with whatever
// word arrived for it and reporting each bundle's worst slack, a millisecond
// at a time. The old controller, nudging 0.04 ticks a bundle either way, runs
// on the same link for comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Lead } from '../client/lead.mjs';
import { SEND_EVERY, TICK_MS } from '../net/wire.mjs';

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
class OldLead {
  constructor(lead) { this.lead = lead; this.slacks = []; }
  update(slack) {
    this.slacks.push(slack);
    if (this.slacks.length > 128) this.slacks.shift();
    const target = pct(this.slacks, 0.5) - pct(this.slacks, 0.05) + SEND_EVERY * TICK_MS + 4;
    this.lead = Math.max(1, Math.min(60, this.lead + Math.max(-0.04, Math.min(0.04, 0.0025 * (target - slack)))));
    return this.lead;
  }
}

// way(now): when a datagram sent at `now` lands, one way. Returns the ticks
// whose words were late, and the lead each ms.
function simulate(ctl, { ms, up, down }) {
  const arrival = new Map(); // tick -> the first of its words to land at the relay
  let nextTick = 0, lastSent = 0, lastBundleT = -1;
  let periodSlack = Infinity, lastSlack = 0;
  const toClient = []; // [at, slack, tick]
  const pending = new Set(); // closed without their word: a late one still counts its slack
  const late = [], leads = [];
  for (let now = 0; now < ms; now++) {
    // the relay: a word for a closed tick, landing late
    for (const k of pending) if (arrival.get(k) <= now) { periodSlack = Math.min(periodSlack, (k + 1) * TICK_MS - arrival.get(k)); pending.delete(k); }
    if (now % TICK_MS === 0 && now > 0) {
      const k = now / TICK_MS - 1;
      const a = arrival.get(k);
      if (a !== undefined && a <= now) { lastSlack = now - a; periodSlack = Math.min(periodSlack, lastSlack); } else { late.push(k); pending.add(k); }
      if (k % SEND_EVERY === SEND_EVERY - 1) {
        toClient.push([down(now), Number.isFinite(periodSlack) ? periodSlack : lastSlack, k]);
        periodSlack = Infinity;
      }
    }
    // the client: bundles that have landed, then its timer every 4 ms
    for (let i = 0; i < toClient.length;) {
      const [at, slack, k] = toClient[i];
      if (at > now) { i++; continue; }
      toClient.splice(i, 1);
      if (k > lastBundleT) { lastBundleT = k; ctl.update(slack, k, now / TICK_MS); }
    }
    if (now % 4 === 0) {
      const predicted = Math.floor(now / TICK_MS + ctl.lead);
      while (nextTick <= predicted) nextTick++;
      if (nextTick - lastSent >= SEND_EVERY) {
        lastSent = nextTick;
        const at = up(now);
        for (let k = Math.max(lastBundleT + 1, nextTick - 64); k < nextTick; k++) if (!(arrival.get(k) <= at)) arrival.set(k, at);
      }
    }
    leads.push(ctl.lead);
  }
  return { late, leads };
}

const rng = (seed) => () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
// a link: one way `base(now)` ms, jitter of ±5 ms, and stalls that hold everything until they end
function link({ base, stalls = [], seed = 1 }) {
  const rand = rng(seed);
  const way = (now) => {
    let at = now + base(now) + (rand() * 2 - 1) * 5;
    for (const [s, len] of stalls) if (now >= s && now < s + len) at = Math.max(at, s + len + base(now));
    return at;
  };
  return { up: way, down: way };
}
const between = (late, a, b) => late.filter((k) => k * TICK_MS >= a && k * TICK_MS < b).length;
const mean = (a, from, to) => a.slice(from, to).reduce((x, y) => x + y, 0) / (to - from);

test('lead: a step in the round trip costs a few late words, not a second of them', () => {
  const l = link({ base: (now) => (now < 10000 ? 25 : 75) });
  const old = simulate(new OldLead(6), { ms: 16000, ...l });
  const lead = new Lead(6);
  const now = simulate(lead, { ms: 16000, ...l });
  const oldLate = between(old.late, 10000, 16000), newLate = between(now.late, 10000, 16000);
  assert.ok(oldLate > 100, `the old way: ${oldLate} words late after the step`);
  assert.ok(newLate * 4 < oldLate, `${newLate} late, against ${oldLate}`);
  // and it settles where the old one would: the lead a 75 ms way wants
  assert.ok(Math.abs(mean(now.leads, 14000, 16000) - mean(old.leads, 14000, 16000)) < 1.5);
});

test('lead: on a steady link it holds where the old one held, and nothing is late', () => {
  const l = link({ base: () => 30, seed: 3 });
  const old = simulate(new OldLead(6), { ms: 20000, ...l });
  const now = simulate(new Lead(6), { ms: 20000, ...l });
  assert.equal(between(now.late, 3000, 20000), 0);
  assert.equal(between(old.late, 3000, 20000), 0);
  assert.ok(Math.abs(mean(now.leads, 5000, 20000) - mean(old.leads, 5000, 20000)) < 0.5, `${mean(now.leads, 5000, 20000)} against ${mean(old.leads, 5000, 20000)}`);
});

test('lead: a stall raises it once, not to the stall\'s size, and gives the raise back', () => {
  const stalls = [5000, 10000, 15000].map((s) => [s, 150]);
  const l = link({ base: () => 30, stalls, seed: 5 });
  const lead = new Lead(6);
  const old = simulate(new OldLead(6), { ms: 20000, ...l });
  const now = simulate(lead, { ms: 20000, ...l });
  // what a stall's words lose, they lose either way: they were sent before anyone could know
  assert.ok(now.late.length <= old.late.length + 5);
  // a raise of at most 6 ticks a stall, and back within the 5 s to the next
  assert.ok(Math.max(...now.leads.slice(5000, 9000)) - now.leads[4999] <= 6.01);
  assert.ok(now.leads[9999] - now.leads[4999] < 0.5, `${now.leads[4999]} before, ${now.leads[9999]} after`);
  assert.ok(lead.givenBack >= 2, `raises given back: ${lead.givenBack} of ${lead.raises}`);
  // what that costs on average: under a tick of lead (the old way's was 7.1 here)
  assert.ok(mean(now.leads, 3000, 20000) - mean(old.leads, 3000, 20000) < 1, `${mean(now.leads, 3000, 20000)} against ${mean(old.leads, 3000, 20000)}`);
});
