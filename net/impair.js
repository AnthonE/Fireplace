// Seeded network impairment on the client side, both directions: delay,
// jitter, loss, and the shapes a home link's trouble takes. The future chaos
// slider; it shapes the bot runs and the gates.
//   const imp = createImpair({ delay: 40, jitter: 10, loss: 0.05, seed: 1 });
//   imp.send(() => writer.write(buf)); imp.recv(() => onBundle(buf));
// delay: the round trip, half each way; jitter: up to half of it either way,
// uniform; loss: the share of datagrams lost each way, each on its own, or
// with burst set, in bursts:
//   burst       ms a burst of loss lasts, on average: each way has its own
//               bursts, starting at random so that `loss` of the time is in
//               one, and everything sent into one is lost (Wi-Fi's fades)
//   stall       ms a stall lasts: nothing gets through either way until it
//               ends, and then everything held goes, in order, on top of
//               the delay (a radio busy scanning, a congested access point)
//   stallEvery  ms between stalls, on average (10 s if only stall is given)
//   stepAt      ms after the start, the round trip becomes stepTo (a route
//               change, a phone moving between networks)
// None of them draws from the generator unless it is set, so a seed's
// datagrams fare as they always have under the old options.
// parseImpair also takes a preset's name: `wifi` (below), with any option
// after it taking its place.
export const PRESETS = {
  // a home Wi-Fi link: 2% of the time faded (40 ms at a time), a 150 ms stall every 10 s
  wifi: { delay: 50, jitter: 10, loss: 0.02, burst: 40, stall: 150, stallEvery: 10000 },
};

export function createImpair(opts = {}) {
  let s = (opts.seed >>> 0) || 1;
  const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const exp = (mean) => -mean * Math.log(1 - rand());
  const cfg = { delay: 0, jitter: 0, loss: 0, burst: 0, stall: 0, stallEvery: 0, stepAt: 0, stepTo: 0, ...opts };
  // the clock and the timer, a test's own if it gives them
  const now = opts.now || (() => performance.now());
  const later = opts.later || ((fn, ms) => setTimeout(fn, ms));
  const t0 = now();
  const stats = { sent: 0, dropped: 0, received: 0, droppedIn: 0, held: 0 };
  // each way's bursts of loss: the one under way or last ended, and when the next starts
  const fades = [{ until: -Infinity, next: null }, { until: -Infinity, next: null }];
  const faded = (t, inbound) => {
    const f = fades[inbound ? 1 : 0];
    const loss = Math.min(0.9, cfg.loss);
    const gap = cfg.burst * (1 - loss) / loss; // mean ms between bursts, for `loss` of the time in one
    if (f.next === null) f.next = t + exp(gap);
    while (t >= f.next) { f.until = f.next + exp(cfg.burst); f.next = f.until + exp(gap); }
    return t < f.until;
  };
  // the stalls, both ways at once: the one under way or last ended, and when the next starts
  const stall = { until: -Infinity, next: null };
  const stalledUntil = (t) => {
    if (stall.next === null) stall.next = t + exp(cfg.stallEvery || 10000);
    while (t >= stall.next) { stall.until = stall.next + cfg.stall; stall.next = stall.until + exp(cfg.stallEvery || 10000); }
    return t < stall.until ? stall.until : t;
  };
  const shape = (fn, inbound) => {
    const t = now();
    const lost = cfg.loss > 0 && (cfg.burst > 0 ? faded(t, inbound) : rand() < cfg.loss);
    if (lost) {
      inbound ? stats.droppedIn++ : stats.dropped++;
      return;
    }
    inbound ? stats.received++ : stats.sent++;
    // half the round-trip delay each way
    const delay = cfg.stepAt > 0 && t - t0 >= cfg.stepAt ? cfg.stepTo : cfg.delay;
    let ms = delay / 2 + (cfg.jitter > 0 ? (rand() * 2 - 1) * cfg.jitter / 2 : 0);
    if (cfg.stall > 0) {
      const free = stalledUntil(t);
      if (free > t) { stats.held++; ms = Math.max(ms, free - t + delay / 2); }
    }
    if (ms <= 0) fn();
    else later(fn, ms);
  };
  return {
    cfg,
    stats,
    set: (o) => Object.assign(cfg, o),
    send: (fn) => shape(fn, false),
    recv: (fn) => shape(fn, true),
  };
}

export function parseImpair(str) {
  const out = {};
  for (const part of (str || '').split(',').filter(Boolean)) {
    if (!part.includes('=')) { Object.assign(out, PRESETS[part] || {}); continue; }
    const [k, v] = part.split('=');
    out[k] = Number(v);
  }
  return out;
}
